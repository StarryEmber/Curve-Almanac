# T2.7 报告 — 10 万行性能硬化

- 任务：T2.7（FR-TBL-07、NFR-01；SPEC §16.1）
- 日期：2026-10-23
- 决策：ADR-033（7 项由用户确认 + 中文排序 800ms 单列预算）
- 状态：已完成；按用户要求停在 T2.7，**未执行 M2 验收演示**、未进入 T3.x。

## 1. 目标与交付

1. `scripts/bench.ts` 成为完整基准：打开/保存/编码/解码、1,000 次单元格提交、
   筛选 + 3 级排序、ASCII/中文文本排序、100k GBK CSV 导入、Worker 快照克隆诊断；
2. 共享 100k×10 夹具生成器（固定种子，含中文列），bench 与 E2E 复用、不提交大文件；
3. E2E 端到端预算：冷启动 ≤2.5s、100k 打开 ≤3s、整应用内存 ≤600MB，新增
   `curve:app-ready`/`curve:open` 打点与 `data-query-total-ms` 趋势指标；
4. CI 新增 `bench` 作业：绝对预算硬失败、20% 回归软告警、report artifact + Job Summary；
5. 三处实现级热路径优化 + 主进程打开路径内存减法（见 §4）；
6. 全量回归：`verify`、`test:coverage`、`format:check`、`build`、`e2e`、`bench`。

## 2. 关键文件

```text
scripts/bench.ts                       # 多 suite 基准，每个 suite 独立子进程
scripts/bench-report.ts (+test)        # 报告/基线/20% 回归（11 条单测）
scripts/tsconfig.json                  # scripts 纳入 tsc -b
scripts/gen-100k.ts                    # 共享 100k×10 工作区 + GBK CSV 生成器
bench/README.md                        # 命令、预算、基线引导、统计口径
packages/app-core/src/commands/frozen-rows.ts
packages/app-core/src/commands/table-cell-set.ts (+test)
packages/table-engine/src/query.ts (+test 既有权重)
apps/desktop/src/main/workspace/file-workspace-store.ts
apps/desktop/src/renderer/main.tsx
apps/desktop/src/renderer/app-core/use-workspace-controller.ts
apps/desktop/src/renderer/features/workspace/WorkspaceView.tsx
apps/desktop/src/renderer/features/grid/{use-view-rows.ts,DataGrid.tsx}
apps/desktop/e2e/fixtures.ts           # appLaunch.launchStartedAt
apps/desktop/e2e/perf.spec.ts          # 新增 3 条
.github/workflows/ci.yml               # bench 作业
.gitignore                             # 放行 bench/README.md、bench/baseline.json
package.json                           # bench = node --expose-gc --import tsx；e2e 先生成夹具
vitest.config.ts                       # scripts/**/*.test.ts
tsconfig.json                          # 引用 scripts
docs/adr/033-t27-performance-gates.md
```

## 3. 验证命令与结果（2026-10-23 本机）

```text
pnpm verify          123 files / 978 tests；ESLint 0；depcruise 344 modules / 1317 deps / 0 violations
pnpm test:coverage   statements 74.88% / branches 67.02% / functions 75.91% / lines 74.99%
                     （阈值 70/60 未下调）
pnpm format:check    通过
pnpm build           exit 0；renderer 1,415.85 kB + 懒加载 ImportSession 42.82 kB；
                     table.worker 216.61 kB；query.worker 229.63 kB；import.worker 266.09 kB
pnpm e2e             63 passed（60 + e2e/perf.spec.ts 3 条，2.6min）
pnpm bench           exit 0（全部受门禁用例通过，见下表）
```

E2E 实测（`e2e/perf.spec.ts`，整机空闲）：

| 指标 | 实测 | 预算 |
|---|---:|---:|
| 冷启动（launch → `curve:app-ready`） | **1,063ms** | 2,500ms |
| 100k 打开（`performance.measure('curve:open')`） | **638ms**（点击到首帧 983ms） | 3,000ms |
| 整应用内存 private 峰值（main+renderer+worker，不含 GPU） | **574MB** | 600MB |
| 端到端查询（含首次 Worker 快照克隆，`data-query-total-ms`） | 452ms | 趋势 |

`pnpm bench` 实测（每个 suite 独立进程；P50/P95，ms）：

| 用例 | P50 | P95 | 预算 | 结果 |
|---|---:|---:|---:|---|
| `table.encode.100k` | 194 | 197 | 1,500 | ok |
| `table.decode.100k` | 361 | 406 | 3,000 | ok |
| `table.open.100k`（清单 + 行数重算 + 读盘 + 解码） | 556 | 667 | 3,000 | ok |
| `table.save.100k`（编码 + 备份 + 原子写 + manifest） | 362 | 413 | 500 | ok |
| `edit.commit.100k`（1,000 次提交） | 0 | 0 | 50 | ok |
| `query.100k`（2 条件 + 3 级排序） | 200 | 207 | 400 | ok |
| `query.text-sort.100k`（ASCII，打乱） | 253 | 253 | 400 | ok |
| `query.cjk-sort.100k`（全中文姓名，打乱） | 670 | 698 | 800 | ok（ADR-033 单列） |
| `import.100k`（GBK CSV parse + plan + JSONL） | 618 | 878 | 8,000 | ok |
| `query.sync-clone.100k` | 353 | 363 | — | 诊断 |

内存：bench 进程 peak RSS 906MB / heap 533MB，只是管线趋势（含 15MB JSONL 与多份夹具），
不承担 600MB 门禁；600MB 由 E2E `app.getAppMetrics().privateBytes` 判定。

## 4. 瓶颈与修复

1. **单元格提交（`table.cell.set`）409ms → 1ms**
   - 原因：Immer finalize 在其它 draft 未完成时会遍历被替换的 100k 数组；`findIndex` 还在
     draft 数组上逐元素建代理（~190ms）。
   - 修复：校验改用 `original(draft)` 的 base 状态；用 `[...baseRows]` 替换目标行并
     `Object.freeze` 后赋给 `draft.rows`（Immer 跳过 frozen 值）。撤销 patch 变为整数组替换，
     仍是一条 Immer patch；`EditHistory` 每个 100k 编辑多保留约 800KB（T5.2 统一）。
2. **排序 447ms → 207ms、ASCII 文本 516ms → 253ms**
   - `buildSortPlans` 预计算 `nulls`/`keys`/`baseKeys`/`Float64Array` 数值/`Uint8Array` 布尔，
     比较器不再访问 `row.values` 或调用 `isNullish`/`textOf`/`numericOf`。
3. **筛选**：`QueryContext.compareCache` 每个谓词只解析一次列下标与规范化文本值，不再对
   100k 行重复 `toLocaleLowerCase` 常量值。
4. **中文排序 1,129ms → 698ms**：非 ASCII 改用文档规定的参考语义（原始值 + `numeric:true`
   collator），不再用补零自然键；ASCII 保留自然键快速路径。
5. **主进程打开内存**：`reconcileTableRowCounts` 按 `0x0A` 字节计行、`readTable` 直接读
   UTF-8 字符串，避免为 100k 表额外持有 14.6MB Buffer + 29MB 字符串；E2E 整应用 private
   峰值 644MB → **574MB**（main 225MB → 136MB）。

## 5. CI 门禁

- `bench` 作业（windows-latest，`needs: quality`）：`pnpm bench` 任一受门禁用例超预算 → 作业失败；
  与 `bench/baseline.json` 相比 >20% → `::warning` 注释，不失败。
- `bench/report.json` 每次上传 artifact；`bench/summary.md` 追加到 Job Summary。
- 基线必须由 CI Windows runner 生成（`pnpm bench -- --write-baseline`）后提交；缺失时报告
  `baseline: "missing"` 并打印 `::notice`，不静默通过；损坏的基线直接失败。
- `.gitignore` 改为 `bench/*`，放行 `bench/README.md` 与 `bench/baseline.json`。

## 6. 决策摘要

见 ADR-033：预算硬门禁 + 20% 软回归；bench 采纯管线、E2E 采冷启动/首帧/滚动/内存；
夹具共享生成器、不提交；内存用 E2E `privateBytes` 整应用口径（不含 GPU）；中文排序单列
800ms、克隆只做诊断；优化范围限实现级 + Worker 内部；M2 验收另写单条 E2E spec（本次不执行）。

## 7. 残留风险

- `bench/baseline.json` 尚未提交（需 CI Windows runner 生成），当前回归比较为 `missing`；
  首次提交基线前 20% 告警不会触发。
- 整应用 private 峰值 574MB，距 600MB 只有约 4% 余量；CI runner 更慢/更碎片化时需关注。
- 中文排序 698ms（800ms 预算）；更多组合字符或非 zh/en 文本可能更慢。
- `EditHistory` 的整数组撤销补丁每个 100k 行编辑多约 800KB；T5.2 统一历史时需评估上限。
- bench 的 `memoryPeakMB`（906MB RSS）是 Node 管线趋势，不代表应用内存；不要拿它和
  600MB 应用门禁比较。
- M2 验收演示（新建表 → 粘贴 200 行 → 导入 100k → 筛选/排序 → 列宽/冻结 → 重启还原）
  尚未执行，等用户确认后再写/跑 `m2-acceptance.spec.ts`。

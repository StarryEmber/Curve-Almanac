# bench/ — 10 万行性能基准（T2.7 / T4.2）

`pnpm bench` 运行 SPEC §16.1 的纯管线预算；Electron 端到端预算在
`apps/desktop/e2e/perf.spec.ts`（`pnpm e2e`）里跑。本目录整体被 gitignore，
只有 `README.md` 与 `baseline.json` 会提交。

## 命令

```powershell
pnpm bench                      # 全部 suite：table-io / edit / query / import / chart
pnpm bench -- --table-io        # 打开/保存/编码/解码
pnpm bench -- --edit            # 命令总线 1000 次单元格提交
pnpm bench -- --query           # 筛选+排序、ASCII 文本、中文文本、克隆诊断
pnpm bench -- --import          # 100k GBK CSV 导入管线
pnpm bench -- --chart           # 图表：解析+采样、纯采样、option、样式复用（T4.6）
pnpm bench -- --sample          # --chart 的别名（T4.2 兼容）
pnpm bench -- --write-baseline  # 用本次结果刷新 bench/baseline.json
```

退出码：任一受门禁用例的 P95 超过预算 → `1`；与基线相比回归 >20% 只打印
`::warning`（GitHub Actions 注释），不失败。

## 产物

| 文件 | 用途 |
|---|---|
| `bench/report.json` | TESTPLAN §5.2 报告；CI 上传为 artifact |
| `bench/summary.md` | Markdown 摘要；CI 追加到 Job Summary |
| `bench/baseline.json` | 回归基线（提交仓库）；由 `--write-baseline` 生成 |
| `bench/.fixtures/100k-workspace/` | `scripts/gen-100k.ts` 生成的 100k×10 工作区（不入库） |
| `bench/.tmp/` | 保存用例的临时工作区（每次运行清理） |

## 预算（SPEC §16.1）

| 用例 | 预算 | 归属 |
|---|---:|---|
| `table.open.100k`（清单 + 行数重算 + 读取 + 解码） | 3,000ms | 硬 |
| `table.encode.100k` | 1,500ms | 硬 |
| `table.decode.100k` | 3,000ms | 硬 |
| `table.save.100k`（编码 + 备份 + 原子写 + manifest） | 500ms | 硬 |
| `edit.commit.100k`（1,000 次提交的 P95） | 50ms | 硬 |
| `query.100k`（两个条件 + 3 级排序） | 400ms | 硬 |
| `query.text-sort.100k`（ASCII，打乱） | 400ms | 硬 |
| `query.cjk-sort.100k`（全中文姓名，打乱） | 800ms | 硬（ADR-033 单列） |
| `import.100k`（GBK CSV parse + plan + JSONL） | 8,000ms | 硬 |
| `chart.resolve-sample.100k`（100k×10、2 个 Y 系列的解析 + LTTB，T4.2） | 300ms | 硬（SPEC §16.1） |
| `chart.sample.100k`（单系列 100k→2,000 的纯 LTTB，T4.2） | 50ms | 硬（TASKS T4.2） |
| `chart.option.2k`（采样后 2k 点模型的 ECharts option，T4.6） | 50ms | 硬（T4.6） |
| `chart.restyle.100k`（复用已解析数据只改样式，T4.6） | 20ms | 硬（T4.6，证明缓存命中不重解析） |
| `query.sync-clone.100k` | — | 诊断，不计门禁 |
| `chart.resolve-unsampled.100k`（关闭采样的解析） | — | 诊断，不计门禁 |

内存：bench 每 50ms 采样进程 RSS/heap 峰值，只作趋势；600MB 门禁由
`e2e/perf.spec.ts` 用 `app.getAppMetrics()` 的 `privateBytes` 汇总 main + renderer +
utility/worker（不含 GPU）来判定（`workingSetSize` 会重复计算共享页，只作诊断）。

## 基线

基线必须由 **CI 的 windows-latest runner** 生成（共享 runner 与本机速度不同）：

1. 在 CI 上跑一次 `pnpm bench -- --write-baseline`（或本地临时验证机制）；
2. 下载 `bench/baseline.json` 并提交；
3. 之后每次 `pnpm bench` 会报告每个用例的 `regression=` 百分比。

缺少 `baseline.json` 时报告 `baseline: "missing"` 并打印 `::notice`，不阻塞 CI。
损坏的基线会让 `pnpm bench` 直接失败（不静默降级）。

## 夹具

`scripts/gen-100k.ts` 用固定种子 42 生成 100k×10：1 个 text 主键、1 个 date、
5 个 number、1 个 boolean、1 个中文站点列、1 个中文姓名列。`pnpm e2e` 会先执行
`tsx scripts/gen-100k.ts --workspace bench/.fixtures/100k-workspace`，`perf.spec.ts`
再把它复制到测试输出目录。

## 统计口径

- 除 `edit.commit.100k` 外，每个用例 1 次预热 + 3 次测量，P95 取 3 个样本中的最大值
  （最近秩）。
- `edit.commit.100k` 测 1,000 次逐次提交的 P95（SPEC §16.1 / TESTPLAN §5.1）。
- `query.sync-clone.100k` 用 `structuredClone` 模拟 query Worker 首次快照的
  postMessage 成本，只是诊断：`data-query-ms` 仍只含 filter+sort，端到端趋势看
  E2E 的 `data-query-total-ms`。
- `chart.resolve-sample.100k` 每次测量都跑完整 `resolveSeries`（筛选/排序/映射 + 逐系列
  LTTB）；纯采样成本看 `chart.sample.100k`，`chart.resolve-unsampled.100k` 只是解析基线。
  采样语义与口径见 `docs/adr/041-t42-lttb-sampling.md`。
- `chart.option.2k` 只调用 `toEChartsOption`（option 唯一构造点），不含 ECharts `setOption`；
  `chart.restyle.100k` 复用一次解析好的数据只调 `renderChartModel`，是渲染层缓存的命中路径。
  “图表更新 2k 点 ≤200ms”由 `e2e/chart-perf.spec.ts` 的 `data-chart-update-ms` 判定（真实
  canvas + `setOption`）。决策见 `docs/adr/045-t46-chart-performance.md`。
- 每个 suite 在独立子进程里跑（T2.7），`chart` suite 也遵守这一约束，避免前序堆状态
  影响采样/解析的 P95。

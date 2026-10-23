# ADR-033 T2.7 的性能门禁、基准口径与三处热路径优化

- 状态：已接受
- 日期：2026-10-23
- 相关：SPEC §9.3、§9.5、§13.1、§16.1；TESTPLAN §5；T2.7；ADR-006、ADR-011、ADR-014、ADR-025、ADR-032

## 背景

T2.7（10 万行性能硬化）要把 SPEC §16.1 的预算变成可复现的门禁，并修复实测瓶颈。
开工前按 AGENTS §11 逐项询问用户，用户确认了 7 项（门禁形态、bench 指标、夹具、内存口径、
中文排序/克隆、优化范围、M2 验收口径）；实测中文排序超过 400ms 后又单独确认了 800ms 单列预算。
本 ADR 记录这些决定、实现边界与实测数据。

## 决定

### 1. CI 门禁：预算硬失败 + 20% 回归软告警

- CI 新增独立 `bench` 作业（windows-latest，`needs: quality`），运行 `pnpm bench`。
- 任一受门禁用例 P95 超过 SPEC 预算 → `pnpm bench` 退出 1 → 作业失败。
- 与仓库内 `bench/baseline.json` 相比回归 >20% → 只打印 `::warning title=Bench regression::`
  注释，不失败：共享 runner 的绝对速度波动很大，硬回归门禁会误报。
- `bench/report.json` 每次运行都作为 artifact 上传；`bench/summary.md` 追加到 Job Summary。
- `bench/baseline.json` 必须由 CI 的 Windows runner 生成（`pnpm bench -- --write-baseline`），
  再提交仓库；缺失时打印 `::notice`、比较跳过，**不静默当作通过**（报告里 `baseline: "missing"`）。
  损坏的基线让 `pnpm bench` 直接失败。
- `.gitignore` 从忽略 `bench/` 目录改为 `bench/*` + 两个例外（`README.md`、`baseline.json`），
  否则目录级忽略无法再放行基线文件。

### 2. 指标分层：bench 纯管线，E2E 真实端到端

| 指标 | 采集位置 | 理由 |
|---|---|---|
| 打开（清单 + 行数重算 + 读盘 + 解码） | `pnpm bench` 的 `table.open.100k` | 主进程/Worker 序列化可在 Node 里等价复现 |
| 保存（编码 + 备份 + 原子写 + manifest） | `table.save.100k` | 同上，镜像 `FileWorkspaceStore` 的写序 |
| 单元格提交 | `edit.commit.100k`（1,000 次 P95） | TESTPLAN §5.1 的“基准循环” |
| 筛选/排序、导入 | `query.*` / `import.100k` | 纯管线 |
| 冷启动、100k 首帧、滚动 fps、整应用内存 | `e2e/perf.spec.ts` + 既有 `grid.spec.ts` | 只有 Electron 能测 |

- `scripts/` 之前不在任何 tsconfig project 内，bench 实际不过类型检查。新增
  `scripts/tsconfig.json`（composite，引用 domain/table-engine/persistence/app-core）并加入根
  `tsconfig.json` 的 references；`vitest.config.ts` 增加 `scripts/**/*.test.ts`（覆盖率 include
  不变，scripts 不计入全局覆盖率）。
- bench 进程用 `node --expose-gc --import tsx` 启动，在 suite 之间显式 GC；这不是生产行为，
  只是让多个 suite 共用一个进程时数字稳定。

### 3. 夹具：共享生成器，临时目录，不提交

- `scripts/gen-100k.ts` 增加 100k×10 工作区生成器（固定种子 42）：1 text 主键、1 date、
  5 number、1 boolean、1 中文站点列、1 中文姓名列。`BENCH_*` 常量、`benchColumns`、
  `benchTableMeta`、`buildBenchRows`、`writeBenchWorkspace`/`ensureBenchWorkspace` 全部导出。
- bench 在 `bench/.fixtures/100k-workspace` 复用（只读打开）；保存用例写
  `bench/.tmp/save-workspace` 的副本，避免污染共享夹具。
- `pnpm e2e` 先执行 `tsx scripts/gen-100k.ts --workspace bench/.fixtures/100k-workspace`；
  `perf.spec.ts` 每次把夹具复制到 `testInfo.outputPath`（打开会重写 manifest/.lock）。
- 大文件仍不提交，符合 TESTPLAN §4。模块被 bench import 时不再执行 CLI（用
  `isDirectInvocation` 守卫，修复了首次接入时 bench 意外生成 GBK CSV 的副作用）。

### 4. 内存：E2E 整应用门禁，bench 只记趋势

- 600MB 门禁由 `e2e/perf.spec.ts` 判定：`app.getAppMetrics()` 汇总 main + renderer +
  utility（Worker）进程的 `memory.privateBytes`（KB），**排除 GPU**（驱动相关、不是表数据）。
  用 `privateBytes` 而不是 `workingSetSize`：后者会把共享的 Chromium/Electron 页在每个进程里
  重复计算（实测空闲主进程 working set 139MB、private 99MB；100k 查询后 708MB vs 570MB）。
  `workingSetSize` 仍作为诊断写进 attachment 与报告。
- 采样点：100k 打开 + Worker 排序后连续采样 5 次（间隔 100ms）取峰值；空闲基线在冷启动测试里
  记录（本机 private 152MB：main 99 / renderer 41 / worker 12）。
- `pnpm bench` 的 `MemorySampler` 每 50ms 采样 `process.memoryUsage()` 的 RSS/heapUsed，
  `report.json` 里 `memory.gate: "trend"`；它不含 renderer/Worker，因此不承担 600MB 门禁。
- 报告保留 TESTPLAN §5.2 的 `memoryPeakMB` 字段（等于 peak RSS）以免破坏既有消费者。

### 5. 中文排序单列 800ms；克隆只做诊断

- 实测（本机）：100k 全中文姓名排序 P95 **644ms**（优化后），ASCII 文本排序 **338ms**，
  筛选 + 3 级排序 **238ms**。400ms 对全中文不可达：每排序约 1.66M 次比较，ICU collator
  每次约 390ns；再压只能改排序语义（预计算拼音键、前缀排名等）或引入依赖。
- 用户确认：ASCII/数字仍是 400ms，**全中文文本 100k 单列 800ms**；SPEC §16.1 增加该行。
- query Worker 首次快照克隆（100k×10 `structuredClone`）实测 P95 **~300ms**，作为
  `query.sync-clone.100k` **诊断**记录，不并入 `data-query-ms`；E2E 新增
  `data-query-total-ms`（从 effect 开始到结果应用的端到端时间）作为趋势指标。
- 优化范围：不引入前缀排名/拼音表等会改变比较语义的实现；ADR-032 的自然键快速路径保留给
  ASCII，非 ASCII 改用文档规定的参考语义（原始值 + `numeric: true` collator）。

### 6. 优化范围：实现级 + Worker 内部

- 允许：memo/索引、渲染与数组复制、Worker 快照/增量同步、排序键缓存、性能打点。
- 不允许（未确认前）：改 `formatVersion`、JSONL、IPC 通道、公共 API 语义、命令总线契约、
  新增运行时依赖；需要改协议字段或命令阶段异步化时先写 ADR 并停下确认。
- 据此只做了三处实现级优化（见下），没有改数据模型。

### 7. M2 验收演示口径（本次不执行）

新增单条端到端 E2E `m2-acceptance.spec.ts`：新建表 → 粘贴 200 行 → 导入 100k GBK CSV
（含坏行）→ 筛选/排序 → 列宽/冻结 → 退出并重启 Electron → 断言界面与磁盘还原 + 预算，
attach 截图/计时，报告 `docs/reports/m2/REPORT.md`。T2.7 只记录口径，**不执行**演示。

## 实现与实测

### 7.1 `table.cell.set`：冻结新行数组 + 基于原始状态校验

Immer 在 finalize 时只要同一次 produce 里还有未完成的 draft，就会**遍历**被替换的大数组；
100k 行的单元格提交实测 **约 250ms/次**（1000 次循环 P95 409ms），其中约 190ms 还是
`findIndex` 在 draft 数组上逐元素建代理。修复：

- 校验用 `original(draft)`（未修改的 base state），`findIndex` 回到普通数组；
- 用 `[...baseRows]` 建新数组、替换目标行，再 `Object.freeze` 后赋给 `draft.rows`；
  Immer 的 `finalizeProperty` 对 frozen 值直接返回，不再遍历 100k 元素。

结果：`edit.commit.100k` P95 **409ms → 1ms**。代价：撤销 patch 从“替换一行”变成
“替换整个 `rows` 数组”（仍是一条 Immer patch，语义不变），`EditHistory` 每个 100k 行编辑
多保留约 800KB 的旧数组引用；历史预算仍由 T5.2 统一。其它行命令（paste/import/rows.insert）
未改：它们本来就替换或 splice 副本，预算已达标。

### 7.2 排序：预计算计划 + 有序键

`buildSortPlans` 现在为每级排序预计算：

- 所有列：`nulls: Uint8Array`（空值最后，两个方向都是）；
- text/enum：`keys`（自然键或原始/标签字符串）、`baseKeys`（小写快速路径）；
- number/date：`numbers: Float64Array` + `neutrals`（无法读数的非空单元格保持并列）；
- boolean：`booleans: Uint8Array`。

比较器不再每行访问 `row.values`、不再调用 `isNullish`/`textOf`/`numericOf`。实测
`query.100k` 447ms → **238ms**，`query.text-sort.100k` 516ms → **338ms**。

### 7.3 筛选：每个谓词只准备一次

`QueryContext` 增加 `compareCache: WeakMap<object, PreparedCompare>`：列下标、列定义和
文本比较值（`toLocaleLowerCase`）每个谓词只算一次；此前每个文本谓词对 100k 行都会重复
规范化常量比较值。语义不变（仍是 `Intl.Collator` / 大小写不敏感 / 空值规则）。

### 7.4 非 ASCII 排序改为参考 collator

ADR-032 的语义基准是 `Intl.Collator(locale, {numeric:true, sensitivity:'variant'})` 作用于
原始文本；实现此前对非 ASCII 也用“数字段补零的自然键 + numeric:false”。T2.7 改为非 ASCII
直接用参考 collator 比较原始值（ASCII 仍走补零自然键快速路径）。CJK 排序从 1.1s 降到 644ms，
且实现与文档语义完全一致；长数字段/带符号数字不再需要单独回退分支。

### 7.5 主进程打开路径：少一次整表解码

`FileWorkspaceStore` 在 100k 打开时有两处整表字符串分配：`reconcileTableRowCounts` 为了数行
把文件读成 29MB 的 UTF-8 字符串；`readTable` 同时持有 Buffer（14.6MB）与 `.toString()`
字符串（29MB）。T2.7 改为：

- `reconcileTableRowCounts` 读 Buffer，按 `0x0A` 字节计非空行（UTF-8 换行字节不会出现在
  多字节序列内部，结果与 `countJsonlRows` 完全一致），尾部换行检查也走字节；
- `readTable` 直接 `readFile(path, 'utf8')`，`bytes` 用 `Buffer.byteLength` 计算。

E2E 整应用 private 峰值从 **644MB 降到 570MB**（main 进程 225MB → 135MB），600MB 门禁通过；
`workingSetSize` 口径从 780MB 降到 711MB（只作诊断）。

### 7.6 实测汇总（本机，2026-10-23）

| 用例 | 优化前 | T2.7 | 预算 |
|---|---:|---:|---:|
| `table.open.100k` | — | 358ms | 3000ms |
| `table.save.100k` | — | 349ms | 500ms |
| `edit.commit.100k` | 409ms | 1ms | 50ms |
| `query.100k` | 447ms | 238ms | 400ms |
| `query.text-sort.100k` | 516ms | 338ms | 400ms |
| `query.cjk-sort.100k` | 1129ms | 644ms | 800ms |
| `import.100k` | 1019ms | 781ms | 8000ms |
| 冷启动（E2E） | — | 997ms | 2500ms |
| 100k 打开（E2E `curve:open`） | — | 665ms | 3000ms |
| 整应用内存 private（E2E） | 644MB | 570MB | 600MB |

## 代价

- 中文排序仍需 800ms 预算；极端数据（大量组合字符、非 zh/en 文本）可能更慢。
- `EditHistory` 的 100k 行撤销补丁内存增加约 800KB/条；T5.2 需要在统一历史时评估上限。
- bench 每个 suite 共用进程，绝对数字受前序 suite 的堆状态影响；关键预算仍留足余量
  （打开 358ms/3s、保存 349ms/500ms、筛选 238ms/400ms），CI 波动由硬预算+软回归分层处理。
- 基线需要人工从 CI 生成并提交；在提交前回归比较处于 `missing` 状态。
- 冻结行数组意味着**任何命令都不能原地修改 `rows`**；违反时会在严格模式下抛错（而不是
  静默破坏撤销），这是有意的护栏。

## 影响

- `@curve/app-core`：`commands/frozen-rows.ts`（新）、`commands/table-cell-set.ts`。
- `@curve/table-engine`：`query.ts`（排序计划、筛选缓存、非 ASCII collator）。
- `apps/desktop`：`main.tsx`（`curve:app-ready`）、`use-workspace-controller.ts`
  （`curve:open-start`）、`WorkspaceView.tsx`（`curve:open` measure）、`use-view-rows.ts`
  （`totalMs`）、`DataGrid.tsx`（`data-query-total-ms`）、`e2e/fixtures.ts`
  （`appLaunch.launchStartedAt`）、`e2e/perf.spec.ts`（新）、
  `main/workspace/file-workspace-store.ts`（行数按字节计、`readTable` 直接读字符串）。
- `scripts/`：`bench.ts`、`bench-report.ts`（新）、`gen-100k.ts`、`tsconfig.json`（新）。
- CI：新增 `bench` 作业；`.gitignore` 放行 `bench/README.md` 与 `bench/baseline.json`。
- 不改变 `formatVersion`、JSONL、manifest、IPC 通道或 preload；不新增运行时依赖；
  仅新增根 devDependencies 中的 workspace 包（`@curve/app-core`、`@curve/persistence`），
  供 bench 使用。

## 复核条件

- CI Windows runner 与开发机的速度差导致绝对预算偶发失败时，先看是否环境噪声；不得直接
  放宽预算或删断言（SPEC §16.1 要求先优化/记录）。
- 若后续要求 100k 全中文 <400ms，需要新 ADR 评估预计算拼音键/前缀排名或引入依赖，并重跑
  参考 collator 的属性测试。
- T5.2 统一历史时复核 whole-array patch 的内存与合并语义。
- 若命令阶段改为异步/Worker，需要重新评估 `edit.commit.100k` 的测量口径。

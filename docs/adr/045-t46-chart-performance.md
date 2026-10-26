# ADR-045 T4.6 的图表解析拆分、数据缓存、延迟解析与性能门禁

- 状态：已接受
- 日期：2026-10-26
- 相关：SPEC §11.2、§11.3、§11.5、§16.1；TASKS T4.6；ADR-011、ADR-032、ADR-040、ADR-041、
  ADR-042、ADR-043、ADR-044

## 背景

T4.4/T4.5 交付后，图表的每次变化都走完整的 `resolveSeries`（筛选 → 排序 → 映射 → LTTB 采样）
再构造 option：100k×10 宽表 2 个 Y 系列实测解析+采样 **66ms**（`chart.resolve-sample.100k`），
渲染 2k 点没有自动化门禁。具体问题：

1. **样式提交也会重解析**：调色板/线宽/平滑/图例/网格/精度/Y 轴名/图表类型/背景这些只影响
   绘制的项，同样触发 100k 行的筛选、排序与 LTTB。检查器每次交互阻塞主线程 ~66ms；新建向导里
   改标题（`title` 在 `useMemo` 依赖里）也会重解析整表。
2. **大表切换映射/图表没有 loading**：解析是同步的，切换映射或切换标签页时输入被阻塞，界面
   没有任何提示。
3. **拖动缩放时逐事件更新**：ECharts 的 `datazoom` 在拖动中高频触发，每次事件都发布交互状态并
   让 React 重渲染工具栏。
4. **预算缺口**：SPEC §16.1 的“图表渲染 2k 点 ≤ 200ms”没有自动化判定；T4.2 的 bench 只有
   解析/采样两段，没有 option 段；“10 次切换后实例数稳定”只在适配器单测里有 `activeChartInstanceCount()`，
   没有应用级证据。

SPEC 没有规定以下实现细节，必须在写代码前裁决，否则 UI、chart-model 与 bench 会各自发明一套：

1. 解析与样式是否拆开；数据缓存放哪一层、键是什么、容量多大。
2. 大表解析是否进 Worker；loading 如何表达；阈值多少。
3. 交互状态发布是否合并；渲染/解析耗时如何暴露给 E2E（不新增持久化字段）。
4. bench suite 的命名、新增用例与预算；为了在 bench 里测量 option 是否需要 workspace devDependency。

## 决定

### 1. `chart-model` 拆分“解析数据”与“应用样式”，`resolveSeries` 行为不变

```ts
/** 与样式无关的解析结果：没有颜色、没有 ChartSpec 的样式字段。 */
interface ResolvedSeries {
  id: string;
  name: string;
  values: (number | null)[];
}

interface ResolvedChartData {
  x: RenderXAxis;          // 含 label/unit/type/values
  series: ResolvedSeries[];
  meta: RenderMeta;        // sampled/sourcePoints/renderedPoints/warnings
}

type ChartDataResult =
  | { ok: true; data: ResolvedChartData }
  | { ok: false; issues: ChartIssue[] };

resolveChartData(table, rows, spec, options?): ChartDataResult;
renderChartModel(data, spec, options?): RenderModel;
```

- 数据段只含“行集 → x/系列值”的结果：`filter`、`sort`、`mapping`、`sampling`、`locale`、
  `xLabel`（进 `x.label`）。样式段负责：`kind`、`paletteId` → `series[].color` 与 `style.palette`、
  `background`（含 theme/显式背景）、线宽/平滑/点/图例/网格/精度/从零、`yLabel`、
  `style.connectNulls`（`sampled || layout==='long'`）。
- `resolveSeries(...)` 变成 `renderChartModel(resolveChartData(...))` 的组合，**签名与输出不变**：
  现有快照、bench、检查器、向导都不用改；采样/meta/warning/断点语义完全沿用 ADR-040/041/043。
- `renderChartModel` 复用 `ResolvedChartData.series[].values` 数组（不复制），只重建带颜色的
  系列对象与 `style`；调用方不得修改返回的数组。

### 2. 数据缓存归渲染层：行引用 + 数据键双重命中

- 新增 `apps/desktop/src/renderer/features/charts/chart-data-cache.ts`：
  `createChartDataCache(capacity = 2)` 返回 `{ size, get, set, clear }` 的 LRU；条目同时保存
  数据键与 `rows` **引用**，命中要求两者都相同（Immer 每次变更都会产生新的 `rows` 引用，
  因此不会读到旧行集）。
- 数据键（`chartDataKey`）包含：`table.id`、列签名（`id/label/type/role/unit/precision/enumOptions`）、
  `rows.length`、`mapping`、`filter`、`sort`、`sampling`、`locale`、`xLabel`。样式字段
  （`paletteId`/`background`/`smooth`/`showSymbol`/`lineWidth`/`legend`/`showGrid`/
  `numberDigits`/`yStartAtZero`/`yLabel`/`kind`）**不在键里**。
- 缓存**不放进** `@curve/chart-model`：ADR-040 规定该包是纯函数、无状态。缓存寿命跟随图表视图/
  新建向导组件，容量 2，组件卸载即释放（不引入模块级全局缓存）。
- 结果：样式提交只跑 `renderChartModel`（O(系列)），不重新筛选/排序/采样；同一图表在
  `ChartView` 与向导预览中也不会互相重复解析。

### 3. 大表延迟解析（阈值 20k 行）+ loading，不进 Worker

- 新增 `CHART_DEFER_RESOLVE_ROW_THRESHOLD = 20_000`（与 `QUERY_WORKER_ROW_THRESHOLD` 同一个
  “主线程可承受”的分界，ADR-032）。
- 新增 `useChartRenderStatus(input)`：行数 > 阈值且缓存未命中时，先提交
  `data-chart-pending="true"` 与可见 loading（`role="status"`），在 `setTimeout(0)` 中解析；
  解析落地后一次性替换状态并置 `pending=false`。首次挂载（切换图表/标签页）同样走延迟路径。
  小表、缓存命中、`chart`/`table` 缺失时同步解析，不闪 loading。
- 语义：**先把 loading 画出来、让浏览器处理完输入事件，再占用主线程**；单次解析任务本身不可
  中断（100k 实测 66ms，远小于 200ms 渲染预算）。
- 不引入图表 Worker：100k 行结构化克隆 + Worker 内第二份行副本的成本与解析本身同量级，
  收益不稳定；ADR-011 已把“整表进 renderer”作为 v1 前提。解析耗时若继续增长再评估（复核条件）。

### 4. 诊断契约：只读 DOM 属性，不是持久化字段

- `chart-view`：`data-chart-pending="true|false"`、`data-chart-resolve-ms`（最近一次解析的
  整毫秒数；缓存命中 ≈ 0）。
- `chart-canvas`：`data-chart-update-ms`（最近一次 `renderer.render/update` 的同步耗时，含
  option 构造与 `setOption`）、`data-chart-update-count`（单调递增，供 E2E 等待一次真实更新）、
  `data-chart-instances`（`activeChartInstanceCount()`，泄漏断言）。
- 只用于 E2E/预算与排障：不写 manifest、不进撤销、不本地化；与 T2.6 的
  `data-query-mode/busy/ms` 同类（SPEC §11.5 记录）。

### 5. 交互状态发布按帧合并

- ECharts `datazoom` / `legendselectchanged` 事件触发的状态发布合并到
  `requestAnimationFrame`：每帧最多一次 React 更新，且总是发布**最新**状态。
- 工具栏动作（`dispatchInteraction` → `refreshInteraction`）与 `update()` 后的刷新仍**立即**
  发布，保证点击后 `data-chart-zoom-start/end` 及时更新；无 rAF（测试环境）时退回同步发布。
- 交互状态语义不变（ADR-044）：瞬态、不写 `ChartSpec`/manifest、不进撤销；
  `getInteractionState()` 仍是唯一真源。

### 6. 基准与门禁

- `sample` suite 更名 **`chart`**：`pnpm bench -- --chart`；`--sample` 保留为别名（T4.2 的
  验证命令继续可用）。suite 内用例：
  - `chart.resolve-sample.100k` ≤ 300ms（SPEC §16.1，沿用）；
  - `chart.sample.100k` ≤ 50ms（T4.2，沿用）；
  - `chart.option.2k` ≤ 50ms（新增）：对采样后的 2k 点模型调用 `toEChartsOption`；
  - `chart.restyle.100k` ≤ 20ms（新增）：复用已解析数据只改样式，证明“样式提交不重解析”；
  - 诊断 `chart.resolve-unsampled.100k`（不计门禁，沿用）。
- “图表更新 2k 点 ≤ 200ms”由 E2E `apps/desktop/e2e/chart-perf.spec.ts` 用
  `data-chart-update-ms` 判定（SPEC §16.1 明确该预算的测量方式是“手工/Playwright”），并同时
  断言 `data-chart-resolve-ms ≤ 300`、10 次切换后 `data-chart-instances === 1`、整应用
  private 内存 ≤ 600MB、缩放连点期间无 > 200ms 的长任务（浏览器支持 longtask 时）。
- 根 `devDependencies` 增加 workspace 包 `@curve/chart-echarts`（仅 bench 读取
  `toEChartsOption`，**不是**运行时依赖）；`scripts/tsconfig.json` 增加 project reference 与
  `DOM` lib（引用包的声明里有 `HTMLElement` 类型）。不新增第三方依赖。
- 回归报警沿用 `bench/baseline.json` 的“P95 > 基线 20% → `::warning`”（ADR-033）；新用例自动
  纳入比较，基线仍只由 CI Windows runner 生成后提交。

### 7. 不改变的东西

- `RenderModel` 形状、采样/断点/映射规则、三种空态、PNG/交互瞬态语义、命令总线、
  `formatVersion`/manifest/JSONL/IPC/preload/CSP、依赖方向。
- 不新增运行时依赖，不改 ECharts 版本/按需注册子集，不在适配器里再采样。
- 图表仍读取整表行（ADR-043 §3）；`resolveSeries` 的输出语义不变。

## 代价

- **缓存占用**：容量 2 的数据快照在关闭采样时是 100k×系列（约 1.6MB/系列 + x），最坏数 MB；
  寿命跟随组件，切走/关闭标签即释放。容量降到 1 会牺牲“视图 + 向导”同时命中的收益。
- **解析仍不可中断**：延迟解析只保证“先绘制 loading、先处理输入”，单次 66ms 任务期间主线程
  仍会停顿；要真正可取消/不占用必须进 Worker（复核条件）。
- **首次打开多一帧**：大表图表先显示 loading 再出图，E2E/截图需要在 ready 之后取。
- **诊断属性扩容**：`data-chart-*` 又多 5 个属性，是 E2E/排障契约而非文档字段；改名会影响测试。
- **suite 更名**：`sample` 从报告里消失，`--sample` 仍是别名；`bench/baseline.json` 尚未生成，
  没有基线兼容成本。
- **bench 加载 ECharts**：`chart` suite 子进程会 import `@curve/chart-echarts`（含 ECharts），
  启动多约 2–4s、`memoryPeakMB` 趋势上升；该数字本来就不是门禁。
- **rAF 合并**：极端情况下 DOM 工具栏比 canvas 慢一帧；下一次交互以 `getInteractionState()`
  为准（ADR-044 已接受同类滞后）。

## 影响

- 代码：
  - `packages/chart-model/src/render-model.ts`（拆分 + 组合）、`index.ts`（导出）与测试；
  - `apps/desktop/src/renderer/features/charts/`：`chart-data-cache.ts`（新）、
    `use-chart-render-status.ts`（新）、`chart-view-model.ts`（缓存接线）、`ChartView.tsx`
    （loading/诊断/属性 memo）、`ChartCanvas.tsx`（诊断 + rAF 合并）、`NewChartDialog.tsx`
    （复用缓存）；
  - `apps/desktop/src/renderer/i18n/messages/{zh-CN,en-US}.ts`（loading 文案）、`styles.css`；
  - `scripts/bench.ts`、`scripts/tsconfig.json`、`bench/README.md`、根 `package.json`、
    `pnpm-lock.yaml`；
  - `apps/desktop/e2e/chart-perf.spec.ts`（新）；
  - `apps/desktop/src/main/workspace/file-workspace-store.ts`（附带修复：备份目录缺失时
    `copyToBackup` 先 `mkdir(recursive)`，否则复制/恢复的工作区所有保存都失败）与回归测试。
- 文档：SPEC §11.3/§11.5/§16.1；TASKS T4.6；TESTPLAN E6；ADR 索引；CHANGELOG、HANDOFF、
  AGENTS §0、`docs/reports/t4.6/REPORT.md`。
- 快照：无。`resolveSeries` 与 option 输出不变；不更新 `chart-model`/`chart-echarts` 的黄金快照。

## 复核条件

- 若 `chart.resolve-sample.100k` > 300ms 或 E2E 的 `data-chart-update-ms` > 200ms：先按 ADR-042
  的复核条件优化 option/`useDirtyRect`/`large`；仍超预算则把解析移入 Worker 或改 per-series x
  （新 ADR）。
- 若整应用 private 内存接近 600MB：把缓存容量降到 1 或改 WeakRef 键，再测。
- 若 100k 行长表（多系列 × 整列 null 数组）超预算：需要结构化 gap / per-series x（ADR-041
  复核条件）。
- 若产品要求可取消或后台的大表解析：引入图表 Worker（协议 + ADR），不改本 ADR 的缓存键。
- 若 rAF 合并造成可感知的状态滞后：恢复逐事件发布或加“尾帧强制刷新”；不改 `ChartInteractionState`。

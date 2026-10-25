# ADR-041 T4.2 的 LTTB 采样、共享 X 轴对齐与缺失值语义

- 状态：已接受
- 日期：2026-10-25
- 相关：SPEC §11.2、§11.3、§16.1；TASKS T4.2；ADR-040、ADR-032

## 背景

T4.1 交付了 RenderModel（共享 `x.values` + 对齐的 `series[].values`），并把
`meta.sampled=false`、`sourcePoints=renderedPoints=非空 Y 值数` 留给 T4.2。SPEC §11.2.6–7
要求：同一系列的点数超过 `sampling.threshold` 且启用采样时，用 LTTB 降到 `target`，保留
首尾点并置 `meta.sampled=true`。

SPEC 没有规定以下实现细节，必须在写代码前裁决，否则 T4.3 的适配器会各自发明一套：

1. LTTB 的输入输出形态（点对象还是索引；category 轴用什么 x 坐标；`target < 3` 时怎么办）。
2. **逐系列采样与共享 X 轴如何对齐**：每个系列独立采样会得到不同的 x 子集，而
   `RenderModel.x.values` 只有一份。
3. "点数"的判定口径（含 null 还是非空）；未采样系列会不会因邻居被采样而丢点。
4. 采样后 `sourcePoints`/`renderedPoints`/`sampled` 与 warning 的关系。
5. 采样时机与归属（`chart-model` 还是 `chart-echarts`）。

## 决定

### 1. 纯函数 API 与算法

```ts
// @curve/chart-model
export interface SamplingOptions {
  enabled: boolean;
  threshold: number;
  target: number;
}

lttbIndices(x: readonly number[], y: readonly (number | null)[], target: number): number[]
sampleSeriesIndices(
  x: readonly number[],
  values: readonly (number | null)[],
  options: SamplingOptions,
): number[] | null
```

- `lttbIndices` 返回**升序的原始下标**（不复制点对象）：先筛出 y 非 null 且 x/y 有限的点，
  再按标准 LTTB 分桶；保留首个与末个**非空**点（SPEC §11.2.7）。
- `target < 3` 退化为 `[first]`（target 1）或 `[first, last]`（target 2）；`target ≥ 非空点数`
  原样返回全部非空下标（调用方此时通常根本不会调用采样）。
- `target` 非正整数、或 x/y 数组长度不一致时抛 `RangeError`：这是编程错误，
  持久化的 `sampling` 已由 `chartOptionsSchema` 校验（正整数）。
- `sampleSeriesIndices` 只在 `enabled && 非空点数 > threshold && 非空点数 > target` 时返回
  下标；否则返回 `null` 表示"原样渲染"。因此 `target ≥ threshold` 或阈值内的系列不会被
  标记为已采样。

### 2. LTTB 的 x 坐标

- number/time 轴使用存储的数值（date 为 epoch ms）。
- category（text）轴使用点在有序行集中的下标 `0..n-1`：类目没有数值间距，LTTB 只需保持
  桶的先后次序。
- 采样是对已排序行序的**子序列选择**，永不重排；默认数值/时间 X 升序、文本 X 物理顺序
  （ADR-040 §3）。用户配置了非 X 列的 `spec.sort` 时，采样同样只按下标取子序列，不改变
  用户排序。

### 3. 共享 X 轴对齐（关键决定）

逐系列独立采样后，`x.values` 取**各系列保留下标的升序并集**：

- 被采样系列只保留自己的 LTTB 下标；并集中属于其它系列的位置输出 `null`。
- 未触发采样的系列贡献它的**全部非空下标**，因此不会因为相邻系列被采样而丢点
  （阈值语义按系列独立生效）。
- 每个被采样系列的非空点数 ≤ `target`；`x.values.length` 可能大于 target（上界约为
  `Σ max(threshold, target)`）；`renderedPoints = Σ 各系列非空点数 ≤ sourcePoints`。
- 只有**至少一个系列真的被降采样**时才改写模型；否则原样返回 T4.1 的数组
  （`sampled=false`、`renderedPoints=sourcePoints`、`x.values` 长度不变）。

被否决的替代方案：整张图共用一个下标子集（对首个系列、或全部系列的合成信号做一次 LTTB）。
它能让 `x.values.length === target`，但会抹平其它系列的峰，与 SPEC §11.2.6 "同一系列的
点数" 的逐系列措辞冲突，并让未采样系列丢点。

### 4. 缺失值语义

- `null` 是断点/缺口（SPEC §11.2.4）：既不参与三角面积，也不会成为保留下标；采样后仍为
  `null`。
- 被采样系列在"并集中属于别的系列"的位置输出 `null`：RenderModel 只有 `number | null`
  两种状态，无法区分"原始缺口"和"被采样略过"。T4.3 必须按非空值成对渲染（连线跨过这些
  位置），这是本任务接受的代价（见"代价"）。
- 采样不新增、不删除、不重排 warning；顺序仍按 ADR-040：X 丢行 → 重复 X → 非数值 Y
  （按列）→ 系列截断。

### 5. meta 口径

- `sourcePoints`：采样前各系列非空 Y 总数（沿用 ADR-040，断点不算点）。
- `renderedPoints`：采样后各系列非空 Y 总数，恒 `≤ sourcePoints`。
- `sampled`：至少一个系列被降采样时为 `true`；关闭采样、点数不足、或 target 不小于点数时
  为 `false`。
- UI 的"已采样"徽标只读 `meta.sampled`（SPEC §11.2.7），不需要另算点数。

### 6. 采样时机与性能门禁

- 采样只在 `resolveSeries` 内发生一次（`@curve/chart-model`）；`@curve/chart-echarts`
  不得再采样（SPEC §11.2.6）。
- 新增 bench suite `sample`（`pnpm bench -- --sample`）：
  - `chart.sample.100k`：单个 100k 系列 LTTB 到 2,000，预算 **50ms**（TASKS T4.2
    "采样耗时 ≤ 50ms/系列"）；
  - `chart.resolve-sample.100k`：100k×10 表、宽表 2 个 Y 系列的完整 resolve+采样，
    预算 **300ms**（SPEC §16.1 "图表解析+采样 100k"）；
  - `chart.resolve-unsampled.100k`：关闭采样的同一解析，仅诊断（不设门禁），用于观察
    采样相对解析的增量。

### 7. 不改变的东西

- 不新增运行时依赖；不 import ECharts/React/Electron。
- 不改变 `RenderModel` 形状、`formatVersion`/manifest/JSONL/IPC/preload/CSP。
- 不改 T4.1 的映射校验、系列 id/名称、调色板与 warning 文本。

## 代价

- 多系列采样后 `x.values` 可能长于 target（上界 `Σ max(threshold, target)`；2 个 2k 系列约
  4k 个 x 位置）。T4.6 必须验证 2k 点渲染预算与 10 次切换的内存；若超预算，可改为共用
  下标子集或给 `RenderSeries` 增加 per-series x —— 两者都需要新 ADR。
- 被采样略过的 null 与原始缺口不可区分；T4.3 只能按"非空成对"渲染，真正断开的数据点也会
  被连线。要保留真实断点语义需要结构化 gap 字段（另写 ADR）。
- category 轴用下标而非类目间距，采样结果依赖行序（类目轴本来就是序数语义）。
- 三角形用 epoch ms 做 x；重复 X 时多处面积为 0，按"每桶首个"确定性选中（重复 X 已有 warning）。
- 未采样系列贡献全部非空点：19 个小系列 + 1 个大系列时并集可能接近原行数，采样收益下降；
  这是"不丢未采样数据"的代价。

## 影响

- `packages/chart-model/src/sampling.ts`（新增）与 `render-model.ts` 的集成；`index.ts` 导出；
  `sampling.test.ts` 与 `render-model.test.ts` 新增用例；黄金快照不变（3 行夹具不触发采样）。
- `scripts/bench.ts` 新增 `sample` suite 与 `--sample`；根 `devDependencies` 增加 workspace 包
  `@curve/chart-model`（只被 bench 使用，不是运行时依赖），`scripts/tsconfig.json` 增加
  project reference。
- `docs`：SPEC §11.2/§11.3 的实现边界、TASKS T4.2、CHANGELOG、HANDOFF、ADR 索引与
  `docs/reports/t4.2/REPORT.md`。

## 复核条件

- T4.6 若 100k 端到端（解析+采样+option+渲染）超 300ms/200ms，或并集 x 过大影响交互：
  改为共用下标子集（会损失逐系列峰值）或 per-series x（改 RenderModel 契约），先写 ADR。
- 若产品要求采样后仍显示真实断点（不连线），需要结构化 gap（例如 `gaps: number[]`）或
  per-series 数据，另写 ADR。
- 若需要按系列覆盖 `threshold/target`，或让用户在检查器里调采样参数，需改 manifest schema
  与 `ChartOptions`（先 ADR，并补迁移/夹具）。
- 若 LTTB 在更多系列/更大表下超过 50ms/系列，优先评估按 x 坐标做二分分桶或复用
  `QueryContext`，不要放宽预算。

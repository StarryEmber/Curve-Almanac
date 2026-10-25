# T4.2 报告 — LTTB 采样与缺失值语义

- 任务：T4.2（FR-CHT-05；SPEC §11.2–§11.3）
- 日期：2026-10-25
- 决策：ADR-041（LTTB API、共享 X 轴并集、null 语义、meta 口径、性能门禁）
- 状态：已完成；未进入 T4.3。

## 1. 目标与交付

1. `@curve/chart-model` 新增纯函数 `lttbIndices(x, y, target)`：升序原始下标、保留首尾
   **非空**点、null 不参与三角面积、`target < 3` 退化、`target ≥ 非空点数` 原样返回；
   非法 target/数组长度抛 `RangeError`。
2. `sampleSeriesIndices(x, values, options)` 做逐系列采样判定：`enabled && 非空点数 >
   threshold && 非空点数 > target`，否则返回 `null`（原样输出）。
3. `resolveSeries` 接入采样：逐系列 LTTB 后按**升序并集**写回共享 `x.values`；未采样系列贡献
   全部非空下标，被采样系列在其它系列位置为 `null`；`meta.sampled`/`renderedPoints` 更新，
   `sourcePoints` 口径与 warning 文本/顺序完全沿用 T4.1。
4. number/time 轴用存储数值（date = epoch ms）采样，category 轴用行下标；采样只取子序列，
   不重排。
5. 新增 `pnpm bench -- --sample` suite（单系列 100k→2k 与 100k 解析+采样两个门禁用例，
   另有一条诊断）；不引入运行时依赖，不 import ECharts/React/Electron，不改
   `formatVersion`/manifest/JSONL/IPC。

## 2. 关键文件

```text
packages/chart-model/src/sampling.ts (+sampling.test.ts)     # LTTB + 逐系列采样判定
packages/chart-model/src/render-model.ts (+render-model.test.ts)
packages/chart-model/src/index.ts                            # 导出 sampling
scripts/bench.ts                                             # 新增 sample suite 与 --sample
scripts/tsconfig.json                                        # + chart-model project reference
package.json / pnpm-lock.yaml                                # workspace devDependency（仅 bench）
docs/adr/041-t42-lttb-sampling.md
docs/reports/t4.2/REPORT.md
```

## 3. 公开 API

```ts
// @curve/chart-model
interface SamplingOptions { enabled: boolean; threshold: number; target: number }

lttbIndices(x: readonly number[], y: readonly (number | null)[], target: number): number[]
sampleSeriesIndices(
  x: readonly number[],
  values: readonly (number | null)[],
  options: SamplingOptions,
): number[] | null
```

- 两者都是纯函数、无状态；`RenderModel` 形状未变。
- `lttbIndices` 的返回值是原始数组下标（升序、严格递增、非空），调用方负责映射回 x/系列值。

## 4. 语义实现（对照 SPEC §11.2 / ADR-041）

| 项 | 语义 |
|---|---|
| 触发 | 逐系列：`enabled && 非空点数 > threshold && 非空点数 > target`；`target ≥ threshold` 或阈值内不采样 |
| LTTB | 先剔除 null/非有限点，再标准分桶；保留首个与末个非空点；`target<3` → 首点/首尾点 |
| x 坐标 | number/time 用存储数值（date epoch ms）；category 用有序行下标 |
| 顺序 | 只取子序列，不重排（默认 X 升序 / 文本物理顺序 / 用户 `sort` 均保持） |
| 共享 X 轴 | 采样后 `x.values` = 各系列保留下标的升序并集；未采样系列贡献全部非空下标 |
| 未采样系列 | 不丢点（不因邻居采样而丢点）；被采样系列在其它系列位置为 null、非空点数 ≤ target |
| null | 不参与三角面积、不会被保留、采样后仍为 null；断点语义不变 |
| meta | `sourcePoints` = 采样前非空 Y 总数；`renderedPoints` = 采样后非空 Y 总数 ≤ 前者；`sampled` 由采样器置位 |
| warning | 文本与顺序完全沿用 T4.1（X 丢行 → 重复 X → 非数值 Y → 系列截断）；采样不新增 warning |
| 未采样/关闭 | 原样返回 T4.1 模型（`sampled=false`、`renderedPoints=sourcePoints`、x 长度不变） |

## 5. 验收逐项

| # | 验收项 | 结果 |
|---|---|---|
| 1 | 100k → 2k 点，首尾保留，峰值形状肉眼可辨 | ✅ `lttbIndices` 100k→2,000 长度精确、首尾下标 0/99,999；孤立尖峰用例断言峰点被保留；`chart.sample.100k` 实测 P95 4ms（外部负载下 14ms） |
| 2 | 采样耗时 ≤ 50ms/系列 | ✅ bench `chart.sample.100k` P50 4ms / P95 **4ms**（预算 50ms；外部负载下的复跑为 14ms，仍达标） |
| 3 | null 不参与采样三角计算，输出仍为 null | ✅ 单测：null 点永不被保留、首尾取非空点；集成用例：缺口与"被采样略过"位置在模型里仍为 null |
| 4 | 属性测试：输出点数 ≤ target 且 x 单调 | ✅ 5,000 点随机游走（含 null 与重复 x），target 10/100/1,000：长度 = min(target, 非空点数)、下标严格递增、x 非降；另有 100k 用例 |

补充覆盖：关闭采样 / 阈值内 / target 不足时不改写模型；未采样系列不丢点；category 轴采样
保持物理顺序；长表逐系列采样；采样与 T4.1 warning 共存；`target` 非法与数组长度不一致抛错。

## 6. 验证命令与结果（2026-10-25 本机）

```text
pnpm exec vitest run packages/chart-model
  3 files / 71 tests passed（sampling 17 条 + render-model 53 条 + index 1 条）

pnpm exec vitest run packages/chart-model --testNamePattern sample
  11 passed / 60 skipped（只跑采样相关用例；TASKS 原写法 `-- --grep` 在 Vitest 5 不过滤）

pnpm verify
  145 files / 1302 tests passed；ESLint 0；depcruise 400 modules / 1609 deps / 0 violations

pnpm test:coverage
  All files：statements 75.46% / branches 68.41% / functions 73.96% / lines 75.55%
  chart-model：sampling.ts 93.24% lines（81.25% branch）/ render-model.ts 96.96% lines
  阈值 70/60 未下调；纯逻辑包 85% 行门禁满足（93.24%）

pnpm format:check
  通过

pnpm build
  exit 0；renderer 1,618.04 kB + ImportSession 42.82 kB；CSS 64.03 kB
  （chart-model 未被 renderer 引用，产物与 T4.1/M3 一致）

pnpm e2e
  72 passed；未改 UI/E2E 代码，M3 验收用例仍通过
  （首次全量跑因外部游戏进程占满 CPU 使 grid 首帧 1045ms 超 1000ms 预算；
  暂停外部程序后复跑 72 passed，未改预算。renderer bundle 未变化且不含 chart-model 代码）

pnpm bench -- --sample
  exit 0；chart.resolve-sample.100k P50 82ms / P95 93ms（预算 300ms）
            chart.sample.100k         P50  4ms / P95  4ms（预算 50ms）
            chart.resolve-unsampled.100k P50 55ms（仅诊断）
  （早前机器上另有外部程序占满 CPU 时的复跑：154ms / 14ms / 110ms，均达标）

pnpm bench
  exit 0；open 542ms、save 314ms、edit 0ms、query 223ms、text-sort 276ms、
  cjk-sort 636ms、import 830ms、condition P95 1ms；sample suite 同上一行
```

## 7. 残留风险与未覆盖

- **x 并集增长**：每个被采样系列 ≤ target，但共享 `x.values` 是并集，多系列时可大于 target
  （上界约 `Σ max(threshold, target)`）。T4.6 需验证 2k 点渲染预算与 10 次切换内存；若超，
  可改共用下标子集或 per-series x（均需新 ADR）。
- **null 二义性**：模型只有 `number | null`，无法区分"原始缺口"与"被采样略过"；T4.3 必须按
  非空值成对渲染（请求外的断点也会被连线）。若要真实断点语义，需要结构化 gap 字段。
- **category 轴**：按下标采样、忽略类目间距；采样结果依赖行序（类目轴本身是序数语义）。
- **未采样系列占位**：19 个小系列 + 1 个大系列时并集可能接近原行数，采样收益下降；这是
  "不丢未采样数据"的取舍。
- **重复 X**：多处三角面积为 0 时按"每桶首个"确定性选中；重复 X 已有 T4.1 warning。
- 未实现 ECharts option（T4.3）、图表 UI/检查器（T4.4）、图表交互/PNG（T4.5）与图表端到端
  性能硬化（T4.6）。

## 8. 结论与停点

T4.2 的 4 项验收全部通过：单系列 100k→2k 的 LTTB 采样在 4ms（P95，外部负载下 14ms）内完成，
`meta` 三字段与 warning 语义沿用 T4.1，样本模型可直接被 T4.3 适配器消费。下一步 T4.3
（ECharts 适配器），仍是一次只推进一个任务。

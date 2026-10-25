# T4.3 报告 — ECharts 适配器

- 任务：T4.3（FR-CHT-03、FR-CHT-04；SPEC §11.4）
- 日期：2026-10-25
- 决策：ADR-042（依赖/按需注册、option 映射、null 断点、主题、tooltip 安全、生命周期、PNG）
- 状态：已完成；未进入 T4.4。

## 1. 目标与交付

1. `packages/chart-echarts` 从 T0.1 占位包变成唯一消费 `RenderModel` 的适配器：新增
   `echarts@^6.1.0`（安装 **6.1.0**）并按需注册 Line/Scatter/Bar + Grid/Tooltip/Legend/
   DataZoom/Toolbox + CanvasRenderer，不 import 全量入口。
2. `toEChartsOption(model, { locale? })` 是唯一 option 构造点（纯函数）：x 轴（value/time/
   category）、`[x, y]` 对/对齐数组、调色板与系列色、线宽/平滑/点/网格/图例/从零开始/精度、
   tooltip（HTML + 转义、X 单位、Y 固定精度）、dataZoom（inside + slider）、toolbox 框选缩放。
3. null 断点策略裁决（ADR-042 §3）：未采样 `connectNulls: false`（真实缺口断开，符合
   SPEC §11.2.4 与 TASKS "null 断点不连 line"）；已采样 `connectNulls: true`（ADR-041 的共享 X
   轴并集使"被采样略过"与真实缺口不可区分，采样图必须跨过；真实缺口被连上是 ADR-041 已接受的
   代价）。适配器不做第二次采样。
4. 主题按背景亮度推导（`resolveChartTheme`），颜色为与 `@curve/ui` 令牌同值的常量；不 import
   `@curve/ui`。
5. `createChartRenderer({ locale? })` 生命周期：惰性 `init`、`render`/`update`（merge +
   `replaceMerge`）/`resize`/`dispose`/`toPNG`；空数据不创建实例；错误返回结构化
   `AppError`；`activeChartInstanceCount()` 证明 dispose 无泄漏。
6. 6 条 option 黄金快照（4 调色板 + 深色背景 + 采样缺口）、24 条 option 断言、15 条格式化单测、
   16 条生命周期单测（mock `echarts/core`）、6 条主题单测、注册幂等测试、2 条真实 ECharts
   SSR（SVG）冒烟测试、包边界测试（扫描 workspace 源码与包清单）。新增 dependency-cruiser 规则：
   只有 `chart-echarts` 可以 import echarts。
7. 不改变 `RenderModel` 形状、`formatVersion`/manifest/JSONL/IPC/preload/CSP；不新增 IPC/命令。

## 2. 关键文件

```text
packages/chart-echarts/package.json                     # + echarts ^6.1.0
packages/chart-echarts/tsconfig.json                    # project references、DOM lib、types:["node"]
packages/chart-echarts/src/theme.ts (+theme.test.ts)     # 背景亮度 → light/dark；令牌同值常量
packages/chart-echarts/src/format.ts (+format.test.ts)   # Intl 格式化、tooltip HTML 转义
packages/chart-echarts/src/option.ts (+option.test.ts)   # 唯一 option 构造点 + 6 条黄金快照
packages/chart-echarts/src/registration.ts (+test)       # 幂等 use([...])
packages/chart-echarts/src/renderer.ts (+renderer.test)  # 生命周期、PNG、实例计数
packages/chart-echarts/src/boundary.test.ts              # 包外无 echarts 引用/依赖
packages/chart-echarts/src/index.ts                      # 公开出口
.dependency-cruiser.cjs                                  # only-chart-echarts-imports-echarts
pnpm-lock.yaml
docs/adr/042-t43-echarts-adapter.md
docs/reports/t4.3/REPORT.md
```

## 3. 公开 API

```ts
// @curve/chart-echarts
PACKAGE_NAME

// option（纯函数）
type ChartSeriesOption / ChartOption
interface ChartOptionOptions { locale?: string }
toEChartsOption(model: RenderModel, options?: ChartOptionOptions): ChartOption
isEmptyModel(model: RenderModel): boolean

// 主题
type ChartThemeMode = 'light' | 'dark'
interface ChartTheme { mode; text; mutedText; axisLine; splitLine; tooltipBackground; tooltipBorder; zoomFill }
CHART_THEMES: Readonly<Record<ChartThemeMode, ChartTheme>>
resolveChartTheme(background: string): ChartTheme

// 格式化
DEFAULT_CHART_LOCALE = 'en-US'
createChartFormatters(model, options?): ChartFormatters
escapeHtmlText(value: string): string

// 注册
registerEChartsModules(): void        // 幂等
areEChartsModulesRegistered(): boolean

// 生命周期
type ChartRendererState = 'idle' | 'ready' | 'empty' | 'error'
type ChartPngBackground = 'transparent' | 'light' | 'dark'
interface ChartPngOptions { scale?: number; background?: ChartPngBackground }
interface ChartRendererOptions { locale?: string }
type ChartRenderOutcome = { ok: true; state: 'ready' | 'empty' } | { ok: false; error: AppError }
type ChartPngOutcome = { ok: true; dataUrl: string } | { ok: false; error: AppError }
interface ChartRenderer { state; render; update; resize; toPNG; dispose }
createChartRenderer(options?: ChartRendererOptions): ChartRenderer
activeChartInstanceCount(): number
```

## 4. 语义实现（对照 SPEC §11.4 / ADR-042）

| 项 | 语义 |
|---|---|
| x 轴 | `number` → ECharts `value`、`time` → `time`、`text` → `category`；类目轴 `xAxis.data` + 对齐数组，数值/时间轴 `[x, y]` 对 |
| 值 | `null` 保留为空点（不补 0、不插值）；`numberDigits` 固定小数位；轴刻度最多 4 位小数并千分位 |
| 断点 | 未采样 `connectNulls: false`；已采样 `connectNulls: true`（ADR-042 §3） |
| 系列 | 线宽/平滑/点/颜色；scatter 固定 `symbolSize: 6`；bar 只取数据与颜色；不设 `series.sampling` |
| 网格/图例 | `showGrid` → 连续轴 `splitLine.show`；类目轴不画竖线；图例 top/right/bottom/none（scroll） |
| 从零 | `yStartAtZero` → `yAxis.scale = !yStartAtZero` |
| 主题 | `resolveChartTheme(background)`（WCAG 相对亮度，阈值 0.5）→ 轴/文字/tooltip/滑块颜色；`animation: false` |
| tooltip | axis（line/bar）/ item（scatter）；HTML 模式，用户文本全部转义；X 单位 + Y 精度；`confine: true` |
| 交互 | `dataZoom` inside + slider；toolbox `dataZoom`（框选缩放，`yAxisIndex: 'none'`） |
| 生命周期 | 惰性 init；`render` 重新挂载；`update` merge + `replaceMerge:['series','xAxis','yAxis']`；`dispose` 幂等 |
| 空数据 | 无系列 / x 为空 / `sourcePoints = 0` → 不创建实例，状态 `empty` |
| 错误 | `init`/`setOption` 失败 → `E_UNKNOWN`；PNG 失败 → `E_EXPORT_FAILED`；实例被清理 |
| PNG | `getDataURL({ type:'png', pixelRatio, backgroundColor, excludeComponents:['toolbox'] })`；默认 2x、透明；scale 上限 4 |

## 5. 验收逐项

| # | 验收项 | 结果 |
|---|---|---|
| 1 | 4 个调色板/深浅背景 option 快照通过 | ✅ 6 条黄金快照：default/muted/vivid/colorblind（浅色）、default 深色背景、已采样多系列缺口；覆盖颜色、图例、网格、tooltip、zoom、toolbox 与 `connectNulls` |
| 2 | resize 不变形；dispose 无泄漏（实例计数为 0） | ✅ `resize()` 只委托实例且不重新 `setOption`；`dispose` 幂等、重复 render 先 dispose、空数据 dispose、init/setOption 失败也 dispose；`activeChartInstanceCount()` 在以上路径均为 0。像素级"不变形"需要真实容器，由 T4.5/T4.6 的 E2E 覆盖（T4.3 还没有可挂载的图表视图） |
| 3 | tooltip 显示单位/精度；null 断点不连 line | ✅ X 单位（`Time (s)` / `1 (s)`）与 Y 固定精度（`numberDigits=2` → `1.50`）；tooltip 跳过 null 点、全 null 返回空串；未采样模型 `connectNulls: false`（断点不连），已采样模型 `connectNulls: true`（ADR-041 语义在报告中单独说明） |
| 4 | 包外无 echarts 引用 | ✅ dependency-cruiser `only-chart-echarts-imports-echarts`（416 modules / 1655 deps / 0 violations）+ 包内边界测试扫描 `packages/*/src`、`apps/*/src`、`plugins/*/src`、`scripts` 与所有 workspace `package.json` |

补充覆盖：`x.type` 三种轴、category 对齐、数值/时间 `[x, y]` 对、yStartAtZero、showGrid、
legend 四态、palette 兜底与空 palette、无 label 轴、bar/scatter 映射、未知/畸形 tooltip 参数、
非 Error 抛错回退文案、toPNG 背景/倍率/空图/抛错、注册幂等。

**真实 ECharts 冒烟（SSR/SVG，2 条）**：用真实 `echarts@6.1.0` 以 `ssr: true` + SVG 渲染
`toEChartsOption` 的输出（不依赖 DOM）。同一模型（5 点、中间一个 null）在
`meta.sampled === false` 时线系列路径产生 **2 个子路径**（缺口断开），改为
`meta.sampled === true` 后为 **1 个子路径**（跨缺口连线）；scatter/bar/category/time 四种
option 均渲染出 SVG 且不含 `NaN`。这补充了黄金快照无法覆盖的"ECharts 真的接受该 option"。

## 6. 验证命令与结果（2026-10-25 本机）

```text
pnpm exec vitest run packages/chart-echarts
  8 files / 68 tests passed

pnpm verify
  152 files / 1369 tests passed；ESLint 0；
  depcruise 416 modules / 1655 deps / 0 violations

pnpm test:coverage
  All files：statements 75.99% / branches 69.04% / functions 74.60% / lines 76.09%
  chart-echarts/src：99.57% / 95.08% / 100% / 99.56%
  （option.ts、renderer.ts、theme.ts、registration.ts 100% 行；format.ts 98.36%）
  阈值 70/60 未下调

pnpm format:check
  通过

pnpm build
  exit 0；renderer 1,618.04 kB + ImportSession 42.82 kB；CSS 64.03 kB
  （chart-echarts 尚未被 renderer 引用，产物与 T4.2 一致）

pnpm e2e
  72 passed（3.2m）；export-csv 100k 导出 1,673ms、M3 演示 10.1s、
  冷启动 887ms、100k 打开 638ms、整应用内存 570MB/600MB（未改 UI/E2E 代码）

pnpm bench
  exit 0；open 537ms、save 395ms、edit 0ms、query 209ms、text-sort 252ms、
  cjk-sort 581ms、import 866ms、condition P95 1ms；
  chart.resolve-sample.100k P95 81ms（预算 300ms）、chart.sample.100k P95 21ms（预算 50ms）
  均达标；baseline=none

esbuild --bundle --minify（一次性体积测量，未提交）
  echarts 注册子集        620,562 B minified / 210,750 B gzip（606.0 kB / 206 kB）
  适配器完整 bundle       1,094,697 B / 310,991 B gzip（1.0 MB / 304 kB）
  domain+zod+chart-model  482,009 B / 102,127 B gzip（470.7 kB / 100 kB）
```

## 7. 残留风险与未覆盖

- **Y 轴单位缺失**：`RenderSeries` 没有 `unit`，tooltip/轴名只能显示 X 单位与 Y 精度；要显示
  Y 单位需扩展 `RenderModel`（SPEC §11.3）并写 ADR。
- **采样图断点**：`meta.sampled=true` 时真实缺口也会被连线（ADR-041 已接受）；未采样图保持断开。
- **canvas 无法在 jsdom 单测**：生命周期单测 mock `echarts/core`（验证调用/计数/错误路径）；
  另有 2 条 SSR/SVG 测试让真实 ECharts 接受 option 并验证断点/连线；真实像素与缩放布局仍由
  T4.5/T4.6 的 E2E 覆盖。
- **toolbox 文案**：ECharts 英文默认标题（"Data Zoom" 等），未本地化/键盘可达；T4.5 处理。
- **动画关闭**：图表切换无过渡动画；若 T4.5 要求入场动画需单独评估 2k 点性能。
- **dataZoom 滑块常驻**：即使 3 个点也显示，T4.4 可按点数决定隐藏（需 UI 决策）。
- **bundle**：按需注册仍带 toolbox 全部 feature 实现；T4.4 接线后 renderer 产物会明显变大，
  T6.4 评估拆包。
- 未实现图表 UI/检查器（T4.4）、交互/空态/PNG 写盘（T4.5）与图表端到端性能硬化（T4.6）。

## 8. 结论与停点

T4.3 的 4 项验收全部通过：6 条 option 黄金快照覆盖 4 调色板 + 深浅背景 + null/采样缺口，
生命周期在 16 条 mock 单测中证明 init/update/resize/dispose/toPNG 与实例计数为 0，tooltip 的
单位/精度/转义有 15 条独立单测，2 条 SSR 测试证明真实 ECharts 6.1.0 接受 option 且断点/连线
符合 ADR-042 §3，包外无 echarts 引用由 depcruise 与边界测试双重阻断。下一步 T4.4
（图表创建与检查器），仍是一次只推进一个任务。

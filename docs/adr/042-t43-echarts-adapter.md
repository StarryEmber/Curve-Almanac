# ADR-042 T4.3 的 ECharts 依赖、按需注册、option 映射与渲染器生命周期

- 状态：已接受
- 日期：2026-10-25
- 相关：SPEC §4.2、§5.1、§11.2–§11.4、§11.6、§16.1；TASKS T4.3；ADR-004、ADR-040、ADR-041

## 背景

`@curve/chart-echarts` 自 T0.1 起是占位包（`index.ts` 只有 `PACKAGE_NAME`），`echarts` 从未安装。
T4.3 要把它变成唯一消费 `RenderModel`、唯一 import ECharts 的适配器：option 映射、主题/调色板、
tooltip/legend/dataZoom、`render/update/resize/dispose/toPNG` 生命周期，以及 option 黄金快照。

SPEC §11.3 固定了 `RenderModel`，§11.4 固定了适配器的能力清单，ADR-041 固定了"采样在
`chart-model` 完成、适配器不得再采样"。SPEC 没有规定以下实现细节，必须先裁决，否则 T4.4/T4.5
会各自发明一套：

1. 装哪个 ECharts 主版本、按需注册哪些模块；体积代价。
2. `RenderModel` → option 的具体形状：x 轴整数/时间/类目分别怎么给数据；`style` 各字段映射到
   哪些 ECharts 选项；图例/网格/从零开始/精度。
3. **null 断点怎么渲染**：TASKS T4.3 写"null 断点不连 line"，但 ADR-041 §4 写"被采样略过的 null
   与真实缺口不可区分，T4.3 必须按非空值成对渲染（连线跨过这些位置）"，两者直接冲突。
4. 深浅色主题从哪来（`RenderModel` 只有 `style.background`，没有 theme 字段），轴/文字/tooltip 颜色。
5. tooltip 的格式化与安全（用户可控的系列名/类目要进入 tooltip）。
6. 生命周期与错误契约：空数据、初始化失败、`toPNG` 背景/倍率、实例计数。
7. locale 从哪来（`RenderModel` 不带 locale）。

## 决定

### 1. ECharts 版本与按需注册

- `packages/chart-echarts/package.json` 增加唯一运行时依赖 `echarts@^6.1.0`（安装到 **6.1.0**）。
  SPEC §5.1 "主版本锁定，按需引入"：锁定 6.x，不引全量 `echarts` 入口。
- 只注册（`registration.ts`，幂等）：
  - 图表：`LineChart`、`ScatterChart`、`BarChart`；
  - 组件：`GridComponent`、`TooltipComponent`、`LegendComponent`、`DataZoomComponent`
    （inside + slider）、`ToolboxComponent`（其 `dataZoom` feature 提供"框选缩放"，内部会
    install `dataZoomSelect`）；
  - 渲染器：`CanvasRenderer`（canvas 更利于 2k 点交互与 PNG）。
- `init` 使用 `{ renderer: 'canvas' }`；不设置 `useDirtyRect`（T4.6 再评估）。
- 体积（2026-10-25 本机实测，esbuild `--bundle --minify --format=esm --platform=browser`）：
  - 仅上述注册子集：**606.0 kB** minified（620,562 B）/ **206 kB** gzip（210,750 B）；
  - 适配器完整 bundle（含 `@curve/domain`、zod、`@curve/chart-model`）：**1.0 MB** minified /
    **304 kB** gzip；其中 domain + zod + chart-model 基线为 470.7 kB / 100 kB gzip；
  - `echarts` 安装体积 60.3 MB（含全部 `dist`/`types`，开发期体积）。
  T4.3 尚未被 renderer 引用，`pnpm build` 的 renderer 产物保持 **1,618.04 kB**（CSS 64.03 kB）
  不变；真实 renderer chunk 增量在 T4.4 接线时记录。
  被否决：`import * from 'echarts'`（全量约 1 MB minified，且包含用不到的图表/组件）。

### 2. option 映射（纯函数）

`toEChartsOption(model, { locale })` 是唯一生成 option 的地方；`createChartRenderer` 只调用它。

| RenderModel | option |
|---|---|
| `style.background` | `backgroundColor`（原样） |
| `style.palette` | `color`（默认色序兜底） |
| `series[i].color` | `lineStyle.color` + `itemStyle.color`（显式，优先于色序） |
| `kind` | `series.type`：`line` / `scatter` / `bar` |
| `style.smooth` / `showSymbol` / `lineWidth` | line 的 `smooth` / `showSymbol`+`symbol` / `lineStyle.width`；scatter 用固定 `symbolSize: 6`（点即数据，不受 `showSymbol` 影响）；bar 忽略这三项 |
| `style.showGrid` | 连续轴的 `splitLine.show`；类目轴只画水平线（类目轴每格都画竖线噪声大） |
| `style.legend` | `legend.show/type:'scroll'/top/right/bottom/left/orient`；`none` → `show:false` |
| `style.yStartAtZero` | `yAxis.scale: !yStartAtZero`（ECharts 的 `scale:false` 即强制包含 0） |
| `style.numberDigits` | tooltip 的 Y 值精度（固定小数位）；Y 轴刻度用最多 4 位小数的本地化格式 |
| `x.type = 'category'` | `xAxis.data = x.values`；系列数据是**与 x 对齐的 `(number\|null)[]`** |
| `x.type = 'number' \| 'time'` | `xAxis.type` 映射到 ECharts 的 `value` / `time`；系列数据是 **`[x, y]` 对**（`y` 为 `null` 时保留成空点） |
| `x.label` / `x.unit` | `xAxis.name = "label (unit)"`、`nameLocation:'middle'` |
| `meta` | 不进 option（`sampled` 只给 UI 徽标；warning 由 UI 展示） |

- 交互：`tooltip`（line/bar `trigger:'axis'`，scatter `trigger:'item'`）、`dataZoom`（inside +
  slider）、`toolbox.feature.dataZoom`（框选缩放，`yAxisIndex:'none'` 只缩放 X）。
- `animation: false`：2k 点下动画无收益，且让 `toPNG` 与快照确定；T4.5 若要求入场动画再评估。
- 不在适配器里设置 `series.sampling`：LTTB 已在 `resolveSeries` 内完成（ADR-041 §6）。

### 3. null 断点策略（解决 TASKS 与 ADR-041 的冲突）

- **未采样**（`meta.sampled === false`）：`connectNulls: false`，null 位置保留空点，线在缺口处
  断开 —— 这是 SPEC §11.2.4 "null 是断点，不补 0、不插值" 与 TASKS T4.3 验收
  "null 断点不连 line" 的字面语义。
- **已采样**（`meta.sampled === true`）：`connectNulls: true`，线跨过 null 位置 ——
  ADR-041 §4 的既定结论：共享 X 轴并集让"被采样略过的位置"表现为 null，它们与真实缺口
  不可区分；若在采样图上断开，逐系列采样后的线会被打碎成大量孤立段。ADR-041 已把
  "真实缺口也会被连线"列为接受的代价。
- 因此断点语义随 `meta.sampled` 切换：**没有发生采样时断点真实断开；发生采样时按非空点连线**。
  适配器不判断点数、不做第二次采样，只用 `meta.sampled` 这一个模型字段。
- scatter/bar 没有 `connectNulls`：null 只是不画点/不画柱。

被否决：一律 `connectNulls: true`（未采样图也会跨过真实缺口，违反 SPEC §11.2.4）；
一律 `connectNulls: false`（多系列采样图被打碎，违反 ADR-041 §4 与 T4.2 的交接要求）。

### 4. 主题由背景亮度推导

- `RenderModel` 只有 `style.background`（chart-model 已把 `auto` + 应用主题解析成具体颜色，
  ADR-040 §5）。适配器用 `resolveChartTheme(background)` 计算 WCAG 相对亮度（阈值 0.5）得到
  `light`/`dark`，据此选轴/文字/tooltip/滑块颜色；支持 `#RGB`、`#RGBA`、`#RRGGBB`、
  `#RRGGBBAA`、`rgb()/rgba()`，无法解析时按 light。
- 颜色是 `CHART_THEMES` 常量，取自 `@curve/ui` 的设计令牌值（light：文字 `#17202e`、次要
  `#475467`、轴线 `#d0d8e3`、网格 `#e3e9f1`；dark：`#e7edf5`/`#a9b4c4`/`#33404f`/`#263140`），
  但**不 import `@curve/ui`**（依赖方向禁止）。代价：令牌改动需手动同步常量；需要令牌化时把颜色
  作为参数注入并写 ADR。
- 不注册 ECharts 主题（`registerTheme`）：所有颜色都显式写在 option 里，快照可验证。

### 5. tooltip 格式化与安全

- 用 `Intl`（`en-US` 默认 locale，T4.4 传应用 locale）：
  - X（number）：千分位、最多 4 位小数；X（time）：`Intl.DateTimeFormat` 的日期+时间；
    X（category）：原字符串。
  - Y：`minimumFractionDigits = maximumFractionDigits = numberDigits`（与 domain 列精度的口径
    一致）。
  - X 的 `unit` 追加到 tooltip 表头与 X 轴名；**Y 的单位不在 `RenderModel` 里**（`RenderSeries`
    没有 `unit`），本任务无法显示，留 T4.4/后续 ADR（见"代价"）。
- `renderMode: 'html'` + **对所有进入 tooltip 的用户可控文本做 HTML 转义**（系列名、类目值、格式化
  结果）。ECharts 的 `marker` 不直接透传：适配器用模型里的系列色自己画一个色点。
- `confine: true`（tooltip 不越出容器）；`axisPointer` 颜色取主题。
- 被否决：`renderMode: 'richText'`（canvas 内绘制，无法被应用 CSS 主题化，且富文本语法会解释
  用户文本里的 `{style|...}`）。

### 6. 生命周期、错误与实例计数

```ts
createChartRenderer(options?: { locale?: string }): ChartRenderer

interface ChartRenderer {
  readonly state: 'idle' | 'ready' | 'empty' | 'error';
  render(container: HTMLElement, model: RenderModel): ChartRenderOutcome;
  update(model: RenderModel): ChartRenderOutcome;
  resize(): void;
  toPNG(options?: ChartPngOptions): ChartPngOutcome;
  dispose(): void;
}
```

- **惰性初始化**：`render(container, model)` 才 `init`；同一 `render` 再次调用视为重新挂载
  （dispose 旧实例 → init 新实例）。容器变化同样先 dispose。
- **空数据**（`isEmptyModel`：无系列 / x 为空 / `meta.sourcePoints === 0`）：不创建实例，
  状态 `empty`；已有实例被 dispose。UI 的空态文案/行动按钮在 T4.5。
- **update**：`setOption(option, { notMerge: false, replaceMerge: ['series', 'xAxis', 'yAxis'] })`。
  用 merge 不重建实例（SPEC §11.5）；`replaceMerge` 只替换序列与坐标轴，避免删系列/切轴类型时
  残留旧数据；`dataZoom`/`legend`/`toolbox` 合并，用户缩放状态得以保留。
- **错误**：`init`/`setOption` 抛错 → 捕获、清理实例、状态 `error`、返回
  `{ ok:false, error: AppError }`（`code: 'E_UNKNOWN'`，message 为开发者文案）。不新增错误码
  （SPEC §18 已固定 26 个）。`toPNG` 失败用 `E_EXPORT_FAILED`（SPEC §11.6）。
- **实例计数**：模块级 `activeChartInstanceCount()`（成功 init 且未 dispose 的数量），单测用它
  证明 `dispose` 无泄漏；`dispose` 幂等。
- **toPNG**：`{ scale = 2, background = 'transparent' | 'light' | 'dark' }` →
  `getDataURL({ type:'png', pixelRatio, backgroundColor, excludeComponents:['toolbox'] })`
  返回 data URL（不落盘；T4.5 负责文件名与写盘）。`scale` 非法时回落到 2，上限 4。
  `background: 'transparent'` → `'transparent'`；`light`/`dark` → chart-model 的
  `CHART_BACKGROUNDS`（复用常量，不复制颜色）。
- **locale**：`createChartRenderer({ locale })` 与 `toEChartsOption(model, { locale })`；
  默认 `en-US`（与 `DEFAULT_QUERY_LOCALE` 一致），T4.4 传应用 locale。

### 7. 边界与不改变的东西

- 仍只有 `@curve/chart-echarts` 可以 import ECharts：新增 dependency-cruiser 规则
  `only-chart-echarts-imports-echarts`（`packages/chart-echarts` 之外任何模块 → echarts 即失败），
  并加包内边界单测扫描 `packages/*/src`、`apps/*/src`、`plugins/*/src`、`scripts`。
- 不改变 `RenderModel` 形状、`formatVersion`/manifest/JSONL/IPC/preload/CSP、命令总线。
- 适配器不读表/Store，不采样，不拼筛选/排序谓词。

## 代价

- **bundle 增长**：按需注册仍带入 3 个图表 + 5 个组件 + toolbox 的全部 feature 实现
  （`SaveAsImage`/`DataView`/`MagicType`/`Restore` 也会被注册，约几 kB 级），T4.4 接线后
  renderer 产物会明显变大；T6.4 再评估拆包。
- **主题常量重复**：颜色抄自 `@curve/ui` 令牌；令牌变更要手动同步，直到把颜色注入选项。
- **采样图的断点**：`meta.sampled=true` 时真实缺口也被连线（ADR-041 已接受的代价）；
  未采样图断点保持断开。
- **Y 轴单位缺失**：`RenderSeries` 没有 `unit`，tooltip/轴名无法显示 Y 单位；要修需扩展
  `RenderModel`（另写 ADR 并更新 SPEC §11.3）。
- **canvas 无法在 jsdom 单测**：生命周期单测 mock `echarts/core`（只验证 init/setOption/resize/
  dispose/getDataURL 的调用与实例计数）；另有 2 条 SSR/SVG 冒烟测试让真实 ECharts 接受 option
  并验证"未采样断开 / 已采样连线"；真实像素与布局"resize 不变形"仍由 T4.5/T4.6 的 E2E 覆盖。
- **toolbox 标题为 ECharts 英文默认值**（"Data Zoom" 等）；本地化/键盘可达在 T4.5 处理。
- **动画关闭**：图表切换无过渡动画；若 T4.5 要求入场动画，需要单独评估 2k 点性能。
- **dataZoom 滑块常驻**：即使 3 个点也显示；T4.4 可按点数决定是否隐藏（需 UI 决策）。

## 影响

- `packages/chart-echarts/{package.json,tsconfig.json}`（新增 `echarts` 依赖、project references、
  `types: ["node"]` 供边界测试读源码）；`pnpm-lock.yaml`。
- 新文件：`src/{theme,format,option,registration,renderer}.ts` 与同目录测试、`src/index.ts` 公开出口。
- `.dependency-cruiser.cjs` 新增唯一 import 规则（模块/依赖计数会变）。
- `docs`：SPEC §11.4 增加"实现边界（T4.3，ADR-042）"；TASKS T4.3 勾选与实现备注；ADR 索引；
  CHANGELOG、HANDOFF、`docs/reports/t4.3/REPORT.md`。
- 不改变 SPEC §11.3 的 `RenderModel` 形状、不新增 IPC/命令。

## 复核条件

- T4.6 若 2k 点渲染 > 200ms 或交互卡顿：评估 `large`/`progressive`、`useDirtyRect`、SVG 渲染器
  或减少 toolbox 组件，不动预算。
- 若产品要求采样图也显示真实断点：需要 `RenderModel` 的结构化 gap 字段（ADR-041 复核条件）。
- 若要求 tooltip 显示 Y 单位或本地化轴标签：扩展 `RenderModel`（`RenderSeries.unit`）或把
  文案/颜色作为参数注入，先写 ADR 并更新 SPEC §11.3/§11.4。
- 若主题令牌化：把 `CHART_THEMES` 换成注入参数，不涉及数据迁移。
- 若 T4.5 的 PNG 导出要求"导出前等待渲染完成"，在适配器增加 `toPNG` 前的 `finished` 事件等待
  （ECharts `getDataURL` 同步读当前帧，动画关闭时已满足）。
- 若 toolbox 英文标题/图标不可接受：注册 ECharts 中文 locale 或提供 `labels` 注入，均由 T4.5 决定。

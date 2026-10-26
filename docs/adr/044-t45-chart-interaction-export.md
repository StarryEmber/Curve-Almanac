# ADR-044 T4.5 的图表交互、空态、PNG 导出与无障碍摘要

- 状态：已接受
- 日期：2026-10-26
- 相关：SPEC §11.4–§11.6、§15.1、§16.1；TASKS T4.5；ADR-004、ADR-040、ADR-041、ADR-042、
  ADR-043

## 背景

T4.4 交付了图表列表、新建向导、检查器四组与 `ChartView`/`ChartCanvas`，但交互仍完全依赖
ECharts 的 canvas 内置控件：图例与 dataZoom 无法用键盘操作，tooltip 没有稳定的 DOM 契约；
空态只有一句“没有可绘制的点”；`toPNG` 已存在却没有 UI、文件名与写盘路径；`aria-label` 只有
标题；toolbox 标题是 ECharts 英文默认值（ADR-042“代价”）。

T4.5 要实现 SPEC §11.4–§11.6 的交互、空态与导出。SPEC 没有规定以下细节，必须在写代码前裁决，
否则 UI、适配器与 IPC 会各自发明一套：

1. 图例/缩放由谁拥有：仅用 ECharts canvas 控件，还是提供 DOM 控件；如何双向同步状态。
2. 缩放/图例选择是否持久化；是否进入 manifest/撤销。
3. 三种空态如何从现有 `chartRenderStatus` 派生；行动按钮做什么。
4. PNG 的 `toPNG` 是同步的，导出前“等待一次完整渲染”如何落实；背景与倍率怎么暴露。
5. 二进制 PNG 如何越过 IPC：现有 `file:exportText` 只写 UTF-8 文本，且 SPEC 只有这一条保存通道
   被实现。
6. 导出入口放检查器（SPEC §11.5 原文）还是图表视图（渲染器实例的持有者）。
7. `aria-label` 摘要的组成与“查看数据表”的落点。
8. toolbox 标题本地化由哪一层提供（`chart-echarts` 不得 import `@curve/ui`，也不该硬编码应用文案）。

## 决定

### 1. 交互由 DOM 工具栏 + 渲染器交互 API 共同承担

`@curve/chart-echarts` 的 `ChartRenderer` 增加（SPEC §11.4）：

```ts
type ChartInteractionAction =
  | { type: 'toggle-series'; name: string }
  | { type: 'zoom-by'; factor: number }
  | { type: 'reset-view' };

interface ChartInteractionState {
  /** 当前 dataZoom 百分比窗口；没有实例/没有 dataZoom 时为 null。 */
  zoom: { start: number; end: number } | null;
  /** 当前被图例隐藏的系列名。 */
  hiddenSeries: string[];
}

interface ChartRenderer {
  // …
  getInteractionState(): ChartInteractionState;
  dispatchInteraction(action: ChartInteractionAction): void;
  onInteractionChange(listener: (state: ChartInteractionState) => void): () => void;
}
```

- `dispatchInteraction` 只调用 ECharts 的 `dispatchAction`
  （`legendToggleSelect` / `dataZoom` / `legendAllSelect` + `dataZoom` 归零），**不重建实例、
  不改 option、不写 RenderModel**；异常被吞掉（交互失败不得让图表视图崩溃）。
- `getInteractionState` 从 `instance.getOption()` 读取 dataZoom 窗口与 legend `selected`；
  `onInteractionChange` 在 ECharts 的 `datazoom` 与 `legendselectchanged` 事件上通知订阅者。
  这样 canvas 内置滑块/图例与 DOM 工具栏始终是同一份状态，不会各走各的。
- `ChartView` 工具栏提供：每个系列一个 `aria-pressed` 图例按钮、放大/缩小/重置缩放按钮、
  “查看数据表”按钮。全部是原生 `<button>`，可 Tab/Enter/Space 操作；缩放范围以
  `data-chart-zoom-start/end` 暴露给 E2E。
- 缩放窗口与图例选择是**瞬态视图状态**：不写入 `ChartSpec`/manifest、不进入撤销、不跨重启保留
  （与 SPEC §13.2“选择、滚动、活动标签不进入历史”一致）。T4.5 不做“图表与表格选中行联动”。

### 2. 三种空态（无表 / 未映射 / 无数据）

`chartRenderStatus` 的语义不变（`missing-table` / `missing-columns` / `invalid` / `ready`），
视图增加 `data-chart-empty` 作为空态契约：

| 状态 | `data-chart-state` | `data-chart-empty` | 行动按钮 |
|---|---|---|---|
| 数据表已删除 | `missing-table` | `no-table` | “删除图表…”（复用 `DeleteChartDialog`，二次确认、可撤销） |
| 映射缺失/无效/列被删 | `missing-columns` / `invalid` | `unmapped` | “配置映射”（聚焦内嵌 `ChartMappingFields`；映射编辑器始终可见） |
| 可解析但没有点 | `empty`（新值） | `no-data` | “查看数据表”（`openTable(chart.tableId)`） |

- 空模型（`isEmptyModel`）不再渲染空白 canvas，改为空态卡片；`data-chart-*` 的模型摘要属性仍保留。
- 未映射态保留 T4.4 的 `chart-error` 文案与 `chart-remap` 内嵌编辑器，不自动改写映射（SPEC §19）。
- 无数据态不提供“清除筛选”：那会改文档；先让用户到数据表定位原因。

### 3. PNG 导出：同步 `toPNG` + 视图层等待 + 复用 `file:exportText`

- `toPNG` 保持同步契约（ADR-042）；`ChartCanvas` 暴露 `exportPng(options)`：先 flush 120ms
  防抖中待应用的模型，再等两个 `requestAnimationFrame`（无 DOM 时退回 `setTimeout(0)`），
  最后调用 `toPNG`。这满足 SPEC §11.6“导出前等待一次完整渲染”；`animation:false` 使结果确定。
- 导出选项固定在 UI：**2x**、背景透明/白/深（`ChartPngBackground` 的既有三值）；倍率不提供
  UI（SPEC §11.6 规定 2x）。文件名 `<清洗后的标题>-<yyyyMMdd-HHmm>.png`，本地时间；
  清洗规则与 CSV 导出同类（非法字符替换、去掉尾部点/空格、Windows 保留名加 `_`、空标题回退
  `chart`）。
- **IPC 复用 `file:exportText`**：请求增加可选 `encoding: 'utf8' | 'base64'`（缺省 `utf8`）。
  main 在 `base64` 时把内容解码为字节，用同一 `write-file-atomic` 原子写；不新增通道，
  `ALL_IPC_CHANNELS` 仍 20、已实现仍 15，preload 面不变。取消保存对话框返回 `null`，
  UI 不当作错误。
- 导出失败（`toPNG` 失败或 IPC 失败）在对话框内显示；成功显示目标路径。一次只允许一个导出
  任务；导出按钮在空态/错误态禁用。

### 4. 导出入口放在图表视图工具栏（修正 SPEC §11.5 的措辞）

SPEC §11.5 的检查器分组把“导出”与文档属性并列，但渲染器实例由 `ChartCanvas`/`ChartView`
持有，检查器只是 `ChartSpec` 的编辑器。为保持“组件不拼 option、不持有渲染器”的单向结构，
导出入口（按钮 + 背景选择对话框）放在图表视图工具栏；检查器仍是数据/映射/外观/坐标轴四组，
不增加第五个标签，也不引入跨组件的渲染器注册表。SPEC §11.5 已同步这一边界。

### 5. 无障碍摘要与“查看数据表”

- `ChartView` 增加纯函数摘要（`chart-summary.ts`）：`<标题>，<类型>，<N> 条系列，<M> 个点`
  （采样时追加“已采样，原始 K 点”）。摘要放在 canvas 宿主的 `role="img"` `aria-label` 上；
  视图 `<section>` 仍以标题命名，避免重复朗读。
- 工具栏与无数据空态都提供“查看数据表”，调用既有 `WorkspaceActions.openTable(chart.tableId)`；
  不新增命令、不改变图表筛选/排序。
- 图表视图通过 axe（wcag2a/wcag2aa）审计，critical 违规为零；新增按钮都有可读名称。

### 6. toolbox 本地化与 tooltip 的 DOM 契约

- `toEChartsOption` 的 `ChartOptionOptions` 增加 `labels?: { zoom?: string; zoomBack?: string }`，
  映射到 `toolbox.feature.dataZoom.title.zoom/back`；未提供时保持 ECharts 默认值，不改变既有
  option 快照的其余部分。
- `createChartRenderer` 的选项透传同一 `labels`；`ChartCanvas` 用 `useI18n` 的
  `chart.toolbox.zoom/zoomBack` 构造，`chart-echarts` 不硬编码应用文案。
- tooltip 增加稳定的 `className: 'cs-chart-tooltip'`（`renderMode:'html'` 已有），供样式与
  E2E 定位；用户可控文本仍全部经 `escapeHtmlText`。

### 7. 不改变的东西

- 不改 `formatVersion`、manifest 字段、JSONL、`ChartSpec`/`ChartOptions` schema、命令总线、
  `RenderModel` 形状；不新增运行时依赖；不新增 IPC 通道；不改变 `toPNG` 的同步契约。
- 不做 T4.6 的 100k 端到端性能硬化、图表与表格行联动、入场动画、Y 单位。
- 图表筛选/排序、检查器提交粒度与撤销语义沿用 ADR-043。

## 代价

- **DOM 工具栏与 ECharts 内置控件并存**：需要事件同步；极端情况下（ECharts 事件不触发）DOM
  状态可能滞后，下一次交互会以 `getOption()` 的真实状态为准。toolbox 的框选缩放与滑块仍保留，
  不做隐藏。
- **交互状态不持久化**：重开标签页/重启后图例与缩放回到默认（全选、0–100）。这是有意的：
  它们不属于 `ChartSpec`，写 manifest 会产生大量撤销噪声。
- **导出不在检查器**：与 SPEC §11.5 原文的“导出”分组不同，已用本节与 SPEC 边界记录；若未来
  要求检查器内导出，需要引入跨组件的渲染器句柄（新 ADR）。
- **base64 传输**：PNG 体积约 +33%；当前 2x 图表通常 0.3–2MB，远低于 256MB 载荷上限。
  若未来支持 4x/超长画布，需评估分块或新的二进制通道。
- **等待两帧**：导出多约 33ms；换取“刚改完检查器立刻导出”也能包含最新模型。
- **空态行动有限**：无表态只能删除图表（不能换表/重建表）；换表流程未在 T4.4/T4.5 范围。
- **toolbox 标签需在每条渲染路径传入**：向导预览也经 `ChartCanvas`，自动获得相同标签；
  其他直接使用 `chart-echarts` 的调用方不传时仍是英文默认值。

## 影响

- 代码：`packages/chart-echarts/src/{option,renderer}.ts` 与测试/快照；
  `apps/desktop/src/renderer/features/charts/{ChartView,ChartCanvas,chart-view-model,chart-text,
  chart-summary,chart-export,ChartExportDialog}.tsx/ts` 与测试；
  `apps/desktop/src/shared/contracts/ipc.ts`；
  `apps/desktop/src/main/{import/import-files.ts,window/atomic-write.ts,index.ts}` 与测试；
  `apps/desktop/src/renderer/{i18n/messages/*,styles.css}`；`e2e/chart-interaction.spec.ts`、
  `e2e/fixtures.ts`（如需要）。
- 文档：SPEC §11.4/§11.5/§11.6/§15.1 的实现边界；TASKS T4.5；TESTPLAN E6；
  ADR 索引；CHANGELOG、HANDOFF、AGENTS §0、`docs/reports/t4.5/REPORT.md`。
- 快照：`packages/chart-echarts/src/__snapshots__/option.test.ts.snap` 的 6 条 option 快照因
  tooltip `className` **有意更新**（渲染契约新增稳定类名）；RenderModel 快照不变。

## 复核条件

- 若要求图例/缩放跨重启保留或进入撤销：需要把交互状态写入 `ChartSpec`/manifest（先写迁移与
  ADR），不在 v1 范围内。
- 若检查器内必须提供导出：引入 `ChartRuntimeProvider` 共享渲染器句柄并改 SPEC §11.5。
- 若 PNG 需要 1x/4x、尺寸自定义或批量导出：扩展 `ChartPngOptions` 与对话框，并评估 base64
  载荷与分块。
- 若 axe 发现图表画布/空态的 critical 违规：优先修 DOM 语义，不放宽审计范围。
- 若 T4.6 实测交互（缩放/图例/tooltip）在 100k 采样图上超预算：优化 option/事件绑定，不改
  采样与断点语义。
- 若需要“查看数据表”同时高亮图表对应的行/列：需要新的跨视图选择状态（SHOULD，见 SPEC §11.5）。

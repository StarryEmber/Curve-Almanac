# ADR-043 T4.4 的图表命令、检查器、RenderModel 扩展与渲染更新策略

- 状态：已接受
- 日期：2026-10-25
- 相关：SPEC §6.3、§11.1–§11.5、§12、§13.1–§13.2、§16.1；TASKS T4.4；
  ADR-004、ADR-032、ADR-040、ADR-041、ADR-042

## 背景

T4.1–T4.3 交付了 `RenderModel`、LTTB 采样与 ECharts 适配器，但没有任何图表 UI：manifest 里的
`charts` 只能由 IPC 夹具写入，`ChartPlaceholder` 只显示"列已删除"错误，`ChartOptions.yLabel`
被 `RenderModel` 忽略，长表映射在折线图上不可用。T4.4 要补齐图表列表、新建向导、检查器
（数据/映射/外观/坐标轴）与 CRUD/复制/持久化。

SPEC §11.5 规定了表面与 120ms 防抖更新，§13.1 规定了 `chart.create/update/delete` 可撤销，
但没有规定以下实现细节，必须在写代码前裁决，否则 UI、命令与适配器会各自发明一套：

1. 命令载荷；创建时是否同时创建视图；更新是否允许悬空列引用（列删除后的修复路径）。
2. 复制/重命名/打开图表如何复用命令；标题与标签页标题的关系。
3. 图表读取哪些行；是否跟随表格视图的筛选/排序。
4. `ChartOptions.yLabel` 如何进入 `RenderModel`（T4.3 已记录"不在模型里"）。
5. 长表映射的 null 语义：它是"缺失值"还是"共享 X 轴的表达产物"？前者必须断线
   （SPEC §11.2.4），后者必须连线，否则长表折线退化为散点。
6. 检查器控件的提交粒度、错误态与重映射入口；RenderModel 变化如何防抖更新而不重建实例。
7. renderer 首次引入 ECharts 的产物/依赖接线。

## 决定

### 1. 命令面

```ts
chart.create { chart: ChartSpec, view: ViewDef }   // 严格映射校验
chart.update { chart: ChartSpec }                  // 允许悬空映射，便于修复
chart.delete { chartId: string }                   // 级联删除图表视图与 layout 引用
```

- 三条命令都是 **manifest-only**（不写 JSONL），注册进 `MANIFEST_SAVING_COMMANDS` 与
  `WORKSPACE_SCOPED_COMMANDS`：一条命令 = 一条 workspace 作用域撤销记录，undo/redo 走
  `onWorkspaceChanged → enqueueManifest`。
- `chart.create` 在**同一事务**内校验 `chartSpecSchema`、表存在、`validateChartMapping`、
  `validateFilterPredicate`、`validateSortSpecs`，并创建图表 + 首个视图（`kind:'chart'`、
  无 `tableView`、`refId` 指向图表）加入 layout；非法映射不会被持久化（SPEC §11.5）。
- `chart.update` 只校验 schema 与表存在，**不要求映射当前有效**：列被删除后，检查器必须能
  逐步修复 X/Y/系列列与排序；坏图表由视图错误态兜底（SPEC §6.6.4）。命令总是以注入时钟
  刷新 `updatedAt`、保留原 `createdAt`；标题变化时同步该图表所有视图的标题（SPEC §12
  规定同一张图只有一个视图，标签页标题跟随图表标题）。
- `chart.delete` 删除图表、所有引用它的视图与 layout 引用，并重算活动选择。

### 2. 用例层（`WorkspaceActions`）

```ts
createChart(request: ChartCreateRequest): Promise<ActionOutcome<{ chartId; viewId }>>
updateChart(chart: ChartSpec): Promise<ActionOutcome>
deleteChart(chartId: string): Promise<ActionOutcome>
duplicateChart(chartId: string): Promise<ActionOutcome<{ chartId; viewId }>>
openChart(chartId: string): Promise<ActionOutcome<{ viewId; created }>>
```

- 向导只提交 `{ tableId, title, kind, mapping, options?, filter?, sort? }`；id、时间戳与默认值
  在 app-core 生成，组件不拼 `ChartSpec`（AGENTS §5）。
- `DEFAULT_CHART_OPTIONS`：smooth/showSymbol 关闭、lineWidth 2、default 调色板、auto 背景、
  grid/legend on、numberDigits 2、yStartAtZero off、`sampling { enabled, 5000, 2000 }`
  （SPEC §16.1 的 100k 解析+采样预算口径）。
- `duplicateChart` 用 `duplicateChartTitle`（`Sales` → `Sales (2)`）、新 `cht_`/`viw_` 与
  当前时间戳，复用 `chart.create`；复制保留 mapping/filter/sort/options，副本与源各自独立。
  源图表映射悬空时复制会被 `chart.create` 拒绝（见"代价"）。
- `openChart` 优先激活该图表的既有视图；没有标签页时用 `view.create` 重建并写 manifest。
- 三个变更 action 都等待 `saveQueue.flush()`；写盘失败返回 `committed: true`，由状态栏重试。

### 3. 图表数据口径

- 图表读取**该表全部行**（`state.tables[tableId].rows`），行序由图表自身的 `filter`/`sort`
  决定（SPEC §11.2），**不跟随**表格视图的筛选/排序：`ChartSpec` 自带 filter/sort，两者是
  独立视图状态（ADR-008）。
- 检查器"数据"组显示表名与物理行数（以实际行数为准，不信 `rowCount`），复用
  `FilterDialog` 编辑图表筛选，最多 3 级排序（`MAX_SORT_LEVELS`，列唯一）。

### 4. `RenderModel` 扩展（SPEC §11.3）

```ts
interface RenderModel {
  // …
  /** 仅当 ChartOptions.yLabel 去空白后非空时存在（T4.4）。 */
  y?: { label?: string };
  style: {
    // …
    /** 采样图或长表为 true；宽表未采样为 false（T4.4）。 */
    connectNulls: boolean;
  };
}
```

- `chart-model` 填充 `y.label = options.yLabel.trim()`（空串/空白不产生字段）；适配器把它映射为
  `yAxis.name`（`nameLocation:'middle'`、`nameRotate:90`、`nameGap:48`；有 y 名时 `grid.left`
  64→80）。Y 单位仍不在模型里，需要时另写 ADR。
- `chart-model` 计算 `style.connectNulls = sampled === true || mapping.layout === 'long'`：
  - **宽表未采样**：`false`，真实缺失值断开折线（SPEC §11.2.4）。
  - **采样图**：`true`（ADR-042 §3 的既有结论）。
  - **长表**：`true`。长表把"该行属于其它系列"编码为 null，这是共享 X 轴 + 逐系列数组的
    表达产物，不是缺失值；若按未采样策略断线，长表折线会退化为孤立散点（T4.4 的
    "长表系列拆分"验收不成立）。代价是长表自身真实的 null 也会被跨过（与采样图同类）。
- 适配器只读 `style.connectNulls`，不再直接看 `meta.sampled`。
- 为 X 轴名留出空间：`grid.bottom` 56→72，避免轴名被 dataZoom 滑块遮住。
- RenderModel 两条黄金快照与 option 六条黄金快照随上述契约**有意更新**（见报告）。

### 5. 检查器、重映射与提交粒度

- 图表视图激活时，右侧检查器显示 `数据 / 映射 / 外观 / 坐标轴` 四组。
- `ChartMappingFields` 是唯一的映射编辑器，检查器与错误态（"重新映射"）共用：
  只列 `canBeChartX/Y/Series` 兼容列；布局切换用 `buildChartMapping` 生成 schema 合法的映射，
  无法表达的布局置灰；宽表至少保留一个 Y；删除缺失 Y 且它是唯一选择时，自动换成第一个兼容 Y。
- 下拉/复选框一次交互一条 `chart.update`；文本/数字控件在失焦/Enter 提交，非法值内联报错且不提交。
  控件不维护文档副本：store 是唯一真源，命令结果回流后图表重算 RenderModel。
- 每张图表视图把渲染契约暴露为 `data-chart-*`（kind/layout/x 类型与标签、系列名与数量、
  source/rendered points、sampled、palette 首色、背景、图例、网格、平滑、点、线宽、精度、
  Y 从零、Y 标签），供 E2E 断言与 T4.5 的 aria 摘要复用。
- 列被删除后：视图 `data-chart-state="missing-columns"`，显示缺失列 id 与内嵌映射编辑器；
  修复保存后重启仍为 ready；不自动改写映射（SPEC §19）。

### 6. 渲染更新与生命周期

- `ChartCanvas`（唯一挂载点）：首次 RenderModel 调 `renderer.render()`；后续变化经 **120ms
  防抖** 调 `renderer.update()`（`setOption` merge + ADR-042 的 `replaceMerge`），从不重建实例；
  `ResizeObserver` → `resize()`；卸载必 `dispose()`；适配器错误显示内联 alert。
- `renderer` 可通过 prop 注入（仅测试），生产使用 `createChartRenderer({ locale })`；
  locale 变化重建渲染器并用最新模型重挂载。
- 空模型（无系列/无点）由适配器处理（不创建实例），视图显示空态提示；缺失表/图表显示错误态。

### 7. 入口与联动

- 侧栏"图表"标签：列表（新建/复制/重命名/删除）+ 点击打开；复制后新视图成为活动标签；
  删除有二次确认，文案说明可 Ctrl+Z 撤销。
- 新建向导是单个模态框：选表 → 类型/名称 → 映射与列（兼容列选择器）→ 右侧实时预览 →
  创建；映射不完整或非法时创建按钮禁用。
- 图表标签与图表标题同步（`chart.update` 内），一个图表一个视图；关闭标签不删除图表。

### 8. 依赖与产物

- `apps/desktop` 新增 workspace 依赖 `@curve/chart-model`、`@curve/chart-echarts` 与
  `tsconfig.web.json` project references；**不新增第三方运行时依赖**，`echarts` 仍只被
  `chart-echarts` import（depcruise 规则不变）。
- renderer 产物从 T4.3 的 1,618.04 kB 增至 **3,209.97 kB**，CSS 64.03 → **70.66 kB**；
  按需注册的 ECharts 子集进入主 chunk，T6.4 评估拆包/懒加载。

### 9. 不改变的东西

- 不改 `formatVersion`、manifest 字段、JSONL、IPC/preload/CSP、`ChartSpec`/`ChartOptions`
  schema、命令总线契约、`RenderModel` 的既有字段语义。
- 适配器仍不读表/Store、不采样；T4.1/T4.2 的映射/采样规则不变。

## 代价

- **长表跨过真实缺口**：与采样图同类（ADR-041 已接受的代价）；要区分需要结构化 gap 或
  per-series x（新 ADR）。
- **命令层允许悬空映射**：`chart.update` 无法阻止"坏图表"落盘，靠视图错误态与检查器提示兜底；
  复制一张坏图表会失败（`E_VALIDATION`），必须先修复。
- **Y 轴名单一**：宽表多个 Y 列共享一个轴名；Y 单位仍缺失。
- **提交粒度**：每次提交都 flush manifest（小文件），快速连续操作产生多条撤销记录；
  批量合并留 T5.2。
- **全表解析**：图表按全表行解析，编辑 100k 表后切换/修改图表仍有解析成本；T4.6 优化。
- **bundle 增长**：主 chunk 增加约 1.6MB（未压缩、未拆包），启动/内存影响由 T4.6/T6.4 量化。
- **data-chart-\***：属性随检查器项增加，是渲染契约摘要，不是持久化字段。

## 影响

- 代码：`packages/app-core/src/commands/charts.ts`、`app-core.ts`、
  `history/edit-history.ts`、`usecases/workspace-actions.ts`、`index.ts`；
  `packages/chart-model/src/render-model.ts`；`packages/chart-echarts/src/option.ts`；
  `apps/desktop/src/renderer/features/charts/*`、`shell/{Sidebar,Inspector}.tsx`、
  `features/workspace/WorkspaceView.tsx`、`i18n/messages/*`、`styles.css`；
  `packages/ui/src/Select.tsx`（option `disabled`）；`e2e/chart.spec.ts`、`e2e/schema.spec.ts`。
- 文档：SPEC §11.2/§11.3/§11.4/§11.5/§13.1/§13.2 的实现边界；TASKS T4.4；ADR 索引；
  CHANGELOG、HANDOFF、AGENTS §0、`docs/reports/t4.4/REPORT.md`。
- 快照：`packages/chart-model/src/__snapshots__/render-model.test.ts.snap`（+`connectNulls`）与
  `packages/chart-echarts/src/__snapshots__/option.test.ts.snap`（`connectNulls`、
  `grid.bottom=72`）；均为有意契约变更，已在报告中逐项说明。

## 复核条件

- 若要求长表/采样图仍显示真实缺口：引入结构化 gap（`RenderModel` 新字段）或 per-series x，
  先写 ADR（ADR-041 复核条件）。
- 若要求 Y 单位、多 Y 轴或逐系列轴名：扩展 `RenderModel`/`ChartOptions` 并写 ADR。
- 若检查器需要批量提交、撤销合并或跟随表格筛选：改 SPEC §11.2/§11.5 与历史口径（T5.2）。
- 若图表应能在表/映射之外改 `tableId`：在检查器加"换表"流程并补命令校验。
- 若主 bundle 影响冷启动/内存门禁：T6.4 将图表视图与 `chart-echarts` 改为动态 import。
- 若复制/重命名需要独立命令或独立标题字段：先改 SPEC §13.1 与 manifest（需迁移）。

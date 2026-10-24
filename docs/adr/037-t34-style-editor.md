# ADR-037 T3.4 的样式编辑器、懒 fork、预览与提交粒度

- 状态：已接受
- 日期：2026-10-24
- 相关：SPEC §10.5、§10.6、§13.1、§13.2、§16.1；TASKS T3.4；ADR-034、ADR-035、ADR-036

## 背景

T3.1 建立了 `TableStyle` 模型与内置模板，T3.2 建立了 CSS 变量渲染管线，T3.3 建立了条件
规则求值器与 `style.update`。但用户仍无法编辑样式：没有模板/令牌/列覆盖/规则表单，没有
样式预览，也没有“编辑内置模板”的写路径。

TASKS T3.4 要求检查器面板、前 50 行实时预览、非法值拦截、一次控件提交一条撤销、纯键盘
可完成“改密度 + 加一条规则”。实现前有四个歧义：

1. **内置模板如何进入 manifest**：`style.update` 只接受已存在的 `sty_` 样式，不能凭空创建；
   若先 `view.update` 再 `style.update`，会产生两条命令、两次撤销，且 undo 可能留下悬空引用。
2. **编辑器放在哪里**：检查器只有 168–260px，放不下四组表单和可读的 50 行预览。
3. **“实时预览”和“一次控件提交一条撤销”如何并存**：每个像素都发命令会污染历史；只按
   “保存”发命令又达不到 100ms 预览。
4. **规则构建器的复杂度**：需要 all/any 最多两层、number/date `contains`，但已有
   `style.update` 只校验 schema，不负责表单值归一。

## 决定

### 1. 检查器入口 + 宽对话框编辑面

- 检查器新增“列 / 样式”两个标签，默认仍是列管理；样式标签显示当前解析后的模板、密度、
  规则/覆盖数量、回退警告和“编辑样式”按钮。
- 编辑器本身是一个宽对话框（`cs-style-editor-dialog`），内部左侧四组标签（令牌、模板、
  列覆盖、条件规则），右侧为真实渲染管线的预览。原因是 260px 检查器无法同时容纳表单与
  可读网格；对话框仍由检查器打开，且具备焦点陷阱/Esc/焦点恢复。
- 宽度 `min(1180px, 100vw - 32px)`；≤1000px 时上下堆叠，200% 缩放下表单与预览仍可键盘操作。

### 2. 懒 fork：新增原子 `style.create`

新增 `style.create { style, viewId? }` 命令：

- 只接受 `sty_`、`builtin: false`、规则 id 唯一的用户样式；
- `tableStyles[id]` 已存在、`viewId` 不存在或不是表视图时以 `E_VALIDATION` 拒绝；
- 在同一 Immer 事务内写入 `tableStyles`，可选地把 `view.tableView.styleId` 指向新样式，
  并更新 workspace `updatedAt`；
- 仍是 manifest-only，不需要写表 JSONL。

编辑器打开内置模板时只在本地 `forkTableStyle` 生成草稿，**不立即写盘**。第一次提交控件时
才调用 `style.create(..., viewId)`；如果用户只是查看后取消，不会产生样式、视图引用或历史。
创建后同一对话框中的后续提交走 `style.update`，不再重复创建。内置常量始终不变。

`style.create` 与 `style.update` 都进入 workspace 作用域历史（`tableId: null`），
`SaveQueue.enqueueManifest` 串行落盘。因此“第一次改内置模板”是一个命令、一条撤销记录，
undo 同时移除样式并把视图还原到内置模板。

### 3. 本地草稿与提交粒度

- 编辑器状态是本地 `TableStyle` 草稿；文本/数字/颜色输入在每次**合法**输入时更新草稿，
  预览立即重渲染；失焦或 Enter 才发命令。
- 下拉框/复选框一次交互发一条命令；规则表单的“保存规则”是一条命令，规则列表中的启用
  开关与删除也各是一条命令。
- 提交前统一跑 `tableStyleSchema.safeParse`；非法值由字段内联错误阻止更新/提交，任何字段
  错误都会禁用“完成”，不会把最后一个合法值静默写盘。
- 提交用序列化签名去重：相同草稿不会重复发命令；队列串行，避免多个控件快速提交时
  `style.create` 与 `style.update` 竞态。
- 颜色支持十六进制文本与原生取色器；取色器拖动只更新本地草稿，失焦提交。颜色 schema
  仍是 ADR-034 的 `#RGB/#RGBA/#RRGGBB/#RRGGBBAA`。
- 修改密度会同步 SPEC §10.2 的标准垂直内边距（compact 4 / normal 7 / comfortable 10），
  使“改密度”得到可预期的行高；用户仍可随后单独调整内边距。

### 4. 预览复用真实渲染管线

- 预览使用**当前表物理前 50 行**（不是筛选后的可见行），列顺序/隐藏列/宽度仍取当前视图。
- 渲染使用 `TableStyleProvider`、`GridCell`、`presentStyledCell`、`createConditionalFormat`、
  `computeBarRanges`，与主网格共享同一套格式化/条件/bar/badge 逻辑；不复制第二套渲染器。
- 预览单元格使用 `preview-cell-*` test id，避免与主网格的 `grid-cell-*` 冲突；行高/斑马纹/
  选中/条件优先级都由同一 CSS 变量与 `GridCell` 决定。
- 预览不挂载 `DataGrid` 的编辑器、筛选/排序工具栏和虚拟滚动；只渲染 50 行，避免把主网格
  的查询 Worker、选择状态和键盘命令带进编辑器。
- 编辑器在布局阶段测量“草稿变更 → 预览提交渲染”的耗时，通过 `data-preview-ms` 暴露给
  E2E；预算仍按 SPEC §16.1 的 100ms。实测 3ms，不新增生产性能门禁。

### 5. 规则构建器归属与两层上限

- `@curve/app-core` 新增 `condition-builder.ts`：表单草稿（字符串/组）↔ `FilterPredicate`
  的转换、`conditionCompareOps` 校验、`coerceCell` 值归一、两层 all/any 构建。
- UI 只渲染草稿和 issue；构建失败不提交。单组会拍平为一层谓词，多组生成根 all/any +
  子组谓词，最多 2 个组（避免 UI 无限嵌套）。
- 操作符列表一律用 `conditionCompareOps`（number/date 含 `contains`），不复用过滤器的
  `allowedCompareOps`；规则谓词超过两层、引用缺失列或含不支持操作符时保持只读，禁止
  静默改写。
- 目标支持整行/指定列；样式只允许 background/foreground/bold/italic/icon，与 T3.3 模型一致。
- 规则按数组顺序保存；新规则追加到末尾，首条命中语义不变。

### 6. 撤销、保存与范围

- `style.create`/`style.update` 都进入 workspace 历史；一次控件提交一条记录。撤销/重做只
  改内存并调用 `enqueueManifest`，不标记脏表。
- 提交 action 等待保存队列 flush；保存失败返回 `committed: true`，UI 保留内存修改并显示
  错误，不重复 dispatch。
- T3.4 不实现模板另存/重命名/复制/删除/设为默认/导入导出；这些留给 T3.5。编辑器中的
  “模板”只影响尚未创建的草稿，或展示当前自定义样式的来源。
- 不改变 `formatVersion`、JSONL、manifest 字段、IPC、preload、CSP、沙箱或运行时依赖。

## 代价

- 检查器不再只有列面板；新增“样式”标签，宽度较窄时标签会换行。样式编辑器是模态对话框，
  不能一边看主网格一边编辑；预览已承担实时反馈。
- 内置模板的第一次修改会生成 `sty_` 副本，之后工作区中会存在用户样式；T3.5 才提供删除/
  重命名/设为默认等管理能力。用户取消时不会产生副本。
- 文本输入在合法时即更新草稿，但命令只在失焦/Enter 发出；如果用户输入后直接按 Esc，
  未提交的本地值会被丢弃。这是“取消即丢弃”的一致语义。
- 密度与垂直内边距联动；自定义内边距不会被记住为密度预设，下一次切换密度会覆盖它。
- 规则编辑器最多 2 个组；已有更深谓词只读。T3.5 导入的复杂模板不会在 T3.4 中被改写。
- 预览只显示 50 行，不能验证虚拟滚动/100k 行下的样式；主网格的虚拟化路径保持不变。
- 预览的 100ms 由一次 E2E 自测（3ms）与组件测试覆盖，不是 bench 硬门禁。

## 影响

- `@curve/app-core`：新增 `commands/styles.ts` 的 `createStyleCreateCommand`、
  `validation/condition-builder.ts`，导出并在 `app-core.ts` 注册/加入 manifest 保存集合；
  `EditHistory` 识别 `style.create`；`WorkspaceActions.createTableStyle`。
- `apps/desktop`：新增 `features/style/{StylePanel,StyleEditorDialog,StylePreview,StyleTokensTab,
  StyleColumnsTab,StyleRulesTab,StyleFieldControls,style-text}.tsx/ts`；`Inspector` 增加
  列/样式标签；`GridCell` 增加 preview test-id 前缀；`styles.css` 增加编辑器/预览样式；
  i18n 增加样式文案；`e2e/style.spec.ts` 增加键盘/撤销/200%/截图流程。
- `docs`：SPEC §10.5/§10.6/§13.1/§13.2/§16.1、TASKS T3.4、CHANGELOG、HANDOFF、
  `docs/reports/t3.4/REPORT.md` 与 2 张截图。
- 不改变 `formatVersion`、JSONL、manifest 字段、IPC、preload、CSP、沙箱或运行时依赖。

## 复核条件

- 若要求样式编辑器非模态、可同时操作主网格，需要重做布局并评估焦点/撤销冲突。
- 若要求一次修改多个令牌后才生成一条撤销（批量应用），需要重新定义“控件提交”语义，
  并可能引入显式 Apply 按钮；当前逐控件提交是 SPEC §10.6 的字面实现。
- 若要求预览使用筛选后的前 50 行，需要明确“当前表”口径并更新 E2E；当前按物理前 50 行。
- 若要求规则构建器支持三层以上、or/and 混合任意深度，需要扩展 `condition-builder` 与表单
  模型，并重新评估 50 条规则编辑的性能/可读性。
- T3.5 必须复用 `style.create`/`style.update` 与 `forkTableStyle`，不得另起样式写盘路径；
  模板 CRUD/导入导出仍需新的 ADR 或本 ADR 的补充。

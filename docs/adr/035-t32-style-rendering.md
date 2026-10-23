# ADR-035 T3.2 的样式渲染管线、数字格式归属与视觉验证

- 状态：已接受
- 日期：2026-10-23
- 相关：SPEC §6.4、§10.1、§10.2、§10.3、§16.1；T3.2；ADR-034、ADR-033、ADR-008

## 背景

T3.1 已经交付 `TableStyle` 的模型基础，但网格仍在消费应用主题令牌：行高固定 32、表头/单元格
颜色来自 `--cs-color-*`、数字用 `formatCellValue` 的基线、列覆盖和 `bar`/`badge` 尚未接线。
T3.2 必须把样式真正渲染出来，同时回答 ADR-034 留下的问题：`builtin.finance` 的数字右对齐/
千分位由谁表达。

用户确认采用“全局数字规则”：所有数字列右对齐并使用 `Intl.NumberFormat` 千分位，不扩展
`TableStyleTokens`。这样既满足 finance 的 SPEC 特征，又避免为一个模板新增 manifest 字段、迁移
与 T3.4 编辑器控件。

## 决定

### 1. 单一转换点与样式表面

- `@curve/ui` 的 `styleToCssVars(style)` 把 `TableStyle` 映射为完整的 20 个 `--cs-table-*`
  变量；`TABLE_STYLE_CSS_VARIABLES` 是变量契约，`apps/desktop/test/ui-conventions.test.ts`
  校验样式表只消费这张表里的变量。
- `TableStyleProvider` 直接渲染网格的 `<section>`，设置变量与 `data-table-style={id}`；网格
  CSS 只读变量，组件源码不出现颜色字面量。
- 工具栏、滚动区与选择状态栏属于表格表面：工具栏把 `--cs-color-fg-*` / `--cs-color-bg-*` /
  `--cs-color-border-*` 局部重映射到 `header` 令牌，使深色/财务模板不会出现浅色孤岛；滚动条
  轨道与选择栏使用 `body` 令牌。
- 不新增运行时依赖，不改变 `formatVersion`、JSONL、manifest 字段、IPC 或 preload。

### 2. 行高与密度

- 密度基线（SPEC §10.2）：compact 24、normal 32、comfortable 40。
- 行高 = `max(密度基线, ceil(fontSize × 1.25) + 2 × cellPaddingY)`。内置模板仍精确得到
  24/32/40；编辑器允许的更大字号/内边距会导致行高增长而不是裁切内容。
- 虚拟化仍使用统一行高，`DataGrid` 把 `tableRowHeight(tokens)` 传给 `useVirtualizer`、
  PageUp/PageDown 与行内联高度；不改为动态测量，避免破坏 100k 首帧预算。

### 3. 格式化管线

- `@curve/domain` 的 `formatCellValue` 保持为无样式基线（CSV 导出/其他调用方继续使用）。
- `@curve/ui` 新增 `formatStyledCellValue(value, column, style, options)`：
  - 数字：`Intl.NumberFormat`，开启分组；小数位取 `columnOverride.numberFormat.digits`，否则
    取 `column.precision`；两者都没有时保留原始精度（最多 20 位）。支持
    `decimal`/`percent`/`currency`；非法或缺失的 currency 回退为 decimal，渲染不抛异常。
  - 日期：复用 `formatCellValue`，`dateFormat` 取列覆盖或默认 `date`；locale 来自 i18n。
  - 布尔：使用消息表的 `grid.editor.true`/`grid.editor.false`，zh-CN 显示“是/否”。
  - 枚举：显示 `enumOptions.label`，未知值保留原字符串。
- 数字与日期列默认右对齐；其他类型左对齐；`ColumnStyleOverride.align` 可覆盖。
- 数字分组对所有模板生效（用户确认），因此 report-light 的 `1234.5` 也显示为 `1,234.5`；
  这是显示层变化，不改变模型或磁盘数据。

### 4. 列覆盖与宽度优先级

- 有效列宽：`tableView.widths[columnId]` > `columnOverrides[columnId].width` >
  `ColumnDef.width` > 160。用户拖拽/自适应写入视图宽度后，视图状态优先；样式宽度只作为
  未显式设置宽度时的模板默认值。
- `columnOverrides[columnId].label` 只影响表头显示、排序菜单和无障碍文本，不写回
  `ColumnDef`；切换视图/样式后其他视图仍显示列定义中的 label。
- `cellRender`：`auto` 对 enum 使用 badge、其他类型使用 text；`badge` 仅 enum 生效，
  `bar` 仅 number 生效，不兼容组合回退 text，不报错。

### 5. bar 与 badge

- `computeBarRanges(rows, columns, style)` 只在存在 `bar` 覆盖时扫描当前可见行（筛选/排序后的
  `rows`），返回每列 min/max；`DataGrid` 用 `useMemo` 按 `rows`/`style` 缓存。全等值区间
  渲染 0 宽条；非数字/NaN/Infinity 不画条；比例夹在 0..1。
- badge 不新增调色板模型：枚举值经 FNV-1a 哈希到 4 个 tone，tone 的背景/前景复用样式自身的
  header、selection、alternate/body 四组令牌；T3.1 已覆盖这些组合的 WCAG AA 对比度。

### 6. 视觉验证

- `packages/ui` 用纯函数测试覆盖 20 个变量、四模板差异、密度/网格/斑马纹、格式化、覆盖、
  bar/badge；`TableStyleProvider` 组件测试覆盖变量应用与令牌改动即时重渲染。
- `apps/desktop/e2e/style.spec.ts` 用真实 Electron 网格 seed 1 张表 + 5 个视图（4 个内置模板
  + 1 个持久化用户样式），断言计算后的颜色、行高、字族、对齐、数字/日期/布尔/枚举文本、
  列覆盖宽度/标签、badge/bar 与“切回其他视图不受影响”；每个模板 attach 一张网格截图到
  `docs/reports/t3.2/`。
- 不提交 PNG 像素基线：仓库既有策略是“E2E 截图证据字节不稳定，断言不依赖像素”
  （HANDOFF §3.6），像素基线会在不同 DPI/字体渲染的 runner 上误报。视觉验收以计算样式
  契约 + 截图证据为准。

## 代价

- 所有数字都显示千分位，改变了 T2.x 的纯 `String(value)` 显示；需要接受这一显示层变化。
- 布尔单元格从 `true/false` 改为本地化“是/否”；E2E 的 T2.2 断言同步更新。
- 工具栏跟随表头配色后，表格样式的视觉边界扩展到工具栏；内置深色模板在浅色应用主题下会
  形成一块深色表面，这是“显式配色、不随主题反转”的直接结果。
- 行高仍由密度和字体/内边距推导，而不是逐行测量；极端自定义字体（行框与 1.25 行高差异大）
  可能仍需 T3.4 的布局反馈，但不会破坏默认模板。
- 样式变量在每次渲染时重算；20 个字符串属性成本可忽略，bar 扫描只在启用 bar 时发生。

## 影响

- `@curve/ui`：新增 `table-style.ts`、`TableStyleProvider.tsx`、`table-style-format.ts` 及
  对应测试；`index.ts` 导出；`tokens.css` 注释更新；`package.json` 增加
  `@curve/domain` workspace 依赖；`tsconfig.json` 增加 domain 项目引用。
- `apps/desktop`：`WorkspaceView` 通过 `resolveStyle(view.tableView.styleId, tableStyles)`
  解析样式；`DataGrid`/`GridCell`/`GridHeader`/`grid-sizing` 消费变量与格式化管线；
  `styles.css` 网格段改为 `--cs-table-*`；`ui-conventions.test.ts` 增加表变量校验；
  `e2e/style.spec.ts` 新增；`e2e/edit.spec.ts` 的布尔文案更新。
- `docs`：SPEC §10.2/§10.3 实现边界、TASKS T3.2、ADR 索引、HANDOFF、T3.2 报告与截图。
- 不改变 `formatVersion`、JSONL、manifest 字段、IPC、preload、CSP、沙箱或运行时依赖。

## 复核条件

- 若后续要求“仅 finance 千分位/右对齐”，需要扩展 `TableStyleTokens` 并写新 ADR，重新评估
  schema、迁移与 T3.4 编辑器；不得在渲染层按 style id 特判。
- 若布局需要逐行高度（例如富文本/多行单元格），需要重新评估虚拟化与 100k 首帧预算。
- 若引入像素快照，先确认 Windows CI 的 DPI/字体一致性与基线维护成本。
- T3.3 接入条件格式时，必须复用本 ADR 的 `presentStyledCell`/`GridCell` 渲染路径，不能另起
  一套样式逻辑。

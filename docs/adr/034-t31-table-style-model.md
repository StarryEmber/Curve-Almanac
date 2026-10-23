# ADR-034 T3.1 的表格样式模型、内置模板与 fork 语义

- 状态：已接受
- 日期：2026-10-23
- 相关：SPEC §6.4、§6.6.6、§10.1、§10.3、§10.5；T3.1；ADR-007、ADR-008、ADR-009、ADR-029

## 背景

`TableStyle` 的结构在 T1.1 已由 `types.ts`/`schemas.ts` 定义，但缺少内置模板、默认值、
样式解析与 fork 语义；颜色字段当时只校验“非空字符串”，无法满足 T3.1 的“非法颜色被拒绝”。
T3.1 是纯 domain 任务：为 T3.2 的渲染管线、T3.3 的条件格式、T3.4 的编辑器与 T3.5 的模板管理
提供稳定、可校验、不可变的模型基础。

## 决定

### 1. 内置模板是冻结的 domain 常量

- 4 个稳定 id：`builtin.report-light`、`builtin.compact-light`、`builtin.dark`、
  `builtin.finance`；默认 `builtin.report-light`。
- 模板定义在 `@curve/domain` 的 `table-style.ts`，`builtin: true`，深度冻结；
  不写入 `manifest.tableStyles`（SPEC §6.6.6）。
- 令牌取值按 SPEC §10.3 的特征落地：
  - report-light：白底、`grid: horizontal`、深灰表头、`density: normal`（行高 32）；
  - compact-light：`density: compact`（行高 24）、`grid: horizontal`（无竖线）、12px 字体；
  - dark：`#1e1e1e` 底、`#d4d4d4` 字、弱边框；
  - finance：等宽字体栈、`zebra: true`、财务色表头；数字右对齐与千分位由 T3.2 的格式化
    管线按列类型实现（现有 `TableStyleTokens` 没有“全局数字格式”字段，T3.1 不擅自扩展模型）。
- 模板 `name` 是中文规范名（与 SPEC 表一致），作为无 i18n 上下文时的回退标签；T3.4/T3.5
  的模板列表必须按 id 走 `t(key)` 本地化，不得直接依赖该字符串。

### 2. `resolveStyle` 返回结构化回退结果

```ts
resolveStyle(styleId: string, userStyles?: readonly TableStyle[]): {
  style: TableStyle;
  fallback: boolean;
  warning?: string;
};
```

- 内置 id → 对应冻结模板；`sty_` id → 传入的用户样式；
- 未知 id（包括未知 `builtin.*`）→ `builtin.report-light`，`fallback: true`，并返回
  `warning`；
- `invariants.ts` 复用同一个 warning 文案，视图 `styleId` 与工作区
  `settings.defaultTableStyleId` 都在加载时告警而非阻断（SPEC §6.6.6）。
- 用户样式只按 id 匹配，不在 resolver 内做第二次 Zod 校验（加载边界已校验）。

### 3. fork 语义：深拷贝、重新分配 `sty_` id、内置不变

```ts
forkTableStyle(style: TableStyle, options?: { name?: string; uuid?: UuidFactory }): TableStyle
```

- 新 id 为 `sty_<uuid>`，`builtin: false`；名称默认 `${name} (2)`；
- 深拷贝 `tokens`、`columnOverrides`、`conditionalRules`（含嵌套 `FilterPredicate`），
  后续编辑副本不会修改源模板或冻结的内置常量；
- 条件规则 id 保留：规则 id 在样式内唯一，跨样式复制不构成持久化冲突；T3.5 的导入/复制
  若需要重新分配，再在该任务统一处理，T3.1 不提前引入规则 id 工厂。

### 4. 颜色与数值校验

- 颜色字段只接受十六进制：`#RGB`、`#RGBA`、`#RRGGBB`、`#RRGGBBAA`（大小写均可）。
  `rgb()`、颜色关键字、空串、长度错误均被 Zod 拒绝；与 SPEC §10.6 的“颜色输入支持 hex
  与取色器”一致。
- 现有数值范围（fontSize 11–18、radius 0–12、cellPaddingX 4–24、cellPaddingY 2–16、
  width 80–800、numberFormat.digits 0–10）保持不变，并补测试。
- `TableStyle` 仍使用现有 `formatVersion: 1` 与 manifest 字段，不新增迁移。

### 5. 默认值集中到 domain

- `DEFAULT_TABLE_STYLE_ID`、`DEFAULT_TABLE_STYLE`、`DEFAULT_TABLE_STYLE_TOKENS` 由 domain
  导出；`@curve/persistence` 的 `createEmptyManifest` 与 `@curve/app-core` 的新表/打开表命令
  改为引用同一常量，避免三处字符串漂移。
- `createTableStyle` 提供“从默认令牌创建用户样式”的最小工厂（名称 + 可选 id/uuid/令牌/
  覆盖/规则），默认 `builtin: false`；T3.4/T3.5 可复用它完成“另存为/复制”。

### 6. 不变量

- `tableStyles[].id` 唯一、不得以 `builtin.` 开头，且 `builtin` 必须为 `false`；
- 同一 `TableStyle` 内条件规则 id 不得重复；
- 视图 `styleId` 与工作区默认 `defaultTableStyleId` 必须可解析，否则回退默认并 warning；
- `columnOverrides`/条件规则中的列引用允许悬空（SPEC §6.6.7，跨表模板），T3.1 不报错。

## 代价

- 颜色只接受 hex，拒绝 `transparent`、CSS 变量与颜色关键字；如未来需要，另写 ADR 并放宽
  schema。
- `builtin.finance` 的数字对齐/千分位无法仅靠 `TableStyleTokens` 表达，依赖 T3.2 的默认
  数字格式化；若 T3.2 需要“样式级数字格式”，必须扩展模型并写 ADR。
- 内置名称是中文回退标签，en-US 的最终展示依赖 T3.4/T3.5 按 id 本地化。
- fork 保留规则 id；跨样式复制后规则 id 可能重复，但在当前“规则只在所属样式内求值”的模型
  下不构成冲突。

## 影响

- `@curve/domain`：新增 `table-style.ts` 与导出；`schemas.ts` 的 `colorSchema` 改为 hex 校验；
  `invariants.ts` 增加默认样式/内置标记/重复规则检查。
- `@curve/persistence`、`@curve/app-core`：删除本地默认样式字符串，改为导入 domain 常量。
- 不改变 `formatVersion`、JSONL、manifest 字段、IPC、preload、CSP 或运行时依赖。

## 复核条件

- T3.2：确认数字右对齐/千分位/等宽数字的最终归属；若必须由模板表达，扩展 `TableStyleTokens`
  并更新 SPEC/ADR。
- T3.4/T3.5：确认内置模板名称的本地化 key 与规则 id 的重新分配策略；若模板导入需要保留
  规则 id 之外的引用，补充契约。
- 若未来允许非 hex 颜色或 CSS 变量，重新评估颜色 schema 与安全边界。

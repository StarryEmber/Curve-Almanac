# ADR-036 T3.3 的条件求值器归属、比较语义、样式优先级与撤销

- 状态：已接受
- 日期：2026-10-24
- 相关：SPEC §6.4、§10.4、§13.1、§13.2、§16.1；TASKS T3.3；ADR-009、ADR-032、ADR-033、ADR-034、ADR-035

## 背景

T3.1 已把 `TableStyle.conditionalRules` 纳入模型，T3.2 已建立样式渲染管线，但规则从未
被求值：`TableStyleProvider` 只消费 tokens/overrides，`GridCell` 只画 align/render/bar/badge。
T3.3 要交付条件格式引擎，并回答开工前确认的四个歧义，以及阅读代码时新发现的第五个：

1. `FilterPredicate` 的求值器在 `@curve/table-engine`，而依赖方向是
   `domain ← table-engine`；TASKS 要求 `packages/domain` 的纯函数 `evaluateRules`，domain
   不能反向 import table-engine。
2. 验收要求“规则编辑可撤销”，但现有最小历史只记录 `table.cell.set/paste/import`，样式是
   workspace 级文档，没有 `tableId`。
3. SPEC §10.4 只定义规则间“首条命中”，没有定义条件样式与选中/错误/冲突/bar/斑马纹的优先级。
4. 50 条规则 × 100 行 ≤ 16ms 是纯求值还是含 DOM 应用，基准放在哪一层。
5. SPEC §10.4 规定 number/date 的 `contains` 按字符串化后不区分大小写，但现有
   `matchesCompare` 对非 text 列直接返回 `false`，过滤器操作符白名单也不提供该组合。

用户在开工前明确选择：共享语义下沉 domain、number/date `contains` 按 SPEC 只对条件规则
开放、`style.update` 可撤销、条件样式接线到 `GridCell`、16ms 作为 bench 硬门禁。

## 决定

### 1. 比较语义下沉 `@curve/domain`，table-engine 只保留查询上下文

- 新增 `packages/domain/src/predicate.ts`：
  - `allowedCompareOps`/`compareOpNeedsValue`/`compareOpNeedsSecondValue` 的唯一定义；
  - `conditionCompareOps`：条件规则的超集白名单（number/date 增加 `contains`）；
  - `prepareComparison(column, predicate, { locale, mode })` 与
    `matchesPreparedComparison(cell, prepared)`：12 种操作符、空值、大小写归一、
    `between` 含边界与交换边界、类型不匹配返回 `false`。
- `@curve/table-engine` 的 `QueryContext`、`compareCache`、排序计划与 Worker 协议保持原位；
  `matchesCompare` 改为调用 domain 原语。`allowedCompareOps` 等继续从 table-engine 导出，
  现有调用方（filter builder、FilterDialog、测试）不需要改 import。
- 不复制第二套比较逻辑；属性由 domain 单测与 table-engine 既有 29 条 query 测试共同约束。

### 2. 条件求值器：一次准备，按行/单元格解析

`packages/domain/src/condition.ts` 提供：

```ts
createConditionalFormat(rules, columns, { locale? }): ConditionalFormat
ConditionalFormat.evaluateRules(row): ConditionalRuleMatch | null
ConditionalFormat.evaluateRow(row): RowConditionalFormat
evaluateRules(rules, row, columns, options?): ConditionalRuleMatch | null
```

- 准备阶段解析列索引、事件谓词（`all/any` 递归）、目标列，并缓存比较 needle；渲染循环只
  对可见行调用 `evaluateRow`，不再逐行查列或归一化字符串。
- 规则按数组顺序求值，首条命中生效，不做样式叠加；禁用规则在准备阶段丢弃。
- 行目标规则覆盖整行；单元格目标规则只覆盖目标列。对某个单元格，取“最早匹配的行规则”与
  “最早匹配的该列单元格规则”中数组下标较小者，因此顺序语义在混合目标下仍然成立。
- 缺失列按 SPEC §6.6.7/§10.5 忽略：谓词分支引用的列不存在时丢弃该分支；分支全部被丢弃时
  该规则永不命中（避免空 `all` 被当作 true）。单元格目标列不存在时整条规则不适用。
- 空值与类型不匹配一律返回 `false`，不抛异常；`isNull` 仍匹配 `null` 与 text `''`。

### 3. number/date `contains` 只在条件模式生效

- `CompareMode = 'filter' | 'condition'`；`mode` 随 `PreparedComparison` 保存。
- `condition` 模式下，number/date 的 `contains` 将单元格与比较值都 `String(...)` 后按
  locale 不区分大小写包含；`startsWith`/`endsWith` 仍只对 text 生效。
- `filter` 模式行为完全不变：number/date 的 `contains` 仍然不匹配，过滤器 UI 白名单也不
  暴露它。这样既满足 SPEC §10.4，又不改变 T2.6 的筛选契约。
- 日期按原始 epoch 字符串比较（`String(epochMs)`），这是“字符串化”的字面实现；若未来要
  按显示格式匹配日期，需要新 ADR 并明确 locale/时区。

### 4. `style.update`：manifest-only、可撤销

- 新增 `packages/app-core/src/commands/styles.ts` 的 `style.update`（SPEC §13.1 已列出
  `style.create/update/delete/apply`）：
  - 载荷 `{ style: TableStyle }`，用 `tableStyleSchema` 校验；
  - 只允许 `sty_` 用户样式；`builtin.*`、不存在的样式、重复规则 id 都被拒绝；
  - 只替换 `state.tableStyles[id]` 并更新 workspace `updatedAt`，不写 JSONL。
- `SaveQueue` 新增 `enqueueManifest()`：串行队列增加 manifest-only 任务，失败可 `retry`，
  `flush` 同时等待表与 manifest；表保存产生的 manifest 写入会吞掉同版本的 manifest 任务，
  写盘期间新到的样式变更会再写一次。
- `EditHistory` 条目 `tableId` 允许为 `null`（workspace 作用域）；`style.update` 入历史，
  undo/redo 通过 `onWorkspaceChanged` 入队 manifest，不标记脏表。
- `WorkspaceActions.updateTableStyle(style)`：dispatch → `saveQueue.flush()`；保存失败返回
  `committed: true`，与 T2.4/T2.5 的语义一致。T3.4 的编辑器直接复用该命令，不另起写盘路径。

### 5. 渲染优先级与呈现

- 优先级（从高到低）：**错误/冲突/粘贴错误 > 选中 > 条件规则（首条） > bar > 斑马纹/基础**。
  `GridCell` 只在没有选中/错误/冲突/粘贴错误时应用条件样式；因此现有 `.cs-grid__cell--selected`
  与 danger 背景规则继续生效，条件背景无法覆盖它们。
- `@curve/ui` 新增 `conditionalCellStyle(match, { includeIcon })`，只复制规则里的
  background/foreground/bold/italic/icon，cell 不直接读规则模型。
- 条件背景存在时不画 `bar`（条件背景优先于 bar）；只有前景/粗体/斜体时 bar 保留。
- 行目标规则的 icon 只画在首个可见列；单元格目标规则的 icon 只画在该列。
- icon 是装饰性 `<span role="img">`，标签走 `grid.ruleIcon.*` 消息表；颜色使用 `currentColor`，
  不新增主题令牌或 CSS 变量。
- 新增条件样式不改变 manifest/JSONL 字节；只影响渲染。

### 6. 性能口径

- 16ms 是**纯求值**预算：50 条规则 × 100 行的 `createConditionalFormat` + `evaluateRow`，
  不含 DOM 应用。domain 单测以 best-of-3 断言，bench 增加
  `condition.rules.50x100`（query suite，硬预算 16ms）。
- 网格只对虚拟化后实际渲染的可见行求值；准备结果按 `tableStyle.conditionalRules`、
  `tableMeta.columns` 与 locale 缓存，滚动不会重建求值器。
- DOM 应用的开销不并入 16ms；样式预览的 100ms 预算仍由 SPEC §16.1 的“样式预览更新”约束，
  T3.4 的编辑器/预览测试负责。

## 代价

- table-engine 的 `matchesCompare` 从 200 行内联 switch 变为一次 domain 调用；由于内部包是
  源码包、编译后同进程，实测 query/排序 bench 未回退（T3.3 报告记录）。
- `PreparedCompare` 保留原有 `index/column/needle` 字段并新增 `comparison`，形状变大但未破坏
  现有读取方。
- number/date 的 `contains` 是条件规则专属语义，过滤器与条件规则的“操作符白名单”不再完全
  相同；UI 必须用 `conditionCompareOps` 构建条件规则编辑器（T3.4）。
- 日期 `contains` 匹配 epoch 字符串，不是用户看到的日期文本；这是保守实现，已记录为复核点。
- 条件样式只应用“首条命中”的一个规则，不支持叠加；颜色对比度由用户/编辑器负责，渲染层
  不做自动校正。
- `style.update` 的 manifest 写入是异步的；`updateTableStyle` 等待 flush，撤销/重做仍沿用
  T2.2 的“先改内存、保存队列随后落盘”模式。

## 影响

- `@curve/domain`：新增 `predicate.ts`、`condition.ts` 与测试；`index.ts` 导出；
  `allowedCompareOps` 等从 domain 提供。
- `@curve/table-engine`：`query.ts` 删除重复比较实现，`PreparedCompare` 增加
  `comparison`；`DEFAULT_QUERY_LOCALE` 复用 `DEFAULT_COMPARE_LOCALE`；公开导出保持兼容。
- `@curve/app-core`：新增 `commands/styles.ts`；`app-core.ts` 注册命令、manifest 保存集合与
  workspace 历史钩子；`save-queue.ts` 增加 `enqueueManifest`；`edit-history.ts` 支持
  workspace 作用域；`workspace-actions.ts` 增加 `updateTableStyle`。
- `@curve/ui`：新增 `conditionalCellStyle` 与类型；`GridCell` 增加 `conditional`/
  `conditionalIconLabel`。
- `apps/desktop`：`DataGrid` 准备/求值规则并把匹配传给单元格；`styles.css` 增加规则图标；
  i18n 增加 `grid.ruleIcon.*`；`e2e/style.spec.ts` 增加条件规则视图与 200% 缩放冒烟。
- 文档：SPEC §10.4/§13.1/§13.2/§16.1 实现边界、TASKS T3.3、ADR 索引、CHANGELOG、HANDOFF 与
  T3.3 报告。
- 不改变 `formatVersion`、JSONL、manifest 字段、IPC、preload、CSP、沙箱或运行时依赖。

## 复核条件

- 若要求条件规则在过滤器 UI 中也支持 number/date `contains`，需要同时修改
  `allowedCompareOps`、filter builder、验证与 T2.6 测试，另写 ADR。
- 若要求日期 `contains` 匹配显示文本，需定义 locale/时区/格式来源并更新 SPEC。
- 若条件样式需要叠加（多条规则合并）或支持更多样式属性（边框、下划线、自定义图标），
  需扩展 `ConditionalRule.style` 并处理 manifest 兼容。
- 若 16ms 在 CI Windows runner 上不稳定，先确认是否环境噪声；不得直接放宽预算或删断言。
- T3.4 的编辑器必须使用 `conditionCompareOps` 与 `style.update`，不得在组件里另写求值或
  写盘逻辑。

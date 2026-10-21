# T2.3 实施报告 — 列管理、结构变更与迁移

- 任务：`docs/TASKS.md` T2.3（FR-TBL-01、FR-TBL-08）
- 完成日期：2026-10-21
- 决策记录：`docs/adr/029-t23-column-management-and-structure.md`
- 状态：完成；按用户要求停在 T2.4 前，等待确认。

## 1. 开工前确认的 10 项决策

用户在实现前逐项确认，全部采用推荐方案：

1. **不升 formatVersion、不接迁移**：`formatVersion`/`schemaVersion` 保持 1，生产迁移注册表继续为空；
   T2.3 的“迁移”是运行期行数据转换，回滚证据改为命令级 + 文件字节不变。
2. **改类型失败整批取消**：逐行 `coerceCell` 预检，任何失败列出前 100 行并取消；失败不改内存/磁盘。
3. **引用清理**：删列清理所有视图的 `columnOrder/widths/hidden/sort/filter` 与冻结计数；图表
   mapping/sort/filter 保留并进入 invalid；样式 `columnOverrides`/`conditionalRules` 保留；主键列禁止删除。
4. **图表错误态**：数据层 + `ChartPlaceholder` 最小只读占位；完整图表/重映射留 T3.1。
5. **破坏性确认**：删列/改类型/换主键/使现有值非法的 required/枚举变更共用一个确认框；同步执行，
   T2.3 不提供进度/取消。
6. **100 列上限**：命令硬拒绝 + Inspector 禁用“新增列”；共享 helper 供 T2.4/T2.5 复用。
7. **列面板入口**：右侧 Inspector；新增/编辑用 Dialog；重排用上移/下移按钮保证键盘可达。
8. **重排语义**：`table.column.reorder` 重写 `TableMeta.columns`、每行 `values` 与该表所有视图的
   `columnOrder`。
9. **撤销范围**：结构命令只产 patches，不接入 T2.2 的 `table.cell.set` 最小历史；T5.2 统一。
10. **列编辑字段**：完整 `ColumnDef`（label/key/type/role/unit/precision/enumOptions/required）；
    宽度仍由视图 `widths` 管理；`fieldTypeId` 留 T6.1。

> 说明：TASKS 原验收句同时列出 `columnOverrides`，与决策 3 冲突。经用户确认后，TASKS 验收改为
> “清理 `columnOrder/widths/sort/filter`，`columnOverrides` 按 ADR-029 保留”，并由
> `columns.test.ts` 断言样式对象引用与覆盖项未被改动。

## 2. 交付内容

### domain

- `packages/domain/src/column-ops.ts`：
  - `planColumnAdd`：追加/插入列、旧行补 `null`、100 列/schema/重复 key/required 校验。
  - `planColumnUpdate`：完整列替换；type/required/enumOptions 变更逐行转换/校验；失败返回前 100 条
    `ColumnChangeFailure` + `totalFailures`，不返回半迁移行集；空值保持 `null`。
  - `planColumnDelete`：主键列拒绝；同步删除每行值。
  - `planColumnReorder`：校验精确排列，重排 schema 与每行 `values`。
  - `planPrimaryKeyChange`：text 列、非空、唯一校验；成功后新主键 `required: true`，行值不变。
  - 所有计划复用 `checkTable`（§6.6.1–2a）与 `parseColumnDef`，不抛半成品。

### app-core

- `commands/columns.ts`：`table.column.add/update/delete/reorder`；同一组 patches 内更新表、行、视图。
- `commands/column-views.ts`：`removeColumnFromView`（filter 递归裁剪、冻结计数）、
  `insertColumnIntoView`、`reorderViewColumns`。
- `commands/tables.ts`：`table.meta.update` 载荷改为可选 `name`/`primaryKey`；换主键走
  `planPrimaryKeyChange`，重命名行为不变。
- `validation/column-draft.ts`：`checkColumnDraft`，字段级 issue（required/format/duplicate/range/
  enum-empty/enum-duplicate/primary-key-type/limit/invalid），key 唯一与 100 列规则。
- `validation/column-change.ts`：`inspectColumnChange` 预检与确认框计数（行数、转换单元格、视图清理、
  失效图表），不修改状态。
- `state/chart-validity.ts`：`listChartColumnReferences`/`findMissingChartColumns`/`chartReferencesColumn`。
- `usecases/workspace-actions.ts`：`inspectColumnChange`、`addColumn`、`updateColumn`、`deleteColumn`、
  `reorderColumns`、`changePrimaryKey`；行数据命令走保存队列（表 → manifest），纯 schema 命令只写
  manifest；保存失败返回 `committed: true`。
- `app-core.ts`：注册 4 个列命令；`index.ts` 导出新 API。

### renderer

- `features/columns/ColumnsPanel.tsx`：Inspector 列清单、新增、编辑、上移/下移、100 列禁用、确认框编排。
- `ColumnFormDialog.tsx`：完整 `ColumnDef` 表单、enum 选项编辑、key 由 label 派生、删除/设为主键入口、
  字段错误与 required-on-non-empty 提示。
- `ColumnChangeDialog.tsx`：共用破坏性确认；显示计数/警告/前 100 行失败；失败时禁用确认。
- `column-form.ts`、`column-error-text.ts`：纯表单/错误文案 helpers。
- `features/charts/ChartPlaceholder.tsx`：chart 视图的表缺失/列已删除/待实现占位。
- `shell/Inspector.tsx`：活动表时渲染列面板；`WorkspaceView.tsx`：chart 分支接入占位。
- `i18n/messages/{zh-CN,en-US}.ts`：新增列管理/字段/错误/确认/图表占位文案。
- `styles.css`：列面板、表单、确认框、图表占位；只消费 `--cs-*` 令牌。

### 测试

- domain：`column-ops.test.ts` 22 条（增/删/改/重排/换主键、失败截断、空值、主键、schema）。
- app-core：`columns.test.ts` 13 条、`column-views.test.ts` 8 条、`column-draft.test.ts` 8 条、
  `column-change.test.ts` 8 条、`chart-validity.test.ts` 4 条、`column-actions.test.ts` 15 条。
- renderer：`column-form.test.ts` 4 条、`column-error-text.test.ts` 2 条、`ColumnFormDialog.test.tsx`
  7 条、`ColumnChangeDialog.test.tsx` 4 条。
- E2E：`apps/desktop/e2e/schema.spec.ts` 8 条。

## 3. 验收项与证据

| 验收项 | 证据 |
|---|---|
| 加列后旧行补 `null`，行数不变 | `e2e/schema.spec.ts` 第 1 条：3 行→4 列、`v.at(-1) === null`、重开仍 3 行；`columns.test.ts` 增列用例；`column-ops.test.ts` |
| 改类型成功/失败路径都有测试，失败不改数据 | 成功：`e2e/schema.spec.ts` 第 2 条（10/20.5/30 → number，重开）；失败：第 3 条（2 行失败、确认禁用、manifest/JSONL 字节相等）；`column-ops.test.ts` 前 100 行/总失败数；`columns.test.ts`/`column-actions.test.ts` |
| 删列后清理视图状态，重新加载不变量通过 | `e2e/schema.spec.ts` 第 4 条断言 `columnOrder/widths/hidden/sort/filter/frozen` 并重开；`column-views.test.ts`；`columns.test.ts`（含样式保留） |
| 删列后图表显示“列已删除”错误态，不崩溃 | 同第 4 条：chart mapping 保留、点击 chart tab 显示 `列已删除：col_note`，重开仍显示；`ChartPlaceholder` + `chart-validity.test.ts` |
| 100 列上限生效 | `e2e/schema.spec.ts` 第 7 条：100 列时新增按钮禁用 + 上限提示；`column-ops`/`column-draft`/`columns.test` 命令级拒绝 |
| 换主键非空唯一 | `e2e/schema.spec.ts` 第 5/6 条；`column-ops.test.ts` 空白/重复；`column-actions.test.ts` |
| 重排同步 schema/行/视图 | `columns.test.ts` reorder；`column-ops.test.ts` 排列校验；`column-views.test.ts` |
| 键盘与 200% 缩放 | `e2e/schema.spec.ts` 第 8 条：200% 下 Inspector 可见、聚焦新增按钮 + Enter 开框、Esc 关闭、无横向溢出 |

## 4. 实际验证输出

| 命令 | 结果 |
|---|---|
| `pnpm verify` | exit 0；**89 files / 733 tests**；ESLint 0；depcruise **265 modules / 968 deps / 0 violations** |
| `pnpm test:coverage` | exit 0；全局 lines **77.83%** / statements 77.58% / branches 69.49% / functions 78.78%；domain `column-ops.ts` lines 94.76%；阈值 70/60 未下调 |
| `pnpm format:check` | exit 0 |
| `pnpm build` | exit 0；renderer **1,246.01 kB**；Worker `assets/table.worker-*.js` |
| `pnpm e2e` | **41 passed**（33 + `schema.spec.ts` 8），约 1.1min |

T2.3 专属 E2E：

```text
ok 1 adds a column, fills null into existing rows and persists it
ok 2 converts a text column to numbers and reloads with the new type
ok 3 reports every failed conversion and leaves both files byte-identical
ok 4 deletes a column, cleans view state and shows the chart error state
ok 5 promotes a unique text column to primary key and persists it
ok 6 refuses a primary key with duplicate values
ok 7 disables adding a column at the 100-column limit
ok 8 keeps the column panel keyboard reachable at 200% zoom
```

## 5. 与规格/计划的差异与残留

- 未升 `formatVersion`、未注册迁移、未接 `FileWorkspaceStore.open`；与 ADR-024/ADR-029 一致。
- 结构变更不进入撤销历史（T5.2）；误操作恢复依赖确认框与 `backups/`。
- 100k 行改类型/重排同步执行，无进度/取消；T2.7 复核。
- 图表只有只读错误占位；完整图表与重映射留 T3.1。
- 重排会覆盖所有视图的 `columnOrder`；T2.6 若做视图级拖拽需重新评估。
- 表内已有行时不能直接新增 required 列，需要“先加普通列→填值→设必填”。
- 图表/样式的悬空引用允许存在；样式求值在 T4.x 忽略缺失列。
- TASKS 的 `columnOverrides` 验收措辞已按用户确认的决策 3 调整，并由单测证明样式未被改动。

## 6. 残留风险

| 风险 | 处理 |
|---|---|
| 100k 行同步改类型/重排导致短暂无响应 | T2.7 实测；超过预算则 Worker/分批/进度取消 |
| 结构变更不可撤销 | 确认框 + 磁盘备份；T5.2 统一历史时评估 inverse patch 内存 |
| 图表/样式保留悬空引用 | 图表有占位错误态；样式在 T4.x 求值时忽略缺失列 |
| 保存失败但内存已变更 | action 返回 `committed: true`，UI 关闭对话框，状态栏/Toast 可重试 |
| 重排覆盖视图自定义顺序 | v1 无视图级重排 UI；T2.6 引入时写新 ADR/调整语义 |
| 空表加列只写 manifest | JSONL 仍是旧列数，但无行可校验；ADR-022 语义下可正常打开 |

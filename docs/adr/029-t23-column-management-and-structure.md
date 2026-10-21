# ADR-029 T2.3 的列管理、结构变更、运行期迁移与破坏性确认

- 状态：已接受
- 日期：2026-10-21
- 相关：SPEC §6.6、§7.6、§9.0、§9.2、§13.1、§16.1；T2.3；ADR-006、ADR-008、ADR-015、ADR-024、ADR-025、ADR-027、ADR-028

## 背景

T2.3（列管理、结构变更与迁移）需要落地一批 SPEC 只给出目标行为、没有给出实现边界的选择。按
AGENTS §11 在开工前逐项询问用户，用户于 2026-10-21 确认全部采用推荐方案：

1. 不升 `formatVersion`、不把迁移执行器接进打开流程；
2. 改类型失败时整批取消，列出前 100 行，失败不改数据；
3. 删列的视图状态必清、图表/样式引用保留；主键列禁止删除；
4. 图表错误态做到数据层 + 最小只读占位，完整图表留 T3.1；
5. 删列/改类型/换主键共用确认对话框，同步执行，不提供进度/取消；
6. 100 列上限由命令硬拒绝 + UI 禁用新增；
7. 列面板放右侧 Inspector，编辑用 Dialog；
8. 重排改变表结构顺序（`table.column.reorder`），并同步该表所有视图；
9. 结构变更只产 patches，不接入 T2.2 的最小撤销历史；
10. 列编辑覆盖完整 `ColumnDef`，宽度仍由视图 `widths` 管理。

本 ADR 记录这些决定、实现边界与后续任务的复用约束。

## 决定

### 1. T2.3 不改变文件格式，也不接迁移

- `formatVersion` 与 `TableMeta.schemaVersion` 保持 `1`；`CURRENT_FORMAT_VERSION` 仍为 `1`；生产迁移注册表
  继续为空（ADR-024）。
- T2.3 的“列数据迁移”是**运行期行数据转换**：加列补 `null`、改类型逐行 `coerceCell`、删列/重排调整每行
  `values`；写出的仍是 v1 manifest 与 v1 JSONL。没有 v1→v2 字段增删，因此不注册迁移、不补迁移夹具。
- `FileWorkspaceStore.open` 仍不调用 `runMigrations`；未来版本继续 `E_WS_VERSION_UNSUPPORTED`。首次真实格式
  升级时按 ADR-024 的复核条件接线。
- 失败回滚证据从“文件迁移备份目录”改为命令级：纯计划返回 `{ ok: false }`，命令不抛半成品；Immer
  `produceWithPatches` 不发布失败草稿；action 在预检失败时不写盘。E2E 用表/manifest 字节相等证明
  “失败不改数据”。

### 2. 改类型/改必填/改枚举选项先全量预检，失败整批取消

- `@curve/domain` 新增纯计划 `planColumnUpdate`：逐行用 `coerceCell`（与内联编辑、未来的粘贴/导入同一归一器）
  转换；对 `required` / `enumOptions` 变更用 `parseCell` + 空值判定校验现有值。
- 任何一行失败：返回前 100 个 `ColumnChangeFailure`（1-based 行号、rowId、原值、code、诊断），并带
  `totalFailures`；不返回半迁移行集。命令层直接抛该 `AppError`，不会 dispatch 成功。
- 不提供“失败置 `null` 后强制继续”或“删除失败行”。前者是显式数据丢失，后者会改变行数，均与
  FR-TBL-08/T2.3 验收冲突；若未来需要，另写 ADR 并补二次确认。
- 空值在类型转换时保持 `null`，不会因为目标是 text 而变成 `""`。

### 3. 引用清理：视图必清，图表与样式保留

- **删列**（同一命令的同一组 patches）：
  - `TableMeta.columns` 移除；每行 `values` 同步移除；`rowCount` 不变；表/工作区 `updatedAt` 更新。
  - 该表所有 `ViewDef.tableView`：`columnOrder`/`widths`/`hiddenColumnIds`/`sort` 删除该列；`filter` 递归
    裁剪 compare 节点（空组删除、空根删除 `filter`）；`frozenColumnCount` 仅当被删列在该视图顺序中位于
    冻结区时减 1。
  - `ChartSpec.mapping/sort/filter` **原样保留**，图表进入 invalid 状态（SPEC §19“不自动改映射”）。
  - `TableStyle.columnOverrides` 与 `conditionalRules` **原样保留**；SPEC §6.6.7 允许覆盖项指向不存在的列，
    样式是跨表模板，删一列不应改动模板。
  - 主键列禁止删除（返回 `E_VALIDATION`），必须先更换主键。
- **换主键**（`table.meta.update` 的 `primaryKey` 分支）：新主键必须是已存在的 text 列；逐行检查非空
  （`null`/空白字符串都算空）且唯一，失败列出前 100 行并整批取消；成功后把新主键列置 `required: true`，
  旧主键列保留原定义，`Row.values` 不变。
- **加列**：默认追加到 schema 末尾，所有行补 `null`；表内已有行时禁止新增 `required` 列（否则立即违反
  §6.6.2），用户需先加普通列、填值后再设为必填。加列同步插入所有视图的 `columnOrder`。
- **改主键列类型**：主键必须保持 text；`table.column.update` 若把主键改成非 text 会在 schema 校验阶段以
  `E_TYPE` 拒绝。UI 在编辑主键列时禁用类型选择。

### 4. 图表错误态：数据层 + 最小只读占位

- `@curve/app-core` 新增 `listChartColumnReferences`/`findMissingChartColumns`/`chartReferencesColumn`，
  与 §6.6.4 的 warning 使用同一套引用规则（mapping、sort、filter）。
- T2.3 的 `WorkspaceView` 对 chart 视图渲染 `ChartPlaceholder`：表不存在时显示“图表引用的数据表已不存在”；
  映射列缺失时显示“列已删除：…” + “不自动重映射”提示；其余情况显示“图表将在后续里程碑提供”。
- 完整图表渲染、重映射 UI、空态/导出留 T3.1；T2.3 的占位不构造 ECharts option。

### 5. 破坏性确认：一个共用对话框，同步执行

- 删列、改类型、改必填/枚举选项、换主键共用 `ColumnChangeDialog`，显示：
  受影响行数、需转换单元格数、需清理视图数、将失效图表数；失败时显示前 100 行失败列表并禁用确认。
- 删除列与主键变更使用 `danger`/`primary` 按钮；失败或取消时内存与磁盘均未改变。
- T2.3 在渲染进程同步执行结构变更；100k 行一次 `coerceCell`/重排是 O(行×列) 的短任务，不提供进度/取消。
  T2.7 若实测超过预算，再评估 Worker/分批与取消语义。
- 保存时机：改变行数据的结构命令走 T2.2 保存队列（表 → manifest，按表串行/合并），action 等待 flush ≤3s；
  只改 schema 的命令（label/key/role、required、enumOptions、换主键、空表的增删/重排）只写 manifest。
  这样空表加列不会创建 0 字节 JSONL（ADR-027），100k 行的纯元数据编辑也不会重写数据文件。
- 保存失败时 action 返回 `committed: true` 的错误：内存已变更，表单/对话框关闭，状态栏/Toast 展示错误并可
  重试；不会让用户误以为操作未发生而重复执行。

### 6. 100 列上限

- `MAX_COLUMNS_PER_TABLE = 100` 已在 schema/invariants 中强制；`planColumnAdd` 在 101 列时返回
  `E_VALIDATION`（detail 带 `max=100`）。
- Inspector 在 100 列时禁用“新增列”并显示上限提示；命令仍是硬限制，绕过 UI 的调用同样失败。
- `checkColumnDraft` 与 `planColumnAdd` 的容量规则供 T2.4/T2.5 的粘贴/导入新增列复用。

### 7. 列面板入口：右侧 Inspector

- `Inspector` 在存在活动表时渲染 `ColumnsPanel`：列清单（label、key、类型/角色/主键/必填/枚举徽标）+
  新增按钮 + 每列“编辑”按钮 + 上移/下移按钮。
- 新增/编辑在 `ColumnFormDialog` 完成；删除与主键操作从表单底部进入共用确认对话框。
- 重排用显式按钮（不是拖拽），保证纯键盘可达；浏览器 200% 缩放冒烟由 E2E 覆盖。
- `ColumnDef.width` 仍由视图 `TableViewState.widths`/网格拖拽管理，不在表单中暴露，避免两个宽度来源。

### 8. 重排语义：表结构顺序

- `table.column.reorder` 载荷 `{ tableId, columnIds }`，要求 `columnIds` 是当前列的精确排列；命令重排
  `TableMeta.columns` 与每行 `values`，并把该表所有视图的 `columnOrder` 同步为新顺序。
- 代价：v1 尚无“每视图自定义列顺序”的 UI；T2.6 若提供拖拽重排，应使用 `view.update`，并重新评估是否
  仍让结构重排覆盖所有视图。
- 重排不改变 `rowCount`，不修改图表/样式引用。

### 9. 撤销范围：只产 patches

- 结构命令通过命令总线产生 `patches`/`inversePatches`，但 T2.2 的 `EditHistory` 仍只记录 `table.cell.set`；
  T2.3 不把结构命令接入 Ctrl/Cmd+Z。
- 结构变更的兜底是破坏性确认 + SQLite 前的表/ manifest 备份（`writeTable`/`writeManifest` 自动备份）。
- T5.2 统一历史时必须消费本 ADR 的命令补丁，不得另起一套；100k 行的结构 inverse patch 需评估内存上限。

### 10. 列编辑字段范围

- 表单覆盖 `ColumnDef` 的 label、key、type、role、unit、precision、enumOptions、required；id 由应用生成且
  不可编辑；`fieldTypeId` 留 T6.1。
- 改类型时清空 `fieldTypeId`（语义类型与存储类型必须匹配，ADR-015）；类型不变时保留既有 `fieldTypeId`。
- `enum` 必须有 1..100 个非空且唯一的选项；enum→非 enum 时丢弃 `enumOptions`。
- key 在 add 模式下可由 label 派生 ASCII slug（中文标签回退为 `column`/`column_2`），用户可改；表内唯一。

## 代价

- 结构变更为同步 O(行数) 操作；100k 行改类型/重排期间 UI 会短暂无响应，T2.3 不提供进度/取消（T2.7 复核）。
- 结构变更不可撤销，只能依赖确认对话框与磁盘备份；误操作恢复需要手工使用 `backups/`（恢复 UI 在 T5.3）。
- 图表与样式允许保留悬空引用；只有图表有占位错误态，样式覆盖/条件规则在 T4.x 求值时应忽略缺失列。
- 重排覆盖所有视图的 `columnOrder`；T2.6 引入视图级重排后可能需要新 ADR 调整语义。
- 表内已有行时不能直接新增 required 列，需要“先加列→填值→设必填”两步。
- 改类型使用 `coerceCell` 的宽松归一（千分位、日期字符串等），与内联编辑一致；不是严格 JSON 类型转换。
- 空表加列/删列只写 manifest；若之后外部工具直接读 JSONL，会看到一个“列数不匹配”的旧文件，但应用按
  ADR-022 的缺文件/行数语义仍能正确打开（空表无行可校验）。

## 影响

- `@curve/domain` 新增公开 API：`planColumnAdd`、`planColumnUpdate`、`planColumnDelete`、
  `planColumnReorder`、`planPrimaryKeyChange`、`ColumnChangeFailure`、`ColumnChangePlan`。
- `@curve/app-core` 新增：`table.column.add/update/delete/reorder` 命令、列命令的 view 清理 helpers、
  `checkColumnDraft`、`inspectColumnChange`、`WorkspaceActions` 的 `addColumn/updateColumn/deleteColumn/
  reorderColumns/changePrimaryKey/inspectColumnChange`、`ColumnActionOutcome`、图表引用 helpers。
- `apps/desktop` 新增：`features/columns/*`（Inspector 面板、表单、确认对话框、文本映射）、
  `features/charts/ChartPlaceholder.tsx`、`e2e/schema.spec.ts` 8 条；`Inspector.tsx`/`WorkspaceView.tsx`/
  `styles.css`/zh-CN/en-US 消息表同步。
- `docs/SPEC.md` 增加 §9.0/§9.2/§9.7 的实现边界、§13.1 结构命令说明、§7.6 的“T2.3 不升版”说明。
- 不新增运行时依赖；不新增 IPC 通道；不改变 `formatVersion`、JSONL 形态、CSP、沙箱或 preload 白名单。

## 复核条件

- T5.2 全命令历史：评估 100k 行结构 inverse patches 的内存占用；若超 256MB 上限，需分批或禁止入栈。
- T2.6 视图级列重排：若提供拖拽，调整 `table.column.reorder` 是否覆盖所有视图的语义并写新 ADR。
- T3.1 图表容器：用真实图表替换 `ChartPlaceholder` 的错误态，并补“重新映射”入口；不得改变
  `findMissingChartColumns` 的判定规则。
- T2.4/T2.5：粘贴/导入新增列必须复用 100 列上限与 `checkColumnDraft`；批量写入必须复用 `coerceCell` 与
  整批校验/取消语义。
- T2.7：若 100k 行改类型/重排实测超过可接受时长，评估 Worker 化、进度与取消，并补 SPEC §16.1 预算。

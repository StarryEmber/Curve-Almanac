# ADR-027 T2.1 的命令、保存时机、目录选择与网格接线

- 状态：已接受
- 日期：2026-10-21
- 相关：SPEC §7.4、§9.0、§9.1、§13.1、§15.1、§15.4、§16.1；T2.1；ADR-005、ADR-020、ADR-022、ADR-023、ADR-024、ADR-025、ADR-026

## 背景

T2.1（工作区入口、表管理与虚拟化数据网格）需要落地一批 SPEC 未覆盖或只给出目标形态的选择。
开工前按 AGENTS §11 逐项向用户确认，以下八项全部采用推荐方案；本 ADR 记录决定、代价与影响。

## 决定

### 1. 新增 `table.create` / `table.delete` 同步命令

- SPEC §13.1 的命令表原本没有建表/删表。两者都是同步文档变更，必须可撤销、可审计，因此新增：
  - `table.create`：载荷 `{ table, view }`；一次写入表、视图与 layout 标签，并设置活动表/视图。
  - `table.delete`：载荷 `{ tableId }`；在同一组 Immer patches 中级联删除引用该表的图表、视图与
    layout 引用，并把活动视图回退到相邻视图。
- 复用既有 `table.meta.update`（改名，同时更新该表所有视图标题）与
  `view.create/delete/update/layout`；`view.update` 负责列宽、冻结列数、列顺序等视图状态。
- 视图 ID / 表 ID 由 `@curve/app-core` 的构造 helper 与注入的 `uuid` 生成；renderer 不自己拼
  manifest 结构。

### 2. 结构性操作后立即写 manifest

- 建表、改名、删表、视图创建/关闭/更新/布局变更成功后，use case 立即调用
  `WorkspaceStore.writeManifest`；单元格编辑仍留给 T2.2/T5.3 的保存策略。
- 失败时 `ui.error` 进入错误 surface，内存中的文档变更保留，下一次显式保存可重试。
- manifest 始终最后写（SPEC §7.4.4）；删除顺序为 **dispatch → 写 manifest → `table:trash`**。
  这样 manifest 不会引用已移走的文件；最坏情况是留下一个孤儿表文件。

### 3. 新建表不落 0 字节文件

- 新建表只写 manifest 条目（`rowCount: 0`），首次写数据时才创建 `tables/<id>.jsonl`。
- 复用 ADR-022 的缺文件语义；`FileWorkspaceStore.trash` 改为按 `tableId` 解析文件，不再要求表
  仍在 manifest 中（否则“manifest 先写、文件后移”的删除顺序会失败）。

### 4. `dialog:pickDirectory` 与默认父目录

- T2.1 实现 SPEC §15.1 已声明但未接线的 `dialog:pickDirectory`：
  - 请求扩展为 `{ title?, defaultPath? }`，响应 `{ path } | null`。
  - main 使用 `dialog.showOpenDialog({ properties: ['openDirectory', 'createDirectory'] })`；
    E2E 继续由 `CURVE_E2E_DIR` 替身返回固定目录。
  - 欢迎页“新建工作区”默认父目录为 `app.getPath('documents')/Curve Studio`；“打开工作区”提供
    可编辑路径 + 选择文件夹。
- 为让 renderer 取得默认目录，`app:info` 响应增加 `documentsDir` 字段（OS 文稿目录）。
- 不新增其他 IPC；`workspace:recent:remove/clear` 后置到 T5.3。

### 5. 删除级联与二次确认

- 删除表前用 `@curve/ui` 的 Dialog 展示名称与将级联删除的视图/图表数量；确认后在
  `table.delete` 的同一次 patches 中完成级联，不留下悬挂引用。
- 计数来自 app-core 的纯函数 `countTableReferences`，与命令使用同一套引用规则。

### 6. Worker 异步解码接入 `openWorkspace`

- `createOpenWorkspace` 新增可注入的 `decodeTable(jsonl, table): Promise<JsonlDecodeResult>`；
  renderer 注入 `createTableIoClient().decode`，把 100k 行解码移出主线程。
- 未注入时仍使用同步 `decodeJsonl`，保持 app-core 测试与 T1.5 行为不变。
- 删除 `electron.vite.config.ts` 的显式 `table-worker` 入口；Vite 现在自己产出
  `assets/table.worker-<hash>.js`。E2E 的产物断言同步改为该命名。
- 打开失败（包括 Worker 解码失败）仍保持旧文档不变，只写 `ui.error`。

### 7. TanStack 与测试依赖

- 采用 `@tanstack/react-table@8.21.3`（主版本 8）与 `@tanstack/react-virtual@3.14.21`（主版本 3），
  与 ADR-005 的 headless 方向一致；两者都支持 React 19。
- 网格只做只读渲染、选择、键盘导航、冻结列与列宽；单元格编辑在 T2.2。
- 可访问性用 **`axe-core@4.14.0`**（测试专用）注入 Electron 页面执行。`@axe-core/playwright`
  会在 Electron context 里新建页面而失败，因此不采用；未新增运行时依赖。
- 本机无符号链接权限，安装时继续按 HANDOFF §3.4 用目录 junction 补齐，不改项目配置。

### 8. 最近列表删除/清空后置

- T2.1 的欢迎页只读最近列表并打开条目；`workspace:recent:remove/clear` 与相关 UI 留给 T5.3。

## 代价

- 新增两个 SPEC §13.1 命令和对应的 ADR/SPEC 维护成本；`table.delete` 的级联逻辑需要长期保持与
  `countTableReferences` 一致。
- 立即写 manifest 让每次结构性操作都有一次磁盘写；在 T5.3 自动保存前这是显式的正确性代价。
- `trash` 不再校验 manifest 条目，意味着调用方必须先确认表存在；当前唯一调用方是
  `deleteTable`（命令已校验）。
- `app:info` 增加字段是一次公开契约变更，旧 renderer 不受影响，但所有契约测试与 E2E 需要同步。
- Worker 解码失败现在会让打开整体失败（而不是保留部分表），这是“打开原子性”的选择。
- 新增 UI 代码拉低全局行覆盖率（93.62% → 81.57%）；阈值 70% 仍满足，纯逻辑包仍 ≥85%。

## 影响

- `docs/SPEC.md`：§13.1 增加 `table.create`/`table.delete`；§15.1/§15.4 增加 `documentsDir`、
  `dialog:pickDirectory` 的 `defaultPath` 与 `table:trash` 的顺序说明。
- `docs/TASKS.md`：T2.1 勾选并记录实现备注。
- `packages/app-core` 新增：表/视图命令、layout helpers、`WorkspaceActions`、`stateToManifest`、
  `countTableReferences`、异步解码端口。
- `apps/desktop` 新增：`features/{workspace,tables,grid}`、app-core Provider/适配层、
  `dialog:pickDirectory` 的 main/preload/api-client 接线、`app:info.documentsDir`。
- 依赖：`@tanstack/react-table`、`@tanstack/react-virtual`、`axe-core`（均 renderer/test）；
  `electron.vite.config.ts` 删除显式 Worker 入口。
- 不改变 `formatVersion`、JSONL 格式、manifest 字段、CSP、沙箱或 preload 白名单。

## 复核条件

- T2.2 接入单元格编辑时：确认 `table.cell.set` 与保存队列、撤销历史无冲突；若需要编辑态进入视图
  状态，另写 ADR。
- T5.1 分栏布局：`view.layout` 与 `findActivePane`/`addViewToLayout` 已按递归 layout 实现，分割
  pane 时复核活动 pane 的语义。
- T5.3 自动保存/恢复：立即写 manifest 的策略应与保存队列合并，避免同一操作写两次；最近列表
  删除/清空与恢复对话框也在该任务落地（ADR-026）。
- 若 axe-core 的注入方式在打包应用/CI 失效，改为 CI 独立页面审计或记录为手工验收，不得删除
  可访问性验收项。

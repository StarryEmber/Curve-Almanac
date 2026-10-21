# ADR-025 app-core 的 Zustand/Immer 边界、状态切片与同步命令总线

- 状态：已接受
- 日期：2026-10-21
- 相关：SPEC §4.2、§5.1、§13.1、§13.2；T1.5；ADR-006、ADR-023、ADR-024

## 背景

T1.5 需要交付 `@curve/app-core` 的第一版状态与命令总线，但 SPEC 只规定了目标形态，没有覆盖以下实现细节：

1. `zustand`/`immer` 的版本、导入入口（React binding 与 vanilla store）以及打包边界。
2. `AppState` 中表数据的容器：`Map` 还是普通对象；`TableData` 是否直接进 store。
3. `workspace.open` 的定位：TASKS 把它列在“命令”步骤中，但它是异步读盘/IPC 副作用，
   不在 SPEC §13.1 的命令表内；SPEC §13.1 明确“异步副作用不进入命令”。
4. 打开工作区时是否顺带接迁移；以及如何取得每张表的 `Row[]`。
5. 脏表列表保存在哪里、是否进入 Immer patches；错误 surface 与“失败不改状态”的关系。
6. Immer 的 auto-freeze 在 10 万行表上的成本。

## 决定

### 1. 依赖与导入边界

- `@curve/app-core` 增加两个运行时依赖，主版本锁定并精确写入 `package.json`：
  - `zustand@5.0.15`（主版本 5，实际安装版本以 `pnpm-lock.yaml` 为准）；
  - `immer@10.2.0`（主版本 10，同上）。
- 只使用 `zustand/vanilla` 的 `createStore`，不引入 React binding；app-core 仍禁止 React/Electron。
- 两者只留在 app-core/renderer 构建中，不进入 preload（preload 白名单保持不变）。
- 选择 zustand 而不是自建 store：ADR-006 已锁定；vanilla store 的 `getState`/`setState`/`subscribe`
  足以支撑命令总线，且 T2.x 的 React 绑定可以后置。
- 选择 Immer 而不是手写 patch：`produceWithPatches` 是 ADR-006 的既定方案；手写逆补丁在 11 个
  后续命令上重复且容易漏字段。

### 2. AppState 切片与表容器

- 四个逻辑切片：`workspace`、`tables`、`views`（含 `views`/`charts`/`tableStyles`/`layout`）、`ui`。
- 表数据用普通对象：`tables: Record<string, TableData>`，`TableData = { table, rows }` 来自
  `@curve/table-engine`；`rows` 是普通数组。
- 不使用 `Map`/`Set`：
  - 不需要 `enableMapSet()`；
  - Immer patch 路径与值保持可序列化，T5.2 的撤销/重做可以直接消费；
  - 表数量上限为 20，按 id 查找的对象索引足够。
- 命令只替换目标行（`rows[index]`），不整表深拷贝；表元数据仍是同一个 `TableMeta` 对象引用，
  只有真正变化的 `updatedAt` 等字段才替换。

### 3. 命令总线只收同步文档命令

- `CommandDefinition` 的 `apply(draft, payload)` 必须同步且只改 draft；总线用
  `produceWithPatches` 生成 `next`/`patches`/`inversePatches`。
- `dispatch(name, payload)` 返回结构化结果；失败返回 `AppError`，不发布半成品状态。
- `workspace.open` 实现为 app-core 的**异步 use case**，不注册进命令总线、不产生历史：
  - 依次调用 `WorkspaceStore.open`、逐表 `readTable`、`decodeJsonl`、恢复 `layout`；
  - 成功后一次替换文档状态；失败不改文档切片，只写 `ui.error` + 日志。
  - 这符合 SPEC §13.1 对“异步副作用不进入命令”的约束，也是对 TASKS 步骤 3 字面的有意调整；
    本 ADR 记录该差异。
- 迁移接线后置到 T2.3（用户确认）：
  - T1.5 的 `open` 不调用 `runMigrations`，生产注册表仍为空（ADR-024）；
  - 首个真实迁移落地时，再在 manifest 解析成功后、写 `.lock` 前接线，并补 E2E。

### 4. 打开时的表加载与错误

- `openWorkspace` 使用注入的 `WorkspaceStore` 端口读取每张表，再调用 `decodeJsonl`；生产代码不碰
  Node `fs`。T2.1 接真实 Worker 时，替换表加载实现而不改状态形状。
- 表级解码问题（`decodeJsonl.issues`）不阻塞打开（SPEC §7.5）：保留通过校验的行，并把
  `toJsonlAppError` 的摘要追加到 `workspace.warnings`；T2.1 负责把该 warning 呈现给用户。
- 读文件/打开工作区失败：不写入任何表或布局，`ui.error` 存 `AppError`，并由注入的 logger 记录。
- 失败时“状态不变”指文档切片（`workspace`/`tables`/`views`/`charts`/`tableStyles`/`layout`）不变；
  `ui.error` 是错误 surface，按设计会更新。命令失败同理。

### 5. 脏表追踪

- 沿用 ADR-023：`DirtyTableTracker` 实例由 app-core 持有，UI 只看到 `ui.dirtyTables` 快照
  （`DirtyTableEntry[]`，保持首次标记顺序）。
- 脏表列表是 UI/保存状态，**不进入 Immer 文档 patches**；命令成功且确实产生 patches 后才 mark。
- 撤销不应自动清除脏标记；T5.2 的撤销/重做只恢复文档 patches，另由保存流程 clear。

### 6. Immer auto-freeze

- 在 app-core 初始化时关闭 Immer 的 auto-freeze（`setAutoFreeze(false)`）。
- 理由：首次在该 store 上执行命令时，auto-freeze 会递归冻结 10 万行表；这把一次单元格提交从
  单行替换放大成全表遍历，违背 SPEC §16.1 的单元格提交预算，也不是 T1.5 的验收目标。
- 代价：运行时不再用 `Object.isFrozen` 兜底。约束是“命令只改 draft、store 只经 produce/actions 更新”，
  并用测试覆盖失败不发布与补丁可逆。
- 若未来需要强冻结，改为按切片冻结或命令级冻结，不恢复全局 auto-freeze。

### 7. 选择器

- `selectCurrentTable`、`selectVisibleRows`、`selectDirtyTables` 都是纯函数。
- `selectVisibleRows` 在 v1.5 还没有筛选/排序时直接返回当前 `TableData.rows` 的引用；同一表数据快照
  重复调用返回同一数组，不分配、不遍历 10 万行。
- 100k 验收采用结构断言 + 手工计时；不把墙钟 16ms 写成 CI 断言（用户确认）。

## 代价

- `zustand` + `immer` 增加约几十 KB 的运行时体积（以实际打包为准），并新增两个需要跟踪主版本的依赖。
- 关闭 auto-freeze 后，误改 store 的 bug 不会被 Immer 立即抛错；靠命令草稿模式与测试约束。
- `workspace.open` 在 app-core 中同步解码表数据；T2.1 接 Worker 前，大表打开会占用调用线程。
- 脏表列表不进入 patches，undo 后需要保存/清理流程单独处理 dirty 状态。

## 影响

- `packages/app-core/package.json` 新增 `zustand`/`immer`；`pnpm-lock.yaml` 更新。
- `@curve/app-core` 新增公开 API：`createAppStore`、`createCommandBus`、`createAppCore`、
  `table.cell.set` 命令工厂、`openWorkspace`、状态类型与选择器。T2.x 只从包根消费。
- 不改变 `formatVersion`、manifest 字段、IPC 通道、preload 白名单、CSP 或沙箱。
- TASKS T1.5 的命令步骤按本 ADR 解释为“同步命令 + 异步 open use case”。

## 复核条件

- T2.1 接入真实 Worker 时：把逐表同步 `decodeJsonl` 替换为 Worker 加载，并确认 10 万行打开预算。
- T2.3 首个真实迁移：在 `FileWorkspaceStore.open` 接线，补迁移 E2E 与失败回滚证据；本 ADR 的
  “后置”决定随 T2.3 完成而失效，不修改历史记录。
- T5.2 撤销/重做：验证 patches 可序列化、逆补丁可应用；若需要把 dirty 纳入历史，再写新 ADR。
- 若表数量/查询需要 `Map` 的渐进复杂度，重新评估容器；当前上限 20 不支持该理由。

# ADR-052 T6.1 的注册表订阅、贡献来源标记与插件宿主激活器

- 状态：已接受
- 日期：2026-10-29
- 相关：SPEC §14.2、§14.3、§14.4；TASKS T6.1、T6.2、T6.3；ADR-010、ADR-013、ADR-015

## 背景

SPEC §14 已经定义了插件形态（编译期静态导入）、`PluginDefinition`/`PluginContext`、四类贡献
注册表和 `FieldTypeDef` 等契约，但直接实现会有四个空洞：

1. **订阅缺失**：§14.3 要求“注册表本身是纯数据 + 订阅，不依赖 React”，§14.2 的 `Registry<T>`
   接口却只有 `register/replace/get/list/dispose`；T6.3 的“贡献点变更后的 UI 刷新”没有入口。
2. **来源缺失**：T6.3 要求“插件贡献的菜单项加来源标识”“错误 toast 带插件名”，而
   `list(): { id, def }[]` 不携带贡献者；同时 §14.3 的“`replace` 仅允许同插件覆盖自己”需要
   owner 才能判定。
3. **回滚/禁用语义未落地**：T6.1 要求“激活失败 → 回滚已注册项、标记禁用”，§14.3 只写了
   “不兼容 → 禁用插件并提示”，没有定义宿主 API、状态机与日志。
4. **`ImportResult` 未定义**：§14.2 的 `ImporterDef` 引用了它，但全文没有形状；插件 SDK 又不能
   import `@curve/table-engine`（依赖方向 `domain ← plugin-sdk`），必须自行定义并说明与导入
   管线的兼容关系。

2026-10-29 用户确认：注册表接口增加订阅；T6.1 的禁用列表只放内存（持久化/手动禁用留 T6.3）。

## 决定

### 1. 注册表增加订阅与来源

```ts
export type ContributionSource =
  | { readonly kind: 'builtin' }
  | { readonly kind: 'plugin'; readonly pluginId: string };

export interface RegistryEntry<T> {
  readonly id: string;
  readonly def: T;
  readonly source: ContributionSource;
}

export interface Registry<T> {
  register(id: string, def: T): () => void;
  replace(id: string, def: T): void;
  get(id: string): T | undefined;
  list(): ReadonlyArray<RegistryEntry<T>>;
  subscribe(listener: (entries: ReadonlyArray<RegistryEntry<T>>) => void): () => void;
  dispose(): void;
}
```

- `subscribe` 在每次 `register/replace/remove/dispose` 后**同步**调用，参数是当下的
  `list()` 快照；返回取消订阅函数（幂等）。监听器抛错被隔离，不影响注册/其它监听器。
- `list()` 顺序：内置贡献在前，其余按注册顺序；`replace` 保持原位置。
- `source` 是新增字段，`{ id, def }` 的旧用法（解构）仍然兼容。

### 2. 归属与 `replace`

- 宿主（`createPluginHost` 的公开注册表）注册的贡献 owner 是 `builtin`；插件拿到的
  `PluginContext` 注册表是**绑定到该插件 id 的视图**。
- `register`：任何已存在的 id（包括自己的）都抛 `E_PLUGIN_INVALID`；要覆盖请用 `replace`。
- `replace`：目标必须存在，且 owner 与调用者一致（内置只能由宿主替换，插件只能替换自己的）；
  否则抛 `E_PLUGIN_INVALID`。插件不能覆盖内置贡献。
- 插件激活失败时，宿主一次性移除该插件全部贡献并发一次通知（回滚），不留半成品。

### 3. `dispose` 语义

- 宿主视图 `dispose()`：清空全部贡献、关闭注册表；此后再 `register/replace` 抛
  `E_PLUGIN_INVALID`，`get/list` 为空。
- 插件视图 `dispose()`：只移除该插件的贡献（宿主回滚与 `deactivate` 用它），不影响内置/其他插件。
- `register` 返回的 disposer 只移除自己注册的那条。

### 4. 宿主激活器

`createPluginHost({ plugins, logger?, commandExecutor? }): PluginHost`：

- 宿主 API 版本固定 `'1.0'`；`isCompatibleApiVersion` 只比较主版本（`1`、`1.0`、`1.3` 兼容，
  `2.0`/`0.9`/非法值不兼容）。
- 每个插件有状态 `pending | active | inactive | disabled`；`disabled` 带
  `{ code, message }`：
  - 定义非法（缺 id/activate、空 id）或插件 id 重复 → `E_PLUGIN_INVALID`；
  - `apiVersion` 不兼容 → `E_PLUGIN_INCOMPATIBLE`，**不调用** `activate`；
  - `activate` 抛错/拒绝 → 回滚该插件贡献并标记禁用；抛出的若本身就是 `AppError`
    （例如注册校验的 `E_PLUGIN_INVALID`）保留其 code/message，其他错误映射 `E_PLUGIN_ACTIVATE`。
- 一个插件失败**不阻断**其他插件：`activateAll()` 顺序激活，逐插件捕获并返回状态快照。
- `deactivate(id)`：先调用插件 `deactivate()`（抛错只记日志），再移除其贡献，状态 `inactive`；
  未激活的插件是 no-op。
- `dispose()`：清空所有贡献、关闭宿主；之后 `activate` 抛 `E_PLUGIN_INVALID`。
- “禁用列表”是宿主内存中的 `getDisabled()`（id/name/version/code/message）；T6.1 不写盘、
  不提供手动启用/禁用入口（T6.3）。
- 日志通过 `PluginLogger` 注入；默认实现前缀 `[plugin:<id>]`，宿主事件用 `[plugin-host]`
  （T6.1 的计划：默认写 console，测试注入内存 logger）。

### 5. 字段类型的额外校验

`fields` 注册表在 `register/replace` 前校验：

- `storageType` 必须是 domain 的 5 种内置存储类型（复用 `builtinColumnTypeSchema`，不另抄列表）；
- `parseText/format/validate/compare/defaultWidth` 必须是函数；`defaultWidth` 是正有限数；
- 否则抛 `E_PLUGIN_INVALID`。

`ColumnDef.fieldTypeId` 与 `column.type` 的匹配仍由 `@curve/domain` 的不变量
（`resolveFieldTypeStorage`）在命令/加载时校验，注册表不重复实现。

### 6. `ImportResult` 形状

```ts
export interface ImportResult {
  headers: string[];
  rows: (string | number | boolean | null)[][];
  columns?: { name: string; type: 'text' | 'number' | 'date' | 'boolean' }[];
  warnings?: string[];
}
```

与 `@curve/table-engine` 的 `ImportDataset`（`headers` + `rows` + 可选 `columns`/`warnings`）
结构兼容；T6.3 直接把结果交给导入向导/规划器，plugin-sdk 不 import table-engine。`enum` 不在
导入推断类型里（与 T2.5 的 `ImportColumnType` 一致）。

### 7. 不实现的东西

- 不实现动态加载、权限校验、沙箱、插件市场（ADR-010 / SPEC §14.5）。
- T6.1 不把命令注册表接到命令总线，也不执行 `CommandDef.run`；`PluginCommandContext` 只是
  类型契约，T6.3 接线。
- 不持久化禁用列表，不写 `userData`/manifest。
- 不新增运行时依赖；不 import React/Electron/fs（plugin-sdk 只依赖 `@curve/domain`）。

## 代价

- `list()` 从 `{id, def}` 变为 `{id, def, source}`：已有消费者解构不受影响，但严格相等断言
  需要更新；T6.3 之前没有消费者。
- 订阅是同步通知：插件批量注册 N 个贡献会触发 N 次回调。T6.3 的 UI 监听器需要自行合并
  （例如仅在打开的面板里读取快照，不订阅文档 store）。
- owner 只存在于注册表内部；如果 T6.3 需要“按插件批量卸载”之外的能力（例如把贡献转交），
  需要新 API，不在 v1 提前设计。
- 禁用列表不持久化：坏插件每次启动都会重试并再记一次日志。这是 v1 的有意取舍（用户手动禁用
  在 T6.3）。
- `ImportResult` 是 table-engine 数据集的结构子集：若导入管线新增字段（如编码/分隔符元数据），
  T6.3 需要显式映射，不能假设类型相同。

## 影响

- 新增：`packages/plugin-sdk/src/{types,registry,host,logging}.ts`、对应测试、
  `docs/reports/t6.1/REPORT.md`、本 ADR。
- 修改：`packages/plugin-sdk/src/index.ts`（公开出口）、`packages/plugin-sdk/tsconfig.json`
  （`references: domain`；`lib` 增加 `DOM` 仅为 `AbortSignal` 类型，不引入 Node 全局或运行时
  依赖）、SPEC §14.2/§14.3、TASKS T6.1、ADR 索引、CHANGELOG、HANDOFF、AGENTS §0。
- 不改：`formatVersion`、JSONL/manifest、IPC/preload、CSP、Electron 安全选项；不新增依赖。

## 复核条件

- 若 T6.3 需要“禁用后不再重试”或跨启动记忆：把禁用列表写进 `settings.json`/独立文件，
  补迁移与 E2E，不要把状态塞进 manifest。
- 若贡献点需要异步/事务性批量注册（例如插件从文件加载多个贡献后一次提交）：给注册表加
  `transaction()` 或批量 API，并让订阅只发一次。
- 若插件需要读取其他插件的贡献或替换他人的贡献：先明确信任模型与冲突策略，再放宽 owner 规则。
- 若 table-engine 的导入数据集形状变化：同步 `ImportResult` 与 T6.3 适配器，并更新 SPEC §14.2。
- 若 v2 引入动态加载/权限：本 ADR 的 owner/subscribe 可作为基础，但权限校验与沙箱必须另写 ADR。

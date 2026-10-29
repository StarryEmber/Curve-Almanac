# ADR-050 T5.5 的应用程序设置、自动保存开关与国际化收口

- 状态：已接受
- 日期：2026-10-29
- 相关：SPEC §12、§13.3、§15.1、§15.4、§16.3、§16.4；TASKS T5.5；ADR-013、ADR-048、ADR-049

## 背景

T5.5 之前，主题与语言由 renderer 直接写 `localStorage`（`curve-studio.theme` /
`curve-studio.locale`），没有设置对话框，也没有 `app:settings` 通道；`autosave` 字段虽然存在于
`WorkspaceSettings`（SPEC §6.5），但保存队列始终开启，SPEC §12 的“保存/放弃/取消”三选一尚未
实现（ADR-048 复核条件）。同时 en-US 消息表已随各任务补齐，但缺少“缺失 key 在开发模式报错”的
运行时约束，文案审计也只拦中文字面量，未覆盖 `aria-label`/`label` 等属性。

T5.5 需要在不改 `formatVersion`、JSONL、manifest 字段与 `WorkspaceSettings` 形状的前提下，
补齐：设置对话框（主题、语言、默认表格样式、自动保存）、设置持久化、语言即时切换、完整英文
文案、全量文案审计与“文案 +30% 不破布局”。

## 决定

### 1. 设置文件与归属

- 应用级设置落在 `userData/settings.json`（与 `recent.json`、`window-state.json` 同级），
  结构为 `AppSettings { version: 1, theme, locale, autosave, defaultTableStyleId }`。
- `AppSettings` 与 `normalizeAppSettings` 放在 `apps/desktop/src/shared/contracts/settings.ts`：
  不依赖 Electron/React，main、renderer 与 preload 的类型可共享。
- 读取时逐字段回退：缺失/损坏/非法字段使用默认值，未知字段忽略；损坏 JSON 只记 warn，不阻断
  启动。写入使用 `write-file-atomic`（临时文件 + fsync + rename），并用 promise 链串行化。
- 写入失败时内存保留用户刚选的值并抛 `E_FS_WRITE`；重启回退到上一次成功写入的文件。设置对话框
  在失败时显示错误，不假装已持久化。

### 2. IPC 与 Preload

新增两个通道（`ALL_IPC_CHANNELS` 22 → 24，已实现 19 → 21）：

| 通道 | 请求 | 响应 |
|---|---|---|
| `app:settings` | `{}` | `AppSettings` |
| `app:settings:update` | `{ settings }` | `AppSettings`（规范化后） |

- main 在 `start()` 中先 `await settingsStore.load()` 再创建窗口与注册 handler；handler 返回
  内存中的设置，不在每次读取时重新读盘。
- main 用 Zod 校验入参/响应，renderer 的 `api-client` 再次校验；preload 只暴露
  `app.settings()`/`app.updateSettings(settings)` 两个白名单方法，不暴露路径或泛 invoke。
- `app:settings:update` 不接收文件路径；设置文件位置完全由 main 的 `app.getPath('userData')`
  决定，E2E 的 `CURVE_E2E_USER_DATA` 仍只影响未打包测试进程。

### 3. 工作区 manifest 的关系

- 主题、语言、自动保存以应用设置为准；manifest 的 `settings.theme/locale/autosave` 保持
  SPEC §6.5 的 v1 形状，作为创建时的快照，不在每次偏好变更时重写，也不进入撤销历史。
- 默认表格样式是**工作区数据**（SPEC §6.5 的 `settings.defaultTableStyleId`）：
  - 有工作区时，设置对话框调用既有 `style.apply { styleId, target: { kind: 'default' } }`，
    因此可撤销、只写 manifest，并沿用 T3.5 的 action/`committed` 语义；
  - 没有工作区时，对话框只提供内置模板，写入 `AppSettings.defaultTableStyleId`；
  - 新建工作区时 `FileWorkspaceStore` 把应用设置作为 `createEmptyManifest` 的初始
    `settings`，已有工作区保留自己的 manifest 值。
- 不新增 `workspace.settings.update` 命令；避免为“偏好”产生第二条写 manifest 路径。
- 应用设置中的 `defaultTableStyleId` 只接受内置模板 id（`builtin.*`）；用户样式是工作区数据，
  不能成为跨工作区的种子。

### 4. Provider 组合与首帧

- `SettingsProvider` 是最外层 provider；`I18nProvider`、`ThemeProvider` 变为**受控**组件
  （新增可选 `locale`/`onLocaleChange`、`mode`/`onModeChange`；保留既有 `initialLocale`/
  `initialMode` 供测试与独立使用）。
- `main.tsx` 在 `createRoot` 前读取一次 `app:settings`，把 `initialSettings` 传给 `<App>`；
  1.5s 超时或桥不可用时回退默认值，首帧不会因设置通道故障而空白。
- `localStorage` 仍写入主题/语言作为独立 provider 的兜底与迁移镜像，但**不是**应用的实际
  持久化来源；`settings.json` 是唯一权威。
- `AppCoreProvider` 把 `settings.autosave` 传给 `createAppCore({ autosaveEnabled })`，并在
  设置变化时调用 `core.setAutosaveEnabled()`，不重建 store/Worker。

### 5. 自动保存关闭

- `SaveQueue` 增加 `autosaveEnabled`、`setAutosaveEnabled()`、`isAutosaveEnabled()`、
  `hasUnsavedChanges()`；`SaveState` 增加 `unsaved: boolean`。
- 关闭时 `enqueue`/`enqueueManifest` 只入队并发布 `status: 'unsaved'`，不安排 1.5s/10s 定时器；
  `flush()`/`retry()`（Ctrl/Cmd+S、退出握手、显式 action）仍立即写。显式 action（粘贴、导入、
  样式提交、图表提交）继续在返回前 `flush()`：这些操作本身需要写盘结果，因此“自动保存关闭”
  抑制的是后台定时写，不是用户显式提交的落盘。
- 关闭窗口/关闭工作区时，若自动保存关闭且 `save.unsaved` 为 true，renderer 显示
  `UnsavedChangesProvider` 的“保存并继续 / 放弃修改 / 取消”模态框：
  - 保存：走 T5.3 的 `flushSaves()` → `workspace.close`（删 `.lock`）→ 退出回复；
  - 放弃：不 flush，直接 `workspace.close` 丢弃内存修改（用户明确选择）；
  - 取消：窗口/工作区保持打开，退出握手回复 `action: 'cancel'`。
- main 的退出握手新增动态超时：自动保存开启仍为 3s；关闭时为 60s
  （`UNSAVED_QUIT_TIMEOUT_MS`），避免原生“退出/取消”确认在用户阅读三选一对话框时弹出。
- `closeWorkspace({ save: false })` 是 `WorkspaceActions` 的新可选参数，默认保持原行为；
  只有三选一里的“放弃”会传 false。
- 强杀仍允许丢最后 1.5s（自动保存开启时）或不保存（关闭时），恢复对话框语义不变。

### 6. 国际化收口

- en-US 消息表在本任务做完整审计：与 zh-CN 的 key 集完全一致、无空文案、除 `language.zh-CN`
  外无 CJK 残留；新增设置/未保存对话框/状态栏文案同时补齐两种语言。
- `translateKey` 抽出为可测函数：开发构建（`import.meta.env.DEV`）缺失 key 直接抛错；生产构建
  回退 zh-CN，避免旧包因文案缺项崩溃。`createTranslator` 不改变调用方式。
- `ui-conventions.test.ts` 的文案门禁扩展到用户可见的 JSX 属性（`aria-label`、`title`、
  `placeholder`、`label`、`hint`、`error` 等）；唯一允许的字面量是颜色格式提示 `#RRGGBB`。
- 伪本地化（+30% 文案）在真实 Electron 中按 200% 缩放冒烟：先切 en-US，再对全部可见文本节点
  追加 30% 自身副本，断言页面无横向溢出、设置对话框面板在视口内（内容可纵向滚动）。

## 代价

- 应用设置与 manifest 的 `settings` 存在两份快照：manifest 的 theme/locale/autosave 在创建后
  不再随应用偏好更新；读取方必须知道“应用偏好以 settings.json 为准”。保留字段是为了不破坏
  v1 格式与既有夹具。
- 启动多一次 IPC（`app:settings`）与 1.5s 兜底；实测对本机冷启动预算影响可忽略。
- 自动保存关闭时，显式 action 仍会 flush；若用户期望“只有 Ctrl+S 才写盘”，需要另加队列模式，
  见复核条件。
- 设置写入失败只在对话框内提示；主题/语言已乐观生效，用户可能直到重启才发现未持久化。
- main 的原生退出确认/恢复提示仍是英文（main 无 i18n），与 ADR-048 的残留一致。
- 伪本地化通过 DOM 文本节点注入，不是真正的语言包；它验证布局韧性，不验证翻译质量。

## 影响

- 新增文件：`shared/contracts/settings.ts`、`main/settings/app-settings-store.ts`、
  `renderer/features/settings/{SettingsProvider,SettingsDialog}.tsx`、
  `renderer/features/workspace/unsaved-changes.tsx`、`e2e/settings.spec.ts`、本 ADR 与
  `docs/reports/t5.5/`。
- 修改：`shared/contracts/{channels,ipc}.ts`、`preload/api.ts`、`renderer/api-client.ts`、
  `main/{index,ipc/handlers,quit-guard}.ts`、`main/workspace/file-workspace-store.ts`、
  `packages/persistence/src/manifest.ts`、`packages/app-core/src/{app-core,state/*,usecases/*}`、
  `renderer/{App,main,shell/*,i18n/*,theme/*}`、`styles.css`、`e2e/fixtures` 之外的测试与文档。
- `formatVersion`、JSONL、CSV/PNG 格式、CSP、Electron 安全选项不变；不新增运行时依赖。

## 复核条件

- 若需要“每个工作区覆盖应用主题/语言”或“切换工作区时恢复该工作区的偏好”，需新增
  manifest 读取优先级与迁移 ADR；当前应用设置全局唯一。
- 若产品要求自动保存关闭时显式 action 也不落盘，需要给 `SaveQueue.flush` 增加模式，并让
  paste/import/style/chart action 使用“仅在自动保存开启时 flush”的变体，同时重新定义
  `committed` 语义。
- 若原生主进程对话框必须本地化，需要 main 侧 i18n（语言来源可复用 `settings.json`），并补
  E2E 替身。
- 若语言数 ≥5 或需要复数/命名空间/按需加载，按 ADR-013 复核条件重新选型。
- 若设置文件需要跨版本迁移，`version` 字段已预留；升级时新增迁移与夹具，不得静默改字段。

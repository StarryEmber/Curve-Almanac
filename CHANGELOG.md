# Changelog

本文件记录 Curve Studio 的所有重要变更。格式参考 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.1.0/)，
版本号遵循 [SemVer](https://semver.org/lang/zh-CN/)。应用代码尚未发布（0.x），条目按任务 ID 归档在 `Unreleased` 下。

## [Unreleased]

### Added

- T0.1：初始化 pnpm monorepo（`apps/*`、`packages/*`、`plugins/*`）与 Node/pnpm 版本约束。
- T0.1：TypeScript strict 基线（`noUncheckedIndexedAccess`、`noImplicitOverride`、`noUnusedLocals`、
  `noUnusedParameters`）与 `@curve/*` 路径映射。
- T0.1：ESLint 9 flat config（typescript-eslint、react-hooks、import/order）、Prettier、Vitest 与覆盖率门禁。
- T0.1：dependency-cruiser 边界规则，落实 SPEC §4.3 的七条依赖约束。
- T0.1：9 个包骨架（`domain`、`table-engine`、`chart-model`、`chart-echarts`、`persistence`、
  `plugin-sdk`、`ui`、`app-core`、`desktop`）与包级 smoke 测试。
- T0.1：`CHANGELOG.md`、`docs/adr/README.md` 与 ADR-017。
- T0.2：Electron 三进程骨架（`apps/desktop/src/{main,preload,renderer}`）与 `electron.vite.config.ts`，
  main/preload 输出 CJS（`out/main/index.cjs`、`out/preload/index.cjs`）。
- T0.2：安全窗口工厂（`contextIsolation`/`sandbox`/`webSecurity`/`nodeIntegration: false`，窗口选项有单测）、
  `will-navigate` 与 `setWindowOpenHandler` 全拒绝、权限请求全拒绝、`will-attach-webview` 拒绝。
- T0.2：生产/开发两套 CSP（构建期注入 `<meta>`），生产策略与 SPEC §15.3 逐字一致。
- T0.2：`app:info` IPC 通道与类型化 preload 桥（`window.api.app.info()`，无 `invoke` 泛入口）。
- T0.2：菜单骨架（DevTools/Reload 仅开发模式）、窗口尺寸记忆（`userData/window-state.json`，
  离屏回退 1440×900 居中）、E2E 专用 userData 重定向钩子。
- T0.2：Playwright Electron E2E（TESTPLAN E1 五条 smoke）+ 截图证据
  `docs/reports/m0/t0.2-window.png`、`t0.2-dev-window.png`。
- T0.2：ADR-018（开发模式 CSP 为 Fast Refresh 放宽）与 SPEC §15.3 同步。
- T0.3：`ErrorCode`/`AppError`/`appErrorSchema`/`toAppError` 迁入 `@curve/domain`
  （`zod` 成为该包唯一运行时依赖），新增 `packages/domain/src/errors.ts` 与 16 条单测。
- T0.3：类型化 IPC 契约 `apps/desktop/src/shared/contracts/`：`channels.ts`（SPEC §15.1 的 18 个通道名，
  零依赖）、`envelope.ts`（`IpcResult` 与 `isIpcResult`）、`ipc.ts`（每个已实现通道的 Zod 请求/响应 schema、
  `AppInfo`/`LogWriteRequest`/`CurveApi`）。
- T0.3：main 的 IPC 注册与分发 `src/main/ipc/{dispatch,register,handlers}.ts`：256MB 载荷上限、
  入参校验失败 → `E_IPC_INVALID_PAYLOAD`、异常统一映射（不泄露堆栈）、响应契约校验、重复注册抛错。
- T0.3：`log:write` 通道与 `log.write` preload 方法；`window.api` 仍只暴露 `app.info`/`log.write`，
  无 `invoke`/`send` 泛入口。
- T0.3：renderer 的 `api-client`（入参与响应双向校验）、`error-text`（按 code 出文案，不回显
  `message`/`detail`）与 toast 骨架（T0.4 替换为 `@curve/ui`）。
- T0.3：TESTPLAN §1.1 对话框替身 `resolveE2EDialogStubs`（仅未打包 + `CURVE_E2E=1` 生效）。
- T0.3：E2E `apps/desktop/e2e/ipc.spec.ts` 四条（桥方法白名单、正常路径、非法载荷后进程存活、
  真实已注册通道集合）。
- T0.4：`@curve/ui` 设计令牌 `tokens.css`（58 个 `--cs-*`，浅/深两套，深色覆盖全部颜色与阴影）与组件样式
  `ui.css`（只消费令牌）。
- T0.4：`@curve/ui` 组件 Button/Input/Select/Dialog/Toast/Menu/Tabs；图标按钮在类型层强制 `aria-label`，
  Dialog 提供焦点陷阱/Esc/焦点恢复，Menu 与 Tabs 实现 APG 键盘契约，Toast 提供自动消失与 `useToasts`。
- T0.4：App Shell `apps/desktop/src/renderer/shell/`：标题栏（产品名/工作区胶囊/面板折叠/主题菜单/帮助）、
  标签式侧栏、主区空态、检查器、状态栏与跳转链接；CSS Grid 三行三列，DOM 顺序即键盘顺序。
- T0.4：渲染端 i18n `i18n/messages/{zh-CN,en-US}.ts` + 类型化 `t(key, params)`（ADR-013），默认 zh-CN、
  可切换 en-US 并持久化；SPEC §18 全部 26 个错误码都有本地化文案（`describeAppError(error, t)`）。
- T0.4：浅/深色骨架 `ThemeProvider`（light/dark/system、跟随系统变化、首帧前应用 `data-theme`）。
- T0.4：令牌与对比度测试、`apps/desktop/test/ui-conventions.test.ts` 文案/颜色门禁、
  `apps/desktop/e2e/shell.spec.ts` 六条（结构、面板折叠、纯键盘、200% 缩放、浅深截图、中英切换）。
- T0.4：截图证据 `docs/reports/m0/t0.4-shell-light.png`、`t0.4-shell-dark.png`。
- T0.5：CI 工作流 `.github/workflows/ci.yml`：`quality` 任务在 Windows + Ubuntu 矩阵上跑
  `install --frozen-lockfile` → `lint` → `typecheck` → `test:coverage` → `build`（覆盖率阈值即门禁），
  `e2e` 任务仅在 Windows 上跑 `pnpm e2e` 并依赖 `quality`；pnpm store 缓存、Node 24、并发取消旧运行。
- T0.5：E2E 失败证据：`playwright.config.ts` 声明 `trace: 'retain-on-failure'` 与
  `screenshot: 'only-on-failure'`，CI 失败时上传 `apps/desktop/test-results` 与 `apps/desktop/playwright-report`；
  `e2e/fixtures.ts` 额外录制 browser-context trace（DOM snapshot + screencast），仅失败时保留并 attach。
- T0.5：`.github/pull_request_template.md`（任务 ID、验证命令结果、证据、风险/回滚、不可做清单自查）。
- T0.5：根 `postinstall` 与 `scripts/install-electron.mjs`：`electron@44.9.0` 不再自带下载脚本，干净克隆或 CI
  安装后补装匹配版本的 Electron 运行时（已存在则跳过，尊重 `ELECTRON_MIRROR`/`ELECTRON_CUSTOM_DIR`）。
- T0.5 / M0：`docs/reports/m0/REPORT.md`（M0 验收演示、干净克隆、失败留证与遗留问题汇总）；
  `t0.2-window.png` 与 `t0.4-shell-dark.png` 随本次 E2E 刷新。
- T1.1：`@curve/domain` 领域模型 `types.ts`（SPEC §6 全部类型）与 `limits.ts`（SPEC §2.2 上限常量）。
- T1.1：`schemas.ts` 全部 Zod schema（column/table/row/view/chart/style/manifest）与
  `parseManifest`/`parseTableMeta`/`parseColumnDef`/`parseRow`/`parseCell`；解析返回结构化 issue
  （`path` + SPEC §18 code），不抛裸异常。
- T1.1：`factories.ts` ID 工厂（`ws_/tbl_/col_/row_/cht_/viw_/sty_/rule_` + UUID，可注入）与 ISO 时间戳。
- T1.1：`invariants.ts` 实现 SPEC §6.6 全部不变量（`checkTable`/`checkInvariants`/`assertInvariants`），
  可修复项以 warnings 返回。
- T1.1：`coerce.ts` 按 SPEC §8.1 归一（千分位、日期、布尔、枚举、必填）；`format.ts` 提供数字/日期/布尔/枚举
  的显示基线。
- T1.2：`@curve/persistence` 的 `WorkspaceStore` 端口（create/open/close/readTable/writeTable/writeManifest/
  trash/listBackups/restore）、`MemoryWorkspaceStore`，以及布局、名称清洗、备份命名/轮转、相对路径校验等纯函数。
- T1.2：main 的 `FileWorkspaceStore`：`fs.realpath` 路径白名单、`write-file-atomic` 原子写、表/manifest
  备份与轮转、`.lock` 生命周期、`.trash`、`userData/recent.json` 最近列表。
- T1.2：IPC `workspace:create/open/close/recent` 与 `manifest:write`（main handler、Zod 请求/响应契约、
  preload 白名单方法、renderer `api-client` 双向校验）。
- T1.2：E2E `apps/desktop/e2e/workspace.spec.ts` 四条（SPEC §7.1 布局与 open/recent/close、损坏 manifest
  不覆盖、未来版本拒绝、manifest:write）。
- T1.2：ADR-019（`write-file-atomic` 依赖）、ADR-020（create 目录语义）、ADR-021（备份命名/轮转/恢复路径）。
- T1.3：`@curve/table-engine` JSONL 编解码（SPEC §7.3）：`encodeJsonl`/`encodeJsonlWithStats`（逐行
  `JSON.stringify` + 一次性 `join`）、`decodeJsonl`（逐行解析、行号、每格 `parseCell`、8MB 行上限、
  BOM/CRLF/空行/重复主键/200k 行硬上限）、`countJsonlRows`（不解析的廉价计数）、
  `toJsonlAppError`（`E_TABLE_PARSE` + 行号，超限时为 `E_TABLE_LIMIT`）、`tableWriteLimitError`。
- T1.3：行集与脏表纯原语：`TableData`/`createTableData`、`diffRowCounts`/`reconcileRowCounts`、
  `diffTableRows`（含 `orderChanged`）、`DirtyTableTracker`（可注入时钟、单调 revision，ADR-023）。
- T1.3：Worker 协议 `table-engine/worker-protocol`（decode/encode 请求与响应判别联合 + 手写 guard）、
  `apps/desktop/src/renderer/table-io/{handler,client}.ts` 与 `workers/table.worker.ts`
  （`new Worker(new URL(...), { type: 'module' })`，请求 id 关联、超时、终止与错误兜底）。
- T1.3：IPC `table:read/write/trash`（Zod 请求/响应契约、main handler、preload 白名单方法、
  renderer `api-client` 双向校验）；`table:write` 走既有原子写并在写盘前校验 200k 行 / 256MB。
- T1.3：打开工作区时按磁盘内容重算每表 `rowCount` 并追加 warning（SPEC §7.5），缺文件语义按 ADR-022
  统一 File/Memory 两个适配器；新增 `E_TABLE_LIMIT` 写入路径。
- T1.3：E2E `apps/desktop/e2e/table-io.spec.ts` 三条（空表→3 行 JSONL 逐字读回→trash 中间态与
  `E_TABLE_NOT_FOUND`、IPC 边界拒绝路径形 id、生产 CSP 下加载真实 Worker 并解码）。
- T1.3：`scripts/bench.ts` 与 `tsx` devDependency：`pnpm bench -- --table-io` 固定种子生成 100k×10，
  测 `table.encode.100k`/`table.decode.100k`，写 `bench/report.json`（TESTPLAN §5.2 格式）。
- T1.3：ADR-022（缺文件语义与 `rowCount` 重算）、ADR-023（脏表追踪原语归属）。
- T1.4：`@curve/domain` 迁移框架：`Migration`/`MigrationResult`/`MigrationTables`/`MigrationRegistry`
  与结果类型、`createMigrationRegistry`（禁跳版、禁重复 `from`）、`resolveMigrationPath`、
  `runMigrations`（每步校验输出格式版本、孤儿表、到达当前版本时的 Zod 结构校验与 SPEC §6.6 不变量；
  失败返回结构化 `E_MIGRATION_FAILED`，绝不返回半迁移文档），以及空生产注册表 `MIGRATIONS`
  与 `CURRENT_FORMAT_VERSION`（ADR-024）。
- T1.4：main 迁移前备份与失败回滚 `apps/desktop/src/main/workspace/migration-backup.ts`：
  `backupTablesForMigration`（逐字节复制 `tables/` → `backups/migration-<ts>/`，同名时间戳 +1ms，
  复制失败删除半成品）、`restoreMigrationBackup`（copy → `.migration-restore` → rename，写回原字节并
  删除失败尝试新建的表文件）、`runWithMigrationBackup`（失败回滚并返回 `E_MIGRATION_FAILED`，
  `detail` 同时带迁移与回滚错误码）。
- T1.4：`@curve/persistence` 新增迁移快照目录命名纯函数 `migrationBackupDirectoryName`、
  `parseMigrationBackupDirectoryName`、`isMigrationBackupDirectoryName` 与
  `MIGRATION_BACKUP_DIRECTORY_PREFIX`（复用 ADR-021 的紧凑 UTC 时间戳）。
- T1.4：`fixtures/workspaces/{v1-min,corrupt-manifest,future-version,stale-lock}/` 夹具与各自 README
  （时间固定 UTC；`stale-lock` 的 `.lock` 内容固定并提交；`corrupt-manifest` 为故意截断的 JSON）。
- T1.4：夹具测试 `apps/desktop/src/main/workspace/workspace-fixtures.test.ts`：v1-min 打开成功且
  行内容逐行相等、锁写入/删除；future-version 在 Zod 之前以 `E_WS_VERSION_UNSUPPORTED` 拒绝且
  文件字节不变、不写锁；corrupt-manifest 返回 `E_WS_INVALID_MANIFEST`；stale-lock 触发提示并替换锁。
- T1.4：ADR-024（迁移框架归属、空生产注册表、备份/回滚语义、接线时点）。
- T1.5：`@curve/app-core` 的 vanilla Zustand store 与 `AppState` 切片（workspace/tables/views/ui）：
  表数据用 `Record<tableId, TableData>` 普通对象/数组保存，`actions` 提供选择、错误与脏表标记；
  10 万行不会整表深拷贝（ADR-025）。
- T1.5：同步命令总线 `createCommandBus`：命令注册/重复名校验、未知名与非法载荷统一返回 `AppError`、
  Immer `produceWithPatches` 生成 `patches`/`inversePatches`，失败不发布半成品状态；
  成功命令通过 `DirtyTableTracker` 刷新 `ui.dirtyTables`，并清空旧错误。
- T1.5：首个文档命令 `table.cell.set`：按列类型 `coerceCell`、主键非空/唯一校验、只替换目标行、
  更新表/工作区 `updatedAt`、提供 T5.2 用的 `mergeKey`；数值/文本/主键错误均映射为 SPEC §18 错误。
- T1.5：`workspace.open` 异步 use case（不是命令）：经 `WorkspaceStore` 读取 manifest 与各表 JSONL，
  `decodeJsonl` 后一次替换文档状态，按 layout 恢复活动视图/表；解码坏行不阻塞打开并进入 warnings，
  打开失败保持旧文档不变（ADR-025）。
- T1.5：选择器 `selectCurrentTable`/`selectVisibleRows`/`selectActiveView`/`selectDirtyTables`；
  100k 行测试断言重复调用返回同一行数组引用，手动实测首调约 0.03–0.05ms。
- T1.5：新增 `zustand@5.0.15`/`immer@10.2.0` 运行时依赖与 ADR-025；app-core 新增 25 条测试
  （含 v1-min 夹具、可逆 patches、失败不改文档、打开布局恢复与 100k 选择器）。
- M1：新增 `apps/desktop/src/main/workspace/m1-acceptance.test.ts`（3 条验收演示，驱动生产
  `FileWorkspaceStore` + `table-engine`）：创建 `Demo.cstudio` 写入 1,000 行、关闭后用新实例重开并
  逐行相等；篡改 manifest（截断 JSON / 悬空主键 / `formatVersion: 2`）均返回类型化错误且原文件字节
  不变；伪造 stale/corrupt `.lock` 触发警告与替换，活跃锁返回 `E_WS_LOCKED`。
- M1：`docs/reports/m1/REPORT.md`（验收演示、真实输出、门禁回归、遗留问题与待确认项）；
  `pnpm verify` 67 files / 557 tests、全局行覆盖 93.62%、`pnpm e2e` 22 passed。
- T2.1：工作区入口与表管理：欢迎页（新建/打开/最近）、新建/打开工作区对话框、可编辑路径与
  `dialog:pickDirectory`、表列表（新建/重命名/删除到 `.trash`/打开）、标签栏（激活/关闭/Ctrl+W）、
  删除被引用表的级联计数确认。文案全部进入 zh-CN/en-US 消息表。
- T2.1：虚拟化数据网格 `features/grid/`：TanStack Table v8 + Virtual v3、只读单元格、行/列 ARIA、
  方向键/Tab/Home/End/PageUp/PageDown、矩形选择、冻结列、列宽拖拽与双击自适应（持久化到
  `view.tableView.widths`）、列宽/冻结列选择器。
- T2.1：`@curve/app-core` 新增 `table.create`/`table.delete`/`table.meta.update`、
  `view.create/delete/update/layout` 命令、`WorkspaceActions`（立即写 manifest、删除后 trash、
  `openWorkspace` 注入 Worker 解码端口）与 `countTableReferences`；新增 22 条单测。
- T2.1：`apps/desktop` 接入 `@curve/app-core`（Provider/`useSyncExternalStore`、IPC
  `WorkspaceStore` 适配层、Worker 解码）、`dialog:pickDirectory` handler/preload/api-client/E2E 替身、
  `app:info.documentsDir`；新增 `e2e/grid.spec.ts` 8 条（欢迎页、表 CRUD/级联、键盘/ARIA/axe、
  列宽持久化、200% 缩放、100k 首帧与滚动帧率）。
- T2.1：依赖 `@tanstack/react-table@8.21.3`、`@tanstack/react-virtual@3.14.21`、测试专用
  `axe-core@4.14.0`；ADR-027 记录命令/保存时机/目录选择/Worker/依赖决定。
- T2.2：单元格编辑与校验：text/number/date/boolean/enum 原生编辑器、F2/双击/直接输入、Enter 下移、
  Tab/Shift+Tab、失焦提交、Esc 取消、IME composition 保护；只给 active cell 渲染编辑器。
- T2.2：`@curve/app-core` 新增结构化 `CellIssue`、共享 `checkTableCellSet`、`validateCellBatch`、
  `updateCell/undo/redo/retrySave/flushSaves`、`table.cell.set` 最小历史栈（800ms 合并、上限 100）
  与按表串行的保存队列（Worker encode → `table:write` → `manifest:write`，失败保留 dirty 可重试）。
- T2.2：状态栏保存三态（保存中/已保存/保存失败 + 重试）与错误定位“第 N 行 · 列 X：原因”；主键冲突
  显示冲突行号、滚动并高亮冲突行；编辑行通过虚拟列表 `rangeExtractor` 保留。
- T2.2：测试新增 `editor-value`、`CellEditor`、`cell-issue-text`、cell validation、edit history、
  save queue、updateCell/close-flush 用例，以及 `e2e/edit.spec.ts` 3 条；ADR-028 记录 8 项决策。

### Changed

- T0.1：按 ADR-017 调整 `docs/SPEC.md §5.2` 的 `lint` 脚本，使其同时执行 ESLint 与 dependency-cruiser。
- T0.2：`apps/desktop` 拆分为 node / web / e2e 三个 TS 工程（solution `tsconfig.json`），
  根 `tsconfig.json` 引用三者；移除已无引用的 `@curve/desktop` 路径映射。
- T0.2：ESLint 增加 renderer Node 边界（禁止 `process`/`require`/`Buffer`/`node:*`/`electron` 导入）。
- T0.2：Vitest 覆盖率排除三个进程入口（其行为由 E2E 覆盖），其余逻辑仍受门禁约束。
- T0.2：`package.json` 的 `e2e` 脚本改用 `apps/desktop/playwright.config.ts`。
- T0.2：`pnpm-workspace.yaml` 显式声明 `electron-winstaller: false`（v1 用 NSIS，不需要 Squirrel 安装脚本）。
- T0.3：删除 `apps/desktop/src/shared/ipc.ts` 与 `apps/desktop/src/main/errors.ts`
  （分别由 `shared/contracts/*` 与 `@curve/domain` 取代）；`src/main/index.ts` 改用 IPC 注册器与 `logger`。
- T0.3：`electron.vite.config.ts` 为 main 增加 `vite-tsconfig-paths`（SPEC §5.3），
  `apps/desktop/tsconfig.{node,web,e2e}.json` 增加对 `packages/domain` 的工程引用。
- T0.4：`App.tsx` 从运行态占位壳改为 `I18nProvider` + `ThemeProvider` + `AppShell` 组合；
  删除 T0.3 的 `renderer/toast.tsx` 骨架（由 `@curve/ui` 的 Toast 取代）。
- T0.4：`error-text.ts` 改为按 `code` 查消息表；`index.html` 默认 `lang="zh-CN"`。
- T0.4：`electron.vite.config.ts` 的 renderer 增加 workspace 路径解析与 react/react-dom `dedupe`；
  desktop 新增 `@curve/ui` 依赖与 web tsconfig 引用。
- T0.4：ESLint 为 `packages/ui` 启用浏览器 globals；新增 `apps/desktop/tsconfig.test.json`（Node 侧渲染
  测试工程，读源码做文案/令牌门禁）。
- T0.4：E1 smoke 的 `runtime-status` 断言改为与 `app:info` 的版本号比对（状态栏文案已本地化）；
  E2E 仍会刷新 `docs/reports/m0/t0.2-window.png`，该文件现在展示 T0.4 的 Shell。
- T0.5：`apps/desktop/playwright.config.ts` 增加 `outputDir`、`trace`/`screenshot` 策略、html 报告器与
  CI 下的 `forbidOnly`；`e2e/fixtures.ts` 在启动后开启 context trace，失败时保留证据。
- T0.5：覆盖率门禁接线到 CI（`pnpm test:coverage`），阈值（lines/statements/functions 70、branches 60）不变。
- T1.1：Vitest 覆盖率排除纯类型模块 `packages/domain/src/types.ts`（无语可执行语句，避免 0% 失真）。
- T1.2：SPEC §7.1/§7.4/§7.5、§9.0、§15.1 同步 create 目录语义与备份命名（ADR-020/021）。
- T1.2：`apps/desktop` 新增 `@curve/persistence` 工程引用与 `write-file-atomic` 运行时依赖；
  `@curve/persistence` 增加 `packages/domain` 工程引用。
- T1.2：`HandlerContract` 的输入类型改为 `unknown`（`safeParse` 接收跨进程原始载荷，schema 负责收窄）；
  `IMPLEMENTED_IPC_CHANNELS` 从 2 个扩到 7 个，`e2e/ipc.spec.ts` 的桥白名单同步。
- T1.2：Vitest 覆盖率排除纯类型模块 `packages/persistence/src/types.ts`（同 T1.1 的 `domain/src/types.ts` 处理）。
- T1.3：SPEC §7.5 补充 `rowCount` 重算边界与表文件缺失语义，§15.1 补充 `table:read/write` 的
  缺文件语义与写盘上限（ADR-022）。
- T1.3：`IMPLEMENTED_IPC_CHANNELS` 从 7 个扩到 10 个，`e2e/ipc.spec.ts` 桥白名单、`channels.test.ts`、
  preload `api.test.ts`、renderer `api-client.test.ts` 同步 `table` 命名空间。
- T1.3：`apps/desktop` 新增 `@curve/table-engine` 依赖与 node/web/e2e 工程引用；`electron.vite.config.ts`
  的 renderer 增加显式 `table-worker` 入口（T1.5 接入客户端后可移除），用于在 E2E 中验证生产 CSP。
- T1.3：Vitest 覆盖率排除 Worker 入口 `renderer/workers/*.worker.ts`（仅一条转发，行为由 E2E 覆盖）。
- T1.3：`.gitignore` 增加 `bench/`（`pnpm bench` 产物，CI 以 artifact 保留）。
- T1.4：SPEC §7.6 补充迁移实现边界（分层、`backups/migration-<ts>/`、每步校验、manifest 最后写）。
- T1.4：`.prettierignore` 排除故意截断的 `fixtures/workspaces/corrupt-manifest/manifest.json`，
  避免格式化工具"修好"坏夹具。
- T1.5：`@curve/app-core` 的 `tsconfig` 为测试读取 v1-min 夹具启用 Node 类型（生产代码仍不导入
  Node 内置）；Vitest 覆盖率排除 app-core 的两个纯类型模块。
- T1.5：dependency-cruiser 新增 app-core 禁止 React/Electron/ECharts 的边界规则；命令 bus 在模块入口
  `enablePatches()` 并按 ADR-025 关闭 Immer auto-freeze，避免首次编辑深冻结 10 万行表。
- T1.5：`docs/TASKS.md` 勾选 T1.5；ADR 索引登记 ADR-025。
- M1：用户确认接受 M1（2026-10-21）；SPEC §7.5 的完整恢复交互按 ADR-026 后置到 T5.3
  （自动保存、恢复与最近打开），T2.1 只呈现 warning、不新增恢复 IPC；同步 SPEC §7.5、
  TASKS T5.3、HANDOFF 与 AGENTS §0。
- T2.1：SPEC §13.1 新增 `table.create`/`table.delete`；§15.1/§15.4 的 `app:info` 增加
  `documentsDir`、`dialog:pickDirectory` 增加 `defaultPath`，并说明 `table:trash` 的删除顺序。
- T2.1：`FileWorkspaceStore.trash` 改为按 `tableId` 解析文件（manifest 已先删除仍可移动文件）；
  `electron.vite.config.ts` 删除显式 `table-worker` 入口，Worker 改由 Vite 产出
  `assets/table.worker-<hash>.js`，E2E 产物断言同步。
- T2.1：`apps/desktop/tsconfig.web.json` 增加 app-core/persistence 工程引用；`app:info`、
  `dialog:pickDirectory` 的契约测试与 E2E 桥面同步。
- T2.2：SPEC §9.2 增加结构化 `CellIssue`、主键冲突定位、日期/布尔/枚举编辑器与批量校验实现边界；
  §13.2 记录最小历史栈（T5.2 复用）；§13.3 记录“提交后立即异步保存”及 T5.3 的替换约束。
- T2.2：`stateToManifest` 从 `workspace-actions` 迁移到 `state/manifest.ts`（保存队列与 actions 共用）；
  `createAppCore` 增加 `encodeTable` 注入与 `onCommand` 观察者；`openWorkspace` 成功后清空历史与保存
  状态；`GridCell` 移除 `aria-readonly` 并接入编辑器/错误/冲突状态。
- T2.2：`docs/TASKS.md` 勾选 T2.2 并记录决策/文件/实测；新增 `docs/reports/t2.2/REPORT.md`、ADR-028；
  同步 HANDOFF、AGENTS §0 与 `docs/adr/README.md` 索引。

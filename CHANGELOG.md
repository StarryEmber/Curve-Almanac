# Changelog

本文件记录 Curve Almanac（原 Curve Studio）的所有重要变更。格式参考
[Keep a Changelog](https://keepachangelog.com/zh-CN/1.1.0/)，
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
- T2.3：列管理：右侧 Inspector 列面板（新增/编辑/删除/上移/下移/设为主键）、列表单（完整 `ColumnDef`、
  enum 选项编辑、key 由 label 派生）与共用破坏性确认对话框（影响行数/转换单元格/视图清理/图表失效）。
- T2.3：`@curve/domain` 新增纯计划 `planColumnAdd/Update/Delete/Reorder/PrimaryKeyChange`：加列补 `null`、
  改类型逐行 `coerceCell`、失败前 100 行整批取消、主键非空唯一校验、重排同步行数据；空值保持 `null`。
- T2.3：`@curve/app-core` 新增 `table.column.add/update/delete/reorder`、`table.meta.update(primaryKey)`、
  视图状态清理（`columnOrder/widths/hidden/sort/filter`、冻结计数）、`checkColumnDraft`、
  `inspectColumnChange`、图表缺列判定与 `addColumn/updateColumn/deleteColumn/reorderColumns/
  changePrimaryKey` actions；结构命令只产 patches、不接撤销历史。
- T2.3：图表在列被删后进入只读错误占位（“列已删除”+“不自动重映射”），完整图表/重映射留 T3.1；
  100 列上限由命令硬拒绝 + 面板禁用新增；E2E `schema.spec.ts` 8 条覆盖增列/改类型成败/删列+图表/换主键/
  上限/200% 缩放键盘可达；ADR-029 记录 10 项决策。

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
- T2.3：SPEC §9.7 新增列管理契约；§7.6 记录“T2.3 不升版/不接迁移”；§9.2/§13.1/§13.2/§13.3 增加
  结构命令、保存时机与撤销边界。
- T2.3：`Inspector` 由占位改为活动表列面板；`WorkspaceView` 接入 chart 错误占位；新增
  `features/columns/*`、`features/charts/ChartPlaceholder.tsx`、`e2e/schema.spec.ts` 与 zh-CN/en-US 文案；
  `styles.css` 只用 `--cs-*` 令牌。
- T2.3：`table.meta.update` 载荷改为可选 `name`/`primaryKey`（至少一个）；换主键走同一命令，重命名行为
  不变。
- T2.3：`@curve/app-core` 的 `ColumnActionOutcome` 在保存失败时带 `committed: true`（内存已变更、
  状态栏可重试），避免 UI 误判为未执行；行数据变更走 T2.2 保存队列，纯 schema 变更只写 manifest。
- T2.3：`docs/TASKS.md` 勾选 T2.3 并记录决策/文件/实测；新增 `docs/reports/t2.3/REPORT.md`、ADR-029；
  同步 HANDOFF、AGENTS §0 与 `docs/adr/README.md` 索引。
- T2.4：`@curve/table-engine` 新增 `parseClipboardText`（TSV 优先、单列含逗号回退 CSV、引号/`""`/
  内嵌换行/CRLF/BOM、矩形化、未闭合引号报错）。
- T2.4：`@curve/app-core` 新增 `table.paste` 与 `table.rows.insert` 命令；`PastePlanner`/`planPaste`
  整批预检（锚点、coerce、必填/枚举/主键唯一、空 text 主键生成、追加行、新增列、100 列上限）、
  `createPasteColumns`、`preparePaste/applyPaste`（筛选守卫、10k 分块取消、flush ≤3s）。
- T2.4：粘贴接入 T2.2 最小历史（一次一条，撤销回滚新增行/列与覆盖单元格）；`table.paste`/
  `table.rows.insert` 纳入保存队列。renderer 新增 `features/paste/*` 三个对话框与 `use-paste`，
  `DataGrid` 监听 `paste`、按选择矩形左上角锚定并高亮定位错误；`e2e/paste.spec.ts` 7 条。
- T2.4：SPEC §9.2/§9.3/§13.1/§13.2/§13.3/§16.1、TESTPLAN §2/§3/§5、TASKS T2.4/T2.6 同步；
  新增 ADR-030、`docs/reports/t2.4/REPORT.md` 与 ADR 索引；不新增依赖、IPC、`formatVersion`。
- T2.5：`@curve/table-engine` 新增 `import.ts`（CSV/JSON 嗅探、Papa Parse、类型推断、
  `planImport` 整批校验、前 100 issue、200k 上限）与 `papaparse` 运行时依赖。
- T2.5：`@curve/app-core` 新增 `table.import` 原子命令、`applyImport` action、
  `createImportColumns`/`autoMapImportColumns`；导入接入最小历史与保存队列，
  支持追加/替换、可选新列、一条撤销。
- T2.5：desktop 新增 `file:importText`（原始字节 + token）、`file:exportText`、
  `file:archiveImport` 三个已实现通道；main 的 100MB 限制、token 白名单、SHA-256、
  `imports/` 原文复制 + sidecar；preload/api-client 双向 Zod。
- T2.5：专用 import Worker（严格 UTF-8 → GB18030、Papa Parse、取消即 terminate）与
  5 步导入向导（编码/分隔符/表头覆盖、20 行预览、列映射、坏行跳过、追加/替换）；
  `e2e/import.spec.ts` 6 条。
- T2.5：夹具 `fixtures/csv/{small,quoted,types,bad-rows}.csv`、`fixtures/json/points.json`；
  `scripts/gen-100k.ts` 生成 gitignored 的 GBK 100k 文件；`pnpm bench -- --import` 增加
  8s 预算 case。
- T2.5：SPEC §4.2/§9.4/§13.1/§13.2/§13.3/§15.1/§15.4/§16.1、TESTPLAN E4/§4、TASKS T2.5、
  HANDOFF、AGENTS §0 同步；新增 ADR-031 与 `docs/reports/t2.5/REPORT.md`。
- T2.5：`formatVersion`、JSONL 形态、manifest 字段、CSP、沙箱与 preload 白名单不变。
- T2.6：`@curve/table-engine` 新增 `query.ts`（12 操作符、all/any、空值最后、三级稳定排序、
  `Intl.Collator` 语义与自然键快速路径、筛选/排序校验）与 `query-protocol.ts`（sync/query
  消息与守卫）；`MAX_SORT_LEVELS = 3` 落在 `@curve/domain`。
- T2.6：`@curve/app-core` 新增筛选草稿构建 `filter-builder`、视图状态校验 `view-state`、
  `duplicateView`（TabBar 复制当前视图）；`view.create/update` 校验筛选/排序/隐藏列；
  `table.paste` 增加可选 `rowIds/viewId`，筛选下只写可见行、超出整批拒绝、stale 检查。
- T2.6：desktop 新增专用 `query.worker` 与 `renderer/query/{client,handler}`（≤20k 主线程、
  >20k Worker、失败回退）、`use-view-rows`；`FilterDialog`、表头三级排序与排序菜单、
  Inspector 隐藏列/已隐藏列表、TabBar 复制视图；i18n 与 CSS 同步。
- T2.6：`e2e/filter.spec.ts` 6 条（筛选/三级排序、重开恢复、双视图、隐藏列、100k Worker、
  200% 缩放），并把 T2.4 的筛选粘贴 E2E 改为“只写可见行 + 超出拒绝”；
  `scripts/bench.ts --query` 新增 `query.100k` 与 `query.text-sort.100k`（400ms 预算）。
- T2.6：SPEC §9.3/§9.5/§13.1/§13.2/§16.1、TASKS T2.6、HANDOFF、AGENTS §0 同步；
  新增 ADR-032 与 `docs/reports/t2.6/REPORT.md`；不新增依赖/IPC，不改变 `formatVersion`、
  JSONL、manifest 字段、CSP、沙箱或 preload 白名单。
- T2.7：`scripts/bench.ts` 重写为多 suite 基准（`table-io` 的 open/save/encode/decode、
  `edit.commit.100k` 1,000 次提交、`query.100k`/ASCII/CJK 排序、`query.sync-clone` 诊断、
  `import.100k`），新增 `scripts/bench-report.ts`（报告/基线/20% 回归，11 条单测）、
  `scripts/tsconfig.json`（bench 纳入 typecheck）与 `bench/README.md`；`pnpm bench` 改为
  `node --expose-gc --import tsx`，suite 间显式 GC，支持 `--write-baseline`。
- T2.7：`scripts/gen-100k.ts` 增加共享 100k×10 工作区生成器（固定种子 42、CJK 站点/姓名列），
  bench 与 `pnpm e2e` 复用；`perf.spec.ts` 复制到测试输出目录后打开。
- T2.7：`@curve/app-core` 的 `table.cell.set` 改为在 base 状态校验并把新行数组冻结后替换
  （Immer 不再遍历 100k 行），提交 P95 409ms → 1ms；新增 `commands/frozen-rows.ts`。
- T2.7：`@curve/table-engine` 的排序计划预计算空值标志与比较键（`Uint8Array`/`Float64Array`），
  比较器不再逐次访问行对象（`query.100k` 447ms → 238ms、ASCII 文本排序 516ms → 338ms）；
  筛选谓词缓存列下标与规范化比较值；非 ASCII 文本改用参考 `numeric:true` collator
  （CJK 1.1s → 644ms），并按用户确认把全中文 100k 排序单列 **800ms** 预算。
- T2.7：新增 `apps/desktop/e2e/perf.spec.ts` 3 条（冷启动 ≤2.5s、100k 打开 ≤3s、
  整应用内存 ≤600MB + `data-query-total-ms` 趋势）；`fixtures.ts` 暴露
  `appLaunch.launchStartedAt`；renderer 增加 `curve:app-ready`/`curve:open` 打点，
  `DataGrid` 增加 `data-query-total-ms`，`use-view-rows` 在无查询时不再构建 100k `rowById`。
- T2.7：`FileWorkspaceStore` 打开路径不再为行数重算解码整表、`readTable` 直接读 UTF-8
  字符串；E2E 整应用 `privateBytes` 峰值 644MB → **570MB**（main 225MB → 135MB）。
- T2.7：CI 新增 `bench` 作业（Windows，预算硬失败 + 20% 回归 `::warning`，report artifact +
  Job Summary）；`.gitignore` 改为 `bench/*` 并放行 `bench/README.md`、`bench/baseline.json`；
  根 devDependencies 增加 `@curve/app-core`/`@curve/persistence`（bench 使用，workspace 包）。
- T2.7：SPEC §9.5/§16.1、TASKS T2.7、HANDOFF 同步；新增 ADR-033 与
  `docs/reports/t2.7/REPORT.md`；不改变 `formatVersion`、JSONL、manifest、IPC、CSP、沙箱、
  preload 白名单，不新增第三方运行时依赖。
- M2：新增 `apps/desktop/e2e/m2-acceptance.spec.ts`（单条端到端：新建工作区/表 → 粘贴
  200 行 → 导入 100k GBK CSV 并跳过 3 条坏行 → 筛选/3 级排序 → 列宽/冻结 → 退出并重启
  Electron → 断言界面与磁盘还原 + 性能预算）；`e2e/fixtures.ts` 新增 `launchCurveApp()`
  以同一 `userData` 重启。全量 E2E **64 passed**；导入 824ms、100k 打开 624ms、
  筛选 19ms、排序 63ms、整应用内存峰值 497MB。新增 `docs/reports/m2/REPORT.md` 与
  4 张证据截图；不改变生产代码、`formatVersion`、JSONL、manifest、IPC 或 CSP。
- M2：验收演示于 2026-10-23 获用户接受；TASKS/AGENTS/HANDOFF 同步，下一步 T3.1。
- T3.1：`@curve/domain` 新增 `table-style.ts`：4 个冻结内置模板（report-light/compact-light/
  dark/finance）、`DEFAULT_TABLE_STYLE_ID`/`DEFAULT_TABLE_STYLE`/`DEFAULT_TABLE_STYLE_TOKENS`、
  `resolveStyle`（未知 id 回退 + warning）、`forkTableStyle`（深拷贝、`sty_` 副本、内置不变）、
  `createTableStyle` 与 `isResolvableStyleId`。
- T3.1：样式颜色字段改为只接受 `#RGB`/`#RGBA`/`#RRGGBB`/`#RRGGBBAA`；不变量新增持久化
  `builtin: true` 拒绝、默认样式不可解析 warning、同一样式条件规则 id 重复拒绝。
- T3.1：`@curve/persistence` 与 `@curve/app-core` 的默认样式常量改为复用 domain；
  SPEC §6.6.6/§10.3、TASKS T3.1、HANDOFF、AGENTS §0 同步；新增 ADR-034。不改变
  `formatVersion`、JSONL、manifest 字段、IPC、preload、CSP 或运行时依赖。
- T3.2：`@curve/ui` 新增 `styleToCssVars`/`TABLE_STYLE_CSS_VARIABLES`（20 个
  `--cs-table-*`）、`TableStyleProvider`（直接作为网格 section）、`formatStyledCellValue`、
  `resolveCellAlign`/`resolveCellRender`/`columnDisplayLabel`、`computeBarRanges`/
  `barRatioForValue`/`enumBadgeTone`/`presentStyledCell`；`@curve/ui` 增加 domain workspace 依赖。
- T3.2：`DataGrid`/`GridCell`/`GridHeader`/`grid-sizing`/`WorkspaceView` 接入样式解析、密度
  行高、数字/日期/布尔/枚举格式化、列覆盖（对齐/宽度/标签/渲染模式）、enum badge 与数字 bar；
  `styles.css` 网格/工具栏/选择栏只消费表样式变量；`ui-conventions` 增加表变量白名单校验。
- T3.2：数字统一 `Intl.NumberFormat` 千分位、数字/日期默认右对齐、布尔本地化（zh-CN 是/否）；
  采用用户确认的“全局数字规则”，不扩展 `TableStyleTokens`、不改变 manifest/formatVersion。
- T3.2：新增 `apps/desktop/e2e/style.spec.ts`（4 个内置模板 + 1 个持久化用户样式；计算样式/
  格式化/宽度/bar 断言 + 截图证据）；`e2e/edit.spec.ts` 布尔断言更新；新增 ADR-035、SPEC §10.2、
  TASKS T3.2、HANDOFF 与 `docs/reports/t3.2/REPORT.md`。
- T3.3：`@curve/domain` 新增 `predicate.ts`（12 种比较的共享语义、`conditionCompareOps`、
  `prepareComparison`/`matchesPreparedComparison`）与 `condition.ts`（`createConditionalFormat`/
  `evaluateRules`，行/单元格目标、首条命中、缺失列忽略）；`@curve/table-engine` 复用同一原语，
  过滤器行为不变。
- T3.3：`@curve/app-core` 新增 `style.update`（仅 `sty_` 用户样式、manifest-only、规则 id 唯一）、
  `WorkspaceActions.updateTableStyle`、`SaveQueue.enqueueManifest` 与 workspace 作用域历史；
  undo/redo 只写 manifest，不标记脏表。
- T3.3：`@curve/ui` 新增 `conditionalCellStyle`；`GridCell` 应用条件背景/前景/粗体/斜体/icon，
  优先级为错误/冲突/选中 > 条件规则 > bar/斑马纹；条件背景覆盖 bar，行 icon 只在首个可见列。
- T3.3：`e2e/style.spec.ts` 增加条件规则视图（行/单元格目标、首条命中、禁用/缺失列、选中优先级、
  200% 缩放键盘冒烟）；`scripts/bench.ts` 增加 `condition.rules.50x100`（16ms 硬门禁）；新增
  ADR-036、SPEC §10.4/§13.1/§13.2/§16.1、TASKS T3.3 与 `docs/reports/t3.3/REPORT.md`。
- T3.4：`@curve/app-core` 新增 `style.create { style, viewId? }`（原子创建 `sty_` 副本并可选
  指向表视图）、`createTableStyle` action 与 `condition-builder.ts`（两层 all/any 草稿 ↔
  谓词、`conditionCompareOps` 校验、`coerceCell` 归一）；`style.create` 进入 workspace
  作用域历史与 manifest-only 保存队列。
- T3.4：检查器新增“列 / 样式”标签与样式摘要；新增宽对话框样式编辑器（令牌/模板/列覆盖/
  条件规则 + 前 50 行预览），文本/数字/颜色失焦或 Enter 提交、下拉/复选框/规则保存各一条
  撤销；非法值内联报错并阻止完成；预览复用 `TableStyleProvider`/`GridCell`/
  `presentStyledCell`/`createConditionalFormat`，实测 3ms/100ms。
- T3.4：`e2e/style.spec.ts` 增加键盘改密度/加规则、一次控件一次撤销、磁盘 manifest 断言、
  200% 缩放与 2 张编辑器截图；新增 ADR-037、SPEC §10.5/§10.6/§13.1/§13.2/§16.1、TASKS T3.4
  与 `docs/reports/t3.4/REPORT.md`；不改变 `formatVersion`、JSONL、manifest 字段、IPC、
  preload、CSP 或运行时依赖。
- T3.5：`@curve/domain` 新增 `style-export.ts`（`styleExportDocumentSchema`、
  `create/serialize/parseStyleExportDocument`、失败原因 `json/tooLarge/version/document`）与
  `cloneTableStyle`/`reassignStyleIdentity`/`styleCopyName`/`resolveStyleName`；导入文档总是
  重新分配 `sty_`/`rule_` id 并强制 `builtin:false`。
- T3.5：`@curve/app-core` 新增 `style.delete`（原子回退所有引用视图与工作区默认）与
  `style.apply { styleId, target }`（表视图/工作区默认），均 manifest-only 且进入 workspace
  作用域历史；新增 `deleteTableStyle`/`applyTableStyle`/`duplicateTableStyle` action 与
  `validation/style-import.ts`（解析、唯一名称、列引用收集、缺失列）。
- T3.5：检查器“样式”面板新增“模板管理…”对话框（应用/设为默认/重命名/复制/导出/删除/导入，
  删除确认列出受影响视图并显示回退结果）与导入预览对话框（真实前 50 行、缺失列提示、可选
  应用到当前视图）；编辑器新增“另存为模板…”并切换到新副本；`.curvestyle.json` 复用
  `file:importText`/`file:exportText`，未新增 IPC。
- T3.5：`e2e/template.spec.ts` 覆盖导出→重启→新工作区导入→应用（12 项计算样式一致）、删除
  回退与 Ctrl+Z 撤销、坏文件不污染 manifest、200% 缩放与键盘打开；`e2e/fixtures.ts` 增加仅
  测试使用的 `saveFile` 选项。新增 ADR-038、SPEC §10.5/§13.1/§13.2/§16.1、TASKS T3.5 与
  `docs/reports/t3.5/REPORT.md`；不改变 `formatVersion`、JSONL、manifest 字段、IPC、
  preload、CSP 或运行时依赖。
- T3.6：`@curve/table-engine` 新增 `csv-export.ts`（RFC 4180 转义、BOM 只一次、CRLF、
  raw 值、表头、分块生成、文件名清洗）；`@curve/domain` 的 `formatCellValue` 按
  locale/格式缓存 `Intl.DateTimeFormat`/`NumberFormat`，修复 100k 日期导出每单元格新建
  formatter 的性能问题。
- T3.6：新增 `file:exportCsv` 单通道四步协议（begin/append/finish/cancel，19→20；已实现
  14→15）与 main 的临时文件流式写入器（append→fsync→rename、取消/退出清理、token 校验）；
  preload/api-client/handlers 双向 Zod 覆盖，renderer 不传路径。
- T3.6：网格工具条“导出 CSV…”对话框（显示格式/原始值、当前筛选排序/全部行、行×列摘要、
  进度/取消/完成/错误、隐藏列与默认文件名提示）；显示格式复用 `formatStyledCellValue`，
  导出只读、不进撤销、不改 manifest/JSONL；`e2e/export-csv.spec.ts` 覆盖转义/筛选排序/
  原始值切换/100k 1,716ms 预算/取消无残留/200% 键盘；新增 ADR-039、SPEC §9.6/§15.1/§15.4/
  §16.1、TASKS T3.6 与 `docs/reports/t3.6/`。
- M3：新增 `apps/desktop/e2e/m3-acceptance.spec.ts`（单条演示，3 次启动）覆盖 4 个内置模板对比、
  样式编辑器（密度/表头色/列覆盖）、一次控件一条撤销、条件规则“高温标红”、另存模板、筛选/排序/
  冻结/列宽、CSV 导出、新工作区导入应用（12 项计算样式一致）与重启还原；报告
  `docs/reports/m3/REPORT.md` 与 10 张截图。
- M3：修复虚拟化行高不随样式令牌重测 —— 应用/编辑导致 `rowHeight` 变化时，TanStack Virtual
  仍沿用旧测量值，行高停留在旧值直到滚动/缩放；`DataGrid` 在 `rowHeight` 变化时调用
  `virtualizer.measure()`。M3 用例断言 `compact-light` 应用后行高立即为 24px（修复前为复现失败）。
  不改变数据格式、IPC、公共 API 或运行时依赖。
- M3：验收演示于 2026-10-24 获用户接受（复核：`pnpm verify` 143 files / 1232 tests、
  `pnpm build` exit 0、`pnpm format:check` 通过、`m3-acceptance.spec.ts` 1 passed、
  `pnpm e2e` 72 passed）；TASKS/AGENTS/HANDOFF 同步验收状态，下一步 T4.1。
- T4.1：`@curve/chart-model` 新增 `render-model.ts`：`resolveSeries(table, rows, spec, options?)`
  产出 SPEC §11.3 的 `RenderModel`（宽表每 Y 列一条系列、长表按系列列首次出现分组）；稳定
  系列 id（列 id / `<seriesColumnId>:<存储值>`）、重名 ` (2)`、enum label、空系列 `(空)`；
  映射校验（类型/角色/重复/缺列）与筛选/排序校验复用 `@curve/table-engine`；number/date X
  缺失行丢弃 + 聚合 warning、null 断点、重复 X 与 >20 系列 warning；`meta.sampled=false`、
  `sourcePoints=renderedPoints=非空 Y 值数`。
- T4.1：`palettes.ts` 提供 4 组 8 色调色板（含 Okabe–Ito 色盲友好）与 `auto` 背景解析
  （显式覆盖 > 主题 > light/dark > 白）；新增 `validateChartMapping`、`canBeChartX/Y/Series`、
  `MAX_CHART_SERIES = 20`；44 条单测 + 2 条黄金快照；`packages/chart-model/tsconfig.json`
  补齐 domain/table-engine 的 project references。新增 ADR-040、SPEC §11.3 实现边界、
  TASKS T4.1 与 `docs/reports/t4.1/REPORT.md`；不新增运行时依赖，不 import
  ECharts/React/Electron，不改 `formatVersion`/manifest/JSONL/IPC。
- T4.1：`pnpm verify` 144 files / 1276 tests；coverage 全局 lines 75.34% / branches 68.21%
  （`render-model.ts` 97.54% / `palettes.ts` 90.9%）；`pnpm format:check` 通过。
- T4.2：`@curve/chart-model` 新增 `sampling.ts`：`lttbIndices(x, y, target)`（升序原始下标、
  保留首尾非空点、null/非有限值不参与三角面积、`target<3` 退化、`target≥点数` 原样返回）与
  `sampleSeriesIndices(x, values, options)`（逐系列判定 `enabled && 非空点数 > threshold &&
  非空点数 > target`）；number/time 用存储数值、category 用行下标，采样只取子序列不重排。
- T4.2：`resolveSeries` 接入采样：采样后 `x.values` 取各系列保留下标的升序并集（未采样系列
  贡献全部非空下标，不因邻居采样丢点；被采样系列在其它系列位置为 null、非空点数 ≤ target），
  `meta.sampled` / `renderedPoints`（≤ `sourcePoints`）更新，warning 文本与顺序不变；
  未触发采样时保持 T4.1 原样输出。新增 ADR-041 与 SPEC §11.3 实现边界。
- T4.2：`pnpm bench -- --sample` 新增 suite：`chart.resolve-sample.100k`（100k×10、2 个 Y
  系列，含解析）P95 **93ms**/300ms、`chart.sample.100k`（单系列 100k→2k）P95 **4ms**/50ms，
  另加 `chart.resolve-unsampled.100k` 诊断（55ms）；根 `devDependencies` 增加 workspace 包
  `@curve/chart-model`（仅 bench 用）。
- T4.2：17 条采样单测（含 100k→2k、峰值保留、null 语义与属性测试）+ 9 条 RenderModel 集成
  用例；`pnpm verify` **145 files / 1302 tests**；coverage 全局 lines **75.55%** / branches
  **68.41%**（`sampling.ts` lines 93.24% / `render-model.ts` 96.96%）；黄金快照未变。
- T4.3：`@curve/chart-echarts` 从占位包变为唯一消费 `RenderModel` 的 ECharts 适配器；新增唯一
  运行时依赖 `echarts@^6.1.0`（安装 6.1.0），按需注册 Line/Scatter/Bar + Grid/Tooltip/Legend/
  DataZoom/Toolbox + CanvasRenderer（幂等，9 个 installer），不 import 全量入口。
- T4.3：`toEChartsOption(model, { locale? })` 纯函数（唯一 option 构造点）：`number`→`value`、
  `time`→`time`、`text`→`category`；类目轴 `xAxis.data` + 对齐数组，数值/时间轴 `[x, y]` 对；
  调色板/系列色、线宽/平滑/点/网格/图例/从零开始/精度逐项映射；tooltip（HTML + 用户文本转义、
  X 单位、Y 固定精度）、dataZoom（inside + slider）、toolbox 框选缩放；`animation: false`。
- T4.3：null 断点裁决（ADR-042 §3）：未采样 `connectNulls: false`（真实缺口断开，SPEC §11.2.4
  与 TASKS "null 断点不连 line"）；`meta.sampled=true` 时 `connectNulls: true`（ADR-041 的共享
  X 轴并集使"被采样略过"与真实缺口不可区分；真实缺口被连线是已接受代价）。适配器不再采样。
- T4.3：`createChartRenderer({ locale? })` 生命周期 `render/update/resize/dispose/toPNG`；`update`
  用 `setOption(..., { notMerge:false, replaceMerge:['series','xAxis','yAxis'] })`；空模型不创建
  实例；错误返回 `AppError`（`E_UNKNOWN`/`E_EXPORT_FAILED`）；`activeChartInstanceCount()` 证明
  dispose 无泄漏；`toPNG({ scale=2, background })` 返回 data URL（2x、排除 toolbox）。
- T4.3：`resolveChartTheme(background)` 按 WCAG 相对亮度推导 light/dark（颜色为与 `@curve/ui`
  令牌同值的常量，不 import `@curve/ui`）；`escapeHtmlText` 保证 tooltip 无 HTML 注入。
- T4.3：新增 dependency-cruiser 规则 `only-chart-echarts-imports-echarts` 与包内边界测试
  （扫描 `packages/*/src`、`apps/*/src`、`plugins/*/src`、`scripts` 与 workspace `package.json`）。
- T4.3：24 条 option 测试（含 6 条黄金快照）+ 15 条格式化 + 16 条生命周期（mock
  `echarts/core`）+ 6 条主题 + 2 条真实 ECharts SSR/SVG 冒烟 + 注册/边界测试；`pnpm verify`
  **152 files / 1369 tests**；coverage 全局 lines **76.09%** / branches **69.04%**
  （`chart-echarts/src` lines **99.56%**）；`pnpm build` exit 0（renderer 1,618.04 kB 未变；
  `chart-echarts` 尚未被 renderer 引用）；`pnpm e2e` **72 passed**（3.2m）；`pnpm bench` exit 0。
  新增 ADR-042、SPEC §11.4 实现边界、TASKS T4.3 与 `docs/reports/t4.3/REPORT.md`；未改
  `RenderModel`/`formatVersion`/manifest/JSONL/IPC/preload/CSP。
- T4.4：`@curve/app-core` 新增 `chart.create { chart, view }`、`chart.update { chart }`、
  `chart.delete { chartId }` 命令与 `createChart/updateChart/deleteChart/duplicateChart/openChart`
  actions：manifest-only、workspace 作用域撤销；创建严格校验映射/筛选/排序并原子建视图入 layout，
  更新允许悬空映射用于修复、覆盖 `createdAt`、刷新 `updatedAt`、标题同步视图标题，删除级联
  视图/layout；`DEFAULT_CHART_OPTIONS`（sampling 5000/2000）与 `duplicateChartTitle` 在 app-core。
- T4.4：`@curve/chart-model` 扩展 `RenderModel`：`y?: { label?: string }`（来自
  `ChartOptions.yLabel`）与 `RenderStyle.connectNulls = sampled || layout === 'long'`；
  `@curve/chart-echarts` 适配器改为读 `style.connectNulls`、映射 `yAxis.name`、`grid.bottom` 72
  （X 轴名避开 dataZoom）。2 条 RenderModel 与 6 条 option 黄金快照有意更新（ADR-043）。
- T4.4：renderer 新增图表层 `features/charts/*`：侧栏图表列表（新建/打开/复制/重命名/删除）、
  新建向导（选表→映射→列→实时预览，非法映射禁用创建）、检查器四组（数据/映射/外观/坐标轴）、
  `ChartView`/`ChartCanvas`（首次 render + 120ms 防抖 update + resize + dispose，不重建实例）、
  列删除后的可操作错误态与内嵌重映射（共用 `ChartMappingFields`）、`data-chart-*` 渲染契约；
  删除 `ChartPlaceholder`，`Sidebar`/`Inspector`/`WorkspaceView` 接入图表视图。
- T4.4：desktop 新增 `@curve/chart-model`/`@curve/chart-echarts` workspace 依赖与 tsconfig
  references；`@curve/ui` 的 `SelectOption` 支持 `disabled`。未新增第三方运行时依赖，未改
  `formatVersion`/manifest 字段/JSONL/IPC/preload/CSP/`ChartSpec`。
- T4.4：`e2e/chart.spec.ts` 4 条（向导+四组检查器+重启、删列重映射、复制独立性、200% 键盘）；
  `e2e/schema.spec.ts` 的图表错误态改用 `chart-view[data-chart-state]` + `chart-error`。
  `pnpm verify` **159 files / 1434 tests**；coverage 全局 lines **75.89%**；`pnpm build` exit 0
  （renderer **3,209.97 kB**、CSS 70.66 kB）；`pnpm e2e` **76 passed**；`pnpm bench` exit 0。
  新增 ADR-043、SPEC §11.2–§11.5/§13.1/§13.2 实现边界、TASKS T4.4 与
  `docs/reports/t4.4/REPORT.md`（4 张截图）。
- T4.5：`@curve/chart-echarts` 新增瞬态交互 API：`getInteractionState()`（dataZoom 窗口/
  隐藏系列）、`dispatchInteraction({ toggle-series | zoom-by | reset-view })`（只走
  `dispatchAction`，异常不外抛）、`onInteractionChange()`（订阅 `datazoom`/
  `legendselectchanged`）；`toEChartsOption` 增加 `labels`（toolbox zoom/back）与 tooltip
  稳定类名 `cs-chart-tooltip`；6 条 option 快照有意更新。
- T4.5：图表视图工具栏（逐系列 `aria-pressed` 图例、放大/缩小/重置缩放、查看数据表、
  导出 PNG…）与 `data-chart-zoom-start/end`、`data-chart-hidden-series` 契约；canvas 宿主
  `role="img"` 的 `aria-label` 为标题/类型/系列数/点数摘要。交互状态不持久化、不进撤销。
- T4.5：三种空态 `data-chart-empty="no-table|unmapped|no-data"` 与行动按钮：删除图表…、
  配置映射（聚焦内嵌映射编辑器）、查看数据表（`openTable`）；`no-table` 为防御态（合法
  manifest 的缺失表是 invariant 错误，无法从磁盘打开）。
- T4.5：PNG 导出：`ChartCanvas.exportPng`（flush 防抖 + 两个动画帧后同步 `toPNG`）、
  `ChartExportDialog`（透明/白/深背景、固定 2x、`<标题>-<yyyyMMdd-HHmm>.png`、清洗/保留名/
  截断）、`file:exportText` 新增可选 `encoding:'base64'` + 主进程 `atomicWriteBytes`；不新增
  IPC 通道、不改 preload 白名单。`e2e/chart-interaction.spec.ts` 3 条（100k 图例/缩放/
  tooltip/resize + axe、PNG 三背景尺寸/像素 + 键盘/200%、空态行动）。
- T4.5：`pnpm verify` **161 files / 1474 tests**；coverage 全局 lines **76.26%** /
  statements 76.12% / branches 69.03% / functions 74.65%；`pnpm build` exit 0
  （renderer **3,238.36 kB**、CSS 72.19 kB）；`pnpm e2e` **79 passed**；`pnpm bench` exit 0。
  新增 ADR-044、SPEC §11.4–§11.6/§15.1 实现边界、TASKS T4.5 与
  `docs/reports/t4.5/REPORT.md`（3 张截图）。
- T4.6：`@curve/chart-model` 把解析拆成公开两步：`resolveChartData`（行集 → x/系列值/meta，
  不含颜色与样式）与 `renderChartModel`（palette/background/线宽/图例/精度/Y 轴名/kind）；
  `resolveSeries` 保持为二者组合、输出不变（黄金快照未动）。默认数值/时间 X 排序改为
  “坐标数组 + 下标排序”，无筛选时不再复制整表行，减少 100k 解析的临时分配。
- T4.6：renderer 新增 `chart-data-cache.ts`（容量 2、LRU、`rows` 引用 + 数据键双重命中；
  键不含样式字段与 `xLabel`）与 `useChartRenderStatus`（>20,000 行且缓存未命中时先渲染
  loading，再在 `setTimeout(0)` 中解析；小表/缓存命中同步）。`ChartView`/`NewChartDialog`
  各自持有缓存，卸载即释放；样式提交不再重新筛选/排序/采样。
- T4.6：性能诊断契约 `data-chart-pending`/`data-chart-resolve-ms`（chart-view）与
  `data-chart-update-ms`/`data-chart-update-count`/`data-chart-instances`（chart-canvas）；
  ECharts `datazoom`/`legendselectchanged` 的状态发布按 `requestAnimationFrame` 合并
  （每帧最多一次 React 更新），工具栏动作仍立即发布。
- T4.6：bench `sample` suite 更名 `chart`（`--chart`，`--sample` 保留别名），新增
  `chart.option.2k`（50ms）与 `chart.restyle.100k`（20ms，样式复用不重解析）；根
  `devDependencies` 增加 workspace 包 `@curve/chart-echarts`（仅 bench），
  `scripts/tsconfig.json` 增加引用与 `DOM` lib。`e2e/chart-perf.spec.ts` 2 条：100k 图上
  `resolve ≤300ms`、`update ≤200ms`、样式提交缓存命中、10 次连点缩放无 >50ms 长任务；
  5 次映射 + 6 次标签切换后实例数恒为 1、出现 loading、100k 图表工作区 private 470MB
  （切换后峰值 589–591MB，≤600MB）。
- T4.6：`pnpm verify` **163 files / 1505 tests**；coverage 全局 lines **76.47%** /
  statements 76.34% / branches 69.21% / functions 74.99%；`pnpm build` exit 0
  （renderer **3,251.27 kB**、CSS 72.31 kB）；`pnpm e2e` **81 passed**；`pnpm bench` exit 0。
  新增 ADR-045、SPEC §11.3/§11.5/§16.1 实现边界、TASKS T4.6 与
  `docs/reports/t4.6/REPORT.md`。
- T4.6（修复）：`FileWorkspaceStore.copyToBackup` 在 `backups/` 不存在时（复制/恢复的工作区、
  `scripts/gen-100k.ts` 生成的工作区）直接写备份会 `E_FS_WRITE`(ENOENT)，导致所有
  `manifest:write`/`table:write` 保存失败且 UI 只弹 Toast。现在写入前 `mkdir(recursive)`，
  `file-workspace-store.test.ts` 新增“备份目录缺失时保存仍成功”的回归测试；修复后 100k 图表
  11 次切换的 private 内存从 605–612MB 回落到 584–592MB。
- M4：新增 `apps/desktop/e2e/m4-acceptance.spec.ts`（单条验收演示，2 次启动）覆盖 TESTPLAN E6：
  同一张表建宽表 2 Y（2 系列/12 点）→ 切长表 `site`（3 系列/6 点）→ 图例/缩放/tooltip →
  vivid/线宽 4 重启保留 → 删除映射列后的 `missing-columns` 错误态与重映射 → 100k 采样图
  （先 loading，100000→2000，徽标“已采样”）→ PNG（1706×916 = 容器 2x、白底、文件名）→
  同一 `userData` 重启还原；报告 `docs/reports/m4/REPORT.md` 与 7 张截图。E6 第 3 步的
  缩放/图例按 ADR-044 为瞬态（重启复位 0–100/全选），调色板/线宽/映射保留；第 4 步的
  首尾点保留由 `chart-model` 的 `lttbIndices` 单测锁定。
- M4：`pnpm verify` **163 files / 1505 tests**；coverage 全局 lines **76.47%** /
  statements 76.34% / branches 69.21% / functions 74.99%；depcruise 447 modules /
  1874 deps / 0 violations；`pnpm build` exit 0（renderer **3,251.27 kB**、CSS 72.31 kB）；
  `pnpm e2e` **82 passed**（4.2m；M4 演示 8.6s）；`pnpm bench -- --chart` exit 0
  （chart.resolve-sample P95 64ms/300ms、chart.sample 3ms/50ms、chart.option.2k 1ms/50ms、
  chart.restyle.100k 0ms/20ms）；100k 图表 resolve 43ms、update 36ms、private 488MB。
  演示仅新增测试/报告并同步 TASKS/AGENTS §0/HANDOFF；无生产代码改动、无新增 ADR，
  不改 `formatVersion`/manifest/JSONL/IPC/preload/CSP。
- M4：验收演示于 2026-10-27 获用户接受，**M4 关闭**；接受依据为 `docs/reports/m4/REPORT.md`
  与 7 张截图、`pnpm verify` 163 files / 1505 tests、`pnpm e2e` **82 passed**、`pnpm build`
  exit 0、`pnpm bench -- --chart` exit 0。下一步 M5 从 T5.1（分栏布局与标签页）开始。
- T5.1：新增递归分栏与标签页：`LayoutView` 直接渲染 `LayoutNode`，pane 拥有独立标签栏/活动
  视图，split 支持水平/垂直、0.2–0.8 比例与最多 4 pane；pane 的 UI-only 路径为
  `root`/`root.0`/`root.1`…，`ui.activePanePath` 只记焦点、不写 manifest。
- T5.1：分栏把当前 pane 替换成 `split(原 pane, 空 pane)` 并聚焦空 pane（不自动创建/移动
  视图）；标签可按视觉顺序“移动到下一分栏”，关闭最后一个标签折叠 pane，全部关闭保留一个
  空根 pane；“关闭分栏”只对空 pane 可用。分隔条可拖拽/方向键调比例，提交一条 `view.layout`。
- T5.1：纯布局变更（激活/打开已有视图/分栏/移动/比例）500ms 去抖写 manifest，
  `flushSaves`/关闭工作区/Ctrl+S 冲掉；视图新建/删除/更新仍立即写。`view.layout` 载荷增加
  可选 UI-only `activePanePath`；无新 manifest 字段、`formatVersion` 不变。
- T5.1：`@curve/persistence` 的 `parseManifestDocument` 在 layout 引用缺失/重复、比例越界、
  结构非法或 pane 数 >4 时用 `views[]` 重建单 pane 重试，成功则加
  `layout was invalid; restored a single pane with N view(s)` warning；其它 manifest 错误仍
  拒绝打开。
- T5.1：`apps/desktop/e2e/layout.spec.ts` 3 条（分栏/移动/比例/4 pane/重启、非法 layout 回退、
  键盘 + 200% 缩放）；`layout.test.ts` 9 条；`workspace-actions.test.ts` +2 条；
  `manifest.test.ts` +3 条。新增 ADR-046、SPEC §6.6/§12/§13.1 实现边界、TASKS T5.1 与
  `docs/reports/t5.1/REPORT.md`（4 张截图）。
- T5.1：`pnpm verify` **164 files / 1519 tests**；depcruise 450 modules / 1892 deps /
  0 violations；coverage 全局 lines **75.99%** / statements 75.84% / branches 68.82% /
  functions 74.49%（阈值 70/60 未下调）；`pnpm build` exit 0（renderer **3,273.65 kB**、
  CSS 74.30 kB）；`pnpm e2e` **85 passed**（4.3m；layout 5.2s/2.2s/2.5s）；`pnpm bench`
  exit 0。不改 `formatVersion`/JSONL/IPC/preload/CSP，不新增运行时依赖。
- T5.2：`EditHistory` 由白名单改为**全命令历史**：所有产生 Immer patches 的命令默认入栈；
  `view.layout` 仅在布局树（忽略 `activeViewId`）变化时记录，纯标签/焦点切换瞬态且不清 redo；
  表/列/行/视图/样式/图表/工作区命令各一条；`table.cell.set` 保留 800ms/`mergeKey` 合并，
  redo 非空时不再并进旧条目。新增 `ui.history` 快照、`setHistoryState` 与
  `createEmptyHistoryState`。
- T5.2：历史上限为 **100 条或估算 256MB**（`DEFAULT_HISTORY_MAX_BYTES`）。估算按 UTF-16
  字符串、数组指针与对象开销计；100k 行数组与当前表共享时只计数组（约 800KB），import
  replace/删表/删列的独特旧行数组抽样 16 行外推；超限从最旧 undo 条目丢弃，单条超限也丢弃；
  不在热路径 `JSON.stringify` 100k 行。`sizeBytes()` 暴露两栈估算值。
- T5.2：undo/redo 复用 `SaveQueue`：行补丁 → 表 + manifest；纯 manifest 命令与删除表 redo →
  仅 manifest；删除表 redo 不重复 `trash`（可能留下无害孤儿文件）。打开/关闭工作区清空历史。
- T5.2：TitleBar 新增“编辑”`HistoryMenu`（撤销/重做显示命令名、Ctrl/Cmd 快捷键与禁用态）；
  `history-action-label.ts` 把命令名映射到中英文文案（未知命令回退“修改文档”）；不新增 IPC。
- T5.2：新增 `apps/desktop/e2e/undo.spec.ts` 3 条（5 次编辑→撤销 5/重做 3 + JSONL + 菜单，
  7.6s；标签/选择/滚动不入历史 + 焦点切换保 redo + 关闭/重开清空，3.7s；键盘打开菜单 +
  200% 缩放不越界，2.9s）；单测扩 `edit-history.test.ts`（100 步、256MB、100k 行估算、
  布局瞬态）、`workspace-actions.test.ts`、`column-actions.test.ts`、`chart-actions.test.ts`、
  `import-actions.test.ts` 与 `history-action-label.test.ts`。新增 ADR-047、SPEC §13.1/§13.2
  实现边界、TASKS T5.2 与 `docs/reports/t5.2/REPORT.md`（2 张截图）。
- T5.2：`pnpm verify` **165 files / 1532 tests**；depcruise 454 modules / 1913 deps /
  0 violations；coverage 全局 lines **76.21%** / statements 76.07% / branches 69.07% /
  functions 74.80%（阈值 70/60 未下调；`app-core/history/edit-history.ts` lines **90.99%**、
  branches 86.89%）；`pnpm build` exit 0（renderer **3,288.47 kB**、CSS 74.37 kB）；
  `pnpm e2e` **88 passed**（含 undo 3 条）；`pnpm bench` exit 0。不改 `formatVersion`/
  JSONL/IPC/preload/CSP，不新增运行时依赖。
- T5.3：`SaveQueue` 实现 SPEC §13.3 自动保存窗口：1.5s trailing 去抖 + 10s 上限（从第一次
  待写变更起），`flush()`/`retry()` 取消定时器立即写；表 → manifest 仍单循环串行，失败保留
  `ui.dirtyTables`/`ui.save.error` 并可重试。布局 500ms 去抖仍只调 `enqueueManifest()`，
  Ctrl/Cmd+S、关闭工作区、退出握手复用同一 `flushSaves()`。
- T5.3：main↔renderer 退出握手 `quit-guard.ts`：拦截 `BrowserWindow.close`/`before-quit`，
  `app:quit-requested` → renderer flush ≤3s（成功时 `workspace.close` 释放 `.lock`）→
  `app:quit-response`；失败/超时原生“退出/取消”确认，取消保持应用打开，`flushed: false`
  时故意保留 `.lock`。新增 preload `app.onQuitRequested/respondToQuit`、renderer
  `useQuitGuard` 与 E2E 确认替身 `CURVE_E2E_QUIT_CONFIRM`；应用改为
  `app.requestSingleInstanceLock()` 单实例。
- T5.3：崩溃恢复：新增只读 `workspace:inspect`（lock/manifest 状态 + manifest 备份列表）；
  `workspace:open` 增加可选 `recovery { acceptStaleLock?, manifestBackup? }`，显式备份先校验、
  备份损坏清单再原子重建；stale/corrupt 锁 + manifest 不可读时可用最新备份自动恢复。
  欢迎页新增恢复对话框（尝试恢复/直接打开/取消、备份列表与二次确认重建），取消不写任何文件。
  `createOpenWorkspace` 在逐表读取/解码失败时先关闭已打开工作区。
- T5.3：最近列表：`recent.json` 增加 `remove/clear`（大小写不敏感、原子写），实现
  `workspace:recent:remove|clear` 通道与 preload `workspace.recentRemove/recentClear`
  （SPEC §15.4 名称）；欢迎页每条最近工作区增加移除按钮，列表非空时可清空。
- T5.3：新增 `apps/desktop/e2e/autosave.spec.ts` 4 条与 `recovery.spec.ts` 4 条（1.5s 落盘/
  Ctrl+S/退出 flush/只读写失败重试/最近列表，`taskkill /F /T` 强杀恢复/stale+corrupt 锁/
  键盘 + 200% 缩放恢复对话框/损坏 manifest 备份重建），`grid.spec.ts` 的 stale-lock 用例改为
  经过恢复对话框；单测新增 `quit-guard.test.ts`、`use-quit-guard.test.tsx`、save-queue
  防抖/上限、file store 的 inspect/备份重建、m1-acceptance 恢复路径与 recent-list 移除/清空。
  新增 ADR-048、SPEC §7.5/§12/§13.3/§15.1/§15.4 实现边界、TASKS T5.3 与
  `docs/reports/t5.3/REPORT.md`（5 张截图）。
- T5.3：`pnpm verify` **167 files / 1569 tests**；depcruise 464 modules / 1967 deps /
  0 violations；coverage 全局 lines **76.05%** / statements 75.90% / branches 68.81% /
  functions 74.53%（阈值 70/60 未下调；`main/quit-guard.ts` lines **88.52%**、
  `renderer/app-core/use-quit-guard.ts` lines **93.75%**、`save-queue.ts` lines **89.15%**）；
  `pnpm build` exit 0（renderer **3,306.03 kB**、CSS 75.14 kB）；`pnpm e2e` **96 passed**
  （5.7m；autosave 5.0s/3.8s/4.1s/2.8s、recovery 6.0s/2.8s/2.7s/2.8s）；`pnpm bench` exit 0
  （table.open 347ms/3s、save 274ms/500ms、query 232ms/400ms、text-sort 284ms/400ms、
  cjk-sort 561ms/800ms、import 711ms/8s、condition 1ms/16ms、chart.resolve-sample 85ms/300ms）。
  不改 `formatVersion`/JSONL/CSP，不新增运行时依赖。
- T5.4：新增 renderer 键位注册表 `features/keymap/`：`APP_COMMANDS` 声明
  `{ id, labelKey, shortcuts, scopes, visibleInPalette, isEnabled, run }`，只调用既有
  `core.actions`/Shell 回调；作用域 `global/workspace/grid/chart` 表示可用上下文，网格/
  CellEditor/TabBar/分隔条/Menu/Dialog/Tabs 保留局部键盘，全局监听在 `window` 冒泡阶段跳过
  `defaultPrevented`/`repeat`/`isComposing`/可编辑目标。冲突检测按作用域交集在构造时抛
  `KeymapConflictError`；`grid`/`chart` 可在互斥作用域复用 Ctrl/Cmd+Shift+D。
- T5.4：命令面板 Ctrl/Cmd+K（`Dialog` + `Input` + listbox/`aria-activedescendant`），标签与
  命令 id 的子序列模糊搜索（无新依赖）、最近使用优先、禁用原因可见、↑↓/Home/End/Enter/Esc/
  鼠标可用；最近使用最多 8 条存 `localStorage['curve-studio.recent-commands']`，不写 manifest。
  帮助对话框的快捷键表由同一注册表生成；新增命令：F1 帮助、Ctrl/Cmd+S 保存、Ctrl/Cmd+B/
  Ctrl/Cmd+Alt+I 面板、Ctrl/Cmd+Alt+H/V/W/M 分栏/关闭/移动、Ctrl/Cmd+Shift+D 复制视图/图表。
- T5.4：内存门禁修复：第一版常驻面板 + AppShell 文档订阅让 100k 图表切换 private 峰值到
  605–615MB；改为 **AppShell 不订阅 store、面板只在打开时快照/挂载、执行前复查、最近使用
  延迟读取** 后，全量 E2E 该场景 **506MB**（isolated 509–519MB）。不改变 T4.6 的图表缓存/
  渲染契约。
- T5.4：新增 `apps/desktop/e2e/palette.spec.ts` 3 条（过滤/执行/最近/撤销，编辑器内 Ctrl+K
  与 Ctrl+V、禁用原因、F1/帮助、分栏与复制快捷键，200% 缩放 ↑↓/Home/End/无结果/侧栏）；
  单测新增 shortcut/keymap/command-search/recent-commands/commands/palette-model 与
  `CommandPalette.tsx`，App.test 增加 3 条集成用例；`@curve/ui` 的 `Input` 支持 ref。
  新增 ADR-049、SPEC §9.1/§13.2/§13.4/§16.3 实现边界、TASKS T5.4 与
  `docs/reports/t5.4/REPORT.md`（3 张截图）。
- T5.4：`pnpm verify` **174 files / 1634 tests**；depcruise 481 modules / 2028 deps /
  0 violations；coverage 全局 lines **76.74%** / statements 76.59% / branches 69.41% /
  functions 75.18%（阈值 70/60 未下调；`features/keymap` lines **90.27%**、branches 82.37%）；
  `pnpm build` exit 0（renderer **3,342.56 kB**、CSS **77.49 kB**）；`pnpm e2e` **99 passed**
  （7.4m；palette 3.1s/3.4s/3.1s；chart-perf private **506MB**）；`pnpm bench` exit 0
  （table.open 452ms/3s、save 394ms/500ms、query 258ms/400ms、text-sort 365ms/400ms、
  cjk-sort 603ms/800ms、import 862ms/8s、condition 1ms/16ms、chart.resolve-sample 81ms/300ms）。
  不新增 IPC/preload/manifest 字段/运行时依赖，不改 `formatVersion`/JSONL/CSP。
- T5.5：应用设置落地 `userData/settings.json`（`AppSettings { version, theme, locale,
  autosave, defaultTableStyleId }`）：main 逐字段回退缺失/损坏文件，`write-file-atomic` 原子写并
  串行化；新增 `app:settings` / `app:settings:update` 两个 IPC 通道（ALL 22→24、已实现 19→21）、
  preload `app.settings/updateSettings` 与 renderer 双向 Zod 校验。新工作区从应用设置继承
  `settings`，已有工作区保留 manifest 默认样式。
- T5.5：`SettingsProvider` 成为最外层，`I18nProvider`/`ThemeProvider` 受控；`main.tsx` 首帧前
  读取设置（1.5s 兜底）。标题栏“设置”与命令面板 `app.settings` 打开对话框，主题/语言/自动保存
  即时生效；默认表格样式在有工作区时走 `style.apply { target:'default' }`，无工作区时作为新
  工作区种子。
- T5.5：自动保存开关：`SaveQueue` 增加 `autosaveEnabled`/`setAutosaveEnabled`/
  `hasUnsavedChanges`，`SaveState` 增加 `unsaved`；关闭时不安排 1.5s/10s 定时器，关闭窗口或
  工作区弹出“保存并继续 / 放弃修改 / 取消”。新增 `UnsavedChangesProvider` 与
  `closeWorkspace({ save: false })`；main 退出握手在自动保存关闭时使用 60s 超时，取消保持打开、
  放弃直接释放 `.lock`。`flush()`/`retry()`/Ctrl+S 仍立即写。
- T5.5：国际化收口：en-US 与 zh-CN key 集一致、无空文案、除 `language.zh-CN` 外无 CJK；
  `translateKey` 在开发构建缺 key 时抛错（生产回退 zh-CN）；`ui-conventions.test.ts` 文案门禁扩展
  到用户可见 JSX 属性（`aria-label`/`title`/`placeholder`/`label`/`hint`/`error`）。新增设置、
  未保存对话框与状态栏文案。
- T5.5：新增 `apps/desktop/e2e/settings.spec.ts` 4 条（语言/主题/自动保存重启保留；自动保存
  关闭时关闭工作区的保存/放弃/取消；退出时取消保持窗口、保存后退出并重启读回；+30% 伪本地化
  + 200% 缩放布局），截图 `docs/reports/t5.5/`（4 张）；单测新增设置存储/契约/Provider/对话框/
  未保存守卫/save-queue 自动保存关闭/持久化种子/退出超时与 App 集成。
  新增 ADR-050、SPEC §12/§13.3/§13.4/§15.1/§15.4/§16.3/§16.4 实现边界、TASKS T5.5 与
  `docs/reports/t5.5/REPORT.md`。
- T5.5：`pnpm verify` **179 files / 1682 tests**；depcruise 492 modules / 2118 deps /
  0 violations；coverage statements 76.86% / branches 69.64% / functions 75.55% / lines 77.01%；
  `pnpm build` exit 0（renderer **3,365.14 kB**、CSS **77.89 kB**）；
  `pnpm e2e` **103 passed**（settings 4 条）；`pnpm bench` exit 0（table.open 301ms/3s、
  save 277ms/500ms、query 199ms/400ms、text-sort 276ms/400ms、cjk-sort 448ms/800ms、
  import 620ms/8s、condition 0ms/16ms、chart.resolve-sample 69ms/300ms）。不新增运行时依赖，
  不改 `formatVersion`/JSONL/CSV/PNG/CSP。
- M5 验收演示：新增 `apps/desktop/e2e/m5-acceptance.spec.ts` 1 条（约 20s，三次启动 + 一次
  `taskkill /F /T`），覆盖 2 表 3 视图 → 复制视图/水平分栏/移动标签 → 5 次编辑 + 撤销/重做 5 步
  → 提交 200 后强杀恢复（999 丢弃、200 保留）→ 最近列表重开 → 英文/深色 → 重启全部还原。
  报告 `docs/reports/m5/REPORT.md`（7 张截图 + `m5-metrics.json`）；全量 E2E **104 passed**
  （6.2m，M5 1 条 20.2s）。**2026-10-29 获用户接受，M5 已关闭；M6 未开始**，等用户明确指示后再
  领取 T6.1。
- T6.2：示例插件落地（ADR-053）。新增 `plugins/plugin-sample`（`@curve/plugin-sample`，只依赖
  `@curve/plugin-sdk` 与 `@curve/domain`）：`rating` 语义字段类型（id `com.curvealmanac.rating`，
  storageType `number`，`★` 格式化，1–5 校验，nulls-last 比较）与 points JSON 导入器
  （id `com.curvealmanac.points`，接受 `{"points":[…]}` 或点对象数组）；插件定义
  `com.curvealmanac.sample` 由 `apps/desktop/src/renderer/plugins/index.ts` 静态导入并在首帧前
  `activateAll()`。列对话框新增“语义类型”下拉（只列 storageType 匹配的类型、换类型清空）与列表
  徽标；导入向导第 1 步新增“导入器”下拉，插件导入器在渲染进程解码+解析、内联规划（内置
  CSV/JSON 仍走 Worker）；网格/自动列宽/样式预览使用字段类型 `format`。`app-core` 新增结构化
  `FieldTypeLookup`（不依赖 plugin-sdk），命令层与编辑器共用存储+语义校验；`ColumnDraft.fieldTypeId`
  为三态（选择/`null` 清除/`undefined` 保留）。主进程只读插件包导出的字段类型映射，在
  `validateManifest`/`parseManifestDocument` 中严格解析 `fieldTypeId`，载入不再出现
  “cannot verify field type”警告。不改 `formatVersion`/JSONL/IPC/CSP，不新增运行时依赖。
- T6.2：新增 `apps/desktop/e2e/plugin.spec.ts` 3 条（rating 列 + 0/6 拒绝 + 重载无警告 6.2s、
  200% 缩放键盘选择语义类型 2.5s、示例导入器完成导入 3.3s）；`pnpm exec vitest run
  plugins/plugin-sample` **3 files / 29 tests**；`pnpm verify` **188 files / 1761 tests**；
  depcruise 514 modules / 2209 deps / 0 violations；coverage statements 77.11% / branches 69.95% /
  functions 76.23% / lines 77.25%；`pnpm build` exit 0（renderer **3,394.50 kB**、CSS 77.89 kB）；
  `pnpm e2e` **107 passed**（6.5m）；`pnpm bench` exit 0（全部预算内）。报告
  `docs/reports/t6.2/REPORT.md`（2 张截图）。
- T6.1：插件 SDK 与注册表落地（ADR-052）。`@curve/plugin-sdk` 新增
  `types/registry/host/logging` 四个模块：`Registry<T>` 增加 `subscribe(listener)` 与带
  `source`（`builtin` / 插件 id）的 `list()`；插件上下文拿到绑定自身 id 的注册表视图，
  `register` 重复 id 抛错、`replace` 只能覆盖同 owner、插件 `dispose` 只移除自己的贡献；
  `createPluginHost` 顺序激活插件，校验 `apiVersion` 主版本、定义与贡献（字段类型
  `storageType` 复用 `builtinColumnTypeSchema`），激活失败回滚并标记 `disabled`，其他插件继续；
  `deactivate` 调 hook 后移除贡献，`getDisabled()` 仅内存。新增 `ImportResult` 类型
  （与 table-engine `ImportDataset` 结构兼容）。
- T6.1：`plugins` 包新增 `registry.test.ts` 10 条与 `host.test.ts` 15 条；`pnpm exec vitest run
  packages/plugin-sdk` **3 files / 26 tests**；`pnpm verify` **182 files / 1710 tests**；depcruise
  500 modules / 2156 deps / 0 violations；coverage statements 77.08% / branches 69.85% /
  functions 75.93% / lines 77.24%（plugin-sdk lines 87.96%）；`pnpm build` exit 0。不新增运行时
  依赖，不改 IPC/preload/数据格式/CSP。
- T6.0：品牌更名 Curve Studio → Curve Almanac（ADR-051）。新增
  `apps/desktop/src/shared/brand.ts` 的 `APP_NAME` 作为唯一名称来源：main 的关于对话框/退出
  确认/日志/窗口标题、`index.html` 的 `<title>`、i18n 的 `app.name` 与欢迎页/模板过滤器文案、
  `productName` 全部改为引用或与之一致；`src/main/brand.test.ts` 与 `i18n.test.ts` 断言
  `productName`/`<title>`/`app.name` 同步且消息表无旧名。新建工作区默认父目录改为
  `Documents/Curve Almanac`；`userData` 随应用名变为 `%APPDATA%/Curve Almanac`（v1 未发布，
  不做迁移）。T6.4 的 `appId` 改为 `com.curvealmanac.app`。`@curve/*` 作用域、仓库名、
  `formatVersion`/JSONL/manifest/`.cstudio`/`.curvestyle.json`、`localStorage` 键、`CURVE_*`
  环境变量、CSS `cs-` 前缀与错误码不变；历史 ADR-001–050 与既有报告保留旧名。
- T6.0：`pnpm verify` **180 files / 1685 tests**；depcruise 494 modules / 2138 deps /
  0 violations；coverage statements 76.86% / branches 69.65% / functions 75.55% / lines 77.01%；
  `pnpm build` exit 0（renderer **3,365.92 kB**、CSS 77.89 kB）；定向 e2e **11 passed**
  （smoke 5 + shell 6，26.2s）。报告 `docs/reports/t6.0/REPORT.md`（1 张截图，`m0` 截图已还原）。
  不新增运行时依赖，不改 IPC/preload/数据格式/CSP。

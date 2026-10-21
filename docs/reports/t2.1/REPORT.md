# T2.1 实施报告 — 工作区入口、表管理与虚拟化数据网格

> 日期：2026-10-21 · 分支：`main` · 任务：`docs/TASKS.md` T2.1 · 决策：ADR-027
> 依赖：T1.5、T0.4（均已满足）· 覆盖：FR-WS-01、FR-WS-02、FR-TBL-01、FR-TBL-02、FR-TBL-07
> 环境：Windows 10 x64 · Node 24.21.0 · pnpm 11.28.5 · Electron 44.9.0

## 1. 结论

T2.1 的 8 条验收项全部通过，均有自动化证据（app-core 单测 + Playwright E2E）。`pnpm verify`、
`pnpm test:coverage`、`pnpm format:check`、`pnpm e2e` 全部 exit 0。本任务未改 `formatVersion`、
manifest/JSONL 字段、CSP、沙箱或 preload 白名单。

## 2. 实现范围

### 2.1 app-core（命令与用例）

| 文件 | 内容 |
|---|---|
| `packages/app-core/src/commands/layout.ts` | 递归 pane 遍历、添加/激活/移除视图、活动 pane 回退 |
| `packages/app-core/src/commands/tables.ts` | `table.create`/`table.delete`/`table.meta.update`、新表/新视图构造 helper、级联引用收集 |
| `packages/app-core/src/commands/views.ts` | `view.create/delete/update/layout`、patch 白名单、layout 引用校验 |
| `packages/app-core/src/usecases/workspace-actions.ts` | `WorkspaceActions`：立即写 manifest、删除后 trash、打开/激活/关闭标签、关闭工作区重置；`stateToManifest` |
| `packages/app-core/src/usecases/open-workspace.ts` | 新增可注入 `decodeTable` 异步解码端口（Worker） |
| `packages/app-core/src/state/selectors.ts` | `countTableReferences`（删除确认数量） |

- 所有文档变更走命令总线与 Immer patches；异步 IO 只在 `WorkspaceActions`/`openWorkspace`。
- 结构性操作失败时 `ui.error` 可见；命令失败不发布半成品状态。

### 2.2 renderer

- `renderer/app-core/`：`renderer-core.ts`（单一 app-core 组合根）、`use-app-core.tsx`
  （Provider + `useSyncExternalStore`）、`workspace-store.ts`（IPC → `WorkspaceStore` 适配）、
  `use-workspace-controller.ts`（新建/打开/关闭/最近/目录选择）。
- `renderer/features/workspace/`：`WelcomePage`、`NewWorkspaceDialog`、`OpenWorkspaceDialog`、
  `TabBar`（方向键、Ctrl/Cmd+W）、`WorkspaceView`（警告横幅、标签、网格/空态）。
- `renderer/features/tables/`：`TableList`、`NewTableDialog`、`RenameTableDialog`、
  `DeleteTableDialog`（列视图/图表数量）。
- `renderer/features/grid/`：`DataGrid`（TanStack Table v8 + Virtual v3）、`GridHeader`、
  `GridCell`（memo）、`SelectionLayer`、`grid-navigation.ts`（纯键盘模型）、`grid-sizing.ts`
  （列宽/冻结偏移）；行高 32、只渲染视口、列宽拖拽/双击自适应、冻结列、矩形选择、ARIA grid。
- 文案全部进入 `i18n/messages/{zh-CN,en-US}.ts`；`ui-conventions` 门禁通过。

### 2.3 main / IPC / 依赖

- `dialog:pickDirectory`：main handler（`showOpenDialog`）+ Zod 契约 + preload 白名单 +
  renderer api-client + E2E `CURVE_E2E_DIR` 替身。
- `app:info` 增加 `documentsDir`；欢迎页默认父目录 `Documents/Curve Studio`。
- `FileWorkspaceStore.trash` 改为按 `tableId` 解析文件，支持“写 manifest → trash”的删除顺序。
- `electron.vite.config.ts` 删除显式 `table-worker` 入口；Vite 产出
  `assets/table.worker-<hash>.js`，E2E 断言同步。
- 新增 `@tanstack/react-table@8.21.3`、`@tanstack/react-virtual@3.14.21`、`axe-core@4.14.0`
  （测试专用）；`apps/desktop` 接入 `@curve/app-core` 与工程引用。
- 本机无符号链接权限，安装按 HANDOFF §3.4 用目录 junction 补齐；未改项目配置。

## 3. 验收逐项证据

| # | 验收项 | 证据 |
|---|---|---|
| 1 | 无工作区欢迎页；新建/打开/最近都能进入网格 | `grid.spec.ts` 第 1、2 条：新建 → 建表 → 网格；打开对话框（可编辑路径 + picker）→ 建表 → 网格；最近列表 → 网格 |
| 2 | 新建表 → 重命名 → 删除进 `.trash` → 重开 | `grid.spec.ts` 第 1 条：真实文件写入后删除，`.trash` 出现 `<tableId>.*.jsonl`；关闭后从最近重开，表列表为空 |
| 3 | 删除被引用表列出数量并级联 | `grid.spec.ts` 第 3 条：表 + 表视图 + 图表 + 图表视图，Dialog 显示“2 个视图、1 个图表”，确认后 manifest 的 tables/views/charts 全空；app-core `tables.test.ts` 断言无悬挂引用 |
| 4 | 同一张表只激活已有标签 | `grid.spec.ts` 第 1 条：连续点击同一表两次，标签数仍为 1；`workspace-actions.test.ts` 断言 `created: false` 且 viewId 相同 |
| 5 | 100k 首帧 <1s、滚动 ≥55fps | `grid.spec.ts` 第 8 条：**首帧 405ms**；1.2s 滚动采样 **165.7fps**（Electron rAF，未锁显示器刷新率） |
| 6 | 方向键/Tab/Home/End/PageUp/PageDown | `grid-navigation.test.ts` 8 条纯逻辑；`grid.spec.ts` 第 4 条在真实网格上逐键断言 active cell |
| 7 | 列宽拖拽/自适应且重开保留 | `grid.spec.ts` 第 6 条：拖拽 +90px、双击自适应，manifest `widths` 更新；重开后 header 计算宽度等于持久化值 |
| 8 | 屏幕阅读器可读行列数（axe 无 critical） | `grid.spec.ts` 第 4 条：`role=grid`、`aria-rowcount=51`、`aria-colcount=3`、columnheader/gridcell；axe-core WCAG 2 A/AA 无 critical；`grid.spec.ts` 第 7 条 200% 缩放仍可键盘操作 |

## 4. 验证结果

| 命令 | 结果 |
|---|---|
| `pnpm verify` | exit 0；ESLint 0 problem；depcruise **220 modules / 737 deps / 0 violations**；**72 files / 594 tests** |
| `pnpm test:coverage` | exit 0；全局 stmts **81.12%** / branch **72.95%** / funcs **80.76%** / lines **81.57%**（阈值 70/60 未下调；新增 UI 代码拉低，纯逻辑包仍 ≥85%） |
| `pnpm format:check` | exit 0 |
| `pnpm e2e` | exit 0；**30 passed**（原 22 + `grid.spec.ts` 8） |
| `pnpm build` | exit 0；renderer 产物含 `assets/table.worker-<hash>.js` |

## 5. 残留风险与后续

| # | 风险 | 处理 |
|---|---|---|
| 1 | `workspace:recent:remove/clear` 未实现，欢迎页只能读/打开 | 按用户确认后置 **T5.3** |
| 2 | SPEC §7.5 恢复/直接打开与 manifest 备份重建未实现 | 按 ADR-026 后置 T5.3；T2.1 只显示 warning 横幅 |
| 3 | `openWorkspace` 打开成功但表读取失败时不会自动 `close`，可能残留 `.lock` | 预存在风险（HANDOFF §7.4.7）；T2.1 的失败路径发生在写锁前，未触发；建议 T2.3/T5.3 补 close-on-failure |
| 4 | 100k 滚动帧率是合成 rAF 采样，未锁定显示器刷新率 | T2.7 用 `pnpm bench` 固化正式指标 |
| 5 | 新增 UI 代码未做组件级覆盖率补强，全局 lines 从 93.62% 降到 81.57% | 阈值仍满足；T2.2/T2.6 会继续补组件测试，必要时在 M2 报告给出趋势 |
| 6 | 本机 pnpm 安装需要 junction 修补 | 仅本机环境问题；干净 CI 不需要，未改项目配置 |
| 7 | Grid 只读，单元格编辑/校验未实现 | T2.2，且不在本任务验收范围 |
| 8 | renderer 产物约 1.12 MB（含 TanStack Table/Virtual） | T6.4 打包阶段评估拆包/压缩；当前未设体积门禁 |

## 6. 变更文件（概览）

```text
packages/app-core/src/commands/{layout,tables,views}.ts (+ tests)
packages/app-core/src/usecases/{open-workspace,workspace-actions}.ts (+ tests)
packages/app-core/src/state/selectors.ts
packages/app-core/src/{app-core,index}.ts
apps/desktop/src/renderer/app-core/{renderer-core,use-app-core,use-workspace-controller,workspace-store}.ts(x)
apps/desktop/src/renderer/features/{workspace,tables,grid}/*.tsx/ts (+ grid tests)
apps/desktop/src/renderer/shell/{AppShell,TitleBar,Sidebar,StatusBar}.tsx
apps/desktop/src/renderer/i18n/messages/{zh-CN,en-US}.ts
apps/desktop/src/renderer/{App.tsx,api-client.ts,styles.css}
apps/desktop/src/main/{index.ts,ipc/handlers.ts,workspace/file-workspace-store.ts}
apps/desktop/src/preload/api.ts
apps/desktop/src/shared/contracts/{ipc,channels}.ts
apps/desktop/e2e/{fixtures,grid,ipc,shell,table-io}.spec/ts
apps/desktop/{package.json,tsconfig.web.json,electron.vite.config.ts}
docs/{SPEC,TASKS,HANDOFF,CHANGELOG}.md
docs/adr/{README.md,027-t21-workspace-commands-and-grid.md}
```

## 7. 结论与停点

- T2.1 完成，建议进入 `T2.2`（单元格编辑与校验）。
- 按用户要求：**本任务报告后停下等确认**，不自动进入 T2.2。

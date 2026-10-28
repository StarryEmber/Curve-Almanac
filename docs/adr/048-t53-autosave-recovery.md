# ADR-048 T5.3 的自动保存窗口、退出握手、锁/清单恢复与最近列表

- 状态：已接受
- 日期：2026-10-28
- 相关：SPEC §7.5、§12、§13.3、§15.1、§15.4；TASKS T5.3；TESTPLAN E8；ADR-019、ADR-021、
  ADR-022、ADR-023、ADR-026、ADR-027、ADR-028、ADR-033、ADR-046、ADR-047

## 背景

T2.2 起保存是“每次提交立即写表 + manifest”；T5.1 给纯布局变更加了 500ms 去抖；ADR-026 把
SPEC §7.5 的完整崩溃恢复交互后置到本任务。T5.2 完成后仍有以下缺口：

1. `SaveQueue` 没有 SPEC §13.3 的 1.5s 防抖/10s 强制，编辑密集时每次提交都写盘。
2. 退出只有 `before-quit` 里 `csvWriter.dispose()`；渲染进程的保存队列不会被 flush，强退会丢最后
   一次编辑，且 `.lock` 不会被释放。
3. stale/corrupt `.lock` 只产生 warning 并自动替换；manifest 损坏直接 `E_WS_INVALID_MANIFEST`，
   没有“尝试恢复/直接打开”或 `backups/manifest.*.json.bak` 重建。
4. `workspace:recent:remove|clear` 只有通道名；渲染进程没有备份/恢复入口。
5. `open()` 已写锁并注册工作区后，逐表 `readTable` 失败不会关闭工作区，下次打开会看到 stale lock。

## 决定

### 1. 保存队列统一 1.5s 防抖 + 10s 强制

- `createSaveQueue({ autosaveDelayMs = 1500, autosaveMaxDelayMs = 10000 })`：
  - 每次 `enqueue`/`enqueueManifest` 重置 trailing 定时器（最后一次变更后 1.5s）；
  - 定时器延迟按“第一次待写变更 + 10s”裁剪，连续编辑时最迟 10s 落盘；
  - `flush()`（Ctrl/Cmd+S、关闭工作区、退出握手）与 `retry()` 取消定时器并立即写；
  - 写盘仍是单循环、按表串行、表 → manifest；失败保留 `ui.dirtyTables` 与 `ui.save.error`，
    下一次编辑或重试重新入队。
- 不新增第二条写盘路径：布局的 500ms 去抖仍只调用 `enqueueManifest()`，退出/关闭由同一 `flush()`
  冲掉两个定时器。

### 2. 退出握手：3s flush + 原生确认，绝不卡死

- main 拦截 `BrowserWindow.close` 与 `app.before-quit`，首次请求时向渲染进程发送
  `app:quit-requested { reason }`，并启动 3s 计时。
- 渲染进程 `useQuitGuard` 调用 `actions.flushSaves()`（队列自身 3s 超时），成功后用
  `workspace.close` 释放工作区并删除 `.lock`，再以 `app:quit-response { action: 'quit',
  flushed }` 回复；失败则 `flushed: false` 且**故意保留** `.lock`（下次启动给出未正常退出提示）。
- main 收到 `flushed: false` 或 3s 超时后显示原生确认（退出/取消）；选择取消则保持应用打开，
  状态栏继续显示“保存失败/重试”。确认结果为“退出”才真正关闭，因此 `before-quit` 不会永久
  `preventDefault`。
- 测试替身：仅未打包且 `CURVE_E2E=1` 时，`CURVE_E2E_QUIT_CONFIRM=quit|cancel` 直接回答原生确认。
- 新增通道（SPEC §15.1）：`app:quit-requested`（M→R 事件）与 `app:quit-response`（R→M invoke）。
  preload 只暴露 `app.onQuitRequested(handler)` 与 `app.respondToQuit(answer)`，不暴露
  `ipcRenderer.on/invoke` 本体。

### 3. 应用单实例

- `app.requestSingleInstanceLock()` 在 `app.whenReady()` 前调用；拿不到锁的第二个进程直接退出，
  已运行实例在 `second-instance` 中恢复并聚焦窗口。锁按 userData 目录隔离，E2E 每个用例仍使用
  独立 userData。

### 4. 恢复：只读预检 + 显式恢复选项

- 新增 `workspace:inspect { dir }`（R→M，只读）：返回 `dir`、manifest `name`、`lock`
  (`none|active|stale|corrupt`)、`manifest` (`ok|missing|invalid|unsupported`)、`errorCode` 与
  `backups/` 中 manifest 备份（按时间倒序）。它不创建/替换/删除锁、manifest 或备份。
- `workspace:open` 请求增加可选 `recovery`：
  - `manifestBackup`: 用户从备份列表选择的 `backups/manifest.<ts>.json.bak`。main 先解析校验，
    备份当前（可能损坏的）manifest，再用常规备份 + 原子写重建，成功后才打开；
  - `acceptStaleLock`: 用户选择“尝试恢复”的显式确认。仅当锁为 stale/corrupt **且**当前 manifest
    不可读时，main 才尝试最新一份 manifest 备份并重建；没有可用备份时返回原始
    `E_WS_INVALID_MANIFEST`。
  - active lock 仍先于一切恢复被拒绝；版本过高的 manifest 永不从备份降级。
- UI（`WorkspaceOpenProvider` + `WorkspaceRecoveryDialog`）在所有打开入口（最近列表、打开对话框）
  之前调用 inspect：
  - stale/corrupt 锁且 manifest 可读 → “上次未正常退出”对话框，提供“尝试恢复”与“直接打开”
    （此时两者都走同一条安全 open 路径，差异只在 manifest 不可读时的备份重建）；
  - manifest 不可读 → “工作区清单已损坏”对话框，列出备份并二次确认重建；取消不写任何文件。
- 预检与打开各读一次 manifest（小文件），换取“拒绝恢复时原文件字节不变”的可测试语义。

### 5. 打开失败释放工作区

- `createOpenWorkspace` 在逐表读取/解码失败时先 `workspaceStore.close({ workspaceId })` 再返回错误，
  避免把半打开的工作区留在 main 的映射里并留下 stale lock。

### 6. 最近列表移除/清空

- `recent.json` 增加 `remove(path)`/`clear()`（大小写不敏感匹配、原子写；文件缺失/损坏时重建）。
- 新实现 `workspace:recent:remove`、`workspace:recent:clear`；preload 方法名沿用 SPEC §15.4 的
  `workspace.recentRemove` / `workspace.recentClear`。欢迎页每个条目有“从最近列表中移除”图标按钮，
  列表非空时提供“清空最近列表”。

### 7. 不改变的东西

- 不新增 manifest 字段、不升级 `formatVersion`、不改 JSONL/CSV/图表格式、不新增运行时依赖、
  不放宽 CSP 或 Electron 安全选项。
- `SaveQueue` 仍是唯一写表路径；`EditHistory`、`view.layout` 瞬态、500ms 布局去抖、
  `workspace-empty`、图表契约保持不变。
- `open()` 在不传 `recovery` 时的既有行为（stale/corrupt 锁 warning 后替换、manifest 损坏拒绝且
  不改文件）保持不变；恢复能力只在显式选项下启用。

## 代价

- **1.5s 窗口内的编辑在强杀时会丢失**：这是 SPEC §13.3 的既定取舍；恢复对话框明确提示“最后
  1.5 秒内尚未落盘的修改可能已丢失”。若不可接受，需要写前日志/检查点（新 ADR）。
- **flush 失败后确认退出会留下 stale lock**：下次启动多一次恢复提示，但不会把未保存状态伪装成
  正常退出。
- **原生退出确认是英文**：main 没有 i18n；与既有 About/文件对话框一致，报告中列为残留风险。
- **`inspect` 多一次 manifest 读取**：几十 KB 量级；相对 100k 表读取可忽略。
- **两个“stale lock”按钮在 manifest 可读时行为相同**：SPEC 要求提供两个选项；真正的差异发生在
  manifest 不可读时（直接打开失败，恢复可重建）。UI 文案已说明备份重建路径。
- **自动重建只尝试最新一份备份**：遵循 SPEC §7.5 的“扫描最新”；最新备份自身损坏时不继续回溯。
- **退出握手把 `workspace.close` 放进 renderer**：main 不直接 flush；若 renderer 崩溃，main 只能用
  超时确认退出并留下锁。这是“flush 在 renderer”架构的固有代价。
- **E2E 的 `CURVE_E2E_QUIT_CONFIRM` 是测试钩子**：仅未打包 + `CURVE_E2E=1` 生效，生产构建短路。

## 影响

- 代码：
  - `packages/app-core/src/usecases/save-queue.ts`：1.5s/10s 窗口、flush/retry 立即写。
  - `packages/app-core/src/usecases/open-workspace.ts`：逐表读取失败时关闭工作区。
  - `packages/persistence/src/types.ts`：`WorkspaceRecoveryChoice`、`WorkspaceInspection`、
    `OpenWorkspaceRequest.recovery`。
  - `apps/desktop/src/main/workspace/file-workspace-store.ts`：`inspect`、manifest 备份重建、
    最新备份自动恢复、recent remove/clear。
  - `apps/desktop/src/main/quit-guard.ts`：3s 握手状态机；`apps/desktop/src/main/index.ts`：
    close/before-quit 拦截、原生确认、单实例、E2E 确认替身。
  - `apps/desktop/src/shared/contracts/{channels,ipc}.ts`、`src/main/ipc/handlers.ts`、
    `src/preload/{api,index}.ts`、`src/renderer/{api-client,app-core/workspace-store,
    app-core/use-workspace-controller,app-core/use-quit-guard}.ts`。
  - `apps/desktop/src/renderer/features/workspace/{workspace-open-flow.tsx,
    WorkspaceRecoveryDialog.tsx,WelcomePage.tsx,OpenWorkspaceDialog.tsx}`、`App.tsx`、`AppShell.tsx`、
    `i18n/messages/*`、`styles.css`。
  - 测试：`save-queue.test.ts`、`open-workspace.test.ts`、`file-workspace-store.test.ts`、
    `m1-acceptance.test.ts`、`recent-list.test.ts`、`quit-guard.test.ts`、
    `use-quit-guard.test.tsx`、`handlers.test.ts`、`api-client.test.ts`、`preload/api.test.ts`、
    `channels.test.ts`、`ipc.test.ts`、`e2e/{autosave,recovery,grid,ipc}.spec.ts`。
- 文档：SPEC §7.5/§12/§13.3/§15.1/§15.4、TASKS T5.3、TESTPLAN E8、ADR 索引、CHANGELOG、
  HANDOFF、AGENTS §0、`docs/reports/t5.3/REPORT.md`。
- 快照：无；未改 RenderModel、ECharts option 或表格样式快照。

## 复核条件

- 若“强杀最多丢 1.5s”不可接受：增加写前日志/周期性检查点或缩短窗口，并更新 SPEC §13.3/E8。
- 若原生退出确认必须本地化：为 main 引入共享消息表（或 renderer 驱动的确认对话框 + 更长的
  main 安全超时），不要硬编码文案。
- 若 T5.5 允许关闭自动保存：必须实现 SPEC §12 的“保存/放弃/取消”三选一；当前自动保存始终开启，
  失败时以“保持打开 + 重试”代替“放弃”。
- 若需要恢复时回溯多份备份：在 `FileWorkspaceStore` 内逐个尝试并记录 warning；当前只取最新一份。
- 若 main 需要在 renderer 无响应时仍能安全 flush：把文档快照下沉到 main/Worker，或增加独立的
  自动保存守护进程；不要把写盘逻辑复制一份到 main。
- 若窗口关闭流程新增其他原生对话框：保持 `quit-guard` 的“确认期间不重复请求”语义，避免叠加模态。

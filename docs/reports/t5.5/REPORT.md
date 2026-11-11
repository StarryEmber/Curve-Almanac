# T5.5 报告 — 设置与国际化

- 任务：T5.5（NFR-04、FR-STY-01；SPEC §12、§13.3、§15.1、§15.4、§16.3、§16.4；TESTPLAN §6.2）
- 日期：2026-10-29
- 决策：ADR-050（应用设置文件、IPC、Provider 受控、自动保存关闭的三选一、i18n 缺失 key）
- 状态：已完成；M5 的 T5.1–T5.5 全部完成，下一步执行 M5 验收演示

## 1. 目标与交付

1. **设置文件**：`userData/settings.json` 的
   `AppSettings { version: 1, theme, locale, autosave, defaultTableStyleId }`；main 逐字段回退
   缺失/损坏字段，原子串行写入；新工作区从应用设置继承 manifest `settings`。
2. **IPC/Preload**：新增 `app:settings`（读）与 `app:settings:update`（写）两个通道，main 与
   renderer 双向 Zod 校验；preload 暴露 `app.settings()/app.updateSettings()`，不暴露路径或泛
   invoke。
3. **Provider**：`SettingsProvider` 为最外层；`I18nProvider`/`ThemeProvider` 受控；`main.tsx`
   在首帧前读取设置（1.5s 兜底），`AppCoreProvider` 用 `settings.autosave` 创建队列。
4. **设置对话框**：标题栏“设置”与命令面板 `app.settings` 打开；主题、语言、自动保存即时生效；
   默认表格样式在有工作区时走既有 `style.apply { target: 'default' }`，无工作区时写入应用设置
   作为新工作区种子。
5. **自动保存关闭**：`SaveQueue` 不再安排 1.5s/10s 定时器，`SaveState.unsaved` 标记未落盘；
   关闭窗口/工作区弹出“保存并继续 / 放弃修改 / 取消”。保存走原 `flush()` + `workspace.close`，
   放弃走 `closeWorkspace({ save: false })`，取消保持打开。main 退出握手在关闭时放宽到 60s。
6. **国际化**：en-US 与 zh-CN key 集一致、无空文案、除 `language.zh-CN` 外无 CJK；`translateKey`
   在开发构建缺 key 时抛错、生产回退 zh-CN；文案门禁扩展到 `aria-label`/`title`/`placeholder`/
   `label`/`hint`/`error` 等用户可见属性。
7. **不改**：`formatVersion`、JSONL、CSV/PNG 格式、CSP、Electron 安全选项、运行时依赖；
   T5.3 的 `SaveQueue` 窗口/flush 语义、T5.4 的 `APP_COMMANDS` 快捷键表、T3.1 的内置模板。

## 2. 关键文件

```text
apps/desktop/src/shared/contracts/settings.ts (+test)        # AppSettings/normalize/defaults
apps/desktop/src/shared/contracts/{channels,ipc}.ts (+tests) # app:settings(:update) + schemas
apps/desktop/src/preload/api.ts (+test)                      # settings/updateSettings
apps/desktop/src/renderer/api-client.ts (+test)              # 双向校验
apps/desktop/src/main/settings/app-settings-store.ts (+test) # 读/规范化/原子串行写
apps/desktop/src/main/{index,ipc/handlers,quit-guard}.ts (+tests)
apps/desktop/src/main/workspace/file-workspace-store.ts (+test) # 新工作区种子
packages/persistence/src/manifest.ts (+test)                 # createEmptyManifest(settings?)
packages/app-core/src/
├─ app-core.ts                                               # autosaveEnabled/setAutosaveEnabled/hasUnsavedChanges
├─ state/{types,store}.ts (+test)                            # SaveState.unsaved
├─ usecases/save-queue.ts (+test)                            # 自动保存关闭
└─ usecases/workspace-actions.ts (+test)                     # closeWorkspace({ save:false })
apps/desktop/src/renderer/features/settings/
├─ SettingsProvider.tsx (+test)                              # 状态源、乐观更新、错误
└─ SettingsDialog.tsx (+test)                                # 主题/语言/自动保存/默认样式
apps/desktop/src/renderer/features/workspace/unsaved-changes.tsx (+test)
apps/desktop/src/renderer/theme/ThemeProvider.tsx (+? 现有测试)
apps/desktop/src/renderer/i18n/{index,translate}.ts (+test)
apps/desktop/src/renderer/{App,main}.tsx、shell/{AppShell,TitleBar,StatusBar}.tsx
apps/desktop/src/renderer/{features/keymap/commands.ts,styles.css,i18n/messages/*}
apps/desktop/test/ui-conventions.test.ts                      # 属性文案门禁
apps/desktop/e2e/settings.spec.ts                            # 4 条 E2E
docs/adr/050-t55-settings-i18n.md；docs/reports/t5.5/（4 张截图）
```

## 3. 公开行为 / 契约

```ts
// shared/contracts/settings.ts
type AppSettingsTheme = 'light' | 'dark' | 'system';
type AppSettingsLocale = 'zh-CN' | 'en-US';
interface AppSettings {
  version: 1;
  theme: AppSettingsTheme;
  locale: AppSettingsLocale;
  autosave: boolean;
  defaultTableStyleId: string;   // 仅 builtin.*
}
DEFAULT_APP_SETTINGS;
normalizeAppSettings(value): AppSettings;   // 逐字段回退
appSettingsEqual(a, b): boolean;

// IPC
app:settings         {}                 -> AppSettings
app:settings:update  { settings }       -> AppSettings（规范化后）

// @curve/app-core
AppCore.setAutosaveEnabled(enabled: boolean): void;
AppCore.hasUnsavedChanges(): boolean;
SaveQueue.setAutosaveEnabled(enabled); isAutosaveEnabled(); hasUnsavedChanges();
SaveState.unsaved: boolean;
WorkspaceActions.closeWorkspace(options?: { save?: boolean }): Promise<ActionOutcome>;
SavePhase = 'idle' | 'unsaved' | 'saving' | 'saved' | 'error';

// renderer
SettingsProvider({ initialSettings?, api? })
useSettings(): { settings; ready; error; update(patch) }
I18nProvider({ locale?, onLocaleChange?, initialLocale? })
ThemeProvider({ mode?, onModeChange?, initialMode? })
UnsavedChangesProvider / useUnsavedChangesGuard().request('quit' | 'close-workspace')
```

DOM/E2E 契约：

- `data-testid="open-settings"`（标题栏）、`settings-dialog`、`settings-theme`、
  `settings-language`、`settings-autosave`、`settings-default-style`、`settings-close`、
  `settings-error`、`settings-style-error`。
- 未保存对话框名称：`有未保存的修改` / `Unsaved changes`；按钮 `保存并继续` / `放弃修改` /
  `取消`（英文 `Save and continue` / `Discard changes` / `Cancel`）。
- 状态栏 `data-testid="autosave-status"` 在自动保存关闭时显示 `已关闭` / `有未保存修改`
  （英文 `Off` / `Unsaved changes`）；保存失败仍显示 `保存失败`。
- 命令面板新增 `data-command-id="app.settings"`，无快捷键（`PALETTE_ONLY_COMMAND_IDS`）。

## 4. 语义实现（对照 ADR-050）

| 项 | 语义 |
|---|---|
| 读取 | 启动时 `settingsStore.load()`；缺失/损坏 JSON → 默认值 + warn；非法字段逐项回退 |
| 写入 | `write-file-atomic`（临时 + fsync + rename），promise 链串行；失败保留会话值并返回 `E_FS_WRITE` |
| 首帧 | `main.tsx` 先 `app.settings`，1.5s 超时/桥不可用回退默认；首帧即使用存储的主题/语言 |
| 主题/语言 | `SettingsProvider` 唯一状态源；`ThemeProvider` 的 `useLayoutEffect` 在绘制前写 `data-theme` |
| 默认样式 | 有工作区 → `style.apply { kind:'default' }`（可撤销、manifest-only）；无工作区 → 应用设置种子 |
| 新工作区 | `FileWorkspaceStore.create` 把 `AppSettings` 传给 `createEmptyManifest({ settings })` |
| 自动保存开 | 原 T5.3 1.5s trailing + 10s 上限；`flush()/retry()` 立即写 |
| 自动保存关 | 只入队 + `status:'unsaved'`；不发定时器；Ctrl+S/显式 action/退出保存仍 `flush()` |
| 关闭窗口 | autosave off + unsaved → 三选一；取消回复 `action:'cancel'`；保存/放弃均释放 `.lock` |
| 关闭工作区 | 同上；放弃调用 `closeWorkspace({ save:false })`，不写表/manifest |
| 退出超时 | autosave on 3s；off 60s（`UNSAVED_QUIT_TIMEOUT_MS`）；flush 失败仍走原生确认 |
| 缺 key | 开发构建 `translateKey` 抛错；生产回退 zh-CN，再回退 key 本身 |
| 文案门禁 | JSX 文本 + 中文字面量 + 用户可见属性字面量；唯一允许 `#RRGGBB` |
| +30% 布局 | 真实 Electron、200% 缩放、DOM 伪本地化；页面无横向溢出、设置面板在视口内 |

## 5. 测试

### 5.1 单元/组件（`pnpm test`：179 files / 1682 tests）

- `app-settings-store.test.ts` 6 条：缺失、损坏 JSON、部分非法字段、原子写回读、并发串行、
  未变更不写、写失败保留会话值。
- `settings.test.ts` 6 条：默认值、theme/locale 白名单、完整/部分/非对象规范化、逐字段比较。
- `ipc.test.ts` +3 条：`app:settings` 无参读取、合法/非法文档、update 包装与多余字段拒绝。
- `SettingsProvider.test.tsx` 5 条：首帧值、异步加载、乐观更新、持久化失败、快速连续更新
  不发送旧文档。
- `SettingsDialog.test.tsx` 5 条：当前值/关闭、三个即时设置、无工作区种子默认样式、工作区
  `style.apply`、命令失败内联错误。
- `unsaved-changes.test.tsx` 5 条：无未保存不弹、自动保存开启不弹、保存、放弃/取消（含 Esc）、
  store 脏标记变化。
- `save-queue.test.ts` +4 条：关闭时不写、flush 后 saved、运行时开关、manifest-only 未保存。
- `workspace-actions.test.ts` +1 条：`closeWorkspace({ save:false })` 不写表、释放工作区、清空状态。
- `file-workspace-store.test.ts` +1 条：新工作区继承应用设置。
- `manifest.test.ts` +1 条：`createEmptyManifest` 的 `settings` 种子。
- `quit-guard.test.ts` +1 条：自动保存关闭时的 60s 动态超时与重新握手。
- `i18n.test.ts` +5 条：完整 en-US、T5.5 文案、`translateKey` 严格/回退。
- `ui-conventions.test.ts` +1 条：用户可见属性字面量审计。
- `App.test.tsx` +1 条：标题栏打开设置、切英文即时生效、关闭对话框。

### 5.2 E2E（`apps/desktop/e2e/settings.spec.ts` 4 条）

1. **settings-persist**（3.6s）：打开设置 → 切 en-US/dark/autosave off → 写盘断言 → 关闭重启
   → `lang=en-US`、`data-theme=dark`、对话框值仍为 en-US/dark/off；截图 2 张。
2. **settings-autosave-off-close**（4.9s）：自动保存关闭时编辑 → 状态栏“有未保存修改”且 2s 内
   不落盘 → 关闭工作区弹三选一 → 取消保持打开/放弃不写盘/保存后落盘并读回；截图 1 张。
3. **settings-autosave-off-quit**（3.4s）：编辑后 `app.quit()` → 取消保持窗口；再次退出 →
   “保存并继续” → 退出、重启无恢复提示、单元格值 555。
4. **settings-i18n-layout**（1.6s）：切 en-US → 200% 缩放 → 打开设置并伪本地化 +30% →
   页面无横向溢出、设置面板在视口内；截图 1 张。

## 6. 验证命令与结果（2026-10-29 本机）

```text
pnpm verify
  179 files / 1682 tests passed；ESLint 0；
  depcruise 492 modules / 2118 deps / 0 violations

pnpm build
  exit 0；renderer 3,365.14 kB、CSS 77.89 kB；ImportSession 42.82 kB；
  table/query/import worker 220.68/236.16/270.16 kB

pnpm e2e
  103 passed（5.8m）；settings 4 条 3.6s/4.9s/3.4s/1.6s；
  chart-perf 100k 切换 private 507MB（≤600MB）

pnpm test:coverage
  statements 76.86% / branches 69.64% / functions 75.55% / lines 77.01%
  （阈值 70/60 未下调；app-settings-store/translate/SettingsProvider/Dialog 有单测）

pnpm bench
  exit 0；table.open 301ms/3s、save 277ms/500ms、edit 0ms/50ms、
  query 199ms/400ms、text-sort 276ms/400ms、cjk-sort 448ms/800ms、
  import 620ms/8s、condition 0ms/16ms；
  chart.resolve-sample P95 69ms/300ms、chart.sample 3ms/50ms、
  chart.option.2k 1ms/50ms、chart.restyle.100k 0ms/20ms；
  memoryPeakMB 705（Node 管线趋势，非应用门禁）
```

## 7. 截图证据





## 8. 残留风险与未覆盖

- **应用设置与 manifest 是两份快照**：manifest 的 `theme/locale/autosave` 创建后不再随应用偏好
  更新；读取方必须以 `settings.json` 为准。保留字段是为了不改 v1 格式。
- **自动保存关闭时显式 action 仍会 flush**：粘贴/导入/样式/图表提交需要保存结果，仍走
  `flush()`；“关闭”抑制的是后台定时写。若产品要求“只有 Ctrl+S 才写”，需另加队列模式。
- **设置写失败只在对话框内提示**：主题/语言已乐观生效，重启会回退；没有全局 Toast。
- **main 原生退出确认/恢复提示仍为英文**：main 无 i18n，与 ADR-048 一致。
- **+30% 是 DOM 伪本地化**：验证布局韧性，不验证译文质量；真实语言包替换后可复用该用例的
  断言思路。
- **默认表格样式**：设置对话框修改的是“当前工作区默认样式”，不是所有已存在视图；新建表格视图
  才会使用它。
- **设置没有“恢复默认”按钮**；删掉 `settings.json` 即恢复默认，未提供 UI 入口。
- 设置文件没有跨版本迁移；`version` 字段已预留，升级时需补迁移与夹具。

## 9. 结论与停点

T5.5 的四项验收全部通过：中英文可切换且开发构建缺 key 抛错；主题/语言/自动保存/默认样式重启
保留；组件无硬编码用户文案（门禁扩展到用户可见属性）；+30% 文案在 200% 缩放下不破布局。
设置文件与 IPC 契约、自动保存关闭的三选一、动态退出超时均有单测与真实 Electron E2E 覆盖。

**停点**：T5.5 完成；M5 的 T5.1–T5.5 全部完成。下一步执行 M5 验收演示（2 表 3 视图分 2 pane →
撤销/重做 5 步 → 强杀恢复 → 最近打开 → 切英文/深色 → 重启全部还原），输出报告后停下等待用户确认。

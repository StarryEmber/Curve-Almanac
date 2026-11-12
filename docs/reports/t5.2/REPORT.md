# T5.2 报告 — 撤销/重做

- 任务：T5.2（FR-TBL-02、FR-STY-02；SPEC §13.2；TESTPLAN E7 第 3–4 步）
- 日期：2026-10-28
- 决策：ADR-047（全命令历史、256MB 估算、瞬态布局、Edit 菜单、按补丁落盘）
- 状态：已完成；M5 继续 T5.3（本任务不是里程碑停点）

## 1. 目标与交付

1. **全命令历史**：`EditHistory` 不再维护白名单，所有产生 Immer patches 的命令默认入栈；
   `table.create/delete`、`table.rows.insert`、`table.column.*`、`table.meta.update`、
   `view.create/delete/update`、样式、图表、工作区命令都可撤销。
2. **布局分类**：`view.layout` 只在布局树（忽略 `activeViewId`）变化时记录；纯标签/焦点切换
   是瞬态，不进入历史、也不清空 redo。分栏/移动标签/比例/关闭 pane 记录一条可撤销条目。
3. **上限**：100 条或**估算** 256MB（`DEFAULT_HISTORY_MAX_BYTES`），先到者生效；超限从最旧
   undo 条目丢弃，单条超限也丢弃；不在热路径 `JSON.stringify` 100k 行。
4. **合并**：`table.cell.set` 保留 800ms 同格 `mergeKey` 合并；粘贴/导入/列/表/视图/样式/图表
   各一条。redo 非空时不再把新编辑并进旧条目。
5. **落盘**：行补丁 → 表 + manifest；纯 manifest 命令与删除表 redo → 仅 manifest；复用
   `SaveQueue`，不新增写盘路径。打开/关闭工作区清空历史。
6. **UI**：TitleBar 新增“编辑”菜单，显示“撤销 编辑单元格（Ctrl+Z）”等命令名、空栈禁用态；
   `ui.history` 快照提供 `canUndo/canRedo/action/depth`；快捷键仍由 `WorkspaceView` 处理。

不改变 `formatVersion`、manifest 字段、JSONL、IPC、preload、CSP 或运行时依赖。

## 2. 关键文件

```text
packages/app-core/src/history/edit-history.ts          # 分类/合并/256MB 估算/snapshot/落盘选择
packages/app-core/src/state/{types,store}.ts           # HistoryState、ui.history、setHistoryState
packages/app-core/src/app-core.ts                      # onStateChange 接线
packages/app-core/src/usecases/open-workspace.ts       # 打开时重置 ui.history
packages/app-core/src/usecases/workspace-actions.ts    # 关闭时重置 ui.history
apps/desktop/src/renderer/features/history/
├─ HistoryMenu.tsx                                     # TitleBar Edit 菜单 + data-undo-* 契约
└─ history-action-label.ts                             # 命令名 → i18n key（app-core 不依赖 i18n）
apps/desktop/src/renderer/shell/TitleBar.tsx           # 挂载 HistoryMenu
apps/desktop/src/renderer/i18n/messages/{zh-CN,en-US}.ts
apps/desktop/src/renderer/styles.css                   # .cs-titlebar__history
apps/desktop/e2e/undo.spec.ts                          # 3 条 E2E
packages/app-core/src/history/edit-history.test.ts     # 18 条（+7）
packages/app-core/src/usecases/workspace-actions.test.ts  # 22 条（+2，含删除表/视图/改名）
packages/app-core/src/usecases/column-actions.test.ts # 16 条（+1）
packages/app-core/src/usecases/chart-actions.test.ts  # 7 条（扩展 create/update/delete 撤销）
packages/app-core/src/usecases/import-actions.test.ts # 3 条（扩展 undo/redo）
apps/desktop/src/renderer/features/history/history-action-label.test.ts
```

## 3. 公开 API / 契约

```ts
// @curve/app-core — history/edit-history.ts
DEFAULT_MERGE_WINDOW_MS = 800
DEFAULT_HISTORY_LIMIT = 100
DEFAULT_HISTORY_MAX_BYTES = 256 * 1024 * 1024
interface HistoryState {
  canUndo; canRedo;
  undoAction: string | null; redoAction: string | null;
  undoDepth; redoDepth;
}
interface EditHistory {
  record(result: CommandResult): void
  undo(): boolean
  redo(): boolean
  canUndo(): boolean
  canRedo(): boolean
  size(): number
  sizeBytes(): number
  snapshot(): HistoryState
  clear(): void
}
createEditHistory({ store, now?, mergeWindowMs?, limit?, maxBytes?,
                    onChanged?, onWorkspaceChanged?, onStateChange? })

// @curve/app-core — state
createEmptyHistoryState(): HistoryState
AppState.ui.history: HistoryState
AppActions.setHistoryState(history): void

// renderer
HistoryMenu()
historyActionKey(command: string | null): MessageKey

// DOM 契约（只读，E2E）
[data-testid="history-menu"]
  data-can-undo / data-can-redo
  data-undo-action / data-redo-action
  data-undo-depth / data-redo-depth
```

## 4. 语义实现（对照 ADR-047）

| 项 | 语义 |
|---|---|
| 记录范围 | 所有 `patches.length > 0` 的命令；未来命令自动可撤销 |
| 瞬态 | `view.layout` 且布局树忽略 `activeViewId` 后相等；不入栈、不清 redo |
| 布局结构 | 分栏/移动/比例/关闭 pane 记录一条；撤销同时恢复当时的 `ui` 焦点 |
| 合并 | `table.cell.set` 同 `mergeKey` + 800ms，保留首 inverse/末 forward；redo 非空不合并 |
| 批量 | 粘贴/导入/行插入/列/表/视图/样式/图表各一条，不参与合并 |
| 条数上限 | 100 条 undo；新命令入栈前清空 redo |
| 字节上限 | 100k 行共享行数组只计数组（~800KB）；独特旧行数组抽样 16 行外推；大数组抽样 24 项；超限丢最旧 |
| 撤销落盘 | 含 `tables/<id>/rows` 且表存在 → 表 + manifest；纯 manifest/删除表 redo → 仅 manifest |
| 选中/滚动/标签 | 选择/滚动不是命令；标签切换是瞬态 `view.layout`；均不进历史 |
| 菜单 | 命令名 → renderer i18n；未知命令回退“修改文档”；快捷键 Ctrl/Cmd+Z、Ctrl/Cmd+Shift+Z、Cmd+Y |
| 清空 | 打开/关闭工作区清空两栈与 `ui.history` |
| 不改变 | manifest/JSONL/IPC/preload/CSP/`formatVersion`/运行时依赖 |

## 5. 测试

### 5.1 单元测试（`pnpm test`：165 files / 1532 tests）

- `edit-history.test.ts` 18 条：800ms 合并/窗口/不同 cell、redo 分支、100 步一致性、100k 行
  单元格补丁估算、256MB 常量与超限丢最旧、快照/回调、粘贴/导入/行插入单条、样式/图表
  workspace 作用域、焦点切换瞬态 vs 结构布局可撤销。
- `workspace-actions.test.ts` 22 条：新建/删除表撤销、删除表 redo 仅 manifest、视图
  create/update/delete、改名、关闭工作区清空历史；既有保存/样式/布局用例保持全绿。
- `column-actions.test.ts` 16 条：列新增/删除撤销、行数据与 schema 一起恢复。
- `chart-actions.test.ts` 7 条：chart create/update/delete 的 undo/redo 与保存。
- `import-actions.test.ts` 3 条：导入后 undo 恢复旧行、redo 恢复新行。
- `history-action-label.test.ts` 2 条：全部命令有中英文案、空/未知回退。
- `i18n.test.ts`：两语言 key 集一致、无空文案。

### 5.2 E2E（`apps/desktop/e2e/undo.spec.ts`）

1. **undo-redo**（7.6s）：5 次间隔 900ms 的编辑 → 断言 depth 5 + 菜单“撤销 编辑单元格” →
   撤销 5 次后初值 → 重做 3 次后第 1–3 行新值、第 4 行初值 → JSONL 落盘；菜单空栈态截图。
2. **undo-focus**（3.7s）：编辑 1 次 → 切换标签/选择/滚动后 depth 仍为 1 → 撤销后切换标签
   仍保留 redo → 重做恢复 → 关闭工作区清空 → 重开仍为空。
3. **undo-menu**（2.9s）：编辑 1 次 → 聚焦“编辑”按钮按 ArrowDown 打开菜单并聚焦“撤销 编辑
   单元格” → Escape 返回触发器 → 200% 缩放后菜单项仍可见且菜单框不越出视口。

## 6. 验证命令与结果（2026-10-28 本机）

```text
pnpm verify
  165 files / 1532 tests passed；ESLint 0；
  depcruise 454 modules / 1913 deps / 0 violations

pnpm test:coverage
  statements 76.07% / branches 69.07% / functions 74.80% / lines 76.21%
  app-core/history/edit-history.ts lines 90.99% / branches 86.89%
  全局阈值 70/60 未下调

pnpm build
  exit 0；renderer 3,288.47 kB、CSS 74.37 kB；ImportSession 42.82 kB；
  table/query/import worker 220.68/236.16/270.16 kB

pnpm e2e
  88 passed（4.9m）；undo.spec 3 条 7.6s / 3.7s / 2.9s

pnpm bench
  exit 0（数值见 §6.1）

pnpm exec playwright test --config apps/desktop/playwright.config.ts \
  apps/desktop/e2e/undo.spec.ts
  3 passed（15.3s）
```

### 6.1 bench

```text
table.open 316ms/3s、table.save 247ms/500ms、edit 0ms/50ms、
query 224ms/400ms、text-sort 278ms/400ms、cjk-sort 514ms/800ms、
import 665ms/8s、condition 0ms/16ms；
chart.resolve-sample P95 84ms/300ms、chart.sample 3ms/50ms、
chart.option.2k 1ms/50ms、chart.restyle.100k 0ms/20ms；
memoryPeakMB 956（Node 管线趋势，非应用门禁）
```

## 7. 截图证据



## 8. 残留风险与未覆盖

- **256MB 是估算**：共享行数组会被低估、独特行对象会被抽样外推；宁可提前丢弃最旧条目，也不在
  每次编辑遍历 100k 行。若真实 GC 占用与估算偏差大，按 ADR-047 复核条件调整共享判定/抽样。
- **单条超过 256MB 的导入/替换**会失去撤销能力（历史为空）；硬上限优先。需要保留时改为磁盘
  快照/增量导入，另写 ADR。
- **`table.delete` 的 redo 不重复 `trash`**：撤销删除表时重新写表；再次 redo 只移除 manifest 引用，
  磁盘可能留下不再被引用的表文件（无害，ADR-027 语义）。
- **`table.meta.update` 的菜单文案**是“修改数据表”，不区分重命名/换主键；要精确文案需在
  `CommandResult` 增加结构化 label，而不是在 renderer 猜测命令名。
- **原生 Electron Edit 菜单未同步**：标题栏 in-app 菜单是唯一显示历史命令名的入口；原生
  `undo/redo` role 保留给文本输入。同步需要新 IPC + SPEC §15/preload 更新。
- **纯标签切换不记录**，但结构布局变更（分栏/比例/移动）会记录并恢复当时的 `ui` 焦点；若产品
  要求所有布局都不可撤销，需新 ADR 调整分类。
- **`HistoryMenu.tsx` 的函数覆盖主要由 E2E 覆盖**（单测覆盖 label 映射）；不为了覆盖率引入
  组件级 mock 渲染测试。
- **图表/样式/导入 E2E 未逐命令再跑撤销**：本次新增单测覆盖各命令；M5 验收演示会做 5 步撤销/
  重做组合。既有 `paste.spec.ts`/`import.spec.ts`/`style.spec.ts`/`template.spec.ts` 的撤销用例
  保持通过。

## 9. 结论与停点

T5.2 的四项验收全部通过：100 步/256MB 上限、粘贴/导入/列变更单条、图表/视图/样式可撤销、
撤销后自动保存、关闭工作区清空历史；E7 第 3–4 步由 `undo.spec.ts` 覆盖。历史栈统一消费命令
总线的 patches，不绕过 `SaveQueue`，未改 `formatVersion`/JSONL/IPC/preload/CSP 或新增运行时依赖。
新增 ADR-047、SPEC §13.1/§13.2 实现边界、TASKS T5.2 与 `docs/reports/t5.2/REPORT.md`。

**停点**：T5.2 完成；M5 继续 **T5.3（自动保存、恢复与最近打开）**，不是里程碑停点。

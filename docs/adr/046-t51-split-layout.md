# ADR-046 T5.1 的递归分栏、活动 pane、标签移动与布局恢复

- 状态：已接受
- 日期：2026-10-27
- 相关：SPEC §6.5、§6.6.5、§12、§13.1、§19；TASKS T5.1；TESTPLAN E7（布局部分）；
  ADR-025、ADR-027、ADR-028、ADR-045

## 背景

`LayoutNode` 从 T1.1 起就是递归树（pane / split），T2.1 已实现 `view.create/delete/update/
layout` 命令与 `findActivePane`/`addViewToLayout` 等纯函数，但渲染层只显示**一个 pane**：
`WorkspaceView` 取 `findActivePane(layout)`，只渲染该 pane 的 `TabBar` 与活动视图。

T5.1 要按 SPEC §12 落地：最多 4 pane、水平/垂直分栏、0.2–0.8 比例、每个 pane 独立标签页、
新建/关闭/移动视图、布局持久化、非法布局回退单 pane、纯键盘可切换/关闭标签。SPEC 没有规定
以下实现细节，必须在写代码前裁决，否则命令、UI、保存队列与恢复路径会各发明一套：

1. 分栏操作如何创建第二个 pane；空 pane 如何填充；活动 pane 如何表达（manifest 没有 pane id）。
2. 标签如何在 pane 之间移动；关闭最后一个标签时 pane 如何折叠；至少保留一个 pane。
3. 比例拖拽何时写 manifest；与 ADR-027 的“每次结构操作立即写 manifest”如何协调。
4. 非法布局（引用缺失、比例越界、pane 数 >4）如何回退——当前 `checkInvariants` 与 Zod 会
   直接拒绝打开，和 SPEC §12/§19 的“回退单 pane 并提示”冲突。
5. 每个 pane 的活动标签是否持久化；最后聚焦的 pane 是否持久化。

## 决定

### 1. 递归渲染与 UI-only pane 路径

- `WorkspaceView` 只保留警告条、全局快捷键与粘贴层；新增 `LayoutView` 递归渲染
  `LayoutNode`：pane 渲染自己的 `TabBar` + 活动视图，split 用 CSS Grid 渲染两个 slot 与一个
  可拖拽分隔条。
- pane 地址是 **UI-only 路径**：根 pane 为 `root`，split 的两个子 pane 为 `root.0`/`root.1`，
  嵌套继续追加 `.0`/`.1`。路径不写 manifest、不参与撤销，仅用于焦点、拆分别找 pane。
- 每个 pane 的 `activeViewId` 是持久化字段（`LayoutNode` 已有）；`ui.activeViewId` 仍是全局
  inspector/命令的活动视图，`ui.activePanePath` 记录当前聚焦的 pane。

### 2. 活动 pane 语义

- `ui.activePanePath` 是 UI 状态（不进 manifest、不进撤销）。点击 pane、标签、网格或空态都会
  聚焦该 pane；`syncActiveSelection` 优先使用该路径，路径失效时退回到包含
  `ui.activeViewId` 的 pane，再退回第一个 pane。
- 打开工作区时按“第一个有 `activeViewId` 的 pane”恢复全局活动视图；**每个 pane 的活动标签
  由各自 `activeViewId` 恢复**。最后聚焦的是哪个 pane 不持久化：重启后焦点落在第一个有活动
  标签的 pane，其它 pane 的标签选择仍保留。若产品要求恢复“最后聚焦 pane”，需要新增 manifest
  字段与迁移（见复核条件）。

### 3. 分栏：原 pane + 空 pane，最多 4 个

- “水平分栏/垂直分栏”把当前聚焦 pane 替换为 `split(first=原 pane, second=空 pane)`，比例
  0.5，并聚焦新的空 pane。**分栏本身不创建、不移动视图**：原 pane 的标签全部保留，空 pane
  提示“从左侧打开数据表/图表，或把其他分栏的标签移动到这里”，并提供“关闭此分栏”。
- 这样分栏是纯布局命令，不改变 `views`；用户随后用“移动到下一分栏”或新建视图填充。
- 4 个 pane 后分栏按钮禁用，`view.layout` 与 `splitPane` action 也拒绝第 5 个 pane
  （`E_VALIDATION`）。

### 4. 标签移动与关闭

- v1 按 SPEC §12 的“移动到下一个 pane 菜单”：每个 pane 的工具栏提供“移动当前标签到下一
  分栏”（按视觉顺序循环）。移动是纯布局操作：从源 pane 移除、加入目标 pane 并聚焦目标；
  源 pane 变空时折叠掉它。不做跨 pane 拖拽。
- 关闭标签仍走 `view.delete`：从 `views` 与 layout 移除；pane 变空则折叠其父 split，再向上
  剪掉空 pane；全部标签关闭时保留**一个空的根 pane**（`workspace-empty` 空态）。
- “关闭当前分栏”只对**空 pane** 可用（有标签的 pane 必须通过关闭标签结束），避免产生
  manifest 中不在 layout 里的“隐藏视图”。空 pane 关闭后至少保留 1 个 pane。

### 5. 比例拖拽、键盘与保存去抖

- 分隔条是 `role="separator"`，方向、`aria-valuemin/max/now` 暴露 20–80。指针拖拽只更新
  组件本地比例（视觉实时），`pointerup` 提交**一条** `view.layout`；键盘 ArrowLeft/Right
  （水平）或 ArrowUp/Down（垂直）每次调整 2%。比例由 schema 限制在 0.2–0.8。
- 纯布局变更（激活已有标签、打开已有视图、split、move、ratio）走 **500ms 去抖**的 manifest
  保存：`scheduleLayoutSave()` 只置定时器，到期调用 `SaveQueue.enqueueManifest()`；连续拖动/
  切换合并为一次写盘。`flushSaves()`（Ctrl+S/关闭工作区）会先冲掉定时器。
- 新建/删除/更新视图仍是文档变更，**立即**写 manifest（否则关闭标签又重启会出现“视图复活”
  或“已删除视图仍在 layout”的不一致）。因此 ADR-027 的“结构操作立即写”只对视图文档变更
  保留；布局焦点/比例/分栏改为去抖。
- 窗口直接退出不保证冲掉最后 500ms 的纯布局变化；T5.3 的自动保存/退出 flush 会统一处理。
  关工作区、Ctrl+S 与 E2E 的重启路径都已 flush。

### 6. 非法布局回退单 pane（不丢视图）

- `@curve/persistence` 的 `parseManifestDocument` 先按正常路径校验；失败且原始 JSON 有
  `views` 数组时，用 `views[].id` 重建单 pane（保留 manifest 顺序与所有合法 `viw_` id），
  用替换后的 layout 再校验一次。
- 重试通过则返回修复后的 manifest，并追加英文 warning：
  `layout was invalid; restored a single pane with N view(s)`；工作区警告条展示该提示。原文件
  在这次打开中**不改写**，下一次正常保存才写回修复后的 layout。
- 重试仍失败（其它字段也不合法）时抛原始 `E_WS_INVALID_MANIFEST`，不掩盖非布局错误。
- 覆盖：引用缺失、同一视图重复、pane 数 >4、比例越界/结构非法（Zod 失败）、layout 缺失。
  `checkInvariants` 对 layout 的严格规则保持不变（保存/正常加载仍拒绝非法布局）。

### 7. 空态与可访问性

- 空 pane 复用 `data-testid="workspace-empty"`（旧的单 pane 空态契约，E2E 兼容），并加
  `data-pane-empty="true"` 供分栏测试定位；标题“此分栏为空”，有关闭按钮（>1 pane 时）。
- pane 容器暴露 `data-testid="pane"`、`data-pane-path`、`data-pane-active`。**不使用
  `data-active`**：那是网格单元格/图表列表的既有契约（`paste.spec` 用
  `[data-active="true"]` 找活动单元格）。
- `TabBar` 的 ArrowLeft/Right 在每个 pane 内循环；Ctrl+W 关闭全局活动视图；分隔条可 Tab
  聚焦并用方向键调比例；200% 缩放下 2 个 pane 与分隔条仍在视口内。

### 8. 不改变的东西

- 不新增 manifest 字段、不升级 `formatVersion`、不改 JSONL/IPC/preload/CSP、不新增运行时依赖。
- `LayoutNode` 形状、`view.create/delete/update/layout` 命令名与撤销语义不变；
  `view.layout` 载荷只增加可选 UI 字段 `activePanePath`（不持久化）。
- M4 的图表渲染/采样/断点/缓存契约、命令总线与 `SaveQueue` 串行语义不变。

## 代价

- **最后聚焦 pane 不持久化**：重启后焦点是第一个有活动标签的 pane；每个 pane 的标签选择
  仍恢复。要精确保留焦点需新增 manifest 字段（迁移 + 新 ADR）。
- **分栏后是空 pane**：用户要多一步移动/新建视图；换来分栏不偷偷创建/搬移文档。
- **无跨 pane 拖拽**：v1 只有“移动到下一分栏”菜单（SPEC 允许）。
- **布局命令与撤销栈的交互留给 T5.2**：`view.layout` 不在 `EditHistory` 的可记录命令集中，
  不进入 undo；但 `record()` 对非可记录且有 patches 的命令会清空 redo，所以标签切换会清
  redo（与 T5.1 前的 `activateView` 相同）。E7 第 4 步由 T5.2 统一裁决，本 ADR 不改
  `EditHistory`。
- **500ms 去抖窗口**：直接强退可能丢最后 500ms 的焦点/比例/分栏变化；T5.3 统一退出 flush。
- **空 pane 关闭限制**：有标签的 pane 不能一键关闭，必须逐个关标签；避免孤儿视图。
- **`workspace-empty` 复用**：多个空 pane 时会出现多个同名 testid；E2E 必须限定在 pane 内。
- **布局写失败只进保存状态**：`scheduleLayoutSave` 不像 `openTable` 那样把错误返回给调用方，
  失败通过状态栏/保存队列重试暴露（与 `enqueueManifest` 语义一致）。
- **回退 warning 为英文**：与 workspace/manifest warning 一致，不本地化；打开后不会自动
  改写磁盘，用户需下一次保存。
- **pane 路径是 UI 约定**：不是 manifest id；布局重排后路径会变，不能持久化/跨会话使用。

## 影响

- 代码：
  - `packages/app-core/src/commands/layout.ts`：`PaneEntry`/路径、split/move/prune/
    removePane/setRatio 纯函数；`removeViewFromLayout` 改为返回新树并折叠空 pane。
  - `packages/app-core/src/commands/{views,tables,charts}.ts`：活动 pane 路径、`view.layout`
    的 `activePanePath`、删除视图后剪枝。
  - `packages/app-core/src/usecases/{workspace-actions,open-workspace}.ts`：split/closePane/
    moveViewToNextPane/setLayoutRatio、500ms `scheduleLayoutSave`/flush、活动 pane 恢复。
  - `packages/app-core/src/state/{types,store}.ts`：`ui.activePanePath`、`focusPane`。
  - `packages/persistence/src/manifest.ts`：`parseManifestDocument` 的 layout 回退与 warning。
  - `apps/desktop/src/renderer/features/workspace/{LayoutView.tsx,WorkspaceView.tsx}`、
    `i18n/messages/{zh-CN,en-US}.ts`、`styles.css`：递归渲染、分隔条、pane 工具栏/空态。
  - 测试：`commands/layout.test.ts`、`workspace-actions.test.ts`、`manifest.test.ts`、
    `e2e/layout.spec.ts`；`schema.spec.ts` 的标签激活等待 500ms 去抖。
- 文档：SPEC §12 实现边界、§13.1 `view.layout` 载荷说明、§19 布局回退说明的落地；
  TASKS T5.1；TESTPLAN E7 的覆盖说明；ADR 索引；CHANGELOG、HANDOFF、AGENTS §0、
  `docs/reports/t5.1/REPORT.md`。
- 快照：无。`LayoutNode` 与图表/渲染快照未变。

## 复核条件

- 若必须恢复“最后聚焦的 pane”：给 manifest 增加可选 `activePanePath`（或 pane id）字段，
  写迁移/兼容测试与新 ADR；不要复用 `LayoutNode` 的 `activeViewId`。
- 若分栏应自动复制当前视图/把当前标签移到新 pane：改 `splitPane` 语义，更新本 ADR 与 E2E。
- 若要求跨 pane 拖拽标签：实现 drag-and-drop（指针/键盘），保留“移动到下一分栏”作为
  可访问替代。
- 若 500ms 去抖导致强退丢失不可接受：T5.3 增加 `before-quit` flush；不要在渲染层加第二条
  写盘路径。
- 若允许 >4 pane 或比例超出 0.2–0.8：改 `MAX_PANES`/schema/SPEC，并重跑布局 E2E 与 200%
  缩放冒烟。
- 若回退逻辑掩盖了非布局错误：缩小 fallback 触发条件（只允许 Zod layout 错误/checkLayout
  错误），不要放宽其它 manifest 校验。

# ADR-023 脏表追踪原语放 `table-engine`，状态接线留 `app-core`

- 状态：已接受
- 日期：2026-10-20
- 相关：SPEC §4.2、§13.3；T1.3、T1.5；AGENTS §5

## 背景

`docs/TASKS.md` 的 T1.3 产出写了"脏表追踪与 `rowCount` 重算"。`rowCount` 重算属于持久化适配器（见 ADR-022），但"哪些表有未保存改动"是**业务状态**：

- AGENTS §5 要求业务逻辑进 `app-core`，组件只做渲染与事件转发。
- `app-core` 的 Zustand 切片与命令总线是 **T1.5** 的产出。
- SPEC §4.2 只允许 `domain ← table-engine ← chart-model` 与 `domain ← persistence ← app-core ← desktop`；`table-engine` 不得依赖 Zustand/React。

在 T1.3 直接建 Zustand store 会跨越任务边界，并且 T1.5 大概率要重构。

## 决定

- `@curve/table-engine` 只提供**纯原语**：
  - `DirtyTableTracker`：`mark`/`markAll`/`clear`/`clearAll`/`has`/`get`/`list`/`ids`/`size`，可注入时钟；`revision` 单调递增，重复 `mark` 不改变首次登记顺序。
  - `diffTableRows(before, after)`：按行 id 给出 `added`/`removed`/`changed`，并单独报告 `orderChanged`（行序也是持久化内容）。
- 不 import Zustand、React、Electron 或任何 Node 内置模块。
- Zustand 切片、自动保存队列、状态栏"未保存"提示由 **T1.5 `app-core`** 接线；T1.3 不新增 UI。

## 代价

- T1.3 结束时没有用户可见的脏标记；T1.5 需要写一层适配（把 tracker 包进 Zustand action）。
- `DirtyTableTracker` 只存 `tableId`/`revision`/`markedAt`，不存"哪些行脏"；细粒度差异由调用方在保存前用 `diffTableRows` 计算。若 T1.5 需要按单元格合并，需要扩展。

## 影响

- 不改变文件格式、IPC 通道或公共 API 的既有部分；`@curve/table-engine` 新增导出。
- T1.5 的"选择器：脏表列表"直接消费 `DirtyTableTracker.list()`。

## 复核条件

- T1.5 实现自动保存时，如果需要"按行/按列脏"或"保存失败重试队列"，在 `app-core` 内扩展，不把状态塞回 `table-engine`。
- 若发现 tracker 的语义（首次顺序、revision）不满足撤销/重做合并需求，再评估。

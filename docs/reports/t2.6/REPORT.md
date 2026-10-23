# T2.6 报告 — 筛选、排序与视图状态

- 任务：T2.6（FR-TBL-05；承接 ADR-030 的可见行粘贴闭环）
- 日期：2026-10-23
- 决策：ADR-032（12 项均由用户确认）
- 状态：已完成；按用户要求停在 T2.6，不进入 T2.7。

## 1. 目标与交付

在现有表格上实现：

1. 工具条筛选按钮 + 对话框：单层 all/any、最多 20 条条件、按列类型的 12 种操作符白名单、
   拒绝嵌套筛选的静默拍平；
2. 表头三级排序（点击 asc → desc → none，Shift 追加/切换），空值固定最后，文本
   `Intl.Collator` 语义与稳定并列；
3. 视图状态持久化：筛选/排序/列宽/隐藏/冻结；同一张表多个独立视图；隐藏列面板与恢复；
4. 专用 query Worker：≤20k 主线程、>20k Worker、行快照/增量缓存、失败回退、旧请求作废；
5. T2.4 粘贴闭环：筛选激活时只写可见行，矩阵超出可见行数整批拒绝，隐藏行不变，
   命令侧 stale 检查；
6. 100k 查询性能证据：`bench query.100k` / `query.text-sort.100k` 与 E2E Worker 计时。

## 2. 关键文件

```text
packages/table-engine/src/query.ts (+test)
packages/table-engine/src/query-protocol.ts (+test)
packages/domain/src/limits.ts（MAX_SORT_LEVELS）
packages/domain/src/schemas.ts（sort ≤ 3）
packages/app-core/src/validation/filter-builder.ts (+test)
packages/app-core/src/validation/view-state.ts (+test)
packages/app-core/src/commands/view-copy.ts (+test)
packages/app-core/src/commands/views.ts (+test)
packages/app-core/src/commands/paste.ts (+test)
packages/app-core/src/validation/paste-plan.ts (+paste-plan-visible.test)
packages/app-core/src/usecases/workspace-actions.ts (+paste-actions test)
apps/desktop/src/renderer/query/{client,handler}.ts (+test)
apps/desktop/src/renderer/workers/query.worker.ts
apps/desktop/src/renderer/features/filter/FilterDialog.tsx (+test)
apps/desktop/src/renderer/features/grid/{grid-sort,use-view-rows}.ts (+test)
apps/desktop/src/renderer/features/grid/{DataGrid,GridHeader}.tsx
apps/desktop/src/renderer/features/columns/ColumnsPanel.tsx
apps/desktop/src/renderer/features/workspace/{TabBar,WorkspaceView}.tsx
apps/desktop/src/renderer/features/paste/use-paste.tsx
apps/desktop/src/renderer/app-core/{renderer-core,use-app-core}.tsx
apps/desktop/src/renderer/i18n/messages/{zh-CN,en-US}.ts
apps/desktop/src/renderer/styles.css
apps/desktop/e2e/filter.spec.ts
apps/desktop/e2e/paste.spec.ts（筛选粘贴改为可见行语义）
scripts/bench.ts（--query）
docs/adr/032-t26-filter-sort-view-state.md
```

## 3. 验证命令与结果（2026-10-23 本机）

```text
pnpm verify          122 files / 967 tests；ESLint 0；depcruise 342 modules / 1309 deps / 0 violations
pnpm test:coverage   lines 75.00% / statements 74.89% / branches 66.85% / functions 76.03%
pnpm format:check    通过
pnpm build           exit 0；renderer 1,410.66 kB + 懒加载 ImportSession 42.82 kB；
                     query.worker 227.70 kB；import.worker 266.09 kB；table.worker 216.61 kB
pnpm e2e             60 passed（含 filter.spec.ts 6 passed；paste.spec.ts 7 passed）
pnpm bench -- --query query.100k P50 30ms / P95 34ms；query.text-sort.100k P50 314ms / P95 347ms
```

E2E 覆盖（`e2e/filter.spec.ts`）：

1. 2,000 行筛选（Score > 1000 → 999 行）+ 表头三级排序；`aria-sort` 与优先级正确。
2. 筛选/排序写 manifest，重开后恢复；清除筛选恢复 100 行。
3. TabBar 复制当前视图；两个视图筛选互不影响，重开后仍独立。
4. Inspector 隐藏列 → 表头减少 → 重开仍隐藏 → 已隐藏列表恢复。
5. 100k 行 Score > 50000 → 49,999 行，`data-query-mode="worker"`、
   `data-query-ms ≤ 400`，升/降序各一次。
6. 200% 缩放筛选对话框键盘可达、无横向裁切、Esc 关闭。

T2.4 筛选粘贴 E2E 已改为：

- 3 行矩阵 / 2 个可见行 → “超出可见行”整批拒绝，JSONL 字节不变；
- 2 行矩阵 → 只写 r1/r3，隐藏行 r2 原样保留；
- 命令侧 stale/可见行检查由 app-core 单测覆盖。

## 4. 决策摘要

见 ADR-032 的 12 项：工具条 + 筛选对话框；单层 all/any；按类型操作符白名单；文本大小写
不敏感/空串按 null/between 含边界；表头 + Shift 三级排序；空值最后 + locale collator +
稳定排序；每个确认动作立即写 manifest、不进撤销；TabBar 复制视图；Inspector 隐藏列；
专用 query Worker + 增量缓存（20k 阈值、失败回退）；粘贴只写可见行/超出拒绝；
bench query.100k + E2E Worker 计时。

实现说明：

- 文本排序以 `Intl.Collator(locale,{numeric:true,sensitivity:'variant'})` 为语义参考；
  普通 ASCII 使用 12 位数字段补零自然键 + `numeric:false` collator 的快速路径，非 ASCII
  使用自然键 + collator，带符号数字或超过 12 位的数字段回退字面 `numeric:true`。
  单测用参考 collator 对代表性 ASCII/中文/带符号数据逐项比对。
- `table.paste` 新增可选 `rowIds/viewId`；省略时保持 T2.4 的保守行为（筛选视图拒绝）。
- 视图状态仍由 `view.update` 立即写 manifest；不写 JSONL、不标脏表、不进最小历史。

## 5. 残留风险

- 筛选对话框只能编辑单层条件；嵌套谓词只读，需清除后重建。
- 100k 全中文文本排序仍使用 collator，可能接近 400ms；T2.7 复核并决定是否进一步下沉。
- 自然键快速路径对 >12 位数字段/带符号数字回退到较慢的 collator；语义正确但延迟更高。
- query Worker 按表缓存，最多 4 张；切换更多表会重新克隆。
- 连续拖动列宽/快速切换排序会多次写 manifest；T5.3 统一自动保存队列后需要合并。
- 10 万级粘贴/导入命令阶段仍同步；T2.7 评估 Worker/硬门禁。
- E2E 的 100k 查询计时取 Worker 内部 filter+sort 耗时，不包含首次行快照克隆；
  T2.7 应把克隆/端到端也纳入基线。

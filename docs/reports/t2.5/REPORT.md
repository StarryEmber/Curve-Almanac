# T2.5 报告 — CSV/JSON 导入向导

- 任务：T2.5（FR-TBL-04 / FR-TBL-06）
- 日期：2026-10-22
- 决策：ADR-031（12 项均由用户确认）
- 状态：已完成；按用户要求停在 T2.5，不进入 T2.6。

## 1. 目标与交付

在现有表上实现 5 步导入向导：

1. 文件与编码（`自动 / UTF-8 / GB18030（兼容 GBK）`，错编码提示）；
2. 20 行预览（分隔符、表头覆盖、总行数/列数）；
3. 列映射（已有列/新列/忽略、类型推断与置信度、required 提示）；
4. 校验（total/accepted/skipped、前 100 条 issue、按坏行聚合的错误 CSV、
   “跳过错误行”/取消）；
5. 提交（追加/替换、>100k 确认、替换二次确认、保存与进度）。

配套：`table.import` 原子命令、专用 import Worker、`imports/` 原文归档 + SHA-256 sidecar、
旧表备份、保存队列、一条撤销记录、200k 上限与 256MB 写盘守卫。

## 2. 关键文件

```text
packages/table-engine/src/import.ts (+test)
packages/app-core/src/commands/import.ts (+test)
packages/app-core/src/validation/import-planning.ts (+test)
packages/app-core/src/usecases/workspace-actions.ts (+import-actions.test)
packages/app-core/src/usecases/import-actions.test.ts
packages/app-core/src/history/edit-history.ts
packages/app-core/src/app-core.ts
apps/desktop/src/main/import/import-files.ts (+test)
apps/desktop/src/main/import/import-token-store.ts (+test)
apps/desktop/src/main/ipc/handlers.ts (+test)
apps/desktop/src/main/workspace/file-workspace-store.ts (+test)
apps/desktop/src/renderer/import/{encoding,client,worker-handler,worker-protocol}.ts (+test)
apps/desktop/src/renderer/workers/import.worker.ts
apps/desktop/src/renderer/features/import/
  ImportWizardDialog.tsx (+test), use-import.tsx, import-error-csv.ts (+test),
  import-issue-text.ts (+test), import-plan-view.ts
apps/desktop/src/renderer/features/tables/TableList.tsx
apps/desktop/src/shared/contracts/{channels,ipc}.ts (+test)
apps/desktop/src/preload/api.ts (+test)
apps/desktop/src/renderer/api-client.ts (+test)
apps/desktop/e2e/import.spec.ts
scripts/gen-100k.ts
scripts/bench.ts
fixtures/csv/*, fixtures/json/points.json
docs/adr/031-t25-csv-json-import.md
```

## 3. 验证命令与结果（2026-10-22 本机）

```text
pnpm verify          111 files / 880 tests；ESLint 0；depcruise 319 modules / 1213 deps / 0 violations
pnpm test:coverage   lines 74.12% / statements 74.06% / branches 66.03% / functions 76.11%
pnpm format:check   通过
pnpm build           exit 0；renderer 1,339.13 kB + 懒加载 ImportSession 42.82 kB；
                     import.worker 266.08 kB
pnpm e2e             54 passed（含 import.spec.ts 6 passed）
pnpm bench --import  import.100k P50 645ms / P95 659ms；预算 8s
```

E2E 覆盖：

1. 100k GBK 分号 + 3 坏行：自动 GB18030、20 行预览、映射、统计 `100000/99997/3`、跳过、
   错误 CSV 3 行、导入后 99,997 行、计时 <8s、重开保留、`imports/` 原文/sidecar。
2. 手动 UTF-8 错编码警告，切回 GB18030 后中文预览正确。
3. 150k 导入：100k–200k 确认框出现且未确认时提交禁用；取消后内存/磁盘不变。
4. JSON 替换：旧表备份、原文归档/sidecar hash、替换确认、一条撤销/重做。
5. 200,001 行：dispatch 前拒绝，磁盘不变。
6. 200% 缩放：导入控件键盘可达、无横向裁切、Esc 关闭。

## 4. 决策摘要

见 ADR-031 的 12 项：bytes+token IPC；Papa Parse + 平台 TextDecoder；自动嗅探/表头启发式；
当前表内映射；1000 行类型推断；坏行整行跳过/取消；替换二次确认 + 旧表备份 + 原文 sidecar；
专用 Worker/terminate；>200k 拒绝、>100k 确认、256MB 写盘兜底；flush ≤3s；一条撤销；
小夹具提交 + 100k 脚本生成 + 8s bench 门禁。

## 5. 残留风险

- `table.import` 的命令阶段仍同步校验 100k 行；T2.7 评估 Worker/硬门禁。
- 100k 逆补丁内存未计 256MB 字节上限；T5.2 统一。
- >50MB 原文只写 sidecar（路径 + hash），不复制；替换备份复用 `writeTable`，没有独立快照。
- 错误 CSV 按坏行聚合，机器消费需拆 `codes/messages`；UI 仍逐 issue 展示。
- JSON 嵌套对象/数组不支持；新列不支持 enum/fieldType。
- `file:archiveImport` 是新增通道（声明 18→19、已实现 11→14）；后续不得未写 ADR 再扩
  preload 白名单。

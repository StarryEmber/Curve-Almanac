# T3.6 报告 — CSV 导出

- 任务：T3.6（FR-TBL-06；SPEC §9.6）
- 日期：2026-10-24
- 决策：ADR-039（流式 IPC、原始/显示值、文件名、取消语义）
- 状态：已完成；未进入 M3 验收演示或 T4.x。

## 1. 目标与交付

1. 网格工具条“导出 CSV…”对话框：显示格式/原始值、当前筛选排序/全部行、行×列摘要、
   隐藏列与默认文件名提示。
2. UTF-8 BOM、CRLF、RFC 4180 转义、本地时间文件名；Excel 打开无乱码。
3. 只导出当前视图可见列（按视图顺序）与当前筛选/排序结果；可选“全部行（忽略筛选、保留排序）”。
4. 100k 行分块流式写盘、进度与取消；取消不留下目标文件或临时文件；导出 ≤5s。
5. 只读操作：不发命令、不进撤销、不写 manifest/JSONL；不新增运行时依赖，不改
   `formatVersion`/manifest/JSONL/CSP。

## 2. 关键文件

```text
packages/table-engine/src/csv-export.ts (+csv-export.test.ts)   # RFC 4180/BOM/raw/分块/文件名
packages/table-engine/src/index.ts
packages/domain/src/format.ts                                   # Intl formatter 缓存
apps/desktop/src/main/export/csv-export-file.ts (+test)          # token/临时文件/fsync/rename/清理
apps/desktop/src/main/{index.ts,ipc/handlers.ts} (+handlers.test.ts)
apps/desktop/src/shared/contracts/{channels,ipc}.ts (+tests)
apps/desktop/src/preload/api.ts (+test)
apps/desktop/src/renderer/api-client.ts (+test)
apps/desktop/src/renderer/features/export/
├─ ExportCsvDialog.tsx (+test)   # 对话框视图 + 容器
├─ use-export-csv.ts (+test)     # 流式/进度/取消/错误
└─ export-csv-plan.ts (+test)    # 列映射/行范围
apps/desktop/src/renderer/features/grid/DataGrid.tsx
apps/desktop/src/renderer/features/workspace/WorkspaceView.tsx
apps/desktop/src/renderer/{i18n/messages/*,styles.css}
apps/desktop/e2e/export-csv.spec.ts
docs/adr/039-t36-csv-export.md
docs/reports/t3.6/REPORT.md + t3.6-export-dialog.png
```

## 3. 公开 API 与 IPC

```ts
// @curve/table-engine
CSV_BOM, CSV_CRLF, CSV_CHUNK_ROWS, CSV_FILE_BASE_MAX_LENGTH
type CsvValueMode = 'display' | 'raw'
CsvExportColumn { column; valueIndex; header }
CsvExportOptions { columns; rows; formatCell; chunkRows? }
CsvChunk { text; rows }
escapeCsvField(text): string
rawCsvCellText(value, column): string
sanitizeCsvFileNameBase(tableName): string
csvExportFileName(tableName, now): string
encodeCsvChunks(options): Generator<CsvChunk>
```

```ts
// IPC（单通道四步；ALL_IPC_CHANNELS 19→20，已实现 14→15）
type ExportCsvRequest =
  | { op: 'begin'; suggestedName: string; filters: FileFilter[] }
  | { op: 'append'; token: string; chunk: string }
  | { op: 'finish'; token: string; rows: number }
  | { op: 'cancel'; token: string };
type ExportCsvReply =
  | { op: 'begin'; token: string; path: string }
  | { op: 'append'; bytes: number }
  | { op: 'finish'; path: string; bytes: number; rows: number }
  | { op: 'cancel'; removed: boolean };
```

| 项 | 语义 |
|---|---|
| `begin` | 原生保存对话框（E2E 走 `CURVE_E2E_SAVE`）+ 同目录 `.curve-export-<uuid>.tmp`；取消返回 `null` |
| `append` | 只接受 token；UTF-8 顺序追加；单块 ≤8MB；返回累计字节 |
| `finish` | `fsync` + close + rename；失败删除临时文件、不破坏已有目标 |
| `cancel` | 关闭句柄、删除临时文件；幂等（未知 token 返回 `removed:false`） |
| 退出 | `before-quit` 清理所有未完成会话 |

## 4. 语义与交互

- **列**：只含 `tableView.columnOrder` 中未隐藏的列；表头在显示格式下用
  `columnDisplayLabel`，原始值下用 `column.label`。
- **行**：默认网格当前 `rows`（筛选+排序后的顺序）；“全部行”忽略筛选、保留当前排序
  （`applySort` 主线程执行，100k 约数百 ms）。
- **值**：显示格式复用 `formatStyledCellValue`（数字千分位/列精度、日期本地化、布尔文案、
  enum label）；原始值 = 存盘值（text 原样、number 无千分位、date epoch ms、boolean
  `true`/`false`、enum 存储值）。条件颜色/图标与 bar/badge 形态不进入 CSV。
- **格式**：UTF-8 BOM 只一次；CRLF；含 `,`/`"`/CR/LF/首尾空白才加引号，内部 `"` 写成
  `""`；空表只写表头。
- **文件名**：`<清洗后表名>-<yyyyMMdd-HHmm>.csv`（本地时间）；清洗 Windows 非法字符、
  控制字符、首尾点/空格，长度 80 个码点，保留名（CON/COM1…）加 `_`，空名回退 `export`。
- **UI**：默认“显示格式 + 当前筛选排序”；导出中显示 `已发送 / 总行数` 进度与取消；
  成功显示路径/行数/字节；失败显示本地化错误（不回显 main 的 message）；Esc/X 关闭会取消
  进行中的会话。
- **性能**：约 1,000 行/块，块间 `setTimeout(0)` 让出事件循环；`formatCellValue` 的
  `Intl.DateTimeFormat`/`NumberFormat` 按 locale/格式缓存（原先每个日期单元格新建 formatter，
  是 100k 导出超过 10s 的根因）。

## 5. 验证命令与结果（2026-10-24 本机）

```text
pnpm verify
  143 files / 1232 tests passed；ESLint 0；
  depcruise 394 modules / 1584 deps / 0 violations

pnpm test:coverage
  lines 74.90% / statements 74.78% / branches 67.66% / functions 73.20%
  threshold 70/60 未下调
  csv-export.ts 100% / export-csv-plan.ts 100% /
  csv-export-file.ts 93.05% / use-export-csv.ts 60% / ExportCsvDialog.tsx 37.5%

pnpm format:check
  通过

pnpm build
  exit 0；renderer 1,617.22 kB + ImportSession 42.82 kB；CSS 64.03 kB；
  table/query/import worker 220.68/236.16/270.16 kB

pnpm e2e
  71 passed（3.1m）；export-csv.spec.ts 3 passed（2.3s / 4.8s / 2.1s）
  100k 导出 1,716ms/5,000ms；perf 内存 571MB/600MB、冷启动 1,025ms/2.5s

pnpm bench
  exit 0；open 663ms/3s、save 342ms/500ms、edit 0ms/50ms、query 213ms/400ms、
  text-sort 260ms/400ms、cjk-sort 667ms/800ms、import 893ms/8s、
  condition.rules.50x100 P95 1ms/16ms；clone 333ms（诊断）
```

E2E 关键断言：

- 3 行 × 6 列夹具（7 列隐藏 1 列）在筛选 `value >= 2` + `value desc` 下导出：文件以
  `EF BB BF` 开头，4 条记录（表头 + 3 行），行顺序 `r1 → r3 → r2`，`r4` 不在文件中，
  `Flag` 列不存在。
- 引号/逗号/换行/首尾空白/中文：`"Alice, A."`、`"line one\nline two"`、`"Bob ""B"""`、
  `" padded "`、`张三`、`"1,234.5"`。
- 原始值切换：`1234.5`、日期 epoch、`open`/`done`，不再出现 `"1,234.5"`。
- 100k 工作区：默认显示格式导出 1,716ms；`\r\n` 计数 100,001（表头 + 100k 行）。
- 取消：进度出现后取消，目标文件不存在，输出目录无 `.curve-export-*` 临时文件。
- 200% 缩放：键盘 Enter 打开对话框，`box` 在 713×377 视口内（x 76.6、宽 560），Esc 关闭。

## 6. 验收逐项

| # | 验收项 | 结果 |
|---|---|---|
| 1 | Excel 打开无乱码；引号/逗号/换行正确转义 | ✅ UTF-8 BOM + CRLF + RFC 4180；真实 Electron 文件字节断言，含中文/引号/逗号/内嵌换行/首尾空白 |
| 2 | 只导出当前筛选/排序结果 | ✅ 3 行筛选排序夹具；被筛掉的 `r4` 不在文件，顺序 `r1 → r3 → r2`；隐藏列不导出 |
| 3 | 100k 行导出 ≤5s 且 UI 可取消 | ✅ 1,716ms/5,000ms；进度 + 取消；取消后无目标/临时文件 |
| 4 | 原始值/显示格式、列顺序、文件名 | ✅ 对话框两种格式；视图列顺序；`<表名>-<yyyyMMdd-HHmm>.csv` 清洗与本地时间单测 |
| 5 | 只读、不污染工作区 | ✅ 不发命令、不写 manifest/JSONL；E2E 只读工作区文件 |
| 6 | 键盘与 200% 缩放 | ✅ Enter 打开、Esc 关闭；对话框在 200% 视口内 |
| 7 | 失败/取消无半成品 | ✅ 主进程临时文件 + rename；cancel/`before-quit` 清理；单测覆盖 rename 失败、未知 token、超大块 |

## 7. 视觉证据

导出对话框（默认显示格式、当前筛选排序、3 行 × 6 列、隐藏列与默认文件名提示）：

![t3.6-export-dialog](t3.6-export-dialog.png)

截图由 `e2e/export-csv.spec.ts` 在真实 Electron 中 attach；像素不稳定，断言不依赖截图。
200% 缩放只做几何/键盘断言（未提交截图，避免缩放截图裁剪造成误读）。

## 8. 残留风险

- 显示格式含千分位/本地化日期，Excel 可能把带逗号的引号字段识别为文本；数值语义请用
  “原始值”。
- 原始值日期是 epoch ms，不是 ISO/Excel 日期。
- 只导出可见列；不提供隐藏列包含/列选择器。
- 不缓解 CSV 公式注入（`=`/`+`/`-`/`@` 不改写）；需要时另加显式选项与 ADR。
- 一次只允许一个导出任务；并发导出需要 token 级进度 UI，T3.6 不做。
- 100k 导出在主线程分块格式化；100k×10 实测 1,716ms，极宽表（100 列）单块可能更长，
  后续可增大让出频率或移入 Worker（需解决 `@curve/ui` 的 React/CSS 依赖）。
- 进程崩溃可能留下 `.curve-export-*.tmp`；正常取消与退出会清理。
- `ExportCsvDialog.tsx` 容器（IPC/流式接线）主要由 E2E 覆盖（lines 37.5%），视图与 hook
  有单测；全局 lines 74.90% 仍高于 70/60。
- renderer bundle 增至约 1.62MB（+23 kB），T6.4 打包阶段评估拆包。

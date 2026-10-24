# ADR-039 T3.6 的 CSV 导出、流式 IPC、原始/显示值与文件名

- 状态：已接受
- 日期：2026-10-24
- 相关：SPEC §9.6、§15.1、§15.4、§16.1；TASKS T3.6；ADR-031、ADR-032、ADR-035、ADR-038

## 背景

T3.6 要求把当前视图导出为 Excel 可读的 CSV：UTF-8 BOM、引号/逗号/换行正确转义、
可选“原始值/按显示格式”、列顺序按视图、只导出当前筛选/排序结果、默认文件名
`<表名>-<yyyyMMdd-HHmm>.csv`，并且 100k 行导出 ≤5s、UI 可取消、不得一次性拼 100MB 字符串。

现状有三个限制：

1. `file:exportText` 只接受一个完整 `content` 字符串，主进程再原子写盘；它适合几 KB 的
   `.curvestyle.json`，但没有进度、没有取消，也无法分块。
2. 显示格式化的唯一实现是 `@curve/ui` 的 `formatStyledCellValue`（ADR-035），它依赖当前
   解析后的 `TableStyle`、locale 与布尔文案；`@curve/table-engine` 不能 import UI 包。
3. 网格已经在 `DataGrid` 内持有筛选/排序后的 `rows`、可见列、`tableStyle`、`tableMeta` 与
   locale；导出应复用这些状态，不能另起查询或样式求值路径。

用户已确认本文的全部建议：导出入口在网格工具条、默认显示格式、仅可见列、默认当前筛选/
排序结果、新增单通道流式 IPC、BOM + CRLF + RFC4180、默认文件名与“不处理公式注入”。

## 决定

### 1. 入口与归属：网格工具条 + 只读导出

- `DataGrid` 工具条新增“导出 CSV…”，打开 `ExportCsvDialog`；对话框显示当前范围
  （行数 × 列数）、值格式与行范围选项。导出完成后在对话框内显示路径、行数与字节数。
- 导出是**只读**操作：不发命令、不进 `EditHistory`、不写 manifest/JSONL、不标脏表。
  因此不新增命令总线命令，也不放进 `WorkspaceActions`。
- 导出状态（进行中、进度、可取消）属于 renderer 的导出控制器；同一窗口同时只允许一个
  导出任务。

### 2. 行与列范围

- **列**：只导出当前视图的可见列，顺序严格按 `tableView.columnOrder`；隐藏列不导出。
  表头数量与网格表头一致，不提供列选择器。
- **行**：默认导出当前视图筛选/排序后的 `rows`（即 `DataGrid` 正在显示的行与顺序）。
  对话框另提供“全部行（忽略筛选、保留排序）”；选择后重跑同一查询函数、只去掉 filter。
- 空表导出表头一行；0 列在 schema 中不会出现，不单独处理。
- 不导出条件格式的颜色/图标、bar/badge 的视觉形态、选中/错误状态；CSV 只承载文本。

### 3. 值格式与表头

| 项 | 原始值（`raw`） | 按显示格式（`display`，默认） |
|---|---|---|
| text | 原样 | 原样 |
| number | `String(value)`，无千分位、无列精度覆盖 | `formatStyledCellValue`（`Intl` 千分位/列精度） |
| date | 存盘 epoch ms 的十进制字符串 | `formatStyledCellValue`（列 `dateFormat`/locale） |
| boolean | `true` / `false` | 网格同一套本地化文案（`trueLabel`/`falseLabel`） |
| enum | 存储值 | 列选项 label（`formatStyledCellValue`） |
| null | 空字段 | 空字段 |
| 表头 | `column.label` | `columnDisplayLabel(column, style)` |

- 显示格式复用 `@curve/ui` 的 `formatStyledCellValue`，由 renderer 注入 formatter 回调；
  `@curve/table-engine` 只负责 CSV 语法与原始值，不复制第二套格式化。
- 条件样式不参与导出：同一单元格在网格里可能标红，但 CSV 仍是格式化后的文本。
- 布尔文案与网格一致：`DataGrid` 已把 `t('grid.editor.true')` / `t('grid.editor.false')`
  传给 `formatStyledCellValue`，导出沿用同一对参数。

### 4. 传输：新增单通道 `file:exportCsv`（op 联合）

```ts
type ExportCsvRequest =
  | { op: 'begin'; suggestedName: string; filters: FileFilter[] }
  | { op: 'append'; token: string; chunk: string }
  | { op: 'finish'; token: string; rows: number }
  | { op: 'cancel'; token: string };

type ExportCsvReply =
  | { op: 'begin'; token: string; path: string }
  | { op: 'append'; bytes: number }
  | { op: 'finish'; path: string; bytes: number; rows: number }
  | { op: 'cancel'; removed: boolean }
  | null; // begin 时用户取消保存对话框
```

- `begin` 在 main 显示原生保存对话框（E2E 走 `CURVE_E2E_SAVE` 替身），在目标目录创建
  `<目标名>.curve-export-<uuid>.tmp`，返回不透明 `token`。renderer 不会拿到可写路径，
  `append/finish/cancel` 只接受 token。
- `append` 顺序追加 UTF-8 字符串；main 校验 token、单块 ≤8MB，返回累计字节数。
  单次 IPC 仍受 SPEC §15.1 的 256MB 上限保护。
- `finish` `fsync`、关闭文件句柄、用 rename 覆盖目标文件（Windows 下 Node 的 rename 会替换
  已存在文件），返回路径/字节数/行数；失败删除临时文件并返回 `E_EXPORT_FAILED`，不破坏
  原有目标文件。
- `cancel` 关闭句柄并删除临时文件；已完成的导出不能再 cancel。renderer 在取消/失败/关闭
  窗口时尽力调用 cancel；main 在 `before-quit` 清理所有未完成 token 的临时文件。
- 临时文件只存在于用户通过保存对话框选择的目录；不进入工作区白名单，也不读写工作区。
- 新增通道使 `ALL_IPC_CHANNELS` 19→20、已实现通道 14→15；同步更新 SPEC §15.1/§15.4、
  `api-client` 双向 Zod 校验、`preload` 白名单与 `ipc.spec.ts` 的方法清单。
- `file:exportText` 保持不变，继续服务 `.curvestyle.json` 等整串导出；不复用/不扩展它。

### 5. 文件格式与文件名

- UTF-8，无 BOM 以外的编码；首块以 `\uFEFF` 开头，且只写一次。
- 行尾 CRLF（RFC 4180，Excel 兼容）；最后一行也以 CRLF 结尾。
- 字段转义：包含 `,`、`"`、CR、LF 或首尾空白时用双引号包裹，内部 `"` 写成 `""`；
  其余原样。表头与数据行使用同一规则。
- 默认文件名：清洗后的表名 + `-` + 本地时间 `yyyyMMdd-HHmm` + `.csv`。清洗去掉
  `<>:"/\|?*` 与控制字符、首尾空白/句点，长度上限 80（表名部分），空名回退 `export`。
  原生保存对话框预填该名称，用户仍可改路径/名称。
- **不处理 CSV 公式注入**：以 `=`、`+`、`-`、`@` 开头的文本不改写，保持数据保真。
  这是已知风险，写入任务报告；如产品要求缓解，另加选项与 ADR，不能静默改写。

### 6. UI、进度、取消与错误

- 对话框：值格式（显示格式/原始值）、行范围（当前筛选排序/全部行）、范围摘要
  （N 行 × M 列）、说明“仅可见列，按视图顺序”。默认“显示格式 + 当前筛选排序”。
- 导出中显示模态进度（已发送行数/总行数）与“取消”；每约 1,000 行 append 一次，
  块间让出事件循环，保持 UI 可响应。
- 取消：停止生成、调用 `file:exportCsv cancel`、关闭进度、显示“已取消”，不留下目标文件
  或临时文件。保存对话框取消时不创建 token。
- 成功：对话框内显示路径、行数与字节数；不自动打开文件/文件夹。
- 失败：`E_EXPORT_FAILED`/`E_VALIDATION` 用消息表文案显示；不发布半成品；已有目标文件
  保持原样。
- 对话框与进度支持纯键盘操作、Esc 关闭与 200% 缩放；导出中 Esc/X 关闭会取消进行中的
  会话（不叠加第二个确认框）。

### 7. 测试与验收

- `@curve/table-engine`：转义（逗号/引号/CRLF/首尾空白/空值）、BOM 只一次、表头、
  raw/display formatter 回调、空表、文件名清洗与本地时间、分块边界（不拆字段）。
- main：begin/append/finish/cancel、token 校验、块大小、fsync/rename、失败清理、
  保存对话框取消、`before-quit` 清理、E2E 替身路径。
- IPC/preload/api-client：Zod 正反例、通道清单、方法白名单。
- renderer：对话框选项/摘要、进度/取消/完成/错误、快捷键与错误分支。
- E2E `export-csv.spec.ts`：含逗号/引号/换行/中文/空值的表；筛选+排序后导出，断言仅当前
  行与视图列顺序、BOM/CRLF/转义、Papa Parse 往返值一致；原始值/显示格式各一条；
  100k 导出 ≤5s；取消后无文件/临时文件；200% 缩放与键盘。
- `pnpm verify`、`pnpm format:check`、`pnpm build`、`pnpm e2e`、`pnpm bench` 全绿；
  新增预算写入 SPEC §16.1（CSV 导出 100k ≤5s，E2E 计时）。

## 代价

- IPC/preload 表面从 14 个已实现通道增至 15 个；新增 token 生命周期、临时文件清理与
  跨进程分块协议，测试面比“整串导出”大。
- 导出在 renderer 主线程分块生成并格式化；100k×10 的 `Intl` 格式化可能占用数百毫秒到数秒，
  虽分块让出事件循环，仍会与滚动/查询争 CPU。若实测超预算，可把纯格式化下沉到 Worker，
  但需解决 `@curve/ui` 的 React/CSS 依赖（届时另写 ADR）。
- 显示格式包含千分位/本地化日期，Excel 可能把带逗号的引号字段识别为文本；需要数值语义时
  用“原始值”。
- 原始值日期是 epoch ms，不是 ISO/Excel 日期；这是“存盘值”的字面语义。
- 只导出可见列；需要隐藏列或列子集时，用户先调整视图，或后续加列选择器。
- 不缓解公式注入；打开不可信 CSV 的用户需自行承担 Excel 公式执行风险。
- 一次只允许一个导出任务；并发导出需要多 token 进度 UI，T3.6 不做。

## 影响

- `@curve/table-engine`：新增 `csv-export.ts`（BOM/CRLF/转义/raw 值/表头/文件名/分块生成），
  从包根导出；测试同目录。
- `apps/desktop`：`shared/contracts/{channels,ipc}.ts` 新增通道、请求/响应类型与 Zod；
  `preload/api.ts` 暴露 `file.exportCsv`；`main/export/*` 新增 token store 与临时文件写入器；
  `main/ipc/handlers.ts`、`main/index.ts` 接线与 `before-quit` 清理；`renderer/api-client.ts`；
  `renderer/features/export/{ExportCsvDialog,use-export-csv,export-csv-text}.tsx/ts`；
  `DataGrid` 工具条与对话框；i18n 中英文案；`styles.css`；`e2e/export-csv.spec.ts`。
- `docs`：SPEC §9.6（实现边界）、§15.1（通道）、§15.4（preload）、§16.1（预算）、
  TASKS T3.6、ADR 索引、CHANGELOG、HANDOFF、`docs/reports/t3.6/REPORT.md` 与截图。
- 不改变 `formatVersion`、manifest 字段、JSONL、工作区路径白名单、CSP、沙箱或运行时依赖。

## 复核条件

- 若 Excel 在目标 locale 下需要分号分隔或 `sep=;` 首行，需新增显式选项并更新本 ADR。
- 若产品要求“包含隐藏列/自选列”，扩展对话框与导出计划，保持默认仅可见列。
- 若要求缓解公式注入，新增显式选项（默认关闭）并写明对数据保真的影响。
- 若 100k 导出实测 >5s 或主线程明显卡顿，优先把格式化/编码移入 Worker；若 Worker 无法
  复用 `@curve/ui`，先抽出无 React 的格式化入口，再写 ADR，不得复制第二套格式化。
- 若单文件超过 256MB IPC/内存上限，需要重新设计传输（例如 main 侧直接流式生成），
  不能放宽上限蒙混。
- 若未来支持并发导出，需要 token 级进度、取消与临时文件命名隔离，并重审本 ADR 的
  “一次一个任务”限制。

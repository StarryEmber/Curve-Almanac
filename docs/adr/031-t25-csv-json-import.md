# ADR-031 T2.5 的 CSV/JSON 导入、字节传输、工作线程与原始文件归档

- 状态：已接受
- 日期：2026-10-22
- 相关：SPEC §5.1、§8.1、§9.4、§13.1、§13.2、§13.3、§15.1、§15.4、§16.1；T2.5；ADR-005、ADR-006、ADR-007、ADR-014、ADR-024、ADR-028、ADR-029、ADR-030

## 背景

T2.5（CSV/JSON 导入向导）需要落地一批 SPEC 只给出目标行为、没有给出实现边界的选择。
2026-10-22 按 AGENTS §11 逐项询问用户，用户确认以下 12 项；本 ADR 记录决定、实现边界
和后续任务的复用约束。

## 决定

### 1. `file:importText` 返回原始字节，编码在 Worker 解码

- SPEC 原文只返回 `text`，但 GBK 字节一旦按 UTF-8 解码就无法无损还原，手动切换编码也只能
  重新读文件。因此 `file:importText` 的响应改为：
  `{ token, name, bytes: Uint8Array, sha256, size, format } | null`。
- main 只负责选择文件、100MB 限制、读取字节和计算 SHA-256；编码检测/解码在专用 import
  Worker 中完成。UI 提供 `自动 / UTF-8 / GB18030（兼容 GBK）` 覆盖，切换时 Worker 用保留的
  原始字节重新解码，不重读磁盘。
- 自动策略：先严格 UTF-8；失败后严格 GB18030；两者都失败时保留 UTF-8 替换字符并报告
  `mismatch`。手动选择时若出现 U+FFFD 或严格解码失败，同样显示“编码可能不匹配”警告。
- 编码使用平台 `TextDecoder`；不引入 `jschardet`/`iconv-lite` 运行时依赖。`iconv-lite` 仅作为
  devDependency 供 `scripts/gen-100k.ts` 生成 GBK 夹具。

### 2. CSV 解析使用 Papa Parse

- 新增 `papaparse` 运行时依赖（`@curve/table-engine`），并用 `@types/papaparse` 做类型检查。
- 仅使用同步 `Papa.parse`，Worker 中完成；不在 renderer 主线程解析大文件。
- 分隔符在前 20 条记录上对 `, ; \t |` 做稳定性评分，选择字段数稳定且更宽者；平局按
  `, ; \t |` 顺序。表头启发式：首行全为文本、唯一/非空、且后续样本中存在非文本列时判定为
  表头；全文本歧义时默认 true。两者都可以在预览步覆盖并立即重解析。
- JSON 支持对象数组或 `{rows:[...]}`；键取所有对象键的并集，缺失键填 `null`；嵌套对象/
  数组报 `E_IMPORT_FORMAT`。JSON 的编码同样经过字节解码，默认 UTF-8 优先。

### 3. 列映射：当前表内导入，自动映射 + 可编辑

- 每张表在左侧列表提供“导入”入口；目标表固定为当前表，不新建表。
- 源列按规范化后的 key/label 自动匹配已有列；只自动匹配类型兼容的列（text→text，其余同类型）。
  未匹配的源列变成新列草稿；用户可以把任一源列映射到已有列、新建可选列或忽略。
- 一个目标列最多接收一个源列；未映射的 required 列（主键除外）阻止提交。新列仅支持
  text/number/date/boolean，始终非必填，复用 `checkColumnDraft` 与 100 列上限。
- 类型推断抽样前 1,000 个非空值，按 boolean/date/number 顺序计算置信度；最高置信度 <80%
  回退 text。置信度与推断类型在映射步显示，用户可覆盖。日期只接受 `YYYY-MM-DD` 或 ISO 形式，
  避免把普通数字/模糊字符串误判为日期。

### 4. 坏行：整批校验，显式跳过或取消

- 先完成全量解析、映射、`coerceCell` 与主键唯一性检查；统计 `total/accepted/skipped`。
- 有 issue 时展示前 100 条，提供“导出全部错误 CSV”和“跳过错误行，导入其余行”；不提供
  对话框内逐格修正。选择跳过时必须显式勾选，随后重新校验；accepted=0 时只能取消。
- 错误 CSV 为 UTF-8 BOM + CRLF，一行一个坏数据行（同一行多个 issue 合并到该行），包含
  `row,columns,codes,values,messages`；行号是 1-based 数据行，不含表头。
- 坏行整行跳过，不会把一行中的合法单元格单独写入。

### 5. 追加/替换、备份与原始文件

- 默认追加；替换必须二次确认（显式复选框），并显示当前行数。替换复用 T2.2 保存队列：
  `writeTable` 写新 JSONL 前自动把旧表复制到 `backups/`，manifest 最后写；不额外制造第二份备份。
- 原始文件在提交前归档到 `imports/`：
  - ≤50MB：逐字节复制为 `imports/<UTC timestamp>-<safe name>`；
  - >50MB：只写 sidecar；
  - sidecar 为 `imports/<same base>.json`，记录原始路径、SHA-256、字节数、编码、格式、表 ID、
    模式、导入时间和是否复制。
- 复制或哈希失败在 dispatch 前中止，不修改内存/表/manifest。sidecar 是普通文件，不改变
  `manifest.json` 或 `formatVersion`。

### 6. 专用 import Worker；取消即 terminate

- 新增 `apps/desktop/src/renderer/workers/import.worker.ts`，每次向导会话创建一个专用 Worker。
- Worker 持有原始字节、解码文本、完整解析结果和映射后的候选行；renderer 只拿到 20 行预览、
  统计和最终 rows。renderer 不把 10 万行放进 React state。
- 取消按钮/关闭对话框调用 `terminate()`，Worker 及其数据集立即释放；不 dispatch、不写盘。
  Worker 内的解析/校验不提供协作式中断；terminate 是取消边界。
- Worker 只负责解析、类型推断与 `planImport`；最终 `table.import` 命令在 app-core 再次校验
  物理 Cell、行 ID、列数、主键唯一性和容量上限，不能信任 stale preview。

### 7. 200k 上限、100k 提示与 256MB

- 最终行数：append = 现有行数 + accepted；replace = accepted。>200,000 在 dispatch 前由
  `planImport`/`table.import` 拒绝；100,001–200,000 在提交步要求显式确认。
- 256MB 文件上限继续由 `table:write` / `tableWriteLimitError` 在写盘时强制；超限返回
  `committed: true`，不在 dispatch 前编码整表。
- 100MB 源文件上限由 main 在读取前检查，超限 `E_IMPORT_FORMAT`，不读入内存。

### 8. 保存时机与撤销

- `table.import` 是唯一文档变更命令：同一 Immer 事务内追加/替换行、追加可选列、同步所有
  表视图的 `columnOrder`、更新 `rowCount/updatedAt`。失败不发布半成品。
- 成功后走 T2.2 保存队列（表 → manifest），`applyImport` 等待 flush ≤3s；失败返回
  `committed: true`，内存保留，状态栏可重试，不重复执行。
- `table.import` 进入最小历史：一次导入一条、不合并；撤销/重做同时回滚追加/替换、行与新增列。
  100k 逆补丁的内存计入 T5.2 的 256MB 上限评估，T2.5 不另起历史栈。

### 9. 夹具与性能

- 提交 `fixtures/csv/{small,quoted,types,bad-rows}.csv`、`fixtures/json/points.json` 与 README；
  `fixtures/csv/gbk-100k.csv` 由 `scripts/gen-100k.ts` 生成，gitignore，不提交大文件。
- `scripts/gen-100k.ts` 固定内容：100,000 数据行、GBK、分号、3 行坏数据（类型错误、短行、
  超宽行）。
- `pnpm bench -- --import` 增加 `import.100k` case，p95 预算 8,000ms；实测 p95 659ms
  （本机，2026-10-22）。E2E 的 100k 用例断言从确认到网格可交互 <8s。

## 代价

- `file:importText` 的响应从 `text` 改为 bytes，新增 `file:archiveImport` 通道；这是
  SPEC §15.1/§15.4 的公共契约变更，已在本 ADR 记录。`ALL_IPC_CHANNELS` 从 18 变为 19，
  `IMPLEMENTED_IPC_CHANNELS` 从 11 变为 14。
- 100k 行在 Worker 中保留完整数据集，取消/完成前会占用额外内存；导入后还要生成 JSONL 并
  通过 `table:write` 发送，峰值高于单纯打开表格。实测 bench 内存峰值 206.2MB（仅核心管线）。
- `planImport` 在 Worker 和命令层各跑一次，100k 约多一次 O(行×列) 校验；换取 stale preview
  不会写入半成品。
- 替换前没有独立的第二份备份；复用 `writeTable` 的旧文件备份，若写盘在备份后、rename 前失败，
  旧表文件仍可读，但 UI 只显示保存失败。
- 新列只支持四种存储类型；enum/fieldType 仍走 T2.3 列面板。
- 错误 CSV 一行合并多个 issue，机器消费需要拆分 `codes/messages` 字段；这是为了满足
  TESTPLAN E4 的“3 行坏数据对应 3 行错误”口径。
- 100k 导入的 Worker 解析/校验是同步长任务；取消通过 terminate 立即生效，但 Worker 内部
  没有逐个 chunk 的进度回调，UI 只显示阶段性忙碌文案。

## 影响

- `@curve/table-engine` 新增 `papaparse` 运行时依赖；新增 `import.ts`（sniff/parse/JSON/
  inference/`planImport`/`ImportIssue`/`ImportPlan`）与测试；package 标记
  `"sideEffects": false`，让未被 app-core 使用的 import/CSV 代码不进入初始 renderer bundle。
- `@curve/app-core` 新增 `table.import` 命令、`applyImport` action、`import-planning.ts`
  （`createImportColumns`/`autoMapImportColumns`）、历史记录与保存队列接入、`archiveImport`
  注入点。
- `apps/desktop` 新增 `main/import/{import-files,import-token-store}.ts`、`file:importText`/
  `file:exportText`/`file:archiveImport` 通道、`FileWorkspaceStore.archiveImport`、renderer
  `import/*` worker/client/encoding/protocol、`features/import/*` 五步向导、TableList 入口、
  i18n/CSS、`e2e/import.spec.ts` 6 条。导入向导通过 `ImportSession` 懒加载，避免 42.82 kB
  的 UI chunk 影响 100k grid 首帧预算。
- `scripts/gen-100k.ts`、`scripts/bench.ts --import`、fixtures 与 README；E2E 的大型夹具在
  导入用例内按需生成，不在 worker fixture 生成（否则会挤压 100k grid 首帧测试）。
- 不改变 `formatVersion`、JSONL 形态、manifest 字段、CSP、沙箱或 preload 白名单；不引入
  jschardet/iconv-lite 运行时依赖。

## 复核条件

- T2.6：导入后的筛选/排序视图需确认“追加/替换”与当前视图状态的关系；本 ADR 只在表级提交，
  不实现视图级可见行语义。
- T2.7：100k/200k 导入的命令阶段和内存峰值；若超过 SPEC §16.1，评估把 `table.import` 的
  行构建/校验也移入 Worker 或分块提交。
- T5.2：导入逆补丁的 256MB 字节上限；保留“一次导入一条、不合并”。
- 若未来需要 JSON 插件导入器（T6.2）或 >50MB 原文复制，重新评估 `file:archiveImport` 与
  sidecar 契约；不得在 T2.5 上静默扩展。

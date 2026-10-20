# ADR-022 表数据缺文件语义与打开时 `rowCount` 重算

- 状态：已接受
- 日期：2026-10-20
- 相关：SPEC §2.2、§7.3、§7.5、§15.1；T1.3；ADR-003、ADR-021

## 背景

SPEC §7.3 规定空表是 **0 字节文件**，`table:read` 的响应是 `{ jsonl, bytes }`。但 SPEC 没有覆盖两种真实状态：

1. **新建空表尚未落盘**：T2.1 新建表后，`manifest.tables[]` 已有条目而 `tables/<id>.jsonl` 还不存在。此时 `table:read` 应该返回空表还是报错？
2. **数据文件丢失但 manifest 仍声明有行**：崩溃、外部删除或同步冲突都会造成这种状态。如果把它当成空表，用户会以为"数据还在、只是空了"，随后自动保存会把 0 行写回磁盘，**永久覆盖**唯一证据。

T1.2 的两个适配器实现不一致：`FileWorkspaceStore.readTable` 在缺文件时抛 `E_TABLE_NOT_FOUND`，`MemoryWorkspaceStore.readTable` 返回 `''`。同一端口两种语义，T1.5 的命令总线无法统一处理。

同时 SPEC §7.5 要求"打开后立即重算每表 `rowCount`"，但没有说明：重算是否要解析单元格、文件缺失时是否把提示值清零、重算失败是否阻塞打开。

## 决定

### 1. `table:read` 缺文件语义（两个适配器一致）

- 表在 manifest 中且 `rowCount === 0` → 返回 `{ jsonl: '', bytes: 0 }`。这是"从未写入过的空表"，与 SPEC §7.3 的 0 字节空表等价。
- 表在 manifest 中且 `rowCount > 0` → 返回 `E_TABLE_NOT_FOUND`，`detail` 带 `table=<id> rowCount=<n>`。上层必须提示"数据文件缺失"，**不得**当作空表继续保存。
- 表不在 manifest 中 → 仍然 `E_TABLE_NOT_FOUND`（既有行为不变）。

### 2. 打开时 `rowCount` 重算

- 只统计**内容行数**（`countJsonlRows`：按 `\n` 扫描，不 `JSON.parse`、不逐格校验）。打开 100k×10 必须留在 SPEC §16.1 的 3s 预算内。
- 与 manifest 不一致 → 追加 warning，用既有的"备份 + `write-file-atomic`"重写 manifest，并让 `open` 返回修正后的 manifest。
- **不修改 `manifest.updatedAt`**：修提示值不是用户编辑，不应让工作区显示为已修改。
- 数据文件缺失或不可读 → 保留原 `rowCount`，只追加 warning（缺失文件另由 `collectMissingTableWarnings` 报告）。**禁止静默清零**。
- JSONL 不以 `\n` 结尾 → 追加 warning（SPEC §7.3 要求末尾换行）。
- 重写 manifest 失败 → 追加 warning 并记录日志，**打开仍然成功**。
- 单元格级错误不在这里处理：真正的解析发生在 Worker 的 `decodeJsonl`，以 `E_TABLE_PARSE` + 行号 + 列 id 返回。

### 3. 写盘前上限

- `writeTable` 在写盘前检查 SPEC §2.2：行数 > 200,000 或字节 > 256MB → `E_TABLE_LIMIT`，不落盘、不备份。

## 代价

- `rowCount` 是提示值，重算只保证"行数"，不保证"内容可解析"；损坏文件仍可能被计入行数，直到有人真正读取该表。
- 新建空表与"被清空但提示值恰好为 0"的表无法区分。这是提示值方案的固有限制，v1 接受。
- 重算需要把每个表文件读入内存一次（100k×10 约 20–40MB / 表）。表数上限 20，极端情况（20 张满表）会明显变慢；T2.6 的打开性能任务再评估按需重算或流式计数。

## 影响

- `SPEC §7.5` 补充缺文件语义与重算的边界；`SPEC §15.1` 的 `table:read` 行加一句指向本节。
- `FileWorkspaceStore` 与 `MemoryWorkspaceStore` 的 `readTable` 行为一致；`FileWorkspaceStore.open` 新增重算步骤。
- 不改变 `manifest.json` 字段、`formatVersion` 或 IPC 通道形状。
- T2.1 的"新建表"可以直接建 manifest 条目不落 0 字节文件；即使落文件，语义也一致。

## 复核条件

- T2.1 若决定"新建表一律写 0 字节文件"，可简化成"缺文件一律空表"，但必须保留 `rowCount > 0` 的数据丢失告警。
- 若未来给 `TableMeta` 增加"从未写入"标记（需要 `formatVersion` 迁移），重新评估第 1 条。
- 打开性能超出 SPEC §16.1 预算时，改为按需/后台重算或流式计数，并另写 ADR。

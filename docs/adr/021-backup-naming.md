# ADR-021 备份文件命名、轮转与恢复路径

- 状态：已接受
- 日期：2026-10-20
- 相关：SPEC §7.1、§7.4、§7.5；T1.2

## 背景

SPEC §7.1 的目录布局写的是 `backups/tbl_<uuid>.<timestamp>.jsonl.bak`，§7.4 的步骤写的是 `backups/<name>.<ISO时间戳>.bak`，两处不一致。另一方面，ISO 8601 时间戳包含 `:`，在 Windows 文件名中非法，不能直接使用。备份命名属于持久化文件格式，必须先确定再实现。

## 决定

- 表备份文件名：`backups/<tableId>.<timestamp>.jsonl.bak`，例如
  `tbl_9a2e.20261020T054500123Z.jsonl.bak`。
- manifest 备份文件名：`backups/manifest.<timestamp>.json.bak`，用于 SPEC §7.5 的启动恢复。
- `timestamp` 为 UTC 的紧凑格式 `YYYYMMDDTHHmmssSSSZ`（由 `Date#toISOString()` 去掉 `-`、`:`、`.` 得到）；字典序即时间序，且 Windows/POSIX 均合法。
- 每个目标（每张表或 manifest）最多保留 **3** 份；写入新备份后按时间戳从新到旧轮转。
- 打开工作区时清理 `backups/` 中超过 **7 天**、且严格匹配上述两种模式的 `.bak`；不碰其他文件。
- 同一毫秒重复写入时，时间戳递增 1ms 直到文件名可用，命名模式不变。
- `backup:list` / `backup:restore` 只暴露表备份。`restore` 的 `backupPath` 必须是 `backups/<tableId>.<timestamp>.jsonl.bak`，解析 `realpath` 后必须仍位于该工作区的 `backups/` 内，否则返回 `E_PATH_DENIED`。

## 代价

- 与 §7.4 的 `<name>.<ISO时间戳>.bak` 字面不同；时间戳不是标准 ISO 字符串（去掉了分隔符），需要时由代码转换。
- manifest 备份不通过 `backup:restore` 暴露，恢复仍走 §7.5 的启动恢复流程。
- 清理是 best-effort；单个旧文件删除失败不会阻塞打开或保存，只记录日志。

## 影响

- 更新 SPEC §7.1/§7.4/§7.5 的文案；`listBackups` 返回工作区相对路径（`backups/...`），不返回绝对路径。
- 不改变 `manifest.json` 的字段，也不改变 `formatVersion`。

## 复核条件

- 需要外部脚本把备份时间戳直接当 ISO 解析，或备份数量/保留期需要用户可配置时，重新评估。

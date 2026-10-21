# v1-min 夹具

最小合法 v1 工作区（SPEC §6.5 / §7.1），用于 T1.4 的「打开成功，行数与内容逐行相等」验收，
T1.5 的命令总线与 T2.x 的网格也可复用。

## 内容

- 1 张表 `tbl_v1min`（名为 `Sensor readings`），3 行，manifest 的 `rowCount: 3` 与磁盘一致。
- 列顺序即 JSONL `v` 的顺序：
  1. `col_id` — `text`，主键，值 `sensor-1..3`（唯一）；
  2. `col_time` — `date`，role `x`，存 epoch ms；
  3. `col_sensor_a` — `number`，role `y`，单位 °C，`precision: 1`。
- `tables/tbl_v1min.jsonl`：3 行 `{"id","v"}`，UTF-8、LF、末尾换行，无坏行。
- `backups/.gitkeep`：仅用于让空 `backups/` 进入版本库，不是备份文件。
- 时间固定为 UTC：`createdAt = 2026-01-01T00:00:00.000Z`，`updatedAt = 2026-01-01T00:10:00.000Z`。

## 预期

- `FileWorkspaceStore.open` 成功，`warnings` 为空，重算后的 `rowCount` 仍为 3。
- `decodeJsonl` 返回 0 个 issue，行内容逐行等于下面的数组（顺序不变）：

  ```text
  ["sensor-1", 1735689600000, 21.5]
  ["sensor-2", 1735689660000, 23.1]
  ["sensor-3", 1735689720000, 19.8]
  ```

- 打开会写 `.lock`，因此测试必须先把整个目录复制到临时目录，不得改动仓库内文件。

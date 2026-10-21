# stale-lock 夹具

合法 v1 工作区 + 一份**固定内容**的残留 `.lock`，用于 SPEC §7.5 的崩溃恢复提示与
T1.4 的「迁移前备份/打开路径」回归。

## 内容

- `manifest.json`：`ws_stalelock`，1 张表 `tbl_stalelock`，3 行，`rowCount: 3`；表结构同
  [`v1-min`](../v1-min/README.md)（text 主键 / date X / number Y）。
- `tables/tbl_stalelock.jsonl`：3 行，无坏行；`backups/.gitkeep` 仅为保留空目录。
- `.lock`（**故意提交进仓库**，内容固定、不含真实 PID 与时钟）：

  ```json
  {"pid":999999,"startedAt":"2020-01-01T00:00:00.000Z","appVersion":"0.1.0"}
  ```

  `startedAt` 固定为 2020-01-01 UTC，远早于 24h 的 stale 阈值，因此无论机器时钟如何都判定为
  stale（不依赖 `pid` 是否存活）。

## 预期

- `FileWorkspaceStore.open` 成功，`warnings` 含「上次未正常退出 / stale lock replaced」提示。
- 打开后 `.lock` 被替换为当前进程的锁；`close` 后 `.lock` 被删除。
- 3 行内容仍逐行等于 `v1-min` 中的值；manifest 不被迁移或改写。
- 测试必须复制到临时目录再打开，**不要**直接打开仓库内夹具（会改写 `.lock`）。

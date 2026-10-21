# future-version 夹具

满足 v1 结构、但 `formatVersion: 2` 的 manifest，用于 SPEC §7.6 / §2.2 的「高版本工作区必须
拒绝并提示升级，禁止尽力解析」。

## 内容

- `manifest.json`：`formatVersion: 2`、`id: ws_future`；其余字段沿用 v1 形状，没有表数据。
- 没有 `tables/`：版本闸门必须在 Zod 结构校验与任何文件访问之前生效。
- 时间固定为 UTC（`2026-01-01T00:00:00.000Z` / `2026-01-01T00:10:00.000Z`），与 `v1-min` 一致。

## 预期

- `parseManifestDocument` / `FileWorkspaceStore.open` 返回 `E_WS_VERSION_UNSUPPORTED`，
  `detail` 含 `formatVersion=2`。
- 不得出现 `E_WS_INVALID_MANIFEST`（那会说明版本检查发生在 Zod 之后）。
- 原文件字节不变，且不留下 `.lock`。

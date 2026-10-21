# corrupt-manifest 夹具

`manifest.json` 是被截断的 JSON（缺少后续字段与闭合括号），用于验证 SPEC §7.6 / §7.5：
损坏的 manifest 必须拒绝打开，且**不得被覆盖**。

## 内容

- `manifest.json`：故意截断，`JSON.parse` 失败。
- 没有 `tables/`：版本与结构校验都发生在任何表文件访问之前。

## 预期

- `parseManifestDocument` / `FileWorkspaceStore.open` 返回 `E_WS_INVALID_MANIFEST`。
- 原 `manifest.json` 字节不变，且不留下 `.lock`。
- 时间未写入（文件本身不含合法时间戳）；测试不得依赖当前系统时间。

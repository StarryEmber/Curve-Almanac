# ADR-020 workspace:create 的目录语义

- 状态：已接受
- 日期：2026-10-20
- 相关：SPEC §7.1、§9.0、§15.1；T1.2

## 背景

SPEC §15.1 定义 `workspace:create` 的请求为 `{ dir, name }`，但没有说明 `dir` 是父目录还是工作区根目录；§7.1 的示例是 `Demo.cstudio/`，§9.0 的默认目录是 `Documents/Curve Studio/`，也没有定义名称到目录名的拼接规则。该语义直接影响磁盘布局与 IPC 契约，因此不能由实现自行猜测。

## 决定

- `workspace:create` 的 `dir` 是**父目录**；main 实际创建的工作区根为：
  `join(realpath(dir), sanitize(name) + '.cstudio')`。
- 父目录不存在时递归创建；`dir` 已存在但不是目录时返回 `E_FS_WRITE`。
- `sanitize(name)` 规则：
  1. Unicode NFC 归一；
  2. 把 Windows 非法字符 `<>:"/\|?*` 与 `U+0000`–`U+001F` 替换为 `-`；
  3. 去掉首尾空白与结尾的 `.`/空格；
  4. Windows 保留设备名（`CON`、`PRN`、`AUX`、`NUL`、`COM1`–`COM9`、`LPT1`–`LPT9`）追加 `-`；
  5. 清洗后为空、`.` 或 `..` 时返回 `E_VALIDATION`。
- 工作区根已存在时返回 `E_WS_BUSY`，不自动改名、不覆盖。
- `manifest.name` 保存用户输入经 `trim()` 后的显示名称；磁盘目录名使用清洗结果，二者可能不同。

## 代价

- 调用方不能指定工作区根的完整路径，也不能强制目录名与显示名完全一致。
- 同名冲突时需要用户改名，而不是自动追加 `(2)`。
- Windows 与 POSIX 的清洗规则统一按 Windows 的最严格集合处理。

## 影响

- 同步更新 SPEC §7.1、§9.0、§15.1 的说明；不新增 IPC 通道，也不改变 `formatVersion`。
- `workspace:open` 仍然接收工作区根目录，不接收父目录。

## 复核条件

- 需要"另存为/指定完整路径"、工作区目录重命名，或跨平台目录名规则出现不可调和的差异时，重新评估。

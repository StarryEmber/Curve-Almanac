# 安全策略 / Security Policy

我们重视 Curve Almanac 用户的数据与系统安全。请**不要**在公开 issue、Discussions 或社交平台披露
未修复的漏洞细节——走私密渠道，给修复留出时间。

## 1. 支持的版本

| 版本 | 安全更新 |
|---|---|
| 0.1.x（最新发布） | ✅ 接收并修复安全报告 |
| 更早版本 / 自行修改的构建 | ❌ 请先升级到最新发布再复现 |

- 平台：**Windows 10/11 x64**；macOS/Linux 不提供构建。
- v1 **没有自动更新**：修复发布后需手动下载新安装包（[Releases](https://github.com/StarryEmber/Curve-Almanac/releases)）。
- 只有默认分支 `main` 上的最新发布计入支持范围；`main` 上的未发布改动仅供参考。

## 2. 如何报告

### 首选：GitHub 私密漏洞报告

仓库 **Security → Report a vulnerability**（GitHub Security Advisories）。报告仅维护者可见，可加密、
可跟踪，也便于一起验证修复。

<https://github.com/StarryEmber/Curve-Almanac/security/advisories/new>

> 如果该入口不可用，请用下面的邮件渠道。

### 备选：邮件

**StarryEmber@163.com**，主题以 `[SECURITY]` 开头。中文或英文均可。

### 请不要

- 开公开 issue，或在 Discussions / 社交平台贴出 PoC；
- 在修复发布前公开漏洞细节或利用代码；
- 附带真实用户数据、含个人信息的工作区，或未脱敏的路径/用户名。

## 3. 报告中请包含

| 项 | 说明 |
|---|---|
| 版本与来源 | 如 0.1.0 安装包 / 便携版 / 源码 commit |
| 系统环境 | Windows 版本与架构 |
| 影响 | 攻击者能做什么：读取任意文件、执行代码、越权访问、数据损坏等 |
| 复现步骤 | 尽量最小、可重复；附最小 PoC 或脚本 |
| 证据 | 相关日志片段（`%APPDATA%\Curve Almanac\logs\main.log`）、截图；先脱敏 |

若问题涉及**数据丢失或工作区损坏**，也请按安全报告处理，并说明数据是否还能恢复、是否已备份。

## 4. 我们的响应

- **收到确认**：尽力在 7 天内回复（个人项目，无 SLA）。
- **初步评估**：尽力在 14 天内给出是否成立、影响面与修复计划。
- **修复**：按严重性与维护者时间安排；修复随补丁版本发布，并在 Release 说明中注明。
- **协同披露**：默认在修复发布后公开；若 90 天内未能修复，会与你商量披露安排。
- **致谢**：如你愿意，会在发布说明或本文件中致谢（可匿名）。

本项目没有漏洞赏金计划，也不会为报告付费。

## 5. 范围

### 在范围内

- **进程隔离与沙箱**：绕过 `contextIsolation` / `sandbox` / `webSecurity` / CSP；preload 暴露 Node
  能力或 `invoke` 泛入口；渲染进程读写任意路径。
- **IPC**：缺少 Zod 校验、绕过工作区白名单或 `realpath` 前缀校验、越权通道、注入到 main 的调用。
- **工作区与导入解析**：恶意 manifest / JSONL / CSV / JSON 造成代码执行、路径逃逸，或覆盖工作区
  之外的文件。
- **数据完整性**：自动保存、恢复、迁移导致数据丢失或静默损坏（按安全级处理）。
- **插件宿主**：插件绕过隔离访问内部 API、文件系统或其它插件的贡献。
- **打包与供应链**：安装包或 asar 内容异常、依赖漏洞在本应用中可被利用。

### 不在范围内

- 未签名安装包触发的 SmartScreen “未知发布者”提示（已知限制，ADR-055）。
- “应用不联网 / 无自动更新 / 无遥测”本身（设计如此）。
- 已取得本机同一用户权限后的本地攻击：工作区是**明文目录**（JSONL + manifest），未加密。
- 超出文档上限的超大工作区导致的卡顿、内存升高或崩溃（请按普通 bug 报告，上限见
  [SPEC §2.2](docs/SPEC.md)）。
- 第三方组件（Electron / Chromium / Node.js / ECharts 等）未修复的上游问题——请报给上游；如果本
  应用放大了影响，请在报告里说明具体路径。
- 缺少可利用影响的“加固建议”、社会工程、物理访问、以及需要用户主动执行恶意文件的场景。

## 6. 安全设计概览

便于评估报告是否落在设计边界内（细节见 [SPEC §15](docs/SPEC.md) 与 [AGENTS.md §2](AGENTS.md)）：

- Electron 三进程：`contextIsolation: true`、`sandbox: true`、`webSecurity: true`、
  `nodeIntegration: false`；`will-navigate` 与 `setWindowOpenHandler` 默认拒绝；CSP 构建期注入。
- preload 只暴露白名单方法，没有 `invoke` 泛入口；渲染进程无法访问 Node 内置模块或 `fs`。
- 文件与系统能力全部经类型化 IPC；main 与 renderer 两端都用 Zod 校验；main 维护“已打开工作区”
  白名单，路径先 `realpath` 再校验前缀。
- 工作区格式 `formatVersion: 1`：JSONL + manifest，原子写 + 备份 + `.lock`；打开更高版本直接拒绝
  （`E_WS_VERSION_UNSUPPORTED`），不做“尽力解析”。
- 插件是**编译期静态模块**，不下载运行时代码；宿主做错误隔离与会话级禁用。
- 应用**不发起网络请求**，无遥测、无自动更新。

## 7. 给用户的安全建议

- 只从官方 [Releases](https://github.com/StarryEmber/Curve-Almanac/releases) 下载，并按发布说明核对
  SHA-256；不要为来源不明的 exe 关闭杀毒或 SmartScreen。
- 定期备份工作区；卸载**不会**删除 `%APPDATA%\Curve Almanac`（设置/最近/日志）与工作区目录。
- 如需处理敏感数据，请自行评估：工作区与日志都是本机明文文件。
- 插件目前随安装包静态打包；使用第三方修改版安装包不在支持范围内。

---

## English summary

- **Supported**: latest 0.1.x release on `main`, Windows 10/11 x64. No auto-update — upgrade manually.
- **Report privately**: GitHub *Security → Report a vulnerability*
  (<https://github.com/StarryEmber/Curve-Almanac/security/advisories/new>), or email
  **StarryEmber@163.com** with `[SECURITY]` in the subject. Do not open a public issue or publish a
  PoC before a fix ships.
- **Please include**: version and distribution, Windows version, impact, minimal reproduction, and
  redacted log excerpts. Never attach real user data or unredacted paths.
- **Response**: acknowledgement is best effort within 7 days, initial assessment within 14 days;
  fixes ship in patch releases. Coordinated disclosure defaults to post-fix publication.
- **In scope**: sandbox/isolation or CSP bypasses, preload/IPC weaknesses, path or workspace-whitelist
  bypasses, malicious workspace/import parsing, data-loss bugs in save/recovery/migration, plugin
  isolation failures, and exploitable packaging/supply-chain issues.
- **Out of scope**: SmartScreen warnings for the unsigned installer, the offline/no-telemetry design,
  local attacks with existing user privileges (workspaces are unencrypted), and upstream Electron /
  Chromium / ECharts issues without an app-specific impact.
- **Design**: `contextIsolation` + `sandbox` + `webSecurity` on, `nodeIntegration` off, whitelisted
  preload, typed IPC validated with Zod on both sides, `realpath` workspace whitelist, CSP, static
  compile-time plugins, and no network access. See [SPEC §15](docs/SPEC.md) and
  [AGENTS.md §2](AGENTS.md).

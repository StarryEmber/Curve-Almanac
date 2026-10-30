# Curve Almanac 维护提示词模板

> 给后续会话/自动化代理直接复制。占位符用 `<...>` 替换；**先读文档、先复述、再动手**。
> 配套：[HANDOFF-MAINTENANCE.md](HANDOFF-MAINTENANCE.md) · [DSH.md](DSH.md) · [AGENTS.md](../AGENTS.md)

## 0. 通用维护会话（最常用）

```text
工作目录：D:\DSH_Work_Space\curve-studio（仓库根）。

身份：你是 Curve Almanac 的维护代理。v1（0.1.0）已发布冻结，M0–M6 已关闭。

先读（按顺序）：
1) AGENTS.md 的 §2/§8/§10/§12；
2) docs/HANDOFF-MAINTENANCE.md §0–§8；
3) docs/DSH.md 的环境/命令/排障；
4) 与本次任务相关的 docs/SPEC.md 章节、docs/adr/ 与本文件模板。

本次任务：<一句话目标，例如“修复导入向导在 GB18030 下的崩溃”>。
范围：<只改哪些文件/模块；明确不改什么>。
验收：<命令 + 期望，例如 pnpm verify + pnpm e2e --grep import + 新增回归测试>。

规则：
- 先复述目标/涉及文件/验收（≤5 行），有歧义先问；
- 一次只做一个任务；最小改动；不顺手重构；
- 不静默改 formatVersion/IPC/公共 API/依赖；需要时先写 ADR（下一个 058+）；
- 不关闭安全选项、不跳过验收项、不放宽门禁；
- 完成后跑验收命令并记录实际输出；更新 TASKS/CHANGELOG/相关文档；一个任务一个提交；
- 涉及发布/许可/签名/GitHub 的决定，停下来问用户。

停点：<例如“提交后停下，等用户确认再发布”>。
```

## 1. Bug 修复

```text
修复问题：<现象、复现步骤、期望行为、实际行为、影响版本/环境>。

先做：
1) 找到最小复现；能写成失败测试/E2E 的先写；
2) 判断影响面：数据格式？保存/恢复？IPC？插件？只影响 UI？
3) 在 docs/reports/ 里查是否已有同类问题/ADR。

实现：
- 只修根因，不做无关重构；
- 若涉及数据兼容/安全/公共 API，先停下来问，不要自行改契约；
- 加回归测试（单元或 E2E），测试名写清场景。

验证：pnpm verify；<相关 e2e spec>；必要时 pnpm e2e/bench/package:smoke。
收尾：TASKS（若走任务流程）/CHANGELOG/报告；提交信息 fix(...)。完成后停下汇报。
```

## 2. 依赖升级（Electron / electron-log / ECharts / 工具链）

```text
升级依赖：<包名> <当前版本> → <目标版本>。

先查：
- docs/HANDOFF-MAINTENANCE.md §9 的升级检查清单；
- 该依赖的 ADR（ADR-001/042/055/056 等）与 lockfile；
- 是否有 breaking change、Node/Electron 兼容要求、许可证变化。

规则：
- 运行时依赖升级先写 ADR（058+），说明体积/维护/替代方案；
- 一次只升一个主依赖；不改无关包；
- 锁版本（精确或 ^ 按仓库惯例），更新 pnpm-lock.yaml；
- 升级后必须跑：pnpm verify、相关 E2E、pnpm bench、pnpm package && pnpm package:smoke；
- 记录体积、asar 内容（electron-log 必须仍在）、启动/保存/恢复冒烟结果。

验收：<全绿 + 新版本号 + 报告>。若失败，先回滚该依赖，不要放宽测试或门禁。
```

## 3. 发布新版本

```text
发布 Curve Almanac <x.y.z>（当前 0.1.0）。

前置：
- 工作树干净；pnpm verify / pnpm e2e / pnpm bench 绿（内存门禁 1GB，ADR-057）；
- 版本同时改根与 apps/desktop/package.json（packaging.test.ts 断言相等）；
- 更新 CHANGELOG、README、MANUAL 首行、HANDOFF 状态卡、TESTPLAN 基线。

步骤：
1) pnpm package；核对 release/ 产物、asar（electron-log/write-file-atomic/signal-exit，无 map/开发文件）；
2) pnpm package:smoke；保存新 metrics（先备份/恢复 docs/reports/t6.4/t6.4-package-metrics.json）；
3) 干净 Windows 用户/VM 复验安装→启动→建工作区→卸载→数据保留（用户曾豁免；正式发布建议补）；
4) 生成 SHA-256（Get-FileHash），写 SHA256SUMS.txt；
5) 发布说明：版本/系统/安装/便携/未签名提示/数据路径/已知限制/校验和；
6) git tag -a v<x.y.z>；按用户决定的渠道发布（GitHub 见模板 4）；
7) 保留上一版安装包与 backups/，记录回滚方式。

停点：打包/冒烟/复验完成后停下，等用户确认后再 tag/发布。
```

## 4. GitHub 发布（先确认公开范围）

```text
把 Curve Almanac <x.y.z> 发布到 GitHub。

先确认（不要自行决定）：
- 仓库是公开还是私有？私有仓库的 Release 附件不对公众开放；
- 源码公开还是只公开二进制？若公开源码，LICENSE 从 UNLICENSED 改成什么（专有/ MIT/ Apache）？
- 仓库名（建议 curve-almanac）；是否新建 release-only 仓库；
- 是否有签名证书；没有则发布说明写明未签名/SmartScreen。

执行（用户确认后）：
1) 确认 git status 干净、tag 未存在、版本一致；
2) 生成 release/SHA256SUMS.txt（两个 exe）；
3) 写发布说明（docs/releases/<x.y.z>.md），含未签名提示、安装/数据路径、已知限制；
4) git remote add origin <repo>；git push -u origin main；git push origin v<x.y.z>；
5) gh release create v<x.y.z> "release/Curve Almanac Setup <x.y.z>.exe" "release/Curve Almanac <x.y.z>.exe" "release/SHA256SUMS.txt" --title ... --notes-file ...；
6) 不要上传 builder-debug.yml/blockmap，不要提交 release/；不要上传证书/密码。

停点：push/tag 前停下让用户确认仓库 URL 与公开范围。
```

## 5. 更新用户手册 / 文档

```text
更新 <MANUAL/DSH/README/ROADMAP>：<新增/修正的功能或章节>。

约束：
- 先对照真实 UI/代码确认行为，不写未实现功能；
- 用户可见文案与代码/SPEC 一致；快捷键与 F1 表一致；
- 截图用临时工作区与示例数据，避免真实路径/客户数据；不覆盖 docs/reports/ 历史证据；
- 修改后 pnpm format:check，检查相对链接/图片路径/目录锚点；
- 不跑全量测试（纯文档），但要在报告里说明“仅文档”。

验收：<章节链接、截图清单、术语一致性>。完成后提交 docs(manual): ... 并停下。
```

## 6. 新功能 / v2（必须 ADR）

```text
实现 v2 功能：<功能描述>。

前置：
- 读 docs/ROADMAP.md 的相关条目与 SPEC 对应章节；
- 先判断是否触及数据格式/公共 API/安全/运行时依赖：触及就必须先写 ADR（058+）并更新 SPEC；
- 写清范围、非目标、验收、回滚；用户确认后再实现。

实现：
- 测试先行；UI 要键盘 + 200% 缩放冒烟；纯逻辑覆盖率 ≥85%；
- 保持命令总线/依赖边界/安全基线；
- 不顺手改旧功能；不升级 formatVersion 除非 ADR 明确。

验证：pnpm verify + 新增/相关 E2E + bench（若性能相关）+ package:smoke（若依赖/打包变化）。
停点：里程碑/发布前停下等用户确认。
```

## 7. 安全事件 / 漏洞修复

```text
处理安全问题：<描述/影响/复现/来源>。

优先级：先止血（禁用入口/回滚版本/限制分发），再根因修复；不要先公开细节。
检查：IPC 入参校验、路径白名单/realpath、CSP/导航、preload 暴露面、依赖漏洞、日志泄露。
修复：最小补丁 + 回归测试；必要时发补丁版本；更新 SECURITY/发布说明（按用户决定）。
禁止：为“让功能跑起来”关闭 sandbox/CSP/校验。
停点：任何对外披露/发布前停下等用户确认。
```

## 8. 只读审查（不改代码）

```text
只读审查 Curve Almanac：<范围，例如“数据保存/恢复路径”“插件错误隔离”“发布配置”>。

先读 AGENTS/SPEC/相关 ADR/报告；输出：
1) 结论（是否满足契约/风险等级）；
2) 证据（文件:行、测试名、实测命令）；
3) 风险/缺口（按严重度）；
4) 建议的最小修复（不实施）。
不要改文件、不要跑会写盘的 E2E/打包；只跑只读命令。完成后停下。
```

## 9. 发布说明模板（可直接填）

```markdown
# Curve Almanac <x.y.z>

Windows 10/11 x64 · <日期>

## 安装
- 安装版：Curve Almanac Setup <x.y.z>.exe（每用户安装，无需管理员）
- 便携版：Curve Almanac <x.y.z>.exe
- **未签名**：首次运行可能出现 SmartScreen“未知发布者”，选择“更多信息 → 仍要运行”。

## 数据位置
- 设置/日志：%APPDATA%\Curve Almanac
- 默认工作区：Documents\Curve Almanac
- 卸载不删除用户数据。

## 本次变化
- <修复/新增/升级，链接 CHANGELOG>

## 已知限制
- <从 ROADMAP/报告摘要；不要隐藏>

## 校验和（SHA-256）
- Setup: <hash>
- Portable: <hash>
```

## 10. 使用提示

- 模板里的“停点”必须保留：发布、tag、许可证、签名、公开范围都要人类确认。
- 任务较大时先让代理输出 5 行复述与计划，再批准执行。
- 涉及多步/多文件时，要求代理每个阶段汇报“改了什么/验证输出/剩余风险”，不要只看最终一句话。
- 任何“测试通过”的结论都要带命令与关键数字（files/tests/passed/exit code）。

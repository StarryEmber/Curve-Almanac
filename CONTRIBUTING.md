# 贡献指南 / Contributing

感谢你愿意帮助 Curve Almanac。本项目是**个人维护**的开源桌面应用（MIT），v1 的功能范围已按
ADR-060 冻结，当前以维护为主：修 bug、补文档、改进可访问性与发布质量。

> 中文为正文，文末有 English summary。参与前请先读[行为准则](CODE_OF_CONDUCT.md)；
> **安全漏洞不要走公开 issue**，见[安全策略](SECURITY.md)。

## 1. 先确认方向

| 你想做 | 怎么做 |
|---|---|
| 报一个可复现的 bug | 用 [Bug 报告模板](https://github.com/StarryEmber/Curve-Almanac/issues/new/choose)，先搜已有 issue |
| 提功能想法 | 用功能请求模板，先说清场景；v1 不做新功能，需要维护者评估 |
| 改文档、修小 bug | 直接开 PR（先看 §3–§6） |
| 大改动（架构、依赖、数据格式、IPC） | **先开 issue 或 Discussions 讨论**，达成一致后再写代码，否则可能白做 |
| 报告安全漏洞 | 走私密渠道（[SECURITY.md](SECURITY.md)），不要在公开 issue 披露细节 |
| 使用/安装问题 | 先查[用户手册](docs/MANUAL.md)与[已知限制](docs/ROADMAP.md)，再到 [Discussions](https://github.com/StarryEmber/Curve-Almanac/discussions) 提问 |

`docs/ROADMAP.md` 列出 v1 的已知限制与非目标；`docs/V2-PLAN.md` 只是**未批准的提案**
（ADR-060 仍冻结范围）。请不要把提案当成待办，也不要在未确认前按提案实现。

## 2. 环境

| 项 | 要求 |
|---|---|
| 系统 | **Windows 10/11 x64**（E2E 与打包的目标平台；Linux 可跑 lint/typecheck/单测） |
| Node.js | ≥ 20.11 |
| pnpm | 11.28.5（由根 `package.json` 的 `packageManager` 锁定） |
| 网络/磁盘 | 首次安装需下载 Electron 44.9.0；GitHub 慢时可设 `ELECTRON_MIRROR` 镜像 |

```bash
pnpm install     # postinstall 会补齐匹配版本的 Electron
pnpm dev         # 开发模式（HMR）
```

## 3. 动手前先读

- [AGENTS.md](AGENTS.md)：仓库强制守则（安全、依赖边界、数据格式、DoD）。
- [docs/SPEC.md](docs/SPEC.md)：契约。改模型、文件格式、IPC 或公开 API 必须先写 ADR，再改 SPEC。
- [docs/DEVELOPER.md](docs/DEVELOPER.md)：目录结构、关键机制、测试与打包。
- [docs/TESTPLAN.md](docs/TESTPLAN.md)：测试层与门禁。
- [.github/pull_request_template.md](.github/pull_request_template.md)：PR 必填内容。

## 4. 分支、提交与 PR

1. Fork 仓库，从 `main` 建分支：`fix/<短描述>`、`docs/<短描述>`、`test/<短描述>`。
2. **一个 PR 只做一件事**；不要顺手重排或格式化无关文件（尤其整文件重写中文文档）。
3. 提交信息用 Conventional Commits，scope 取包名或主题：
   `fix(tbl): ...`、`fix(chart): ...`、`test(domain): ...`、`docs(manual): ...`、`chore(tooling): ...`。
   正文写“验证：”和实际命令结果。
4. PR 描述按模板填写：改动摘要、验证命令结果、证据、风险与回滚。模板里的任务 ID 可写
   `community: <一句话>` 或 `N/A`。
5. 推送前在本地跑通 §5 的验证；CI 会在 Windows 与 Ubuntu 上跑 lint/typecheck/单测，
   并在 Windows runner 上跑 benchmark 与 E2E，必须全绿。

维护者按“能否复现、是否在范围内、测试是否覆盖”评审。个人项目，回复时间尽力而为，请勿重复催促。

## 5. 必须通过的验证

| 命令 | 说明 |
|---|---|
| `pnpm verify` | `lint + typecheck + 单测`；零 error、零 warning |
| `pnpm format:check` | Prettier 零 diff（本地可先 `pnpm format`） |
| `pnpm test:coverage` | 全局 lines/statements/functions ≥ 70%、branches ≥ 60%；纯逻辑包 ≥ 85% |
| `pnpm e2e` | 涉及 UI 或流程时必跑；Windows、1 worker、独占 CPU，约 7–10 分钟 |
| `pnpm bench` | 涉及热路径（网格、图表、导入、保存）时跑 10 万行基准，确认未超预算 |

- 新功能必须带测试；修 bug 先写能复现的失败测试。
- 测试不得依赖真实用户目录、网络或系统时间；用固定时钟与临时目录。
- 测试文件与被测文件同目录，命名 `*.test.ts(x)`；E2E 放在 `apps/desktop/e2e/`。
- **不要**用 `--no-verify`、跳过用例或放宽 ESLint / 覆盖率阈值来让 CI 变绿。

## 6. 代码与界面约定（摘录）

完整规则见 [AGENTS.md §5](AGENTS.md)；最容易返工的是：

- TypeScript strict，禁止 `any`；外部输入用 `unknown` + Zod 收窄。
- 业务逻辑不放组件：组件只做渲染与事件转发；用例进 `app-core`，纯逻辑进领域包。
- 依赖方向是硬约束（`pnpm lint:boundaries`）：
  `domain ← table-engine ← chart-model ← chart-echarts`、
  `domain ← persistence ← app-core ← desktop`、`ui ← desktop`；插件只 import `@curve/plugin-sdk` 与
  `@curve/domain` 的公开类型。
- 渲染进程禁止 Node/`fs`；一切文件与系统能力走 `window.api` 的类型化 IPC。
- 用户可见文案一律走 `t(key)` 消息表，zh-CN 与 en-US 必须同时补齐，不在组件里硬编码中文或英文。
- 日期内部用 epoch ms；模型里不存本地化字符串。

## 7. 不要做的事

- 不要关闭 `contextIsolation` / `sandbox` / `webSecurity` 或放宽 CSP 来“让代码跑起来”。
- 不要未经 ADR 改 `formatVersion`、JSONL/manifest 结构，或删除迁移。
- 不要绕过命令总线直接改 store（撤销会坏）。
- 不要新增运行时依赖而不写 ADR（体积/维护/替代方案）。
- 不要把 `release/`、`node_modules`、构建产物、真实用户数据或大二进制文件提交进仓库。

## 8. 文档、中英文与 AI 辅助

- 文档改完跑 `pnpm format:check`，并检查相对链接与图片路径。
- 用户可见的行为变化要同步 `docs/MANUAL.md` 与 `CHANGELOG.md`；契约变化另加 ADR 并改 SPEC。
- AI 辅助的贡献欢迎，但你需要：读懂改动、实际跑过验证命令、在 PR 中说明使用情况，并对最终内容
  负责。不要提交未经验证的大段生成内容。
- 提交信息、issue 与 PR 可用中文或英文。

## 9. 许可

本仓库使用 [MIT](LICENSE)。按 inbound = outbound，你的贡献同样以 MIT 发布，**无需签署 CLA**。
提交即表示你有权提交该内容，并同意以上许可条款。

---

## English summary

Curve Almanac is a personally maintained, MIT-licensed Windows desktop app. **The v1 scope is frozen
(ADR-060)**: fixes, documentation, accessibility and release-quality work are welcome; new features
need agreement with the maintainer first. `docs/V2-PLAN.md` is an unapproved proposal, not a TODO
list.

- **Security issues** — report privately per [SECURITY.md](SECURITY.md); never open a public issue.
- **Conduct** — [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md).
- **Setup** — Windows 10/11 x64, Node ≥ 20.11, pnpm 11.28.5; run `pnpm install` then `pnpm dev`.
- **Read first** — [AGENTS.md](AGENTS.md) (mandatory rules), [docs/SPEC.md](docs/SPEC.md) (contract),
  [docs/DEVELOPER.md](docs/DEVELOPER.md).
- **One PR, one purpose** — Conventional Commits (`fix(tbl): ...`); fill the PR template with real
  command output (`community: ...` or `N/A` for the task field).
- **Gates** — `pnpm verify`, `pnpm format:check`, `pnpm test:coverage`; run `pnpm e2e` for UI changes
  and `pnpm bench` for hot paths. New behaviour needs tests; bug fixes start with a failing test.
- **Never** disable `contextIsolation`/`sandbox`/`webSecurity`/CSP, change `formatVersion` without an
  ADR, bypass the command bus, or add runtime dependencies without an ADR.
- **AI-assisted contributions** are welcome if you understand them, actually ran the checks, and take
  responsibility for the result.
- **License** — MIT, inbound = outbound, no CLA. Chinese or English are both fine.

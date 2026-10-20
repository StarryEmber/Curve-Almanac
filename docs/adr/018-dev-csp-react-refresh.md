# ADR-018 开发模式 CSP 为 React Fast Refresh 放宽 `script-src`

- 状态：已接受
- 日期：2026-10-20
- 相关：SPEC §15.3；TASKS T0.2；ADR-001；AGENTS §2.1、§2.4

## 背景

SPEC §15.3 规定生产 CSP，并写明“开发模式仅额外允许 `ws://localhost:*` 与 `http://localhost:*`”。
T0.2 引入 `@vitejs/plugin-react` 提供 React Fast Refresh；该插件在开发模式下会向
`index.html` 注入一段**内联 module script**（RefreshRuntime 前置脚本）。严格策略
`script-src 'self'` 会阻断这段脚本，Fast Refresh 无法初始化，开发体验退化为每次改动整页刷新。

同时，`file://` 下的生产 renderer 不能依赖 `webRequest.onHeadersReceived`（不保证触发），
因此 CSP 需要在构建期写进 HTML；若 dev 与 prod 共用一份 `<meta>`，开发态会被生产策略卡死。

## 决定

1. CSP 由 `apps/desktop/electron.vite.config.ts` 中的 `curve:csp-meta` 插件在 `transformIndexHtml`
   阶段注入为 `<meta http-equiv="Content-Security-Policy">`，是**唯一注入点**：
   - `serve`（`electron-vite dev`）→ 开发策略；
   - `build`（预览/打包）→ 生产策略。
2. 生产策略与 SPEC §15.3 **逐字一致**，不含 `'unsafe-inline'`（`script-src`）、`'unsafe-eval'`、
   `ws://`、`http://` 或 `localhost`。
3. 开发策略仅多出两类指令值：
   - `script-src 'self' 'unsafe-inline'`（Fast Refresh 前置脚本）；
   - `connect-src 'self' ws://localhost:* http://localhost:*`（HMR socket 与 dev server）。
   `default-src`、`img-src`、`font-src`、`style-src` 与生产完全一致。
4. 可验证性：
   - 单元测试断言生产策略字符串等于 SPEC §15.3，且不含任何放宽项；
   - E2E（TESTPLAN E1）读取页面 `<meta>` 的 `content`，逐字比对生产策略，并断言动态插入的内联
     `<script>` 不会执行；
   - 开发模式通过 CDP 读取 dev 页面策略，确认只放宽上述两类、且控制台无 CSP 报错。

## 代价

- 开发态窗口若被植入恶意内联脚本，CSP 不能拦截；但 dev 模式只在开发者本机运行，且不进入构建产物。
- 两套策略需要同时维护；`csp.ts` 的单测与 E2E 共同防止生产策略被误放宽。
- 未来若引入需要 `blob:`/`data:` 脚本的能力（例如 Worker），需重新评估本 ADR。

## 影响

- 生产构建的 `out/renderer/index.html` 中只存在生产策略；E2E 会读取构建产物验证。
- SPEC §15.3 增加一句说明，明确开发模式的两类额外项；生产条款不变。
- 不新增运行时依赖，不改变 `contextIsolation`/`sandbox`/`webSecurity`/`nodeIntegration` 任何取值。

## 复核条件

出现以下任一情况时重新评审：改用非内联的 Fast Refresh 方案（例如外置 preamble 资源并由
`script-src 'self'` 覆盖）；或 Electron 提供可靠的 `file://` 响应头注入方式，使 dev/prod 可共用
响应头策略。

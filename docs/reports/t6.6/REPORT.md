# T6.6 报告 — 日志文件落盘与渲染进程错误转发

- 任务：T6.6（依赖 T6.5、T0.3；覆盖 NFR-06 / SPEC §16.5）
- 日期：2026-10-30
- 决策：ADR-056 选项 B（`electron-log`，已接受）；ADR-057（内存门禁 600MB → 1GB，已接受）
- 范围：main 文件日志（按天轮转/7 天保留）、renderer 全局 error/rejection 转发与限流、
  asar/冒烟断言与文档；**不改** IPC 通道、preload、数据格式、CSP、Electron 安全选项、
  `settings.json` 与 `files` 白名单

## 1. 交付

| 文件 | 内容 |
|---|---|
| `apps/desktop/src/main/logging/log-files.ts` | 本地日期键、启动按 mtime 归档、跨午夜轮转、同日追加、含今天 7 天保留、坏文件/非日志文件不动 |
| `apps/desktop/src/main/logging/main-log.ts` | `electron-log@5.4.4` 文件 transport + console sink 组合 logger；路径/格式/级别/`maxSize:0` |
| `apps/desktop/src/main/index.ts` | `app.whenReady()` 后、settings/IPC/窗口之前接线 |
| `apps/desktop/src/main/logger.ts` | 抽出 `createConsoleSink`（保留 `[main]` 前缀） |
| `apps/desktop/src/renderer/logging/error-reporting.ts` | `error`/`unhandledrejection` → `log:write`，10 条/60s 令牌桶，桥故障不影响应用 |
| `apps/desktop/src/renderer/main.tsx` | 复用单个 `api` client，首帧前安装全局转发 |
| `apps/desktop/src/shared/logging-day.ts` | 本地日期键（main 与 E2E 共用，避免跨 tsconfig 引用） |
| `apps/desktop/src/main/logging/log-files.test.ts` | 7 条轮转/保留/追加测试 |
| `apps/desktop/src/renderer/logging/error-reporting.test.ts` | 7 条转发/限流/卸载/桥故障测试 |
| `apps/desktop/e2e/logging.spec.ts` | 2 条真实 Electron：main/renderer 落盘、启动归档/保留 |
| `apps/desktop/package.json` / `pnpm-lock.yaml` | 新增运行时依赖 `electron-log@5.4.4`（MIT，约 95 KB） |
| `scripts/package-smoke.ts`、`apps/desktop/test/packaging.test.ts` | asar required 增加 electron-log；开发文件扫描排除 `node_modules/`；打包契约 +1 条 |
| 文档 | SPEC §16.5 实现边界、ADR-056（已接受）、ADR-057、TASKS T6.6、TESTPLAN E13/§7、README/MANUAL/ROADMAP、CHANGELOG、HANDOFF、AGENTS §0 |

## 2. 语义

- **路径/格式**：`userData/logs/main.log`；`[YYYY-MM-DD HH:mm:ss.SSS] [level] text`；级别生产
  `info` / 开发 `debug`；`electron-log` 自带 console transport 关闭，应用 console 仍保留
  `[main]` 前缀，一行只写一次文件。
- **按天滚动**：启动时若 `main.log` 的 mtime 不是今天，归档为 `main-YYYY-MM-DD.log`；进程跨
  本地午夜后的第一次写入执行同样归档；同日已有归档时**追加**；保留含今天 7 天
  （`main-<today-6>`…`main-<today-1>` + `main.log`），更旧归档删除。
- **renderer 转发**：`error` 与 `unhandledrejection`，`Error` 带 stack、非 Error 值
  JSON/字符串化；main 加 `[renderer]` 前缀；**10 条/60 秒**，超限静默丢弃（console 仍有原生
  输出）；桥缺失/抛错不影响应用。
- **日志纪律**：沿用 main logger 的 2,000/1,000 字符截断；不记录单元格内容；文件写入同步，
  每行仅一次日期字符串比较，跨天才 rename/prune。

## 3. 测试

```text
apps/desktop/src/main/logging/log-files.test.ts        7 条：本地日期/7 天 cutoff、同日保留、
                                                        mtime 归档、跨午夜轮转、同日追加、自定义保留
apps/desktop/src/renderer/logging/error-reporting.test.ts 7 条：Error/无 Error 事件/rejection、
                                                        10 条限流与窗口恢复、卸载、桥抛错/拒绝
apps/desktop/e2e/logging.spec.ts                        2 条（1.5s / 1.4s）：
  ok 1 真实 Electron：main.log 含 `window ready`；uncaught error 与 rejection 经 [renderer] 落盘
  ok 2 启动归档昨天的 main.log、保留 2 天前、删除 8 天前、新 main.log 继续写
```

在 T6.6 的全量 E2E 中，`logging.spec.ts` 2 条均通过（#47/#48）。

## 4. 验证

```text
pnpm verify
  ESLint 0；depcruise 538 modules / 2331 deps / 0 violations
  198 files / 1831 tests passed（T6.5 为 196/1816；+2 files/+15 tests）

pnpm build
  exit 0；renderer 3,471.75 kB（+2.4 kB）、CSS 81.34 kB、main 338.76 kB

pnpm e2e（2026-10-30 全量一次）
  功能测试 111 passed（含 T6.5 九步 25.6s、logging 2 条、plugin/layout/recovery 等）
  两条内存门禁失败：chart-perf 618–639MB、perf 612–625MB（旧 600MB 门禁）
  A/B：用 console logger 替换文件 logger 仍 618MB → 基线被外部程序抬高，不是日志功能回归

内存门禁调整（ADR-057，用户 2026-10-30 决定）
  整应用 private 内存门禁 600MB → 1024MB；上述 618–639MB 在新门禁内
  按用户指示：改完不重跑全量，直接按新门禁记通过（本报告如实记录“未重跑”）

pnpm package / pnpm package:smoke（2026-10-30 21:33 补跑）
  pnpm package exit 0；NSIS 112,421,391 B、portable 112,183,788 B、win-unpacked 391,201,681 B
  app.asar：82 个条目（smoke 计 58 个文件），含 `node_modules/electron-log/src/index.js`、
  `write-file-atomic`、`signal-exit`；无 `*.map`、无 app 的 src/e2e/test/docs/fixtures
  pnpm package:smoke PASS：install 20,628ms / launch 9,411ms / uninstall 9,183ms；
  工作区与 `%APPDATA%\Curve Almanac` 卸载后保留；CSP/无 Node 全局/无测试钩子均通过
  metrics：`docs/reports/t6.6/t6.6-package-metrics.json`（T6.4 历史 metrics 已保留）
```

## 5. 日志样例（格式）

```text
[2026-10-30 20:47:32.047] [info]  window ready (mode=production, devTools=false, visible=true)
[2026-10-30 20:47:33.120] [error] [renderer] Uncaught error: E2E renderer boom
[2026-10-30 20:47:33.180] [error] [renderer] Unhandled rejection: E2E rejection boom
```

真实文件由 E2E 写入临时 userData 后随 fixture 清理；断言见 `e2e/logging.spec.ts`。

## 6. 残留风险

- **轮转不是 00:00 定时器**：跨天后第一次写入才归档；整夜空闲不会产生空文件，也不会把昨天的
  行写进今天。若需精确午夜轮转，另加定时器并补测试。
- **单日无大小上限**：`maxSize:0` 避免破坏归档命名；异常刷屏时需另加限流/裁剪。
- **renderer 限流会丢日志**：同一分钟超过 10 条只保留前 10 条；控制台仍有原生输出。
- **无日志查看器/导出**：用户需到 `%APPDATA%\Curve Almanac\logs\` 查看。
- **内存门禁放宽到 1GB**（ADR-057）：600–1024MB 的真实增长不再被 E2E 拦截，需要靠 bench 趋势
  与人工复核；这是用户明确的发布取舍。
- **打包已复跑**：electron-log 进 asar（82 条目 / 58 文件）与安装冒烟 PASS 已验证；安装包体积
  比 T6.4 增加约 20 KB。
- 日志仍可能含 renderer bundle URL/stack；单元格内容/工作区路径的既有纪律不变。

## 7. 结论

T6.6 已按 ADR-056 选项 B 交付并闭环 T6.5 的 NFR-06 日志缺口：main 写 `userData/logs/main.log`、
按天归档/7 天保留、renderer 全局错误限流转发；单测 14 条 + E2E 2 条通过。全量 E2E 的功能测试
111 passed；两条内存门禁按用户决定提高到 1GB（ADR-057）后记为通过，未重跑。安装包已于
2026-10-30 重打（含 electron-log）并通过 `package:smoke`。

**M6 已于 2026-10-30 获用户接受并关闭**（汇总 `docs/reports/m6/REPORT.md`）；安装包已重打并
通过安装/卸载冒烟。

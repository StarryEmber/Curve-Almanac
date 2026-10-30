# ADR-056 T6.5 发现的日志落盘偏差：v1 仅 console，文件日志与渲染进程全局转发未实现

- 状态：**提议（待用户裁决）**
- 日期：2026-10-30
- 相关：SPEC §5.1、§16.5、§17 NFR-06；TASKS T6.5/T0.3；TESTPLAN §7；ADR-016、ADR-048、ADR-054、ADR-055

## 背景

T6.5 对照 SPEC §16.5 做发布检查时发现：

1. `apps/desktop/src/main/logger.ts` 自 T0.3 起只提供分级、`minLevel`、消息/详情截断与 console
   sink；文件注释写着“T1.x 将补文件日志”，但后续任务没有落地，HANDOFF 也没有记录该缺口。
2. SPEC §5.1/§16.5 指定的 `electron-log` **不在**任何 `package.json` 依赖中（安装包 asar 只有
   `write-file-atomic` + `signal-exit`）。
3. `userData/logs/main.log` 不存在；没有按天滚动、7 天保留或大小上限。
4. `renderer/main.tsx` 没有注册全局 `error`/`unhandledrejection` → `log:write`；`log:write`
   IPC 与主进程 handler 存在且可用，只是没有调用方。
5. 崩溃恢复不依赖日志：锁、manifest 备份、“上次未正常退出”提示、插件内存日志均正常
   （`recovery.spec.ts`/`m5`/T6.5 九步均已通过）。

因此 NFR-06 的“日志与崩溃”只完成“崩溃恢复”；“日志落盘/轮转/渲染进程转发”未达标。这是
代码与 SPEC 的既有偏差，不是 T6.5 引入的回归。

## 决定

**待用户裁决**，本 ADR 记录三个选项与建议，不擅自实现或改写契约。

### 选项 A：接受为 v1 已知限制（最小改动）

- 在 SPEC §16.5 标注“v1 仅 console；文件日志后置”，README/MANUAL/ROADMAP 的已知限制写明；
- 发布清单第 7 项标为“例外”，由用户书面接受；
- 代价：用户遇到崩溃/保存失败时只能看控制台或 `%APPDATA%` 下的 JSON 文件，支持成本高；
  与 SPEC 原文不一致，需要显式例外。

### 选项 B：引入 `electron-log`（最贴合 SPEC 字面）

- 新增运行时依赖 `electron-log`，在 main 启动早期初始化：
  `resolvePathFn` 指向 `userData/logs/main.log`，配置大小上限/归档并由启动时的清理逻辑保留 7 天；
- 把 `createConsoleLogger` 的 sink 改为“console + file”，`log:write` 自动落盘；
- 在 renderer 注册 `error`/`unhandledrejection` → 带 10 条/分钟限流的 `log:write`；
- 更新 `packaging.test.ts`/`package-smoke.ts` 的 asar 断言（asar 会多出 `electron-log`）；
- 代价：新运行时依赖（需按 AGENTS §4 复审）、electron-log 的“按天”轮转需自定义归档/清理、
  安装包内容与冒烟断言要同步、需重跑 verify/e2e/package:smoke。

### 选项 C：内置 fs 轮转器（无新依赖）

- 在 main 新增 `file-logger.ts`：写 `userData/logs/main-YYYY-MM-DD.log`（或 `main.log` + 日期
  归档），启动/跨天轮转，删除 7 天前文件；注入时钟/目录便于单测；
- 同样补 renderer 全局转发与限流；
- 代价：偏离 SPEC §5.1 指定的 `electron-log`，需改 SPEC 并写 ADR；自研轮转的边界（并发写、
  磁盘满、时钟回拨）要测。

## 建议

- 若 v1 只做内部/预览发布：选 **A**，但至少补 renderer 全局错误转发（小改动、无依赖），
  避免渲染进程崩溃完全无痕。
- 若 v1 要对外发布或需要支持诊断：选 **B**（与 SPEC 一致，维护成本最低），并在实现任务中
  同步打包冒烟。
- 不建议在 T6.5 内直接改：T6.5 的职责是验收与文档收尾，运行时代码/依赖变更应单独任务 +
  完整回归。

## 代价

- 选 A：发布说明必须把“无文件日志”列为已知限制；用户反馈问题时缺少可归档日志。
- 选 B/C：需要新增任务、测试与一次完整回归（verify/e2e/package/package:smoke），推迟 M6 关闭。
- 任何选项都不影响工作区数据、IPC 契约、CSP 或已有日志脱敏规则（不记录单元格内容/绝对路径）。

## 影响

- 本 ADR 只新增文档与索引；代码、SPEC、依赖均未改。
- 用户裁决后：更新本 ADR 状态为“已接受”或“已取代”，并同步 SPEC §16.5、TASKS、TESTPLAN §7、
  README/MANUAL/ROADMAP 与发布说明。

## 复核条件

- 若选 A：下次公开发布前必须重新评估；若收到“需要日志排查”的反馈，立即转 B/C。
- 若选 B：确认 `electron-log` 的许可证、体积与 Electron 44 兼容性；归档保留 7 天的实现要有测试。
- 若选 C：改 SPEC §5.1 的库名并说明理由；补“并发写/磁盘满/时钟回拨/跨天轮转”测试。
- 无论哪个选项：renderer 全局错误必须有限流（10 条/分钟），且不得把单元格内容或绝对路径写入日志。

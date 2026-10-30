# ADR-056 T6.5 发现的日志落盘偏差：v1 仅 console，文件日志与渲染进程全局转发未实现

- 状态：**已接受**（2026-10-30，用户选择选项 B）
- 日期：2026-10-30
- 相关：SPEC §5.1、§16.5、§17 NFR-06；TASKS T6.6、T6.5/T0.3；TESTPLAN §7；ADR-016、ADR-048、ADR-054、ADR-055

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

用户在 T6.5 验收时选择 **选项 B：引入 `electron-log`**，作为独立任务 **T6.6** 实现（不塞进
T6.5）。备选的 A（接受例外）与 C（内置 fs 轮转器）不采用。

### 1. 依赖与写入位置

- `apps/desktop` 新增运行时依赖 `electron-log@5.4.4`（MIT，约 95 KB）；只允许 main import，
  renderer 仍走类型化 IPC，不直接引用 electron-log。
- `apps/desktop/src/main/logging/main-log.ts` 创建组合 logger：
  - console sink 保留原有 `[main]` 前缀（开发/生产级别不变）；electron-log 自带 console
    transport 关闭，一行只落一次文件；
  - 文件 transport 路径 `userData/logs/main.log`，格式
    `[YYYY-MM-DD HH:mm:ss.SSS] [level] text`，级别生产 `info` / 开发 `debug`；
  - 文件写入为 electron-log 的同步写（`sync: true` 默认），崩溃时已写行不丢；`maxSize: 0`
    关闭按大小裁剪（由按天轮转约束文件）。
- `apps/desktop/src/main/index.ts` 在 `app.whenReady()` 后、settings/IPC/窗口之前用
  `app.getPath('userData')` 创建文件 logger；`app.setName` 与 `CURVE_E2E_USER_DATA` 重定向已在
  模块加载时完成，因此 E2E 与生产路径一致。

### 2. 按天滚动与 7 天保留

- `apps/desktop/src/main/logging/log-files.ts` 负责日期边界（不依赖 Electron，可单测）：
  - 启动时若 `main.log` 的 **mtime 不是今天**，重命名为 `main-YYYY-MM-DD.log`（用 mtime 日期，
    多天未启动也记录真实日期）；同日归档已存在时**追加**，不覆盖；
  - 进程跨本地午夜后，第一次写入执行同样的归档；
  - 保留**含今天在内 7 天**：`main-<today-6>.log` … `main-<today-1>.log` + `main.log`；更旧的
    `main-YYYY-MM-DD.log` 在启动/跨天时删除；不匹配该命名的文件不动；
  - 每行只做一次日期字符串比较；跨天时才 rename/prune，避免同步 IO 拖慢日志。
- 若进程连续运行多天，`main.log` 按“写入日”归档；跨午夜后的第一行先归档再写新文件。

### 3. 渲染进程全局错误转发

- 新增 `apps/desktop/src/renderer/logging/error-reporting.ts`，在 `main.tsx` 首帧前注册：
  - `window.error` → message + stack（无 `Error` 对象时用 `event.message` + `filename:line:col`）；
  - `unhandledrejection` → `Error`/字符串/JSON 可序列化值；
  - 经现有 `log:write` IPC 发送，main 加 `[renderer]` 前缀并写同一文件；
  - **令牌桶 10 条/60 秒**，超出静默丢弃（控制台仍有原生错误输出）；桥缺失/抛错不影响应用；
  - 返回卸载函数，便于测试。
- 不新增 IPC 通道、不改 preload 白名单；`LogWriteRequest` 契约沿用。

### 4. 打包与测试

- `files` 白名单不变；electron-builder 的 pnpm 依赖收集会把 `electron-log` 收进 asar。
  `scripts/package-smoke.ts` 的 required 增加 `node_modules/electron-log/src/index.js`，并把
  “开发文件”扫描限定在**非 node_modules** 路径（electron-log 只发布 `src/` 源码，不能因此
  误判为开发文件）；`apps/desktop/test/packaging.test.ts` 增加对应静态断言。
- 测试：
  - `log-files.test.ts`：同日保留、按 mtime 归档、跨午夜轮转、同日追加、7 天/自定义保留、
    非日志文件不删；
  - `error-reporting.test.ts`：Error/非 Error、未处理 rejection、10/60s 限流与恢复、卸载、
    桥抛错/拒绝不冒泡；
  - `e2e/logging.spec.ts`：真实 Electron 断言 `main.log` 含 `window ready`、renderer 的
    uncaught error 与 unhandled rejection 经 `[renderer]` 落盘；启动时归档昨天的 `main.log`、
    保留 2 天前、删除 8 天前。
- 仍不做：日志查看器、按大小裁剪、日志脱敏策略变更、remote/console 文件以外的 transport。

## 代价

- 多一个运行时依赖（electron-log，MIT，约 95 KB）与 asar 内容；安装包体积增幅可忽略。
- 文件写入同步：每行有少量磁盘 IO；日志量受 10 条/分钟（renderer）+ 现有代码路径限制，未触及
  性能预算（E2E/bench 复核）。
- **轮转发生在“跨天后的第一次写入”**，不是 00:00:00 定时器；若应用整夜空闲，00:00–首次写之间
  没有日志，因此不会产生空文件，也不会把昨天的行写进今天。
- 保留 7 天按“天”计数（含今天），不是 7×24 小时窗口；磁盘上最多 7 个日志文件。
- `maxSize: 0` 意味着单日日志没有硬大小上限；若将来出现异常刷屏，需要另加限流/大小策略。
- 日志仍可能包含 renderer 的 bundle URL/stack；不含单元格内容/工作区路径的策略不变。
- 包冒烟对 asar 的“开发文件”正则改为排除 `node_modules/`；这是为合法生产依赖（只发布 src）
  所做的必要放宽，应用自身 `src/e2e/test/docs/fixtures` 仍被拒绝。

## 影响

- 新增：`apps/desktop/src/main/logging/{log-files,main-log}.ts`、`log-files.test.ts`、
  `apps/desktop/src/renderer/logging/{error-reporting.ts,error-reporting.test.ts}`、
  `apps/desktop/e2e/logging.spec.ts`、`docs/reports/t6.6/REPORT.md`、本 ADR 的接受记录。
- 修改：`apps/desktop/src/main/index.ts`（组合 logger 接线）、`logger.ts`（抽出 console sink）、
  `renderer/main.tsx`（注册全局错误转发 + 复用 api client）、`apps/desktop/package.json`、
  `pnpm-lock.yaml`、`scripts/package-smoke.ts`、`apps/desktop/test/packaging.test.ts`、
  SPEC §16.5、TASKS T6.6、TESTPLAN E13/§7、README/MANUAL/ROADMAP、CHANGELOG、HANDOFF、AGENTS §0。
- 不改：`formatVersion`、JSONL/manifest、IPC 通道、preload、CSP/Electron 安全选项、
  `settings.json` 形状、`files` 白名单。

## 复核条件

- 若单日日志出现异常增长：加大小上限/限流或 `maxSize` 裁剪，并同步归档命名与保留策略。
- 若需要 00:00 精确轮转：增加跨天定时器，在无写入时也创建/关闭文件；必须补测试。
- 若需要日志查看器/导出：新增 renderer 页面与 IPC，不要直接读 userData。
- 若升级 electron-log 主版本：复核 `resolvePathFn`、`maxSize`、`sync`、console transport 行为，
  重跑 `e2e/logging.spec.ts` 与 `pnpm package:smoke`。
- 若工作区路径/单元格内容进入日志：先修调用点并加门禁测试；不要把日志目录移出 userData。
- 若未来支持 macOS/Linux：确认 `app.getPath('userData')`、文件名与 rename/prune 在目标平台
  的权限/大小写行为；现有逻辑只用 Node fs 与本地日期。

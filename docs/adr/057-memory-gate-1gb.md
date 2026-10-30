# ADR-057 整应用内存门禁由 600MB 提高到 1024MB（1GB）

- 状态：**已接受**（2026-10-30，用户决定）
- 日期：2026-10-30
- 相关：SPEC §16.1、§11.5、§13.4；TESTPLAN §5.1/E6；TASKS T6.6；ADR-033、ADR-045、ADR-049、ADR-056

## 背景

T4.6/ADR-045 把 100k 图表切换的整应用 private 内存门禁定为 **600MB**，由
`e2e/perf.spec.ts` 与 `e2e/chart-perf.spec.ts` 用 `app.getAppMetrics()` 汇总
main + renderer + utility/worker（不含 GPU）判定。历史上该场景余量只有 1.5–2.5%，本机多次在
509–608MB 波动（T6.2/T6.3/T6.5 报告均有记录）。

T6.6（日志文件落盘）验收时，同一台机器上该门禁稳定跑到 **618–639MB**：

- `chart-perf`：618–639MB（多次单跑与全量一致）；
- `perf`（100k 查询）：612–625MB；
- 用 console logger 代替文件 logger 做 A/B 仍为 **618MB**，说明基线被外部程序抬高
  （Steam/游戏/QQ/HeyboxChat、Windows Memory Compression），不是 T6.6 的功能回归；
- T6.5 的同一测试曾在 520MB 通过（2026-10-30 早些时候）。

600MB 在这个环境下已经无法区分“产品回归”与“机器瞬时占用”，继续以它做发布门禁会阻塞
与内存无关的验收。用户 2026-10-30 明确决定：**把内存门禁提高到 1GB，改完不再重跑测试，直接
按新门禁记录通过**。

## 决定

1. **整应用 private 内存门禁统一改为 1024MB（1GB）**：
   - `e2e/perf.spec.ts`、`e2e/chart-perf.spec.ts`、`e2e/m2-acceptance.spec.ts`、
     `e2e/m4-acceptance.spec.ts` 的 `MEMORY_BUDGET_MB` 改为 `1024`；
   - SPEC §16.1 表格、§11.5/§13.4 的相关约束与 TESTPLAN §5.1 同步为 1GB；
   - 其他性能预算（冷启动、打开、查询/排序、图表 resolve/update、导入/导出、长任务）不变。
2. **不改测量口径**：仍是 `app.getAppMetrics()` 的 `privateBytes` 汇总 main + renderer +
   utility/worker，不含 GPU；`workingSetSize` 仍只作诊断。
3. **不重跑 T6.6 的全量 E2E**：用户明确要求改完直接记通过。已有证据为：功能测试 111 passed
   （含 T6.6 的 2 条 logging E2E）、`pnpm verify` 198 files / 1831 tests 全绿；两次内存门禁
   失败值 618–639MB 在新的 1GB 门禁内，按新门禁记为通过（不伪称重跑）。
4. **不修改**：bench 的 Node 管线 `memoryPeakMB`（只作趋势，不是应用门禁）、
   `app.getAppMetrics()` 实现、Electron/Chromium 配置或图表缓存策略。

## 代价

- 门禁从 600MB 放宽到 1GB，**回归灵敏度下降**：600–1024MB 之间的真实增长不会再被 E2E 拦截；
  需要靠 `bench` 趋势、人工复核与 ADR-045 的复核条件补足。
- 1GB 对 16GB 机器仍是一个“不会无限增长”的上界，但不等于内存问题已消失。
- 历史报告/ADR 里的 600MB 数字保留（历史事实）；活文档与代码以 1GB 为准，两者会出现字面差异，
  以本 ADR 为索引。
- 本次未重跑全量 E2E，发布记录必须明确写“按新门禁记通过，未重跑”，不能写成“实测通过”。

## 影响

- 修改：`apps/desktop/e2e/{perf,chart-perf,m2-acceptance,m4-acceptance}.spec.ts`（常量/标题/
  注释）、`docs/SPEC.md §11.5/§13.4/§16.1`、`docs/TESTPLAN.md §5.1/E6`、`docs/HANDOFF.md`
  基线、`docs/ROADMAP.md`、`docs/reports/t6.6/REPORT.md`、本 ADR 与索引。
- 不改：`formatVersion`、JSONL/manifest、IPC/preload、CSP、安全选项、运行时依赖、打包配置。
- 不影响 T6.6 的日志实现；electron-log 仍按 ADR-056 选项 B 交付。

## 复核条件

- 若 CI/干净机器恢复到 600MB 以内，且连续 3 次全量稳定，可把门禁降回 600MB（新 ADR）。
- 若整应用 private 峰值持续 >1GB 或持续增长：按 ADR-045 复核缓存/canvas 生命周期/图表实例，
  不得继续上调门禁。
- 若产品或用户对内存有硬要求：以发布说明中的 1GB 上界为准，并在性能测试机上独占复测。
- 本 ADR 不改变 600MB 的历史验收记录；引用旧报告时需注明“当时的门禁”。

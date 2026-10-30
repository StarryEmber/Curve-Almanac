# T6.5 报告 — 全量验收与文档收尾

- 任务：T6.5 全量验收与文档收尾（依赖 M0–M6 全部任务；覆盖全部 FR/NFR）
- 日期：2026-10-30
- 决策：无新增架构决策；发现 1 项 NFR-06 偏差，见 [ADR-056](../adr/056-t65-log-file-deviation.md)（提议，待用户裁决）
- 范围：全量 `pnpm verify && pnpm e2e && pnpm bench`、README §6 九步端到端演示、SPEC §17 证据矩阵、
  发布检查清单、README/用户手册/开发者指南/ADR 索引/ROADMAP 收尾；**不改**运行时代码、IPC、
  数据格式、CSP、打包配置与 `formatVersion`

## 1. 交付

| 文件 | 内容 |
|---|---|
| `apps/desktop/e2e/t6.5-acceptance.spec.ts` | README §6 九步验收演示（1 条，真实 Electron；两次启动 + 一次 `taskkill /F /T`） |
| `README.md` | 改为产品说明：功能、安装/首次启动、五分钟上手、数据兼容、文档地图、开发命令、九步演示、已知限制、许可证 |
| `docs/MANUAL.md` | 用户手册：界面、工作区、表/列、编辑/粘贴、导入、筛选排序、样式模板、图表、布局、撤销、快捷键、设置、插件、导出、路径与恢复、排障、限制 |
| `docs/DEVELOPER.md` | 开发者指南：环境、目录、依赖边界、关键机制、测试/覆盖率、E2E 演示、打包发布、常见改动指引、排障 |
| `docs/ROADMAP.md` | v1 已知限制（含复核条件）与 v2 设想（存储/插件/平台/体验/数据交换/工程） |
| `docs/TESTPLAN.md` | 新增 E12 九步验收场景；§7 发布清单逐项签字与豁免记录 |
| `docs/adr/056-t65-log-file-deviation.md` | 记录 T6.5 发现的日志落盘偏差与三个处理选项（提议，待用户裁决） |
| `docs/reports/t6.5/` | 本报告 + 13 张 UI 截图 + 导出的 `t6.5-chart.png` + `t6.5-metrics.json` |
| `docs/TASKS.md` / `CHANGELOG.md` / `docs/HANDOFF.md` / `AGENTS.md` | 勾选 T6.5、记录 M6 演示、更新基线与交接 |

**不新增**运行时依赖、IPC 通道、manifest 字段或 `formatVersion` 变更；`pnpm-lock.yaml` 未变。

## 2. 验证总览

```text
pnpm verify
  ESLint 0；depcruise 531 modules / 2309 deps / 0 violations
  tsc -b 通过；196 files / 1816 tests passed（exit 0）

pnpm test:coverage
  statements 77.13% / branches 69.82% / functions 76.51% / lines 77.28%（阈值 70/60 未下调）
  196 files / 1816 tests passed；exit 0

pnpm build（pnpm e2e 内执行）
  exit 0；renderer 3,469.35 kB、CSS 81.34 kB、main 338.76 kB

pnpm e2e
  111 passed（7.0m，1 worker）；T6.5 九步演示 26.2s
  chart-perf 100k 切换 privatePeak 520MB（门禁 600MB）
  perf 100k 查询 privatePeak 590MB（门禁 600MB）

pnpm bench
  exit 0（全部预算内）：table.encode 322ms/1500、table.decode 431ms/3000、table.open 510ms/3000、
  table.save 408ms/500、edit 0ms/50、query 209ms/400、text-sort 370ms/400、cjk-sort 661ms/800、
  condition 1ms/16、import 1,009ms/8s；chart.resolve-sample P95 80ms/300、chart.sample 3ms/50、
  chart.option.2k 1ms/50、chart.restyle.100k 0ms/20；memoryPeakMB 912（Node 趋势，非应用门禁）

pnpm package
  exit 0；NSIS 112,400,989 B、portable 112,163,369 B、win-unpacked 391,112,000 B
  （与 T6.4 的 112,400,939 / 112,163,368 B 仅差时间戳字节；asar 内容未变）
```

**E2E 重跑记录（如实）**：第 1 次全量 110 passed / 1 failed，失败是本任务新 spec 的断言缺陷
（JSONL 用子串断言 `999`，命中了随机 UUID 的十六进制），已改为逐行解析；第 2 次全量
110 passed / 1 failed，`chart-perf` privatePeak **602MB** 超过 600MB 门禁（T6.2/T6.3 已记录的
509–608MB 波动，未放宽门槛）；第 3 次全量 **111 passed**，chart-perf **520MB**。九步演示在
第 3 次运行中一次通过。

## 3. README §6 九步演示

用例 `apps/desktop/e2e/t6.5-acceptance.spec.ts`：**ok 1，26.2s**，两次启动 + 一次
`taskkill /F /T`。除只读 manifest/JSONL 断言外全部走真实 UI。

| # | 步骤 | 实际结果 | 证据 |
|---|---|---|---|
| 1 | 新建 `Demo.cstudio` | 欢迎页 →“新建工作区”→ 名称/保存位置（E2E 目录替身）→ 创建工作区；`manifest.json` 生成 | `t6.5-01-workspace.png` |
| 2 | 建 `温度记录`（4 列 + id 主键） | 列对话框逐列创建：time/date/x、sensor_a/number/y、sensor_b/number/y、site/text/series；manifest 5 列、角色正确 | 同上 |
| 3 | 粘贴 200 行 + 修正类型错误 | 先粘贴含 `n/a` 的矩阵 → 整批拒绝、列出第 58 行/Sensor A/类型不匹配、网格仍 0 行；修正后粘贴 200 行（`aria-rowcount 201`）；单格 `oops` 被拒（`aria-invalid`）后改为 31.5 落盘 | `t6.5-02-paste-error.png`、`t6.5-03-pasted-rows.png` |
| 4 | 应用模板 + 密度 + 条件格式 + 另存 | 应用 `builtin.report-light`；密度 compact（预览 3ms）；`sensor_a > 30` 红底/警告图标；另存 `我的报表`（视图 styleId 指向新样式） | `t6.5-04-style.png` |
| 5 | 折线图：宽→长、缩放、关图例、PNG | 宽表 2 系列 → 长表 3 系列（site）→ 缩放 start>0 → 图例 none → PNG 1702×856（2×）落盘 | `t6.5-05-chart-wide.png`、`t6.5-05b-chart-long.png`、`t6.5-chart.png` |
| 6 | 新表导入 100,000 行 CSV + 滚动/出图 | GB18030 自动识别；映射 id→已有、name/value/day/active/site→新建列；total 100000 / accepted 99997 / skipped 3；提交后 `aria-rowcount 99998`；滚动 100k 网格；图表 sampled=true、源点 99997、渲染 2000、resolve 32ms / update 19ms | `t6.5-06-import-100k.png`、`t6.5-06b-100k-chart.png` |
| 7 | 撤销 5 / 重做 3 + 强杀恢复 | 历史深度 +5 → 撤销 5 回 31.5 → 重做 3 回 43；提交 77 落盘后改为 999 并 `taskkill /F /T`，`.lock` 保留 | `t6.5-07-history.png`、`t6.5-07b-before-kill.png` |
| 8 | 重启 → 最近工作区 → 全部还原 | 恢复对话框（含“最后 1.5 秒”提示）→“尝试恢复”；2 pane、`温度趋势` 图表 ready、样式 `我的报表`、首行 77、无 999、`.lock` 释放 | `t6.5-08-recovery.png`、`t6.5-08b-restored.png` |
| 9 | 模板导出 → 新工作区导入/应用 | 导出 `curve-table-style`（name=我的报表、builtin=false）→ 新工作区 `模板验证` → 导入并应用到新表；`data-table-style` 指向重分配后的新 id | `t6.5-09-template-imported.png` |

`t6.5-metrics.json`：

```json
{
  "tableColumns": 5,
  "pasteRejected": true,
  "pastedRows": 200,
  "invalidCellRejected": true,
  "previewMs": 3,
  "styleId": "sty_9aa7492d-…",
  "styleRules": 1,
  "wideSeries": 2,
  "longSeries": 3,
  "pngWidth": 1702,
  "pngHeight": 856,
  "importedRows": 99997,
  "sampledPoints": 2000,
  "resolveMs": 32,
  "updateMs": 19,
  "undoBase": 19,
  "undoSteps": 5,
  "redoSteps": 3,
  "killedInAutosaveWindow": true,
  "restoredValue": 77,
  "restoredPanes": 2,
  "importedStyleId": "sty_c89b313a-…"
}
```

## 4. 自动化证据与手工复验

本节按 T6.5 接手要点分开记录；不把自动化证据伪装成手工签字。

### 4.1 自动化证据（本次实际执行）

| 证据 | 命令/用例 | 结果 |
|---|---|---|
| Lint/边界/类型/单测 | `pnpm verify` | exit 0；196 files / 1816 tests；depcruise 0 violations |
| 覆盖率 | `pnpm test:coverage` | 70/60 阈值未下调；全局 lines 77.28% |
| 全量 E2E | `pnpm e2e` | 111 passed（7.0m）；含 T6.5、M5、plugin、layout、recovery 等 |
| 性能基准 | `pnpm bench` | exit 0，全部预算内 |
| 构建 | `pnpm build`（e2e 内） | exit 0；renderer 3,469.35 kB |
| 安装包 | `pnpm package` | exit 0；NSIS/portable/win-unpacked 产出，体积与 T6.4 一致 |
| 安装/卸载/数据保留 | `pnpm package:smoke`（T6.4 执行，本次未重跑） | PASS；install 17.3s / launch 4.4s / uninstall 8.9s；工作区与 userData 保留 |

### 4.2 手工/人工确认

| 项 | 结果 |
|---|---|
| 九步演示的“一次通过” | 第 3 次全量运行中 **ok（26.2s）**，截图已归档 |
| 截图审阅 | 14 张 PNG 已人工查看：工作区/粘贴错误/200 行/样式规则/宽长图/100k 导入/撤销/恢复/模板 |
| 干净机器复验 | **用户于 2026-10-30 明确豁免**（见 §6） |
| 发布清单签字 | 8/9 项通过，1 项未达标（日志落盘，见 §6/ADR-056） |

## 5. SPEC §17 需求 → 证据矩阵

图例：✅ 自动化覆盖并通过；⚠️ 部分达标（见注）；🧍 依赖人工确认。

### 5.1 工作区

| ID | 证据 | 状态 |
|---|---|---|
| FR-WS-01 | `e2e/workspace.spec.ts` 4 条；`m1-acceptance`；T6.5 步骤 1/8 | ✅ |
| FR-WS-02 | `e2e/layout.spec.ts` 3 条；`m5-acceptance`；T6.5 步骤 8（2 pane 还原） | ✅ |
| FR-WS-03 | `e2e/autosave.spec.ts` 4 条、`recovery.spec.ts` 4 条；`m5`；T6.5 步骤 7 | ✅ |
| FR-WS-04 | `e2e/workspace.spec.ts`（future version 拒绝/损坏不覆盖）；`fixtures/workspaces/*`；domain 迁移单测 | ✅ |

### 5.2 表格数据

| ID | 证据 | 状态 |
|---|---|---|
| FR-TBL-01 | `e2e/schema.spec.ts`、`edit.spec.ts`、`plugin.spec.ts`；T6.5 步骤 2 | ✅ |
| FR-TBL-02 | `e2e/edit.spec.ts` 3 条；T6.5 步骤 3（单格校验） | ✅ |
| FR-TBL-03 | `e2e/paste.spec.ts` 7 条；T6.5 步骤 3（整批拒绝） | ✅ |
| FR-TBL-04 | `e2e/import.spec.ts` 6 条、`plugin.spec.ts`；T6.5 步骤 6（100k/3 坏行） | ✅ |
| FR-TBL-05 | `e2e/filter.spec.ts` 5 条（多条件、3 级排序、视图状态） | ✅ |
| FR-TBL-06 | `e2e/export-csv.spec.ts` 3 条（筛选/排序/隐藏列/原始值/100k/取消） | ✅ |
| FR-TBL-07 | `e2e/perf.spec.ts` 3 条、`grid.spec.ts` 100k；`pnpm bench` | ✅ |
| FR-TBL-08 | `e2e/schema.spec.ts`（加/删/改类型、失败不改字节、行数不变） | ✅ |

### 5.3 表格外观

| ID | 证据 | 状态 |
|---|---|---|
| FR-STY-01 | `e2e/style.spec.ts`（4 内置模板计算样式）；`m3` | ✅ |
| FR-STY-02 | `e2e/style.spec.ts`（预览 50 行、单控件一次撤销）；T6.5 步骤 4（3ms） | ✅ |
| FR-STY-03 | `e2e/style.spec.ts`（对齐/数字/日期/宽度/badge/bar） | ✅ |
| FR-STY-04 | `e2e/style.spec.ts`（求值/首条命中/行单元格目标/禁用）；`m3`；T6.5 步骤 4 | ✅ |
| FR-STY-05 | `e2e/template.spec.ts`（另存/复制/重命名/默认/删除回退/撤销） | ✅ |
| FR-STY-06 | `e2e/template.spec.ts`（导出→新工作区导入→12 项样式一致）；T6.5 步骤 9 | ✅ |
| FR-STY-07 | `e2e/style.spec.ts`（badge 仅 enum、bar min/max、空值不绘制） | ✅ |

### 5.4 图表

| ID | 证据 | 状态 |
|---|---|---|
| FR-CHT-01 | `e2e/chart.spec.ts`（宽表多 Y、系列名/色、删除视图关闭） | ✅ |
| FR-CHT-02 | `e2e/chart.spec.ts`（长表拆分、空值、>20 系列警告）；T6.5 步骤 5 | ✅ |
| FR-CHT-03 | `e2e/chart.spec.ts`（轴/图例/调色板/线宽/平滑/从零 + 重启还原） | ✅ |
| FR-CHT-04 | `e2e/chart-interaction.spec.ts`（缩放/图例/tooltip/resize） | ✅ |
| FR-CHT-05 | `e2e/chart-interaction.spec.ts`、`chart-perf.spec.ts`；`bench`；T6.5 步骤 6（2000 点/99997） | ✅ |
| FR-CHT-06 | `e2e/chart-interaction.spec.ts`（透明/白/深、2×、文件名、像素）；T6.5 步骤 5 | ✅ |
| FR-CHT-07 | `e2e/chart-interaction.spec.ts`、`chart.spec.ts`、`schema.spec.ts`（空态/缺列/重映射） | ✅ |

### 5.5 扩展与工程

| ID | 证据 | 状态 |
|---|---|---|
| FR-EXT-01 | `packages/plugin-sdk/src/registry.test.ts` 10 条；`plugin-contributions.test.ts` | ✅ |
| FR-EXT-02 | `host.test.ts` 15 条；`e2e/plugin-ui.spec.ts` 3 条（禁用/抛错隔离/200%） | ✅ |
| FR-EXT-03 | `plugins/plugin-sample` 29 条；`e2e/plugin.spec.ts` 3 条（rating 列/导入器） | ✅ |
| FR-EXT-04 | `host.test.ts`（主版本兼容/不兼容禁用） | ✅ |
| NFR-01 性能 | `pnpm bench` 全预算；`perf.spec.ts`、`chart-perf.spec.ts`；T6.5 指标 | ✅ |
| NFR-02 安全 | `smoke.spec.ts`（无 Node/CSP/导航拒绝）、`ipc.spec.ts`、T6.4 asar/打包检查 | ✅ |
| NFR-03 可访问性 | `chart-interaction` 的 axe（wcag2a/aa critical 0）；各 spec 的 200% + 纯键盘；`ui` 组件测试 | ✅ |
| NFR-04 国际化 | `i18n.test.ts`（key 集/无 CJK）、`settings.spec.ts`（+30% 伪本地化）、`ui-conventions.test.ts` | ✅ |
| NFR-05 离线隐私 | ADR-016；无网络客户端依赖/遥测代码；CSP 无外部源 | ✅（设计+静态） |
| NFR-06 日志与崩溃 | 崩溃恢复：`recovery.spec.ts`/`m5`/T6.5 步骤 7–8 ✅；**日志落盘：未实现**（无 electron-log、无 `userData/logs/main.log`、无按天轮转/7 天保留、无 renderer 全局 error 转发） | ⚠️ |
| NFR-07 测试与 CI | `pnpm verify` 196/1816、`pnpm e2e` 111、覆盖率 77.28%、CI 工作流 | ✅ |
| NFR-08 打包 | `pnpm package` exit 0；T6.4 `package:smoke` PASS；`packaging.test.ts` 5 条 | ✅ |

**NFR-06 偏差说明**：`apps/desktop/src/main/logger.ts` 自 T0.3 起只做分级/截断并写 console
（注释写明“T1.x 换文件日志”，但没有任务落地）；SPEC §5.1/§16.5 要求的 `electron-log` 不在
依赖中；`renderer/main.tsx` 未注册全局 `error`/`unhandledrejection` → `log:write`。崩溃恢复
（锁/备份/提示）本身完整通过。处理选项与建议见 [ADR-056](../adr/056-t65-log-file-deviation.md)。

## 6. 发布检查清单（TESTPLAN §7 签字）

| # | 项 | 结果 | 证据/说明 |
|---|---|---|---|
| 1 | `pnpm verify`、`pnpm e2e`、`pnpm bench` 全绿并归档 | ✅ | 本报告 §2；verify 196/1816、e2e 111、bench exit 0 |
| 2 | README §6 九步演示一次通过（截图） | ✅ | §3；13 张 UI 截图 + 导出 PNG |
| 3 | SPEC §17 全部 FR 有证据 | ✅ | §5；29 条 FR/扩展全部有测试或演示 |
| 4 | Windows 干净用户安装 → 启动 → 建工作区 → 卸载 → 数据仍在 | 🧍 **豁免** | 用户 2026-10-30 明确“不做干净机器复验”；以 T6.4 `package:smoke`（无既存安装/无 userData/非管理员）PASS 作为替代证据 |
| 5 | 版本号、`appId`、图标、许可证正确 | ✅ | `packaging.test.ts` 5 条；`appId=com.curvealmanac.app`、`0.1.0`、ICO 7 档、`license.txt` |
| 6 | 生产包无 DevTools、无测试钩子、无 source map | ✅ | T6.4 smoke：asar 23 文件、无 `*.map`/dev 文件、`CURVE_E2E_*` 失效、DevTools 关闭 |
| 7 | 日志路径/滚动/保留天数符合 SPEC §16.5 | ❌ | **未达标**：仅 console；无 `logs/main.log`、无轮转/7 天、无 renderer 全局转发（ADR-056） |
| 8 | 已知限制与 v2 路线写入 `docs/ROADMAP.md` 与发布说明 | ✅ | `docs/ROADMAP.md` + README/MANUAL §已知限制 |
| 9 | 回滚方案：保留上一版安装包与工作区迁移备份说明 | ✅ | 保留 `release/` 上一版安装包；工作区格式 v1，`backups/` + `.lock` 恢复；降级不支持跨 `formatVersion` |

**签字结论**：9 项中 7 项通过、1 项用户豁免、1 项未达标（日志落盘）。发布签字**未完成**，
需用户对 ADR-056 的选项作出裁决；M6 不自动关闭。

## 7. 已知限制与例外

- **NFR-06 日志落盘**（本次发现，唯一未达标项）：仅 console；`log:write` 可被调用但没有文件
  sink；插件错误日志是 200 条内存环形缓冲（设计如此，见 ADR-054）；崩溃恢复提示不受影响。
- **干净机器复验**：用户书面豁免；本机证据是“无既存安装/无 userData/非管理员”，不是全新系统镜像。
- **安装包未签名**：SmartScreen 提示；无自动更新（ADR-016/055）。
- **体积**：NSIS 112 MB / 解压 391 MB；可评估裁剪 locales。
- **chart-perf 内存**：本机波动 509–608 MB（门禁 600 MB）；本次通过为 520 MB，第二次全量曾 602 MB。
  未放宽门槛；复跑前先确认外部负载（本机游戏客户端会占 CPU/内存）。
- **插件**：禁用不持久化、文案不本地化、图表预设不回显、大文件导入在主线程（ADR-053/054）。
- **CSV 导出**使用存储格式化，不套用语义字段格式。
- **主进程原生对话框**仍为英文。
- **macOS/Linux** 未配置；v1 只承诺 Windows x64。
- 更多 v2 方向见 [ROADMAP](../ROADMAP.md)。

## 8. 文档与仓库变更

- 新增：`docs/MANUAL.md`、`docs/DEVELOPER.md`、`docs/ROADMAP.md`、`docs/adr/056-…`、
  `apps/desktop/e2e/t6.5-acceptance.spec.ts`、`docs/reports/t6.5/**`。
- 修改：`README.md`（产品说明）、`docs/TESTPLAN.md`（E12 + §7 签字）、`docs/TASKS.md`（T6.5）、
  `docs/HANDOFF.md`、`AGENTS.md §0`、`CHANGELOG.md`、`docs/adr/README.md`（索引）。
- `docs/reports/m0/*.png` 已被 E2E 重写后 `git checkout` 还原；历史报告/截图未被覆盖
  （本任务只新增 `docs/reports/t6.5/`）。
- 未改：`formatVersion`、JSONL/manifest、IPC/preload、CSP/Electron 安全选项、打包配置、
  运行时依赖、`pnpm-lock.yaml`。

## 9. 结论与停点

T6.5 的自动化与文档交付已完成：全量 verify/e2e/bench 绿、九步演示一次通过、FR 证据矩阵齐全、
安装包可重复构建、README/手册/开发者指南/ROADMAP/ADR 索引收尾。

**M6 验收演示**（示例插件 → 安装包 → 全量报告 → 九步演示 → 发布清单）已具备证据，但发布清单
第 7 项（SPEC §16.5 日志落盘）未达标。按任务协议，**在此停下等用户确认**：

1. 接受为 v1 已知限制（更新 SPEC §16.5 例外 + ROADMAP，随后签字关闭 M6）；或
2. 新开任务实现日志落盘（推荐选项：内置 fs 轮转或引入 `electron-log`），完成后重跑
   verify/e2e/package:smoke 再签字。

M6 **未关闭**，`docs/TASKS.md` 中 T6.5 保持“已完成、待验收”状态。

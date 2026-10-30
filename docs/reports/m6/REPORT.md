# M6 验收演示与关闭记录 — 扩展与发布

- 里程碑：M6 扩展与发布（T6.0–T6.6）
- 日期：2026-10-30
- 结果：**用户接受并关闭 M6**；v1 实施阶段（M0–M6）结束
- 决策：ADR-051–055（T6.0–T6.4）、ADR-056（日志，选项 B）、ADR-057（内存门禁 1GB）
- 范围：品牌更名、插件 SDK/示例插件/插件 UI 与隔离、安装包与发布配置、全量验收与文档收尾、
  日志文件落盘；**不改** IPC/preload/数据格式/CSP/Electron 安全选项

## 1. M6 演示脚本（TASKS 要求）

示例插件可用 → 安装包安装/卸载 → 全量 E2E/性能/可访问性报告 → 九步演示 → 发布清单签字。

| 步骤 | 结果 | 证据 |
|---|---|---|
| 示例插件可用 | ✅ rating 字段类型（`★★★`、1–5 校验）、Points JSON 导入器、来源标识、会话级禁用、错误隔离 | `docs/reports/t6.2/REPORT.md`、`t6.3/REPORT.md`；`e2e/plugin.spec.ts`、`plugin-ui.spec.ts` |
| 安装包安装/卸载 | ✅ NSIS 每用户安装 + portable；真实安装→启动→默认路径建工作区→卸载→数据保留 | `docs/reports/t6.4/REPORT.md`（`package:smoke` PASS）；`apps/desktop/test/packaging.test.ts` |
| 全量 E2E/性能/可访问性 | ✅ `pnpm e2e` 功能测试 111 passed；`pnpm bench` exit 0；200% 缩放/键盘/axe 覆盖在既有 spec | `docs/reports/t6.5/REPORT.md` §2/§5、`t6.6/REPORT.md` §4 |
| 九步演示 | ✅ `e2e/t6.5-acceptance.spec.ts` 1 条、26.2s；13 张 UI 截图 + 导出 PNG + metrics | `docs/reports/t6.5/REPORT.md` §3 |
| 发布清单签字 | ✅ 9 项中 8 通过、1 项用户豁免（干净机器）；日志项由 T6.6 闭环 | `docs/reports/t6.5/REPORT.md` §6、`docs/TESTPLAN.md` §7 |

## 2. 最终基线

```text
pnpm verify              198 files / 1831 tests；ESLint 0；depcruise 538 modules / 2331 deps / 0 violations
pnpm e2e                 功能测试 111 passed（含 T6.5 九步 25.6s、T6.6 logging 2 条）
                         内存门禁 chart-perf 618–639MB / perf 612–625MB，按 1GB（ADR-057）记通过
pnpm bench               exit 0（T6.5 实测；全部预算内）
pnpm package             exit 0（2026-10-30 T6.6 后重打：NSIS 112,421,391 B / portable 112,183,788 B；
                         asar 82 条目，含 electron-log）
pnpm package:smoke       PASS（2026-10-30 重打后：install 20.6s / launch 9.4s / uninstall 9.2s；
                         工作区与 userData 保留）
pnpm build               exit 0；renderer 3,471.75 kB、CSS 81.34 kB、main 338.76 kB
coverage                 沿用 T6.5：lines 77.28% / statements 77.13% / branches 69.82% / functions 76.51%
```

## 3. 交付一览（M6）

| 任务 | 交付 | 报告 / ADR |
|---|---|---|
| T6.0 | Curve Studio → Curve Almanac；`APP_NAME` 单一来源；默认目录 `Documents/Curve Almanac`；userData 改名 | `t6.0/REPORT.md`、ADR-051 |
| T6.1 | `@curve/plugin-sdk`：注册表（subscribe/source/owner replace）、宿主激活器、错误隔离 | `t6.1/REPORT.md`、ADR-052 |
| T6.2 | `plugins/plugin-sample`：rating 字段类型 + points 导入器；生成进程字段类型解析 | `t6.2/REPORT.md`、ADR-053 |
| T6.3 | 内置贡献注册、四类贡献点读注册表、来源标识、错误 toast/环形日志、插件管理器、会话级禁用 | `t6.3/REPORT.md`、ADR-054 |
| T6.4 | electron-builder NSIS 每用户 + portable、图标/许可证、`package:smoke` | `t6.4/REPORT.md`、ADR-055 |
| T6.5 | 全量验收、九步演示、README/MANUAL/DEVELOPER/ROADMAP、发布清单、1 项日志缺口 | `t6.5/REPORT.md` |
| T6.6 | `electron-log` 文件日志（按天/7 天）、renderer 全局错误限流转发；内存门禁 1GB | `t6.6/REPORT.md`、ADR-056/057 |

## 4. 例外与发布前待办

- **干净机器复验**：用户 2026-10-30 书面豁免；替代为 T6.4 的“无既存安装/无 userData/非管理员”
  冒烟，不是全新 Windows 镜像。
- **内存门禁**：600MB → 1GB（ADR-057）。600–1024MB 之间的真实增长不再被 E2E 拦截；环境受控后
  连续 3 次 <600MB 可降回（新 ADR）。
- **安装包已重打并冒烟**：T6.6 新增 `electron-log` 后已重跑 `pnpm package`/`package:smoke`，
  asar 含 `node_modules/electron-log/src/index.js`，安装/启动/卸载/数据保留 PASS；metrics
  `docs/reports/t6.6/t6.6-package-metrics.json`（T6.4 历史 metrics 保留）。
- **T6.6 全量 E2E 未重跑**：用户指示按 1GB 门禁直接记通过；功能测试证据取自此前的全量运行。
- **已知限制**：见 `docs/ROADMAP.md`、README/MANUAL §已知限制、T6.5/T6.6 报告 §6/§7。

## 5. 关闭签字

- M6 的 7 个任务（T6.0–T6.6）全部完成；演示五步均有证据；发布清单 8 通过 + 1 豁免。
- 用户于 **2026-10-30** 明确关闭 M6；本记录作为 M6 的验收归档，不替代 T6.0–T6.6 的详细报告。
- v1 实施阶段（M0–M6）至此结束。后续只做发布/运维修复；新功能需求进入 v2（见 ROADMAP）。

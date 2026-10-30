# Curve Almanac

> 表格驱动的本地曲线可视化工具：自定义表结构与表格外观，录入或导入数据，实时看到多系列曲线。
> 单机离线、工作区即目录、**10 万行以内**流畅。
>
> 版本 `0.1.0`（Windows x64）· **v1 实施已完成，M6 于 2026-10-30 关闭** ·
> 规格 [docs/SPEC.md](docs/SPEC.md) ·
> 验收记录 [docs/reports/t6.5/REPORT.md](docs/reports/t6.5/REPORT.md) ·
> M6 汇总 [docs/reports/m6/REPORT.md](docs/reports/m6/REPORT.md) ·
> 续作说明 [docs/HANDOFF.md](docs/HANDOFF.md)

## 1. 这是什么

Curve Almanac 把“数据表”和“曲线图”放在同一个工作区里：

- **自定义表结构**：数值 / 文本 / 日期 / 布尔 / 枚举五种存储类型，列角色（X / Y / 系列 / 标签）、
  主键、必填、单位与精度；插件还能提供语义字段类型（例如 1–5 的 `rating`）。
- **自定义表格外观**：4 套内置模板、密度 / 字体 / 颜色等令牌、列级对齐与数字/日期格式、
  条件格式、可保存 / 复用 / 导入导出的样式模板。
- **图表**：宽表与长表两种映射、折线/散点/柱状、缩放与图例交互、LTTB 采样、2× PNG 导出。
- **不丢数据**：1.5 s 自动保存、崩溃恢复、100 步撤销/重做、原子写与 manifest 备份。
- **离线**：无网络请求、无遥测、无自动更新；插件为编译期静态模块，不下载运行时代码。

## 2. 功能一览

| 领域 | v1 能力 |
|---|---|
| 工作区 | 新建/打开/最近打开、多表多视图、递归分栏与标签、布局持久化 |
| 表格数据 | 键盘编辑与校验、区域粘贴、CSV/JSON 导入向导（编码/分隔符/表头/坏行）、筛选、多级排序 |
| 表格外观 | 内置模板、样式编辑器（实时预览）、列覆盖、条件格式、模板 CRUD 与导入导出、CSV 导出 |
| 图表 | 宽/长表映射、检查器（配色/图例/线宽/平滑/从零）、缩放/图例/tooltip、采样徽标、PNG 导出 |
| 效率 | 撤销/重做、快捷键、命令面板（Ctrl/Cmd+K）、F1 快捷键表 |
| 设置 | 主题（浅/深/跟随系统）、中文/英文、默认表格样式、自动保存开关 |
| 插件 | 静态插件 SDK：字段类型、导入器、图表类型、命令；来源标识、错误隔离、会话级禁用 |
| 工程 | Electron 安全基线、Zod IPC 契约、原子写、迁移框架、按天日志、安装包与发布冒烟 |

## 3. 安装与首次启动

### 3.1 安装包（Windows 10/11 x64）

| 产物 | 说明 |
|---|---|
| `release/Curve Almanac Setup 0.1.0.exe` | NSIS 每用户安装包；默认装到 `%LOCALAPPDATA%\Programs\Curve Almanac`，不要求管理员 |
| `release/Curve Almanac 0.1.0.exe` | portable 单文件；运行后自解压到临时目录 |

安装后开始菜单与桌面会出现 `Curve Almanac` 快捷方式。安装包**未签名**，首次运行可能出现
SmartScreen“未知发布者”提示；选择“更多信息 → 仍要运行”。v1 不提供自动更新。

卸载不会删除用户数据：`%APPDATA%\Curve Almanac`（设置/最近列表/窗口状态）与
`Documents\Curve Almanac`（默认工作区目录）都会保留。

### 3.2 首次启动

1. 启动后进入欢迎页；点“新建工作区”，名称例如 `Demo`，保存位置默认
   `Documents\Curve Almanac`（可改）。
2. 工作区是一个目录 `Demo.cstudio`：`manifest.json` + `tables/*.jsonl` + `backups/`。
3. 用“新建表”建第一张表，再用右侧“列”面板加列。

完整操作说明见 [用户手册](docs/MANUAL.md)；代理/自动化操作见 [DSH 使用手册](docs/DSH.md)。

## 4. 五分钟上手

1. **建表**：左侧“数据表”→“新建表”，输入表名与主键列。
2. **加列**：右侧“列”→“新增列”，选存储类型与角色（X / Y / 系列）。
3. **录数据**：直接编辑单元格，或从 Excel 复制区域粘贴；也可“导入”CSV/JSON。
4. **调外观**：右侧“样式”→“编辑样式”改密度/颜色，加条件规则；可另存为模板。
5. **出图**：左侧“图表”→“新建图表”，选表、X 与一个或多个 Y 列；检查器可切宽/长表映射。
6. **保存**：编辑后 1.5 s 自动落盘，状态栏显示“已保存”；Ctrl/Cmd+S 立即写。
7. **恢复**：异常退出后重开会提示“上次未正常退出”，可选择恢复。

## 5. 数据与兼容性

- 工作区格式版本固定 `formatVersion: 1`；行数据为 UTF-8 JSONL（`{"id":"row_<uuid>","v":[...]}`），
  列引用一律使用列 ID。
- 所有写入为“临时文件 + rename”，并保留上一版备份；manifest 最后写；`.lock` 标记打开状态。
- 高版本工作区会被拒绝（`E_WS_VERSION_UNSUPPORTED`），不做“尽力解析”。
- 迁移前自动备份；迁移失败回滚。v1 只有格式 1，不存在旧版本迁移。
- 单表目标 ≤ 100,000 行（硬上限 200,000），工作区软上限 300,000 行；单表 ≤ 100 列、≤ 20 表、
  ≤ 50 图、每图 ≤ 20 系列。

## 6. 文档地图

| 文件 | 作用 |
|---|---|
| [docs/MANUAL.md](docs/MANUAL.md) | 用户手册：安装、15 分钟上手、每个功能怎么用、快捷键、FAQ、限制 |
| [docs/DSH.md](docs/DSH.md) | DSH/自动化代理使用手册：环境、命令、测试、打包、发布、排障 |
| [docs/DEVELOPER.md](docs/DEVELOPER.md) | 开发者指南：目录、命令、边界、测试、打包 |
| [docs/SPEC.md](docs/SPEC.md) | 规范：模型、格式、契约、验收标准（契约源） |
| [docs/TASKS.md](docs/TASKS.md) | 任务、依赖、验收与实现备注 |
| [docs/TESTPLAN.md](docs/TESTPLAN.md) | 测试分层、E2E 场景、性能预算、发布检查清单 |
| [docs/HANDOFF.md](docs/HANDOFF.md) | 实施交接：环境事实、进度、续作说明 |
| [docs/HANDOFF-MAINTENANCE.md](docs/HANDOFF-MAINTENANCE.md) | 维护交接：v1 发布后的更新、升级、发布与故障处理 |
| [docs/PROMPTS.md](docs/PROMPTS.md) | 维护提示词模板：修复/升级/发布/文档/新功能 |
| [docs/DECISIONS.md](docs/DECISIONS.md) + [docs/adr/](docs/adr/README.md) | 16 条锁定决策与 55 篇 ADR 索引 |
| [docs/ROADMAP.md](docs/ROADMAP.md) | v2 设想与 v1 已知限制 |
| [AGENTS.md](AGENTS.md) | 实现代理的强制守则 |

## 7. 开发与验证

要求 Node ≥ 20.11、pnpm 11.x；仓库为 pnpm workspace（9 个 `@curve/*` 包 + `@curve/desktop` +
`plugins/plugin-sample`）。

```bash
pnpm install
pnpm dev                 # Electron 开发模式
pnpm build               # renderer + main + preload
pnpm lint                # ESLint（零 warning）
pnpm typecheck           # tsc -b
pnpm test                # Vitest（196 files / 1816 tests 基线）
pnpm test:coverage       # 覆盖率门禁（全局 lines ≥ 70%，纯逻辑包 ≥ 85%）
pnpm e2e                 # 先 build，再 Playwright 驱动 Electron（111 passed 基线）
pnpm bench               # 10 万行性能基准（exit 0）
pnpm verify              # lint + typecheck + test（提交前必须全绿）
pnpm package             # electron-builder：NSIS + portable，产物到 release/
pnpm package:smoke       # 真实安装/启动/卸载/数据保留冒烟（会写系统目录）
```

本机受限 shell 需要 `CURVE_E2E_NO_SANDBOX=1` 与镜像变量；打包/冒烟的细节见
[DEVELOPER.md §7](docs/DEVELOPER.md) 与 [HANDOFF §3](docs/HANDOFF.md)。

## 8. 最终验收演示（必须一次通过）

对应自动化用例 `apps/desktop/e2e/t6.5-acceptance.spec.ts`，一次真实 Electron 运行完成以下九步：

1. 新建工作区 `Demo.cstudio`。
2. 建表 `温度记录`：列 `time(date, x)`、`sensor_a(number, y)`、`sensor_b(number, y)`、`site(text, series)`。
3. 粘贴 200 行数据；把类型错误的一行改对；确认错误提示与校验。
4. 应用 `builtin.report-light`，改密度、给 `sensor_a` 加“大于 30 标红”的条件格式；另存为 `我的报表`。
5. 新建折线图（宽表映射），切换长表映射；开启缩放、关闭图例、导出 PNG。
6. 新建第二张表导入 100,000 行 CSV；滚动表格与出图，采样徽标出现，交互仍在预算内。
7. 撤销 5 步、重做 3 步；自动保存后强杀进程，重开触发恢复，已提交数据不丢。
8. 重启应用 → 最近工作区 → 布局、样式、图表全部还原。
9. 导出样式模板，在新工作区导入并应用成功。

证据（13 张截图 + `t6.5-metrics.json`）见 [T6.5 报告](docs/reports/t6.5/REPORT.md)。
复跑：

```bash
pnpm exec playwright test --config apps/desktop/playwright.config.ts \
  apps/desktop/e2e/t6.5-acceptance.spec.ts
```

## 9. 已知限制（v1）

- **仅 Windows x64**；macOS/Linux 未配置打包。安装包未签名、无自动更新/发布通道。
- **强杀最多丢最后 1.5 s**（自动保存窗口内的修改）；恢复对话框会明确提示。
- **无公式列、多表关联、SQL、云同步、协作**；v2 方向见 [ROADMAP](docs/ROADMAP.md)。
- **插件是编译期静态模块**，不能下载/热更新；禁用状态只在本次会话有效；插件文案不本地化；
  插件导入器在渲染进程解析，超大文件可能阻塞 UI。
- **插件图表预设**不会在检查器回显（`ChartSpec` 不含预设 id）。
- CSV 导出使用**存储格式化**，不套用语义字段类型的显示格式。
- 主进程原生对话框（关于/退出确认/恢复提示）仍为英文。
- 日志文件按天滚动（含今天保留 7 天），跨天后的**第一次写入**才归档，不是 00:00 定时器；
  单日日志没有硬大小上限；renderer 错误转发超过 10 条/分钟后静默丢弃（控制台仍有原生输出）。
- 扩展与限制的完整清单、逐条证据见 [T6.5 报告 §5/§6](docs/reports/t6.5/REPORT.md)。

## 10. 许可证

专有软件，`All rights reserved`（根 `package.json` 的 `UNLICENSED`）。NSIS 许可证页使用
`apps/desktop/build/license.txt`；Electron/Chromium 自身许可证随包提供。

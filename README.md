# Curve Almanac

> 表格驱动的 PC 曲线可视化工具。**实施进行中：M5 已验收关闭；M6（扩展与发布）进行中，
> 已完成 T6.0 品牌更名（ADR-051）、T6.1 插件 SDK、T6.2 示例插件、T6.3 插件 UI 与 T6.4
> 安装包与发布配置（ADR-055）；T6.5 待开始。**
> 方案版本：`1.0`（已锁定）· 当前进度与续作说明：[docs/HANDOFF.md](docs/HANDOFF.md)

## 1. 一句话定义

用户自定义表结构和表格外观，录入或导入数据，实时看到多系列曲线；工作区以本地目录形式保存，单机离线，**10 万行以内**流畅。

两个"自定义"都必须有：

1. **自定义表结构**：列类型（数值/文本/日期/布尔/枚举）、列角色（X/Y/系列/标签）、校验规则、单位与精度。
2. **自定义表格外观**：主题令牌、密度、列级对齐/格式、条件格式、可保存/复用/导入导出的样式模板。

公式列、多表关联、SQL、云同步、协作明确后置。

## 2. 已锁定决策

| 项 | 结论 | 详见 |
|---|---|---|
| 桌面壳 | Electron + electron-vite + electron-builder | [ADR-001](docs/DECISIONS.md#adr-001) |
| 技术栈 | React + TypeScript strict + Vite；pnpm monorepo | [ADR-002](docs/DECISIONS.md#adr-002) |
| 数据规模 | v1 单表目标 ≤100,000 行；工作区软上限 300,000；文件型存储 | [ADR-003](docs/DECISIONS.md#adr-003) |
| 工作区格式 | 目录：`manifest.json` + `tables/*.jsonl` | [SPEC §7](docs/SPEC.md#7-工作区文件格式) |
| 表格 | TanStack Table + TanStack Virtual（headless） | [ADR-005](docs/DECISIONS.md#adr-005) |
| 图表 | 自建 `RenderModel` + ECharts 适配器 | [ADR-004](docs/DECISIONS.md#adr-004) |
| 状态与撤销 | Zustand + Immer + 命令总线 | [ADR-006](docs/DECISIONS.md#adr-006) |
| 扩展 | 贡献点注册表 + 静态插件 SDK；动态加载后置 | [ADR-010](docs/DECISIONS.md#adr-010) |
| 安全 | `contextIsolation` + `sandbox` + 最小 IPC + Zod 校验 | [SPEC §15](docs/SPEC.md#15-ipc-契约) |

## 3. 文档地图

| 文件 | 作用 | 谁读 |
|---|---|---|
| [AGENTS.md](AGENTS.md) | 实现代理的强制守则、命令、边界、DoD | **每个任务开始前必读** |
| [docs/HANDOFF.md](docs/HANDOFF.md) | 实施交接：环境事实、当前进度与续作说明 | **新会话续作前必读** |
| [docs/SPEC.md](docs/SPEC.md) | 规范：模型、格式、契约、验收标准 | 实现与评审 |
| [docs/TASKS.md](docs/TASKS.md) | 40 个可执行任务、依赖、验收、验证命令 | 实现排期 |
| [docs/TESTPLAN.md](docs/TESTPLAN.md) | 单测/契约/E2E/性能/发布检查 | 测试与验收 |
| [docs/DECISIONS.md](docs/DECISIONS.md) | 16 条已锁定架构决策与复核触发条件 | 评审与后续升级 |
| [KICKOFF.md](KICKOFF.md) | 可直接粘贴给 DSH 的启动提示词 | 发起实施 |

## 4. 执行方式

1. 把 `curve-studio/` 整体作为仓库根目录。
2. 实现代理先读 `AGENTS.md`，再读 `docs/SPEC.md` 与 `docs/TASKS.md`。
3. 严格按任务 ID 顺序执行；每个任务完成必须跑：

   ```bash
   pnpm verify          # lint + typecheck + unit
   pnpm e2e -- --grep "<相关场景>"   # UI/集成任务
   pnpm package         # 构建 + electron-builder（NSIS + portable，产物在 release/）
   pnpm package:smoke   # 真实安装/启动/卸载/数据保留冒烟（T6.4）
   ```

4. 每个里程碑结束运行 `docs/TASKS.md` 中的"里程碑验收演示"，输出验收报告后再进入下一阶段。
5. 发现规格冲突时，先写 `docs/adr/NNN-*.md` 记录偏差，再改代码；**禁止静默偏离 SPEC**。

完整启动提示词见 [KICKOFF.md](KICKOFF.md)。

## 5. 目标目录（实施完成后）

```
curve-studio/
├─ package.json                 # 根脚本：verify / test / e2e / bench / package / package:smoke
├─ pnpm-workspace.yaml
├─ tsconfig.base.json
├─ apps/
│  └─ desktop/                  # Electron main / preload / renderer
│     ├─ src/main/              # 窗口、菜单、文件系统、IPC handler
│     ├─ src/preload/           # contextBridge 类型化 API
│     ├─ src/renderer/          # React UI
│     ├─ build/                 # electron-builder 资源：图标（svg/png/ico）与许可证
│     └─ electron-builder.yml   # 打包/发布配置（T6.4，ADR-055）
├─ packages/
│  ├─ domain/                   # 模型、Zod、迁移（零 UI/IO 依赖）
│  ├─ table-engine/             # 行集、查询、导入、粘贴
│  ├─ chart-model/              # RenderModel、映射、采样
│  ├─ chart-echarts/            # 唯一依赖 echarts 的包
│  ├─ persistence/              # WorkspaceStore 端口 + memory 适配器
│  ├─ plugin-sdk/               # 插件清单、贡献点、宿主 API 类型
│  ├─ ui/                       # 设计令牌、基础组件
│  └─ app-core/                 # 用例、命令总线、状态
├─ plugins/
│  └─ plugin-sample/            # 内置示例插件（自定义字段类型 + 导入器）
├─ fixtures/                    # CSV/JSONL/工作区/旧版本夹具
├─ scripts/                     # 生成 10 万行数据、基准测试、打包冒烟
├─ release/                     # 安装包/portable/win-unpacked（gitignore）
├─ docs/                        # 本方案文档 + adr/
└─ AGENTS.md
```

## 6. 最终验收演示（必须一次通过）

1. 新建工作区 `Demo.cstudio`。
2. 建表 `温度记录`：列 `time(date, x)`、`sensor_a(number, y)`、`sensor_b(number, y)`、`site(text, series)`。
3. 粘贴 200 行数据；把类型错误的一行改对；确认错误提示与校验。
4. 应用 `builtin.report-light`，改密度、给 `sensor_a` 加"大于 30 标红"的条件格式；另存为 `我的报表`。
5. 新建折线图（宽表映射），切换长表映射；开启缩放、关闭图例、导出 PNG。
6. 新建第二张表导入 100,000 行 CSV；滚动表格与出图，采样徽标出现，交互仍在预算内。
7. 撤销 5 步、重做 3 步；自动保存后强杀进程，重开触发恢复，已提交数据不丢。
8. 重启应用 → 最近工作区 → 布局、样式、图表全部还原。
9. 导出样式模板，在新工作区导入并应用成功。

## 7. 文档变更规则

- `docs/SPEC.md` 是契约。改契约必须同时更新：受影响的 FR、`docs/TASKS.md` 验收项、`docs/TESTPLAN.md` 用例。
- 任何新增运行时依赖、格式版本升级、目录边界调整，都必须先加 ADR。
- 本文档只描述 v1；v2 设想放 `docs/ROADMAP.md`（实施完成后再建）。

# Architecture Decision Records

本目录存放 **ADR 文件**（`NNN-<slug>.md`）。`docs/DECISIONS.md` 记录 v1 已锁定的 16 条架构决策（ADR-001–016）；
从 ADR-017 起，新决策以独立文件形式追加，并在下方索引登记。

## 规则

1. 任何偏离 `docs/SPEC.md` 的模型、文件格式、IPC 通道或公共 API 变更，先写 ADR，再改 SPEC，最后改代码。
2. 编号连续递增，不复用、不删除；被推翻的 ADR 标记 `已取代（Superseded by ADR-NNN）`，保留原文。
3. 每篇 ADR 必须包含：状态、背景、决定、代价、影响、复核条件（可省略但建议）。
4. 新增运行时依赖前写 ADR，说明体积、维护成本与替代方案（AGENTS §4）。

## 模板

```md
# ADR-NNN 标题

- 状态：提议 / 已接受 / 已取代
- 日期：YYYY-MM-DD
- 相关：SPEC 章节、任务 ID、其他 ADR

## 背景
## 决定
## 代价
## 影响
## 复核条件
```

## 索引

| 编号 | 标题 | 状态 | 位置 |
|---|---|---|---|
| ADR-001 | 桌面壳采用 Electron | 已接受 | [DECISIONS.md#adr-001](../DECISIONS.md#adr-001) |
| ADR-002 | pnpm monorepo + 源码包 | 已接受 | [DECISIONS.md#adr-002](../DECISIONS.md#adr-002) |
| ADR-003 | 文件型工作区（目录 + JSONL） | 已接受 | [DECISIONS.md#adr-003](../DECISIONS.md#adr-003) |
| ADR-004 | 自建 RenderModel + ECharts 适配器 | 已接受 | [DECISIONS.md#adr-004](../DECISIONS.md#adr-004) |
| ADR-005 | TanStack Table + Virtual | 已接受 | [DECISIONS.md#adr-005](../DECISIONS.md#adr-005) |
| ADR-006 | Zustand + Immer + 命令总线 | 已接受 | [DECISIONS.md#adr-006](../DECISIONS.md#adr-006) |
| ADR-007 | Zod 统一边界校验 | 已接受 | [DECISIONS.md#adr-007](../DECISIONS.md#adr-007) |
| ADR-008 | 表结构 / 视图状态 / 外观三分离 | 已接受 | [DECISIONS.md#adr-008](../DECISIONS.md#adr-008) |
| ADR-009 | 条件格式使用安全谓词，禁止表达式执行 | 已接受 | [DECISIONS.md#adr-009](../DECISIONS.md#adr-009) |
| ADR-010 | 插件 v1 静态加载，动态加载后置 | 已接受 | [DECISIONS.md#adr-010](../DECISIONS.md#adr-010) |
| ADR-011 | 10 万行内存模型，SQLite 后置 | 已接受 | [DECISIONS.md#adr-011](../DECISIONS.md#adr-011) |
| ADR-012 | 公式列 / 多表关联 / SQL 不在 v1 | 已接受 | [DECISIONS.md#adr-012](../DECISIONS.md#adr-012) |
| ADR-013 | 轻量 i18n，不引入 i18next | 已接受 | [DECISIONS.md#adr-013](../DECISIONS.md#adr-013) |
| ADR-014 | 测试金字塔与 CI 门禁 | 已接受 | [DECISIONS.md#adr-014](../DECISIONS.md#adr-014) |
| ADR-015 | 存储类型与语义字段类型分离 | 已接受 | [DECISIONS.md#adr-015](../DECISIONS.md#adr-015) |
| ADR-016 | 无遥测、无网络、无自动更新（v1） | 已接受 | [DECISIONS.md#adr-016](../DECISIONS.md#adr-016) |
| ADR-017 | 将依赖边界检查纳入 pnpm lint | 已接受 | [017-lint-boundary-gate.md](017-lint-boundary-gate.md) |
| ADR-018 | 开发模式 CSP 为 React Fast Refresh 放宽 `script-src` | 已接受 | [018-dev-csp-react-refresh.md](018-dev-csp-react-refresh.md) |
| ADR-019 | 工作区原子写入采用 write-file-atomic | 已接受 | [019-write-file-atomic.md](019-write-file-atomic.md) |
| ADR-020 | workspace:create 的目录语义 | 已接受 | [020-workspace-create-path.md](020-workspace-create-path.md) |
| ADR-021 | 备份文件命名、轮转与恢复路径 | 已接受 | [021-backup-naming.md](021-backup-naming.md) |
| ADR-022 | 表数据缺文件语义与打开时 `rowCount` 重算 | 已接受 | [022-table-read-missing-file.md](022-table-read-missing-file.md) |
| ADR-023 | 脏表追踪原语放 `table-engine`，状态接线留 `app-core` | 已接受 | [023-dirty-table-tracking.md](023-dirty-table-tracking.md) |
| ADR-024 | 迁移框架的归属、备份与接线时点 | 已接受 | [024-migration-framework.md](024-migration-framework.md) |
| ADR-025 | app-core 的 Zustand/Immer 边界、状态切片与同步命令总线 | 已接受 | [025-app-core-state-and-command-bus.md](025-app-core-state-and-command-bus.md) |
| ADR-026 | 工作区崩溃恢复交互后置到 T5.3 | 已接受 | [026-lock-recovery-deferral.md](026-lock-recovery-deferral.md) |
| ADR-027 | T2.1 的命令、保存时机、目录选择与网格接线 | 已接受 | [027-t21-workspace-commands-and-grid.md](027-t21-workspace-commands-and-grid.md) |
| ADR-028 | T2.2 的单元格编辑、结构化校验、最小撤销与即时保存 | 已接受 | [028-t22-cell-editing-and-save.md](028-t22-cell-editing-and-save.md) |
| ADR-029 | T2.3 的列管理、结构变更、运行期迁移与破坏性确认 | 已接受 | [029-t23-column-management-and-structure.md](029-t23-column-management-and-structure.md) |
| ADR-030 | T2.4 的区域粘贴、批量命令、取消与新增列 | 已接受 | [030-t24-region-paste.md](030-t24-region-paste.md) |
| ADR-031 | T2.5 的 CSV/JSON 导入、字节传输、工作线程与原始文件归档 | 已接受 | [031-t25-csv-json-import.md](031-t25-csv-json-import.md) |
| ADR-032 | T2.6 的筛选、排序、视图状态、查询 Worker 与可见行粘贴 | 已接受 | [032-t26-filter-sort-view-state.md](032-t26-filter-sort-view-state.md) |
| ADR-033 | T2.7 的性能门禁、基准口径、内存测量与三处热路径优化 | 已接受 | [033-t27-performance-gates.md](033-t27-performance-gates.md) |
| ADR-034 | T3.1 的表格样式模型、内置模板与 fork 语义 | 已接受 | [034-t31-table-style-model.md](034-t31-table-style-model.md) |
| ADR-035 | T3.2 的样式渲染管线、数字格式归属与视觉验证 | 已接受 | [035-t32-style-rendering.md](035-t32-style-rendering.md) |
| ADR-036 | T3.3 的条件求值器归属、比较语义、样式优先级与撤销 | 已接受 | [036-t33-conditional-format.md](036-t33-conditional-format.md) |
| ADR-037 | T3.4 的样式编辑器、懒 fork、预览与提交粒度 | 已接受 | [037-t34-style-editor.md](037-t34-style-editor.md) |
| ADR-038 | T3.5 的模板 CRUD、删除回退、导入导出与身份重分配 | 已接受 | [038-t35-template-management.md](038-t35-template-management.md) |
| ADR-039 | T3.6 的 CSV 导出、流式 IPC、原始/显示值与文件名 | 已接受 | [039-t36-csv-export.md](039-t36-csv-export.md) |
| ADR-040 | T4.1 的 RenderModel、宽/长表映射、调色板与空值口径 | 已接受 | [040-t41-render-model.md](040-t41-render-model.md) |
| ADR-041 | T4.2 的 LTTB 采样、共享 X 轴对齐与缺失值语义 | 已接受 | [041-t42-lttb-sampling.md](041-t42-lttb-sampling.md) |
| ADR-042 | T4.3 的 ECharts 依赖、按需注册、option 映射与渲染器生命周期 | 已接受 | [042-t43-echarts-adapter.md](042-t43-echarts-adapter.md) |
| ADR-043 | T4.4 的图表命令、检查器、RenderModel 扩展与渲染更新策略 | 已接受 | [043-t44-chart-creation-inspector.md](043-t44-chart-creation-inspector.md) |
| ADR-044 | T4.5 的图表交互、空态、PNG 导出与无障碍摘要 | 已接受 | [044-t45-chart-interaction-export.md](044-t45-chart-interaction-export.md) |
| ADR-045 | T4.6 的图表解析拆分、数据缓存、延迟解析与性能门禁 | 已接受 | [045-t46-chart-performance.md](045-t46-chart-performance.md) |
| ADR-046 | T5.1 的递归分栏、活动 pane、标签移动、布局恢复与保存去抖 | 已接受 | [046-t51-split-layout.md](046-t51-split-layout.md) |
| ADR-047 | T5.2 的全命令撤销、256MB 门槛、瞬态布局与 Edit 菜单 | 已接受 | [047-t52-undo-redo.md](047-t52-undo-redo.md) |
| ADR-048 | T5.3 的自动保存窗口、退出握手、锁/清单恢复与最近列表 | 已接受 | [048-t53-autosave-recovery.md](048-t53-autosave-recovery.md) |
| ADR-049 | T5.4 的键位注册表、作用域、冲突判定与命令面板 | 已接受 | [049-t54-keymap-command-palette.md](049-t54-keymap-command-palette.md) |
| ADR-050 | T5.5 的应用程序设置、自动保存开关与国际化收口 | 已接受 | [050-t55-settings-i18n.md](050-t55-settings-i18n.md) |
| ADR-051 | 产品更名为 Curve Almanac，默认目录与用户数据路径随之变更 | 已接受 | [051-brand-rename-curve-almanac.md](051-brand-rename-curve-almanac.md) |

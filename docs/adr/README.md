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

# DECISIONS — 已锁定架构决策

> 每条决策在 v1 内**不再讨论**，除非触发"复核条件"。
> 新增/推翻决策必须追加 ADR 并更新 `docs/SPEC.md`，不得只改代码。

<a id="adr-001"></a>
## ADR-001 桌面壳采用 Electron

- 状态：已接受（v1）
- 决策：Electron + electron-vite + electron-builder，不采用 Tauri。
- 理由：全 TypeScript，主/渲染进程与 DSH 的 Node 工具链一致；Playwright 可直接驱动 Electron 做 E2E；`write-file-atomic`、`electron-log` 等文件/日志能力成熟。
- 代价：安装包约 100MB+，内存高于 Tauri；需要自己处理 IPC 安全。
- 复核条件：安装包体积/内存成为用户主要投诉，且 Tauri 的 WebView 兼容性验证通过。
- 实现备注（T0.2，2026-10-20）：实际版本 Electron **44.9.0**、electron-vite **6.0.0**、
  electron-builder **26.15.3**（T6.4 才打包）、React / React DOM **19.3.1**、Vite **8.3.4**
  （Vite 8 = rolldown 内核，构建配置使用 `build.rolldownOptions`）、`@vitejs/plugin-react` **6.1.2**、
  Playwright **1.64.1**、jsdom **30.1.3**。以 `pnpm-lock.yaml` 为准。
  main 与 preload 均输出 CJS（`out/main/index.cjs`、`out/preload/index.cjs`）；开发模式 CSP 的
  放宽项见 ADR-018。

<a id="adr-002"></a>
## ADR-002 pnpm monorepo + 源码包

- 状态：已接受（v1）
- 决策：pnpm workspace；内部包 `exports` 指向 `src/index.ts`，不单独构建；electron-vite/Vitest 统一编译。
- 理由：避免多包构建编排与 `dist` 同步问题；依赖边界仍可用 dependency-cruiser 强制。
- 代价：包不能单独发布；IDE 需正确解析路径别名。
- 复核条件：需要把 `domain`/`plugin-sdk` 发布为独立 npm 包时，改为构建产物 + `exports` 条件。
- 实现备注（T0.1，2026-10-19）：实际安装 pnpm 11.28.5、Node 24.21.0、TypeScript 5.9.3、ESLint 9.39.5、Vitest 5.0.5、Vite 8.3.4、dependency-cruiser 18.6.0；以 `pnpm-lock.yaml` 为准。ESLint 9 为 TASKS 指定的主版本；npm 已标记 9.x 停止支持，升级到 10 需先评估 `eslint-plugin-import` 的 peer 约束。

<a id="adr-003"></a>
## ADR-003 文件型工作区（目录 + JSONL）

- 状态：已接受（v1）
- 决策：工作区是一个目录：`manifest.json` + `tables/*.jsonl` + `backups/`；不使用 SQLite，不做单文件 zip。
- 理由：零原生依赖、可 diff/备份/手工修复；JSONL 流式解析、追加友好；崩溃恢复只需替换单表文件。
- 代价：跨表查询/聚合弱；10 万行以上需 SQLite 适配器；分享需打包目录。
- 复核条件：单工作区稳定超过 30 万行，或需要 join/聚合；届时实现 `WorkspaceStore` 的 SQLite 适配器，格式升级走迁移。
- 备注：单文件导出 `.cstudio.zip` 放入 v2 路线，不影响 v1 格式。

<a id="adr-004"></a>
## ADR-004 自建 RenderModel + ECharts 适配器

- 状态：已接受（v1）
- 决策：`chart-model` 产出与库无关的 `RenderModel`；`chart-echarts` 是唯一允许 import ECharts 的包。
- 理由：图表逻辑可单测、可换库、可复用于 PNG/表格内嵌图；避免 ECharts option 渗入业务。
- 代价：多一层映射代码；ECharts 高级特性需要显式建模。
- 复核条件：需要 ECharts 未覆盖的交互，或切换 uPlot 以获得更高性能。

<a id="adr-005"></a>
## ADR-005 TanStack Table + Virtual

- 状态：已接受（v1）
- 决策：headless 表格 + 虚拟滚动，自建单元格/编辑器/选择层。
- 理由：完全控制外观与交互，满足"自定义表格外观"；无 AG Grid 的许可与体积负担。
- 代价：选择、复制、无障碍等交互需要自己实现与测试。
- 复核条件：需要透视/分组/聚合等企业级表格能力，且自研成本超过 AG Grid 许可成本。

<a id="adr-006"></a>
## ADR-006 Zustand + Immer + 命令总线

- 状态：已接受（v1）
- 决策：文档状态进 Zustand；所有变更经命令总线；Immer `produceWithPatches` 产出正/逆 patches 支撑撤销。
- 理由：轻量、无 Provider 嵌套；patches 让撤销/重做与审计统一；便于未来 AI 操作走同一入口。
- 代价：命令层增加样板；大数组需按行克隆，不能整表深拷贝。
- 复核条件：需要跨窗口/协作同步，升级为 CRDT 或事件溯源。

<a id="adr-007"></a>
## ADR-007 Zod 统一边界校验

- 状态：已接受（v1）
- 决策：manifest、JSONL 行、IPC 载荷、模板导入、导入器输出全部用 Zod 校验；类型从 schema 推导。
- 理由：不可信输入多（用户文件、剪贴板、插件），一处校验多处复用。
- 代价：schema 与手写类型需保持同步（用 `z.infer` 避免重复）。
- 复核条件：Zod 成为性能瓶颈（大表逐行校验）时，热路径改为手写校验 + 抽样 Zod。

<a id="adr-008"></a>
## ADR-008 表结构 / 视图状态 / 外观三分离

- 状态：已接受（v1）
- 决策：`TableMeta`（schema）、`TableViewState`（排序/筛选/列宽/样式引用）、`TableStyle`（令牌/覆盖/条件格式）三者独立持久化。
- 理由：改样式/筛选不应触发 schema 迁移；同一张表可多视图；样式可复用为模板。
- 代价：加载时需校验三者引用完整性；删除列要处理样式覆盖与图表映射。
- 复核条件：无。

<a id="adr-009"></a>
## ADR-009 条件格式使用安全谓词，禁止表达式执行

- 状态：已接受（v1）
- 决策：条件格式/筛选统一用 `FilterPredicate` AST；操作符白名单；不使用 `eval`/`new Function`/公式引擎。
- 理由：用户数据不可信；表达式执行带来安全与性能风险；白名单足够覆盖 v1 场景。
- 代价：复杂条件（跨列算术）无法表达。
- 复核条件：需要公式列时，引入受限 AST 求值器（非 JS eval）并单独 ADR。

<a id="adr-010"></a>
## ADR-010 插件 v1 静态加载，动态加载后置

- 状态：已接受（v1）
- 决策：插件随应用编译；通过 `PluginDefinition` + 注册表激活；v1 不支持运行时下载/加载第三方代码。
- 理由：动态代码加载需要签名、沙箱、权限模型，v1 做不完；先把贡献点契约和隔离做对。
- 代价：用户不能自行安装插件；示例插件只能编译进包。
- 复核条件：有真实第三方插件需求，且完成权限声明/签名/沙箱设计。

<a id="adr-011"></a>
## ADR-011 10 万行内存模型，SQLite 后置

- 状态：已接受（v1）
- 决策：整表加载进 renderer 内存；解析/排序/筛选在 Worker；持久化仍写文件。
- 理由：v1 目标 10 万行，内存与交互可接受；实现简单，避免数据库 schema 与迁移复杂度。
- 代价：30 万行以上内存压力大；无法做跨表查询。
- 复核条件：性能预算被突破，或用户数据规模稳定超过 30 万行。

<a id="adr-012"></a>
## ADR-012 公式列 / 多表关联 / SQL 不在 v1

- 状态：已接受（v1）
- 决策：三类能力全部后置；v1 只做单表、只读派生（图表映射），不提供计算列。
- 理由：三者都会引入表达式求值、依赖图、查询计划与迁移复杂度，侵蚀 v1 的核心体验。
- 代价：部分用户仍需在 Excel 预处理。
- 复核条件：核心表格/图表体验稳定，且有明确用户需求；届时先做受限公式列，再做 join。

<a id="adr-013"></a>
## ADR-013 轻量 i18n，不引入 i18next

- 状态：已接受（v1）
- 决策：`messages/zh-CN.ts` + `en-US.ts` + 类型化 `t(key, params)`；不引入运行时 i18n 库。
- 理由：v1 只有两种语言、无复数/命名空间复杂度；减少依赖与包体。
- 代价：复杂插值/复数需自己实现；语言包不能动态下载。
- 复核条件：语言数 ≥ 5 或需要按需加载语言包。

<a id="adr-014"></a>
## ADR-014 测试金字塔与 CI 门禁

- 状态：已接受（v1）
- 决策：纯逻辑单测（Vitest）→ 契约/集成（Vitest + 临时目录）→ E2E（Playwright + Electron）→ 基准（bench 脚本）；CI 矩阵为 Windows/macOS/Ubuntu，E2E 仅 Windows。
- 理由：UI 与文件系统 bug 成本高；纯逻辑必须快测，E2E 只覆盖关键路径。
- 代价：E2E 在 CI 较慢；Electron 打包后才能跑。
- 复核条件：E2E 超过 15 分钟，拆分 smoke/full 两档。

<a id="adr-015"></a>
## ADR-015 存储类型与语义字段类型分离

- 状态：已接受（v1）
- 决策：`ColumnDef.type` 只允许 5 种存储类型；插件通过 `fieldTypeId` 提供语义类型，且 `FieldTypeDef.storageType` 必须匹配。
- 理由：JSONL 的物理形态必须稳定可迁移；插件只扩展解析/校验/格式化，不扩展存储格式。
- 代价：自定义字段类型不能引入新的 Cell 形态；复杂类型需编码为 text/number。
- 复核条件：需要新物理类型（如 Decimal/JSON）时，升级 `formatVersion` 并写迁移。

<a id="adr-016"></a>
## ADR-016 无遥测、无网络、无自动更新（v1）

- 状态：已接受（v1）
- 决策：应用不发起网络请求；不集成分析/崩溃上报；关闭自动更新。
- 理由：数据敏感是产品前提；v1 没有服务端与签名体系。
- 代价：问题定位依赖本地日志；版本更新靠手动下载。
- 复核条件：引入云功能或正式发布渠道时，单独做隐私/更新 ADR。

# Curve Almanac v1 规格说明（Normative）

<a id="0"></a>
## 0. 元信息

| 项 | 值 |
|---|---|
| 文档版本 | 1.0 |
| 状态 | 已锁定，可执行 |
| 适用产品 | Curve Almanac v1（PC 桌面；2026-10-29 由 Curve Studio 更名，见 ADR-051） |
| 规范性关键词 | **必须** = MUST，**应当** = SHOULD，**可以** = MAY |
| 冲突处理 | 本文与 `AGENTS.md` 冲突时，安全/数据条款以 `AGENTS.md` 为准，其余以本文为准 |

本文是实现的唯一契约。任何偏离都必须先写 ADR（`docs/adr/NNN-*.md`）并更新本文。

---

<a id="1"></a>
## 1. 产品定义

Curve Almanac 是一个**本地优先、单机离线**的桌面数据可视化工具。用户用"自定义表格"承载数据，用"曲线视图"理解数据。

### 1.1 目标用户

- 需要快速查看传感器/实验/运营时序数据的工程师与分析师。
- 不想写 SQL、不想配置 BI 平台，但需要比 Excel 更稳定的数据结构与图表联动。
- 数据敏感，不能上传云端。

### 1.2 核心用户故事

| ID | 故事 |
|---|---|
| US-1 | 我想新建一张表，自己决定有哪些列、每列是什么类型、哪列是 X、哪些列画成曲线 |
| US-2 | 我想从 Excel 粘贴或 CSV 导入数据，类型不对的地方要明确告诉我，而不是悄悄变成字符串 |
| US-3 | 我想把表格做成适合汇报的样子（密度、颜色、数字格式、条件标红），保存成模板复用到别的表 |
| US-4 | 我想同一份数据切换宽表/长表两种画法，缩放、看提示、导出图片 |
| US-5 | 我想关掉软件再打开，数据、布局、样式、图表都还在；崩溃了也别丢 |

### 1.3 非目标（v1 明确不做）

实时数据流、云同步、多人协作、账号体系、SQL 查询、公式列、多表 join、透视表、3D 图、移动端、插件市场、自动更新。

---

<a id="2"></a>
## 2. 范围

### 2.1 v1 必须交付

- 工作区：新建/打开/保存/最近打开/自动保存/崩溃恢复。
- 自定义表结构：5 种内置列类型、列角色、主键、单位/精度、枚举选项、必填校验。
- 表格数据：网格编辑、区域粘贴、CSV/JSON 导入向导、筛选/排序、CSV 导出。
- 自定义表格外观：令牌编辑、列级覆盖、条件格式、内置模板、用户模板 CRUD、模板导入导出、实时预览。
- 图表：折线/散点/柱状；宽表/长表映射；缩放/图例/提示；PNG 导出；10 万点采样。
- 工程：插件 SDK v1（静态插件）、示例插件、迁移框架、E2E、性能基准、安装包。

### 2.2 规模与边界

| 项 | v1 目标 | 超限行为 |
|---|---|---|
| 单表行数 | 目标 ≤ 100,000；硬上限 200,000 | 100,000–200,000 导入前提示；超过 200,000 拒绝新增/导入 |
| 工作区总行数 | 软上限 300,000 | 提示；不硬性阻止 |
| 列数/表 | ≤ 100 | 拒绝新增 |
| 表数/工作区 | ≤ 20 | 拒绝新增 |
| 图表数/工作区 | ≤ 50 | 拒绝新增 |
| 系列数/图 | ≤ 20 | 超出部分不渲染并警告 |
| 单元格文本 | ≤ 100,000 字符 | 拒绝写入并报错 |
| 表文件 | ≤ 256 MB | 拒绝打开并报错 |

---

<a id="3"></a>
## 3. 术语

| 术语 | 含义 |
|---|---|
| 工作区 Workspace | 一个本地目录（`*.cstudio`），包含 manifest、表数据、备份 |
| 表 Table | 一份带 schema 的二维数据；由 `TableMeta` + `Row[]` 组成 |
| 列 Column | 有稳定 ID 的字段定义；持久化引用只用 ID |
| 视图 View | 主区域里的一个标签页，指向一张表或一张图 |
| 表格视图状态 TableViewState | 排序、筛选、列宽、隐藏、冻结、样式引用；不属于表结构 |
| 表格样式 TableStyle | 外观令牌 + 列覆盖 + 条件格式；可保存为模板 |
| 图表 Chart | 引用一张表 + 映射 + 选项的曲线定义 |
| RenderModel | 与图表库无关的渲染中间模型 |
| 贡献点 Contribution | 插件注册的字段类型/导入器/图表类型/命令 |
| 命令 Command | 对文档状态的一次可撤销变更 |

---

<a id="4"></a>
## 4. 架构与依赖规则

### 4.1 分层

```
┌──────────────────────── apps/desktop ────────────────────────┐
│ main（Node/TS）：窗口、菜单、文件、IPC、备份、日志            │
│ preload：contextBridge 白名单 API                            │
│ renderer（React）：Shell / Grid / Chart / Inspector          │
└───────────────▲──────────────────────────────▲───────────────┘
                │                              │
┌───────────────┴──────────────┐  ┌────────────┴──────────────┐
│ packages/app-core            │  │ packages/chart-echarts    │
│ 用例、命令总线、撤销、状态     │  │ 唯一 echarts 依赖          │
└───────▲──────────────▲───────┘  └────────────▲──────────────┘
        │              │                       │
┌───────┴──────┐ ┌─────┴────────┐ ┌────────────┴──────────────┐
│ domain       │ │ table-engine │ │ chart-model               │
│ 模型/校验/迁移│ │ 行集/查询/导入│ │ RenderModel/映射/采样      │
└───────▲──────┘ └──────▲───────┘ └────────────▲──────────────┘
        │               │                      │
┌───────┴───────────────┴──────────────────────┴──────────────┐
│ persistence（端口 + memory 适配器）  plugin-sdk（类型/注册表）│
└──────────────────────────────────────────────────────────────┘
```

### 4.2 允许的依赖

| 包 | 可以依赖 | 禁止依赖 |
|---|---|---|
| `@curve/domain` | `zod` | React、Electron、ECharts、Zustand、fs、任何其他 `@curve/*` |
| `@curve/table-engine` | domain、papaparse（Worker 侧的编码/文件读写在上层） | React、Electron、ECharts |
| `@curve/chart-model` | domain、table-engine | ECharts、React、Electron |
| `@curve/chart-echarts` | chart-model、echarts | app-core、React、Electron |
| `@curve/persistence` | domain | Electron、React、app-core |
| `@curve/plugin-sdk` | domain（仅类型） | app-core、React、Electron、ECharts |
| `@curve/app-core` | domain、table-engine、chart-model、persistence、plugin-sdk、zustand、immer | React、Electron、ECharts |
| `@curve/ui` | React、domain 类型 | app-core、persistence、Electron |
| `@curve/desktop` | 全部 | — |
| `plugins/*` | plugin-sdk、domain 公开类型 | 任何应用内部路径 |

> T2.5 实现边界（ADR-031）：`@curve/table-engine` 只新增 `papaparse` 运行时依赖；GBK/
> GB18030 解码使用 renderer Worker 的平台 `TextDecoder`，不引入 `jschardet`/`iconv-lite`
> 运行时依赖。`iconv-lite` 仅作为 devDependency 供 `scripts/gen-100k.ts` 生成 GBK 夹具。

### 4.3 强制边界（T0.1 写入 dependency-cruiser）

1. 禁止循环依赖。
2. `domain` 不得出现 `react|electron|echarts|zustand|node:fs`。
3. `chart-model` 不得出现 `echarts`。
4. `persistence` 不得出现 `electron`。
5. `ui` 不得出现 `app-core|persistence`。
6. `plugins/*` 不得出现 `apps/|packages/(?!plugin-sdk|domain)`。
7. 跨包只能从包根导入（禁止 `@curve/domain/src/...`）。

违反边界 = CI 失败，不得用注释豁免。

---

<a id="5"></a>
## 5. 技术栈与版本策略

### 5.1 运行时与工具

| 类别 | 选择 | 版本策略 |
|---|---|---|
| 运行时 | Node.js | ≥ 20.11，`engines` 锁定 |
| 包管理 | pnpm | ≥ 9，`packageManager` 锁定 |
| 桌面壳 | Electron | 安装时最新 stable，锁定精确版本 |
| 构建 | electron-vite + Vite | 与 Electron 模板兼容的主版本 |
| UI | React + TypeScript | React 18+；TS ≥ 5.6 |
| 状态 | Zustand + Immer | 主版本锁定 |
| 校验 | Zod | 主版本锁定 |
| 表格 | TanStack Table + Virtual | 主版本锁定 |
| 图表 | ECharts | 主版本锁定，按需引入 |
| CSV | Papa Parse | 主版本锁定 |
| 原子写 | write-file-atomic | 仅 main 进程 |
| 日志 | electron-log | 仅 main 进程 |
| 打包 | electron-builder | 主版本锁定 |
| 测试 | Vitest + Testing Library + Playwright | 主版本锁定 |
| 质量 | ESLint 9 flat + typescript-eslint + Prettier + dependency-cruiser | — |

所有版本以 `pnpm-lock.yaml` 为准；首次安装后把实际版本补进对应 ADR 的备注（桌面壳 → ADR-001，工具链 → ADR-002）。**不得**在未写 ADR 的情况下新增运行时依赖。

### 5.2 根 `package.json` 脚本契约

```jsonc
{
  "name": "curve-studio",
  "private": true,
  "packageManager": "pnpm@<锁定版本>",
  "engines": { "node": ">=20.11" },
  "scripts": {
    "dev": "pnpm --filter @curve/desktop dev",
    "build": "pnpm --filter @curve/desktop build",
    "package": "pnpm build && pnpm --filter @curve/desktop package",
    "package:smoke": "tsx scripts/package-smoke.ts",
    "lint": "eslint . --max-warnings=0 && pnpm lint:boundaries",
    "lint:boundaries": "depcruise apps packages --config .dependency-cruiser.cjs",
    "typecheck": "tsc -b --pretty false",
    "test": "vitest run",
    "test:watch": "vitest",
    "e2e": "pnpm build && playwright test",
    "bench": "tsx scripts/bench.ts",
    "verify": "pnpm lint && pnpm typecheck && pnpm test"
  }
}
```

> `lint` 同时执行 ESLint 与 dependency-cruiser（ADR-017）；`plugins/*` 目录在 T6.2 创建后加入扫描路径。
> `package` 在 T6.4 落地（ADR-055）：先 `build`，再由 `apps/desktop` 的 electron-builder 产出
> `release/`；`package:smoke` 是真实安装/启动/卸载冒烟，不进 `verify`（会写系统安装）。

### 5.3 内部包是源码包

- 每个 `packages/*` 的 `package.json`：`"private": true`、`"type": "module"`、`"exports": { ".": "./src/index.ts" }`。
- 不单独 `build`；由 electron-vite / Vitest 通过 `vite-tsconfig-paths` 解析。
- 根 `tsconfig.base.json` 定义 `@curve/*` 路径映射与 strict 选项；各包 `tsconfig.json` 继承它。
- `apps/desktop` 的 main/preload 用 CJS 输出，保证 `sandbox: true` 的 preload 可加载；renderer 用 ESM。

---

<a id="6"></a>
## 6. 数据模型

### 6.1 基础类型

```ts
// packages/domain/src/types.ts
export type Cell = number | string | boolean | null;

export type BuiltinColumnType = 'number' | 'text' | 'date' | 'boolean' | 'enum';
export type ColumnType = BuiltinColumnType;        // v1 存储层允许的集合
export type ColumnRole = 'x' | 'y' | 'series' | 'label' | 'none';
export type CompareOp =
  | 'eq' | 'neq' | 'gt' | 'gte' | 'lt' | 'lte'
  | 'contains' | 'startsWith' | 'endsWith' | 'between' | 'isNull' | 'notNull';

export interface EnumOption { value: string; label: string }

export interface ColumnDef {
  id: string;                  // "col_<uuid>"
  key: string;                 // ^[A-Za-z_][A-Za-z0-9_]*$，表内唯一
  label: string;               // 1..80 字符
  type: ColumnType;            // 存储类型（决定 Cell 的物理形态）
  fieldTypeId?: string;        // 语义类型；默认等于 type，可指向插件字段类型
  role: ColumnRole;
  unit?: string;               // ≤ 16 字符
  precision?: number;          // 0..10
  enumOptions?: EnumOption[];  // type=enum 时必填，1..100 项
  required?: boolean;
  width?: number;              // 80..800
}
```

### 6.2 表、行、视图

```ts
export interface TableMeta {
  id: string;                  // "tbl_<uuid>"
  name: string;                // 1..80 字符，工作区内可重名但 UI 警告
  file: string;                // 相对路径 "tables/tbl_xxx.jsonl"
  schemaVersion: number;       // 当前为 1
  columns: ColumnDef[];
  primaryKey: string;          // 列 ID；必须 text 类型
  rowCount: number;            // 提示值，加载时重算
  createdAt: string;           // ISO 8601
  updatedAt: string;
}

export interface Row {
  id: string;                  // "row_<uuid>"
  values: Cell[];              // length === columns.length
}

export interface SortSpec { columnId: string; direction: 'asc' | 'desc' }

export type FilterPredicate =
  | { kind: 'all' | 'any'; children: FilterPredicate[] }   // 1..20 子项
  | { kind: 'compare'; columnId: string; op: CompareOp; value?: Cell; value2?: Cell };

export interface TableViewState {
  tableId: string;
  styleId: string;             // "builtin.report-light" 或 "sty_<uuid>"
  columnOrder: string[];
  widths: Record<string, number>;
  hiddenColumnIds: string[];
  sort: SortSpec[];
  filter?: FilterPredicate;
  frozenColumnCount: number;   // 0..3
}

export type ViewKind = 'table' | 'chart';

export interface ViewDef {
  id: string;                  // "viw_<uuid>"
  kind: ViewKind;
  refId: string;               // tableId 或 chartId
  title: string;
  tableView?: TableViewState;  // kind=table 时必填
}
```

### 6.3 图表

```ts
export type ChartKind = 'line' | 'scatter' | 'bar';

export type ChartMapping =
  | { layout: 'wide'; xColumnId: string; yColumnIds: string[] }        // 每列一条线
  | { layout: 'long'; xColumnId: string; seriesColumnId: string; yColumnId: string };

export interface ChartOptions {
  smooth: boolean;
  showSymbol: boolean;
  lineWidth: number;           // 1..6
  paletteId: 'default' | 'muted' | 'vivid' | 'colorblind';
  background: 'auto' | 'light' | 'dark';
  showGrid: boolean;
  legend: 'top' | 'right' | 'bottom' | 'none';
  xLabel?: string;
  yLabel?: string;
  yStartAtZero: boolean;
  numberDigits: number;        // 0..6
  sampling: { enabled: boolean; threshold: number; target: number };
}

export interface ChartSpec {
  id: string;                  // "cht_<uuid>"
  title: string;
  kind: ChartKind;
  tableId: string;
  mapping: ChartMapping;
  filter?: FilterPredicate;
  sort: SortSpec[];
  options: ChartOptions;
  version: 1;
  createdAt: string;
  updatedAt: string;
}
```

### 6.4 表格外观

```ts
export type Density = 'compact' | 'normal' | 'comfortable';
export type GridMode = 'none' | 'horizontal' | 'all';

export interface TableStyleTokens {
  density: Density;
  fontFamily: string;          // 默认 "system-ui"
  fontSize: number;            // 11..18
  header: { background: string; foreground: string; bold: boolean; borderColor: string };
  body: {
    background: string;
    alternateBackground: string;
    foreground: string;
    borderColor: string;
    grid: GridMode;
  };
  selection: { background: string; foreground: string };
  radius: number;              // 0..12
  cellPaddingX: number;        // 4..24
  cellPaddingY: number;        // 2..16
  zebra: boolean;
}

export interface ColumnStyleOverride {
  label?: string;
  width?: number;              // 80..800
  align?: 'left' | 'center' | 'right';
  numberFormat?: { style: 'decimal' | 'percent' | 'currency'; digits: number; currency?: string };
  dateFormat?: 'date' | 'date-time' | 'time' | 'iso';
  cellRender?: 'auto' | 'text' | 'number' | 'date' | 'badge' | 'bar';
}

export interface ConditionalRule {
  id: string;                  // "rule_<uuid>"
  enabled: boolean;
  label?: string;
  target: { kind: 'row' } | { kind: 'cell'; columnId: string };
  when: FilterPredicate;
  style: {
    background?: string;
    foreground?: string;
    bold?: boolean;
    italic?: boolean;
    icon?: 'up' | 'down' | 'warning';
  };
}

export interface TableStyle {
  id: string;                  // "sty_<uuid>"；内置为 "builtin.*"
  name: string;
  builtin: boolean;
  tokens: TableStyleTokens;
  columnOverrides: Record<string, ColumnStyleOverride>;
  conditionalRules: ConditionalRule[];  // ≤ 50，按数组顺序，首条命中生效
}
```

### 6.5 工作区

```ts
export type LayoutNode =
  | { type: 'pane'; viewIds: string[]; activeViewId: string | null }
  | {
      type: 'split';
      direction: 'horizontal' | 'vertical';
      ratio: number;           // 0.2..0.8
      first: LayoutNode;
      second: LayoutNode;
    };

export interface WorkspaceSettings {
  theme: 'system' | 'light' | 'dark';
  locale: 'zh-CN' | 'en-US';
  defaultTableStyleId: string;
  autosave: boolean;
}

export interface WorkspaceManifest {
  formatVersion: 1;
  id: string;                  // "ws_<uuid>"
  name: string;
  appVersion: string;          // 最后写入的应用版本
  createdAt: string;
  updatedAt: string;
  tables: TableMeta[];
  charts: ChartSpec[];
  views: ViewDef[];
  tableStyles: TableStyle[];   // 仅用户样式；内置样式不入库
  layout: LayoutNode;
  settings: WorkspaceSettings;
}
```

### 6.6 不变量（加载与保存都必须校验）

1. `columns[].id` 全局唯一；`key` 表内唯一；`primaryKey` 指向存在的 text 列。
2. `row.values.length === columns.length`；每个值类型匹配列类型或为 `null`；`primaryKey` 非空且唯一。
2a. `fieldTypeId` 必须能解析：缺省视为 `type`；解析出的 `FieldTypeDef.storageType` 必须等于 `column.type`，否则拒绝加载。
3. `views[].refId` 必须存在；`kind=table` 时 `tableView.tableId === refId`。
4. `charts[].tableId` 必须存在（删除表时级联删除图表与视图）；映射引用的列允许暂时缺失，但加载后必须标记为 invalid 并显示可重新映射的错误态，不得崩溃。
5. `layout` 中 `viewIds` 必须存在；每个 view 至多出现在一个 pane；pane 数 ≤ 4。
6. `tableStyles[].id` 唯一且不以 `builtin.` 开头，持久化样式的 `builtin` 必须为 `false`；
   `styleId` 与工作区 `settings.defaultTableStyleId` 必须可解析，否则回退默认并警告。
7. `columnOrder` 必须包含所有列 ID 恰好一次；`widths` 的键与 `sort`/`filter` 引用的列必须存在；`columnOverrides` 允许包含目标表不存在的列（跨表模板），求值时忽略。
8. 时间戳必须是可解析的 ISO 8601；`schemaVersion`/`formatVersion` 必须是已知值。

违反不变量时：加载阶段能修复的修复并记 `warnings`；不能修复的拒绝打开并返回 `E_WS_INVALID_MANIFEST`。

**实现边界（T5.1，ADR-046）**：第 5 条的 layout 是“加载阶段可修复”的：引用缺失/重复、
比例越界、结构非法或 pane 数 >4 时，`parseManifestDocument` 用 `views[]` 重建单 pane
（保留全部视图与顺序），记 `layout was invalid; restored a single pane with N view(s)`
warning 后继续打开；其它不变量仍按上一行规则拒绝。保存路径仍用严格校验，不静默修复。

---

<a id="7-工作区文件格式"></a>
## 7. 工作区文件格式

### 7.1 目录布局

```
Demo.cstudio/
├─ manifest.json                 # 唯一入口，最后写入
├─ tables/
│  ├─ tbl_<uuid>.jsonl
│  └─ ...
├─ backups/
│  ├─ tbl_<uuid>.<timestamp>.jsonl.bak
│  └─ manifest.<timestamp>.json.bak
├─ imports/                      # 原始导入文件副本（可选，≤ 50MB/个）
├─ .lock                         # 运行期锁
└─ .trash/                       # 删除的表先移到这里，24h 后可清
```

- 所有路径必须相对工作区根；manifest 中不得出现 `..` 或绝对路径。
- `<timestamp>` 是 UTC 紧凑格式 `YYYYMMDDTHHmmssSSSZ`（见 ADR-021）。
- 每个表保留最近 3 份备份，manifest 同样保留 3 份；打开工作区时清理 7 天前的备份。
- 删除表 = 移入 `.trash/` 并更新 manifest；不直接 `unlink`。

### 7.2 `manifest.json` 示例

```jsonc
{
  "formatVersion": 1,
  "id": "ws_1f0c...",
  "name": "Demo",
  "appVersion": "1.0.0",
  "createdAt": "2026-01-01T00:00:00.000Z",
  "updatedAt": "2026-01-01T00:10:00.000Z",
  "tables": [
    {
      "id": "tbl_9a2e...",
      "name": "温度记录",
      "file": "tables/tbl_9a2e....jsonl",
      "schemaVersion": 1,
      "columns": [
        { "id": "col_time", "key": "time", "label": "时间", "type": "date", "role": "x" },
        { "id": "col_a", "key": "sensor_a", "label": "传感器 A", "type": "number", "role": "y", "unit": "°C", "precision": 1 }
      ],
      "primaryKey": "col_time",
      "rowCount": 200,
      "createdAt": "2026-01-01T00:00:00.000Z",
      "updatedAt": "2026-01-01T00:10:00.000Z"
    }
  ],
  "charts": [],
  "views": [],
  "tableStyles": [],
  "layout": { "type": "pane", "viewIds": [], "activeViewId": null },
  "settings": {
    "theme": "system",
    "locale": "zh-CN",
    "defaultTableStyleId": "builtin.report-light",
    "autosave": true
  }
}
```

### 7.3 行数据 JSONL

- 一行一个 JSON 对象：`{"id":"row_<uuid>","v":[...]}`。
- UTF-8 无 BOM；`\n` 分隔；文件末尾保留换行；空表为 0 字节。
- `v` 的顺序严格对应 `columns` 顺序；不允许对象键值形式。
- 数字必须是有限数；日期是 epoch ms 整数；布尔是 `true/false`；空值是 `null`。
- 单行 ≤ 8MB；超限拒绝导入并给出行号。

示例：

```jsonl
{"id":"row_001","v":[1735689600000,21.5]}
{"id":"row_002","v":[1735689660000,23.1]}
```

### 7.4 原子写入

main 进程必须使用 `write-file-atomic`：

1. 写临时文件并 `fsync`。
2. 将旧文件复制到 `backups/`：表为 `tbl_<uuid>.<timestamp>.jsonl.bak`，manifest 为
   `manifest.<timestamp>.json.bak`（`<timestamp>` = `YYYYMMDDTHHmmssSSSZ`；每个目标最多 3 份，见 ADR-021）。
3. 原子替换目标文件。
4. 表文件全部成功后再写 `manifest.json`。
5. 任一步失败：保留旧文件，返回 `E_FS_WRITE`，不得留下半写文件。

### 7.5 锁与崩溃恢复

- 打开工作区时写 `.lock`：`{"pid":1234,"startedAt":"...","appVersion":"1.0.0"}`。
- 正常关闭时删除 `.lock`。
- 应用全局单实例（`app.requestSingleInstanceLock()`）；第二次启动聚焦已有窗口，不重复打开。
- 发现 `.lock`：
  - PID 仍存活 → 拒绝并返回 `E_WS_LOCKED`，提示"可能被另一个窗口占用"。
  - PID 不存在或超过 24h → 标记为 stale，提示"上次未正常退出"，提供"尝试恢复"与"直接打开"。
- 恢复流程：manifest 可读则用 manifest；不可读则扫描 `backups/` 中最新的
  `manifest.<timestamp>.json.bak`（见 ADR-021），重建 manifest 后让用户确认。
- 打开后立即重算每表 `rowCount`，与 manifest 不一致则更新并警告。
  - 只统计内容行数（不解析单元格）；重写 manifest 走 §7.4 的备份 + 原子写，且不修改 `updatedAt`（ADR-022）。
  - 数据文件缺失时：`rowCount === 0` 视为尚未写入的空表；`rowCount > 0` 时 `table:read` 返回
    `E_TABLE_NOT_FOUND`，打开时给出警告，**不得**把 `rowCount` 静默清零（ADR-022）。
  - 单元格级解析错误在读取该表时以 `E_TABLE_PARSE` + 行号报告，不在打开工作区时阻塞。
- 实现边界（ADR-026，已被 T5.3 落地取代）：M1–T5.2 阶段只把 stale/corrupt `.lock` 作为 warning
  返回并替换锁；manifest 损坏返回 `E_WS_INVALID_MANIFEST` 且不改原文件。**T5.3（ADR-048）已实现**
  完整恢复交互：
  - `workspace:inspect` 是只读预检，返回 `lock`（`none|active|stale|corrupt`）、manifest 状态
    （`ok|missing|invalid|unsupported`）与 `backups/` 中的 `manifest.*.json.bak` 列表；它不创建、
    替换或删除任何文件。
  - 渲染进程在所有打开入口之前预检：stale/corrupt 锁且 manifest 可读时提供“尝试恢复/直接打开”；
    manifest 不可读时列出备份并要求二次确认重建；取消不写任何文件，原文件字节不变。
  - `workspace:open` 增加可选 `recovery: { acceptStaleLock?, manifestBackup? }`。显式
    `manifestBackup` 先校验备份、备份当前（损坏的）manifest，再按 §7.4 原子写重建；
    `acceptStaleLock` 仅在锁为 stale/corrupt **且** manifest 不可读时尝试最新一份备份。
  - active lock 始终优先拒绝（`E_WS_LOCKED`），恢复永不覆盖另一个活动会话；高版本 manifest
    （`E_WS_VERSION_UNSUPPORTED`）不从备份降级。
  - 不传 `recovery` 时保持旧行为：stale/corrupt 锁 warning 后替换，manifest 损坏拒绝且不改文件。
  - 打开工作区后逐表读取/解码失败会先关闭已打开的句柄再返回错误，避免留下半打开工作区与 stale lock。

### 7.6 迁移

- `formatVersion` 当前为 `1`；`TableMeta.schemaVersion` 当前为 `1`。
- 迁移注册表：`Record<number, (manifest, tables) => Promise<MigrationResult>>`，逐版本执行，不允许跳版。
- 迁移前：复制整个 `tables/` 到 `backups/migration-<ts>/`。
- 迁移失败：回滚备份，返回 `E_MIGRATION_FAILED`，不得改原文件。
- 打开 `formatVersion > 1`：拒绝，`E_WS_VERSION_UNSUPPORTED`，提示升级应用。
- 每次新增迁移必须加 `fixtures/workspaces/` 夹具与逐行等价测试。
- 实现边界（ADR-024）：
  - 纯执行器与注册表在 `@curve/domain`（`src/migrations/`），备份/回滚在 main 适配器；
    v1 是唯一已发布格式，生产注册表为空，v0→v1 只在测试中注入。
  - 备份目录为 `backups/migration-<timestamp>/`（时间戳同 §7.1，ADR-021），逐字节复制 `tables/`
    下的常规文件；同一毫秒重名则时间戳 +1ms，复制失败删除半成品目录。
  - 回滚写回快照的原始字节，并删除失败尝试新建的表文件；回滚失败仍返回 `E_MIGRATION_FAILED`，
    `detail` 同时带迁移与回滚的错误码。
  - 每步校验输出格式版本与 §6.6 不变量；到达当前版本时再按 §6.5 做一次结构校验。任一步失败
    都不返回半迁移文档；`manifest.json` 始终最后写，因此 manifest 无需回滚。
  - 迁移成功后 `rowCount` 仍按 §7.5 由打开流程重算。
- 实现边界（T2.3，ADR-029）：T2.3 的列结构变更不改变 v1 文件格式，`formatVersion` 与
  `TableMeta.schemaVersion` 仍为 1，不注册迁移、不接 `FileWorkspaceStore.open`。加列/删列/改类型/重排是
  运行期行数据转换，失败由命令级回滚保证原文件字节不变；首次真实格式升级仍按 ADR-024 的复核条件接线。

---

<a id="8"></a>
## 8. 数据流水线

```
文件 / 剪贴板
   │
   ▼
[1] 解析 Parse（Worker：编码、分隔符、JSONL/CSV/JSON）
   │
   ▼
[2] 归一到 Cell（去千分位、日期→epoch、布尔归一、空串→null）
   │
   ▼
[3] 校验 Validate（列类型、必填、主键唯一、枚举）
   │
   ▼
[4] 行集 RowSet（TableMeta + Row[]）
   │
   ▼
[5] 查询 Query（filter → sort）
   │
   ▼
[6] 解析系列 ResolveSeries（wide / long）
   │
   ▼
[7] 采样 Sample（LTTB，仅图表）
   │
   ▼
[8] RenderModel → ChartRenderer（ECharts）
```

### 8.1 归一规则

| 输入 | 目标类型 | 规则 |
|---|---|---|
| `"1,234.5"` | number | 去掉千分位逗号后 `Number()`；必须是有限数 |
| `""` / 空白 | 任意 | 非必填 → `null`；text → `""` |
| `"2026-01-01"` | date | 按本地时区解析为当天 00:00 的 epoch ms |
| `"2026-01-01T08:00:00Z"` | date | 按 ISO 解析 |
| `"true"/"false"/"1"/"0"/"是"/"否"` | boolean | 归一为布尔；其他值报错 |
| 枚举值 | enum | 必须命中 `enumOptions[].value`，否则报错 |
| 数字单元格 | text | 转字符串，保留原始精度 |

### 8.2 错误报告

每次导入/粘贴返回：

```ts
interface ImportIssue {
  row: number;          // 1-based，含表头时按数据行
  columnId?: string;
  value: unknown;
  code: 'E_TYPE' | 'E_REQUIRED' | 'E_DUPLICATE_KEY' | 'E_ENUM' | 'E_RANGE';
  message: string;
}

interface ImportResult {
  rows: Row[];
  issues: ImportIssue[];
  stats: { total: number; accepted: number; skipped: number };
}
```

- 有 issue 时不得静默提交；UI 展示前 100 条 + "导出全部错误 CSV"。
- 用户可选"跳过错误行导入"或"取消"；跳过时 `stats.skipped` 必须回显。
- 导入提交是原子的：先构建完整新 `Row[]` 与 JSONL，成功后才替换内存与磁盘。

---

<a id="9"></a>
## 9. 表格数据功能

### 9.0 工作区入口、表与视图管理

- **欢迎页**：应用启动且无打开工作区时，显示"新建工作区 / 打开工作区 / 最近打开"。新建默认目录为 `app.getPath('documents')/Curve Almanac/`，用户可改。该目录是**父目录**：实际工作区根为 `<父目录>/<清洗后的名称>.cstudio`（ADR-020）。
- **新建表向导**：输入表名 + 主键列（默认 `id`，text，必填，自动填充），可选初始列；创建后立即打开该表的表格视图。
- **表列表**：新建、重命名、删除（移入 `.trash/`）、打开。删除必须二次确认；同时删除引用该表的图表与视图，确认框必须列出将删除的数量。
- **打开表**：若已存在该表的视图则激活，否则创建 `ViewDef { kind: 'table' }` 并加入当前 pane 标签栏。
- **视图关闭**：从 `manifest.views` 移除引用并关闭标签；重新打开时使用默认 `TableViewState`（样式取工作区默认）。
- **空态**：无表、无视图、无图表时都必须有明确行动按钮，不能只显示空白。

### 9.1 网格

- 基于 TanStack Table + Virtual；只渲染视口行。
- 行高由密度决定：compact 24px、normal 32px、comfortable 40px。
- 列宽可拖拽，双击分隔线自适应内容（上限 800）。
- 冻结列 0..3；冻结区不参与横向滚动。
- 选择：单元格、矩形区域、整行、整列；Shift 扩展；Ctrl/Cmd 多选不连续区域（v1 可只做矩形）。
- 键盘：方向键移动，Tab/Shift+Tab 下一格，Enter 提交并下移，Esc 取消，F2 编辑，Delete 清空，Ctrl/Cmd+C/V 复制粘贴。
- 无障碍：`role=grid`，`aria-rowcount/colcount`，单元格 `role=gridcell`，焦点可见。

**实现边界（T5.4，ADR-049）**：

- 网格键盘仍由 `DataGrid.handleKeyDown` / `CellEditor` / 原生 `paste` 事件处理，**不进入**全局
  键位注册表。全局 keymap 只处理带修饰键的应用命令，并在网格等局部处理器已 `preventDefault`
  时跳过；`DataGrid` 的 F2/Enter/Tab/Esc/方向键/Delete 语义不变。
- `input`/`textarea`/`select`/`contenteditable`/`[role="dialog"]` 内不触发全局快捷键，因此
  Ctrl/Cmd+C/V（以及 Ctrl/Cmd+Z、Ctrl/Cmd+K）保持原生编辑语义。命令面板（§13.4）打开时焦点在
  面板输入框，不会与网格按键冲突。

### 9.2 编辑与校验

- 编辑提交时机：Enter、Tab、失焦；Esc 取消。
- 提交时立即校验；非法值**不写入模型**，单元格保持编辑态并显示错误。
- 错误态：红色描边 + tooltip；状态栏显示"第 N 行 · 列 X：原因"。
- 主键重复：阻止提交，提示冲突行号。
- 新增行（含粘贴/导入新增）主键为空时，自动生成 `row_<uuid>` 写入（仅 text 主键）；用户显式填值则校验唯一性。
- 批量清空/粘贴：先整体校验，失败则整批不写入并列出错误。
- 每次提交是一个命令（见 §13），支持撤销。
- 列结构变更（加列/删列/改类型/重排/换主键）见 §9.7；不进入单元格编辑历史。

**实现边界（T2.4，ADR-030）**：

- `table.rows.insert` 已提供“插入整行 + 空 text 主键生成”；粘贴自动追加行。T2.4 仍不提供
  独立的“新增行”按钮/快捷键，TESTPLAN E3 的键盘新增一行留给后续任务。

**实现边界（T2.2，ADR-028）**：

- 校验结果以结构化 `CellIssue`（reason/code/columnId/rowNumber/conflictRowNumber）返回；renderer 用
  `t(key)` 拼错误文案，英文诊断信息不直接展示。`AppError` 的 schema 与 IPC 错误信封不变。
- 主键冲突时状态栏显示“第 N 行 · 列 X：与第 M 行冲突”，网格滚动并临时高亮冲突行；正在编辑的行由
  虚拟列表 `rangeExtractor` 保留，避免滚动导致草稿丢失。
- 日期编辑器使用 `input[type=date]`，按本地午夜提交；既有值若带时刻，用户确认提交后会归一到本地
  午夜。布尔为三态选择（空/是/否），枚举下拉对非必填列提供空值。
- `validateCellBatch` 是 T2.4/T2.5 批量写入的前置校验入口；T2.2 不提供批量 UI。
- 新增行（含空主键自动生成）不在 T2.2 范围，按 T2.4/T2.5 落地。

### 9.3 粘贴

- 优先解析 TSV；若只有一列且含逗号，再尝试 CSV。
- 支持 Excel 复制的引号、换行、制表符。
- 行数不足自动追加；列数超出必须弹窗确认"新增 N 列"（默认 text，可改）。
- 类型不匹配：该单元格标记错误，整批不提交；用户可取消或修正后重试。
- 粘贴 10,000 单元格以上时显示进度，超过 1s 必须可取消。
- 锚点与筛选：以选择区域左上角为锚点，按当前视图顺序写入可见行；筛选激活时只允许写入可见行，矩阵行数超出可见行数则整批拒绝并提示（不得写入隐藏行）。
- 排序激活时按行 ID 定位，粘贴不受排序影响。

**实现边界（T2.4，ADR-030）**：

- 解析器在 `@curve/table-engine`：TSV 优先，单列含逗号时回退 CSV；支持引号、`""` 转义、
  引号内换行/制表符、CRLF、BOM；恰好去掉一个尾随换行；未闭合引号返回 `E_IMPORT_FORMAT`。
  网格监听 `paste` 事件读 `text/plain`，编辑器打开时走原生粘贴；不新增 IPC。
- 锚点为选择矩形左上角，矩阵向右下覆盖并扩容；命令载荷用 `rowId` 定位，空表 `rowId: null`。
  T2.4 不实现排序/筛选 UI；排序不影响写入目标。
- 超列时弹“新增 N 列”确认：默认 text、非必填，可改 label 与 text/number/date/boolean 类型；
  一条原子 `table.paste` 同时提交新增列、行值与视图 `columnOrder`。表级 100 列上限在命令层
  硬拒绝；新增必填列被拒绝（粘贴矩形之外的既有行无法补值）。
- 整批预检失败返回前 100 个结构化 `PasteIssue`（含矩阵行列坐标），错误对话框显示并支持
  “定位第一个错误”；不提供对话框内编辑，修正后重新粘贴。
- 筛选未实现前，检测到 `view.tableView.filter` 即整批拒绝并提示，隐藏行绝不被修改；
  “只写可见行/超出可见行整批拒绝”的完整语义由 T2.6 按本节实现并验收（ADR-030 明确延后）。

**实现边界（T2.6，ADR-032）**：

- `table.paste` 载荷新增可选 `rowIds`（当前可见行顺序）与 `viewId`；筛选激活时矩阵从锚点
  逐行写入 `rowIds`，超出剩余可见行数返回 `filter-visible-exceeded`（整批拒绝、不追加、
  不写隐藏行），锚点不可见返回 `filter-anchor-hidden`。
- 命令在 dispatch 时重新检查目标行仍满足当前 `filter`；预览后筛选变化返回 `filter-stale`，
  不产生半成品。无筛选时保持 T2.4 物理顺序/追加语义（有排序时按当前显示顺序）。
- 省略 `rowIds` 的旧调用在筛选视图下仍整批拒绝，作为保守兜底；UI 始终传可见行。
- ≥10,000 单元格显示可取消进度；校验在事件循环分块，取消不 dispatch、不写盘；命令仍同步
  重规划一次（10k parse+plan 实测 P95 远低于 1s，见 §16.1）。
- 粘贴接入 T2.2 最小历史：一次粘贴一条、不合并，撤销同时回滚新增行/列与覆盖单元格。
- 保存复用 T2.2 队列（表 → manifest），等待 flush ≤3s；保存失败返回 `committed: true`。
  200k 行上限由计划器预检，256MB 文件上限仍由 `table:write` 写盘守卫强制。
- 不实现区域复制（Ctrl/Cmd+C）；不改变 `formatVersion`、JSONL、IPC 或 preload。

### 9.4 CSV/JSON 导入向导

步骤：

1. 选择文件（`.csv` / `.tsv` / `.json`，≤ 100MB）。
2. 解析预览：编码（UTF-8 / GBK / 自动）、分隔符、是否有表头、前 20 行。
3. 列映射：目标表已有列 or 新建列；显示推断类型与置信度。
4. 校验结果：总数/接受/跳过/错误列表。
5. 提交：选择"追加"或"替换"；替换必须二次确认并自动备份。

规则：

- 编码：先严格 UTF-8；失败则 `jschardet` 检测 + `iconv-lite` 解码；UI 允许手动覆盖。
- 分隔符嗅探：`,` `;` `\t` `|`，取前 20 行稳定者。
- 类型推断抽样前 1,000 行；置信度 < 80% 默认 text。
- JSON 支持：对象数组（键映射列 key）、或 `{rows:[...]}`；嵌套对象/数组 v1 不支持，报错。
- 导入在 Worker 执行，主线程不阻塞；可取消。
- 原始文件复制到 `imports/`（≤ 50MB 才复制，否则只记录路径与哈希）。

**实现边界（T2.5，ADR-031）**：

- `file:importText` 返回 `{ token, name, bytes, sha256, size, format }`；main 只做文件选择、
  100MB 检查和字节读取，Worker 用 `TextDecoder` 严格 UTF-8 → GB18030 解码。UI 可覆盖
  `自动 / UTF-8 / GB18030（兼容 GBK）`；错编码保留替换字符并提示，不重读文件。
- CSV 解析使用 Papa Parse；前 20 条记录对 `, ; \t |` 做稳定性评分。表头启发式：首行唯一、
  非空、全文本，且后续样本存在非文本列时判为表头；全文本歧义默认 true。两者都可覆盖。
- JSON 接受对象数组或 `{ rows: [...] }`；键取所有对象键的并集，缺失键填 `null`，嵌套
  对象/数组报 `E_IMPORT_FORMAT`。
- 类型推断抽样前 1,000 个非空值，boolean/date/number 置信度 <80% 回退 text；新列限
  text/number/date/boolean、始终非必填。映射复用 T2.3 列校验与 100 列上限；一个目标列
  只能接收一个源列，required 列未映射时阻止提交。
- 专用 import Worker 持有原始字节/完整解析结果；renderer 只接收 20 行预览、统计和最终
  rows。取消/关闭调用 `terminate()`，不 dispatch、不写盘；Worker 内不提供 chunk 级进度。
- 全量校验返回前 100 条 issue + `total/accepted/skipped`；坏行整行跳过，错误 CSV 为
  UTF-8 BOM + CRLF，一行一个坏数据行（同一行的多个 issue 合并），行号 1-based 且不含表头。
- 默认追加；替换二次确认。替换复用保存队列的 `writeTable` 旧表备份；原始文件在提交前归档到
  `imports/`：≤50MB 逐字节复制 + SHA-256 sidecar，>50MB 只写 sidecar。复制/哈希失败在
  dispatch 前中止，sidecar 不进入 `manifest.json`。
- `table.import`（`{ tableId, mode, rows, newColumns? }`）在一条命令内完成追加/替换、可选
  新列、所有表视图 `columnOrder` 同步与 `rowCount/updatedAt` 更新；失败不发布半成品。
  成功后走保存队列（表 → manifest），等待 flush ≤3s，失败返回 `committed: true`。一次导入
  进入最小历史一条、不合并。
- 最终行数 >200,000 在 dispatch 前拒绝；100,001–200,000 在提交步显式确认。256MB 仍由
  `table:write` 写盘守卫强制。100MB 源文件上限由 main 在读取前检查。
- 不改变 `formatVersion`、JSONL 形态或 manifest 字段；新增 `file:archiveImport` 通道，
  `ALL_IPC_CHANNELS` 18 → 19，已实现通道 11 → 14。

### 9.5 筛选与排序

- 筛选器 UI：列 + 操作符 + 值；支持 all/any 组合，最多 20 条。
- 排序：多列，最多 3 级；点击表头循环 asc → desc → none。
- 视图状态持久化到 `TableViewState`，不改变数据。
- 10 万行排序/筛选在 Worker 执行；结果返回行 ID 顺序 + 行数据引用。

**实现边界（T2.6，ADR-032）**：

- 筛选入口是网格工具条的按钮 + `FilterDialog`；UI 只编辑单层 all/any + 平铺条件，引擎仍支持
  递归 AST。12 种操作符按列类型白名单开放：text 用 `eq/neq/contains/startsWith/endsWith/
  isNull/notNull`，number/date 用 `eq/neq/gt/gte/lt/lte/between/isNull/notNull`，
  boolean/enum 用 `eq/neq/isNull/notNull`。`between` 含边界；文本大小写不敏感；`null` 与
  text 的 `''` 都视为空，值操作符不匹配空值。
- 排序：表头点击 asc→desc→none（清空其他层）；Shift+点击追加/切换，最多 3 层；空值固定最后；
  文本用 `Intl.Collator(locale, { numeric: true, sensitivity: 'variant' })` 语义（ASCII 使用
  数字段补零自然键快速路径，非 ASCII/不安全值回退字面 collator）；并列项保持物理行顺序。
- 视图状态的每个确认动作立即 `view.update` + 写 manifest；不写 JSONL、不标脏表、不进入
  T2.2 最小历史（T5.2 统一）。`tableViewStateSchema.sort` 最多 3 层。
- 同一张表可由 TabBar 的“+ 复制当前视图”产生多个独立视图；隐藏列入口在 Inspector 列面板，
  至少保留一列可见。
- ≤20,000 行在主线程执行同一纯函数，>20,000 行走专用 `query.worker`；Worker 按表缓存行快照，
  首次/结构变化全量同步、单元格编辑只发改动行。新查询作废旧响应；Worker 失败回退主线程并提示。
  查询不提供百分比进度；100k 文本排序的极端值仍由 T2.7 复核。

**实现边界（T2.7，ADR-033）**：

- `buildSortPlans` 为每级排序预计算空值标志与比较键（text/enum：自然键或原始/标签字符串；
  number/date：`Float64Array` + 不可读值的中性标志；boolean：`Uint8Array`），比较器不再逐次
  访问 `row.values`。`QueryContext.compareCache` 让每个筛选谓词只解析一次列下标与文本比较值。
- 非 ASCII 文本改用文档规定的参考语义（原始值 + `numeric: true` collator），ASCII 仍走
  数字段补零的自然键快速路径；长数字段/带符号数字不再需要单独回退。
- 全中文文本 100k 排序单列 800ms 预算（§16.1）；实测 644ms，400ms 对 ICU collator 不可达。
- 网格新增 `data-query-total-ms`（含首次 Worker 快照克隆的端到端时间，趋势指标）；
  `data-query-ms` 仍只含 Worker 内 filter+sort。

### 9.6 导出

- CSV：UTF-8 BOM（Excel 兼容）；可选"原始值"或"按显示格式"。
- 导出当前筛选/排序后的行；列顺序按视图顺序。
- 文件名默认 `<表名>-<yyyyMMdd-HHmm>.csv`。

**实现边界（T3.6，ADR-039）**：

- 入口是网格工具条的“导出 CSV…”对话框；导出是只读操作，不发命令、不进撤销、不写
  manifest/JSONL。列只含当前视图可见列，顺序按 `tableView.columnOrder`；隐藏列不导出。
- 行默认是当前筛选/排序结果；对话框另提供“全部行（忽略筛选、保留排序）”。空表只导出表头。
- 值格式默认“按显示格式”：复用 `formatStyledCellValue`（当前解析样式/locale/布尔文案），
  表头用 `columnDisplayLabel`；“原始值”用存盘值（text 原样、number 无千分位、date epoch ms、
  boolean `true`/`false`、enum 存储值），表头用 `column.label`。条件颜色/图标、bar/badge
  的视觉形态不进入 CSV。
- 文件格式：UTF-8 BOM（只一次）、CRLF、RFC 4180（含 `,`/`"`/CR/LF/首尾空白时加引号，
  内部 `"` 写成 `""`）；默认文件名用清洗后的表名 + 本地时间 `yyyyMMdd-HHmm`。
- 传输用 `file:exportCsv` 的 `begin/append/finish/cancel` 四步；main 在用户选择的目录写
  临时文件、`fsync` 后 rename，取消删除临时文件；renderer 约 1,000 行/块并在块间让出事件
  循环，100k 导出 ≤5s 且可取消（§16.1）。
- 不处理 CSV 公式注入：以 `=`/`+`/`-`/`@` 开头的文本不改写，保持数据保真；需要缓解时
  另加显式选项与 ADR，不能静默改写。

### 9.7 列管理（T2.3）

- 入口：右侧 Inspector 的活动表列面板；新增/编辑在 Dialog 完成；删除、改类型、换主键以及会使现有值非法的
  `required`/枚举选项变更共用二次确认对话框，确认框显示受影响行数、需转换单元格数、需清理视图数与将失效
  图表数。
- 加列：默认 `text`/`role=none`/非必填，追加到 schema 末尾并为所有旧行补 `null`；表内已有行时不能直接新增
  `required` 列。所有视图 `columnOrder` 同步插入。
- 改类型：逐行用 `coerceCell` 转换；任何一行失败则整批取消、列出前 100 行且不改内存/磁盘。改类型会清空
  `fieldTypeId`（语义类型必须与存储类型匹配，ADR-015）；enum→非 enum 丢弃 `enumOptions`。
- 删列：主键列禁止删除；从 schema 与所有行删除，并清理所有视图的 `columnOrder`/`widths`/`hiddenColumnIds`/
  `sort`/`filter`（filter 递归裁剪）与冻结计数。图表 mapping/sort/filter 与样式 `columnOverrides`/
  `conditionalRules` 保留，图表进入 invalid 错误态（§19）。
- 换主键：新主键必须是已存在的 text 列，逐行非空且唯一，失败列出前 100 行并整批取消；成功后该列
  `required: true`，行值不变。
- 重排：改变 `TableMeta.columns` 与每行 `values`，并同步该表所有视图的 `columnOrder` 为新顺序。
- 上限：每表 100 列；命令硬拒绝，列面板在达到上限时禁用新增。
- 实现边界（ADR-029）：结构命令同步执行，不提供进度/取消（T2.7 复核）；只改 schema 的命令只写 manifest，
  改变行数据的命令走保存队列（表 → manifest）；结构命令只产 patches，不进入 T2.2 的最小历史（T5.2 统一）。
  图表完整渲染与重映射在 T3.1，T2.3 只提供只读错误占位。

---

<a id="10"></a>
## 10. 表格外观与模板

### 10.1 三分离原则

| 层 | 存什么 | 变更影响 |
|---|---|---|
| 表结构 `TableMeta` | 列类型、角色、主键 | 需要迁移 |
| 视图状态 `TableViewState` | 排序、筛选、列宽、隐藏、冻结、styleId | 不需要迁移 |
| 外观 `TableStyle` | 令牌、列覆盖、条件格式 | 不需要迁移 |

禁止把颜色/列宽写进 `ColumnDef`（`width` 仅作为新建列默认值，实际宽度以视图状态为准）。

### 10.2 令牌与渲染

- 所有令牌渲染为 CSS 变量：`--cs-table-*`，网格只消费变量。
- 密度与内边距映射：
  - compact：行高 24，`cellPaddingY=4`
  - normal：行高 32，`cellPaddingY=7`
  - comfortable：行高 40，`cellPaddingY=10`
- 网格线：`none` / `horizontal` / `all`；颜色取 `body.borderColor`。
- 斑马纹：`zebra=true` 时偶数行用 `alternateBackground`。
- 选中：`selection.background/foreground`；必须满足对比度 AA。
- 数字格式：`Intl.NumberFormat`；`decimal/percent/currency`；小数位取覆盖值或列 precision。
- 日期格式：`date` / `date-time` / `time` / `iso`，用 `Intl.DateTimeFormat`，时区取系统本地。
- 单元格渲染模式：
  - `auto`：按列类型选择 text/number/date/badge。
  - `bar`：以当前筛选结果中该列 min/max 归一，绘制背景条；全等值时条宽 0。
  - `badge`：仅 enum；用枚举值哈希到调色板。
- 表格样式是**显式配色**，不随应用深浅色自动反转；内置深色模板单独提供。

**实现边界（T3.2，ADR-035）**：

- `styleToCssVars(style)` 是唯一转换点，输出 20 个 `--cs-table-*` 变量；网格、工具栏与选择栏
  只消费这些变量。工具栏把应用控件的 `--cs-color-*` 局部重映射到表头令牌，避免深色模板出现
  浅色孤岛。
- 行高 = `max(密度基线, ceil(fontSize × 1.25) + 2 × cellPaddingY)`；内置模板仍为
  compact 24 / normal 32 / comfortable 40，虚拟化使用统一行高。
- 数字统一使用 `Intl.NumberFormat` 并开启千分位；小数位取列覆盖否则列 `precision`。数字与
  日期默认右对齐，其他类型默认左对齐；`ColumnStyleOverride.align` 可覆盖。
- 布尔单元格使用消息表的“是/否”（en-US 为 Yes/No）；日期使用 i18n locale；枚举使用
  `enumOptions.label`，`auto` 渲染为 badge。
- 有效列宽：视图 `widths` > 列覆盖 `width` > `ColumnDef.width` > 160；列覆盖 `label` 只影响
  表头显示，不写回 schema。
- `bar` 的 min/max 只统计当前筛选/排序后的可见行；全等值区间渲染 0 宽条。badge 用枚举值
  FNV-1a 哈希到 4 个 tone，复用样式自身的 header/selection/alternate/body 令牌，不新增
  manifest 字段或调色板模型。

### 10.3 内置模板（代码常量，不入 manifest）

| id | 名称 | 特征 |
|---|---|---|
| `builtin.report-light` | 报告（浅） | 白底、细横线、表头深灰、行高 32 |
| `builtin.compact-light` | 紧凑（浅） | 24 行高、无竖线、适合大表 |
| `builtin.dark` | 深色 | #1e1e1e 底、#d4d4d4 字、弱边框 |
| `builtin.finance` | 财务 | 数字右对齐、等宽数字、千分位、斑马纹 |

- 默认样式：`builtin.report-light`。
- 用户编辑内置模板时，**自动 fork** 为 `sty_<uuid>`，原内置不变。
- 内置模板 id 是稳定契约，不得重命名。

**实现边界（T3.1，ADR-034）**：

- 4 个内置模板是 `@curve/domain` 的深度冻结常量（`builtin: true`），不写入
  `manifest.tableStyles`；`DEFAULT_TABLE_STYLE_ID`/`DEFAULT_TABLE_STYLE_TOKENS` 也由 domain 导出，
  persistence 与 app-core 复用同一常量。
- 样式颜色字段只接受十六进制 `#RGB`/`#RGBA`/`#RRGGBB`/`#RRGGBBAA`；非法颜色、字体/圆角/
  内边距/列宽/小数位越界均由 Zod 拒绝。
- `resolveStyle(id, userStyles)` 返回 `{ style, fallback, warning? }`；未知 id（含未知
  `builtin.*`）回退 `builtin.report-light` 并给 warning。`forkTableStyle` 深拷贝为
  `sty_<uuid>`、`builtin: false`，名称默认 `Name (2)`。
- `builtin.finance` 的等宽字体与斑马纹由令牌表达；数字右对齐、千分位由 T3.2 的统一数字格式
  管线实现（所有模板共享），未扩展 `TableStyleTokens`（ADR-035）。

### 10.4 条件格式

- 规则按数组顺序求值，**首条命中生效**（不做样式叠加）。
- 目标：整行或指定列单元格。
- 谓词复用 `FilterPredicate`；比较语义：
  - number/date：数值比较；`contains` 按字符串化后不区分大小写。
  - text：`eq/neq/contains/startsWith/endsWith`；大小写不敏感。
  - boolean/enum：只允许 `eq/neq/isNull/notNull`。
  - `between` 含边界；`value`/`value2` 类型必须匹配。
- 空值：`isNull` 匹配 `null` 与 `""`（text）。
- 最多 50 条；每条启用/禁用；求值必须是纯函数，单测覆盖所有操作符。
- 示例：

```json
{
  "id": "rule_001",
  "enabled": true,
  "label": "高温标红",
  "target": { "kind": "row" },
  "when": {
    "kind": "compare",
    "columnId": "col_a",
    "op": "gt",
    "value": 30
  },
  "style": { "background": "#fde2e2", "foreground": "#a40000", "bold": true, "icon": "warning" }
}
```

**实现边界（T3.3，ADR-036）**：

- 求值器在 `@curve/domain` 的 `condition.ts`：`createConditionalFormat` 一次准备列索引/谓词/比较
  值，渲染循环只对可见行调用 `evaluateRow`；`evaluateRules` 是单次调用的便捷入口。12 种比较的
  语义原语在 `predicate.ts`，`@curve/table-engine` 复用同一实现，不复制第二套求值逻辑。
- number/date 的 `contains` 只在条件模式启用（`String(value)` 后按 locale 不区分大小写）；过滤器
  的操作符白名单不变，仍不提供 number/date `contains`。
- 缺失列的谓词分支被忽略；分支全部缺失的规则永不命中；单元格目标列缺失时该规则不适用。
- 空值、类型不匹配、无效操作符返回 `false`，不抛异常；`isNull` 匹配 `null` 与 text `""`。
- 渲染优先级：错误/冲突/粘贴错误 > 选中 > 条件规则（首条） > bar > 斑马纹/基础。条件背景覆盖
  bar；行目标规则的 icon 只画在首个可见列，单元格目标只画在目标列。条件样式只影响显示，不改变
  manifest/JSONL 字节。
- 50 条规则 × 100 行的**纯求值**预算 ≤16ms，由 `pnpm bench` 的 `condition.rules.50x100` 硬门禁；
  DOM 应用不计入该 16ms。

### 10.5 模板管理

- 操作：应用、另存为、重命名、复制、删除、设为默认、导入、导出。
- 跨表复用：tokens 与条件规则可复用；`columnOverrides` 和规则中的列引用按列 ID 匹配，目标表不存在的列直接忽略（不报错、不删除规则）。
- 用户模板存 `manifest.tableStyles`；删除被引用的模板时，所有引用回退默认并提示。
- 导出格式：

```json
{
  "kind": "curve-table-style",
  "version": 1,
  "exportedAt": "2026-01-01T00:00:00.000Z",
  "style": { "...": "TableStyle（id 会被重新分配）" }
}
```

- 导入：Zod 校验 → 重新分配 `id`/冲突名称加 ` (2)` → 预览 → 确认后写入。
- 编辑预览：任何令牌/规则变更 100ms 内反映到预览网格；预览使用当前表前 50 行。

**实现边界（T3.5，ADR-038）**：

- 新增 `style.delete { styleId }` 与 `style.apply { styleId, target }`（`target` 为表视图或工作区
  默认）；另存为/复制/导入落库复用 `style.create`，重命名复用 `style.update`。不新增
  `style.setDefault`。
- 删除仅限 `sty_` 用户样式；同一命令内移除样式、把所有引用视图与工作区默认改回仍可解析的默认
  模板（被删样式正是默认时回退 `builtin.report-light`）；进入 workspace 作用域历史，因此
  UI 二次确认后仍可用 Ctrl+Z 恢复样式与视图引用。
- 导出文档由 `@curve/domain` 的 `styleExportDocumentSchema` 校验；`parseStyleExportDocument`
  区分 `json`/`tooLarge`/`version`/`document` 失败。导入总是重新分配 `sty_` 与 `rule_` id、
  强制 `builtin:false`；名称冲突按 ` (2)` 递增；跨表缺失列保留在模板中，只提示“将被忽略”。
- 传输复用 `file:importText`/`file:exportText`，不新增 IPC/preload；`.curvestyle.json` 不归档到
  `imports/`。导入预览复用前 50 行真实渲染管线，并可选“导入后应用到当前视图”。
- 删除确认列出受影响视图；成功后提示回退数量与模板名。模板管理入口在检查器“样式”面板，
  “另存为”在当前编辑器草稿上完成。

### 10.6 样式编辑器

- 面板分组：模板、令牌（字体/颜色/密度/网格/圆角）、列覆盖、条件格式。
- 所有颜色输入支持 hex 与取色器；非法值不提交。
- 修改走命令总线，可撤销；撤销粒度按一次控件提交（不是每个像素）。
- 编辑器与网格共用 `TableStyle` 渲染管线，禁止两套样式逻辑。

**实现边界（T3.4，ADR-037）**：

- 检查器新增“列 / 样式”标签；样式标签显示解析后的模板、密度、规则/覆盖数量与回退警告，
  并打开宽对话框编辑器。对话框左侧为令牌/模板/列覆盖/条件规则四组，右侧为前 50 行预览；
  ≤1000px 视口上下堆叠，200% 缩放下仍可键盘操作。
- 编辑内置模板时只在本地 `forkTableStyle` 生成草稿；第一次提交控件才调用新增的
  `style.create { style, viewId? }`，在同一命令内创建 `sty_` 副本并把当前视图指向它。
  取消不产生副本；后续提交走 `style.update`。两个命令都是 manifest-only 且进入
  workspace 作用域历史。
- 文本/数字/颜色输入在合法输入时更新本地草稿供预览，失焦/Enter 才提交；下拉/复选框与
  规则保存各是一次提交。`tableStyleSchema` 是最终提交门禁；字段错误禁用“完成”。
- 条件规则表单最多两层 all/any；操作符使用 `conditionCompareOps`。超过两层、引用缺失列
  或含不支持操作符的已有规则只读，不静默改写。
- 预览使用当前表**物理前 50 行**、当前视图的列顺序/隐藏/宽度，复用
  `TableStyleProvider`、`GridCell`、`presentStyledCell`、`createConditionalFormat` 与
  `computeBarRanges`；不挂载编辑器/筛选/排序/虚拟滚动。模板 CRUD、导入导出见 §10.5 的 T3.5
  实现边界。

---

<a id="11"></a>
## 11. 图表

### 11.1 映射

**宽表**：选 X 列 + 多个 Y 列，每个 Y 列一条系列。

- X 列类型：number / date / text（text 作为类目轴）；角色必须为 `x` 或 `none`。
- Y 列必须 number，角色必须为 `y` 或 `none`；非 number 列不可选。
- 系列名默认取列 `label`；重名加序号。

**长表**：选 X 列 + 系列列（text/enum）+ Y 列（number）。

- 系列列类型必须为 text/enum，角色必须为 `series` 或 `none`；Y 列 number，角色 `y` 或 `none`。
- 系列值为系列列的 distinct 值，按首次出现顺序排序。
- 最多 20 个系列；超出截断并警告。
- 系列列空值归为 `(空)` 系列。

### 11.2 解析规则

1. 先应用图表的 `filter`，再应用 `sort`；未配置 sort 时：数值/时间 X 升序，文本 X 保持原顺序。
2. X 值必须可比较；number/date 转数值，text 转字符串。
3. Y 非 number → `null` + warning；不丢弃整行。
4. `null` 在折线上是断点，不补 0，不插值。
5. 重复 X 保留全部点，按排序后的行序连线，并给出 warning。
6. 同一系列的点数 > `sampling.threshold` 且启用采样时，执行 LTTB 到 `target`。
7. 采样后保留首尾点；`meta.sampled=true`，UI 显示"已采样"徽标。

> **实现边界（T4.4，ADR-043）**：长表映射把"该行属于其它系列"编码为 `null`（共享 X 轴 +
> 逐系列数组）。这些 null 是表达产物而非缺失值，`RenderStyle.connectNulls=true` 让长表折线
> 跨过它们；宽表未采样时仍按第 4 条断线。代价是长表自身真实的 null 也会被跨过（与采样图
> 同类）。采样图的断点策略见 §11.4。

### 11.3 RenderModel 契约

```ts
export interface RenderSeries {
  id: string;                  // 稳定：列 ID 或 `${seriesColumnId}:${value}`
  name: string;
  values: (number | null)[];
  color?: string;
}

export interface RenderModel {
  kind: ChartKind;
  x: {
    values: (number | string)[];
    type: 'number' | 'time' | 'category';
    label?: string;
    unit?: string;
  };
  /** 仅当 `ChartOptions.yLabel` 去空白后非空时存在（T4.4）。 */
  y?: { label?: string };
  series: RenderSeries[];
  style: {
    palette: string[];
    background: string;
    showGrid: boolean;
    lineWidth: number;
    smooth: boolean;
    showSymbol: boolean;
    legend: 'top' | 'right' | 'bottom' | 'none';
    numberDigits: number;
    yStartAtZero: boolean;
    /** 采样图与长表为 true；宽表未采样为 false（T4.4）。 */
    connectNulls: boolean;
  };
  meta: {
    sampled: boolean;
    sourcePoints: number;
    renderedPoints: number;
    warnings: string[];
  };
}
```

- `chart-model` 只产出 RenderModel，不得出现 ECharts 类型。
- `chart-echarts` 只消费 RenderModel，不得读取表/Store。
- 所有 warning 必须可展示；不得吞掉。

**实现边界（T4.1，ADR-040）**：

- `resolveSeries(table, rows, spec, { locale?, theme?, background? })` 返回
  `{ ok: true, model } | { ok: false, issues }`；失败一次返回全部
  `{ path, code, message }`，不抛异常。`validateChartMapping` 与
  `canBeChartX/Y/Series` 供检查器复用；`MAX_CHART_SERIES = 20`。
- 行顺序：先应用 `spec.filter`，剔除 number/date X 缺失的行并聚合 warning；再应用
  `spec.sort`，未配置时 number/date 按 X 升序、text 保持物理顺序。筛选/排序复用
  `@curve/table-engine`（ADR-032），不另写比较语义。
- 系列：宽表 `id = 列 id`、`name = 列 label`（重名 ` (2)`）；长表
  `id = "<seriesColumnId>:<存储值>"`，空值归 `(空)` 组（id 的值部分为空串），enum 用
  option label 命名；超过 20 条按顺序截断并 warning。
- 值：date → epoch ms（`x.type='time'`）、number → 数值、text → 字符串（`'category'`）；
  Y `null` 是断点（不补 0、不插值），非 number → null + 该列一条聚合 warning；重复 X
  保留全部点并按排序后的行序连线 + warning。
- 样式：`style.palette` 由 `paletteId` 解析为 4 组 8 色常量（含 Okabe–Ito 色盲友好组）；
  `style.background` 解析顺序为显式 `options.background` > `options.theme`（`auto`）>
  `light`/`dark` > `#ffffff`；其余令牌直接映射。
- `meta.sampled = false`、`renderedPoints = sourcePoints = 非空 Y 值总数`；T4.2 才做
  LTTB 采样并改写这三个字段。
- warning 为英文开发者文案（与 manifest/workspace warning 一致），按“X 丢行 → 重复 X →
  非数值 Y（按列）→ 系列截断”的固定顺序聚合，UI 负责展示与本地化。

**实现边界（T4.2，ADR-041）**：

- 采样归属：只在 `resolveSeries` 内执行一次（`@curve/chart-model`）；`@curve/chart-echarts`
  不得再采样。`lttbIndices(x, y, target)` 与 `sampleSeriesIndices(x, values, options)` 是
  公开纯函数，供基准/检查器复用；LTTB 返回升序原始下标。
- 触发（逐系列）：`sampling.enabled && 非空点数 > threshold && 非空点数 > target`。
  `target < 3` 退化为首点（1）或首尾点（2）；`target ≥ 非空点数` 原样输出。任一序列被
  降采样时 `meta.sampled = true`，否则为 `false`。
- x 坐标：number/time 用存储数值（date 为 epoch ms），category 用有序行下标；采样只取
  子序列，永不重排（用户 `sort` 亦然）。
- 共享 X 轴对齐：采样后 `x.values` 取各系列保留下标的**升序并集**；未采样系列贡献它的
  全部非空下标（不因邻居被采样而丢点）；被采样系列在并集中属于其它系列的位置为 `null`，
  其非空点数 ≤ `target`。`x.values.length` 可大于 target（上界约
  `Σ max(threshold, target)`）。
- 缺失值：`null` 不参与三角面积、不会成为保留下标、采样后仍为 `null`（断点语义不变）；
  采样不新增、不删除、不重排 warning。
- meta：`sourcePoints` 为采样前非空 Y 总数（ADR-040），`renderedPoints` 为采样后非空 Y
  总数，恒 `≤ sourcePoints`；“已采样”徽标只读 `meta.sampled`。
- 性能门禁：`pnpm bench -- --sample` —— `chart.sample.100k`（单系列 100k→2k）≤ 50ms；
  `chart.resolve-sample.100k`（100k×10、2 个 Y 系列，含解析）≤ 300ms（§16.1）。

**实现边界（T4.4，ADR-043）**：

- `RenderModel.y` 仅由 `ChartOptions.yLabel` 产生（去空白、空串不产生字段）；Y 单位仍不在模型
  里，需要时另写 ADR。`RenderStyle.connectNulls` 由 chart-model 计算：
  `meta.sampled === true || mapping.layout === 'long'`；宽表未采样保持 `false`。
- 图表读取该表**全部行**，行序由图表自身 `filter`/`sort` 决定，不跟随表格视图的筛选/排序
  （ADR-008 的视图状态分离）。
- 图表视图把渲染契约暴露为 `data-chart-*`（kind/layout/x 类型与标签、Y 标签、系列名与数量、
  source/rendered points、sampled、样式项），供 E2E 与无障碍摘要使用；不是持久化字段。
- 列被删除后图表进入可操作错误态（`missing-columns` + 内嵌重映射），不自动改写映射；
  `chart.update` 允许悬空引用以便修复，`chart.create` 要求映射有效。

**实现边界（T4.6，ADR-045）**：

- `chart-model` 公开“解析数据 / 应用样式”两段，`resolveSeries` 仍是二者的组合且输出不变：
  `resolveChartData(table, rows, spec, options?)` 返回 `{ ok, data } | { ok, issues }`
  （`ResolvedChartData = { x, series: { id, name, values }[], meta }`，**不含颜色与样式**）；
  `renderChartModel(data, spec, options?)` 补齐 `kind`、`series[].color`、`style` 与 `y`。
  数据段只依赖 `filter`/`sort`/`mapping`/`sampling`/`locale`/`xLabel`；样式段才读取
  `paletteId`/`background`/`lineWidth`/`smooth`/`showSymbol`/`legend`/`showGrid`/`numberDigits`/
  `yStartAtZero`/`yLabel`。`renderChartModel` 复用数据里的 `values` 数组，调用方不得修改。
- 数据缓存属于渲染层（`features/charts/chart-data-cache.ts`），按“`rows` 引用 + 数据键”
  命中；键含表结构签名、`mapping`/`filter`/`sort`/`sampling`/`locale`/`xLabel`，不含样式字段。
  缓存不进入 `chart-model`（该包保持纯函数、无状态，ADR-040）。

### 11.4 ECharts 适配器

- 按需引入 `echarts/core` + `LineChart/ScatterChart/BarChart` + 必要组件。
- 必须实现：`render(container, model)`、`update(model)`、`resize()`、`dispose()`、`toPNG({scale,background})`。
- 交互：`dataZoom`（inside + slider）、legend 点击、tooltip（X 格式化 + 单位 + 精度）、框选缩放。
- 主题：背景 `auto` 时跟随应用深浅色；`light/dark` 强制。
- 空数据：不创建实例，渲染空态；实例创建失败必须捕获并显示错误态。
- 不允许在 React 组件里直接拼 option；option 只允许出现在 `chart-echarts` 包。

**实现边界（T4.3，ADR-042）**：

- `echarts@^6.1.0`（实测 **6.1.0**）是 `@curve/chart-echarts` 唯一新增运行时依赖；按需注册
  `LineChart`/`ScatterChart`/`BarChart` + `Grid`/`Tooltip`/`Legend`/`DataZoom`/`Toolbox` +
  `CanvasRenderer`，不 import 全量 `echarts` 入口。注册子集 606.0 kB minified / 206 kB gzip。
- `toEChartsOption(model, { locale? })` 是唯一 option 构造点（纯函数）；`x.type` 的 `number`
  映射到 ECharts `value`、`time` → `time`、`text` → `category`；类目轴给 `xAxis.data` +
  对齐数组，数值/时间轴给 `[x, y]` 对（`null` 保留为空点）。
- null 断点：`meta.sampled === false` 时 `connectNulls: false`（真实缺口断开，§11.2.4）；
  `meta.sampled === true` 时 `connectNulls: true`（ADR-041 的共享 X 轴并集无法区分"被采样
  略过"与真实缺口，采样图必须跨过；真实缺口也会被连线，是已接受的代价）。适配器不再采样。
  **T4.4（ADR-043）起**适配器只读 `RenderStyle.connectNulls`（采样图与长表为 true，宽表未
  采样为 false），不再直接判断 `meta.sampled`。
- Y 轴名：`RenderModel.y.label` 映射为 `yAxis.name`（`nameLocation:'middle'`、
  `nameRotate:90`、`nameGap:48`，有名称时 `grid.left` 80）；无标签时不产生轴名。
  `grid.bottom` 为 72，保证 X 轴名不被 dataZoom 滑块遮住（T4.4，ADR-043）。
- 主题：`resolveChartTheme(background)` 按 WCAG 相对亮度推导 light/dark，颜色为与 `@curve/ui`
  令牌同值的常量（不 import `@curve/ui`）；`animation: false` 使渲染与 PNG 确定。
- 交互：tooltip（`renderMode: 'html'`，对用户可控文本做 HTML 转义；X 单位/格式化、Y 固定
  `numberDigits` 精度）、`dataZoom`（inside + slider）、toolbox 的 `dataZoom`（框选缩放）。
- 生命周期：`createChartRenderer({ locale? })` 惰性 `init`，提供 `render`/`update`/`resize`/
  `dispose`/`toPNG`；`update` 用 `setOption(option, { notMerge:false,
  replaceMerge:['series','xAxis','yAxis'] })` 合并；空模型（无系列 / x 为空 / `sourcePoints=0`）
  不创建实例；失败返回 `{ ok:false, error }`（渲染 `E_UNKNOWN`、导出 `E_EXPORT_FAILED`）；
  `activeChartInstanceCount()` 供泄漏测试。
- `toPNG({ scale = 2, background: 'transparent'|'light'|'dark' })` 返回 data URL（默认 2x、
  `excludeComponents: ['toolbox']`）；文件名与写盘由 T4.5 负责。
- **Y 轴单位不在 `RenderModel`**（`RenderSeries` 没有 `unit`）：tooltip 只显示 X 单位与 Y 精度；
  需要 Y 单位时先扩展 §11.3 契约并写 ADR。toolbox 标题由 T4.5 的 `labels` 注入本地化
  （不传时保持 ECharts 英文默认值，见下）。

**实现边界（T4.5，ADR-044）**：

- `ChartRenderer` 增加交互 API：`getInteractionState()`（当前 dataZoom 百分比窗口与被隐藏的
  系列名）、`dispatchInteraction({ type: 'toggle-series' | 'zoom-by' | 'reset-view', … })`、
  `onInteractionChange(listener)`（订阅 ECharts 的 `datazoom` / `legendselectchanged`）。
  `dispatchInteraction` 只调用 `dispatchAction`，不重建实例、不改 option、不写 RenderModel；
  异常被吞掉，交互失败不得让视图崩溃。
- 交互状态是瞬态 UI 状态：不写入 `ChartSpec`/manifest、不进入撤销、不跨标签/重启保留。
  DOM 工具栏与 canvas 内置控件通过上述事件保持同一状态。
- `toEChartsOption` 的选项增加 `labels?: { zoom?: string; zoomBack?: string }`，映射到
  `toolbox.feature.dataZoom.title.zoom/back`；不传时保持 ECharts 默认值。tooltip 增加稳定
  `className: 'cs-chart-tooltip'`（仍为 `renderMode: 'html'`，用户文本仍全部转义）。
- `toPNG` 保持同步；"导出前等待一次完整渲染"由视图层完成（flush 防抖 + 两个动画帧），
  见 §11.6。

### 11.5 图表 UI

- 左侧"图表"列表：新建、复制、重命名、删除。
- 新建向导：选表 → 选映射（宽/长）→ 选列 → 预览 → 创建。
- 检查器分组：数据（表/筛选/排序）、映射、外观（线宽/平滑/点/调色板/图例/网格）、坐标轴（标签/从零开始）；
  图表视图工具栏提供图例（逐系列开关）、放大/缩小/重置缩放、“查看数据表”与导出（T4.5）。
- 修改 120ms 防抖更新；更新不得重建整个实例（用 `setOption` merge）。
- 图表与表格联动：在表格选中行时，图表高亮对应点（v1 可选，SHOULD）。

**实现边界（T4.4，ADR-043）**：

- 侧栏"图表"标签列出图表（新建/打开/复制/重命名/删除）；点击行激活既有视图，标签页被关闭时
  用 `view.create` 重建。复制经 `chart.create` 生成新 `cht_`/`viw_` 与 ` (2)` 标题，源/副本
  互不影响；删除二次确认并可由 Ctrl+Z 撤销。
- 新建向导：选表 → 类型/名称 → 映射与列（只列 `canBeChartX/Y/Series` 兼容列，布局不可表达时置灰）
  → 右侧实时预览 → 创建；映射不完整/非法时创建按钮禁用，`chart.create` 再次强校验。
- 检查器四组（数据/映射/外观/坐标轴）在图表视图激活时替换表格的列/样式标签；下拉与复选框一次
  交互一条 `chart.update`，文本/数字在失焦/Enter 提交，非法值内联报错。`ChartMappingFields` 同时
  用于检查器与错误态重映射。
- 更新路径：首次 `renderer.render()`，之后 120ms 防抖 `renderer.update()`（`setOption` merge，
  `replaceMerge:` 见 §11.4）；容器尺寸变化 `resize()`，卸载 `dispose()`；适配器错误内联显示。
- 图表标签标题跟随图表标题（`chart.update` 内同步）；一个图表最多一个视图（§12）。
- 列被删除：`missing-columns` 错误态 + 缺失列 id + 内嵌重映射，不自动改写映射（§19）；修复后
  重启仍为正常态。
- `chart.create/update/delete` 均 manifest-only、workspace 作用域可撤销（§13.1/§13.2）；
  不改变 `formatVersion`/JSONL/IPC/preload/CSP。

**实现边界（T4.5，ADR-044）**：

- 图表视图工具栏：逐系列图例开关（`aria-pressed`）、放大/缩小/重置缩放、查看数据表、导出 PNG。
  全部为原生按钮，键盘可达；缩放窗口通过 `data-chart-zoom-start/end` 暴露给 E2E。
- 空态三态以 `data-chart-empty` 暴露：`no-table`（表已删除）显示“删除图表…”（二次确认、可撤销）；
  `unmapped`（列被删/映射无效）显示“配置映射”并聚焦内嵌 `ChartMappingFields`；
  `no-data`（可解析但没有点，`data-chart-state="empty"`）显示“查看数据表”（`openTable`）。
  映射仍不自动改写（§19）。
- 视图无障碍摘要写入 canvas 宿主 `role="img"` 的 `aria-label`：标题、类型、系列数、点数，
  采样时补充原始点数；“查看数据表”按钮在就绪与无数据态都可用。
- 导出入口在图表视图工具栏而非检查器（原因见 ADR-044）：检查器仍是数据/映射/外观/坐标轴四组；
  导出对话框提供透明/白/深背景选择、固定 2x 与建议文件名。
- 交互状态（图例选择、缩放窗口）不持久化、不进入撤销；关闭标签或重启后回到全选/0–100。

**实现边界（T4.6，ADR-045）**：

- 大表（> `CHART_DEFER_RESOLVE_ROW_THRESHOLD = 20_000` 行）且数据缓存未命中时，图表先显示
  loading（`role="status"`，视图 `data-chart-pending="true"`），解析在 `setTimeout(0)` 中执行；
  首次挂载与切换映射/图表都适用。小表、缓存命中、缺表/缺图表时同步解析，不闪 loading。
  解析结果落地后一次性替换视图状态，`data-chart-pending="false"`。
- 样式类提交（调色板/线宽/平滑/点/图例/网格/精度/Y 轴名/类型/背景）只重跑 `renderChartModel`，
  不重新筛选/排序/采样；E2E 以一次样式提交后 `data-chart-resolve-ms` 接近 0 证明缓存命中。
- 性能诊断契约（只读 DOM 属性，不是持久化字段）：`chart-view` 的 `data-chart-pending`、
  `data-chart-resolve-ms`；`chart-canvas` 的 `data-chart-update-ms`（`renderer.render/update`
  同步耗时，含 option 与 `setOption`）、`data-chart-update-count`、`data-chart-instances`
  （`activeChartInstanceCount()` 泄漏断言）。与 §16.1 的“图表渲染 2k 点 ≤200ms”配套。
- ECharts 的 `datazoom` / `legendselectchanged` 触发的状态发布按 `requestAnimationFrame` 合并
  （每帧最多一次 React 更新，总是发布最新状态）；工具栏动作仍立即发布，无 rAF 时同步发布。
  交互状态语义（瞬态、不入文档）不变（ADR-044）。

### 11.6 导出

- PNG：2x 像素比，背景可选透明/白/深；文件名 `<图标题>-<yyyyMMdd-HHmm>.png`。
- 导出前必须等待一次完整渲染；失败返回 `E_EXPORT_FAILED`。

**实现边界（T4.5，ADR-044）**：

- 文件名：`<清洗后的图标题>-<yyyyMMdd-HHmm>.png`（本地时间）；非法文件名字符替换为 `_`、
  去掉尾部点/空格、Windows 保留名加 `_`、截断到 80 个码点，空标题回退 `chart`。
- 背景三值沿用 `ChartPngBackground`：`transparent`/`light`（`#ffffff`）/`dark`（`#1e1e1e`）；
  倍率固定 2x，UI 不提供倍率选项；toolbox 不进入导出图（ADR-042）。
- 导出前由视图层 flush 120ms 防抖中的模型并等待两个动画帧，再调用同步 `toPNG`；失败在对话框
  内显示，不写半成品文件。
- 保存复用 `file:exportText`（§15.1），请求带 `encoding: 'base64'`；main 解码后原子写字节。
  不新增 IPC 通道，不改变 preload 白名单。

---

<a id="12"></a>
## 12. 工作区与布局

- 窗口默认 1440×900，最小 1024×700；居中启动；关闭时记住尺寸/位置到 `userData/window-state.json`，恢复时校验在可见屏幕内。
- 设置、最近列表、窗口状态存 `app.getPath('userData')`；工作区数据只存用户选择的 `*.cstudio` 目录。
- 主区域为可拖拽分栏，最多 4 个 pane；支持水平/垂直分割，比例 0.2..0.8。
- 每个 pane 内是标签页；标签可关闭、拖到另一个 pane（v1 可只做"移动到下一个 pane"菜单）。
- 视图类型：表格、图表；同一张表可以开多个表格视图（不同筛选/样式），同一张图只能有一个视图。
- 布局持久化到 `manifest.layout`；恢复失败（引用缺失/比例非法）回退单 pane 并提示。
- 关闭 pane 的最后一个标签 = 关闭 pane；至少保留 1 个 pane。
- 窗口尺寸/位置存 `userData/window-state.json`，不属于工作区。
- 未保存修改：关闭窗口/切换工作区前弹确认（保存/放弃/取消）。

**实现边界（T5.1，ADR-046）**：

- 主区域递归渲染 `LayoutNode`：pane 拥有独立标签栏与活动视图；split 用水平/垂直分隔条，
  比例为 0.2–0.8。pane 的 UI-only 路径（`root`、`root.0`、`root.1`…）不写 manifest。
- “水平/垂直分栏”把当前 pane 替换为 `split(原 pane, 空 pane)`（比例 0.5）并聚焦空 pane；
  分栏不自动创建/移动视图。最多 4 个 pane；第 5 个分栏被命令与 UI 同时拒绝。
- 标签按 v1 的“移动到下一分栏”在 pane 间移动；关闭最后一个标签会折叠空 pane，全部关闭时
  保留一个空根 pane。有标签的 pane 只能通过关闭标签结束；“关闭分栏”只对空 pane 可用。
- 比例拖拽在指针释放时提交一条 `view.layout`，键盘方向键每次 ±2%；纯布局变更（激活、分栏、
  移动、比例）以 500ms 去抖写 manifest，`Ctrl+S`/关闭工作区/保存队列 flush 会冲掉定时器；
  新建/删除/更新视图仍立即写。
- 每个 pane 的 `activeViewId` 持久化并在重启后恢复；最后聚焦的 pane 是 UI-only，不写 manifest
  （重启后焦点落在第一个有活动标签的 pane）。若要求恢复最后焦点，需新增字段与迁移。
- 打开时 layout 引用缺失/重复、比例非法或 pane 数 >4 回退单 pane（保留全部视图）并显示
  warning；见 §6.6 的实现边界。空 pane 复用 `data-testid="workspace-empty"`，pane 暴露
  `data-pane-path`/`data-pane-active`（不使用网格的 `data-active`）。
- **实现边界（T5.3，ADR-048）**：自动保存开启时，关闭窗口先走 §13.3 的退出握手（flush ≤3s）；
  失败或超时用“退出/取消”确认，取消后应用保持打开并保留重试入口。关闭/切换工作区在 flush 失败时
  保持工作区打开（等价于“取消”）并提示重试，不会静默丢数据。自动保存可关闭后的
  “保存/放弃/取消”三选一留给 T5.5 设置任务。
- **实现边界（T5.5，ADR-050）**：应用设置存 `userData/settings.json`
  （`{ version: 1, theme, locale, autosave, defaultTableStyleId }`），通过
  `app:settings`/`app:settings:update` 读写；主题/语言/自动保存以它为准，工作区 manifest 的
  `settings` 字段保留为创建时快照。默认表格样式是工作区数据：设置对话框在有工作区时复用
  `style.apply { target: 'default' }`（可撤销、只写 manifest），无工作区时写入应用设置并
  作为新工作区的种子。设置对话框从标题栏“设置”或命令面板打开，所有控件即时生效。

---

<a id="13"></a>
## 13. 命令、撤销、自动保存

### 13.1 命令

所有文档状态变更必须走命令总线：

| 命令 | 载荷 | 可撤销 |
|---|---|---|
| `table.cell.set` | tableId, rowId, columnId, value | 是 |
| `table.create` | table, view | 是 |
| `table.delete` | tableId | 是（级联需二次确认） |
| `table.rows.insert` | tableId, index, rows | 是 |
| `table.rows.delete` | tableId, rowIds | 是 |
| `table.paste` | tableId, anchor, matrix | 是 |
| `table.import` | tableId, mode, rows | 是 |
| `table.column.add/update/delete/reorder` | tableId, ... | 是（delete 需二次确认） |
| `table.meta.update` | tableId, name/primaryKey | 是 |
| `view.create/delete/update` | view | 是 |
| `view.layout` | LayoutNode（可选 `activePanePath`，UI-only） | 是（仅结构变更；纯焦点/标签切换不入历史） |
| `style.create/update/delete/apply` | style | 是 |
| `chart.create/update/delete` | chart | 是 |
| `workspace.rename` | name | 是 |

- 命令实现为纯函数：`(state, payload) => { nextState, patches, inversePatches }`（Immer `produceWithPatches`）。
- 异步副作用（磁盘写入）不进入命令；由状态订阅触发自动保存。
- 命令失败必须返回 `AppError`，不得部分修改状态。
- **实现边界（T5.1，ADR-046）**：`view.layout` 的可选 `activePanePath` 只是 UI 焦点地址
  （`root`/`root.0`/`root.1`…），不写 manifest、不参与撤销；纯布局变更的 manifest 写入
  由 500ms 去抖队列负责，见 §12。
- **实现边界（T2.3，ADR-029）**：T2.3 落地 `table.column.add/update/delete/reorder` 与
  `table.meta.update(primaryKey)`；结构命令同步执行、只产 patches，不进入 T2.2 的最小历史。`delete` 禁止
  删除主键；`reorder` 以 `columnIds` 精确排列重写 schema、每行 `values` 与该表所有视图的 `columnOrder`。
- **实现边界（T2.4，ADR-030）**：T2.4 落地 `table.paste { tableId, anchor, columnIds, matrix,
  newColumns? }` 与 `table.rows.insert { tableId, index, rows }`。`table.paste` 是唯一文档变更：
  同一条命令内完成覆盖/追加行、可选新增列、视图 `columnOrder` 同步；失败整批不发布。
  `table.rows.insert` 复用 `coerceCell` 与空 text 主键生成。两者都只产 patches，不进入
  `table.cell.set` 的 800ms 合并；粘贴用独立历史条目。
- **实现边界（T2.5，ADR-031）**：T2.5 落地 `table.import { tableId, mode, rows, newColumns? }`。
  命令在同一 Immer 事务内校验物理 Cell/行 ID/主键唯一性，追加或替换行、追加可选列、同步
  所有表视图 `columnOrder`，并更新 `rowCount/updatedAt`；失败返回 `AppError` 且不发布半成品。
  导入不参与 800ms 合并，一次导入一条历史；保存队列与 `committed: true` 语义同 T2.4。
- **实现边界（T2.6，ADR-032）**：`view.create/update` 校验筛选操作符/值类型、排序最多 3 层且
  列唯一、隐藏列属于 `columnOrder`；`table.paste` 增加可选 `rowIds/viewId` 并在命令内复核
  可见行/筛选未过期（§9.3）。`WorkspaceActions.duplicateView` 复用 `view.create`；视图状态
  变更只写 manifest，不进入撤销历史。
- **实现边界（T3.3，ADR-036）**：新增 `style.update { style }`，只接受 `sty_` 用户样式；
  `tableStyleSchema` 校验失败、`builtin.*`、不存在的样式或重复规则 id 都以 `E_VALIDATION`
  拒绝。命令只替换 `state.tableStyles[id]` 并更新 workspace `updatedAt`，不写表 JSONL；保存走
  新增的 manifest-only 队列。
- **实现边界（T3.4，ADR-037）**：新增 `style.create { style, viewId? }`，只接受新的 `sty_`
  用户样式；可在同一命令内把指定表视图的 `tableView.styleId` 指向副本。`style.create` 与
  `style.update` 都是 manifest-only、workspace 作用域历史；`style.create` 用于“编辑内置模板
  时懒 fork”，避免先改视图再补样式造成悬空引用或两条撤销。T3.4 不实现 `style.delete/apply`。
- **实现边界（T3.5，ADR-038）**：新增 `style.delete { styleId }` 与
  `style.apply { styleId, target }`；`style.apply` 的 `target` 为
  `{ kind: 'view', viewId }` 或 `{ kind: 'default' }`。`style.delete` 仅接受 `sty_`，在同一事务内
  回退所有引用视图与工作区默认；两条命令都只写 manifest、进入 workspace 作用域历史。
  模板另存为/复制/导入复用 `style.create`，重命名复用 `style.update`；`style.delete` 需要 UI
  二次确认，但撤销可恢复样式与视图引用。
- **实现边界（T4.4，ADR-043）**：新增 `chart.create { chart, view }`、`chart.update { chart }`、
  `chart.delete { chartId }`，均 manifest-only、workspace 作用域可撤销。`chart.create` 校验
  `chartSpecSchema`、表存在与映射/筛选/排序，并在同一事务内创建图表 + 首个视图入 layout；
  `chart.update` 只校验 schema 与表存在，**允许悬空列引用**以便修复，写入时覆盖 `createdAt`、
  刷新 `updatedAt`，标题变化同步该图表视图标题；`chart.delete` 级联删除图表视图与 layout 引用。
  复制/打开/重命名/删除由 `WorkspaceActions.duplicateChart/openChart` 组合上述命令实现
  （复制用新 `cht_`/`viw_` 与 ` (2)` 标题）。
- **实现边界（T5.2，ADR-047）**：`view.layout` 的“可撤销”只适用于结构变更（分栏、移动标签、
  比例、关闭 pane）；只改变 `activeViewId`/`activePanePath` 的标签/焦点切换是瞬态，不进入历史
  也不清空 redo。其余产生补丁的命令（表/行/列/视图/样式/图表/工作区）默认进入同一历史栈，
  不再维护命令白名单。

### 13.2 撤销/重做

- 历史栈上限 100 条或 256MB（以先到者为准）；新命令入栈时丢弃 redo 分支，超限丢弃最旧条目。大表导入/替换的逆补丁必须计入上限，禁止无限增长。
- 连续单元格编辑 800ms 内合并为一条；批量粘贴/导入为一条。
- 不进入历史：选择、滚动、活动标签、面板开合、窗口尺寸。
- 撤销只改内存文档状态；自动保存随后落盘。
- UI：Ctrl/Cmd+Z、Ctrl/Cmd+Shift+Z（macOS 也支持 Cmd+Y）；菜单显示可撤销命令名。
- **实现边界（T2.2，ADR-028）**：本任务先对 `table.cell.set` 实现最小历史栈（800ms 合并、上限 100 条、
  仅内存、打开/关闭工作区清空）；其余命令、菜单与跨命令合并由 T5.2 扩展，T5.2 必须复用该语义。
- **实现边界（T2.3，ADR-029）**：列结构命令不接入上述最小历史；T5.2 统一消费其
  `patches`/`inversePatches`，不得另起一套。
- **实现边界（T2.4，ADR-030）**：`table.paste` 接入最小历史，一次粘贴一条、不参与 800ms 合并；
  撤销/重做同时回滚新增行、新增列与所有覆盖单元格，并复用保存队列落盘。`table.rows.insert`
  仍不进入历史，T5.2 统一。
- **实现边界（T2.5，ADR-031）**：`table.import` 接入最小历史，一次导入一条、不参与 800ms
  合并；撤销/重做同时回滚追加/替换行与新增列，并复用保存队列。100k 逆补丁的内存上限由
  T5.2 统一评估，T2.5 不另起历史栈。
- **实现边界（T2.6，ADR-032）**：筛选/排序/隐藏列/列宽/冻结等视图状态变更不进入最小历史，
  只写 manifest；T5.2 统一全命令历史时再决定是否记录 `view.update` 及合并粒度。
- **实现边界（T3.3，ADR-036）**：`style.update` 进入最小历史，历史条目为 workspace 作用域
  （`tableId: null`）；undo/redo 通过 `onWorkspaceChanged` 调用 `enqueueManifest`，只写
  manifest、不标记脏表，一次规则提交一条记录。
- **实现边界（T3.4，ADR-037）**：样式编辑器的文本/数字/颜色控件在失焦/Enter 提交，下拉/
  复选框每次交互提交，规则表单保存一次提交；`style.create`（首次编辑内置模板）与
  `style.update` 各产生一条 workspace 作用域历史。撤销一次只回滚最近一次控件提交；
  编辑器内的撤销被对话框焦点范围隔离，需关闭编辑器后使用全局撤销。
- **实现边界（T3.5，ADR-038）**：`style.delete`/`style.apply` 各一条 workspace 作用域历史；
  删除的一次撤销同时恢复样式、视图 `styleId` 与工作区默认；导入/复制/另存为各是一条
  `style.create`，重命名是一条 `style.update`。模板管理对话框内的确认不产生额外历史。
- **实现边界（T4.4，ADR-043）**：`chart.create/update/delete` 各一条 workspace 作用域历史
  （`tableId: null`），undo/redo 只改内存文档并触发 manifest 保存；检查器每个控件一次提交对应
  一条记录（文本/数字失焦或 Enter、下拉/复选框每次交互）。复制图表是一条 `chart.create`，
  重命名为一条 `chart.update`，删除的一条撤销同时恢复图表、视图与 layout 引用。
- **实现边界（T5.2，ADR-047）**：历史条目统一消费 `CommandResult.patches/inversePatches`；
  只有 `table.cell.set` 在 800ms 内按同一 `mergeKey` 合并，且撤销后同一格的再次编辑不再并进旧
  条目。`view.layout` 只在布局树（忽略 `activeViewId`）变化时入栈，纯标签/焦点切换不入栈也不
  清 redo。上限为 100 条或**估算** 256MB（UTF-16 字符串 + 数组指针 + 行数组抽样；不使用
  `JSON.stringify` 序列化 100k 行）；超限从最旧 undo 条目开始丢弃，单条超限也会被丢弃。
  撤销/重做按补丁决定落盘：行补丁走表 + manifest，纯 manifest 命令（含删除表的 redo）只写
  manifest。Edit 菜单显示下一条可撤销命令名；打开/关闭工作区清空两个栈与 `ui.history`。
- **实现边界（T5.4，ADR-049）**：Ctrl/Cmd+Z、Ctrl/Cmd+Shift+Z、Ctrl/Cmd+Y 的撤销/重做语义
  不变，改由 renderer 的统一键位注册表分发（§13.4）；`view.layout`/保存仍走原命令与
  `SaveQueue`，keymap 只调用既有 `core.actions`，不产生新的文档命令或历史条目。

### 13.3 自动保存

- 默认开启；最后一次变更后 1500ms 触发，最长 10s 强制触发。
- 只写脏表 + manifest；串行队列，避免并发写同一文件。
- 状态指示：已保存 / 保存中 / 保存失败（可重试）。
- 手动保存：Ctrl/Cmd+S 立即 flush 所有脏表 + manifest，并同步状态指示。
- 退出前 flush，最多等 3s；超时弹确认。
- 写失败不得丢内存数据；下次变更重试，状态栏持续告警。
- **实现边界（T2.2，ADR-028）**：单元格提交成功后立即异步保存该表并写 manifest（按表串行、失败保留
  dirty 并可重试），关闭工作区前 flush ≤3s。T5.3 的 1.5s 自动保存必须复用/替换该队列，不得并存两条
  写盘路径；状态栏“保存中/已保存/保存失败”在 T2.2 已可用。
- **实现边界（T2.3，ADR-029）**：改变行数据的结构命令复用该队列（表 → manifest）；只改 schema 的命令
  （label/key/role、required、枚举选项、换主键、空表增删/重排）只写 manifest，避免空表创建 0 字节文件。
- **实现边界（T2.4，ADR-030）**：`table.paste` 与 `table.rows.insert` 属于行数据命令，成功后按表
  入队（表 → manifest）；粘贴 action 等待 flush ≤3s，失败返回 `committed: true` 并可重试。
  dispatch 前预检 200k 行上限；256MB 文件上限仍由写盘守卫在编码后强制。
- **实现边界（T2.5，ADR-031）**：`table.import` 成功后按表入队（表 → manifest），action 等待
  flush ≤3s；失败返回 `committed: true`。dispatch 前由 `planImport`/命令检查 200k 行上限；
  100,001–200,000 行在提交前显式确认。256MB 仍由 `table:write` 写盘守卫强制。
- **实现边界（T5.3，ADR-048）**：
  - `SaveQueue` 统一实现 1.5s trailing 去抖（最后一次变更后）与 10s 上限（第一次待写变更起）；
    `flush()`/`retry()` 取消定时器并立即写。布局的 500ms 去抖仍只调用 `enqueueManifest()`，
    Ctrl/Cmd+S、关闭工作区与退出握手复用同一个 `flush()`，不存在第二条写盘路径。
  - 退出：main 拦截 `BrowserWindow.close`/`before-quit`，发送 `app:quit-requested`；渲染进程
    `flushSaves()`（队列 3s 超时）成功后释放工作区（删除 `.lock`）并回复
    `app:quit-response { action, flushed }`。main 在 `flushed: false` 或 3s 超时时显示原生
    “退出/取消”确认；取消保持应用打开，确认退出才继续，因此不会永久阻塞 `before-quit`。
  - flush 失败后确认退出会**保留** `.lock`，下次启动按 §7.5 提示“上次未正常退出”。
  - 状态栏继续显示“已保存/保存中…/保存失败（重试）”；强制退出是否丢数据以恢复对话框的
    “最后 1.5 秒内尚未落盘的修改可能已丢失”提示为准。
  - 应用使用 `app.requestSingleInstanceLock()`；第二个实例聚焦已有窗口后退出。
- **实现边界（T5.5，ADR-050）**：
  - 自动保存开关来自 `settings.json`；关闭时 `SaveQueue` 不安排 1.5s/10s 定时器，只入队并发布
    `status: 'unsaved'` + `unsaved: true`。Ctrl/Cmd+S、显式 action（粘贴/导入/样式/图表提交）
    与退出握手的 `flush()`/`retry()` 仍立即写；状态栏显示“自动保存：已关闭 / 有未保存修改”。
  - 关闭窗口/关闭工作区时若自动保存关闭且存在未保存修改，renderer 显示
    “保存并继续 / 放弃修改 / 取消”；保存走原 `flush()` + `workspace.close`，放弃直接
    `closeWorkspace({ save: false })`（不 flush、删 `.lock`），取消保持打开并回复
    `app:quit-response { action: 'cancel' }`。
  - main 的退出握手超时动态化：自动保存开启 3s；关闭时 60s（`UNSAVED_QUIT_TIMEOUT_MS`），
    避免原生确认在用户阅读三选一对话框时弹出。
  - 强杀仍可能丢失最后窗口内的修改；恢复对话框的提示语义不变。

### 13.4 快捷键与命令面板

> 实现边界（T5.4，ADR-049）。快捷键是 renderer 的**应用命令**入口，不是文档命令总线的新层：
> keymap 只调用既有 `core.actions`/Shell 回调，不产生 Immer patches、不写 manifest。

- **注册表**：`apps/desktop/src/renderer/features/keymap/` 的 `APP_COMMANDS` 声明
  `{ id, labelKey, shortcuts, scopes, visibleInPalette, isEnabled, run }`。作用域名：
  - `global`：任何界面；
  - `workspace`：已打开工作区；
  - `grid`：活动视图是数据表；
  - `chart`：活动视图是图表。
- **快捷键表**：

  | 命令 | 快捷键 | 作用域 |
  |---|---|---|
  | 打开命令面板 | Ctrl/Cmd+K | global |
  | 键盘快捷键（帮助） | F1 | global |
  | 设置 | —（仅面板） | global |
  | 插件 | —（仅面板） | global |
  | 立即保存 | Ctrl/Cmd+S | workspace |
  | 切换侧栏 | Ctrl/Cmd+B | global |
  | 切换检查器 | Ctrl/Cmd+Alt+I | global |
  | 撤销 | Ctrl/Cmd+Z | workspace |
  | 重做 | Ctrl/Cmd+Shift+Z、Ctrl/Cmd+Y | workspace |
  | 关闭当前视图 | Ctrl/Cmd+W | workspace |
  | 复制当前视图 | Ctrl/Cmd+Shift+D | grid |
  | 复制当前图表 | Ctrl/Cmd+Shift+D | chart |
  | 水平分栏 | Ctrl/Cmd+Alt+H | workspace |
  | 垂直分栏 | Ctrl/Cmd+Alt+V | workspace |
  | 关闭当前分栏 | Ctrl/Cmd+Alt+W | workspace |
  | 移动标签到下一分栏 | Ctrl/Cmd+Alt+M | workspace |
  | 浅色/深色/跟随系统主题 | —（仅面板） | global |

- **分发优先级**：局部组件（网格、单元格编辑器、标签栏、分隔条、Menu/Dialog/Tabs）先处理；
  全局监听在 `window` 冒泡阶段，遇到 `event.defaultPrevented`、`event.repeat`、`isComposing` 或
  可编辑/对话框目标时忽略。`global`/`workspace`/`grid`/`chart` 只决定命令可用上下文，不把局部
  按键收进注册表。
- **冲突检测**：快捷键归一化后，若两个命令的作用域上下文有交集（`global` 与所有、`workspace`
  与 `workspace/grid/chart`，`grid` 与 `chart` 不相交）且键位相同，构造 keymap 时抛
  `KeymapConflictError`。同一快捷键可在互斥的 `grid`/`chart` 中复用。
- **不可用原因**：`isEnabled` 返回结构化 reason（无工作区、无活动视图、非数据表、非图表、
  无可撤销、无可重做、分栏上限、最后一个分栏、分栏非空、无其他分栏、主题已是当前值）；
  快捷键分发、命令面板与帮助共用同一判定，文案走消息表。
- **命令面板**：Ctrl/Cmd+K 打开，复用 `@curve/ui` 的 `Dialog`（焦点陷阱/Esc/焦点恢复）+
  `Input` + `role="listbox"`/`role="option"`（`aria-activedescendant`）。模糊搜索是标签与
  命令 id 的子序列匹配（不新增依赖）；空查询按最近使用优先，非空按分数并以免最近使用打破平局；
  禁用命令仍列出并显示原因，Enter 不执行。↑/↓/Home/End/Enter/Esc 与鼠标悬停/点击可用。
- **最近使用**：最多 8 条，存 `localStorage['curve-studio.recent-commands']`，属于 UI 偏好，
  **不写工作区 manifest**；缺失/损坏/存储不可用时回退空列表，且只在打开面板时读取。
- **插件命令（T6.3，ADR-054）**：面板同时列出 `commands` 注册表的插件命令（插件提供的 `label`
  + 来源徽标，`data-command-source="plugin"`），内置 id 优先、插件不能遮蔽内置命令。插件命令
  没有快捷键与作用域；执行时提供 `PluginCommandContext`（`log` 写环形日志，`execute` 派发应用
  命令），抛错只产生带插件名的错误 toast，不改文档。
- **渲染稳定性**：`AppShell` 不订阅文档 store；keymap 在按键时读取最新 state，面板打开时快照
  命令可用性并只在此期间挂载，执行前再复查。该约束保证 T4.6 的 100k 图表切换 private ≤600MB
  门禁不被常驻面板/整壳重渲染拖累。
- **帮助**：`HelpDialog` 的快捷键表由同一注册表生成（含平台化 Ctrl/Cmd 显示）。
- **不改变**：不新增 IPC/preload、manifest 字段、`formatVersion`、JSONL 格式或运行时依赖；
  网格/CellEditor/TabBar/分隔条/Dialog/Menu/Tabs 的既有键盘契约与撤销/保存语义不变。
- **边界**：新建表/导入/筛选/导出 CSV/图表向导等由功能组件持有的对话框不进入 T5.4 面板；
  把它们提升为全局命令需要 renderer 命令注册上下文（复核条件见 ADR-049）。

---

<a id="14"></a>
## 14. 扩展系统

### 14.1 插件形态（v1）

- 插件是**编译期静态导入**的模块；v1 **不加载**运行时下载的代码。
- 内置插件在 `apps/desktop/src/renderer/plugins/index.ts` 注册；示例插件在 `plugins/plugin-sample/`。
- 每个插件导出 `PluginDefinition`，由宿主在启动时 `activate`。
- 插件异常必须隔离：单个插件激活失败 → 记日志、标记禁用、应用继续启动。
- T6.2：示例插件 `@curve/plugin-sample` 实现 `rating` 语义字段类型与 `points` 导入器；渲染进程
  组装点在**首帧渲染前** `activateAll()`，UI 通过宿主注册表读取贡献（T6.2 只接字段类型与导入器，
  其余贡献点与来源标识/错误边界在 T6.3）。
- T6.2：主进程也需要解析 `fieldTypeId`（§14.3），因此只读取插件包导出的字段类型定义建立
  “字段类型 → storageType”映射；主进程**不激活**插件、不执行插件代码。两个进程共用同一份定义。
- T6.3：`apps/desktop/src/renderer/plugins/builtins.ts` 把 §14.4 的四类内置贡献（5 种字段类型、
  CSV/TSV 与 JSON 导入器、line/scatter/bar 图表类型）通过宿主注册表注册；存储类型选择器、语义
  类型、导入器与图表类型列表**只读注册表**，不再有 UI 内的硬编码列表。插件贡献在选项/命令上带
  来源标识；贡献调用抛错被隔离为带插件名的 toast（可跳转插件日志），不修改文档；插件管理器可
  **会话级**禁用/启用插件（不写 `settings.json`/manifest），注册表订阅只在相关表面打开时存在。
  命令注册表只承载插件命令，内置命令目录仍是 §13.4 的 `APP_COMMANDS`（ADR-054）。

### 14.2 契约

字段类型 id 使用反向域名（例如 `com.curvealmanac.rating`），不得与五种内置存储类型重名；
`ImporterDef.parse` 在渲染进程执行（插件是渲染进程模块）：渲染进程解码文件文本并调用
`parse`，再把 `ImportResult` 转成导入管线的 `ParsedImportData`；内置 CSV/JSON 仍由导入 Worker
解析（T6.2、ADR-053）。

```ts
// packages/plugin-sdk/src/index.ts
export type ContributionSource =
  | { readonly kind: 'builtin' }
  | { readonly kind: 'plugin'; readonly pluginId: string };

export interface RegistryEntry<T> {
  readonly id: string;
  readonly def: T;
  /** T6.1/ADR-052: who registered the contribution (builtin or a plugin). */
  readonly source: ContributionSource;
}

export interface Registry<T> {
  register(id: string, def: T): () => void;
  replace(id: string, def: T): void;
  get(id: string): T | undefined;
  list(): ReadonlyArray<RegistryEntry<T>>;
  /** T6.1/ADR-052: synchronous notification after every mutation. */
  subscribe(listener: (entries: ReadonlyArray<RegistryEntry<T>>) => void): () => void;
  dispose(): void;
}

export interface PluginLogger {
  info(message: string, detail?: unknown): void;
  warn(message: string, detail?: unknown): void;
  error(message: string, detail?: unknown): void;
}

export interface PluginDefinition {
  id: string;                  // 反向域名，如 "com.curvealmanac.sample"
  name: string;
  version: string;             // semver
  apiVersion: string;          // 宿主 API 版本，v1 = "1.0"
  permissions?: string[];      // v2 预留；v1 忽略但保留字段
  activate(ctx: PluginContext): void | Promise<void>;
  deactivate?(): void | Promise<void>;
}

export interface PluginContext {
  readonly apiVersion: '1.0';
  readonly fields: Registry<FieldTypeDef>;
  readonly importers: Registry<ImporterDef>;
  readonly chartKinds: Registry<ChartKindDef>;
  readonly commands: Registry<CommandDef>;
  readonly log: PluginLogger;
}

export interface FieldTypeDef {
  id: string;                  // 不得与内置冲突
  label: string;
  storageType: BuiltinColumnType;  // 物理存储类型；决定 JSONL 中的 Cell 形态
  parseText(raw: string): { ok: true; value: Cell } | { ok: false; message: string };
  format(value: Cell, ctx: { locale: string; precision?: number; unit?: string }): string;
  validate(value: Cell, column: ColumnDef): string | null;
  compare(a: Cell, b: Cell): number;
  defaultWidth: number;
}

export interface ImporterDef {
  id: string;
  label: string;
  extensions: string[];        // [".csv"]
  parse(input: ImportInput, signal: AbortSignal): Promise<ImportResult>;
}

export type ImportCellValue = string | number | boolean | null;
export type ImportColumnType = 'text' | 'number' | 'date' | 'boolean';

/** T6.1/ADR-052: structurally compatible with table-engine's ImportDataset. */
export interface ImportResult {
  headers: string[];
  rows: ImportCellValue[][];
  columns?: { name: string; type: ImportColumnType }[];
  warnings?: string[];
}

export interface ImportInput {
  fileName: string;
  text: string;
  locale: 'zh-CN' | 'en-US';
}

export interface ChartKindDef {
  id: string;
  label: string;
  seriesType: 'line' | 'scatter' | 'bar';  // v1 映射到 ECharts series
  defaults?: Partial<ChartOptions>;
}

export interface CommandDef {
  id: string;                  // "plugin.<id>.<action>"
  label: string;
  run(ctx: PluginCommandContext): Promise<void>;
}

export interface PluginCommandContext {
  readonly log: PluginLogger;
  execute(commandId: string, payload: unknown): Promise<void>;
}
```

### 14.3 注册表语义

- 字段类型额外约束：`storageType` 必须是 5 种内置存储类型之一；`ColumnDef.fieldTypeId` 必须与 `column.type` 匹配。语义类型只改变解析、校验与格式化，不改变 JSONL 物理形态。注册表在登记时校验 `storageType` 与必需函数（T6.1，ADR-052）。
- `register(id, def)`：任何已存在的 id（包括调用者自己的）抛 `E_PLUGIN_INVALID`；返回只移除该条贡献的 disposer。
- `replace(id, def)`：目标必须存在，且贡献者必须是调用者自己（内置只能由宿主替换）；跨插件或替换内置抛 `E_PLUGIN_INVALID`。
- `list()` 返回稳定顺序：内置在前，插件按注册顺序；`replace` 保持原位置。每项含 `source`（`builtin` 或 `pluginId`），供 UI 标注来源与报错。
- `subscribe(listener)`：每次变更后同步通知，参数为当前 `list()` 快照；返回幂等的取消订阅函数。监听器异常被隔离，不影响注册与其他监听器。
- `dispose`：宿主视图清空全部贡献并关闭注册表（之后 `register/replace` 抛 `E_PLUGIN_INVALID`）；插件视图只移除该插件自己的贡献。插件 `deactivate` 后移除其全部贡献，UI 不得残留引用。
- 宿主校验 `apiVersion` 主版本 = 1；不兼容 → 禁用插件并提示，不影响其他插件。
- 单个插件 `activate` 抛错/拒绝时，宿主回滚该插件已注册的贡献并标记禁用（`E_PLUGIN_ACTIVATE`），继续激活其他插件；插件 id 重复/定义非法为 `E_PLUGIN_INVALID`。禁用列表在 T6.1 只存在于宿主内存并写日志，不持久化（手动禁用/持久化见 T6.3）。
- 注册表本身是纯数据 + 订阅，不依赖 React；`@curve/plugin-sdk` 只依赖 `@curve/domain`。
- **`fieldTypeId` 的解析点（T6.2，ADR-053）**：主进程在载入/写入 manifest 时用**编译进包**的
  字段类型映射校验（未知类型或 `storageType !== column.type` → 拒绝并给 `E_WS_INVALID_MANIFEST`）；
  渲染进程用**实际激活**的插件注册表做单元格解析/校验/格式化（§9.2 的编辑器与命令层共用同一
  套规则）。没有注册表的调用方只能给 warning，不得静默接受。
- **插件导入器的执行位置（T6.2，ADR-053）**：`ImporterDef.parse` 在渲染进程执行；它产出的
  `ImportResult` 转成 `ParsedImportData` 后按与导入 Worker 相同的载荷规划。内置 CSV/JSON 的
  解码、解析与规划仍在 Worker 中，插件不得绕过该边界。
- 语义类型只在**列的存储类型未变**时保留；改变存储类型会清空 `fieldTypeId`（ADR-015）。用户可在
  列对话框中显式清除语义类型（`ColumnDraft.fieldTypeId = null`）。
- 列表面板显示字段类型的 label（插件提供、不本地化）；网格、自动列宽与样式预览都使用该类型
  的 `format`，CSV 导出仍用存储格式化（导出接语义类型另议）。
- **内置贡献与存储类型列表（T6.3，ADR-054）**：内置字段类型的 id **就是**存储类型名
  （`text`/`number`/`date`/`boolean`/`enum`），由宿主以 `builtin` owner 注册；列对话框的
  “存储类型”只列内置字段类型，“语义类型”只列 `source.kind === 'plugin'` 且 `storageType`
  匹配的条目。`ColumnDef.fieldTypeId` 因此**从不**指向内置 id（主进程 resolver 只认识插件
  字段类型，写入内置 id 会被 §14.3 的严格校验拒绝）。
- **来源标识（T6.3）**：UI 从 `RegistryEntry.source` 取贡献者；插件标签追加
  `{label}（插件：{plugin}）`，命令面板条目另带来源徽标与 `data-command-source`。内置标签按
  id 走消息表（`columns.type.*`、`chart.kind.*`），插件文案不本地化。
- **错误隔离与日志（T6.3）**：`format`（网格/自动列宽/样式预览）、插件导入器 `parse` 与插件
  命令 `run` 的抛错必须被调用方捕获：归一化为 `AppError`、按 `pluginId+code+message` 在 2 秒内
  去重、写入内存环形日志（最多 200 条，不落盘），并发布事件让 Shell 弹一条**带插件名**的错误
  toast，其“查看插件日志”动作打开插件管理器并聚焦日志。格式化失败回退存储格式化；导入失败保留
  文件并继续显示导入器下拉（可切回内置解析器）；命令失败不产生任何文档变更。其它插件与内置
  功能不受影响。
- **手动禁用（T6.3）**：插件管理器对每个插件提供“禁用/启用”，分别调用宿主 `deactivate`/
  `activate`（先运行 hook，再移除/重建贡献）。禁用是**会话级**的：不写 `settings.json`、
  不写 manifest；重启后重新尝试激活。UI 用 `subscribe` 刷新，且订阅只在对应表面打开时存在
  （关闭的对话框不常驻监听）。
- **插件命令（T6.3）**：`commands` 注册表只承载插件命令，内置命令目录仍是 §13.4 的
  `APP_COMMANDS`（快捷键/作用域/可用性/文案的唯一来源）。命令面板合并两者，内置 id 优先；
  运行插件命令时提供 `PluginCommandContext`：`log` 写入同一环形日志（`[plugin:<id>]` 前缀），
  `execute(commandId, payload)` 派发应用命令并在失败时抛出 `AppError`。插件命令没有快捷键与
  作用域（v1 `CommandDef` 不定义）。
- **内置导入器的解析位置（T6.3）**：内置导入器登记为 `builtin.csv`/`builtin.json`；向导选中
  内置条目时通过 `ImportOpenPayload.format`（渲染进程 ↔ import Worker 的内部协议，非 §15 通道）
  强制 Worker 的解析器（`auto` 保持扩展名嗅探），内置文件仍不在渲染进程解析。

### 14.4 内置贡献点

内置贡献与插件贡献走**同一个注册表**（T6.3，ADR-054）：`registerBuiltinContributions` 在插件
激活前用宿主视图注册，`list()` 里内置在前。

| 类型 | 内置 | 注册 id |
|---|---|---|
| 字段类型 | number、text、date、boolean、enum | 存储类型名本身 |
| 导入器 | CSV/TSV、JSON | `builtin.csv`、`builtin.json` |
| 图表类型 | line、scatter、bar | `ChartSpec.kind` 值 |
| 命令 | 见 §13.1 | 不进入注册表：内置命令目录是 §13.4 的 `APP_COMMANDS`；`commands` 注册表只
承载插件命令 |

- 插件图表类型是**预设**：`ChartKindDef.seriesType` 映射到 v1 的三种 `ChartSpec.kind`，
  `defaults` 在建图时合并进 `ChartOptions`；`ChartSpec` 不持久化预设 id（ADR-054 复核条件）。

### 14.5 v2 预留（不在 v1 实现）

动态 ES 模块加载、沙箱 Worker、插件权限声明、插件市场、签名校验。v1 的注册表与 manifest 必须为这些留出 `permissions?: string[]` 字段（可为空，不实现）。

---

<a id="15-ipc-契约"></a>
## 15. IPC 契约

### 15.1 通道

| 通道 | 方向 | 请求 | 响应 |
|---|---|---|---|
| `app:info` | R→M | `{}` | `{ version, platform, locale, documentsDir }` |
| `app:settings` | R→M | `{}` | `{ version, theme, locale, autosave, defaultTableStyleId }` |
| `app:settings:update` | R→M | `{ settings }` | 规范化后的 `settings` |
| `app:quit-requested` | M→R | `{ reason: 'window-close' \| 'app-quit' }` | —（事件，无回复） |
| `app:quit-response` | R→M | `{ action: 'quit' \| 'cancel', flushed: boolean }` | `{ ok: true }` |
| `dialog:pickDirectory` | R→M | `{ title?, defaultPath? }` | `{ path } \| null` |
| `dialog:saveFile` | R→M | `{ suggestedName, filters }` | `{ path } \| null` |
| `workspace:create` | R→M | `{ dir, name }` | `WorkspaceManifest` |
| `workspace:open` | R→M | `{ dir, recovery? }` | `{ manifest, warnings }` |
| `workspace:inspect` | R→M | `{ dir }` | `WorkspaceInspection` |
| `workspace:close` | R→M | `{ workspaceId }` | `{ ok: true }` |
| `workspace:recent` | R→M | `{}` | `RecentEntry[]` |
| `workspace:recent:remove` | R→M | `{ path }` | `{ ok: true }` |
| `workspace:recent:clear` | R→M | `{}` | `{ ok: true }` |
| `table:read` | R→M | `{ workspaceId, tableId }` | `{ jsonl, bytes }` |
| `table:write` | R→M | `{ workspaceId, tableId, jsonl }` | `{ bytes }` |
| `table:trash` | R→M | `{ workspaceId, tableId }` | `{ ok: true }` |
| `manifest:write` | R→M | `{ workspaceId, manifest }` | `{ ok: true }` |
| `file:importText` | R→M | `{ filters }` | `{ token, name, bytes, sha256, size, format } \| null` |
| `file:exportText` | R→M | `{ suggestedName, content, encoding?, filters }` | `{ path } \| null` |
| `file:exportCsv` | R→M | `ExportCsvRequest`（op: begin/append/finish/cancel） | `ExportCsvReply \| null` |
| `file:archiveImport` | R→M | `{ workspaceId, token, tableId, mode, name, sha256, size, encoding, format }` | `{ copied, archivePath, sidecarPath }` |
| `backup:list` | R→M | `{ workspaceId, tableId }` | `BackupEntry[]` |
| `backup:restore` | R→M | `{ workspaceId, tableId, backupPath }` | `{ ok: true }` |
| `log:write` | R→M | `{ level, message, detail? }` | `{ ok: true }` |

- `workspace:create` 的 `dir` 是父目录；main 在其下创建 `<清洗后的 name>.cstudio`。根已存在返回
  `E_WS_BUSY`；名称清洗后为空返回 `E_VALIDATION`（ADR-020）。
- `workspace:recent` 只读 `userData/recent.json`，不自动重新授权；打开仍需 `workspace:open`。
  `workspace:recent:remove` 按路径（Windows 大小写不敏感）移除一条，`workspace:recent:clear`
  写回空数组；两者都为辅助数据，文件缺失/损坏时重建（T5.3，ADR-048）。
- `workspace:inspect`（T5.3，ADR-048）是只读预检：返回
  `{ dir, name, lock, manifest, errorCode?, backups }`，其中 `backups` 是
  `backups/manifest.<timestamp>.json.bak` 的 `{ path, createdAt, bytes }[]`（新→旧）。它不写任何文件，
  供渲染进程在打开前提供“尝试恢复/直接打开/从备份重建”。
- `workspace:open` 的 `recovery` 可选字段为
  `{ acceptStaleLock?: boolean, manifestBackup?: string }`：`manifestBackup` 是 `workspace:inspect`
  返回的 workspace-relative 备份路径；main 先校验再备份当前 manifest、原子重建后打开。
  `acceptStaleLock` 只在 stale/corrupt 锁且当前 manifest 不可读时尝试最新备份。active lock 仍返回
  `E_WS_LOCKED`；取消恢复不写文件（ADR-048）。
- `app:quit-requested` 是 main → renderer 的唯一事件通道（T5.3，ADR-048）；preload 只暴露
  `app.onQuitRequested(handler)` 订阅，不暴露 `ipcRenderer`。`app:quit-response` 由渲染进程在
  flush 完成后调用；`flushed: false` 或 3s 无响应时 main 显示原生确认，取消则保持应用打开。
- `app:settings`（T5.5，ADR-050）返回 `userData/settings.json` 的内存副本；文件缺失/损坏时逐字段
  回退默认值。`app:settings:update` 只接受完整的 `AppSettings`（Zod 严格校验），main 规范化后
  原子写入（临时文件 + fsync + rename）并串行化并发写；不接收路径。自动保存关闭时退出握手超时
  放宽到 60s，避免原生确认打断“保存/放弃/取消”对话框。
- 所有响应统一包装：`{ ok: true, data } | { ok: false, error: AppError }`。
- main 端任何异常都转成 `AppError`，不得把堆栈直接抛给 renderer。
- `table:read/write` 不接受绝对路径，只接受 `workspaceId + tableId`；main 从内部映射解析路径。
- `table:read` 在表文件缺失时的语义见 §7.5 与 ADR-022：`rowCount === 0` 返回空表，否则
  `E_TABLE_NOT_FOUND`。
- `table:trash` 只按 `workspaceId + tableId` 移动文件；T2.1 的删除顺序是“写 manifest → trash”，
  因此该通道不要求表条目仍在 manifest 中（ADR-027）。
- `table:write` 在写盘前校验 §2.2 的行数（200,000）与字节（256 MB）上限，超限返回 `E_TABLE_LIMIT`，
  不落盘、不备份。
- 单次 IPC 载荷上限 256MB；超过返回 `E_PAYLOAD_TOO_LARGE`。
- `file:importText` 只返回用户通过原生对话框选择的文件；main 在读取前检查 `.csv/.tsv/.json`
  扩展名与 100MB 上限。`token` 是不透明随机值，`file:archiveImport` 只能使用该 token 对应的
  路径，不能读取任意路径。`bytes` 为原始字节（T2.5，ADR-031）。
- `file:archiveImport` 在提交前把源文件归档到工作区 `imports/`；≤50MB 复制并写 sidecar，
  >50MB 只写 sidecar（原始路径 + SHA-256）。路径/工作区由 main 校验，renderer 不传绝对路径。
- `file:exportCsv`（T3.6，ADR-039）：`begin` 显示保存对话框并创建临时文件，返回不透明
  `token` 与目标路径；`append { token, chunk }` 顺序追加（单块 ≤8MB）；`finish { token, rows }`
  `fsync` 后 rename，返回 `{ path, bytes, rows }`；`cancel { token }` 删除临时文件。
  `append/finish/cancel` 只接受 token，不接受路径；保存对话框取消时 `begin` 返回 `null`。
  未完成的临时文件在 `before-quit` 清理。
- `file:exportText`（T3.5，T4.5 扩展）：`encoding` 缺省 `utf8`，`base64` 时 main 把 `content`
  解码为字节后原子写，供 PNG 导出复用（ADR-044）；仍使用同一个保存对话框与取消语义，
  `filters` 决定可保存的扩展名，不新增通道。

### 15.2 路径白名单

- `workspace:create/open` 成功后，main 把 `realpath(dir)` 加入 `allowedRoots`。
- 每次文件操作：`realpath(target)` 必须 `startsWith(root + sep)`；否则 `E_PATH_DENIED`。
- `workspace:close` 从白名单移除。
- 最近列表只存路径与名称，不自动重新授权；打开时仍需用户确认。

### 15.3 窗口与安全

```ts
new BrowserWindow({
  webPreferences: {
    preload: join(__dirname, '../preload/index.cjs'),
    contextIsolation: true,
    nodeIntegration: false,
    sandbox: true,
    webSecurity: true,
    devTools: isDev, // 仅 electron-vite dev；生产构建为 false
  },
});
```

- preload 输出 CJS（`sandbox: true` 不支持 ESM preload）；因根 `package.json` 为 `"type": "module"`，
  产物使用 `.cjs` 扩展名。
- 拒绝 `will-navigate`；`setWindowOpenHandler` 一律 `{ action: 'deny' }`。
- CSP（生产）：

```html
<meta http-equiv="Content-Security-Policy"
      content="default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline';
               img-src 'self' data: blob:; font-src 'self' data:; connect-src 'self'">
```

开发模式在 `script-src` 额外允许 `'unsafe-inline'`（`@vitejs/plugin-react` 的 Fast Refresh 前置脚本为内联），
并在 `connect-src` 额外允许 `ws://localhost:*` 与 `http://localhost:*`；这些额外项不得出现在生产策略中
（实现与验证见 ADR-018）。CSP 由 renderer 构建插件注入 `<meta>`，生产产物中只有生产策略。

**E2E 对话框替身**：仅当 `app.isPackaged === false` 且 `process.env.CURVE_E2E === '1'` 时，main 可以按 `TESTPLAN §1.1` 返回固定路径，避免驱动原生对话框。生产构建必须短路该分支；安全测试必须验证打包后环境变量无效。

### 15.4 Preload API

```ts
// window.api（只暴露这些）
export type IpcResult<T> = { ok: true; data: T } | { ok: false; error: AppError }; // AppError 见 §18

export interface AppInfo {
  version: string;
  platform: string;
  locale: string;
  /** OS documents directory; the welcome page derives its default parent from it. */
  documentsDir: string;
}
export interface AppSettings {
  version: 1;
  theme: 'light' | 'dark' | 'system';
  locale: 'zh-CN' | 'en-US';
  autosave: boolean;
  defaultTableStyleId: string;
}
export interface RecentEntry { path: string; name: string; lastOpenedAt: string }
export interface BackupEntry { path: string; createdAt: string; bytes: number }
export interface FileFilter { name: string; extensions: string[] }
export interface SaveFileReq { suggestedName: string; filters: FileFilter[] }
export interface ImportTextReq { filters: FileFilter[] }
export interface ImportTextReply {
  token: string;
  name: string;
  bytes: Uint8Array;
  sha256: string;
  size: number;
  format: 'csv' | 'json';
}
export interface ExportTextReq { suggestedName: string; content: string; filters: FileFilter[] }
export type ExportCsvReq =
  | { op: 'begin'; suggestedName: string; filters: FileFilter[] }
  | { op: 'append'; token: string; chunk: string }
  | { op: 'finish'; token: string; rows: number }
  | { op: 'cancel'; token: string };
export type ExportCsvReply =
  | { op: 'begin'; token: string; path: string }
  | { op: 'append'; bytes: number }
  | { op: 'finish'; path: string; bytes: number; rows: number }
  | { op: 'cancel'; removed: boolean };
export interface ArchiveImportReq {
  workspaceId: string;
  token: string;
  tableId: string;
  mode: 'append' | 'replace';
  name: string;
  sha256: string;
  size: number;
  encoding: string;
  format: 'csv' | 'json';
}
export interface ArchiveImportReply {
  copied: boolean;
  archivePath: string | null;
  sidecarPath: string;
}
export interface PickDirectoryReq { title?: string; defaultPath?: string }
export interface WorkspaceRecoveryChoice {
  acceptStaleLock?: boolean;
  manifestBackup?: string;
}
export interface WorkspaceInspection {
  dir: string;
  name: string | null;
  lock: 'none' | 'active' | 'stale' | 'corrupt';
  manifest: 'ok' | 'missing' | 'invalid' | 'unsupported';
  errorCode?: string;
  backups: BackupEntry[];
}
export interface QuitRequest { reason: 'window-close' | 'app-quit' }
export interface QuitResponse { action: 'quit' | 'cancel'; flushed: boolean }

interface CurveApi {
  app: {
    info(): Promise<IpcResult<AppInfo>>;
    settings(): Promise<IpcResult<AppSettings>>;
    updateSettings(settings: AppSettings): Promise<IpcResult<AppSettings>>;
    onQuitRequested(handler: (request: QuitRequest) => void): () => void;
    respondToQuit(answer: QuitResponse): Promise<IpcResult<{ ok: true }>>;
  };
  dialog: {
    pickDirectory(req: PickDirectoryReq): Promise<IpcResult<{ path: string } | null>>;
    saveFile(req: SaveFileReq): Promise<IpcResult<{ path: string } | null>>;
  };
  workspace: {
    create(req: { dir: string; name: string }): Promise<IpcResult<WorkspaceManifest>>;
    open(req: { dir: string; recovery?: WorkspaceRecoveryChoice }): Promise<IpcResult<{ manifest: WorkspaceManifest; warnings: string[] }>>;
    inspect(req: { dir: string }): Promise<IpcResult<WorkspaceInspection>>;
    close(req: { workspaceId: string }): Promise<IpcResult<{ ok: true }>>;
    recent(): Promise<IpcResult<RecentEntry[]>>;
    recentRemove(req: { path: string }): Promise<IpcResult<{ ok: true }>>;
    recentClear(): Promise<IpcResult<{ ok: true }>>;
  };
  table: {
    read(req: { workspaceId: string; tableId: string }): Promise<IpcResult<{ jsonl: string; bytes: number }>>;
    write(req: { workspaceId: string; tableId: string; jsonl: string }): Promise<IpcResult<{ bytes: number }>>;
    trash(req: { workspaceId: string; tableId: string }): Promise<IpcResult<{ ok: true }>>;
  };
  manifest: { write(req: { workspaceId: string; manifest: WorkspaceManifest }): Promise<IpcResult<{ ok: true }>> };
  file: {
    importText(req: ImportTextReq): Promise<IpcResult<ImportTextReply | null>>;
    exportText(req: ExportTextReq): Promise<IpcResult<{ path: string } | null>>;
    exportCsv(req: ExportCsvReq): Promise<IpcResult<ExportCsvReply | null>>;
    archiveImport(req: ArchiveImportReq): Promise<IpcResult<ArchiveImportReply>>;
  };
  backup: {
    list(req: { workspaceId: string; tableId: string }): Promise<IpcResult<BackupEntry[]>>;
    restore(req: { workspaceId: string; tableId: string; backupPath: string }): Promise<IpcResult<{ ok: true }>>;
  };
  log: { write(req: { level: string; message: string; detail?: unknown }): Promise<IpcResult<{ ok: true }>> };
}
```

`sandbox: true` 下 preload 只允许 `require('electron')` 与有限 Node 模块；不得扩大。

T2.5 实现边界（ADR-031）：`file.importText` 返回原始 `Uint8Array` 与不透明 `token`；
`file.archiveImport` 只接受该 token，main 解析出用户已选择的源路径后才写入 `imports/`。
`window.api` 仍不暴露 `ipcRenderer`、泛 `invoke` 或任意路径读写。

T3.6 实现边界（ADR-039）：`file.exportCsv` 只暴露四步协议；`begin` 的保存路径来自 main 的
原生保存对话框，`append/finish/cancel` 只接受 `begin` 返回的不透明 token，preload 不提供
任意路径写入。

T5.3 实现边界（ADR-048）：`app.onQuitRequested` 只订阅 main → renderer 的
`app:quit-requested` 事件并返回取消订阅函数；preload 内部使用 `ipcRenderer.on/removeListener`，
不把 `ipcRenderer` 或其 `on` 泛入口暴露给页面。`app.respondToQuit` 走 `app:quit-response`
invoke，入参由 Zod 校验。`workspace.inspect` 与 `workspace.open({ recovery })` 的路径只由 main
解析，renderer 只传工作区目录与 `backups/` 下的相对备份路径。

T5.5 实现边界（ADR-050）：`app.settings`/`app.updateSettings` 只读写 `userData/settings.json`，
preload 不暴露路径或任意文件方法；renderer 与 main 双向用 `appSettingsSchema` 校验。渲染进程在
`main.tsx` 首帧前读取一次设置（1.5s 兜底），`I18nProvider`/`ThemeProvider` 由
`SettingsProvider` 受控；`localStorage` 只作独立 provider 的兜底镜像。

---

<a id="16"></a>
## 16. 非功能需求

### 16.1 性能预算（Windows 10 x64 / 16GB / SSD 基线）

| 指标 | 预算 | 测量方式 |
|---|---|---|
| 冷启动到可交互 | ≤ 2.5s | Playwright Electron 启动打点 |
| 打开 100k×10 工作区 | ≤ 3.0s | 加载用例 `performance.mark` |
| 网格滚动 | ≥ 55fps | Playwright trace / 手工 DevTools |
| 单元格提交 | ≤ 50ms（P95） | 单元基准 |
| 筛选/排序 100k | ≤ 400ms | Worker 基准 |
| 筛选/排序 100k（全中文文本） | ≤ 800ms | Worker 基准（ADR-033 单列预算） |
| 图表解析+采样 100k | ≤ 300ms | chart-model 基准 |
| 图表渲染 2k 点 | ≤ 200ms | 手工/Playwright |
| 自动保存 100k | ≤ 500ms，且不阻塞 UI | main 写盘打点 |
| 样式预览更新 | ≤ 100ms | 组件测试 |
| 条件格式求值 50 规则 × 100 行 | ≤ 16ms | `pnpm bench` 的 `condition.rules.50x100`（纯求值，不含 DOM） |
| 导入 100k CSV | ≤ 8s | E2E 计时 |
| CSV 导出 100k | ≤ 5s，且可取消 | E2E 计时（`export-csv.spec.ts`） |
| 粘贴 10k 单元格 | ≤ 1s（P95，软预算） | 单元基准/报告；T2.7 硬化 |
| 内存峰值 | ≤ 600MB | `app.getAppMetrics()` 汇总 main + renderer + utility/worker 的 `privateBytes`（不含 GPU） |

超预算：先优化；优化不了必须在任务报告里记录实测值、原因与后续计划，不得静默放过。

T2.5 实测（2026-10-22，本机）：`pnpm bench -- --import` 的 100k GBK 分号 CSV
（parse + validate + rows + JSONL 编码）P50 645ms / P95 659ms，预算 8s；100k E2E
从确认到网格可交互的断言 <8s 通过。命令阶段仍同步，硬门禁与内存峰值留 T2.7。

T2.6 实测（2026-10-23，本机）：`pnpm bench -- --query` 的 `query.100k`
（两个筛选条件 + 3 级排序）P50 30ms / P95 34ms；打乱后的 `query.text-sort.100k`
P50 314ms / P95 347ms，预算均为 400ms。`e2e/filter.spec.ts` 的 100k 用例断言
`data-query-ms <= 400` 且查询在专用 Worker 中完成；6 条筛选/排序/视图 E2E 全部通过。
T2.7 继续做硬门禁、中文文本与内存峰值回归。

T2.7 实测（2026-10-23，本机；ADR-033）：`pnpm bench` 全部受门禁用例 P95 ——
`table.open.100k` **358ms**（预算 3s）、`table.save.100k` **349ms**（500ms）、
`edit.commit.100k` **1ms**（50ms，1,000 次循环）、`query.100k` **238ms**（400ms）、
`query.text-sort.100k` **338ms**（400ms）、`query.cjk-sort.100k` **644ms**（800ms）、
`import.100k` **781ms**（8s）；`query.sync-clone.100k` 约 300ms 仅作诊断。
CI 的 `bench` 作业对绝对预算硬失败、对 >20% 回归软告警；基线 `bench/baseline.json`
必须由 CI 的 Windows runner 生成后提交，缺失时比较跳过并打印 `::notice`。
内存 600MB 由 `e2e/perf.spec.ts` 用 `app.getAppMetrics()` 的 `privateBytes` 整应用口径
（main + renderer + utility/worker，不含 GPU）判定，实测峰值 **570MB**；`workingSetSize`
会重复计算共享页，只作为诊断记录（711MB）。冷启动（≤2.5s，实测 997ms）与 100k 首帧
（≤3s，`performance.measure('curve:open')` 实测 665ms）也在该 spec 中断言。

T3.3 实测（2026-10-24，本机；ADR-036）：`pnpm bench` 全部门禁通过 ——
`table.open.100k` **548ms**、`table.save.100k` **327ms**、`edit.commit.100k` **0ms**、
`query.100k` **224ms**、`query.text-sort.100k` **302ms**、`query.cjk-sort.100k` **581ms**、
`import.100k` **913ms**；新增 `condition.rules.50x100` P50 **1ms** / P95 **1ms**（预算 16ms，
纯求值）。全量 E2E **65 passed**（`style.spec.ts` 含条件规则视图与 200% 缩放冒烟）；整应用
private 内存峰值 **565MB**/600MB。

T3.4 实测（2026-10-24，本机；ADR-037）：样式编辑器本地草稿 → 前 50 行预览的布局耗时
**3ms**（预算 100ms，`data-preview-ms` 自测；不新增 bench 门禁）。`pnpm bench` 全部通过：
`table.open.100k` **504ms**、`table.save.100k` **340ms**、`edit.commit.100k` **0ms**、
`query.100k` **192ms**、`query.text-sort.100k` **234ms**、`query.cjk-sort.100k` **598ms**、
`import.100k` **873ms**、`condition.rules.50x100` P95 **1ms**/16ms。全量 E2E **66 passed**；
`style.spec.ts` 的第二条覆盖键盘改密度/加规则、一次控件一次撤销与 200% 缩放；整应用
private 内存峰值 **566MB**/600MB，冷启动 **1,083ms**/2.5s、100k 打开 **654ms**/3s。

T3.5 实测（2026-10-24，本机；ADR-038）：模板往返 E2E（导出 → 重启 → 新工作区导入 → 应用）
2 条通过，12 项计算样式一致，删除回退与撤销、坏文件拒绝与 200% 缩放同 spec 验证。
`pnpm bench` 全部通过：`table.open.100k` **352ms**、`table.save.100k` **254ms**、
`edit.commit.100k` **0ms**、`query.100k` **209ms**、`query.text-sort.100k` **248ms**、
`query.cjk-sort.100k` **434ms**、`import.100k` **623ms**、`condition.rules.50x100` P95
**0ms**/16ms。全量 E2E **68 passed**；perf 整应用 private 内存峰值 **568MB**/600MB、
冷启动 **939ms**/2.5s。样式预览 100ms 预算沿用 T3.4 的 3ms 自测。

T3.6 实测（2026-10-24，本机；ADR-039）：100k×10 默认“显示格式”导出 **1,716ms**（预算 5s，
E2E `export-csv.spec.ts`）；取消后目标文件与临时文件均不存在。3 行夹具验证 UTF-8 BOM、CRLF、
RFC 4180 引号/逗号/换行、当前筛选/排序、隐藏列排除、原始值与显示格式切换，以及 200% 缩放 +
纯键盘打开。`pnpm bench` 全部通过：`table.open.100k` **663ms**、`table.save.100k`
**342ms**、`edit.commit.100k` **0ms**、`query.100k` **213ms**、`query.text-sort.100k`
**260ms**、`query.cjk-sort.100k` **667ms**、`import.100k` **893ms**、
`condition.rules.50x100` P95 **1ms**/16ms。全量 E2E **71 passed**；perf 整应用 private
内存峰值 **571MB**/600MB、冷启动 **1,025ms**/2.5s。

T4.2 实测（2026-10-25，本机；ADR-041）：`pnpm bench -- --sample` 新增两个门禁用例 ——
`chart.resolve-sample.100k`（100k×10、2 个 Y 系列的完整解析 + LTTB）P50 **82ms** /
P95 **93ms**（预算 300ms），单系列纯采样 `chart.sample.100k`（100k→2,000）P50 **4ms** /
P95 **4ms**（预算 50ms）；`chart.resolve-unsampled.100k` P50 55ms 只作诊断。采样后的模型
保持 `renderedPoints ≤ sourcePoints`（ADR-040 口径），逐系列非空点数 ≤ target；2k 点渲染
预算（§16.1 第二行）由 T4.6 判定。

T4.6 实测（2026-10-26，本机；ADR-045）：`pnpm bench -- --chart`（原 `--sample`，保留别名）——
`chart.resolve-sample.100k` P50 **59ms** / P95 **63ms**（预算 300ms）、`chart.sample.100k`
P95 **2ms**（50ms）、`chart.option.2k` P95 **1ms**（50ms，option 构造）、
`chart.restyle.100k` P95 **0ms**（20ms，复用已解析数据只改样式，证明样式提交不重解析）。
渲染/更新预算由 `apps/desktop/e2e/chart-perf.spec.ts` 在真实 Electron 中测量：
`data-chart-resolve-ms` **47ms**（≤300）、`data-chart-update-ms` **89ms**（≤200，含 option +
`setOption` + 2k 点画布）；调色板提交（缓存命中）`resolve=0ms` / `update=14ms`；10 次连点缩放
期间无 >50ms 长任务（`longtask`）；11 次映射/标签切换后 `activeChartInstanceCount()=1`，
切换后 private 峰值 **589–591MB**（≤600MB），100k 图表工作区初始 **470MB**。任务中同时修复
“工作区缺少 `backups/` 目录时所有保存返回 `E_FS_WRITE`”的主进程缺陷（含回归测试）。
`pnpm e2e` 全量 **81 passed**。

### 16.2 安全

- 遵守 §15.3；任何安全相关配置变更必须写 ADR。
- 打开的工作区视为不可信输入：manifest/JSONL 全部 Zod 校验，路径全部白名单校验。
- 日志不得记录单元格内容与文件绝对路径（可记工作区名与哈希）。
- 无网络请求；不得引入遥测。Electron 自动更新 v1 关闭。

### 16.3 可访问性

- 目标 WCAG 2.1 AA；正文对比度 ≥ 4.5:1，大字 ≥ 3:1。
- 全键盘可达：网格、工具栏、检查器、对话框；焦点可见；Esc 关闭对话框/取消编辑。
- 命令面板可用纯键盘完整操作：Ctrl/Cmd+K 打开、↑/↓/Home/End 选择、Enter 执行、Esc 关闭；
  输入框通过 `aria-activedescendant` 暴露当前项，禁用命令带可读原因（§13.4）。
- 图表提供 `aria-label` 摘要（系列数、点数、X/Y 范围）；图表旁提供"查看数据表"入口。
- 200% 缩放下不出现横向裁切；表格允许横向滚动。

**实现边界（T5.5，ADR-050）**：设置与“未保存修改”对话框复用 `@curve/ui` 的 `Dialog`
（焦点陷阱、Esc 关闭、焦点恢复）；设置控件的标签在两种语言下都可读，默认表格样式使用带
`label` 的原生 `<select>`。200% 缩放与 +30% 伪本地化的布局冒烟见 §16.4。

### 16.4 国际化

- v1 内置 `zh-CN` 默认、`en-US` 完整消息表（两语言 key 集一致）；所有文案走消息表。
- 日期/数字用 `Intl`；CSV 导出编码固定 UTF-8 BOM，不做本地化。
- 布局允许文案变长 30% 不破。

**实现边界（T5.5，ADR-050）**：

- `translateKey` 在开发构建缺失 key 时抛错，生产构建回退 zh-CN；`ui-conventions.test.ts` 同时
  拦截用户可见 JSX 属性（`aria-label`/`title`/`placeholder`/`label`/`hint`/`error` 等）的字面量。
- 语言切换即时生效：`SettingsProvider` 是语言/主题的唯一状态源，对话框、菜单、状态栏、帮助与
  命令面板都在同一渲染中切换；无需重启。
- “+30% 文案”由 `e2e/settings.spec.ts` 在真实 Electron、200% 缩放下对可见文本节点做伪本地化
  冒烟，断言页面无横向溢出且设置对话框面板在视口内。

### 16.5 日志与崩溃

- main 用 `electron-log` 写 `userData/logs/main.log`，按天滚动，保留 7 天。
- renderer 全局 `error`/`unhandledrejection` → `log:write`（限流 10 条/分钟）。
- 崩溃后下次启动提示"上次异常退出"，并保留 `.lock` 恢复流程。
- 日志级别：error/warn/info/debug；生产默认 info。

### 16.6 平台

- 主目标：Windows 10/11 x64（NSIS 安装 + portable zip）。
- 次要：macOS 12+（dmg，未签名，文档说明）；Linux 尽力而为。
- 不追求 32 位、ARM Windows、移动端。
- T6.4 已落地（ADR-055）：Windows x64 的 NSIS 每用户安装（不要求管理员、许可证页、开始菜单
  与桌面快捷方式）与 portable 单文件；`appId=com.curvealmanac.app`、`productName=Curve
  Almanac`、产物在 `release/`（gitignore）；未签名。macOS/Linux 目标仍未配置，v1 不承诺。

---

<a id="17"></a>
## 17. 功能需求与验收

> 验收必须可自动化或可重复手工执行。任务映射见 `docs/TASKS.md`。

### 17.1 工作区

| ID | 需求 | 验收 |
|---|---|---|
| FR-WS-01 | 新建/打开/保存/最近打开工作区 | 新建后目录结构正确；重启后最近列表可打开；manifest 可读 |
| FR-WS-02 | 多表、多视图、分栏布局持久化 | 建 2 表 3 视图、分 2 pane，重启后布局/活动标签一致 |
| FR-WS-03 | 自动保存与崩溃恢复 | 强杀后重开触发恢复；已提交数据不丢；未保存提示正确 |
| FR-WS-04 | 格式版本与迁移 | v1 夹具打开成功；未来版本拒绝；迁移前有备份 |

### 17.2 表格数据

| ID | 需求 | 验收 |
|---|---|---|
| FR-TBL-01 | 自定义表结构 | 5 种存储类型可建；角色/主键/枚举/必填生效；插件语义类型可选且持久化；非法列配置被拒绝 |
| FR-TBL-02 | 网格编辑与校验 | 键盘可完成增删改；非法值不落库；错误定位到行列 |
| FR-TBL-03 | 区域粘贴 | Excel 5×4 粘贴正确；超列弹确认；类型错误整批不提交 |
| FR-TBL-04 | CSV/JSON 导入向导 | 编码/分隔符/表头可覆盖；预览 20 行；错误报告可导出；导入原子 |
| FR-TBL-05 | 筛选/排序与视图状态 | 多条件筛选、3 级排序正确；重启后视图状态还原 |
| FR-TBL-06 | CSV 导出 | 导出当前筛选/排序；BOM 正确；原始/格式化两种模式 |
| FR-TBL-07 | 10 万行性能 | 打开/滚动/筛选/排序达到 §16.1 预算 |
| FR-TBL-08 | 结构变更迁移 | 加列/删列/改类型后旧行数据按规则迁移，行数不变 |

### 17.3 表格外观

| ID | 需求 | 验收 |
|---|---|---|
| FR-STY-01 | 内置模板 | 4 个模板可应用，视觉差异明显；默认模板正确 |
| FR-STY-02 | 令牌编辑与实时预览 | 改字体/颜色/密度 100ms 内预览；保存后网格一致 |
| FR-STY-03 | 列级覆盖 | 对齐/数字格式/日期格式/宽度/渲染模式生效；不污染 schema |
| FR-STY-04 | 条件格式 | 所有操作符正确；首条命中；行/单元格目标正确；可禁用 |
| FR-STY-05 | 用户模板 CRUD | 另存/重命名/复制/删除/设为默认；删除后引用回退 |
| FR-STY-06 | 模板导入/导出 | 导出再导入到新工作区，视觉一致；非法文件被拒绝 |
| FR-STY-07 | 单元格渲染模式 | badge 仅 enum；bar 按列 min/max 归一；空值不绘制 |

### 17.4 图表

| ID | 需求 | 验收 |
|---|---|---|
| FR-CHT-01 | 图表 CRUD 与宽表映射 | 多 Y 列生成多系列；系列名/颜色正确；删除后视图关闭 |
| FR-CHT-02 | 长表映射 | 系列列拆分正确；空值归"(空)"；>20 系列截断警告 |
| FR-CHT-03 | 检查器 | 轴标签/图例/调色板/线宽/平滑/从零开始生效并持久化 |
| FR-CHT-04 | 交互 | 缩放/图例切换/tooltip 正确；resize 不变形 |
| FR-CHT-05 | 采样与性能 | 100k 点采样后 ≤ 2k/系列；徽标显示；首尾点保留 |
| FR-CHT-06 | PNG 导出 | 2x、背景正确、文件名正确；空图不可导出 |
| FR-CHT-07 | 空态/错误态 | 无表/无映射/列被删时显示可操作提示，不崩溃 |

### 17.5 扩展与工程

| ID | 需求 | 验收 |
|---|---|---|
| FR-EXT-01 | 贡献点注册表 | 4 类注册表可注册/列出/移除；重复 id 抛错 |
| FR-EXT-02 | 插件生命周期与隔离 | 激活失败不影响主流程；deactivate 后贡献全部移除 |
| FR-EXT-03 | 示例插件 | 示例语义字段类型与导入器在 UI 可选并工作；自定义字段按 storageType 正确落盘 |
| FR-EXT-04 | API 版本校验 | 不兼容主版本被禁用并提示 |
| NFR-01 | 性能 | §16.1 全部达标 |
| NFR-02 | 安全 | §15/§16.2 检查项全过；无 Node 暴露 |
| NFR-03 | 可访问性 | 全键盘主流程；对比度检查通过 |
| NFR-04 | 国际化 | 中英文案齐全；无硬编码用户文案 |
| NFR-05 | 离线隐私 | 无网络请求；无遥测 |
| NFR-06 | 日志与崩溃 | 崩溃有日志、有恢复提示 |
| NFR-07 | 测试与 CI | `pnpm verify` + `pnpm e2e` 全绿；覆盖率达标 |
| NFR-08 | 打包 | Windows 安装包可装可卸；数据目录正确 |

---

<a id="18"></a>
## 18. 错误码

```ts
export type ErrorCode =
  | 'E_WS_NOT_FOUND' | 'E_WS_INVALID_MANIFEST' | 'E_WS_VERSION_UNSUPPORTED'
  | 'E_WS_LOCKED' | 'E_WS_BUSY' | 'E_MIGRATION_FAILED'
  | 'E_TABLE_NOT_FOUND' | 'E_TABLE_PARSE' | 'E_TABLE_LIMIT'
  | 'E_IMPORT_ENCODING' | 'E_IMPORT_FORMAT' | 'E_IMPORT_ABORTED'
  | 'E_VALIDATION' | 'E_DUPLICATE_KEY' | 'E_TYPE'
  | 'E_PATH_DENIED' | 'E_FS_READ' | 'E_FS_WRITE' | 'E_BACKUP_NOT_FOUND'
  | 'E_IPC_INVALID_PAYLOAD' | 'E_PAYLOAD_TOO_LARGE'
  | 'E_PLUGIN_INVALID' | 'E_PLUGIN_INCOMPATIBLE' | 'E_PLUGIN_ACTIVATE'
  | 'E_EXPORT_FAILED' | 'E_UNKNOWN';

export interface AppError {
  code: ErrorCode;
  message: string;      // 开发者可读诊断（英文）；UI 必须按 code 本地化展示
  detail?: string;      // 诊断信息，不含敏感内容
  retryable?: boolean;
}
```

- UI 按 `code` 决定展示方式与本地化文案（toast/对话框/内联错误），不得直接展示 `message`/`detail` 给最终用户。
- 未知异常统一 `E_UNKNOWN`，日志保留堆栈。

---

<a id="19"></a>
## 19. 歧义默认策略

| 场景 | 默认 |
|---|---|
| 空单元格含义 | 非必填 → `null`；text → `""` |
| 日期时区 | 存 epoch ms；显示按系统本地时区 |
| 数字千分位 | 导入时去掉 `,`；导出按显示格式可选 |
| 小数分隔符 | 仅支持 `.`；`,` 视为千分位或分隔符 |
| 重复 X | 保留全部点并 warning，不聚合 |
| 缺失 Y | 折线断点，不插值 |
| 表格空值排序 | 永远排最后（asc/desc 都是） |
| 文本排序 | `Intl.Collator`，大小写不敏感 |
| CSV 编码 | UTF-8 优先，失败检测 GBK/GB18030 |
| 列名重复 | 导入时自动加 `_2`，并提示 |
| 表名重复 | 允许，UI 显示 ID 后缀 |
| 模板 id 冲突 | 重新分配 id，名称加 ` (2)` |
| 图表引用列被删 | 图表进入错误态，不自动改映射 |
| 视图引用失效 | 关闭该视图；若为最后视图则回到空态 |
| 布局非法 | 回退单 pane，保留全部 view 在标签栏 |
| 插件重复注册 | 抛错并禁用该插件，不影响其他插件 |
| 撤销栈 | 仅内存，关闭工作区清空 |

---

<a id="20"></a>
## 20. 完成定义

v1 完成 = 同时满足：

1. §17 全部 FR 通过，且测试可在干净机器复现。
2. `docs/TASKS.md` 所有任务勾选，里程碑验收报告齐备。
3. `pnpm verify`、`pnpm e2e`、`pnpm bench` 全绿且在预算内。
4. README §6 的 9 步验收演示一次通过。
5. Windows 安装包在干净用户目录安装/卸载，数据路径正确。
6. 文档更新：SPEC、TASKS、TESTPLAN、DECISIONS、CHANGELOG 与实现一致。

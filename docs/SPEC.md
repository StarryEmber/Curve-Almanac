# Curve Studio v1 规格说明（Normative）

<a id="0"></a>
## 0. 元信息

| 项 | 值 |
|---|---|
| 文档版本 | 1.0 |
| 状态 | 已锁定，可执行 |
| 适用产品 | Curve Studio v1（PC 桌面） |
| 规范性关键词 | **必须** = MUST，**应当** = SHOULD，**可以** = MAY |
| 冲突处理 | 本文与 `AGENTS.md` 冲突时，安全/数据条款以 `AGENTS.md` 为准，其余以本文为准 |

本文是实现的唯一契约。任何偏离都必须先写 ADR（`docs/adr/NNN-*.md`）并更新本文。

---

<a id="1"></a>
## 1. 产品定义

Curve Studio 是一个**本地优先、单机离线**的桌面数据可视化工具。用户用"自定义表格"承载数据，用"曲线视图"理解数据。

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
| `@curve/table-engine` | domain、papaparse、iconv-lite/jschardet（Worker 侧） | React、Electron、ECharts |
| `@curve/chart-model` | domain、table-engine | ECharts、React、Electron |
| `@curve/chart-echarts` | chart-model、echarts | app-core、React、Electron |
| `@curve/persistence` | domain | Electron、React、app-core |
| `@curve/plugin-sdk` | domain（仅类型） | app-core、React、Electron、ECharts |
| `@curve/app-core` | domain、table-engine、chart-model、persistence、plugin-sdk、zustand、immer | React、Electron、ECharts |
| `@curve/ui` | React、domain 类型 | app-core、persistence、Electron |
| `@curve/desktop` | 全部 | — |
| `plugins/*` | plugin-sdk、domain 公开类型 | 任何应用内部路径 |

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
6. `tableStyles[].id` 唯一且不以 `builtin.` 开头；`styleId` 必须可解析，否则回退默认并警告。
7. `columnOrder` 必须包含所有列 ID 恰好一次；`widths` 的键与 `sort`/`filter` 引用的列必须存在；`columnOverrides` 允许包含目标表不存在的列（跨表模板），求值时忽略。
8. 时间戳必须是可解析的 ISO 8601；`schemaVersion`/`formatVersion` 必须是已知值。

违反不变量时：加载阶段能修复的修复并记 `warnings`；不能修复的拒绝打开并返回 `E_WS_INVALID_MANIFEST`。

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
- 实现边界（ADR-026）：M1–T5.2 阶段只把 stale/corrupt `.lock` 作为 warning 返回并替换锁；
  manifest 损坏返回 `E_WS_INVALID_MANIFEST` 且不改原文件。“尝试恢复/直接打开”的交互与
  `backups/` manifest 重建在 T5.3（自动保存、恢复与最近打开）实现；T2.1 只呈现 warning，
  不新增恢复 IPC、不做静默重建。

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

- **欢迎页**：应用启动且无打开工作区时，显示"新建工作区 / 打开工作区 / 最近打开"。新建默认目录为 `app.getPath('documents')/Curve Studio/`，用户可改。该目录是**父目录**：实际工作区根为 `<父目录>/<清洗后的名称>.cstudio`（ADR-020）。
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

### 9.2 编辑与校验

- 编辑提交时机：Enter、Tab、失焦；Esc 取消。
- 提交时立即校验；非法值**不写入模型**，单元格保持编辑态并显示错误。
- 错误态：红色描边 + tooltip；状态栏显示"第 N 行 · 列 X：原因"。
- 主键重复：阻止提交，提示冲突行号。
- 新增行（含粘贴/导入新增）主键为空时，自动生成 `row_<uuid>` 写入（仅 text 主键）；用户显式填值则校验唯一性。
- 批量清空/粘贴：先整体校验，失败则整批不写入并列出错误。
- 每次提交是一个命令（见 §13），支持撤销。

### 9.3 粘贴

- 优先解析 TSV；若只有一列且含逗号，再尝试 CSV。
- 支持 Excel 复制的引号、换行、制表符。
- 行数不足自动追加；列数超出必须弹窗确认"新增 N 列"（默认 text，可改）。
- 类型不匹配：该单元格标记错误，整批不提交；用户可取消或修正后重试。
- 粘贴 10,000 单元格以上时显示进度，超过 1s 必须可取消。
- 锚点与筛选：以选择区域左上角为锚点，按当前视图顺序写入可见行；筛选激活时只允许写入可见行，矩阵行数超出可见行数则整批拒绝并提示（不得写入隐藏行）。
- 排序激活时按行 ID 定位，粘贴不受排序影响。

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

### 9.5 筛选与排序

- 筛选器 UI：列 + 操作符 + 值；支持 all/any 组合，最多 20 条。
- 排序：多列，最多 3 级；点击表头循环 asc → desc → none。
- 视图状态持久化到 `TableViewState`，不改变数据。
- 10 万行排序/筛选在 Worker 执行；结果返回行 ID 顺序 + 行数据引用。

### 9.6 导出

- CSV：UTF-8 BOM（Excel 兼容）；可选"原始值"或"按显示格式"。
- 导出当前筛选/排序后的行；列顺序按视图顺序。
- 文件名默认 `<表名>-<yyyyMMdd-HHmm>.csv`。

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

### 10.6 样式编辑器

- 面板分组：模板、令牌（字体/颜色/密度/网格/圆角）、列覆盖、条件格式。
- 所有颜色输入支持 hex 与取色器；非法值不提交。
- 修改走命令总线，可撤销；撤销粒度按一次控件提交（不是每个像素）。
- 编辑器与网格共用 `TableStyle` 渲染管线，禁止两套样式逻辑。

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

### 11.4 ECharts 适配器

- 按需引入 `echarts/core` + `LineChart/ScatterChart/BarChart` + 必要组件。
- 必须实现：`render(container, model)`、`update(model)`、`resize()`、`dispose()`、`toPNG({scale,background})`。
- 交互：`dataZoom`（inside + slider）、legend 点击、tooltip（X 格式化 + 单位 + 精度）、框选缩放。
- 主题：背景 `auto` 时跟随应用深浅色；`light/dark` 强制。
- 空数据：不创建实例，渲染空态；实例创建失败必须捕获并显示错误态。
- 不允许在 React 组件里直接拼 option；option 只允许出现在 `chart-echarts` 包。

### 11.5 图表 UI

- 左侧"图表"列表：新建、复制、重命名、删除。
- 新建向导：选表 → 选映射（宽/长）→ 选列 → 预览 → 创建。
- 检查器分组：数据（表/筛选/排序）、映射、外观（线宽/平滑/点/调色板/图例/网格）、坐标轴（标签/从零开始）、导出。
- 修改 120ms 防抖更新；更新不得重建整个实例（用 `setOption` merge）。
- 图表与表格联动：在表格选中行时，图表高亮对应点（v1 可选，SHOULD）。

### 11.6 导出

- PNG：2x 像素比，背景可选透明/白/深；文件名 `<图标题>-<yyyyMMdd-HHmm>.png`。
- 导出前必须等待一次完整渲染；失败返回 `E_EXPORT_FAILED`。

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
| `view.layout` | LayoutNode | 是 |
| `style.create/update/delete/apply` | style | 是 |
| `chart.create/update/delete` | chart | 是 |
| `workspace.rename` | name | 是 |

- 命令实现为纯函数：`(state, payload) => { nextState, patches, inversePatches }`（Immer `produceWithPatches`）。
- 异步副作用（磁盘写入）不进入命令；由状态订阅触发自动保存。
- 命令失败必须返回 `AppError`，不得部分修改状态。

### 13.2 撤销/重做

- 历史栈上限 100 条或 256MB（以先到者为准）；新命令入栈时丢弃 redo 分支，超限丢弃最旧条目。大表导入/替换的逆补丁必须计入上限，禁止无限增长。
- 连续单元格编辑 800ms 内合并为一条；批量粘贴/导入为一条。
- 不进入历史：选择、滚动、活动标签、面板开合、窗口尺寸。
- 撤销只改内存文档状态；自动保存随后落盘。
- UI：Ctrl/Cmd+Z、Ctrl/Cmd+Shift+Z（macOS 也支持 Cmd+Y）；菜单显示可撤销命令名。

### 13.3 自动保存

- 默认开启；最后一次变更后 1500ms 触发，最长 10s 强制触发。
- 只写脏表 + manifest；串行队列，避免并发写同一文件。
- 状态指示：已保存 / 保存中 / 保存失败（可重试）。
- 手动保存：Ctrl/Cmd+S 立即 flush 所有脏表 + manifest，并同步状态指示。
- 退出前 flush，最多等 3s；超时弹确认。
- 写失败不得丢内存数据；下次变更重试，状态栏持续告警。

---

<a id="14"></a>
## 14. 扩展系统

### 14.1 插件形态（v1）

- 插件是**编译期静态导入**的模块；v1 **不加载**运行时下载的代码。
- 内置插件在 `apps/desktop/src/renderer/plugins/index.ts` 注册；示例插件在 `plugins/plugin-sample/`。
- 每个插件导出 `PluginDefinition`，由宿主在启动时 `activate`。
- 插件异常必须隔离：单个插件激活失败 → 记日志、标记禁用、应用继续启动。

### 14.2 契约

```ts
// packages/plugin-sdk/src/index.ts
export interface Registry<T> {
  register(id: string, def: T): () => void;
  replace(id: string, def: T): void;
  get(id: string): T | undefined;
  list(): ReadonlyArray<{ id: string; def: T }>;
  dispose(): void;
}

export interface PluginLogger {
  info(message: string, detail?: unknown): void;
  warn(message: string, detail?: unknown): void;
  error(message: string, detail?: unknown): void;
}

export interface PluginDefinition {
  id: string;                  // 反向域名，如 "com.curvestudio.sample"
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

- 字段类型额外约束：`storageType` 必须是 5 种内置存储类型之一；`ColumnDef.fieldTypeId` 必须与 `column.type` 匹配。语义类型只改变解析、校验与格式化，不改变 JSONL 物理形态。
- `register(id, def)`：重复 id 抛错；`replace(id, def)` 仅允许同插件覆盖自己。
- `list()` 返回稳定顺序：内置在前，插件按注册顺序。
- `dispose`：插件 `deactivate` 后移除其全部贡献；移除后 UI 不得残留引用。
- 宿主校验 `apiVersion` 主版本 = 1；不兼容 → 禁用插件并提示，不影响其他插件。
- 注册表本身是纯数据 + 订阅，不依赖 React。

### 14.4 内置贡献点

| 类型 | 内置 |
|---|---|
| 字段类型 | number、text、date、boolean、enum |
| 导入器 | CSV/TSV、JSON |
| 图表类型 | line、scatter、bar |
| 命令 | 见 §13.1 |

### 14.5 v2 预留（不在 v1 实现）

动态 ES 模块加载、沙箱 Worker、插件权限声明、插件市场、签名校验。v1 的注册表与 manifest 必须为这些留出 `permissions?: string[]` 字段（可为空，不实现）。

---

<a id="15-ipc-契约"></a>
## 15. IPC 契约

### 15.1 通道

| 通道 | 方向 | 请求 | 响应 |
|---|---|---|---|
| `app:info` | R→M | `{}` | `{ version, platform, locale, documentsDir }` |
| `dialog:pickDirectory` | R→M | `{ title?, defaultPath? }` | `{ path } \| null` |
| `dialog:saveFile` | R→M | `{ suggestedName, filters }` | `{ path } \| null` |
| `workspace:create` | R→M | `{ dir, name }` | `WorkspaceManifest` |
| `workspace:open` | R→M | `{ dir }` | `{ manifest, warnings }` |
| `workspace:close` | R→M | `{ workspaceId }` | `{ ok: true }` |
| `workspace:recent` | R→M | `{}` | `RecentEntry[]` |
| `workspace:recent:remove` | R→M | `{ path }` | `{ ok: true }` |
| `workspace:recent:clear` | R→M | `{}` | `{ ok: true }` |
| `table:read` | R→M | `{ workspaceId, tableId }` | `{ jsonl, bytes }` |
| `table:write` | R→M | `{ workspaceId, tableId, jsonl }` | `{ bytes }` |
| `table:trash` | R→M | `{ workspaceId, tableId }` | `{ ok: true }` |
| `manifest:write` | R→M | `{ workspaceId, manifest }` | `{ ok: true }` |
| `file:importText` | R→M | `{ filters }` | `{ path, name, text } \| null` |
| `file:exportText` | R→M | `{ suggestedName, content, filters }` | `{ path } \| null` |
| `backup:list` | R→M | `{ workspaceId, tableId }` | `BackupEntry[]` |
| `backup:restore` | R→M | `{ workspaceId, tableId, backupPath }` | `{ ok: true }` |
| `log:write` | R→M | `{ level, message, detail? }` | `{ ok: true }` |

- `workspace:create` 的 `dir` 是父目录；main 在其下创建 `<清洗后的 name>.cstudio`。根已存在返回
  `E_WS_BUSY`；名称清洗后为空返回 `E_VALIDATION`（ADR-020）。
- `workspace:recent` 只读 `userData/recent.json`，不自动重新授权；打开仍需 `workspace:open`。
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
export interface RecentEntry { path: string; name: string; lastOpenedAt: string }
export interface BackupEntry { path: string; createdAt: string; bytes: number }
export interface FileFilter { name: string; extensions: string[] }
export interface SaveFileReq { suggestedName: string; filters: FileFilter[] }
export interface ImportTextReq { filters: FileFilter[] }
export interface ExportTextReq { suggestedName: string; content: string; filters: FileFilter[] }
export interface PickDirectoryReq { title?: string; defaultPath?: string }

interface CurveApi {
  app: { info(): Promise<IpcResult<AppInfo>> };
  dialog: {
    pickDirectory(req: PickDirectoryReq): Promise<IpcResult<{ path: string } | null>>;
    saveFile(req: SaveFileReq): Promise<IpcResult<{ path: string } | null>>;
  };
  workspace: {
    create(req: { dir: string; name: string }): Promise<IpcResult<WorkspaceManifest>>;
    open(req: { dir: string }): Promise<IpcResult<{ manifest: WorkspaceManifest; warnings: string[] }>>;
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
    importText(req: ImportTextReq): Promise<IpcResult<{ path: string; name: string; text: string } | null>>;
    exportText(req: ExportTextReq): Promise<IpcResult<{ path: string } | null>>;
  };
  backup: {
    list(req: { workspaceId: string; tableId: string }): Promise<IpcResult<BackupEntry[]>>;
    restore(req: { workspaceId: string; tableId: string; backupPath: string }): Promise<IpcResult<{ ok: true }>>;
  };
  log: { write(req: { level: string; message: string; detail?: unknown }): Promise<IpcResult<{ ok: true }>> };
}
```

`sandbox: true` 下 preload 只允许 `require('electron')` 与有限 Node 模块；不得扩大。

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
| 图表解析+采样 100k | ≤ 300ms | chart-model 基准 |
| 图表渲染 2k 点 | ≤ 200ms | 手工/Playwright |
| 自动保存 100k | ≤ 500ms，且不阻塞 UI | main 写盘打点 |
| 样式预览更新 | ≤ 100ms | 组件测试 |
| 导入 100k CSV | ≤ 8s | E2E 计时 |
| 内存峰值 | ≤ 600MB | 任务管理器/`process.memoryUsage` |

超预算：先优化；优化不了必须在任务报告里记录实测值、原因与后续计划，不得静默放过。

### 16.2 安全

- 遵守 §15.3；任何安全相关配置变更必须写 ADR。
- 打开的工作区视为不可信输入：manifest/JSONL 全部 Zod 校验，路径全部白名单校验。
- 日志不得记录单元格内容与文件绝对路径（可记工作区名与哈希）。
- 无网络请求；不得引入遥测。Electron 自动更新 v1 关闭。

### 16.3 可访问性

- 目标 WCAG 2.1 AA；正文对比度 ≥ 4.5:1，大字 ≥ 3:1。
- 全键盘可达：网格、工具栏、检查器、对话框；焦点可见；Esc 关闭对话框/取消编辑。
- 图表提供 `aria-label` 摘要（系列数、点数、X/Y 范围）；图表旁提供"查看数据表"入口。
- 200% 缩放下不出现横向裁切；表格允许横向滚动。

### 16.4 国际化

- v1 内置 `zh-CN` 默认、`en-US` 骨架；所有文案走消息表。
- 日期/数字用 `Intl`；CSV 导出编码固定 UTF-8 BOM，不做本地化。
- 布局允许文案变长 30% 不破。

### 16.5 日志与崩溃

- main 用 `electron-log` 写 `userData/logs/main.log`，按天滚动，保留 7 天。
- renderer 全局 `error`/`unhandledrejection` → `log:write`（限流 10 条/分钟）。
- 崩溃后下次启动提示"上次异常退出"，并保留 `.lock` 恢复流程。
- 日志级别：error/warn/info/debug；生产默认 info。

### 16.6 平台

- 主目标：Windows 10/11 x64（NSIS 安装 + portable zip）。
- 次要：macOS 12+（dmg，未签名，文档说明）；Linux 尽力而为。
- 不追求 32 位、ARM Windows、移动端。

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

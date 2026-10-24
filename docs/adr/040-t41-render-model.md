# ADR-040 T4.1 的 RenderModel、宽/长表映射、调色板与空值口径

- 状态：已接受
- 日期：2026-10-24
- 相关：SPEC §6.3、§11.1–§11.3、§16.1；TASKS T4.1；ADR-004、ADR-032

## 背景

`@curve/chart-model` 目前只有 T0.1 的占位导出。T4.1 要按 SPEC §11.3 产出与图表库无关的
`RenderModel`，覆盖宽表/长表映射、系列命名与稳定 id、映射校验、筛选/排序接入、null 断点与
warning 收集；T4.2 的 LTTB 采样与 T4.3 的 ECharts 适配器都会直接消费它。

SPEC §11.1–§11.3 固定了映射规则与 `RenderModel` 形状，但没有规定以下实现细节，必须在写代码前
裁决，否则 T4.2/T4.3 会各自发明一套：

1. 四个调色板的具体颜色；`background: 'auto'` 由谁解析成哪种颜色。
2. `meta.sourcePoints` / `renderedPoints` 的口径（行数？点数？含不含 null）。
3. X 值为 null/非法时丢行还是保留；长表空系列值如何进入稳定系列 id。
4. warning 的粒度（逐行还是聚合）与语言。

筛选/排序不得另写一套：ADR-032 已把 12 种操作符、三级排序与 locale 语义落在
`@curve/table-engine`，T4.1 必须复用 `validateFilterPredicate` / `validateSortSpecs` /
`applyFilter` / `applySort`。

## 决定

### 1. 公开 API

```ts
// 校验（UI 的映射选择器与错误态共用）
validateChartMapping(table: TableMeta, mapping: ChartMapping): ChartIssue[]
canBeChartX(column: ColumnDef): boolean
canBeChartY(column: ColumnDef): boolean
canBeChartSeries(column: ColumnDef): boolean

// 解析
resolveSeries(
  table: TableMeta,
  rows: readonly Row[],
  spec: ChartSpec,
  options?: ChartResolveOptions,   // { locale?, theme?: 'light'|'dark', background?: string }
): { ok: true; model: RenderModel } | { ok: false; issues: ChartIssue[] }

// 常量
MAX_CHART_SERIES = 20
CHART_PALETTES: Record<ChartOptions['paletteId'], readonly string[]>
CHART_BACKGROUNDS: { light: '#ffffff'; dark: '#1e1e1e' }
```

- `ChartIssue` 复用 domain 的 `{ path, code: ValidationIssueCode, message }` 形状，与
  `QueryIssue`/manifest issue 一致；失败时一次性返回全部 issue，不抛异常。
- 纯函数、无状态：调用方负责提供当前表快照与行集（T4.4 传可见行或全表行，由 UI 决定）。
- 包内禁止 import ECharts/React/Electron；依赖方向保持 `domain ← table-engine ← chart-model`。

### 2. 映射校验（SPEC §11.1）

- X：列必须存在，类型 `number|date|text`，角色 `x|none`。
- Y（宽表每个、长表单列）：列必须存在，类型 `number`，角色 `y|none`；宽表至少一列且不重复。
- 系列列（长表）：列必须存在，类型 `text|enum`，角色 `series|none`。
- `spec.tableId` 必须等于 `table.id`；否则 `E_VALIDATION`（防止把 A 表映射套到 B 表行集）。
- `spec.filter` / `spec.sort` 交给 table-engine 的校验器，issue 原样上抛；排序仍受
  `MAX_SORT_LEVELS = 3` 约束。

### 3. 行顺序与筛选/排序（SPEC §11.2）

1. 先过滤（若配置），复用 `applyFilter`。
2. 剔除 X 缺失/非法的行（仅 number/date；text 的 null 归一为 `''`），并聚合 warning。
3. 排序：配置了 `spec.sort` 就用 `applySort`；否则 number/date X 按 X 升序稳定排序，
   text X 保持物理行顺序（SPEC §11.2.1）。
4. 在排好序的行上生成 X 与各系列值。

### 4. 值、系列与空值

- X：`date` → epoch ms（`x.type='time'`）；`number` → number（`'number'`）；
  `text` → string（`'category'`）。`x.label` 取 `options.xLabel ?? 列 label`，`x.unit` 取列 `unit`。
- Y：`null` 是断点（保留 null，不补 0、不插值、不警告）；非 number 值 → null + 该列一条聚合
  warning（计数），不丢弃整行（SPEC §11.2.3）。
- 宽表：每个 Y 列一条系列；`id = 列 id`，`name = 列 label`；重名追加 ` (2)`、` (3)`。
- 长表：系列列 distinct 值按**排序后的首次出现**分组；`id = \`${seriesColumnId}:${存储值}\``，
  空值（null）与空字符串归同一组，存储值部分为空串，名称 `(空)`；enum 名称用 option label，
  id 用存储 value。
- `> MAX_CHART_SERIES`（20）：按既定顺序截断到 20，并给出一条 warning；不静默丢弃。
- 重复 X：保留全部点、按排序后的行序连线，并给出一条带重复计数的 warning（SPEC §11.2.5）。
- 颜色：`series[i].color = palette[i % palette.length]`；调色板由 `options.paletteId` 选择。

### 5. 调色板与背景

- 四个调色板各 8 色常量放在 `@curve/chart-model`（非持久化、非 manifest 字段）：
  `default` 常规、`muted` 低饱和、`vivid` 高饱和、`colorblind` 采用 Okabe–Ito 8 色。
  颜色只作为渲染建议，用户可后续按 ADR 扩展为令牌。
- `RenderStyle.background` 解析顺序：调用方显式 `options.background` > `options.theme`
  （`auto` 时）> `spec.options.background`（`light`/`dark`）> `#ffffff`。
  这样 chart-model 不依赖 `@curve/ui` 的主题令牌，T4.3/T4.4 只需把当前主题传进来。

### 6. meta 口径

- T4.1 不做采样：`sampled = false`，`renderedPoints = sourcePoints`。
- `sourcePoints` = 最终系列中**非 null Y 值**的总数（断点不算点）；T4.2 采样后
  `renderedPoints ≤ sourcePoints`，`sampled` 由采样器置位。
- `warnings` 是英文开发者文案（与 manifest/workspace warning 一致），按固定顺序聚合：
  X 丢行 → 重复 X → 非数值 Y（按列）→ 系列截断；UI 负责展示，不吞掉。

### 7. 不改变的东西

- 不新增运行时依赖、不 import ECharts/React/Electron。
- 不改变 `ChartSpec`/manifest/`formatVersion`/JSONL/IPC。
- 不实现 T4.2 的 LTTB、T4.3 的 option、T4.4 的 UI。

## 代价

- `background: 'auto'` 的解析被放进 chart-model，调用方必须传主题；不传时按 light 处理。
- 调色板常量与设计系统分离，后续若要求主题令牌化需要改常量并写 ADR，但不涉及数据迁移。
- number/date 的 X 缺失行会被丢弃（不是 null 点），图表点数可能少于表格行数；已用 warning 明示。
- `sourcePoints` 不含断点，与“行数 × 系列数”不同；T4.2 的采样预算要按这个口径报告。
- warning 聚合后不再逐行定位，UI 只能给整体提示；需要逐行诊断时另加结构化 issue（另写 ADR）。
- 长表把 null 与空字符串合并为 `(空)` 组，无法在图上区分二者（数据仍完整保留在表里）。

## 影响

- `@curve/chart-model`：新增 `palettes.ts`、`render-model.ts` 与同目录测试；`index.ts` 改为
  真实公开出口（保留 `PACKAGE_NAME`）。
- `docs`：SPEC §11.3 增加“实现边界（T4.1，ADR-040）”；TASKS T4.1 勾选与实现备注；ADR 索引；
  CHANGELOG、HANDOFF、`docs/reports/t4.1/REPORT.md`。
- 不改变 SPEC §11.3 的 `RenderModel` 形状；不改变依赖方向与构建配置。

## 复核条件

- 若调色板需要主题令牌化或用户自定义，先改 `CHART_PALETTES` 为注入参数并写 ADR。
- 若要求保留 X 缺失行（例如按类目占位）或对断点插值，需要重新定义 `x.values` 类型与采样语义。
- 若需要 warning 本地化或逐行定位，改为结构化 warning + UI 消息表映射，并更新 SPEC §11.3。
- 若系列上限 20 不再满足需求，改成可配置并评估图例/性能（T4.6）。
- 若 `sourcePoints` 口径与 T4.2 的采样预算冲突，以 T4.2 的实测报告为准回写本 ADR。

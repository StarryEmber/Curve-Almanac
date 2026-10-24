# T4.1 报告 — RenderModel 与宽/长表映射

- 任务：T4.1（FR-CHT-01、FR-CHT-02；SPEC §11.1–§11.3）
- 日期：2026-10-24
- 决策：ADR-040（调色板、auto 背景、空值口径、sourcePoints、warning 粒度）
- 状态：已完成；未进入 T4.2。

## 1. 目标与交付

1. `@curve/chart-model` 从占位包变为真实实现：`resolveSeries(table, rows, spec, options?)` 产出
   SPEC §11.3 的 `RenderModel`（宽表/长表映射、系列命名与稳定 id、样式与 meta）。
2. 映射校验：列存在、类型、角色、重复 Y、空 Y、tableId 匹配；filter/sort 复用
   `@curve/table-engine` 的校验与执行（ADR-032），不另写比较语义。
3. 值语义：number/date/text X；number/date X 缺失行丢弃 + 聚合 warning；Y `null` 是断点，
   非 number → null + 按列聚合 warning；重复 X 保留全部点 + warning；>20 系列截断 + warning。
4. 样式：4 组 8 色调色板（colorblind 用 Okabe–Ito）与 `auto` 背景解析，供 T4.3 直接消费。
5. 不引入运行时依赖，不 import ECharts/React/Electron，不改 `formatVersion`/manifest/JSONL/IPC。

## 2. 关键文件

```text
packages/chart-model/src/render-model.ts (+render-model.test.ts)   # 映射/校验/值/meta
packages/chart-model/src/palettes.ts                               # 4 调色板 + 背景解析
packages/chart-model/src/index.ts                                  # 真实公开出口
packages/chart-model/src/__snapshots__/render-model.test.ts.snap   # 2 条黄金快照
packages/chart-model/tsconfig.json                                 # + domain/table-engine references、types: node
docs/adr/040-t41-render-model.md
docs/reports/t4.1/REPORT.md
```

## 3. 公开 API

```ts
// @curve/chart-model
MAX_CHART_SERIES = 20
EMPTY_SERIES_NAME = '(空)'
CHART_PALETTES: Record<ChartPaletteId, readonly string[]>          // 4 × 8
CHART_BACKGROUNDS: { light: '#ffffff'; dark: '#1e1e1e' }
resolvePalette(paletteId): string[]
resolveChartBackground(option, { theme?, background? }): string

canBeChartX(column): boolean
canBeChartY(column): boolean
canBeChartSeries(column): boolean
validateChartMapping(table, mapping): ChartIssue[]

resolveSeries(table, rows, spec, options?): { ok: true; model } | { ok: false; issues }

RenderModel / RenderSeries / RenderXAxis / RenderStyle / RenderMeta
ChartIssue { path; code: ValidationIssueCode; message }
ChartResolveOptions { locale?; theme?: 'light' | 'dark'; background? }
```

## 4. 语义实现（对照 SPEC §11.1–§11.3 / ADR-040）

| 项 | 语义 |
|---|---|
| 映射校验 | X：number/date/text + role x\|none；Y：number + role y\|none，宽表 ≥1 且不重复；长表系列列 text/enum + role series\|none；失败一次返回全部 issue |
| 行顺序 | `spec.filter` → 丢 number/date 缺失 X 行 → `spec.sort`（未配置时 number/date 按 X 升序稳定排序，text 保序） |
| 宽表系列 | 每个 Y 列一条；`id = 列 id`；`name = label`，重名 ` (2)`；颜色按调色板取模 |
| 长表系列 | distinct 值按排序后首次出现；`id = <seriesColumnId>:<存储值>`；null/空串归 `(空)`；enum 用 option label |
| X | date → epoch ms（`type='time'`）、number → 数值、text → 字符串（`'category'`）；label = `options.xLabel ?? 列 label`，unit 取列 unit |
| Y | number 保留；`null` 断点；其它类型 → null + 该列一条聚合 warning |
| 空表 | ok，x/各系列为空数组，meta 计数 0 |
| 重复 X | 保留全部点，warning 带重复数 |
| >20 系列 | 截断并 warning（宽表按 Y 选择顺序，长表按首次出现顺序） |
| 样式 | palette 由 paletteId 解析；background 顺序：显式 override > theme(auto) > light/dark > `#ffffff`；其余令牌直传 |
| meta | `sampled=false`；`sourcePoints=renderedPoints=非空 Y 值总数`；warnings 固定顺序聚合 |

## 5. 验收逐项

| # | 验收项 | 结果 |
|---|---|---|
| 1 | 固定夹具的 RenderModel 黄金快照 | ✅ 2 条 `toMatchSnapshot`（宽表日期图、长表 enum 图），快照已提交 |
| 2 | 空数据/缺列/类型错返回错误或 warning，不崩溃 | ✅ 43 条单测覆盖缺列/错类型/错角色/重复 Y/空 Y/tableId 不匹配/非法 filter/4 级排序/空行集/缺失 X/非数值 Y |
| 3 | 系列顺序稳定；>20 系列截断并警告 | ✅ 宽表与长表各一条截断用例，顺序与 warning 文本断言 |
| 4 | 包内无 echarts import | ✅ 边界单测扫描 `src/*.ts`（echarts/react/electron 的 import 与 require）+ depcruise `chart-model-no-echarts` |

## 6. 验证命令与结果（2026-10-24 本机）

```text
pnpm exec vitest run packages/chart-model
  2 files / 45 tests passed（44 条新增 + 1 条 PACKAGE_NAME）

pnpm verify
  144 files / 1276 tests passed；ESLint 0；depcruise 0 violations

pnpm test:coverage
  All files：statements 75.23% / branches 68.21% / functions 73.74% / lines 75.34%
  chart-model：render-model.ts 97.54% lines（95.07% branch）/ palettes.ts 90.9% lines
  阈值 70/60 未下调；纯逻辑包 85% 门禁满足

pnpm format:check
  通过

pnpm build
  exit 0；renderer 1,618.04 kB + ImportSession 42.82 kB；CSS 64.03 kB
  （chart-model 尚未被 renderer 引用，产物与 T3.6/M3 一致）

pnpm e2e
  72 passed（3.9m）；未改 UI/E2E 代码，M3 验收用例仍通过

pnpm bench
  exit 0；table.open.100k 572ms/3s、table.save.100k 381ms/500ms、edit.commit 1ms/50ms、
  query.100k 227ms/400ms、text-sort 340ms/400ms、cjk-sort 680ms/800ms、import 928ms/8s、
  condition.rules.50x100 P95 1ms/16ms
```

## 7. 残留风险与未覆盖

- number/date X 缺失的行被丢弃（不是 null 点），图表点数可能少于表格行数；已有聚合 warning。
- warning 为英文开发者文案且聚合到列级，UI 无法逐行定位；T4.4/T4.5 展示时需要本地化映射。
- 长表把 null 与空字符串合并为 `(空)` 组，图上无法区分（数据仍保留在表里）。
- 调色板是包内常量，不是设计令牌；需要主题化/自定义时另写 ADR。
- `sourcePoints` 不含断点；T4.2 采样后的 `renderedPoints` 必须沿用该口径，否则预算对不上。
- `resolveSeries` 每次调用都重新解析列索引与排序；T4.6 若 100k 点端到端超预算，再考虑
  复用 `QueryContext` 或缓存（不要提前优化）。
- 未实现 LTTB（T4.2）、ECharts option（T4.3）、图表 UI/检查器（T4.4）。

## 8. 结论与停点

T4.1 的 4 项验收全部通过，RenderModel 契约已可被 T4.2/T4.3 直接消费。下一步 T4.2（LTTB 采样
与缺失值语义），仍是一次只推进一个任务。

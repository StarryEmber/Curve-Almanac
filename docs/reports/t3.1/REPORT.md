# T3.1 报告 — 表格样式模型与内置模板

- 任务：T3.1（FR-STY-01、FR-STY-05；SPEC §10.1、§10.3）
- 日期：2026-10-23
- 决策：ADR-034（内置模板、resolver、fork、hex 颜色、默认值集中、不变量）
- 状态：已完成；M2 已于 2026-10-23 获用户接受；未进入 T3.2。

## 1. 目标与交付

1. 在 `@curve/domain` 落地 `TableStyle` 的完整模型基础：默认值、颜色/数值校验、加载不变量；
2. 4 个稳定 id 的内置模板常量（report-light / compact-light / dark / finance），深度冻结、不入 manifest；
3. `resolveStyle(id, userStyles)` 与未知 id 的默认回退 + warning；
4. `forkTableStyle` 深拷贝为 `sty_<uuid>`，编辑内置不改变内置；
5. `createTableStyle` 最小工厂与默认令牌；
6. 默认样式常量集中到 domain，persistence / app-core 复用；
7. 全量回归与覆盖率记录。

## 2. 关键文件

```text
packages/domain/src/table-style.ts            # 新：内置模板、默认值、resolve/fork/create
packages/domain/src/table-style.test.ts       # 新：18 条单测
packages/domain/src/schemas.ts                # hex 颜色 schema
packages/domain/src/invariants.ts             # 默认样式/持久化 builtin/重复规则 id
packages/domain/src/invariants.test.ts        # +1 条、改写原 builtin 用例
packages/domain/src/index.ts                  # 导出 table-style
packages/persistence/src/manifest.ts          # 复用 DEFAULT_TABLE_STYLE_ID
packages/app-core/src/commands/tables.ts      # 复用 DEFAULT_TABLE_STYLE_ID
docs/adr/034-t31-table-style-model.md
docs/SPEC.md                                  # §6.6.6 / §10.3 实现边界
docs/TASKS.md                                 # T3.1 勾选与实现备注
docs/reports/t3.1/REPORT.md
```

## 3. 公开 API

```ts
BUILTIN_STYLE_IDS
BuiltinStyleId
DEFAULT_TABLE_STYLE_ID
DEFAULT_TABLE_STYLE
DEFAULT_TABLE_STYLE_TOKENS
listBuiltinStyles(): readonly TableStyle[]
getBuiltinStyle(id: string): TableStyle | undefined
isBuiltinStyleId(value: string): value is BuiltinStyleId
isResolvableStyleId(styleId: string, userStyleIds: ReadonlySet<string>): boolean
unresolvedStyleWarning(styleId: string): string
resolveStyle(styleId: string, userStyles?: readonly TableStyle[]): TableStyleResolution
createTableStyle(options: CreateTableStyleOptions): TableStyle
forkTableStyle(style: TableStyle, options?: ForkTableStyleOptions): TableStyle
tableStyleColorSchema
```

`TableStyleResolution = { style, fallback, warning? }`；`resolveStyle` 对未知 id（含未知
`builtin.*`）返回 `builtin.report-light` + warning。`forkTableStyle` 保留条件规则 id，深拷贝
tokens / overrides / 嵌套 `FilterPredicate`。

## 4. 内置模板

| id | 令牌特征 |
|---|---|
| `builtin.report-light` | normal、行高 32、白底、深灰表头、细横线、system-ui、13px |
| `builtin.compact-light` | compact、行高 24、12px、无竖线、浅灰表头 |
| `builtin.dark` | `#1e1e1e` 底、`#d4d4d4` 字、`#252526` 表头、弱边框 |
| `builtin.finance` | 等宽字体栈、斑马纹、深色财务表头；数字右对齐/千分位由 T3.2 实现 |

所有内置模板通过 `tableStyleSchema`、深度冻结，并通过 header/body/alternate/selection 的
WCAG AA 对比度测试（≥4.5:1）。四个模板的令牌签名互不相同，T3.2 再做实际视觉快照。

## 5. 验证命令与结果（2026-10-23 本机）

```text
pnpm exec vitest run packages/domain
  11 files / 150 tests passed（对应基线 978 → 全量 997）

pnpm verify
  124 files / 997 tests passed；ESLint 0；depcruise 347 modules / 1335 deps / 0 violations

pnpm test:coverage
  lines 75.13% / statements 75.03% / branches 67.23% / functions 76.12%
  table-style.ts lines 97.56% / statements 97.72% / branches 96.77%
  阈值 70/60 未下调

pnpm format:check
  通过

pnpm build
  exit 0；renderer 1,419.17 kB + ImportSession 42.82 kB；
  table/query/import worker 220.13/233.15/269.61 kB
```

任务指定验证：`pnpm exec vitest run packages/domain --testNamePattern "style"` 等价覆盖
（实际跑了整个 domain 包）。T3.1 是纯 domain 任务，不涉及 UI/交互，未跑 E2E；全量 E2E
基线仍为 64 passed（M2 最后一次运行）。

## 6. 验收逐项

| # | 验收项 | 结果 |
|---|---|---|
| 1 | 4 个内置模板通过 schema 校验且视觉差异明显 | ✅ schema + 4 组令牌签名 + 对比度；实际渲染快照留 T3.2 |
| 2 | 编辑内置 → 自动生成 `sty_` 副本，内置不变 | ✅ `forkTableStyle` 深拷贝、内置冻结；单测验证源对象不变 |
| 3 | 非法颜色/越界数值被拒绝 | ✅ hex 白名单；fontSize/radius/padding/width/digits/50 条规则上限均有拒绝用例 |

## 7. 残留风险

- `builtin.finance` 的数字右对齐/千分位无法由现有 `TableStyleTokens` 表达，按 ADR-034 由
  T3.2 的列格式化管线负责；若 T3.2 需要样式级数字配置，需扩展模型并写 ADR。
- 内置模板名是中文规范名/回退标签；T3.4/T3.5 的模板 UI 必须按 id 走 `t(key)` 本地化。
- fork 保留条件规则 id；T3.5 导入/复制若需要重新分配，再统一处理。
- 颜色只接受 hex（不支持 `transparent`/CSS 变量）；如需扩展另写 ADR。
- 没有实际截图对比（T3.1 无渲染层）；T3.2 必须补浅色/深色/紧凑/财务视觉快照。

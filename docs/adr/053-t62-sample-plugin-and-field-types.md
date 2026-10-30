# ADR-053 T6.2 的示例插件、语义字段类型接线与插件导入器执行位置

- 状态：已接受
- 日期：2026-10-30
- 相关：SPEC §6.1、§6.6、§9.2、§14.1、§14.2、§14.3、§15；TASKS T6.2、T6.3；ADR-010、ADR-015、
  ADR-019、ADR-027、ADR-031、ADR-052

## 背景

T6.1 交付了 `@curve/plugin-sdk` 的契约、四类注册表与宿主激活器，但**没有任何消费者**：
示例插件不存在，语义字段类型（`ColumnDef.fieldTypeId`）与插件导入器（`ImporterDef`）都还不能
在应用里被看见或使用。契约本身留下四个必须由 T6.2 回答的问题：

1. **示例插件的形状**：字段类型 id 用什么命名？`rating` 的值域、文本解析与显示如何定义？
   导入器接受什么文件形状、如何报告错误？
2. **字段类型接在哪里**：`ColumnDef.fieldTypeId` 在 SPEC §6.1/§6.6 已定义，但没有任何 UI 能设置它；
   `fieldTypeId` 必须能解析（SPEC §14.3），而解析需要注册表——注册表在渲染进程，
   manifest 校验却在主进程（`@curve/persistence` 的 `validateManifest` / `parseManifestDocument`）。
3. **插件导入器在哪里执行**：插件是渲染进程模块（SPEC §14.1、ADR-010），而 T2.5 的导入管线
   把解析与规划放进专用 Worker；插件不能跨进 Worker。
4. **UI 读取注册表的边界**：T6.3 才负责“所有贡献点从注册表读取”；T6.2 只被 TASKS 要求
   接通两个验收面（新建列的语义类型、导入向导的示例导入器）。

如果这些决定放进代码而不记录，后续会出现“插件 id 命名漂移”“主进程与渲染进程对同一
`fieldTypeId` 判断不一致”“插件导入阻塞/绕过 Worker 边界”等不可复核的偏差。

## 决定

### 1. 示例插件 `plugins/plugin-sample`

- 包名 `@curve/plugin-sample`，只依赖 `@curve/plugin-sdk` 与 `@curve/domain`（SPEC §4.3.6）。
- **字段类型** `com.curvealmanac.rating`（反向域名，避免与五种内置存储类型重名）：
  - `storageType: 'number'`，`defaultWidth: 96`，label `Rating`；
  - `parseText` 接受整数文本（含 `0`/`6`），空文本清空为 `null`；**值域在 `validate` 收口**
    （1–5 的整数），这样 `0`/`6` 走“超出范围”而不是“类型不匹配”；
  - `format` 把 1–5 渲染为 `★` 重复（`3` → `★★★`），`null` 为空串，其他值保持可读；
  - `compare` 数值升序、`null` 排最后（与 table-engine 的排序语义一致，ADR-032）。
- **导入器** `com.curvealmanac.points`：接受 `{"points":[{"x":1,"y":2}]}` 或点对象数组
  （与 `fixtures/json/points.json` 兼容），`x`/`y` 必须是有限数字，`label` 可选；
  结构错误抛 `E_IMPORT_FORMAT`，空列表返回 warning；`AbortSignal` 在解析前后各检查一次。
- **插件定义** `com.curvealmanac.sample`（`apiVersion: '1.0'`），`activate` 注册上述两项；
  `sampleFieldTypes` 数组同时被主进程读取（见 §3）。

### 2. 渲染进程组装点与 UI 读取方式

- `apps/desktop/src/renderer/plugins/index.ts` 是唯一组装点：`createPluginHost({ plugins: [samplePlugin] })`
  是模块单例，`activateRendererPlugins()` 在**首帧渲染前**调用一次（`main.tsx`），失败由宿主隔离
  （ADR-052：回滚 + 禁用 + 日志），不阻塞窗口。
- T6.2 的消费者只读**启动时的快照**，不订阅注册表、不把注册表放进 React state（沿用 T5.4 的
  性能约束：关闭的面板/未打开的面板不做订阅）；T6.3 再接贡献点变更后的刷新与来源标识。
- 两个验收面：
  - 列对话框新增“语义类型”下拉，只列出 `def.storageType === form.type` 的字段类型；
    换存储类型会清空语义类型（ADR-015 要求两者匹配）。`ColumnsPanel` 在存储类型徽标旁显示字段
    类型 label（不可用时为原始 id）。
  - 导入向导第 1 步新增“导入器”下拉：`自动（内置 CSV/JSON）` + 插件导入器；选中插件导入器后
    预览改用插件结果，编码下拉禁用（见 §4）。
- **不在 T6.2**：图表类型/命令贡献点、插件来源徽标、错误 toast、手动禁用与持久化——这些是 T6.3
  的“插件接入 UI 与隔离”。内置字段类型/导入器仍由现有硬编码列表提供，T6.3 再统一为
  “注册表 + 内置注册”。

### 3. 主进程可解析 `fieldTypeId`，但不激活插件

- `@curve/persistence` 的 `validateManifest` / `parseManifestDocument` 增加可选
  `resolveFieldTypeStorage`；`FileWorkspaceStore` 从构造选项接收它，并用于打开、写 manifest、
  备份恢复三处。
- 主进程通过 `apps/desktop/src/main/plugins.ts` 只读取插件包导出的 `sampleFieldTypes`，
  建立“字段类型 id → storageType”的只读 Map；**不** `createPluginHost`、不执行 `activate`。
- 效果：带 `fieldTypeId` 的 manifest 在载入/保存时按 SPEC §14.3 严格校验（未知类型 →
  `E_WS_INVALID_MANIFEST`；storageType 与 `column.type` 不符 → `E_WS_INVALID_MANIFEST`），
  不再出现“cannot verify field type”的打开警告；两个进程共用同一份定义，不会漂移。
- 未提供 resolver 的调用方（测试、内存适配器）保持 T6.1 的行为：只给 warning。

### 4. 插件导入器在渲染进程解析，规划在渲染进程内联执行

- 导入 Worker 仍负责内置 CSV/JSON 的解码与解析（T2.5/ADR-031），协议不变。
- 选择插件导入器时：渲染进程用 `decodeImportBytes(bytes, 'auto')` 解码（复用 T2.5 的编码层），
  调用 `ImporterDef.parse({ fileName, text, locale }, signal)`，把 `ImportResult` 转成
  `ParsedImportData`（缺省 `columns` 时用 `buildImportColumns` 推断），再做与 Worker 完全相同的
  `planImport` 载荷（`rows: []` + `existingKeys`/`existingRowCount` 摘要）**内联规划**。
- `client.open` 以 transfer 方式把字节交给 Worker，会 detach 渲染进程的 buffer；因此
  `useImport.start()` 在 transfer 前保留一份字节副本供插件导入器使用。
- 插件导入期间的预览增加 `ImportPreview.importerLabel`（**渲染进程内部协议**，不是 IPC/SPEC §15
  通道）；编码下拉禁用，CSV 专有的分隔符/表头控件自然隐藏（`format: 'json'`）。

### 5. app-core 用结构化端口，不依赖插件 SDK

- `packages/app-core/src/validation/field-types.ts` 定义 `FieldTypeRule`/`FieldTypeLookup`
  （`id`、`storageType`、`parseText`、`validate`），与 `FieldTypeDef` 结构兼容。
- `checkTableCellSet` 与 `validateCellBatch` 接受可选 `{ fieldTypes }`：先跑 `coerceCell` 的
  存储规则，再跑 `parseText`/`validate`；未传 lookup 时行为与 T2.2 完全一致。
- 渲染进程组装点把插件宿主注册表作为 lookup 传给 `createAppCore`，命令层与编辑器因此共享同一套
  语义校验（spec 要求命令不能接受编辑器拒绝的值，ADR-028）。
- `packages/ui` 的 `formatStyledCellValue`/`presentStyledCell` 增加 `formatField?` 回调；
  网格、自动列宽与样式预览传入 `formatFieldCell`。`ui` 仍不 import plugin-sdk。

### 6. `ColumnDraft.fieldTypeId` 的三态语义

`ColumnDraft.fieldTypeId?: string | null`：

- 字符串：选择该字段类型（`checkColumnDraft` 透传到 `ColumnDef`）；
- `null`：显式清除（`draftFromColumn` 对没有语义类型的列也写 `null`，避免 T2.3 的
  “metadata 编辑保留字段类型”回填）；
- `undefined`：保留现有字段类型（仅当存储类型未变），保持 T2.3 既有调用方的行为。

## 代价

- **app-core 多一个注入点**：`createAppCore({ fieldTypes })`、工作区动作与单元格命令都要传；
  这是“命令层必须与编辑器同规则”的必然代价，缺省值保持旧行为。
- **字段类型知识进入主进程**：主进程为了校验 manifest 需要编译进包的字段类型映射；插件定义
  因此被两个进程共享。v1 的插件本来就是静态编译（ADR-010），这不是新的信任边界，但增加了
  “插件包在 main 与 renderer 都被 import”的耦合面。
- **插件导入的规划在渲染进程主线程**：大文件的插件导入可能阻塞 UI（内置 CSV/JSON 不受影响，
  仍走 Worker）。T6.2 的示例导入器只处理小型点数据；若未来插件导入大文件，需要把解析结果
  传入 Worker 或拆独立 Worker（见复核条件）。
- **每次导入多一份字节副本**（为插件切换保留），上限受现有导入大小限制约束；内置路径多一次
  `new Uint8Array(bytes)` 拷贝。
- **UI 只在启动时读快照**：T6.2 不允许运行时启用/禁用插件；贡献点变化后的刷新是 T6.3 的事。
- **列表面板新增字段类型徽标**：label 由插件提供、不走 i18n 消息表（插件文案不本地化）。
- **`ImportPreview.importerLabel` 只存在于渲染进程协议**；若将来要跨进程传插件信息，需要
  升级为 IPC 契约并写 ADR。

## 影响

- 新增：`plugins/plugin-sample/**`（`package.json`、`tsconfig.json`、`src/{rating,points-importer,plugin,index}.ts`
  与 3 个测试、`README.md`）；`apps/desktop/src/renderer/plugins/index.ts` 与其测试；
  `apps/desktop/src/main/plugins.ts` 与其测试；`apps/desktop/src/renderer/features/import/plugin-import.ts`
  与其测试；`packages/app-core/src/validation/field-types.ts`；`e2e/plugin.spec.ts`；本 ADR 与
  `docs/reports/t6.2/REPORT.md`。
- 修改：`tsconfig.base.json`（路径别名）、根 `tsconfig.json` 与 apps/desktop 的 node/web references、
  `apps/desktop/package.json`（两个 workspace 依赖）、`pnpm-workspace.yaml` 已有 `plugins/*`
  （无需改）、根 `package.json` 的 `lint:boundaries` 加入 `plugins`、
  `packages/persistence/src/manifest.ts`（resolver 选项）、`apps/desktop/src/main/workspace/file-workspace-store.ts`、
  `packages/app-core/src/{app-core.ts,usecases/workspace-actions.ts,commands/table-cell-set.ts,validation/cell-validation.ts,validation/column-draft.ts}`、
  `packages/ui/src/table-style-format.ts`、`apps/desktop/src/renderer/{main.tsx,app-core/renderer-core.ts}`、
  `features/{columns,grid,style,import}/**`、i18n 两张消息表、SPEC §14.1/§14.2/§14.3、TASKS T6.2、
  TESTPLAN E9、CHANGELOG、HANDOFF、AGENTS §0、ADR 索引。
- 不改：`formatVersion`、JSONL/manifest 字段、IPC 通道与 preload API、CSP、Electron 安全选项、
  错误码；不新增运行时依赖（`plugin-sample` 只依赖两个 workspace 包）。

## 复核条件

- 若 T6.3 需要运行时启用/禁用插件（禁用列表持久化）：不要复用本次的“启动时快照”，改为
  `Registry.subscribe` + 面板打开时快照（ADR-052 的复核条件），并补 E2E。
- 若插件导入需要处理大文件：把 `runPluginImport` 的解析结果通过新的 Worker 消息送入
  `planImport`，或把插件导入拆成独立 Worker；不要在主线程上对 10 万行以上做内联规划。
- 若主进程与渲染进程的字段类型集合出现差异（例如渲染进程插件激活失败）：当前主进程按
  “编译进包”的定义校验，渲染进程按“实际激活”的注册表解析；两者都是保守方向（载入更严格、
  显示更宽松）。若需要一致的可观测状态，加启动自检并在 T6.3 的插件面板显示。
- 若字段类型需要本地化 label：改为 `labelKey` 或允许插件提供多语言 map，并更新 SPEC §14.2。
- 若插件需要影响 CSV 导出格式：导出目前用存储格式化（`formatCellValue`），未接字段类型；
  需要时把 `formatFieldCell` 接到导出管线并补 E2E。

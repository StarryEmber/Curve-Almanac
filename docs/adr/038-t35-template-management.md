# ADR-038 T3.5 的模板 CRUD、删除回退、导入导出与身份重分配

- 状态：已接受
- 日期：2026-10-24
- 相关：SPEC §6.6.6、§6.6.7、§10.5、§13.1、§13.2；TASKS T3.5；ADR-034、ADR-035、ADR-036、ADR-037

## 背景

T3.4 交付了样式编辑器，但模板本身仍不可管理：没有另存为、重命名、复制、删除、设为默认，
也不能把模板带到另一个工作区。SPEC §10.5 定义了操作清单与 `.curvestyle.json` 导出格式，
§13.1 已列出 `style.create/update/delete/apply`，但只有前两条实现；TASKS T3.5 还要求
“删除被引用模板，所有视图回退默认并提示”。

开工前需要回答四个问题：

1. **命令面**：删除、应用、设为默认分别走哪条命令？是否新增 `style.setDefault`？
2. **删除的撤销语义**：SPEC §13.1 把 `style.delete` 标为可撤销，TASKS T3.5 写“删除除外，需确认”。
   两者冲突，必须显式裁决。
3. **导入导出的传输**：是否新增 IPC 通道？导入文件是否要像 CSV 一样归档到 `imports/`？
4. **身份重分配**：ADR-034 把“导入/复制时重新分配规则 id”留给 T3.5；还要定义名称冲突、
   跨表缺失列与非法文件的处理。

用户已确认采用本文的全部建议（含“删除可撤销，SPEC 优先”）。

## 决定

### 1. 命令面：复用 create/update，新增 delete/apply

```ts
style.delete { styleId: string }
style.apply  { styleId: string; target: StyleApplyTarget }
type StyleApplyTarget = { kind: 'view'; viewId: string } | { kind: 'default' }
```

- 另存为/复制/导入落库复用 `style.create`；重命名复用 `style.update`（整条样式替换）。
- 不新增 `style.setDefault`：“设为默认”是 `style.apply` 的 `{ kind: 'default' }` 目标，
  保持 SPEC §13.1 的命令清单不扩张。
- `style.delete` 只接受 `sty_` 用户样式；内置模板不可删除。删除在同一 Immer 事务内：
  移除 `tableStyles[id]`、把所有 `tableView.styleId === id` 的视图改指回退样式、若工作区默认
  正是该样式则改回 `builtin.report-light`、更新 workspace `updatedAt`。回退样式优先取工作区
  当前默认（只要它仍可解析且不是被删样式），否则 `DEFAULT_TABLE_STYLE_ID`。
- `style.apply` 校验 `styleId` 可解析（内置或已存在的用户样式）与目标：
  `view` 必须是现有表视图；`default` 写 `workspace.settings.defaultTableStyleId`。
  只改 manifest 状态，不写 JSONL。
- 两条命令都注册到命令总线，加入 `MANIFEST_SAVING_COMMANDS`（manifest-only 保存）与
  `EditHistory` 的 workspace 作用域集合；`WorkspaceActions.deleteTableStyle/applyTableStyle`
  等待保存队列 flush，失败返回 `committed: true`，与 T3.3/T3.4 语义一致。

### 2. 删除可撤销（SPEC §13.1 优先）

- TASKS 的“删除除外”与 SPEC §13.1 冲突；按 AGENTS §0，SPEC 优先。删除仍需要二次确认，
  确认框列出将被回退的视图数量与回退目标；成功后显示结果说明。
- 删除进入 workspace 作用域历史，undo 同时恢复样式与所有视图/默认引用；redo 再次删除并回退。
  不新增“软删除”标记，不改变 manifest 字段。

### 3. 导出文档、解析与身份重分配

```ts
interface StyleExportDocument {
  kind: 'curve-table-style';
  version: 1;
  exportedAt: string;   // ISO 8601，带时区
  style: TableStyle;
}
```

- `@curve/domain` 新增 `style-export.ts`：`styleExportDocumentSchema`、`createStyleExportDocument`
  （深拷贝快照 + `exportedAt`）、`serializeStyleExportDocument`（2 空格缩进 + 结尾换行）、
  `parseStyleExportDocument`（返回结构化失败原因，不抛跨进程错误）。
- 失败原因：`tooLarge`（> 2,000,000 字符）、`json`、`version`（显式 `version !== 1`）、
  `document`（`kind`/schema/其它字段不合法）。UI 按原因给具体文案，不用一个笼统错误。
- 导入/复制/另存为都走 `reassignStyleIdentity(style, { name?, uuid? })`：新的 `sty_<uuid>`、
  `builtin: false`、每条条件规则新的 `rule_<uuid>`；tokens、列覆盖、谓词与列 ID 原样保留，
  不静默改写。
- 名称：导入时原名未被占用则保留，否则 ` (2)`、` (3)`…；复制/另存为总是生成副本名。
  名称比较使用持久化的 `style.name`（含 4 个内置模板的规范名）。手写重命名遇到重名时
  内联报错，不静默改名。
- 跨表列引用（列覆盖与规则中的列 ID）按 SPEC §10.5/§6.6.7 保留；目标表不存在的列只提示
  “将被忽略”，不删除、不改写。求值忽略逻辑已在 ADR-036 落地。

### 4. 传输：复用现有 IPC，不归档导入文件

- 导入用 `file:importText`（filters：`.json`），导出用 `file:exportText` + 主进程
  `dialog.showSaveDialog`；两者均已实现并原子写。**不新增 IPC/preload 通道**。
- `.curvestyle.json` 以 `.json` 结尾，现有 `importFormatFromName` 已接受；样式导入不进入
  `imports/` 归档（它是可移植配置，不是表格源数据），也不占用导入 token 的归档语义。
- 建议文件名 `<name>.curvestyle.json`；写入前先通过 `styleExportDocumentSchema` 构造并序列化，
  不把内存对象直接拼 JSON。

### 5. UI 落点

- 检查器“样式”面板新增“模板管理…”按钮，打开 `TemplateManagerDialog`：列出内置与用户模板，
  标记当前视图使用与工作区默认；用户模板支持应用、设为默认、重命名、复制、导出、删除；
  内置模板只读，可应用/设为默认/复制/导出/另存为。导入入口也在此。
- 编辑器的“模板”标签新增“另存为模板…”：名称输入（预填副本名）后，把**当前草稿**（含尚未提交
  的编辑）克隆为新身份并 `style.create(viewId)`，编辑器切换到新副本；一条撤销。
- 删除确认在管理对话框内切换内容与 footer，不再叠加第二个模态框；成功后就地显示
  “N 个视图已回退到 <模板>”，并刷新列表。
- 导入对话框：选文件 → 解析校验 → 复用 `StylePreview` 以当前表前 50 行预览 → 显示名称、
  规则/覆盖数量与缺失列提示 → “导入后应用到当前视图”（默认勾选）→ 一条 `style.create`。
- 重命名在列表行内完成，重名/空名内联报错；复制/导入/另存为自动加后缀。
- 全部文案走消息表；新增样式只使用已声明的 `--cs-*` 令牌，不引入颜色字面量。

### 6. 撤销粒度与保存

- 一次操作 = 一条命令 = 一条 workspace 历史：删除、应用、设为默认、重命名、复制、另存为、
  导入各一条；不合并、不拆分。
- 全部 manifest-only：不标记脏表、不写表 JSONL；`SaveQueue.enqueueManifest` 串行落盘，
  action 等待 flush。删除/应用失败回滚（命令抛 `AppError` 时 Immer 不发布状态）。
- 不做“导入合并到已有样式/覆盖同名样式”；每次导入都创建新样式，避免静默覆盖。

## 代价

- 删除可撤销意味着确认框之后仍能 Ctrl+Z 恢复；提示文案必须说明“可撤销”，不能写“不可撤销”。
- 管理对话框替换了 T3.4 编辑器“模板”标签的一部分角色；两个对话框（管理、导入）增加了
  焦点/键盘路径，E2E 需要覆盖。
- 导入预览只显示前 50 行，不能验证 100k 行下的 bar/badge；与 T3.4 的预览限制一致。
- 名称冲突只用 ` (2)` 后缀，不做交互式合并；删除/重命名不改变已有视图标题。
- 导入上限 2,000,000 字符对正常模板（几 KB）足够；超大 JSON 会在解析前被拒绝。
- 内置名称本地化与持久化 `name` 可能不同；名称冲突按持久化名比较，极少情况下本地化显示
  可能看起来同名。
- 不新增 `style.setDefault`，`style.apply` 的 `target` 联合承担两种语义；调用方必须显式传目标。

## 影响

- `@curve/domain`：新增 `style-export.ts`；`table-style.ts` 增加 `reassignStyleIdentity`、
  `styleCopyName`、`resolveStyleName` 与导出；测试覆盖解析失败原因、身份重分配、名称冲突。
- `@curve/app-core`：`commands/styles.ts` 增加 `style.delete`/`style.apply`；
  新增 `validation/style-import.ts`（解析、名称、列引用收集）；`app-core.ts` 注册命令并加入
  manifest 保存集合；`edit-history.ts` 扩展 workspace 作用域；`workspace-actions.ts` 增加
  `deleteTableStyle`/`applyTableStyle`；导出新类型与函数。
- `apps/desktop`：新增 `features/style/TemplateManagerDialog.tsx`、`TemplateImportDialog.tsx`、
  `style-transfer.ts`（IPC 调用与文件名）；`StylePanel` 增加入口与对话框状态；
  `StyleEditorDialog` 增加“另存为”；i18n 中英文案；`styles.css` 增加管理器/导入预览样式；
  `e2e/template.spec.ts` 与 `e2e/fixtures.ts`（可选导出路径，仅测试）。
- `docs`：SPEC §10.5/§13.1/§13.2 实现边界、TASKS T3.5、ADR 索引、CHANGELOG、HANDOFF、
  `docs/reports/t3.5/REPORT.md` 与截图。
- 不改变 `formatVersion`、manifest 字段、JSONL、IPC 通道、preload、CSP、沙箱或运行时依赖。

## 复核条件

- 若产品要求“删除不可撤销”，需要修改 SPEC §13.1、本 ADR 与确认文案，并重新评估 undo 后的
  视图引用恢复。
- 若导入需要“覆盖同名样式/合并规则”，需要定义冲突对话框与部分覆盖语义，不能沿用本 ADR 的
  “总是新建”。
- 若模板需要跨工作区保留稳定 id（例如模板市场/引用链接），需要扩展导出文档的 id 语义与
  迁移策略。
- 若 2,000,000 字符上限影响真实模板（大量规则/覆盖），先测量再调整并更新本 ADR。
- 若管理入口移到编辑器内部或做成独立窗口，需要重新评估焦点陷阱、E2E 与 200% 缩放布局。

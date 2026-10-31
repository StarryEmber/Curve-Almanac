# AGENTS.md — Curve Almanac 实现守则

本文件对在本仓库内工作的所有 AI 代理与人类开发者具有**强制约束力**。与任务描述冲突时，以本文件 + `docs/SPEC.md` 为准；两者仍冲突时，停下来提问，不要猜。

## 0. 当前状态

- 方案已完成并锁定（v1.0）。
- 实施进行中：`T1.5` 已完成；M1 验收演示已于 2026-10-21 获用户接受（报告
  `docs/reports/m1/REPORT.md`，恢复交互按 ADR-026 后置 T5.3）。`T2.1`（工作区入口、表管理与
  虚拟化数据网格）、`T2.2`（单元格编辑与校验）、`T2.3`（列管理、结构变更与迁移）、`T2.4`
  （区域粘贴）、`T2.5`（CSV/JSON 导入向导）、`T2.6`（筛选、排序与视图状态）与 `T2.7`
  （10 万行性能硬化）已完成；**M2 验收演示已于 2026-10-23 执行并获用户接受**
  （`apps/desktop/e2e/m2-acceptance.spec.ts` + `docs/reports/m2/REPORT.md`）。
  **T3.1（表格样式模型与内置模板）已完成**（`docs/reports/t3.1/REPORT.md`、ADR-034）。
  **T3.2（样式渲染管线）已完成**（`docs/reports/t3.2/REPORT.md`、ADR-035）；
  **T3.3（条件格式引擎）已完成**（`docs/reports/t3.3/REPORT.md`、ADR-036）；
  **T3.4（样式编辑器与实时预览）已完成**（`docs/reports/t3.4/REPORT.md`、ADR-037）；
  **T3.5（模板管理与导入导出）已完成**（`docs/reports/t3.5/REPORT.md`、ADR-038）；
  **T3.6（CSV 导出）已完成**（`docs/reports/t3.6/REPORT.md`、ADR-039）；
  **M3 验收演示已于 2026-10-24 执行并获用户接受**（`apps/desktop/e2e/m3-acceptance.spec.ts` +
  `docs/reports/m3/REPORT.md`）；里程碑 M3 已关闭。**T4.1（RenderModel 与宽/长表映射）已完成**
  （`docs/reports/t4.1/REPORT.md`、ADR-040）；**T4.2（LTTB 采样与缺失值语义）已完成**
  （`docs/reports/t4.2/REPORT.md`、ADR-041）；**T4.3（ECharts 适配器）已完成**
  （`docs/reports/t4.3/REPORT.md`、ADR-042）；**T4.4（图表创建与检查器）已完成**
  （`docs/reports/t4.4/REPORT.md`、ADR-043）；**T4.5（图表交互、空态与 PNG 导出）已完成**
  （`docs/reports/t4.5/REPORT.md`、ADR-044）；**T4.6（图表性能硬化）已完成**
  （`docs/reports/t4.6/REPORT.md`、ADR-045）。M4 的 T4.1–T4.6 全部完成；**M4 验收演示已于
  2026-10-26 执行并通过、2026-10-27 获用户接受**（`apps/desktop/e2e/m4-acceptance.spec.ts` +
  `docs/reports/m4/REPORT.md`，TESTPLAN E6 六项全过、全量 E2E 82 passed）；**M4 已关闭**。
  **M5 的 `T5.1`（分栏布局与标签页）已完成**（`docs/reports/t5.1/REPORT.md`、ADR-046）：
  递归分栏/标签、比例拖拽、500ms 布局保存去抖、非法 layout 回退单 pane；**`T5.2`
  （撤销/重做）已完成**（`docs/reports/t5.2/REPORT.md`、ADR-047）：全命令历史、100 条/
  256MB 估算上限、瞬态标签切换、Edit 菜单与撤销落盘；**`T5.3`（自动保存、恢复与最近打开）
  已完成**（`docs/reports/t5.3/REPORT.md`、ADR-048）：1.5s/10s 自动保存窗口、3s 退出 flush
  握手、stale/corrupt 锁与 manifest 备份恢复、最近列表移除/清空；**`T5.4`（快捷键与命令面板）
  已完成**（`docs/reports/t5.4/REPORT.md`、ADR-049）：renderer 键位注册表/作用域/冲突检测、
  Ctrl/Cmd+K 命令面板（模糊搜索/最近使用/禁用原因）、F1 帮助快捷键表、面板只在打开时挂载；
  **`T5.5`（设置与国际化）已完成**（`docs/reports/t5.5/REPORT.md`、ADR-050）：
  `userData/settings.json` 的 `app:settings`/`app:settings:update`、设置对话框（主题/语言/
  默认样式/自动保存）、自动保存关闭的“保存/放弃/取消”、完整 en-US 与文案门禁。**M5 验收演示已于
  2026-10-29 执行并通过并获用户接受，M5 已关闭**（`docs/reports/m5/REPORT.md`、
  `e2e/m5-acceptance.spec.ts`）。**M6 的 `T6.0`（品牌更名 Curve Almanac，ADR-051）、
  `T6.1`（插件 SDK 与注册表，ADR-052）、`T6.2`（示例插件，ADR-053）、`T6.3`（插件接入 UI 与
  隔离，ADR-054）、`T6.4`（安装包与发布配置，ADR-055）、`T6.5`（全量验收与文档收尾）与
  `T6.6`（日志文件落盘与 renderer 错误转发，ADR-056 选项 B）均已完成**
  （`docs/reports/t6.0/REPORT.md`–`t6.6/REPORT.md`、M6 汇总 `docs/reports/m6/REPORT.md`）。
  **M6 已于 2026-10-30 获用户接受并关闭；v1 实施阶段（M0–M6）结束。** 整应用内存门禁按用户
  决定为 1GB（ADR-057）；安装包已在 T6.6 后重打并通过 `package:smoke`（asar 含 electron-log）。
  不要自动领取新任务；**不规划 v2**（ADR-060），新功能需求仅在用户明确要求时另行评估。
  **不要跨任务/里程碑。**
- 仓库已有 pnpm workspace（9 个 `@curve/*` 包 + `@curve/desktop` + `plugins/plugin-sample`）、
  可运行的 Electron 壳、`domain`/`persistence`/`table-engine`/`app-core` 的实现、带主题/i18n 的
  App Shell、插件 SDK/宿主与示例插件，以及 21 个已接线 IPC 通道（另含 1 个 main→renderer 退出
  事件）；**续作前先读 `docs/HANDOFF.md`**。
- 每个任务的协议与里程碑停点见 §8。

## 1. 必读顺序

1. 本文件（全部）。
2. `docs/SPEC.md`：先读 §1–§6，再按任务读相关章节。
3. `docs/TASKS.md`：只领取一个任务，读完它的依赖、产出、验收、验证命令。
4. `docs/TESTPLAN.md`：找到该任务对应的测试层与夹具。
5. `docs/DECISIONS.md`：涉及技术选型或格式时必读。

## 2. 不可协商（违反即返工）

### 2.1 安全

- Electron 必须：`contextIsolation: true`、`nodeIntegration: false`、`sandbox: true`、`webSecurity: true`。
- 渲染进程**禁止**直接访问 `fs`、`path`、`child_process` 或任何 Node 内建模块；只能通过 `window.api` 的类型化 IPC。
- Preload 只暴露白名单方法；**禁止**暴露 `ipcRenderer` 本体、`invoke` 泛入口或任意路径读写。
- IPC 入参在 main 与 renderer 两端都用 Zod 校验；main 必须维护"已打开工作区根目录"白名单，任何路径先 `realpath` 再校验前缀。
- **禁止** `eval`、`new Function`、动态 `import()` 用户数据、`shell.openExternal` 任意 URL。
- CSP 必须存在；`will-navigate` 与 `setWindowOpenHandler` 默认拒绝。

### 2.2 数据格式

- 工作区格式版本 `formatVersion: 1`。任何字段增删改必须先加迁移与 ADR。
- 行数据必须写成 `{"id":"row_<uuid>","v":[...]}` 的 JSONL，UTF-8、`\n` 结尾、无 BOM。
- 列引用**一律用列 ID**，禁止用列名做持久化引用。
- 所有写入必须原子化（临时文件 + rename），并保留上一版备份；manifest 最后写。
- 打开高版本工作区必须拒绝并给出 `E_WS_VERSION_UNSUPPORTED`，禁止"尽力解析"。

### 2.3 依赖方向

只允许：

```
domain ← table-engine ← chart-model ← chart-echarts
domain ← persistence ← app-core ← desktop
domain ← plugin-sdk ← plugins/*
ui ← desktop
```

具体禁止：

- `domain` 不得 import React / Electron / ECharts / Zustand / fs。
- `chart-model` 不得 import ECharts；只有 `chart-echarts` 可以。
- `persistence` 不得 import Electron；Electron 适配器放在 `apps/desktop/src/main/`。
- `ui` 不得 import `app-core` 或 `persistence`。
- 插件只能 import `@curve/plugin-sdk` 与 `@curve/domain` 的公开类型，不得 import 应用内部路径。
- 用 `dependency-cruiser` 在 CI 硬阻断，规则见 `docs/SPEC.md §4`。

### 2.4 规格

- `docs/SPEC.md` 是契约。实现不得静默改变模型、文件格式、IPC 通道、公开 API。
- 需要偏离时：先写 `docs/adr/NNN-<slug>.md`（背景/决定/代价/影响），更新 SPEC 对应条款，再改代码。
- 不得删除或跳过验收项；未实现的功能必须显式报错或禁用，不能假装成功。

## 3. 命令（目标契约，随任务逐步落地）

> `pnpm package` 已在 T6.4 落地（ADR-055）；`package:smoke` 是真实安装/卸载冒烟，不属于
> 每次提交的必跑项。

```bash
pnpm install
pnpm dev                 # 启动 Electron 开发模式
pnpm build               # 构建 renderer + main + preload
pnpm package             # electron-builder 打安装包
pnpm package:smoke       # 真实安装/启动/卸载/数据保留冒烟（T6.4，会写系统安装）
pnpm lint                # eslint，零 warning
pnpm typecheck           # tsc -b
pnpm test                # vitest run
pnpm test:watch
pnpm e2e                 # 先 build，再 Playwright 驱动 Electron
pnpm bench               # 10 万行性能基准
pnpm verify              # lint + typecheck + test（提交前必须全绿）
```

任何命令失败都必须先修复或明确记录为阻塞；**禁止**用 `--no-verify`、跳过测试、放宽 lint 规则来"通过"。

## 4. 仓库规则

- 包管理器只用 pnpm；Node ≥ 20.11；`packageManager` 字段锁定版本。
- 内部包是**源码包**（`exports` 指向 `src/index.ts`），不单独构建；由 electron-vite/Vitest 统一编译。
- 包名统一 `@curve/*`；目录名 kebab-case。
- 每个包必须有 `index.ts` 公开出口；跨包只能从包根导入，禁止深层路径。
- 新增运行时依赖前：写 ADR，说明体积/维护/替代方案；能自己写 50 行解决的不加依赖。

## 5. 代码规范

- TypeScript strict；`noUncheckedIndexedAccess`、`noImplicitOverride`、`noUnusedLocals`、`noUnusedParameters` 全开。
- 禁止 `any`；外部输入用 `unknown` + Zod 收窄。确实需要逃生舱时用 `// eslint-disable-next-line` 并写明原因。
- 对象契约用 `interface`，联合/工具类型用 `type`；公开 API 必须显式标注返回类型。
- React 只用函数组件 + hooks；组件文件 PascalCase，其余 kebab-case。
- 业务逻辑不得写在组件里：组件只做渲染与事件转发，用例进 `app-core`，纯逻辑进 `domain`/`table-engine`/`chart-model`。
- 日期内部一律 epoch ms；显示用 `Intl`；禁止在模型里存本地化字符串。
- 金额/高精度小数 v1 不做，统一 `number`；UI 显示按列精度。
- 所有用户可见文案走 `t(key)` 消息表，禁止硬编码中文到组件（测试夹具除外）。

## 6. 测试规范

- 纯逻辑（domain/table-engine/chart-model）行覆盖率 ≥ 85%，全局 ≥ 70%。
- 新功能必须带测试；修 bug 必须先写复现测试。
- 测试文件与被测文件同目录，命名 `*.test.ts(x)`；E2E 在 `apps/desktop/e2e/`。
- 测试不得依赖真实用户目录、网络、系统时间；用固定时钟与临时目录。
- 图表适配器用黄金快照（序列化 ECharts option），不得只断言"渲染不报错"。
- UI 测试优先用 role/label 查询；`data-testid` 只用于难以语义定位的网格单元。

## 7. 数据兼容

- 每次改 schema/格式，必须新增迁移与 `fixtures/workspaces/` 夹具，并测试"旧版打开 → 迁移 → 数据逐行等价"。
- 迁移前自动备份到 `backups/`；迁移失败必须回滚并保持原文件可读。
- `rowCount` 是提示值，加载时以实际行数为准，不得信任。

## 8. 任务执行协议（每个任务都走一遍）

1. **领取**：只选一个未完成任务；确认依赖已勾选。
2. **复述**：用 5 行内说明目标、涉及文件、验收命令；有歧义先问。
3. **测试先行**：纯逻辑任务先写失败测试；UI 任务先写 E2E 骨架或组件测试。
4. **实现**：最小改动，不顺手重构无关代码。
5. **验证**：`pnpm verify` + 任务指定的 e2e/bench；记录实际输出。
6. **收尾**：勾选 `docs/TASKS.md`；更新 `CHANGELOG.md`（T0.1 创建）；必要时加 ADR；提交。
7. **报告**：任务 ID、改动文件、验证命令与结果、残留风险。

一次只推进一个任务。里程碑全部任务完成后，运行该里程碑的"验收演示"，**停下来等人类确认**再继续下一里程碑。

## 9. 提交协议

- Conventional Commits：`feat(tbl): ...`、`fix(chart): ...`、`test(domain): ...`、`docs(spec): ...`、`chore(tooling): ...`。
- 一个任务一个提交；提交信息正文写"验证："与命令结果摘要。
- 禁止把 `node_modules`、构建产物、真实用户数据提交进仓库。

## 10. 完成定义（DoD）

一个任务只有同时满足以下条件才算完成：

- [ ] 验收项全部通过，且是自动化可复现的。
- [ ] `pnpm verify` 零错误零警告。
- [ ] 新增/修改逻辑有对应测试；覆盖率达标。
- [ ] 公开类型、IPC、文件格式变更已同步 SPEC/ADR。
- [ ] UI 任务通过键盘操作与 200% 缩放冒烟。
- [ ] 性能预算未被突破（见 SPEC §16.1）。
- [ ] 无 `TODO`/`FIXME` 遗留在主路径；确需保留的写成 issue 并在任务报告里列出。

## 11. 歧义与升级

遇到 SPEC 未覆盖的情况，按以下顺序处理：

1. 查 `docs/SPEC.md §19 默认策略`。
2. 查 `docs/DECISIONS.md` 是否有同类决策。
3. 选**最保守、最易回滚**的方案，写 ADR，继续。
4. 涉及数据格式、安全、公共 API 的歧义：**停止并提问**，不要自行决定。

## 12. 明确禁止

- 关闭 `contextIsolation`/`sandbox` 来"让代码跑起来"。
- 在 renderer 里 `require('fs')` 或读任意路径。
- 为了快而绕过命令总线直接改 store（撤销会坏）。
- 把 10 万行数据整体放进 React state 并逐单元格触发全局重渲染。
- 用 `JSON.parse(JSON.stringify())` 做深拷贝热路径。
- 在图表层直接拼 ECharts option（必须经 `RenderModel` + adapter）。
- 未经确认升级 `formatVersion` 或删除迁移。

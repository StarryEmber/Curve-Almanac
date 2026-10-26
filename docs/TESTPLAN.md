# TESTPLAN — Curve Studio v1 测试与验收

> 本文定义"怎么证明做对了"。任务执行时按 `docs/TASKS.md` 的"验证"命令取用；里程碑验收按本文 §3 的场景走。
> 所有命令在仓库根执行；`pnpm` 脚本定义见 `docs/SPEC.md §5.2`。

## 1. 测试分层与门禁

| 层 | 工具 | 位置 | 命令 | 何时必须跑 |
|---|---|---|---|---|
| L1 单元 | Vitest（node） | 包内 `*.test.ts` | `pnpm test` | 每个任务 |
| L2 组件 | Vitest + Testing Library（jsdom） | `apps/desktop/src/**/*.test.tsx` | `pnpm test` | UI 任务 |
| L3 契约/集成 | Vitest + 临时目录 | `packages/*/test/`、`apps/desktop/test/` | `pnpm test` | 涉及 IPC/文件/格式 |
| L4 E2E | Playwright + Electron | `apps/desktop/e2e/` | `pnpm e2e` | UI/流程任务、里程碑 |
| L5 基准 | `scripts/bench.ts` | `scripts/` | `pnpm bench` | 性能任务、里程碑 |
| L6 手工验收 | 本文 §3/§7 | — | — | 里程碑、发布 |

**门禁**：

- `pnpm verify` = lint + typecheck + L1–L3，必须零错误零警告。
- 纯逻辑覆盖率：`domain`/`table-engine`/`chart-model` ≥ 85% 行；全局 ≥ 70%。
- E2E 必须在 Windows runner 通过；Linux 只跑 L1–L3 + 构建。
- 性能回归 > 20% 时 CI 报警（不直接失败，但里程碑不得签字）。

### 1.1 E2E 的对话框替身（必须实现）

原生文件对话框无法被 Playwright 稳定驱动。实现以下**仅测试可用**的钩子：

- 当 `process.env.CURVE_E2E === '1'` 且 `app.isPackaged === false` 时：
  - `dialog:pickDirectory` 返回 `process.env.CURVE_E2E_DIR`。
  - `dialog:saveFile` 返回 `process.env.CURVE_E2E_SAVE`。
  - `file:importText` 读取 `process.env.CURVE_E2E_IMPORT`。
- 生产构建中该分支必须不存在或被 `app.isPackaged` 短路；安全测试要验证打包后钩子失效。
- 除测试钩子外，不得为 E2E 在生产代码留后门。

---

## 2. 单元与契约测试矩阵

| 包/模块 | 必测内容 | 关键用例 |
|---|---|---|
| `domain/schemas` | 所有 Zod schema 正反例 | 缺字段、越界、非法枚举、未来版本 |
| `domain/invariants` | §6.6 全部不变量 | 行长度不符、重复主键、无效 view 引用 |
| `domain/coerce` | 数字/日期/布尔/枚举归一 | `"1,234.5"`、`""`、`"是"`、时区边界 |
| `domain/migrations` | 逐版本执行、失败回滚 | 夹具逐行等价、备份哈希不变 |
| `table-engine/jsonl` | 编解码、坏行、空表 | 截断 JSON、超长行、UTF-8 |
| `table-engine/filter` | 12 种操作符、all/any | null、类型不匹配、嵌套 |
| `table-engine/sort` | 多级排序、空值最后 | 数字/文本/日期/布尔 |
| `table-engine/paste` | TSV/CSV、引号、换行、BOM、矩形化 | 5×4 矩阵、CSV 回退、未闭合引号、10k 拒绝 |
| `app-core/paste` | 锚点、coerce、空主键、超列、100 列、取消、撤销 | 整批失败、定位首错、新增列、10k 分块取消 |
| `table-engine/import` | 编码/分隔符/表头/类型推断 | GBK、分号、坏行、JSON 数组 |
| `table-engine/csv-export` | 转义/BOM/CRLF/分块/文件名 | 引号、逗号、换行、首尾空白、空表、100k 分块 |
| `chart-model/resolve` | 宽/长映射、系列 id、warning | 缺列、非数值 Y、重复 X、>20 系列 |
| `chart-model/sample` | LTTB、首尾、null | 100k→2k、单调性、关闭采样 |
| `chart-echarts/option` | 黄金快照 | 4 调色板、深浅背景、null 断点 |
| `persistence` | 原子写、备份、锁、路径白名单 | 中断写、损坏 manifest、`../` 逃逸 |
| `plugin-sdk` | 注册/替换/移除/版本/隔离 | 重复 id、激活抛错、deactivate |
| `app-core/history` | patches 撤销/重做/合并 | 100 步、redo 分支、批量单条 |
| `ui/components` | 焦点陷阱/Esc/键盘/ARIA | Dialog、Toast、Tabs、Grid |
| `ipc` | 信封、校验、错误映射 | 非法载荷、未知通道、异常转 `E_UNKNOWN` |

> T4.3 实现：`packages/chart-echarts` 的 `option.test.ts` 有 **6 条 option 黄金快照**
> （4 调色板 + 深色背景 + 采样缺口）与 24 条 option 断言；`option.ssr.test.ts` 用真实
> ECharts 6.1.0 的 SVG/SSR 渲染验证 option 被接受，并断言未采样缺口为 2 个子路径、
> `meta.sampled=true` 时为 1 个子路径；生命周期单测 mock `echarts/core`（dispose 后实例计数
> 为 0），`boundary.test.ts` 扫描 workspace 确保包外无 echarts 引用。像素/布局仍由 T4.5/T4.6
> 的 E2E 覆盖。

---

## 3. E2E 场景

> 每个场景都要在干净临时目录运行；结束后断言无残留进程。用例名建议与场景 ID 一致。

### E1 启动与安全冒烟

1. 启动构建产物。
2. 断言窗口标题包含 `Curve Studio`，主区域可见。
3. `page.evaluate(() => typeof window.require)` 为 `undefined`；`process` 为 `undefined`。
4. 点击一个外部链接（测试页内置）不产生新窗口。
5. 控制台无 error（允许已知 dev 警告）。

### E2 工作区生命周期

1. 通过测试钩子新建 `E2E.cstudio`。
2. 断言 `manifest.json`、`tables/`、`.lock` 存在，manifest 通过 SPEC §7.2 校验。
3. 建表 `t1`，加 2 列，写 3 行。
4. 关闭应用；重启；从最近列表打开。
5. 断言表名、列、3 行数据、更新时间一致；`.lock` 在退出后删除。

### E3 表结构、编辑与粘贴

1. 新建 5 种存储类型的列；设置 X/Y/系列角色、枚举、必填、主键。
2. 键盘新增一行，编辑各类型；非法数字被拒绝且错误可见。
3. 从剪贴板粘贴 5×4 TSV（含引号与换行）。
4. 断言内容逐格正确；超列弹确认；类型错误整批不提交。
5. 撤销一次，整批粘贴回滚。

> T2.4 已覆盖第 3–5 步（`apps/desktop/e2e/paste.spec.ts` 7 条，含筛选守卫与 200% 缩放）。
> T2.6 把筛选守卫升级为“只写可见行 / 超出可见行整批拒绝”，并在同一 spec 中验证隐藏行不变。
> 第 2 步的“键盘新增一行”：T2.4 只提供 `table.rows.insert` 命令与粘贴追加，**尚无独立 UI**，
> 仍待后续任务闭环，不能当作已验收。

### E4 导入 100k CSV（GBK + 坏行）

1. 选择 `fixtures/csv/gbk-100k.csv`（GBK 编码、分号分隔、含 3 行坏数据）。
2. 确认编码/分隔符被正确嗅探；手动切换 UTF-8 后出现乱码提示，切回 GBK。
3. 预览 20 行；映射列；校验结果 `total=100000, skipped=3`。
4. 选择"跳过错误行"提交；断言导入行数 99,997。
5. 计时：从确认到表格可交互 ≤ 8s；UI 全程可点击。
6. 导出错误 CSV，断言 3 行且行号正确。

> T2.5 覆盖：`apps/desktop/e2e/import.spec.ts` 6 条（100k GBK + 3 坏行 + 错误 CSV、错编码
> 覆盖、150k 取消/100k 提示、JSON 替换 + 备份 + 原文归档 + 撤销、200k 拒绝、200% 缩放键盘）。
> `pnpm bench -- --import` 的 100k 核心管线 P95 1,072ms；E2E 计时断言 <8s。

### E5 表格外观与模板

1. 应用 `builtin.finance`，断言数字右对齐、斑马纹、等宽数字。
2. 改密度为 compact、表头深蓝、`sensor_a` 数字 1 位小数；断言 100ms 内预览变化。
3. 加条件规则：`sensor_a > 30` → 行背景红、警告图标；断言命中行与未命中行。
4. 另存模板 `我的报表`；复制、重命名、设为默认。
5. 导出模板；新建工作区导入；应用后截图对比一致（允许字体渲染差异，颜色/间距必须一致）。
6. 删除模板，断言引用视图回退到工作区默认样式并提示。

> T3.2 已覆盖第 1–2 步的渲染部分：`apps/desktop/e2e/style.spec.ts` 断言四套内置模板的颜色/
> 行高/字族/对齐/斑马纹、数字/日期/布尔/枚举格式化，以及一个持久化用户样式的列覆盖/bar；
> 截图证据在 `docs/reports/t3.2/`。T3.3 已覆盖第 3 步的求值与渲染（seed `sty_rules`：行/单元格
> 目标、首条命中、警告/上升图标、选中优先级），截图在 `docs/reports/t3.3/`；T3.4 覆盖通过编辑器
> 改密度/加规则。T3.5 已覆盖第 4–6 步：`apps/desktop/e2e/template.spec.ts` 完成另存/复制/
> 重命名/设为默认/应用、导出 → 重启 → 新工作区导入 → 应用（12 项计算样式一致）、删除引用回退
> 默认并提示、删除的 Ctrl+Z 撤销、坏文件不污染 manifest；截图在 `docs/reports/t3.5/`。
> E5 的整体验收仍在 M3 里程碑演示执行。

### E6 图表宽/长表、交互与导出

1. 同一张表建宽表折线（2 个 Y 列），断言 2 个系列、图例名称正确。
2. 切长表映射（系列列 `site`），断言系列数 = distinct 值数。
3. 缩放、关图例、改调色板、改线宽；断言重开应用后保留。
4. 100k 点表出图：断言"已采样"徽标、点数 ≤ 2k/系列、首尾点存在。
5. 导出 PNG：断言文件存在、尺寸为容器 2x、背景符合选择。
6. 删除映射列：断言图表进入错误态且可重新映射，不崩溃。

> T4.4 已覆盖第 1–3、6 步：`apps/desktop/e2e/chart.spec.ts` 4 条（新建向导宽表 2 个 Y →
> 检查器切长表 3 系列 → 四组检查器项生效并在重启后逐项还原；删除映射列后的可操作错误态与
> 重映射恢复 + 重启；复制图表新 id/新视图且源/副本设置互不影响；200% 缩放下键盘打开向导与
> 检查器标签）。断言用 `data-chart-*` 渲染契约 + manifest 落盘，不依赖像素。第 4–5 步由
> T4.5 覆盖：`apps/desktop/e2e/chart-interaction.spec.ts` 3 条——100k 采样图上的图例/缩放/
> tooltip/resize 与 axe（wcag2a/aa，critical 0）、PNG 导出（透明/白/深三背景，2× 尺寸、
> 文件名、像素颜色，键盘 + 200% 缩放）、`no-data`/`unmapped` 空态与行动按钮。`no-table`
> 是防御态，合法 manifest 无法打开（`checkChartInto` 为错误），由 ChartView 组件测试覆盖；
> 完整 PNG 报告与截图见 `docs/reports/t4.5/`。M4 验收演示仍由 T4.6 后执行。
>
> T4.6 覆盖性能部分（ADR-045）：`apps/desktop/e2e/chart-perf.spec.ts` 2 条——100k 采样图上
> `data-chart-resolve-ms ≤ 300`、`data-chart-update-ms ≤ 200`、样式提交（调色板）不重新解析、
> 10 次连点缩放无 >200ms 长任务；5 次映射切换 + 6 次标签切换后 `data-chart-instances = 1`、
> 切换期间出现 loading（`data-chart-pending="true"`）、100k 图表工作区 private ≤600MB。
> 纯管线四段耗时由 `pnpm bench -- --chart` 记录（解析+采样/纯采样/option/样式复用）。
> M4 验收演示在 T4.6 完成后执行。

### E7 布局与撤销

1. 建 2 表 3 视图，分 2 pane（水平），拖比例到 0.35。
2. 关闭一个视图、移动一个标签；重启后布局一致。
3. 连续改 5 个单元格（间隔 > 1s），撤销 5 次、重做 3 次，断言最终值正确。
4. 断言选择/滚动/标签切换不进入撤销历史。

### E8 自动保存与崩溃恢复

1. 编辑单元格后等待 2s，断言磁盘 JSONL 已更新。
2. 用 `taskkill /F`（Windows）或 `SIGKILL`（POSIX）强杀应用。
3. 重启；断言出现"上次未正常退出"提示；选择恢复。
4. 断言已提交数据完整；最后 1.5s 内未落盘的编辑允许丢失，但必须提示。
5. 模拟写失败（只读目录）：断言状态栏告警、内存数据不丢、恢复可写后重试成功。

### E9 插件

1. 启动后断言示例插件已激活（日志/关于页可见）。
2. 新建列时可选 `rating` 语义类型；输入 1–5 合法，0/6 被拒绝；重启后仍按 rating 格式化。
3. 导入向导出现示例导入器；导入 `fixtures/json/points.json` 成功。
4. 注入一个激活即抛错的测试插件（仅测试构建）：断言应用继续启动、插件被禁用、其他功能正常。

### E10 CSV 导出（T3.6）

1. 3 行夹具含逗号/引号/内嵌换行/首尾空白/中文/空值；筛选 `value >= 2` + `value desc`，
   隐藏 1 列。
2. 打开“导出 CSV…”；默认显示格式、当前筛选排序，断言摘要 `3 行 × 6 列` 与隐藏列提示。
3. 导出后断言 UTF-8 BOM、CRLF、表头/行顺序、被筛掉的行不在文件、隐藏列不在文件；
   引号/逗号/换行/中文正确。
4. 切“原始值”再导出：无千分位、日期 epoch ms、布尔/枚举存储值。
5. 100k 工作区默认显示格式导出 ≤5s；再导出并在进度出现后取消，断言目标与
   `.curve-export-*.tmp` 均不存在。
6. 200% 缩放下纯键盘 Enter 打开、Esc 关闭，对话框不越界。

> `apps/desktop/e2e/export-csv.spec.ts` 3 条已覆盖上述步骤；100k 实测 1,716ms。

---

## 4. 夹具

| 路径 | 用途 |
|---|---|
| `fixtures/csv/small.csv` | 5×4 基础导入、粘贴对照 |
| `fixtures/csv/quoted.csv` | 引号、逗号、内嵌换行 |
| `fixtures/csv/types.csv` | 数字/日期/布尔/枚举/空值混合 |
| `fixtures/csv/gbk-100k.csv` | 编码、性能、坏行（`scripts/gen-100k.ts` 生成，不提交大文件） |
| `fixtures/csv/bad-rows.csv` | 截断、超长、非法类型 |
| `fixtures/json/points.json` | 示例插件导入器 |
| `fixtures/workspaces/v1-min/` | 最小合法工作区（1 表 3 行） |
| `fixtures/workspaces/corrupt-manifest/` | manifest 截断 |
| `fixtures/workspaces/future-version/` | `formatVersion: 2` |
| `fixtures/workspaces/stale-lock/` | 残留 `.lock` |
| `scripts/gen-100k.ts` | 生成 100k×10 表/CSV，固定随机种子 |

规则：

- 夹具必须可重复生成；大文件（> 1MB）用脚本生成，不提交仓库。
- 夹具中的时间固定为 UTC，避免时区导致断言漂移。
- 每个夹具附 `README.md` 说明预期行数、列类型、坏行位置。

---

## 5. 性能基准

### 5.1 指标与预算（SPEC §16.1）

| 指标 | 预算 | 采集 |
|---|---|---|
| 冷启动 | ≤ 2.5s | Playwright `performance.mark('app-ready')` |
| 打开 100k×10 | ≤ 3.0s | 主进程/渲染进程打点 |
| 滚动帧率 | ≥ 55fps | Playwright trace 或 `requestAnimationFrame` 采样 |
| 单元格提交 | ≤ 50ms P95 | 基准循环 1,000 次 |
| 筛选+排序 100k | ≤ 400ms | Worker 计时 |
| 条件格式求值 50 规则 × 100 行 | ≤ 16ms | bench `condition.rules.50x100`（纯求值，不含 DOM） |
| 图表解析+采样 | ≤ 300ms | chart-model 计时 |
| 图表渲染 2k 点 | ≤ 200ms | adapter 计时 |
| 自动保存 100k | ≤ 500ms | main 写盘计时（异步不阻塞） |
| 导入 100k CSV | ≤ 8s | E2E 计时 |
| CSV 导出 100k | ≤ 5s，可取消 | E2E 计时（`export-csv.spec.ts`，实测 1,716ms） |
| 粘贴 10k 单元格 | ≤ 1s（P95，软预算） | 单元基准/任务报告；T2.7 硬化 |
| 内存峰值 | ≤ 600MB | `process.memoryUsage().heapUsed` + 手工核对 |

### 5.2 基准脚本输出

`pnpm bench` 生成 `bench/report.json`：

```json
{
  "generatedAt": "...",
  "seed": 42,
  "cases": [
    { "name": "table.open.100k", "p50": 1200, "p95": 1800, "unit": "ms", "budget": 3000 },
    { "name": "table.sort.100k", "p50": 180, "p95": 260, "unit": "ms", "budget": 400 }
  ],
  "memoryPeakMB": 420
}
```

- CI 保存 artifact；与上一次基线比较，回归 > 20% 报警。
- 基准不得依赖网络/真实用户目录；固定随机种子与夹具。

---

## 6. 可访问性、国际化、安全检查

### 6.1 可访问性（每个 UI 里程碑跑一次）

- axe-core 扫描主界面、网格、对话框、检查器：无 `critical`/`serious`。
- 纯键盘脚本：打开工作区 → 建表 → 编辑 → 粘贴 → 应用样式 → 出图 → 导出，全程不碰鼠标。
- 200% 缩放 + 1280×720 窗口：无横向裁切、无按钮不可达。
- 对比度抽查：正文、表头、选中态、错误态、禁用态。

### 6.2 国际化

- 中英文切换后，所有可见文案变化；无缺失 key（开发模式抛错）。
- 伪本地化（文案 +30%）冒烟：按钮不撑破、表格不重叠。
- 日期/数字在 `zh-CN` 与 `en-US` 下格式正确；CSV 导出不随语言改变。

### 6.3 安全

- 打包产物中 `window.require`/`process` 不可用。
- 生产构建不含测试钩子（E2E 环境变量无效）。
- `../`、绝对路径、符号链接逃逸均返回 `E_PATH_DENIED`。
- 非法 IPC 载荷不崩溃、不泄露堆栈。
- 外部导航/新窗口被拒绝；CSP 生效（DevTools 无 violation）。
- 日志不含单元格内容与绝对路径。

---

## 7. 发布检查清单（T6.5）

- [ ] `pnpm verify`、`pnpm e2e`、`pnpm bench` 全绿，报告归档。
- [ ] README §6 九步演示一次通过（录屏/截图）。
- [ ] SPEC §17 全部 FR 有证据链接。
- [ ] Windows 干净用户安装 → 启动 → 建工作区 → 卸载 → 数据仍在。
- [ ] 版本号、`appId`、图标、许可证正确。
- [ ] 生产包无 DevTools、无测试钩子、无 source map（或仅内部）。
- [ ] 日志路径/滚动/保留天数符合 SPEC §16.5。
- [ ] 已知限制与 v2 路线写入 `docs/ROADMAP.md` 与发布说明。
- [ ] 回滚方案：保留上一版安装包与工作区迁移备份说明。

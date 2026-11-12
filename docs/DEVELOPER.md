# Curve Almanac 开发者指南

> 面向在本仓库内实现/维护代码的人（或代理）。强制守则见 [AGENTS.md](../AGENTS.md)，
> 契约见 [SPEC.md](SPEC.md)，测试矩阵见 [TESTPLAN.md](TESTPLAN.md)。

## 1. 环境

| 项 | 要求 |
|---|---|
| Node | ≥ 20.11（本机 24.x） |
| pnpm | 11.x（`packageManager` 锁定） |
| 平台 | Windows 10/11 x64（E2E 与安装包目标；Linux 可跑 lint/typecheck/test） |
| Electron | 44.9.0（由 `scripts/install-electron.mjs` 在 postinstall 补齐） |

```bash
pnpm install
pnpm dev        # electron-vite 开发模式
```

## 2. 目录

```
curve-almanac/
├─ apps/desktop/
│  ├─ src/main/           # 窗口、菜单、IPC、FileWorkspaceStore、日志、退出握手
│  ├─ src/preload/        # contextBridge 白名单 API
│  ├─ src/renderer/       # React UI、app-core 接线、Worker、i18n、主题
│  ├─ src/shared/         # 跨进程契约（channels/ipc/settings/brand）
│  ├─ e2e/                # Playwright + Electron（含 m2–m5、t6.5 验收演示）
│  ├─ test/               # L3 契约/源码扫描（packaging、plugin-contributions 等）
│  ├─ build/              # electron-builder 资源：图标 3 件套 + license.txt
│  └─ electron-builder.yml
├─ packages/
│  ├─ domain/             # 模型、Zod、不变量、归一/格式化、迁移（零 UI/IO）
│  ├─ table-engine/       # JSONL、查询、排序、粘贴、导入、CSV 导出
│  ├─ chart-model/        # RenderModel、宽/长映射、LTTB 采样
│  ├─ chart-echarts/      # 唯一依赖 echarts 的包（option 映射 + 实例生命周期）
│  ├─ persistence/        # WorkspaceStore 端口、Memory 适配器、manifest 校验
│  ├─ plugin-sdk/         # 插件契约、注册表、宿主激活器（只依赖 domain）
│  ├─ ui/                 # 设计令牌与基础组件（Button/Dialog/Tabs/Toast…）
│  └─ app-core/           # 命令总线、状态、用例、保存队列、历史
├─ plugins/plugin-sample/ # 示例插件：rating 字段类型 + points 导入器
├─ fixtures/              # CSV/JSON/workspace 夹具
├─ scripts/               # gen-100k、bench、package-smoke
├─ release/               # 打包产物（gitignore）
└─ docs/                  # SPEC/TASKS/TESTPLAN/ADR/报告/手册
```

## 3. 架构与边界

```
domain ← table-engine ← chart-model ← chart-echarts
domain ← persistence ← app-core ← desktop
domain ← plugin-sdk ← plugins/*
ui ← desktop
```

- `domain` 不 import React/Electron/ECharts/Zustand/fs；`chart-model` 不 import ECharts；
  `persistence` 不 import Electron；`ui` 不 import `app-core`/`persistence`。
- 插件只 import `@curve/plugin-sdk` 与 `@curve/domain` 的公开类型；`app-core` 通过结构化端口
  （`FieldTypeLookup`）认识字段类型，不 import plugin-sdk；`ui` 通过回调
  （`StyledCellOptions.formatField`）支持语义格式化。
- 边界由 `dependency-cruiser` 在 `pnpm lint:boundaries` 硬阻断（`.dependency-cruiser.cjs`）。
- 渲染进程禁止 Node 内建模块；一切文件/系统能力经 `window.api` 的类型化 IPC，main 维护工作区
  白名单并 `realpath` 校验。

## 4. 关键机制（改代码前先读）

| 机制 | 位置 | 不可破坏的约定 |
|---|---|---|
| 命令总线 | `packages/app-core/src/commands/` | UI 只派发命令；撤销/保存都靠它 |
| 保存队列 | `packages/app-core/src/usecases/save-queue.ts` | 1.5 s 去抖 + 10 s 上限；`flush()` 立即写 |
| 撤销历史 | `packages/app-core/src/usecases/history.ts` | 单栈、100 条/256 MB、瞬态布局不入栈 |
| 工作区格式 | `packages/persistence` + `docs/SPEC.md §7` | `formatVersion: 1`、JSONL、原子写、manifest 最后写 |
| 插件宿主 | `packages/plugin-sdk` | `subscribe` 同步快照、`source`、owner 化 `replace`、错误隔离 |
| 插件 UI | `apps/desktop/src/renderer/plugins/` | 内置贡献单一列表、错误 2 s 去重 + 200 条环形日志、会话级禁用 |
| 键位/命令面板 | `renderer/features/keymap/` | `APP_COMMANDS` 是唯一命令目录；`KeymapConflictError`；面板只在打开时挂载 |
| 设置 | `shared/contracts/settings.ts` + `main/settings/` | `settings.json` 是唯一权威；逐字段回退、原子串行写 |
| 打包 | `apps/desktop/electron-builder.yml` | `appId`/`productName`/`files` 白名单/NSIS 每用户参数不可漂移 |

## 5. 开发流程

1. 读 `AGENTS.md` → 本任务在 `TASKS.md` 的依赖/产出/验收 → `TESTPLAN.md` 对应层 → 相关 ADR。
2. 用 5 行复述目标、涉及文件、验收命令；有歧义先问。
3. 纯逻辑先写失败测试；UI 先写 E2E 骨架/组件测试。
4. 最小改动；业务逻辑进 `app-core`/纯逻辑包，组件只做渲染与事件转发。
5. 跑 `pnpm verify` + 任务指定的 `pnpm e2e` / `pnpm bench`；记录实际输出。
6. 更新 TASKS/CHANGELOG；契约变化先写 ADR 再改 SPEC；一个任务一个 Conventional Commit。

## 6. 测试

| 层 | 命令 | 位置 |
|---|---|---|
| L1/L2 单测+组件 | `pnpm test` | 包内 `*.test.ts(x)` |
| L3 契约 | `pnpm test` | `packages/*/test`、`apps/desktop/test` |
| L4 E2E | `pnpm e2e` | `apps/desktop/e2e`（1 worker，真实 Electron） |
| L5 基准 | `pnpm bench` | `scripts/bench.ts` → `bench/report.json` |
| 覆盖率 | `pnpm test:coverage` | 全局 lines ≥ 70%，纯逻辑包 ≥ 85% |
| 文档链接 | `pnpm docs:links` | 仓库内所有 `.md` 的相对链接与图片 |

- E2E 的对话框替身只在未打包且 `CURVE_E2E=1` 时生效（目录/保存/导入/退出确认）；生产包必须失效。
- 200% 缩放与纯键盘是每个 UI 任务的冒烟项；图表断言用 `data-chart-*` 渲染契约，不做像素基线。
- 已知 flake：`file-workspace-store`/`recent-list`/`m1-acceptance` 的 “caps the list” 在
  196 个 Vitest worker 高负载时偶发 5 s 超时（单文件 <1 s 通过）。先复跑单文件，不得放宽超时。
  `chart-perf` 的 100k 内存门禁在外部程序占 CPU 时波动 509–639 MB（门禁 1GB，ADR-057），先确认负载。
- 新增 E2E 后跑一次全量，确认 worker=1 下不抢占其它用例的内存/时序。

### 验收演示

- 里程碑演示：`e2e/m2..m5-acceptance.spec.ts`；最终九步演示：
  `e2e/t6.5-acceptance.spec.ts`（见 `docs/reports/t6.5/REPORT.md` §3），截图 + metrics 输出到 `test-results`。
- `docs/reports/m0/*.png` 是历史截图目录，已在 `.gitignore` 中；新截图只写到 `test-results`。

## 7. 构建、打包与发布

```bash
pnpm build          # electron-vite：renderer/main/preload → apps/desktop/out
pnpm package        # build + electron-builder --win（NSIS + portable → release/）
pnpm package:dir    # 只出 release/win-unpacked
pnpm package:smoke  # 真实安装→启动→建工作区→卸载→数据保留（会写系统目录）
```

- 身份：`appId=com.curvealmanac.app`、`productName=Curve Almanac`、版本只在
  `apps/desktop/package.json`；`files` 只含 `out/**` + `package.json`；asar；`publish: null`。
- main 仍外部依赖 `write-file-atomic`（+ `signal-exit`），由 electron-builder 收进 asar。
- 打包需要网络下载 Electron/NSIS/winCodeSign；GitHub 不可达时设置
  `ELECTRON_MIRROR`/`ELECTRON_BUILDER_BINARIES_MIRROR` 指向 npmmirror。
- 本机受限 shell：`CURVE_E2E_NO_SANDBOX=1` 给 Electron 加 `--no-sandbox`（不改应用安全选项）；
  冒烟脚本先把安装器复制到 `%TEMP%` 再执行。
- 发布检查清单见 `TESTPLAN.md §7`；产物未签名（SmartScreen 提示），v1 无自动更新。

## 8. 文本、编码与路径

- 源码 UTF-8、LF；JSONL 无 BOM、`\n` 结尾；仓库 `.gitattributes` 固定。
- 日期内部 epoch ms；显示用 `Intl`；模型里不存本地化字符串。
- 用户可见文案一律走 `t(key)`；`ui-conventions.test.ts` 拦截 JSX 字面量；中英 key 集必须一致。
- 路径处理用 `@curve/persistence` 的 join/清洗函数；不要手拼分隔符。

## 9. 常见改动指引

| 想改 | 去哪 |
|---|---|
| 新增表/列/编辑/粘贴行为 | `packages/domain`（规则）→ `app-core`（命令）→ `ui`（渲染） |
| 新增筛选操作符/排序 | `table-engine` + SPEC §9.5 + 测试 |
| 新增图表选项/映射 | `chart-model` → `chart-echarts` → `renderer/features/charts` |
| 新增样式令牌/条件规则 | `domain` 样式模型 → `ui` 渲染 → `StyleEditor` |
| 新增 IPC | `shared/contracts/{channels,ipc}` → main handler → preload → api-client → SPEC §15 |
| 新增插件贡献点 | `plugin-sdk` 类型/注册表 → `renderer/plugins` → SPEC §14 |
| 改工作区格式 | **先写 ADR + 迁移 + fixtures + SPEC**，禁止直接改 schema |
| 改打包身份 | `electron-builder.yml` + `brand.ts` + `packaging.test.ts` + SPEC §16.6 |

## 10. 排障

| 症状 | 处理 |
|---|---|
| E2E 起不来 Electron | 先 `pnpm build`；确认 `ELECTRON_RUN_AS_NODE` 未设置；受限 shell 加 `CURVE_E2E_NO_SANDBOX=1` |
| `pnpm e2e` 端口/锁冲突 | 关闭遗留 Electron 进程；每个用例使用独立 `CURVE_E2E_USER_DATA` |
| 打包失败在下载 | 配置镜像；不要把网络失败误记为代码失败 |
| 单测 5 s 超时 | 先单文件复跑；高负载下偶发，禁止改全局 timeout |
| 覆盖率下降 | 新逻辑补测试；不要调低阈值 |

更多环境事实（镜像、已知 flake）见 §7 与 §10。

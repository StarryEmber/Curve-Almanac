# ADR-051 产品更名为 Curve Almanac，默认目录与用户数据路径随之变更

- 状态：已接受
- 日期：2026-10-29
- 相关：SPEC §0、§1、§9.0、§14.2、§16.6；TASKS T6.0、T6.4；ADR-002、ADR-010、ADR-013、ADR-019、
  ADR-020、ADR-050

## 背景

产品自方案阶段起一直叫 **Curve Studio**。2026-10-29 用户新增任务 T6.0：把软件名称改为
**Curve Almanac**。这个名字出现在多个互不相干的层：

1. `apps/desktop/package.json` 的 `productName`（Electron 的 `app.getName()` / `app.setName()`）；
2. `apps/desktop/src/main/index.ts` 的 `APP_NAME`（关于对话框、退出确认、日志前缀）与
   `window-options.ts` 的 `WINDOW_TITLE`；
3. `apps/desktop/src/renderer/index.html` 的静态 `<title>` 与 i18n 的 `app.name`（标题栏 h1）；
4. 用户可见文案：欢迎页介绍、模板导入导出的文件过滤器与错误文案、版本不兼容/锁冲突提示；
5. 新建工作区的默认父目录 `Documents/Curve Studio`（ADR-020 的目录语义，名称只是默认值）；
6. 发布身份：TASKS T6.4 记录的 `appId=com.curvestudio.app`、安装包 `productName`；
7. 插件反向域名示例 `com.curvestudio.*`（SPEC §14.2）。

改名本身不影响任何模型、JSONL、manifest 或 `formatVersion`，但会改变**默认路径**与
**userData 目录**，这两点对既有用户体验有可见影响，因此需要 ADR 而不是静默改字符串。

## 决定

### 1. 单一名称来源

新增 `apps/desktop/src/shared/brand.ts`，导出 `APP_NAME = 'Curve Almanac'`。main、renderer 与
i18n 消息表都从它取值；两处**静态**重复（`apps/desktop/package.json` 的 `productName`、
`src/renderer/index.html` 的 `<title>`）无法 import，由 `src/shared/brand.test.ts` 断言与
`APP_NAME` 一致。这样以后改名只需改一个常量 + 两处静态值，测试会拦住漏改。

### 2. 用户可见名称

以下全部改为 “Curve Almanac”：

| 位置 | 变更 |
|---|---|
| 窗口标题 / HTML `<title>` | `Curve Almanac` |
| 标题栏 h1（i18n `app.name`） | `Curve Almanac` |
| 原生菜单 “About …”、关于对话框、退出确认（main，英文） | `Curve Almanac` |
| 欢迎页/空态介绍、模板导出/导入过滤器与错误文案、版本不兼容与锁冲突提示 | `Curve Almanac` |
| `productName`（开发态 `app.getName()`，T6.4 打包名） | `Curve Almanac` |
| `appId`（T6.4 才写入打包配置） | `com.curvealmanac.app` |
| 插件反向域名示例 | `com.curvealmanac.*` |

### 3. 新建工作区默认父目录

`Documents/Curve Studio` → `Documents/Curve Almanac`。ADR-020 的语义不变：这只是**父目录**
建议值，用户可在新建对话框中修改；实际工作区根仍是 `<父目录>/<清洗后的名称>.cstudio`。
既有工作区不受影响，仍可从最近列表/打开对话框打开。

### 4. userData 目录变更，不做自动迁移

Electron 由应用名推导 `userData`（`app.setName(APP_NAME)` 在 `app.whenReady()` 之前调用），因此
`%APPDATA%/Curve Studio` 变为 `%APPDATA%/Curve Almanac`。当时 v1 还未发布，本次**不做**自动迁移：

- `settings.json`、`recent.json`、`window-state.json` 重置为默认值，用户需要重新选择主题/语言、
  并重新从“打开工作区”进入旧工作区（工作区本身在用户目录里，数据不丢）；
- E2E 通过 `CURVE_E2E_USER_DATA` 覆盖 userData，测试不受影响；
- 若日后确有已发布用户需要保留偏好，再加一次性迁移（见复核条件），不在本任务提前实现。

### 5. 不更名的内部标识

以下保持原样，理由是对用户不可见、改动会丢偏好或破坏夹具/协议，且与本任务目标无关：

- npm 作用域 `@curve/*`、仓库目录与根 `package.json` 的 `name: curve-studio`；
- 工作区格式：`formatVersion: 1`、`manifest.json`/JSONL 结构、`.cstudio` 目录后缀、
  `.curvestyle.json` 样式文件后缀；
- `localStorage` 键 `curve-studio.theme` / `curve-studio.locale` /
  `curve-studio.recent-commands`（改键会静默丢失用户偏好）；
- 环境变量 `CURVE_E2E*`、CSS 类前缀 `cs-`、错误码 `E_*`；
- 历史 ADR-001–050 与 `docs/reports/**` 中的旧名（历史记录，不追改）。

### 6. 文档

活文档（README、AGENTS、SPEC、TASKS、TESTPLAN、KICKOFF、HANDOFF、CHANGELOG）更新为新名；
历史报告与既有 ADR 保留原文，本 ADR 充当“旧名 → 新名”的索引。

## 代价

- **一次性偏好重置**：升级后主题/语言/自动保存开关/最近列表/窗口尺寸回到默认值；工作区数据
  不受影响，但用户需要重新打开一次旧工作区。
- **默认目录不连续**：旧用户习惯的 `Documents/Curve Studio` 不再被预填；旧目录仍可手动选择。
- **品牌字符串跨进程分散**：main 的原生对话框仍是英文硬编码（ADR-048/050 的既有残留），本次
  只是替换名字，没有引入 main 侧 i18n。
- **文档改动面大**：活文档全部更新，历史文档保留旧名，grep 仍会命中历史记录；验收以“用户可见
  文案与活文档”为准，不以全仓库 grep 为零为准。
- **`appId` 只改了文档**：T6.4 尚未实现，打包配置落地时必须以本 ADR 的 `com.curvealmanac.app`
  为准；若在此之前已有安装包，则不能直接复用此 appId（见复核条件）。

## 影响

- 新增：`apps/desktop/src/shared/brand.ts`、`apps/desktop/src/shared/brand.test.ts`、本 ADR。
- 修改（代码）：`apps/desktop/package.json`、`src/main/{index,window-options,quit-guard}.ts`、
  `src/main/workspace/file-workspace-store.ts`、`src/main/menu.test.ts`、
  `src/main/quit-guard.test.ts`、`src/renderer/index.html`、
  `src/renderer/i18n/messages/{zh-CN,en-US}.ts`、
  `src/renderer/features/workspace/{NewWorkspaceDialog,workspace-open-flow}.tsx`、
  `src/renderer/App.test.tsx`、`packages/persistence/src/manifest.ts`、`packages/ui/src/tokens.css`、
  `e2e/{smoke,shell}.spec.ts`、若干测试夹具路径。
- 修改（文档）：README、AGENTS、SPEC、TASKS（新增 T6.0、更新计数与 T6.4 的 appId）、TESTPLAN、
  KICKOFF、HANDOFF、CHANGELOG、ADR 索引。
- 不改：`formatVersion`、JSONL、manifest 字段、IPC 通道、preload API、CSP、Electron 安全选项、
  运行时依赖。

## 复核条件

- 若 v1 已发布且用户需要保留 `settings.json`/`recent.json`/`window-state.json`：新增一次性
  userData 迁移 ADR（检测旧目录、原子复制、失败回退），不得静默丢偏好。
- 若安装包已用旧 `appId` 发布：**不要**直接改 `appId`（会变成另一个产品、无法覆盖升级）；
  此时保留旧 appId，只改 `productName` 与显示名，并记录例外。
- 若未来要连内部标识一起更名（`@curve/*`、仓库名、localStorage 键、`.cstudio` 后缀）：单独任务 +
  ADR + 迁移与夹具，不要夹在显示名变更里。
- 若产品有第二个品牌/白标需求：把 `APP_NAME` 扩展为构建期注入（环境变量或打包配置），而不是
  再加一处硬编码。

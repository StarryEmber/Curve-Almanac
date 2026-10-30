# ADR-055 T6.4 的 Windows 打包、发布身份与安装冒烟

- 状态：已接受
- 日期：2026-10-30
- 相关：SPEC §2、§5.2、§16.6、NFR-08；TASKS T6.4；TESTPLAN §7；ADR-001、ADR-016、ADR-019、ADR-020、ADR-051

## 背景

`T0.2` 就安装了 `electron-builder` 26.15.3 并在根脚本里留下
`"package": "pnpm build && pnpm --filter @curve/desktop package"`，但 `apps/desktop` 没有
`package` 脚本、没有 `electron-builder.yml`、没有图标/许可证，`release/` 从未产出过。T6.0
（ADR-051）把产品名改为 **Curve Almanac** 并确定了 `appId = com.curvealmanac.app`，但当时
明确把打包留给 T6.4。因此本任务需要回答：

1. **发布身份**：`appId`、`productName`、版本号、图标、许可证从哪来，如何防止漂移？
2. **安装形态**：NSIS 是每用户还是每机器？是否要求管理员？`userData` 与工作区默认目录如何
   与 T5.5/T6.0 的既有语义保持一致？
3. **打包内容**：`apps/desktop` 里有 `src/`、`test/`、`e2e/`、`debug.log` 等开发文件；
   main 产物仍外部依赖 `write-file-atomic`（其依赖 `signal-exit`），pnpm 的符号链接布局
   需要被正确收集。
4. **验收方式**：TASKS 要求“干净 Windows 用户安装/启动/卸载成功 + 卸载后工作区仍在 + 版本号
   一致”，如何在本机可重复地证明，而不是只跑一次手工点击？

## 决定

### 1. 配置位置与脚本

- `apps/desktop/electron-builder.yml` 是唯一打包配置；`apps/desktop/package.json` 增加
  `"package": "electron-builder --config electron-builder.yml --win"` 与
  `"package:dir": "electron-builder --config electron-builder.yml --win --dir"`（后者只产
  `release/win-unpacked`，用于快速迭代/冒烟）。
- 根脚本 `pnpm package` 保持 SPEC §5.2 的形状：先 `pnpm build`，再
  `pnpm --filter @curve/desktop package`；新增 `pnpm package:smoke`（见 §6）。
- 产物输出到仓库根 `release/`（`directories.output: ../../release`），该目录已在
  `.gitignore`/ESLint/Prettier 忽略列表中；`release/` 不进入提交。

### 2. 发布身份

- `appId: com.curvealmanac.app`（ADR-051 的唯一计划值；v1 尚未发布，不存在旧 `appId` 升级
  问题）。
- `productName: Curve Almanac`；`apps/desktop/package.json` 的 `productName` 与
  `src/shared/brand.ts` 的 `APP_NAME` 由 `brand.test.ts` 保持相等（T6.0 已建立）。
- 版本号只来自 `apps/desktop/package.json`（当前 `0.1.0`）；`pnpm package` 不做版本提升，
  T6.5 发布时再决定。根 `package.json` 与 desktop 的版本保持相等由
  `apps/desktop/test/packaging.test.ts` 断言。
- `copyright: Copyright © 2026 Curve Almanac`；`author`/`description` 写入
  `apps/desktop/package.json`，使安装包与 exe 的 `ProductName`/`FileDescription`/`CompanyName`
  都是用户可读的产品信息（`FileDescription` 不再显示“Electron main, preload and renderer
  shell.”）。

### 3. 打包内容：白名单 + 生产依赖收集

- `files` 只列 `out/**/*` 与 `package.json`，并排除 `**/*.map`；electron-vite 已经把
  `@curve/*` 源码包内联进 `out/main`，因此 `src/`、`test/`、`e2e/`、`playwright-report/`、
  `debug.log`、`build/` 资源都不会进入 asar（`packaging.test.ts` 与冒烟的 asar 检查双重断言）。
- main 产物仍 `require('write-file-atomic')`，所以**不能**只打 `out/`：electron-builder 的
  pnpm 依赖收集会把 `write-file-atomic` 与 `signal-exit` 放进 asar。冒烟脚本断言
  `app.asar.node_modules` 里恰好存在这两项，且没有开发文件。
- `asar: true`、`npmRebuild: false`（无原生模块）、`publish: null`（ADR-016：v1 无更新/发布
  通道，构建不得尝试上传）。

### 4. NSIS：每用户安装、不要求管理员、卸载保留数据

- `oneClick: false`（带许可证页/目录页/安装模式页的辅助安装器）、`perMachine: false`、
  `allowElevation: false`、`allowToChangeInstallationDirectory: true`。
- 默认安装目录是 `%LOCALAPPDATA%\Programs\Curve Almanac`（electron-builder 的 per-user
  `UserProgramFiles`）；`win.requestedExecutionLevel: asInvoker`。冒烟在非管理员会话中实际
  安装，证明不触发 UAC。
- `electron-builder` 的默认行为是“安装完启动应用”；静默安装不会启动（`runAfterFinish` 只在
  交互安装的完成页触发），冒烟因此可以串行控制。
- `deleteAppDataOnUninstall: false`：卸载不删 `%APPDATA%\Curve Almanac`；工作区在
  `Documents/Curve Almanac`，本来就不在安装目录内。两者都由冒烟在卸载后断言仍存在。
- 快捷方式：开始菜单 `Curve Almanac.lnk` 与桌面 `Curve Almanac.lnk`；卸载时按
  `QuietUninstallString` 的 `/currentuser` 语义清理。

### 5. 图标与许可证

- `apps/desktop/build/` 是 `buildResources`：`icon.svg`（设计源，可编辑）、`icon.png`
  （1024×1024 主稿）、`icon.ico`（16/24/32/48/64/128/256 七档，PNG 压缩条目）。配色取自
  `@curve/ui` 的深色画布 `#17202e`、网格 `#263140`、强调色 `#6fa4ff`、点 `#e5edff`；图形是
  带数据点的上升曲线，16px 下仍可辨认。图标是静态资源，不引入图像依赖。
- 许可证：`build/license.txt`（NSIS 许可证页的默认查找文件名）与根
  `package.json` 的 `"license": "UNLICENSED"` 一致，采用**专有软件**声明
  （“All rights reserved”，不做开源授权）；Electron/Chromium 自身的许可证文件由
  electron-builder 照常随包提供。若将来要改为开源或商业授权，必须单独决策并替换该文件。

### 6. 验收自动化：`pnpm package:smoke`

- `scripts/package-smoke.ts` 在真实 Windows 上执行完整链路：检查 asar → 静默安装 → 校验
  安装目录/快捷方式/卸载注册表 → 启动已安装应用（Playwright `_electron`）→ 校验
  `isPackaged`/版本/`productName`/`userData`/CSP/无 Node 全局/E2E 钩子失效 → 通过 UI 在
  **默认路径** `Documents/Curve Almanac` 新建工作区并截图 → 关闭后校验
  `%APPDATA%\Curve Almanac\window-state.json` → 静默卸载 → 校验程序文件/快捷方式/注册表被
  清理、工作区与 `userData` 保留 → 写 `docs/reports/t6.4/t6.4-package-metrics.json`。
- 脚本在 `finally` 中恢复机器状态：只删除本次创建的 `T6.4 Smoke.cstudio`、本次新建的
  `Documents/Curve Almanac`（仅当为空）与 `%APPDATA%\Curve Almanac`（仅当运行前不存在）；
  开始前若发现已有安装则拒绝运行，避免误卸载真实数据。
- 本机 DSH 沙箱会拒绝“工作区内可执行文件”写工作区之外的路径，导致安装器从 `release/`
  运行时静默失败。脚本因此先把安装器复制到 `%TEMP%` 再执行；安装后的应用位于
  `%LOCALAPPDATA%`，不受该限制。正常用户机器无此限制，复制到 `%TEMP%` 也无副作用。
- `CURVE_E2E_NO_SANDBOX=1` 时给启动参数加 `--no-sandbox`（受限 shell 无法启动 Chromium OS
  沙箱）；它不改变 `webPreferences.sandbox`，与 E2E 夹具的既有约定一致。

### 7. 不实现的东西

- 不做代码签名/公证（无证书）；安装包未签名，SmartScreen 会提示，属于 v1 已知限制。
- 不做自动更新/发布通道（ADR-016）；`publish: null`。
- 不做 macOS dmg/Linux AppImage 配置；SPEC §16.6 的次要平台在 v1 不承诺。
- 不改 `formatVersion`/JSONL/manifest/IPC/CSP/Electron 安全选项，不新增运行时依赖
  （electron-builder 是既有 devDependency）。

## 代价

- **体积**：未压缩 `win-unpacked` 约 **391MB**（Electron 44 本身约 247MB），NSIS 安装包约
  **112MB**、portable 约 **112MB**。这是 Electron 的固有成本（ADR-001 已记录）；T6.5 可评估
  裁剪 locales/`--asar` 压缩策略，但不在本任务。
- **无签名**：首次运行会有 SmartScreen/未知发布者提示；企业环境可能直接拦截。需要证书时按
  复核条件接入，不改代码结构。
- **打包需要网络**：electron-builder 首次会下载 Electron 与 `winCodeSign`/`nsis` 工具包；
  本机 GitHub 不可达，使用 npmmirror 镜像环境变量完成（见复核条件），失败时应记为阻塞而不是
  删除依赖。
- **冒烟会短暂写真实用户目录**：安装到 `%LOCALAPPDATA%`、启动时创建 `%APPDATA%` 与
  `Documents/Curve Almanac`，脚本结束时清理；运行期间若中断，可能留下一个测试工作区/安装，
  需要手工清理（脚本下次运行前会拒绝覆盖已有安装）。
- **冒烟依赖中文界面文案**（`新建工作区`/`名称`/`保存位置`/`创建工作区`）：这些是 T2.1 的
  稳定标签；若改文案需同步脚本，与 E2E 的同类依赖一致。
- **便携版只验证产出**：portable 的启动由 NSIS 自解压到 `%TEMP%` 后运行，冒烟只校验其存在与
  体积/元数据；完整交互仍以安装版为准。

## 影响

- 新增：`apps/desktop/electron-builder.yml`、`apps/desktop/build/{icon.svg,icon.png,icon.ico,
  license.txt}`、`apps/desktop/test/packaging.test.ts`、`scripts/package-smoke.ts`、本 ADR、
  `docs/reports/t6.4/REPORT.md`（2 张截图 + metrics）。
- 修改：`apps/desktop/package.json`（scripts、license/author/description）、根
  `package.json`（`package:smoke`）、`docs/SPEC.md` §5.2/§16.6、`docs/TASKS.md` T6.4、
  `docs/TESTPLAN.md` §7、README、CHANGELOG、HANDOFF、AGENTS §0、`docs/adr/README.md`。
- 不改：`formatVersion`、JSONL/manifest、`.cstudio`/`.curvestyle.json`、IPC/preload、CSP、
  Electron 安全选项、应用运行时行为；`pnpm-lock.yaml` 不变（无新依赖）。

## 复核条件

- 若获得代码签名证书：在 `win.sign`/`CSC_LINK` 中接入并保留 `forceCodeSigning` 关闭时的
  本地无签名构建；同时在冒烟中校验 `Get-AuthenticodeSignature`。
- 若需要 macOS/Linux 包：新增 `mac`/`linux` 配置与对应 CI/手工冒烟，先读 SPEC §16.6 的平台
  承诺，不要复用 Windows 的 `nsis` 选项。
- 若需要自动更新：先写 ADR 并新增发布通道（ADR-016 明确 v1 不做），不要只加
  `electron-updater`。
- 若安装包体积成为问题：评估裁剪 `locales`、`--asar` 压缩、移除未用 Electron 组件；不要
  删除 `LICENSES.chromium.html` 等许可证文件。
- 若本机 DSH 沙箱策略变化（`release/` 内可执行文件可写用户目录）：冒烟的 `%TEMP%` 复制步骤
  可以保留（无副作用），也可以删除；不要依赖该复制来修正真实用户环境。
- 若用户数据目录再次改名：同步 `electron-builder.yml` 的 `productName`、`brand.ts`、
  `docs/SPEC.md` 与冒烟的 `userData` 断言；不要只改其中一个。
- 若 CI 要跑冒烟：需要 Windows runner + 干净用户态（无既有安装），并允许写
  `%LOCALAPPDATA%`/`%APPDATA%`/Documents；冒烟不是 `pnpm verify` 的一部分，避免每次提交都
  安装软件。

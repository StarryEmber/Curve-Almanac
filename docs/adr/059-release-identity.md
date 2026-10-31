# ADR-059 发布身份与仓库命名（StarryEmber / curve-almanac）

- 状态：**已接受**（2026-10-30 决定；2026-10-31 补充邮箱并重写历史）
- 日期：2026-10-30（2026-10-31 修订）
- 相关：ADR-051（品牌更名）、ADR-055（打包/发布）、ADR-058（MIT）；`LICENSE`、`build/license.txt`、
  `package.json`、`apps/desktop/package.json`、`electron-builder.yml`

## 背景

v1 发布前需要把“产品名”和“法律/发布主体”分开，并确定 GitHub 仓库名。此前仓库内使用的是
占位身份：

- 版权主体：`Curve Almanac`（产品名，不是法定主体）；
- `apps/desktop` 的 `author`：`Curve Almanac`；
- Git 提交作者：`Curve Studio Agent <agent@curve-studio.local>`；
- 根包名：`curve-studio`（T6.0/ADR-051 当时决定保留旧仓库名）。

用户 2026-10-30 明确：

- **版权主体：StarryEmber**
- **Git 作者：StarryEmber**（`https://github.com/StarryEmber`）
- **GitHub 仓库名：curve-almanac**

## 决定

1. **版权主体**统一为 `StarryEmber`：
   - 根 `LICENSE`：`Copyright (c) 2026 StarryEmber`；
   - `apps/desktop/build/license.txt`（NSIS 许可证页）同步；
   - `apps/desktop/electron-builder.yml` 的 `copyright`：`Copyright © 2026 StarryEmber`；
   - 发布说明/README 的许可证段落写明同一主体。
2. **exe/安装包 CompanyName**：`apps/desktop/package.json` 的 `author` 改为 `StarryEmber`。
3. **根包名**：`package.json` 的 `name` 改为 `curve-almanac`（私有包，不发布 npm）；内部
   `@curve/*` 包名、`appId=com.curvealmanac.app`、`productName=Curve Almanac`、
   `formatVersion`、IPC、数据格式**均不变**。
4. **GitHub 仓库**：`curve-almanac`。本地仓库目录当前仍为 `D:\DSH_Work_Space\curve-studio`；
   目录重命名不是发布前置条件，GitHub 远端名以本 ADR 为准。
5. **Git 作者**：`git config user.name=StarryEmber`、
   `user.email=StarryEmber@163.com`（2026-10-31 用户提供真实邮箱）。
   **2026-10-31 已重写全部 114 个历史提交**：所有 commit 的 author/committer 均为
   `StarryEmber <StarryEmber@163.com>`；提交信息、日期、树内容保持不变。
   同时删除本地 tag `v0.1.0` 并在重写后的 HEAD 上重建；文档中的 commit hash 引用已同步更新
   （旧 hash 不再可解析）。仓库尚无 remote/tag 推送，重写是安全的。
6. 重新打包并更新 `release/SHA256SUMS.txt` 与发布说明中的哈希/体积。

## 代价/影响

- 安装包 exe 的 `CompanyName`/`LegalCopyright` 会变化，必须重打包；旧包哈希作废。
- **所有历史 commit hash 已变化**：旧 hash 不可再解析，文档中的引用已更新；外部若引用过旧
  hash（issue/聊天记录），需要说明“作者重写前”。
- `StarryEmber@163.com` 需在 GitHub 账号中验证/添加，公开提交才会关联到 `@StarryEmber`；
  邮箱变更只需 `git config`，不要求重打包。
- 产品名/包名分离：根包名 `curve-almanac` 不等于 npm 发布；根 `private: true` 保持不变。
- 版权主体不是公司时，MIT 以个人名义授权；如后续成立公司，需在新版 LICENSE 中更新并重打包。

## 复核条件

- 若版权主体应为公司/其他个人：同步修改 `LICENSE`、`build/license.txt`、
  `electron-builder.yml`、`package.json` 的 `author`、README/发布说明，并重打包。
- 若要把 GitHub 仓库名改为其他：同步根包名与文档，但 `appId` 不变。
- 若要再次改作者/邮箱：重写历史并同步文档中的 commit 引用；**有远端后不要强推**，应先协调。
- 若要公开推送：确认 GitHub 账号已添加/验证 `StarryEmber@163.com`，否则提交会显示未关联作者。
- 若要改邮箱：只改 `git config` 与 `package.json` 的 `author`（如需），不要求重打包。

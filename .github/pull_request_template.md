# Pull Request

## 任务

- 任务 ID：`T?.?`
- 里程碑：`M?`
- 关联文档：`docs/TASKS.md` / `docs/SPEC.md §?` / ADR-?

## 改动摘要

<!-- 一句话说明做了什么；再列关键文件/接口变化。 -->

-

## 验证（必须附真实结果）

| 命令 | 结果 |
|---|---|
| `pnpm verify` | |
| `pnpm e2e`（涉及 UI/流程时） | |
| `pnpm test:coverage`（涉及覆盖率时） | |
| `pnpm dev` 手工冒烟（涉及 UI 时） | |

## 证据

<!-- 截图、trace、报告路径；E2E 失败用例的 trace 在 CI 的 playwright-artifacts。 -->

- 截图/报告：
- 失败排查记录：

## 风险与回滚

- 风险：
- 回滚方式：

## 检查清单

- [ ] 只包含本任务范围的改动，未顺手重构无关代码。
- [ ] 未放宽 ESLint / 覆盖率阈值 / 跳过测试，未使用 `--no-verify`。
- [ ] 未改变 `contextIsolation` / `sandbox` / `webSecurity` / CSP 生产策略。
- [ ] 未新增运行时依赖（如新增，已写 ADR 并更新 SPEC）。
- [ ] 公开类型、IPC 通道、文件格式或 `formatVersion` 变更已同步 SPEC / ADR。
- [ ] `docs/TASKS.md` 已勾选，`CHANGELOG.md` 已更新。
- [ ] 新增/修改逻辑有测试；覆盖率达标。
- [ ] UI 改动通过键盘操作与 200% 缩放冒烟（如适用）。
- [ ] 无 `TODO` / `FIXME` 遗留在主路径。

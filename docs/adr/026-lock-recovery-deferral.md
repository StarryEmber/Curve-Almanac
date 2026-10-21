# ADR-026 工作区崩溃恢复交互后置到 T5.3

- 状态：已接受
- 日期：2026-10-21
- 相关：SPEC §7.5、§13.3、§15.1；M1 验收、T2.1、T5.3；ADR-021、ADR-022、ADR-024

## 背景

SPEC §7.5 规定了完整的锁与崩溃恢复流程：

- 发现 stale `.lock` 时提示“上次未正常退出”，提供“尝试恢复”与“直接打开”；
- manifest 不可读时扫描 `backups/` 中最新的 `manifest.<timestamp>.json.bak`，重建后让用户确认。

当前实现（T1.2 起的 `FileWorkspaceStore.open`）只完成了其中的安全部分：

- stale / corrupt `.lock` → 把英文 warning 放进 `open()` 的 `warnings[]`，替换锁后继续打开；
- active `.lock` → `E_WS_LOCKED`；
- manifest 损坏 → `E_WS_INVALID_MANIFEST`，原文件不变，也不写锁。

M1 验收演示（2026-10-21）证明这三条行为正确，但没有“恢复/直接打开”的选择，也没有
manifest 备份重建。用户在验收时确认：**接受 M1，把完整恢复交互记入崩溃恢复任务的范围**。

`docs/TASKS.md` 中崩溃恢复属于 **T5.3“自动保存、恢复与最近打开”**（含“启动检测 stale lock，
提供恢复/直接打开”与“崩溃恢复对话框”）；T5.1 是分栏布局与标签页。M1 报告与交接早期文字曾把
T5.3 误写为 T5.1，本 ADR 以 TASKS 的任务编号为准。

## 决定

1. M1 以现状验收：stale/corrupt 锁只返回 warning 并替换；manifest 损坏返回
   `E_WS_INVALID_MANIFEST`，不自动扫描备份，也不静默覆盖。
2. 完整恢复交互（“尝试恢复/直接打开”对话框、manifest 备份重建确认）在 **T5.3** 实现。
3. T2.1 只负责把 `workspace.warnings` 呈现给用户；**不新增恢复 IPC**，也不在打开路径自动
   重建 manifest。
4. T5.3 之前，manifest 损坏的手工恢复只能靠 `backups/manifest.*.json.bak` 文件操作；
   应用不做静默修复，测试继续断言“原文件字节不变”。
5. M1 验收测试
   `apps/desktop/src/main/workspace/m1-acceptance.test.ts` 保留为长期回归；T5.3 实现交互后
   应扩展它（或新增 E2E），而不是删除现有断言。

## 代价

- 崩溃且 manifest 损坏时，用户在应用内无法恢复，只能手工复制备份；数据文件本身不丢，但体验不完整。
- `warnings` 是 main 返回的英文内部字符串，T2.1 呈现时没有 `t(key)`；如要本地化需另行设计
  warning 的结构化 code，不能在 renderer 里硬编码翻译。
- SPEC §7.5 的实现与描述存在已知差距，必须在 SPEC 中标注，否则后续会话可能误以为已完成。

## 影响

- `docs/SPEC.md §7.5` 增加“实现边界（ADR-026）”段落。
- `docs/TASKS.md` 的 T5.3 产出、步骤与验收补充恢复交互；M1 条目标注用户已接受。
- `docs/HANDOFF.md`、M1 报告与 `AGENTS.md §0` 更新验收状态。
- 不改变文件格式、`formatVersion`、IPC 通道或 preload 白名单；T5.3 若新增 IPC，需再写 ADR
  并同步 SPEC §15.1。
- 不改变当前锁/manifest 的安全行为，也不放宽任何测试。

## 复核条件

- T5.3 实现恢复对话框或 manifest 备份重建时：补 E2E 的锁顺序与失败路径，更新 SPEC §7.5 与
  §15.1（如新增通道），并扩展 M1 验收测试。
- 若 T2.1/T2.3 提前需要恢复能力（例如真实用户数据出现损坏），重新评估是否把 T5.3 的部分
  内容前移；不得在 T2.1 顺手实现。

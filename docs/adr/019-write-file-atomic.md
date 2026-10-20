# ADR-019 工作区原子写入采用 write-file-atomic

- 状态：已接受
- 日期：2026-10-20
- 相关：SPEC §5.1、§7.4；T1.2；AGENTS §4

## 背景

SPEC §5.1/§7.4 明文要求 main 进程使用 `write-file-atomic` 完成"临时文件 + fsync + rename"的原子替换。AGENTS §4 同时要求：新增运行时依赖前必须写 ADR，说明体积、维护成本与替代方案。T1.2 是第一次真正写盘，因此在这里把这个依赖决策固化下来。

## 决定

- `apps/desktop` 增加运行时依赖 `write-file-atomic`，实际版本以 `pnpm-lock.yaml` 为准：**8.0.0**（含传递依赖 `signal-exit@4.x`）。
- 只在 Electron main 进程使用；`@curve/persistence` 保持 Electron/Node 无关，只提供端口与纯函数。
- 统一以 `{ encoding: 'utf8', fsync: true }` 调用；临时文件由库放在目标文件同目录，避免跨目录/跨盘 rename。
- 需要"先备份旧文件再替换"的调用方（表、manifest）由 main 的 `FileWorkspaceStore` 在调用本库之前完成备份。

## 代价

- 新增 1 个直接运行时依赖和 1 个传递依赖；包体约 12 KB（unpacked），安装体积以 lockfile 为准。
- 依赖 npm CLI 团队的维护节奏；其 Node 引擎为 `^22.22.2 || ^24.15.0 || >=26.0.0`，与本机 Node 24.21.0、Electron 44.9.0 内置 Node 24.22.0 兼容。
- 该库不提供 TypeScript 类型，需额外使用 `@types/write-file-atomic`（开发依赖，版本 4.0.3）。

## 影响

- 只进入 main bundle；renderer 与 sandboxed preload 不引用它（SPEC §15.4）。
- 不改变工作区格式、IPC 通道或公共 API。
- 若未来升级到不兼容的新主版本，按本 ADR 的复核条件重新评估。

## 复核条件

- 该依赖停止维护、引擎要求与 Electron 运行时冲突，或安装体积/启动时间成为问题时，改为内置的 temp + fsync + rename 实现，并另写 ADR 取代本决策。

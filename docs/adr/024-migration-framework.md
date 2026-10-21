# ADR-024 迁移框架的归属、备份与接线时点

- 状态：已接受
- 日期：2026-10-21
- 相关：SPEC §7.4、§7.6；T1.4；ADR-003、ADR-021、ADR-022

## 背景

SPEC §7.6 只规定了迁移的签名与语义（`Migration { from, to, migrate(manifest, tables) }`、逐版本执行、
迁移前复制 `tables/`、失败回滚并返回 `E_MIGRATION_FAILED`），没有覆盖四个实现问题：

1. **生产注册表是否非空**：v1 是唯一发布过的格式，没有真实的 v0→v1 历史；把测试专用 v0 注册进生产
   等于凭空承认一段不存在的历史。
2. **纯执行器放哪层**：`@curve/domain` 禁止 Node 内置（`.dependency-cruiser.cjs` 的
   `domain-no-node-core`），而"复制 `tables/`、失败回滚"只能碰文件系统。
3. **备份目录细节**：目录名、复制粒度、失败时半成品目录怎么处理、快照是否参与 7 天清理。
4. **何时接线**：`FileWorkspaceStore.open` 立即迁移，还是 T1.4 先交付原语、T1.5 再接线。

T1.4 的验收同时要求"夹具打开成功""`formatVersion: 2` 拒绝""迁移失败原文件哈希不变""备份目录存在
且可回滚"，因此上述问题必须在写代码前定下来。

## 决定

### 1. 生产注册表为空

- `@curve/domain` 导出 `MIGRATIONS = createMigrationRegistry([])` 与 `CURRENT_FORMAT_VERSION = 1`。
- v0→v1 只存在于测试（`run.test.ts` 内注入），生产不注册任何迁移。
- 未来第一次真实升级（v1→v2）时，才新增真实 `Migration`、升 `CURRENT_FORMAT_VERSION` 并补夹具。

### 2. 分层

- `@curve/domain/src/migrations/`：`types.ts`（`Migration`/`MigrationResult`/`MigrationTables`/
  `MigrationRegistry`/结果类型）、`registry.ts`（`createMigrationRegistry`、`resolveMigrationPath`）、
  `run.ts`（`runMigrations`）、`index.ts`（包内出口 + 空生产注册表）。
- `apps/desktop/src/main/workspace/migration-backup.ts`：`backupTablesForMigration`、
  `restoreMigrationBackup`、`runWithMigrationBackup`。复用 `resolveWorkspaceRelativePath` /
  `resolveInsideRoot`，不新造路径逻辑。

### 3. 备份目录

- 目录名 `backups/migration-<timestamp>/`，`timestamp` 用 ADR-021 的紧凑 UTC
  `YYYYMMDDTHHmmssSSSZ`；命名函数在 `@curve/persistence`（与表/manifest 备份命名同居）。
- 复制 `tables/` 下**所有常规文件**，逐字节（用 `fs.copyFile`，不做 UTF-8 文本往返，避免损坏文件被
  "洗白"）。目录不存在视为空表集，仍建空快照目录。
- 同一毫秒已被占用 → 时间戳 +1ms，与新备份命名一致（ADR-021）。
- 复制失败：删除半成品目录并返回 `E_FS_WRITE`，不留空壳快照。

### 4. 回滚

- 按快照逐文件 `copy → <target>.migration-restore → rename` 写回（重命名覆盖目标），保证原字节不变。
- 快照之后新建的表文件在回滚时删除（best-effort；删除失败不阻塞原数据恢复）。
- 回滚自身失败：仍返回 `E_MIGRATION_FAILED`，`detail` 同时带 `error=<code>` 与 `rollback=<code>`，
  让调用方知道原文件可能未完全恢复。
- manifest 不需要回滚：迁移流程要求 manifest 最后写（SPEC §7.4），失败时磁盘上的 manifest 未变。

### 5. 每步校验

`runMigrations` 对每一步的输出按顺序检查：

1. `manifest.formatVersion === migration.to`；
2. `tables` 中不得出现 manifest 里不存在的表 id（防止迁移写入孤儿数据）；
3. 当 `to === CURRENT_FORMAT_VERSION` 时用 `parseManifest` 做一次真实 Zod 结构校验；
4. `checkInvariants(manifest, { rowsByTable: tables })`。

任一步失败返回 `{ ok: false, error }`，**不返回半迁移文档**；`applied` 只包含已通过校验的步骤。

### 6. 接线时点

- T1.4 **不**把迁移接进 `FileWorkspaceStore.open`。生产注册表为空，v1 打开本来就无需迁移；接进打开
  路径会无意改变 T1.2 的锁/警告顺序，而收益为零。
- T1.5 接线时应在 manifest 解析成功之后、写 `.lock` 之前执行：失败返回 `E_MIGRATION_FAILED`、不写锁、
  不改原文件。
- "迁移失败原文件哈希不变"由 `migration-backup.test.ts` 直接调用 `runWithMigrationBackup` 证明，
  不依赖 `open` 接线。

### 7. `formatVersion: 2` 的证据

- 复用 T1.2 的 `parseManifestDocument` 版本闸门（`apps/desktop/e2e/workspace.spec.ts` 已覆盖打开路径）。
- 新增 `fixtures/workspaces/future-version/` 夹具；读取夹具的测试放在
  `apps/desktop/src/main/workspace/workspace-fixtures.test.ts`，因为 `@curve/persistence` 保持无
  Node 内建（HANDOFF §4.3），不能在包内 `readFileSync`。

### 8. `rowCount` 与清理

- 迁移执行器不维护 `rowCount`；迁移成功后仍由 `open` 按 ADR-022 重算。
- `pruneOldBackups` 只识别文件，不处理 `migration-*` 目录，因此快照不会在 7 天后被自动删除。
  T1.4 接受这一点；表多/表大导致磁盘压力时另写 ADR。

### 9. 夹具 `.lock`

- `fixtures/workspaces/stale-lock/.lock` 提交进仓库，内容固定：
  `{"pid":999999,"startedAt":"2020-01-01T00:00:00.000Z","appVersion":"0.1.0"}`。
- stale 判定由时间完成（早于 24h 阈值），不依赖 pid 是否存活，因此与机器时钟/进程无关。
- 测试必须复制夹具到临时目录再打开；仓库内夹具不会被写锁。

## 代价

- 测试专用 v0 不覆盖真实历史；第一次真实升级仍需新的迁移与夹具（这是 SPEC §7.6 的既定要求）。
- T1.4 交付的是"可接线"的框架，生产打开流程尚未自动迁移；T1.5 接线前，未来版本写出的工作区只会被
  本版本以 `E_WS_VERSION_UNSUPPORTED` 拒绝（正确行为）。
- 快照是整表同步复制：100k×10 约 20–40MB/表，迁移时一次性占用额外磁盘。
- 回滚只保证 `tables/` 字节不变；若迁移过程还写了别处（当前框架不允许），不在回滚范围内。

## 影响

- `@curve/domain` 新增公开导出：`CURRENT_FORMAT_VERSION`、`MIGRATIONS`、`Migration`、
  `MigrationResult`、`MigrationTables`、`MigrationRegistry`、`MigrationPathResult`、
  `MigrationRunOutcome`、`createMigrationRegistry`、`resolveMigrationPath`、`runMigrations`。
- `@curve/persistence` 新增纯函数：`MIGRATION_BACKUP_DIRECTORY_PREFIX`、
  `migrationBackupDirectoryName`、`parseMigrationBackupDirectoryName`、`isMigrationBackupDirectoryName`。
- 新增 `fixtures/workspaces/{v1-min,corrupt-manifest,future-version,stale-lock}/` 与各自 README。
- 不新增 IPC 通道，不改 `formatVersion`、manifest 字段或 `rowCount` 语义。
- SPEC §7.6 增加一段实现边界说明；`.prettierignore` 排除故意截断的 `corrupt-manifest` 夹具。

## 复核条件

- 第一次真实格式升级（v1→v2）：注册真实迁移、升 `CURRENT_FORMAT_VERSION`、补夹具与逐行等价测试，
  并重新评估 `FileWorkspaceStore.open` 的接线。
- 迁移快照占用成为问题：评估保留份数、7 天清理或按需备份。
- 若 T1.5 决定在打开时迁移：补 E2E 覆盖锁顺序与失败路径。

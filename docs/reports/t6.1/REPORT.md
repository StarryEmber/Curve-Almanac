# T6.1 报告 — 插件 SDK 与注册表

- 任务：T6.1 插件 SDK 与注册表（依赖 T1.1）
- 日期：2026-10-29
- 决策：ADR-052；SPEC §14.2/§14.3 已同步
- 范围：`packages/plugin-sdk` 的公开契约、4 类贡献注册表、宿主激活器与测试；**不接 UI/命令总线**

## 1. 交付

| 文件 | 内容 |
|---|---|
| `packages/plugin-sdk/src/types.ts` | `ContributionSource`、`Registry<T>`、`PluginDefinition/Context`、四类贡献类型、`PluginHost`、`ImportResult` |
| `packages/plugin-sdk/src/registry.ts` | 共享状态的注册表：register/replace/get/list/subscribe/dispose、owner 归属、一次通知的批量移除 |
| `packages/plugin-sdk/src/host.ts` | `createPluginHost`、`isCompatibleApiVersion`、`PLUGIN_API_VERSION`；版本/定义校验、错误隔离、回滚、禁用列表、deactivate |
| `packages/plugin-sdk/src/logging.ts` | 默认 console logger（经 `globalThis` 防御）、`prefixLogger` |
| `packages/plugin-sdk/src/index.ts` | 公开出口：`PACKAGE_NAME`、`PLUGIN_API_VERSION`、`createPluginHost`、`isCompatibleApiVersion`、类型 |

公开接口（与 SPEC §14.2 一致，新增部分见 ADR-052）：

```ts
export interface Registry<T> {
  register(id: string, def: T): () => void;
  replace(id: string, def: T): void;
  get(id: string): T | undefined;
  list(): ReadonlyArray<RegistryEntry<T>>;          // { id, def, source }
  subscribe(listener: (entries: ReadonlyArray<RegistryEntry<T>>) => void): () => void;
  dispose(): void;
}
```

## 2. 关键语义

| 项 | 行为 |
|---|---|
| 重复 id | `register` 任何已存在 id（含自己的）→ `E_PLUGIN_INVALID` |
| `replace` | 只能覆盖同 owner；插件不能覆盖内置或其他插件 → `E_PLUGIN_INVALID`；保持原顺序 |
| `list()` | 内置在前，插件按注册顺序；每项带 `source` |
| `subscribe` | 每次变更同步发快照；取消订阅幂等；监听器异常被隔离 |
| `dispose` | 宿主视图关闭整个注册表；插件视图只移除自己的贡献；之后注册抛错 |
| `apiVersion` | 只比较主版本：`1`/`1.0`/`1.3` 兼容，`2.0`/`0.9`/非法值禁用 |
| 激活失败 | 回滚该插件全部贡献、`disabled` + `E_PLUGIN_ACTIVATE`（保留 AppError 原 code）；其他插件继续 |
| 重复插件/非法定义 | `disabled` + `E_PLUGIN_INVALID`，不中断 `activateAll` |
| `deactivate` | 先调 hook（抛错只记日志），再移除贡献；未激活是 no-op |
| 禁用列表 | `getDisabled()` 仅内存 + 日志；持久化/手动禁用留 T6.3 |
| 字段类型 | 登记时校验 `storageType`（复用 domain 的 `builtinColumnTypeSchema`）、函数与正 `defaultWidth` |

## 3. 测试

```text
packages/plugin-sdk/src/registry.test.ts  10 条：注册/读取/来源、重复 id、replace 归属、
                                          内置保护、顺序、订阅/取消/异常隔离、校验、dispose
packages/plugin-sdk/src/host.test.ts      15 条：顺序激活/来源、context 版本与日志前缀、重复插件、
                                          版本不兼容、同步/异步激活失败回滚、非法定义、替换自己/
                                          内置、字段校验、deactivate（含 hook 抛错/no-op）、未知 id、
                                          dispose、版本比较
packages/plugin-sdk/src/index.test.ts      1 条：包骨架
```

## 4. 验证

```text
pnpm exec vitest run packages/plugin-sdk
  3 files / 26 tests passed

pnpm verify
  ESLint 0；depcruise 500 modules / 2156 deps / 0 violations
  182 files / 1710 tests passed

pnpm test:coverage
  statements 77.08% / branches 69.85% / functions 75.93% / lines 77.24%
  packages/plugin-sdk/src：lines 87.96% / branches 81.98% / functions 93.65%

pnpm build
  exit 0（renderer 3,365.92 kB、CSS 77.89 kB，与 T6.0 相同；SDK 尚未被打包引用）
```

## 5. 残留与下一步

- **未接 UI/命令总线**：T6.1 只提供契约与注册表；列类型选择器、导入向导、命令执行在 T6.3。
- **禁用列表不持久化**：坏插件每次启动重试并再记日志；手动禁用/持久化按 ADR-052 复核条件在 T6.3 决定。
- **`ImportResult` 只是结构兼容**：T6.3 需显式映射到 table-engine 的 `ImportDataset`（新增字段时尤其注意）。
- **`lib` 增加 DOM**：仅为 `AbortSignal` 类型；未引入 Node 全局或运行时依赖。
- **未新增运行时依赖**：`@curve/plugin-sdk` 仍只依赖 `@curve/domain`；depcruise 边界通过。
- 下一步：T6.2 示例插件（`rating` 字段类型 + `{points:[{x,y}]}` 导入器），需等用户明确指示。

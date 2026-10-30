# `@curve/plugin-sample` — Curve Almanac 示例插件

T6.2 的参考插件，演示 v1 插件契约（SPEC §14.2/§14.3、ADR-010、ADR-015、ADR-052）中
不需要应用内部路径的两个贡献点。插件是**编译期静态导入**的，随应用一起构建；v1 不加载运行时
下载的代码。

## 提供的贡献

| 类型 | id | 说明 |
|---|---|---|
| 字段类型 | `com.curvealmanac.rating` | 1–5 星评分；`storageType: 'number'`，只改变解析/校验/格式化/比较 |
| 导入器 | `com.curvealmanac.points` | 接受 `{"points":[{"x":1,"y":2}]}` 或点对象数组，返回共享的 `ImportResult` |

- **存储形态不变**：评分在 JSONL 里仍是普通数字（`{"id":"row_…","v":[3]}`），
  `ColumnDef.fieldTypeId` 记录语义类型；这是 ADR-015 的核心约束，插件不能引入新的物理类型。
- **格式化**：`3` 显示为 `★★★`；`null` 显示为空；越界值（0、6、3.5、非数字）在编辑时被拒绝。
- **导入器**：`x`/`y` 必须是有限数字，`label` 可选（文本/数字/布尔）；空点列表返回 warning 而不是错误；
  `AbortSignal` 在解析前后各检查一次。

## 文件

```text
src/rating.ts             FieldTypeDef（`ratingFieldType`）与纯解析/校验/格式化函数
src/points-importer.ts    ImporterDef（`pointsImporter`）与 `parsePointsJson`
src/plugin.ts             `samplePlugin`、`sampleFieldTypes`、`registerSampleContributions`
src/index.ts              包公开出口
src/*.test.ts             单测（不依赖桌面/Electron）
```

## 接入方式

- 渲染进程组装点 `apps/desktop/src/renderer/plugins/index.ts` 静态导入 `samplePlugin`，
  启动时由 `createPluginHost(...).activateAll()` 激活；激活失败会被 T6.1 的宿主回滚并标记
  禁用，应用继续启动。
- 主进程也要校验工作区（`fieldTypeId` 必须能解析到 `storageType` 且与 `column.type` 一致，
  SPEC §14.3），因此它还读取 `sampleFieldTypes` 建立只读的「字段类型 → 存储类型」映射。
  两个进程共用同一份定义，避免两处漂移。

## 测试

```bash
pnpm exec vitest run plugins/plugin-sample
```

插件测试只依赖 `@curve/plugin-sdk` 与 `@curve/domain`，不得导入应用内部路径
（dependency-cruiser `plugins-only-sdk-and-domain`）。新增贡献点时的约定：

1. id 使用反向域名（`com.curvealmanac.*`），不得与内置存储类型重名；
2. 字段类型的 `storageType` 必须是五种内置类型之一；
3. 导入器返回 `ImportResult`，不要 import `@curve/table-engine`；
4. 先写单测，再在 `src/plugin.ts` 的 `registerSampleContributions` 里注册。

# ADR-017 将依赖边界检查纳入 pnpm lint

- 状态：已接受
- 日期：2026-10-19
- 相关：SPEC §4.3、§5.2；TASKS T0.1；AGENTS §2.3、§2.4

## 背景

SPEC §4.3 要求用 dependency-cruiser 在 CI 硬阻断七类依赖违规；TASKS T0.1 的验收项进一步要求
“故意写一条 `domain → react` import，`pnpm lint` 必须失败”。但 SPEC §5.2 的脚本契约把 `lint`
定义为 `eslint . --max-warnings=0`，仅靠 ESLint 无法覆盖 depcruise 的图级规则（循环依赖、跨包别名等）。
两者无法同时满足，必须显式选择并记录偏差。

## 决定

1. `pnpm lint` 执行两段检查：

   ```jsonc
   "lint": "eslint . --max-warnings=0 && pnpm lint:boundaries",
   "lint:boundaries": "depcruise apps packages --config .dependency-cruiser.cjs"
   ```

2. `docs/SPEC.md §5.2` 同步更新，避免脚本契约与实现不一致。
3. 边界规则不接受注释豁免；`plugins/*` 在 T6.2 创建后加入 `lint:boundaries` 的扫描路径。
4. ESLint 继续负责语法/风格与 `import/order`；dependency-cruiser 负责包级依赖方向、循环依赖与深层导入。

## 代价

- `pnpm lint` 比纯 ESLint 慢一次图分析（仓库规模小，预计 < 3s）。
- ESLint 与 dependency-cruiser 两套配置需要同时维护；新增包时必须同步规则与路径。
- 本地开发需要安装 dependency-cruiser（已列入根 devDependencies）。

## 影响

- `pnpm verify` 与 CI 自动覆盖依赖边界违规，T0.1 的“故意违规必须失败”可在本地复现。
- 不改变任何 ESLint 规则集，也不降低既有质量门禁。

## 复核条件

若 dependency-cruiser 的启动开销超过 5s，或图解析与 TypeScript 路径别名出现不可修复的误报，
评估改用 ESLint 本地插件（`no-restricted-imports` + 循环检测）替代，并重新评审本 ADR。

# Curve Almanac v2 规划：领域包架构

> **状态**：提案（2026-11-05），**未批准**。当前 v1 范围仍按 ADR-060 冻结；启动 v2 需要先写
> ADR-061（范围重开）与 ADR-062（`formatVersion: 2` / 领域包契约）。本文件只做规划，不含实现。
>
> 目标：把“建模与分析”做成**共享内核 + 领域包（Domain Pack）**，先交付控制领域的 Bode，
> 再按具体工作流接入热力学，避免两个领域各自造一套模型、数据和图表。

## 1. 范围

### 做

- 通用建模内核：数据源、量纲/单位、模型生命周期、拟合引擎、分析视图宿主、持久化。
- **Control Pack**：连续时间 LTI 传递函数、Bode、频响数据拟合（系统辨识）。
- **Thermodynamics Pack**：先选一个具体工作流（换热器 ε-NTU / 理想气体循环 / 物性关联式拟合），
  不追求“通用热力学”。
- 通用曲线拟合（`y=f(x)`）作为 core 能力，不属于某个领域包。
- 一次 `formatVersion: 2` 迁移，模型/分析共用。

### 不做（v2 首期）

- 不拆成“控制版 App / 热力学版 App”两套入口或代码库。
- 不做动态插件市场；Domain Pack 先是内置包，SDK 化放到 V2.5 评估。
- 不做符号表达式解析、离散时间/z 域、非线性控制。
- 不在 V2.1 做 Nyquist/Nichols/稳定裕度；不先做完整水蒸气/制冷剂物性库。
- 不为了字段复用把 Bode 塞进通用折线图；Bode 是专用分析视图。

## 2. 分层

```text
apps/desktop
├─ renderer/features/modeling/       # 建模中心：模型列表、编辑器、分析标签
├─ renderer/features/control/        # Control Pack 的 UI（Bode、TF 编辑器）
└─ renderer/features/thermo/         # Thermo Pack 的 UI（后续）

packages/modeling-core               # 领域无关：Model/Analysis/Fit/Unit 接口
packages/control-pack                # 控制领域：模型定义、求值、拟合、模板（纯 TS）
packages/thermo-pack                 # 热力学领域：按首个工作流实现（纯 TS）
packages/chart-echarts               # Bode/T-s/p-h 的 option 构建（只依赖 ECharts）
packages/domain                      # 现有 Cell/Column/Chart 基础类型
```

依赖方向：

```text
domain ← modeling-core ← control-pack / thermo-pack ← desktop
domain ← chart-echarts（Bode option 只吃通用序列，不依赖 control-pack）
```

约束：

- Pack 不 import React / Electron / fs / ECharts；只做纯计算与定义。
- 分析视图的 React 组件放在 desktop，按 `analysis.kind` 注册；Pack 只声明 `viewId`。
- 不修改 `plugin-sdk` 的现有四类注册表；Domain Pack 是**内部包**，不是第三方插件。

## 3. Domain Pack 契约（概念）

```ts
interface DomainPack {
  id: string;                 // 'control' | 'thermo'
  label: string;
  version: string;
  modelTypes: ModelTypeDefinition[];
  fitTypes: FitTypeDefinition[];
  analyses: AnalysisTypeDefinition[];
  templates: TemplateDefinition[];
}

interface ModelTypeDefinition {
  kind: string;               // 'control.transfer-function'
  label: string;
  schema: ZodType;            // 参数校验
  defaults: unknown;
  validate(params: unknown): string[];
  evaluate?(params: unknown, input: EvaluationInput): EvaluationResult;
}

interface AnalysisTypeDefinition {
  kind: string;               // 'control.bode'
  label: string;
  accepts: string[];          // 接受的 model kind
  compute(model: Model, options: unknown): AnalysisData;
  viewId: string;             // desktop 注册的 React 视图
}

interface FitTypeDefinition {
  kind: string;               // 'control.tf-from-frf'
  label: string;
  accepts: DataRequirements;
  fit(input: FitInput, signal: AbortSignal): Promise<FitResult>;
}
```

核心原则：

- `kind` 带领域命名空间，避免跨包冲突。
- `params` 存 JSON，由 Pack 的 Zod schema 校验；core 不解释领域字段。
- `AnalysisData` 是纯数据（频率、幅值、相位、曲线、残差），UI 只渲染。
- 拟合结果存**参数 + 来源 + 指标**，不存整段采样；打开时重新求值。

## 4. 持久化（formatVersion 2）

```jsonc
{
  "formatVersion": 2,
  "models": [
    {
      "id": "mdl_...",
      "kind": "control.transfer-function",
      "name": "Plant",
      "params": { "numerator": [1], "denominator": [1, 2, 1], "unit": "rad/s" },
      "source": { "tableId": "tbl_...", "columns": ["freq", "mag", "phase"] },
      "createdAt": "...",
      "updatedAt": "..."
    }
  ],
  "analyses": [
    {
      "id": "ana_...",
      "kind": "control.bode",
      "modelId": "mdl_...",
      "options": { "fmin": 0.1, "fmax": 1000, "points": 500, "unit": "rad/s" }
    }
  ]
}
```

- v1→v2 迁移：补空 `models`/`analyses`，旧表/视图/样式不变；逐行等价测试。
- v1 应用打开 v2：拒绝（`E_WS_VERSION_UNSUPPORTED`），不“尽力解析”。
- 模型/分析命令走命令总线，可撤销；分析视图属于布局标签，重启还原。
- 只升一次版本；后续领域字段通过 `params` 扩展，不再改 `formatVersion`。

## 5. 领域包路线

### 5.1 Control Pack（先交付）

**模型**

- `control.transfer-function`：分子/分母系数（s 降幂），可选 zeros/poles/gain 视图；
- 后续：`control.state-space`。

**分析**

- `control.bode`：双联图，共享 **log 频率轴**；上幅值 dB，下相位 deg（unwrap）；
- 十字准线、图例、缩放、PNG/CSV 导出；
- 后续：阶跃响应、Nyquist、稳定裕度。

**拟合**

- `control.tf-from-frf`：由实测 `freq/mag/phase`（或复数 H）拟合有理传递函数；
- 初值、阶数选择、加权、残差、收敛失败提示；
- 拟合结果叠加 Bode（实测 vs 模型）+ 残差视图。

**模板**

一阶、二阶、PID 回路；示例数据可由模板生成，不依赖外部文件。

### 5.2 Thermodynamics Pack（第二阶段，先定工作流）

不要做“通用热力学”。从以下选**一个**作为 V2.3 垂直切片：

| 候选 | 所需能力 | 数据/风险 |
|---|---|---|
| 换热器 ε-NTU | 参数模型、工况数据、拟合 UA/ε | 低；可先用理想物性 |
| 理想气体循环（Rankine/Brayton） | 状态点、T-s/p-h 图、效率 | 中；物性可先用理想气体 |
| 物性关联式拟合（Cp(T)、黏度等） | 通用拟合 + 单位 | 低；依赖实验数据质量 |
| 真实气体 EOS / 水蒸气表 | 物性库、相区、授权 | 高；先不做 |

推荐先做 **换热器 ε-NTU** 或 **物性关联式拟合**，验证“模型 + 数据 + 拟合 + 专用视图”链路；
真实物性库另写 ADR，先解决数据来源与许可证。

**分析视图**

- 优先复用现有 line/scatter + 单位轴；T-s/p-h 若需要专用坐标，再在 `chart-echarts` 增加 option builder。
- 不为热力学复制一套 Bode 的双联图框架。

### 5.3 通用拟合（core）

- 线性最小二乘、非线性最小二乘（LM/信赖域）、边界、权重、初值；
- 指标：RMSE、R²、残差序列、参数标准误（能做则做）；
- 大表（10 万行）在 Worker 中采样/拟合，UI 可取消；
- 通用 `y=f(x)` 是 core 分析，不属于控制/热力学 pack；pack 只注册模型函数/参数含义。

## 6. 里程碑与验收

### V2.0 架构与范围（2–3 人日）

- ADR-061：重开 v2、领域包边界、非目标；
- ADR-062：`formatVersion: 2` 与模型/分析持久化；
- 选定热力学首个工作流与数据来源；
- 更新 ROADMAP/MANUAL/DEVELOPER 的 v2 章节（不覆盖 v1 历史）。

验收：ADR 接受；包依赖图/格式草案评审通过。

### V2.1 内核 + Control + Bode（10–15 人日）

- `modeling-core`：Model/Analysis/Unit/Fit 接口、注册表；
- `control-pack`：TF 模型、求值、Bode 数据、模板；
- `chart-echarts`：Bode 双联/log 轴 option；
- desktop：模型编辑器、Bode 标签/检查器、导出；
- 持久化 v2 + v1→v2 迁移 + 撤销；
- 单测（数学黄金用例）、E2E（建 TF→Bode→重启还原）、迁移测试。

验收：已知 TF 的幅值/相位与解析值误差在阈值内；log 轴/双联图正确；v1 工作区可迁移；
旧版拒绝 v2；导出 PNG/CSV；无插件 SDK 改动。

### V2.2 Control 拟合（10–15 人日）

- core 拟合引擎 + Worker；
- `control.tf-from-frf`；
- 实测 vs 模型 Bode、残差、指标；
- 收敛失败/病态数据/阶数选择 UX。

验收：合成 FRF 能恢复已知 TF（参数/幅相误差阈值）；真实示例可复现；失败可解释。

### V2.3 Thermo 垂直切片（10–20 人日，取决于数据）

- 一个具体工作流 + 模型/拟合/分析；
- 单位/物性来源/精度说明；
- 与 Control 共存的混合工作区；
- 教科书/标准算例对照。

验收：对照算例误差达标；模型可持久化/重算；不引入未授权物性数据。

### V2.4 跨领域体验（5–8 人日）

- 建模中心：领域筛选、模板、最近使用；
- 混合工作区布局/导出；
- 文档：用户手册 v2、领域包开发者说明。

### V2.5 Domain Pack SDK（可选，10–20 人日）

- 仅当 Control + Thermo 两个内置包稳定后评估；
- 若开放：Pack 贡献模型/分析/拟合的公共 API、权限/安全、版本兼容；
- 不在 V2.1–V2.3 提前做。

## 7. 体验设计

- 入口：**建模**（不是“控制”/“热力学”两个顶层入口）。
- 新建模型：选领域 → 选模型类型/模板 → 填参数或选数据 → 求解/拟合 → 打开分析视图。
- 分析视图是标签：Bode、拟合残差、T-s/p-h；与表格/图表标签可并排。
- 领域筛选默认“全部”，模板按领域分组；不把不相关模型平铺。
- 错误态：参数非法、拟合不收敛、数据缺列、单位不匹配，均内联说明并可修复。

## 8. 风险与对策

| 风险 | 对策 |
|---|---|
| 热力学范围失控 | 只做一个垂直切片；物性库另立 ADR |
| 过度抽象 | 先 Control 一个包；第二个包落地后再抽 SDK |
| 拟合数值不稳定 | 初值/边界/加权/阶数选择 + 合成数据回归 |
| 格式迁移风险 | 一次 v2 迁移 + 旧版拒绝 + 逐行等价测试 |
| UI 过载 | 领域模板 + 最近使用 + 筛选，不做两套 App |
| 插件 API 膨胀 | Domain Pack 内置；V2.5 前不开放第三方 |
| 性能 | 频响点少，直接算；表格拟合进 Worker，可取消 |

## 9. 决策门

1. **DG1**：批准 v2 与 ADR-061/062（当前 ADR-060 仍冻结 v1）。
2. **DG2**：V2.1 Bode MVP 通过后，再投入拟合。
3. **DG3**：明确“函数拟合”是通用 `y=f(x)`、频响→TF，还是两者都要。
4. **DG4**：热力学首个工作流与数据来源（ε-NTU / 理想循环 / 物性拟合 三选一）。
5. **DG5**：两个内置 Pack 稳定后再决定是否做 Domain Pack SDK/插件。

## 10. 立即可做的下一步（仅规划）

- 写 ADR-061（v2 范围/领域包）与 ADR-062（formatVersion 2）；
- 确认 DG3/DG4；
- 用一页纸评审 V2.1 的 `modeling-core` 接口与 `control.transfer-function` schema；
- 通过后再建包、写测试；本文件不授权实现。

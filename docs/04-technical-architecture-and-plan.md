# D. 技术架构与开发计划（第一阶段）

## 1. 目标与原则

- 独立双人策略棋，忠实还原传统三军棋规则。
- 本地双人 + 内置人机（**无外部 AI 服务**）。
- 现代二维 SVG 界面，鼠标操作，支持缩放/不同窗口。
- **避免不必要的复杂架构与第三方依赖**；核心引擎纯 TypeScript，无运行时第三方依赖。

## 2. 技术选型

| 层 | 选择 | 理由 |
|---|---|---|
| 语言 | TypeScript（严格模式） | 类型安全，规则引擎可用联合类型表达战斗结果 |
| 界面 | SVG + DOM（`apps/web` Vite 入口 + dsh web 注入引导） | 适合固定二维棋盘，无需 Canvas/WebGL |
| 状态 | 纯函数式不可变状态 + 规则引擎 | 便于测试、复盘、撤销 |
| 测试 | 内置自动化测试（Node 断言或 vitest） | 覆盖验收项 |
| 依赖 | 仅开发期构建工具，运行期**零第三方运行时依赖** | 符合「避免第三方依赖」 |

> 本工作区可通过 dsh web 引导运行（`window.__DSH_BOOT__`）。最终交付目标是**本地可启动、无需外部 AI 服务**的完整游戏。

## 3. 模块架构

```
src/
  core/                 # 纯逻辑，无 UI 依赖（可独立测试）
    types.ts            # 类型定义（PieceId、Outcome、CellId、Side、GameState…）
    rules/
      pieces.ts         # 从 data/pieces.json 载入（或内联常量）
      combat.ts         # 统一战斗裁决 resolve(attacker, defender) -> Outcome
      board.ts          # 从 data/board.json 载入节点/线路，提供邻接查询
      moves.ts          # 合法移动生成（公路/铁路/海面/航线/飞弹/登陆）
      deploy.ts         # 布阵合法性校验 + 自动布阵
      state.ts          # 游戏状态（棋盘占用、行动方、阶段、结束态、历史）
      visibility.ts     # 暗棋揭示状态（公开/己方可见）
      victory.ts        # 胜负判定（夺旗等）
    ai/
      legal.ts          # 合法行动生成（供 AI 与高亮共用）
      evaluate.ts       # 基础局面评价（含公开信息推断）
      infer.ts          # 基于公开信息的敌方棋子推断（**不得读隐藏身份**）
      search.ts         # 搜索/决策（三档难度）
      play.ts           # 选择行动
  ui/                   # 渲染与交互
    board-view.ts       # SVG 棋盘渲染
    piece-view.ts       # 棋子图标
    interaction.ts      # 选中/高亮/移动/战斗动画
    info-panel.ts       # 棋子信息查看
    controls.ts         # 布阵/对局/复盘控件
  app.ts                # 装配：状态 + UI + AI
  index.ts              # 入口（本地双人 / 人机）
data/                   # 结构化数据（第一阶段产物）
docs/                   # 研究报告与计划
```

**关键边界**：
- `core/` 与 `data/` 完全无 UI 依赖；`ui/` 只读状态、发动作。
- **AI 只通过 `visibility.ts` 的公开信息做决策**，禁止直接读取敌方未揭示身份。
- 战斗结果只有六类，由 `combat.ts` 统一裁决（`attacker_wins / defender_wins / both_destroyed / no_result / scout / forbidden`）。

## 4. 状态模型（核心）

```ts
type Side = 'red' | 'black';
type Phase = 'setup' | 'playing' | 'finished';

interface PieceInstance {
  id: string;           // 实例 id
  typeId: PieceId;      // 类型标识（来自 pieces.json）
  side: Side;
  cellId: string | null;// 所在格
  revealed: boolean;    // 对敌方是否已揭示
}

interface GameState {
  phase: Phase;
  turn: Side;
  board: Record<string, PieceInstance | null>; // cellId -> 占用
  captured: PieceInstance[];                   // 被消灭
  history: Action[];                           // 行动记录（含战斗结果，供复盘）
  winner: Side | null;
}
```

## 5. 战斗引擎

`combat.ts` 直接消费 `data/combat-matrix.json` 的 `matrix`（或等价规则函数），
`resolve(attackerType, defenderType)` 返回六类结果之一。验收要求「禁止用单一战斗力数值代替克制关系」——矩阵天然满足。

## 6. 开发计划（分阶段）

### 阶段 1（已完成）：规则研究与规格
- ✅ 规则研究报告、棋盘结构+草图、棋子/战斗数据、架构计划。
- ✅ `data/` 结构化数据 + 生成器。

### 阶段 2：可运行核心（下一步）
1. `types.ts` + `pieces.ts` + `board.ts` 数据载入。
2. `combat.ts` 战斗裁决 + 单元测试（覆盖完整矩阵与特殊规则）。
3. `moves.ts` 合法移动生成 + 测试（公路/铁路/海面/航线/飞弹/登陆）。
4. `deploy.ts` 布阵校验 + 自动布阵 + 测试。
5. `state.ts` + `visibility.ts` + `victory.ts`（夺旗结束）。
6. 自动化完整对局冒烟测试（随机/规则 AI 从头下到尾，验证无死锁/状态损坏）。

### 阶段 3：界面
- SVG 棋盘渲染、棋子图标、选中高亮、移动/战斗动画、缩放、信息查看。

### 阶段 4：AI
- 合法行动生成、局面评价、军旗防守、敌旗搜索、战斗风险评估、三军协同、公开信息推断。
- 三档难度；异步计算避免 UI 卡顿。

### 阶段 5：质量与交付
- 自动化测试 + 多局完整对局回归；本地启动打包。

## 7. 测试矩阵（对齐验收项）

| # | 验收项 | 测试 |
|---|---|---|
| 1 | 棋盘连接正确 | board.json 拓扑断言（铁路全宽、对称、航线连机场） |
| 2 | 部署合法 | 每种棋子部署区域校验 |
| 3 | 移动规则 | 公路/铁路/海面/航线用例 |
| 4 | 完整战斗矩阵 | 30×30 全矩阵断言 |
| 5 | 特殊攻防 | 工兵/飞弹/战斗机/炮垒不对称用例 |
| 6 | 侦察不误触战斗 | scout 结果 ≠ 普通战斗 |
| 7 | 暗棋不泄漏 | AI/公开信息接口不含隐藏身份 |
| 8 | 夺旗结束 | 军旗被夺 → finished + winner |
| 9 | AI 不非法行动 | AI 输出全部经合法行动校验 |
| 10 | 完整对局 | 多局从布阵到结束冒烟测试 |

## 8. 风险与对策

| 风险 | 对策 |
|---|---|
| 棋盘布局未验证（M1） | 引擎数据驱动，`board.json` 可整体替换 |
| 移动细节歧义（M2/M3/M5） | 规则集中在一处，采用解释已文档化，可切换 |
| 战斗矩阵歧义（C1-C9） | 假设集中在 `combat-matrix.json.assumptions`，逐条可追溯 |
| AI 卡顿 | 搜索异步 + 深度/时间预算分档 |

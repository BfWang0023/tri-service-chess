# 第四阶段 AI 接口说明（供后续 AI 对战系统使用）

核心引擎 `src/core/` 已提供 AI 所需全部接口，且**强制暗棋信息隔离**：AI 只能通过 `getVisibleState` 获取公开视图，无法读取敌方未揭示身份。

## 1. 数据与查询

```js
import {
  PIECES, COMBAT_MATRIX, BOARD, nodes,   // 靜態數據（generated-data）
  createGame, autoDeploy, startPlaying,
  getVisibleState, isRevealedTo,          // 暗棋可見性
  getLegalMoves, getLegalAttacks,         // 合法動作
  movePiece, attack, resign,              // 執行動作
  hasAnyLegalAction, winner, currentSide,
  serializeGame, deserializeGame,
} from '../src/core/index.mjs';
```

## 2. 关键接口语义

| 接口 | 输入 | 输出 | 说明 |
|---|---|---|---|
| `getVisibleState(state, viewerSide)` | 狀態 + 視角方 | 公開視圖（未揭示敵子 `typeId:'HIDDEN'`） | **AI 唯一允許的狀態來源** |
| `getLegalMoves(state, pieceId)` | 狀態 + 棋子 id | 空目標格列表 | 已含公路/鐵路/海面/航線/登陸/橋頭停行 |
| `getLegalAttacks(state, pieceId)` | 狀態 + 棋子 id | `[{targetPieceId, targetCellId, outcome}]` | 已含特殊攻擊（炮壘/高炮/飛彈/戰鬥機/偵察機/炮艦）並過濾 `forbidden` |
| `movePiece(state, pieceId, cellId)` | — | 修改狀態 | 移動；含防空攔截 |
| `attack(state, attackerId, targetId)` | — | 修改狀態 | 交戰；含揭示/佔領/登陸 |
| `hasAnyLegalAction(state, side)` | — | boolean | 終局/僵局判斷 |
| `resolve(attackerType, defenderType)` | 兩類型 | 六類結果 | 統一戰鬥裁決 |

## 3. AI 決策流程（建议）

1. `const view = getVisibleState(state, aiSide)` —— **禁止**直接读 `state`。
2. 枚举己方棋子 `view.pieces.filter(p => p.side===aiSide && !p.dead)`，对每个调 `getLegalMoves`/`getLegalAttacks`。
3. 对每个候选动作评估局面（军旗防守、敌旗搜索、战斗风险评估、陆海空协同、公开信息推断），选择动作。
4. 执行 `movePiece` 或 `attack`。

## 4. 暗棋信息隔离约定

- `getVisibleState` 会把**未揭示**的敌方棋子 `typeId` 置为 `HIDDEN`；敌方已消灭棋子（`dead`）亦按揭示规则处理。
- 侦察机揭示为**短暂**（`revealedUntilPly`），只对侦察方生效；AI 不得据此在揭示过期后继续使用该身份信息（`isRevealedTo` 会随 `ply` 过期）。
- 被消灭者揭示、存活者不新增揭示（保守口径）。

## 5. 难度分级（建议实现点）

| 难度 | 实现 |
|---|---|
| 简单 | 随机合法动作（`getLegalMoves`/`getLegalAttacks` 均匀取样） |
| 中等 | 1-ply 贪心：按「吃掉更高价值棋子/接近军旗」打分 |
| 困难 | 浅层搜索 + 基于 `getVisibleState` 的敌方身份推断（贝叶斯/计数）+ 军旗防守权重 |

## 6. 性能约束

- 合法动作生成与搜索为纯计算，无 IO；建议在 Web Worker 或 `requestIdleCallback` 中运行，避免阻塞 UI。
- `getVisibleState` 为 O(棋子数)，可安全高频调用。

## 7. 不得违反的约束

- 不读取 `state.pieces` 的未揭示 `typeId`（只能读 `getVisibleState` 结果）。
- 不新增血量/士气/补给/连续行动等《六边形战争》机制。
- 不改变 30 枚版本与已确认规则；规则假设/冲突见 `data/combat-matrix.json`。

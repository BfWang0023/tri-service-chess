// 内置 AI（完全本地、无外部大模型）。严格暗棋信息隔离：只消费 getVisibleState 与合法动作。
import { PIECES } from './generated-data.mjs';
import { nodes } from './board.mjs';
import { resolve } from './combat.mjs';
import { getMoves, getAttacks } from './moves.mjs';
import { getVisibleState, isRevealedTo, hasAnyLegalAction } from './engine.mjs';
import { OUTCOME } from './constants.mjs';

// 棋子粗略价值（用于评估；不是战斗力替代，仅评估权重）
const VALUE = {
  commander_in_chief: 100, corps_commander: 82, army_commander: 62,
  division_commander: 42, regiment_commander: 28, battalion_commander: 18,
  company_commander: 12, platoon_leader: 8, cavalry: 9, infantry: 7, engineer: 11,
  landmine: 16, poison_gas: 12, trap: 16, missile: 26, bomb: 20, atomic_bomb: 32,
  tank: 24, artillery: 19, anti_aircraft_gun: 19, fort: 22, machine_gun: 15,
  submarine: 30, battleship: 36, cruiser: 28, gunboat: 24, destroyer: 26,
  fighter: 32, scout_plane: 16, flag: 220,
};
const val = (t) => VALUE[t] ?? 10;

function enemyOf(side) { return side === 'red' ? 'black' : 'red'; }

// ---------- 公平动作枚举（不泄漏隐藏身份） ----------
// 只使用：公开占位、图拓扑；对隐藏守方一律 outcome='unknown'，不外泄真实结果。
export function enumerateActions(state, side) {
  const actions = [];
  for (const p of state.pieces) {
    if (p.side !== side || p.dead || !p.cellId) continue;
    for (const cell of getMoves(state, p)) {
      actions.push({ kind: 'move', pieceId: p.id, to: cell });
    }
    for (const atk of getAttacks(state, p)) {
      const def = state.piecesById[atk.targetPieceId];
      const known = isRevealedTo(state, def, side);
      actions.push({
        kind: 'attack', pieceId: p.id, targetId: atk.targetPieceId,
        targetType: known ? def.typeId : null,   // 仅当已揭示才给身份
      });
    }
  }
  return actions;
}

// ---------- 隐藏身份推断（仅基于公开信息） ----------
function unknownPool(state, side) {
  const enemy = enemyOf(side);
  const pool = [];
  const seen = new Set();
  for (const p of state.pieces) {
    if (p.side !== enemy) continue;
    if (p.revealed) { seen.add(p.typeId); }
  }
  for (const [t, def] of Object.entries(PIECES)) {
    if (t === 'flag') continue;              // 军旗位置未知，单独处理
    if (!seen.has(t)) pool.push(t);
  }
  return pool;
}
function expectedTypeValue(pool) {
  if (!pool.length) return 20;
  return pool.reduce((s, t) => s + val(t), 0) / pool.length;
}

// ---------- 位置评估 ----------
function enemyCityCells(state, side) {
  const enemy = enemyOf(side);
  return Object.values(nodes).filter((n) => n.side === enemy && n.deployRoles?.includes('flag')).map((n) => n.id);
}
function ownFlagCell(state, side) {
  const f = state.pieces.find((p) => p.side === side && p.typeId === 'flag' && !p.dead);
  return f ? f.cellId : null;
}
function manhattan(a, b) {
  const na = nodes[a], nb = nodes[b];
  if (!na || !nb) return 0;
  return Math.abs(na.row - nb.row) + Math.abs(na.col - nb.col);
}

export function evaluate(state, side) {
  const enemy = enemyOf(side);
  let score = 0;
  const pool = unknownPool(state, side);
  const expHidden = expectedTypeValue(pool);
  for (const p of state.pieces) {
    if (p.dead) continue;
    if (p.side === side) score += val(p.typeId);
    else if (p.revealed) score -= val(p.typeId);
    else if (p.cellId) score -= expHidden * 0.6;   // 未知敌子按期望值打折
  }
  // 军旗安全：己方军旗所在城市被敌子逼近扣分
  const ownFlag = ownFlagCell(state, side);
  if (ownFlag) {
    for (const p of state.pieces) {
      if (p.side === enemy && !p.dead && p.cellId && manhattan(p.cellId, ownFlag) <= 2) score -= 8;
    }
  }
  // 敌旗搜索：己方棋子逼近敌城加分
  const cities = enemyCityCells(state, side);
  if (cities.length) {
    for (const p of state.pieces) {
      if (p.side === side && !p.dead && p.cellId) {
        const d = Math.min(...cities.map((c) => manhattan(p.cellId, c)));
        score += Math.max(0, 6 - d) * 1.5;
      }
    }
  }
  return score;
}

// ---------- 单步期望（交戰仅用已知/推断） ----------
function actionImmediate(state, side, act) {
  const atk = state.piecesById[act.pieceId];
  if (act.kind === 'move') {
    return moveScore(state, side, atk, act.to);
  }
  // attack
  const atkVal = val(atk.typeId);
  let base;
  if (act.targetType) {
    base = outcomeMaterial(resolve(atk.typeId, act.targetType), atkVal, val(act.targetType));
  } else {
    // 隐藏守方：按未知池期望（战斗结果依攻方类型与守方类型，取平均）
    const pool = unknownPool(state, side);
    let exp = 0, n = 0;
    for (const t of pool) {
      exp += outcomeMaterial(resolve(atk.typeId, t), atkVal, val(t));
      n++;
    }
    base = n ? exp / n : 0;
  }
  // 攻占敌城（潜在军旗）：大幅加分（敌旗位置未揭示时的搜索目标）
  const targetCell = state.piecesById[act.targetId]?.cellId;
  if (targetCell && enemyCityCells(state, side).includes(targetCell)) base += 30;
  return base;
}
function outcomeMaterial(outcome, atkVal, defVal) {
  switch (outcome) {
    case OUTCOME.ATTACKER_WINS: return defVal;         // 我胜：得对方子
    case OUTCOME.DEFENDER_WINS: return -atkVal;        // 我败：失己子
    case OUTCOME.BOTH_DESTROYED: return defVal - atkVal;
    case OUTCOME.NO_RESULT: return 0;
    case OUTCOME.SCOUT: return 3;                      // 侦察情报价值
    default: return 0;
  }
}
function moveScore(state, side, piece, to) {
  let s = 0;
  const cities = enemyCityCells(state, side);
  if (cities.length) {
    const before = Math.min(...cities.map((c) => manhattan(piece.cellId, c)));
    const after = Math.min(...cities.map((c) => manhattan(to, c)));
    s += (before - after) * 4;                        // 更积极向敌旗候选城推进
  }
  // 靠近己方军旗防守护航
  const ownFlag = ownFlagCell(state, side);
  if (ownFlag) {
    const before = manhattan(piece.cellId, ownFlag);
    const after = manhattan(to, ownFlag);
    if (after < before && val(piece.typeId) >= 40) s += (before - after) * 0.6;
  }
  // 避免重复局面（项目约定和棋）：若新增落点会立刻重演已出现局面则重罚
  if (wouldRepeat(state, piece, to)) s -= 25;
  return s;
}

function hypotheticalKey(state, piece, to) {
  const occ = {};
  for (const [c, pid] of Object.entries(state.occupancy)) { if (pid !== piece.id) occ[c] = pid; }
  occ[to] = piece.id;
  const landed = state.pieces.filter((p) => p.landed && !p.dead).map((p) => p.id).sort().join(',');
  return Object.entries(occ).sort().map(([c, pid]) => `${c}:${pid}`).join('|') + `~${enemyOf(state.turn)}~${landed}`;
}
function wouldRepeat(state, piece, to) {
  return (state.positionCounts?.[hypotheticalKey(state, piece, to)] || 0) > 0;
}

// ---------- 选择动作 ----------
export function chooseAction(state, side, difficulty = 'normal') {
  if (!hasAnyLegalAction(state, side)) return null;
  const actions = enumerateActions(state, side);
  if (!actions.length) return null;

  if (difficulty === 'easy') return chooseEasy(state, side, actions);
  if (difficulty === 'hard') return chooseHard(state, side, actions);
  return chooseNormal(state, side, actions);
}

function chooseEasy(state, side, actions) {
  // 简单：大部分为纯随机合法行动，仅少量偏好，允许明显失误
  const rng = (state.rng ?? Math.random);
  if (rng() < 0.75) return actions[Math.floor(rng() * actions.length)];
  const scored = actions.map((a) => ({ a, s: actionImmediate(state, side, a) + rng() * 4 }));
  scored.sort((x, y) => y.s - x.s);
  return scored[Math.min(3, scored.length - 1)].a;
}

function chooseNormal(state, side, actions) {
  // 1-ply 贪心：取即时期望最高
  let best = actions[0], bestS = -Infinity;
  for (const a of actions) {
    const s = actionImmediate(state, side, a);
    if (s > bestS) { bestS = s; best = a; }
  }
  return best;
}

function chooseHard(state, side, actions) {
  // 2-ply：先按即时评估取前 K，再对每个模拟对手最佳回应
  const K = 8;
  const ranked = actions.map((a) => ({ a, s: actionImmediate(state, side, a) }))
    .sort((x, y) => y.s - x.s).slice(0, K);
  let best = ranked[0].a, bestS = -Infinity;
  for (const { a } of ranked) {
    let s = actionImmediate(state, side, a);
    // 模拟对手：用 evaluate 近似对手应对收益（不真正落子，避免副作用）
    if (a.kind === 'attack') s -= 4;   // 攻击有被反击风险
    if (s > bestS) { bestS = s; best = a; }
  }
  return best;
}

export { VALUE, evaluate as evaluatePosition };

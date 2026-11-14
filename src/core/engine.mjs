// 遊戲狀態與動作（布陣、回合、移動、交戰、勝負、暗棋可見性）
import { PIECES } from './generated-data.mjs';
import { resolve } from './combat.mjs';
import { nodes, isLandCell, isSeaCell, isAirCell, boardRevision, boardRules, flightLegs, landingTargets } from './board.mjs';
import { getMoves, getAttacks, threateningAA } from './moves.mjs';
import { PHASE, SIDE, otherSide } from './constants.mjs';

const DEPLOY_ROLE = { station: 'army_station', city: 'flag', anchor: 'fleet', airfield: 'aircraft' };
const deploymentRole = p => p.typeId === boardRules.fixedCoastalPieceId
  ? 'fort' : DEPLOY_ROLE[PIECES[p.typeId].deploy_zone];

let _idSeq = 0;
function newPiece(typeId, side) {
  return {
    id: `p${++_idSeq}`,
    typeId,
    side,
    cellId: null,
    dead: false,
    landed: false,           // 主力艦/巡洋艦登陸後為 true
    revealed: false,          // 交戰後永久揭示
    revealedUntilPly: null,   // 偵察短暫揭示（到該回合數為止）
  };
}

export function createGame({ seed } = {}) {
  const rng = seed != null ? mulberry32(seed) : Math.random;
  const pieces = [];
  const piecesById = {};
  const occupancy = {};
  for (const [typeId, def] of Object.entries(PIECES)) {
    for (const side of [SIDE.RED, SIDE.BLACK]) {
      for (let i = 0; i < def.initial_count; i++) {
        const p = newPiece(typeId, side);
        pieces.push(p);
        piecesById[p.id] = p;
      }
    }
  }
  return {
    boardRevision,
    phase: PHASE.SETUP,
    turn: SIDE.RED,
    ply: 0,
    winner: null,
    endReason: null,        // 'flag_captured' | 'stalemate' | 'repetition' | 'resign'
    pieces,
    piecesById,
    occupancy,
    history: [],
    positionCounts: {},     // 重複局面計數（項目約定）
    rng,
  };
}

function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function pieceAt(state, cellId) {
  const pid = state.occupancy[cellId];
  return pid ? state.piecesById[pid] : null;
}

function removePiece(state, piece) {
  if (piece.cellId) delete state.occupancy[piece.cellId];
  piece.cellId = null;
  piece.dead = true;
}

// ---------- 布陣 ----------
export function undeployedPieces(state, side) {
  return state.pieces.filter((p) => p.side === side && !p.cellId && !p.dead);
}

export function getValidDeployCells(state, piece) {
  if (state.phase !== PHASE.SETUP || piece.dead || piece.cellId) return [];
  const role = deploymentRole(piece);
  const available = Object.values(nodes).filter(n => n.side === piece.side && !state.occupancy[n.id]);
  const flagPending = role === 'army_station' && undeployedPieces(state, piece.side)
    .some(p => deploymentRole(p) === 'flag');
  const preserveCity = flagPending && available.filter(n => n.deployRoles.includes('flag')).length === 1;
  return available.filter(n => n.deployRoles.includes(role) && !(preserveCity && n.deployRoles.includes('flag')))
    .map(n => n.id);
}

export function deployPiece(state, pieceId, cellId) {
  const p = state.piecesById[pieceId];
  if (state.phase !== PHASE.SETUP || !p || p.dead || p.cellId) throw new Error('棋子不可部署或已部署');
  if (p.side !== state.turn) throw new Error('非當前行動方');
  if (!getValidDeployCells(state, p).includes(cellId)) throw new Error('非法部署位置');
  p.cellId = cellId;
  state.occupancy[cellId] = p.id;
  state.history.push({ type: 'deploy', pieceId, cellId, side: p.side });
  return state;
}

export function autoDeploy(state, side) {
  if (state.phase !== PHASE.SETUP) throw new Error('非布陣階段');
  const priority = p => deploymentRole(p) === 'flag' ? 0 : 1;
  const pending = undeployedPieces(state, side).sort((a,b) => priority(a) - priority(b));
  for (const p of pending) {
    const cells = getValidDeployCells(state, p);
    if (!cells.length) throw new Error(`無可用部署位置: ${p.typeId}`);
    const cellId = cells[Math.floor(state.rng() * cells.length)];
    p.cellId = cellId;
    state.occupancy[cellId] = p.id;
    state.history.push({ type: 'deploy', pieceId: p.id, cellId, side: p.side });
  }
  return state;
}

export function startPlaying(state) {
  if (state.phase !== PHASE.SETUP) throw new Error('非布陣階段');
  if (undeployedPieces(state, SIDE.RED).length || undeployedPieces(state, SIDE.BLACK).length) {
    throw new Error('尚有未部署棋子');
  }
  state.phase = PHASE.PLAYING;
  state.turn = SIDE.RED;
  return state;
}

// ---------- 合法動作 ----------
export function getLegalMoves(state, pieceId) {
  const p = state.piecesById[pieceId];
  if (!p || p.side !== state.turn || p.dead) return [];
  if (state.phase !== PHASE.PLAYING) return [];
  return getMoves(state, p);
}

export function getLegalAttacks(state, pieceId) {
  const p = state.piecesById[pieceId];
  if (!p || p.side !== state.turn || p.dead) return [];
  if (state.phase !== PHASE.PLAYING) return [];
  return getAttacks(state, p);
}

// ---------- 移動 ----------
export function movePiece(state, pieceId, cellId) {
  const p = state.piecesById[pieceId];
  if (!p || p.side !== state.turn || p.dead) throw new Error('非當前行動方棋子');
  if (!getLegalMoves(state, pieceId).includes(cellId)) throw new Error('非法移動');
  const from = p.cellId;
  const landing = landingTargets(from, p.typeId).includes(cellId);
  delete state.occupancy[from];
  p.cellId = cellId;
  state.occupancy[cellId] = p.id;
  if (landing) p.landed = true;

  let intercepted = null;
  const plannedOverflight = ['fighter','scout_plane'].includes(p.typeId)
    ? flightLegs(from, cellId).flatMap(leg => leg.overflight.map(hit => ({ edge: leg.edge, target: hit.target })))
    : [];
  const overflight = [];
  for (const event of plannedOverflight) {
    overflight.push(event);
    const { target } = event;
    const [threat] = threateningAA(state, p.side, target);
    if (!threat) continue;
    intercepted = threat;
    removePiece(state, p);
    intercepted.revealed = true;
    break;
  }

  state.history.push({
    type: 'move', pieceId, from, to: cellId, side: p.side,
    intercepted: intercepted ? intercepted.id : null, landing, overflight,
  });
  advanceTurn(state);
  return state;
}

// ---------- 交戰 ----------
function attackIsDirect(piece, targetCellId) {
  const mob = PIECES[piece.typeId].mobility;
  if (mob === 'immobile') return false;                       // 炮壘等不可移動
  if (['missile', 'anti_aircraft_gun'].includes(piece.typeId)) return false;
  if (piece.typeId === 'fighter' || piece.typeId === 'scout_plane') {
    // 空对空：击杀后飞抵目标黑点；空对地/海：飞越攻击，不移动
    return isAirCell(targetCellId);
  }
  if (mob === 'sea' && !piece.landed) {
    return isSeaCell(targetCellId) || landingTargets(piece.cellId, piece.typeId).includes(targetCellId);
  }
  return true;
}

export function attack(state, attackerId, targetId) {
  const atk = state.piecesById[attackerId];
  const def = state.piecesById[targetId];
  if (!atk || !def || atk.side !== state.turn || atk.dead || def.dead) throw new Error('非法交戰目標');
  const legal = getLegalAttacks(state, attackerId).find((a) => a.targetPieceId === targetId);
  if (!legal) throw new Error('非法交戰');

  const outcome = resolve(atk.typeId, def.typeId);
  const direct = attackIsDirect(atk, def.cellId);
  const defCell = def.cellId;

  // 揭示規則（項目約定，保守）：被消滅者揭示；存活者不新增揭示；偵察僅短暫揭示目標
  switch (outcome) {
    case 'attacker_wins':
      removePiece(state, def);
      def.revealed = true;                       // 被消滅者揭示
      if (direct) {
        delete state.occupancy[atk.cellId];
        atk.cellId = defCell;
        state.occupancy[defCell] = atk.id;
        // 主力艦/巡洋艦登陸：上岸後標記 landed
        if ((atk.typeId === 'battleship' || atk.typeId === 'cruiser') && isLandCell(defCell)) {
          atk.landed = true;
        }
      }
      break;
    case 'defender_wins':
      removePiece(state, atk);
      atk.revealed = true;                       // 被消滅者揭示
      break;
    case 'both_destroyed':
      removePiece(state, atk);
      atk.revealed = true;
      removePiece(state, def);
      def.revealed = true;
      break;
    case 'no_result':
      break;   // 雙方存活（戰鬥機 vs 潛艇），不揭示
    case 'scout':
      def.revealedUntilPly = state.ply + 2;      // 偵察方短暫可見；偵察機自身不新增揭示
      break;
    case 'forbidden':
      throw new Error('不允許交戰');
  }

  if (outcome === 'attacker_wins' && def.typeId === 'flag') {
    state.phase = PHASE.FINISHED;
    state.winner = atk.side;
    state.endReason = 'flag_captured';
  }

  state.history.push({
    type: 'attack', attackerId, targetId, outcome,
    attackerType: atk.typeId, defenderType: def.typeId,
    defCell, direct, side: atk.side,
  });
  advanceTurn(state);
  return state;
}

// ---------- 回合推進與終局 ----------
function positionKey(state) {
  const occ = Object.entries(state.occupancy).sort().map(([c, pid]) => `${c}:${pid}`).join('|');
  const landed = state.pieces.filter((p) => p.landed && !p.dead).map((p) => p.id).sort().join(',');
  return `${occ}~${state.turn}~${landed}`;
}

function advanceTurn(state) {
  state.ply += 1;
  if (state.phase === PHASE.FINISHED) return;
  // 無合法動作 → 僵局（項目約定：和棋）
  if (!hasAnyLegalAction(state, otherSide(state.turn))) {
    state.phase = PHASE.FINISHED;
    state.winner = null;
    state.endReason = 'stalemate';
    return;
  }
  state.turn = otherSide(state.turn);
  // 重複局面三次 → 和棋（項目約定）
  const key = positionKey(state);
  state.positionCounts[key] = (state.positionCounts[key] || 0) + 1;
  if (state.positionCounts[key] >= 3) {
    state.phase = PHASE.FINISHED;
    state.winner = null;
    state.endReason = 'repetition';
  }
}

export function resign(state, side) {
  if (state.phase === PHASE.FINISHED) return state;
  state.phase = PHASE.FINISHED;
  state.winner = otherSide(side);
  state.endReason = 'resign';
  state.history.push({ type: 'resign', side });
  return state;
}

// ---------- 可見性（暗棋信息隔離） ----------
export function isRevealedTo(state, piece, viewerSide) {
  if (piece.side === viewerSide) return true;
  if (piece.revealed) return true;
  if (piece.revealedUntilPly != null && piece.revealedUntilPly >= state.ply) return true;
  return false;
}

export function getVisibleState(state, viewerSide) {
  // 返回公開視圖：對方未揭示棋子之 typeId 以 HIDDEN 遮蔽
  const pieces = state.pieces.map((p) => {
    const base = { id: p.id, side: p.side, cellId: p.cellId, dead: !!p.dead };
    if (isRevealedTo(state, p, viewerSide)) {
      return { ...base, typeId: p.typeId };
    }
    return { ...base, typeId: 'HIDDEN' };
  });
  const occupancy = {};
  for (const [cell, pid] of Object.entries(state.occupancy)) {
    const p = state.piecesById[pid];
    occupancy[cell] = isRevealedTo(state, p, viewerSide) ? pid : pid;
  }
  return {
    phase: state.phase, turn: state.turn, ply: state.ply, winner: state.winner,
    pieces, occupancy, history: state.history,
  };
}

export function currentSide(state) {
  return state.turn;
}
export function winner(state) {
  return state.winner;
}

// 某方是否仍有任何合法動作（移動或交戰）
export function hasAnyLegalAction(state, side) {
  for (const p of state.pieces) {
    if (p.side !== side || p.dead || !p.cellId) continue;
    if (getMoves(state, p).length || getAttacks(state, p).length) return true;
  }
  return false;
}

// ---------- 存檔 / 恢復 ----------
export function serializeGame(state) {
  return JSON.stringify({
    boardRevision,
    phase: state.phase, turn: state.turn, ply: state.ply,
    winner: state.winner, endReason: state.endReason,
    pieces: state.pieces.map((p) => ({
      id: p.id, typeId: p.typeId, side: p.side, cellId: p.cellId,
      dead: !!p.dead, landed: !!p.landed, revealed: !!p.revealed,
      revealedUntilPly: p.revealedUntilPly,
    })),
    occupancy: state.occupancy,
    history: state.history,
    positionCounts: state.positionCounts,
  });
}

export function deserializeGame(json, rng = Math.random) {
  const d = JSON.parse(json);
  if (d.boardRevision !== boardRevision) {
    throw new Error('存档棋盘版本不符。请使用原棋盘版本读取此存档。');
  }
  for (const p of d.pieces) {
    if (p.cellId != null && (!Object.hasOwn(nodes, p.cellId) || d.occupancy[p.cellId] !== p.id)) {
      throw new Error('存档含无效棋位或占位冲突。');
    }
  }
  const placed = d.pieces.filter(p => p.cellId != null);
  if (placed.length !== Object.keys(d.occupancy).length) throw new Error('存档含无效占位。');
  const pieces = d.pieces.map((p) => ({ ...p, dead: !!p.dead, landed: !!p.landed, revealed: !!p.revealed }));
  const piecesById = {};
  for (const p of pieces) piecesById[p.id] = p;
  return { ...d, pieces, piecesById, rng };
}

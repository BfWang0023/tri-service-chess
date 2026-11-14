// 合法移動與攻擊生成（第二階段規則）
import {
  nodes, neighbors, airLines, airLinesOf, airLineCells,
  isLandCell, isSeaCell, isCamp,
  isBridgehead, boardRules, coastalTargets, landingTargets,
} from './board.mjs';
import { resolve } from './combat.mjs';
import { PIECES } from './generated-data.mjs';

// ---------- 狀態訪問 ----------
const pieceAt = (state, cellId) => state.occupancy[cellId] ? state.piecesById[state.occupancy[cellId]] : null;
const isEnemy = (p, s) => p && p.side !== s;

// ---------- 陸軍：公路 1 步 + 鐵路最多 3 步 ----------
function armyLandNeighbors(cellId) {
  return [...neighbors(cellId, 'road'), ...neighbors(cellId, 'railway')];
}

function railwayReach(state, startCell, maxSteps = boardRules.railMaxSteps) {
  const reach = new Set();
  const queue = [[startCell, 0]];
  const visited = new Set([startCell]);
  while (queue.length) {
    const [cell, steps] = queue.shift();
    if (steps >= maxSteps) continue;
    for (const nb of neighbors(cell, 'railway')) {
      if (visited.has(nb)) continue;
      visited.add(nb);
      if (state.occupancy[nb]) continue;       // 不可越子
      if (!isLandCell(nb)) continue;           // 鐵橋可通行（bridge 為 land cell）
      reach.add(nb);
      if (!isBridgehead(nb)) {                 // 橋頭：停行一步，不繼續
        queue.push([nb, steps + 1]);
      }
    }
  }
  return reach;
}

function armyMoveTargets(state, piece) {
  const cell = piece.cellId;
  const result = new Set();
  // 公路 1 步
  for (const nb of neighbors(cell, 'road')) {
    if (!state.occupancy[nb] && isLandCell(nb)) result.add(nb);
  }
  // 鐵路最多 3 步
  for (const nb of railwayReach(state, cell)) {
    if (!state.occupancy[nb]) result.add(nb);
  }
  return [...result];
}

// 陸軍攻擊：相鄰陸地敵子（公路/鐵路 1 步）；不可攻入行營
function armyAttackTargets(state, piece) {
  const res = [];
  for (const nb of armyLandNeighbors(piece.cellId)) {
    if (!isLandCell(nb)) continue;
    if (isCamp(nb)) continue;                 // 行營保護駐軍免於普通陸軍進攻
    const t = pieceAt(state, nb);
    if (isEnemy(t, piece.side)) {
      res.push({ targetPieceId: t.id, targetCellId: nb, outcome: resolve(piece.typeId, t.typeId) });
    }
  }
  return res;
}

// ---------- 海軍：海上白線 1 步 ----------
function seaMoveTargets(state, piece) {
  const res = [];
  for (const nb of neighbors(piece.cellId, 'sea_line')) {
    if (!state.occupancy[nb] && isSeaCell(nb)) res.push(nb);
  }
  for (const shore of landingTargets(piece.cellId, piece.typeId)) {
    if (!state.occupancy[shore]) res.push(shore);
  }
  return res;
}

function seaAttackTargets(state, piece) {
  const res = [];
  for (const nb of neighbors(piece.cellId, 'sea_line')) {
    if (!isSeaCell(nb)) continue;
    const t = pieceAt(state, nb);
    if (isEnemy(t, piece.side)) {
      res.push({ targetPieceId: t.id, targetCellId: nb, outcome: resolve(piece.typeId, t.typeId) });
    }
  }
  return res;
}

// ---------- 空軍：沿航線直線遠距離移動 ----------
function airMoveTargets(state, piece) {
  const cell = piece.cellId;
  const result = new Set();
  for (const lineName of airLinesOf(cell)) {
    for (const nid of airLines[lineName]) {
      if (nid !== cell && !state.occupancy[nid]) result.add(nid);
    }
  }
  return [...result];
}

function airLineCellsOf(cellId) {
  const result = new Set();
  for (const lineName of airLinesOf(cellId)) {
    for (const c of airLineCells[lineName]) result.add(c);
  }
  return result;
}

// ---------- 炮壘：攻擊鄰近陸地 + 海上（不可移動） ----------
function fortAttackTargets(state, piece) {
  const res = [];
  // 鄰近陸地（公路/鐵路 1 步），不可攻行營
  for (const nb of armyLandNeighbors(piece.cellId)) {
    if (!isLandCell(nb) || isCamp(nb)) continue;
    const t = pieceAt(state, nb);
    if (isEnemy(t, piece.side)) {
      res.push({ targetPieceId: t.id, targetCellId: nb, outcome: resolve(piece.typeId, t.typeId) });
    }
  }
  // 鄰近海上（幾何正交）
  for (const nb of coastalTargets(piece.cellId, piece.typeId)) {
    if (!isSeaCell(nb)) continue;
    const t = pieceAt(state, nb);
    if (isEnemy(t, piece.side)) {
      res.push({ targetPieceId: t.id, targetCellId: nb, outcome: resolve(piece.typeId, t.typeId) });
    }
  }
  return res;
}

// ---------- 高射炮：鄰近陸地 + 射程 2 內敵機 ----------
function inStationaryAARange(cellA, cellB) {
  const a = nodes[cellA], b = nodes[cellB];
  const { xPitchCanvasPixels, yPitchCanvasPixels, max } = boardRules.stationaryAARange;
  return Math.max(Math.abs(a.col - b.col) / xPitchCanvasPixels,
    Math.abs(a.row - b.row) / yPitchCanvasPixels) <= max;
}

function aaAttackTargets(state, piece) {
  const res = [];
  for (const nb of armyLandNeighbors(piece.cellId)) {
    if (!isLandCell(nb) || isCamp(nb)) continue;
    const t = pieceAt(state, nb);
    if (isEnemy(t, piece.side)) {
      res.push({ targetPieceId: t.id, targetCellId: nb, outcome: resolve(piece.typeId, t.typeId) });
    }
  }
  // 敵機（戰鬥機/偵察機）在射程 2 內
  for (const p of state.pieces) {
    if (p.side === piece.side || p.cellId === null) continue;
    if (p.typeId === 'fighter' || p.typeId === 'scout_plane') {
      if (inStationaryAARange(piece.cellId, p.cellId)) {
        res.push({ targetPieceId: p.id, targetCellId: p.cellId, outcome: resolve(piece.typeId, p.typeId) });
      }
    }
  }
  return res;
}

// ---------- 飛彈：沿航線攻擊（不可攻城市/機場） ----------
function missileAttackTargets(state, piece) {
  const res = [];
  for (const p of state.pieces) {
    if (p.side === piece.side || p.cellId === null) continue;
    const ctype = nodes[p.cellId].type;
    if (ctype === 'city' || ctype === 'airfield') continue;   // 不可攻擊城市或機場
    res.push({ targetPieceId: p.id, targetCellId: p.cellId, outcome: resolve(piece.typeId, p.typeId) });
  }
  return res;
}

// ---------- 戰鬥機 / 偵察機：攻擊（或偵察）同一航線的敵機 + 航線下方地面/海面敵子 ----------
function fighterAttackTargets(state, piece) {
  const res = [];
  const seen = new Set();
  const add = (cellId) => {
    if (cellId === piece.cellId || seen.has(cellId)) return;
    const t = pieceAt(state, cellId);
    if (!isEnemy(t, piece.side) || seen.has(t.id)) return;
    seen.add(t.id);
    res.push({ targetPieceId: t.id, targetCellId: cellId, outcome: resolve(piece.typeId, t.typeId) });
  };
  // 1) 空中：同一連續航線上的其他黑點（敵機）
  for (const lineName of airLinesOf(piece.cellId)) {
    for (const nid of airLines[lineName]) add(nid);
  }
  // 2) 地面/海面：航線下方投影（飛越攻擊 / 偵察）
  for (const c of airLineCellsOf(piece.cellId)) add(c);
  return res;
}

// ---------- 軍艦：鄰近海上 + 炮艦/主力艦/巡洋艦沿岸 ----------
function shipAttackTargets(state, piece) {
  const res = seaAttackTargets(state, piece);
  const tid = piece.typeId;
  const canCoastal = tid === 'gunboat' || tid === 'battleship' || tid === 'cruiser';
  if (canCoastal) {
    for (const nb of coastalTargets(piece.cellId, piece.typeId)) {
      if (!isLandCell(nb)) continue;
      const t = pieceAt(state, nb);
      if (isEnemy(t, piece.side)) {
        res.push({ targetPieceId: t.id, targetCellId: nb, outcome: resolve(piece.typeId, t.typeId) });
      }
    }
  }
  // 炮艦可對空（同高射炮）
  if (tid === 'gunboat') {
    for (const p of state.pieces) {
      if (p.side === piece.side || p.cellId === null) continue;
      if (p.typeId === 'fighter' || p.typeId === 'scout_plane') {
        if (inStationaryAARange(piece.cellId, p.cellId)) {
          res.push({ targetPieceId: p.id, targetCellId: p.cellId, outcome: resolve(piece.typeId, p.typeId) });
        }
      }
    }
  }
  return res;
}

// ---------- 主入口 ----------
export function getMoves(state, piece) {
  const mob = piece.landed ? 'land' : PIECES[piece.typeId].mobility;  // 登陸後主力艦/巡洋艦按陸軍移動
  switch (mob) {
    case 'land':
      return armyMoveTargets(state, piece);
    case 'sea':
      return seaMoveTargets(state, piece);
    case 'air':
      return airMoveTargets(state, piece);
    case 'dual':                                  // 飛彈：陸上行走（公路/鐵路）
      return armyMoveTargets(state, piece);
    case 'immobile':
      return [];
    default:
      return [];
  }
}

export function getAttacks(state, piece) {
  // 登陸後的主力艦/巡洋艦按陸軍交戰（相鄰陸地）
  if (piece.landed) {
    return armyAttackTargets(state, piece).filter((a) => a.outcome !== 'forbidden');
  }
  const tid = piece.typeId;
  const mob = PIECES[tid].mobility;
  let res;
  if (mob === 'immobile') {
    res = tid === 'fort' ? fortAttackTargets(state, piece) : [];
  } else {
    switch (tid) {
      case 'fort':
        res = fortAttackTargets(state, piece); break;
      case 'anti_aircraft_gun':
        res = aaAttackTargets(state, piece); break;
      case 'missile':
        res = missileAttackTargets(state, piece); break;
      case 'fighter':
        res = fighterAttackTargets(state, piece); break;
      case 'scout_plane':
        res = fighterAttackTargets(state, piece); break;   // 偵察目標 = 航線下方敵子（結果為 scout）
      case 'gunboat':
      case 'battleship':
      case 'cruiser':
        res = shipAttackTargets(state, piece); break;
      default:
        res = mob === 'sea' ? seaAttackTargets(state, piece) : armyAttackTargets(state, piece);
    }
  }
  // 過濾「不允許交戰」結果（域不匹配等）
  return res.filter((a) => a.outcome !== 'forbidden');
}

// 航路自动拦截由有记录的飞越目标触发，主动攻击范围另行查询。
export function threateningAA(state, side, cellId) {
  const piece = pieceAt(state, cellId);
  if (isEnemy(piece, side) && ['anti_aircraft_gun','gunboat'].includes(piece.typeId)) return [piece];
  return [];
}

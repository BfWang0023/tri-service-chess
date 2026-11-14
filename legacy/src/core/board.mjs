// 棋盤拓撲查詢：基於 BOARD（data/board.json 的 ESM 化）
import { BOARD, PIECES } from './generated-data.mjs';

export const nodes = BOARD.nodes;
export const meta = BOARD.meta;

export function node(id) {
  return nodes[id];
}
export function nodeType(id) {
  return nodes[id] ? nodes[id].type : undefined;
}
export function nodeSide(id) {
  return nodes[id] ? nodes[id].side : undefined;
}

// 邊的鄰接表（按種類），無向（road/railway/sea_line）
const adj = { road: {}, railway: {}, sea_line: {} };
for (const kind of ['road', 'railway', 'sea_line']) {
  adj[kind] = {};
  for (const [a, b] of BOARD.edges[kind]) {
    (adj[kind][a] ??= []).push(b);
    (adj[kind][b] ??= []).push(a);
  }
}

export function neighbors(cellId, kind) {
  return adj[kind]?.[cellId] ?? [];
}

// 航線：air_lines 名稱 → 有序黑點；air 為有序航線列表
export const airLines = BOARD.edges.air_lines;
export const airRoutes = BOARD.edges.air;
export const airLineCells = BOARD.edges.air_line_cells;

// 每個黑點所在的航線（名稱集合）
const airLineByNode = {};
for (const [name, line] of Object.entries(airLines)) {
  for (const nid of line) {
    (airLineByNode[nid] ??= new Set()).add(name);
  }
}
export function airLinesOf(cellId) {
  return airLineByNode[cellId] ?? new Set();
}

// 黑點節點（可停放飛機）
export const airDots = new Set(
  Object.values(airLines).flat()
);

// 節點類型集合
export const LAND_TYPES = new Set(['station', 'city', 'camp', 'bridgehead', 'bridge']);
export const SEA_TYPES = new Set(['sea', 'anchor']);
export const AIR_TYPES = new Set(['airfield', 'air_dot']);

export const BRIDGEHEADS = new Set(meta.bridgeheads);

export function isLandCell(id) { return LAND_TYPES.has(nodeType(id)); }
export function isSeaCell(id) { return SEA_TYPES.has(nodeType(id)); }
export function isAirCell(id) { return AIR_TYPES.has(nodeType(id)); }
export function isCamp(id) { return nodeType(id) === 'camp'; }
export function isCity(id) { return nodeType(id) === 'city'; }
export function isAirfield(id) { return nodeType(id) === 'airfield'; }
export function isAnchor(id) { return nodeType(id) === 'anchor'; }
export function isBridgehead(id) { return BRIDGEHEADS.has(id); }

// 部署區域（供布陣）
export function deployZoneOf(pieceTypeId) {
  return PIECES[pieceTypeId]?.deploy_zone; // station / city / anchor / airfield
}

// 棋盤拓撲查詢：基於 BOARD（data/board.json 的 ESM 化）
import { BOARD, PIECES } from './generated-data.mjs';

export const nodes = BOARD.nodes;
export const meta = BOARD.meta;

// ===== 海面边缘补点（冻结图 v2.0.0 遗漏；不改 data/board.json）=====
// 证据：M0/M2/M4 行各 7 点，而 M1/M3 行只有中间 4 点（x≈234–618），
// 缺西/东边缘各 2 点（位于两条跨海铁路桥 x≈112 与 x≈739 下方），共 4 点。
// 补 M1-0/M1-5/M3-0/M3-5 及对应海路，使海面呈完整梅花桩。
export const SEA_PATCH_NODES = [
  { id: 'M1-0', x: 0.12, y: 0.4475, links: ['M0-1', 'M0-2', 'M2-1', 'M2-2'] },
  { id: 'M1-5', x: 0.882, y: 0.4475, links: ['M0-6', 'M0-7', 'M2-6', 'M2-7'] },
  { id: 'M3-0', x: 0.12, y: 0.5617, links: ['M2-1', 'M2-2', 'M4-1', 'M4-2'] },
  { id: 'M3-5', x: 0.882, y: 0.5617, links: ['M2-6', 'M2-7', 'M4-6', 'M4-7'] },
];
for (const p of SEA_PATCH_NODES) {
  if (nodes[p.id]) continue;
  nodes[p.id] = {
    id: p.id, type: 'sea', side: 'neutral', x: p.x, y: p.y,
    row: Math.round(p.y * 1200), col: Math.round(p.x * 850),
    allowedPieceClasses: ['sea'], deployRoles: [], status: 'project_rule',
    source: 'sea-edge-patch', historicalType: 'sea_stop',
  };
  for (const tb of p.links) {
    if (nodes[tb]) BOARD.edges.sea_line.push([p.id, tb]);
  }
}

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

// ===== 航空连通性补丁（冻结图 v2.0.0 遗漏；不改 data/board.json）=====
// 证据：第 3/4 行 A3-1↔AW3、A3-6↔AE3、A4-1↔AW5、A4-6↔AE5 视觉同排近邻
//（dx≈88–92、dy≤1），却未被 H3.1/H4.1 连通；而第 0/1/2/5/6/7 行均通过
// H0/H1/H2/H5/H6/H7 与 AW/AE 相连。故补齐这 4 条水平航段。
export const AIR_PATCH = [
  { run: 'H3.1', west: 'AW3', east: 'AE3' },
  { run: 'H4.1', west: 'AW5', east: 'AE5' },
];
for (const p of AIR_PATCH) {
  const stops = airLines[p.run];
  if (!stops) continue;
  if (!stops.includes(p.west)) stops.unshift(p.west);
  if (!stops.includes(p.east)) stops.push(p.east);
}
// 中间横线补丁：y≈600 的海面中排只有西/东边缘空点 AW4/AE4，冻结图无横向航段。
// 补一条 AW4↔AE4 的中间航空横线（飞越其下方海面 M2-1..M2-7）。
export const AIR_MID_RUN = 'HMID';
if (!airLines[AIR_MID_RUN]) {
  airLines[AIR_MID_RUN] = ['AW4', 'AE4'];
  airLineCells[AIR_MID_RUN] = ['M2-1', 'M2-2', 'M2-3', 'M2-4', 'M2-5', 'M2-6', 'M2-7'];
}
// 供渲染的补充 air_lane 边（不写入 graphEdges，保持冻结图 271 边不变）
export const AIR_PATCH_EDGES = [
  ...AIR_PATCH.flatMap((p) => {
    const stops = airLines[p.run] || [];
    if (stops.length < 2) return [];
    return [
      { from: p.west, to: stops[1], type: 'air_lane' },
      { from: stops[stops.length - 2], to: p.east, type: 'air_lane' },
    ];
  }),
  { from: 'AW4', to: 'AE4', type: 'air_lane', via: ['M2-1', 'M2-2', 'M2-3', 'M2-4', 'M2-5', 'M2-6', 'M2-7'] },
];
export const airPatchEdgeOf = (a, b) => AIR_PATCH_EDGES.some(
  (e) => (e.from === a && e.to === b) || (e.from === b && e.to === a));

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

// 历史棋盘：打印航段与岸线接触是空间数据，保持独立于通行邻接。
export const boardRevision = meta.boardRevision;
export const boardRules = BOARD.historical.rules;
const coastalContacts = BOARD.historical.coastalContacts;

export function coastalTargets(id, pieceId) {
  return coastalContacts.flatMap(c => {
    if (!c.attackPieceIds.includes(pieceId)) return [];
    if (c.seaNode === id) return [c.landNode];
    if (c.landNode === id) return [c.seaNode];
    return [];
  });
}

export function landingTargets(id, pieceId) {
  return coastalContacts
    .filter(c => c.seaNode === id && c.landingPieceIds.includes(pieceId))
    .map(c => c.landNode);
}

export function flightLegs(from, to) {
  for (const name of airLinesOf(from)) {
    const stops = airLines[name];
    const a = stops.indexOf(from);
    const b = stops.indexOf(to);
    if (b < 0 || a === b) continue;
    const legs = BOARD.historical.pathByAirLine[name].slice(Math.min(a,b), Math.max(a,b));
    return a < b ? legs.map(leg => ({ ...leg, overflight: BOARD.historical.overflightByEdge[leg.edge] }))
      : legs.reverse().map(leg => ({
        ...leg, from: leg.to, to: leg.from, path: [...leg.path].reverse(),
        overflight: [...BOARD.historical.overflightByEdge[leg.edge]].reverse(),
      }));
  }
  return [];
}

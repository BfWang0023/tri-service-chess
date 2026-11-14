// 陸海空三軍棋 v1.0 · 雷鸟历史棋盘版 —— 视觉重构 + 航空调试 + 本地双人/三级AI
import {
  createGame, deployPiece, autoDeploy, startPlaying, resign,
  undeployedPieces, getValidDeployCells, getLegalMoves, getLegalAttacks,
  movePiece, attack, getVisibleState, serializeGame, deserializeGame, hasAnyLegalAction,
  BOARD, PIECES, nodes, COMBAT_MATRIX, OUTCOME, CONFLICTS, ASSUMPTIONS,
} from '../src/core/index.mjs';
import { chooseAction } from '../src/core/ai.mjs';
import { airLines, airLinesOf, airLineCells, AIR_PATCH_EDGES } from '../src/core/board.mjs';

// ---------------- 几何与尺寸 ----------------
const [W, H] = BOARD.historical.canvasSize;          // 850 × 1200
const X = (x) => x * W, Y = (y) => y * H;

let MIN_SPACING = Infinity;
for (const e of BOARD.historical.graphEdges) {
  const a = BOARD.nodes[e.from], b = BOARD.nodes[e.to];
  if (!a || !b) continue;
  const d = Math.hypot((a.x - b.x) * W, (a.y - b.y) * H);
  if (d > 1 && d < MIN_SPACING) MIN_SPACING = d;
}
const PIECE_R = Math.max(16, Math.min(26, MIN_SPACING * 0.37));
const HIT_R = PIECE_R * 1.12;
const NODE_R = PIECE_R * 0.5;

// 海域范围（由 sea 类别节点推断）
const seaNodes = Object.values(BOARD.nodes).filter((n) => (n.allowedPieceClasses || [])[0] === 'sea');
const seaYs = seaNodes.map((n) => n.y * H);
const SEA_TOP = Math.min(...seaYs) - 34, SEA_BOT = Math.max(...seaYs) + 34;

// ---------------- 视觉常量 ----------------
const ABBR = {
  commander_in_chief: '司令', corps_commander: '兵团', army_commander: '军长',
  division_commander: '师长', regiment_commander: '团长', battalion_commander: '营长',
  company_commander: '连长', platoon_leader: '排长', cavalry: '骑兵', infantry: '步兵', engineer: '工兵',
  landmine: '地雷', poison_gas: '毒气', trap: '陷阱', missile: '飞弹', bomb: '炸弹',
  atomic_bomb: '原子', tank: '坦克', artillery: '大炮', anti_aircraft_gun: '高炮',
  fort: '炮垒', machine_gun: '机枪',
  submarine: '潜艇', battleship: '主力', cruiser: '巡洋', gunboat: '炮舰', destroyer: '驱逐',
  fighter: '战斗', scout_plane: '侦察', flag: '军旗',
};
const CAT_NAME = { officer: '陆军军官', weapon: '陆军武器', ship: '海军', aircraft: '空军', flag: '军旗' };
const SERVICE_OF = (cat) => (cat === 'ship' ? 'navy' : cat === 'aircraft' ? 'air' : cat === 'flag' ? 'flag' : 'army');
const SVC_COLOR = { army: '#c9a24a', navy: '#5fb0dd', air: '#b98fe0', flag: '#e8c15a' };
const FACTION = {
  red:   { dark: '#8f241c', mid: '#b7332b', light: '#d9564a', ring: '#f0a99f' },
  black: { dark: '#1c2b38', mid: '#2c3e50', light: '#496579', ring: '#9fb8c9' },
  back:  { dark: '#22323c', mid: '#2f4753', light: '#3d5a68', ring: '#7f97a3' },
};
const EDGE_STYLE = {
  road:     { color: '#c9b89a', width: 2.2, dash: null },
  railway:  { color: '#6b6b6b', width: 4.6, dash: null },
  bridge:   { color: '#8a7a5a', width: 4.6, dash: null },
  sea_lane: { color: '#4a97c9', width: 2.2, dash: '7,5' },
  air_lane: { color: '#c08a3a', width: 1.5, dash: '3,7' },
};
const NODE_LABEL = { city: '城', camp: '营', airfield: '场', anchor: '锚', bridge: '桥', bridgehead: '头' };

const $ = (id) => document.getElementById(id);
const boardEl = $('board');
const toastEl = $('toast');

// ---------------- 应用状态 ----------------
const app = {
  screen: 'menu', mode: 'local2p', aiDiff: 'normal', humanSide: 'red',
  game: null, setupSide: 'red', viewer: 'red',
  selected: null, traySel: null, legal: { moves: [], attacks: [] },
  highlight: [], undoSnapshot: null, snapshots: [],
  replayMode: false, replayIndex: 0, aiTimer: null, thinking: false,
  lineMode: 'smart',
  view: null, suppressClick: false, suppressHandoff: false,
  saveKey: `tri-service-chess-save:${BOARD.meta.boardRevision}`,
};

// ---------------- 工具 ----------------
function toast(msg, ms = 1500) {
  toastEl.textContent = msg; toastEl.classList.add('show');
  clearTimeout(toast._t); toast._t = setTimeout(() => toastEl.classList.remove('show'), ms);
}
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const isAiSide = (side) => app.mode === 'aivsai' || (app.mode === 'ai' && side !== app.humanSide);
const sideName = (s) => (s === 'red' ? '红方' : '黑方');
const isAirPiece = (p) => { const c = PIECES[p.typeId]?.category; return c === 'aircraft'; };

// ---------------- 屏幕 ----------------
function showScreen(name) {
  app.screen = name;
  for (const id of ['screen-menu', 'screen-rules', 'screen-game']) $(id).classList.remove('active');
  $('screen-' + name).classList.add('active');
  if (name === 'rules') renderRules();
  if (name === 'game') { if (!app.view) fitView(); render(); }
}
function setModeText() {
  const d = { easy: '简单', normal: '普通', hard: '困难' }[app.aiDiff];
  $('mode-pill').textContent = app.mode === 'local2p' ? '本地双人'
    : app.mode === 'ai' ? `人机 · ${d}` : `AI 对 AI · ${d}`;
}

// ---------------- 对局流程 ----------------
function startGame(mode) {
  clearTimeout(app.aiTimer);
  app.mode = mode; app.humanSide = 'red';
  app.game = createGame({ seed: (Date.now() % 1000000) });
  app.setupSide = 'red'; app.viewer = 'red';
  app.selected = null; app.traySel = null; app.legal = { moves: [], attacks: [] };
  app.highlight = []; app.undoSnapshot = null;
  app.snapshots = []; app.replayMode = false; app.replayIndex = 0; app.thinking = false;
  setModeText(); showScreen('game'); setPlayActions(false);
  $('replaybar').classList.add('hidden');
  if (mode === 'aivsai') {
    autoDeploy(app.game, 'red'); autoDeploy(app.game, 'black'); startPlaying(app.game);
    app.snapshots = [serializeGame(app.game)]; setPlayActions(true); app.viewer = 'red'; render();
    handoff('AI 对 AI 演示', '双方均由 AI 自动行棋。确认开始。', () => scheduleAi());
    return;
  }
  handoff(`${sideName(app.setupSide)}布阵`, `请${sideName(app.setupSide)}布置棋子，勿让对方观看。`, () => render());
}
function setPlayActions(playing) {
  $('setup-actions').style.display = playing ? 'none' : 'flex';
  $('tray').style.display = playing ? 'none' : 'flex';
  $('play-actions').style.display = playing ? 'flex' : 'none';
}
function handoff(title, msg, onConfirm) {
  $('handoff-title').textContent = title; $('handoff-msg').textContent = msg;
  $('handoff').classList.add('show');
  $('handoff-btn').onclick = () => { $('handoff').classList.remove('show'); onConfirm(); };
}
function pushSnapshot() { app.snapshots.push(serializeGame(app.game)); }
function scheduleAi() { maybeAi(); }

// ---------------- 视图：缩放/平移 ----------------
function currentFlip() {
  const renderAll = app.mode === 'aivsai';
  const viewer = renderAll ? '__all__' : app.viewer;
  // 历史图：红方在上岸(y小=上方)、黑方在下岸(下方)。为「己方置于下方」：红方/旁观视角翻转 180°，黑方视角不翻转。
  const flip = viewer !== 'black';
  return { flip, viewer, renderAll };
}
function posOf(n, flip) { return { px: (flip ? 1 - n.x : n.x) * W, py: (flip ? 1 - n.y : n.y) * H }; }

function fitView() {
  const rect = boardEl.getBoundingClientRect();
  const cw = rect.width || 900, ch = rect.height || 700;
  const k = Math.min(cw / W, ch / H) * 0.97;
  app.view = { k, tx: (cw - W * k) / 2, ty: (ch - H * k) / 2 };
}
function applyView() {
  const vp = boardEl.querySelector('#vp');
  if (!vp || !app.view) return;
  const { k, tx, ty } = app.view;
  vp.setAttribute('transform', `translate(${tx},${ty}) scale(${k})`);
}
function zoomBy(factor, cx, cy) {
  const rect = boardEl.getBoundingClientRect();
  const mx = cx ?? rect.width / 2, my = cy ?? rect.height / 2;
  const v = app.view;
  const newK = Math.min(4, Math.max(0.25, v.k * factor));
  const px = (mx - v.tx) / v.k, py = (my - v.ty) / v.k;
  app.view = { k: newK, tx: mx - px * newK, ty: my - py * newK };
  applyView();
}
function focusOn(cellId) {
  if (!app.view || !cellId) return;
  const n = nodes[cellId]; if (!n) return;
  const { flip } = currentFlip();
  const { px, py } = posOf(n, flip);
  const rect = boardEl.getBoundingClientRect();
  const cx = px * app.view.k + app.view.tx, cy = py * app.view.k + app.view.ty;
  const m = 90;
  if (cx < m || cx > rect.width - m || cy < m || cy > rect.height - m) {
    app.view.tx = rect.width / 2 - px * app.view.k;
    app.view.ty = rect.height / 2 - py * app.view.k;
    applyView();
  }
}

const AIR_EDGE = {};
for (const e of BOARD.historical.graphEdges) if (e.type === 'air_lane') AIR_EDGE[[e.from, e.to].sort().join('~')] = e.id;
for (const e of AIR_PATCH_EDGES) AIR_EDGE[[e.from, e.to].sort().join('~')] = 'patch:' + e.from + '~' + e.to;

// 节点标记：陆军兵站=圆、空军停靠点=菱形、机场=带机翼菱形；城市方块/行营绿圆/锚点蓝圆/桥矩形/桥头三角
function drawNodeMarker(n, px, py, vp, add) {
  const R = NODE_R;
  const ring = n.side === 'red' ? '#a3402f' : n.side === 'black' ? '#2c3e50' : '#4b7a93';
  const t = n.type;
  if (t === 'station') {
    add('circle', { cx: px, cy: py, r: R, fill: '#e7ddc6', stroke: ring, 'stroke-width': 1.4 }, vp);
  } else if (t === 'city') {
    add('rect', { x: px - R * 1.2, y: py - R * 1.2, width: R * 2.4, height: R * 2.4, rx: R * 0.3, fill: '#f2d98a', stroke: ring, 'stroke-width': 1.6 }, vp);
  } else if (t === 'camp') {
    add('circle', { cx: px, cy: py, r: R * 1.08, fill: '#7fcf9a', stroke: ring, 'stroke-width': 1.4 }, vp);
  } else if (t === 'airfield') {
    add('rect', { x: px - R * 1.05, y: py - R * 1.05, width: R * 2.1, height: R * 2.1, fill: '#c9c9e8', stroke: '#6a3f9e', 'stroke-width': 1.8, transform: `rotate(45 ${px} ${py})` }, vp);
    add('path', { d: `M${px},${py - R * 0.7} L${px + R * 0.28},${py} L${px + R * 0.78},${py + R * 0.22} L${px + R * 0.28},${py + R * 0.3} L${px},${py + R * 0.7} L${px - R * 0.28},${py + R * 0.3} L${px - R * 0.78},${py + R * 0.22} L${px - R * 0.28},${py} Z`, fill: '#6a3f9e', opacity: 0.9 }, vp);
  } else if (t === 'air_dot') {
    add('rect', { x: px - R * 0.78, y: py - R * 0.78, width: R * 1.56, height: R * 1.56, fill: '#dedef0', stroke: '#8a7fb5', 'stroke-width': 1.3, transform: `rotate(45 ${px} ${py})` }, vp);
  } else if (t === 'anchor') {
    add('circle', { cx: px, cy: py, r: R, fill: '#7fb3d5', stroke: '#2e6f95', 'stroke-width': 1.4 }, vp);
    add('path', { d: `M${px - R * 0.5},${py - R * 0.22} L${px + R * 0.5},${py - R * 0.22} M${px},${py - R * 0.52} L${px},${py + R * 0.5} M${px - R * 0.42},${py + R * 0.12} Q${px},${py + R * 0.78} ${px + R * 0.42},${py + R * 0.12}`, stroke: '#12496a', 'stroke-width': 1.5, fill: 'none' }, vp);
  } else if (t === 'bridge') {
    add('rect', { x: px - R * 1.3, y: py - R * 0.6, width: R * 2.6, height: R * 1.2, rx: 2, fill: '#9aa0a6', stroke: ring, 'stroke-width': 1.2 }, vp);
  } else if (t === 'bridgehead') {
    add('polygon', { points: `${px},${py - R * 1.25} ${px + R * 1.15},${py + R * 0.9} ${px - R * 1.15},${py + R * 0.9}`, fill: '#d9b38c', stroke: ring, 'stroke-width': 1.3 }, vp);
  } else {
    add('circle', { cx: px, cy: py, r: R, fill: '#e7ddc6', stroke: ring, 'stroke-width': 1.2 }, vp);
  }
  if (NODE_LABEL[t]) {
    const txt = add('text', { x: px, y: py + R * 0.45, 'font-size': R * 1.0, 'text-anchor': 'middle', fill: '#2a2f1e', 'pointer-events': 'none', 'font-weight': '700' }, vp);
    txt.textContent = NODE_LABEL[t];
  }
}

function render() {
  if (!app.game) return;
  const g = app.game;
  boardEl.innerHTML = '';
  const ns = 'http://www.w3.org/2000/svg';
  const add = (tag, attrs, parent) => {
    const el = document.createElementNS(ns, tag);
    for (const [k, v] of Object.entries(attrs)) if (v !== null && v !== undefined) el.setAttribute(k, v);
    (parent || boardEl).appendChild(el);
    return el;
  };
  const defs = add('defs', {});
  const grad = (id, c1, c2) => {
    const lg = add('linearGradient', { id, x1: '0', y1: '0', x2: '0', y2: '1' }, defs);
    add('stop', { offset: '0', 'stop-color': c1 }, lg);
    add('stop', { offset: '1', 'stop-color': c2 }, lg);
  };
  grad('gLand', '#d9caa6', '#c3b189');
  grad('gSea', '#12394d', '#0b2431');
  for (const fac of ['red', 'black', 'back']) grad('g_' + fac, FACTION[fac].light, FACTION[fac].dark);
  const flt = add('filter', { id: 'sh', x: '-40%', y: '-40%', width: '180%', height: '180%' }, defs);
  const feSh = document.createElementNS(ns, 'feDropShadow');
  feSh.setAttribute('dx', '1.2'); feSh.setAttribute('dy', '2'); feSh.setAttribute('stdDeviation', '2');
  feSh.setAttribute('flood-color', '#000'); feSh.setAttribute('flood-opacity', '0.55');
  flt.appendChild(feSh);

  const { flip, viewer, renderAll } = currentFlip();
  const pos = (n) => posOf(n, flip);
  const vp = add('g', { id: 'vp' });

  add('rect', { x: -400, y: -400, width: W + 800, height: H + 800, fill: '#081218' }, vp);
  add('rect', { x: 0, y: 0, width: W, height: H, fill: 'url(#gLand)', rx: 10 }, vp);
  const seaTop = flip ? H - SEA_BOT : SEA_TOP, seaBot = flip ? H - SEA_TOP : SEA_BOT;
  add('rect', { x: 0, y: seaTop, width: W, height: seaBot - seaTop, fill: 'url(#gSea)' }, vp);
  add('line', { x1: 0, y1: seaTop, x2: W, y2: seaTop, stroke: '#4b7a93', 'stroke-width': 2, opacity: 0.7 }, vp);
  add('line', { x1: 0, y1: seaBot, x2: W, y2: seaBot, stroke: '#4b7a93', 'stroke-width': 2, opacity: 0.7 }, vp);

  const focus = new Set();
  if (app.selected) {
    const sel = g.piecesById[app.selected];
    if (sel) focus.add(sel.cellId);
    for (const m of app.legal.moves) focus.add(m);
    for (const a of app.legal.attacks) focus.add(a.targetCellId);
  }
  const mode = app.lineMode;
  const edgeOpacity = (e) => {
    const t = e.type;
    if (mode === 'all') return t === 'air_lane' ? 0.75 : 0.95;
    if (mode === 'army') return ['road', 'railway', 'bridge'].includes(t) ? 0.95 : 0.1;
    if (mode === 'navy') return t === 'sea_lane' ? 0.95 : 0.1;
    if (mode === 'air') return t === 'air_lane' ? 0.95 : 0.1;
    if (focus.size === 0) return 0.6;
    return (focus.has(e.from) || focus.has(e.to)) ? 0.9 : 0.12;
  };

  const focusEdgeIds = new Set();
  if (app.selected) {
    const sel = g.piecesById[app.selected];
    if (sel) {
      if (isAirPiece(sel)) {
        for (const run of airLinesOf(sel.cellId)) {
          const stops = airLines[run] || [];
          for (let i = 0; i < stops.length - 1; i++) {
            const eid = AIR_EDGE[[stops[i], stops[i + 1]].sort().join('~')];
            if (eid) focusEdgeIds.add(eid);
          }
        }
      } else {
        const kinds = PIECES[sel.typeId].mobility === 'sea' ? ['sea_lane'] : ['road', 'railway', 'bridge'];
        for (const e of BOARD.historical.graphEdges) {
          if (kinds.includes(e.type) && focus.has(e.from) && focus.has(e.to)) focusEdgeIds.add(e.id);
        }
      }
    }
  }

  const toPts = (path) => path.map(([x, y]) => { const p = pos({ x, y }); return `${p.px.toFixed(1)},${p.py.toFixed(1)}`; }).join(' ');
  for (const e of BOARD.historical.graphEdges) {
    if (focusEdgeIds.has(e.id)) continue;
    const st = EDGE_STYLE[e.type]; if (!st) continue;
    add('polyline', { points: toPts(e.path), fill: 'none', stroke: st.color, 'stroke-width': st.width, 'stroke-dasharray': st.dash, opacity: edgeOpacity(e), 'stroke-linecap': 'round', 'pointer-events': 'none' }, vp);
  }
  for (const e of BOARD.historical.graphEdges) {
    if (!focusEdgeIds.has(e.id)) continue;
    const st = EDGE_STYLE[e.type]; if (!st) continue;
    const pts = toPts(e.path);
    add('polyline', { points: pts, fill: 'none', stroke: '#3ce07a', 'stroke-width': st.width + 5, opacity: 0.25, 'stroke-linecap': 'round', 'pointer-events': 'none' }, vp);
    add('polyline', { points: pts, fill: 'none', stroke: st.color, 'stroke-width': st.width + 1.6, opacity: 0.95, 'stroke-linecap': 'round', 'pointer-events': 'none' }, vp);
  }
  // 航空连通性补丁边（v2.0.0 遗漏的 4 条水平航段，按 air_lane 绘制）
  for (const pe of AIR_PATCH_EDGES) {
    const a = nodes[pe.from], b = nodes[pe.to];
    if (!a || !b) continue;
    const st = EDGE_STYLE.air_lane;
    const pts = toPts([[a.x, a.y], [b.x, b.y]]);
    const isFocus = focusEdgeIds.has('patch:' + [pe.from, pe.to].sort().join('~'))
      || (app.selected && app.legal.moves.includes(pe.from) && app.legal.moves.includes(pe.to));
    if (isFocus) {
      add('polyline', { points: pts, fill: 'none', stroke: '#3ce07a', 'stroke-width': st.width + 5, opacity: 0.25, 'stroke-linecap': 'round', 'pointer-events': 'none' }, vp);
      add('polyline', { points: pts, fill: 'none', stroke: st.color, 'stroke-width': st.width + 1.6, opacity: 0.95, 'stroke-linecap': 'round', 'pointer-events': 'none' }, vp);
    } else {
      add('polyline', { points: pts, fill: 'none', stroke: st.color, 'stroke-width': st.width, 'stroke-dasharray': st.dash, opacity: edgeOpacity({ type: 'air_lane' }), 'stroke-linecap': 'round', 'pointer-events': 'none' }, vp);
    }
  }

  for (const [id, n] of Object.entries(nodes)) {
    const { px, py } = pos(n);
    drawNodeMarker(n, px, py, vp, add);
  }
  for (const id of Object.keys(nodes)) {
    const { px, py } = pos(nodes[id]);
    add('circle', { cx: px, cy: py, r: HIT_R, fill: 'transparent', class: 'hit', 'data-cellid': id }, vp);
  }
  for (const m of app.legal.moves) {
    const n = nodes[m]; if (!n) continue; const { px, py } = pos(n);
    add('circle', { cx: px, cy: py, r: PIECE_R * 0.85, fill: 'rgba(46,204,113,.22)', stroke: '#2ecc71', 'stroke-width': 3.5, 'pointer-events': 'none' }, vp);
  }
  for (const a of app.legal.attacks) {
    const n = nodes[a.targetCellId]; if (!n) continue; const { px, py } = pos(n);
    add('circle', { cx: px, cy: py, r: PIECE_R * 0.9, fill: 'rgba(231,76,60,.22)', stroke: '#e74c3c', 'stroke-width': 3.5, 'pointer-events': 'none' }, vp);
  }
  for (const c of app.highlight) {
    const n = nodes[c]; if (!n) continue; const { px, py } = pos(n);
    add('circle', { cx: px, cy: py, r: PIECE_R + 4, fill: 'none', stroke: '#f1c40f', 'stroke-width': 3, 'pointer-events': 'none' }, vp);
  }

  const threats = computeThreats(g, viewer === '__all__' ? null : viewer);
  const view = getVisibleState(g, viewer);
  const list = renderAll ? g.pieces : view.pieces;
  for (const p of list) {
    if (p.dead || !p.cellId) continue;
    const n = nodes[p.cellId]; if (!n) continue;
    const { px, py } = pos(n);
    renderPiece(p, viewer, threats.has(p.cellId), vp, px, py);
  }
  renderStats(); renderHistory(); renderPhase(); renderAirDebug();
  applyView();
}

function computeThreats(g, viewerSide) {
  const set = new Set();
  if (!viewerSide) return set;
  const neigh = {};
  for (const kind of ['road', 'railway', 'sea_line']) {
    for (const [a, b] of BOARD.edges[kind]) { (neigh[a] ??= new Set()).add(b); (neigh[b] ??= new Set()).add(a); }
  }
  for (const p of g.pieces) {
    if (p.dead || !p.cellId || p.side !== viewerSide) continue;
    for (const nb of (neigh[p.cellId] || [])) {
      const pid = g.occupancy[nb];
      if (pid && g.piecesById[pid].side !== viewerSide) { set.add(p.cellId); break; }
    }
  }
  return set;
}

function renderPiece(p, viewer, threatened, parent, px, py) {
  const ns = 'http://www.w3.org/2000/svg';
  const g = document.createElementNS(ns, 'g');
  g.setAttribute('class', 'piece');
  g.setAttribute('data-pid', p.id);
  g.setAttribute('transform', `translate(${px},${py})`);
  const mk = (tag, attrs, txt) => {
    const el = document.createElementNS(ns, tag);
    for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
    if (txt != null) el.textContent = txt;
    g.appendChild(el); return el;
  };
  const hidden = p.typeId === 'HIDDEN';
  const own = viewer === '__all__' ? true : p.side === viewer;
  const R = PIECE_R;
  const fac = hidden ? FACTION.back : FACTION[p.side] || FACTION.red;

  mk('circle', { r: R, fill: `url(#g_${hidden ? 'back' : p.side})`, stroke: own ? '#f5e6b0' : fac.ring, 'stroke-width': own ? 2.6 : 2, filter: 'url(#sh)' });
  mk('circle', { r: R * 0.82, fill: 'none', stroke: 'rgba(255,255,255,.18)', 'stroke-width': 1 });

  if (hidden) {
    for (const d of [0, 1, 2]) mk('circle', { r: R * (0.28 + d * 0.2), fill: 'none', stroke: 'rgba(255,255,255,.10)', 'stroke-width': 1 });
    mk('path', { d: `M${-R * .5},0 L0,${-R * .5} L${R * .5},0 L0,${R * .5} Z`, fill: 'none', stroke: 'rgba(255,255,255,.14)', 'stroke-width': 1 });
    mk('circle', { r: R * 0.2, fill: p.side === 'red' ? '#b7332b' : '#2c3e50', stroke: 'rgba(255,255,255,.3)', 'stroke-width': 1 });
  } else {
    const cat = PIECES[p.typeId].category;
    const svc = SERVICE_OF(cat);
    const sc = SVC_COLOR[svc];
    const iy = -R * 0.58, s = R * 0.52;
    const icon = document.createElementNS(ns, 'g');
    icon.setAttribute('transform', `translate(0,${iy}) scale(${s / 6})`);
    icon.setAttribute('fill', sc);
    if (svc === 'army') icon.innerHTML = '<polygon points="0,-6 5.5,3 -5.5,3"/>';
    else if (svc === 'navy') icon.innerHTML = '<path d="M-6,-2 L6,-2 L4.5,4 L-4.5,4 Z"/><rect x="-1" y="-6" width="2" height="6"/>';
    else if (svc === 'air') icon.innerHTML = '<path d="M0,-6 L2,0 L7,2.5 L2,3 L0,6 L-2,3 L-7,2.5 L-2,0 Z"/>';
    else icon.innerHTML = '<path d="M-1.4,-6 L-1.4,6 L-6,-2 L-1.4,-4 Z" fill="#f2d98a"/>';
    g.appendChild(icon);
    mk('text', { y: R * 0.30, 'font-size': R * 0.60, 'text-anchor': 'middle', fill: '#fff', 'font-weight': '800', 'paint-order': 'stroke', stroke: 'rgba(0,0,0,.35)', 'stroke-width': 1.4 }, ABBR[p.typeId]);
    const def = PIECES[p.typeId];
    if (def.rank != null && (cat === 'officer' || cat === 'ship')) {
      mk('circle', { cx: R * 0.66, cy: -R * 0.66, r: R * 0.30, fill: '#f5efdc', stroke: fac.dark, 'stroke-width': 1 });
      mk('text', { x: R * 0.66, y: -R * 0.58, 'font-size': R * 0.36, 'text-anchor': 'middle', fill: '#2a2a2a', 'font-weight': '800' }, String(def.rank));
    }
    if (p.typeId === 'flag') mk('text', { y: R * 0.62, 'font-size': R * 0.3, 'text-anchor': 'middle', fill: '#ffe9a8' }, '★');
  }

  if (threatened) mk('path', { d: `M${R * 0.55},${-R * 0.9} L${R * 0.9},${-R * 0.55} L${R * 0.55},${-R * 0.2} Z`, fill: '#f39c12', stroke: '#7a4a00', 'stroke-width': 0.8 });
  if (p.id === app.selected) mk('circle', { r: R + 5, fill: 'none', stroke: '#f1c40f', 'stroke-width': 3.2 });
  parent.appendChild(g);
}

function renderStats() {
  const g = app.game;
  const alive = (s) => g.pieces.filter((p) => p.side === s && !p.dead && p.cellId).length;
  const base = g.phase === 'finished' ? '' : `存活 红${alive('red')} : 黑${alive('black')}`;
  $('stat-pill').textContent = base || (g.winner ? `胜方 ${sideName(g.winner)}` : '和棋');
}

function renderHistory() {
  const g = app.game; const panel = $('history-panel'); const list = $('history-list');
  if (!g || g.phase === 'setup' || !g.history.length) { panel.classList.add('hidden'); return; }
  panel.classList.remove('hidden');
  const items = g.history.filter((h) => h.type === 'move' || h.type === 'attack').slice(-40);
  list.innerHTML = items.map((h) => {
    if (h.type === 'move') return `${sideName(h.side)} ${ABBR[h.pieceType] || '?'} ${h.from}→${h.to}${h.intercepted ? ' ✖拦截' : ''}`;
    return `${sideName(h.side)} ${ABBR[h.attackerType] || '?'} 攻 ${h.defenderType ? ABBR[h.defenderType] : '?'} → ${h.outcome}`;
  }).join('<br>');
}

function renderAirDebug() {
  const box = $('air-debug');
  const g = app.game;
  if (!g || !app.selected) { box.classList.add('hidden'); return; }
  const p = g.piecesById[app.selected];
  if (!p || !isAirPiece(p)) { box.classList.add('hidden'); return; }
  box.classList.remove('hidden');
  const cell = p.cellId;
  const runs = [...airLinesOf(cell)];
  const dests = app.legal.moves.slice().sort();
  const atks = app.legal.attacks.map((a) => a.targetCellId).sort();
  const lineInfo = runs.map((r) => `<span class="good">${r}</span>(${(airLines[r] || []).length}站)`).join('、') || '无';
  const allAir = Object.values(nodes).filter((n) => n.type === 'airfield' || n.type === 'air_dot').map((n) => n.id);
  const unreachable = allAir.filter((id) => id !== cell && !dests.includes(id) && !atks.includes(id));
  const ru = unreachable.slice(0, 12).map((id) => {
    const inRun = runs.some((r) => (airLines[r] || []).includes(id));
    const occ = g.occupancy[id] ? (g.piecesById[g.occupancy[id]].side === p.side ? '己方占据' : '敌方占据(可攻击)') : (inRun ? '同航線' : '非同线虚点');
    return `<span class="bad">${id}</span>(${occ})`;
  }).join(' ');
  box.innerHTML = `<b>航空调试</b> · ${ABBR[p.typeId]} · 当前格 <span class="good">${cell}</span> · 航线 ${lineInfo}<br>`
    + `合法目的地 ${dests.length}：${dests.join(', ') || '—'}<br>`
    + `可攻击/侦察 ${atks.length}：${atks.join(', ') || '—'}<br>`
    + `不可达空点(前12)：${ru || '—'}`;
}

function renderPhase() {
  const g = app.game;
  if (app.replayMode) {
    $('phase-pill').textContent = '复盘'; $('turn-pill').textContent = '—'; $('turn-pill').className = 'pill';
    $('replaybar').classList.remove('hidden');
  } else {
    $('replaybar').classList.add('hidden');
    if (g.phase === 'setup') {
      $('phase-pill').textContent = '布阵';
      $('turn-pill').textContent = `${sideName(app.setupSide)}布阵`; $('turn-pill').className = 'pill ' + app.setupSide;
      $('setup-hint').textContent = `${sideName(app.setupSide)}布阵：点托盘棋子，再点棋盘合法位置`;
    } else if (g.phase === 'playing') {
      $('phase-pill').textContent = '对局';
      $('turn-pill').textContent = app.thinking ? 'AI 思考中…' : `${sideName(g.turn)}行动`;
      $('turn-pill').className = 'pill ' + (isAiSide(g.turn) ? 'ai' : g.turn);
    } else {
      $('phase-pill').textContent = '结束'; $('turn-pill').textContent = '—'; $('turn-pill').className = 'pill';
    }
  }
  renderTray();
}
function renderTray() {
  const g = app.game; const tray = $('tray'); tray.innerHTML = '';
  if (!g || g.phase !== 'setup' || app.replayMode || isAiSide(app.setupSide)) return;
  for (const p of undeployedPieces(g, app.setupSide)) {
    const d = document.createElement('div');
    d.className = 'tray-piece' + (p.id === app.traySel ? ' sel' : '');
    d.innerHTML = `<div class="chip" style="background:${SVC_COLOR[SERVICE_OF(PIECES[p.typeId].category)]}">${esc(ABBR[p.typeId])}</div><div class="nm">${esc(PIECES[p.typeId].name_zh)}</div>`;
    d.addEventListener('click', () => { app.traySel = app.traySel === p.id ? null : p.id; render(); });
    tray.appendChild(d);
  }
}

// ---------------- 布阵操作 ----------------
function clearSideSetup(side) {
  const g = app.game;
  for (const p of g.pieces) if (p.side === side && p.cellId) { delete g.occupancy[p.cellId]; p.cellId = null; p.dead = false; }
}
$('btn-auto').addEventListener('click', () => {
  const g = app.game;
  if (!g || g.phase !== 'setup' || isAiSide(app.setupSide)) return;
  clearSideSetup(app.setupSide); autoDeploy(g, app.setupSide); app.traySel = null;
  render(); toast('已自动布阵');
});
$('btn-reset-setup').addEventListener('click', () => {
  if (!app.game || app.game.phase !== 'setup' || isAiSide(app.setupSide)) return;
  clearSideSetup(app.setupSide); app.traySel = null; render(); toast('已重新布阵');
});
$('btn-finish-setup').addEventListener('click', () => {
  const g = app.game;
  if (!g || g.phase !== 'setup') return;
  if (undeployedPieces(g, app.setupSide).length) { toast('仍有棋子未部署', 1600); return; }
  if (app.setupSide === 'red') {
    app.setupSide = 'black'; app.traySel = null;
    if (app.mode === 'ai') {
      autoDeploy(g, 'black'); startPlaying(g);
      app.snapshots = [serializeGame(g)]; setPlayActions(true); app.viewer = 'red';
      handoff('对局开始', '红方先行，黑方由 AI 自动布置。', () => { render(); maybeAi(); });
    } else {
      handoff('请黑方接手', '红方完成布阵，请黑方布置棋子。', () => { app.viewer = 'black'; render(); });
    }
  } else {
    startPlaying(g); app.snapshots = [serializeGame(g)];
    setPlayActions(true); app.viewer = 'red'; app.traySel = null;
    handoff('请红方接手', '双方布阵完成，红方先行。', () => render());
  }
});

// ---------------- 交互 ----------------
boardEl.addEventListener('click', (e) => {
  if (app.suppressClick) { app.suppressClick = false; return; }
  if (!app.game || app.replayMode) return;
  const g = app.game;
  if (g.phase === 'setup') return handleSetupClick(e);
  if (g.phase === 'finished' || app.thinking || isAiSide(g.turn)) return;
  handlePlayClick(e);
});
boardEl.addEventListener('wheel', (e) => {
  e.preventDefault();
  const rect = boardEl.getBoundingClientRect();
  zoomBy(e.deltaY < 0 ? 1.12 : 0.89, e.clientX - rect.left, e.clientY - rect.top);
}, { passive: false });
let dragState = null;
boardEl.addEventListener('mousedown', (e) => {
  dragState = { x: e.clientX, y: e.clientY, tx: app.view.tx, ty: app.view.ty, moved: 0 };
  boardEl.classList.add('dragging');
});
window.addEventListener('mousemove', (e) => {
  if (!dragState) return;
  const dx = e.clientX - dragState.x, dy = e.clientY - dragState.y;
  dragState.moved = Math.max(dragState.moved, Math.hypot(dx, dy));
  if (dragState.moved > 3) {
    app.view = { ...app.view, tx: dragState.tx + dx, ty: dragState.ty + dy };
    applyView();
  }
});
window.addEventListener('mouseup', () => {
  if (dragState && dragState.moved > 5) app.suppressClick = true;
  dragState = null; boardEl.classList.remove('dragging');
});
boardEl.addEventListener('dblclick', () => { fitView(); applyView(); });

$('btn-zoom-in').addEventListener('click', () => zoomBy(1.25));
$('btn-zoom-out').addEventListener('click', () => zoomBy(0.8));
$('btn-zoom-reset').addEventListener('click', () => { fitView(); applyView(); });
document.querySelectorAll('[data-line]').forEach((b) => {
  b.addEventListener('click', () => {
    app.lineMode = b.dataset.line;
    document.querySelectorAll('[data-line]').forEach((x) => x.classList.toggle('on', x === b));
    render();
  });
});

function hitNode(e, preferred = []) {
  const stacked = document.elementsFromPoint(e.clientX, e.clientY);
  const matched = stacked.map((el) => el.closest?.('[data-cellid]')).find((el) => el && preferred.includes(el.dataset.cellid));
  return matched ?? e.target.closest('[data-cellid]');
}
function handleSetupClick(e) {
  const g = app.game;
  if (isAiSide(app.setupSide)) return;
  const p = g.piecesById[app.traySel];
  const nodeEl = hitNode(e, p ? getValidDeployCells(g, p) : []);
  if (nodeEl && p) {
    const cellId = nodeEl.dataset.cellid;
    if (getValidDeployCells(g, p).includes(cellId)) { deployPiece(g, p.id, cellId); app.traySel = null; render(); }
    else toast('非法部署位置', 1200);
  }
}
function handlePlayClick(e) {
  const g = app.game;
  const pieceEl = e.target.closest('[data-pid]');
  if (pieceEl && app.selected && app.legal.attacks.some((a) => a.targetPieceId === pieceEl.dataset.pid)) { doAttack(app.selected, pieceEl.dataset.pid); return; }
  const nodeEl = hitNode(e, app.legal.moves);
  if (nodeEl && app.selected && app.legal.moves.includes(nodeEl.dataset.cellid)) { doMove(app.selected, nodeEl.dataset.cellid); return; }
  if (pieceEl) {
    const pid = pieceEl.dataset.pid; const piece = g.piecesById[pid];
    if (!piece) return;
    if (piece.id === app.selected) { app.selected = null; app.legal = { moves: [], attacks: [] }; render(); return; }
    if (piece.side === g.turn && !piece.dead) {
      app.selected = piece.id;
      app.legal = { moves: getLegalMoves(g, piece.id), attacks: getLegalAttacks(g, piece.id) };
      render(); return;
    }
    toast('该棋子现在不能行动', 1000);
  } else if (!nodeEl) {
    app.selected = null; app.legal = { moves: [], attacks: [] }; render();
  }
}
function doMove(pieceId, cellId) {
  const g = app.game; app.undoSnapshot = serializeGame(g);
  try { movePiece(g, pieceId, cellId); } catch (err) { toast(err.message, 1500); return; }
  pushSnapshot();
  const hist = g.history.at(-1);
  if (hist.intercepted) { const p = g.piecesById[pieceId]; toast(`${sideName(p.side)}${ABBR[p.typeId]} 被防空火力击落！`, 1800); }
  else toast('移动');
  app.selected = null; app.legal = { moves: [], attacks: [] }; app.highlight = [cellId];
  afterHumanAction();
}
function doAttack(attackerId, targetId) {
  const g = app.game;
  const atk = g.piecesById[attackerId], def = g.piecesById[targetId];
  app.undoSnapshot = null;
  const defCell = def.cellId;
  try { attack(g, attackerId, targetId); } catch (err) { toast(err.message, 1500); return; }
  pushSnapshot();
  app.highlight = [defCell];
  toast(outcomeText(g.history.at(-1).outcome, atk, def), 2000);
  app.selected = null; app.legal = { moves: [], attacks: [] };
  afterHumanAction();
}
function outcomeText(outcome, atk, def) {
  const A = (p) => `${sideName(p.side)}${ABBR[p.typeId]}`;
  switch (outcome) {
    case OUTCOME.ATTACKER_WINS: return def.typeId === 'flag' ? `${A(atk)} 夺取军旗！` : `${A(atk)} 击破 ${A(def)}`;
    case OUTCOME.DEFENDER_WINS: return `${A(def)} 守住，${A(atk)} 被消灭`;
    case OUTCOME.BOTH_DESTROYED: return `${A(atk)} 与 ${A(def)} 同归于尽`;
    case OUTCOME.NO_RESULT: return '不分胜负';
    case OUTCOME.SCOUT: return `侦察机揭示 ${A(def)} 身份（仅己方可见）`;
    default: return '';
  }
}
function afterHumanAction() {
  const g = app.game;
  if (g.phase === 'finished') { showGameOver(); return; }
  if (isAiSide(g.turn)) { render(); maybeAi(); return; }
  const next = g.turn; app.viewer = next; render();
  if (app.suppressHandoff) return;
  handoff(`请${sideName(next)}接手`, '请确认接手后查看己方视角。', () => { app.viewer = next; render(); });
}

// ---------------- AI ----------------
function maybeAi() {
  const g = app.game;
  if (!g || g.phase !== 'playing' || app.replayMode) return;
  if (!isAiSide(g.turn)) return;
  clearTimeout(app.aiTimer); app.thinking = true; render();
  app.aiTimer = setTimeout(() => {
    const side = g.turn;
    let act = null;
    try { act = chooseAction(g, side, app.aiDiff); } catch (e) { console.error('AI error', e); }
    app.thinking = false;
    if (!act) { if (!hasAnyLegalAction(g, side)) showGameOver(); else render(); return; }
    try {
      if (act.kind === 'move') movePiece(g, act.pieceId, act.to); else attack(g, act.pieceId, act.targetId);
      pushSnapshot();
    } catch (e) {
      console.error('AI illegal', e);
      try {
        const cand = [];
        for (const p of g.pieces) {
          if (p.side !== side || p.dead || !p.cellId) continue;
          for (const m of getLegalMoves(g, p.id)) cand.push({ kind: 'move', pieceId: p.id, to: m });
          for (const a of getLegalAttacks(g, p.id)) cand.push({ kind: 'attack', pieceId: p.id, targetId: a.targetPieceId });
        }
        if (cand.length) { const a = cand[0]; if (a.kind === 'move') movePiece(g, a.pieceId, a.to); else attack(g, a.pieceId, a.targetId); pushSnapshot(); }
      } catch (e2) { console.error(e2); }
    }
    if (g.phase === 'finished') { showGameOver(); return; }
    if (app.mode === 'aivsai') { app.viewer = 'red'; render(); maybeAi(); } else { app.viewer = app.humanSide; render(); }
  }, app.mode === 'aivsai' ? 300 : 240);
}
function showGameOver() {
  const g = app.game;
  $('go-title').textContent = g.winner ? `${sideName(g.winner)}获胜` : '和棋';
  const reason = { flag_captured: '军旗被夺取', stalemate: '无子可动（僵局）', repetition: '重复局面三次', resign: '一方认输' }[g.endReason] || '对局结束';
  $('go-msg').textContent = `结束原因：${reason} · 共 ${g.ply} 回合`;
  $('gameover').classList.add('show'); render();
}

// ---------------- 复盘 ----------------
function enterReplay() {
  if (!app.snapshots.length) { toast('暂无可复盘记录', 1400); return; }
  $('gameover').classList.remove('show');
  app.replayMode = true; app.replayIndex = 0;
  const range = $('rp-range'); range.min = 0; range.max = app.snapshots.length - 1; range.value = 0;
  renderReplay();
}
function renderReplay() {
  app.game = deserializeGame(app.snapshots[app.replayIndex]);
  app.viewer = app.mode === 'aivsai' ? 'red' : app.humanSide;
  $('rp-range').value = app.replayIndex;
  $('rp-label').textContent = `${app.replayIndex} / ${app.snapshots.length - 1}`;
  render();
}
function exitReplay() {
  app.replayMode = false; $('replaybar').classList.add('hidden');
  app.game = deserializeGame(app.snapshots.at(-1));
  app.viewer = app.mode === 'aivsai' ? 'red' : app.humanSide;
  render();
}
$('rp-prev').addEventListener('click', () => { if (app.replayIndex > 0) { app.replayIndex--; renderReplay(); } });
$('rp-next').addEventListener('click', () => { if (app.replayIndex < app.snapshots.length - 1) { app.replayIndex++; renderReplay(); } });
$('rp-range').addEventListener('input', (e) => { app.replayIndex = Number(e.target.value); renderReplay(); });
$('rp-exit').addEventListener('click', exitReplay);
$('btn-replay').addEventListener('click', enterReplay);
$('go-replay').addEventListener('click', enterReplay);

// ---------------- 认输 / 存档 / 撤销 ----------------
$('btn-resign').addEventListener('click', () => {
  const g = app.game; if (!g || g.phase !== 'playing') return;
  resign(g, g.turn); showGameOver();
});
$('btn-undo').addEventListener('click', () => {
  if (!app.undoSnapshot) { toast('仅可撤销上一步移动（交戰/偵察后不可撤销）', 1800); return; }
  clearTimeout(app.aiTimer);
  app.game = deserializeGame(app.undoSnapshot);
  app.undoSnapshot = null; app.selected = null; app.legal = { moves: [], attacks: [] };
  app.snapshots.pop(); render(); toast('已撤销');
});
$('btn-save').addEventListener('click', () => {
  if (!app.game) return;
  localStorage.setItem(app.saveKey, serializeGame(app.game)); toast('已保存');
});
$('btn-restore').addEventListener('click', () => {
  const s = localStorage.getItem(app.saveKey);
  if (!s) { toast('本棋盘无存档', 1200); return; }
  try { app.game = deserializeGame(s); } catch (err) { toast(err.message, 1800); return; }
  app.selected = null; app.traySel = null; app.legal = { moves: [], attacks: [] };
  app.viewer = app.game.turn; app.replayMode = false; clearTimeout(app.aiTimer);
  setPlayActions(app.game.phase !== 'setup');
  if (app.game.phase === 'setup') app.setupSide = app.game.turn; else app.snapshots = [serializeGame(app.game)];
  if (!app.view) fitView();
  showScreen('game'); render();
  if (app.game.phase === 'playing' && isAiSide(app.game.turn)) maybeAi();
  toast('已恢复');
});
$('btn-menu').addEventListener('click', () => { clearTimeout(app.aiTimer); app.game = null; showScreen('menu'); });
$('go-restart').addEventListener('click', () => { $('gameover').classList.remove('show'); startGame(app.mode); });
$('go-menu').addEventListener('click', () => { $('gameover').classList.remove('show'); app.game = null; showScreen('menu'); });

// ---------------- 菜单 ----------------
$('btn-mode-local').addEventListener('click', () => startGame('local2p'));
$('btn-mode-ai').addEventListener('click', () => startGame('ai'));
$('btn-mode-aivsai').addEventListener('click', () => startGame('aivsai'));
$('btn-rules').addEventListener('click', () => showScreen('rules'));
$('btn-rules-back').addEventListener('click', () => showScreen('menu'));
document.querySelectorAll('#diff-row button').forEach((b) => {
  b.addEventListener('click', () => { app.aiDiff = b.dataset.diff; document.querySelectorAll('#diff-row button').forEach((x) => x.classList.toggle('on', x === b)); });
});

// ---------------- 规则说明 ----------------
function renderRules() {
  const tabs = $('rules-tabs'), grid = $('rules-grid');
  const cats = ['officer', 'weapon', 'ship', 'aircraft', 'flag'];
  let cur = 'officer';
  const draw = () => {
    tabs.innerHTML = '';
    for (const c of cats) {
      const b = document.createElement('button'); b.textContent = CAT_NAME[c];
      if (c === cur) b.classList.add('on');
      b.addEventListener('click', () => { cur = c; draw(); });
      tabs.appendChild(b);
    }
    grid.innerHTML = '';
    for (const [tid, def] of Object.entries(PIECES)) {
      if (def.category !== cur) continue;
      const card = document.createElement('div'); card.className = 'rule-card';
      const rank = def.rank != null ? ` · 等级${def.rank}` : '';
      card.innerHTML = `<span class="chip" style="background:${SVC_COLOR[SERVICE_OF(def.category)]}">${esc(ABBR[tid])}</span><b>${esc(def.name_zh)}</b>${esc(def.move_note)}<br><small style="color:#7f95a0">部署：${esc({ station: '兵站', city: '城市', anchor: '锚点', airfield: '机场' }[def.deploy_zone])}${rank}</small>`;
      grid.appendChild(card);
    }
  };
  draw();
  $('rules-note').innerHTML = `<details><summary>规则冲突与假设（${CONFLICTS.length} 冲突 / ${ASSUMPTIONS.length} 假设）</summary>`
    + `<p><b>冲突：</b>${esc(CONFLICTS.map((c) => `${c.id} ${c.topic} —— ${c.adopted}（${c.status}）`).join('；'))}</p>`
    + `<p><b>假设：</b>${esc(ASSUMPTIONS.join('；'))}</p></details>`;
}

// ---------------- 启动 ----------------
window.addEventListener('resize', () => { if (app.screen === 'game') { fitView(); applyView(); } });
showScreen('menu');
if (typeof window !== 'undefined') {
  window.__app = app;
  window.__board = BOARD;
  window.__airLines = airLines;
  window.__airLinesOf = airLinesOf;
  window.__render = render;
  window.__getLegalMoves = getLegalMoves;
  window.__getLegalAttacks = getLegalAttacks;
}

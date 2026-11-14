// 陸海空三軍棋 —— 本地雙人 Web 應用（無構建、零依賴）
import {
  createGame, deployPiece, autoDeploy, startPlaying, resign,
  undeployedPieces, getValidDeployCells, getLegalMoves, getLegalAttacks,
  movePiece, attack, getVisibleState, currentSide, winner,
  serializeGame, deserializeGame, hasAnyLegalAction,
  BOARD, PIECES, nodes, COMBAT_MATRIX, OUTCOME, CONFLICTS, ASSUMPTIONS,
} from '../src/core/index.mjs';

// ---------------- 視覺常量 ----------------
const S = 46, M = 40;
const COLS = BOARD.meta.cols, ROWS = BOARD.meta.rows;
const W = COLS * S + 2 * M, H = ROWS * S + 2 * M;
const X = (c) => M + c * S;
const Y = (r) => M + r * S;

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
const CAT_COLOR = { officer: '#9a7b3a', weapon: '#6b6b52', ship: '#2e86c1', aircraft: '#8e6bb5', flag: '#c0392b' };
const CAT_NAME = { officer: '陆军军官', weapon: '陆军武器', ship: '海军', aircraft: '空军', flag: '军旗' };
const SIDE_FILL = { red: '#c0392b', black: '#34495e' };
const NODE_COLOR = {
  station: '#efe6d2', city: '#f2c94c', camp: '#6fcf97', airfield: '#c9c9e8',
  anchor: '#7fb3d5', sea: '#a9d4ee', bridge: '#9aa0a6', bridgehead: '#d9b38c', air_dot: '#3a3a3a',
};
const SIDE_RING = { red: '#c0392b', black: '#2c3e50', sea: '#2e86c1' };
const NODE_LABEL = { city: '城', camp: '营', airfield: '场', anchor: '锚', bridge: '桥', bridgehead: '头' };

// ---------------- DOM ----------------
const $ = (id) => document.getElementById(id);
const boardEl = $('board');
const toastEl = $('toast');

// ---------------- 應用狀態 ----------------
const app = {
  screen: 'menu',            // menu | rules | game
  game: null,
  setupSide: 'red',          // 布陣方
  viewer: 'red',
  selected: null,            // 對戰選中棋子
  traySel: null,             // 布陣選中托盤棋子
  legal: { moves: [], attacks: [] },
  highlight: [],             // 臨時高亮 cell（交戰/移動動畫）
  undoSnapshot: null,
  saveKey: 'tri-service-chess-save-v1',
};

// ---------------- 工具 ----------------
function toast(msg, ms = 1400) {
  toastEl.textContent = msg;
  toastEl.classList.add('show');
  clearTimeout(toast._t);
  toast._t = setTimeout(() => toastEl.classList.remove('show'), ms);
}
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

// ---------------- 屏幕切換 ----------------
function showScreen(name) {
  app.screen = name;
  for (const id of ['screen-menu', 'screen-rules', 'screen-game']) $(id).classList.remove('active');
  $('screen-' + name).classList.add('active');
  if (name === 'rules') renderRules();
  if (name === 'game') render();
}

// ---------------- 對局流程 ----------------
function newGame() {
  app.game = createGame({ seed: (Date.now() % 1000000) });
  app.setupSide = 'red';
  app.viewer = 'red';
  app.selected = null; app.traySel = null; app.legal = { moves: [], attacks: [] };
  app.highlight = []; app.undoSnapshot = null;
  showScreen('game');
  setPlayActions(false);
  handoff('红方布阵', '请红方布置棋子，布置时请勿让黑方观看。', () => {});
}

function setPlayActions(playing) {
  $('setup-actions').style.display = playing ? 'none' : 'flex';
  $('tray').style.display = playing ? 'none' : 'flex';
  $('play-actions').style.display = playing ? 'flex' : 'none';
}

function handoff(title, msg, onConfirm) {
  $('handoff-title').textContent = title;
  $('handoff-msg').textContent = msg;
  $('handoff').classList.add('show');
  $('handoff-btn').onclick = () => {
    $('handoff').classList.remove('show');
    onConfirm();
  };
}

// ---------------- 渲染 ----------------
function render() {
  if (!app.game) return;
  const g = app.game;
  boardEl.setAttribute('viewBox', `0 0 ${W} ${H}`);
  boardEl.innerHTML = '';
  const ns = 'http://www.w3.org/2000/svg';
  const add = (tag, attrs) => {
    const el = document.createElementNS(ns, tag);
    for (const [k, v] of Object.entries(attrs)) if (v !== null && v !== undefined) el.setAttribute(k, v);
    boardEl.appendChild(el);
    return el;
  };

  // 背景：陸地暖色、海洋藍色
  add('rect', { x: 0, y: 0, width: W, height: H, fill: '#f7f3ea' });
  add('rect', { x: X(4.5), y: Y(-0.5), width: 3 * S, height: ROWS * S, fill: '#dcecf7', opacity: 0.7 });
  add('rect', { x: X(-0.5), y: Y(-0.5), width: 5 * S, height: ROWS * S, fill: '#f3e7d3', opacity: 0.55 });
  add('rect', { x: X(7.5), y: Y(-0.5), width: 5 * S, height: ROWS * S, fill: '#f3e7d3', opacity: 0.55 });

  // 邊
  const line = (a, b, color, width, dash) => {
    const na = nodes[a], nb = nodes[b];
    add('line', { x1: X(na.col), y1: Y(na.row), x2: X(nb.col), y2: Y(nb.row), stroke: color, 'stroke-width': width, ...(dash ? { 'stroke-dasharray': dash } : {}) });
  };
  for (const [a, b] of BOARD.edges.road) line(a, b, '#c3b69a', 1.6);
  for (const [a, b] of BOARD.edges.sea_line) line(a, b, '#5aa3d0', 1.6);
  for (const [a, b] of BOARD.edges.railway) line(a, b, '#5a5a5a', 4.5);
  for (const route of BOARD.edges.air) for (let i = 0; i < route.length - 1; i++) line(route[i], route[i + 1], '#e67e22', 2, '7,6');

  // 節點
  for (const [id, n] of Object.entries(nodes)) {
    add('circle', { cx: X(n.col), cy: Y(n.row), r: 13, fill: NODE_COLOR[n.type], stroke: SIDE_RING[n.side], 'stroke-width': 2.2, class: 'node', 'data-cellid': id });
    if (NODE_LABEL[n.type]) {
      const t = add('text', { x: X(n.col), y: Y(n.row) + 4, 'font-size': 11, 'text-anchor': 'middle', fill: '#444' });
      t.textContent = NODE_LABEL[n.type];
    }
  }

  // 高亮
  for (const m of app.legal.moves) {
    const n = nodes[m];
    add('circle', { cx: X(n.col), cy: Y(n.row), r: 13, fill: 'rgba(39,174,96,.18)', stroke: '#27ae60', 'stroke-width': 3.5, class: 'hl-move' });
  }
  for (const a of app.legal.attacks) {
    const n = nodes[a.targetCellId];
    add('circle', { cx: X(n.col), cy: Y(n.row), r: 13, fill: 'rgba(231,76,60,.18)', stroke: '#e74c3c', 'stroke-width': 3.5, class: 'hl-atk' });
  }
  for (const c of app.highlight) {
    const n = nodes[c];
    add('circle', { cx: X(n.col), cy: Y(n.row), r: 14, fill: 'none', stroke: '#f39c12', 'stroke-width': 3.5 });
  }

  // 棋子
  const view = getVisibleState(g, app.viewer);
  for (const p of view.pieces) {
    if (p.dead || !p.cellId) continue;
    renderPiece(p, app.viewer);
  }
  renderStats();
  renderPhase();
}

function renderPiece(p, viewer) {
  const ns = 'http://www.w3.org/2000/svg';
  const n = nodes[p.cellId];
  const cx = X(n.col), cy = Y(n.row);
  const g = document.createElementNS(ns, 'g');
  g.setAttribute('class', 'piece');
  g.setAttribute('data-pid', p.id);
  g.setAttribute('transform', `translate(${cx},${cy})`);
  const hidden = p.typeId === 'HIDDEN';
  const own = p.side === viewer;
  const fill = hidden ? '#7f8c8d' : CAT_COLOR[PIECES[p.typeId].category];
  const ring = own ? (p.side === 'red' ? '#c0392b' : '#2c3e50') : '#555';
  const mk = (tag, attrs, txt) => {
    const el = document.createElementNS(ns, tag);
    for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
    if (txt != null) el.textContent = txt;
    g.appendChild(el);
    return el;
  };
  mk('circle', { r: 13, fill, stroke: ring, 'stroke-width': 2 });
  if (hidden) {
    mk('circle', { r: 6, fill: 'none', stroke: '#fff', 'stroke-width': 1.5 });
    mk('text', { y: 4, 'font-size': 11, 'text-anchor': 'middle', fill: '#fff', 'font-weight': 'bold' }, '?');
  } else {
    mk('text', { y: 4, 'font-size': 10, 'text-anchor': 'middle', fill: '#fff', 'font-weight': '600' }, ABBR[p.typeId]);
  }
  // 軍官/艦艇加等級角標
  if (!hidden) {
    const def = PIECES[p.typeId];
    if (def.rank != null && (def.category === 'officer' || def.category === 'ship')) {
      mk('circle', { cx: 9, cy: -9, r: 6, fill: '#fff', stroke: ring, 'stroke-width': 1 });
      mk('text', { x: 9, y: -6, 'font-size': 7, 'text-anchor': 'middle', fill: '#333' }, String(def.rank));
    }
    if (p.typeId === 'flag') mk('text', { y: 5, 'font-size': 7, 'text-anchor': 'middle', fill: '#fff' }, '★');
  }
  if (p.id === app.selected) mk('circle', { r: 16, fill: 'none', stroke: '#f1c40f', 'stroke-width': 3.5 });
  boardEl.appendChild(g);
}

function renderStats() {
  const g = app.game;
  const alive = (s) => g.pieces.filter((p) => p.side === s && !p.dead && p.cellId).length;
  const shown = app.game.phase === 'finished' ? '' : `存活 红${alive('red')} : 黑${alive('black')}`;
  $('stat-pill').textContent = shown || (g.winner ? `胜方 ${g.winner === 'red' ? '红' : '黑'}` : '和棋');
}

function renderPhase() {
  const g = app.game;
  if (g.phase === 'setup') {
    $('phase-pill').textContent = '布阵';
    $('phase-pill').className = 'pill';
    $('turn-pill').textContent = app.setupSide === 'red' ? '红方布阵' : '黑方布阵';
    $('turn-pill').className = 'pill ' + app.setupSide;
    $('setup-hint').textContent = `${app.setupSide === 'red' ? '红' : '黑'}方布阵：点击托盘棋子，再点击棋盘上的合法位置（${app.setupSide === 'red' ? '红' : '黑'}色区域）`;
  } else if (g.phase === 'playing') {
    $('phase-pill').textContent = '对局';
    $('turn-pill').textContent = g.turn === 'red' ? '红方行动' : '黑方行动';
    $('turn-pill').className = 'pill ' + g.turn;
  } else {
    $('phase-pill').textContent = '结束';
    $('turn-pill').textContent = '—';
    $('turn-pill').className = 'pill';
  }
  renderTray();
}

function renderTray() {
  const g = app.game;
  const tray = $('tray');
  tray.innerHTML = '';
  if (g.phase !== 'setup') return;
  for (const p of undeployedPieces(g, app.setupSide)) {
    const d = document.createElement('div');
    d.className = 'tray-piece' + (p.id === app.traySel ? ' sel' : '');
    d.innerHTML = `<div class="chip" style="background:${CAT_COLOR[PIECES[p.typeId].category]}">${esc(ABBR[p.typeId])}</div><div class="nm">${esc(PIECES[p.typeId].name_zh)}</div>`;
    d.addEventListener('click', () => {
      app.traySel = app.traySel === p.id ? null : p.id;
      render();
    });
    tray.appendChild(d);
  }
}

// ---------------- 布陣操作 ----------------
function clearSideSetup(side) {
  const g = app.game;
  for (const p of g.pieces) {
    if (p.side === side && p.cellId) { delete g.occupancy[p.cellId]; p.cellId = null; p.dead = false; }
  }
}

$('btn-auto').addEventListener('click', () => {
  const g = app.game;
  if (g.phase !== 'setup') return;
  clearSideSetup(app.setupSide);
  for (const p of undeployedPieces(g, app.setupSide)) {
    const cells = getValidDeployCells(g, p);
    const c = cells[Math.floor(Math.random() * cells.length)];
    p.cellId = c; g.occupancy[c] = p.id;
  }
  app.traySel = null;
  render();
  toast('已自动布阵');
});

$('btn-reset-setup').addEventListener('click', () => {
  if (app.game?.phase !== 'setup') return;
  clearSideSetup(app.setupSide);
  app.traySel = null;
  render();
  toast('已重新布阵');
});

$('btn-finish-setup').addEventListener('click', () => {
  const g = app.game;
  if (g.phase !== 'setup') return;
  if (undeployedPieces(g, app.setupSide).length) { toast('仍有棋子未部署', 1600); return; }
  if (app.setupSide === 'red') {
    app.setupSide = 'black';
    app.traySel = null;
    handoff('请黑方接手', '红方已完成布阵，请黑方布置棋子。', () => { app.viewer = 'black'; render(); });
  } else {
    startPlaying(g);
    app.viewer = 'red';
    setPlayActions(true);
    app.traySel = null;
    handoff('请红方接手', '双方布阵完成，对局开始，红方先行。', () => render());
  }
});

// ---------------- 對戰操作 ----------------
boardEl.addEventListener('click', (e) => {
  if (!app.game) return;
  const g = app.game;
  if (g.phase === 'setup') return handleSetupClick(e);
  if (g.phase === 'finished') return;
  handlePlayClick(e);
});

function handleSetupClick(e) {
  const g = app.game;
  const nodeEl = e.target.closest('[data-cellid]');
  if (nodeEl && app.traySel) {
    const cellId = nodeEl.dataset.cellid;
    const p = g.piecesById[app.traySel];
    if (p && getValidDeployCells(g, p).includes(cellId)) {
      p.cellId = cellId; g.occupancy[cellId] = p.id;
      app.traySel = null;
      render();
    } else {
      toast('非法部署位置', 1200);
    }
  }
}

function handlePlayClick(e) {
  const g = app.game;
  const pieceEl = e.target.closest('[data-pid]');
  const nodeEl = e.target.closest('[data-cellid]');
  if (pieceEl) {
    const pid = pieceEl.dataset.pid;
    const piece = g.piecesById[pid];
    if (!piece) return;
    if (piece.id === app.selected) { app.selected = null; app.legal = { moves: [], attacks: [] }; render(); return; }
    if (piece.side === g.turn && !piece.dead) {
      app.selected = piece.id;
      app.legal = { moves: getLegalMoves(g, piece.id), attacks: getLegalAttacks(g, piece.id) };
      render();
      return;
    }
    if (app.selected) {
      const atk = app.legal.attacks.find((a) => a.targetPieceId === piece.id);
      if (atk) { doAttack(app.selected, piece.id); return; }
    }
    app.selected = null; app.legal = { moves: [], attacks: [] }; render(); return;
  }
  if (nodeEl && app.selected) {
    const cellId = nodeEl.dataset.cellid;
    if (app.legal.moves.includes(cellId)) { doMove(app.selected, cellId); return; }
  }
  app.selected = null; app.legal = { moves: [], attacks: [] }; render();
}

function doMove(pieceId, cellId) {
  const g = app.game;
  app.undoSnapshot = serializeGame(g);   // 僅移動可撤銷
  try {
    movePiece(g, pieceId, cellId);
  } catch (err) { toast(err.message, 1500); return; }
  const hist = g.history[g.history.length - 1];
  if (hist.intercepted) {
    const p = g.piecesById[pieceId];
    toast(`${p.side === 'red' ? '红' : '黑'}方 ${ABBR[p.typeId]} 被防空火力击落！`, 1800);
  } else {
    toast('移动');
  }
  app.selected = null; app.legal = { moves: [], attacks: [] };
  app.highlight = [cellId];                 // 移動落點反饋
  afterAction();
}

function doAttack(attackerId, targetId) {
  const g = app.game;
  const atk = g.piecesById[attackerId];
  const def = g.piecesById[targetId];
  app.undoSnapshot = null;               // 交戰/揭示不可撤銷
  const from = atk.cellId, defCell = def.cellId;
  try {
    attack(g, attackerId, targetId);
  } catch (err) { toast(err.message, 1500); return; }
  const rec = g.history[g.history.length - 1];
  app.highlight = [defCell];
  const O = OUTCOME;
  const msg = outcomeText(rec.outcome, atk, def);
  toast(msg, 2000);
  app.selected = null; app.legal = { moves: [], attacks: [] };
  afterAction();
}

function outcomeText(outcome, atk, def) {
  const O = OUTCOME;
  const A = (p) => `${p.side === 'red' ? '红' : '黑'}${ABBR[p.typeId]}`;
  switch (outcome) {
    case O.ATTACKER_WINS: return def.typeId === 'flag' ? `${A(atk)} 夺取军旗！` : `${A(atk)} 击破 ${A(def)}`;
    case O.DEFENDER_WINS: return `${A(def)} 守住了，${A(atk)} 被消灭`;
    case O.BOTH_DESTROYED: return `${A(atk)} 与 ${A(def)} 同归于尽`;
    case O.NO_RESULT: return '不分胜负';
    case O.SCOUT: return `侦察机揭示 ${A(def)} 的身份（仅己方可见）`;
    default: return '';
  }
}

function afterAction() {
  const g = app.game;
  if (g.phase === 'finished') { showGameOver(); return; }
  // 輪到另一方：全屏交接
  const next = g.turn;
  app.viewer = next;
  render();
  handoff(`请${next === 'red' ? '红' : '黑'}方接手`, '请确认接手后查看己方视角。', () => { app.viewer = next; render(); });
}

function showGameOver() {
  const g = app.game;
  $('go-title').textContent = g.winner ? `${g.winner === 'red' ? '红' : '黑'}方获胜` : '和棋';
  const reason = { flag_captured: '军旗被夺取', stalemate: '无子可动（僵局）', repetition: '重复局面三次', resign: '一方认输' }[g.endReason] || '对局结束';
  $('go-msg').textContent = `结束原因：${reason} · 共 ${g.ply} 回合`;
  $('gameover').classList.add('show');
  render();
}

// ---------------- 認輸 / 存檔 / 恢復 / 撤銷 ----------------
$('btn-resign').addEventListener('click', () => {
  const g = app.game;
  if (!g || g.phase !== 'playing') return;
  resign(g, g.turn);
  showGameOver();
});
$('btn-undo').addEventListener('click', () => {
  if (!app.undoSnapshot) { toast('仅可撤销上一步移动（交战/侦察后不可撤销）', 1800); return; }
  app.game = deserializeGame(app.undoSnapshot);
  app.undoSnapshot = null;
  app.selected = null; app.legal = { moves: [], attacks: [] };
  render();
  toast('已撤销');
});
$('btn-save').addEventListener('click', () => {
  if (!app.game) return;
  localStorage.setItem(app.saveKey, serializeGame(app.game));
  toast('已保存');
});
$('btn-restore').addEventListener('click', () => {
  const s = localStorage.getItem(app.saveKey);
  if (!s) { toast('无存档', 1200); return; }
  app.game = deserializeGame(s);
  app.selected = null; app.traySel = null; app.legal = { moves: [], attacks: [] };
  app.viewer = app.game.turn;
  setPlayActions(app.game.phase === 'playing');
  showScreen('game');
  render();
  toast('已恢复');
});
$('btn-menu').addEventListener('click', () => { app.game = null; showScreen('menu'); });
$('go-restart').addEventListener('click', () => { $('gameover').classList.remove('show'); newGame(); });
$('go-menu').addEventListener('click', () => { $('gameover').classList.remove('show'); app.game = null; showScreen('menu'); });

// ---------------- 菜單 ----------------
$('btn-start').addEventListener('click', newGame);
$('btn-rules').addEventListener('click', () => showScreen('rules'));
$('btn-rules-back').addEventListener('click', () => showScreen('menu'));

// ---------------- 規則說明 ----------------
function renderRules() {
  const tabs = $('rules-tabs');
  tabs.innerHTML = '';
  const grid = $('rules-grid');
  const cats = ['officer', 'weapon', 'ship', 'aircraft', 'flag'];
  let cur = 'officer';
  const draw = () => {
    tabs.innerHTML = '';
    for (const c of cats) {
      const b = document.createElement('button');
      b.textContent = CAT_NAME[c];
      if (c === cur) b.classList.add('on');
      b.addEventListener('click', () => { cur = c; draw(); });
      tabs.appendChild(b);
    }
    grid.innerHTML = '';
    for (const [tid, def] of Object.entries(PIECES)) {
      if (def.category !== cur) continue;
      const card = document.createElement('div');
      card.className = 'rule-card';
      const rank = def.rank != null ? ` · 等级${def.rank}` : '';
      card.innerHTML = `<span class="chip" style="background:${CAT_COLOR[def.category]}">${esc(ABBR[tid])}</span><b>${esc(def.name_zh)}</b>${esc(def.move_note)}<br><small style="color:#888">部署：${esc({ station: '兵站', city: '城市', anchor: '锚点', airfield: '机场' }[def.deploy_zone])}${rank}</small>`;
      grid.appendChild(card);
    }
  };
  draw();
  $('rules-note').innerHTML = `<details><summary>规则冲突与假设（${CONFLICTS.length} 冲突 / ${ASSUMPTIONS.length} 假设）</summary>`
    + `<p><b>冲突：</b>${esc(CONFLICTS.map((c) => `${c.id} ${c.topic} —— ${c.adopted}（${c.status}）`).join('；'))}</p>`
    + `<p><b>假设：</b>${esc(ASSUMPTIONS.join('；'))}</p></details>`;
}

// 啟動
showScreen('menu');

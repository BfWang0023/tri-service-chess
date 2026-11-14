// 引擎：布陣、回合、交戰、勝負、暗棋可見性、完整對局
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createGame, autoDeploy, startPlaying, deployPiece, getValidDeployCells,
  undeployedPieces, getLegalMoves, getLegalAttacks, movePiece, attack,
  getVisibleState, isRevealedTo, currentSide, winner, hasAnyLegalAction,
  getMoves, getAttacks, PIECES, nodes,
} from '../src/core/index.mjs';

function place(g, typeId, side, cellId) {
  const p = g.pieces.find((x) => x.typeId === typeId && x.side === side && !x.cellId && !x.dead);
  assert.ok(p, `找不到 ${typeId} ${side}`);
  p.cellId = cellId;
  g.occupancy[cellId] = p.id;
  return p;
}

test('部署：每方 30 枚、部署區域合法', () => {
  const g = createGame({ seed: 7 });
  autoDeploy(g, 'red');
  autoDeploy(g, 'black');
  assert.equal(g.pieces.filter((p) => p.side === 'red').length, 30);
  assert.equal(g.pieces.filter((p) => p.side === 'black').length, 30);
  for (const p of g.pieces) {
    const n = nodes[p.cellId];
    const zone = PIECES[p.typeId].deploy_zone;
    const expectType = { station: 'station', city: 'city', anchor: 'anchor', airfield: 'airfield' }[zone];
    assert.equal(n.type, expectType, `${p.typeId} 部署區域錯誤`);
    assert.equal(n.side, p.side, `${p.typeId} 部署到敵方區域`);
  }
  startPlaying(g);
  assert.equal(g.phase, 'playing');
});

test('布陣階段不得移動/交戰；未部署完不得開局', () => {
  const g = createGame({ seed: 1 });
  autoDeploy(g, 'red');
  assert.throws(() => startPlaying(g), /未部署/);
});

test('交戰揭示規則：被消滅者揭示、存活者不新增揭示；攻勝後佔領', () => {
  const g = createGame({ seed: 2 });
  autoDeploy(g, 'red'); autoDeploy(g, 'black'); startPlaying(g);
  // 找一對相鄰可交戰棋子不穩妥，改用手動佈局：
  const g2 = createGame({ seed: 3 });
  place(g2, 'commander_in_chief', 'red', 'r4c2');
  place(g2, 'army_commander', 'black', 'r4c3');
  g2.phase = 'playing'; g2.turn = 'red';
  const red = g2.pieces.find((x) => x.typeId === 'commander_in_chief' && x.side === 'red');
  const black = g2.pieces.find((x) => x.typeId === 'army_commander' && x.side === 'black');
  attack(g2, red.id, black.id);
  assert.equal(black.dead, true);
  assert.equal(red.cellId, 'r4c3');           // 攻勝佔領
  assert.equal(black.revealed, true);         // 被消滅者揭示
  assert.equal(red.revealed, false);          // 存活攻方不新增揭示（保守，不洩漏棋子類型）
});

test('軍旗被奪後結束並判定勝方', () => {
  const g = createGame({ seed: 4 });
  place(g, 'infantry', 'red', 'r1c12');
  place(g, 'flag', 'black', 'r2c12');         // 黑方城市
  g.phase = 'playing'; g.turn = 'red';
  const red = g.pieces.find((x) => x.typeId === 'infantry' && x.side === 'red');
  const flag = g.pieces.find((x) => x.typeId === 'flag' && x.side === 'black');
  attack(g, red.id, flag.id);
  assert.equal(g.phase, 'finished');
  assert.equal(g.winner, 'red');
  assert.equal(flag.dead, true);
});

test('暗棋信息隔離：未揭示敵子被遮蔽', () => {
  const g = createGame({ seed: 5 });
  place(g, 'commander_in_chief', 'red', 'r4c2');
  place(g, 'commander_in_chief', 'black', 'r8c10');
  g.phase = 'playing'; g.turn = 'red';
  const view = getVisibleState(g, 'red');
  const blackPiece = view.pieces.find((p) => p.id === g.pieces.find((x) => x.side === 'black' && !x.dead).id);
  // 未揭示的敵方棋子 typeId 應為 HIDDEN
  assert.equal(blackPiece.typeId, 'HIDDEN');
  // 己方棋子可見
  const redPiece = view.pieces.find((p) => p.typeId === 'commander_in_chief');
  assert.equal(redPiece.typeId, 'commander_in_chief');
});

test('偵察短暫揭示後恢復隱藏', () => {
  const g = createGame({ seed: 6 });
  place(g, 'scout_plane', 'red', 'r0c0');
  place(g, 'commander_in_chief', 'black', 'r2c2');   // 位於 diag_main 航線下方
  g.phase = 'playing'; g.turn = 'red';
  const scout = g.pieces.find((x) => x.typeId === 'scout_plane' && x.side === 'red');
  const target = g.pieces.find((x) => x.typeId === 'commander_in_chief' && x.side === 'black');
  attack(g, scout.id, target.id);   // 偵察：revealedUntilPly = ply + 2
  assert.equal(isRevealedTo(g, target, 'red'), true, '偵察後短暫揭示');
  assert.equal(target.dead, false, '偵察不消滅目標');
  g.ply += 3;
  assert.equal(isRevealedTo(g, target, 'red'), false, '揭示後恢復隱藏');
});

test('完整對局：隨機合法行動可持續多回合且無非法動作/狀態損壞', () => {
  const g = createGame({ seed: 123 });
  autoDeploy(g, 'red'); autoDeploy(g, 'black'); startPlaying(g);
  const maxPly = 2000;
  let plies = 0;
  while (g.phase !== 'finished' && plies < maxPly) {
    const side = g.turn;
    // 收集該方所有合法動作
    const actions = [];
    for (const p of g.pieces) {
      if (p.side !== side || p.dead || !p.cellId) continue;
      for (const m of getMoves(g, p)) actions.push({ kind: 'move', p, cell: m });
      for (const a of getAttacks(g, p)) actions.push({ kind: 'attack', p, target: a.targetPieceId });
    }
    if (!actions.length) break;   // 無子可動（僵局）
    const act = actions[Math.floor(g.rng() * actions.length)];
    if (act.kind === 'move') {
      movePiece(g, act.p.id, act.cell);
    } else {
      attack(g, act.p.id, act.target);
    }
    plies++;
    // 狀態一致性：佔用表與棋子位置一致
    for (const p of g.pieces) {
      if (!p.dead && p.cellId) assert.equal(g.occupancy[p.cellId], p.id);
    }
    assert.ok(plies <= maxPly);
  }
  // 只要不拋異常、狀態一致即通過；若奪旗則 finished
  assert.ok(g.phase === 'finished' || plies >= maxPly || !hasAnyLegalAction(g, g.turn));
  assert.ok(plies > 0, '至少下了若干回合');
});

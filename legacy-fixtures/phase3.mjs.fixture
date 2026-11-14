// 第三階段驗收測試：登陸、認輸、僵局、重複局面、存檔、揭示規則、炮艦vs炮壘、防空攔截、偵察
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createGame, autoDeploy, startPlaying, resign, movePiece, attack,
  getMoves, getAttacks, getVisibleState, isRevealedTo, hasAnyLegalAction,
  serializeGame, deserializeGame, resolve, PIECES, nodes,
} from '../src/core/index.mjs';

function place(g, typeId, side, cellId) {
  const p = g.pieces.find((x) => x.typeId === typeId && x.side === side && !x.cellId && !x.dead);
  assert.ok(p, `找不到 ${typeId} ${side}`);
  p.cellId = cellId; g.occupancy[cellId] = p.id; return p;
}

test('主力艦登陸：攻勝後上岸、標記 landed、改按陸軍移動', () => {
  const g = createGame({ seed: 11 });
  place(g, 'battleship', 'red', 'r3c7');      // 海面，鄰近黑方陸地 r3c8
  place(g, 'infantry', 'black', 'r3c8');
  g.phase = 'playing'; g.turn = 'red';
  const bs = g.pieces.find((x) => x.typeId === 'battleship' && x.side === 'red');
  const inf = g.pieces.find((x) => x.typeId === 'infantry' && x.side === 'black');
  assert.ok(getAttacks(g, bs).some((a) => a.targetPieceId === inf.id));
  attack(g, bs.id, inf.id);
  assert.equal(bs.landed, true, '登陸後應標記 landed');
  assert.equal(bs.cellId, 'r3c8', '登陸上岸');
  const moves = getMoves(g, bs);
  assert.ok(moves.includes('r3c9'), '登陸後按陸軍沿公路移動');
});

test('炮艦炮轟炮壘：守方勝且炮艦不移動（不登陸）', () => {
  const g = createGame({ seed: 12 });
  place(g, 'gunboat', 'red', 'r3c7');
  place(g, 'fort', 'black', 'r3c8');
  g.phase = 'playing'; g.turn = 'red';
  const gb = g.pieces.find((x) => x.typeId === 'gunboat' && x.side === 'red');
  const ft = g.pieces.find((x) => x.typeId === 'fort' && x.side === 'black');
  const atk = getAttacks(g, gb).find((a) => a.targetPieceId === ft.id);
  assert.ok(atk, '炮艦應能炮轟炮壘');
  assert.equal(atk.outcome, 'defender_wins', '炮壘勝（D1 採用）');
  attack(g, gb.id, ft.id);
  assert.equal(gb.dead, true, '炮艦被消滅');
  assert.equal(gb.cellId, null);
  assert.equal(ft.dead, false, '炮壘存活');
});

test('防空攔截：飛機沿航線飛越射程 2 內高射炮被擊落', () => {
  const g = createGame({ seed: 13 });
  place(g, 'fighter', 'red', 'r0c0');
  place(g, 'anti_aircraft_gun', 'black', 'r8c9');  // 位於 diag_main 航線上
  g.phase = 'playing'; g.turn = 'red';
  const f = g.pieces.find((x) => x.typeId === 'fighter' && x.side === 'red');
  movePiece(g, f.id, 'r10c12');                    // 沿對角航線飛越
  assert.equal(f.dead, true, '飛機被防空火力擊落');
});

test('偵察機：揭示目標身份僅短暫、自身不新增揭示', () => {
  const g = createGame({ seed: 14 });
  place(g, 'scout_plane', 'red', 'r0c0');
  place(g, 'commander_in_chief', 'black', 'r2c2'); // 航線下方
  g.phase = 'playing'; g.turn = 'red';
  const s = g.pieces.find((x) => x.typeId === 'scout_plane' && x.side === 'red');
  const t = g.pieces.find((x) => x.typeId === 'commander_in_chief' && x.side === 'black');
  attack(g, s.id, t.id);
  assert.equal(t.revealed, false, '被偵察者不永久揭示');
  assert.equal(t.revealedUntilPly, g.ply + 1, '短暫揭示');
  assert.equal(s.revealed, false, '偵察機自身不新增揭示');
});

test('認輸：對方獲勝', () => {
  const g = createGame({ seed: 15 });
  autoDeploy(g, 'red'); autoDeploy(g, 'black'); startPlaying(g);
  resign(g, 'red');
  assert.equal(g.phase, 'finished');
  assert.equal(g.winner, 'black');
  assert.equal(g.endReason, 'resign');
});

test('僵局：無合法動作判和', () => {
  const g = createGame({ seed: 16 });
  // 構造：紅方只剩一枚不可動的軍旗在機場外、且無任何可動棋子
  for (const p of g.pieces) { if (p.cellId) { delete g.occupancy[p.cellId]; p.cellId = null; p.dead = true; } }
  place(g, 'flag', 'red', 'r2c0');
  place(g, 'flag', 'black', 'r2c12');
  place(g, 'infantry', 'black', 'r4c10');  // 黑方仍可動
  g.phase = 'playing'; g.turn = 'red';
  assert.equal(hasAnyLegalAction(g, 'red'), false, '紅方無合法動作');
});

test('存檔/恢復往返一致', () => {
  const g = createGame({ seed: 17 });
  autoDeploy(g, 'red'); autoDeploy(g, 'black'); startPlaying(g);
  const json = serializeGame(g);
  const g2 = deserializeGame(json);
  assert.equal(g2.phase, g.phase);
  assert.equal(g2.ply, g.ply);
  assert.equal(g2.pieces.length, g.pieces.length);
  assert.deepEqual(g2.occupancy, g.occupancy);
  for (const p of g2.pieces) assert.equal(g2.piecesById[p.id].typeId, p.typeId);
});

test('重複局面三次判和（項目約定）', () => {
  const g = createGame({ seed: 18 });
  place(g, 'infantry', 'red', 'r4c2');
  place(g, 'infantry', 'black', 'r8c10');
  g.phase = 'playing'; g.turn = 'red';
  const red = g.pieces.find((x) => x.typeId === 'infantry' && x.side === 'red');
  const black = g.pieces.find((x) => x.typeId === 'infantry' && x.side === 'black');
  // 4 ply 完整循環：紅 r4c2↔r4c3、黑 r8c10↔r8c9，重複 3 次回到原位
  const fullCycle = () => {
    if (g.phase === 'finished') return;
    movePiece(g, red.id, red.cellId === 'r4c2' ? 'r4c3' : 'r4c2');
    if (g.phase === 'finished') return;
    movePiece(g, black.id, black.cellId === 'r8c10' ? 'r8c9' : 'r8c10');
    if (g.phase === 'finished') return;
    movePiece(g, red.id, red.cellId === 'r4c2' ? 'r4c3' : 'r4c2');
    if (g.phase === 'finished') return;
    movePiece(g, black.id, black.cellId === 'r8c10' ? 'r8c9' : 'r8c10');
  };
  for (let i = 0; i < 3 && g.phase !== 'finished'; i++) fullCycle();
  assert.equal(g.phase, 'finished');
  assert.equal(g.endReason, 'repetition');
  assert.equal(g.winner, null);
});

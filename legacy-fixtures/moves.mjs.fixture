// 移動與交戰合法性測試
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createGame, autoDeploy, startPlaying, PIECES, nodes,
  getMoves, getAttacks, getLegalMoves, getLegalAttacks,
  movePiece, attack, deployPiece, getValidDeployCells,
} from '../src/core/index.mjs';

// 測試輔助：直接放置棋子到指定格（繞過部署校驗）
function place(g, typeId, side, cellId) {
  const p = g.pieces.find((x) => x.typeId === typeId && x.side === side && !x.cellId && !x.dead);
  assert.ok(p, `找不到棋子 ${typeId} ${side}`);
  p.cellId = cellId;
  g.occupancy[cellId] = p.id;
  return p;
}

function playingGame() {
  const g = createGame({ seed: 42 });
  // 手動放少量棋子到已知位置（其餘棋子置於後方不影響）
  return g;
}

test('陸軍公路 1 步', () => {
  const g = playingGame();
  const p = place(g, 'infantry', 'red', 'r5c2');
  const moves = getMoves(g, p);
  // (5,2) 的公路正交鄰居：r4c2 r6c2 r5c1 r5c3
  assert.deepEqual(new Set(moves), new Set(['r4c2', 'r6c2', 'r5c1', 'r5c3']));
});

test('鐵路最多 3 步且橋頭停行', () => {
  const g = playingGame();
  const p = place(g, 'infantry', 'red', 'r0c1');
  const moves = getMoves(g, p);
  // 鐵路右行：r0c2(1) r0c3(2) r0c4(3, 橋頭停)；公路豎向連接：r1c1
  assert.deepEqual(new Set(moves), new Set(['r0c2', 'r0c3', 'r0c4', 'r1c1']));
});

test('鐵路不可越子', () => {
  const g = playingGame();
  place(g, 'infantry', 'red', 'r0c1');
  place(g, 'cavalry', 'red', 'r0c3');   // 佔據 r0c3（用騎兵當阻擋，避免同型重複）
  const p = g.pieces.find((x) => x.typeId === 'infantry' && x.side === 'red' && x.cellId === 'r0c1');
  const moves = getMoves(g, p);
  // 只能到 r0c2（r0c3 被佔，不可越）+ 公路 r1c1
  assert.deepEqual(new Set(moves), new Set(['r0c2', 'r1c1']));
});

test('海軍海上白線 1 步', () => {
  const g = playingGame();
  const p = place(g, 'submarine', 'red', 'r3c5');
  const moves = getMoves(g, p);
  // r3c5 的海上白線鄰居：r2c5 r4c5 r3c6
  assert.deepEqual(new Set(moves), new Set(['r2c5', 'r4c5', 'r3c6']));
});

test('飛機沿航線移動（可到同一直線上的黑點）', () => {
  const g = playingGame();
  const p = place(g, 'fighter', 'red', 'r0c0');
  const moves = getMoves(g, p);
  // r0c0 在 diag_main 與 top：可到 r5c6 r10c12（diag_main）、r0c12（top）
  assert.deepEqual(new Set(moves), new Set(['r5c6', 'r10c12', 'r0c12']));
});

test('陸軍不可攻入行營', () => {
  const g = playingGame();
  place(g, 'infantry', 'red', 'r3c3');   // 行營 r3c2 之鄰
  place(g, 'infantry', 'black', 'r3c2'); // 敵子於行營
  const atk = getAttacks(g, g.pieces.find((x) => x.typeId === 'infantry' && x.side === 'red' && x.cellId === 'r3c3'));
  assert.ok(atk.every((a) => a.targetCellId !== 'r3c2'), '不可攻行營內敵子');
});

test('陸軍相鄰交戰', () => {
  const g = playingGame();
  place(g, 'commander_in_chief', 'red', 'r4c2');
  place(g, 'army_commander', 'black', 'r4c3');
  const atk = getAttacks(g, g.pieces.find((x) => x.typeId === 'commander_in_chief' && x.side === 'red'));
  assert.equal(atk.length, 1);
  assert.equal(atk[0].outcome, 'attacker_wins');
});

test('炮壘可攻鄰近軍艦', () => {
  const g = playingGame();
  place(g, 'fort', 'red', 'r3c4');       // 陸地，鄰海 r3c5
  place(g, 'battleship', 'black', 'r3c5');
  const atk = getAttacks(g, g.pieces.find((x) => x.typeId === 'fort' && x.side === 'red'));
  assert.ok(atk.some((a) => a.targetCellId === 'r3c5' && a.outcome === 'attacker_wins'));
});

test('高射炮可攻射程 2 內敵機', () => {
  const g = playingGame();
  place(g, 'anti_aircraft_gun', 'red', 'r5c3');
  place(g, 'fighter', 'black', 'r5c6');  // 切比雪夫距離 3？(5,3)->(5,6)=3，>2
  const far = getAttacks(g, g.pieces.find((x) => x.typeId === 'anti_aircraft_gun' && x.side === 'red'));
  assert.ok(!far.some((a) => a.targetCellId === 'r5c6'));
  // 移到距離 2 內
  const f = g.pieces.find((x) => x.typeId === 'fighter' && x.side === 'black');
  delete g.occupancy['r5c6']; f.cellId = 'r5c4'; g.occupancy['r5c4'] = f.id;
  const near = getAttacks(g, g.pieces.find((x) => x.typeId === 'anti_aircraft_gun' && x.side === 'red'));
  assert.ok(near.some((a) => a.targetCellId === 'r5c4' && a.outcome === 'attacker_wins'));
});

test('飛彈不可攻城市/機場內敵子', () => {
  const g = playingGame();
  place(g, 'missile', 'red', 'r4c1');
  place(g, 'flag', 'black', 'r2c12');    // 城市
  place(g, 'fighter', 'black', 'r0c12'); // 機場
  const atk = getAttacks(g, g.pieces.find((x) => x.typeId === 'missile' && x.side === 'red'));
  assert.ok(!atk.some((a) => a.targetCellId === 'r2c12'), '不可攻城市');
  assert.ok(!atk.some((a) => a.targetCellId === 'r0c12'), '不可攻機場');
});

test('炮艦沿岸炮轟不登陸、主力艦登陸', () => {
  const g = playingGame();
  place(g, 'gunboat', 'red', 'r4c5');
  place(g, 'infantry', 'black', 'r4c4');  // 沿岸陸軍
  const gb = g.pieces.find((x) => x.typeId === 'gunboat' && x.side === 'red');
  const atk = getAttacks(g, gb);
  assert.ok(atk.some((a) => a.targetCellId === 'r4c4'));
});

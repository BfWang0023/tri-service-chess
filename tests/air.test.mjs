// 航空系统专项测试（第四阶段验收点）
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  BOARD, PIECES, createGame, autoDeploy, startPlaying, movePiece, attack,
  getMoves, getAttacks, getLegalMoves, getLegalAttacks, isRevealedTo,
} from '../src/core/index.mjs';
import { chooseAction } from '../src/core/ai.mjs';

const find = (s, t, side) => s.pieces.find((p) => p.typeId === t && p.side === side);
function pos(items, turn = 'red') {
  const s = createGame({ seed: 1 }); s.phase = 'playing'; s.turn = turn;
  for (const p of s.pieces) { p.dead = true; if (p.cellId) { delete s.occupancy[p.cellId]; p.cellId = null; } }
  for (const [type, side, cell] of items) { const p = find(s, type, side); p.dead = false; p.cellId = cell; s.occupancy[cell] = p.id; }
  return s;
}
const movesOf = (s, type, side) => getMoves(s, find(s, type, side));
const atksOf = (s, type, side) => getAttacks(s, find(s, type, side));

// 1) 四座机场均能起飞
test('四座机场均可起飞', () => {
  for (const af of ['FNW', 'FNE', 'FSW', 'FSE']) {
    const s = pos([['fighter', 'red', af]]);
    const mv = movesOf(s, 'fighter', 'red');
    assert.ok(mv.length > 0, `${af} 无合法起飞点`);
  }
});

// 2) 合法海上直线航段连续飞行（H1 横贯海面）
test('海上直线航段可远距连续飞行', () => {
  const s = pos([['fighter', 'red', 'AW1']]);
  const mv = movesOf(s, 'fighter', 'red');
  assert.ok(mv.includes('AE1'), '应能从 AW1 直飞 AE1');
  assert.ok(mv.includes('A1-6'), '应能到达中间黑点');
});

// 3) 黑点转向：A0-1 同时属于 H0 与 V1.1
test('黑点处可向另一航線转向', () => {
  const s = pos([['fighter', 'red', 'A0-1']]);
  const mv = movesOf(s, 'fighter', 'red');
  assert.ok(mv.includes('A1-1'), '应可沿 V1.1 转向下行');
  assert.ok(mv.includes('A0-2'), '应可沿 H0 转向右行');
});

// 4) 断开航段不得凭空越过（列 1 在行 2-3 之间无竖向航段）
test('断开航段不可凭空越过', () => {
  const s = pos([['fighter', 'red', 'A3-1']]);
  const mv = movesOf(s, 'fighter', 'red');
  assert.ok(!mv.includes('A2-1'), 'A3-1 不应到 A2-1（竖向断开）');
  assert.ok(!mv.includes('A4-1'), 'A3-1 不应到 A4-1（竖向断开）');
  assert.ok(mv.includes('A3-2'), '同横向航線 H3.1 可飞');
});

// 5) 陆海军棋子不阻挡航空移动
test('陆海军棋子不错误阻挡航空移动', () => {
  const s = pos([['fighter', 'red', 'AW1'], ['infantry', 'black', 'N4-1'], ['destroyer', 'black', 'M4-1']]);
  const mv = movesOf(s, 'fighter', 'red');
  assert.ok(mv.includes('AE1'), '地面/海面棋子不应阻断飞行');
});

// 6) 战斗机可击败侦察机
test('战斗机可以击败侦察机', () => {
  const s = pos([['fighter', 'red', 'A1-3'], ['scout_plane', 'black', 'A1-2']]);
  const atk = atksOf(s, 'fighter', 'red');
  const target = atk.find((a) => a.targetPieceId === find(s, 'scout_plane', 'black').id);
  assert.ok(target, '战斗机应能识别同航線侦察机为攻击目标');
  assert.equal(target.outcome, 'attacker_wins');
  const f = find(s, 'fighter', 'red'), sc = find(s, 'scout_plane', 'black');
  attack(s, f.id, sc.id);
  assert.equal(sc.dead, true, '侦察机应被消灭');
  assert.equal(f.dead, false, '战斗机存活');
});

// 7) 侦察机不能击败战斗机
test('侦察机不能击败战斗机', () => {
  const s = pos([['scout_plane', 'red', 'A1-3'], ['fighter', 'black', 'A1-2']]);
  const atk = atksOf(s, 'scout_plane', 'red');
  const t = atk.find((a) => a.targetPieceId === find(s, 'fighter', 'black').id);
  assert.ok(t, '侦察机应识别敌方战斗机');
  assert.equal(t.outcome, 'defender_wins', '侦察机攻战斗机应失败');
});

// 8) 高射炮仍可拦截飞机
test('高射炮可拦截飞越飞机', () => {
  // A2-2 -> A5-2 沿 V2，航段 A2-2~A3-2 的飞越投影目标为 N5-2（陆）
  const s = pos([['fighter', 'red', 'A2-2'], ['anti_aircraft_gun', 'black', 'N5-2']]);
  movePiece(s, find(s, 'fighter', 'red').id, 'A5-2');
  assert.equal(find(s, 'fighter', 'red').dead, true, '飞机应被高射炮拦截击落');
});

// 9) 炮舰仍可执行防空
test('炮舰可执行防空拦截', () => {
  // A2-2 -> A5-2 航段 A3-2~A4-2 的飞越投影含 M3-1（海）
  const s = pos([['fighter', 'red', 'A2-2'], ['gunboat', 'black', 'M3-1']]);
  movePiece(s, find(s, 'fighter', 'red').id, 'A5-2');
  assert.equal(find(s, 'fighter', 'red').dead, true, '飞机应被炮舰防空击落');
});

// 10) 飞机攻击/侦察不破坏暗棋
test('战斗机攻击侦察机遵循揭示规则', () => {
  const s = pos([['fighter', 'red', 'A1-3'], ['scout_plane', 'black', 'A1-2']]);
  const f = find(s, 'fighter', 'red'), sc = find(s, 'scout_plane', 'black');
  attack(s, f.id, sc.id);
  // 被消灭者揭示，存活方不新增揭示
  assert.equal(sc.revealed, true, '被消灭侦察机揭示');
  assert.equal(f.revealed, false, '存活战斗机不新增揭示');
});

// 11) AI 可生成合法空军动作
test('AI 可生成合法空军行动', () => {
  const g = createGame({ seed: 5 });
  autoDeploy(g, 'red'); autoDeploy(g, 'black'); startPlaying(g);
  let found = 0;
  for (let i = 0; i < 6 && g.phase === 'playing'; i++) {
    const side = g.turn;
    const act = chooseAction(g, side, 'normal');
    assert.ok(act);
    if (act.kind === 'move') movePiece(g, act.pieceId, act.to);
    else attack(g, act.pieceId, act.targetId);
    // 找一个空中棋子是否有动作
    for (const p of g.pieces) {
      if (p.dead || !p.cellId) continue;
      const n = BOARD.nodes[p.cellId];
      if (n && (n.type === 'airfield' || n.type === 'air_dot')) {
        if (getMoves(g, p).length || getAttacks(g, p).length) found++;
      }
    }
  }
  assert.ok(found > 0, 'AI 应能对空军棋子生成动作');
});

// 12) 第 3/4 行与西/东边缘空点的水平航段已补齐（v2.0.0 遗漏补丁）
test('第3/4行西东边缘水平航段已补齐', () => {
  const pairs = [['A3-1', 'AW3'], ['A3-6', 'AE3'], ['A4-1', 'AW5'], ['A4-6', 'AE5']];
  for (const [a, b] of pairs) {
    for (const [from, to] of [[a, b], [b, a]]) {
      const s = pos([['fighter', 'red', from]]);
      assert.ok(movesOf(s, 'fighter', 'red').includes(to), `${from} 应可飞至 ${to}`);
    }
  }
});

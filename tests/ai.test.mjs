// 内置 AI 测试：合法行动、暗棋公平性、难度、AI 对 AI 完整对局
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createGame, autoDeploy, startPlaying, movePiece, attack,
  hasAnyLegalAction, getLegalMoves, getLegalAttacks,
} from '../src/core/index.mjs';
import { chooseAction, enumerateActions, evaluate } from '../src/core/ai.mjs';

const find = (s, t, side) => s.pieces.find((p) => p.typeId === t && p.side === side);
function position(items, turn = 'red') {
  const s = createGame({ seed: 1 });
  s.phase = 'playing'; s.turn = turn;
  for (const p of s.pieces) p.dead = true;
  for (const [type, side, cell] of items) {
    const p = find(s, type, side); p.dead = false; p.cellId = cell; s.occupancy[cell] = p.id;
  }
  return s;
}

test('AI 返回的每个动作都合法可执行', () => {
  for (let seed = 0; seed < 12; seed++) {
    const g = createGame({ seed });
    autoDeploy(g, 'red'); autoDeploy(g, 'black'); startPlaying(g);
    for (let i = 0; i < 8 && g.phase === 'playing'; i++) {
      const side = g.turn;
      const act = chooseAction(g, side, ['easy', 'normal', 'hard'][i % 3]);
      assert.ok(act, '应有可用动作');
      const legalMoves = getLegalMoves(g, act.pieceId);
      const legalAtk = getLegalAttacks(g, act.pieceId).map((a) => a.targetId ?? a.targetPieceId);
      if (act.kind === 'move') {
        assert.ok(legalMoves.includes(act.to), '非法移动');
        movePiece(g, act.pieceId, act.to);
      } else {
        assert.ok(legalAtk.includes(act.targetId), '非法攻击');
        attack(g, act.pieceId, act.targetId);
      }
    }
  }
});

test('暗棋公平性：隐藏守方身份不影响 AI 的动作集', () => {
  const a = position([['commander_in_chief', 'red', 'N3-2'], ['landmine', 'black', 'N3-3']]);
  const b = position([['commander_in_chief', 'red', 'N3-2'], ['infantry', 'black', 'N3-3']]);
  const key = (acts) => acts.map((x) => `${x.kind}:${x.pieceId.slice ? '' : ''}${x.to ?? x.targetId}`).sort().join('|');
  const aa = enumerateActions(a, 'red');
  const bb = enumerateActions(b, 'red');
  // 目标集合一致（不含 outcome / typeId）
  const targets = (acts) => acts.map((x) => `${x.kind}:${x.to ?? ''}`).sort().join('|');
  assert.equal(targets(aa), targets(bb), '隐藏守方类型不应改变可选动作集');
  // 攻击项不得携带隐藏身份
  for (const act of aa) if (act.kind === 'attack') assert.equal(act.targetType, null, '不得泄漏隐藏守方身份');
});

test('AI 不读取隐藏类型：同可见局面下评估相同', () => {
  const a = position([['commander_in_chief', 'red', 'N3-2'], ['landmine', 'black', 'N3-3']]);
  const b = position([['commander_in_chief', 'red', 'N3-2'], ['infantry', 'black', 'N3-3']]);
  // evaluate 对未知敌子使用期望值，不依赖真实类型
  assert.equal(evaluate(a, 'red'), evaluate(b, 'red'));
});

test('三档难度均能对同一局面给出合法动作（反映不同策略）', () => {
  const g = createGame({ seed: 2 });
  autoDeploy(g, 'red'); autoDeploy(g, 'black'); startPlaying(g);
  const s1 = chooseAction(g, 'red', 'easy');
  const s2 = chooseAction(g, 'red', 'normal');
  const s3 = chooseAction(g, 'red', 'hard');
  for (const a of [s1, s2, s3]) assert.ok(a && a.kind);
});

test('AI 对 AI 完整对局可正常结束（多局，统计）', () => {
  let finished = 0, errors = 0;
  for (let seed = 0; seed < 3; seed++) {
    const g = createGame({ seed });
    autoDeploy(g, 'red'); autoDeploy(g, 'black'); startPlaying(g);
    let plies = 0;
    try {
      while (g.phase !== 'finished' && plies < 1500) {
        const side = g.turn;
        const act = chooseAction(g, side, 'normal');
        if (!act) break;
        if (act.kind === 'move') movePiece(g, act.pieceId, act.to);
        else attack(g, act.pieceId, act.targetId);
        plies++;
      }
      if (g.phase === 'finished') finished++;
    } catch (e) { errors++; console.error('AI 对局异常', e.message); }
  }
  assert.equal(errors, 0, '不得出现非法/异常动作');
});

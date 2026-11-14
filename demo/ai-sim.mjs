// AI 对局统计：AI vs AI（可指定双方难度），统计胜负/和棋/平均回合/合法性。
// 用法：node demo/ai-sim.mjs [games] [redDiff] [blackDiff]
import {
  createGame, autoDeploy, startPlaying, movePiece, attack,
} from '../src/core/index.mjs';
import { chooseAction } from '../src/core/ai.mjs';

const games = Number(process.argv[2] || 10);
const redDiff = process.argv[3] || 'normal';
const blackDiff = process.argv[4] || 'normal';

let finished = 0, errors = 0, pliesTotal = 0, pliesMax = 0;
const reasons = {}, winners = { red: 0, black: 0, draw: 0 };
const t0 = Date.now();

for (let seed = 0; seed < games; seed++) {
  const g = createGame({ seed });
  autoDeploy(g, 'red'); autoDeploy(g, 'black'); startPlaying(g);
  let plies = 0;
  try {
    while (g.phase !== 'finished' && plies < 2000) {
      const side = g.turn;
      const act = chooseAction(g, side, side === 'red' ? redDiff : blackDiff);
      if (!act) break;
      if (act.kind === 'move') movePiece(g, act.pieceId, act.to);
      else attack(g, act.pieceId, act.targetId);
      plies++;
    }
  } catch (e) { errors++; console.error('seed', seed, '异常:', e.message); }
  if (g.phase === 'finished') finished++;
  pliesTotal += plies;
  pliesMax = Math.max(pliesMax, plies);
  reasons[g.endReason || 'unfinished'] = (reasons[g.endReason || 'unfinished'] || 0) + 1;
  if (g.winner === 'red') winners.red++;
  else if (g.winner === 'black') winners.black++;
  else winners.draw++;
}

const dt = Date.now() - t0;
console.log(`\n===== AI 对局统计（${redDiff} vs ${blackDiff}，${games} 局）=====`);
console.log(`完成局数: ${finished}/${games}  ·  异常: ${errors}`);
console.log(`胜负: 红 ${winners.red} · 黑 ${winners.black} · 和 ${winners.draw}`);
console.log(`平均回合: ${(pliesTotal / games).toFixed(1)}  ·  最长: ${pliesMax}`);
console.log(`结束原因分布: ${JSON.stringify(reasons)}`);
console.log(`总耗时: ${dt}ms  ·  平均 ${(dt / games).toFixed(0)}ms/局`);

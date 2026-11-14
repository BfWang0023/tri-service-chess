// 航空行动专项模拟：统计飞机移动、空战、防空拦截、非法动作、异常与结束情况。
// 用法：node demo/air-sim.mjs [games]
import {
  createGame, autoDeploy, startPlaying, movePiece, attack,
  getLegalMoves, getLegalAttacks, PIECES,
} from '../src/core/index.mjs';
import { chooseAction } from '../src/core/ai.mjs';

const games = Number(process.argv[2] || 20);
const AIR = new Set(['fighter', 'scout_plane']);
const stats = {
  games, finished: 0, unfinished: 0, illegal: 0, exceptions: 0,
  plies: 0, airMoves: 0, airCombats: 0, fighterVsScout: 0, interceptions: 0,
  fighterAttacksScoutWons: 0, scoutAttacksFighterLoss: 0,
};
const t0 = Date.now();

for (let seed = 0; seed < games; seed++) {
  const g = createGame({ seed });
  autoDeploy(g, 'red'); autoDeploy(g, 'black'); startPlaying(g);
  let plies = 0;
  try {
    while (g.phase !== 'finished' && plies < 2000) {
      const side = g.turn;
      const act = chooseAction(g, side, 'normal');
      if (!act) break;
      const piece = g.piecesById[act.pieceId];
      if (act.kind === 'move') {
        if (AIR.has(piece.typeId)) stats.airMoves++;
        movePiece(g, act.pieceId, act.to);
        if (g.history.at(-1).intercepted) stats.interceptions++;
      } else {
        const def = g.piecesById[act.targetId];
        const isAir = AIR.has(piece.typeId) || AIR.has(def.typeId);
        if (isAir) stats.airCombats++;
        if (piece.typeId === 'fighter' && def.typeId === 'scout_plane') {
          stats.fighterVsScout++;
          attack(g, act.pieceId, act.targetId);
          if (def.dead) stats.fighterAttacksScoutWons++;
        } else if (piece.typeId === 'scout_plane' && def.typeId === 'fighter') {
          stats.scoutAttacksFighterLoss++;
          attack(g, act.pieceId, act.targetId);
        } else {
          attack(g, act.pieceId, act.targetId);
        }
      }
      plies++;
    }
  } catch (e) { stats.exceptions++; console.error('seed', seed, e.message); }
  if (g.phase === 'finished') stats.finished++; else stats.unfinished++;
  stats.plies += plies;
}

const dt = Date.now() - t0;
console.log(`\n===== 航空行动专项模拟（${games} 局）=====`);
console.log(`结束局数: ${stats.finished}/${games}  ·  未结束: ${stats.unfinished}`);
console.log(`非法动作: ${stats.illegal}  ·  异常: ${stats.exceptions}`);
console.log(`总回合: ${stats.plies}  ·  平均: ${(stats.plies / games).toFixed(1)}`);
console.log(`飞机移动: ${stats.airMoves}`);
console.log(`空战次数: ${stats.airCombats}`);
console.log(`战斗机↔侦察机 遭遇: ${stats.fighterVsScout}（战斗机获胜击杀 ${stats.fighterAttacksScoutWons}）`);
console.log(`侦察机攻战斗机(应败): ${stats.scoutAttacksFighterLoss}`);
console.log(`防空拦截(飞机被击落): ${stats.interceptions}`);
console.log(`耗时: ${dt}ms`);

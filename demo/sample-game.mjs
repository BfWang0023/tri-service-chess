// 完整對局演示：隨機合法行動，從布陣下到終局或達到步數上限。
// 用法：node demo/sample-game.mjs
import {
  createGame, autoDeploy, startPlaying, getMoves, getAttacks,
  movePiece, attack, winner, PIECES,
} from '../src/core/index.mjs';

function playOne(seed) {
  const g = createGame({ seed });
  autoDeploy(g, 'red');
  autoDeploy(g, 'black');
  startPlaying(g);
  const maxPly = 3000;
  let plies = 0;
  const captures = { red: 0, black: 0 };
  while (g.phase !== 'finished' && plies < maxPly) {
    const side = g.turn;
    const actions = [];
    for (const p of g.pieces) {
      if (p.side !== side || p.dead || !p.cellId) continue;
      for (const m of getMoves(g, p)) actions.push({ kind: 'move', p, cell: m });
      for (const a of getAttacks(g, p)) actions.push({ kind: 'attack', p, target: a.targetPieceId });
    }
    if (!actions.length) break;
    const act = actions[Math.floor(g.rng() * actions.length)];
    if (act.kind === 'move') {
      movePiece(g, act.p.id, act.cell);
    } else {
      const def = g.piecesById[act.target];
      attack(g, act.p.id, act.target);
      if (def.dead) captures[side]++;
    }
    plies++;
  }
  return {
    seed, plies, phase: g.phase, winner: winner(g),
    captures,
    alive: g.pieces.filter((p) => !p.dead && p.cellId).length,
  };
}

let finished = 0, stalemate = 0, capped = 0;
for (let seed = 1; seed <= 5; seed++) {
  const r = playOne(seed);
  console.log(`局 ${seed}: 回合=${r.plies} 結果=${r.phase}${r.winner ? ' 勝方=' + r.winner : ''} 存活=${r.alive} 戰績=${JSON.stringify(r.captures)}`);
  if (r.phase === 'finished') finished++;
  else if (r.plies >= 3000) capped++;
  else stalemate++;
}
console.log(`\n完成=${finished} 僵局(無子可動)=${stalemate} 達步數上限=${capped}`);

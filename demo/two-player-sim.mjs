// 本地雙人模擬對局：自動布陣後由兩名「隨機合法行動」玩家交替行棋，輸出關鍵步驟與最終結果。
// 用法：node demo/two-player-sim.mjs [seed]
import {
  createGame, autoDeploy, startPlaying, getMoves, getAttacks,
  movePiece, attack, PIECES,
} from '../src/core/index.mjs';

const ABBR = { commander_in_chief:'司令', corps_commander:'兵团', army_commander:'军长',
  division_commander:'师长', regiment_commander:'团长', battalion_commander:'营长', company_commander:'连长',
  platoon_leader:'排长', cavalry:'骑兵', infantry:'步兵', engineer:'工兵', landmine:'地雷', poison_gas:'毒气',
  trap:'陷阱', missile:'飞弹', bomb:'炸弹', atomic_bomb:'原子', tank:'坦克', artillery:'大炮',
  anti_aircraft_gun:'高炮', fort:'炮垒', machine_gun:'机枪', submarine:'潜艇', battleship:'主力',
  cruiser:'巡洋', gunboat:'炮舰', destroyer:'驱逐', fighter:'战斗', scout_plane:'侦察', flag:'军旗' };
const OUT = { attacker_wins: '攻胜', defender_wins: '守胜', both_destroyed: '同归于尽', no_result: '不分胜负', scout: '侦察' };
const S = (s) => (s === 'red' ? '红方' : '黑方');
const abbr = (t) => ABBR[t] || t;

const seed = Number(process.argv[2] || 42);
const g = createGame({ seed });
autoDeploy(g, 'red'); autoDeploy(g, 'black'); startPlaying(g);

const log = [];
let maxPly = 4000, ply = 0;

while (g.phase !== 'finished' && ply < maxPly) {
  const side = g.turn;
  const actions = [];
  for (const p of g.pieces) {
    if (p.side !== side || p.dead || !p.cellId) continue;
    for (const m of getMoves(g, p)) actions.push({ kind: 'move', p, cell: m });
    for (const a of getAttacks(g, p)) actions.push({ kind: 'attack', p, target: a.targetPieceId, outcome: a.outcome });
  }
  if (!actions.length) { log.push(`回合${ply + 1} ${S(side)} 无子可动（僵局）`); break; }
  const attacks = actions.filter((a) => a.kind === 'attack');
  const act = attacks.length && g.rng() < 0.7 ? attacks[Math.floor(g.rng() * attacks.length)] : actions[Math.floor(g.rng() * actions.length)];
  const p = act.p;
  if (act.kind === 'move') {
    log.push(`回合${ply + 1} ${S(side)} ${abbr(p.typeId)} 移动 ${p.cellId}→${act.cell}`);
    movePiece(g, p.id, act.cell);
  } else {
    const d = g.piecesById[act.target];
    const t = d.typeId;
    log.push(`回合${ply + 1} ${S(side)} ${abbr(p.typeId)} 攻击 ${S(d.side)}${abbr(t)} → ${OUT[act.outcome]}`);
    attack(g, p.id, act.target);
  }
  ply++;
}

// 輸出關鍵步驟（前 24 步 + 末尾若干 + 統計）
console.log(`\n===== 本地双人模拟对局（seed=${seed}）=====`);
const head = log.slice(0, 24);
const tail = log.length > 30 ? log.slice(-6) : [];
if (log.length > 30) { console.log(head.join('\n')); console.log(`  …（省略 ${log.length - 30} 步）…`); console.log(tail.join('\n')); }
else console.log(log.join('\n'));

console.log(`\n===== 最终结果 =====`);
console.log(`总回合：${ply}（历史 ${g.history.length} 条）`);
console.log(`结束阶段：${g.phase} · 结束原因：${g.endReason || '—'}`);
console.log(`胜方：${g.winner ? S(g.winner) : '和棋'}`);
const alive = (s) => g.pieces.filter((p) => p.side === s && !p.dead && p.cellId).length;
console.log(`存活棋子：红 ${alive('red')} : 黑 ${alive('black')}`);

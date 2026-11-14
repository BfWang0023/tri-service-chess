import test from 'node:test';
import assert from 'node:assert/strict';
import {
  BOARD, PIECES, attack, autoDeploy, createGame, deployPiece, deserializeGame,
  getLegalAttacks, getLegalMoves, getValidDeployCells, hasAnyLegalAction, movePiece,
  serializeGame, startPlaying, undeployedPieces,
} from '../src/core/index.mjs';

const find = (state,type,side) => state.pieces.find(p => p.typeId === type && p.side === side);
function position(items, turn = 'red') {
  const s = createGame({seed:1});
  s.phase = 'playing';
  s.turn = turn;
  for (const p of s.pieces) p.dead = true;
  for (const [type,side,cell] of items) {
    const p = find(s,type,side);
    p.dead = false;
    p.cellId = cell;
    s.occupancy[cell] = p.id;
  }
  return s;
}
const opposite = side => side === 'red' ? 'black' : 'red';
const moves = (s,t,side = s.turn) => getLegalMoves(s,find(s,t,side).id);
function verifyDeployment(s) {
  assert.equal(Object.keys(s.occupancy).length,60);
  for (const side of ['red','black']) {
    const pieces = s.pieces.filter(p => p.side === side);
    assert.equal(new Set(pieces.map(p=>p.cellId)).size,30);
    for (const p of pieces) {
      const n = BOARD.nodes[p.cellId];
      const expected = p.typeId === 'fort' ? 'fort' : {
        station:'army_station',city:'flag',anchor:'fleet',airfield:'aircraft',
      }[PIECES[p.typeId].deploy_zone];
      assert.equal(n.side, side);
      assert.ok(n.deployRoles.includes(expected),p.typeId);
      assert.equal(s.occupancy[p.cellId],p.id);
    }
  }
}
test('自动布阵，128 个种子，每侧 30 子，两个阵营均有合法动作',() => {
  for(let seed=0;seed<128;seed++) {
    const s = createGame({seed});
    autoDeploy(s,'red');
    autoDeploy(s,'black');
    verifyDeployment(s);
    startPlaying(s);
    assert.ok(hasAnyLegalAction(s,'red') && hasAnyLegalAction(s,'black'));
  }
});
test('手动布阵，先用两座城门，保留最后一座城门，禁止占位重叠',() => {
  const s=createGame();
  for (const [side,prefix] of [['red','N'],['black','S']]) {
    s.turn = side;
    deployPiece(s,find(s,'engineer',side).id,`${prefix}0-2`);
    deployPiece(s,find(s,'infantry',side).id,`${prefix}0-3`);
    const gun = find(s,'machine_gun',side);
    assert.throws(()=>deployPiece(s,gun.id,`${prefix}0-3`),/非法/);
    assert.throws(()=>deployPiece(s,gun.id,`${prefix}0-4`),/非法/);
    assert.throws(()=>deployPiece(s,gun.id,`${prefix}3-1`),/非法/);
    assert.deepEqual(getValidDeployCells(s,find(s,'flag',side)),[`${prefix}0-4`]);
    for (const p of undeployedPieces(s,side).sort((a,b)=>Number(a.typeId==='flag')-Number(b.typeId==='flag'))) {
      const cells=getValidDeployCells(s,p);
      assert.ok(cells.length);
      deployPiece(s,p.id,cells[0]);
    }
  }
  verifyDeployment(s);
  startPlaying(s);
});
test('铁路三步、阻挡、进出桥头停行及路铁转换',() => {
  const s=position([['engineer','red','N3-2'],['destroyer','black','M4-6']]);
  assert.ok(moves(s,'engineer').includes('N3-5'));
  assert.ok(!moves(s,'engineer').includes('N4-6'));
  const blocked=position([['engineer','red','N3-2'],['infantry','red','N3-3'],['destroyer','black','M4-6']]);
  assert.ok(!moves(blocked,'engineer').includes('N3-4'));
  assert.ok(moves(s,'engineer').includes('N5-1'));
  assert.ok(!moves(s,'engineer').includes('S5-1'));
  const p = find(s,'engineer','red');
  const ship = find(s,'destroyer','black');
  movePiece(s,p.id,'N5-1');
  movePiece(s,ship.id,'M3-4');
  assert.ok(moves(s,'engineer').includes('S5-1'));
  assert.ok(!moves(s,'engineer').includes('S4-2'));
  movePiece(s,p.id,'S5-1');
  movePiece(s,ship.id,'M4-6');
  assert.ok(moves(s,'engineer').includes('S4-1'));
  assert.ok(moves(s,'engineer').includes('S4-2'));
  assert.ok(moves(s,'engineer').includes('S3-2'));
});
test('两桥下同轴水路，军舰每回合一段，无法沿桥或在相交白线换道',() => {
  for (const [from,to,invalid] of [['M0-1','M2-2','M0-2'],['M0-7','M2-6','M0-6']]) {
    const s=position([['destroyer','red',from],['engineer','black','S5-1']]);
    const p=find(s,'destroyer','red');
    assert.ok(moves(s,'destroyer').includes(to));
    assert.ok(!moves(s,'destroyer').includes('S5-1'));
    if(from==='M0-7') assert.ok(!moves(s,'destroyer').includes(invalid));
    assert.ok(!moves(s,'destroyer').includes('M4-6'));
    movePiece(s,p.id,to);
    assert.equal(p.cellId,to);
  }
});
test('四机场可出发，一回合只飞一条连续航线，无点交叉不能转弯',() => {
  const s=position([['fighter','red','FNW'],['destroyer','black','M4-6']]);
  const p=find(s,'fighter','red'),ship=find(s,'destroyer','black');
  assert.ok(moves(s,'fighter').includes('AW3'));
  assert.ok(moves(s,'fighter').includes('A0-2'));
  assert.ok(!moves(s,'fighter').includes('A7-2'));
  assert.ok(!moves(s,'fighter').includes('FSE'));
  movePiece(s,p.id,'A0-2');
  movePiece(s,ship.id,'M3-4');
  assert.ok(moves(s,'fighter').includes('A7-2'));
  assert.ok(!moves(s,'fighter').includes('M1-1'));
  movePiece(s,p.id,'A7-2');
  const event=s.history.at(-1);
  assert.ok(event.overflight.some(e=>e.target==='M1-1'));
  assert.ok(event.overflight.every(e=>BOARD.historical.overflightByEdge[e.edge].some(h=>h.target===e.target)));
  for (const id of ['FNW','FNE','FSW','FSE']) {
    const state=position([['fighter','red',id],['destroyer','black','M4-6']]);
    assert.ok(moves(state,'fighter').length>0,id);
  }
});
test('飞越拦截事件有段和实际棋位，侦察使用可达航线的地海投影',() => {
  const s=position([['fighter','red','A2-2'],['gunboat','black','M1-1'],['engineer','black','S5-1']]);
  const p=find(s,'fighter','red');
  movePiece(s,p.id,'A5-2');
  assert.equal(p.dead,true);
  assert.equal(s.history.at(-1).intercepted,find(s,'gunboat','black').id);
  assert.deepEqual(s.history.at(-1).overflight.at(-1),{edge:'air_lane:A3-2~A4-2',target:'M1-1'});
  assert.ok(!s.history.at(-1).overflight.some(e=>e.target==='M3-1'));
  const scout=position([['scout_plane','red','A2-2'],['destroyer','black','M1-1'],['engineer','black','S4-1']]);
  const recon=find(scout,'scout_plane','red');
  const ship=find(scout,'destroyer','black');
  assert.ok(getLegalAttacks(scout,recon.id).some(a=>a.targetPieceId===ship.id));
  attack(scout,recon.id,ship.id);
  assert.ok(ship.revealedUntilPly >= scout.ply);
  assert.equal(recon.cellId,'A2-2');
});
test('空岸及战胜后登陆，炮舰沿岸和对空交战留在海上，炮垒固定',() => {
  for (const kind of ['battleship','cruiser']) {
    const s=position([[kind,'red','M4-2'],['destroyer','black','M0-2']]);
    const p=find(s,kind,'red');
    movePiece(s,p.id,'S5-2');
    assert.equal(p.landed,true);
    assert.equal(p.cellId,'S5-2');
    s.turn='red';
    assert.ok(moves(s,kind).includes('S4-3'));
    assert.ok(!moves(s,kind).includes('M4-2'));
  }
  const s=position([['battleship','red','M4-2'],['fort','black','S5-2'],['destroyer','black','M0-2']]);
  const ship=find(s,'battleship','red'),fort=find(s,'fort','black');
  assert.equal(getLegalAttacks(s,ship.id)[0].targetPieceId,fort.id);
  attack(s,ship.id,fort.id);
  assert.equal(ship.landed,true);
  assert.equal(ship.cellId,'S5-2');
  const coast=position([['gunboat','red','M4-2'],['infantry','black','S5-2'],['fort','black','S5-3']]);
  const gun=find(coast,'gunboat','red');
  assert.ok(!moves(coast,'gunboat').includes('S5-2'));
  assert.ok(!getLegalAttacks(coast,gun.id).some(a=>a.targetCellId==='S5-3'));
  attack(coast,gun.id,find(coast,'infantry','black').id);
  assert.equal(gun.cellId,'M4-2');
  assert.deepEqual(moves(coast,'fort','black'),[]);
  const anti=position([['gunboat','red','M4-2'],['fighter','black','A4-2'],['destroyer','black','M0-2']]);
  const aa=find(anti,'gunboat','red');
  attack(anti,aa.id,find(anti,'fighter','black').id);
  assert.equal(aa.cellId,'M4-2');
});
test('双方三个城门旗位均可从对岸经过合法陆军行动夺取',() => {
  for (const side of ['red','black']) for (const city of [2,3,4]) {
    const enemy=opposite(side), home=side==='red'?'N':'S', dest=side==='red'?'S':'N';
    const start=`${home}4-2`, target=`${dest}0-${city}`;
    const state=position([['engineer',side,start],['flag',enemy,target],['destroyer',enemy,'M1-4']],side);
    const p=find(state,'engineer',side), ship=find(state,'destroyer',enemy);
    const steps=[[start]];
    const seen=new Set([start]);
    let path;
    while(steps.length) {
      const partial=steps.shift(), at=partial.at(-1);
      const trial=position([['engineer',side,at],['flag',enemy,target],['destroyer',enemy,'M1-4']],side);
      if(getLegalAttacks(trial,find(trial,'engineer',side).id).some(a=>a.targetCellId===target)) {path=partial;break;}
      for(const next of moves(trial,'engineer')) if(!seen.has(next)) {seen.add(next);steps.push([...partial,next]);}
    }
    assert.ok(path?.includes(`${home}5-1`) || path?.includes(`${home}5-6`),target);
    for(const next of path.slice(1)) {
      movePiece(state,p.id,next);
      movePiece(state,ship.id,ship.cellId==='M1-4'?'M0-6':'M1-4');
    }
    attack(state,p.id,find(state,'flag',enemy).id);
    assert.equal(state.winner,side);
    assert.equal(state.endReason,'flag_captured');
  }
});
test('历史存档往返、旧版和无效坐标显式隔离',() => {
  const state=createGame({seed:11});
  autoDeploy(state,'red');autoDeploy(state,'black');startPlaying(state);
  const data=serializeGame(state);
  assert.deepEqual(JSON.parse(serializeGame(deserializeGame(data))),JSON.parse(data));
  const old=JSON.parse(data);
  delete old.boardRevision;
  assert.throws(()=>deserializeGame(JSON.stringify(old)),/版本不符/);
  const invalid=JSON.parse(data);
  invalid.pieces[0].cellId='r0c0';
  assert.throws(()=>deserializeGame(JSON.stringify(invalid)),/无效棋位/);
});

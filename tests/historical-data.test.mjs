// 历史棋盘数据完整性测试（A 类验收）
import test from 'node:test';
import assert from 'node:assert/strict';
import { BOARD, PIECES, createGame, autoDeploy, startPlaying } from '../src/core/index.mjs';

const G = BOARD.historical.graphEdges;

test('冻结节点 169 + 4 海面补点；正式通行边 271', () => {
  // 冻结图 169 节点 + 4 个海面边缘补点（M1-0/M1-5/M3-0/M3-5）
  const patchIds = new Set(['M1-0', 'M1-5', 'M3-0', 'M3-5']);
  const total = Object.keys(BOARD.nodes).length;
  const frozen = Object.keys(BOARD.nodes).filter((id) => !patchIds.has(id)).length;
  assert.equal(frozen, 169, '冻结节点应为 169');
  assert.equal(total, 173, '含 4 个海面补点共 173');
  assert.equal(G.length, 271);
});

test('节点状态：157 已核实 + 12 推定；无排除项进入图', () => {
  const st = {};
  for (const n of Object.values(BOARD.nodes)) st[n.status] = (st[n.status] || 0) + 1;
  assert.equal(st.verified, 157);
  assert.equal(st.provisional, 12);
  assert.equal(st.excluded, undefined);
});

test('边状态：246 已核实 + 25 推定', () => {
  const st = {};
  for (const e of G) st[e.status] = (st[e.status] || 0) + 1;
  assert.equal(st.verified, 246);
  assert.equal(st.provisional, 25);
});

test('岸线接触 16 条、飞越关系 88 条、冻结航線 18 条', () => {
  assert.equal(BOARD.historical.coastalContacts.length, 16);
  let of = 0;
  for (const arr of Object.values(BOARD.historical.overflightByEdge)) of += arr.length;
  assert.equal(of, 88);
  // 冻结图 18 条航线（pathByAirLine 未被补丁修改）；引擎额外含中间横线补丁 HMID
  assert.equal(Object.keys(BOARD.historical.pathByAirLine).length, 18);
  assert.ok(BOARD.edges.air_lines['HMID'], '应存在中间横线补丁');
});

test('边类型覆盖公路/铁路/铁桥/海路/航线', () => {
  const types = new Set(G.map(e => e.type));
  for (const t of ['road', 'railway', 'bridge', 'sea_lane', 'air_lane']) {
    assert.ok(types.has(t), `缺少边类型 ${t}`);
  }
  assert.ok(BOARD.edges.railway.length >= 2, '铁桥/铁路边存在');
  assert.ok(BOARD.edges.sea_line.length > 0, '海路边存在');
});

test('双方各 30 枚与布阵区域合法（8 个种子）', () => {
  for (let seed = 0; seed < 8; seed++) {
    const g = createGame({ seed });
    autoDeploy(g, 'red'); autoDeploy(g, 'black');
    assert.equal(Object.keys(g.occupancy).length, 60);
    for (const side of ['red', 'black']) {
      const mine = g.pieces.filter(p => p.side === side);
      assert.equal(new Set(mine.map(p => p.cellId)).size, 30);
      for (const p of mine) {
        const n = BOARD.nodes[p.cellId];
        assert.equal(n.side, side);
        const expected = p.typeId === 'fort' ? 'fort'
          : { station: 'army_station', city: 'flag', anchor: 'fleet', airfield: 'aircraft' }[PIECES[p.typeId].deploy_zone];
        assert.ok(n.deployRoles.includes(expected), `${p.typeId} @ ${p.cellId}`);
      }
    }
    startPlaying(g);
  }
});

test('排除的旧节点/边不在正式节点集合', () => {
  for (const id of Object.keys(BOARD.nodes)) {
    assert.ok(!/^r\d+c\d+$/.test(id), `旧网格坐标 ${id} 混入正式图`);
  }
});

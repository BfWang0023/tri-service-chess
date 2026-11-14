// 棋盤拓撲測試
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  BOARD, nodes, nodeType, neighbors, airLines, airLineCells,
  isLandCell, isSeaCell, isAirCell, isCamp, isCity, isAirfield, isAnchor, isBridgehead,
} from '../src/core/index.mjs';

test('棋盤節點數量與類型', () => {
  const counts = {};
  for (const n of Object.values(nodes)) counts[n.type] = (counts[n.type] || 0) + 1;
  assert.equal(counts.airfield, 4);
  assert.equal(counts.city, 6);       // 每方 3
  assert.equal(counts.camp, 4);       // 每方 2
  assert.equal(counts.anchor, 10);    // 每方 5
  assert.equal(counts.bridgehead, 4); // 四橋頭
  assert.equal(counts.bridge, 6);     // 兩條鐵橋各 3 格
  assert.equal(counts.air_dot, 1);    // 中央黑點
});

test('每方部署容量充足', () => {
  for (const side of ['red', 'black']) {
    const stations = Object.values(nodes).filter((n) => n.type === 'station' && n.side === side).length;
    const cities = Object.values(nodes).filter((n) => n.type === 'city' && n.side === side).length;
    const anchors = Object.values(nodes).filter((n) => n.type === 'anchor' && n.side === side).length;
    const airfields = Object.values(nodes).filter((n) => n.type === 'airfield' && n.side === side).length;
    assert.ok(stations >= 22, `${side} 兵站不足`);
    assert.ok(cities >= 1, `${side} 城市不足`);
    assert.ok(anchors >= 5, `${side} 錨點不足`);
    assert.ok(airfields >= 2, `${side} 機場不足`);
  }
});

test('鐵路橫貫全寬並含鐵橋', () => {
  for (const r of [0, 10]) {
    const row = BOARD.edges.railway.filter(([a]) => nodes[a].row === r);
    const cols = new Set();
    for (const [a, b] of row) { cols.add(nodes[a].col); cols.add(nodes[b].col); }
    for (let c = 0; c < 13; c++) assert.ok(cols.has(c), `鐵路第 ${r} 行缺列 ${c}`);
  }
});

test('橋頭為停行點', () => {
  for (const id of BOARD.meta.bridgeheads) assert.ok(isBridgehead(id), `${id} 應為橋頭`);
  assert.equal(isBridgehead('r0c4'), true);
  assert.equal(isBridgehead('r0c8'), true);
  assert.equal(isBridgehead('r10c4'), true);
  assert.equal(isBridgehead('r10c8'), true);
});

test('航線黑點與經過格', () => {
  assert.equal(Object.keys(airLines).length, 4);
  for (const [name, line] of Object.entries(airLines)) {
    assert.ok(Array.isArray(line) && line.length >= 2, `${name} 航線異常`);
    const cells = airLineCells[name];
    assert.ok(cells.length >= 2, `${name} 無經過格`);
  }
});

test('節點類型判定', () => {
  assert.equal(isLandCell('r1c1'), true);
  assert.equal(isSeaCell('r1c5'), true);
  assert.equal(isAirCell('r0c0'), true);      // 機場
  assert.equal(isAirCell('r5c6'), true);      // 中央黑點
  assert.equal(isCamp('r3c2'), true);
  assert.equal(isCity('r2c0'), true);
  assert.equal(isAnchor('r2c5'), true);
});

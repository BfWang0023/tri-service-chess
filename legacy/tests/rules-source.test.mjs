// 規則來源與分類測試：已確認規則 vs 假設/衝突（分別測試）
import test from 'node:test';
import assert from 'node:assert/strict';
import { resolve, ASSUMPTIONS, CONFLICTS } from '../src/core/index.mjs';

test('假設與衝突清單已結構化記錄', () => {
  assert.ok(Array.isArray(ASSUMPTIONS) && ASSUMPTIONS.length > 0, '假設清單缺失');
  assert.ok(Array.isArray(CONFLICTS) && CONFLICTS.some((c) => c.id === 'D1'), '衝突 D1 缺失');
  for (const a of ASSUMPTIONS) assert.equal(typeof a, 'string');
  const d1 = CONFLICTS.find((c) => c.id === 'D1');
  assert.ok(d1.adopted.includes('炮壘勝'), 'D1 採用解釋應為炮壘勝');
  assert.ok(d1.sources['炮壘條目'] && d1.sources['炮艦條目'], 'D1 應引用雙方條目來源');
});

// ---------- 已確認規則（第二階段指令 + 維基明示） ----------
test('【已確認】同級官兵/軍艦：雙方消滅', () => {
  assert.equal(resolve('division_commander', 'division_commander'), 'both_destroyed');
  assert.equal(resolve('battleship', 'battleship'), 'both_destroyed');
});

test('【已確認】戰鬥機互碰：攻者勝', () => {
  assert.equal(resolve('fighter', 'fighter'), 'attacker_wins');
});

test('【已確認】炮壘對機關槍：炮壘勝', () => {
  assert.equal(resolve('fort', 'machine_gun'), 'attacker_wins');
  assert.equal(resolve('machine_gun', 'fort'), 'defender_wins');
});

test('【已確認】炮艦 vs 炮壘：炮壘勝（D1 對稱採用）', () => {
  assert.equal(resolve('gunboat', 'fort'), 'defender_wins');
  assert.equal(resolve('fort', 'gunboat'), 'attacker_wins');
});

test('【已確認】海軍循環克制（潛艇↔驅逐艦）', () => {
  assert.equal(resolve('submarine', 'destroyer'), 'defender_wins');
  assert.equal(resolve('destroyer', 'submarine'), 'attacker_wins');
  assert.equal(resolve('submarine', 'battleship'), 'attacker_wins');
});

test('【已確認】工兵攻防不對稱（攻炸彈/炮壘勝、被攻敗）', () => {
  assert.equal(resolve('engineer', 'bomb'), 'attacker_wins');
  assert.equal(resolve('bomb', 'engineer'), 'attacker_wins');
  assert.equal(resolve('engineer', 'fort'), 'attacker_wins');
  assert.equal(resolve('fort', 'engineer'), 'attacker_wins');
});

// ---------- 假設（資料未明示、屬推斷）：與上列已確認規則分開驗證其「已記錄」狀態 ----------
test('【假設】同型軍艦相遇雙方消滅（與同級軍官一致）', () => {
  assert.ok(ASSUMPTIONS.some((a) => a.includes('同型軍艦')), '同型軍艦假設未記錄');
});
test('【假設】高射炮對空特技僅針對飛機、不針對飛彈', () => {
  assert.ok(ASSUMPTIONS.some((a) => a.includes('高射炮')), '高射炮假設未記錄');
  // 地面相遇按「遇飛彈同歸於盡」處理
  assert.equal(resolve('anti_aircraft_gun', 'missile'), 'both_destroyed');
});

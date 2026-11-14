// 戰鬥矩陣與特殊規則測試
import test from 'node:test';
import assert from 'node:assert/strict';
import { resolve, COMBAT_MATRIX, OUTCOME, PIECES } from '../src/core/index.mjs';

const ALL = Object.keys(COMBAT_MATRIX);

test('矩陣為 30×30 且只含六類結果', () => {
  const legal = new Set(Object.values(OUTCOME));
  for (const a of ALL) {
    assert.equal(Object.keys(COMBAT_MATRIX[a]).length, 30);
    for (const d of ALL) {
      assert.ok(legal.has(COMBAT_MATRIX[a][d]), `${a}->${d} 非法結果`);
    }
  }
});

test('軍官上下級：上級勝下級（對稱）', () => {
  assert.equal(resolve('commander_in_chief', 'army_commander'), 'attacker_wins');
  assert.equal(resolve('army_commander', 'commander_in_chief'), 'defender_wins');
});

test('同級軍官/軍艦：雙方消滅（已確認）', () => {
  assert.equal(resolve('division_commander', 'division_commander'), 'both_destroyed');
  assert.equal(resolve('battleship', 'battleship'), 'both_destroyed');
});

test('官兵遇武器即敗；地雷/炸彈/飛彈同歸於盡', () => {
  assert.equal(resolve('commander_in_chief', 'poison_gas'), 'defender_wins');
  assert.equal(resolve('commander_in_chief', 'landmine'), 'both_destroyed');
  assert.equal(resolve('commander_in_chief', 'bomb'), 'both_destroyed');
  assert.equal(resolve('commander_in_chief', 'missile'), 'both_destroyed');
});

test('工兵特殊（已確認：攻者勝炸彈/炮壘，勝地雷/毒氣/陷阱）', () => {
  assert.equal(resolve('engineer', 'landmine'), 'attacker_wins');
  assert.equal(resolve('engineer', 'poison_gas'), 'attacker_wins');
  assert.equal(resolve('engineer', 'trap'), 'attacker_wins');
  assert.equal(resolve('engineer', 'bomb'), 'attacker_wins');   // 工兵攻炸彈勝
  assert.equal(resolve('bomb', 'engineer'), 'attacker_wins');   // 炸彈攻工兵，工兵敗
  assert.equal(resolve('engineer', 'fort'), 'attacker_wins');   // 工兵攻炮壘勝
  assert.equal(resolve('fort', 'engineer'), 'attacker_wins');   // 炮壘攻工兵，工兵敗
});

test('炮壘 vs 機關槍：炮壘勝（已確認）', () => {
  assert.equal(resolve('fort', 'machine_gun'), 'attacker_wins');
  assert.equal(resolve('machine_gun', 'fort'), 'defender_wins');
});

test('炮艦 vs 炮壘：炮壘勝（衝突 D1 採對稱）', () => {
  assert.equal(resolve('fort', 'gunboat'), 'attacker_wins');
  assert.equal(resolve('gunboat', 'fort'), 'defender_wins');
});

test('海軍循環克制', () => {
  assert.equal(resolve('submarine', 'battleship'), 'attacker_wins');
  assert.equal(resolve('submarine', 'destroyer'), 'defender_wins');
  assert.equal(resolve('destroyer', 'submarine'), 'attacker_wins');
  assert.equal(resolve('battleship', 'cruiser'), 'attacker_wins');
  assert.equal(resolve('cruiser', 'gunboat'), 'attacker_wins');
});

test('主力艦/巡洋艦登陸：等同坦克/大炮勝炮壘', () => {
  assert.equal(resolve('battleship', 'fort'), 'attacker_wins');
  assert.equal(resolve('cruiser', 'fort'), 'attacker_wins');
});

test('戰鬥機：攻者勝互碰；攻飛彈勝；敗於高射炮/炮艦；潛艇不分勝負', () => {
  assert.equal(resolve('fighter', 'fighter'), 'attacker_wins');
  assert.equal(resolve('fighter', 'missile'), 'attacker_wins');
  assert.equal(resolve('missile', 'fighter'), 'both_destroyed');
  assert.equal(resolve('fighter', 'anti_aircraft_gun'), 'defender_wins');
  assert.equal(resolve('fighter', 'gunboat'), 'defender_wins');
  assert.equal(resolve('fighter', 'submarine'), 'no_result');
  assert.equal(resolve('fighter', 'landmine'), 'attacker_wins');
});

test('偵察機：一般目標偵察、地雷不分勝負、飛彈同歸於盡', () => {
  assert.equal(resolve('scout_plane', 'commander_in_chief'), 'scout');
  assert.equal(resolve('scout_plane', 'landmine'), 'no_result');
  assert.equal(resolve('scout_plane', 'missile'), 'both_destroyed');
  assert.equal(resolve('scout_plane', 'fighter'), 'defender_wins');
});

test('飛彈：不可攻城市/機場（軍旗）、不能毀陷阱、潛艇落空', () => {
  assert.equal(resolve('missile', 'flag'), 'forbidden');
  assert.equal(resolve('missile', 'trap'), 'defender_wins');
  assert.equal(resolve('missile', 'submarine'), 'defender_wins');
});

test('軍旗可被奪（飛彈除外）', () => {
  assert.equal(resolve('commander_in_chief', 'flag'), 'attacker_wins');
  assert.equal(resolve('fighter', 'flag'), 'attacker_wins');
  assert.equal(resolve('missile', 'flag'), 'forbidden');
  assert.equal(resolve('flag', 'commander_in_chief'), 'forbidden'); // 軍旗不可攻
});

test('毒氣敗於所有武器；炸彈/飛彈與之同歸於盡', () => {
  assert.equal(resolve('poison_gas', 'tank'), 'defender_wins');
  assert.equal(resolve('tank', 'poison_gas'), 'attacker_wins');
  assert.equal(resolve('bomb', 'poison_gas'), 'both_destroyed');
  assert.equal(resolve('poison_gas', 'bomb'), 'both_destroyed');
});

test('高射炮勝炮壘/機關槍/官兵；地面遇飛彈同歸於盡', () => {
  assert.equal(resolve('anti_aircraft_gun', 'fort'), 'attacker_wins');
  assert.equal(resolve('anti_aircraft_gun', 'fighter'), 'attacker_wins');
  assert.equal(resolve('anti_aircraft_gun', 'scout_plane'), 'attacker_wins');
  // 地面交戰遇飛彈同歸於盡（高射炮的「對空」特技僅針對飛機，不針對飛彈）
  assert.equal(resolve('anti_aircraft_gun', 'missile'), 'both_destroyed');
});

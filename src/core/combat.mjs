// 統一戰鬥裁決：消費 30×30 基礎戰鬥矩陣
import { COMBAT_MATRIX, CONFLICTS, ASSUMPTIONS } from './generated-data.mjs';
import { OUTCOME } from './constants.mjs';

/**
 * 返回 (攻方類型, 守方類型) 的戰鬥結果。
 * 六類：attacker_wins / defender_wins / both_destroyed / no_result / scout / forbidden
 */
export function resolve(attackerTypeId, defenderTypeId) {
  const row = COMBAT_MATRIX[attackerTypeId];
  if (!row) throw new Error(`未知攻方棋子類型: ${attackerTypeId}`);
  const r = row[defenderTypeId];
  if (r === undefined) throw new Error(`未知守方棋子類型: ${defenderTypeId}`);
  return r;
}

export { CONFLICTS, ASSUMPTIONS };
export { OUTCOME };

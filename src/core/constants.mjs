// 三軍棋 核心常量
export const SIDE = Object.freeze({ RED: 'red', BLACK: 'black', SEA: 'sea' });

export const PHASE = Object.freeze({ SETUP: 'setup', PLAYING: 'playing', FINISHED: 'finished' });

export const OUTCOME = Object.freeze({
  ATTACKER_WINS: 'attacker_wins',
  DEFENDER_WINS: 'defender_wins',
  BOTH_DESTROYED: 'both_destroyed',
  NO_RESULT: 'no_result',
  SCOUT: 'scout',
  FORBIDDEN: 'forbidden',
});

export const MOBILITY = Object.freeze({
  LAND: 'land',
  SEA: 'sea',
  AIR: 'air',
  DUAL: 'dual',      // 飛彈：陸 + 空
  IMMOBILE: 'immobile',
});

export const otherSide = (s) => (s === SIDE.RED ? SIDE.BLACK : SIDE.RED);

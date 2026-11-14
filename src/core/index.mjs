// 三軍棋核心引擎統一出口
export * from './constants.mjs';
export * from './combat.mjs';
export * from './moves.mjs';
export {
  createGame, deployPiece, autoDeploy, startPlaying,
  undeployedPieces, getValidDeployCells,
  getLegalMoves, getLegalAttacks, movePiece, attack, resign,
  getVisibleState, isRevealedTo, currentSide, winner, hasAnyLegalAction,
  serializeGame, deserializeGame,
} from './engine.mjs';
export {
  nodes, node, nodeType, nodeSide, neighbors, airLines, airLineCells,
  isLandCell, isSeaCell, isAirCell, isCamp, isCity, isAirfield, isAnchor, isBridgehead,
} from './board.mjs';
export { PIECES, COMBAT_MATRIX, BOARD, CONFLICTS, ASSUMPTIONS } from './generated-data.mjs';

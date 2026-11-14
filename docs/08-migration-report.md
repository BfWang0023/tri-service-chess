# 历史棋盘迁移报告（v2.0.0 → 游戏 v1.0）

## 1. 资产接收

| 项 | 值 |
|---|---|
| 交付包 | `Codex/2026-11-13/.../three-army-board.zip` |
| 冻结版本 | `NMTH-2010.031.0527.0002@2.0.0` |
| 权威源 | `data/board.graph.json`（schemaVersion 2.0.0，status frozen） |
| 正式节点 | 169（157 已核实 + 12 推定） |
| 正式通行边 | 271（246 已核实 + 25 推定） |
| 岸线接触 | 16 |
| 航空飞越关系 | 88 |
| 航線（airRuns） | 18 |
| 校正画布 | 850 × 1200（与 `board-clean.svg` viewBox 一致） |

## 2. 基线核对与导入方式

官方 `integration/import-deepseek.mjs` 核对 8 个第三阶段文件哈希，**全部匹配**（board.mjs / moves.mjs / engine.mjs / web/app.mjs / board.json / pieces.json / combat-matrix.json / emit_esm.py）。

**但沙箱只允许在工作区内写入**，无法在 Desktop 创建兄弟目录 `三军棋-历史棋盘`。因此执行与脚本**等价的导入**：

1. 将原网格版完整复制到工作区内的 `legacy/`（读旧存档 + 跑旧网格测试）。
2. 用 overlay 覆盖 `src/core/{board,moves,engine}.mjs` 与 `web/app.mjs`。
3. 用交付包 `data/board.json`（历史版，适配器输出）替换 `data/board.json`。
4. 网格测试移入 `legacy-fixtures/*.mjs.fixture`（不被 `node --test tests/*.test.mjs` 发现）。
5. 复制 `tests/engine-integration.mjs` → `tests/historical-board.test.mjs`。
6. 运行 `python3 data/emit_esm.py` 重建 ESM。

> 与脚本的唯一差异：目标目录从「Desktop 兄弟目录」改为「工作区内 `legacy/`」。语义一致（原网格版保留、历史版成为主项目）。

## 3. 图数据接入

- `BOARD.nodes`：169 个节点（id、x/y、type、historicalType、side、row/col、deployRoles、allowedPieceClasses、status）。
- `BOARD.edges`：road(108) / railway(16) / sea_line(43) / air_lines(18)。
- `BOARD.historical`：`graphEdges`(271)、`coastalContacts`(16)、`overflightByEdge`(88)、`pathByAirLine`、`rules`、`canvasSize`。
- `meta.boardRevision = NMTH-2010.031.0527.0002@2.0.0` —— 存档版本校验依据。

## 4. 旧版保护

- **旧网格版**：完整保留于 `legacy/`（`npm run test:legacy` 运行 56 项网格测试，全部通过）。
- **旧地图数据**：`legacy/data/board.json`（RECONSTRUCTED 网格版）。
- **旧存档隔离**：历史版 `deserializeGame` 校验 `boardRevision`，旧存档（无该字段）抛「存档棋盘版本不符」，**不会被误解释为历史版状态**（有测试）。

## 5. 测试

| 套件 | 数量 | 说明 |
|---|---|---|
| 历史版主项目 `npm test` | 45 | historical-board(9)+combat(15)+rules-source(9)+historical-data(7)+ai(5) |
| 旧网格版 `npm run test:legacy` | 56 | 6 个文件（board/combat/engine/moves/phase3/rules-source） |

历史版全部通过；旧网格版独立通过。

## 6. 未改动的冻结资产

`data/board.json` 原样来自交付包（未经手工修改）。若发现图数据问题，应记录证据并提补丁，不得静默更改——本阶段未发现需补丁的问题。

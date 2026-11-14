#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""把 pieces.json / combat-matrix.json / board.json 打包為 ESM 模組 src/core/generated-data.mjs
供 Node（測試）與瀏覽器（Web UI）無需 fetch/fs 直接 import。"""
import json, os

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, "..", "src", "core", "generated-data.mjs")

def main():
    pieces = json.load(open(os.path.join(HERE, "pieces.json"), encoding="utf-8"))
    matrix = json.load(open(os.path.join(HERE, "combat-matrix.json"), encoding="utf-8"))
    board = json.load(open(os.path.join(HERE, "board.json"), encoding="utf-8"))

    def js(obj):
        return json.dumps(obj, ensure_ascii=False, separators=(",", ":"))

    body = (
        "// 由 data/emit_esm.py 自動生成，請勿手動編輯。\n"
        "export const PIECES = " + js(pieces) + ";\n"
        "export const OUTCOME_LEGEND = " + js(matrix["outcome_legend"]) + ";\n"
        "export const COMBAT_MATRIX = " + js(matrix["matrix"]) + ";\n"
        "export const ASSUMPTIONS = " + js(matrix["assumptions"]) + ";\n"
        "export const CONFLICTS = " + js(matrix["conflicts"]) + ";\n"
        "export const BOARD = " + js(board) + ";\n"
    )
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    with open(OUT, "w", encoding="utf-8") as f:
        f.write(body)
    print("wrote", OUT)

if __name__ == "__main__":
    main()

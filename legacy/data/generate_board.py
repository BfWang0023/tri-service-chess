#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
三軍棋 棋盤結構生成器 —— 第二階段（依歷史棋盤特徵重建）

聲明：
  已確認歷史棋盤（雷鳥牌，藏品編號 2010.031.0527.0002）的影像因網絡限制無法直接抓取，
  本佈局依下列來源的**結構性描述**重建，仍屬「重建佈局」，須以實物影像核實：
    * 維基百科：中間為海洋；兩旁兩條鐵路連接兩方；海岸線錨點；陸上兵站；三城；兩行營；
      角落兩機場；航線穿越各處。
    * 第二階段確認：鐵橋須在橋頭停行一步；海軍沿海上白線每回合 1 步；
      飛機沿航線遠距離移動、改變方向需在黑點停留。

  引擎數據驅動，取得實物影像後可整體替換本文件而不改引擎。

幾何（13 列 × 11 行；行 0..10、列 0..12）：
  * 紅方陸地：列 0..4；海洋：列 5..7；黑方陸地：列 8..12。
  * 鐵路：第 0 行與第 10 行（橫貫全寬），跨海段為「鐵橋」，橋頭需停行。
  * 每方：角落 2 機場、城市 3 座（背列）、行營 2 個；其餘陸地為兵站。
  * 錨點：紅方列 5、黑方列 7（沿岸，行 2..6）。
  * 海上白線：海洋區域內正交相鄰的海面邊（海軍 1 步）。
  * 航線黑點：四角機場 + 中央交會點；航線為直線段（飛機沿直線遠距移動，轉向需在黑點停留）。
"""

import json, os

ROWS, COLS = 11, 13
RED_COLS = range(0, 5)
BLACK_COLS = range(8, 13)
SEA_COLS = range(5, 8)

RED_AIRFIELDS = [(0, 0), (10, 0)]
RED_CITIES    = [(2, 0), (5, 0), (8, 0)]
RED_CAMPS     = [(3, 2), (7, 2)]
RED_ANCHORS   = [(r, 5) for r in range(2, 7)]   # 紅方沿岸（列 5，行 2..6）
BRIDGEHEADS   = [(0, 4), (0, 8), (10, 4), (10, 8)]  # 鐵橋橋頭（陸側端點）

def mirror(pos):
    r, c = pos
    return (r, 12 - c)

def build():
    nodes = {}
    railway, road, sea_line = [], [], []

    def add(r, c, side, ntype):
        nid = f"r{r}c{c}"
        nodes[nid] = {"id": nid, "row": r, "col": c, "side": side, "type": ntype,
                      "source": "textual_reconstruction"}   # 節點來源：文字重建（未經影像核實）
        return nid

    # 陸地節點
    for r in range(ROWS):
        for c in range(COLS):
            if c in RED_COLS:
                p = (r, c)
                if p in RED_AIRFIELDS:
                    t = "airfield"
                elif p in RED_CITIES:
                    t = "city"
                elif p in RED_CAMPS:
                    t = "camp"
                elif p in BRIDGEHEADS:
                    t = "bridgehead"
                else:
                    t = "station"
                add(r, c, "red", t)
            elif c in BLACK_COLS:
                p = (r, c)
                if p in [mirror(x) for x in RED_AIRFIELDS]:
                    t = "airfield"
                elif p in [mirror(x) for x in RED_CITIES]:
                    t = "city"
                elif p in [mirror(x) for x in RED_CAMPS]:
                    t = "camp"
                elif p in BRIDGEHEADS:
                    t = "bridgehead"
                else:
                    t = "station"
                add(r, c, "black", t)
            elif c in SEA_COLS and 1 <= r <= 9:
                p = (r, c)
                if p in RED_ANCHORS:
                    t = "anchor"; side = "red"
                elif p in [mirror(x) for x in RED_ANCHORS]:
                    t = "anchor"; side = "black"
                else:
                    t = "sea"; side = "sea"
                add(r, c, side, t)

    # 鐵路跨海段（鐵橋）節點：第 0/10 行的海面列
    for r in (0, 10):
        for c in SEA_COLS:
            add(r, c, "sea", "bridge")

    def ortho(n1, n2):
        r1, c1 = nodes[n1]["row"], nodes[n1]["col"]
        r2, c2 = nodes[n2]["row"], nodes[n2]["col"]
        return abs(r1 - r2) + abs(c1 - c2) == 1

    # 鐵路：第 0/10 行全寬水平連接（含鐵橋）
    for r in (0, 10):
        for c in range(COLS - 1):
            a, b = f"r{r}c{c}", f"r{r}c{c+1}"
            if a in nodes and b in nodes:
                railway.append([a, b])

    # 海上白線：海面/錨點正交相鄰（海軍 1 步）
    for a in nodes:
        for b in nodes:
            if a >= b:
                continue
            na, nb = nodes[a], nodes[b]
            if na["type"] in ("sea", "anchor") and nb["type"] in ("sea", "anchor"):
                if ortho(a, b):
                    sea_line.append([a, b])

    # 公路：陸地區域正交相鄰（鐵路行與橋頭行除外；橋頭行亦不連公路，僅鐵路通過）
    for a in nodes:
        for b in nodes:
            if a >= b:
                continue
            na, nb = nodes[a], nodes[b]
            if na["side"] == nb["side"] and na["side"] in ("red", "black"):
                if na["row"] in (0, 10) or nb["row"] in (0, 10):
                    continue
                if ortho(a, b):
                    road.append([a, b])

    # 鐵路↔內陸的豎向連接（公路 1 步）：第 0↔1 行、第 10↔9 行，陸地列（跳過機場列 0/12）
    for c in list(range(1, 5)) + list(range(8, 12)):
        for r_top, r_below in [(0, 1), (10, 9)]:
            a, b = f"r{r_top}c{c}", f"r{r_below}c{c}"
            if a in nodes and b in nodes:
                road.append([a, b])

    # 航線黑點：四角機場 + 中央交會點
    center = (5, 6)
    for r, c in [(0, 0), (0, 12), (10, 0), (10, 12)]:
        nodes[f"r{r}c{c}"]["type"] = "airfield"
    if f"r{center[0]}c{center[1]}" in nodes:
        nodes[f"r{center[0]}c{center[1]}"]["type"] = "air_dot"
        nodes[f"r{center[0]}c{center[1]}"]["side"] = "sea"
    else:
        add(center[0], center[1], "sea", "air_dot")

    # 航線：直線（每條為有序黑點，端點即黑點）
    air_lines = {
        "diag_main": ["r0c0", "r5c6", "r10c12"],
        "diag_anti": ["r10c0", "r5c6", "r0c12"],
        "top":       ["r0c0", "r0c12"],
        "bottom":    ["r10c0", "r10c12"],
    }
    air_routes = list(air_lines.values())

    # 每條航線「經過」的格子（布雷森漢），供飛機/飛彈「沿航線攻擊」查詢
    def bresenham(p0, p1):
        r0, c0 = p0; r1, c1 = p1
        pts, dr, dc = [], abs(r1-r0), -abs(c1-c0)
        sr = 1 if r0 < r1 else -1
        sc = 1 if c0 < c1 else -1
        err = dr + dc
        while True:
            pts.append((r0, c0))
            if r0 == r1 and c0 == c1:
                break
            e2 = 2 * err
            if e2 >= dc:
                err += dc; r0 += sr
            if e2 <= dr:
                err += dr; c0 += sc
        return pts

    air_line_cells = {}
    for name, line in air_lines.items():
        seen = []
        for i in range(len(line) - 1):
            a, b = line[i], line[i+1]
            ra, ca = nodes[a]["row"], nodes[a]["col"]
            rb, cb = nodes[b]["row"], nodes[b]["col"]
            seg = bresenham((ra, ca), (rb, cb))
            seg = seg if i == 0 else seg[1:]
            seen += seg
        # 去重（保持順序）
        cells = []
        for p in seen:
            nid = f"r{p[0]}c{p[1]}"
            if nid not in cells:
                cells.append(nid)
        air_line_cells[name] = cells

    board = {
        "meta": {
            "status": "RECONSTRUCTED",
            "note": "依結構性描述重建，未經實物影像核實；引擎數據驅動可替換。",
            "rows": ROWS, "cols": COLS,
            "red_land_cols": [0, 4], "sea_cols": [5, 7], "black_land_cols": [8, 12],
            "bridgeheads": ["r0c4", "r0c8", "r10c4", "r10c8"],
            "verification": {
                "status": "reconstructed",
                "image_access": {
                    "board1": "tshop.r10s.com 雷鳥牌 LT-215（已下載，無法直接讀圖）",
                    "board2": "pimg.1px.tw 歷史實物（已下載，無法直接讀圖）",
                    "board3": "collections.culture.tw 臺灣歷史博物館影像（下載超時，未取得）",
                },
                "extracted_by_cv": "僅確認「海洋居中、陸地在兩側」的整體格局；逐點座標無法由照片可靠提取。",
                "node_classification": {
                    "confirmed_by_text": ["兵站", "城市", "行營", "錨點", "機場", "鐵橋", "橋頭", "航線黑點"],
                    "inferred_coordinates": "全部節點之座標/數量為文字重建（source=textual_reconstruction）",
                    "occluded": "未能讀圖，無法標記被遮擋節點",
                },
                "needed_from_human": [
                    "雷鳥牌棋盤正上方平視、無陰影、無棋子的高清圖（或逐格標注版）",
                    "中央海域的錨點/航行線位置圖",
                    "鐵橋與橋頭的準確拓撲（橋跨幾格、橋頭在哪幾格）",
                    "機場與航線黑點的準確位置與航線走向",
                    "每方兵站/城市/行營的準確數量與座標",
                ],
            },
        },
        "nodes": nodes,
        "edges": {
            "road": road,
            "railway": railway,
            "sea_line": sea_line,
            "air": air_routes,
            "air_lines": air_lines,
            "air_line_cells": air_line_cells,
        },
    }
    return board

def svg(board):
    S, M = 46, 40
    W = COLS * S + 2 * M
    H = ROWS * S + 2 * M
    X = lambda c: M + c * S
    Y = lambda r: M + r * S

    type_color = {
        "station": "#e8e0d0", "city": "#f2c94c", "camp": "#6fcf97",
        "airfield": "#c8c8e8", "anchor": "#7fb3d5", "sea": "#a9d4ee",
        "bridge": "#9aa0a6", "bridgehead": "#d9b38c", "air_dot": "#4a4a4a",
    }
    side_ring = {"red": "#c0392b", "black": "#2c3e50", "sea": "#2e86c1"}

    parts = [f'<svg xmlns="http://www.w3.org/2000/svg" width="{W}" height="{H}" '
             f'viewBox="0 0 {W} {H}" font-family="sans-serif">',
             f'<rect x="0" y="0" width="{W}" height="{H}" fill="#faf6ef"/>']

    def edge_line(ids, color, width, dash=None):
        for a, b in ids:
            na, nb = board["nodes"][a], board["nodes"][b]
            d = f' stroke-dasharray="{dash}"' if dash else ""
            parts.append(f'<line x1="{X(na["col"])}" y1="{Y(na["row"])}" '
                         f'x2="{X(nb["col"])}" y2="{Y(nb["row"])}" '
                         f'stroke="{color}" stroke-width="{width}"{d}/>')

    edge_line(board["edges"]["road"], "#b8b0a0", 1.5)
    edge_line(board["edges"]["sea_line"], "#7fb3d5", 1.5)
    edge_line(board["edges"]["railway"], "#4a4a4a", 4)

    for route in board["edges"]["air"]:
        for i in range(len(route) - 1):
            a, b = route[i], route[i+1]
            na, nb = board["nodes"][a], board["nodes"][b]
            parts.append(f'<line x1="{X(na["col"])}" y1="{Y(na["row"])}" '
                         f'x2="{X(nb["col"])}" y2="{Y(nb["row"])}" '
                         f'stroke="#e67e22" stroke-width="2" stroke-dasharray="6,5"/>')

    labels = {"city": "城", "camp": "營", "airfield": "場", "anchor": "錨",
              "bridge": "橋", "bridgehead": "頭", "air_dot": "●"}
    for n in board["nodes"].values():
        cx, cy = X(n["col"]), Y(n["row"])
        fill = type_color[n["type"]]
        ring = side_ring[n["side"]]
        parts.append(f'<circle cx="{cx}" cy="{cy}" r="13" fill="{fill}" '
                     f'stroke="{ring}" stroke-width="2.5"/>')
        if n["type"] in labels:
            parts.append(f'<text x="{cx}" y="{cy+4}" font-size="12" text-anchor="middle">{labels[n["type"]]}</text>')

    parts.append('</svg>')
    return "\n".join(parts)

def main():
    here = os.path.dirname(os.path.abspath(__file__))
    board = build()
    with open(os.path.join(here, "board.json"), "w", encoding="utf-8") as f:
        json.dump(board, f, ensure_ascii=False, indent=2)
    svg_path = os.path.join(here, "..", "docs", "board-sketch.svg")
    os.makedirs(os.path.dirname(os.path.abspath(svg_path)), exist_ok=True)
    with open(svg_path, "w", encoding="utf-8") as f:
        f.write(svg(board))
    from collections import Counter
    cnt = Counter(n["type"] for n in board["nodes"].values())
    print("nodes:", len(board["nodes"]), dict(cnt))
    print("edges:", {k: len(v) for k, v in board["edges"].items() if k != "air_lines"})
    print("wrote board.json + docs/board-sketch.svg")

if __name__ == "__main__":
    main()

#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
三軍棋（Tri-Service Chess）規則數據生成器 —— 第一階段

依據：
  * 維基百科「三軍棋」條目（經快懂百科鏡像取得的完整正文）
  * 网易号《上个世纪的军事类桌面游戏（三）威风八面的海陆空战棋》（版本與棋子數量交叉驗證）

本腳本把文獻中明確記載的規則編碼為可執行的判定邏輯，並生成：
  * data/pieces.json         —— 30 種棋子的完整定義
  * data/combat-matrix.json  —— 30×30 完整勝負矩陣
  * data/combat-matrix.md    —— 人類可讀的矩陣表

所有「推斷 / 假設」的關係都集中在 ASSUMPTIONS 列表中，並在輸出中標注，
不冒充傳統規則。
"""

import json, os

OUTCOMES = {
    "attacker_wins":  "攻方胜",
    "defender_wins":  "守方胜",
    "both_destroyed": "双方消灭",
    "no_result":      "不分胜负",
    "scout":          "侦察",
    "forbidden":      "不允许交战",
}

# ---------------------------------------------------------------------------
# 棋子定義
# ---------------------------------------------------------------------------
OFFICERS = [
    ("commander_in_chief", "总司令", 1),
    ("corps_commander",    "兵团司令", 2),
    ("army_commander",     "军长",   3),
    ("division_commander", "师长",   4),
    ("regiment_commander", "团长",   5),
    ("battalion_commander","营长",   6),
    ("company_commander",  "连长",   7),
    ("platoon_leader",     "排长",   8),
    ("cavalry",            "骑兵",   9),
    ("infantry",           "步兵",  10),
    ("engineer",           "工兵",  11),
]
OFFICER_RANK = {k: v for k, _, v in OFFICERS}
OFFICER_IDS = set(OFFICER_RANK)

WEAPONS = ["landmine", "poison_gas", "trap", "missile", "bomb", "atomic_bomb",
           "tank", "artillery", "anti_aircraft_gun", "fort", "machine_gun"]

NAVY = ["submarine", "battleship", "cruiser", "gunboat", "destroyer"]
SURFACE_ORDER = {"battleship": 4, "cruiser": 3, "gunboat": 2, "destroyer": 1}

AIR = ["fighter", "scout_plane"]
FLAG = "flag"

ALL = [k for k, _, _ in OFFICERS] + WEAPONS + NAVY + AIR + [FLAG]

# 不可移動、且永遠不能主動攻擊的棋子（fort 除外：炮壘可攻擊鄰近軍艦）
IMMOBILE_NO_ATTACK = {"flag", "landmine", "trap"}

# 假設（資料未明示、屬推斷者）；已由第二階段確認的規則不在此列。
ASSUMPTIONS = [
    "同型軍艦相遇（跨方）判為「雙方消滅」，維基未明示（與同級軍官一致）。",
    "軍艦、官兵在公路/海面的基本移動速率（1 格）為推斷；維基僅明示「鐵路：陸軍一回合可行三格」。",
    "炮壘（不可移動）按「可攻擊鄰近陸地/海上棋子」建模，以落實「工兵被炮壘攻擊敗」的不對稱規則；其對地雷採「同歸於盡」為推斷。",
    "飛彈攻擊潛艇：潛艇存活、飛彈被移除（「落空除去」），在矩陣中記為「守方胜」並備註。",
    "潛艇/驅逐艦不可攻擊陸上目標；潛艇不可攻擊空中目標。",
    "主力艦/巡洋艦/炮艦可攻擊沿岸陸軍（登陸/炮轟），強度等價見 pieces.json 之 land_equiv。",
    "軍旗可被任何棋子奪取，但「飛彈」因「不可攻擊城市」而除外（軍旗位於城市）。",
    "高射炮的「對空」特技僅針對飛機（戰鬥機/偵察機），不針對飛彈；高射炮與飛彈地面相遇仍按「遇飛彈同歸於盡」；射程 2 格為對空攻擊距離。",
    "炸彈/飛彈 vs 毒氣：採「同歸於盡優先於『毒氣敗於所有武器』」——炸彈/飛彈自毀優先。",
]

# 規則衝突（不同條目互相矛盾、尚待外部核實者）：單獨記錄，不擅自以非對稱機制掩蓋。
CONFLICTS = [
    {
        "id": "D1",
        "topic": "炮艦 vs 炮壘",
        "sources": {
            "炮壘條目": "炮壘勝：機關槍、潛艇外各軍艦（含炮艦）……勝其他艦。",
            "炮艦條目": "炮艦可攻擊沿海陸軍……攻擊炮壘時勝。",
        },
        "adopted": "炮壘勝（雙向，對稱）。依據：炮壘「勝潛艇外各軍艦」為炮壘對艦的概括性規則；炮艦「攻擊炮壘時勝」與之衝突，暫列為未決，不採用非對稱機制。",
        "status": "未決（已選用對稱解釋，待外部核實）",
    },
]

def officer_vs_officer(a, d):
    ra, rd = OFFICER_RANK[a], OFFICER_RANK[d]
    if ra < rd:
        return "attacker_wins"
    if ra > rd:
        return "defender_wins"
    return "both_destroyed"  # 同級（假設）

def navy_vs_navy(a, d):
    if a == d:
        return "both_destroyed"  # 同型艦（假設）
    if a == "submarine":
        return "attacker_wins" if d in ("battleship", "cruiser", "gunboat") else "defender_wins"
    if d == "submarine":
        return "attacker_wins" if a == "destroyer" else "defender_wins"
    return "attacker_wins" if SURFACE_ORDER[a] > SURFACE_ORDER[d] else "defender_wins"

def weapon_vs_weapon(a, d):
    """a、d 皆為武器；a 必為可攻擊者（非 landmine/trap/fort）。"""
    # 陷阱：勝所有武器（工兵除外，工兵是軍官）
    if d == "trap":
        return "defender_wins"
    # 地雷：任何棋子碰上同歸於盡
    if d == "landmine":
        return "both_destroyed"
    # 毒氣：敗於所有其他武器；但炸彈/飛彈與之同歸於盡（自毀優先）
    if d == "poison_gas":
        return "both_destroyed" if a in ("missile", "bomb") else "attacker_wins"
    if a == "poison_gas":
        return "both_destroyed" if d in ("missile", "bomb") else "defender_wins"
    # 炮壘作為攻擊方（炮壘不可移動，但可攻擊鄰近陸地/海上棋子）
    if a == "fort":
        if d in ("missile", "bomb"):
            return "both_destroyed"   # 遇飛彈、炸彈同歸於盡
        if d == "machine_gun":
            return "attacker_wins"    # 勝機關槍
        return "defender_wins"        # 敗於原子彈/坦克/大炮/高射炮
    # 飛彈 / 炸彈：被投中者同歸於盡
    if a in ("missile", "bomb"):
        return "both_destroyed"
    # 原子彈：勝所有武器，遇地雷/飛彈/炸彈同歸於盡，遇陷阱敗（已處理）
    if a == "atomic_bomb":
        if d in ("missile", "bomb"):
            return "both_destroyed"
        return "attacker_wins"
    # 坦克：勝 大炮/高射炮/炮壘/機關槍；遇 地雷/飛彈/炸彈 同歸於盡；遇 陷阱/原子彈 敗
    if a == "tank":
        if d in ("missile", "bomb"):
            return "both_destroyed"
        if d == "atomic_bomb":
            return "defender_wins"
        return "attacker_wins"  # 大炮/高射炮/炮壘/機關槍
    # 大炮：勝 高射炮/炮壘/機關槍；遇 地雷/飛彈/炸彈 同歸於盡；遇 陷阱/原子彈/坦克 敗
    if a == "artillery":
        if d in ("missile", "bomb"):
            return "both_destroyed"
        if d in ("atomic_bomb", "tank"):
            return "defender_wins"
        return "attacker_wins"
    # 高射炮：勝 炮壘/機關槍；遇 地雷/飛彈/炸彈 同歸於盡；遇 陷阱/原子彈/坦克/大炮 敗
    if a == "anti_aircraft_gun":
        if d in ("missile", "bomb"):
            return "both_destroyed"
        if d in ("atomic_bomb", "tank", "artillery"):
            return "defender_wins"
        return "attacker_wins"
    # 機關槍：勝 官兵（另處處理）；遇 地雷/炸彈 同歸於盡；遇 陷阱/原子彈/坦克/大炮/高射炮 敗；遇 炮壘 敗（第二階段確認：炮壘勝）
    if a == "machine_gun":
        if d in ("missile", "bomb"):
            return "both_destroyed"
        if d in ("atomic_bomb", "tank", "artillery", "anti_aircraft_gun"):
            return "defender_wins"
        if d == "fort":
            return "defender_wins"  # 第二階段確認：炮壘對機關槍採用炮壘勝
        return "attacker_wins"
    return "forbidden"

def officer_vs_weapon(a, d):
    """a 為軍官、d 為武器。"""
    if a == "engineer":
        if d in ("landmine", "poison_gas", "trap"):
            return "attacker_wins"   # 工兵可勝地雷/毒氣/陷阱
        if d in ("bomb", "fort"):
            return "attacker_wins"   # 工兵主動攻擊炸彈/炮壘勝
        if d == "missile":
            return "both_destroyed"  # 飛彈：被投中者同歸於盡
        return "defender_wins"       # 其餘武器：官兵遇武器即敗
    # 非工兵軍官遇武器
    if d in ("landmine", "bomb", "missile"):
        return "both_destroyed"      # 地雷/炸彈/飛彈：同歸於盡
    return "defender_wins"           # 官兵遇武器即敗

def weapon_vs_officer(a, d):
    """a 為武器（可含炮壘主動攻擊）、d 為軍官。"""
    if a == "fort":
        return "attacker_wins"       # 炮壘勝官兵（工兵被炮壘攻擊亦敗）
    if a == "missile":
        return "both_destroyed"      # 飛彈擊中同歸於盡
    if a == "bomb":
        return "attacker_wins" if d == "engineer" else "both_destroyed"  # 被炸彈攻擊工兵敗；餘同歸於盡
    if a == "poison_gas":
        return "defender_wins" if d == "engineer" else "attacker_wins"
    # 原子彈/坦克/大炮/高射炮/機關槍 勝官兵
    return "attacker_wins"

def ship_land_equiv(a):
    """軍艦登陸/炮轟時，與官兵比、與武器比的等價棋子。"""
    return {
        "battleship": ("division_commander", "tank"),
        "cruiser":    ("regiment_commander", "artillery"),
        "gunboat":    ("battalion_commander", "fort"),
    }[a]

def resolve_land(a, d):
    """a、d 皆為陸地棋子（軍官或武器）。炮壘可主動攻擊鄰近陸地棋子。"""
    if a in IMMOBILE_NO_ATTACK:
        return "forbidden"   # 軍旗/地雷/陷阱不可動
    if a in OFFICER_IDS and d in OFFICER_IDS:
        return officer_vs_officer(a, d)
    if a in OFFICER_IDS and d in WEAPONS:
        return officer_vs_weapon(a, d)
    if a in WEAPONS and d in OFFICER_IDS:
        return weapon_vs_officer(a, d)
    # 兩者皆武器
    return weapon_vs_weapon(a, d)

def resolve(a, d):
    """返回 (a 攻擊 d) 的結果關鍵字。a、d 為棋子 id。"""
    # 1) 攻擊方不可主動攻擊
    if a in IMMOBILE_NO_ATTACK:
        return "forbidden"
    # 2) 軍旗作為守方：任何棋子皆可奪旗（飛彈因不可攻擊城市而除外）
    if d == "flag":
        return "forbidden" if a == "missile" else "attacker_wins"

    # 3) 空軍（戰鬥機 / 偵察機）
    if a == "fighter":
        if d == "fighter":
            return "attacker_wins"          # 戰鬥機互碰，攻者勝
        if d == "anti_aircraft_gun":
            return "defender_wins"          # 敗於高射炮
        if d == "gunboat":
            return "defender_wins"          # 敗於炮艦
        if d == "submarine":
            return "no_result"              # 被攻擊不分勝負
        return "attacker_wins"              # 勝所有棋子（含地雷/偵察機/軍旗）
    if a == "scout_plane":
        if d in ("fighter", "anti_aircraft_gun", "gunboat"):
            return "defender_wins"          # 敗於戰鬥機/高射炮/炮艦
        if d == "missile":
            return "both_destroyed"         # 被飛彈擊中同歸於盡
        if d == "landmine":
            return "no_result"              # 偵察機與地雷不分勝負
        return "scout"                      # 偵察（揭示對方棋子）

    # 4) 飛彈作為攻擊方（沿航空線）
    if a == "missile":
        if d == "fighter":
            return "both_destroyed"         # 被飛彈擊中同歸於盡
        if d == "trap":
            return "defender_wins"          # 不能毀壞陷阱
        if d == "submarine":
            return "defender_wins"          # 落空除去：潛艇存活、飛彈移除
        return "both_destroyed"             # 被投中者同歸於盡

    # 5) 海軍內部
    if a in NAVY and d in NAVY:
        return navy_vs_navy(a, d)

    # 6) 軍艦攻擊陸地 / 空中 / 軍旗
    if a in NAVY:
        if d in AIR:
            return "attacker_wins" if a == "gunboat" else "forbidden"  # 炮艦可對空（同高射炮）
        if d in OFFICER_IDS or d in WEAPONS:
            if a in ("submarine", "destroyer"):
                return "forbidden"          # 潛艇/驅逐艦不可登陸
            officer_equiv, weapon_equiv = ship_land_equiv(a)
            if d in OFFICER_IDS:
                return officer_vs_officer(officer_equiv, d)
            if d == "fort" and a == "gunboat":
                return "defender_wins"      # 炮壘勝炮艦（衝突 D1 採炮壘勝，對稱）
            return weapon_vs_weapon(weapon_equiv, d)
        return "forbidden"                  # 軍旗由第 2 層處理；其餘禁止

    # 7) 陸地棋子攻擊海軍 / 空中
    if a in OFFICER_IDS or a in WEAPONS:
        if d in NAVY:
            if a == "fort":
                return "no_result" if d == "submarine" else "attacker_wins"  # 炮壘勝各艦（潛艇除外）
            return "forbidden"              # 其餘陸軍不可攻擊軍艦
        if d in AIR:
            if a == "anti_aircraft_gun":
                return "attacker_wins" if d in ("fighter", "scout_plane") else "forbidden"
            return "forbidden"              # 其餘陸軍不可攻擊空中
        return resolve_land(a, d)

    return "forbidden"

# ---------------------------------------------------------------------------
# 生成 pieces.json
# ---------------------------------------------------------------------------
def build_pieces():
    pieces = {}
    def add(pid, name, service, category, deploy, mobility, move_note, rank=None,
            special=None, cannot_attack=None):
        pieces[pid] = {
            "id": pid,
            "name_zh": name,
            "service": service,      # army / navy / air / special
            "category": category,    # officer / weapon / ship / aircraft / flag
            "rank": rank,            # 軍官序 / 艦艇水面序（無則 None）
            "initial_count": 1,      # 維基「新版」每方每種 1 枚（共 30 枚）
            "deploy_zone": deploy,   # station / city / anchor / airfield
            "mobility": mobility,    # immobile / land / sea / air / dual(land+air)
            "move_note": move_note,
            "special": special or [],
            "cannot_attack": cannot_attack or [],
        }
    for pid, name, rank in OFFICERS:
        add(pid, name, "army", "officer", "station", "land",
            "公路 1 格；鐵路一回合最多 3 格", rank=rank)
    w = {
        "landmine":  ("地雷",   "immobile", "不可移動。任何棋子碰上同歸於盡（戰鬥機/工兵可勝；偵察機不分勝負）"),
        "poison_gas":("毒氣",   "land",     "陸上行走。勝所有官兵（工兵除外）；敗於工兵及所有其他武器"),
        "trap":      ("陷阱",   "immobile", "不可移動。勝所有官兵及武器（工兵除外）；敗於工兵"),
        "missile":   ("飛彈",   "dual",     "可於陸上或空中行進；沿航空線攻擊、可越子；被投中者同歸於盡；不能毀壞陷阱；敗於戰鬥機"),
        "bomb":      ("炸彈",   "land",     "陸上行走。所碰各子同歸於盡；不能毀壞陷阱；敗於工兵、戰鬥機"),
        "atomic_bomb":("原子彈","land",     "陸上行走。勝所有武器及官兵；遇地雷/飛彈/炸彈同歸於盡；遇陷阱敗；勝毒氣；敗於戰鬥機"),
        "tank":      ("坦克車", "land",     "陸上行走。勝大炮/高射炮/炮壘/機關槍及官兵；遇地雷/飛彈/炸彈同歸於盡；遇陷阱敗；敗於戰鬥機"),
        "artillery": ("大炮",   "land",     "陸上行走。勝高射炮/炮壘/機關槍及官兵；遇地雷/飛彈/炸彈同歸於盡；遇陷阱敗；敗於戰鬥機"),
        "anti_aircraft_gun": ("高射炮", "land", "陸上行走。勝炮壘/機關槍及官兵；可擊落飛越上空或 2 格內敵機"),
        "fort":      ("炮壘",   "immobile", "不可移動。可攻擊鄰近陸地/海上棋子；勝機關槍、各艦（潛艇除外）及官兵；遇飛彈/炸彈同歸於盡；敗於戰鬥機及工兵"),
        "machine_gun":("機關槍","land",     "陸上行走。勝官兵；遇地雷/炮壘/炸彈同歸於盡；遇陷阱敗；敗於戰鬥機"),
    }
    for pid, (name, mob, note) in w.items():
        add(pid, name, "army", "weapon", "station", mob, note)
    n = {
        "submarine": ("潛水艇", "勝主力艦/巡洋艦/炮艦；敗於驅逐艦；被飛彈/炮壘/戰鬥機攻擊不分勝負（飛彈落空除去）"),
        "battleship": ("主力艦", "可兩棲登陸：登陸後對官兵等同師長、對武器等同坦克車"),
        "cruiser":    ("巡洋艦", "可兩棲登陸：登陸後對官兵等同團長、對武器等同上炮"),
        "gunboat":    ("炮艦",   "攻擊沿海陸軍（對官兵等同營長、對武器等同炮壘）；對炮壘採炮壘勝（衝突 D1）；可對空（同高射炮）"),
        "destroyer":  ("驅逐艦", "勝潛水艇"),
    }
    for pid, (name, note) in n.items():
        add(pid, name, "navy", "ship", "anchor", "sea", "海面行走（速率 1 格，推斷）",
            rank=SURFACE_ORDER.get(pid), special=[note])
    add("fighter", "戰鬥機", "air", "aircraft", "airfield", "air",
        "沿航空線行進，可無限遠飛行（轉彎要停）；勝所有棋子，敗於高射炮及炮艦；互碰攻者勝")
    add("scout_plane", "偵察機", "air", "aircraft", "airfield", "air",
        "沿航空線行進，可無限遠飛行（轉彎要停）；用來偵察對方棋子；被飛彈擊中同歸於盡；敗於高射炮/炮艦/戰鬥機")
    add("flag", "軍旗", "special", "flag", "city", "immobile",
        "不可移動；任何棋子皆可奪旗（飛彈除外）")
    return pieces

def main():
    here = os.path.dirname(os.path.abspath(__file__))
    pieces = build_pieces()
    with open(os.path.join(here, "pieces.json"), "w", encoding="utf-8") as f:
        json.dump(pieces, f, ensure_ascii=False, indent=2)

    matrix = {}
    for a in ALL:
        matrix[a] = {d: resolve(a, d) for d in ALL}

    with open(os.path.join(here, "combat-matrix.json"), "w", encoding="utf-8") as f:
        json.dump({
            "outcome_legend": OUTCOMES,
            "matrix": matrix,
            "assumptions": ASSUMPTIONS,
            "conflicts": CONFLICTS,
        }, f, ensure_ascii=False, indent=2)

    # 人類可讀 markdown 表
    lines = []
    lines.append("# 三軍棋 完整勝負矩陣\n")
    lines.append("行 = 攻擊方（攻方），列 = 防守方（守方）。縮寫：攻勝=攻方胜 守勝=守方胜 同歸=双方消灭 無=不分胜负 偵=侦察 禁=不允许交战\n")
    lines.append("\n| 攻＼守 | " + " | ".join(ALL) + " |")
    lines.append("|---|" + "---|" * len(ALL))
    abbrev = {"attacker_wins":"攻勝","defender_wins":"守勝","both_destroyed":"同歸",
              "no_result":"無","scout":"偵","forbidden":"禁"}
    for a in ALL:
        cells = " | ".join(abbrev[matrix[a][d]] for d in ALL)
        lines.append(f"| {a} | {cells} |")
    with open(os.path.join(here, "combat-matrix.md"), "w", encoding="utf-8") as f:
        f.write("\n".join(lines) + "\n")

    print(f"OK: {len(ALL)} pieces, {len(ALL)}x{len(ALL)} matrix")
    print("outcome counts:", {k: sum(1 for r in matrix.values() for v in r.values() if v==k) for k in OUTCOMES})

if __name__ == "__main__":
    main()

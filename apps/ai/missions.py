# -*- coding: utf-8 -*-
from dataclasses import dataclass
from typing import Dict

@dataclass(frozen=True)
class Mission:
    mission_id: int
    type: str  # 'sum' | 'multipile' | 'arithmetic' | 'geometic' | 'prime'  (原文どおりの文字列)
    target: str  # 'row' | 'column' | 'diagonal' | 'allDirection' | 'allCell'
    number: int
    description: str  # 日本語の説明文

MISSIONS: Dict[int, Mission] = {
    0: Mission(mission_id = 0, type="sum", target="row", number=11, description="どこかの行の和が11"),
    1: Mission(mission_id = 1, type="sum", target="column", number=11, description="どこかの列の和が11"),
    2: Mission(mission_id = 2, type="sum", target="diagonal", number=11, description="どこかの対角線の和が11"),
    3: Mission(mission_id = 3, type="sum", target="row", number=12, description="どこかの行の和が12"),
    4: Mission(mission_id = 4, type="sum", target="column", number=12, description="どこかの列の和が12"),
    5: Mission(mission_id = 5, type="sum", target="diagonal", number=12, description="どこかの対角線の和が12"),
    6: Mission(mission_id = 6, type="sum", target="row", number=13, description="どこかの行の和が13"),
    7: Mission(mission_id = 7, type="sum", target="column", number=13, description="どこかの列の和が13"),
    8: Mission(mission_id = 8, type="sum", target="diagonal", number=13, description="どこかの対角線の和が13"),
    9: Mission(mission_id = 9, type="sum", target="row", number=14, description="どこかの行の和が14"),
    10: Mission(mission_id = 10, type="sum", target="column", number=14, description="どこかの列の和が14"),
    11: Mission(mission_id = 11, type="sum", target="diagonal", number=14, description="どこかの対角線の和が14"),
    12: Mission(mission_id = 12, type="sum", target="row", number=15, description="どこかの行の和が15"),
    13: Mission(mission_id = 13, type="sum", target="column", number=15, description="どこかの列の和が15"),
    14: Mission(mission_id = 14, type="sum", target="diagonal", number=15, description="どこかの対角線の和が15"),
    15: Mission(mission_id = 15, type="sum", target="row", number=16, description="どこかの行の和が16"),
    16: Mission(mission_id = 16, type="sum", target="column", number=16, description="どこかの列の和が16"),
    17: Mission(mission_id = 17, type="sum", target="diagonal", number=16, description="どこかの対角線の和が16"),
    18: Mission(mission_id = 18, type="sum", target="row", number=17, description="どこかの行の和が17"),
    19: Mission(mission_id = 19, type="sum", target="column", number=17, description="どこかの列の和が17"),
    20: Mission(mission_id = 20, type="sum", target="diagonal", number=17, description="どこかの対角線の和が17"),
    21: Mission(mission_id = 21, type="sum", target="row", number=18, description="どこかの行の和が18"),
    22: Mission(mission_id = 22, type="sum", target="column", number=18, description="どこかの列の和が18"),
    23: Mission(mission_id = 23, type="sum", target="diagonal", number=18, description="どこかの対角線の和が18"),
    24: Mission(mission_id = 24, type="sum", target="row", number=19, description="どこかの行の和が19"),
    25: Mission(mission_id = 25, type="sum", target="column", number=19, description="どこかの列の和が19"),
    26: Mission(mission_id = 26, type="sum", target="diagonal", number=19, description="どこかの対角線の和が19"),
    27: Mission(mission_id = 27, type="multipile", target="row", number=2, description="どこかの行の数全てが2の倍数"),
    28: Mission(mission_id = 28, type="multipile", target="column", number=2, description="どこかの列の数全てが2の倍数"),
    29: Mission(mission_id = 29, type="multipile", target="allCell", number=2, description="盤面上に2の倍数が4つ以上存在"),
    30: Mission(mission_id = 30, type="multipile", target="row", number=3, description="どこかの行の数全てが3の倍数"),
    31: Mission(mission_id = 31, type="multipile", target="column", number=3, description="どこかの列の数全てが3の倍数"),
    32: Mission(mission_id = 32, type="multipile", target="allCell", number=3, description="盤面上に3の倍数が4つ以上存在"),
    33: Mission(mission_id = 33, type="multipile", target="row", number=4, description="どこかの行の数全てが4の倍数"),
    34: Mission(mission_id = 34, type="multipile", target="column", number=4, description="どこかの列の数全てが4の倍数"),
    35: Mission(mission_id = 35, type="multipile", target="allCell", number=4, description="盤面上に4の倍数が4つ以上存在"),
    36: Mission(mission_id = 36, type="multipile", target="row", number=5, description="どこかの行の数全てが5の倍数"),
    37: Mission(mission_id = 37, type="multipile", target="column", number=5, description="どこかの列の数全てが5の倍数"),
    38: Mission(mission_id = 38, type="multipile", target="allCell", number=5, description="盤面上に5の倍数が4つ以上存在"),
    39: Mission(mission_id = 39, type="arithmetic", target="allDirection", number=0, description="行、列、対角線のうちどこかが等差数列"),
    40: Mission(mission_id = 40, type="arithmetic", target="allDirection", number=1, description="行、列、対角線のうちどこかが公差が1の等差数列"),
    41: Mission(mission_id = 41, type="arithmetic", target="allDirection", number=2, description="行、列、対角線のうちどこかが公差が2の等差数列"),
    42: Mission(mission_id = 42, type="arithmetic", target="allDirection", number=3, description="行、列、対角線のうちどこかが公差が3の等差数列"),
    43: Mission(mission_id = 43, type="geometic", target="allDirection", number=0, description="行、列、対角線のうちどこかが等比数列"),
    44: Mission(mission_id = 44, type="geometic", target="allDirection", number=1, description="行、列、対角線のうちどこかが公比が1の等比数列"),
    45: Mission(mission_id = 45, type="geometic", target="allDirection", number=2, description="行、列、対角線のうちどこかが公比が2の等比数列"),
    46: Mission(mission_id = 46, type="geometic", target="allDirection", number=3, description="行、列、対角線のうちどこかが公比が3の等比数列"),
    47: Mission(mission_id = 47, type="prime", target="row", number=0, description="どこかの行の数がすべてが素数"),
    48: Mission(mission_id = 48, type="prime", target="column", number=0, description="どこかの列の数がすべてが素数"),
    49: Mission(mission_id = 49, type="prime", target="allCell", number=0, description="盤面上に素数が4つ以上存在"),
}


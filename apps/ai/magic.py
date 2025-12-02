# -*- coding: utf-8 -*-
from dataclasses import dataclass, field
from typing import List, Optional, Dict, Tuple
import random
from missions import Mission, MISSIONS

# ==== 勝利判定 ====
# ---------------------------
# 汎用ユーティリティ
# ---------------------------

def is_prime(n: Optional[int]) -> bool:
    if n is None or n < 2:
        return False
    if n % 2 == 0:
        return n == 2
    i = 3
    while i * i <= n:
        if n % i == 0:
            return False
        i += 2
    return True


def all_lines(board: List[List[Optional[int]]]) -> Tuple[List[List[Optional[int]]],
                                                         List[List[Optional[int]]],
                                                         List[List[Optional[int]]]]:
    """行・列・対角線を返す（rows, cols, diags）。"""
    n = len(board)
    rows = [board[r][:] for r in range(n)]
    cols =[[board[r][c] for r in range(n)] for c in range(n)]
    diags = [
        [board[i][i] for i in range(n)],
        [board[i][n - 1 - i] for i in range(n)]
    ]
    return rows, cols, diags


# ---------------------------
# ライン単位の判定（row/column/diagonal）
# ---------------------------

def is_winner_line(line: List[Optional[int]], m: Mission) -> bool:
    """1本の行/列/斜めに対して、Missionを満たすかを判定。"""
    # 未配置(None)が含まれるラインは未達成扱い（magic.ts準拠）
    if any(v is None for v in line):
        return False

    vals = [int(v) for v in line]  # None なし確定

    if m.type == "sum":
        return sum(vals) == m.number

    if m.type == "multipile":  # typoに合わせる（=multiple）
        div = m.number
        if div == 0:
            return False
        return all(v % div == 0 for v in vals)

    if m.type == "arithmetic":
        # 公差固定（number>0）か、任意の等差（number==0）
        d = vals[1] - vals[0]
        is_arith = all(vals[i+1] - vals[i] == d for i in range(len(vals)-1))
        if not is_arith:
            return False
        return (m.number == 0) or (abs(d) == m.number)

    if m.type == "geometic":   # typoに合わせる（=geometric）
        # 0 や非整数比をどう扱うかは仕様次第：ここでは厳密に等比（割り算一致）で判定
        if 0 in vals:
            return False
        r_num = vals[1] * 1.0 / vals[0]
        is_geom = all((vals[i+1] * 1.0 / vals[i]) == r_num for i in range(len(vals)-1))
        if not is_geom:
            return False
        return (m.number == 0) or (r_num == float(m.number)) or (1/r_num == float(m.number))

    if m.type == "prime":
        return all(is_prime(v) for v in vals)

    return False


# ---------------------------
# 盤全体の判定（allCell 系）
# ---------------------------

def count_cells_pred(board: List[List[Optional[int]]], pred) -> int:
    """盤全体で pred(cell_value) を満たすセル数を数える（Noneは無視）。"""
    n = len(board)
    cnt = 0
    for r in range(n):
        for c in range(n):
            v = board[r][c]
            if v is not None and pred(v):
                cnt += 1
    return cnt


def is_winner_allcell(board: List[List[Optional[int]]], m: Mission,
                      threshold: int = 4) -> bool:
    """
    allCell タイプの判定。
    mission.ts の記述は「◯の倍数が4つ以上」「素数が4つ以上」なので、既定しきい値=4。
    変更したい場合は threshold を渡してください。
    """
    if m.type == "multipile":
        div = m.number
        if div == 0:
            return False
        return count_cells_pred(board, lambda v: v % div == 0) >= threshold

    if m.type == "prime":
        return count_cells_pred(board, is_prime) >= threshold

    # allCell で sum/arithmetic/geometic は通常登場しない前提
    return False


# ---------------------------
# 総合勝利判定
# ---------------------------

def is_victory(board: List[List[Optional[int]]], mission: Mission) -> bool:
    """
    board が mission を満たしているか（誰かが勝利条件を満たしたか）を判定。
    - 行/列/対角線: ライン単位で is_winner_line
    - allDirection: 行/列/対角線のいずれかが達成でOK
    - allCell: 盤全体のセル数カウントで判定
    """
    rows, cols, diags = all_lines(board)

    if mission.target == "row":
        return any(is_winner_line(line, mission) for line in rows)

    if mission.target == "column":
        return any(is_winner_line(line, mission) for line in cols)

    if mission.target == "diagonal":
        return any(is_winner_line(line, mission) for line in diags)

    if mission.target == "allDirection":
        for group in (rows, cols, diags):
            if any(is_winner_line(line, mission) for line in group):
                return True
        return False

    if mission.target == "allCell":
        return is_winner_allcell(board, mission, threshold=4)

    # 想定外の target
    return False


# ==== ルール・状態 ====
@dataclass
class Rules:
    board_size: int = 3
    negative_disabled: bool = True     # 減算で負値を禁止（magic.ts 準拠で絶対値相当の分岐）

@dataclass
class GameState:
    players: List[str]                         # プレイヤーID（または名前）
    board: List[List[Optional[int]]]           # None=未配置
    hands: Dict[int, List[int]]                # key: player_index, value: 手札（例: [1,3,4]）
    missions: Dict[int, Mission]               # 各プレイヤーの個別ミッション
    turn: int                                  # いまの手番（players の index）
    round: int                                 # ラウンド数（任意）
    rules: Rules
    winners: List[int] = field(default_factory=list)

# ==== 核となるセル計算と合法手チェック ====
def compute_cell_result(prev: Optional[int], num: int, op: str, neg_disabled: bool) -> int:
    """加算/減算の結果を返す。neg_disabled=True の減算は |prev - num| 相当。"""
    if prev is None:
        return num
    if op == "add":
        return prev + num
    # op == "sub"
    if not neg_disabled:
        return prev - num
    # 負禁止：magic.ts の動作に合わせる（差の絶対値）
    return abs(prev - num)

def is_valid_move(s: GameState, pid: int, x: int, y: int, num_index: int, op: str) -> bool:
    if pid != s.turn:
        return False
    n = s.rules.board_size
    if not (0 <= x < n and 0 <= y < n):
        return False
    
    """
    if s.board[y][x] is not None:
        return False
    """

    hand = s.hands.get(pid, [])
    if not (0 <= num_index < len(hand)):
        return False
    if op not in ("add", "sub"):
        return False
    # neg_disabled の場合、prev=None なのでここで追加チェックは特に不要
    return True

# ==== ゲーム開始（初期化） ====
def start_game(player_ids: List[str],
               rules: Rules,
               missions_pool: Dict[str, Mission] = MISSIONS,
               mission_id = False,
               initial_cards: int = 3) -> GameState:
    """
    - 盤を空で初期化
    - 各プレイヤーに初期手札（1〜4）を配る
    - 各プレイヤーにミッションをランダム配布
    - 手番は 0 番から
    """
    n = rules.board_size
    board = [[None for _ in range(n)] for _ in range(n)]
    hands: Dict[int, List[int]] = {i: [random.randint(1, 4) for _ in range(initial_cards)]
                                   for i in range(len(player_ids))}
    # ミッションはプールからランダムに（重複を許す/許さないは運用次第）
    mpool = list(missions_pool.values())
    missions: Dict[int, Mission] = {}

    if mission_id == False:
        # ランダム配布
        for i in range(len(player_ids)):
            missions[i] = random.choice(mpool)
    else:
        # mission_id がリストならそれを指定
        for i, mid in enumerate(mission_id):
            if isinstance(mid, int) and mid in missions_pool:
                missions[i] = missions_pool[mid]
            else:
                # IDが不正・足りない場合
                raise ValueError("missions_idが不正")
        # プレイヤー数より短い場合は残りもランダムで補完
        for i in range(len(mission_id), len(player_ids)):
            missions[i] = random.choice(mpool)

    return GameState(
        players=player_ids[:],
        board=board,
        hands=hands,
        missions=missions,
        turn=0,
        round=0,
        rules=rules,
        winners=[]
    )

# ==== 着手（手の適用） ====
def make_move(s: GameState, pid: int, x: int, y: int, num_index: int, op: str) -> Tuple[bool, Optional[List[int]]]:
    """
    指し手を適用する。
    引数:
      pid: 手番プレイヤー index
      x, y: 置き先
      num_index: 手札のどのカードを使うか（インデックス）
      op: "add" | "sub"

    戻り値:
      (ok, winners)
        ok: 合法手なら True（反映済み）、不正なら False（状態は不変）
        winners: 勝者が出た場合はプレイヤー index のリスト（なければ None）
    """
    # 1) 合法性チェック
    if not is_valid_move(s, pid, x, y, num_index, op):
        return False, None

    # 2) セル更新
    num = s.hands[pid][num_index]
    prev = s.board[y][x]
    s.board[y][x] = compute_cell_result(prev, num, op, s.rules.negative_disabled)

    # 3) 手札の消費→補充（1〜4）
    s.hands[pid].pop(num_index)
    new_hand = random.randint(0, 4)
    s.hands[pid].append(max(1,new_hand))

    # 4) 勝利判定（プレイヤーごとの個別ミッション）
    winners_now: List[int] = []
    for pidx in range(len(s.players)):
        if is_victory(s.board, s.missions[pidx]):
            winners_now.append(pidx)

    if winners_now:
        s.winners = winners_now[:]   # 必要なら蓄積・重複排除など
        # 手番やラウンドの進行はゲーム設計に応じて停止/継続を決める
        # ここでは勝者が出てもいったん turn は進める例を示す
    # 5) 手番進行
    s.turn = (s.turn + 1) % len(s.players)
    if s.turn == 0:
        s.round += 1

    return True, (winners_now if winners_now else None)


# ===========================
# 使い方サンプル
# ===========================

if __name__ == "__main__":
    random.seed(42)  # 再現性のため
    rules = Rules(board_size=3, negative_disabled=True)
    state = start_game(["P0", "P1"], rules, mission_id=[1,0])
    state.board = [[5, 5, 0], [None, None, None], [None, None, None]]
    # 例: P1 が (0,0) に手札0番を add
    print("board:", state.board)
    print("P0 hand:", state.hands[0], "P1 hand:", state.hands[1])
    print("turn:", state.turn, "round:", state.round)

    ok, winner = make_move(s=state, pid=0, x=0, y=0, num_index=0, op="add") 
    print("board:", state.board)
    print(ok,winner)
    print(state.missions)
    print(all_lines(state.board))


if __name__ == "__main__":
    mis = MISSIONS[43]
    board = [[4, 6, 11], [None, None, None], [None, None, None]]
    print(is_victory(board,mis))




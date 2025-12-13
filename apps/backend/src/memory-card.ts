import type { EventCard, FunctionCard, MemoryCard } from "./memory.ts";

export const memoryCards: Record<
	MemoryCard["definitionId"],
	Omit<MemoryCard, "definitionId">
> = {
	mc1: {
		shape: [
			[1, 1],
			[0, 1],
		],
		cost: 3,
	},
	mc2: {
		shape: [
			[1, 1, 1],
			[0, 1, 0],
		],
		cost: 4,
	},
	mc3: {
		shape: [
			[0, 1],
			[1, 1],
			[1, 0],
		],
		cost: 4,
	},
	mc4: {
		shape: [
			[1, 1],
			[1, 1],
		],
		cost: 4,
	},
	mc5: {
		shape: [
			[1, 1],
			[1, 1],
		],
		cost: 4,
	},
	mc6: {
		shape: [[1], [1], [1]],
		cost: 3,
	},
	mc7: {
		shape: [
			[1, 0],
			[1, 1],
		],
		cost: 3,
	},
};

export const functionCards: Record<
	FunctionCard["definitionId"],
	Omit<FunctionCard, "definitionId">
> = {
	fc1: {
		shape: [
			[1, 1, 1],
			[1, 1, 0],
		],
		cost: 4,
	},
	fc2: {
		shape: [
			[1, 1],
			[1, 1],
			[1, 0],
		],
		cost: 5,
	},
};

export const eventCards: Record<
	EventCard["definitionId"],
	Omit<EventCard, "definitionId">
> = {
	// === メモリ破壊・解放系 ===
	ec_destroy_any_one: {
		description: "指定した1×1のメモリを破壊して解放",
		effect: { type: "destroy-memory", area: "any-one" },
	},
	ec_destroy_any_2by2: {
		description: "指定した2×2エリアのメモリを破壊して解放",
		effect: { type: "destroy-memory", area: "any-2by2" },
	},
	ec_destroy_any_3by3: {
		description: "指定した3×3エリアのメモリを破壊して解放",
		effect: { type: "destroy-memory", area: "any-3by3" },
	},
	ec_destroy_center_2by2: {
		description: "中央2×2エリアのメモリを破壊して解放",
		effect: { type: "destroy-memory", area: "center-2by2" },
	},
	ec_destroy_center_3by3: {
		description: "中央3×3エリアのメモリを破壊して解放",
		effect: { type: "destroy-memory", area: "center-3by3" },
	},
	ec_destroy_peripheral: {
		description: "周辺エリアのメモリを破壊して解放",
		effect: { type: "destroy-memory", area: "peripheral" },
	},
	ec_free_any_one: {
		description: "指定した1×1の使用済みメモリを解放",
		effect: { type: "free-memory", area: "any-one" },
	},
	ec_free_any_2by2: {
		description: "指定した2×2エリアの使用済みメモリを解放",
		effect: { type: "free-memory", area: "any-2by2" },
	},
	ec_free_any_3by3: {
		description: "指定した3×3エリアの使用済みメモリを解放",
		effect: { type: "free-memory", area: "any-3by3" },
	},
	ec_free_center_2by2: {
		description: "中央2×2エリアの使用済みメモリを解放",
		effect: { type: "free-memory", area: "center-2by2" },
	},
	ec_free_center_3by3: {
		description: "中央3×3エリアの使用済みメモリを解放",
		effect: { type: "free-memory", area: "center-3by3" },
	},
	ec_free_peripheral: {
		description: "周辺エリアの使用済みメモリを解放",
		effect: { type: "free-memory", area: "peripheral" },
	},

	// === 手札リセット系 ===
	ec_reset_self_memory: {
		description: "自分のメモリカードの手札をリセット",
		effect: { type: "reset-memory-hand", target: "self" },
	},
	ec_reset_opponent_memory: {
		description: "相手1人のメモリカードの手札をリセット",
		effect: { type: "reset-memory-hand", target: "any-one-opponent" },
	},
	ec_reset_all_opponents_memory: {
		description: "全ての相手のメモリカードの手札をリセット",
		effect: { type: "reset-memory-hand", target: "all-opponents" },
	},
	ec_reset_self_function: {
		description: "自分の関数カードの手札をリセット",
		effect: { type: "reset-function-hand", target: "self" },
	},
	ec_reset_opponent_function: {
		description: "相手1人の関数カードの手札をリセット",
		effect: { type: "reset-function-hand", target: "any-one-opponent" },
	},
	ec_reset_all_opponents_function: {
		description: "全ての相手の関数カードの手札をリセット",
		effect: { type: "reset-function-hand", target: "all-opponents" },
	},

	// === 関数カードドロー系 ===
	ec_draw_function_1: {
		description: "関数カード1枚を引く",
		effect: { type: "draw-more-function-cards", count: 1 },
	},
	ec_draw_function_2: {
		description: "関数カード2枚を引く",
		effect: { type: "draw-more-function-cards", count: 2 },
	},

	// === プレイヤー凍結系 ===
	ec_freeze_one_1turn: {
		description: "相手1人を1ターン凍結",
		effect: { type: "freeze-player", target: "any-one-opponent", turns: 1 },
	},
	ec_freeze_all_1turn: {
		description: "全ての相手を1ターン凍結",
		effect: { type: "freeze-player", target: "all-opponents", turns: 1 },
	},

	// === ポイント2倍系 ===
	ec_double_self_2turns: {
		description: "次の2ターン、自分の獲得ポイントが2倍",
		effect: { type: "double-points", target: "self", turns: 2 },
	},
	ec_double_all_2turns: {
		description: "次の2ターン、全員の獲得ポイントが2倍",
		effect: { type: "double-points", target: "all", turns: 2 },
	},

	// === Use-After-Free系 ===
	ec_uaf_3: {
		description: "最大3マスの解放済みセルで関数カードを実行可能",
		effect: { type: "use-after-free", count: 3 },
	},
	ec_uaf_5: {
		description: "最大5マスの解放済みセルで関数カードを実行可能",
		effect: { type: "use-after-free", count: 5 },
	},
};

import type { EventCard, FunctionCard, MemoryCard } from "./memory.ts";

export const memoryCards: Record<string, MemoryCard> = {
	mc1: {
		shape: [
			[1, 1, 0],
			[0, 1, 0],
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

export const functionCards: Record<string, FunctionCard> = {
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

export const eventCards: Record<string, EventCard> = {
	ec1: {
		description: "指定した1×1メモリを破壊",
	},
	ec2: {
		description: "指定した1×1メモリを解放",
	},
};

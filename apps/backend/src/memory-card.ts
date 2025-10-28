import type { EventCard, FunctionCard, MemoryCard } from "./memory.ts";

export const memoryCards: MemoryCard[] = [
	{
		id: "mc1",
		shape: [
			[1, 1, 0],
			[0, 1, 0],
		],
		cost: 3,
	},
	{
		id: "mc2",
		shape: [
			[1, 1, 1],
			[0, 1, 0],
		],
		cost: 4,
	},
	{
		id: "mc3",
		shape: [
			[0, 1],
			[1, 1],
			[1, 0],
		],
		cost: 4,
	},
	{
		id: "mc4",
		shape: [
			[1, 1],
			[1, 1],
		],
		cost: 4,
	},
	{
		id: "mc5",
		shape: [[1, 1, 1]],
		cost: 3,
	},
	{
		id: "mc6",
		shape: [[1], [1], [1]],
		cost: 3,
	},
	{
		id: "mc7",
		shape: [
			[1, 0],
			[1, 1],
		],
		cost: 3,
	},
];

export const functionCards: FunctionCard[] = [
	{
		id: "fc1",
		shape: [
			[1, 1, 1],
			[1, 1, 0],
		],
		cost: 4,
	},
	{
		id: "fc2",
		shape: [
			[1, 1],
			[1, 1],
			[1, 0],
		],
		cost: 5,
	},
];

export const eventCards: EventCard[] = [
	{
		id: "ec1",
		description: "指定した1×1メモリを破壊",
	},
	{
		id: "ec2",
		description: "指定した1×1メモリを解放",
	},
];

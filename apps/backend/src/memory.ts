import type { Env } from "hono/types";
import { functionCards, memoryCards } from "./memory-card";
// import { type Mission, missions } from "./mission";
import { RoomMatch, type RoomState } from "./room";

// --- Game-specific Types ---

let timeout: ReturnType<typeof setTimeout>;

type ReserveMemoryAction = {
	memoryCardId: string;
	x: number;
	y: number;
};

type ExecFunctionAction = {
	functionCardId: string;
	x: number;
	y: number;
};

type ExecEventAction = {
	eventCardId: string;
};

type Rule =
	| { rule: "boardSize"; state: number }
	| { rule: "timeLimit"; state: number };

type CellState =
	| { status: "free" }
	| { status: "reserved"; occupiedBy: string }
	| { status: "used"; occupiedBy: string };

type Hand = {
	memory: {
		[memoryId: string]: MemoryCard;
	};
	func: {
		[functionId: string]: FunctionCard;
	};
	event: {
		[eventId: string]: EventCard;
	};
};

export type MemoryCard = {
	definitionId: string;
	shape: (0 | 1)[][];
	cost: number;
};

export type FunctionCard = {
	definitionId: string;
	shape: (0 | 1)[][];
	cost: number;
};

export type EventCard = {
	definitionId: string;
	description: string;
};

// GameState extends RoomState to include game-specific properties
export type GameState = RoomState & {
	round: number;
	turn: number;
	board: CellState[][];
	winners: string[] | null;
	gameId: string;
	hands: {
		[playerId: string]: Hand;
	};
	clocks: { [playerId: string]: number };
	points: { [playerId: string]: number };
	timeLimitUnix: number;
};

// Combined message types for both room and game actions
export type MessageType =
	| { type: "reserveMemory"; payload: ReserveMemoryAction }
	| { type: "execFunction"; payload: ExecFunctionAction }
	| { type: "execEvent"; payload: ExecEventAction }
	| { type: "setReady"; payload?: undefined }
	| { type: "cancelReady"; payload?: undefined }
	| { type: "changeRule"; payload: Rule }
	| { type: "pass"; payload?: undefined }
	| { type: "backToLobby"; payload?: undefined }
	| { type: "removePlayer"; payload?: undefined };

const DEFAULT_BOARD_SIZE = 6;
const DEFAULT_TIME_LIMIT_MS = 10000;

export class Memory extends RoomMatch<GameState> {
	constructor(ctx: DurableObjectState, env: Env) {
		super(ctx, env);
		this.state = undefined; // Initialize state, will be loaded in super's constructor
	}

	async wsMessageListener(
		ws: WebSocket,
		message: MessageEvent,
		playerId: string,
	) {
		try {
			const { type, payload } = JSON.parse(
				message.data as string,
			) as MessageType;
			switch (type) {
				// Game actions
				case "reserveMemory":
					await this.reserveMemory(
						playerId,
						payload.x,
						payload.y,
						payload.memoryCardId,
					);
					break;
				case "execFunction":
					await this.execFunction(
						playerId,
						payload.x,
						payload.y,
						payload.functionCardId,
					);
					break;
				case "execEvent":
					await this.execEvent(playerId, payload.eventCardId);
					break;
				case "pass":
					await this.pass();
					break;
				// Room actions (from base class)
				case "setReady":
					await this.setReady(playerId);
					break;
				case "cancelReady":
					await this.cancelReady(playerId);
					break;
				case "changeRule":
					// await this.changeRule(payload);
					break;
				case "removePlayer":
					await this.removePlayer(playerId);
					break;
				case "backToLobby":
					await this.backToLobby(playerId);
					break;
				default:
					throw new Error(`Unhandled message type: ${type}`);
			}
		} catch {
			ws.send(JSON.stringify({ error: "Invalid message" }));
		}
	}

	// called once when the Durable Object is first created
	async initialize() {
		this.state = {
			// RoomState properties
			status: "preparing",
			players: [],
			playerStatus: {},
			names: {},
			rules: {
				negativeDisabled: false,
				boardSize: DEFAULT_BOARD_SIZE,
				timeLimit: DEFAULT_TIME_LIMIT_MS / 1000,
			},
			// GameState specific properties
			round: 0,
			turn: 0,
			board: [],
			winners: null,
			gameId: this.ctx.id.toString(),
			hands: {},
			clocks: {},
			points: {},
			timeLimitUnix: Date.now() + DEFAULT_TIME_LIMIT_MS,
		};
		await this.ctx.storage.put("gameState", this.state);
		this.broadcast({ type: "state", payload: this.state });
	}

	// async changeRule(payload: Rule) {
	// 	if (!this.state || this.state.status !== "preparing") return;

	// 	if (payload.rule === "negativeDisabled") {
	// 		this.state.rules.negativeDisabled = payload.state;
	// 	} else if (payload.rule === "boardSize") {
	// 		this.state.rules.boardSize = payload.state;
	// 		this.state.board = Array(payload.state)
	// 			.fill(null)
	// 			.map(() => Array(payload.state).fill(null));
	// 	} else if (payload.rule === "timeLimit") {
	// 		this.state.rules.timeLimit = payload.state;
	// 	}
	// 	await this.ctx.storage.put("gameState", this.state);
	// 	this.broadcast({ type: "state", payload: this.state });
	// }

	override async startGame(): Promise<void> {
		if (!this.state || this.state.status !== "preparing") return;
		// The original implementation called a method to clear parts of the state.
		// We will replicate that behavior by resetting the game-specific state here.
		const size = this.state.rules.boardSize;
		this.state.board = Array(size)
			.fill(null)
			.map(() => Array(size).fill(null));
		this.state.round = 0;
		this.state.turn = 0;
		this.state.winners = null;
		this.state.hands = {};
		this.state.clocks = {};
		this.state.points = {};

		for (const playerId of this.state.players) {
			if (this.state.playerStatus[playerId] !== "ready") {
				console.error("one of the players not ready:", playerId);
				return;
			}
			this.state.playerStatus[playerId] = "playing";

			if (this.state.hands[playerId]) {
				console.error("player already has a hand:", playerId);
				return;
			}
			this.state.hands[playerId] = this.drawInitialHand();
		}
		this.state.status = "playing";
		this.state.timeLimitUnix = Date.now() + this.state.rules.timeLimit * 1000;
		clearTimeout(timeout);
		timeout = setTimeout(() => {
			this.pass();
		}, this.state.rules.timeLimit * 1000);

		await this.ctx.storage.put("gameState", this.state);
		this.broadcast({ type: "state", payload: this.state });
	}

	// --- Game-specific Methods ---

	drawInitialHand() {
		if (!this.state) throw new Error("Game state is not initialized");
		const memoryHands: Record<string, MemoryCard> = {};
		for (let i = 0; i < 3; i++) {
			const { id, card } = this.drawMemoryCard();
			memoryHands[id] = card;
		}
		const { id, card: functionCard } = this.getFunctionCard();
		const hand: Hand = {
			memory: memoryHands,
			func: {
				[id]: functionCard,
			},
			event: {}, // TODO: 初期手札を調整可能にする
		};
		return hand;
	}

	// TODO: 調整可能にする
	drawMemoryCard(): { id: string; card: MemoryCard } {
		const key = Object.keys(memoryCards);
		const randomKey = key[Math.floor(Math.random() * key.length)];
		return {
			id: Math.random().toString(36),
			card: { definitionId: randomKey, ...memoryCards[randomKey] },
		};
	}

	// TODO: ミッションの重複を避ける
	getFunctionCard(): { id: string; card: FunctionCard } {
		const key = Object.keys(functionCards);
		const randomKey = key[Math.floor(Math.random() * key.length)];
		return {
			id: Math.random().toString(36),
			card: { definitionId: randomKey, ...functionCards[randomKey] },
		};
	}

	advanceTurnAndRound() {
		if (!this.state) return;

		const players = this.state.players;
		const playerStatuses = this.state.playerStatus;
		const currentTurn = this.state.turn;

		const activePlayerIds = players.filter(
			(p) => playerStatuses[p] === "playing",
		);
		if (activePlayerIds.length === 0) {
			this.state.status = "paused";
			return; // No one to advance turn to.
		}

		const currentPlayerId = players[currentTurn];

		// Find the index of the current player in the list of *active* players.
		// If the current player is not active (e.g., a watcher), this will be -1.
		const currentPlayerActiveIndex = activePlayerIds.indexOf(currentPlayerId);

		let nextPlayerId: string | null = null;

		if (currentPlayerActiveIndex === -1) {
			// The turn was on an inactive player. Find the first active player after the current one.
			let nextTurn = currentTurn;
			for (let i = 0; i < players.length; i++) {
				nextTurn = (nextTurn + 1) % players.length;
				if (playerStatuses[players[nextTurn]] === "playing") {
					nextPlayerId = players[nextTurn];
					break;
				}
			}
			if (!nextPlayerId) {
				// Should be unreachable due to activePlayerIds.length check
				this.state.status = "paused";
				return;
			}
		} else {
			// The current player is active. Find the next one in the active list.
			const nextPlayerActiveIndex =
				(currentPlayerActiveIndex + 1) % activePlayerIds.length;
			nextPlayerId = activePlayerIds[nextPlayerActiveIndex];

			// If we wrapped around the active players list, increment the round.
			if (nextPlayerActiveIndex === 0) {
				this.state.round += 1;
			}
		}

		if (nextPlayerId) {
			this.state.turn = players.indexOf(nextPlayerId);
		}
	}

	async reserveMemory(
		playerId: string,
		x: number,
		y: number,
		memoryCardId: string,
	) {
		console.log("reserveMemory called", playerId, x, y, memoryCardId);
		if (!this.state || this.state.winners) return;

		if (!this.isValidMove(playerId, x, y, memoryCardId, "memory")) {
			console.error("Invalid move attempted:", playerId, x, y, memoryCardId);
			return;
		}

		console.log("Making move:", playerId, x, y, memoryCardId);

		const card = memoryCards[memoryCardId];
		if (!card) {
			console.error("Memory card not found during occupy:", memoryCardId);
			return;
		}

		this.mutateBoard(playerId, x, y, "memory", card.shape);

		this.advanceTurnAndRound();

		delete this.state.hands[playerId].memory[memoryCardId];
		const { id, card: newCard } = this.drawMemoryCard();
		this.state.hands[playerId].memory[id] = newCard;

		this.state.clocks[playerId] -= card.cost;

		// for (const id of this.state.players) {
		// 	if (this.state.missions[id]) {
		// 		const winary = this.isVictory(this.state.missions[id].mission);
		// 		if (winary.some((row) => row.includes(true))) {
		// 			if (!this.state) throw new Error("Game state is not initialized");
		// 			this.state.winnersAry[id] = winary;
		// 			if (!this.state.winners) {
		// 				this.state.winners = [id];
		// 			} else if (!this.state.winners.includes(id)) {
		// 				this.state.winners.push(id);
		// 			}
		// 			console.log("winary", winary);
		// 			console.log("this.state.winnersAry", this.state.winnersAry);
		// 		}
		// 	}
		// }

		if (this.state.winners) {
			this.state.status = "preparing";
			Object.keys(this.state.playerStatus).forEach((playerId) => {
				if (!this.state) throw new Error("Game state is not initialized");
				this.state.playerStatus[playerId] = "finished";
			});
		}
		this.state.timeLimitUnix = Date.now() + this.state.rules.timeLimit * 1000;
		clearTimeout(timeout);
		if (!this.state.winners)
			timeout = setTimeout(() => {
				this.pass();
			}, this.state.rules.timeLimit * 1000);
		await this.ctx.storage.put("gameState", this.state);
		this.broadcast({ type: "state", payload: this.state });
	}

	// TODO
	async execFunction(
		playerId: string,
		x: number,
		y: number,
		functionCardId: string,
	) {
		console.log("execFunction called", playerId, functionCardId);

		if (!this.state) throw new Error("Game state is not initialized");

		if (!this.isValidMove(playerId, x, y, functionCardId, "function")) {
			console.error("Invalid move attempted:", playerId, functionCardId);
			return;
		}

		const card = functionCards[functionCardId];

		this.mutateBoard(playerId, x, y, "function", card.shape);
		this.advanceTurnAndRound();

		delete this.state.hands[playerId].func[functionCardId];
		const { id, card: newCard } = this.getFunctionCard();
		this.state.hands[playerId].func[id] = newCard;

		this.state.clocks[playerId] -= card.cost;

		// TODO: ポイント加算ロジックを調整する
		this.state.points[playerId] += card.cost;

		this.state.timeLimitUnix = Date.now() + this.state.rules.timeLimit * 1000;
		clearTimeout(timeout);
		timeout = setTimeout(() => {
			this.pass();
		}, this.state.rules.timeLimit * 1000);

		await this.ctx.storage.put("gameState", this.state);
		this.broadcast({ type: "state", payload: this.state });
	}

	execEvent(playerId: string, eventCardId: string) {
		console.log("execEvent called", playerId, eventCardId);
	}

	async pass() {
		if (!this.state) return;
		this.advanceTurnAndRound();
		this.state.timeLimitUnix = Date.now() + this.state.rules.timeLimit * 1000;
		clearTimeout(timeout);
		timeout = setTimeout(() => {
			this.pass();
		}, this.state.rules.timeLimit * 1000);
		await this.ctx.storage.put("gameState", this.state);
		this.broadcast({ type: "state", payload: this.state });
	}

	isValidMove(
		player: string,
		x: number,
		y: number,
		CardId: string,
		type: "memory" | "function" | "event",
	): boolean {
		if (!this.state) throw new Error("Game state is not initialized");

		const currentPlayer = this.state.players[this.state.turn];
		if (currentPlayer !== player) {
			console.error("Not your turn:", player);
			return false;
		}

		const currentHand = this.state.hands[currentPlayer];
		if (!currentHand) {
			console.error("Invalid hand:", currentPlayer);
			return false;
		}

		// TODO: もっと詳しくバリデーションを書く
		switch (type) {
			case "memory": {
				const card = memoryCards[CardId];
				if (!card) {
					console.error("Memory card not found:", CardId);
					return false;
				}

				if (!currentHand.memory[CardId]) {
					console.error("Card not in hand:", CardId);
					return false;
				}

				if (this.state.clocks[player] < card.cost) {
					console.error("Not enough clock:", player, card.cost);
					return false;
				}

				const boardWidth = this.state.board[0].length;
				const boardHeight = this.state.board.length;

				const cardWidth = card.shape[0].length;
				const cardHeight = card.shape.length;

				if (
					x < 0 ||
					y < 0 ||
					x + cardWidth > boardWidth ||
					y + cardHeight > boardHeight
				) {
					console.error("Out of bounds:", x, y);
					return false;
				}

				for (let dy = 0; dy < cardHeight; dy++) {
					for (let dx = 0; dx < cardWidth; dx++) {
						if (card.shape[dy][dx] === 1) {
							const boardCell = this.state.board[y + dy][x + dx];
							if (!boardCell || boardCell.status !== "free") {
								console.error("Cell already used:", x + dx, y + dy);
								return false;
							}
						}
					}
				}
				break;
			}
			case "function": {
				const card = functionCards[CardId];
				if (!card) {
					console.error("Function card not found:", CardId);
					return false;
				}

				if (!currentHand.func[CardId]) {
					console.error("Card not in hand:", CardId);
					return false;
				}

				if (this.state.clocks[player] < card.cost) {
					console.error("Not enough clock:", player, card.cost);
					return false;
				}

				const boardWidth = this.state.board[0].length;
				const boardHeight = this.state.board.length;

				const cardWidth = card.shape[0].length;
				const cardHeight = card.shape.length;

				if (
					x < 0 ||
					y < 0 ||
					x + cardWidth > boardWidth ||
					y + cardHeight > boardHeight
				) {
					console.error("Out of bounds:", x, y);
					return false;
				}

				for (let dy = 0; dy < cardHeight; dy++) {
					for (let dx = 0; dx < cardWidth; dx++) {
						if (card.shape[dy][dx] === 1) {
							const boardCell = this.state.board[y + dy][x + dx];
							if (
								!boardCell ||
								boardCell.status !== "reserved" ||
								boardCell.occupiedBy !== player
							) {
								console.error("Cell already used:", x + dx, y + dy);
								return false;
							}
						}
					}
				}

				break;
			}
			case "event": {
				break;
			}
			default:
				return type satisfies never;
		}

		return true;
	}

	mutateBoard(
		playerId: string,
		x: number,
		y: number,
		type: "memory" | "function" | "event",
		cardShape?: (0 | 1)[][],
	) {
		if (!this.state) throw new Error("Game state is not initialized");
		if (!cardShape) {
			throw new Error("Card shape is required for memory type");
		}
		switch (type) {
			case "memory": {
				for (let dy = 0; dy < cardShape.length; dy++) {
					for (let dx = 0; dx < cardShape[dy].length; dx++) {
						if (cardShape[dy][dx] === 1) {
							this.state.board[y + dy][x + dx] = {
								status: "reserved",
								occupiedBy: playerId,
							};
						}
					}
				}
				break;
			}
			case "function": {
				for (let dy = 0; dy < cardShape.length; dy++) {
					for (let dx = 0; dx < cardShape[dy].length; dx++) {
						if (cardShape[dy][dx] === 1) {
							this.state.board[y + dy][x + dx] = {
								status: "used",
								occupiedBy: playerId,
							};
						}
					}
				}
				break;
			}
			case "event": {
				break;
			}
			default:
				return type satisfies never;
		}
	}
}

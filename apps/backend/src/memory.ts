import type { Env } from "hono/types";
import { eventCards, functionCards, memoryCards } from "./memory-card";
// import { type Mission, missions } from "./mission";
import { RoomMatch, type RoomState } from "./room";

// --- Game-specific Types ---

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
	x?: number; // single-cell や area の場合の起点X座標
	y?: number; // single-cell や area の場合の起点Y座標
	targetPlayerId?: string; // player ターゲットの場合
};

type Rule =
	| { rule: "boardSize"; state: number }
	| { rule: "timeLimit"; state: number };

export type CellState =
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
	effect: EventEffectType;
};

type EventEffectType =
	| {
			type: "destroy-memory";
			area:
				| "any-3by3"
				| "any-2by2"
				| "any-one"
				| "peripheral"
				| "center-2by2"
				| "center-3by3";
	  } // used & reserved memory -> free (requires x, y for "any-*")
	| {
			type: "free-memory";
			area:
				| "any-3by3"
				| "any-2by2"
				| "any-one"
				| "peripheral"
				| "center-2by2"
				| "center-3by3";
	  } // only used memory -> free (requires x, y for "any-*")
	| {
			type: "reset-memory-hand";
			target: "self" | "any-one-opponent" | "all-opponents";
	  }
	| {
			type: "reset-function-hand";
			target: "self" | "any-one-opponent" | "all-opponents";
	  }
	| {
			type: "draw-more-function-cards";
			count: number;
	  }
	| {
			type: "freeze-player";
			target: "any-one-opponent" | "all-opponents";
			turns: number;
	  } // cannot play for specified turns
	| {
			type: "double-points";
			target: "self" | "all";
			turns: number;
	  } // double points for specified turns
	| { type: "use-after-free"; count: number }; // can execute function cards on at most specified number of free cells

// GameState extends RoomState to include game-specific properties
export type GameState = RoomState & {
	rules: {
		boardSize: number;
		timeLimit: number;
	};
	round: number;
	currentPlayerIndex: number; // index in players, including spectators
	board: CellState[][];
	winners: string[] | null;
	gameId: string;
	hands: {
		[playerId: string]: Hand;
	};
	clocks: { [playerId: string]: number };
	points: { [playerId: string]: number };
	colors: { [playerId: string]: string };
	timeLimitUnix: number;
	timeoutId?: ReturnType<typeof setTimeout>;
	activeEffects: {
		[playerId: string]: {
			frozen?: number; // turns remaining
			doublePoints?: number; // turns remaining
			useAfterFree?: number; // count of free cells that can be used
		};
	};
};

// Combined message types for both room and game actions
export type MessageType =
	| { type: "reserveMemory"; payload: ReserveMemoryAction }
	| { type: "execFunction"; payload: ExecFunctionAction }
	| { type: "execEvent"; payload: ExecEventAction }
	| { type: "buyEventCard"; payload?: undefined }
	| { type: "setReady"; payload?: undefined }
	| { type: "cancelReady"; payload?: undefined }
	| { type: "changeRule"; payload: Rule }
	| { type: "pass"; payload?: undefined }
	| { type: "backToLobby"; payload?: undefined }
	| { type: "removePlayer"; payload?: undefined };

const DEFAULT_BOARD_SIZE = 6;
const DEFAULT_TIME_LIMIT_MS = 10000;
const COLOR_PALETTE = [
	"#00cc00",
	"#cccc00",
	"#00cccc",
	"#cc0000",
	"#0000cc",
	"#cc00cc",
	"#cc5600",
	"#80409c",
	"#512d10",
	"#000000",
];

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

			// Check if player is frozen before allowing game actions
			if (
				this.state?.activeEffects[playerId]?.frozen &&
				(type === "reserveMemory" ||
					type === "execFunction" ||
					type === "execEvent" ||
					type === "buyEventCard")
			) {
				console.log("Player is frozen and cannot perform actions:", playerId);
				return;
			}

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
					await this.execEvent(
						playerId,
						payload.eventCardId,
						payload.x,
						payload.y,
						payload.targetPlayerId,
					);
					break;
				case "buyEventCard":
					await this.buyEventCard(playerId);
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
				boardSize: DEFAULT_BOARD_SIZE,
				timeLimit: DEFAULT_TIME_LIMIT_MS / 1000,
			},
			// GameState specific properties
			round: 0,
			currentPlayerIndex: 0,
			board: [],
			winners: null,
			gameId: this.ctx.id.toString(),
			hands: {},
			clocks: {},
			points: {},
			colors: {},
			timeLimitUnix: Date.now() + DEFAULT_TIME_LIMIT_MS,
			activeEffects: {},
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
		const size = this.state.rules.boardSize;
		this.state.board = Array(size)
			.fill(null)
			.map(() => Array(size).fill({ status: "free" }));
		this.state.round = 0;
		this.state.winners = null;
		this.state.hands = {};
		this.state.clocks = {};
		this.state.points = {};

		// for (let i = 0; i < this.state.rules.cpu; i++) {
		// 	const cpuId = `cpu-${i + 1}-${crypto.randomUUID()}`;
		// 	this.state.players.push({
		// 		id: cpuId,
		// 		type: "cpu",
		// 	});
		// 	this.state.names[cpuId] = `CPU ${i + 1}`;
		// 	this.state.playerStatus[cpuId] = "ready";
		// }

		for (const id of this.state.players.map((p) => p.id)) {
			const player = this.state.players.find((p) => p.id === id);
			if (!player) throw new Error(`Player not found: ${id}`);

			if (
				this.state.playerStatus[id] !== "ready" &&
				this.state.playerStatus[id] !== "spectatingReady"
			) {
				console.error("one of the players not ready:", id);
				return;
			}

			switch (this.state.playerStatus[id]) {
				case "ready":
					this.state.playerStatus[id] = "playing";
					if (player.type !== "cpu") player.type = "player";
					if (this.state.hands[id]) {
						console.error("player already has a hand:", id);
						return;
					}
					this.state.hands[id] = this.drawInitialHand();
					if (this.state.colors[id]) {
						console.error("player already has a color:", id);
						return;
					}
					this.state.colors[id] =
						COLOR_PALETTE[
							this.state.players.findIndex((player) => player.id === id)
						];
					this.state.clocks[id] = 10; //TODO: 調整可能にする
					this.state.points[id] = 0;
					break;
				case "spectatingReady":
					this.state.playerStatus[id] = "spectating";
					player.type = "spectator";
					break;
				default:
					this.state.playerStatus[id] satisfies never;
			}
			this.state.colors[id] =
				COLOR_PALETTE[
					this.state.players.findIndex((player) => player.id === id)
				];

			this.state.activeEffects[id] = {};
		}

		const firstPlayingIndex = this.state.players.findIndex(
			(p) => this.state?.playerStatus[p.id] === "playing",
		);
		this.state.currentPlayerIndex = firstPlayingIndex;
		this.state.status = "playing";
		this.state.timeLimitUnix = Date.now() + this.state.rules.timeLimit * 1000;
		clearTimeout(this.state.timeoutId);
		this.state.timeoutId = setTimeout(() => {
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

	async advanceTurnAndRound() {
		if (!this.state) return;

		const players = this.state.players;
		const currentPlayerIndex = this.state.currentPlayerIndex;

		const activePlayers = players.filter(
			(p) => p.type === "player" || p.type === "cpu",
		);

		if (activePlayers.length === 0)
			throw new Error("No active players to advance turn to");

		const currentActivePlayerIndex = activePlayers.findIndex(
			(p) => p.id === players[currentPlayerIndex].id,
		);

		if (currentActivePlayerIndex === -1)
			throw new Error("Current active player not found");

		const nextActivePlayerIndex =
			(currentActivePlayerIndex + 1) % activePlayers.length;

		const nextActivePlayer = activePlayers[nextActivePlayerIndex];

		if (nextActivePlayer.type === "spectator")
			throw new Error("Next active player cannot be a spectator");

		const nextPlayerIndex = players.findIndex(
			(p) => p.id === nextActivePlayer.id,
		);

		if (nextActivePlayer.id !== players[nextPlayerIndex].id)
			throw new Error("Turn did not advance correctly");

		this.state.currentPlayerIndex = nextPlayerIndex;

		if (nextActivePlayerIndex === 0) {
			// If we wrapped around the active players list, increment the round.
			this.state.round += 1;
		}

		this.state.clocks[nextActivePlayer.id] += 1;

		// Decrease active effects duration for all players
		for (const player of this.state.players) {
			const effects = this.state.activeEffects[player.id];
			if (!effects) continue;

			// Decrease frozen turns
			if (effects.frozen !== undefined) {
				effects.frozen--;
				if (effects.frozen <= 0) {
					delete effects.frozen;
				}
			}

			// Decrease double points turns
			if (effects.doublePoints !== undefined) {
				effects.doublePoints--;
				if (effects.doublePoints <= 0) {
					delete effects.doublePoints;
				}
			}

			// use-after-free is consumed when used, not by turns
		}

		await this.ctx.storage.put("gameState", this.state);
		this.broadcast({ type: "state", payload: this.state });

		// if (nextActivePlayer.type === "cpu") {
		// 	this.cpuMakeMove(nextActivePlayer.id).catch((err) => {
		// 		console.error("CPU Error:", err);
		// 	});
		// }
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

		const cardInstance = this.state.hands[playerId]?.memory[memoryCardId];
		if (!cardInstance) {
			console.error("Card instance not found in hand:", memoryCardId);
			return;
		}

		const card = memoryCards[cardInstance.definitionId];
		if (!card) {
			console.error(
				"Memory card definition not found during occupy:",
				cardInstance.definitionId,
			);
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
		clearTimeout(this.state.timeoutId);
		if (!this.state.winners)
			this.state.timeoutId = setTimeout(() => {
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

		const cardInstance = this.state.hands[playerId]?.func[functionCardId];
		if (!cardInstance) {
			console.error("Card instance not found in hand:", functionCardId);
			return;
		}
		const card = functionCards[cardInstance.definitionId];
		if (!card) {
			console.error(
				"Function card definition not found during occupy:",
				cardInstance.definitionId,
			);
			return;
		}

		this.mutateBoard(playerId, x, y, "function", card.shape);

		// Consume use-after-free effect if it was used
		if (this.state.activeEffects[playerId]?.useAfterFree) {
			// Clear use-after-free effect after use
			delete this.state.activeEffects[playerId].useAfterFree;
		}

		this.advanceTurnAndRound();

		delete this.state.hands[playerId].func[functionCardId];
		const { id, card: newCard } = this.getFunctionCard();
		this.state.hands[playerId].func[id] = newCard;

		this.state.clocks[playerId] -= card.cost;

		// TODO: ポイント加算ロジックを調整する
		let pointsToAdd = card.cost;
		// Apply double points effect if active
		if (this.state.activeEffects[playerId]?.doublePoints) {
			pointsToAdd *= 2;
		}
		this.state.points[playerId] += pointsToAdd;

		this.state.timeLimitUnix = Date.now() + this.state.rules.timeLimit * 1000;
		clearTimeout(this.state.timeoutId);
		this.state.timeoutId = setTimeout(() => {
			this.pass();
		}, this.state.rules.timeLimit * 1000);

		await this.ctx.storage.put("gameState", this.state);
		this.broadcast({ type: "state", payload: this.state });
	}

	async buyEventCard(playerId: string) {
		if (!this.state) throw new Error("Game state is not initialized");

		const cost = 3; // TODO: 調整可能にする
		if (this.state.clocks[playerId] < cost) {
			console.error("Not enough clock to buy event card:", playerId);
			return;
		}

		this.state.clocks[playerId] -= cost;

		const keys = Object.keys(eventCards);
		const randomKey = keys[Math.floor(Math.random() * keys.length)];
		const randomEventCard: EventCard = {
			definitionId: randomKey,
			...eventCards[randomKey],
		};

		const cardInstanceId = Math.random().toString(36);
		this.state.hands[playerId].event[cardInstanceId] = randomEventCard;

		await this.ctx.storage.put("gameState", this.state);
		this.broadcast({ type: "state", payload: this.state });
	}

	async execEvent(
		playerId: string,
		eventCardId: string,
		x?: number,
		y?: number,
		targetPlayerId?: string,
	) {
		if (!this.state) throw new Error("Game state is not initialized");

		// Verify the card exists in player's hand
		const eventCard = this.state.hands[playerId]?.event[eventCardId];
		if (!eventCard) {
			console.error("Event card not found in player's hand:", eventCardId);
			return;
		}

		const { effect } = eventCard;

		// Execute the event effect
		switch (effect.type) {
			case "destroy-memory":
			case "free-memory": {
				const coords = this.getAreaCoordinates(effect.area, x, y);
				if (!coords) {
					console.error("Invalid coordinates for area effect");
					return;
				}

				for (const [cx, cy] of coords) {
					if (
						cx < 0 ||
						cy < 0 ||
						cx >= this.state.board.length ||
						cy >= this.state.board.length
					) {
						continue;
					}
					const cell = this.state.board[cy][cx];
					if (effect.type === "destroy-memory") {
						// destroy: both reserved and used -> free
						if (cell.status === "reserved" || cell.status === "used") {
							this.state.board[cy][cx] = { status: "free" };
						}
					} else {
						// free: only used -> free
						if (cell.status === "used") {
							this.state.board[cy][cx] = { status: "free" };
						}
					}
				}
				break;
			}

			case "reset-memory-hand":
			case "reset-function-hand": {
				const targets = this.getTargetPlayers(
					playerId,
					effect.target,
					targetPlayerId,
				);
				const handType =
					effect.type === "reset-memory-hand" ? "memory" : "func";

				for (const targetId of targets) {
					if (!this.state.hands[targetId]) continue;
					// Clear the hand
					this.state.hands[targetId][handType] = {};
					// Draw new cards
					const newHand = this.drawInitialHand();
					this.state.hands[targetId][handType] = newHand[handType];
				}
				break;
			}

			case "draw-more-function-cards": {
				for (let i = 0; i < effect.count; i++) {
					const keys = Object.keys(functionCards);
					const randomKey = keys[
						Math.floor(Math.random() * keys.length)
					] as FunctionCard["definitionId"];
					const newCard: FunctionCard = {
						definitionId: randomKey,
						...functionCards[randomKey],
					};
					const id = `${randomKey}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
					this.state.hands[playerId].func[id] = newCard;
				}
				break;
			}

			case "freeze-player": {
				const targets = this.getTargetPlayers(
					playerId,
					effect.target,
					targetPlayerId,
				);
				for (const targetId of targets) {
					if (!this.state.activeEffects[targetId]) {
						this.state.activeEffects[targetId] = {};
					}
					this.state.activeEffects[targetId].frozen = effect.turns;
				}
				break;
			}

			case "double-points": {
				if (effect.target === "self") {
					if (!this.state.activeEffects[playerId]) {
						this.state.activeEffects[playerId] = {};
					}
					this.state.activeEffects[playerId].doublePoints = effect.turns;
				} else {
					// all players
					for (const player of this.state.players) {
						if (!this.state.activeEffects[player.id]) {
							this.state.activeEffects[player.id] = {};
						}
						this.state.activeEffects[player.id].doublePoints = effect.turns;
					}
				}
				break;
			}

			case "use-after-free": {
				if (!this.state.activeEffects[playerId]) {
					this.state.activeEffects[playerId] = {};
				}
				this.state.activeEffects[playerId].useAfterFree = effect.count;
				break;
			}

			default:
				effect satisfies never;
		}

		// Remove the used event card from hand
		delete this.state.hands[playerId].event[eventCardId];

		await this.ctx.storage.put("gameState", this.state);
		this.broadcast({ type: "state", payload: this.state });
	}

	private getAreaCoordinates(
		area:
			| "any-3by3"
			| "any-2by2"
			| "any-one"
			| "peripheral"
			| "center-2by2"
			| "center-3by3",
		x?: number,
		y?: number,
	): [number, number][] | null {
		if (!this.state) throw new Error("Game state is not initialized");
		const boardSize = this.state.board.length;

		switch (area) {
			case "any-one":
				if (x === undefined || y === undefined) return null;
				return [[x, y]];

			case "any-2by2":
				if (x === undefined || y === undefined) return null;
				return [
					[x, y],
					[x + 1, y],
					[x, y + 1],
					[x + 1, y + 1],
				];

			case "any-3by3":
				if (x === undefined || y === undefined) return null;
				return [
					[x, y],
					[x + 1, y],
					[x + 2, y],
					[x, y + 1],
					[x + 1, y + 1],
					[x + 2, y + 1],
					[x, y + 2],
					[x + 1, y + 2],
					[x + 2, y + 2],
				];

			case "center-2by2": {
				const center = Math.floor(boardSize / 2);
				return [
					[center - 1, center - 1],
					[center, center - 1],
					[center - 1, center],
					[center, center],
				];
			}

			case "center-3by3": {
				const center = Math.floor(boardSize / 2);
				return [
					[center - 1, center - 1],
					[center, center - 1],
					[center + 1, center - 1],
					[center - 1, center],
					[center, center],
					[center + 1, center],
					[center - 1, center + 1],
					[center, center + 1],
					[center + 1, center + 1],
				];
			}

			case "peripheral": {
				const coords: [number, number][] = [];
				for (let i = 0; i < boardSize; i++) {
					// Top and bottom rows
					coords.push([i, 0]);
					coords.push([i, boardSize - 1]);
					// Left and right columns (excluding corners already added)
					if (i > 0 && i < boardSize - 1) {
						coords.push([0, i]);
						coords.push([boardSize - 1, i]);
					}
				}
				return coords;
			}

			default:
				area satisfies never;
				return null;
		}
	}

	private getTargetPlayers(
		playerId: string,
		target: "self" | "any-one-opponent" | "all-opponents",
		targetPlayerId?: string,
	): string[] {
		if (!this.state) {
			throw new Error("Game state is not initialized");
		}

		switch (target) {
			case "self":
				return [playerId];

			case "any-one-opponent":
				if (
					!targetPlayerId ||
					targetPlayerId === playerId ||
					!this.state.players.find((player) => player.id === targetPlayerId)
				) {
					console.error(
						"Invalid target player for any-one-opponent:",
						targetPlayerId,
					);
					return [];
				}
				return [targetPlayerId];
			case "all-opponents":
				return this.state.players
					.filter((player) => player.id !== playerId)
					.map((player) => player.id);
			default:
				target satisfies never;
				return [];
		}
	}

	async pass() {
		if (!this.state) return;
		this.advanceTurnAndRound();
		this.state.timeLimitUnix = Date.now() + this.state.rules.timeLimit * 1000;
		clearTimeout(this.state.timeoutId);
		this.state.timeoutId = setTimeout(() => {
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

		const currentPlayer = this.state.players[this.state.currentPlayerIndex].id;
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
				const cardInstance = currentHand.memory[CardId];
				if (!cardInstance) {
					console.error("Card not in hand:", CardId);
					return false;
				}

				const card = memoryCards[cardInstance.definitionId];
				if (!card) {
					console.error(
						"Memory card definition not found:",
						cardInstance.definitionId,
					);
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
					console.error(
						"Out of bounds:",
						"x:",
						x,
						"y",
						y,
						"cardWidth:",
						cardWidth,
						"boardWidth:",
						boardWidth,
					);
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
				const cardInstance = currentHand.func[CardId];
				if (!cardInstance) {
					console.error("Card not in hand:", CardId);
					return false;
				}

				const card = functionCards[cardInstance.definitionId];
				if (!card) {
					console.error(
						"Function card definition not found:",
						cardInstance.definitionId,
					);
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

				// Check if use-after-free effect is active
				const useAfterFreeCount =
					this.state.activeEffects[player]?.useAfterFree || 0;
				let freeCellsUsed = 0;

				for (let dy = 0; dy < cardHeight; dy++) {
					for (let dx = 0; dx < cardWidth; dx++) {
						if (card.shape[dy][dx] === 1) {
							const boardCell = this.state.board[y + dy][x + dx];
							if (!boardCell) {
								console.error("Cell out of bounds:", x + dx, y + dy);
								return false;
							}

							// Normal case: must be reserved by this player
							if (
								boardCell.status === "reserved" &&
								boardCell.occupiedBy === player
							) {
								continue;
							}

							// Use-after-free case: can use free cells up to the limit
							if (
								boardCell.status === "free" &&
								freeCellsUsed < useAfterFreeCount
							) {
								freeCellsUsed++;
								continue;
							}

							console.error(
								"Cell not available for function:",
								x + dx,
								y + dy,
								boardCell.status,
							);
							return false;
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

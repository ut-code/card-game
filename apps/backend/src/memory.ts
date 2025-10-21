import type { Env } from "hono/types";
import { type Mission, missions } from "./mission";
import { RoomMatch, type RoomState } from "./room";

// --- Game-specific Types ---

let timeout: ReturnType<typeof setTimeout>;

export type Operation = "add" | "sub";

export type MoveAction = {
	x: number;
	y: number;
	operation: Operation;
	num: number;
	numIndex: number;
};

export type Rule =
	| { rule: "negativeDisabled"; state: boolean }
	| { rule: "boardSize"; state: number }
	| { rule: "timeLimit"; state: number };

// GameState extends RoomState to include game-specific properties
export type GameState = RoomState & {
	round: number;
	turn: number;
	board: (number | null)[][];
	winners: string[] | null;
	winnersAry: { [playerId: string]: (true | false)[][] };
	gameId: string;
	hands: { [playerId: string]: number[] };
	missions: { [playerId: string]: { id: string; mission: Mission } };
	timeLimitUnix: number;
};

// Combined message types for both room and game actions
export type MessageType =
	| { type: "makeMove"; payload: MoveAction }
	| { type: "setReady"; payload?: undefined }
	| { type: "cancelReady"; payload?: undefined }
	| { type: "changeRule"; payload: Rule }
	| { type: "pass"; payload?: undefined }
	| { type: "backToLobby"; payload?: undefined }
	| { type: "removePlayer"; payload?: undefined };

const DEFAULT_BOARD_SIZE = 3;
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
				case "makeMove":
					await this.makeMove(
						playerId,
						payload.x,
						payload.y,
						payload.num,
						payload.operation,
						payload.numIndex,
					);
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
					await this.changeRule(payload);
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
			winnersAry: {},
			gameId: this.ctx.id.toString(),
			hands: {},
			missions: {},
			timeLimitUnix: Date.now() + DEFAULT_TIME_LIMIT_MS,
		};
		await this.ctx.storage.put("gameState", this.state);
		this.broadcast({ type: "state", payload: this.state });
	}

	async changeRule(payload: Rule) {
		if (!this.state || this.state.status !== "preparing") return;

		if (payload.rule === "negativeDisabled") {
			this.state.rules.negativeDisabled = payload.state;
		} else if (payload.rule === "boardSize") {
			this.state.rules.boardSize = payload.state;
			this.state.board = Array(payload.state)
				.fill(null)
				.map(() => Array(payload.state).fill(null));
		} else if (payload.rule === "timeLimit") {
			this.state.rules.timeLimit = payload.state;
		}
		await this.ctx.storage.put("gameState", this.state);
		this.broadcast({ type: "state", payload: this.state });
	}

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
		this.state.winnersAry = {};
		this.state.hands = {};
		this.state.missions = {};

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

			if (this.state.missions[playerId]) {
				console.error("player already has a mission:", playerId);
				return;
			}
			this.state.missions[playerId] = this.getRandomMission();
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
		if (!this.state) return [];
		const hand = new Array(3); // TODO: 変更可能にする
		for (let i = 0; i < hand.length; i++) {
			hand[i] = this.drawCard();
		}
		return hand;
	}

	// TODO: 調整可能にする
	drawCard() {
		const rand = Math.random();
		if (rand < 0.4) {
			return 1;
		} else if (rand < 0.6) {
			return 2;
		} else if (rand < 0.8) {
			return 3;
		} else {
			return 4;
		}
	}

	// TODO: ミッションの重複を避ける
	getRandomMission() {
		const missionKeys = Object.keys(missions);
		const randomKey =
			missionKeys[Math.floor(Math.random() * missionKeys.length)];
		return { id: randomKey, mission: missions[randomKey] };
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

	async makeMove(
		player: string,
		x: number,
		y: number,
		num: number,
		operation: Operation,
		numIndex: number,
	) {
		if (!this.state || this.state.winners) return;

		if (!this.isValidMove(player, x, y, num)) {
			console.error("Invalid move attempted:", player, x, y, num);
			return;
		}

		console.log("Making move:", player, x, y, num);

		this.state.board[y][x] = this.computeCellResult(x, y, num, operation);

		this.advanceTurnAndRound();

		const prevHand = this.state.hands[player];

		this.state.hands[player] = prevHand.toSpliced(numIndex, 1, this.drawCard());

		for (const id of this.state.players) {
			if (this.state.missions[id]) {
				const winary = this.isVictory(this.state.missions[id].mission);
				if (winary.some((row) => row.includes(true))) {
					if (!this.state) throw new Error("Game state is not initialized");
					this.state.winnersAry[id] = winary;
					if (!this.state.winners) {
						this.state.winners = [id];
					} else if (!this.state.winners.includes(id)) {
						this.state.winners.push(id);
					}
					console.log("winary", winary);
					console.log("this.state.winnersAry", this.state.winnersAry);
				}
			}
		}

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

	isValidMove(player: string, x: number, y: number, num: number) {
		if (!this.state) throw new Error("Game state is not initialized");

		// TODO: 調整可能にする
		if (!Number.isInteger(num) || num < 1 || num > 4) {
			console.error("Invalid number:", num);
			return false;
		}

		const currentPlayer = this.state.players[this.state.turn];
		if (currentPlayer !== player) {
			console.error("Not your turn:", player);
			return false;
		}

		const currentHand = this.state.hands[currentPlayer];
		if (!currentHand || currentHand.length === 0) {
			console.error("Invalid hand:", currentPlayer);
			return false;
		}
		if (!currentHand.includes(num)) {
			console.error("Card not in hand:", num);
			return false;
		}

		if (this.state.board[y][x] === undefined) {
			console.error("Invalid board position:", x, y);
			return false;
		}

		return true;
	}

	computeCellResult(
		x: number,
		y: number,
		num: number,
		operation: Operation,
	): number {
		if (!this.state) throw new Error("Game state is not initialized");

		const prev = this.state.board[y][x] ?? 0;

		switch (operation) {
			case "add":
				return prev + num;
			case "sub":
				return num > prev && this.state.rules.negativeDisabled
					? num - prev
					: prev - num;
			default:
				return operation satisfies never;
		}
	}

	isVictory(mission: Mission) {
		if (!this.state) throw new Error("Game state is not initialized");
		const matrix = Array.from({ length: this.state.rules.boardSize }, () =>
			Array(this.state?.rules.boardSize).fill(false),
		);
		if (mission.target === "column" || mission.target === "allDirection") {
			for (let i = 0; i < this.state.rules.boardSize; i++) {
				const columnary = this.state.board[i].filter((value) => value !== null);
				if (this.isWinner(columnary, mission)) {
					matrix[i] = Array(this.state.rules.boardSize).fill(true);
				}
			}
		}

		if (mission.target === "row" || mission.target === "allDirection") {
			for (let i = 0; i < this.state.rules.boardSize; i++) {
				const nullinary = [];
				for (let j = 0; j < this.state.rules.boardSize; j++) {
					nullinary.push(this.state.board[j][i]);
				}
				const rowary = nullinary.filter((value) => value !== null);
				if (this.isWinner(rowary, mission)) {
					for (let j = 0; j < this.state.rules.boardSize; j++) {
						matrix[j][i] = true;
					}
				}
			}
		}

		if (mission.target === "diagonal" || mission.target === "allDirection") {
			for (let i = 0; i < 2; i++) {
				const nullinary = [];
				for (let j = 0; j < this.state.rules.boardSize; j++) {
					if (i === 0) {
						nullinary.push(
							this.state.board[j][this.state.rules.boardSize - j - 1],
						);
					} else {
						nullinary.push(
							this.state.board[this.state.rules.boardSize - j - 1][j],
						);
					}
				}
				const diaary = nullinary.filter((value) => value !== null);
				if (this.isWinner(diaary, mission)) {
					for (let j = 0; j < this.state.rules.boardSize; j++) {
						if (i === 0) {
							matrix[j][this.state.rules.boardSize - j - 1] = true;
						} else {
							matrix[this.state.rules.boardSize - j - 1][j] = true;
						}
					}
				}
			}
		}

		if (mission.target === "allCell") {
			const nullinary = [];
			for (let i = 0; i < this.state.rules.boardSize; i++) {
				for (let j = 0; j < this.state.rules.boardSize; j++) {
					nullinary.push(this.state.board[i][j]);
				}
			}
			const boardary = nullinary.filter((value) => value !== null);
			if (mission.type === "multipile") {
				let hikaku = 0;
				for (let j = 0; j < boardary.length; j++) {
					if (boardary[j] % mission.number === 0) {
						hikaku += 1;
					}
				}
				if (hikaku > 3) {
					for (let i = 0; i < nullinary.length; i++) {
						matrix[Math.floor(i / mission.number)][i % mission.number] =
							this.multi(nullinary[i], mission.number);
					}
				}
			}
			if (mission.type === "prime") {
				let hikaku = 0;
				for (let j = 0; j < boardary.length; j++) {
					if (this.isPrime(boardary[j])) {
						hikaku += 1;
					}
				}
				if (hikaku > 3) {
					for (let i = 0; i < nullinary.length; i++) {
						matrix[Math.floor(i / mission.number)][i % mission.number] =
							this.isPrime(nullinary[i]);
					}
				}
			}
		}
		return matrix;
	}

	multi(devidedNumber: number | null, devideNumber: number) {
		if (devidedNumber === null) {
			return false;
		} else {
			return devidedNumber % devideNumber === 0;
		}
	}

	isWinner(obary: number[], mission: Mission) {
		if (!this.state) throw new Error("Game state is not initialized");
		if (obary.length !== this.state.rules.boardSize) {
			return false;
		}

		switch (mission.type) {
			case "sum":
				return obary.reduce((acc, val) => acc + val, 0) === mission.number;
			case "multipile":
				return obary.every((val) => val % mission.number === 0);
			case "arithmetic":
				return obary
					.toSorted((a, b) => a - b)
					.slice(1)
					.every((val, i) => val - obary[i] === mission.number);
			case "geometric":
				return obary
					.toSorted((a, b) => a - b)
					.slice(1)
					.every((val, i) => val === obary[i] * mission.number);
			case "prime":
				return obary.every((val) => this.isPrime(val));
			default:
				return false;
		}
	}

	isPrime(number: number | null) {
		if (number === null) {
			return false;
		}
		const primeNumber = [
			2, 3, 5, 7, 11, 13, 17, 19, 23, 29, 31, 37, 41, 43, 47, 53, 59, 61, 67,
			71, 73, 79, 83, 89, 97,
		];
		for (let z = 0; z < primeNumber.length; z++) {
			if (number === primeNumber[z]) {
				return true;
			} else if (number < primeNumber[z]) {
				return false;
			}
		}
		return false;
	}
}

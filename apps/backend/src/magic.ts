import { DurableObject } from "cloudflare:workers";
import type { Env } from "hono/types";
import { type Mission, missions } from "./mission";

// 定数
const DEFAULT_BOARD_SIZE = 3;
const DEFAULT_TIME_LIMIT_MS = 10000;
// timeout
let timeout: ReturnType<typeof setTimeout>;

// 型
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

export type Operation = "add" | "sub";

export type GameState = {
	status: "preparing" | "playing" | "paused";
	players: string[];
	playerStatus: {
		[playerId: string]:
			| "preparing"
			| "ready"
			| "playing"
			| "finished"
			| "error";
	};
	names: {
		[playerId: string]: string;
	};
	round: number; // 0-indexed
	turn: number; // 0 ~ players.length-1 players[turn]'s turn
	board: (number | null)[][];
	winners: string[] | null;
	winnersAry: {
		[playerId: string]: (true | false)[][];
	};
	gameId: string;
	hands: {
		[playerId: string]: number[];
	};
	missions: {
		[playerId: string]: {
			id: string;
			mission: Mission;
		};
	};
	rules: {
		negativeDisabled: boolean;
		boardSize: number;
		timeLimit: number;
	};
	timeLimitUnix: number;
};

export type MessageType =
	| { type: "makeMove"; payload: MoveAction }
	| { type: "setReady"; payload?: undefined }
	| { type: "cancelReady"; payload?: undefined }
	| { type: "changeRule"; payload: Rule }
	| { type: "pass"; payload?: undefined }
	| { type: "backToLobby"; payload?: undefined }
	| { type: "removePlayer"; payload?: undefined };

interface Session {
	ws: WebSocket;
	playerId: string;
}

export class Magic extends DurableObject {
	gameState: GameState | undefined = undefined;
	sessions: Session[] = [];

	constructor(ctx: DurableObjectState, env: Env) {
		super(ctx, env);
		this.ctx.blockConcurrencyWhile(async () => {
			this.gameState = await this.ctx.storage.get<GameState>("gameState");
		});
	}

	async fetch(request: Request) {
		const url = new URL(request.url);
		const playerId = url.searchParams.get("playerId");
		const playerName = url.searchParams.get("playerName");
		if (!playerId) {
			return new Response("playerId is required", { status: 400 });
		} else if (!playerName) {
			return new Response("playerName is required", { status: 400 });
		}

		if (request.headers.get("Upgrade") !== "websocket") {
			return new Response("Expected websocket", { status: 400 });
		}

		const { 0: client, 1: server } = new WebSocketPair();

		if (!this.gameState) await this.initialize();

		await this.handleSession(server, playerId, playerName);

		return new Response(null, {
			status: 101,
			webSocket: client,
		});
	}

	async handleSession(ws: WebSocket, playerId: string, playerName: string) {
		const session: Session = { ws, playerId };
		this.sessions.push(session);

		ws.accept();

		await this.addPlayer(playerId, playerName);

		ws.addEventListener("message", async (msg) => {
			try {
				// TODO: 型をつける ✅
				const { type, payload } = JSON.parse(msg.data as string) as MessageType;
				switch (type) {
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
					case "setReady":
						await this.setReady(playerId);
						break;
					case "cancelReady":
						await this.cancelReady(playerId);
						break;
					case "changeRule":
						await this.changeRule(payload);
						break;
					case "backToLobby":
						await this.backToLobby(playerId);
						break;
					case "removePlayer":
						await this.removePlayer(playerId);
						break;
					case "pass":
						await this.pass();
						break;
					default:
						throw new Error(`Unhandled message type: ${type}`);
				}
			} catch {
				ws.send(JSON.stringify({ error: "Invalid message" }));
			}
		});

		const closeOrErrorHandler = () => {
			this.sessions = this.sessions.filter((s) => s !== session);
			this.updateDisconnectedPlayer(playerId);
		};
		ws.addEventListener("close", closeOrErrorHandler);
		ws.addEventListener("error", closeOrErrorHandler);

		// Send current state to the newly connected client
		ws.send(JSON.stringify({ type: "state", payload: this.gameState }));
	}

	broadcast(message: unknown) {
		const serialized = JSON.stringify(message);
		this.sessions.forEach((session) => {
			try {
				session.ws.send(serialized);
			} catch {
				this.sessions = this.sessions.filter((s) => s !== session);
			}
		});
	}

	// --- Game Logic Methods ---

	async initialize() {
		this.gameState = {
			players: [],
			playerStatus: {},
			names: {},
			round: 0,
			turn: 0,
			board: [],
			winners: null,
			winnersAry: {},
			gameId: this.ctx.id.toString(),
			hands: {},
			missions: {},
			status: "preparing",
			rules: {
				negativeDisabled: false,
				boardSize: DEFAULT_BOARD_SIZE,
				timeLimit: DEFAULT_TIME_LIMIT_MS / 1000,
			},
			timeLimitUnix: Date.now() + DEFAULT_TIME_LIMIT_MS,
		};
		await this.ctx.storage.put("gameState", this.gameState);
		this.broadcast({ type: "state", payload: this.gameState });
	}

	async addPlayer(playerId: string, playerName: string) {
		if (!this.gameState) {
			console.error("Game state is not initialized");
			return;
		}
		console.log(
			"Adding player:",
			playerId,
			playerName,
			this.gameState.players.includes(playerId),
		);

		// New player
		if (!this.gameState.players.includes(playerId)) {
			switch (this.gameState.status) {
				case "preparing":
					if (!this.gameState.players.includes(playerId)) {
						this.gameState.players.push(playerId);
						this.gameState.names[playerId] = playerName;
						this.gameState.playerStatus[playerId] = "preparing";

						await this.ctx.storage.put("gameState", this.gameState);
						this.broadcast({ type: "state", payload: this.gameState });
					}
					break;
				case "playing":
					console.error("Game already started, cannot join now.");
					break;
				case "paused":
					if (this.gameState.players.includes(playerId)) {
						this.gameState.playerStatus[playerId] = "playing";
						if (
							Object.values(this.gameState.playerStatus).every(
								(status) => status === "playing",
							)
						) {
							console.log("All players reconnected, resuming game.");
							this.gameState.status = "playing";
						} else {
							console.log("Waiting for other players to reconnect.");
						}
						await this.ctx.storage.put("gameState", this.gameState);
						this.broadcast({ type: "state", payload: this.gameState });
					} else {
						console.error("Game already started, cannot join now.");
					}
					break;
				default:
					this.gameState.status satisfies never;
			}
		} else {
			// Reconnecting player
			if (this.gameState.playerStatus[playerId] !== "error") {
				throw new Error(
					`Player is already connected but tried to connect again: ${this.gameState.playerStatus[playerId]}`,
				);
			}
			switch (this.gameState.status) {
				case "preparing":
					this.gameState.playerStatus[playerId] = "preparing";
					break;
				case "playing":
					throw new Error("Game already started, but trying to reconnect.");
				case "paused":
					this.gameState.playerStatus[playerId] = "playing";
					if (
						Object.values(this.gameState.playerStatus).every(
							(status) => status === "playing",
						)
					) {
						console.log("All players reconnected, resuming game.");
						this.gameState.status = "playing";
					} else {
						console.log("Waiting for other players to reconnect.");
					}
					break;
				default:
					this.gameState.status satisfies never;
			}

			await this.ctx.storage.put("gameState", this.gameState);
			this.broadcast({ type: "state", payload: this.gameState });
		}
	}

	async updateDisconnectedPlayer(playerId: string) {
		if (!this.gameState) throw new Error("Game state is not initialized");

		if (!this.gameState.players.includes(playerId)) {
			console.error("Player not found in game:", playerId);
			return;
		}
		this.gameState.playerStatus[playerId] = "error";
		if (this.gameState.status !== "preparing") {
			this.gameState.status = "paused";
		}

		await this.ctx.storage.put("gameState", this.gameState);
		this.broadcast({ type: "state", payload: this.gameState });
	}

	async startGame() {
		if (!this.gameState || this.gameState.status !== "preparing") return;
		this.clearGameState();
		for (const playerId of this.gameState.players) {
			if (this.gameState.playerStatus[playerId] !== "ready") {
				console.error("one of the players not ready:", playerId);
				return;
			}
			this.gameState.playerStatus[playerId] = "playing";

			if (this.gameState.hands[playerId]) {
				console.error("player already has a hand:", playerId);
				return;
			}
			this.gameState.hands[playerId] = this.drawInitialHand();

			if (this.gameState.missions[playerId]) {
				console.error("player already has a mission:", playerId);
				return;
			}
			this.gameState.missions[playerId] = this.getRandomMission();
		}
		this.gameState.status = "playing";
		this.gameState.timeLimitUnix =
			Date.now() + this.gameState.rules.timeLimit * 1000;
		clearTimeout(timeout);
		timeout = setTimeout(() => {
			this.pass();
		}, this.gameState.rules.timeLimit * 1000);

		await this.ctx.storage.put("gameState", this.gameState);
		this.broadcast({ type: "state", payload: this.gameState });
	}

	drawInitialHand() {
		if (!this.gameState) return [];
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

	async makeMove(
		player: string,
		x: number,
		y: number,
		num: number,
		operation: Operation,
		numIndex: number,
	) {
		if (!this.gameState || this.gameState.winners) return;

		if (!this.isValidMove(player, x, y, num)) {
			console.error("Invalid move attempted:", player, x, y, num);
			return;
		}

		console.log("Making move:", player, x, y, num);

		this.gameState.board[y][x] = this.computeCellResult(x, y, num, operation);

		if (this.gameState.turn === this.gameState.players.length - 1) {
			this.gameState.round += 1;
		}
		this.gameState.turn =
			(this.gameState.turn + 1) % this.gameState.players.length;

		const prevHand = this.gameState.hands[player];

		this.gameState.hands[player] = prevHand.toSpliced(
			numIndex,
			1,
			this.drawCard(),
		);

		for (const id of this.gameState.players) {
			const winary = this.isVictory(this.gameState.missions[id].mission);
			if (winary.some((row) => row.includes(true))) {
				if (!this.gameState) throw new Error("Game state is not initialized");
				this.gameState.winnersAry[id] = winary;
				if (!this.gameState.winners) {
					this.gameState.winners = [id];
				} else if (!this.gameState.winners.includes(id)) {
					this.gameState.winners.push(id);
				}
				console.log("winary", winary);
				console.log("this.gameState.winnersAry", this.gameState.winnersAry);
			}
		}

		if (this.gameState.winners) {
			this.gameState.status = "preparing";
			Object.keys(this.gameState.playerStatus).forEach((playerId) => {
				if (!this.gameState) throw new Error("Game state is not initialized");
				this.gameState.playerStatus[playerId] = "finished";
			});
		}
		this.gameState.timeLimitUnix =
			Date.now() + this.gameState.rules.timeLimit * 1000;
		clearTimeout(timeout);
		if (!this.gameState.winners)
			timeout = setTimeout(() => {
				this.pass();
			}, this.gameState.rules.timeLimit * 1000);
		await this.ctx.storage.put("gameState", this.gameState);
		this.broadcast({ type: "state", payload: this.gameState });
	}

	async setReady(player: string) {
		if (!this.gameState) return;
		if (this.gameState.playerStatus[player] !== "preparing") {
			console.error("Player not in preparing state:", player);
			return;
		}
		this.gameState.playerStatus[player] = "ready";
		if (
			this.gameState.players.length >= 2 &&
			this.gameState.players.every(
				(p) => this.gameState?.playerStatus[p] === "ready",
			)
		) {
			this.startGame();
		} else {
			await this.ctx.storage.put("gameState", this.gameState);
			this.broadcast({ type: "state", payload: this.gameState });
		}
	}
	async cancelReady(player: string) {
		if (!this.gameState) return;
		if (this.gameState.playerStatus[player] !== "ready") {
			console.error("Player not in ready state:", player);
			return;
		}
		this.gameState.playerStatus[player] = "preparing";
		await this.ctx.storage.put("gameState", this.gameState);
		this.broadcast({ type: "state", payload: this.gameState });
	}
	async backToLobby(playerId: string) {
		if (!this.gameState) return;
		this.gameState.playerStatus[playerId] = "preparing";

		await this.ctx.storage.put("gameState", this.gameState);
		this.broadcast({ type: "state", payload: this.gameState });
	}

	async removePlayer(playerId: string) {
		if (!this.gameState) return;

		this.gameState.players = this.gameState.players.filter(
			(p) => p !== playerId,
		);

		delete this.gameState.playerStatus[playerId];
		delete this.gameState.names[playerId];
		delete this.gameState.hands[playerId];
		delete this.gameState.missions[playerId];

		if (this.gameState.players.length === 0) {
			await this.ctx.storage.delete("gameState");
			return;
		}

		await this.ctx.storage.put("gameState", this.gameState);
		this.broadcast({ type: "state", payload: this.gameState });
	}

	async clearGameState() {
		if (!this.gameState) return;

		const size = this.gameState.rules.boardSize;

		this.gameState = {
			...structuredClone(this.gameState),
			board: Array(size)
				.fill(null)
				.map(() => Array(size).fill(null)),
			round: 0,
			turn: 0,
			winners: null,
			winnersAry: {},
			hands: {},
			missions: {},
		};

		console.log(this.gameState);
		await this.ctx.storage.delete("gameState");
		this.broadcast({ type: "state", payload: this.gameState });
	}

	async changeRule(payload: Rule) {
		if (!this.gameState) return;
		if (payload.rule === "negativeDisabled") {
			this.gameState.rules.negativeDisabled = payload.state;
		} else if (payload.rule === "boardSize") {
			this.gameState.rules.boardSize = payload.state;
			this.gameState.board = Array(payload.state)
				.fill(null)
				.map(() => Array(payload.state).fill(null));
		} else if (payload.rule === "timeLimit") {
			this.gameState.rules.timeLimit = payload.state;
		}
		console.log(this.gameState.rules);
		await this.ctx.storage.put("gameState", this.gameState);
		this.broadcast({ type: "state", payload: this.gameState });
	}

	async pass() {
		if (!this.gameState) return;
		if (this.gameState.turn === this.gameState.players.length - 1) {
			this.gameState.round += 1;
		}
		this.gameState.turn =
			(this.gameState.turn + 1) % this.gameState.players.length;
		this.gameState.timeLimitUnix =
			Date.now() + this.gameState.rules.timeLimit * 1000;
		clearTimeout(timeout);
		timeout = setTimeout(() => {
			this.pass();
		}, this.gameState.rules.timeLimit * 1000);
		await this.ctx.storage.put("gameState", this.gameState);
		this.broadcast({ type: "state", payload: this.gameState });
	}

	isValidMove(player: string, x: number, y: number, num: number) {
		if (!this.gameState) throw new Error("Game state is not initialized");

		// TODO: 調整可能にする
		if (!Number.isInteger(num) || num < 1 || num > 4) {
			console.error("Invalid number:", num);
			return false;
		}

		const currentPlayer = this.gameState.players[this.gameState.turn];
		if (currentPlayer !== player) {
			console.error("Not your turn:", player);
			return false;
		}

		const currentHand = this.gameState.hands[currentPlayer];
		if (!currentHand || currentHand.length === 0) {
			console.error("Invalid hand:", currentPlayer);
			return false;
		}
		if (!currentHand.includes(num)) {
			console.error("Card not in hand:", num);
			return false;
		}

		if (this.gameState.board[y][x] === undefined) {
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
		if (!this.gameState) throw new Error("Game state is not initialized");

		const prev = this.gameState.board[y][x] ?? 0;

		switch (operation) {
			case "add":
				return prev + num;
			case "sub":
				return num > prev && this.gameState.rules.negativeDisabled
					? num - prev
					: prev - num;
			default:
				return operation satisfies never;
		}
	}

	isVictory(mission: Mission) {
		if (!this.gameState) throw new Error("Game state is not initialized");
		const matrix = Array.from({ length: this.gameState.rules.boardSize }, () =>
			Array(this.gameState?.rules.boardSize).fill(false),
		);
		if (mission.target === "column" || mission.target === "allDirection") {
			for (let i = 0; i < this.gameState.rules.boardSize; i++) {
				const columnary = this.gameState.board[i].filter(
					(value) => value !== null,
				);
				if (this.isWinner(columnary, mission)) {
					matrix[i] = Array(this.gameState.rules.boardSize).fill(true);
				}
			}
		}

		if (mission.target === "row" || mission.target === "allDirection") {
			for (let i = 0; i < this.gameState.rules.boardSize; i++) {
				const nullinary = [];
				for (let j = 0; j < this.gameState.rules.boardSize; j++) {
					nullinary.push(this.gameState.board[j][i]);
				}
				const rowary = nullinary.filter((value) => value !== null);
				if (this.isWinner(rowary, mission)) {
					for (let j = 0; j < this.gameState.rules.boardSize; j++) {
						matrix[j][i] = true;
					}
				}
			}
		}

		if (mission.target === "diagonal" || mission.target === "allDirection") {
			for (let i = 0; i < 2; i++) {
				const nullinary = [];
				for (let j = 0; j < this.gameState.rules.boardSize; j++) {
					if (i === 0) {
						nullinary.push(
							this.gameState.board[j][this.gameState.rules.boardSize - j - 1],
						);
					} else {
						nullinary.push(
							this.gameState.board[this.gameState.rules.boardSize - j - 1][j],
						);
					}
				}
				const diaary = nullinary.filter((value) => value !== null);
				if (this.isWinner(diaary, mission)) {
					for (let j = 0; j < this.gameState.rules.boardSize; j++) {
						if (i === 0) {
							matrix[j][this.gameState.rules.boardSize - j - 1] = true;
						} else {
							matrix[this.gameState.rules.boardSize - j - 1][j] = true;
						}
					}
				}
			}
		}

		if (mission.target === "allCell") {
			const nullinary = [];
			for (let i = 0; i < this.gameState.rules.boardSize; i++) {
				for (let j = 0; j < this.gameState.rules.boardSize; j++) {
					nullinary.push(this.gameState.board[i][j]);
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
					if (this.prime(boardary[j])) {
						hikaku += 1;
					}
				}
				if (hikaku > 3) {
					for (let i = 0; i < nullinary.length; i++) {
						matrix[Math.floor(i / mission.number)][i % mission.number] =
							this.prime(nullinary[i]);
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
		if (!this.gameState) throw new Error("Game state is not initialized");
		if (obary.length === this.gameState.rules.boardSize) {
			if (mission.type === "sum") {
				let hikaku = 0;
				for (let j = 0; j < this.gameState.rules.boardSize; j++) {
					hikaku += obary[j];
				}
				if (hikaku === mission.number) {
					return true;
				}
			}
			if (mission.type === "multipile") {
				let hikaku = 0;
				for (let j = 0; j < this.gameState.rules.boardSize; j++) {
					hikaku += obary[j] % mission.number;
				}
				if (hikaku === 0) {
					return true;
				}
			}
			if (mission.type === "arithmetic") {
				obary.sort((first, second) => first - second);
				let hikaku = 0;
				for (let j = 1; j < this.gameState.rules.boardSize; j++) {
					if (obary[j] - obary[j - 1] === mission.number) {
						hikaku += 1;
					}
				}
				if (hikaku === this.gameState.rules.boardSize - 1) {
					return true;
				}
			}
			if (mission.type === "geometic") {
				obary.sort((first, second) => first - second);
				let hikaku = 0;
				for (let j = 1; j < this.gameState.rules.boardSize; j++) {
					if (obary[j] === obary[j - 1] * mission.number) {
						hikaku += 1;
					}
				}
				if (hikaku === this.gameState.rules.boardSize - 1) {
					return true;
				}
			}
			if (mission.type === "prime") {
				let hikaku = 0;
				for (let j = 0; j < this.gameState.rules.boardSize; j++) {
					if (this.prime(obary[j])) {
						hikaku += 1;
					}
				}
				if (hikaku === this.gameState.rules.boardSize) {
					return true;
				}
			}
		}
		return false;
	}

	prime(number: number | null) {
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

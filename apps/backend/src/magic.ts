import { DurableObject } from "cloudflare:workers";
import { type Mission, missions } from "./mission";

export type MoveAction = {
	x: number;
	y: number;
	operation: Operation;
	num: number;
	numIndex: number;
};

export type Operation = "add" | "sub";

export type GameState = {
	players: string[];
	names: {
		[playerId: string]: string;
	};
	round: number; // 0-indexed
	turn: number; // 0 ~ players.length-1 players[turn]'s turn
	board: (number | null)[][];
	boardSize: number;
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
};

interface Session {
	ws: WebSocket;
	playerId: string;
}

export class Magic extends DurableObject {
	gameState: GameState | undefined = undefined;
	sessions: Session[] = [];

	constructor(ctx: DurableObjectState, env: unknown) {
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

		// Add player to the game state if not already present
		await this.addPlayer(playerId, playerName);

		ws.addEventListener("message", async (msg) => {
			try {
				// TODO: 型をつける
				const { type, payload } = JSON.parse(msg.data as string);

				switch (type) {
					case "initialize":
						await this.initialize(payload?.boardSize);
						break;
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
				}
			} catch {
				ws.send(JSON.stringify({ error: "Invalid message" }));
			}
		});

		const closeOrErrorHandler = () => {
			this.sessions = this.sessions.filter((s) => s !== session);
			// Optional: remove player from game state on disconnect
			// this.removePlayer(playerId);
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

	async initialize(boardSize = 3) {
		this.gameState = {
			players: [],
			names: {},
			round: 0,
			turn: 0,
			board: Array(boardSize)
				.fill(null)
				.map(() => Array(boardSize).fill(null)),
			boardSize: boardSize,
			winners: null,
			winnersAry: {},
			gameId: this.ctx.id.toString(),
			hands: {},
			missions: {},
		};
		await this.ctx.storage.put("gameState", this.gameState);
		this.broadcast({ type: "state", payload: this.gameState });
	}

	async addPlayer(playerId: string, playerName: string) {
		if (!this.gameState) {
			await this.initialize();
		}
		if (
			this.gameState &&
			this.gameState.players.length !== 2 &&
			!this.gameState.players.includes(playerId)
		) {
			this.gameState.players.push(playerId);
			this.gameState.names[playerId] = playerName;

			await this.ctx.storage.put("gameState", this.gameState);
			this.broadcast({ type: "state", payload: this.gameState });
		}
		if (this.gameState && this.gameState.players.length === 2) {
			this.startGame();
		}
	}

	async startGame() {
		if (!this.gameState) return;

		// Initialize player hands and missions
		for (const playerId of this.gameState.players) {
			this.gameState.hands[playerId] = this.drawInitialHand();
			this.gameState.missions[playerId] = this.getRandomMission();
		}

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
				return prev - num;
			default:
				return operation satisfies never;
		}
	}

	isVictory(mission: Mission) {
		if (!this.gameState) throw new Error("Game state is not initialized");
		const matrix = Array.from({ length: this.gameState.boardSize }, () =>
			Array(this.gameState?.boardSize).fill(false),
		);
		if (mission.target === "column" || mission.target === "allDirection") {
			for (let i = 0; i < this.gameState.boardSize; i++) {
				const columnary = this.gameState.board[i].filter(
					(value) => value !== null,
				);
				if (this.isWinner(columnary, mission)) {
					matrix[i] = Array(this.gameState.boardSize).fill(true);
				}
			}
		}

		if (mission.target === "row" || mission.target === "allDirection") {
			for (let i = 0; i < this.gameState.boardSize; i++) {
				const nullinary = [];
				for (let j = 0; j < this.gameState.boardSize; j++) {
					nullinary.push(this.gameState.board[j][i]);
				}
				const rowary = nullinary.filter((value) => value !== null);
				if (this.isWinner(rowary, mission)) {
					for (let j = 0; j < this.gameState.boardSize; j++) {
						matrix[j][i] = true;
					}
				}
			}
		}

		if (mission.target === "diagonal" || mission.target === "allDirection") {
			for (let i = 0; i < 2; i++) {
				const nullinary = [];
				for (let j = 0; j < this.gameState.boardSize; j++) {
					if (i === 0) {
						nullinary.push(
							this.gameState.board[j][this.gameState.boardSize - j - 1],
						);
					} else {
						nullinary.push(
							this.gameState.board[this.gameState.boardSize - j - 1][j],
						);
					}
				}
				const diaary = nullinary.filter((value) => value !== null);
				if (this.isWinner(diaary, mission)) {
					for (let j = 0; j < this.gameState.boardSize; j++) {
						if (i === 0) {
							matrix[j][this.gameState.boardSize - j - 1] = true;
						} else {
							matrix[this.gameState.boardSize - j - 1][j] = true;
						}
					}
				}
			}
		}

		if (mission.target === "allCell") {
			const nullinary = [];
			for (let i = 0; i < this.gameState.boardSize; i++) {
				for (let j = 0; j < this.gameState.boardSize; j++) {
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
		if (obary.length === this.gameState.boardSize) {
			if (mission.type === "sum") {
				let hikaku = 0;
				for (let j = 0; j < this.gameState.boardSize; j++) {
					hikaku += obary[j];
				}
				if (hikaku === mission.number) {
					return true;
				}
			}
			if (mission.type === "multipile") {
				let hikaku = 0;
				for (let j = 0; j < this.gameState.boardSize; j++) {
					hikaku += obary[j] % mission.number;
				}
				if (hikaku === 0) {
					return true;
				}
			}
			if (mission.type === "arithmetic") {
				obary.sort((first, second) => first - second);
				let hikaku = 0;
				for (let j = 1; j < this.gameState.boardSize; j++) {
					if (obary[j] - obary[j - 1] === mission.number) {
						hikaku += 1;
					}
				}
				if (hikaku === this.gameState.boardSize - 1) {
					return true;
				}
			}
			if (mission.type === "geometic") {
				obary.sort((first, second) => first - second);
				let hikaku = 0;
				for (let j = 1; j < this.gameState.boardSize; j++) {
					if (obary[j] === obary[j - 1] * mission.number) {
						hikaku += 1;
					}
				}
				if (hikaku === this.gameState.boardSize - 1) {
					return true;
				}
			}
			if (mission.type === "prime") {
				let hikaku = 0;
				for (let j = 0; j < this.gameState.boardSize; j++) {
					if (this.prime(obary[j])) {
						hikaku += 1;
					}
				}
				if (hikaku === this.gameState.boardSize) {
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

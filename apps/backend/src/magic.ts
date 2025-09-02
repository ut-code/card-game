import { DurableObject } from "cloudflare:workers";

export type MoveAction = {
	x: number;
	y: number;
	operation: Operation;
	num: number;
};

export type Operation = "plus" | "sub";

export type GameState = {
	players: string[];
	round: number; // 0-indexed
	turn: number; // 0 ~ players.length-1 players[turn]'s turn
	board: (number | null)[][];
	boardSize: number;
	winner: string | null;
	gameId: string;
	hands: {
		[playerId: string]: number[];
	};
	missions: {
		[playerId: string]: {
			id: string;
			description: string;
		};
	};
};

const missions: Record<string, string> = {
	"0": "どこかの列の和が13",
	"1": "どこかの行の和が11",
	"2": "どこかの対角線の和が17",
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
		if (!playerId) {
			return new Response("playerId is required", { status: 400 });
		}

		if (request.headers.get("Upgrade") !== "websocket") {
			return new Response("Expected websocket", { status: 400 });
		}

		const { 0: client, 1: server } = new WebSocketPair();
		await this.handleSession(server, playerId);

		return new Response(null, {
			status: 101,
			webSocket: client,
		});
	}

	async handleSession(ws: WebSocket, playerId: string) {
		const session: Session = { ws, playerId };
		this.sessions.push(session);

		ws.accept();

		// Add player to the game state if not already present
		await this.addPlayer(playerId);

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
			round: 0,
			turn: 0,
			board: Array(boardSize)
				.fill(null)
				.map(() => Array(boardSize).fill(null)),
			boardSize: boardSize,
			winner: null,
			gameId: this.ctx.id.toString(),
			hands: {},
			missions: {},
		};
		await this.ctx.storage.put("gameState", this.gameState);
		this.broadcast({ type: "state", payload: this.gameState });
	}

	async addPlayer(playerId: string) {
		if (!this.gameState) {
			await this.initialize();
		}
		if (
			this.gameState &&
			this.gameState.players.length !== 2 &&
			!this.gameState.players.includes(playerId)
		) {
			this.gameState.players.push(playerId);
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
			const rand = Math.random();
			if (rand < 0.4) {
				hand[i] = 1;
			} else if (rand < 0.6) {
				hand[i] = 2;
			} else if (rand < 0.8) {
				hand[i] = 3;
			} else {
				hand[i] = 4;
			}
		}
		return hand;
	}

	// TODO: ミッションの重複を避ける
	getRandomMission() {
		const missionKeys = Object.keys(missions);
		const randomKey =
			missionKeys[Math.floor(Math.random() * missionKeys.length)];
		return { id: randomKey, description: missions[randomKey] };
	}

	async makeMove(
		player: string,
		x: number,
		y: number,
		num: number,
		operation: Operation,
	) {
		if (!this.gameState || this.gameState.winner) return;

		if (!this.isValidMove(player, x, y, num)) {
			console.error("Invalid move attempted:", player, x, y, num);
			return;
		}

		console.log("Making move:", player, x, y, num);

		this.gameState.board[y][x] = this.computeCellResult(x, y, num, operation);

		this.gameState.turn =
			(this.gameState.turn + 1) % this.gameState.players.length;
		if (this.gameState.turn === this.gameState.players.length) {
			this.gameState.round += 1;
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
			case "plus":
				return prev + num;
			case "sub":
				return prev - num;
			default:
				return operation satisfies never;
		}
	}
}

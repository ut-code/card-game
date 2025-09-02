import { DurableObject } from "cloudflare:workers";
import type { Env } from "hono";

export type MoveAction = {
	x: number;
	y: number;
	type: "plus" | "sub";
	num: number;
};

export type GameState = {
	players: string[];
	round: number;
	turn: number;
	board: (string | null)[][];
	boardSize: number;
	winner: string | null;
	gameId: string;
	hands: {
		[playerId: string]: number[];
	};
	missions: {
		[playerId: string]: string[];
	};
};

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
				const { type, payload } = JSON.parse(msg.data as string);

				switch (type) {
					case "initialize":
						await this.initialize(payload?.boardSize);
						break;
					case "makeMove":
						await this.makeMove(playerId, payload.x, payload.y);
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
			this.gameState.players.length < 2 &&
			!this.gameState.players.includes(playerId)
		) {
			this.gameState.players.push(playerId);
			await this.ctx.storage.put("gameState", this.gameState);
			this.broadcast({ type: "state", payload: this.gameState });
		}
	}

	async makeMove(player: string, x: number, y: number) {
		if (!this.gameState || this.gameState.winner) return;

		console.log("Making move:", player, x, y);

		// NOTE:ロジックを実装

		await this.ctx.storage.put("gameState", this.gameState);
		this.broadcast({ type: "state", payload: this.gameState });
	}
}

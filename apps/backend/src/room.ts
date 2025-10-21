import { DurableObject } from "cloudflare:workers";
import type { Env } from "hono/types";

export type RoomStatus = "preparing" | "playing" | "paused";
export type PlayerStatus =
	| "preparing"
	| "ready"
	| "playing"
	| "finished"
	| "watching"
	| "error";

export interface Session {
	ws: WebSocket;
	playerId: string;
}

export type RoomState = {
	status: RoomStatus;
	players: string[];
	playerStatus: { [playerId: string]: PlayerStatus };
	names: { [playerId: string]: string };
	rules: {
		negativeDisabled: boolean;
		boardSize: number;
		timeLimit: number;
	};
};

export abstract class RoomMatch<T extends RoomState> extends DurableObject {
	state: T | undefined = undefined;
	sessions: Session[] = [];

	constructor(ctx: DurableObjectState, env: Env) {
		super(ctx, env);
		this.ctx.blockConcurrencyWhile(async () => {
			this.state = await this.ctx.storage.get<T>("gameState");
		});
	}

	// Entry point for all connections
	async fetch(request: Request) {
		const url = new URL(request.url);
		const playerId = url.searchParams.get("playerId");
		const playerName = url.searchParams.get("playerName");
		if (!playerId || !playerName) {
			return new Response("playerId and playerName are required", {
				status: 400,
			});
		}

		if (request.headers.get("Upgrade") !== "websocket") {
			return new Response("Expected websocket", { status: 400 });
		}

		if (!this.state) {
			await this.initialize();
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

		await this.addPlayer(playerId, playerName);

		ws.addEventListener("message", async (msg) => {
			this.wsMessageListener(ws, msg, playerId);
		});

		const closeOrErrorHandler = () => {
			this.sessions = this.sessions.filter((s) => s !== session);
			this.updateDisconnectedPlayer(playerId);
		};
		ws.addEventListener("close", closeOrErrorHandler);
		ws.addEventListener("error", closeOrErrorHandler);

		ws.send(JSON.stringify({ type: "state", payload: this.state }));
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

	// --- Room Management Methods ---

	async addPlayer(playerId: string, playerName: string) {
		if (!this.state) return;

		// New player
		if (!this.state.players.includes(playerId)) {
			switch (this.state.status) {
				case "preparing":
					this.state.players.push(playerId);
					this.state.names[playerId] = playerName;
					this.state.playerStatus[playerId] = "preparing";

					await this.ctx.storage.put("gameState", this.state);
					this.broadcast({ type: "state", payload: this.state });
					break;
				case "playing":
					this.state.players.push(playerId);
					this.state.names[playerId] = playerName;
					this.state.playerStatus[playerId] = "watching";

					await this.ctx.storage.put("gameState", this.state);
					this.broadcast({ type: "state", payload: this.state });
					break;
				case "paused":
					// if (this.state.players.includes(playerId)) {
					// 	this.state.playerStatus[playerId] = "playing";
					// 	if (
					// 		Object.values(this.state.playerStatus).every(
					// 			(status) => status === "playing",
					// 		)
					// 	) {
					// 		console.log("All players reconnected, resuming game.");
					// 		this.state.status = "playing";
					// 	} else {
					// 		console.log("Waiting for other players to reconnect.");
					// 	}
					// 	await this.ctx.storage.put("gameState", this.state);
					// 	this.broadcast({ type: "state", payload: this.state });
					// } else {
					// 	console.error("Game already started, cannot join now.");
					// }
					this.state.players.push(playerId);
					this.state.names[playerId] = playerName;
					this.state.playerStatus[playerId] = "watching";

					await this.ctx.storage.put("gameState", this.state);
					this.broadcast({ type: "state", payload: this.state });
					break;
				default:
					this.state.status satisfies never;
			}
		} else {
			// Reconnecting player
			if (this.state.playerStatus[playerId] !== "error") {
				throw new Error(
					`Player is already connected but tried to connect again: ${this.state.playerStatus[playerId]}`,
				);
			}
			switch (this.state.status) {
				case "preparing":
					this.state.playerStatus[playerId] = "preparing";
					break;
				case "playing":
					this.state.playerStatus[playerId] = "watching";
					break;
				//   throw new Error("Game already started, but trying to reconnect.");
				case "paused":
					this.state.playerStatus[playerId] = "playing";
					if (
						Object.values(this.state.playerStatus).every(
							(status) => status === "playing" || status === "watching",
						)
					) {
						console.log("All players reconnected, resuming game.");
						this.state.status = "playing";
					} else {
						console.log("Waiting for other players to reconnect.");
					}
					break;
				default:
					this.state.status satisfies never;
			}
		}
		await this.ctx.storage.put("gameState", this.state);
		this.broadcast({ type: "state", payload: this.state });
	}

	async removePlayer(playerId: string) {
		if (!this.state) return;

		this.state.players = this.state.players.filter((p) => p !== playerId);
		delete this.state.playerStatus[playerId];
		delete this.state.names[playerId];

		if (this.state.players.length === 0) {
			await this.ctx.storage.delete("gameState");
			return;
		}

		await this.ctx.storage.put("gameState", this.state);
		this.broadcast({ type: "state", payload: this.state });
	}

	async updateDisconnectedPlayer(playerId: string) {
		if (!this.state || !this.state.players.includes(playerId)) return;

		if (!this.sessions.some((s) => s.playerId === playerId)) {
			if (this.state.status === "preparing") {
				await this.removePlayer(playerId);
			} else {
				this.state.playerStatus[playerId] = "error";
				this.state.status = "paused";
				await this.ctx.storage.put("gameState", this.state);
				this.broadcast({ type: "state", payload: this.state });
			}
		}
	}

	async setReady(playerId: string) {
		if (!this.state || this.state.status !== "preparing") return;
		this.state.playerStatus[playerId] = "ready";

		if (
			this.state.players.length >= 2 &&
			this.state.players.every((p) => this.state?.playerStatus[p] === "ready")
		) {
			await this.startGame();
		} else {
			await this.ctx.storage.put("gameState", this.state);
			this.broadcast({ type: "state", payload: this.state });
		}
	}

	async cancelReady(playerId: string) {
		if (!this.state || this.state.playerStatus[playerId] !== "ready") return;
		this.state.playerStatus[playerId] = "preparing";
		await this.ctx.storage.put("gameState", this.state);
		this.broadcast({ type: "state", payload: this.state });
	}

	async backToLobby(playerId: string) {
		if (!this.state) return;
		this.state.playerStatus[playerId] = "preparing";
		await this.ctx.storage.put("gameState", this.state);
		this.broadcast({ type: "state", payload: this.state });
	}

	// This method is intended to be overridden by subclasses
	abstract startGame(): Promise<void>;
	abstract wsMessageListener(
		ws: WebSocket,
		message: MessageEvent,
		playerId: string,
	): Promise<void>;
	abstract initialize(): Promise<void>;
}

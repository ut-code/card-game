import { DurableObject } from "cloudflare:workers";
import type { Env } from "hono/types";

export type RoomStatus = "preparing" | "playing" | "paused";
export type PlayerStatus =
	| "preparing"
	| "ready"
	| "playing"
	| "finished"
	| "spectating"
	| "spectatingReady"
	| "error";

export type RoomState = {
	status: RoomStatus;
	players: {
		type: "player" | "spectator" | "cpu";
		id: string;
	}[]; //
	playerStatus: { [playerId: string]: PlayerStatus };
	names: { [playerId: string]: string };
};

export abstract class RoomMatch<T extends RoomState> extends DurableObject {
	state: T | undefined = undefined;

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
		await this.handleSession(playerId, playerName, server);

		return new Response(null, {
			status: 101,
			webSocket: client,
		});
	}

	async handleSession(playerId: string, playerName: string, server: WebSocket) {
		this.ctx.setWebSocketAutoResponse(
			new WebSocketRequestResponsePair("ping", "pong"),
		);
		this.ctx.acceptWebSocket(server);
		server.serializeAttachment({ playerId });

		await this.addPlayer(playerId, playerName);
	}

	async webSocketMessage(ws: WebSocket, message: string | ArrayBuffer) {
		const attachment = ws.deserializeAttachment() as {
			playerId: string;
		} | null;
		if (!attachment?.playerId) {
			console.error("[WS] No playerId found for WebSocket");
			return;
		}
		const messageEvent = new MessageEvent("message", { data: message });
		await this.wsMessageListener(ws, messageEvent, attachment.playerId);
	}

	async webSocketClose(
		ws: WebSocket,
		code: number,
		reason: string,
		wasClean: boolean,
	) {
		console.log(
			`[WS] WebSocket closed: code=${code}, reason=${reason}, wasClean=${wasClean}`,
		);
		const attachment = ws.deserializeAttachment() as {
			playerId: string;
		} | null;
		if (attachment?.playerId) {
			this.updateDisconnectedPlayer(attachment.playerId);
		}
	}

	async webSocketError(_ws: WebSocket, error: unknown) {
		console.error("[WS] WebSocket error:", error);
	}

	broadcast(message: unknown) {
		const serialized = JSON.stringify(message);
		const webSockets = this.ctx.getWebSockets();
		for (const ws of webSockets) {
			try {
				ws.send(serialized);
			} catch (error) {
				console.error("[WS] Failed to send message:", error);
			}
		}
	}

	// --- Room Management Methods ---

	async addPlayer(playerId: string, playerName: string) {
		if (!this.state) return;

		// New player
		if (!this.state.players.some((p) => p.id === playerId)) {
			switch (this.state.status) {
				case "preparing":
					this.state.players.push({
						id: playerId,
						type: "player",
					});
					this.state.names[playerId] = playerName;
					this.state.playerStatus[playerId] = "preparing";

					await this.ctx.storage.put("gameState", this.state);
					this.broadcast({ type: "state", payload: this.state });
					break;
				case "playing":
					this.state.players.push({
						id: playerId,
						type: "spectator",
					});
					this.state.names[playerId] = playerName;
					this.state.playerStatus[playerId] = "spectating";

					await this.ctx.storage.put("gameState", this.state);
					this.broadcast({ type: "state", payload: this.state });
					break;
				case "paused":
					this.state.players.push({
						id: playerId,
						type: "spectator",
					});
					this.state.names[playerId] = playerName;
					this.state.playerStatus[playerId] = "spectating";

					await this.ctx.storage.put("gameState", this.state);
					this.broadcast({ type: "state", payload: this.state });
					break;
				default:
					this.state.status satisfies never;
			}
		} else {
			// Reconnecting player
			console.log(
				`[WS] Player ${playerId} reconnecting with status: ${this.state.playerStatus[playerId]}`,
			);

			switch (this.state.status) {
				case "preparing":
					// Allow reconnection during preparing phase, keep current status
					if (this.state.playerStatus[playerId] === "error") {
						this.state.playerStatus[playerId] = "preparing";
					}
					// If already preparing/ready, just continue with existing status
					break;
				case "playing":
					if (this.state.playerStatus[playerId] === "error") {
						this.state.playerStatus[playerId] = "spectating";
					}
					break;
				case "paused":
					this.state.playerStatus[playerId] = "playing";
					if (
						Object.values(this.state.playerStatus).every(
							(status) => status === "playing" || status === "spectating",
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

		this.state.players = this.state.players.filter((p) => p.id !== playerId);
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
		if (!this.state || !this.state.players.some((p) => p.id === playerId))
			return;

		const isStillConnected = this.ctx.getWebSockets().some((ws) => {
			const attachment = ws.deserializeAttachment() as {
				playerId: string;
			} | null;
			return attachment?.playerId === playerId;
		});

		if (!isStillConnected) {
			console.log(
				`[WS] Player ${playerId} disconnected, status: ${this.state.status}`,
			);
			if (this.state.status === "preparing") {
				this.state.playerStatus[playerId] = "error";
				await this.ctx.storage.put("gameState", this.state);
				this.broadcast({ type: "state", payload: this.state });
			} else {
				this.state.playerStatus[playerId] = "error";
				this.state.status = "paused";
				await this.ctx.storage.put("gameState", this.state);
				this.broadcast({ type: "state", payload: this.state });
			}
		}
	}

	async setReady(playerId: string, cpu?: number) {
		if (!this.state || this.state.status !== "preparing") return;
		this.state.playerStatus[playerId] = "ready";

		if (
			Object.values(this.state.playerStatus).filter((s) => s === "ready")
				.length +
				(cpu || 0) >=
				2 &&
			Object.values(this.state.playerStatus).every(
				(s) => s === "ready" || s === "spectatingReady",
			)
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

	async setspectatingReady(player: string) {
		if (!this.state) return;
		if (this.state.playerStatus[player] !== "preparing") {
			console.error("Player not in preparing state:", player);
			return;
		}
		this.state.playerStatus[player] = "spectatingReady";
		if (
			Object.values(this.state.playerStatus).filter((s) => s === "ready")
				.length >= 2 &&
			Object.values(this.state.playerStatus).every(
				(s) => s === "ready" || s === "spectatingReady",
			)
		) {
			this.startGame();
		} else {
			await this.ctx.storage.put("gameState", this.state);
			this.broadcast({ type: "state", payload: this.state });
		}
	}
	async cancelspectatingReady(player: string) {
		if (!this.state) return;
		if (this.state.playerStatus[player] !== "spectatingReady") {
			console.error("Player not in spectatingReady state:", player);
			return;
		}
		this.state.playerStatus[player] = "preparing";
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

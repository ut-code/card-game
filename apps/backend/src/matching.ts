import { DurableObject } from "cloudflare:workers";
import { randomInt } from "node:crypto";
import { PrismaClient } from "./generated/prisma/client";

const prisma = new PrismaClient();

function generateRandomString(length: number, charset?: string): string {
	const defaultCharset =
		"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
	const chars = charset || defaultCharset;
	let result = "";
	for (let i = 0; i < length; i++) {
		const randomIndex = Math.floor(Math.random() * chars.length);
		result += chars[randomIndex];
	}
	return result;
}

interface Session {
	ws: WebSocket;
	playerId: string;
}

export class Matching extends DurableObject {
	waitingUser: string[] | undefined = [];
	sessions: Session[] = [];

	constructor(ctx: DurableObjectState, env: unknown) {
		super(ctx, env);
		this.ctx.blockConcurrencyWhile(async () => {
			this.waitingUser = await this.ctx.storage.get<string[]>("waitingUser");
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
		await this.addUser(playerId);

		ws.addEventListener("message", async (msg) => {
			try {
				// TODO: 型をつける
				const { type, payload } = JSON.parse(msg.data as string);

				switch (type) {
				}
			} catch {
				ws.send(JSON.stringify({ error: "Invalid message" }));
			}
		});

		ws.send(JSON.stringify({ type: "addUser", payload: this.waitingUser }));

		if (this.waitingUser?.length === 2) {
			const roomName = generateRandomString(6);
			const room = await prisma.room.create({
				data: {
					name: roomName,
					hostId: this.waitingUser[0],
					users: this.waitingUser,
				},
			});
			const roomSecret = await prisma.roomSecret.create({
				data: {
					roomId: room.id,
					secret: randomInt(100000, 999999).toString(),
				},
			});
			ws.send(JSON.stringify({ type: "goRoom", payload: roomSecret }));
			this.waitingUser = [];
			ws.send(JSON.stringify({ type: "addUser", payload: this.waitingUser }));
		}
	}

	async addUser(playerId: string) {
		if (!this.waitingUser) {
			this.waitingUser = [];
		}
		if (
			this.waitingUser &&
			this.waitingUser.length !== 2 &&
			!this.waitingUser.includes(playerId)
		) {
			this.waitingUser.push(playerId);

			await this.ctx.storage.put("waitingUser", this.waitingUser);
			this.broadcast({ type: "addUser", payload: this.waitingUser });
		}
		if (this.waitingUser && this.waitingUser.length === 2) {
			console.log("GO!");
		}
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
}

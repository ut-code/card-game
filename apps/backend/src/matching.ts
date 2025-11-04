import { DurableObject } from "cloudflare:workers";
import { drizzle, type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import type { Env as HonoEnv } from "hono/types";
import postgres from "postgres";
import * as schema from "./db/schema";

interface Session {
	ws: WebSocket;
	playerId: string;
}

type Env = HonoEnv & { DATABASE_URL: string };

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

function randomInt(min: number, max: number): number {
	return Math.floor(Math.random() * (max - min + 1)) + min;
}

export class Matching extends DurableObject<Env> {
	sessions: Session[] = [];
	waitingUser: string[] = [];
	private db: PostgresJsDatabase<typeof schema>;

	constructor(ctx: DurableObjectState, env: Env) {
		super(ctx, env);
		const sql = postgres(this.env.DATABASE_URL);
		this.db = drizzle(sql, { schema });

		this.ctx.blockConcurrencyWhile(async () => {
			this.waitingUser =
				(await this.ctx.storage.get<string[]>("waitingUser")) || [];
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

		ws.addEventListener("close", () => this.removeUser(session));
		ws.addEventListener("error", () => this.removeUser(session));

		ws.send(JSON.stringify({ type: "userChange", payload: this.waitingUser }));
	}

	async addUser(playerId: string) {
		if (this.waitingUser.length !== 2 && !this.waitingUser.includes(playerId)) {
			this.waitingUser.push(playerId);
			await this.ctx.storage.put("waitingUser", this.waitingUser);
			this.broadcast({ type: "userChange", payload: this.waitingUser });
		}
		if (this.waitingUser && this.waitingUser.length === 2) {
			const matchedUsers = [...this.waitingUser];

			try {
				// データベース操作をトランザクションで囲む
				const { secret } = await this.db.transaction(async (tx) => {
					const roomName = generateRandomString(6);
					const secret = randomInt(100000, 999999).toString();

					const roomId = crypto.randomUUID();
					const [newRoom] = await tx
						.insert(schema.rooms)
						.values({
							id: roomId,
							name: roomName,
							gameTitle: "logic-puzzle",
							hostId: matchedUsers[0],
							users: matchedUsers,
							matchingType: "random",
						})
						.returning();

					await tx.insert(schema.roomSecrets).values({
						roomId: newRoom.id,
						secret: secret,
					});

					return { secret };
				});

				this.broadcast({ type: "goRoom", payload: secret });
				this.waitingUser = []; // すぐにリストをクリアして次の競合を防ぐ
				await this.ctx.storage.delete("waitingUser");

				// マッチした2人のユーザーにのみ通知
				const message = JSON.stringify({
					type: "goRoom",
					payload: { secret },
				});
				this.sessions
					.filter((s) => matchedUsers.includes(s.playerId))
					.forEach((s) => s.ws.send(message));
			} catch (error) {
				console.error("Failed to create room:", error);
				// 失敗した場合、ユーザーを待機リストに戻すか、エラーを通知する
				// ここではシンプルにエラーをログに出力するだけに留めます
			}
		}
	}
	async removeUser(session: Session) {
		this.sessions = this.sessions.filter((s) => s !== session);
		const index = this.waitingUser.indexOf(session.playerId);
		if (index > -1) {
			this.waitingUser.splice(index, 1);
			await this.ctx.storage.put("waitingUser", this.waitingUser);
			this.broadcast({ type: "userChange", payload: this.waitingUser });
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

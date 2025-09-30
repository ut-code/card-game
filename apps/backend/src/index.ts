import { eq } from "drizzle-orm";
import { drizzle, type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import { type Env, Hono } from "hono";
import { getSignedCookie, setSignedCookie } from "hono/cookie";
import { cors } from "hono/cors";
import { createMiddleware } from "hono/factory";
import { HTTPException } from "hono/http-exception";
import postgres from "postgres";
import * as schema from "./db/schema";

import {
	type GameState,
	Magic,
	type MessageType,
	type MoveAction,
	type Operation,
	type Rule,
} from "./magic";
import { Matching } from "./matching";

type Bindings = {
	MAGIC: DurableObjectNamespace;
	MATCHING: DurableObjectNamespace;
	DATABASE_URL: string;
	ENV: string;
};

export type User = typeof schema.users.$inferSelect;

type Variables = {
	db: PostgresJsDatabase<typeof schema>;
	user: User;
};

// TODO: 環境変数にする
const secret = "hoge";

const authMiddleware = createMiddleware<{ Variables: Variables }>(
	async (c, next) => {
		try {
			console.log("Entering auth middleware...");

			const db = c.get("db");
			const sessionToken = await getSignedCookie(c, secret, "sessionToken");

			if (!sessionToken) {
				console.log("No session token found. Throwing 401.");
				throw new HTTPException(401, { message: "Not authenticated" });
			}

			const session = await db.query.sessions.findFirst({
				where: eq(schema.sessions.sessionToken, sessionToken),
				with: {
					user: true,
				},
			});

			if (!session?.user) {
				console.log("Invalid session or user not found. Throwing 401.");
				throw new HTTPException(401, { message: "Invalid session" });
			}

			console.log("Authentication successful for user:", session.user.name);
			c.set("user", session.user);
			await next();
		} catch (error) {
			console.error("Error in auth middleware:", error);
			throw error;
		}
	},
);

const apiApp = new Hono<{
	env: Env;
	Bindings: Bindings;
	Variables: Variables;
}>()
	.use(
		"*",
		cors({
			// origin: (_origin, c) => {
			// 	if (c.env.ENV === "production") {
			// 		return undefined;
			// 	}
			// 	return "http://localhost:5173";
			// },
			origin: "http://localhost:5173",
			credentials: true,
		}),
	)
	.use("*", async (c, next) => {
		const sql = postgres(c.env.DATABASE_URL, { prepare: false });
		const db = drizzle(sql, { schema });
		c.set("db", db);
		await next();
	})

	// User routes
	.get("/users/me", authMiddleware, async (c) => {
		const user = c.get("user");
		return c.json(user);
	})
	.post("/users/create", async (c) => {
		const db = c.get("db");
		const { name } = await c.req.json<{ name: string }>();
		if (!name) {
			throw new HTTPException(400, { message: "Name is required" });
		}

		const userId = crypto.randomUUID();
		const [newUser] = await db
			.insert(schema.users)
			.values({ id: userId, name })
			.returning();

		const sessionToken = crypto.randomUUID();
		const [newSession] = await db
			.insert(schema.sessions)
			.values({ id: crypto.randomUUID(), userId, sessionToken })
			.returning();

		await setSignedCookie(c, "sessionToken", newSession.sessionToken, secret, {
			httpOnly: true,
			maxAge: 60 * 60 * 24 * 7, // 1 week
			secure: c.env.ENV === "production",
			sameSite: "Lax",
		});

		return c.json(newUser, 201);
	})

	// Room routes
	.get("/rooms", async (c) => {
		const db = c.get("db");
		const rooms = await db.query.rooms.findMany();
		return c.json(rooms);
	})
	.post("/rooms/create", authMiddleware, async (c) => {
		const db = c.get("db");
		const user = c.get("user");

		const { name } = await c.req.json<{ name: string }>();
		if (!name) {
			throw new HTTPException(400, { message: "Room name is required" });
		}

		const roomSecret = Math.floor(100000 + Math.random() * 900000).toString();
		const roomId = crypto.randomUUID();

		const [newRoom] = await db
			.insert(schema.rooms)
			.values({
				id: roomId,
				name,
				hostId: user.id,
				users: [user.id],
			})
			.returning();

		await db.insert(schema.roomSecrets).values({
			roomId: newRoom.id,
			secret: roomSecret,
		});

		return c.json(newRoom, 201);
	})
	.post("/rooms/join", authMiddleware, async (c) => {
		const db = c.get("db");
		const user = c.get("user");
		const { secret } = await c.req.json<{ secret: string }>();
		if (!secret) {
			throw new HTTPException(400, { message: "Secret is required" });
		}

		const roomSecret = await db.query.roomSecrets.findFirst({
			where: eq(schema.roomSecrets.secret, secret),
		});
		if (!roomSecret) {
			throw new HTTPException(401, { message: "Invalid secret" });
		}

		const room = await db.query.rooms.findFirst({
			where: eq(schema.rooms.id, roomSecret.roomId),
		});
		if (!room) {
			throw new HTTPException(404, { message: "Room not found" });
		}

		if (!room.users.includes(user.id)) {
			const newUsers = [...room.users, user.id];
			await db
				.update(schema.rooms)
				.set({ users: newUsers })
				.where(eq(schema.rooms.id, room.id));
		}

		return c.json(room, 200);
	})
	.get("/rooms/:roomId", async (c) => {
		const db = c.get("db");
		const { roomId } = c.req.param();
		const room = await db.query.rooms.findFirst({
			where: eq(schema.rooms.id, roomId),
		});
		if (!room) {
			throw new HTTPException(404, { message: "Room not found" });
		}
		return c.json(room);
	})
	.get("/rooms/:roomId/secret", authMiddleware, async (c) => {
		const db = c.get("db");
		const user = c.get("user");
		const { roomId } = c.req.param();
		const room = await db.query.rooms.findFirst({
			where: eq(schema.rooms.id, roomId),
		});
		if (!room) {
			throw new HTTPException(404, { message: "Room not found" });
		}
		if (!room.users.includes(user.id)) {
			throw new HTTPException(403, { message: "Unauthorized" });
		}
		const roomSecret = await db.query.roomSecrets.findFirst({
			where: eq(schema.roomSecrets.roomId, roomId),
		});
		if (!roomSecret) {
			throw new HTTPException(404, { message: "Room secret not found" });
		}
		return c.json(roomSecret);
	})
	.post("/rooms/:roomId/join", authMiddleware, async (c) => {
		const db = c.get("db");
		const user = c.get("user");
		const { roomId } = c.req.param();

		const room = await db.query.rooms.findFirst({
			where: eq(schema.rooms.id, roomId),
		});

		if (!room) {
			throw new HTTPException(404, { message: "Room not found" });
		}

		if (!room.users.includes(user.id)) {
			const newUsers = [...room.users, user.id];
			await db
				.update(schema.rooms)
				.set({ users: newUsers })
				.where(eq(schema.rooms.id, room.id));
		}

		return c.json({ message: "Joined room successfully" });
	})
	.post("/rooms/:roomId/leave", authMiddleware, async (c) => {
		const db = c.get("db");
		const user = c.get("user");
		const { roomId } = c.req.param();

		const room = await db.query.rooms.findFirst({
			where: eq(schema.rooms.id, roomId),
		});

		if (!room) {
			return c.json({ message: "Left room successfully" });
		}

		const updatedUsers = room.users.filter((p) => p !== user.id);

		await db
			.update(schema.rooms)
			.set({ users: updatedUsers })
			.where(eq(schema.rooms.id, roomId));

		return c.json({ message: "Left room successfully" });
	})
	.get("/games/:id/ws", authMiddleware, async (c) => {
		const db = c.get("db");
		const roomId = c.req.param("id");
		const user = c.get("user");

		const room = await db.query.rooms.findFirst({
			where: eq(schema.rooms.id, roomId),
		});
		if (!room) {
			throw new HTTPException(404, { message: "Room not found" });
		}
		if (!room.users.includes(user.id)) {
			throw new HTTPException(403, { message: "Unauthorized" });
		}

		const id = c.env.MAGIC.idFromName(roomId);
		const stub = c.env.MAGIC.get(id);

		const url = new URL(c.req.url);
		url.searchParams.set("playerId", user.id);

		const request = new Request(url.toString(), c.req.raw);
		return stub.fetch(request);
	})
	.get("/matching/ws", authMiddleware, async (c) => {
		const user = c.get("user");

		const id = c.env.MATCHING.idFromName("matching");
		const stub = c.env.MATCHING.get(id);

		const url = new URL(c.req.url);
		url.searchParams.set("playerId", user.id);
		const playerName = new URL(c.req.url).searchParams.get("playerName");
		if (playerName) {
			url.searchParams.set("playerName", playerName);
		}

		const request = new Request(url.toString(), c.req.raw);
		return stub.fetch(request);
	});

export type AppType = typeof apiApp;
export default apiApp;

export type { GameState, MoveAction, MessageType, Rule, Operation };
export { Magic, Matching };

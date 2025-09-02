import { Hono } from "hono";
import { getSignedCookie, setSignedCookie } from "hono/cookie";
import { cors } from "hono/cors";
import { type GameState, Magic, type MoveAction } from "./magic";

type Bindings = {
	MAGIC: DurableObjectNamespace;
	MAGIC_ROOMS: KVNamespace;
	MAGIC_USERS: KVNamespace;
};

export type User = {
	id: string;
	name: string;
};

export type Room = {
	id: string;
	name: string;
	players: string[];
};

// TODO: 環境変数にする
const secret = "hoge";

const app = new Hono<{ Bindings: Bindings }>()
	.use(
		"*",
		cors({
			origin: "http://localhost:5173",
			credentials: true,
		}),
	)
	.basePath("/api")

	// User routes (remains the same)
	.get("/users/me", async (c) => {
		const userId = await getSignedCookie(c, secret, "userId");

		if (!userId) {
			console.error("User ID cookie is missing or invalid");
			return c.json({ error: "User ID is missing" }, 400);
		}
		const user = (await c.env.MAGIC_USERS.get(userId, { type: "json" })) as {
			id: string;
			name: string;
		} | null;
		if (!user) {
			console.error(`User not found for ID: ${userId}`);
			return c.json({ error: "User not found" }, 404);
		}
		return c.json(user);
	})
	.post("/users/create", async (c) => {
		const { name } = await c.req.json<{ name: string }>();
		if (!name) {
			return c.json({ error: "Name is required" }, 400);
		}
		const userId = `user-${crypto.randomUUID()}`;
		const user = { id: userId, name };
		await c.env.MAGIC_USERS.put(userId, JSON.stringify({ id: userId, name }));

		await setSignedCookie(c, "userId", userId, secret, {
			httpOnly: true,
			maxAge: 60 * 60 * 24 * 7, // 1 week
			secure: false, // Allow cookie over HTTP in development
			sameSite: "Lax",
		});
		return c.json(user, 201);
	})

	// Room routes
	.get("/rooms", async (c) => {
		const list = await c.env.MAGIC_ROOMS.list();
		const rooms = await Promise.all(
			list.keys.map((k) => c.env.MAGIC_ROOMS.get(k.name, { type: "json" })),
		);
		return c.json(rooms.filter(Boolean));
	})
	.post("/rooms/create", async (c) => {
		const { name } = await c.req.json<{ name: string }>();
		if (!name) {
			return c.json({ error: "Room name is required" }, 400);
		}
		const roomId = `room-${crypto.randomUUID()}`;
		const room = { id: roomId, name, players: [] };
		await c.env.MAGIC_ROOMS.put(roomId, JSON.stringify(room));
		return c.json(room, 201);
	})
	.get("/rooms/:roomId", async (c) => {
		const { roomId } = c.req.param();
		const room = await c.env.MAGIC_ROOMS.get(roomId, { type: "json" });
		if (!room) {
			return c.json({ error: "Room not found" }, 404);
		}
		return c.json(room);
	})
	.post("/rooms/:roomId/join", async (c) => {
		const { roomId } = c.req.param();
		const userId = await getSignedCookie(c, secret, "userId");
		if (!userId) {
			return c.json({ error: "User not authenticated" }, 401);
		}
		const room = (await c.env.MAGIC_ROOMS.get(roomId, { type: "json" })) as {
			id: string;
			name: string;
			players: string[];
		} | null;
		if (!room) {
			return c.json({ error: "Room not found" }, 404);
		}
		if (!room.players.includes(userId)) {
			room.players.push(userId);
		}
		return c.json({ message: "Joined room successfully" });
	})
	.post("/rooms/:roomId/leave", async (c) => {
		const { roomId } = c.req.param();
		const userId = await getSignedCookie(c, secret, "userId");
		if (!userId) {
			return c.json({ error: "User not authenticated" }, 401);
		}
		const room = (await c.env.MAGIC_ROOMS.get(roomId, { type: "json" })) as {
			id: string;
			name: string;
			players: string[];
		} | null;
		if (!room) {
			return c.json({ error: "Room not found" }, 404);
		}
		room.players = room.players.filter((p) => p !== userId);
		await c.env.MAGIC_ROOMS.put(roomId, JSON.stringify(room));
		return c.json({ message: "Left room successfully" });
	})

	// --- New Game WebSocket Route ---
	.get("/games/:id/ws", async (c) => {
		const gameId = c.req.param("id");
		const userId = await getSignedCookie(c, secret, "userId");
		if (!userId) {
			return c.json({ error: "User not authenticated" }, 401);
		}

		const id = c.env.MAGIC.idFromName(gameId);
		const stub = c.env.MAGIC.get(id);

		const url = new URL(c.req.url);
		url.searchParams.set("playerId", userId);

		const request = new Request(url.toString(), c.req.raw);
		return stub.fetch(request);
	});

export type AppType = typeof app;
export default app;

export type { GameState, MoveAction };
export { Magic };

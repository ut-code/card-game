import { Hono } from "hono";
import { upgradeWebSocket } from "hono/cloudflare-workers";
import { getSignedCookie, setSignedCookie } from "hono/cookie";
import { cors } from "hono/cors";

// Note: In a real application, you would use a proper database or KV store.
const rooms: Record<string, { id: string; name: string; players: string[] }> =
	{};
const users: Record<string, { id: string; name: string }> = {};

// TODO: 環境変数にする
const secret = "hoge";

const app = new Hono()
	.use(
		"*",
		cors({
			origin: "http://localhost:5173",
			credentials: true,
		}),
	)
	.basePath("/api")
	// User routes
	.get("/users/me", async (c) => {
		const userId = await getSignedCookie(c, secret, "userId");

		if (!userId) {
			console.error("User ID cookie is missing or invalid");
			return c.json({ error: "User ID is missing" }, 400);
		}

		const user = users[userId]; // Mock: get first user
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
		users[userId] = { id: userId, name };

		await setSignedCookie(c, "userId", userId, secret, {
			httpOnly: true,
			maxAge: 60 * 60 * 24 * 7, // 1 week
			secure: false, // Allow cookie over HTTP in development
			sameSite: "Lax",
		});
		return c.json(users[userId], 201);
	})

	// Room routes
	.get("/rooms", (c) => {
		return c.json(Object.values(rooms));
	})
	.post("/rooms/create", async (c) => {
		const { name } = await c.req.json<{ name: string }>();
		if (!name) {
			return c.json({ error: "Room name is required" }, 400);
		}
		const roomId = `room-${crypto.randomUUID()}`;
		rooms[roomId] = { id: roomId, name, players: [] };
		return c.json(rooms[roomId], 201);
	})
	.get("/rooms/:roomId", (c) => {
		const { roomId } = c.req.param();
		const room = rooms[roomId];
		if (!room) {
			return c.json({ error: "Room not found" }, 404);
		}
		// TODO: Return actual game state
		return c.json<{ id: string; name: string; players: string[] }>(room);
	})
	.post("/rooms/:roomId/join", async (c) => {
		const { roomId } = c.req.param();
		// TODO: Get userId from session
		const userId = await getSignedCookie(c, secret, "userId");
		if (!userId) {
			return c.json({ error: "User not authenticated" }, 401);
		}
		const room = rooms[roomId];
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
		const room = rooms[roomId];
		if (!room) {
			return c.json({ error: "Room not found" }, 404);
		}
		room.players = room.players.filter((p) => p !== userId);
		return c.json({ message: "Left room successfully" });
	})
	.get(
		"/rooms/:roomId/ws",
		upgradeWebSocket((c) => {
			const { roomId } = c.req.param();
			console.log(`WebSocket connection opened for room: ${roomId}`);
			return {
				onMessage: (evt, ws) => {
					console.log(`Message from client in room ${roomId}: ${evt.data}`);
					// TODO: Broadcast message to other clients in the same room
					ws.send(JSON.stringify({ type: "pong", roomId }));
				},
				onClose: () => {
					console.log(`Connection closed for room: ${roomId}`);
				},
			};
		}),
	)
	.get(
		"/ws",
		upgradeWebSocket(() => {
			console.log("WebSocket connection opened");
			return {
				onMessage: (evt, ws) => {
					console.log(`Message from client: ${evt.data}`);
					ws.send(JSON.stringify({ type: "pong" }));
				},
				onClose: () => {
					console.log("Connection closed");
				},
			};
		}),
	);

export type AppType = typeof app;
export default app;

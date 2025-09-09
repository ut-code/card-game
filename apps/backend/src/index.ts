import { PrismaPg } from "@prisma/adapter-pg";
import { Hono } from "hono";
import { getSignedCookie, setSignedCookie } from "hono/cookie";
import { cors } from "hono/cors";
import { Pool } from "pg";
import { PrismaClient } from "./generated/prisma";
import { type GameState, Magic, type MoveAction } from "./magic";

type Bindings = {
	MAGIC: DurableObjectNamespace;
	DATABASE_URL: string;
};

type Variables = {
	prisma: PrismaClient;
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

const app = new Hono<{ Bindings: Bindings; Variables: Variables }>()
	.use(
		"*",
		cors({
			origin: "http://localhost:5173",
			credentials: true,
		}),
	)
	.use("*", async (c, next) => {
		const pool = new Pool({ connectionString: c.env.DATABASE_URL });
		const adapter = new PrismaPg(pool);
		const prisma = new PrismaClient({ adapter });
		c.set("prisma", prisma);
		await next();
	})
	.basePath("/api")

	// User routes (remains the same)
	.get("/users/me", async (c) => {
		const prisma = c.get("prisma");
		const userId = await getSignedCookie(c, secret, "userId");

		if (!userId) {
			console.error("User ID cookie is missing or invalid");
			return c.json({ error: "User ID is missing" }, 400);
		}
		const user = await prisma.user.findUnique({ where: { id: userId } });
		if (!user) {
			console.error(`User not found for ID: ${userId}`);
			return c.json({ error: "User not found" }, 404);
		}
		return c.json(user);
	})
	.post("/users/create", async (c) => {
		const prisma = c.get("prisma");
		const { name } = await c.req.json<{ name: string }>();
		if (!name) {
			return c.json({ error: "Name is required" }, 400);
		}
		const user = await prisma.user.create({
			data: {
				name,
			},
		});

		await setSignedCookie(c, "userId", user.id, secret, {
			httpOnly: true,
			maxAge: 60 * 60 * 24 * 7, // 1 week
			secure: false, // Allow cookie over HTTP in development
			sameSite: "Lax",
		});
		return c.json(user, 201);
	})

	// Room routes
	.get("/rooms", async (c) => {
		const prisma = c.get("prisma");
		const rooms = await prisma.room.findMany();
		return c.json(rooms);
	})
	.post("/rooms/create", async (c) => {
		const prisma = c.get("prisma");
		const { name } = await c.req.json<{ name: string }>();
		if (!name) {
			return c.json({ error: "Room name is required" }, 400);
		}

		const userId = await getSignedCookie(c, secret, "userId");
		if (!userId) {
			return c.json({ error: "User not authenticated" }, 401);
		}

		const room = await prisma.room.create({
			data: {
				name,
				hostId: userId,
				users: [userId],
			},
		});
		return c.json(room, 201);
	})
	.get("/rooms/:roomId", async (c) => {
		const prisma = c.get("prisma");
		const { roomId } = c.req.param();
		const room = await prisma.room.findUnique({ where: { id: roomId } });
		if (!room) {
			return c.json({ error: "Room not found" }, 404);
		}
		return c.json(room);
	})
	.post("/rooms/:roomId/join", async (c) => {
		const prisma = c.get("prisma");
		const { roomId } = c.req.param();
		const userId = await getSignedCookie(c, secret, "userId");
		if (!userId) {
			return c.json({ error: "User not authenticated" }, 401);
		}

		const room = await prisma.room.findUnique({ where: { id: roomId } });

		if (!room) {
			return c.json({ error: "Room not found" }, 404);
		}

		if (!room.users.includes(userId)) {
			await prisma.room.update({
				where: { id: roomId },
				data: { users: { push: userId } },
			});
		}

		return c.json({ message: "Joined room successfully" });
	})
	.post("/rooms/:roomId/leave", async (c) => {
		const prisma = c.get("prisma");
		const { roomId } = c.req.param();
		const userId = await getSignedCookie(c, secret, "userId");
		if (!userId) {
			return c.json({ error: "User not authenticated" }, 401);
		}

		const room = await prisma.room.findUnique({ where: { id: roomId } });

		if (!room) {
			// Even if room doesn't exist, from user's perspective, they have left.
			return c.json({ message: "Left room successfully" });
		}

		const updatedUsers = room.users.filter((p) => p !== userId);

		await prisma.room.update({
			where: { id: roomId },
			data: { users: updatedUsers },
		});

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

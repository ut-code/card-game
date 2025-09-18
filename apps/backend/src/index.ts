import { randomInt } from "node:crypto";
import { PrismaPg } from "@prisma/adapter-pg";
import { Hono } from "hono";
import { getSignedCookie, setSignedCookie } from "hono/cookie";
import { cors } from "hono/cors";
import { createMiddleware } from "hono/factory";
import { Pool } from "pg";
import { PrismaClient } from "./generated/prisma";
import {
	type GameState,
	Magic,
	type MessageType,
	type MoveAction,
	type Operation,
	type Rule,
} from "./magic";

type Bindings = {
	MAGIC: DurableObjectNamespace;
	DATABASE_URL: string;
};

type Variables = {
	prisma: PrismaClient;
	user: User;
};

export type User = {
	id: string;
	name: string;
};

// TODO: 環境変数にする
const secret = "hoge";

const authMiddleware = createMiddleware<{ Variables: Variables }>(
	async (c, next) => {
		const prisma = c.get("prisma");
		const sessionToken = await getSignedCookie(c, secret, "sessionToken");
		if (!sessionToken) {
			return c.json({ error: "Not authenticated" }, 401);
		}

		const session = await prisma.session.findUnique({
			where: { sessionToken },
			include: { user: true },
		});

		const user = session?.user;

		if (!user) {
			return c.json({ error: "Invalid session" }, 401);
		}

		c.set("user", user);
		await next();
	},
);

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
	.get("/users/me", authMiddleware, async (c) => {
		const user = c.get("user");
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

		const session = await prisma.session.create({
			data: {
				userId: user.id,
				sessionToken: crypto.randomUUID(),
			},
		});

		await setSignedCookie(c, "sessionToken", session.sessionToken, secret, {
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
	.post("/rooms/create", authMiddleware, async (c) => {
		const prisma = c.get("prisma");
		const user = c.get("user");

		const { name } = await c.req.json<{ name: string }>();
		if (!name) {
			return c.json({ error: "Room name is required" }, 400);
		}

		const secret = randomInt(100000, 999999).toString();

		const room = await prisma.room.create({
			data: {
				name,
				hostId: user.id,
				users: [user.id],
			},
		});

		await prisma.roomSecret.create({
			data: {
				roomId: room.id,
				secret,
			},
		});

		return c.json(room, 201);
	})
	.post("/rooms/join", authMiddleware, async (c) => {
		const prisma = c.get("prisma");
		const user = c.get("user");
		const { secret } = await c.req.json<{ secret: string }>();
		if (!secret) {
			return c.json({ error: "Secret is required" }, 400);
		}

		const roomSecret = await prisma.roomSecret.findUnique({
			where: { secret },
		});
		if (!roomSecret) {
			return c.json({ error: "Invalid secret" }, 401);
		}

		const room = await prisma.room.findUnique({
			where: { id: roomSecret.roomId },
		});
		if (!room) {
			return c.json({ error: "Room not found" }, 404);
		}

		if (!room.users.includes(user.id)) {
			await prisma.room.update({
				where: { id: room.id },
				data: { users: { push: user.id } },
			});
		}

		return c.json(room, 200);
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
	.get("/rooms/:roomId/secret", async (c) => {
		const prisma = c.get("prisma");
		const { roomId } = c.req.param();
		const roomSecret = await prisma.roomSecret.findUnique({
			where: { roomId: roomId },
		});
		if (!roomSecret) {
			return c.json({ error: "Room not found" }, 404);
		}
		return c.json(roomSecret);
	})
	.post("/rooms/:roomId/join", authMiddleware, async (c) => {
		const prisma = c.get("prisma");
		const user = c.get("user");
		const { roomId } = c.req.param();

		const room = await prisma.room.findUnique({ where: { id: roomId } });

		if (!room) {
			return c.json({ error: "Room not found" }, 404);
		}

		if (!room.users.includes(user.id)) {
			await prisma.room.update({
				where: { id: roomId },
				data: { users: { push: user.id } },
			});
		}

		return c.json({ message: "Joined room successfully" });
	})
	.post("/rooms/:roomId/leave", authMiddleware, async (c) => {
		const prisma = c.get("prisma");
		const user = c.get("user");
		const { roomId } = c.req.param();

		const room = await prisma.room.findUnique({ where: { id: roomId } });

		if (!room) {
			// Even if room doesn't exist, from user's perspective, they have left.
			return c.json({ message: "Left room successfully" });
		}

		const updatedUsers = room.users.filter((p) => p !== user.id);

		await prisma.room.update({
			where: { id: roomId },
			data: { users: updatedUsers },
		});

		return c.json({ message: "Left room successfully" });
	})
	.get("/rooms/:roomId/secret", authMiddleware, async (c) => {
		const prisma = c.get("prisma");
		const user = c.get("user");
		const { roomId } = c.req.param();
		const room = await prisma.room.findUnique({
			where: { id: roomId },
		});
		if (!room) {
			return c.json({ error: "Room not found" }, 404);
		}
		if (!room.users.some((id) => id === user?.id)) {
			return c.json({ error: "Unauthorized" }, 403);
		}
		const roomSecret = await prisma.roomSecret.findUnique({
			where: { roomId: roomId },
		});
		if (!roomSecret) {
			return c.json({ error: "Room not found" }, 404);
		}
		return c.json(roomSecret);
	})
	.get("/games/:id/ws", authMiddleware, async (c) => {
		const gameId = c.req.param("id");
		const user = c.get("user");

		const id = c.env.MAGIC.idFromName(gameId);
		const stub = c.env.MAGIC.get(id);

		const url = new URL(c.req.url);
		url.searchParams.set("playerId", user.id);

		const request = new Request(url.toString(), c.req.raw);
		return stub.fetch(request);
	});

export type AppType = typeof app;
export default app;

export type { GameState, MoveAction, MessageType, Rule, Operation };
export { Magic };

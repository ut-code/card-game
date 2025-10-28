import { relations } from "drizzle-orm";
import { pgTable, text, timestamp } from "drizzle-orm/pg-core";

export const users = pgTable("User", {
	id: text("id").primaryKey(),
	createdAt: timestamp("createdAt", { withTimezone: true }).defaultNow(),
	name: text("name").notNull(),
});

export const sessions = pgTable("Session", {
	id: text("id").primaryKey(),
	userId: text("userId")
		.notNull()
		.references(() => users.id, { onDelete: "cascade" }),
	sessionToken: text("sessionToken").notNull().unique(),
});

export const rooms = pgTable("Room", {
	id: text("id").primaryKey(),
	name: text("name").notNull(),
	createdAt: timestamp("createdAt", { withTimezone: true }).defaultNow(),
	users: text("users").array().notNull(),
	hostId: text("hostId")
		.notNull()
		.references(() => users.id),
	matchingType: text("matchingType").default("room").notNull(),
});

export const roomSecrets = pgTable("RoomSecret", {
	roomId: text("roomId")
		.primaryKey()
		.references(() => rooms.id, { onDelete: "cascade" }),
	secret: text("secret").notNull().unique(),
});

export const Ids = pgTable("Ids", {
	roomId: text("roomId")
		.primaryKey()
		.references(() => rooms.id, { onDelete: "cascade" }),
	gameId: text("gameId"),
});

// --- Relations ---

export const usersRelations = relations(users, ({ many }) => ({
	sessions: many(sessions),
	hostedRooms: many(rooms),
}));

export const sessionsRelations = relations(sessions, ({ one }) => ({
	user: one(users, {
		fields: [sessions.userId],
		references: [users.id],
	}),
}));

export const roomsRelations = relations(rooms, ({ one }) => ({
	host: one(users, {
		fields: [rooms.hostId],
		references: [users.id],
	}),
	secret: one(roomSecrets),
}));

export const roomSecretsRelations = relations(roomSecrets, ({ one }) => ({
	room: one(rooms, {
		fields: [roomSecrets.roomId],
		references: [rooms.id],
	}),
}));

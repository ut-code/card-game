import { Hono } from "hono";
import { upgradeWebSocket } from "hono/cloudflare-workers";

const app = new Hono()
	.basePath("/api")
	.get("/hello", (c) => {
		return c.json({
			message: "Hello From Hono !!",
		});
	})
	.get(
		"/ws",
		upgradeWebSocket((_c) => {
			return {
				onMessage: (evt, ws) => {
					console.log(`Message from client: ${evt.data}`);
					ws.send('{"type":"pong"}');
				},
				onClose: () => {
					console.log("Connection closed");
				},
			};
		}),
	);

export type AppType = typeof app;

export default app;

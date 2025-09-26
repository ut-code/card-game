import apiApp, { Magic } from "@apps/backend";
import { Hono } from "hono";
import type { Bindings } from "hono/types";
import { createRequestHandler } from "react-router";

declare module "react-router" {
	export interface AppLoadContext {
		cloudflare: {
			env: Env;
			ctx: ExecutionContext;
		};
	}
}

const requestHandler = createRequestHandler(
	() => import("virtual:react-router/server-build"),
	import.meta.env.MODE,
);

const app = new Hono<{ Bindings: Bindings }>();

app.route("/api", apiApp);

app.get("*", (c) => {
	return requestHandler(c.req.raw, {
		cloudflare: {
			env: c.env,
			ctx: c.executionCtx,
		},
	});
});

export default app;
export { Magic };

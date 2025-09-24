import apiApp, { Magic } from "@apps/backend";
import { Hono } from "hono";
import type { Bindings } from "hono/types";
import { createRequestHandler } from "react-router";

declare module "react-router" {
	export interface AppLoadContext {
		cloudflare: {
			env: Bindings;
			ctx: ExecutionContext;
		};
	}
}

const requestHandler = createRequestHandler(
	() => import("virtual:react-router/server-build"),
	import.meta.env.MODE,
);

// export default {
// 	async fetch(request, env, ctx) {
// 		return requestHandler(request, {
// 			cloudflare: { env, ctx },
// 		});
// 	},
// } satisfies ExportedHandler<Env>;

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

// import handle from "hono-react-router-adapter/cloudflare-workers";
// import * as build from "virtual:react-router/server-build";
// import app, { Magic } from "@apps/backend";

// export default handle(build, app);
// export { Magic };

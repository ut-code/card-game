import type { AppType } from "@apps/backend";
import { hc } from "hono/client";
import { API_BASE_URL } from "../lib/env";

export const client = hc<AppType>(API_BASE_URL, {
	init: {
		credentials: "include",
	},
});

// export function getLoaderApiClient(request: Request) {
// 	const url = new URL(request.url);
// 	const baseUrl = url.origin === "http://localhost:5173"
// 		? "http://localhost:8787"
// 		: `${url.origin}/api/`;

// 	console.log("Base URL for API client:", baseUrl);

// 	const client = hc<AppType>(baseUrl, {
// 		init: {
// 			credentials: "include",
// 			headers: {
// 				cookie: request.headers.get("cookie") ?? "",
// 			},
// 		},
// 	});

// 	// const loaderClient = hc<AppType>("http://localhost:36709/api/", {
// 	// 	// init: {
// 	// 	// 	credentials: "include",
// 	// 	// },
// 	// 	fetch: async (input: URL | RequestInfo, init?: RequestInit) => {
// 	// 		const req = new Request(input, init);
// 	// 		const url = new URL(req.url);
// 	// 		// if (!url.pathname.startsWith("/api")) {
// 	// 		// 	// Adjust the URL to point to the correct backend API endpoint
// 	// 		// 	console.log("Redirecting API request to backend:", url.pathname);
// 	// 		// 	const newUrl = new URL(
// 	// 		// 		`http://localhost:36709/api${url.pathname}`,
// 	// 		// 	);
// 	// 		// 	return fetch("hoge", req);
// 	// 		// }
// 	// 		const res = await fetch("/hoge", req);
// 	// 		return res;
// 	// 	},
// 	// });

// 	return client;
// }

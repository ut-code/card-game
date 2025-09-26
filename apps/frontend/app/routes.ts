import {
	index,
	layout,
	type RouteConfig,
	route,
} from "@react-router/dev/routes";

export default [
	index("routes/home.tsx"),
	layout("routes/magic-square/layout.tsx", [
		route("magic-square", "routes/magic-square/home.tsx"),
		route("magic-square/room/:roomId", "routes/magic-square/room.$roomId.tsx"),
	]),
] satisfies RouteConfig;

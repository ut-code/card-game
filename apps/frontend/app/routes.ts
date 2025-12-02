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
		route("magic-square/matching", "routes/magic-square/matching.tsx"),
		route("magic-square/room/:roomId", "routes/magic-square/room.$roomId.tsx"),
	]),
	layout("routes/memory-optimization/layout.tsx", [
		route("memory-optimization", "routes/memory-optimization/home.tsx"),
		route(
			"memory-optimization/room/:roomId",
			"routes/memory-optimization/room.$roomId.tsx",
		),
	]),
] satisfies RouteConfig;

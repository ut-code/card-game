import { index, type RouteConfig, route } from "@react-router/dev/routes";

export default [
	index("routes/home.tsx"),
	route("logic-puzzle", "routes/logic-puzzle.tsx"),
] satisfies RouteConfig;

import { index, type RouteConfig, route } from "@react-router/dev/routes";

export default [
	index("routes/home.tsx"),
	route("logic-puzzle", "routes/logic-puzzle.tsx"),
	route("logic-puzzle/test", "routes/logic-puzzle/test.tsx"),
	route("logic-puzzle/lobby", "routes/logic-puzzle/lobby.tsx"),
	route("logic-puzzle/room/:roomId", "routes/logic-puzzle/room.$roomId.tsx"),
] satisfies RouteConfig;

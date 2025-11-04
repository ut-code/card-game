import { Outlet } from "react-router";

export function HydrateFallback() {
	return (
		<div className="flex items-center justify-center min-h-screen">
			<div className="loading loading-spinner loading-lg" />
		</div>
	);
}

export default function LogicPuzzleLayout() {
	return <Outlet />;
}

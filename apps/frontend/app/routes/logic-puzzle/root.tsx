import {
	type ClientLoaderFunctionArgs,
	Outlet,
	redirect,
	useLoaderData,
} from "react-router";
import { client } from "../../lib/client";

export async function clientLoader({ request }: ClientLoaderFunctionArgs) {
	const url = new URL(request.url);
	const pathname = url.pathname;

	const roomMatch = pathname.match(/^\/logic-puzzle\/room\/([^/]+)/);

	if (roomMatch) {
		const roomId = roomMatch[1];

		const [userRes, roomRes, roomSecretRes] = await Promise.all([
			client.users.me.$get(),
			client.rooms[":roomId"].$get({ param: { roomId } }),
			client.rooms[":roomId"].secret.$get({
				param: { roomId },
			}),
		]);

		if (!userRes.ok || !roomRes.ok || !roomSecretRes.ok) {
			return redirect("/logic-puzzle/lobby");
		}

		const user = await userRes.json();
		const roomData = await roomRes.json();
		const roomSecretData = await roomSecretRes.json();

		if (!roomData.users.includes(user.id)) {
			return redirect("/logic-puzzle/lobby");
		}

		return { user, secret: roomSecretData.secret, hostId: roomData.hostId };
	}

	if (url.pathname === "/logic-puzzle/lobby") {
		try {
			const res = await client.users.me.$get({});

			if (!res.ok) throw new Error("Failed to fetch user.", { cause: res });
			const user = await res.json();

			return user;
		} catch (e) {
			console.error(e);
			return null;
		}
	}

	throw new Error("Invalid route");
}

export function HydrateFallback() {
	return (
		<div className="flex items-center justify-center min-h-screen">
			<div className="loading loading-spinner loading-lg" />
		</div>
	);
}

export default function LogicPuzzleLayout() {
	const context = useLoaderData<typeof clientLoader>();

	return <Outlet context={context} />;
}

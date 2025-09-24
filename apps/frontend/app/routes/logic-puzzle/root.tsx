import {
	type LoaderFunctionArgs,
	Outlet,
	redirect,
	useLoaderData,
} from "react-router";
import { client } from "~/lib/client";

export async function loader({ request }: LoaderFunctionArgs) {
	const url = new URL(request.url);
	const pathname = url.pathname;
	const cookie = request.headers.get("cookie");

	const roomMatch = pathname.match(/^\/logic-puzzle\/room\/([^/]+)/);

	if (roomMatch) {
		const roomId = roomMatch[1];
		if (!cookie) {
			return redirect("/logic-puzzle/lobby");
		}

		const [userRes, roomRes, roomSecretRes] = await Promise.all([
			client.users.me.$get({}, { headers: { cookie } }),
			client.rooms[":roomId"].$get({ param: { roomId } }),
			client.rooms[":roomId"].secret.$get(
				{
					param: { roomId },
				},
				{
					headers: { cookie },
				},
			),
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
			if (!cookie) return null;

			const res = await client.users.me.$get({}, { headers: { cookie } });
			if (!res.ok) return null;

			return await res.json();
		} catch {
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
	const context = useLoaderData<typeof loader>();

	return <Outlet context={context} />;
}

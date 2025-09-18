import {
	type LoaderFunctionArgs,
	Outlet,
	redirect,
	useLoaderData,
} from "react-router";
import { client } from "~/lib/client";

export async function loader({ request }: LoaderFunctionArgs) {
	const url = new URL(request.url);

	if (url.pathname === "/logic-puzzle/lobby") {
		try {
			const cookie = request.headers.get("cookie");
			if (!cookie) return null;

			const res = await client.api.users.me.$get({}, { headers: { cookie } });
			if (!res.ok) return null;

			return await res.json();
		} catch {
			return null;
		}
	}

	try {
		const cookie = request.headers.get("cookie");

		if (!cookie) {
			return redirect("/logic-puzzle/lobby");
		}

		const res = await client.api.users.me.$get({}, { headers: { cookie } });

		if (!res.ok) {
			return redirect("/logic-puzzle/lobby");
		}

		const user = await res.json();
		return user;
	} catch (error) {
		console.error("Error in loader:", error);
		return redirect("/logic-puzzle/lobby");
	}
}

export function HydrateFallback() {
	return <div>Loading...</div>;
}

export default function LogicPuzzleLayout() {
	const user = useLoaderData<typeof loader>();

	return <Outlet context={user} />;
}

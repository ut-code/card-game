import {
	type LoaderFunctionArgs,
	Outlet,
	redirect,
	useLoaderData,
} from "react-router";
import { client } from "~/lib/client";

export async function loader({ request }: LoaderFunctionArgs) {
	try {
		const cookie = request.headers.get("cookie");

		if (!cookie) {
			redirect("/logic-puzzle/lobby");
			return null;
		}

		const res = await client.api.users.me.$get(
			{},
			{
				headers: { cookie },
			},
		);

		if (!res.ok) {
			console.error("Failed to fetch user:", res.status, await res.text());
			redirect("/logic-puzzle/lobby");
			return null;
		}

		const user = await res.json();
		return user;
	} catch (error) {
		console.error("Error in loader:", error);
		redirect("/logic-puzzle/lobby");
		return null;
	}
}

export function HydrateFallback() {
	return <div>Loading...</div>;
}

export default function LogicPuzzleLayout() {
	const user = useLoaderData<typeof loader>();

	return <Outlet context={user} />;
}

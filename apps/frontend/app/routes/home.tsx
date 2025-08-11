import { client } from "~/lib/client";
import type { Route } from "./+types/home";

export function meta(_args: Route.MetaArgs) {
	return [
		{ title: "New React Router App" },
		{ name: "description", content: "Welcome to React Router!" },
	];
}

export async function loader(_args: Route.LoaderArgs) {
	const res = await client.hello.$get();
	const hello = await res.json();
	return {
		hello: hello.message,
	};
}

export default function Home({ loaderData }: Route.ComponentProps) {
	return <div>{loaderData.hello}</div>;
}

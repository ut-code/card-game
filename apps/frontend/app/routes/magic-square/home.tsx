import type { User } from "@apps/backend";
import { useEffect, useState } from "react";
import {
	type ClientActionFunctionArgs,
	Form,
	redirect,
	useActionData,
	useLoaderData,
	useNavigation,
	useSubmit,
} from "react-router";
import { client } from "~/lib/client";
import { IS_DEV } from "~/lib/env";

type Room = {
	id: string;
	name: string;
	users: string[];
};

export async function clientLoader() {
	let user: (User & { createdAt: Date | null }) | null = null;
	let rooms: Room[] = [];

	try {
		const res = await client.users.me.$get({});
		if (res.ok) {
			const data = await res.json();
			user = {
				...data,
				createdAt: data.createdAt ? new Date(data.createdAt) : null,
			};
		} else {
			const newUserName = `player-${Math.floor(Math.random() * 100000)}`;
			const createRes = await client.users.create.$post({
				json: { name: newUserName },
			});
			const data = await createRes.json();
			user = {
				...data,
				createdAt: data.createdAt ? new Date(data.createdAt) : null,
			};
		}
	} catch (e) {
		console.error("User fetch/create failed", e);
		return null;
	}

	if (IS_DEV) {
		try {
			const res = await client.rooms.$get();
			if (res.ok) {
				rooms = await res.json();
			}
		} catch (e) {
			console.error("Rooms fetch failed", e);
		}
	}

	return { user, rooms };
}

export async function clientAction({ request }: ClientActionFunctionArgs) {
	const formData = await request.formData();
	const intent = formData.get("intent");

	try {
		switch (intent) {
			case "create-room": {
				const nameInput = formData.get("roomName") as string;
				const roomName =
					nameInput || `room-${Math.floor(Math.random() * 100000)}`;

				const res = await client.rooms.create.$post({
					json: { name: roomName, gameTitle: "magic-square" },
				});

				if (!res.ok) return { error: "Failed to create room" };
				const newRoom = await res.json();
				return redirect(`/magic-square/room/${newRoom.id}`);
			}

			case "join-room-secret": {
				const secret = formData.get("secret") as string;
				if (!secret) return { error: "Secret is required" };

				const res = await client.rooms.join.$post({
					json: { secret },
				});

				if (!res.ok) return { error: "Failed to join room (Invalid secret?)" };
				const data = await res.json();
				return redirect(`/magic-square/room/${data.id}`);
			}

			case "dev-join-room-id": {
				const roomId = formData.get("roomId") as string;
				const res = await client.rooms[":roomId"].join.$post({
					param: { roomId },
				});
				if (res.ok) return redirect(`/magic-square/room/${roomId}`);
				return { error: "Failed to join room" };
			}

			case "change-name": {
				const newName = formData.get("newName") as string;
				if (!newName) return { error: "Name is required" };

				const res = await client.users.me.$patch({
					json: { newName },
				});
				if (!res.ok) return { error: "Failed to update name" };

				return { success: true };
			}

			default:
				return { error: "Unknown action" };
		}
	} catch (e) {
		console.error(e);
		return { error: "Unexpected error occurred" };
	}
}

export default function Lobby() {
	const loaderData = useLoaderData<typeof clientLoader>();
	const actionData = useActionData<typeof clientAction>();
	const submit = useSubmit();
	const navigation = useNavigation();

	const [step, setStep] = useState(0);
	const [isEditingName, setIsEditingName] = useState(false);
	const [pendingName, setPendingName] = useState<string | null>(null);

	useEffect(() => {
		const userName = loaderData?.user?.name;
		if (userName && pendingName && userName === pendingName) {
			setPendingName(null);
		}
	}, [loaderData?.user, pendingName]);

	if (!loaderData) return <div>Failed to load user data.</div>;
	const { user, rooms } = loaderData;

	const handleNameChange = (formData: FormData) => {
		const newName = formData.get("newName") as string;
		setPendingName(newName);
		submit(formData, { method: "post" });
		setIsEditingName(false);
	};

	const displayName = pendingName ?? user.name;

	const isCreatingRoom =
		(navigation.state === "submitting" || navigation.state === "loading") &&
		navigation.formData?.get("intent") === "create-room";
	const isJoiningRoom =
		(navigation.state === "submitting" || navigation.state === "loading") &&
		navigation.formData?.get("intent") === "join-room-secret";
	const isJoiningRoomById =
		(navigation.state === "submitting" || navigation.state === "loading") &&
		navigation.formData?.get("intent") === "dev-join-room-id";

	const instructions = [
		"盤上に数字を置いていき、自分のミッションを誰よりも早く達成することを狙うゲームです。",
		"自分の番になったら、手札から数字を選び、次に「+」(加算)、「-」(減算)のいずれかを選びます。(パスも可)",
		"盤上のマス目を選択すると、選んだカードの数字が加算/減算され、ターンが終了します。",
		"制限時間を過ぎると強制的にパスになるので注意！",
	];

	return (
		<div className="p-8">
			<h1 className="text-3xl font-bold mb-4">Lobby</h1>

			<div className="mb-8">
				{isEditingName ? (
					<Form
						method="post"
						className="flex items-center gap-2"
						onSubmit={(e) => {
							e.preventDefault();
							const formData = new FormData(e.currentTarget);
							handleNameChange(formData);
						}}
					>
						<input type="hidden" name="intent" value="change-name" />
						<input
							type="text"
							name="newName"
							placeholder="New name"
							defaultValue={displayName}
							className="input input-bordered w-full max-w-xs"
							required
						/>
						<button className="btn btn-primary" type="submit">
							Save
						</button>
						<button
							type="button"
							className="btn btn-ghost"
							onClick={() => setIsEditingName(false)}
						>
							Cancel
						</button>
					</Form>
				) : (
					<div className="flex gap-4 items-center">
						<p className="mb-2">Welcome, {displayName}!</p>
						<button
							className="btn btn-sm btn-outline"
							onClick={() => setIsEditingName(true)}
							type="button"
						>
							Change Name
						</button>
					</div>
				)}
			</div>

			<div className="grid grid-cols-1 md:grid-cols-2 gap-8">
				<div className="space-y-8">
					<div>
						<h2 className="text-2xl font-bold mb-4">Create a Room</h2>
						<div className="card bg-base-100 shadow-xl">
							<Form method="post" className="card-body">
								<input type="hidden" name="intent" value="create-room" />
								<input
									type="text"
									name="roomName"
									placeholder="Room name (optional)"
									className="input input-bordered w-full"
								/>
								<div className="card-actions justify-end mt-4">
									<button
										className="btn btn-primary"
										type="submit"
										disabled={isCreatingRoom}
									>
										{isCreatingRoom ? "Creating..." : "Create Room"}
									</button>
								</div>
							</Form>
						</div>
					</div>

					<div>
						<h2 className="text-2xl font-bold mb-4">Join a Room</h2>
						<div className="card bg-base-100 shadow-xl">
							<Form method="post" className="card-body">
								<input type="hidden" name="intent" value="join-room-secret" />
								{actionData?.error && (
									<div className="alert alert-error shadow-lg mb-4">
										<span>{actionData.error}</span>
									</div>
								)}
								<input
									type="text"
									name="secret"
									placeholder="Enter secret code"
									className="input input-bordered w-full"
									required
								/>
								<div className="card-actions justify-end mt-4">
									<button
										className="btn btn-secondary"
										type="submit"
										disabled={isJoiningRoom}
									>
										{isJoiningRoom ? "Joining..." : "Join Room"}
									</button>
								</div>
							</Form>
						</div>
					</div>
				</div>

				<button
					type="button"
					className="btn btn-primary"
					onClick={() => {
						setStep(0);
						(
							document.getElementById("my_modal_4") as HTMLDialogElement
						).showModal();
					}}
				>
					How to play
				</button>

				<dialog id="my_modal_4" className="modal">
					<div className="modal-box flex h-5/6 w-4/5 max-w-5xl flex-col">
						<form method="dialog">
							<button
								type="submit"
								className="btn btn-sm btn-circle btn-ghost absolute right-2 top-2"
							>
								✕
							</button>
						</form>
						<h3 className="font-bold text-lg">
							How to play ({step + 1} / {instructions.length})
						</h3>
						<img
							src="/how-to-play.jpeg"
							className="w-7/8 object-contain m-auto h-2/3"
							alt={`How to play - step ${step + 1}`}
						/>
						<div className="flex-1 overflow-y-auto py-4">
							<p>{instructions[step]}</p>
						</div>
						<div className="modal-action justify-between mt-4">
							<button
								type="submit"
								className="btn"
								onClick={() => setStep(step - 1)}
								disabled={step === 0}
							>
								{"< Back"}
							</button>
							{step < instructions.length - 1 ? (
								<button
									type="submit"
									className="btn btn-primary"
									onClick={() => setStep(step + 1)}
								>
									{"Next >"}
								</button>
							) : (
								<form method="dialog">
									<button type="submit" className="btn btn-secondary">
										✕ Close
									</button>
								</form>
							)}
						</div>
					</div>
				</dialog>

				{IS_DEV && (
					<div>
						<h2 className="text-2xl font-bold mb-4">Available Rooms (Debug)</h2>
						<div className="space-y-4">
							{rooms.map((room) => {
								const isJoiningThisRoom =
									isJoiningRoomById &&
									navigation.formData?.get("roomId") === room.id;

								return (
									<div key={room.id} className="card bg-base-100 shadow-md">
										<div className="card-body">
											<h3 className="text-xl">{room.name}</h3>
											<p>{room.users.length} players</p>
											<div className="card-actions justify-end">
												<Form method="post">
													<input
														type="hidden"
														name="intent"
														value="dev-join-room-id"
													/>
													<input type="hidden" name="roomId" value={room.id} />
													<button
														className="btn btn-secondary"
														type="submit"
														disabled={isJoiningThisRoom}
													>
														{isJoiningThisRoom
															? "Joining..."
															: "Join without Secret"}
													</button>
												</Form>
											</div>
										</div>
									</div>
								);
							})}
						</div>
					</div>
				)}
			</div>
		</div>
	);
}

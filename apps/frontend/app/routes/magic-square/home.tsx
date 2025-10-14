import type { User } from "@apps/backend";
import { useEffect, useState } from "react";
import { useLoaderData, useNavigate } from "react-router";
import { client } from "~/lib/client";
import { IS_DEV } from "~/lib/env";

type Room = {
	id: string;
	name: string;
	users: string[];
};

export async function clientLoader() {
	try {
		const res = await client.users.me.$get({});

		if (!res.ok) throw new Error("Failed to fetch user.", { cause: res });
		const user = await res.json();
		const createdAt = user.createdAt ? new Date(user.createdAt) : null;

		return { ...user, createdAt };
	} catch (e) {
		console.error(e);
		return null;
	}
}

export default function Lobby() {
	const me = useLoaderData<typeof clientLoader>();
	const [user, setUser] = useState<User | null>(me ?? null);
	const [rooms, setRooms] = useState<Room[]>([]);
	const [userName, setUserName] = useState(user?.name ?? "");
	const [newUserName, setNewUserName] = useState("");
	const [newRoomName, setNewRoomName] = useState("");
	const [roomSecret, setRoomSecret] = useState("");
	const [joinError, setJoinError] = useState<string | null>(null);
	const navigate = useNavigate();
	const [step, setStep] = useState(0);
	const [isEditingName, setIsEditingName] = useState(false);

	const instructions = [
		"盤上に数字を置いていき、自分のミッションを誰よりも早く達成することを狙うゲームです。",
		"自分の番になったら、手札から数字を選び、次に「+」(加算)、「-」(減算)のいずれかを選びます。(パスも可)",
		"盤上のマス目を選択すると、選んだカードの数字が加算/減算され、ターンが終了します。",
		"制限時間を過ぎると強制的にパスになるので注意！",
	];

	useEffect(() => {
		if (!IS_DEV) return;
		const fetchRooms = async () => {
			const res = await client.rooms.$get();
			if (res.ok) {
				const data = await res.json();
				setRooms(data);
			}
		};
		fetchRooms();
	}, []);

	useEffect(() => {
		if (user) return;
		const newUserName = `player-${Math.floor(Math.random() * 100000)}`;
		const handleCreateUser = async () => {
			const res = await client.users.create.$post({
				json: { name: newUserName },
			});
			const data = await res.json();
			const createdAt = data.createdAt ? new Date(data.createdAt) : null;
			setUser({ ...data, createdAt });
			setUserName(data.name);
		};
		handleCreateUser();
	}, [user]);

	const handleCreateRoom = async () => {
		const roomName =
			newRoomName || `room-${Math.floor(Math.random() * 100000)}`;
		const res = await client.rooms.create.$post({
			json: { name: roomName },
		});
		if (res.ok) {
			const newRoom = await res.json();
			navigate(`/magic-square/room/${newRoom.id}`);
		}
	};

	const handleChangeName = async () => {
		if (!newUserName) return;
		setUserName(newUserName);
		try {
			const res = await client.users.me.$patch({
				json: { newName: newUserName },
			});
			if (res.ok) {
				const data = await res.json();
				const createdAt = data.createdAt ? new Date(data.createdAt) : null;
				setUser({ ...data, createdAt });
			}
		} catch (e) {
			console.error(e);
		}
	};

	const handleJoinRoom = async (roomId: string) => {
		try {
			const res = await client.rooms[":roomId"].join.$post({
				param: { roomId },
			});
			if (res.ok) {
				navigate(`/magic-square/room/${roomId}`);
			}
		} catch (e) {
			console.error(e);
		}
	};

	const handleJoinWithSecret = async () => {
		if (!roomSecret) return;
		setJoinError(null);
		try {
			const res = await client.rooms.join.$post({
				json: { secret: roomSecret },
			});
			if (res.ok) {
				const data = await res.json();
				navigate(`/magic-square/room/${data.id}`);
			} else {
				setJoinError("Failed to join room");
			}
		} catch (e) {
			console.error(e);
		}
	};

	if (!user) return null;

	return (
		<div className="p-8">
			<h1 className="text-3xl font-bold mb-4">Lobby</h1>
			{isEditingName ? (
				<form
					className="flex items-center gap-2 mb-8"
					onSubmit={(e) => {
						e.preventDefault();
						handleChangeName();
						setIsEditingName(false);
					}}
				>
					<input
						type="text"
						placeholder="New name"
						className="input input-bordered w-full max-w-xs"
						value={newUserName}
						onChange={(e) => setNewUserName(e.target.value)}
						required
					/>
					<button className="btn btn-primary" type="submit">
						Save
					</button>
				</form>
			) : (
				<div className="mb-8 flex gap-4 items-center">
					<p className="mb-2">Welcome, {userName}!</p>
					<button
						className="btn btn-sm btn-outline"
						onClick={() => setIsEditingName(true)}
						type="button"
					>
						Change Name
					</button>
				</div>
			)}

			<div className="grid grid-cols-1 md:grid-cols-2 gap-8">
				<div className="space-y-8">
					<div>
						<h2 className="text-2xl font-bold mb-4">Create a Room</h2>
						<div className="card bg-base-100 shadow-xl">
							<form
								className="card-body"
								onSubmit={(e) => {
									e.preventDefault();
									handleCreateRoom();
								}}
							>
								<input
									type="text"
									placeholder="Room name (optional)"
									className="input input-bordered w-full"
									value={newRoomName}
									onChange={(e) => setNewRoomName(e.target.value)}
								/>
								<div className="card-actions justify-end mt-4">
									<button className="btn btn-primary" type="submit">
										Create Room
									</button>
								</div>
							</form>
						</div>
					</div>
					<div>
						<h2 className="text-2xl font-bold mb-4">Join with Secret</h2>
						<div className="card bg-base-100 shadow-xl">
							<form
								className="card-body"
								onSubmit={(e) => {
									e.preventDefault();
									handleJoinWithSecret();
								}}
							>
								{joinError && (
									<div className="alert alert-error shadow-lg mb-4">
										<div>
											<span>{joinError}</span>
										</div>
									</div>
								)}
								<input
									type="text"
									placeholder="Enter secret code"
									className="input input-bordered w-full"
									value={roomSecret}
									onChange={(e) => setRoomSecret(e.target.value)}
									required
								/>
								<div className="card-actions justify-end mt-4">
									<button className="btn btn-secondary" type="submit">
										Join Room
									</button>
								</div>
							</form>
						</div>
					</div>
				</div>
				<button
					type="submit"
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
							{rooms.map((room) => (
								<div key={room.id} className="card bg-base-100 shadow-md">
									<div className="card-body">
										<h3 className="text-xl">{room.name}</h3>
										<p>{room.users.length} players</p>
										<div className="card-actions justify-end">
											<button
												className="btn btn-secondary"
												type="button"
												onClick={() => handleJoinRoom(room.id)}
											>
												Join without Secret
											</button>
										</div>
									</div>
								</div>
							))}
						</div>
					</div>
				)}
			</div>
		</div>
	);
}

import type { User } from "@apps/backend";
import { useEffect, useState } from "react";
import { useNavigate, useOutletContext } from "react-router";
import { client } from "../../lib/client";

type Room = {
	id: string;
	name: string;
	users: string[];
};

export default function Lobby() {
	const me = useOutletContext<User | null>();
	const [user, setUser] = useState<User | null>(me ?? null);
	const [userName, setUserName] = useState("");
	const [rooms, setRooms] = useState<Room[]>([]);
	const [newRoomName, setNewRoomName] = useState("");
	const [roomSecret, setRoomSecret] = useState("");
	const [joinError, setJoinError] = useState<string | null>(null);
	const navigate = useNavigate();
	const [step, setStep] = useState(0);

	const instructions = [
		"盤上に数字を置いていき、自分のミッションを誰よりも早く達成することを狙うゲームです。",
		"自分の番になったら、手札から数字を選び、次に「+」(加算)、「-」(減算)のいずれかを選びます。(パスも可)",
		"盤上のマス目を選択すると、選んだカードの数字が加算/減算され、ターンが終了します。",
		"制限時間を過ぎると強制的にパスになるので注意！",
	];

	useEffect(() => {
		const fetchRooms = async () => {
			const res = await client.rooms.$get();
			if (res.ok) {
				const data = await res.json();
				setRooms(data);
			}
		};
		fetchRooms();
	}, []);

	const handleCreateUser = async () => {
		if (!userName) return;
		const res = await client.users.create.$post({
			json: { name: userName },
		});
		const data = await res.json();
		const createdAt = data.createdAt ? new Date(data.createdAt) : null;
		setUser({ ...data, createdAt });
	};

	const handleCreateRoom = async () => {
		if (!newRoomName) return;
		const res = await client.rooms.create.$post({
			json: { name: newRoomName },
		});
		if (res.ok) {
			const newRoom = await res.json();
			setRooms([...rooms, newRoom]);
			setNewRoomName("");
		}
	};

	const handleJoinRoom = async (roomId: string) => {
		const res = await client.rooms[":roomId"].join.$post({
			param: { roomId },
		});
		if (res.ok) {
			navigate(`/logic-puzzle/room/${roomId}`);
		}
	};

	const handleJoinWithSecret = async () => {
		if (!roomSecret) return;
		setJoinError(null);
		const res = await client.rooms.join.$post({
			json: { secret: roomSecret },
		});
		const data = await res.json();
		if (res.ok && "id" in data) {
			navigate(`/logic-puzzle/room/${data.id}`);
		} else {
			setJoinError("Failed to join room");
		}
	};

	if (!user || !("name" in user)) {
		return (
			<div className="p-8 flex flex-col items-center">
				<h1 className="text-2xl font-bold mb-4">Create User</h1>
				<div className="card w-96 bg-base-100 shadow-xl">
					<div className="card-body">
						<input
							type="text"
							placeholder="Enter your name"
							className="input input-bordered w-full max-w-xs"
							value={userName}
							onChange={(e) => setUserName(e.target.value)}
						/>
						<div className="card-actions justify-end mt-4">
							<button
								className="btn btn-primary"
								type="button"
								onClick={handleCreateUser}
							>
								Create
							</button>
						</div>
					</div>
				</div>
			</div>
		);
	}

	return (
		<div className="p-8">
			<h1 className="text-3xl font-bold mb-4">Lobby</h1>
			<p className="mb-8">Welcome, {user.name}!</p>

			<div className="grid grid-cols-1 md:grid-cols-2 gap-8">
				<div className="space-y-8">
					<div>
						<h2 className="text-2xl font-bold mb-4">Create a Room</h2>
						<div className="card bg-base-100 shadow-xl">
							<div className="card-body">
								<input
									type="text"
									placeholder="Room name"
									className="input input-bordered w-full"
									value={newRoomName}
									onChange={(e) => setNewRoomName(e.target.value)}
								/>
								<div className="card-actions justify-end mt-4">
									<button
										className="btn btn-primary"
										type="button"
										onClick={handleCreateRoom}
									>
										Create Room
									</button>
								</div>
							</div>
						</div>
					</div>
					<div>
						<h2 className="text-2xl font-bold mb-4">Join with Secret</h2>
						<div className="card bg-base-100 shadow-xl">
							<div className="card-body">
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
								/>
								<div className="card-actions justify-end mt-4">
									<button
										className="btn btn-secondary"
										type="button"
										onClick={handleJoinWithSecret}
									>
										Join Room
									</button>
								</div>
							</div>
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
				<div>
					<h2 className="text-2xl font-bold mb-4">Available Rooms</h2>
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
			</div>
		</div>
	);
}

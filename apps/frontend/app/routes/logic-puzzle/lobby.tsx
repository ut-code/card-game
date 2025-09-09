import type { User } from "@apps/backend";
import { useEffect, useState } from "react";
import { useNavigate } from "react-router";
import { client } from "../../lib/client";

type Room = {
	id: string;
	name: string;
	users: string[];
};

export default function Lobby() {
	const [user, setUser] = useState<User | { error: string } | null>(null);
	const [userName, setUserName] = useState("");
	const [rooms, setRooms] = useState<Room[]>([]);
	const [newRoomName, setNewRoomName] = useState("");
	const [roomSecret, setRoomSecret] = useState("");
	const [joinError, setJoinError] = useState<string | null>(null);
	const navigate = useNavigate();

	useEffect(() => {
		const fetchUser = async () => {
			const res = await client.api.users.me.$get();
			const data = await res.json();
			if (res.ok) {
				setUser(data);
			}
		};
		fetchUser();
	}, []);

	useEffect(() => {
		const fetchRooms = async () => {
			const res = await client.api.rooms.$get();
			if (res.ok) {
				const data = await res.json();
				setRooms(data);
			}
		};
		fetchRooms();
	}, []);

	const handleCreateUser = async () => {
		if (!userName) return;
		const res = await client.api.users.create.$post({
			json: { name: userName },
		});
		const data = await res.json();
		setUser(data);
	};

	const handleCreateRoom = async () => {
		if (!newRoomName) return;
		const res = await client.api.rooms.create.$post({
			json: { name: newRoomName },
		});
		if (res.ok) {
			const newRoom = await res.json();
			setRooms([...rooms, newRoom]);
			setNewRoomName("");
		}
	};

	const handleJoinRoom = async (roomId: string) => {
		const res = await client.api.rooms[":roomId"].join.$post({
			param: { roomId },
		});
		if (res.ok) {
			navigate(`/logic-puzzle/room/${roomId}`);
		}
	};

	const handleJoinWithSecret = async () => {
		if (!roomSecret) return;
		setJoinError(null);
		const res = await client.api.rooms.join.$post({
			json: { secret: roomSecret },
		});
		const data = await res.json();
		if (res.ok && "id" in data) {
			navigate(`/logic-puzzle/room/${data.id}`);
		} else if ("error" in data) {
			setJoinError(data.error);
		} else {
			setJoinError("Failed to join room");
		}
	};

	if (!user || !("name" in user)) {
		return (
			<div className="p-8 flex flex-col items-center">
				<h1 className="text-2xl font-bold mb-4">Create User</h1>
				{user && "error" in user && (
					<div className="alert alert-error shadow-lg mb-4">
						<div>
							<span>{user.error}</span>
						</div>
					</div>
				)}
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
											Join
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

import type { InferResponseType } from "hono/client";
import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router";
import { client } from "../../lib/client";

type Room = InferResponseType<(typeof client.api.rooms)[":roomId"]["$get"]>;

export default function RoomPage() {
	const { roomId } = useParams();
	const navigate = useNavigate();
	const [room, setRoom] = useState<Room | null>(null);

	useEffect(() => {
		const fetchRoom = async () => {
			if (!roomId) return;
			const res = await client.api.rooms[":roomId"].$get({ param: { roomId } });
			if (res.ok) {
				const data = await res.json();
				setRoom(data);
			}
		};
		fetchRoom();
	}, [roomId]);

	const handleLeaveRoom = async () => {
		if (!roomId) return;
		const res = await client.api.rooms[":roomId"].leave.$post({
			param: { roomId },
		});
		if (res.ok) {
			navigate("/logic-puzzle/lobby");
		}
	};

	if (!room || !("name" in room)) {
		return (
			<div className="p-8">
				<h1 className="text-3xl font-bold">Room not found</h1>
			</div>
		);
	}

	return (
		<div className="p-8">
			<div className="card bg-base-100 shadow-xl">
				<div className="card-body">
					<h1 className="card-title text-4xl">{room.name}</h1>
					<p>Room ID: {roomId}</p>
					<div className="divider" />
					<h2 className="text-2xl font-bold">Players</h2>
					<ul className="list-disc list-inside">
						{room.players.map((player) => (
							<li key={player}>{player}</li>
						))}
					</ul>
					<div className="card-actions justify-end mt-4">
						<button
							className="btn btn-error"
							type="button"
							onClick={handleLeaveRoom}
						>
							Leave Room
						</button>
					</div>
				</div>
			</div>
		</div>
	);
}

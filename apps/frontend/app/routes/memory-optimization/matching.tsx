import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router";
import { client } from "../../lib/client";

export default function matching() {
	const [userId, setUserId] = useState<string>("");
	const [userName, setUserName] = useState<string>("");
	const [waitingUser, setWaitingUser] = useState<string[]>([]);
	const ws = useRef<WebSocket | null>(null);

	const navigate = useNavigate();

	console.log("waitingUser:", waitingUser);

	useEffect(() => {
		const fetchUser = async () => {
			const res = await client.users.me.$get();
			if (res.ok) {
				const user = await res.json();
				setUserId(user.id);
				setUserName(user.name);
			} else {
				navigate("/logic-puzzle/lobby");
			}
		};
		fetchUser();
	}, [navigate]);

	useEffect(() => {
		if (!userId || !userName) return;

		const proto = window.location.protocol === "https:" ? "wss:" : "ws:";
		// TODO: This should be configurable via environment variables
		const host = window.location.hostname;
		const port = window.location.port;
		const fullHost =
			host === "localhost" && port === "5173"
				? "localhost:8787"
				: port
					? `${host}:${port}`
					: host;
		const prefix = host === "localhost" && port === "5173" ? "" : "/api";
		const wsUrl = `${proto}//${fullHost}${prefix}/matching/ws?playerId=${userId}&playerName=${userName}`;

		const socket = new WebSocket(wsUrl);
		ws.current = socket;

		const handleJoinWithSecret = async (secret: string) => {
			const res = await client.rooms.join.$post({
				json: { secret },
			});
			const data = await res.json();
			if (res.ok && "id" in data) {
				navigate(`/logic-puzzle/room/${data.id}`);
			}
		};

		socket.onopen = () => {
			console.log("[WS] Connected to server.");
		};
		socket.onclose = () => {
			console.log("[WS] Disconnected from server.");
		};
		socket.onerror = (err) => console.error("[WS] WebSocket error:", err);

		socket.onmessage = (event) => {
			console.log("[WS] Message from server:", event.data);
			const message = JSON.parse(event.data);
			if (message.type === "userChange") {
				setWaitingUser(message.payload);
				console.log(message.payload);
			}
			if (message.type === "goRoom") {
				handleJoinWithSecret(message.payload.secret);
			}
			if (message.error) {
				console.error("[WS] Server error:", message.error);
			}
		};

		return () => socket.close();
	}, [userId, userName, navigate]);

	useEffect(() => {
		if (waitingUser.length === 2 && waitingUser[0] === userId) {
			console.log("I will build room");
		}

		if (waitingUser.length === 2 && waitingUser[1] === userId) {
			console.log("I will join room");
		}
	}, [waitingUser, userId]);

	return (
		<div className="p-8 text-center">
			<h1 className="text-3xl font-bold">Waiting for opponent...</h1>
			<div className="mt-8">
				<span className="loading loading-lg loading-spinner"></span>
			</div>
		</div>
	);
}

/** biome-ignore-all lint/suspicious/noArrayIndexKey: TODO */
import type { GameState } from "@apps/backend";
import { useEffect, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router";
import { client } from "../../lib/client";

// A simple component to render the game board
function GameBoard({
	board,
	onCellClick,
}: {
	board: (string | null)[][];
	onCellClick: (x: number, y: number) => void;
}) {
	return (
		<div className="aspect-square bg-base-300 grid grid-cols-3 gap-2 p-2 rounded-lg">
			{board.map((row, y) =>
				row.map((cell, x) => (
					<button
						key={`cell-${x}-${y}`}
						type="button"
						className="aspect-square bg-base-100 rounded flex items-center justify-center text-6xl font-bold cursor-pointer hover:bg-base-200"
						onClick={() => onCellClick(x, y)}
						onKeyDown={(e) => {
							if (e.key === "Enter" || e.key === " ") {
								onCellClick(x, y);
							}
						}}
					>
						{cell}
					</button>
				)),
			)}
		</div>
	);
}

export default function RoomPage() {
	const { roomId } = useParams();
	const navigate = useNavigate();

	const [userId, setUserId] = useState<string | null>(null);
	const [gameState, setGameState] = useState<GameState | null>(null);
	const [isConnected, setIsConnected] = useState(false);
	const [logs, setLogs] = useState<string[]>([]);
	const ws = useRef<WebSocket | null>(null);

	// Fetch user ID on component mount
	useEffect(() => {
		const fetchUser = async () => {
			const res = await client.api.users.me.$get();
			if (res.ok) {
				const user = await res.json();
				setUserId(user.id);
			} else {
				// If not logged in, redirect to create user or lobby
				navigate("/logic-puzzle/lobby");
			}
		};
		fetchUser();
	}, [navigate]);

	// WebSocket connection effect
	useEffect(() => {
		if (!roomId || !userId) return;

		// Determine WebSocket protocol
		const proto = window.location.protocol === "https:" ? "wss:" : "ws:";
		// TODO
		const host = "localhost:8787";
		const wsUrl = `${proto}//${host}/api/games/${roomId}/ws?playerId=${userId}`;

		const socket = new WebSocket(wsUrl);
		ws.current = socket;

		socket.onopen = () => {
			setIsConnected(true);
			setLogs((prev) => [...prev, "[SYSTEM] Connected to server."]);
		};

		socket.onmessage = (event) => {
			const message = JSON.parse(event.data);
			setLogs((prev) => [...prev, `[SERVER] ${event.data}`]);

			if (message.type === "state") {
				setGameState(message.payload);
			}
			if (message.error) {
				setLogs((prev) => [...prev, `[ERROR] ${message.error}`]);
			}
		};

		socket.onclose = () => {
			setIsConnected(false);
			setLogs((prev) => [...prev, "[SYSTEM] Disconnected."]);
		};

		socket.onerror = (err) => {
			console.error("WebSocket error:", err);
			setLogs((prev) => [...prev, "[SYSTEM] WebSocket error."]);
		};

		// Cleanup on component unmount
		return () => {
			socket.close();
		};
	}, [roomId, userId]);

	const sendWsMessage = (type: string, payload?: object) => {
		if (ws.current?.readyState === WebSocket.OPEN) {
			const message = JSON.stringify({ type, payload });
			ws.current.send(message);
			setLogs((prev) => [...prev, `[CLIENT] ${message}`]);
		}
	};

	const handleInitializeGame = () => {
		sendWsMessage("initialize");
	};

	const handleCellClick = (x: number, y: number) => {
		sendWsMessage("makeMove", { x, y });
	};

	if (!gameState) {
		return (
			<div className="p-8 text-center">
				<h1 className="text-3xl font-bold">Loading Game...</h1>
				<p>Connecting to server...</p>
				<button
					className="btn btn-primary mt-4"
					onClick={handleInitializeGame}
					type="button"
				>
					Initialize New Game
				</button>
			</div>
		);
	}

	return (
		<div className="p-8 grid grid-cols-1 md:grid-cols-3 gap-8">
			<div className="md:col-span-2">
				<div className="card bg-base-100 shadow-xl">
					<div className="card-body">
						<h1 className="card-title text-4xl">Game Room: {roomId}</h1>
						<div className="divider" />
						<GameBoard board={gameState.board} onCellClick={handleCellClick} />
					</div>
				</div>
			</div>

			<div className="card bg-base-100 shadow-xl">
				<div className="card-body">
					<h2 className="card-title">Info</h2>
					<p>Connection: {isConnected ? "✅ Connected" : "❌ Disconnected"}</p>
					<p>Your Player ID: {userId}</p>
					<div className="divider" />
					<h2 className="card-title">Game State</h2>
					<p>Winner: {gameState.winner ?? "None"}</p>
					<p>Next Turn: {gameState.players[gameState.turn] ?? "N/A"}</p>
					<div className="divider" />
					<h2 className="card-title">Players</h2>
					<ul className="list-disc list-inside">
						{gameState.players.map((player) => (
							<li key={player}>{player}</li>
						))}
					</ul>
					<div className="divider" />
					<h2 className="card-title">Logs</h2>
					<div className="bg-base-200 rounded-lg p-2 h-48 overflow-y-auto text-sm font-mono">
						{logs.map((log, i) => (
							<div key={i}>{log}</div>
						))}
					</div>
					<div className="card-actions justify-end mt-4">
						<button
							className="btn btn-secondary"
							onClick={handleInitializeGame}
							type="button"
						>
							Reset Game (for development purposes)
						</button>
					</div>
				</div>
			</div>
		</div>
	);
}

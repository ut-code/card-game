/** biome-ignore-all lint/a11y/noStaticElementInteractions: TODO */
/** biome-ignore-all lint/suspicious/noArrayIndexKey: TODO */
/** biome-ignore-all lint/a11y/useKeyWithClickEvents: TODO */
import type { GameState, MoveAction } from "@apps/backend";
import { useEffect, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router";
import type { Operation } from "../../../../backend/src/magic";
import { client } from "../../lib/client";

// --- Game Components ---

function GameBoard({
	board,
	onCellClick,
}: {
	board: (number | null)[][];
	onCellClick: (x: number, y: number) => void;
}) {
	return (
		<div className="aspect-square bg-base-300 grid grid-cols-3 gap-2 p-2 rounded-lg shadow-inner">
			{board.map((row, y) =>
				row.map((cell, x) => (
					<div
						key={`${x}-${y}`}
						className="aspect-square bg-base-100 rounded flex items-center justify-center text-6xl font-bold cursor-pointer hover:bg-primary hover:text-primary-content transition-colors duration-150"
						onClick={() => onCellClick(x, y)}
					>
						{cell}
					</div>
				)),
			)}
		</div>
	);
}

function Hand({
	cards,
	title,
	onCardClick,
	selectedNumIndex,
}: {
	cards: number[];
	title: string;
	onCardClick: (i: number) => void;
	selectedNumIndex: number | null;
}) {
	return (
		<div>
			<h3 className="text-lg font-bold mb-2">{title}</h3>
			<div className="flex gap-2 justify-center p-2 bg-base-200 rounded-lg">
				{cards.map((card, i) => (
					<div
						key={i}
						className={`card w-16 h-24 ${selectedNumIndex === i ? "bg-accent" : "bg-primary"} text-primary-content shadow-lg flex items-center justify-center cursor-pointer hover:bg-accent transition-colors duration-150`}
						onClick={() => onCardClick(i)}
					>
						<span className="text-4xl font-bold">{card}</span>
					</div>
				))}
			</div>
		</div>
	);
}

function Operations({
	onOperationClick,
	selectedOperation,
}: {
	onOperationClick: (name: Operation) => void;
	selectedOperation: Operation;
}) {
	return (
		<div>
			<div className="flex gap-2 justify-center p-2 bg-base-200 rounded-lg">
				<div
					className={`card w-12 h-12 ${selectedOperation === "add" ? "bg-accent" : "bg-primary"} text-primary-content shadow-lg flex items-center justify-center cursor-pointer hover:bg-accent transition-colors duration-150`}
					onClick={() => onOperationClick("add")}
				>
					<span className="text-4xl font-bold">+</span>
				</div>
				<div
					className={`card w-12 h-12 ${selectedOperation === "sub" ? "bg-accent" : "bg-primary"} text-primary-content shadow-lg flex items-center justify-center cursor-pointer hover:bg-accent transition-colors duration-150`}
					onClick={() => onOperationClick("sub")}
				>
					<span className="text-4xl font-bold">-</span>
				</div>
			</div>
		</div>
	);
}

function Mission({ description }: { description: string }) {
	return (
		<div className="card bg-secondary text-secondary-content shadow-md">
			<div className="card-body items-center text-center">
				<h2 className="card-title">Your Mission</h2>
				<p>{description}</p>
			</div>
		</div>
	);
}

// --- Main Page Component ---

export default function RoomPage() {
	const { roomId } = useParams();
	const navigate = useNavigate();

	const [userId, setUserId] = useState<string | null>(null);
	const [gameState, setGameState] = useState<GameState | null>(null);
	const ws = useRef<WebSocket | null>(null);

	const opponentId = gameState?.players.find((p) => p !== userId) ?? null;

	const [selectedNumIndex, setSelectedNumIndex] = useState<number | null>(null);
	const [selectedOperation, setSelectedOperation] = useState<Operation>("add");

	// Fetch user ID on component mount
	useEffect(() => {
		const fetchUser = async () => {
			const res = await client.api.users.me.$get();
			if (res.ok) {
				const user = await res.json();
				setUserId(user.id);
			} else {
				navigate("/logic-puzzle/lobby");
			}
		};
		fetchUser();
	}, [navigate]);

	// WebSocket connection effect
	useEffect(() => {
		if (!roomId || !userId) return;

		const proto = window.location.protocol === "https:" ? "wss:" : "ws:";
		// TODO: This should be configurable via environment variables
		const host = "localhost:8787";
		const wsUrl = `${proto}//${host}/api/games/${roomId}/ws?playerId=${userId}`;

		const socket = new WebSocket(wsUrl);
		ws.current = socket;

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
			if (message.type === "state") {
				setGameState(message.payload);
			}
			if (message.error) {
				console.error("[WS] Server error:", message.error);
			}
		};

		return () => socket.close();
	}, [roomId, userId]);

	const sendWsMessage = (type: string, payload?: MoveAction) => {
		if (ws.current?.readyState === WebSocket.OPEN) {
			const message = JSON.stringify({ type, payload });
			console.log("[WS] Sending message:", message);
			ws.current.send(message);
		}
	};

	const handleCellClick = (x: number, y: number) => {
		if (!gameState || !userId || selectedNumIndex === null) return;
		// TODO: 正しいoperationとnumをいれる
		sendWsMessage("makeMove", {
			x,
			y,
			operation: selectedOperation,
			num: gameState.hands[userId][selectedNumIndex],
		});
		setSelectedNumIndex(null);
		setSelectedOperation("add");
	};

	// --- Render Logic ---

	if (!gameState || !userId) {
		return (
			<div className="p-8 text-center">
				<h1>Loading...</h1>
			</div>
		);
	}

	if (gameState.players.length < 2) {
		return (
			<div className="p-8 text-center">
				<h1 className="text-3xl font-bold">Waiting for opponent...</h1>
				<p className="mt-4">Room ID: {roomId}</p>
				<div className="mt-8">
					<span className="loading loading-lg loading-spinner"></span>
				</div>
			</div>
		);
	}

	return (
		<div className="p-4 md:p-8 flex flex-col gap-4">
			{/* Opponent's Info */}
			{opponentId && (
				<>
					<div className="flex justify-between items-center">
						<p>Opponent: {opponentId}</p>
						<p>Cards: {gameState.hands[opponentId]?.length ?? 0}</p>
					</div>
					<p className="card bg-secondary text-secondary-content shadow-md text-center">
						Opponent Mission: {gameState.missions[opponentId]?.description}
					</p>
				</>
			)}
			{/* Game Board */}
			<div className="w-full max-w-md mx-auto">
				<GameBoard board={gameState.board} onCellClick={handleCellClick} />
			</div>
			{/* Player\'s Info */}
			<div className="flex flex-col items-center gap-4 mt-4">
				{gameState.missions[userId] && (
					<Mission description={gameState.missions[userId].description} />
				)}
				<div className="flex flex-row gap-4">
					{gameState.hands[userId] && (
						<Hand
							cards={gameState.hands[userId]}
							title="Your Hand"
							onCardClick={setSelectedNumIndex}
							selectedNumIndex={selectedNumIndex}
						/>
					)}
					<Operations
						onOperationClick={setSelectedOperation}
						selectedOperation={selectedOperation}
					/>
				</div>
			</div>
		</div>
	);
}

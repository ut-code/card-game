/** biome-ignore-all lint/a11y/noStaticElementInteractions: TODO */
/** biome-ignore-all lint/suspicious/noArrayIndexKey: TODO */
/** biome-ignore-all lint/a11y/useKeyWithClickEvents: TODO */
import type { GameState, MoveAction, User } from "@apps/backend";
import { useEffect, useRef, useState } from "react";
import { useOutletContext, useParams } from "react-router";
import type { Operation } from "../../../../backend/src/magic";

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

function FinalGameBoard({
	board,
	winnerary,
}: {
	board: (number | null)[][];
	winnerary: (true | false)[][];
}) {
	return (
		<div className="aspect-square bg-base-300 grid grid-cols-3 gap-2 p-2 rounded-lg shadow-inner">
			{board.map((row, y) =>
				row.map((cell, x) =>
					winnerary[y][x] === true ? (
						<div
							key={`${x}-${y}`}
							className="aspect-square bg-yellow-500 rounded flex items-center justify-center text-6xl font-bold cursor-pointer transition-colors duration-150"
						>
							{cell}
						</div>
					) : (
						<div
							key={`${x}-${y}`}
							className="aspect-square bg-base-100 rounded flex items-center justify-center text-6xl font-bold cursor-pointer transition-colors duration-150"
						>
							{cell}
						</div>
					),
				),
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

function Mission({ name, description }: { name: string; description: string }) {
	return (
		<span className="card bg-secondary text-secondary-content shadow-md">
			<div className="card-body items-center text-center">
				<h2 className="card-title">{name}'s Mission</h2>
				<p>{description}</p>
			</div>
		</span>
	);
}

// --- Main Page Component ---

function TurnDisplay({
	round,
	currentPlayerId,
	myId,
}: {
	round: number;
	currentPlayerId: string;
	myId: string;
}) {
	const isMyTurn = currentPlayerId === myId;

	return (
		<div className="text-center p-2 rounded-lg bg-base-200 shadow mb-4">
			<p className="text-sm font-bold">Round {round + 1}</p>
			<div
				className={`mt-1 text-lg font-bold p-2 rounded-md transition-all ${isMyTurn ? "bg-primary text-primary-content animate-pulse" : "bg-base-100"}`}
			>
				{isMyTurn ? "Your Turn" : "Opponent's Turn"}
			</div>
		</div>
	);
}

export default function RoomPage() {
	const user = useOutletContext<User>();

	const { roomId } = useParams();

	const [gameState, setGameState] = useState<GameState | null>(null);
	const ws = useRef<WebSocket | null>(null);

	const opponentIds = gameState?.players.filter((p) => p !== user.id) ?? null;
	const currentPlayerId = gameState?.players[gameState.turn];

	const [selectedNumIndex, setSelectedNumIndex] = useState<number | null>(null);
	const [selectedOperation, setSelectedOperation] = useState<Operation>("add");

	const [winnerDisplay, setWinnerDisplay] = useState(0);

	// Fetch user ID on component mount
	// useEffect(() => {
	// 	const fetchUser = async () => {
	// 		const res = await client.api.users.me.$get();
	// 		if (res.ok) {
	// 			const user = await res.json();
	// 			setUserId(user.id);
	// 			setUserName(user.name);
	// 		} else {
	// 			navigate("/logic-puzzle/lobby");
	// 		}
	// 	};
	// 	fetchUser();
	// }, [navigate]);

	// WebSocket connection effect
	useEffect(() => {
		if (!roomId || !user.id || !user.name) return;

		const proto = window.location.protocol === "https:" ? "wss:" : "ws:";
		// TODO: This should be configurable via environment variables
		const host = "localhost:8787";
		const wsUrl = `${proto}//${host}/api/games/${roomId}/ws?playerId=${user.id}&playerName=${user.name}`;

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
				console.log(message.payload);
			}
			if (message.error) {
				console.error("[WS] Server error:", message.error);
			}
		};

		return () => socket.close();
	}, [roomId, user.id, user.name]);

	const sendWsMessage = (type: string, payload?: MoveAction) => {
		if (ws.current?.readyState === WebSocket.OPEN) {
			const message = JSON.stringify({ type, payload });
			console.log("[WS] Sending message:", message);
			ws.current.send(message);
		}
	};

	const handleCellClick = (x: number, y: number) => {
		if (!gameState || !user.id || selectedNumIndex === null) return;
		// TODO: 正しいoperationとnumをいれる
		sendWsMessage("makeMove", {
			x,
			y,
			operation: selectedOperation,
			num: gameState.hands[user.id][selectedNumIndex],
			numIndex: selectedNumIndex,
		});
		setSelectedNumIndex(null);
		setSelectedOperation("add");
	};

	const handleWinnersPlusClick = () => {
		setWinnerDisplay(winnerDisplay + 1);
	};

	const handleWinnersMinusClick = () => {
		setWinnerDisplay(winnerDisplay - 1);
	};

	// --- Render Logic ---

	if (!gameState || !user.id || !currentPlayerId) {
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

	if (gameState.winners !== null) {
		if (winnerDisplay === 0) {
			return (
				<div>
					<div className="flex justify-center gap-4 mb-12 text-red-500">
						<h1 className="text-3xl font-bold">GAME SET</h1>
					</div>
					{gameState.winners && (
						<div className="flex justify-center gap-4 mb-12">
							{gameState.winners.map((winnersId) => (
								<h1 key={winnersId} className="text-3xl font-bold">
									{gameState.names[winnersId]}
								</h1>
							))}
							<h1 className="text-3xl font-bold">WIN!!</h1>
						</div>
					)}
					<div className="w-full max-w-md mx-auto">
						<FinalGameBoard
							board={gameState.board}
							winnerary={Array.from({ length: gameState.boardSize }, () =>
								Array(gameState?.boardSize).fill(false),
							)}
						/>
					</div>
					<div className="card-actions justify-center mt-4">
						<button
							className="btn btn-primary"
							type="button"
							onClick={handleWinnersPlusClick}
						>
							Next
						</button>
					</div>
				</div>
			);
		}
		if (winnerDisplay === gameState.winners.length) {
			return (
				<div>
					<div className="flex justify-center gap-4 mb-4">
						<h1 className="text-3xl font-bold">
							Result {winnerDisplay}/{gameState.winners.length}
						</h1>
					</div>
					<div className="flex justify-center gap-4 mb-4">
						<Mission
							key={gameState.winners[winnerDisplay - 1]}
							name={gameState?.names[gameState.winners[winnerDisplay - 1]]}
							description={
								gameState.missions[gameState.winners[winnerDisplay - 1]].mission
									.description
							}
						/>
					</div>
					<div className="w-full max-w-md mx-auto">
						<FinalGameBoard
							board={gameState.board}
							winnerary={
								gameState.winnersAry[gameState.winners[winnerDisplay - 1]]
							}
						/>
					</div>
					<div className="card-actions mt-4  justify-center">
						<button
							className="btn btn-primary"
							type="button"
							onClick={handleWinnersMinusClick}
						>
							Back
						</button>
						<a href="/logic-puzzle/lobby" className="btn btn-primary">
							to Lobby
						</a>
					</div>
				</div>
			);
		}
		return (
			<div>
				<div className="flex justify-center gap-4 mb-4">
					<h1 className="text-3xl font-bold">
						Result {winnerDisplay}/{gameState.winners.length}
					</h1>
				</div>
				<div className="flex justify-center gap-4 mb-4">
					<Mission
						key={gameState.winners[winnerDisplay - 1]}
						name={gameState.names[gameState.winners[winnerDisplay - 1]]}
						description={
							gameState.missions[gameState.winners[winnerDisplay - 1]].mission
								.description
						}
					/>
				</div>
				<div className="w-full max-w-md mx-auto">
					<FinalGameBoard
						board={gameState.board}
						winnerary={
							gameState.winnersAry[gameState.winners[winnerDisplay - 1]]
						}
					/>
				</div>
				<div className="card-actions justify-center mt-4">
					<button
						className="btn btn-primary"
						type="button"
						onClick={handleWinnersMinusClick}
					>
						Back
					</button>
					<button
						className="btn btn-primary"
						type="button"
						onClick={handleWinnersPlusClick}
					>
						Next
					</button>
				</div>
			</div>
		);
	}

	return (
		<div className="p-4 md:p-8 flex flex-col gap-4">
			{/* Opponent's Info */}
			{opponentIds && (
				<div className="flex justify-center gap-4 mb-4">
					{opponentIds.map((opponentId) => (
						<Mission
							key={opponentId}
							name={gameState?.names[opponentId]}
							description={gameState?.missions[opponentId]?.mission.description}
						/>
					))}
				</div>
			)}
			{/* Game Board */}
			<div className="w-full max-w-md mx-auto">
				<TurnDisplay
					round={gameState.round}
					currentPlayerId={currentPlayerId}
					myId={user.id}
				/>
				<GameBoard board={gameState.board} onCellClick={handleCellClick} />
			</div>
			{/* Player\'s Info */}
			<div className="flex flex-col items-center gap-4 mt-4">
				{gameState.missions[user.id] && (
					<Mission
						name={gameState?.names[user.id]}
						description={gameState?.missions[user.id]?.mission.description}
					/>
				)}
				<div className="flex flex-row gap-4">
					{gameState.hands[user.id] && (
						<Hand
							cards={gameState.hands[user.id]}
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
			{/* "you are the only player left" popup */}
			{gameState.status === "one player" && (
				<div>You are the only player left.</div>
			)}
		</div>
	);
}

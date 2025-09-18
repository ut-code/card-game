/** biome-ignore-all lint/a11y/noStaticElementInteractions: TODO */
/** biome-ignore-all lint/suspicious/noArrayIndexKey: TODO */
/** biome-ignore-all lint/a11y/useKeyWithClickEvents: TODO */
import type {
	GameState,
	MessageType,
	Operation,
	Rule,
	User,
} from "@apps/backend";
import { useEffect, useRef, useState } from "react";
import { useNavigate, useOutletContext, useParams } from "react-router";
import { client } from "../../lib/client";
import type { Route } from "./+types/room.$roomId";

export async function clientLoader({ params }: Route.ClientLoaderArgs) {
	const { roomId } = params;
	if (!roomId) {
		throw new Response("Room ID not found", { status: 404 });
	}
	const roomSecret = await client.api.rooms[":roomId"].secret.$get({
		param: { roomId },
	});

	if (!roomSecret.ok) {
		throw new Response("Failed to fetch room secret", {
			status: roomSecret.status,
		});
	}

	const roomSecretData = await roomSecret.json();

	const room = await client.api.rooms[":roomId"].$get({ param: { roomId } });
	if (!room.ok) {
		throw new Response("Failed to fetch room", { status: room.status });
	}

	const roomData = await room.json();

	return { secret: roomSecretData.secret, hostId: roomData.hostId };
}

// --- Game Components ---

function GameBoard({
	board,
	onCellClick,
}: {
	board: (number | null)[][];
	onCellClick: (x: number, y: number) => void;
}) {
	return (
		<div
			className="aspect-square bg-base-300 grid gap-2 p-2 rounded-lg shadow-inner"
			style={{ gridTemplateColumns: `repeat(${board.length}, 1fr)` }}
		>
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
		<div
			className="aspect-square bg-base-300 grid gap-2 p-2 rounded-lg shadow-inner"
			style={{ gridTemplateColumns: `repeat(${board.length}, 1fr)` }}
		>
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

export default function RoomPage({ loaderData }: Route.ComponentProps) {
	const { secret: roomSecret, hostId: roomHost } = loaderData;
	const user = useOutletContext<User | null>();
	const { roomId } = useParams();
	const navigate = useNavigate();

	const [gameState, setGameState] = useState<GameState | null>(null);
	const myStatus = user?.id
		? (gameState?.playerStatus[user?.id] ?? null)
		: null;
	const ws = useRef<WebSocket | null>(null);

	const opponentIds = user
		? (gameState?.players.filter((p) => p !== user.id) ?? null)
		: null;
	const currentPlayerId = gameState?.players[gameState.turn] ?? null;

	const [selectedNumIndex, setSelectedNumIndex] = useState<number | null>(null);
	const [selectedOperation, setSelectedOperation] = useState<Operation>("add");

	const [winnerDisplay, setWinnerDisplay] = useState(0);

	// WebSocket connection effect
	useEffect(() => {
		if (!roomId || !user?.id || !user?.name) return;

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

		return () => {
			console.log("[WS] Cleaning up and closing WebSocket connection.");
			socket.close();
		};
	}, [roomId, user?.id, user?.name]);

	// Redirect if user is no longer in the room
	useEffect(() => {
		if (gameState && user && !gameState.players.includes(user.id)) {
			console.log("User not in game state players, navigating to lobby.");
			navigate("/logic-puzzle/lobby");
		}
	}, [gameState, user, navigate]);

	function sendWsMessage({ type, payload }: MessageType): void {
		if (ws.current?.readyState === WebSocket.OPEN) {
			const message = JSON.stringify({ type, payload });
			console.log("[WS] Sending message:", message);
			ws.current.send(message);
		}
	}
	const handleCellClick = (x: number, y: number) => {
		if (!gameState || !user || !user.id || selectedNumIndex === null) return;
		// TODO: 正しいoperationとnumをいれる
		sendWsMessage({
			type: "makeMove",
			payload: {
				x,
				y,
				operation: selectedOperation,
				num: gameState.hands[user.id][selectedNumIndex],
				numIndex: selectedNumIndex,
			},
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

	const handleReadyClick = () => {
		sendWsMessage({ type: "setReady" });
	};

	const handleRuleChange = (rule: Rule) => {
		sendWsMessage({
			type: "changeRule",
			payload: rule,
		});
	};

	const handleBackToLobby = () => {
		sendWsMessage({ type: "backToLobby" });
	};

	const handleLeaveRoom = async () => {
		sendWsMessage({ type: "removePlayer" });
		if (roomId) {
			await client.api.rooms[":roomId"].leave.$post({ param: { roomId } });
		}
		navigate("/logic-puzzle/lobby");
	};

	// --- Render Logic ---

	if (!user || !roomId) {
		return (
			<div className="p-8 text-center">
				<h1>Error: Room ID not found.</h1>
				<p>Please ensure you are accessing a valid room.</p>
			</div>
		);
	}

	if (!gameState || !currentPlayerId) {
		return (
			<div className="flex items-center justify-center min-h-screen">
				<div className="loading loading-spinner loading-lg" />
			</div>
		);
	}

	if (myStatus === "preparing" || myStatus === "ready") {
		return (
			<div className="flex h-screen w-full flex-col items-center justify-center gap-8">
				<h1 className="text-2xl font-bold">
					Waiting for players to be ready...
				</h1>
				<div className="flex flex-col items-center gap-1 rounded-lg bg-base-200 p-2 shadow-inner">
					<span className="font-medium">Password</span>
					<div className="rounded bg-base-300 p-1 text-4xl font-semibold">
						{roomSecret}
					</div>
				</div>
				<ul className="rounded-lg bg-base-200 p-4 shadow-inner">
					{gameState.players.map((playerId) => (
						<li
							key={playerId}
							className="flex items-center justify-between gap-4 p-2"
						>
							<span className="font-medium">{gameState.names[playerId]}</span>
							<span
								className={`rounded-full px-3 py-1 text-sm font-semibold ${myStatus === "ready" ? "bg-green-500 text-white" : "bg-gray-300 text-gray-700"}`}
							>
								{gameState.playerStatus[playerId] === "ready"
									? "Ready!"
									: "Preparing..."}
							</span>
						</li>
					))}
				</ul>
				<div className="form-control">
					<label className="label cursor-pointer">
						<span className="label-text">Board Size</span>
						<select
							className="select select-bordered"
							value={gameState.rules.boardSize}
							disabled={user.id !== roomHost}
							onChange={(e) =>
								handleRuleChange({
									rule: "boardSize",
									state: parseInt(e.target.value, 10),
								})
							}
						>
							<option value={1}>1x1</option>
							<option value={2}>2x2</option>
							<option value={3}>3x3</option>
							<option value={4}>4x4</option>
							<option value={5}>5x5</option>
						</select>
					</label>
				</div>
				<div className="form-control">
					<label className="label cursor-pointer">
						<span className="label-text">Disable negative numbers</span>
						<input
							type="checkbox"
							className="toggle toggle-success"
							checked={gameState.rules.negativeDisabled}
							disabled={user.id !== roomHost}
							onChange={(e) =>
								handleRuleChange({
									rule: "negativeDisabled",
									state: e.target.checked,
								})
							}
						/>
					</label>
				</div>
				<div
					onClick={handleReadyClick}
					className={`card w-32 h-20 cursor-pointer items-center justify-center transition-colors duration-150 ${myStatus === "ready" ? "bg-green-500 text-white font-bold" : "bg-base-300 text-grey-700 shadow-lg"}`}
				>
					{myStatus === "ready" ? "READY!!" : "ready?"}
				</div>
				<div onClick={handleLeaveRoom} className="btn btn-error">
					Leave Room
				</div>
			</div>
		);
	}

	if (myStatus === "finished") {
		if (!gameState.winners || gameState.winners.length === 0) {
			throw new Error("Winners data is missing");
		}
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
							winnerary={Array.from({ length: gameState.rules.boardSize }, () =>
								Array(gameState?.rules.boardSize).fill(false),
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
						<button
							className="btn btn-primary"
							onClick={handleBackToLobby}
							type="button"
						>
							to Lobby
						</button>
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

	if (myStatus === "playing") {
		return (
			<div className="p-4 md:p-8 flex flex-col gap-4">
				{/* Opponent's Info */}
				{opponentIds && (
					<div className="flex justify-center gap-4 mb-4">
						{opponentIds.map((opponentId) => (
							<Mission
								key={opponentId}
								name={gameState?.names[opponentId]}
								description={
									gameState?.missions[opponentId]?.mission.description
								}
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
				{/* Player's Info */}
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
				{gameState.status === "paused" && (
					<div className="p-4 text-center bg-base-200 rounded-lg shadow">
						<h2 className="text-xl font-bold">Connection lost</h2>
						<p>
							Someone else has lost connection. Please wait while we try to
							reconnect…
						</p>
					</div>
				)}
			</div>
		);
	}

	if (myStatus === "error") {
		return (
			<div className="p-8 text-center">
				<h1 className="text-3xl font-bold text-red-500">Error</h1>
				<p className="mt-4">
					An error occurred in the game. Please try again later.
				</p>
				<a href="/logic-puzzle/lobby" className="btn btn-primary mt-4">
					Go to Lobby
				</a>
			</div>
		);
	}

	if (myStatus === null && !(currentPlayerId in gameState.players)) {
		console.log("leaved");
		return (
			<div className="flex items-center justify-center min-h-screen">
				<div className="loading loading-spinner loading-lg" />
			</div>
		);
	}

	throw new Error(`Unknown player status: ${myStatus}`);
}

/** biome-ignore-all lint/a11y/noStaticElementInteractions: TODO */
/** biome-ignore-all lint/suspicious/noArrayIndexKey: TODO */
/** biome-ignore-all lint/a11y/useKeyWithClickEvents: TODO */
import type {
	GameState,
	MessageType,
	Operation,
	Rule,
} from "@apps/backend/magic";
import { useEffect, useRef, useState } from "react";
import {
	type ClientLoaderFunctionArgs,
	redirect,
	useLoaderData,
	useNavigate,
	useParams,
} from "react-router";
import ReconnectingWebSocket from "reconnecting-websocket";
import { client } from "~/lib/client";

export async function clientLoader({ params }: ClientLoaderFunctionArgs) {
	const roomId = params.roomId;
	if (!roomId) throw new Error("Room ID is required");

	const [userRes, roomRes, roomSecretRes] = await Promise.all([
		client.users.me.$get(),
		client.rooms[":roomId"].$get({ param: { roomId } }),
		client.rooms[":roomId"].secret.$get({
			param: { roomId },
		}),
	]);

	if (!userRes.ok || !roomRes.ok || !roomSecretRes.ok) {
		return redirect("/magic-square");
	}

	const user = await userRes.json();
	const roomData = await roomRes.json();
	const roomSecretData = await roomSecretRes.json();

	const createdAt = user.createdAt ? new Date(user.createdAt) : null;

	if (!roomData.users.includes(user.id)) {
		return redirect("/magic-square");
	}

	return {
		user: { ...user, createdAt },
		secret: roomSecretData.secret,
		hostId: roomData.hostId,
	};
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
			className="aspect-square bg-base-300 grid gap-2 p-2 rounded-lg shadow-inner max-w-2xs mx-auto"
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
	onCardClick,
	selectedNumIndex,
}: {
	cards: number[];
	onCardClick: (i: number) => void;
	selectedNumIndex: number | null;
}) {
	return (
		<div>
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

function Mission({
	title,
	description,
}: {
	title: string;
	description: string;
}) {
	return (
		<span className="card bg-secondary text-secondary-content shadow-md">
			<div className="card-body items-center text-center p-2">
				<h2 className="card-title text-sm">{title}</h2>
				<p>{description}</p>
			</div>
		</span>
	);
}

// --- Main Page Component ---

function TurnDisplay({
	round,
	currentPlayerId,
	currentPlayerName,
	myId,
	isCpuTurn,
	remainingTime,
}: {
	round: number;
	currentPlayerId: string;
	currentPlayerName: string;
	myId: string;
	isCpuTurn: boolean;
	remainingTime: number;
}) {
	const isMyTurn = currentPlayerId === myId;

	// 共通のスタイルを定数として定義
	const baseTurnDisplayClasses =
		"h-12 flex items-center justify-center text-lg font-bold p-2 rounded-md transition-all duration-300";

	return (
		<div className="grid grid-cols-3 items-center text-center p-2 rounded-lg bg-base-200">
			<div>
				<p className="text-sm font-bold">Round</p>
				<p className="text-2xl font-bold">{round + 1}</p>
			</div>

			<div
				className={`
					${baseTurnDisplayClasses}
					${isMyTurn ? "bg-primary text-primary-content animate-pulse" : ""}
					${isCpuTurn ? "bg-neutral text-neutral-content" : ""}
					${!isMyTurn && !isCpuTurn ? "bg-base-100" : ""}
				`}
			>
				{isMyTurn && "Your Turn"}
				{isCpuTurn && (
					<div className="flex items-center gap-2">
						<div className="loading loading-spinner loading-xs" />
						{currentPlayerName} is thinking...
					</div>
				)}
				{!isMyTurn && !isCpuTurn && `${currentPlayerName}'s Turn`}
			</div>

			<div>
				<p className="text-sm font-bold">Time</p>
				<p className="text-2xl font-bold">
					{remainingTime >= 500 ? "∞" : remainingTime}
				</p>
			</div>
		</div>
	);
}

export default function RoomPage() {
	const {
		user,
		secret: roomSecret,
		hostId: roomHost,
	} = useLoaderData<typeof clientLoader>();

	const { roomId } = useParams();
	const navigate = useNavigate();

	const [gameState, setGameState] = useState<GameState | null>(null);
	const myStatus = user?.id
		? (gameState?.playerStatus[user?.id] ?? null)
		: null;
	const ws = useRef<ReconnectingWebSocket | null>(null);

	const activePlayerIds = user
		? (gameState?.players.filter(
				(p) => p.type === "player" || p.type === "cpu",
			) ?? null)
		: null;
	const opponentIds = user
		? (activePlayerIds?.filter((p) => p.id !== user.id) ?? null)
		: null;
	const currentPlayer =
		gameState?.players[gameState.currentPlayerIndex] ?? null;
	const isCPUTurn = currentPlayer?.type === "cpu";

	const [selectedNumIndex, setSelectedNumIndex] = useState<number | null>(null);
	const [selectedOperation, setSelectedOperation] = useState<Operation>("add");

	const [winnerDisplay, setWinnerDisplay] = useState(0);
	const [remainingTime, setRemainingTime] = useState(0);
	const [spectatedPlayerId, setSpectatedPlayerId] = useState<string | null>(
		null,
	);

	// WebSocket connection effect
	useEffect(() => {
		if (!roomId || !user?.id || !user?.name) return;

		const proto = window.location.protocol === "https:" ? "wss:" : "ws:";

		const host = window.location.hostname;
		const port = window.location.port;
		const fullHost =
			host === "localhost" && port === "5173"
				? "localhost:8787"
				: port
					? `${host}:${port}`
					: host;
		const prefix = host === "localhost" && port === "5173" ? "" : "/api";

		const wsUrl = `${proto}//${fullHost}${prefix}/games/${roomId}/ws?playerId=${user.id}&playerName=${user.name}`;

		const socket = new ReconnectingWebSocket(wsUrl);
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

	useEffect(() => {
		if (gameState?.timeLimitUnix) {
			const interval = setInterval(() => {
				const remaining = gameState.timeLimitUnix - Date.now();
				setRemainingTime(remaining > 0 ? remaining : 0);
			}, 1000);
			// Set initial time
			const remaining = gameState.timeLimitUnix - Date.now();
			setRemainingTime(remaining > 0 ? remaining : 0);
			return () => clearInterval(interval);
		}
	}, [gameState?.timeLimitUnix]);

	function sendWsMessage({ type, payload }: MessageType): void {
		if (ws.current?.readyState === WebSocket.OPEN) {
			const message = JSON.stringify({ type, payload });
			console.log("[WS] Sending message:", message);
			ws.current.send(message);
		}
	}
	const handleCellClick = (x: number, y: number) => {
		if (!gameState || !user || !user.id || selectedNumIndex === null) return;
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
		if (myStatus === "ready") {
			sendWsMessage({ type: "cancelReady" });
		} else if (myStatus === "preparing") {
			sendWsMessage({ type: "setReady" });
		}
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
			await client.rooms[":roomId"].leave.$post({ param: { roomId } });
		}
		navigate("/magic-square");
	};

	const handleSpectatorClick = async () => {
		if (myStatus === "spectatingReady") {
			sendWsMessage({ type: "cancelspectatingReady" });
		} else if (myStatus === "preparing") {
			sendWsMessage({ type: "setspectatingReady" });
		}
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

	if (!gameState) {
		console.log(
			"Loading or waiting for game state...",
			gameState,
			currentPlayer?.id,
		);
		return (
			<div className="flex items-center justify-center min-h-screen">
				<div className="loading loading-spinner loading-lg" />
			</div>
		);
	}

	if (myStatus === "spectating") {
		if (!currentPlayer) {
			throw new Error("Current player is missing");
		}

		const playingPlayers = gameState.players.filter(
			(p) => p.type === "player" || p.type === "cpu",
		);

		const spectatedPlayer = spectatedPlayerId
			? {
					id: spectatedPlayerId,
					name: gameState.names[spectatedPlayerId],
					hand: gameState.hands[spectatedPlayerId],
					mission: gameState.missions[spectatedPlayerId],
				}
			: null;

		return (
			<div className="p-4 md:p-8 flex flex-col gap-4">
				<h1 className="text-2xl font-bold text-center">Spectating Game</h1>

				{/* Player perspective switcher */}
				<div className="flex justify-center gap-2 p-2 bg-base-200 rounded-lg">
					<button
						type="button"
						className={`btn ${!spectatedPlayerId ? "btn-primary" : ""}`}
						onClick={() => setSpectatedPlayerId(null)}
					>
						Overview
					</button>
					{playingPlayers.map((p) => (
						<button
							key={p.id}
							type="button"
							className={`btn ${spectatedPlayerId === p.id ? "btn-primary" : ""}`}
							onClick={() => setSpectatedPlayerId(p.id)}
						>
							{gameState.names[p.id]}
						</button>
					))}
				</div>

				{/* Opponents' Missions */}
				<div className="flex justify-center gap-4 mb-4">
					{spectatedPlayer
						? // Single player perspective
							playingPlayers
								.filter((p) => p.id !== spectatedPlayer.id)
								.map((opponent) =>
									gameState.missions[opponent.id] ? (
										<Mission
											key={opponent.id}
											title={`${gameState.names[opponent.id]}'s mission`}
											description={
												gameState.missions[opponent.id]?.mission.description
											}
										/>
									) : null,
								)
						: null}
				</div>

				{/* Game Board */}
				<div className="w-full max-w-md mx-auto">
					<TurnDisplay
						round={gameState.round}
						currentPlayerId={currentPlayer.id}
						currentPlayerName={gameState.names[currentPlayer.id]}
						myId={user.id} // Will never be "Your Turn"
						isCpuTurn={isCPUTurn}
						remainingTime={Math.ceil(remainingTime / 1000)}
					/>
					<GameBoard board={gameState.board} onCellClick={() => {}} />
				</div>

				{/* Player's Info (Hand and Mission) */}
				<div className="flex flex-col items-center gap-4 mt-4">
					{spectatedPlayer ? (
						<>
							<Mission
								title={`${spectatedPlayer.name}'s mission`}
								description={spectatedPlayer.mission?.mission.description}
							/>
							<Hand
								cards={spectatedPlayer.hand}
								onCardClick={() => {}}
								selectedNumIndex={null}
							/>
						</>
					) : (
						<div>
							{
								// Overview perspective
								playingPlayers.map((p) =>
									gameState.missions[p.id] ? (
										<div className="flex" key={p.id}>
											<div className="ml-0">
												<Mission
													key={p.id}
													title={`${gameState.names[p.id]}'s mission`}
													description={
														gameState.missions[p.id]?.mission.description
													}
												/>
											</div>
											<div className="ml-auto">
												<Hand
													cards={gameState.hands[p.id]}
													onCardClick={() => {}}
													selectedNumIndex={null}
												/>
											</div>
										</div>
									) : null,
								)
							}
							<div className="text-center mt-4 p-4 bg-base-200 rounded-lg">
								<h2 className="text-xl font-bold">You are spectating</h2>
								<p>Select a player above to see their perspective.</p>
							</div>
						</div>
					)}
				</div>
			</div>
		);
	}
	if (
		myStatus === "preparing" ||
		myStatus === "ready" ||
		myStatus === "spectatingReady"
	) {
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
					{gameState.players.map((p) => (
						<li
							key={p.id}
							className="flex items-center justify-between gap-4 p-2"
						>
							<span className="font-medium">
								{gameState.names[p.id]}
								{p.id === roomHost && (
									<span className="badge badge-primary badge-sm ml-2">
										Host
									</span>
								)}
							</span>
							<span
								className={`rounded-full px-3 py-1 text-sm font-semibold ${
									gameState.playerStatus[p.id] === "ready"
										? "bg-green-500 text-white"
										: gameState.playerStatus[p.id] === "spectatingReady"
											? "bg-neutral text-white"
											: gameState.playerStatus[p.id] === "error"
												? "bg-red-500 text-white"
												: "bg-gray-300 text-gray-700"
								}`}
							>
								{gameState.playerStatus[p.id] === "ready"
									? "Ready!"
									: gameState.playerStatus[p.id] === "spectatingReady"
										? "Spectator"
										: gameState.playerStatus[p.id] === "error"
											? "Error"
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
				<div className="form-control">
					<label className="label cursor-pointer">
						<span className="label-text">Time Limit</span>
						<select
							className="select select-bordered"
							value={gameState.rules.timeLimit}
							disabled={user.id !== roomHost}
							onChange={(e) =>
								handleRuleChange({
									rule: "timeLimit",
									state: parseInt(e.target.value),
								})
							}
						>
							<option value={5}>5s</option>
							<option value={10}>10s</option>
							<option value={20}>20s</option>
							<option value={30}>30s</option>
							<option value={60}>1m</option>
							<option value={90}>1m30s</option>
							<option value={300}>5m</option>
							<option value={8999999999999999}>∞</option>
						</select>
					</label>
				</div>
				<div className="form-control">
					<label className="label cursor-pointer">
						<span className="label-text">CPU</span>
						<select
							className="select select-bordered"
							value={gameState.rules.cpu}
							disabled={user.id !== roomHost}
							onChange={(e) =>
								handleRuleChange({
									rule: "cpu",
									state: parseInt(e.target.value),
								})
							}
						>
							<option value={0}>0</option>
							<option value={1}>1</option>
							<option value={2}>2</option>
							<option value={3}>3</option>
						</select>
					</label>
				</div>
				<div
					onClick={handleReadyClick}
					className={`card w-32 h-20 cursor-pointer items-center justify-center transition-colors duration-150 ${myStatus === "ready" ? "bg-green-500 text-white font-bold" : "bg-base-300 text-grey-700 shadow-lg"}`}
				>
					{myStatus === "ready" ? "READY!!" : "ready?"}
				</div>
				<div
					onClick={handleSpectatorClick}
					className={` btn text-white ${myStatus === "spectatingReady" ? "bg-green-500 font-bold" : "bg-neutral text-grey-700 shadow-lg"}`}
				>
					Spectator Mode
				</div>
				<div onClick={handleLeaveRoom} className="btn btn-error">
					Leave Room
				</div>
			</div>
		);
	}

	if (myStatus === "finished") {
		if (
			!gameState.lastGameResult ||
			!gameState.lastGameResult.winners ||
			gameState.lastGameResult.winners.length === 0
		) {
			throw new Error("Winners data is missing");
		}
		if (winnerDisplay === 0) {
			return (
				<div>
					<div className="flex justify-center gap-4 mb-12 text-red-500">
						<h1 className="text-3xl font-bold">GAME SET</h1>
					</div>
					{gameState.lastGameResult.winners && (
						<div className="flex justify-center gap-4 mb-12">
							{gameState.lastGameResult.winners.map((winnersId) => (
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
		if (winnerDisplay === gameState.lastGameResult.winners.length) {
			return (
				<div>
					<div className="flex justify-center gap-4 mb-4">
						<h1 className="text-3xl font-bold">
							Result {winnerDisplay}/{gameState.lastGameResult.winners.length}
						</h1>
					</div>
					<div className="flex justify-center gap-4 mb-4">
						<Mission
							key={gameState.lastGameResult.winners[winnerDisplay - 1]}
							title={`${gameState?.names[gameState.lastGameResult.winners[winnerDisplay - 1]]}'s mission`}
							description={
								gameState.missions[
									gameState.lastGameResult.winners[winnerDisplay - 1]
								].mission.description
							}
						/>
					</div>
					<div className="w-full max-w-md mx-auto">
						<FinalGameBoard
							board={gameState.board}
							winnerary={
								gameState.lastGameResult.winnersAry[
									gameState.lastGameResult.winners[winnerDisplay - 1]
								]
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
						Result {winnerDisplay}/{gameState.lastGameResult.winners.length}
					</h1>
				</div>
				<div className="flex justify-center gap-4 mb-4">
					<Mission
						key={gameState.lastGameResult.winners[winnerDisplay - 1]}
						title={`${gameState.names[gameState.lastGameResult.winners[winnerDisplay - 1]]}'s mission`}
						description={
							gameState.missions[
								gameState.lastGameResult.winners[winnerDisplay - 1]
							].mission.description
						}
					/>
				</div>
				<div className="w-full max-w-md mx-auto">
					<FinalGameBoard
						board={gameState.board}
						winnerary={
							gameState.lastGameResult.winnersAry[
								gameState.lastGameResult.winners[winnerDisplay - 1]
							]
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
		if (!currentPlayer) {
			throw new Error("Current player is missing");
		}
		const isCpuTurn = currentPlayer.type === "cpu";
		return (
			<div className="p-4 md:p-8 flex flex-col gap-4">
				<div className="font-semibold">Password:{roomSecret}</div>
				{/* Opponent's Info */}
				{opponentIds && (
					<div className="flex justify-center gap-4 mb-4">
						{opponentIds.map((opponent) => (
							<Mission
								key={opponent.id}
								title={`${gameState?.names[opponent.id]}'s mission`}
								description={
									gameState?.missions[opponent.id]?.mission.description
								}
							/>
						))}
					</div>
				)}
				{/* Game Board */}
				<div className="w-full max-w-md mx-auto">
					<TurnDisplay
						round={gameState.round}
						currentPlayerId={currentPlayer.id}
						currentPlayerName={gameState.names[currentPlayer.id]}
						myId={user.id}
						isCpuTurn={isCpuTurn}
						remainingTime={Math.ceil(remainingTime / 1000)}
					/>
					<div
						className={`transition-opacity duration-300 ${
							isCpuTurn ? "pointer-events-none opacity-50" : ""
						}`}
					>
						<GameBoard board={gameState.board} onCellClick={handleCellClick} />
					</div>
				</div>
				{/* Player's Info */}
				<div className="flex flex-col items-center gap-4 mt-4">
					{gameState.missions[user.id] && (
						<Mission
							title={"your mission"}
							description={gameState?.missions[user.id]?.mission.description}
						/>
					)}
					<div
						className={`flex flex-row items-end gap-4 transition-opacity duration-300 ${
							isCpuTurn ? "pointer-events-none opacity-50" : ""
						}`}
					>
						{gameState.hands[user.id] && (
							<Hand
								cards={gameState.hands[user.id]}
								onCardClick={setSelectedNumIndex}
								selectedNumIndex={selectedNumIndex}
							/>
						)}
						<div className="flex flex-col items-center gap-2"></div>
						<Operations
							onOperationClick={setSelectedOperation}
							selectedOperation={selectedOperation}
						/>
						<button
							type="button"
							disabled={currentPlayer.id !== user.id}
							className="btn btn-primary hover:btn-accent"
							onClick={() => {
								sendWsMessage({ type: "pass" });
							}}
						>
							PASS
						</button>
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
				<a href="/magic-square" className="btn btn-primary mt-4">
					Go back
				</a>
			</div>
		);
	}

	if (myStatus === null && !(user.id in gameState.players)) {
		console.log("leaved");
		return (
			<div className="flex items-center justify-center min-h-screen">
				<div className="loading loading-spinner loading-lg" />
			</div>
		);
	}

	throw new Error(`Unknown player status: ${myStatus}`);
}

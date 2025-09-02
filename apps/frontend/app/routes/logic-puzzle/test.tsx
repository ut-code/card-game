// import { useEffect, useState } from "react";
// import { client } from "../../lib/client";

// const socket = client.api.ws.$ws();

// const LogicPuzzleTest = () => {
// 	const [message, setMessage] = useState<string>("");
// 	const [isConnected, setIsConnected] = useState<boolean>(
// 		socket.readyState === WebSocket.OPEN,
// 	);

// 	useEffect(() => {
// 		setIsConnected(socket.readyState === WebSocket.OPEN);

// 		socket.onopen = () => {
// 			console.log("Connected to server");
// 			setIsConnected(true);
// 		};
// 		socket.onmessage = (evt) => {
// 			const data = JSON.parse(evt.data);
// 			if (data.type === "pong") {
// 				setMessage("Got a pong! 🏓");
// 				setTimeout(() => setMessage(""), 2000);
// 			}
// 		};
// 		socket.onclose = () => {
// 			console.log("Disconnected from server");
// 			setIsConnected(false);
// 		};
// 		return () => {};
// 	}, []);

// 	const sendPing = () => {
// 		if (socket.readyState === WebSocket.OPEN) {
// 			socket.send('{"type":"ping"}');
// 			setMessage("Sent a ping! 핑...");
// 		} else {
// 			setMessage("Not connected.");
// 		}
// 	};

// 	return (
// 		<div className="p-8 flex flex-col items-center">
// 			<h1 className="text-2xl font-bold mb-4">WebSocket Test</h1>
// 			<div className="card w-96 bg-base-100 shadow-xl">
// 				<div className="card-body items-center text-center">
// 					<p>接続状態: {isConnected ? "✅ 接続中" : "❌ 未接続"}</p>
// 					<div className="card-actions justify-end mt-4">
// 						<button
// 							className="btn btn-primary"
// 							type="button"
// 							onClick={sendPing}
// 							disabled={!isConnected}
// 						>
// 							Ping!
// 						</button>
// 					</div>
// 					{message && (
// 						<p className="mt-4 p-2 bg-info text-info-content rounded">
// 							{message}
// 						</p>
// 					)}
// 				</div>
// 			</div>
// 		</div>
// 	);
// };

// export default LogicPuzzleTest;

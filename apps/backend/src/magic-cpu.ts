import type { Operation } from "./magic";
import type { Mission } from "./mission";

type CpuMove = {
	x: number;
	y: number;
	handIndex: number;
	operation: Operation;
};

export function chooseBestMove(
	board: (number | null)[][],
	myMission: Mission,
	opponentMissions: Mission[],
	hand: number[],
	negativeDisabled: boolean,
): CpuMove | null {
	const size = board.length;
	const allMoves: Array<CpuMove & { score: number }> = [];

	for (let y = 0; y < size; y++) {
		for (let x = 0; x < size; x++) {
			for (let handIndex = 0; handIndex < hand.length; handIndex++) {
				const num = hand[handIndex];
				const operations: Operation[] = ["add", "sub"];

				for (const operation of operations) {
					const newValue = computeCellValue(
						board[y][x],
						num,
						operation,
						negativeDisabled,
					);
					const newBoard = copyBoard(board);
					newBoard[y][x] = newValue;

					const score = evaluateBoard(newBoard, myMission, opponentMissions);

					allMoves.push({ x, y, handIndex, operation, score });
				}
			}
		}
	}

	if (allMoves.length === 0) return null;

	allMoves.sort((a, b) => b.score - a.score);

	const maxScore = allMoves[0].score;
	const topMoves = allMoves.filter((m) => m.score === maxScore);

	const selectedMove = topMoves[Math.floor(Math.random() * topMoves.length)];

	return {
		x: selectedMove.x,
		y: selectedMove.y,
		handIndex: selectedMove.handIndex,
		operation: selectedMove.operation,
	};
}

function computeCellValue(
	current: number | null,
	num: number,
	operation: Operation,
	negativeDisabled: boolean,
): number {
	const prev = current ?? 0;

	if (operation === "add") {
		return prev + num;
	} else {
		return num > prev && negativeDisabled ? num - prev : prev - num;
	}
}

function copyBoard(board: (number | null)[][]): (number | null)[][] {
	return board.map((row) => [...row]);
}

function evaluateBoard(
	board: (number | null)[][],
	myMission: Mission,
	opponentMissions: Mission[],
): number {
	const myScore = checkMissionProgress(board, myMission);

	if (myScore === Number.POSITIVE_INFINITY) {
		return Number.POSITIVE_INFINITY;
	}

	let opponentMaxScore = Number.NEGATIVE_INFINITY;
	for (const oppMission of opponentMissions) {
		const oppScore = checkMissionProgress(board, oppMission);
		if (oppScore === Number.POSITIVE_INFINITY) {
			return Number.NEGATIVE_INFINITY;
		}
		opponentMaxScore = Math.max(opponentMaxScore, oppScore);
	}

	return myScore * 2 - opponentMaxScore;
}

function checkMissionProgress(
	board: (number | null)[][],
	mission: Mission,
): number {
	const size = board.length;
	let bestScore = Number.NEGATIVE_INFINITY;

	if (mission.target === "column" || mission.target === "allDirection") {
		for (let y = 0; y < size; y++) {
			const row = board[y].filter((v) => v !== null) as number[];
			if (row.length === size) {
				const score = scoreSequence(row, mission, true);
				if (score === Number.POSITIVE_INFINITY) return Number.POSITIVE_INFINITY;
				bestScore = Math.max(bestScore, score);
			} else if (row.length > 0) {
				const partialScore = scoreSequence(row, mission, false);
				bestScore = Math.max(bestScore, partialScore * 0.3);
			}
		}
	}

	if (mission.target === "row" || mission.target === "allDirection") {
		for (let x = 0; x < size; x++) {
			const col: number[] = [];
			for (let y = 0; y < size; y++) {
				if (board[y][x] !== null) col.push(board[y][x] as number);
			}
			if (col.length === size) {
				const score = scoreSequence(col, mission, true);
				if (score === Number.POSITIVE_INFINITY) return Number.POSITIVE_INFINITY;
				bestScore = Math.max(bestScore, score);
			} else if (col.length > 0) {
				const partialScore = scoreSequence(col, mission, false);
				bestScore = Math.max(bestScore, partialScore * 0.3);
			}
		}
	}

	if (mission.target === "diagonal" || mission.target === "allDirection") {
		const diag1: number[] = [];
		const diag2: number[] = [];
		for (let i = 0; i < size; i++) {
			if (board[i][i] !== null) diag1.push(board[i][i] as number);
			if (board[i][size - i - 1] !== null)
				diag2.push(board[i][size - i - 1] as number);
		}
		if (diag1.length === size) {
			const score = scoreSequence(diag1, mission, true);
			if (score === Number.POSITIVE_INFINITY) return Number.POSITIVE_INFINITY;
			bestScore = Math.max(bestScore, score);
		} else if (diag1.length > 0) {
			const partialScore = scoreSequence(diag1, mission, false);
			bestScore = Math.max(bestScore, partialScore * 0.3);
		}
		if (diag2.length === size) {
			const score = scoreSequence(diag2, mission, true);
			if (score === Number.POSITIVE_INFINITY) return Number.POSITIVE_INFINITY;
			bestScore = Math.max(bestScore, score);
		} else if (diag2.length > 0) {
			const partialScore = scoreSequence(diag2, mission, false);
			bestScore = Math.max(bestScore, partialScore * 0.3);
		}
	}

	if (mission.target === "allCell") {
		const allCells: number[] = [];
		for (let y = 0; y < size; y++) {
			for (let x = 0; x < size; x++) {
				if (board[y][x] !== null) allCells.push(board[y][x] as number);
			}
		}

		if (mission.type === "multipile") {
			const count = allCells.filter((v) => v % mission.number === 0).length;
			if (count >= 4) return Number.POSITIVE_INFINITY;
			bestScore = Math.max(bestScore, count * 100);
		} else if (mission.type === "prime") {
			const count = allCells.filter((v) => isPrime(v)).length;
			if (count >= 4) return Number.POSITIVE_INFINITY;
			bestScore = Math.max(bestScore, count * 100);
		}
	}

	return bestScore;
}

function scoreSequence(
	seq: number[],
	mission: Mission,
	isComplete: boolean,
): number {
	switch (mission.type) {
		case "sum": {
			const sum = seq.reduce((a, b) => a + b, 0);
			if (isComplete && sum === mission.number) return Number.POSITIVE_INFINITY;
			const diff = Math.abs(sum - mission.number);
			const progress = Math.max(0, 100 - diff * 10);
			return progress;
		}
		case "multipile": {
			const count = seq.filter((v) => v % mission.number === 0).length;
			if (isComplete && count === seq.length) return Number.POSITIVE_INFINITY;
			return (count / seq.length) * 100;
		}
		case "arithmetic": {
			const sorted = [...seq].sort((a, b) => a - b);
			const diffs = sorted.slice(1).map((v, i) => v - sorted[i]);
			if (
				isComplete &&
				diffs.length > 0 &&
				diffs.every((d) => d === mission.number)
			)
				return Number.POSITIVE_INFINITY;
			if (diffs.length === 0) return 0;
			const avgDiff = diffs.reduce((a, b) => a + b, 0) / diffs.length;
			const diff = Math.abs(avgDiff - mission.number);
			const progress = Math.max(0, 100 - diff * 10);
			return progress;
		}
		case "geometric": {
			const sorted = [...seq].sort((a, b) => a - b);
			const ratios = sorted.slice(1).map((v, i) => v / (sorted[i] || 1));
			if (
				isComplete &&
				ratios.length > 0 &&
				ratios.every((r) => Math.abs(r - mission.number) < 0.01)
			)
				return Number.POSITIVE_INFINITY;
			if (ratios.length === 0) return 0;
			const avgRatio = ratios.reduce((a, b) => a + b, 0) / ratios.length;
			const diff = Math.abs(avgRatio - mission.number);
			const progress = Math.max(0, 100 - diff * 10);
			return progress;
		}
		case "prime": {
			const count = seq.filter((v) => isPrime(v)).length;
			if (isComplete && count === seq.length) return Number.POSITIVE_INFINITY;
			return (count / seq.length) * 100;
		}
		default:
			return 0;
	}
}

function isPrime(n: number): boolean {
	const primes = [
		2, 3, 5, 7, 11, 13, 17, 19, 23, 29, 31, 37, 41, 43, 47, 53, 59, 61, 67, 71,
		73, 79, 83, 89, 97,
	];
	return primes.includes(n);
}

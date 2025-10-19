import { beforeEach, describe, expect, it } from "bun:test";
import { type GameState, Magic } from "../magic";
import type { Mission } from "../mission";

// Mock dependencies for Magic class constructor
// biome-ignore lint/suspicious/noExplicitAny: test
const mockCtx: any = {
	blockConcurrencyWhile: (callback: () => Promise<void>) => callback(),
	storage: {
		get: () => Promise.resolve(undefined),
	},
};
// biome-ignore lint/suspicious/noExplicitAny: test
const mockEnv: any = null;

describe("Magic", () => {
	let magic: Magic;

	beforeEach(() => {
		magic = new Magic(mockCtx, mockEnv);
		// Mock the state for each test
		magic.state = {
			rules: {
				boardSize: 3,
				negativeDisabled: false,
				timeLimit: 10,
			},
			// Add other necessary state properties with default values
			status: "playing",
			players: ["player1", "player2"],
			playerStatus: { player1: "playing", player2: "playing" },
			names: { player1: "Player 1", player2: "Player 2" },
			round: 1,
			turn: 0,
			board: [
				[1, 2, 3],
				[4, 5, 6],
				[7, 8, 9],
			],
			winners: null,
			winnersAry: {},
			gameId: "test-game",
			hands: { player1: [1, 2, 3], player2: [4, 1, 2] },
			missions: {},
			timeLimitUnix: 0,
		} as GameState;
	});

	describe("isPrime", () => {
		it("should return true for prime numbers", () => {
			expect(magic.isPrime(2)).toBe(true);
			expect(magic.isPrime(3)).toBe(true);
			expect(magic.isPrime(5)).toBe(true);
			expect(magic.isPrime(97)).toBe(true);
		});

		it("should return false for non-prime numbers", () => {
			expect(magic.isPrime(1)).toBe(false);
			expect(magic.isPrime(4)).toBe(false);
			expect(magic.isPrime(9)).toBe(false);
			expect(magic.isPrime(100)).toBe(false);
		});

		it("should return false for null or zero", () => {
			expect(magic.isPrime(null)).toBe(false);
			expect(magic.isPrime(0)).toBe(false);
		});
	});

	describe("isWinner", () => {
		it('should correctly validate "sum" mission', () => {
			if (!magic.state) return;
			const mission: Mission = {
				type: "sum",
				number: 6,
				target: "allDirection",
				description: "",
			};
			const obary = [1, 2, 3];
			magic.state.rules.boardSize = 3;
			expect(magic.isWinner(obary, mission)).toBe(true);

			const obary2 = [1, 2, 4];
			expect(magic.isWinner(obary2, mission)).toBe(false);
		});

		it('should correctly validate "multipile" mission', () => {
			if (!magic.state) return;
			const mission: Mission = {
				type: "multipile",
				number: 2,
				target: "allDirection",
				description: "",
			};
			const obary = [2, 4, 6];
			magic.state.rules.boardSize = 3;
			expect(magic.isWinner(obary, mission)).toBe(true);

			const obary2 = [2, 4, 5];
			expect(magic.isWinner(obary2, mission)).toBe(false);
		});

		it('should correctly validate "arithmetic" mission', () => {
			if (!magic.state) return;
			const mission: Mission = {
				type: "arithmetic",
				number: 2,
				target: "allDirection",
				description: "",
			};
			const obary = [3, 5, 7];
			magic.state.rules.boardSize = 3;
			expect(magic.isWinner(obary, mission)).toBe(true);

			const obary2 = [3, 5, 8];
			expect(magic.isWinner(obary2, mission)).toBe(false);

			// Test with unsorted array
			const obary3 = [7, 3, 5];
			expect(magic.isWinner(obary3, mission)).toBe(true);
		});

		it('should correctly validate "geometric" mission', () => {
			if (!magic.state) return;
			const mission: Mission = {
				type: "geometric",
				number: 2,
				target: "allDirection",
				description: "",
			};
			const obary = [2, 4, 8];
			magic.state.rules.boardSize = 3;
			expect(magic.isWinner(obary, mission)).toBe(true);

			const obary2 = [2, 4, 9];
			expect(magic.isWinner(obary2, mission)).toBe(false);

			// Test with unsorted array
			const obary3 = [8, 2, 4];
			expect(magic.isWinner(obary3, mission)).toBe(true);
		});

		it('should correctly validate "prime" mission', () => {
			if (!magic.state) return;
			const mission: Mission = {
				type: "prime",
				target: "allDirection",
				number: 0,
				description: "",
			};
			const obary = [2, 3, 5];
			magic.state.rules.boardSize = 3;
			expect(magic.isWinner(obary, mission)).toBe(true);

			const obary2 = [2, 3, 4];
			expect(magic.isWinner(obary2, mission)).toBe(false);
		});

		it("should return false if array length does not match board size", () => {
			if (!magic.state) return;
			const mission: Mission = {
				type: "sum",
				number: 6,
				target: "allDirection",
				description: "",
			};
			const obary = [1, 2, 3, 4];
			magic.state.rules.boardSize = 3;
			expect(magic.isWinner(obary, mission)).toBe(false);
		});

		it("should handle empty array for all mission types", () => {
			if (!magic.state) return;
			magic.state.rules.boardSize = 0;
			const missionSum: Mission = {
				type: "sum",
				number: 0,
				target: "allDirection",
				description: "",
			};
			expect(magic.isWinner([], missionSum)).toBe(true);

			const missionMultipile: Mission = {
				type: "multipile",
				number: 2,
				target: "allDirection",
				description: "",
			};
			expect(magic.isWinner([], missionMultipile)).toBe(true);

			const missionArithmetic: Mission = {
				type: "arithmetic",
				number: 2,
				target: "allDirection",
				description: "",
			};
			expect(magic.isWinner([], missionArithmetic)).toBe(true);

			const missionGeometric: Mission = {
				type: "geometric",
				number: 2,
				target: "allDirection",
				description: "",
			};
			expect(magic.isWinner([], missionGeometric)).toBe(true);

			const missionPrime: Mission = {
				type: "prime",
				target: "allDirection",
				number: 0,
				description: "",
			};
			expect(magic.isWinner([], missionPrime)).toBe(true);
		});

		it('should correctly validate "sum" mission with negative numbers', () => {
			if (!magic.state) return;
			const mission: Mission = {
				type: "sum",
				number: -6,
				target: "allDirection",
				description: "",
			};
			const obary = [-1, -2, -3];
			magic.state.rules.boardSize = 3;
			expect(magic.isWinner(obary, mission)).toBe(true);
		});

		it('should correctly validate "multipile" mission with mission number 1', () => {
			if (!magic.state) return;
			const mission: Mission = {
				type: "multipile",
				number: 1,
				target: "allDirection",
				description: "",
			};
			const obary = [1, 2, 3];
			magic.state.rules.boardSize = 3;
			expect(magic.isWinner(obary, mission)).toBe(true);
		});

		it('should correctly validate "arithmetic" mission with descending sequence', () => {
			if (!magic.state) return;
			const mission: Mission = {
				type: "arithmetic",
				number: -2,
				target: "allDirection",
				description: "",
			};
			const obary = [7, 5, 3];
			magic.state.rules.boardSize = 3;
			expect(magic.isWinner(obary, mission)).toBe(true);
		});

		it('should correctly validate "geometric" mission with mission number 1', () => {
			if (!magic.state) return;
			const mission: Mission = {
				type: "geometric",
				number: 1,
				target: "allDirection",
				description: "",
			};
			const obary = [3, 3, 3];
			magic.state.rules.boardSize = 3;
			expect(magic.isWinner(obary, mission)).toBe(true);
		});

		it('should return false for "prime" mission with array containing 1', () => {
			if (!magic.state) return;
			const mission: Mission = {
				type: "prime",
				target: "allDirection",
				number: 0,
				description: "",
			};
			const obary = [1, 2, 3];
			magic.state.rules.boardSize = 3;
			expect(magic.isWinner(obary, mission)).toBe(false);
		});
	});

	describe("isVictory", () => {
		it("should correctly identify a winning column", () => {
			if (!magic.state) return;
			const mission: Mission = {
				type: "sum",
				number: 15,
				target: "column",
				description: "",
			};
			magic.state.board = [
				[8, 1, 6],
				[3, 5, 7],
				[4, 9, 2],
			];
			magic.state.rules.boardSize = 3;
			const result = magic.isVictory(mission);
			expect(result).toEqual([
				[true, true, true],
				[true, true, true],
				[true, true, true],
			]);
		});

		it("should correctly identify a winning row", () => {
			if (!magic.state) return;
			const mission: Mission = {
				type: "sum",
				number: 15,
				target: "row",
				description: "",
			};
			magic.state.board = [
				[8, 3, 4],
				[1, 5, 9],
				[6, 7, 2],
			];
			magic.state.rules.boardSize = 3;
			const result = magic.isVictory(mission);
			expect(result).toEqual([
				[true, true, true],
				[true, true, true],
				[true, true, true],
			]);
		});

		it("should correctly identify a winning diagonal", () => {
			if (!magic.state) return;
			const mission: Mission = {
				type: "sum",
				number: 15,
				target: "diagonal",
				description: "",
			};
			magic.state.board = [
				[8, 1, 6],
				[3, 5, 7],
				[4, 9, 2],
			];
			magic.state.rules.boardSize = 3;
			const result = magic.isVictory(mission);
			expect(result[0][2]).toBe(true);
			expect(result[1][1]).toBe(true);
			expect(result[2][0]).toBe(true);
		});

		it("should correctly identify winning lines with allDirection", () => {
			if (!magic.state) return;
			const mission: Mission = {
				type: "sum",
				number: 15,
				target: "allDirection",
				description: "",
			};
			magic.state.board = [
				[8, 1, 6],
				[3, 5, 7],
				[4, 9, 2],
			];
			magic.state.rules.boardSize = 3;
			const result = magic.isVictory(mission);
			expect(result).toEqual([
				[true, true, true],
				[true, true, true],
				[true, true, true],
			]);
		});

		it("should return a false matrix when no winning lines are present", () => {
			if (!magic.state) return;
			const mission: Mission = {
				type: "sum",
				number: 100,
				target: "allDirection",
				description: "",
			};
			magic.state.board = [
				[1, 2, 3],
				[4, 5, 6],
				[7, 8, 9],
			];
			magic.state.rules.boardSize = 3;
			const result = magic.isVictory(mission);
			expect(result).toEqual([
				[false, false, false],
				[false, false, false],
				[false, false, false],
			]);
		});

		it("should correctly identify a winning main diagonal", async () => {
			if (!magic.state) return;

			magic.state.players = ["player1", "player2"];
			magic.state.missions = {
				player1: {
					id: "1",
					mission: {
						type: "sum",
						target: "diagonal",
						number: 17,
						description: "",
					},
				},
				player2: {
					id: "2",
					mission: {
						type: "multipile",
						target: "allCell",
						number: 3,
						description: "",
					},
				},
			};
			magic.state.board = [
				[6, null, 3],
				[null, 2, null],
				[3, null, 9],
			];
			magic.state.hands = { player1: [9], player2: [] };
			magic.state.turn = 0; // player1's turn

			await magic.makeMove("player1", 2, 2, 9, "add", 0);

			expect(magic.state.winners).not.toBeNull();
			if (magic.state.winners) {
				expect(magic.state.winners).toHaveLength(1);
				expect(magic.state.winners).toContain("player1");
			}
		});

		it("should correctly identify a winning anti-diagonal", () => {
			if (!magic.state) return;
			const mission: Mission = {
				type: "sum",
				number: 8,
				target: "diagonal",
				description: "",
			};
			magic.state.board = [
				[3, null, 3],
				[null, 2, null],
				[3, null, 3],
			];
			magic.state.rules.boardSize = 3;
			const result = magic.isVictory(mission);
			expect(result[0][2]).toBe(true);
			expect(result[1][1]).toBe(true);
			expect(result[2][0]).toBe(true);
		});

		describe("allCell target", () => {
			it("should correctly identify winning cells for multipile mission", () => {
				if (!magic.state) return;
				const mission: Mission = {
					type: "multipile",
					number: 3,
					target: "allCell",
					description: "",
				};
				magic.state.board = [
					[3, 5, 6],
					[9, 1, 12],
					[2, 4, 15],
				];
				magic.state.rules.boardSize = 3;
				const result = magic.isVictory(mission);
				expect(result).toEqual([
					[true, false, true],
					[true, false, true],
					[false, false, true],
				]);
			});

			it("should correctly identify winning cells for prime mission", () => {
				if (!magic.state) return;
				const mission: Mission = {
					type: "prime",
					number: 0,
					target: "allCell",
					description: "",
				};
				magic.state.board = [
					[2, 4, 3],
					[5, 6, 7],
					[8, 9, 11],
				];
				magic.state.rules.boardSize = 3;
				const result = magic.isVictory(mission);
				expect(result).toEqual([
					[true, false, true],
					[true, false, true],
					[false, false, true],
				]);
			});
		});
	});

	describe("makeMove", () => {
		it("should correctly identify multiple winners", async () => {
			if (!magic.state) return;

			magic.state.players = ["player1", "player2"];
			magic.state.missions = {
				player1: {
					id: "1",
					mission: { type: "sum", target: "row", number: 15, description: "" },
				},
				player2: {
					id: "2",
					mission: {
						type: "sum",
						target: "column",
						number: 15,
						description: "",
					},
				},
			};
			magic.state.board = [
				[8, 1, 6],
				[3, null, 7],
				[4, 9, 2],
			];
			magic.state.hands = { player1: [5], player2: [] };
			magic.state.turn = 0; // player1's turn

			await magic.makeMove("player1", 1, 1, 5, "add", 0);

			expect(magic.state.winners).not.toBeNull();
			if (magic.state.winners) {
				expect(magic.state.winners).toHaveLength(2);
				expect(magic.state.winners).toContain("player1");
				expect(magic.state.winners).toContain("player2");
			}
		});
	});
});

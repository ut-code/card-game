export type Mission = {
	type: "sum" | "multipile" | "arithmetic" | "geometic" | "prime";
	target: "column" | "row" | "diagonal" | "allDirection" | "allCell";
	number: number;
	description: string;
};

export const missions: Record<string, Mission> = {
	"0": {
		type: "sum",
		target: "column",
		number: 11,
		description: "どこかの行の和が11",
	},
	"1": {
		type: "sum",
		target: "row",
		number: 11,
		description: "どこかの列の和が11",
	},
	"2": {
		type: "sum",
		target: "diagonal",
		number: 11,
		description: "どこかの対角線の和が11",
	},
	"3": {
		type: "sum",
		target: "column",
		number: 12,
		description: "どこかの行の和が12",
	},
	"4": {
		type: "sum",
		target: "row",
		number: 12,
		description: "どこかの列の和が12",
	},
	"5": {
		type: "sum",
		target: "diagonal",
		number: 12,
		description: "どこかの対角線の和が12",
	},
	"6": {
		type: "sum",
		target: "column",
		number: 13,
		description: "どこかの行の和が13",
	},
	"7": {
		type: "sum",
		target: "row",
		number: 13,
		description: "どこかの列の和が13",
	},
	"8": {
		type: "sum",
		target: "diagonal",
		number: 13,
		description: "どこかの対角線の和が13",
	},
	"9": {
		type: "sum",
		target: "column",
		number: 14,
		description: "どこかの行の和が14",
	},
	"10": {
		type: "sum",
		target: "row",
		number: 14,
		description: "どこかの列の和が14",
	},
	"11": {
		type: "sum",
		target: "diagonal",
		number: 14,
		description: "どこかの対角線の和が14",
	},
	"12": {
		type: "sum",
		target: "column",
		number: 15,
		description: "どこかの行の和が15",
	},
	"13": {
		type: "sum",
		target: "row",
		number: 15,
		description: "どこかの列の和が15",
	},
	"14": {
		type: "sum",
		target: "diagonal",
		number: 15,
		description: "どこかの対角線の和が15",
	},
	"15": {
		type: "sum",
		target: "column",
		number: 16,
		description: "どこかの行の和が16",
	},
	"16": {
		type: "sum",
		target: "row",
		number: 16,
		description: "どこかの列の和が16",
	},
	"17": {
		type: "sum",
		target: "diagonal",
		number: 16,
		description: "どこかの対角線の和が16",
	},
	"18": {
		type: "sum",
		target: "column",
		number: 17,
		description: "どこかの行の和が17",
	},
	"19": {
		type: "sum",
		target: "row",
		number: 17,
		description: "どこかの列の和が17",
	},
	"20": {
		type: "sum",
		target: "diagonal",
		number: 17,
		description: "どこかの対角線の和が17",
	},
	"21": {
		type: "sum",
		target: "column",
		number: 18,
		description: "どこかの行の和が18",
	},
	"22": {
		type: "sum",
		target: "row",
		number: 18,
		description: "どこかの列の和が18",
	},
	"23": {
		type: "sum",
		target: "diagonal",
		number: 18,
		description: "どこかの対角線の和が18",
	},
	"24": {
		type: "sum",
		target: "column",
		number: 19,
		description: "どこかの行の和が19",
	},
	"25": {
		type: "sum",
		target: "row",
		number: 19,
		description: "どこかの列の和が19",
	},
	"26": {
		type: "sum",
		target: "diagonal",
		number: 19,
		description: "どこかの対角線の和が19",
	},
	"27": {
		type: "sum",
		target: "column",
		number: 20,
		description: "どこかの行の和が20",
	},
	"28": {
		type: "sum",
		target: "row",
		number: 20,
		description: "どこかの列の和が20",
	},
	"29": {
		type: "sum",
		target: "diagonal",
		number: 20,
		description: "どこかの対角線の和が20",
	},
	"30": {
		type: "multipile",
		target: "column",
		number: 3,
		description: "どこかの行の数全てが3の倍数",
	},
	"31": {
		type: "multipile",
		target: "row",
		number: 3,
		description: "どこかの列の数全てが3の倍数",
	},
	"32": {
		type: "multipile",
		target: "allCell",
		number: 3,
		description: "盤面上に3の倍数が4つ以上存在",
	},
	"33": {
		type: "multipile",
		target: "column",
		number: 4,
		description: "どこかの行の数全てが4の倍数",
	},
	"34": {
		type: "multipile",
		target: "row",
		number: 4,
		description: "どこかの列の数全てが4の倍数",
	},
	"35": {
		type: "multipile",
		target: "allCell",
		number: 4,
		description: "盤面上に4の倍数が4つ以上存在",
	},
	"36": {
		type: "multipile",
		target: "column",
		number: 5,
		description: "どこかの行の数全てが5の倍数",
	},
	"37": {
		type: "multipile",
		target: "row",
		number: 5,
		description: "どこかの列の数全てが5の倍数",
	},
	"38": {
		type: "multipile",
		target: "allCell",
		number: 5,
		description: "盤面上に5の倍数が4つ以上存在",
	},
	"39": {
		type: "arithmetic",
		target: "column",
		number: 2,
		description: "どこかの行が公差が2の等差数列",
	},
	"40": {
		type: "arithmetic",
		target: "row",
		number: 2,
		description: "どこかの列が公差が2の等差数列",
	},
	"41": {
		type: "arithmetic",
		target: "column",
		number: 3,
		description: "どこかの行が公差が3の等差数列",
	},
	"42": {
		type: "arithmetic",
		target: "row",
		number: 3,
		description: "どこかの列が公差が3の等差数列",
	},
	"43": {
		type: "arithmetic",
		target: "column",
		number: 4,
		description: "どこかの行が公差が4の等差数列",
	},
	"44": {
		type: "arithmetic",
		target: "row",
		number: 4,
		description: "どこかの列が公差が4の等差数列",
	},
	"45": {
		type: "geometic",
		target: "allDirection",
		number: 2,
		description: "行、列、対角線のうちどこかが公比が2の等比数列",
	},
	"46": {
		type: "geometic",
		target: "allDirection",
		number: 3,
		description: "行、列、対角線のうちどこかが公比が3の等比数列",
	},
	"47": {
		type: "prime",
		target: "column",
		number: 0,
		description: "どこかの行の数がすべてが素数",
	},
	"48": {
		type: "prime",
		target: "row",
		number: 0,
		description: "どこかの列の数がすべてが素数",
	},
	"49": {
		type: "prime",
		target: "allCell",
		number: 0,
		description: "盤面上に素数が4つ以上存在",
	},
};

// type: 何を作るか　target: どこで作るか　description: 説明文
// sum: 合計　multipile: 倍数　arthmetic: 等差数列　geometic: 等比数列　prime: 素数
// column: 縦・列　row: 横・行　diagonal: 対角線　allDirection: 縦・横・対角線すべて　allCell: 盤面上に4つ

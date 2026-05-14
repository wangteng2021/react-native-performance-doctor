const REELS = 5;
const ROWS = 3;

const PAYLINES = [
  [0, 0, 0, 0, 0],
  [1, 1, 1, 1, 1],
  [2, 2, 2, 2, 2],
  [0, 1, 2, 1, 0],
  [2, 1, 0, 1, 2],
  [0, 0, 1, 0, 0],
  [2, 2, 1, 2, 2],
  [1, 0, 0, 0, 1],
  [1, 2, 2, 2, 1],
  [0, 1, 1, 1, 0],
  [2, 1, 1, 1, 2],
  [1, 0, 1, 2, 1],
  [1, 2, 1, 0, 1],
  [0, 1, 0, 1, 0],
  [2, 1, 2, 1, 2],
  [0, 2, 0, 2, 0],
  [2, 0, 2, 0, 2],
  [1, 1, 0, 1, 1],
  [1, 1, 2, 1, 1],
  [0, 2, 2, 2, 0]
];

const SYMBOLS = [
  {
    id: "wild",
    label: "Festival Wild",
    asset: "wild",
    role: "wild",
    tier: "feature",
    weight: 3,
    payouts: { 3: 20, 4: 80, 5: 400 }
  },
  {
    id: "scatter",
    label: "Star Piñata Scatter",
    asset: "scatter",
    role: "scatter",
    tier: "feature",
    weight: 4,
    payouts: {}
  },
  {
    id: "sugar-skull",
    label: "Sugar Skull",
    asset: "skull",
    role: "regular",
    tier: "premium",
    weight: 6,
    payouts: { 3: 20, 4: 120, 5: 1000 }
  },
  {
    id: "sombrero",
    label: "Sombrero",
    asset: "sombrero",
    role: "regular",
    tier: "premium",
    weight: 8,
    payouts: { 3: 16, 4: 80, 5: 500 }
  },
  {
    id: "maracas",
    label: "Maracas",
    asset: "maracas",
    role: "regular",
    tier: "premium",
    weight: 10,
    payouts: { 3: 12, 4: 60, 5: 250 }
  },
  {
    id: "taco",
    label: "Taco",
    asset: "taco",
    role: "regular",
    tier: "premium",
    weight: 12,
    payouts: { 3: 10, 4: 40, 5: 160 }
  },
  {
    id: "chili",
    label: "Chili",
    asset: "chili",
    role: "regular",
    tier: "premium",
    weight: 14,
    payouts: { 3: 8, 4: 30, 5: 100 }
  },
  {
    id: "ace",
    label: "A Banner",
    asset: "ace",
    role: "regular",
    tier: "low",
    weight: 18,
    payouts: { 3: 5, 4: 16, 5: 60 }
  },
  {
    id: "king",
    label: "K Banner",
    asset: "king",
    role: "regular",
    tier: "low",
    weight: 20,
    payouts: { 3: 4, 4: 12, 5: 50 }
  },
  {
    id: "queen",
    label: "Q Banner",
    asset: "queen",
    role: "regular",
    tier: "low",
    weight: 22,
    payouts: { 3: 3, 4: 10, 5: 40 }
  },
  {
    id: "jack",
    label: "J Banner",
    asset: "jack",
    role: "regular",
    tier: "low",
    weight: 24,
    payouts: { 3: 2, 4: 8, 5: 30 }
  }
];

const weightedSymbols = SYMBOLS.flatMap((symbol) =>
  Array.from({ length: symbol.weight }, () => symbol)
);

function pickSymbol() {
  return weightedSymbols[Math.floor(Math.random() * weightedSymbols.length)];
}

function pickMultiplier() {
  const multipliers = [2, 2, 2, 3, 3, 5, 5, 10, 20, 50, 100];
  return multipliers[Math.floor(Math.random() * multipliers.length)];
}

function toPublicSymbol(symbol) {
  const { weight, ...publicSymbol } = symbol;
  return publicSymbol;
}

function createCell(reelIndex) {
  const symbol = pickSymbol();
  const cell = { ...toPublicSymbol(symbol) };

  if (cell.role === "regular" && reelIndex >= 1 && reelIndex <= 3 && Math.random() < 0.18) {
    cell.goldFrame = true;
    if (Math.random() < 0.42) {
      cell.multiplier = pickMultiplier();
    }
  }

  return cell;
}

function createBoard() {
  return Array.from({ length: ROWS }, () =>
    Array.from({ length: REELS }, (_, reelIndex) => createCell(reelIndex))
  );
}

function getSymbolDefinition(symbolId) {
  return SYMBOLS.find((symbol) => symbol.id === symbolId);
}

function getTargetSymbol(cells) {
  return cells.find((cell) => cell.role === "regular") || null;
}

function evaluateLine(board, line, lineIndex, bet) {
  const cells = line.map((row, reel) => ({ ...board[row][reel], row, reel }));

  if (cells[0].role === "scatter") {
    return null;
  }

  const target = getTargetSymbol(cells);
  if (!target) {
    const wildDefinition = getSymbolDefinition("wild");
    const wildCount = cells.findIndex((cell) => cell.role !== "wild");
    const count = wildCount === -1 ? cells.length : wildCount;
    const payout = wildDefinition.payouts[count];

    if (count >= 3 && payout) {
      return {
        line: lineIndex + 1,
        symbol: "wild",
        label: wildDefinition.label,
        count,
        positions: cells.slice(0, count).map(({ row, reel }) => ({ row, reel })),
        amount: bet * payout
      };
    }

    return null;
  }

  const positions = [];
  for (let reel = 0; reel < cells.length; reel += 1) {
    const cell = cells[reel];
    const matches = cell.id === target.id || cell.role === "wild";

    if (!matches || cell.role === "scatter") {
      break;
    }

    positions.push({ row: cell.row, reel: cell.reel });
  }

  const payout = target.payouts[positions.length];
  if (positions.length < 3 || !payout) {
    return null;
  }

  return {
    line: lineIndex + 1,
    symbol: target.id,
    label: target.label,
    count: positions.length,
    positions,
    amount: bet * payout
  };
}

function getUniqueWinningCells(lineWins) {
  const unique = new Map();
  lineWins.forEach((win) => {
    win.positions.forEach((position) => {
      unique.set(`${position.row}:${position.reel}`, position);
    });
  });
  return Array.from(unique.values());
}

function collectGoldMultipliers(board, lineWins) {
  return getUniqueWinningCells(lineWins)
    .map((position) => ({ ...position, cell: board[position.row][position.reel] }))
    .filter(({ cell }) => cell.goldFrame && cell.multiplier)
    .map(({ row, reel, cell }) => ({
      row,
      reel,
      symbol: cell.id,
      value: cell.multiplier
    }));
}

function evaluateBoard(board, bet) {
  const lineWins = PAYLINES
    .map((line, lineIndex) => evaluateLine(board, line, lineIndex, bet))
    .filter(Boolean);

  const scatterPositions = [];
  board.forEach((row, rowIndex) => {
    row.forEach((cell, reelIndex) => {
      if (cell.role === "scatter") {
        scatterPositions.push({ row: rowIndex, reel: reelIndex });
      }
    });
  });

  const baseLineWin = lineWins.reduce((sum, win) => sum + win.amount, 0);
  const collectedMultipliers = collectGoldMultipliers(board, lineWins);
  const multiplierTotal = collectedMultipliers.reduce((sum, multiplier) => sum + multiplier.value, 0);
  const multiplierApplied = multiplierTotal > 0 ? multiplierTotal : 1;
  const multipliedLineWin = baseLineWin * multiplierApplied;
  const scatterWin = scatterPositions.length >= 3 ? bet * scatterPositions.length * 5 : 0;
  const freeSpinsAwarded = scatterPositions.length >= 3 ? 15 + (scatterPositions.length - 3) * 2 : 0;
  const totalWin = multipliedLineWin + scatterWin;

  const wins = [...lineWins];
  if (scatterWin > 0) {
    wins.push({
      line: null,
      symbol: "scatter",
      label: "Star Piñata Scatter",
      count: scatterPositions.length,
      positions: scatterPositions,
      amount: scatterWin,
      feature: "Free Spins"
    });
  }

  return {
    wins,
    lineWins,
    scatterPositions,
    collectedMultipliers,
    multiplierApplied,
    baseLineWin,
    scatterWin,
    totalWin,
    freeSpinsAwarded
  };
}

function spin({ bet = 12, balance = 1200, freeSpin = false } = {}) {
  const safeBet = Math.max(1, Math.min(Number(bet) || 12, 500));
  const safeBalance = Math.max(0, Number(balance) || 0);
  const isFreeSpin = Boolean(freeSpin);

  if (!isFreeSpin && safeBalance < safeBet) {
    return {
      accepted: false,
      reason: "Insufficient balance",
      balance: safeBalance
    };
  }

  const board = createBoard();
  const result = evaluateBoard(board, safeBet);
  const nextBalance = safeBalance - (isFreeSpin ? 0 : safeBet) + result.totalWin;

  return {
    accepted: true,
    board,
    bet: safeBet,
    freeSpin: isFreeSpin,
    balance: nextBalance,
    totalWin: result.totalWin,
    baseLineWin: result.baseLineWin,
    scatterWin: result.scatterWin,
    multiplierApplied: result.multiplierApplied,
    collectedMultipliers: result.collectedMultipliers,
    wins: result.wins,
    freeSpinsAwarded: result.freeSpinsAwarded,
    roundId: `PFW-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`
  };
}

function getGameConfig() {
  return {
    id: "pinata-fiesta-wins-original",
    title: "Piñata Fiesta Wins",
    type: "video-slot",
    reels: REELS,
    rows: ROWS,
    paylines: PAYLINES,
    defaultBalance: 1200,
    bets: [6, 12, 30, 60, 120, 300],
    rtp: "demo math",
    volatility: "medium-high demo",
    maxWin: "simulated 5000x cap not enforced",
    symbols: SYMBOLS.map(toPublicSymbol),
    rules: [
      "5 reels × 3 rows with 20 fixed paylines evaluated from left to right.",
      "Wild substitutes for every regular symbol. Scatter triggers 15 free spins when 3+ land anywhere.",
      "Regular symbols on reels 2–4 can land in gold frames with x2–x100 multipliers.",
      "Collected gold multipliers are summed and applied to line wins in the same spin.",
      "Original demo implementation: no copied third-party code, art, sound, or brand assets."
    ]
  };
}

module.exports = { getGameConfig, spin };

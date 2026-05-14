const crypto = require("node:crypto");
const { getStrategyConfig, getEffectiveStrategy } = require("./gameStrategyConfig");
const { getDb } = require("./db");
const merchantService = require("./merchantService");

const START_BALANCE = 100_000;
const JACKPOT_POOL = 8_888_888;
const ROWS = 3;
const REELS = 5;

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
  { id: 1, weight: 18, pay: { 3: 2, 4: 8, 5: 30 } },
  { id: 2, weight: 18, pay: { 3: 3, 4: 10, 5: 40 } },
  { id: 3, weight: 16, pay: { 3: 4, 4: 12, 5: 50 } },
  { id: 4, weight: 14, pay: { 3: 5, 4: 16, 5: 60 } },
  { id: 5, weight: 11, pay: { 3: 8, 4: 30, 5: 100 } },
  { id: 6, weight: 10, pay: { 3: 10, 4: 40, 5: 160 } },
  { id: 7, weight: 8, pay: { 3: 12, 4: 60, 5: 250 } },
  { id: 8, weight: 7, pay: { 3: 16, 4: 80, 5: 500 } },
  { id: 9, weight: 6, pay: { 3: 20, 4: 120, 5: 1000 } },
  { id: 11, weight: 3, wild: true, pay: { 3: 20, 4: 80, 5: 400 } }
];

const weightedSymbols = SYMBOLS.flatMap((symbol) => Array.from({ length: symbol.weight }, () => symbol.id));
const socketSessions = new Map();
const SOCKET_SESSION_TTL_MS = 10 * 60 * 1000;

function rowToPlayer(row) {
  if (!row) return null;
  return {
    id: row.id,
    code: row.code,
    merchantId: row.merchant_id || null,
    externalUserId: row.external_user_id || null,
    gameId: row.game_id || null,
    account: row.account,
    nickname: row.nickname,
    sign: row.sign,
    score: row.score,
    diamond: row.diamond,
    official: Boolean(row.official),
    freeCount: row.free_count,
    spinCount: row.spin_count,
    totalBet: row.total_bet,
    totalWon: row.total_won,
    consecutiveLosses: row.consecutive_losses,
    consecutiveWins: row.consecutive_wins
  };
}

function loadPlayerByCode(code) {
  const db = getDb();
  return rowToPlayer(db.prepare("SELECT * FROM players WHERE code = ?").get(code));
}

function loadPlayerById(id) {
  const db = getDb();
  return rowToPlayer(db.prepare("SELECT * FROM players WHERE id = ?").get(id));
}

function loadPlayerByMerchantUser(merchantId, externalUserId, gameId) {
  if (!merchantId || !externalUserId) return null;
  const db = getDb();
  if (gameId) {
    return rowToPlayer(
      db.prepare(
        "SELECT * FROM players WHERE merchant_id = ? AND external_user_id = ? AND game_id = ?"
      ).get(merchantId, externalUserId, gameId)
    );
  }
  // 没传 gameId,任意一条返回(legacy)
  return rowToPlayer(
    db.prepare(
      "SELECT * FROM players WHERE merchant_id = ? AND external_user_id = ? ORDER BY id LIMIT 1"
    ).get(merchantId, externalUserId)
  );
}

// 创建玩家。
// - 如果指定了 (merchantId, externalUserId) 走商户接入模式;code 自动是 `${merchantId}:${externalUserId}:${gameId}`
// - 否则按 legacy code 模式
function insertPlayer({ code, merchantId, externalUserId, gameId, payload } = {}) {
  const db = getDb();
  const maxRow = db.prepare("SELECT COALESCE(MAX(id), 10000) AS m FROM players").get();
  const numericId = maxRow.m + 1;
  const usingMerchant = Boolean(merchantId && externalUserId);
  const finalCode = usingMerchant
    ? `${merchantId}:${externalUserId}${gameId ? `:${gameId}` : ""}`
    : (code || `local-${numericId}`);
  const initialBalance = (payload && Number.isFinite(Number(payload.initialBalance)))
    ? Number(payload.initialBalance)
    : START_BALANCE;
  const nickname = (payload && payload.nickname) || `Local Player ${numericId}`;

  const player = {
    id: numericId,
    code: finalCode,
    merchantId: usingMerchant ? merchantId : null,
    externalUserId: usingMerchant ? externalUserId : null,
    gameId: gameId || null,
    account: `local_${numericId}`,
    nickname,
    sign: randomId("sgn_"),
    score: initialBalance,
    diamond: 0,
    official: true,
    freeCount: 0,
    spinCount: 0,
    totalBet: 0,
    totalWon: 0,
    consecutiveLosses: 0,
    consecutiveWins: 0
  };
  db.prepare(
    `INSERT INTO players
     (id, code, merchant_id, external_user_id, game_id, account, nickname, sign, score, diamond, official,
      free_count, spin_count, total_bet, total_won,
      consecutive_losses, consecutive_wins)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    player.id, player.code, player.merchantId, player.externalUserId, player.gameId,
    player.account, player.nickname, player.sign,
    player.score, player.diamond, player.official ? 1 : 0,
    player.freeCount, player.spinCount, player.totalBet, player.totalWon,
    player.consecutiveLosses, player.consecutiveWins
  );
  return player;
}

function savePlayer(player) {
  const db = getDb();
  db.prepare(
    `UPDATE players SET
       score = ?, diamond = ?, free_count = ?, spin_count = ?,
       total_bet = ?, total_won = ?,
       consecutive_losses = ?, consecutive_wins = ?,
       updated_at = datetime('now')
     WHERE id = ?`
  ).run(
    player.score, player.diamond, player.freeCount, player.spinCount,
    player.totalBet, player.totalWon,
    player.consecutiveLosses, player.consecutiveWins,
    player.id
  );
}

function recordSpin({ playerId, roundId, bet, win, isFreeSpin, strategy, betTier, gameId }) {
  const db = getDb();
  db.prepare(
    `INSERT INTO spin_history (round_id, player_id, bet, win, is_free, strategy, bet_tier, game_id)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(roundId, playerId, bet, win, isFreeSpin ? 1 : 0, strategy || null, betTier || null, gameId || null);
}

function randomId(prefix) {
  return `${prefix}${crypto.randomBytes(8).toString("hex")}`;
}

function roundScore(value) {
  return Math.round(Number(value) * 10) / 10;
}

function pickSymbol() {
  return weightedSymbols[Math.floor(Math.random() * weightedSymbols.length)];
}

// 兼容老用法 createPlayer("xxx") 和新用法 createPlayer({...})
function createPlayer(input = "local") {
  if (typeof input === "string") {
    const existing = loadPlayerByCode(input);
    if (existing) return existing;
    return insertPlayer({ code: input });
  }
  // 对象形式
  const { code, merchantId, externalUserId, gameId, payload } = input || {};
  if (merchantId && externalUserId) {
    const existing = loadPlayerByMerchantUser(merchantId, externalUserId, gameId);
    if (existing) return existing;
    return insertPlayer({ merchantId, externalUserId, gameId, payload });
  }
  if (code) {
    const existing = loadPlayerByCode(code);
    if (existing) return existing;
    return insertPlayer({ code });
  }
  // 完全空白:fallback
  const existing = loadPlayerByCode("local");
  if (existing) return existing;
  return insertPlayer({ code: "local" });
}

function getDefaultPlayer() {
  const db = getDb();
  const anyPlayer = db.prepare("SELECT * FROM players ORDER BY id LIMIT 1").get();
  if (anyPlayer) return rowToPlayer(anyPlayer);
  return createPlayer("local");
}

// authLogin 现在支持两种模式:
//   authLogin("code") — 老的 demo 模式
//   authLogin({ merchantId, externalUserId, payload }) — 商户接入模式
function resolvePlayerFromAuthInput(input) {
  let player;
  if (typeof input === "string" || input == null) {
    player = createPlayer(input || "local");
  } else {
    player = createPlayer(input);
  }
  return player;
}

function authLogin(input) {
  const player = resolvePlayerFromAuthInput(input);
  return {
    resultid: 1,
    Obj: {
      account: player.account,
      sign: player.sign,
      id: player.id,
      nickname: player.nickname,
      score: player.score,
      diamond: player.diamond,
      official: player.official,
      merchantId: player.merchantId,
      externalUserId: player.externalUserId,
      gameId: player.gameId
    }
  };
}

function cellIndex(row, reel) {
  return (ROWS - 1 - row) * REELS + reel;
}

function createBoard() {
  return Array.from({ length: ROWS }, () => Array.from({ length: REELS }, pickSymbol));
}

function cloneBoard(board) {
  return board.map((row) => row.slice());
}

function forceOccasionalWin(board) {
  if (Math.random() > 0.34) return;
  const row = Math.floor(Math.random() * ROWS);
  const symbol = 5 + Math.floor(Math.random() * 5);
  const count = 3 + Math.floor(Math.random() * 3);
  for (let reel = 0; reel < count; reel += 1) {
    board[row][reel] = symbol;
  }
}

function forceLineWin(board, targetMultiplier = 3) {
  const candidates = SYMBOLS
    .filter((symbol) => !symbol.wild)
    .flatMap((symbol) => Object.entries(symbol.pay).map(([count, pay]) => ({
      symbol: symbol.id,
      count: Number(count),
      pay
    })))
    .sort((left, right) => Math.abs(left.pay - targetMultiplier) - Math.abs(right.pay - targetMultiplier));
  const picked = candidates[0] || { symbol: 5, count: 3 };
  const row = Math.floor(Math.random() * ROWS);
  for (let reel = 0; reel < REELS; reel += 1) {
    board[row][reel] = reel < picked.count ? picked.symbol : pickDifferentSymbol(picked.symbol);
  }
}

function pickDifferentSymbol(symbolId) {
  let picked = pickSymbol();
  for (let attempt = 0; attempt < 20 && picked === symbolId; attempt += 1) {
    picked = pickSymbol();
  }
  return picked === symbolId ? 1 : picked;
}

function forceNearMiss(board) {
  const row = Math.floor(Math.random() * ROWS);
  const symbol = 5 + Math.floor(Math.random() * 5);
  board[row][0] = symbol;
  board[row][1] = symbol;
  board[row][2] = pickDifferentSymbol(symbol);
  board[row][3] = symbol;
  board[row][4] = pickDifferentSymbol(symbol);
}

function symbolDefinition(id) {
  return SYMBOLS.find((symbol) => symbol.id === id) || SYMBOLS[0];
}

function evaluateLine(board, line, lineNumber, totalBet, forcedAmount = null) {
  const cells = line.map((row, reel) => ({ row, reel, id: board[row][reel] }));
  const target = cells.find((cell) => !symbolDefinition(cell.id).wild);
  const targetId = target ? target.id : 11;
  const positions = [];

  for (const cell of cells) {
    const definition = symbolDefinition(cell.id);
    if (cell.id !== targetId && !definition.wild) break;
    positions.push(cellIndex(cell.row, cell.reel));
  }

  const pay = symbolDefinition(targetId).pay[positions.length];
  if (positions.length < 3 || !pay) return null;
  const naturalAmount = roundScore(totalBet * (pay / PAYLINES.length));
  return {
    line: lineNumber,
    positions,
    multiplier: pay / PAYLINES.length,
    amount: forcedAmount === null ? naturalAmount : roundScore(forcedAmount)
  };
}

function evaluateBoard(board, totalBet, targetWin = null) {
  const naturalWins = PAYLINES
    .map((line, index) => evaluateLine(board, line, index + 1, totalBet))
    .filter(Boolean);
  if (targetWin === null || naturalWins.length === 0) return naturalWins;
  const perLineAmount = roundScore(targetWin / naturalWins.length);
  return naturalWins.map((win) => ({ ...win, amount: perLineAmount }));
}

function createLosingBoard(totalBet, nearMiss = false) {
  for (let attempt = 0; attempt < 80; attempt += 1) {
    const board = createBoard();
    if (nearMiss) forceNearMiss(board);
    if (!evaluateBoard(board, totalBet).length) return board;
  }
  const board = Array.from({ length: ROWS }, (_, row) =>
    Array.from({ length: REELS }, (_, reel) => ((row + reel) % 9) + 1)
  );
  if (nearMiss) forceNearMiss(board);
  return evaluateBoard(board, totalBet).length ? createBoard() : board;
}

function createWinningBoard(totalBet, targetMultiplier) {
  for (let attempt = 0; attempt < 80; attempt += 1) {
    const board = createBoard();
    forceLineWin(board, Math.max(3, targetMultiplier * PAYLINES.length));
    if (evaluateBoard(board, totalBet).length) return board;
  }
  const board = createLosingBoard(totalBet, false);
  forceLineWin(board, targetMultiplier * PAYLINES.length);
  return board;
}

function playerRtp(player) {
  return player.totalBet > 0 ? player.totalWon / player.totalBet : 0;
}

function globalStats() {
  const db = getDb();
  // 从 players 累计字段汇总(比遍历 spin_history 快,每次 spin 已同步写回 players)
  const row = db.prepare(
    `SELECT COALESCE(SUM(total_bet), 0) AS total_bet,
            COALESCE(SUM(total_won), 0) AS total_won
       FROM players`
  ).get();
  const totalBet = row.total_bet;
  const totalWon = row.total_won;
  return {
    totalBet,
    totalWon,
    rtp: totalBet > 0 ? totalWon / totalBet : 0
  };
}

function getRuntimeStats() {
  const db = getDb();
  const stats = globalStats();
  const countRow = db.prepare("SELECT COUNT(*) AS n FROM players").get();
  const rows = db.prepare(
    `SELECT id, nickname, score, spin_count, total_bet, total_won,
            consecutive_losses, consecutive_wins
       FROM players
       ORDER BY (total_won - total_bet) DESC
       LIMIT 100`
  ).all();
  return {
    ...stats,
    playerCount: countRow.n,
    players: rows.map((p) => ({
      id: p.id,
      nickname: p.nickname,
      score: p.score,
      spinCount: p.spin_count,
      totalBet: p.total_bet,
      totalWon: p.total_won,
      rtp: p.total_bet > 0 ? p.total_won / p.total_bet : 0,
      net: p.total_won - p.total_bet,
      consecutiveLosses: p.consecutive_losses,
      consecutiveWins: p.consecutive_wins
    }))
  };
}

function clampMultiplier(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function randomBetween(min, max) {
  return min + Math.random() * (max - min);
}

function pickNewUserStrategy(player, config) {
  const newbie = config.newUserProtection;
  if (!newbie.enabled || player.spinCount >= newbie.spins) return null;

  const spinNumber = player.spinCount + 1;
  const progress = newbie.spins > 0 ? spinNumber / newbie.spins : 1;
  const maxWinMultiplier = Math.min(newbie.maxWinMultiplier, config.maxWinMultiplier);
  const minWinMultiplier = Math.min(newbie.targetWinMultiplierMin, maxWinMultiplier);
  const maxTargetMultiplier = Math.max(minWinMultiplier, Math.min(newbie.targetWinMultiplierMax, maxWinMultiplier));

  if (spinNumber === 1) {
    if (Math.random() < newbie.firstSpinWinChance) {
      return {
        mode: "new-user-first-win",
        targetMultiplier: clampMultiplier(randomBetween(1.1, Math.min(2.2, maxTargetMultiplier)), minWinMultiplier, maxTargetMultiplier)
      };
    }
    return { mode: "new-user-first-near-miss", nearMiss: true };
  }

  if (player.consecutiveLosses >= newbie.reliefAfterLosses) {
    return {
      mode: "new-user-loss-relief",
      targetMultiplier: clampMultiplier(randomBetween(1.0, maxTargetMultiplier), minWinMultiplier, maxTargetMultiplier)
    };
  }

  if (player.consecutiveWins >= newbie.cooldownAfterWins) {
    return { mode: "new-user-breathing-room", nearMiss: Math.random() < newbie.nearMissChance };
  }

  const phaseWinChance = progress <= 0.25
    ? newbie.earlyWinChance
    : progress <= 0.65
      ? newbie.midWinChance
      : newbie.lateWinChance;
  const playerNeedsLift = player.totalBet > 0 && playerRtp(player) < newbie.minRtp;
  const winChance = Math.min(1, phaseWinChance + (playerNeedsLift ? newbie.forceWinChance * 0.35 : 0));

  if (Math.random() < winChance) {
    const upper = progress <= 0.25 ? Math.min(2.8, maxTargetMultiplier) : maxTargetMultiplier;
    return {
      mode: progress <= 0.25 ? "new-user-early-win" : "new-user-paced-win",
      targetMultiplier: clampMultiplier(randomBetween(minWinMultiplier, upper), minWinMultiplier, maxTargetMultiplier)
    };
  }

  if (Math.random() < newbie.nearMissChance) {
    return { mode: "new-user-near-miss", nearMiss: true };
  }

  return { mode: "new-user-quiet-spin" };
}

// 根据下注量级返回对应 tier 的策略参数
// 没启用 betTiers 时返回 null,走老逻辑兜底
function pickBetTier(totalBet, config) {
  const tiers = config.betTiers;
  if (!tiers || !tiers.enabled) return null;
  if (totalBet <= tiers.lowMaxBet) return { name: "low", ...tiers.low };
  if (totalBet <= tiers.midMaxBet) return { name: "mid", ...tiers.mid };
  return { name: "high", ...tiers.high };
}

function pickStrategy(player, totalBet) {
  // 优先级:(merchant, game) > game default > 全局 default
  const config = (player.merchantId || player.gameId)
    ? getEffectiveStrategy(player.merchantId, player.gameId)
    : getStrategyConfig();
  const stats = globalStats();
  const tier = pickBetTier(totalBet, config);
  const playerProfit = player.totalWon - player.totalBet;
  const globalTooLow = stats.totalBet > 0 && stats.rtp < config.rtpTarget - config.rtpTolerance;
  const globalTooHigh = stats.totalBet > 0 && stats.rtp > config.rtpTarget + config.rtpTolerance;

  // 新用户保护期独立逻辑(不受 tier 参数影响,新人就是要给好体验);
  // 但仍然把 tier 名字带上,方便管理后台观测
  const newUserStrategy = pickNewUserStrategy(player, config);
  if (newUserStrategy) return { ...newUserStrategy, tier: tier ? tier.name : null };

  // 冷却阈值(tier 优先,fallback 到 winCooling 老配置)
  const surplusMultiplier = tier ? tier.surplusBetMultiplier : config.winCooling.surplusBetMultiplier;
  const deficitMultiplier = tier ? tier.deficitBetMultiplier : config.lossRelief.deficitBetMultiplier;

  if (
    config.winCooling.enabled &&
    (player.consecutiveWins >= config.winCooling.consecutiveWins ||
      playerProfit > totalBet * surplusMultiplier ||
      globalTooHigh) &&
    Math.random() < config.winCooling.forceLoseChance
  ) {
    return {
      mode: "cooldown",
      tier: tier ? tier.name : null,
      nearMiss: Math.random() < config.winCooling.nearMissChance
    };
  }

  if (
    config.lossRelief.enabled &&
    (player.consecutiveLosses >= config.lossRelief.consecutiveLosses ||
      playerProfit < -totalBet * deficitMultiplier ||
      globalTooLow) &&
    Math.random() < config.lossRelief.forceWinChance
  ) {
    // tier 影响补偿幅度:high tier 补偿幅度更大,low tier 更小
    const min = tier ? tier.targetWinMultiplierMin : config.lossRelief.targetWinMultiplierMin;
    const max = tier ? tier.targetWinMultiplierMax : config.lossRelief.targetWinMultiplierMax;
    return {
      mode: "loss-relief",
      tier: tier ? tier.name : null,
      targetMultiplier: min + Math.random() * (max - min)
    };
  }

  // tier 优先决定 near-miss 概率
  const nearMissChance = tier ? tier.nearMissChance : config.nearMiss.chance;
  if (config.nearMiss.enabled && Math.random() < nearMissChance) {
    return { mode: "near-miss", tier: tier ? tier.name : null, nearMiss: true };
  }

  // tier 优先决定 force-win 概率(乘以 bigWinBoost 增加大奖触发权重)
  const forceWinChance = tier ? tier.forceWinChance : config.baseForceWinChance;
  if (Math.random() < forceWinChance) {
    const min = tier ? tier.targetWinMultiplierMin : 1;
    const max = tier ? tier.targetWinMultiplierMax : 9;
    // bigWinBoost > 1 倾向于更靠近 max(大奖); < 1 倾向于更靠近 min(小奖)
    const boost = tier ? tier.bigWinBoost : 1;
    const skew = boost >= 1 ? Math.pow(Math.random(), 1 / boost) : Math.pow(Math.random(), boost);
    return {
      mode: "base-win",
      tier: tier ? tier.name : null,
      targetMultiplier: min + skew * (max - min)
    };
  }

  if (Math.random() < config.baseNearMissChance) {
    return { mode: "base-near-miss", tier: tier ? tier.name : null, nearMiss: true };
  }

  return { mode: "random", tier: tier ? tier.name : null };
}

function createBoardByStrategy(player, totalBet) {
  const strategy = pickStrategy(player, totalBet);
  if (strategy.mode === "cooldown" || strategy.mode === "near-miss" || strategy.mode === "base-near-miss") {
    return { board: createLosingBoard(totalBet, Boolean(strategy.nearMiss)), strategy };
  }
  if (strategy.targetMultiplier) {
    return {
      board: createWinningBoard(totalBet, strategy.targetMultiplier),
      strategy: { ...strategy, targetWin: totalBet * strategy.targetMultiplier }
    };
  }
  const board = createBoard();
  return { board, strategy };
}

function flattenBoardForClient(board) {
  const cards = [];
  for (let row = ROWS - 1; row >= 0; row -= 1) {
    for (let reel = 0; reel < REELS; reel += 1) {
      cards.push(board[row][reel]);
    }
  }
  return cards;
}

function createLotteryResult(player, betPayload = {}) {
  const config = (player.merchantId || player.gameId)
    ? getEffectiveStrategy(player.merchantId, player.gameId)
    : getStrategyConfig();
  const requestedBet = Number((betPayload.nBetList || [])[0] || betPayload.bet || 20);
  if (!Number.isFinite(requestedBet) || requestedBet <= 0) {
    return { ResultCode: -1, error: "invalid_bet", userscore: player.score };
  }
  const totalBet = Math.max(1, requestedBet);
  const isFreeSpin = player.freeCount > 0;

  if (!isFreeSpin && player.score < totalBet) {
    return { ResultCode: -2, userscore: player.score };
  }

  if (!isFreeSpin) player.score -= totalBet;
  else player.freeCount -= 1;

  const { board, strategy } = createBoardByStrategy(player, totalBet);
  const lineWins = evaluateBoard(board, totalBet, strategy.targetWin || null);
  const totalWin = roundScore(Math.min(
    lineWins.reduce((sum, win) => sum + win.amount, 0),
    totalBet * config.maxWinMultiplier
  ));
  player.score += totalWin;
  player.spinCount += 1;
  if (!isFreeSpin) player.totalBet += totalBet;
  player.totalWon += totalWin;
  if (totalWin > 0) {
    player.consecutiveWins += 1;
    player.consecutiveLosses = 0;
  } else {
    player.consecutiveLosses += 1;
    player.consecutiveWins = 0;
  }

  const winCards = Array.from({ length: ROWS * REELS }, () => false);
  lineWins.forEach((win) => win.positions.forEach((position) => { winCards[position] = true; }));
  const handCards = flattenBoardForClient(board);
  const endView = {
    nHandCards: handCards,
    nWinCards: Array.from({ length: ROWS * REELS }, () => false),
    nWinLinesDetail: [],
    win: 0,
    scl: {},
    combo_num: lineWins.length ? 1 : 0,
    aw: totalWin
  };
  const viewarray = totalWin > 0
    ? [
        {
          nHandCards: handCards,
          nWinCards: winCards,
          nWinLinesDetail: lineWins.map((win) => win.positions),
          win: totalWin,
          scl: {},
          combo_num: 0,
          aw: totalWin
        },
        endView
      ]
    : [endView];

  const freeAward = 0;
  const roundId = randomId("PFW");
  const result = {
    ResultCode: 1,
    ResultData: {
      id: roundId,
      userscore: player.score,
      winscore: totalWin,
      totalBet,
      freeCount: player.freeCount,
      bigWinMultiplier: config.bigWinMultiplier,
      rtpTarget: config.rtpTarget,
      strategy: strategy.mode,
      betTier: strategy.tier || null,
      gameId: player.gameId || null,
      getFreeTime: { bFlag: freeAward > 0, nFreeTime: freeAward },
      viewarray
    }
  };

  // 把玩家累计数据写回 DB,并记一条 spin_history
  savePlayer(player);
  recordSpin({
    playerId: player.id,
    roundId,
    bet: totalBet,
    win: totalWin,
    isFreeSpin,
    strategy: strategy.mode,
    betTier: strategy.tier || null,
    gameId: player.gameId || null
  });

  // 商户接入模式:写 transactions(下注 + 中奖各一条)
  if (player.merchantId && player.externalUserId) {
    const balanceBeforeBet = player.score + totalBet - totalWin;
    const balanceAfterBetOnly = balanceBeforeBet - totalBet;
    const meta = { strategy: strategy.mode, betTier: strategy.tier || null };

    if (!isFreeSpin) {
      merchantService.recordTransaction({
        txnId: `${roundId}-bet`,
        merchantId: player.merchantId,
        externalUserId: player.externalUserId,
        gameId: player.gameId || null,
        playerId: player.id,
        type: "bet",
        amount: totalBet,
        balanceBefore: balanceBeforeBet,
        balanceAfter: balanceAfterBetOnly,
        roundId,
        meta
      });
    }

    if (totalWin > 0) {
      merchantService.recordTransaction({
        txnId: `${roundId}-win`,
        merchantId: player.merchantId,
        externalUserId: player.externalUserId,
        gameId: player.gameId || null,
        playerId: player.id,
        type: "win",
        amount: totalWin,
        balanceBefore: balanceAfterBetOnly,
        balanceAfter: player.score,
        roundId,
        meta
      });
    }
  }

  return result;
}

function getRecentHistory(playerId, limit = 20) {
  const db = getDb();
  const rows = db.prepare(
    `SELECT round_id, bet, win, created_at
       FROM spin_history
      WHERE player_id = ?
      ORDER BY id DESC
      LIMIT ?`
  ).all(playerId, limit);
  return rows.map((r) => ({
    lotteryTime: Date.parse(r.created_at + "Z") || Date.now(),
    id: r.round_id,
    score_linescore: r.bet,
    score_win: r.win
  }));
}

function createSocketSession(player) {
  const sid = randomId("sid_");
  const session = {
    sid,
    player: player || null,
    queue: ["40", createEventPacket("connected")],
    expiresAt: Date.now() + SOCKET_SESSION_TTL_MS
  };
  socketSessions.set(sid, session);
  return session;
}

function getSocketSession(sid) {
  const session = socketSessions.get(sid);
  if (!session) return null;
  if (session.expiresAt <= Date.now()) {
    socketSessions.delete(sid);
    return null;
  }
  session.expiresAt = Date.now() + SOCKET_SESSION_TTL_MS;
  return session;
}

function destroySocketSession(sid) {
  socketSessions.delete(sid);
}

function createEventPacket(eventName, payload) {
  const args = payload === undefined ? [eventName] : [eventName, payload];
  return `42${JSON.stringify(args)}`;
}

function enqueueEvent(session, eventName, payload) {
  session.queue.push(createEventPacket(eventName, payload));
}

function handleSocketEvent(session, eventName, payload) {
  const data = typeof payload === "string" ? safeJson(payload, {}) : (payload || {});
  if (eventName === "LoginGame") {
    const requestedUserId = Number(data.userid);
    if (!session.player || (Number.isFinite(requestedUserId) && requestedUserId !== session.player.id)) {
      enqueueEvent(session, "loginGameResult", {
        resultid: 0,
        error: "unauthorized_player"
      });
      return;
    }
    enqueueEvent(session, "loginGameResult", {
      resultid: 1,
      Obj: { nGamblingWinPool: JACKPOT_POOL }
    });
    return;
  }

  if (eventName === "LoginfreeCount") {
    const player = session.player;
    if (!player) {
      enqueueEvent(session, "LoginfreeCountResult", { ResultCode: 0, error: "unauthorized_player" });
      return;
    }
    enqueueEvent(session, "LoginfreeCountResult", {
      ResultCode: 1,
      freeCount: player.freeCount
    });
    return;
  }

  if (eventName === "lottery") {
    const player = session.player;
    if (!player) {
      enqueueEvent(session, "lotteryResult", { ResultCode: 0, error: "unauthorized_player" });
      return;
    }
    enqueueEvent(session, "lotteryResult", createLotteryResult(player, data));
    return;
  }

  if (eventName === "history") {
    const player = session.player;
    if (!player) {
      enqueueEvent(session, "historyResult", { ResultCode: 0, error: "unauthorized_player" });
      return;
    }
    enqueueEvent(session, "historyResult", { ResultCode: 1, Result: getRecentHistory(player.id, 20) });
    return;
  }

  if (eventName === "syncBalance") {
    const player = session.player;
    if (!player) {
      enqueueEvent(session, "syncBalanceResult", { ResultCode: 0, error: "unauthorized_player" });
      return;
    }
    enqueueEvent(session, "syncBalanceResult", { ResultCode: 1, Result: { balance: player.score } });
  }
}

function safeJson(value, fallback) {
  try {
    return JSON.parse(value);
  } catch (error) {
    return fallback;
  }
}

module.exports = {
  authLogin,
  createSocketSession,
  destroySocketSession,
  getSocketSession,
  getRuntimeStats,
  handleSocketEvent,
  resolvePlayerFromAuthInput
};

const fs = require("node:fs");
const path = require("node:path");
const { getDb } = require("./db");

const CONFIG_PATH = path.join(__dirname, "strategy-config.json");

const DEFAULT_STRATEGY_CONFIG = Object.freeze({
  rtpTarget: 0.92,
  rtpTolerance: 0.03,
  bigWinMultiplier: 20,
  maxWinMultiplier: 5000,
  baseForceWinChance: 0.18,
  baseNearMissChance: 0.24,
  newUserProtection: {
    enabled: true,
    spins: 10,
    minRtp: 1.05,
    forceWinChance: 0.58,
    firstSpinWinChance: 0.88,
    earlyWinChance: 0.62,
    midWinChance: 0.42,
    lateWinChance: 0.28,
    nearMissChance: 0.34,
    reliefAfterLosses: 2,
    cooldownAfterWins: 2,
    targetWinMultiplierMin: 0.8,
    targetWinMultiplierMax: 3.5,
    maxWinMultiplier: 6
  },
  lossRelief: {
    enabled: true,
    consecutiveLosses: 4,
    deficitBetMultiplier: 4,
    forceWinChance: 0.62,
    targetWinMultiplierMin: 1.2,
    targetWinMultiplierMax: 6
  },
  winCooling: {
    enabled: true,
    consecutiveWins: 3,
    surplusBetMultiplier: 6,
    forceLoseChance: 0.72,
    nearMissChance: 0.45
  },
  nearMiss: {
    enabled: true,
    chance: 0.28
  },
  // 下注分层策略(行业 Bet-Tier 做法):
  // 不同下注量级的玩家走不同的策略参数。
  // - 小注玩家:高频小奖,给梦想感
  // - 中注玩家:标准体验
  // - 大注玩家:低频高额,大奖体验,冷却更早防赢爆
  betTiers: {
    enabled: true,
    lowMaxBet: 50,    // totalBet ≤ 50 走 low
    midMaxBet: 500,   // 50 < totalBet ≤ 500 走 mid;> 500 走 high
    low: {
      forceWinChance: 0.32,         // 高于 base 的 0.18,小注高频中奖
      nearMissChance: 0.18,         // 低于 base
      targetWinMultiplierMin: 1.0,
      targetWinMultiplierMax: 5,    // 小注控制赢的额度
      surplusBetMultiplier: 8,      // 盈利 > 8 倍下注才冷却
      deficitBetMultiplier: 6,      // 亏损 > 6 倍下注才补偿
      bigWinBoost: 1.2              // 大奖触发权重
    },
    mid: {
      forceWinChance: 0.18,
      nearMissChance: 0.24,
      targetWinMultiplierMin: 1.0,
      targetWinMultiplierMax: 12,
      surplusBetMultiplier: 6,
      deficitBetMultiplier: 4,
      bigWinBoost: 1.0
    },
    high: {
      forceWinChance: 0.10,         // 大注低频
      nearMissChance: 0.40,         // 大注更多 near-miss(刮刮乐感)
      targetWinMultiplierMin: 1.5,
      targetWinMultiplierMax: 30,   // 大奖期望
      surplusBetMultiplier: 3,      // 大注更早冷却,防赢爆
      deficitBetMultiplier: 3,      // 大注更早补偿,留住 whale
      bigWinBoost: 1.5              // 大注更容易触发大奖
    }
  }
});

let strategyConfig = loadConfig();

function isPlainObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function mergeConfig(base, patch) {
  const output = { ...base };
  Object.entries(patch || {}).forEach(([key, value]) => {
    if (isPlainObject(value) && isPlainObject(base[key])) {
      output[key] = mergeConfig(base[key], value);
    } else if (value !== undefined) {
      output[key] = value;
    }
  });
  return output;
}

function clampNumber(value, fallback, min, max) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.min(max, Math.max(min, number));
}

function sanitizeConfig(config) {
  const merged = mergeConfig(DEFAULT_STRATEGY_CONFIG, config);
  return {
    ...merged,
    rtpTarget: clampNumber(merged.rtpTarget, DEFAULT_STRATEGY_CONFIG.rtpTarget, 0.5, 1.5),
    rtpTolerance: clampNumber(merged.rtpTolerance, DEFAULT_STRATEGY_CONFIG.rtpTolerance, 0, 0.3),
    bigWinMultiplier: clampNumber(merged.bigWinMultiplier, DEFAULT_STRATEGY_CONFIG.bigWinMultiplier, 1, 1000),
    maxWinMultiplier: clampNumber(merged.maxWinMultiplier, DEFAULT_STRATEGY_CONFIG.maxWinMultiplier, 10, 100000),
    baseForceWinChance: clampNumber(merged.baseForceWinChance, DEFAULT_STRATEGY_CONFIG.baseForceWinChance, 0, 1),
    baseNearMissChance: clampNumber(merged.baseNearMissChance, DEFAULT_STRATEGY_CONFIG.baseNearMissChance, 0, 1),
    newUserProtection: {
      ...merged.newUserProtection,
      spins: Math.round(clampNumber(merged.newUserProtection.spins, DEFAULT_STRATEGY_CONFIG.newUserProtection.spins, 0, 1000)),
      minRtp: clampNumber(merged.newUserProtection.minRtp, DEFAULT_STRATEGY_CONFIG.newUserProtection.minRtp, 0, 5),
      forceWinChance: clampNumber(merged.newUserProtection.forceWinChance, DEFAULT_STRATEGY_CONFIG.newUserProtection.forceWinChance, 0, 1),
      firstSpinWinChance: clampNumber(merged.newUserProtection.firstSpinWinChance, DEFAULT_STRATEGY_CONFIG.newUserProtection.firstSpinWinChance, 0, 1),
      earlyWinChance: clampNumber(merged.newUserProtection.earlyWinChance, DEFAULT_STRATEGY_CONFIG.newUserProtection.earlyWinChance, 0, 1),
      midWinChance: clampNumber(merged.newUserProtection.midWinChance, DEFAULT_STRATEGY_CONFIG.newUserProtection.midWinChance, 0, 1),
      lateWinChance: clampNumber(merged.newUserProtection.lateWinChance, DEFAULT_STRATEGY_CONFIG.newUserProtection.lateWinChance, 0, 1),
      nearMissChance: clampNumber(merged.newUserProtection.nearMissChance, DEFAULT_STRATEGY_CONFIG.newUserProtection.nearMissChance, 0, 1),
      reliefAfterLosses: Math.round(clampNumber(merged.newUserProtection.reliefAfterLosses, DEFAULT_STRATEGY_CONFIG.newUserProtection.reliefAfterLosses, 1, 1000)),
      cooldownAfterWins: Math.round(clampNumber(merged.newUserProtection.cooldownAfterWins, DEFAULT_STRATEGY_CONFIG.newUserProtection.cooldownAfterWins, 1, 1000)),
      targetWinMultiplierMin: clampNumber(merged.newUserProtection.targetWinMultiplierMin, DEFAULT_STRATEGY_CONFIG.newUserProtection.targetWinMultiplierMin, 0.1, 1000),
      targetWinMultiplierMax: clampNumber(merged.newUserProtection.targetWinMultiplierMax, DEFAULT_STRATEGY_CONFIG.newUserProtection.targetWinMultiplierMax, 0.1, 1000),
      maxWinMultiplier: clampNumber(merged.newUserProtection.maxWinMultiplier, DEFAULT_STRATEGY_CONFIG.newUserProtection.maxWinMultiplier, 1, 1000)
    },
    lossRelief: {
      ...merged.lossRelief,
      consecutiveLosses: Math.round(clampNumber(merged.lossRelief.consecutiveLosses, DEFAULT_STRATEGY_CONFIG.lossRelief.consecutiveLosses, 1, 1000)),
      deficitBetMultiplier: clampNumber(merged.lossRelief.deficitBetMultiplier, DEFAULT_STRATEGY_CONFIG.lossRelief.deficitBetMultiplier, 0, 1000),
      forceWinChance: clampNumber(merged.lossRelief.forceWinChance, DEFAULT_STRATEGY_CONFIG.lossRelief.forceWinChance, 0, 1),
      targetWinMultiplierMin: clampNumber(merged.lossRelief.targetWinMultiplierMin, DEFAULT_STRATEGY_CONFIG.lossRelief.targetWinMultiplierMin, 0.1, 1000),
      targetWinMultiplierMax: clampNumber(merged.lossRelief.targetWinMultiplierMax, DEFAULT_STRATEGY_CONFIG.lossRelief.targetWinMultiplierMax, 0.1, 1000)
    },
    winCooling: {
      ...merged.winCooling,
      consecutiveWins: Math.round(clampNumber(merged.winCooling.consecutiveWins, DEFAULT_STRATEGY_CONFIG.winCooling.consecutiveWins, 1, 1000)),
      surplusBetMultiplier: clampNumber(merged.winCooling.surplusBetMultiplier, DEFAULT_STRATEGY_CONFIG.winCooling.surplusBetMultiplier, 0, 1000),
      forceLoseChance: clampNumber(merged.winCooling.forceLoseChance, DEFAULT_STRATEGY_CONFIG.winCooling.forceLoseChance, 0, 1),
      nearMissChance: clampNumber(merged.winCooling.nearMissChance, DEFAULT_STRATEGY_CONFIG.winCooling.nearMissChance, 0, 1)
    },
    nearMiss: {
      ...merged.nearMiss,
      chance: clampNumber(merged.nearMiss.chance, DEFAULT_STRATEGY_CONFIG.nearMiss.chance, 0, 1)
    },
    betTiers: sanitizeBetTiers(merged.betTiers)
  };
}

function sanitizeTier(tier, defaults) {
  return {
    forceWinChance: clampNumber(tier.forceWinChance, defaults.forceWinChance, 0, 1),
    nearMissChance: clampNumber(tier.nearMissChance, defaults.nearMissChance, 0, 1),
    targetWinMultiplierMin: clampNumber(tier.targetWinMultiplierMin, defaults.targetWinMultiplierMin, 0.1, 1000),
    targetWinMultiplierMax: clampNumber(tier.targetWinMultiplierMax, defaults.targetWinMultiplierMax, 0.1, 1000),
    surplusBetMultiplier: clampNumber(tier.surplusBetMultiplier, defaults.surplusBetMultiplier, 0.5, 1000),
    deficitBetMultiplier: clampNumber(tier.deficitBetMultiplier, defaults.deficitBetMultiplier, 0.5, 1000),
    bigWinBoost: clampNumber(tier.bigWinBoost, defaults.bigWinBoost, 0.1, 10)
  };
}

function sanitizeBetTiers(tiers) {
  const defaults = DEFAULT_STRATEGY_CONFIG.betTiers;
  const merged = mergeConfig(defaults, tiers || {});
  const lowMax = clampNumber(merged.lowMaxBet, defaults.lowMaxBet, 1, 1_000_000);
  const midMax = Math.max(lowMax + 1, clampNumber(merged.midMaxBet, defaults.midMaxBet, 1, 1_000_000));
  return {
    enabled: merged.enabled !== false,
    lowMaxBet: lowMax,
    midMaxBet: midMax,
    low: sanitizeTier(merged.low, defaults.low),
    mid: sanitizeTier(merged.mid, defaults.mid),
    high: sanitizeTier(merged.high, defaults.high)
  };
}

function loadConfig() {
  try {
    const raw = fs.readFileSync(CONFIG_PATH, "utf8");
    return sanitizeConfig(JSON.parse(raw));
  } catch (error) {
    return sanitizeConfig(DEFAULT_STRATEGY_CONFIG);
  }
}

function saveConfig(config) {
  fs.writeFileSync(CONFIG_PATH, `${JSON.stringify(config, null, 2)}\n`);
}

function getStrategyConfig() {
  return strategyConfig;
}

// 给定 (商户, 游戏),返回实际生效策略
// 优先级:商户 × 游戏 override > 游戏 default > 全局 default
function getEffectiveStrategy(merchantId, gameId) {
  let base = strategyConfig;
  // 1. 游戏默认策略(如果游戏配置了)
  if (gameId) {
    try {
      const gameService = require("./gameService");
      const game = gameService.getGame(gameId);
      if (game && game.defaultStrategy) {
        base = sanitizeConfig(mergeConfig(strategyConfig, game.defaultStrategy));
      }
    } catch (error) { /* circular dep 容错 */ }
  }
  // 2. 商户 × 游戏 override
  if (merchantId && gameId) {
    try {
      const gameService = require("./gameService");
      const merchantStrategy = gameService.getMerchantGameStrategy(merchantId, gameId);
      if (merchantStrategy) {
        return sanitizeConfig(mergeConfig(base, merchantStrategy));
      }
    } catch (error) { /* circular dep 容错 */ }
  }
  return base;
}

// 把策略写到 (商户 × 游戏)
function setMerchantGameStrategyPatch(merchantId, gameId, patch, actorIp, actorUser) {
  const gameService = require("./gameService");
  const before = gameService.getMerchantGameStrategy(merchantId, gameId) || {};
  const base = strategyConfig;
  const game = gameService.getGame(gameId);
  const gameDefault = game && game.defaultStrategy ? game.defaultStrategy : {};
  // 深合并:全局 < 游戏默认 < 之前的 override < 新 patch
  const merged = sanitizeConfig(
    mergeConfig(mergeConfig(mergeConfig(base, gameDefault), before), patch)
  );
  gameService.setMerchantGameStrategy(merchantId, gameId, merged);
  writeAuditLog("merchant.game.strategy.update", patch, before, merged, actorIp, actorUser, merchantId, gameId);
  return merged;
}

// 改某个游戏的全平台默认策略(admin 用)
function setGameDefaultStrategy(gameId, patch, actorIp, actorUser) {
  const gameService = require("./gameService");
  const game = gameService.getGame(gameId);
  if (!game) throw new Error(`game ${gameId} not found`);
  const before = game.defaultStrategy || {};
  const merged = sanitizeConfig(mergeConfig(mergeConfig(strategyConfig, before), patch));
  gameService.updateGame(gameId, { defaultStrategy: merged });
  writeAuditLog("game.default_strategy.update", patch, before, merged, actorIp, actorUser, null, gameId);
  return merged;
}

function getClientStrategyConfig(merchantId, gameId) {
  const eff = (merchantId || gameId) ? getEffectiveStrategy(merchantId, gameId) : strategyConfig;
  return {
    bigWinMultiplier: eff.bigWinMultiplier,
    rtpTarget: eff.rtpTarget
  };
}

function writeAuditLog(action, patch, before, after, actorIp, actorUser, merchantId, gameId) {
  try {
    const db = getDb();
    db.prepare(
      `INSERT INTO admin_audit (action, patch, before, after, actor_ip, actor_user, merchant_id, game_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      action,
      JSON.stringify(patch || {}),
      JSON.stringify(before || {}),
      JSON.stringify(after || {}),
      actorIp || null,
      actorUser || null,
      merchantId || null,
      gameId || null
    );
  } catch (error) {
    console.warn("[audit] failed to write audit log:", error.message);
  }
}

function updateStrategyConfig(patch, actorIp, actorUser) {
  const before = strategyConfig;
  strategyConfig = sanitizeConfig(mergeConfig(strategyConfig, patch));
  saveConfig(strategyConfig);
  writeAuditLog("strategy.update", patch, before, strategyConfig, actorIp, actorUser);
  return strategyConfig;
}

function getAuditLog({ limit = 100, merchantId, gameId, action, actorUser } = {}) {
  const db = getDb();
  const where = [];
  const params = [];
  if (merchantId) { where.push("merchant_id = ?"); params.push(merchantId); }
  if (gameId) { where.push("game_id = ?"); params.push(gameId); }
  if (action) { where.push("action = ?"); params.push(action); }
  if (actorUser) { where.push("actor_user = ?"); params.push(actorUser); }
  const whereClause = where.length ? `WHERE ${where.join(" AND ")}` : "";
  const cap = Math.min(500, Math.max(1, Math.round(Number(limit) || 100)));
  const rows = db.prepare(
    `SELECT id, action, patch, before, after, actor_ip, actor_user, merchant_id, game_id, created_at
       FROM admin_audit ${whereClause}
       ORDER BY id DESC
       LIMIT ?`
  ).all(...params, cap);
  return rows.map((r) => ({
    id: r.id,
    action: r.action,
    patch: safeParse(r.patch),
    before: safeParse(r.before),
    after: safeParse(r.after),
    actorIp: r.actor_ip,
    actorUser: r.actor_user,
    merchantId: r.merchant_id,
    gameId: r.game_id,
    createdAt: r.created_at
  }));
}

function safeParse(value) {
  try { return JSON.parse(value); } catch (error) { return null; }
}

module.exports = {
  DEFAULT_STRATEGY_CONFIG,
  getClientStrategyConfig,
  getStrategyConfig,
  getEffectiveStrategy,
  setMerchantGameStrategyPatch,
  setGameDefaultStrategy,
  updateStrategyConfig,
  getAuditLog
};

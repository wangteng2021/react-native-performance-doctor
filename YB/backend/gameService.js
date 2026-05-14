// ============================================================================
// 游戏库 Service
// ----------------------------------------------------------------------------
// - games CRUD
// - merchant_games 白名单(决定商户能跑哪个游戏)
// - merchant_game_strategies 读写
// ============================================================================

const { getDb } = require("./db");

// ========== games CRUD ==========

function rowToGame(row) {
  if (!row) return null;
  return {
    id: row.id,
    gameId: row.game_id,
    name: row.name,
    type: row.type,
    status: row.status,
    assetUrl: row.asset_url,
    iconUrl: row.icon_url,
    description: row.description,
    defaultStrategy: row.default_strategy ? safeJson(row.default_strategy) : null,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function safeJson(s) {
  try { return JSON.parse(s); } catch (error) { return null; }
}

function listGames({ status } = {}) {
  const db = getDb();
  if (status) {
    return db.prepare(`SELECT * FROM games WHERE status = ? ORDER BY id`).all(status).map(rowToGame);
  }
  return db.prepare(`SELECT * FROM games ORDER BY id`).all().map(rowToGame);
}

function getGame(gameId) {
  const db = getDb();
  return rowToGame(db.prepare(`SELECT * FROM games WHERE game_id = ?`).get(gameId));
}

function createGame({ gameId, name, type = "video-slot", assetUrl, iconUrl = null, description = "" } = {}) {
  if (!gameId || !/^[a-z0-9_-]{2,64}$/.test(gameId)) {
    throw new Error("gameId 必须是 2-64 位小写字母数字下划线横杠");
  }
  if (!name || !assetUrl) throw new Error("name / assetUrl 必填");
  const db = getDb();
  const exists = db.prepare(`SELECT id FROM games WHERE game_id = ?`).get(gameId);
  if (exists) throw new Error("gameId 已存在");
  db.prepare(
    `INSERT INTO games (game_id, name, type, status, asset_url, icon_url, description)
     VALUES (?, ?, ?, 'active', ?, ?, ?)`
  ).run(gameId, name, type, assetUrl, iconUrl, description);
  return getGame(gameId);
}

function updateGame(gameId, patch = {}) {
  const db = getDb();
  const fields = [];
  const params = [];
  if (patch.name !== undefined) { fields.push("name = ?"); params.push(String(patch.name)); }
  if (patch.type !== undefined) { fields.push("type = ?"); params.push(String(patch.type)); }
  if (patch.status !== undefined) {
    if (!["active", "beta", "disabled"].includes(patch.status)) throw new Error("status 只能是 active/beta/disabled");
    fields.push("status = ?"); params.push(patch.status);
  }
  if (patch.assetUrl !== undefined) { fields.push("asset_url = ?"); params.push(String(patch.assetUrl)); }
  if (patch.iconUrl !== undefined) { fields.push("icon_url = ?"); params.push(patch.iconUrl ? String(patch.iconUrl) : null); }
  if (patch.description !== undefined) { fields.push("description = ?"); params.push(String(patch.description)); }
  if (patch.defaultStrategy !== undefined) {
    fields.push("default_strategy = ?");
    params.push(patch.defaultStrategy === null ? null : JSON.stringify(patch.defaultStrategy));
  }
  if (!fields.length) return getGame(gameId);
  fields.push("updated_at = datetime('now')");
  params.push(gameId);
  db.prepare(`UPDATE games SET ${fields.join(", ")} WHERE game_id = ?`).run(...params);
  return getGame(gameId);
}

// ========== 商户 × 游戏 白名单 ==========

function listMerchantGames(merchantId) {
  const db = getDb();
  return db.prepare(
    `SELECT mg.merchant_id, mg.game_id, mg.enabled, mg.created_at,
            g.name, g.type, g.status AS game_status, g.asset_url
       FROM merchant_games mg
       JOIN games g ON g.game_id = mg.game_id
       WHERE mg.merchant_id = ?
       ORDER BY g.id`
  ).all(merchantId).map((r) => ({
    merchantId: r.merchant_id,
    gameId: r.game_id,
    enabled: !!r.enabled,
    createdAt: r.created_at,
    game: { name: r.name, type: r.type, status: r.game_status, assetUrl: r.asset_url }
  }));
}

function setMerchantGame(merchantId, gameId, enabled) {
  const db = getDb();
  // 校验存在
  const game = getGame(gameId);
  if (!game) throw new Error(`game ${gameId} 不存在`);
  const e = enabled ? 1 : 0;
  db.prepare(
    `INSERT INTO merchant_games (merchant_id, game_id, enabled)
     VALUES (?, ?, ?)
     ON CONFLICT(merchant_id, game_id) DO UPDATE SET enabled = excluded.enabled`
  ).run(merchantId, gameId, e);
  return { merchantId, gameId, enabled: !!e };
}

// 检查某商户能不能玩某游戏
function isMerchantGameAllowed(merchantId, gameId) {
  if (!merchantId || !gameId) return false;
  const db = getDb();
  // 1. 游戏必须存在且 status active 或 beta
  const game = getGame(gameId);
  if (!game) return false;
  if (game.status === "disabled") return false;
  // 2. 商户必须 enabled 该游戏
  const row = db.prepare(
    `SELECT enabled FROM merchant_games WHERE merchant_id = ? AND game_id = ?`
  ).get(merchantId, gameId);
  if (!row) return false;
  return !!row.enabled;
}

// ========== 商户 × 游戏 策略 ==========

function getMerchantGameStrategy(merchantId, gameId) {
  if (!merchantId || !gameId) return null;
  const db = getDb();
  const row = db.prepare(
    `SELECT strategy_config FROM merchant_game_strategies WHERE merchant_id = ? AND game_id = ?`
  ).get(merchantId, gameId);
  if (!row) return null;
  return safeJson(row.strategy_config);
}

function setMerchantGameStrategy(merchantId, gameId, strategyObj) {
  const db = getDb();
  db.prepare(
    `INSERT INTO merchant_game_strategies (merchant_id, game_id, strategy_config, updated_at)
     VALUES (?, ?, ?, datetime('now'))
     ON CONFLICT(merchant_id, game_id) DO UPDATE
       SET strategy_config = excluded.strategy_config,
           updated_at = datetime('now')`
  ).run(merchantId, gameId, JSON.stringify(strategyObj || {}));
}

module.exports = {
  // games
  listGames,
  getGame,
  createGame,
  updateGame,
  // merchant × game 白名单
  listMerchantGames,
  setMerchantGame,
  isMerchantGameAllowed,
  // merchant × game 策略
  getMerchantGameStrategy,
  setMerchantGameStrategy
};

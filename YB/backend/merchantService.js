// ============================================================================
// 商户接入服务
// ----------------------------------------------------------------------------
// - 商户 CRUD
// - HMAC 签名校验(server-to-server 调 launch、流水查询时用)
// - launch token 生成 / 消费
// - 流水写入和查询
// ============================================================================

const crypto = require("node:crypto");
const { getDb } = require("./db");

const TOKEN_TTL_SECONDS = 5 * 60;          // launch token 有效期 5 分钟
const SIGNATURE_TTL_SECONDS = 5 * 60;      // 时间戳容差
const MAX_LIST_LIMIT = 500;

// ========== 工具 ==========

function randomId(prefix = "") {
  return `${prefix}${crypto.randomBytes(12).toString("hex")}`;
}

function timingSafeEqualHex(a, b) {
  if (typeof a !== "string" || typeof b !== "string") return false;
  if (a.length !== b.length) return false;
  try {
    return crypto.timingSafeEqual(Buffer.from(a, "hex"), Buffer.from(b, "hex"));
  } catch (error) {
    return false;
  }
}

function computeSignature(secret, payloadString, timestamp) {
  return crypto
    .createHmac("sha256", String(secret))
    .update(`${timestamp}.${payloadString}`)
    .digest("hex");
}

// 校验 server-to-server 请求的签名,timestamp 必须在 ±5 分钟内
// payloadString 是请求 body 的原始字符串
function verifyServerSignature(secret, payloadString, timestamp, signature) {
  const ts = Number(timestamp);
  if (!Number.isFinite(ts)) return false;
  const now = Date.now() / 1000;
  if (Math.abs(now - ts) > SIGNATURE_TTL_SECONDS) return false;
  const expected = computeSignature(secret, payloadString || "", ts);
  return timingSafeEqualHex(expected, String(signature || ""));
}

// ========== 商户 CRUD ==========

function listMerchants() {
  const db = getDb();
  // 不返回 secret 字段
  return db.prepare(
    `SELECT id, merchant_id, name, status, ip_whitelist, callback_url, created_at, updated_at
       FROM merchants
       ORDER BY id`
  ).all();
}

function getMerchant(merchantId) {
  const db = getDb();
  return db.prepare("SELECT * FROM merchants WHERE merchant_id = ?").get(merchantId);
}

function createMerchant({ merchantId, name, ipWhitelist = "", callbackUrl = "", strategySeed = null } = {}) {
  if (!merchantId || !/^[a-z0-9_-]{2,64}$/.test(merchantId)) {
    throw new Error("merchantId 必须是 2-64 位小写字母数字或下划线/横杠");
  }
  if (!name) throw new Error("name 不能为空");
  const db = getDb();
  const existing = db.prepare("SELECT id FROM merchants WHERE merchant_id = ?").get(merchantId);
  if (existing) throw new Error("merchantId 已存在");
  const secret = crypto.randomBytes(32).toString("hex");
  // 创建商户时,把当前全局默认策略 copy 一份当作初始
  const initialStrategy = strategySeed ? JSON.stringify(strategySeed) : null;
  db.prepare(
    `INSERT INTO merchants (merchant_id, name, secret, ip_whitelist, callback_url, strategy_config)
     VALUES (?, ?, ?, ?, ?, ?)`
  ).run(merchantId, name, secret, String(ipWhitelist || ""), String(callbackUrl || ""), initialStrategy);
  return { merchantId, name, secret, ipWhitelist, callbackUrl };
}

function updateMerchant(merchantId, patch = {}) {
  const db = getDb();
  const fields = [];
  const values = [];
  if (patch.name !== undefined) { fields.push("name = ?"); values.push(String(patch.name)); }
  if (patch.status !== undefined) {
    if (!["active", "disabled"].includes(patch.status)) throw new Error("status 只能是 active / disabled");
    fields.push("status = ?"); values.push(patch.status);
  }
  if (patch.ipWhitelist !== undefined) { fields.push("ip_whitelist = ?"); values.push(String(patch.ipWhitelist || "")); }
  if (patch.callbackUrl !== undefined) { fields.push("callback_url = ?"); values.push(String(patch.callbackUrl || "")); }
  if (fields.length === 0) return getMerchant(merchantId);
  fields.push("updated_at = datetime('now')");
  values.push(merchantId);
  db.prepare(`UPDATE merchants SET ${fields.join(", ")} WHERE merchant_id = ?`).run(...values);
  return getMerchant(merchantId);
}

function rotateSecret(merchantId) {
  const db = getDb();
  const secret = crypto.randomBytes(32).toString("hex");
  db.prepare(
    `UPDATE merchants SET secret = ?, updated_at = datetime('now') WHERE merchant_id = ?`
  ).run(secret, merchantId);
  return secret;
}

// 读商户独立策略配置(JSON);如果 null 表示沿用全局
function getMerchantStrategy(merchantId) {
  const db = getDb();
  const row = db.prepare("SELECT strategy_config FROM merchants WHERE merchant_id = ?").get(merchantId);
  if (!row || !row.strategy_config) return null;
  try { return JSON.parse(row.strategy_config); } catch (error) { return null; }
}

function setMerchantStrategy(merchantId, strategyObj) {
  const db = getDb();
  db.prepare(
    "UPDATE merchants SET strategy_config = ?, updated_at = datetime('now') WHERE merchant_id = ?"
  ).run(JSON.stringify(strategyObj || {}), merchantId);
}

function isIpAllowed(merchant, ip) {
  if (!merchant) return false;
  const list = String(merchant.ip_whitelist || "").trim();
  if (!list) return true;       // 空白名单 = 不限
  const allowed = list.split(",").map((x) => x.trim()).filter(Boolean);
  return allowed.includes(String(ip || ""));
}

// ========== Launch Token ==========

function createLaunchToken({ merchantId, externalUserId, gameId, payload = {} } = {}) {
  const db = getDb();
  const token = crypto.randomBytes(32).toString("hex");
  const expiresAt = new Date(Date.now() + TOKEN_TTL_SECONDS * 1000)
    .toISOString().replace("T", " ").slice(0, 19);
  db.prepare(
    `INSERT INTO launch_tokens (token, merchant_id, external_user_id, game_id, payload, expires_at)
     VALUES (?, ?, ?, ?, ?, ?)`
  ).run(token, merchantId, externalUserId, gameId || null, JSON.stringify(payload || {}), expiresAt);
  return { token, expiresAt };
}

// 消费 token:必须未过期、未消费过;成功返回 { merchantId, externalUserId, gameId, payload }
function consumeLaunchToken(token) {
  if (!token) return null;
  const db = getDb();
  const row = db.prepare(
    `SELECT token, merchant_id, external_user_id, game_id, payload, consumed_at, expires_at
       FROM launch_tokens
      WHERE token = ?`
  ).get(token);
  if (!row) return null;
  if (row.consumed_at) return null;
  if (row.expires_at < new Date().toISOString().replace("T", " ").slice(0, 19)) return null;
  db.prepare(
    `UPDATE launch_tokens SET consumed_at = datetime('now') WHERE token = ?`
  ).run(token);
  let payload = {};
  try { payload = JSON.parse(row.payload || "{}"); } catch (error) { /* ignore */ }
  return {
    merchantId: row.merchant_id,
    externalUserId: row.external_user_id,
    gameId: row.game_id,
    payload
  };
}

// ========== Transactions ==========

function recordTransaction({ txnId, merchantId, externalUserId, gameId, playerId, type, amount, balanceBefore, balanceAfter, roundId, meta }) {
  if (!txnId || !merchantId || !externalUserId || !type) return null;
  const db = getDb();
  try {
    db.prepare(
      `INSERT INTO transactions
        (txn_id, merchant_id, external_user_id, game_id, player_id, type, amount, balance_before, balance_after, round_id, meta)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      txnId, merchantId, externalUserId, gameId || null, playerId || null,
      type, amount, balanceBefore, balanceAfter,
      roundId || null, JSON.stringify(meta || {})
    );
    return true;
  } catch (error) {
    if (String(error.message).includes("UNIQUE")) return false;
    throw error;
  }
}

function listTransactions({ merchantId, externalUserId, gameId, type, from, to, limit = 100 } = {}) {
  const db = getDb();
  const where = [];
  const params = [];
  if (merchantId) { where.push("merchant_id = ?"); params.push(merchantId); }
  if (externalUserId) { where.push("external_user_id = ?"); params.push(externalUserId); }
  if (gameId) { where.push("game_id = ?"); params.push(gameId); }
  if (type) { where.push("type = ?"); params.push(type); }
  if (from) { where.push("created_at >= ?"); params.push(from); }
  if (to) { where.push("created_at < ?"); params.push(to); }
  const whereClause = where.length ? `WHERE ${where.join(" AND ")}` : "";
  const cap = Math.min(MAX_LIST_LIMIT, Math.max(1, Math.round(Number(limit) || 100)));
  return db.prepare(
    `SELECT id, txn_id, merchant_id, external_user_id, game_id, player_id, type, amount,
            balance_before, balance_after, round_id, meta, created_at
       FROM transactions ${whereClause}
       ORDER BY id DESC
       LIMIT ?`
  ).all(...params, cap).map((r) => ({
    ...r,
    meta: r.meta ? JSON.parse(r.meta) : {}
  }));
}

// 单个商户某天的简单聚合(对账用)
function getMerchantSummary({ merchantId, day, gameId }) {
  if (!merchantId) throw new Error("merchantId 必填");
  const db = getDb();
  const dayStart = day ? `${day} 00:00:00` : null;
  const dayEnd = day ? `${day} 23:59:59` : null;
  const where = ["merchant_id = ?"];
  const params = [merchantId];
  if (gameId) { where.push("game_id = ?"); params.push(gameId); }
  if (dayStart) { where.push("created_at >= ?"); params.push(dayStart); }
  if (dayEnd) { where.push("created_at <= ?"); params.push(dayEnd); }
  const whereClause = `WHERE ${where.join(" AND ")}`;
  const row = db.prepare(
    `SELECT
       SUM(CASE WHEN type='bet' THEN amount ELSE 0 END) AS total_bet,
       SUM(CASE WHEN type='win' THEN amount ELSE 0 END) AS total_win,
       SUM(CASE WHEN type='adjust' THEN amount ELSE 0 END) AS total_adjust,
       COUNT(*) AS txn_count,
       COUNT(DISTINCT external_user_id) AS user_count
     FROM transactions ${whereClause}`
  ).get(...params);
  const totalBet = row.total_bet || 0;
  const totalWin = row.total_win || 0;
  return {
    merchantId,
    day: day || "all-time",
    totalBet,
    totalWin,
    totalAdjust: row.total_adjust || 0,
    ggr: totalBet - totalWin,
    rtp: totalBet > 0 ? totalWin / totalBet : 0,
    txnCount: row.txn_count || 0,
    userCount: row.user_count || 0
  };
}

module.exports = {
  // 工具
  computeSignature,
  verifyServerSignature,
  randomId,
  isIpAllowed,
  // 商户 CRUD
  listMerchants,
  getMerchant,
  createMerchant,
  updateMerchant,
  rotateSecret,
  // 商户独立策略
  getMerchantStrategy,
  setMerchantStrategy,
  // launch token
  createLaunchToken,
  consumeLaunchToken,
  TOKEN_TTL_SECONDS,
  // transactions
  recordTransaction,
  listTransactions,
  getMerchantSummary
};

const crypto = require("node:crypto");
const { getDb } = require("./db");

const DEFAULT_PREFIX = "qa-test";
const MAX_BATCH_SIZE = 100;
const LIST_LIMIT = 500;

function normalizeSlug(value, fallback) {
  const normalized = String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
  return normalized || fallback;
}

function normalizeCount(value) {
  const count = Math.round(Number(value) || 1);
  return Math.min(MAX_BATCH_SIZE, Math.max(1, count));
}

function createCode(prefix) {
  const timestamp = Date.now().toString(36);
  const suffix = crypto.randomBytes(4).toString("hex");
  return `${prefix}-${timestamp}-${suffix}`;
}

// 给定 prefix,自动生成一个 externalUserId(让它跟 code 区分)
function deriveExternalUserId(code) {
  return `qa-${code}`;
}

function createPlayUrl(origin, code) {
  // /play 路由会把 code → launch_token → 跳到 /embed
  return `${origin}/play?code=${encodeURIComponent(code)}`;
}

function rowToEntry(row) {
  return {
    code: row.code,
    merchantId: row.merchant_id || null,
    externalUserId: row.external_user_id || null,
    gameId: row.game_id || null,
    scenario: row.scenario,
    note: row.note,
    createdAt: row.created_at,
    consumedAt: row.consumed_at || null,
    playUrl: row.play_url
  };
}

function generateTestCodes(options = {}, origin = "") {
  const db = getDb();
  const merchantId = options.merchantId ? normalizeSlug(options.merchantId, "") : null;
  const gameId = options.gameId ? String(options.gameId).trim() : null;
  if (!merchantId) throw new Error("merchantId 必填");
  if (!gameId) throw new Error("gameId 必填");
  // 校验 merchant 存在
  const merchant = db.prepare("SELECT merchant_id FROM merchants WHERE merchant_id = ?").get(merchantId);
  if (!merchant) throw new Error(`商户 ${merchantId} 不存在`);
  // 校验商户能玩这个游戏
  const game = db.prepare("SELECT game_id, status FROM games WHERE game_id = ?").get(gameId);
  if (!game) throw new Error(`游戏 ${gameId} 不存在`);
  const allowed = db.prepare(
    `SELECT enabled FROM merchant_games WHERE merchant_id = ? AND game_id = ?`
  ).get(merchantId, gameId);
  if (!allowed || !allowed.enabled) {
    throw new Error(`商户 ${merchantId} 没有启用游戏 ${gameId},请先在商户详情页"可用游戏"里开启`);
  }

  const count = normalizeCount(options.count);
  const prefix = normalizeSlug(options.prefix, DEFAULT_PREFIX);
  const scenario = normalizeSlug(options.scenario, "new-user-journey");
  const note = String(options.note || "").trim().slice(0, 200);

  const stmt = db.prepare(
    `INSERT INTO test_codes (code, prefix, scenario, note, play_url, merchant_id, external_user_id, game_id)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
  );
  const insertMany = db.transaction((entries) => {
    entries.forEach((entry) => {
      stmt.run(entry.code, entry.prefix, entry.scenario, entry.note, entry.playUrl, entry.merchantId, entry.externalUserId, entry.gameId);
    });
  });

  const codes = [];
  for (let index = 0; index < count; index += 1) {
    const code = createCode(prefix);
    const entry = {
      code,
      prefix,
      scenario,
      note,
      merchantId,
      gameId,
      externalUserId: deriveExternalUserId(code),
      createdAt: new Date().toISOString(),
      playUrl: createPlayUrl(origin, code)
    };
    codes.push(entry);
  }

  insertMany(codes);

  return {
    ok: true,
    count: codes.length,
    codes: codes.map(({ code, scenario: s, note: n, createdAt, playUrl, merchantId: mId, externalUserId, gameId: gId }) => ({
      code,
      scenario: s,
      note: n,
      createdAt,
      playUrl,
      merchantId: mId,
      externalUserId,
      gameId: gId
    }))
  };
}

function listTestCodes({ merchantId, gameId, limit } = {}) {
  const db = getDb();
  const cap = Math.min(LIST_LIMIT, Math.max(10, Math.round(Number(limit) || LIST_LIMIT)));
  const where = [];
  const params = [];
  if (merchantId) { where.push("merchant_id = ?"); params.push(merchantId); }
  if (gameId) { where.push("game_id = ?"); params.push(gameId); }
  const whereClause = where.length ? `WHERE ${where.join(" AND ")}` : "";
  const rows = db.prepare(
    `SELECT code, scenario, note, play_url, merchant_id, external_user_id, game_id, consumed_at, created_at
       FROM test_codes ${whereClause}
       ORDER BY id DESC
       LIMIT ?`
  ).all(...params, cap);
  return {
    ok: true,
    count: rows.length,
    codes: rows.map(rowToEntry)
  };
}

// 用 code 找到对应的商户 + externalUserId + gameId(供 /play 路由用)
function lookupTestCode(code) {
  if (!code) return null;
  const db = getDb();
  const row = db.prepare(
    `SELECT code, merchant_id, external_user_id, game_id, scenario, note
       FROM test_codes WHERE code = ?`
  ).get(code);
  if (!row) return null;
  return {
    code: row.code,
    merchantId: row.merchant_id,
    externalUserId: row.external_user_id,
    gameId: row.game_id,
    scenario: row.scenario,
    note: row.note
  };
}

function markTestCodeConsumed(code) {
  if (!code) return;
  const db = getDb();
  db.prepare(`UPDATE test_codes SET consumed_at = COALESCE(consumed_at, datetime('now')) WHERE code = ?`).run(code);
}

module.exports = {
  generateTestCodes,
  listTestCodes,
  lookupTestCode,
  markTestCodeConsumed
};

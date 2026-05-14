// ============================================================================
// 管理后台身份认证
// ----------------------------------------------------------------------------
// - 用 Node 原生 crypto.scrypt 做密码哈希(不引入 npm 依赖)
// - session 存在 admin_sessions 表,token 放 HttpOnly Secure cookie
// - 启动时用 env ADMIN_USERNAME / ADMIN_PASSWORD seed 默认管理员
// ============================================================================

const crypto = require("node:crypto");
const { getDb } = require("./db");

const SESSION_COOKIE_NAME = "yb_admin_session";
const SESSION_TTL_DAYS = 7;

// scrypt 参数(建议值)
const SCRYPT_N = 16384;
const SCRYPT_R = 8;
const SCRYPT_P = 1;
const SCRYPT_KEY_LEN = 64;
const SALT_BYTES = 16;

function hashPassword(plain) {
  const salt = crypto.randomBytes(SALT_BYTES);
  const derived = crypto.scryptSync(String(plain), salt, SCRYPT_KEY_LEN, {
    N: SCRYPT_N, r: SCRYPT_R, p: SCRYPT_P
  });
  return `scrypt$${SCRYPT_N}$${SCRYPT_R}$${SCRYPT_P}$${salt.toString("hex")}$${derived.toString("hex")}`;
}

function verifyPassword(plain, stored) {
  if (!stored || typeof stored !== "string") return false;
  const parts = stored.split("$");
  if (parts.length !== 6 || parts[0] !== "scrypt") return false;
  const [, N, r, p, saltHex, hashHex] = parts;
  try {
    const salt = Buffer.from(saltHex, "hex");
    const expected = Buffer.from(hashHex, "hex");
    const derived = crypto.scryptSync(String(plain), salt, expected.length, {
      N: Number(N), r: Number(r), p: Number(p)
    });
    return crypto.timingSafeEqual(derived, expected);
  } catch (error) {
    return false;
  }
}

// 启动时 seed:如果 admin_users 里没有这个用户名就创建;如果有且 SEED_FORCE_UPDATE=1 就更新密码
function ensureSeedAdmin(username, password, { forceUpdate = false } = {}) {
  if (!username || !password) return { seeded: false, reason: "no-credentials" };
  const db = getDb();
  const existing = db.prepare("SELECT id FROM admin_users WHERE username = ?").get(username);
  const hash = hashPassword(password);
  if (!existing) {
    db.prepare(
      `INSERT INTO admin_users (username, password_hash) VALUES (?, ?)`
    ).run(username, hash);
    return { seeded: true, action: "insert" };
  }
  if (forceUpdate) {
    db.prepare(
      `UPDATE admin_users SET password_hash = ?, updated_at = datetime('now') WHERE id = ?`
    ).run(hash, existing.id);
    return { seeded: true, action: "update" };
  }
  return { seeded: false, reason: "exists" };
}

function findUser(username) {
  const db = getDb();
  return db.prepare("SELECT id, username, password_hash FROM admin_users WHERE username = ?").get(username);
}

function createSession(username, { actorIp, userAgent } = {}) {
  const db = getDb();
  const token = crypto.randomBytes(32).toString("hex");
  const expiresAt = new Date(Date.now() + SESSION_TTL_DAYS * 86400 * 1000)
    .toISOString().replace("T", " ").slice(0, 19);
  db.prepare(
    `INSERT INTO admin_sessions (token, username, expires_at, actor_ip, user_agent)
     VALUES (?, ?, ?, ?, ?)`
  ).run(token, username, expiresAt, actorIp || null, (userAgent || "").slice(0, 200));
  return { token, expiresAt };
}

function getSession(token) {
  if (!token) return null;
  const db = getDb();
  return db.prepare(
    `SELECT token, username, created_at, expires_at
       FROM admin_sessions
      WHERE token = ?
        AND expires_at > datetime('now')`
  ).get(token) || null;
}

function destroySession(token) {
  if (!token) return;
  const db = getDb();
  db.prepare("DELETE FROM admin_sessions WHERE token = ?").run(token);
}

function parseCookieHeader(header) {
  const result = {};
  if (!header) return result;
  header.split(";").forEach((part) => {
    const idx = part.indexOf("=");
    if (idx < 0) return;
    const key = part.slice(0, idx).trim();
    const value = part.slice(idx + 1).trim();
    if (key) result[key] = decodeURIComponent(value);
  });
  return result;
}

function readSessionTokenFromRequest(request) {
  const cookies = parseCookieHeader(request.headers.cookie);
  return cookies[SESSION_COOKIE_NAME] || null;
}

// 给 response 写 set-cookie
function buildSetCookie(token, expiresAt, { secure = true } = {}) {
  const maxAge = SESSION_TTL_DAYS * 86400;
  const parts = [
    `${SESSION_COOKIE_NAME}=${encodeURIComponent(token)}`,
    `Path=/`,
    `HttpOnly`,
    `SameSite=Lax`,
    `Max-Age=${maxAge}`
  ];
  if (secure) parts.push("Secure");
  if (expiresAt) parts.push(`Expires=${new Date(expiresAt + " UTC").toUTCString()}`);
  return parts.join("; ");
}

function buildClearCookie({ secure = true } = {}) {
  const parts = [
    `${SESSION_COOKIE_NAME}=`,
    `Path=/`,
    `HttpOnly`,
    `SameSite=Lax`,
    `Max-Age=0`
  ];
  if (secure) parts.push("Secure");
  return parts.join("; ");
}

// Express-like 中间件式接口,但这个项目没用 Express,直接 http.createServer
// 所以暴露一个函数给 server.js 用
function getAdminSession(request) {
  const token = readSessionTokenFromRequest(request);
  const session = getSession(token);
  return session ? { token, username: session.username, expiresAt: session.expires_at } : null;
}

module.exports = {
  SESSION_COOKIE_NAME,
  SESSION_TTL_DAYS,
  hashPassword,
  verifyPassword,
  ensureSeedAdmin,
  findUser,
  createSession,
  getSession,
  destroySession,
  readSessionTokenFromRequest,
  buildSetCookie,
  buildClearCookie,
  getAdminSession
};

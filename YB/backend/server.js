const http = require("node:http");
const path = require("node:path");
const fs = require("node:fs");
const crypto = require("node:crypto");
const db = require("./db");
db.init();
const { getGameConfig, spin } = require("./gameEngine");
const {
  authLogin,
  createSocketSession,
  getSocketSession,
  getRuntimeStats,
  handleSocketEvent,
  resolvePlayerFromAuthInput
} = require("./pinataLocalService");
const {
  getClientStrategyConfig,
  getStrategyConfig,
  getEffectiveStrategy,
  setMerchantGameStrategyPatch,
  setGameDefaultStrategy,
  updateStrategyConfig,
  getAuditLog
} = require("./gameStrategyConfig");
const { generateTestCodes, listTestCodes, lookupTestCode, markTestCodeConsumed } = require("./testCodeService");
const gameService = require("./gameService");
const {
  ensureSeedAdmin,
  findUser,
  verifyPassword,
  createSession,
  destroySession,
  readSessionTokenFromRequest,
  buildSetCookie,
  buildClearCookie,
  getAdminSession
} = require("./adminAuth");
const merchantService = require("./merchantService");

// 启动时 seed 默认管理员:读 env ADMIN_USERNAME / ADMIN_PASSWORD
// ADMIN_FORCE_RESET=1 会强制把密码重置成 env 里的(用于忘记密码)
const SEED_USERNAME = process.env.ADMIN_USERNAME || "admin";
const SEED_PASSWORD = process.env.ADMIN_PASSWORD || null;
if (SEED_PASSWORD) {
  const seed = ensureSeedAdmin(SEED_USERNAME, SEED_PASSWORD, {
    forceUpdate: process.env.ADMIN_FORCE_RESET === "1"
  });
  if (seed.seeded) {
    console.log(`[auth] admin user "${SEED_USERNAME}" ${seed.action}ed`);
  }
} else {
  console.warn("[auth] ADMIN_PASSWORD not set — 管理后台无法登录,记得在 ecosystem.config.js 里配置");
}

const PORT = Number(process.env.PORT) || 3000;
const EMBED_SESSION_SECRET = process.env.EMBED_SESSION_SECRET
  || process.env.ADMIN_PASSWORD
  || crypto.randomBytes(32).toString("hex");
if (!process.env.EMBED_SESSION_SECRET) {
  console.warn("[security] EMBED_SESSION_SECRET not set; using process-local fallback. Set it in production for stable embed sessions.");
}
const EMBED_SESSION_MAX_AGE_SECONDS = 86400;
// 多 repo 部署:推荐目录布局 /www/wwwroot/wtns/{server,admin,official,games/<gameId>},
// 默认值就是这个相对结构(__dirname 是 server/backend,..往上一级再分别找 sibling repo)。
// 部署目录不一致时通过下面 3 个 env 覆盖。
const PROJECT_ROOT = path.join(__dirname, "..", ".."); // /www/wwwroot/wtns
const ADMIN_DIR = process.env.WTNS_ADMIN_DIR
  || path.join(PROJECT_ROOT, "admin");
const OFFICIAL_DIR = process.env.WTNS_OFFICIAL_DIR
  || path.join(PROJECT_ROOT, "official");
const GAMES_ROOT = process.env.WTNS_GAMES_ROOT
  || path.join(PROJECT_ROOT, "games");
// 兼容老 monorepo 布局(YB/{frontend,admin,backend}):若新目录都不存在,fallback 回旧的 frontend/、../admin
function resolveLegacyOrNew() {
  const fs = require("fs");
  const legacyFrontend = path.join(__dirname, "..", "frontend");
  const legacyAdmin = path.join(__dirname, "..", "admin");
  // 优先用新结构;若新结构都没有(开发者还在老 monorepo),回退
  const useLegacy = !fs.existsSync(OFFICIAL_DIR) && fs.existsSync(legacyFrontend);
  return {
    OFFICIAL_DIR_RESOLVED: useLegacy ? legacyFrontend : OFFICIAL_DIR,
    ADMIN_DIR_RESOLVED: fs.existsSync(ADMIN_DIR) ? ADMIN_DIR : legacyAdmin,
    GAMES_ROOT_RESOLVED: useLegacy ? legacyFrontend : GAMES_ROOT,
    legacyMode: useLegacy
  };
}
const _paths = resolveLegacyOrNew();
const RUNTIME_OFFICIAL_DIR = _paths.OFFICIAL_DIR_RESOLVED;
const RUNTIME_ADMIN_DIR = _paths.ADMIN_DIR_RESOLVED;
const RUNTIME_GAMES_ROOT = _paths.GAMES_ROOT_RESOLVED;

// CORS 白名单。
// 通过环境变量 CORS_ALLOWED_ORIGINS 配置,逗号分隔多个 origin。
// 例:CORS_ALLOWED_ORIGINS="https://your-domain.com,https://admin.your-domain.com"
// 不设置或设置为 "*" 时表示放开所有来源(仅限本地开发)。
const CORS_ALLOWED_ORIGINS = (process.env.CORS_ALLOWED_ORIGINS || "*")
  .split(",")
  .map((value) => value.trim())
  .filter(Boolean);
const CORS_WILDCARD = CORS_ALLOWED_ORIGINS.includes("*");

function resolveAllowedOrigin(request) {
  if (CORS_WILDCARD) return "*";
  const origin = request.headers.origin;
  if (origin && CORS_ALLOWED_ORIGINS.includes(origin)) return origin;
  return null;
}

function setupCors(request, response) {
  response._corsOrigin = resolveAllowedOrigin(request);
}

// 静态资源缓存策略:
// - admin/ 下所有文件 → 不缓存(管理后台不带 hash,改了就要立即生效)
// - 带 hash 的文件(如 main.8a7aa.js)→ 1 年长缓存 + immutable
// - .html 入口文件 → 不缓存,每次校验
// - 其他静态文件 → 1 天缓存
function getCacheControl(filePath) {
  const basename = path.basename(filePath);
  // admin/ 路径下永不缓存(用 path.sep 兼容跨平台)
  if (filePath.includes(`${path.sep}admin${path.sep}`) || filePath.endsWith(`${path.sep}admin`)) {
    return "no-cache";
  }
  if (/\.[a-f0-9]{5,12}\.\w+$/i.test(basename)) {
    return "public, max-age=31536000, immutable";
  }
  if (filePath.endsWith(".html")) {
    return "no-cache";
  }
  return "public, max-age=86400";
}

const mimeTypes = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".webp": "image/webp",
  ".ico": "image/x-icon",
  ".mp3": "audio/mpeg",
  ".ogg": "audio/ogg",
  ".m4a": "audio/mp4",
  ".js": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml; charset=utf-8"
};

function buildCorsHeaders(response) {
  const headers = {
    "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Vary": "Origin"
  };
  if (response._corsOrigin) {
    headers["Access-Control-Allow-Origin"] = response._corsOrigin;
  }
  return headers;
}

function sendJson(response, statusCode, payload, extraHeaders = null) {
  const headers = {
    "Content-Type": "application/json; charset=utf-8",
    ...buildCorsHeaders(response)
  };
  if (extraHeaders) Object.assign(headers, extraHeaders);
  response.writeHead(statusCode, headers);
  response.end(JSON.stringify(payload));
}

function getClientIp(request) {
  return request.headers["x-real-ip"]
    || (request.headers["x-forwarded-for"] || "").split(",")[0].trim()
    || request.socket.remoteAddress
    || null;
}

function isHttps(request) {
  return request.headers["x-forwarded-proto"] === "https";
}

// 把 game.asset_url(例 "/pinatawins/index.html")映射成 path 第一段("pinatawins")
function deriveAssetPrefix(game) {
  if (!game || !game.assetUrl) return null;
  const parts = String(game.assetUrl).split("/").filter(Boolean);
  return parts.length ? parts[0] : null;
}

// 判断一个 url path 是否落在某个游戏的 asset 目录里(必须有 cookie 才能访问)
// 排除掉:/admin/、/api/、/socket.io/、/embed、/play 这些已经有自己语义的路径
const RESERVED_PUBLIC_PATHS = ["admin", "api", "socket.io", "embed", "play", "authLogin", "lottery"];
let _gameAssetPrefixesCache = null;
let _gameAssetPrefixesCacheAt = 0;
function isGameAssetPath(pathname) {
  if (!pathname || pathname === "/") return false;
  const first = pathname.split("/").filter(Boolean)[0];
  if (!first) return false;
  if (RESERVED_PUBLIC_PATHS.includes(first)) return false;
  // 缓存 30s,避免每次请求都打 db
  const now = Date.now();
  if (!_gameAssetPrefixesCache || now - _gameAssetPrefixesCacheAt > 30_000) {
    try {
      const all = gameService.listGames();
      _gameAssetPrefixesCache = new Set(
        all.map(deriveAssetPrefix).filter(Boolean)
      );
      _gameAssetPrefixesCacheAt = now;
    } catch (error) {
      _gameAssetPrefixesCache = new Set(["pinata-fiesta-wins", "fishstar"]); // 兜底
      _gameAssetPrefixesCacheAt = now;
    }
  }
  return _gameAssetPrefixesCache.has(first);
}

// 给 /play?code=xxx 在桌面浏览器渲染的"手机框 + iframe" 预览页
// 在手机浏览器里也用同一个页面,只是手机框 100vw 100vh 看起来就是全屏
function renderPlayFrame({ code, merchantId, gameId, externalUserId }) {
  const esc = (s) => String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  const innerUrl = `/play?code=${encodeURIComponent(code)}&raw=1`;
  return `<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>QA 测试 · ${esc(code)} · WTNS Gaming</title>
<style>
  :root {
    --bg: #0a0d14;
    --panel: rgba(20,26,42,0.7);
    --border: rgba(255,255,255,0.1);
    --text: #e8ecf4;
    --muted: #94a3b8;
    --accent: #67e8f9;
    --accent-2: #a78bfa;
    --device-w: 390px;
    --device-h: 844px;
  }
  * { box-sizing: border-box; }
  html, body { margin: 0; padding: 0; background: var(--bg); color: var(--text);
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", sans-serif;
    -webkit-font-smoothing: antialiased; }
  body {
    min-height: 100vh;
    display: flex; flex-direction: column; align-items: center;
    background:
      radial-gradient(900px 500px at 80% -10%, rgba(103,232,249,0.05), transparent 60%),
      radial-gradient(700px 400px at 10% 120%, rgba(167,139,250,0.05), transparent 60%),
      var(--bg);
  }

  /* === Topbar(桌面才显示)=== */
  .topbar {
    width: 100%; max-width: 1100px;
    padding: 14px 22px;
    display: flex; align-items: center; justify-content: space-between;
    gap: 16px; flex-wrap: wrap;
  }
  .brand { display: inline-flex; align-items: center; gap: 10px; font-weight: 700; font-size: 15px; }
  .brand-logo {
    width: 26px; height: 26px; border-radius: 7px;
    display: grid; place-items: center;
    background: linear-gradient(135deg, var(--accent) 0%, var(--accent-2) 100%);
    color: #0a0d14; font-weight: 900;
  }
  .meta {
    display: flex; gap: 14px; flex-wrap: wrap; align-items: center;
    font-size: 12px; color: var(--muted);
  }
  .meta code {
    font-family: "SF Mono", Menlo, Consolas, monospace;
    background: rgba(103,232,249,0.08); color: #bef8ff;
    padding: 3px 8px; border-radius: 5px; font-size: 11px;
  }
  .meta strong { color: var(--text); }
  .toolbar { display: flex; gap: 8px; }
  .btn {
    background: rgba(255,255,255,0.04);
    border: 1px solid var(--border);
    color: var(--text);
    padding: 6px 12px; border-radius: 8px;
    font-size: 12px; cursor: pointer;
    transition: all 0.15s;
  }
  .btn:hover { background: rgba(255,255,255,0.08); border-color: rgba(255,255,255,0.25); }
  .btn-primary {
    background: rgba(103,232,249,0.12);
    border-color: rgba(103,232,249,0.3);
    color: #bef8ff;
  }
  .btn-primary:hover { background: rgba(103,232,249,0.22); }

  /* === 手机框 === */
  .stage {
    flex: 1; width: 100%;
    display: flex; align-items: flex-start; justify-content: center;
    padding: 0 16px 32px;
  }
  .device {
    width: var(--device-w);
    height: var(--device-h);
    max-height: calc(100vh - 110px);
    aspect-ratio: 390 / 844;
    background: #000;
    border-radius: 38px;
    padding: 9px;
    position: relative;
    box-shadow:
      0 0 0 1.5px rgba(255,255,255,0.1),
      0 30px 90px -20px rgba(103,232,249,0.25),
      0 60px 120px -30px rgba(167,139,250,0.18);
  }
  .device::before {
    /* 顶部 dynamic island */
    content: "";
    position: absolute;
    top: 14px; left: 50%; transform: translateX(-50%);
    width: 110px; height: 28px;
    background: #000;
    border-radius: 18px;
    z-index: 5;
  }
  .device-screen {
    width: 100%; height: 100%;
    border-radius: 30px;
    overflow: hidden;
    background: #000;
    position: relative;
  }
  .device-screen iframe {
    width: 100%; height: 100%;
    border: 0; display: block;
    background: #000;
  }
  .device-frame-hint {
    /* 在桌面提示设备尺寸 */
    position: absolute;
    top: -28px; left: 50%; transform: translateX(-50%);
    font-size: 11px; color: var(--muted);
    font-family: "SF Mono", Menlo, monospace;
    letter-spacing: 0.05em;
    white-space: nowrap;
  }

  /* === Footer 提示 === */
  .footnote {
    width: 100%; max-width: 700px;
    text-align: center;
    color: var(--muted); font-size: 12px;
    padding: 16px;
    line-height: 1.6;
  }
  .footnote a { color: var(--accent); text-decoration: none; }
  .footnote a:hover { text-decoration: underline; }

  /* === 移动端:框 100% 占满,藏掉桌面边框装饰 === */
  @media (max-width: 600px) {
    body { background: #000; }
    .topbar, .footnote { display: none; }
    .stage { padding: 0; }
    .device {
      width: 100vw; height: 100vh; max-height: none;
      border-radius: 0; padding: 0;
      box-shadow: none;
    }
    .device::before { display: none; }
    .device-screen { border-radius: 0; }
    .device-frame-hint { display: none; }
  }
</style>
</head>
<body>
  <header class="topbar">
    <div class="brand">
      <span class="brand-logo">◆</span>
      <span>WTNS Gaming · QA Preview</span>
    </div>
    <div class="meta">
      <span><strong>Code</strong> <code>${esc(code)}</code></span>
      <span><strong>Merchant</strong> <code>${esc(merchantId)}</code></span>
      <span><strong>Game</strong> <code>${esc(gameId)}</code></span>
      <span><strong>User</strong> <code>${esc(externalUserId)}</code></span>
    </div>
    <div class="toolbar">
      <button class="btn" id="btnReload" title="重新载入 iframe(token 已被消费,刷一次会生成新 token)">↻ 重载</button>
      <button class="btn" id="btnCopy" title="复制原始 raw 链接">复制 raw 链接</button>
      <a class="btn btn-primary" id="btnOpenRaw" href="${esc(innerUrl)}" target="_blank" rel="noreferrer">新窗口打开 ↗</a>
    </div>
  </header>

  <section class="stage">
    <div class="device">
      <span class="device-frame-hint">390 × 844 · iPhone 16 Pro</span>
      <div class="device-screen">
        <iframe id="gameFrame"
          src="${esc(innerUrl)}"
          allow="autoplay; fullscreen; clipboard-read; clipboard-write"
          allowfullscreen></iframe>
      </div>
    </div>
  </section>

  <p class="footnote">
    iframe 内部走标准 launch token 流程(<code>/play?raw=1</code> → <code>/embed</code> → game)。
    手机访问本页面会自动占满全屏。
    <br>需要在 native webview 集成?用商户 launch API 拿 gameUrl,不要直接用这个 QA 链接。
  </p>

  <script>
    document.getElementById("btnReload").addEventListener("click", () => {
      const f = document.getElementById("gameFrame");
      f.src = f.src.split("#")[0] + "#" + Date.now();
      setTimeout(() => { f.src = ${JSON.stringify(innerUrl)} + "&t=" + Date.now(); }, 30);
    });
    document.getElementById("btnCopy").addEventListener("click", async (e) => {
      const url = window.location.origin + ${JSON.stringify(innerUrl)};
      try {
        await navigator.clipboard.writeText(url);
        const btn = e.currentTarget;
        const old = btn.textContent;
        btn.textContent = "已复制 ✓";
        setTimeout(() => { btn.textContent = old; }, 1500);
      } catch (err) { window.prompt("复制这个链接:", url); }
    });
  </script>
</body>
</html>`;
}

function parseCookieHeader(header) {
  const result = {};
  if (!header) return result;
  header.split(";").forEach((part) => {
    const idx = part.indexOf("=");
    if (idx < 0) return;
    const key = part.slice(0, idx).trim();
    const value = part.slice(idx + 1).trim();
    if (key) result[key] = value;
  });
  return result;
}

function toBase64Url(value) {
  return Buffer.from(value).toString("base64url");
}

function fromBase64Url(value) {
  return Buffer.from(String(value), "base64url").toString("utf8");
}

function signEmbedPayload(encodedPayload) {
  return crypto.createHmac("sha256", EMBED_SESSION_SECRET).update(encodedPayload).digest("base64url");
}

function encodeEmbedSession(session) {
  const payload = toBase64Url(JSON.stringify({
    ...session,
    exp: Date.now() + EMBED_SESSION_MAX_AGE_SECONDS * 1000
  }));
  return `${payload}.${signEmbedPayload(payload)}`;
}

function verifyEmbedSessionToken(token) {
  if (!token || !String(token).includes(".")) return null;
  const [payload, signature] = String(token).split(".");
  const expected = signEmbedPayload(payload);
  const givenBuffer = Buffer.from(signature || "", "base64url");
  const expectedBuffer = Buffer.from(expected, "base64url");
  if (givenBuffer.length !== expectedBuffer.length || !crypto.timingSafeEqual(givenBuffer, expectedBuffer)) return null;
  try {
    const session = JSON.parse(fromBase64Url(payload));
    if (!session || !session.merchantId || !session.externalUserId || !session.gameId) return null;
    if (!Number.isFinite(Number(session.exp)) || Number(session.exp) < Date.now()) return null;
    return session;
  } catch (error) {
    return null;
  }
}

function readEmbedSession(request) {
  const cookies = parseCookieHeader(request.headers.cookie || "");
  if (!cookies.yb_embed_session) return null;
  try {
    return verifyEmbedSessionToken(decodeURIComponent(cookies.yb_embed_session));
  } catch (error) {
    return null;
  }
}

function buildEmbedSessionCookie(session, request) {
  return `yb_embed_session=${encodeURIComponent(encodeEmbedSession(session))}; Path=/; Max-Age=${EMBED_SESSION_MAX_AGE_SECONDS}; HttpOnly; SameSite=Lax${isHttps(request) ? "; Secure" : ""}`;
}

function authInputFromEmbedSession(session) {
  return {
    merchantId: session.merchantId,
    externalUserId: session.externalUserId,
    gameId: session.gameId || null,
    payload: session.payload || {}
  };
}

function requireAdminSession(request, response) {
  const session = getAdminSession(request);
  if (!session) {
    sendJson(response, 401, { error: "unauthorized" });
    return null;
  }
  return session;
}

function sendText(response, statusCode, body, contentType = "text/plain; charset=utf-8") {
  response.writeHead(statusCode, {
    "Content-Type": contentType,
    ...buildCorsHeaders(response),
    "Cache-Control": "no-store, no-cache, must-revalidate, proxy-revalidate",
    "Pragma": "no-cache",
    "Expires": "0"
  });
  response.end(body);
}

function readBody(request) {
  return new Promise((resolve, reject) => {
    let body = "";
    request.on("data", (chunk) => {
      body += chunk;
      if (body.length > 1_000_000) {
        request.destroy();
        reject(new Error("Request body too large"));
      }
    });
    request.on("end", () => resolve(body));
    request.on("error", reject);
  });
}

function serveStaticFrom(rootDir, request, response, routePrefix = "") {
  const url = new URL(request.url, `http://${request.headers.host}`);
  const rawPath = routePrefix && url.pathname.startsWith(routePrefix)
    ? url.pathname.slice(routePrefix.length)
    : url.pathname;
  const requestedPath = rawPath.endsWith("/") || rawPath === "" ? `${rawPath}index.html` : rawPath;
  const filePath = path.normalize(path.join(rootDir, requestedPath));

  if (!filePath.startsWith(rootDir)) {
    response.writeHead(403);
    response.end("Forbidden");
    return;
  }

  fs.readFile(filePath, (error, content) => {
    if (error) {
      console.warn(`[404] ${requestedPath}`);
      response.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
      response.end("Not found");
      return;
    }

    const extension = path.extname(filePath);
    response.writeHead(200, {
      "Content-Type": mimeTypes[extension] || "application/octet-stream",
      "Cache-Control": getCacheControl(filePath)
    });
    response.end(content);
  });
}

// 官网 landing(默认 /、/site.css、/site.js、/favicon.ico 等顶级文件)
function serveOfficial(request, response) {
  serveStaticFrom(RUNTIME_OFFICIAL_DIR, request, response);
}

// 游戏资源(GAMES_ROOT/<game-id>/...)
function serveGameAsset(request, response) {
  serveStaticFrom(RUNTIME_GAMES_ROOT, request, response);
}

function serveAdmin(request, response) {
  serveStaticFrom(RUNTIME_ADMIN_DIR, request, response, "/admin");
}

function encodeEnginePayload(packets) {
  if (!packets.length) return "1:6";
  return packets.map((packet) => `${packet.length}:${packet}`).join("");
}

function flushSocketPoll(session) {
  if (!session.pendingPoll || !session.queue.length) return;
  const { response, timeout } = session.pendingPoll;
  session.pendingPoll = null;
  clearTimeout(timeout);
  if (!response.writableEnded) {
    const packets = session.queue.splice(0, session.queue.length);
    sendText(response, 200, encodeEnginePayload(packets), "text/plain; charset=utf-8");
  }
}

function decodeEnginePayload(body) {
  const packets = [];
  let cursor = 0;
  while (cursor < body.length) {
    let lengthText = "";
    while (cursor < body.length && body[cursor] !== ":") {
      lengthText += body[cursor];
      cursor += 1;
    }
    if (!lengthText || body[cursor] !== ":") break;
    cursor += 1;
    const length = Number(lengthText);
    if (!Number.isFinite(length)) break;
    packets.push(body.slice(cursor, cursor + length));
    cursor += length;
  }
  return packets.length ? packets : (body ? [body] : []);
}

function parseSocketEvent(packet) {
  if (!packet.startsWith("42")) return null;
  try {
    const data = JSON.parse(packet.slice(2));
    return { eventName: data[0], payload: data[1] };
  } catch (error) {
    return null;
  }
}

async function handleSocketIo(request, response, url) {
  if (url.searchParams.get("transport") !== "polling") {
    sendText(response, 400, "Only polling transport is supported locally");
    return;
  }

  if (request.method === "GET" && !url.searchParams.get("sid")) {
    const embedSession = readEmbedSession(request);
    if (!embedSession) {
      sendText(response, 401, "Missing or invalid launch session");
      return;
    }
    const player = resolvePlayerFromAuthInput(authInputFromEmbedSession(embedSession));
    const session = createSocketSession(player);
    const openPacket = `0${JSON.stringify({
      sid: session.sid,
      upgrades: [],
      pingInterval: 25000,
      pingTimeout: 60000
    })}`;
    sendText(response, 200, encodeEnginePayload([openPacket]), "text/plain; charset=utf-8");
    return;
  }

  const session = getSocketSession(url.searchParams.get("sid"));
  if (!session) {
    sendText(response, 400, "Unknown Socket.IO session");
    return;
  }

  if (request.method === "POST") {
    const body = await readBody(request);
    decodeEnginePayload(body).forEach((packet) => {
      if (packet === "2") session.queue.push("3");
      if (packet === "40") session.queue.push("40");
      const socketEvent = parseSocketEvent(packet);
      if (socketEvent) handleSocketEvent(session, socketEvent.eventName, socketEvent.payload);
    });
    flushSocketPoll(session);
    sendText(response, 200, "2:40", "text/plain; charset=utf-8");
    return;
  }

  if (request.method === "GET") {
    if (session.queue.length) {
      const packets = session.queue.splice(0, session.queue.length);
      sendText(response, 200, encodeEnginePayload(packets), "text/plain; charset=utf-8");
      return;
    }

    if (session.pendingPoll && !session.pendingPoll.response.writableEnded) {
      sendText(session.pendingPoll.response, 200, encodeEnginePayload(["6"]), "text/plain; charset=utf-8");
      clearTimeout(session.pendingPoll.timeout);
    }

    const timeout = setTimeout(() => {
      if (session.pendingPoll && session.pendingPoll.response === response) {
        session.pendingPoll = null;
        if (!response.writableEnded) {
          sendText(response, 200, encodeEnginePayload(["6"]), "text/plain; charset=utf-8");
        }
      }
    }, 20000);

    session.pendingPoll = { response, timeout };
    request.on("close", () => {
      if (session.pendingPoll && session.pendingPoll.response === response) {
        clearTimeout(timeout);
        session.pendingPoll = null;
      }
    });
    return;
  }

  sendText(response, 405, "Method not allowed");
}

const server = http.createServer(async (request, response) => {
  setupCors(request, response);

  if (request.method === "OPTIONS") {
    sendJson(response, 204, {});
    return;
  }

  const url = new URL(request.url, `http://${request.headers.host}`);

  try {
    if (url.pathname.startsWith("/socket.io/")) {
      await handleSocketIo(request, response, url);
      return;
    }

    if ((request.method === "POST" || request.method === "GET") && url.pathname === "/authLogin") {
      // 优先从 cookie 里的 yb_embed_session 拿身份(走商户接入流程)
      const embedSession = readEmbedSession(request);
      if (embedSession) {
        sendJson(response, 200, authLogin(authInputFromEmbedSession(embedSession)));
        return;
      }
      // 否则走 legacy code 模式(开发 / 测试用)
      const legacyCode = url.searchParams.get("code");
      if (!legacyCode) {
        sendJson(response, 401, { resultid: 0, error: "missing_launch_session" });
        return;
      }
      sendJson(response, 200, authLogin(legacyCode));
      return;
    }

    if (request.method === "POST" && url.pathname === "/__client-log") {
      const body = await readBody(request);
      console.log(`[client] ${body}`);
      sendJson(response, 200, { ok: true });
      return;
    }

    if (request.method === "GET" && url.pathname === "/api/game") {
      sendJson(response, 200, getGameConfig());
      return;
    }

    if (request.method === "GET" && url.pathname === "/api/strategy") {
      // 如果有 yb_embed_session 就按 (商户, 游戏) 走
      const embedSession = readEmbedSession(request);
      const merchantId = embedSession ? embedSession.merchantId : null;
      const gameId = embedSession ? embedSession.gameId : null;
      sendJson(response, 200, getClientStrategyConfig(merchantId, gameId));
      return;
    }

    // ========= 管理后台 auth =========
    if (request.method === "POST" && url.pathname === "/api/admin/login") {
      const body = await readBody(request);
      const payload = body ? JSON.parse(body) : {};
      const username = String(payload.username || "").trim();
      const password = String(payload.password || "");
      if (!username || !password) {
        sendJson(response, 400, { ok: false, error: "missing username or password" });
        return;
      }
      const user = findUser(username);
      if (!user || !verifyPassword(password, user.password_hash)) {
        sendJson(response, 401, { ok: false, error: "invalid credentials" });
        return;
      }
      const ip = getClientIp(request);
      const ua = request.headers["user-agent"];
      const { token, expiresAt } = createSession(username, { actorIp: ip, userAgent: ua });
      sendJson(response, 200, { ok: true, username, expiresAt }, {
        "Set-Cookie": buildSetCookie(token, expiresAt, { secure: isHttps(request) })
      });
      return;
    }

    if (request.method === "POST" && url.pathname === "/api/admin/logout") {
      const token = readSessionTokenFromRequest(request);
      destroySession(token);
      sendJson(response, 200, { ok: true }, {
        "Set-Cookie": buildClearCookie({ secure: isHttps(request) })
      });
      return;
    }

    if (request.method === "GET" && url.pathname === "/api/admin/me") {
      const session = getAdminSession(request);
      if (!session) {
        sendJson(response, 401, { ok: false, error: "unauthorized" });
        return;
      }
      sendJson(response, 200, { ok: true, username: session.username, expiresAt: session.expiresAt });
      return;
    }

    // ========= 公开接口(给官网展示用,不需要登录,不返资源真实路径) =========
    if (request.method === "GET" && url.pathname === "/api/public/games") {
      const items = gameService.listGames({ status: "active" }).map((g) => ({
        gameId: g.gameId,
        name: g.name,
        type: g.type,
        iconUrl: g.iconUrl,
        description: g.description
      }));
      sendJson(response, 200, { ok: true, items });
      return;
    }

    // ========= 其余 /api/admin/* 必须登录 =========
    if (url.pathname.startsWith("/api/admin/")) {
      if (!requireAdminSession(request, response)) return;
    }

    if (request.method === "GET" && url.pathname === "/api/admin/strategy") {
      sendJson(response, 200, getStrategyConfig());
      return;
    }

    if (request.method === "GET" && url.pathname === "/api/admin/stats") {
      sendJson(response, 200, getRuntimeStats());
      return;
    }

    if (request.method === "GET" && url.pathname === "/api/admin/test-codes") {
      sendJson(response, 200, listTestCodes({
        merchantId: url.searchParams.get("merchantId") || undefined,
        gameId: url.searchParams.get("gameId") || undefined,
        limit: url.searchParams.get("limit") || undefined
      }));
      return;
    }

    if (request.method === "POST" && url.pathname === "/api/admin/test-codes/generate") {
      const body = await readBody(request);
      const payload = body ? JSON.parse(body) : {};
      const origin = `${isHttps(request) ? "https" : "http"}://${request.headers.host}`;
      try {
        sendJson(response, 200, generateTestCodes(payload, origin));
      } catch (error) {
        sendJson(response, 400, { ok: false, error: error.message });
      }
      return;
    }

    if (request.method === "POST" && url.pathname === "/api/admin/strategy") {
      const body = await readBody(request);
      const payload = body ? JSON.parse(body) : {};
      const actorIp = getClientIp(request);
      const session = getAdminSession(request);
      sendJson(response, 200, updateStrategyConfig(payload, actorIp, session ? session.username : null));
      return;
    }

    if (request.method === "GET" && url.pathname === "/api/admin/audit") {
      sendJson(response, 200, {
        ok: true,
        items: getAuditLog({
          limit: url.searchParams.get("limit"),
          merchantId: url.searchParams.get("merchantId") || undefined,
          gameId: url.searchParams.get("gameId") || undefined,
          action: url.searchParams.get("action") || undefined,
          actorUser: url.searchParams.get("actorUser") || undefined
        })
      });
      return;
    }

    // ========= 平台游戏 CRUD =========
    if (request.method === "GET" && url.pathname === "/api/admin/games") {
      sendJson(response, 200, { ok: true, items: gameService.listGames() });
      return;
    }
    if (request.method === "POST" && url.pathname === "/api/admin/games") {
      const body = await readBody(request);
      const payload = body ? JSON.parse(body) : {};
      try {
        const game = gameService.createGame({
          gameId: payload.gameId,
          name: payload.name,
          type: payload.type,
          assetUrl: payload.assetUrl,
          iconUrl: payload.iconUrl,
          description: payload.description
        });
        sendJson(response, 200, { ok: true, game });
      } catch (error) {
        sendJson(response, 400, { ok: false, error: error.message });
      }
      return;
    }
    {
      const m = url.pathname.match(/^\/api\/admin\/games\/([a-z0-9_-]+)$/);
      if (m && request.method === "GET") {
        const game = gameService.getGame(m[1]);
        if (!game) sendJson(response, 404, { ok: false, error: "not_found" });
        else sendJson(response, 200, { ok: true, game });
        return;
      }
      if (m && request.method === "POST") {
        const body = await readBody(request);
        const payload = body ? JSON.parse(body) : {};
        try {
          const game = gameService.updateGame(m[1], payload);
          sendJson(response, 200, { ok: true, game });
        } catch (error) {
          sendJson(response, 400, { ok: false, error: error.message });
        }
        return;
      }
    }

    // 改某个游戏的全平台默认策略
    {
      const m = url.pathname.match(/^\/api\/admin\/games\/([a-z0-9_-]+)\/default-strategy$/);
      if (m && request.method === "POST") {
        const body = await readBody(request);
        const payload = body ? JSON.parse(body) : {};
        try {
          const session = getAdminSession(request);
          const updated = setGameDefaultStrategy(m[1], payload, getClientIp(request), session ? session.username : null);
          sendJson(response, 200, { ok: true, strategy: updated });
        } catch (error) {
          sendJson(response, 400, { ok: false, error: error.message });
        }
        return;
      }
    }

    // 商户的可用游戏(白名单)读写
    {
      const m = url.pathname.match(/^\/api\/admin\/merchants\/([a-z0-9_-]+)\/games$/);
      if (m && request.method === "GET") {
        sendJson(response, 200, { ok: true, items: gameService.listMerchantGames(m[1]) });
        return;
      }
      if (m && request.method === "POST") {
        const body = await readBody(request);
        const payload = body ? JSON.parse(body) : {};
        try {
          const result = gameService.setMerchantGame(m[1], payload.gameId, payload.enabled !== false);
          sendJson(response, 200, { ok: true, ...result });
        } catch (error) {
          sendJson(response, 400, { ok: false, error: error.message });
        }
        return;
      }
    }

    // 商户 × 游戏 策略读 / 写
    // GET  /api/admin/merchants/:id/games/:gameId/strategy
    // POST /api/admin/merchants/:id/games/:gameId/strategy
    {
      const m = url.pathname.match(/^\/api\/admin\/merchants\/([a-z0-9_-]+)\/games\/([a-z0-9_-]+)\/strategy$/);
      if (m) {
        const mId = m[1];
        const gId = m[2];
        const merchant = merchantService.getMerchant(mId);
        if (!merchant) {
          sendJson(response, 404, { ok: false, error: "merchant_not_found" });
          return;
        }
        if (!gameService.getGame(gId)) {
          sendJson(response, 404, { ok: false, error: "game_not_found" });
          return;
        }
        if (request.method === "GET") {
          sendJson(response, 200, {
            ok: true,
            strategy: getEffectiveStrategy(mId, gId),
            hasOverride: !!gameService.getMerchantGameStrategy(mId, gId)
          });
          return;
        }
        if (request.method === "POST") {
          const body = await readBody(request);
          const payload = body ? JSON.parse(body) : {};
          const session = getAdminSession(request);
          const updated = setMerchantGameStrategyPatch(mId, gId, payload, getClientIp(request), session ? session.username : null);
          sendJson(response, 200, { ok: true, strategy: updated });
          return;
        }
      }
    }

    // 单个商户 dashboard 数据(给 merchant.html 详情页用)
    {
      const m = url.pathname.match(/^\/api\/admin\/merchants\/([a-z0-9_-]+)\/overview$/);
      if (m && request.method === "GET") {
        const mId = m[1];
        const merchant = merchantService.getMerchant(mId);
        if (!merchant) {
          sendJson(response, 404, { ok: false, error: "merchant_not_found" });
          return;
        }
        const dbInst = db.getDb();
        const gameIdFilter = url.searchParams.get("gameId") || undefined;
        const summaryAll = merchantService.getMerchantSummary({ merchantId: mId, gameId: gameIdFilter });
        const playersWhere = gameIdFilter ? "merchant_id = ? AND game_id = ?" : "merchant_id = ?";
        const playersParams = gameIdFilter ? [mId, gameIdFilter] : [mId];
        const playersRow = dbInst.prepare(
          `SELECT COUNT(*) AS n, SUM(score) AS total_score
             FROM players WHERE ${playersWhere}`
        ).get(...playersParams);
        const recentTxns = merchantService.listTransactions({ merchantId: mId, gameId: gameIdFilter, limit: 10 });
        // 按游戏分布:本商户最近 24h 各游戏的下注 / 中奖
        const dayAgo = new Date(Date.now() - 86400 * 1000).toISOString().replace("T", " ").slice(0, 19);
        const gameBreakdownRows = dbInst.prepare(
          `SELECT COALESCE(t.game_id, '(unknown)') AS game_id,
                  g.name AS game_name,
                  SUM(CASE WHEN t.type='bet' THEN t.amount ELSE 0 END) AS total_bet,
                  SUM(CASE WHEN t.type='win' THEN t.amount ELSE 0 END) AS total_win,
                  COUNT(*) AS txn_count,
                  COUNT(DISTINCT t.external_user_id) AS user_count
             FROM transactions t
        LEFT JOIN games g ON g.game_id = t.game_id
            WHERE t.merchant_id = ? AND t.created_at >= ?
         GROUP BY t.game_id
         ORDER BY total_bet DESC`
        ).all(mId, dayAgo);
        const gameBreakdown = gameBreakdownRows.map((row) => {
          const tb = row.total_bet || 0;
          const tw = row.total_win || 0;
          return {
            gameId: row.game_id,
            gameName: row.game_name || row.game_id,
            totalBet: tb,
            totalWin: tw,
            ggr: tb - tw,
            rtp: tb > 0 ? tw / tb : 0,
            txnCount: row.txn_count || 0,
            userCount: row.user_count || 0
          };
        });
        sendJson(response, 200, {
          ok: true,
          merchant: {
            merchantId: merchant.merchant_id,
            name: merchant.name,
            status: merchant.status,
            ipWhitelist: merchant.ip_whitelist,
            callbackUrl: merchant.callback_url,
            createdAt: merchant.created_at
          },
          summary: summaryAll,
          players: { count: playersRow.n, totalScore: playersRow.total_score || 0 },
          recentTxns,
          gameBreakdown
        });
        return;
      }
    }

    // 单商户的活跃玩家列表
    {
      const m = url.pathname.match(/^\/api\/admin\/merchants\/([a-z0-9_-]+)\/players$/);
      if (m && request.method === "GET") {
        const mId = m[1];
        const dbInst = db.getDb();
        const limit = Math.min(500, Math.max(10, Number(url.searchParams.get("limit")) || 50));
        const gameIdFilter = url.searchParams.get("gameId") || undefined;
        const where = ["merchant_id = ?"];
        const params = [mId];
        if (gameIdFilter) { where.push("game_id = ?"); params.push(gameIdFilter); }
        const rows = dbInst.prepare(
          `SELECT id, external_user_id, game_id, nickname, score, spin_count, total_bet, total_won, updated_at
             FROM players WHERE ${where.join(" AND ")}
             ORDER BY updated_at DESC LIMIT ?`
        ).all(...params, limit);
        sendJson(response, 200, { ok: true, items: rows });
        return;
      }
    }

    // 全局 dashboard 数据(首页用)
    if (request.method === "GET" && url.pathname === "/api/admin/dashboard") {
      const dbInst = db.getDb();
      // 商户数
      const merchantCount = dbInst.prepare(`SELECT
        SUM(CASE WHEN status='active' THEN 1 ELSE 0 END) AS active_count,
        SUM(CASE WHEN status='disabled' THEN 1 ELSE 0 END) AS disabled_count,
        COUNT(*) AS total
      FROM merchants`).get();
      // 24h 流水
      const dayAgo = new Date(Date.now() - 86400 * 1000).toISOString().replace("T", " ").slice(0, 19);
      const txn24h = dbInst.prepare(
        `SELECT
           SUM(CASE WHEN type='bet' THEN amount ELSE 0 END) AS total_bet,
           SUM(CASE WHEN type='win' THEN amount ELSE 0 END) AS total_win,
           COUNT(*) AS txn_count,
           COUNT(DISTINCT external_user_id) AS user_count
         FROM transactions WHERE created_at >= ?`
      ).get(dayAgo);
      // 总玩家
      const playersRow = dbInst.prepare(`SELECT COUNT(*) AS n FROM players WHERE merchant_id IS NOT NULL`).get();
      // 最近一次大奖(spin_history 里 win/bet >= 20)
      const bigWin = dbInst.prepare(
        `SELECT s.round_id, s.bet, s.win, s.bet_tier, s.created_at, p.merchant_id, p.external_user_id
           FROM spin_history s LEFT JOIN players p ON p.id = s.player_id
          WHERE s.win > 0 AND s.bet > 0 AND (s.win * 1.0 / s.bet) >= 20
          ORDER BY s.id DESC LIMIT 1`
      ).get();
      // 最近 5 条审计
      const audits = getAuditLog({ limit: 5 });
      const totalBet = txn24h.total_bet || 0;
      const totalWin = txn24h.total_win || 0;
      // 24h 按游戏维度汇总
      const gameBreakdownRows = dbInst.prepare(
        `SELECT COALESCE(t.game_id, '(unknown)') AS game_id,
                g.name AS game_name,
                SUM(CASE WHEN t.type='bet' THEN t.amount ELSE 0 END) AS total_bet,
                SUM(CASE WHEN t.type='win' THEN t.amount ELSE 0 END) AS total_win,
                COUNT(*) AS txn_count,
                COUNT(DISTINCT t.external_user_id) AS user_count
           FROM transactions t
      LEFT JOIN games g ON g.game_id = t.game_id
          WHERE t.created_at >= ?
       GROUP BY t.game_id
       ORDER BY total_bet DESC`
      ).all(dayAgo);
      const gameBreakdown = gameBreakdownRows.map((row) => {
        const tb = row.total_bet || 0;
        const tw = row.total_win || 0;
        return {
          gameId: row.game_id,
          gameName: row.game_name || row.game_id,
          totalBet: tb,
          totalWin: tw,
          ggr: tb - tw,
          rtp: tb > 0 ? tw / tb : 0,
          txnCount: row.txn_count || 0,
          userCount: row.user_count || 0
        };
      });
      // 全平台游戏数
      const gameCount = dbInst.prepare(`SELECT
        SUM(CASE WHEN status='active' THEN 1 ELSE 0 END) AS active_count,
        SUM(CASE WHEN status='disabled' THEN 1 ELSE 0 END) AS disabled_count,
        SUM(CASE WHEN status='beta' THEN 1 ELSE 0 END) AS beta_count,
        COUNT(*) AS total
      FROM games`).get();
      sendJson(response, 200, {
        ok: true,
        merchants: merchantCount,
        games: gameCount,
        last24h: {
          totalBet,
          totalWin,
          ggr: totalBet - totalWin,
          rtp: totalBet > 0 ? totalWin / totalBet : 0,
          txnCount: txn24h.txn_count || 0,
          userCount: txn24h.user_count || 0
        },
        gameBreakdown,
        playerCount: playersRow.n,
        recentBigWin: bigWin || null,
        recentAudits: audits
      });
      return;
    }

    // ========= 管理后台:商户 CRUD =========
    if (request.method === "GET" && url.pathname === "/api/admin/merchants") {
      sendJson(response, 200, { ok: true, items: merchantService.listMerchants() });
      return;
    }

    if (request.method === "POST" && url.pathname === "/api/admin/merchants") {
      const body = await readBody(request);
      const payload = body ? JSON.parse(body) : {};
      try {
        const created = merchantService.createMerchant({
          merchantId: payload.merchantId,
          name: payload.name,
          ipWhitelist: payload.ipWhitelist || "",
          callbackUrl: payload.callbackUrl || ""
        });
        sendJson(response, 200, { ok: true, merchant: created });
      } catch (error) {
        sendJson(response, 400, { ok: false, error: error.message });
      }
      return;
    }

    if (request.method === "POST" && url.pathname.startsWith("/api/admin/merchants/")) {
      const segs = url.pathname.split("/").filter(Boolean);
      // /api/admin/merchants/:merchantId/(rotate|update)
      const mId = segs[3];
      const action = segs[4];
      const body = await readBody(request);
      const payload = body ? JSON.parse(body) : {};
      try {
        if (action === "rotate") {
          const newSecret = merchantService.rotateSecret(mId);
          sendJson(response, 200, { ok: true, secret: newSecret });
          return;
        }
        if (action === "update") {
          const m = merchantService.updateMerchant(mId, payload);
          sendJson(response, 200, { ok: true, merchant: m });
          return;
        }
      } catch (error) {
        sendJson(response, 400, { ok: false, error: error.message });
        return;
      }
      sendJson(response, 404, { ok: false, error: "not_found" });
      return;
    }

    // ========= 管理后台:流水查询 =========
    if (request.method === "GET" && url.pathname === "/api/admin/transactions") {
      const items = merchantService.listTransactions({
        merchantId: url.searchParams.get("merchantId") || undefined,
        externalUserId: url.searchParams.get("externalUserId") || undefined,
        gameId: url.searchParams.get("gameId") || undefined,
        type: url.searchParams.get("type") || undefined,
        from: url.searchParams.get("from") || undefined,
        to: url.searchParams.get("to") || undefined,
        limit: url.searchParams.get("limit") || 200
      });
      sendJson(response, 200, { ok: true, items });
      return;
    }

    // ========= 商户接入(server-to-server,HMAC 签名) =========
    if (url.pathname.startsWith("/api/merchant/")) {
      const merchantId = request.headers["x-merchant-id"] || "";
      const timestamp = request.headers["x-timestamp"] || "";
      const signature = request.headers["x-signature"] || "";
      const merchant = merchantId ? merchantService.getMerchant(merchantId) : null;

      // 鉴权 check(对所有 /api/merchant/* 强制)
      const ip = getClientIp(request);
      if (!merchant) {
        sendJson(response, 401, { ok: false, error: "merchant_not_found" });
        return;
      }
      if (merchant.status !== "active") {
        sendJson(response, 403, { ok: false, error: "merchant_disabled" });
        return;
      }
      if (!merchantService.isIpAllowed(merchant, ip)) {
        sendJson(response, 403, { ok: false, error: "ip_not_allowed", ip });
        return;
      }
      const body = await readBody(request);
      if (!merchantService.verifyServerSignature(merchant.secret, body || "", timestamp, signature)) {
        sendJson(response, 401, { ok: false, error: "invalid_signature" });
        return;
      }
      const payload = body ? JSON.parse(body) : {};

      // POST /api/merchant/launch
      if (request.method === "POST" && url.pathname === "/api/merchant/launch") {
        const externalUserId = String(payload.externalUserId || "").trim();
        const gameId = String(payload.gameId || "").trim();
        if (!externalUserId) {
          sendJson(response, 400, { ok: false, error: "externalUserId required" });
          return;
        }
        if (!gameId) {
          sendJson(response, 400, { ok: false, error: "gameId required" });
          return;
        }
        // 校验商户能玩这个游戏
        if (!gameService.isMerchantGameAllowed(merchant.merchant_id, gameId)) {
          sendJson(response, 403, { ok: false, error: "game_not_allowed_for_merchant" });
          return;
        }
        const launch = merchantService.createLaunchToken({
          merchantId: merchant.merchant_id,
          externalUserId,
          gameId,
          payload: {
            nickname: payload.nickname || null,
            avatar: payload.avatar || null,
            lang: payload.lang || "en",
            initialBalance: Number(payload.initialBalance) || null
          }
        });
        const origin = `${isHttps(request) ? "https" : "http"}://${request.headers.host}`;
        sendJson(response, 200, {
          ok: true,
          token: launch.token,
          expiresAt: launch.expiresAt,
          gameUrl: `${origin}/embed?token=${launch.token}`
        });
        return;
      }

      // GET /api/merchant/games — 返回本商户已开通的游戏
      if (request.method === "GET" && url.pathname === "/api/merchant/games") {
        const items = gameService.listMerchantGames(merchant.merchant_id)
          .filter((row) => row.enabled)
          .map((row) => ({
            gameId: row.gameId,
            name: row.game.name,
            type: row.game.type,
            status: row.game.status
          }));
        sendJson(response, 200, { ok: true, items });
        return;
      }

      // GET /api/merchant/transactions
      if (request.method === "GET" && url.pathname === "/api/merchant/transactions") {
        // GET 没有 body,签名是空 body,query 参数读出
        const qparams = Object.fromEntries(url.searchParams.entries());
        const items = merchantService.listTransactions({
          merchantId: merchant.merchant_id,
          externalUserId: qparams.externalUserId,
          gameId: qparams.gameId,
          type: qparams.type,
          from: qparams.from,
          to: qparams.to,
          limit: qparams.limit
        });
        sendJson(response, 200, { ok: true, items });
        return;
      }

      // GET /api/merchant/balance?externalUserId=xxx[&gameId=yyy]
      // 不带 gameId:返回该玩家在所有游戏的合并(汇总),并附 byGame 数组
      // 带 gameId:返回该 (商户, 玩家, 游戏) 的精确数据
      if (request.method === "GET" && url.pathname === "/api/merchant/balance") {
        const externalUserId = url.searchParams.get("externalUserId");
        const gameIdQ = url.searchParams.get("gameId");
        if (!externalUserId) {
          sendJson(response, 400, { ok: false, error: "externalUserId required" });
          return;
        }
        const dbInst = db.getDb();
        if (gameIdQ) {
          const row = dbInst.prepare(
            `SELECT id, score, total_bet, total_won, spin_count
               FROM players WHERE merchant_id = ? AND external_user_id = ? AND game_id = ?`
          ).get(merchant.merchant_id, externalUserId, gameIdQ);
          if (!row) {
            sendJson(response, 404, { ok: false, error: "player_not_found" });
            return;
          }
          sendJson(response, 200, {
            ok: true,
            externalUserId,
            gameId: gameIdQ,
            balance: row.score,
            totalBet: row.total_bet,
            totalWon: row.total_won,
            spinCount: row.spin_count
          });
          return;
        }
        // 不带 gameId:聚合 + 分组
        const rows = dbInst.prepare(
          `SELECT game_id, score, total_bet, total_won, spin_count
             FROM players WHERE merchant_id = ? AND external_user_id = ?`
        ).all(merchant.merchant_id, externalUserId);
        if (!rows.length) {
          sendJson(response, 404, { ok: false, error: "player_not_found" });
          return;
        }
        const totals = rows.reduce((acc, r) => ({
          balance: acc.balance + (r.score || 0),
          totalBet: acc.totalBet + (r.total_bet || 0),
          totalWon: acc.totalWon + (r.total_won || 0),
          spinCount: acc.spinCount + (r.spin_count || 0)
        }), { balance: 0, totalBet: 0, totalWon: 0, spinCount: 0 });
        sendJson(response, 200, {
          ok: true,
          externalUserId,
          ...totals,
          byGame: rows.map((r) => ({
            gameId: r.game_id,
            balance: r.score,
            totalBet: r.total_bet,
            totalWon: r.total_won,
            spinCount: r.spin_count
          }))
        });
        return;
      }

      // GET /api/merchant/summary?day=YYYY-MM-DD[&gameId=xxx]
      if (request.method === "GET" && url.pathname === "/api/merchant/summary") {
        const day = url.searchParams.get("day");
        const gameIdQ = url.searchParams.get("gameId");
        const summary = merchantService.getMerchantSummary({
          merchantId: merchant.merchant_id,
          day: day || null,
          gameId: gameIdQ || undefined
        });
        sendJson(response, 200, { ok: true, summary });
        return;
      }

      sendJson(response, 404, { ok: false, error: "not_found" });
      return;
    }

    // ========= /play?code=xxx — QA 用 test_code 直接进游戏 =========
    // - 默认(QA 在桌面浏览器打开)→ 返回手机预览框架,iframe 加载真正的游戏入口
    // - ?raw=1 时(iframe 内部 / mobile 上 / native webview)→ 创建 launch_token + 302 到 /embed
    if (request.method === "GET" && url.pathname === "/play") {
      const code = url.searchParams.get("code");
      if (!code) {
        sendText(response, 400, "Missing code");
        return;
      }
      const tc = lookupTestCode(code);
      if (!tc || !tc.merchantId || !tc.externalUserId || !tc.gameId) {
        sendText(response, 404, "code not found or missing game_id");
        return;
      }
      // raw 模式:消费 token,302 到 /embed(原行为)
      // FishStar 原包在 iframe 预览壳里会进入 pc iframe 分支,因此测试 Code 默认也直接打开原包。
      if (url.searchParams.get("raw") === "1" || tc.gameId === "fishstar") {
        const launch = merchantService.createLaunchToken({
          merchantId: tc.merchantId,
          externalUserId: tc.externalUserId,
          gameId: tc.gameId,
          payload: {
            nickname: `QA ${tc.code.slice(-6)}`,
            lang: "en",
            fromTestCode: true
          }
        });
        markTestCodeConsumed(code);
        response.writeHead(302, { "Location": `/embed?token=${launch.token}` });
        response.end();
        return;
      }
      // 默认:返回手机框预览页(iframe 加载 ?raw=1)
      sendText(response, 200, renderPlayFrame({
        code: tc.code,
        merchantId: tc.merchantId,
        gameId: tc.gameId,
        externalUserId: tc.externalUserId
      }), "text/html; charset=utf-8");
      return;
    }

    // ========= /embed:webview 入口 =========
    if (request.method === "GET" && url.pathname === "/embed") {
      const token = url.searchParams.get("token");
      if (!token) {
        sendText(response, 400, "Missing token");
        return;
      }
      const consumed = merchantService.consumeLaunchToken(token);
      if (!consumed) {
        sendText(response, 401, "Invalid or expired token");
        return;
      }
      // 根据 game_id 找游戏的 asset_url
      const game = consumed.gameId ? gameService.getGame(consumed.gameId) : null;
      const assetUrl = (game && game.assetUrl) || "/pinatawins/index.html";
      // 把 token 解析的玩家身份写入一个短期 cookie
      const sessionCookie = buildEmbedSessionCookie({
        merchantId: consumed.merchantId,
        externalUserId: consumed.externalUserId,
        gameId: consumed.gameId,
        payload: consumed.payload
      }, request);
      const lang = encodeURIComponent(consumed.payload.lang || "en");
      const sep = assetUrl.includes("?") ? "&" : "?";
      response.writeHead(302, {
        "Set-Cookie": sessionCookie,
        "Location": `${assetUrl}${sep}lang=${lang}&embed=1&backurl=openurl%3A%2F%2Fclosegame`
      });
      response.end();
      return;
    }

    if (request.method === "POST" && url.pathname === "/api/spin") {
      const body = await readBody(request);
      const payload = body ? JSON.parse(body) : {};
      sendJson(response, 200, spin(payload));
      return;
    }

    if (request.method === "GET" && (url.pathname === "/admin" || url.pathname.startsWith("/admin/"))) {
      serveAdmin(request, response);
      return;
    }

    // ========= 游戏资源访问控制:必须有 yb_embed_session cookie 且 gameId 匹配该游戏目录 =========
    // 平台已不再允许公开访问游戏直链,玩家必须先走商户 launch 拿 token,/embed?token= 颁发 cookie
    if (request.method === "GET" && isGameAssetPath(url.pathname)) {
      const session = readEmbedSession(request);
      const requestedGameDir = url.pathname.split("/").filter(Boolean)[0]; // e.g. "pinata-fiesta-wins"
      const allowedGameId = session && session.gameId;
      // 把 gameId 映射到 asset 目录前缀(走 games.asset_url 第一段)
      const allowedAssetPrefix = allowedGameId
        ? deriveAssetPrefix(gameService.getGame(allowedGameId))
        : null;
      if (!session || !session.merchantId || !allowedAssetPrefix || allowedAssetPrefix !== requestedGameDir) {
        // 直接打 / 让玩家看官网;附 query 让前端能弹个 toast
        response.writeHead(302, { "Location": "/?reason=needs-launch-token" });
        response.end();
        return;
      }
      // cookie ok,从 GAMES_ROOT 取
      serveGameAsset(request, response);
      return;
    }

    // 默认走官网 landing
    serveOfficial(request, response);
  } catch (error) {
    sendJson(response, 500, { error: error.message });
  }
});

server.listen(PORT, () => {
  console.log(`Piñata Fiesta running at http://localhost:${PORT}`);
  console.log(
    `CORS allowed origins: ${
      CORS_WILDCARD ? "* (wildcard, dev only)" : CORS_ALLOWED_ORIGINS.join(", ")
    }`
  );
  console.log(`SQLite db: ${db.DB_PATH}`);
});

// 每 24 小时清理 1 年前的 spin_history + 过期 session
const PRUNE_INTERVAL_MS = 24 * 60 * 60 * 1000;
setInterval(() => {
  try {
    const removedHistory = db.pruneOldHistory(365);
    const removedSessions = db.pruneExpiredSessions();
    if (removedHistory > 0) console.log(`[db] pruned ${removedHistory} old spin_history rows`);
    if (removedSessions > 0) console.log(`[db] pruned ${removedSessions} expired sessions`);
  } catch (error) {
    console.warn("[db] prune failed:", error.message);
  }
}, PRUNE_INTERVAL_MS).unref();
// 启动时立即清一次过期 session
try { db.pruneExpiredSessions(); } catch (error) { /* ignore */ }

// 优雅退出,关闭 DB 释放 WAL
for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => {
    console.log(`[signal] ${signal} received, closing db...`);
    try { db.close(); } catch (error) { /* ignore */ }
    process.exit(0);
  });
}

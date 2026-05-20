const crypto = require("node:crypto");

const DEFAULT_PATH_PREFIX = "/callback/baishun";
const DEFAULT_TIMEOUT_MS = 5000;
const tokenCache = new Map();

function readConfig() {
  const baseUrl = String(process.env.BAISHUN_BASE_URL || "").replace(/\/+$/, "");
  if (baseUrl && !/^https?:\/\//i.test(baseUrl)) throw new Error("BAISHUN_BASE_URL must be http(s)");
  const pathPrefix = `/${String(process.env.BAISHUN_PATH_PREFIX || DEFAULT_PATH_PREFIX).replace(/^\/+|\/+$/g, "")}`;
  return {
    baseUrl,
    pathPrefix,
    appId: process.env.BAISHUN_APP_ID || "8146186998",
    providerName: process.env.BAISHUN_PROVIDER_NAME || "bobi",
    gameId: process.env.BAISHUN_GAME_ID || "1022",
    currencyType: Number(process.env.BAISHUN_CURRENCY_TYPE || 0),
    signatureSecret: process.env.BAISHUN_SIGNATURE_SECRET || "",
    headerSignSecret: process.env.BAISHUN_HEADER_SIGN_SECRET || "",
    requestClient: process.env.BAISHUN_REQ_CLIENT || "H5",
    timeoutMs: Number(process.env.BAISHUN_TIMEOUT_MS || DEFAULT_TIMEOUT_MS),
    tokenTtlMs: Number(process.env.BAISHUN_TOKEN_TTL_MS || 20 * 60 * 1000)
  };
}

function isEnabled() {
  return Boolean(readConfig().baseUrl);
}

function randomNonce() {
  return crypto.randomBytes(18).toString("base64url");
}

function nowSeconds() {
  return Math.floor(Date.now() / 1000);
}

function md5(value) {
  return crypto.createHash("md5").update(String(value)).digest("hex");
}

function canonicalize(payload) {
  return Object.keys(payload)
    .filter((key) => key !== "signature" && key !== "sign" && payload[key] !== undefined && payload[key] !== null)
    .sort()
    .map((key) => `${key}=${String(payload[key])}`)
    .join("&");
}

function signPayload(payload, secret) {
  if (!secret) return "";
  return md5(`${canonicalize(payload)}&key=${secret}`);
}

function endpointUrl(name, config) {
  return `${config.baseUrl}${config.pathPrefix}/${name}`;
}

function cacheKey(context) {
  return [context.appId, context.providerName, context.providerGameId, context.userId, context.code].join(":");
}

function getCachedToken(context, config) {
  const key = cacheKey(context);
  const cached = tokenCache.get(key);
  if (!cached || cached.expiresAt <= Date.now()) return null;
  return cached.token;
}

function setCachedToken(context, token, config) {
  if (!token) return;
  tokenCache.set(cacheKey(context), { token, expiresAt: Date.now() + config.tokenTtlMs });
}

function pickString(...values) {
  for (const value of values) {
    if (value !== undefined && value !== null && String(value).trim()) return String(value).trim();
  }
  return "";
}

function buildContext(input = {}) {
  const config = readConfig();
  return {
    appId: pickString(input.appId, config.appId),
    userId: pickString(input.userId),
    code: pickString(input.code),
    ssToken: pickString(input.ssToken, input.sstoken),
    providerName: pickString(input.providerName, config.providerName),
    clientIp: pickString(input.clientIp),
    providerGameId: pickString(input.providerGameId, input.gameId, config.gameId),
    currencyType: input.currencyType === undefined || input.currencyType === null ? config.currencyType : Number(input.currencyType)
  };
}

function preparePayload(payload, context, config) {
  const signatureNonce = randomNonce();
  const timestamp = nowSeconds();
  const signedPayload = {
    ...payload,
    signature_nonce: signatureNonce,
    timestamp
  };
  const signature = signPayload(signedPayload, config.signatureSecret);
  if (config.baseUrl && !signature) throw new Error("BAISHUN_SIGNATURE_SECRET is required when BAISHUN_BASE_URL is set");
  signedPayload.signature = signature;
  const headers = {
    "content-type": "application/json",
    "req-client": config.requestClient,
    "signature": signature,
    "signature_nonce": signatureNonce,
    "timestamp": String(timestamp)
  };
  if (context.ssToken || context.code) headers.sstoken = context.ssToken || context.code;
  const sign = signPayload(signedPayload, config.headerSignSecret);
  if (sign) headers.sign = sign;
  return { payload: signedPayload, headers };
}

async function postJson(name, payload, context) {
  const config = readConfig();
  if (!config.baseUrl) return { skipped: true, body: null };
  const prepared = preparePayload(payload, context, config);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), config.timeoutMs);
  try {
    const response = await fetch(endpointUrl(name, config), {
      method: "POST",
      headers: prepared.headers,
      body: JSON.stringify(prepared.payload),
      signal: controller.signal
    });
    const text = await response.text();
    const body = parseJson(text);
    if (!response.ok) throw new Error(`Baishun ${name} HTTP ${response.status}`);
    assertSuccess(name, body);
    return { skipped: false, body, requestPayload: prepared.payload };
  } finally {
    clearTimeout(timeout);
  }
}

function parseJson(text) {
  if (!text) return {};
  try {
    return JSON.parse(text);
  } catch (error) {
    throw new Error(`Baishun response is not JSON: ${text.slice(0, 120)}`);
  }
}

function assertSuccess(name, body) {
  if (!body || typeof body !== "object") return;
  if (body.ok === false || body.success === false) throw new Error(`Baishun ${name} returned failure`);
  if (body.errCode !== undefined && Number(body.errCode) !== 0) throw new Error(`Baishun ${name} errCode ${body.errCode}`);
  if (body.code !== undefined && ![0, 200].includes(Number(body.code))) throw new Error(`Baishun ${name} code ${body.code}`);
  if (body.ResultCode !== undefined && Number(body.ResultCode) === 0) throw new Error(`Baishun ${name} ResultCode 0`);
}

function findFirstString(value, keys) {
  if (!value || typeof value !== "object") return "";
  for (const key of keys) {
    if (value[key] !== undefined && value[key] !== null && String(value[key]).trim()) return String(value[key]).trim();
  }
  for (const nestedKey of ["data", "Data", "result", "Result", "Obj", "obj"]) {
    const found = findFirstString(value[nestedKey], keys);
    if (found) return found;
  }
  return "";
}

function findFirstNumber(value, keys) {
  if (!value || typeof value !== "object") return null;
  for (const key of keys) {
    if (value[key] !== undefined && value[key] !== null && Number.isFinite(Number(value[key]))) return Number(value[key]);
  }
  for (const nestedKey of ["data", "Data", "result", "Result", "Obj", "obj", "user", "User"]) {
    const found = findFirstNumber(value[nestedKey], keys);
    if (found !== null) return found;
  }
  return null;
}

async function getToken(input) {
  const config = readConfig();
  const context = buildContext(input);
  if (!config.baseUrl) return { skipped: true, ssToken: context.ssToken };
  if (context.ssToken) return { skipped: false, ssToken: context.ssToken };
  const cached = getCachedToken(context, config);
  if (cached) return { skipped: false, ssToken: cached };
  if (!context.userId || !context.code) throw new Error("Baishun get-token requires userId and code");
  const response = await postJson("get-token", {
    app_id: context.appId,
    user_id: context.userId,
    code: context.code,
    game_id: Number(context.providerGameId),
    provider_name: context.providerName
  }, context);
  const ssToken = findFirstString(response.body, ["ss_token", "ssToken", "sstoken", "token"]);
  if (!ssToken) throw new Error("Baishun get-token response missing ss_token");
  setCachedToken(context, ssToken, config);
  return { skipped: false, ssToken, body: response.body };
}

async function getUserInfo(input) {
  const context = buildContext(input);
  const tokenResult = await getToken(context);
  const tokenContext = { ...context, ssToken: tokenResult.ssToken };
  if (!readConfig().baseUrl) return { skipped: true, balance: null };
  if (!tokenContext.userId || !tokenContext.ssToken) throw new Error("Baishun get-userinfo requires userId and ssToken");
  const response = await postJson("get-userinfo", {
    app_id: tokenContext.appId,
    user_id: tokenContext.userId,
    ss_token: tokenContext.ssToken,
    provider_name: tokenContext.providerName,
    client_ip: tokenContext.clientIp,
    game_id: Number(tokenContext.providerGameId),
    currency_type: tokenContext.currencyType
  }, tokenContext);
  const balance = findFirstNumber(response.body, ["coin", "coins", "score", "balance", "currency", "amount"]);
  if (balance === null) throw new Error("Baishun get-userinfo response missing balance");
  return { skipped: false, balance, ssToken: tokenContext.ssToken, body: response.body };
}

async function changeBalance(input) {
  const context = buildContext(input);
  const tokenResult = await getToken(context);
  const tokenContext = { ...context, ssToken: tokenResult.ssToken };
  if (!readConfig().baseUrl) return { skipped: true };
  if (!tokenContext.userId || !tokenContext.ssToken) throw new Error("Baishun change-balance requires userId and ssToken");
  const response = await postJson("change-balance", {
    app_id: tokenContext.appId,
    change_time_at: nowSeconds(),
    currency_diff: Number(input.currencyDiff),
    diff_msg: input.diffMsg,
    game_id: Number(tokenContext.providerGameId),
    game_round_id: input.gameRoundId,
    room_id: input.roomId,
    ss_token: tokenContext.ssToken,
    user_id: tokenContext.userId,
    extend: JSON.stringify(input.extend || {}),
    order_id: input.orderId || crypto.randomUUID(),
    currency_type: tokenContext.currencyType
  }, tokenContext);
  return { skipped: false, body: response.body };
}

module.exports = {
  isEnabled,
  buildContext,
  getToken,
  getUserInfo,
  changeBalance
};

import { createServer } from "node:http";
import { existsSync, mkdirSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { extname, join, normalize, resolve } from "node:path";
import { randomUUID } from "node:crypto";
import Database from "better-sqlite3";

const PORT = Number(process.env.PORT || 3000);
const ROOT_DIR = resolve(process.cwd());
const DATA_DIR = resolve(process.env.DATA_DIR || join(ROOT_DIR, ".data"));
const DB_PATH = resolve(process.env.CHAT_DB_PATH || join(DATA_DIR, "chat.sqlite"));
const DEFAULT_BASE_URL = "https://apic1.ohmycdn.com/api/v1/ai/openai/codex-omg/v1";
const DEFAULT_MODEL = "gpt-5.5";
const DEFAULT_TEMPERATURE = 1;
const UPSTREAM_TIMEOUT_MS = Number(process.env.UPSTREAM_TIMEOUT_MS || 8000);
const STAGES = new Set([
  "FounderIdea",
  "ProductAI",
  "PRDGate",
  "DesignAI",
  "DesignReview",
  "DevelopmentAI",
  "QAAI",
  "OwnerAcceptance",
  "Launch",
  "FeedbackIteration"
]);
const ROLES = new Set(["user", "assistant"]);
const CONTENT_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".md": "text/markdown; charset=utf-8",
  ".json": "application/json; charset=utf-8"
};

if (!existsSync(DATA_DIR)) mkdirSync(DATA_DIR, { recursive: true });

const db = new Database(DB_PATH);
db.pragma("journal_mode = WAL");
db.exec(`
  CREATE TABLE IF NOT EXISTS messages (
    id TEXT PRIMARY KEY,
    projectId TEXT NOT NULL,
    stage TEXT NOT NULL,
    role TEXT NOT NULL CHECK(role IN ('user', 'assistant')),
    content TEXT NOT NULL,
    createdAt TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_messages_project_stage_created
    ON messages(projectId, stage, createdAt, id);
`);

const insertMessageStatement = db.prepare(`
  INSERT INTO messages (id, projectId, stage, role, content, createdAt)
  VALUES (@id, @projectId, @stage, @role, @content, @createdAt)
`);
const listMessagesStatement = db.prepare(`
  SELECT id, role, content, createdAt
  FROM messages
  WHERE projectId = ? AND stage = ?
  ORDER BY createdAt ASC, id ASC
`);

function json(res, status, payload) {
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" });
  res.end(JSON.stringify(payload));
}

function readBody(req) {
  return new Promise((resolveBody, reject) => {
    let body = "";
    req.on("data", (chunk) => {
      body += chunk;
      if (body.length > 1_000_000) {
        reject(new Error("Request body too large"));
        req.destroy();
      }
    });
    req.on("end", () => resolveBody(body));
    req.on("error", reject);
  });
}

function validateTextField(name, value, maxLength) {
  const text = String(value || "").trim();
  if (!text) throw new Error(`${name} is required`);
  if (text.length > maxLength) throw new Error(`${name} is too long`);
  return text;
}

function validateStage(stage) {
  const value = validateTextField("stage", stage, 80);
  if (!STAGES.has(value)) throw new Error("stage is invalid");
  return value;
}

function validateRole(role) {
  const value = validateTextField("role", role, 20);
  if (!ROLES.has(value)) throw new Error("role is invalid");
  return value;
}

function validateTemperature(value) {
  const number = Number(value ?? DEFAULT_TEMPERATURE);
  if (!Number.isFinite(number)) return DEFAULT_TEMPERATURE;
  return Math.min(2, Math.max(0, number));
}

function normalizeChatUrl(baseUrl) {
  const trimmed = String(baseUrl || DEFAULT_BASE_URL).trim().replace(/\/+$/, "");
  if (!/^https?:\/\//.test(trimmed)) throw new Error("baseUrl must be http or https");
  if (usesResponsesApi(trimmed)) return trimmed.endsWith("/responses") ? trimmed : `${trimmed}/responses`;
  if (trimmed.endsWith("/chat/completions")) return trimmed;
  if (trimmed.endsWith("/v1")) return `${trimmed}/chat/completions`;
  return `${trimmed}/v1/chat/completions`;
}

function usesResponsesApi(baseUrl) {
  const value = String(baseUrl || "");
  return value.endsWith("/responses") || value.includes("/codex-omg/");
}

function normalizePayloadMessages(messages) {
  if (!Array.isArray(messages)) return [];
  return messages.slice(-16).map((message) => ({
    role: ["system", "user", "assistant"].includes(message?.role) ? message.role : "user",
    content: String(message?.content || "").slice(0, 12000)
  })).filter((message) => message.content.trim());
}

function publicMessage(message) {
  return {
    id: message.id,
    role: message.role,
    content: message.content,
    createdAt: message.createdAt
  };
}

function insertMessage(message) {
  insertMessageStatement.run(message);
  return publicMessage(message);
}

async function callChatCompletion({ authorization, baseUrl, model, temperature, messages }) {
  const targetUrl = normalizeChatUrl(baseUrl);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), UPSTREAM_TIMEOUT_MS);
  let response;
  try {
    response = await fetch(targetUrl, {
      method: "POST",
      headers: {
        Authorization: authorization,
        "Content-Type": "application/json"
      },
      signal: controller.signal,
      body: JSON.stringify(buildUpstreamBody({ model, temperature, messages, responses: usesResponsesApi(targetUrl) }))
    });
  } catch (error) {
    throw new Error(`后端无法连接模型服务：${error.message || String(error)}`);
  } finally {
    clearTimeout(timeout);
  }
  const text = await response.text();
  let payload = null;
  try {
    payload = text ? JSON.parse(text) : null;
  } catch {
    throw new Error(`Upstream returned non-JSON: ${text.slice(0, 160)}`);
  }
  if (!response.ok) {
    throw new Error(payload?.error?.message || payload?.message || `Upstream HTTP ${response.status}`);
  }
  const reply = extractUpstreamReply(payload);
  if (!String(reply).trim()) throw new Error("Upstream returned an empty reply");
  return String(reply).trim();
}

function buildUpstreamBody({ model, temperature, messages, responses }) {
  if (!responses) return { model, temperature, messages };
  const system = messages.find((message) => message.role === "system")?.content || "";
  const input = messages
    .filter((message) => message.role !== "system")
    .map((message) => ({ role: message.role === "assistant" ? "assistant" : "user", content: message.content }));
  return { model, temperature, instructions: system, input };
}

function extractUpstreamReply(payload) {
  const chatReply = payload?.choices?.[0]?.message?.content || payload?.choices?.[0]?.text || "";
  if (String(chatReply).trim()) return String(chatReply);
  if (String(payload?.output_text || "").trim()) return String(payload.output_text);
  const output = Array.isArray(payload?.output) ? payload.output : [];
  return output
    .flatMap((item) => Array.isArray(item?.content) ? item.content : [])
    .map((part) => part?.text || part?.content || "")
    .join("")
    .trim();
}

async function handleGetMessages(req, res) {
  const url = new URL(req.url, `http://${req.headers.host}`);
  const projectId = validateTextField("projectId", url.searchParams.get("projectId"), 120);
  const stage = validateStage(url.searchParams.get("stage"));
  json(res, 200, { messages: listMessagesStatement.all(projectId, stage) });
}

async function handlePostMessage(req, res) {
  const auth = String(req.headers.authorization || "");
  if (!auth.startsWith("Bearer ") || !auth.slice(7).trim()) throw new Error("Authorization bearer token is required");
  const payload = JSON.parse(await readBody(req) || "{}");
  const projectId = validateTextField("projectId", payload.projectId, 120);
  const stage = validateStage(payload.stage);
  const role = validateRole(payload.role || "user");
  const content = validateTextField("content", payload.content, 20000);
  const message = insertMessage({ id: randomUUID(), projectId, stage, role, content, createdAt: new Date().toISOString() });
  json(res, 201, { message });
}

async function handleChatCompletion(req, res) {
  const authorization = String(req.headers.authorization || "").trim();
  if (!authorization) {
    json(res, 401, { error: "Authorization header is required" });
    return;
  }

  const payload = JSON.parse(await readBody(req) || "{}");
  const projectId = validateTextField("projectId", payload.projectId, 120);
  const stage = validateStage(payload.stage);
  const model = validateTextField("model", payload.model || DEFAULT_MODEL, 120);
  const temperature = validateTemperature(payload.temperature);
  const messages = normalizePayloadMessages(payload.messages);
  if (!messages.length) throw new Error("messages is required");

  const reply = await callChatCompletion({ authorization, baseUrl: payload.baseUrl || DEFAULT_BASE_URL, model, temperature, messages });
  const message = insertMessage({ id: randomUUID(), projectId, stage, role: "assistant", content: reply, createdAt: new Date().toISOString() });
  json(res, 200, { message });
}

async function handleChat(req, res) {
  const authorization = String(req.headers.authorization || "").trim();
  if (!authorization) {
    json(res, 401, { error: "Authorization header is required" });
    return;
  }

  const payload = JSON.parse(await readBody(req) || "{}");
  const projectId = validateTextField("projectId", payload.projectId, 120);
  const stage = validateStage(payload.stage);
  const role = validateRole(payload.role || "user");
  const content = validateTextField("content", payload.content, 20000);
  const model = validateTextField("model", payload.model || DEFAULT_MODEL, 120);
  const temperature = validateTemperature(payload.temperature);
  insertMessage({ id: randomUUID(), projectId, stage, role, content, createdAt: new Date().toISOString() });

  const messages = normalizePayloadMessages(payload.messages);
  messages.push({ role, content });
  const reply = await callChatCompletion({ authorization, baseUrl: payload.baseUrl || DEFAULT_BASE_URL, model, temperature, messages });
  insertMessage({ id: randomUUID(), projectId, stage, role: "assistant", content: reply, createdAt: new Date().toISOString() });
  json(res, 200, { messages: listMessagesStatement.all(projectId, stage) });
}

async function serveStatic(req, res) {
  const url = new URL(req.url, `http://${req.headers.host}`);
  const requested = url.pathname === "/" ? "/index.html" : decodeURIComponent(url.pathname);
  const filePath = normalize(resolve(join(ROOT_DIR, requested)));
  if (!filePath.startsWith(ROOT_DIR) || filePath.startsWith(DATA_DIR)) {
    json(res, 404, { error: "Not found" });
    return;
  }
  try {
    const content = await readFile(filePath);
    res.writeHead(200, { "Content-Type": CONTENT_TYPES[extname(filePath)] || "application/octet-stream" });
    res.end(content);
  } catch {
    json(res, 404, { error: "Not found" });
  }
}

async function route(req, res) {
  try {
    const url = new URL(req.url, `http://${req.headers.host}`);
    if (req.method === "GET" && url.pathname === "/api/health") {
      json(res, 200, { ok: true, database: "sqlite", model: DEFAULT_MODEL });
      return;
    }
    if (req.method === "GET" && (url.pathname === "/api/chats" || url.pathname === "/api/messages")) {
      await handleGetMessages(req, res);
      return;
    }
    if (req.method === "POST" && url.pathname === "/api/chats") {
      await handlePostMessage(req, res);
      return;
    }
    if (req.method === "POST" && url.pathname === "/api/chat/completions") {
      await handleChatCompletion(req, res);
      return;
    }
    if (req.method === "POST" && url.pathname === "/api/chat") {
      await handleChat(req, res);
      return;
    }
    if (url.pathname.startsWith("/api/")) {
      json(res, 404, { error: "Unknown API endpoint" });
      return;
    }
    await serveStatic(req, res);
  } catch (error) {
    json(res, 400, { error: error.message || "Bad request" });
  }
}

createServer(route).listen(PORT, () => {
  console.log(`One Company OS listening on http://localhost:${PORT}`);
});

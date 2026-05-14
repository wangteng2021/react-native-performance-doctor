// ============================================================================
// SQLite 数据库层
// ----------------------------------------------------------------------------
// - 用 better-sqlite3(同步 API、快、native addon)
// - 数据文件:backend/data/yb.db
// - 表:players / spin_history / test_codes / admin_audit
// - 自动创建表和索引(IF NOT EXISTS)
// - 启动时调 init(),进程退出时 db.close()
// ----------------------------------------------------------------------------
// 注意:better-sqlite3 是同步 API。这在 Node 单线程事件循环里看起来危险,
// 但 SQLite 单行操作延迟在 10μs 级别,完全不会卡 event loop。
// ============================================================================

const fs = require("node:fs");
const path = require("node:path");
const Database = require("better-sqlite3");

const DB_DIR = path.join(__dirname, "data");
const DB_PATH = path.join(DB_DIR, "yb.db");

let db = null;

function ensureDir() {
  if (!fs.existsSync(DB_DIR)) fs.mkdirSync(DB_DIR, { recursive: true });
}

function initSchema(database) {
  database.pragma("journal_mode = WAL");
  database.pragma("synchronous = NORMAL");
  database.pragma("foreign_keys = ON");

  database.exec(`
    CREATE TABLE IF NOT EXISTS players (
      id                 INTEGER PRIMARY KEY,
      code               TEXT UNIQUE NOT NULL,
      account            TEXT NOT NULL,
      nickname           TEXT NOT NULL,
      sign               TEXT NOT NULL,
      score              REAL NOT NULL DEFAULT 100000,
      diamond            INTEGER NOT NULL DEFAULT 0,
      official           INTEGER NOT NULL DEFAULT 1,
      free_count         INTEGER NOT NULL DEFAULT 0,
      spin_count         INTEGER NOT NULL DEFAULT 0,
      total_bet          REAL NOT NULL DEFAULT 0,
      total_won          REAL NOT NULL DEFAULT 0,
      consecutive_losses INTEGER NOT NULL DEFAULT 0,
      consecutive_wins   INTEGER NOT NULL DEFAULT 0,
      created_at         TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at         TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_players_code ON players(code);

    CREATE TABLE IF NOT EXISTS spin_history (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      round_id   TEXT NOT NULL,
      player_id  INTEGER NOT NULL,
      bet        REAL NOT NULL,
      win        REAL NOT NULL DEFAULT 0,
      is_free    INTEGER NOT NULL DEFAULT 0,
      strategy   TEXT,
      bet_tier   TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (player_id) REFERENCES players(id)
    );

    CREATE INDEX IF NOT EXISTS idx_spin_player_time ON spin_history(player_id, created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_spin_time ON spin_history(created_at DESC);

    CREATE TABLE IF NOT EXISTS test_codes (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      code       TEXT UNIQUE NOT NULL,
      prefix     TEXT NOT NULL,
      scenario   TEXT NOT NULL,
      note       TEXT NOT NULL DEFAULT '',
      play_url   TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_test_codes_created ON test_codes(created_at DESC);

    CREATE TABLE IF NOT EXISTS admin_audit (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      action     TEXT NOT NULL,
      patch      TEXT NOT NULL,
      before     TEXT,
      after      TEXT,
      actor_ip   TEXT,
      actor_user TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_audit_time ON admin_audit(created_at DESC);

    CREATE TABLE IF NOT EXISTS admin_users (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      username      TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      created_at    TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at    TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS admin_sessions (
      token      TEXT PRIMARY KEY,
      username   TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      expires_at TEXT NOT NULL,
      actor_ip   TEXT,
      user_agent TEXT
    );

    CREATE INDEX IF NOT EXISTS idx_sessions_expires ON admin_sessions(expires_at);

    -- ========== WTNS Gaming 平台 (V1.2) ==========

    -- 游戏库:平台上能玩的所有游戏
    CREATE TABLE IF NOT EXISTS games (
      id               INTEGER PRIMARY KEY AUTOINCREMENT,
      game_id          TEXT UNIQUE NOT NULL,    -- 业务 ID,e.g. "pinata-fiesta-wins"
      name             TEXT NOT NULL,           -- "Pinata Fiesta Wins"
      type             TEXT NOT NULL DEFAULT 'video-slot',  -- video-slot / crash / 等等
      status           TEXT NOT NULL DEFAULT 'active',      -- active / beta / disabled
      asset_url        TEXT NOT NULL,           -- "/pinata-fiesta-wins/index.html",玩家加载游戏的 URL(第一段必须是物理目录名)
      icon_url         TEXT,                    -- 游戏图标
      description      TEXT,
      default_strategy TEXT,                    -- JSON,该游戏的全平台默认策略
      created_at       TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at       TEXT NOT NULL DEFAULT (datetime('now'))
    );

    -- 商户 × 游戏 白名单(决定哪个商户能跑哪个游戏)
    CREATE TABLE IF NOT EXISTS merchant_games (
      merchant_id TEXT NOT NULL,
      game_id     TEXT NOT NULL,
      enabled     INTEGER NOT NULL DEFAULT 1,
      created_at  TEXT NOT NULL DEFAULT (datetime('now')),
      PRIMARY KEY (merchant_id, game_id)
    );

    -- 商户对某游戏的策略 override(没有则用 game.default_strategy 兜底,再兜底全局)
    CREATE TABLE IF NOT EXISTS merchant_game_strategies (
      merchant_id     TEXT NOT NULL,
      game_id         TEXT NOT NULL,
      strategy_config TEXT NOT NULL,
      updated_at      TEXT NOT NULL DEFAULT (datetime('now')),
      PRIMARY KEY (merchant_id, game_id)
    );

    -- ========== 第三方接入 (V1.1) ==========

    -- 商户(接入方 App)
    CREATE TABLE IF NOT EXISTS merchants (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      merchant_id   TEXT UNIQUE NOT NULL,           -- 业务 ID,例如 "demo-app",在 URL/接口里用
      name          TEXT NOT NULL,                  -- 显示名称
      secret        TEXT NOT NULL,                  -- HMAC 共享密钥(只在创建时回显,管理后台后续不显示)
      status        TEXT NOT NULL DEFAULT 'active', -- active / disabled
      ip_whitelist  TEXT,                           -- 逗号分隔的 IP 白名单,空 = 不限
      callback_url  TEXT,                           -- 预留:server-to-server 回调地址(MVP 用不到)
      created_at    TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at    TEXT NOT NULL DEFAULT (datetime('now'))
    );

    -- 一次性启动 token(5 分钟过期,用一次就失效)
    CREATE TABLE IF NOT EXISTS launch_tokens (
      token            TEXT PRIMARY KEY,
      merchant_id      TEXT NOT NULL,
      external_user_id TEXT NOT NULL,
      payload          TEXT,                          -- 登录附加信息 JSON(nickname, avatar, lang 等)
      consumed_at      TEXT,
      created_at       TEXT NOT NULL DEFAULT (datetime('now')),
      expires_at       TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_launch_expires ON launch_tokens(expires_at);

    -- 资金/积分流水(每笔下注、中奖、调账)
    CREATE TABLE IF NOT EXISTS transactions (
      id             INTEGER PRIMARY KEY AUTOINCREMENT,
      txn_id         TEXT UNIQUE NOT NULL,           -- 唯一交易号,幂等键
      merchant_id    TEXT NOT NULL,
      external_user_id TEXT NOT NULL,
      player_id      INTEGER,                        -- 我方 player.id
      type           TEXT NOT NULL,                  -- bet / win / adjust
      amount         REAL NOT NULL,                  -- 正数,无论 bet 还是 win 都是正数
      balance_before REAL,
      balance_after  REAL,
      round_id       TEXT,                           -- 关联到 spin_history.round_id
      meta           TEXT,                           -- JSON 附加信息(strategy / bet_tier 等)
      created_at     TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_txn_merchant_user ON transactions(merchant_id, external_user_id, created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_txn_round ON transactions(round_id);
  `);

  // 老版本升级:逐列检查并加缺失的列
  const upgradeColumn = (table, name, ddl) => {
    const cols = database.prepare(`PRAGMA table_info(${table})`).all().map((c) => c.name);
    if (!cols.includes(name)) {
      database.exec(`ALTER TABLE ${table} ADD COLUMN ${ddl}`);
    }
  };

  upgradeColumn("admin_audit", "actor_user", "actor_user TEXT");
  upgradeColumn("admin_audit", "merchant_id", "merchant_id TEXT");
  upgradeColumn("admin_audit", "game_id", "game_id TEXT");
  upgradeColumn("players", "merchant_id", "merchant_id TEXT");
  upgradeColumn("players", "external_user_id", "external_user_id TEXT");
  upgradeColumn("players", "game_id", "game_id TEXT");
  // 商户独立策略配置(legacy,会迁到 merchant_game_strategies)
  upgradeColumn("merchants", "strategy_config", "strategy_config TEXT");
  // 测试 code 关联商户
  upgradeColumn("test_codes", "merchant_id", "merchant_id TEXT");
  upgradeColumn("test_codes", "external_user_id", "external_user_id TEXT");
  upgradeColumn("test_codes", "consumed_at", "consumed_at TEXT");
  upgradeColumn("test_codes", "game_id", "game_id TEXT");
  // 流水 / 历史 / launch token 加 game_id
  upgradeColumn("transactions", "game_id", "game_id TEXT");
  upgradeColumn("spin_history", "game_id", "game_id TEXT");
  upgradeColumn("launch_tokens", "game_id", "game_id TEXT");

  // 索引
  database.exec(
    `CREATE UNIQUE INDEX IF NOT EXISTS idx_players_merchant_user
       ON players(merchant_id, external_user_id, game_id)
       WHERE merchant_id IS NOT NULL AND external_user_id IS NOT NULL`
  );
  database.exec(`CREATE INDEX IF NOT EXISTS idx_test_codes_merchant ON test_codes(merchant_id, created_at DESC)`);
  database.exec(`CREATE INDEX IF NOT EXISTS idx_audit_merchant ON admin_audit(merchant_id, created_at DESC)`);
  database.exec(`CREATE INDEX IF NOT EXISTS idx_txn_game ON transactions(game_id, created_at DESC)`);

  // 数据迁移:把现有所有 record 的 game_id backfill 到 'pinata-fiesta-wins'
  // 这个迁移是幂等的,只更新 game_id IS NULL 的记录
  const PINATA_GAME_ID = "pinata-fiesta-wins";
  const PINATA_ASSET_URL = "/pinata-fiesta-wins/index.html";
  const FISHSTAR_GAME_ID = "fishstar";
  const FISHSTAR_ASSET_URL = "/fishstar/index.html";
  database.prepare(`UPDATE players SET game_id = ? WHERE game_id IS NULL AND merchant_id IS NOT NULL`).run(PINATA_GAME_ID);
  database.prepare(`UPDATE transactions SET game_id = ? WHERE game_id IS NULL`).run(PINATA_GAME_ID);
  database.prepare(`UPDATE spin_history SET game_id = ? WHERE game_id IS NULL`).run(PINATA_GAME_ID);
  database.prepare(`UPDATE launch_tokens SET game_id = ? WHERE game_id IS NULL`).run(PINATA_GAME_ID);
  database.prepare(`UPDATE test_codes SET game_id = ? WHERE game_id IS NULL AND merchant_id IS NOT NULL`).run(PINATA_GAME_ID);

  // Seed 唯一游戏:Pinata Fiesta Wins(如果不存在)
  const existingGame = database.prepare(`SELECT id FROM games WHERE game_id = ?`).get(PINATA_GAME_ID);
  if (!existingGame) {
    database.prepare(
      `INSERT INTO games (game_id, name, type, status, asset_url, description)
       VALUES (?, ?, ?, ?, ?, ?)`
    ).run(
      PINATA_GAME_ID,
      "Pinata Fiesta Wins",
      "video-slot",
      "active",
      PINATA_ASSET_URL,
      "5x3 video slot, 20 paylines, Mexican fiesta theme."
    );
  } else {
    // 多 repo 拆分:旧的 /pinatawins/ 路径迁到 /pinata-fiesta-wins/(跟 gameId 一致),
    // 这是一次性 idempotent 迁移,以后老库升级会自动跑。
    database.prepare(
      `UPDATE games SET asset_url = ? WHERE game_id = ? AND asset_url = ?`
    ).run(PINATA_ASSET_URL, PINATA_GAME_ID, "/pinatawins/index.html");
  }

  const existingFishStarGame = database.prepare(`SELECT status, asset_url FROM games WHERE game_id = ?`).get(FISHSTAR_GAME_ID);
  if (!existingFishStarGame) {
    database.prepare(
      `INSERT INTO games (game_id, name, type, status, asset_url)
       VALUES (?, ?, ?, ?, ?)`
    ).run(FISHSTAR_GAME_ID, "FishStar", "fishing", "active", FISHSTAR_ASSET_URL);
  } else if (existingFishStarGame.asset_url !== FISHSTAR_ASSET_URL) {
    database.prepare(
      `UPDATE games SET asset_url = ?
       WHERE game_id = ? AND asset_url <> ?`
    ).run(FISHSTAR_ASSET_URL, FISHSTAR_GAME_ID, FISHSTAR_ASSET_URL);
  }

  // 把现有 merchants.strategy_config 迁到 merchant_game_strategies(关联到 pinata-fiesta-wins)
  // 然后清空 merchants.strategy_config(避免数据双源)
  const oldStrategies = database.prepare(
    `SELECT merchant_id, strategy_config FROM merchants
       WHERE strategy_config IS NOT NULL AND strategy_config != ''`
  ).all();
  oldStrategies.forEach((row) => {
    const exists = database.prepare(
      `SELECT 1 FROM merchant_game_strategies WHERE merchant_id = ? AND game_id = ?`
    ).get(row.merchant_id, PINATA_GAME_ID);
    if (!exists) {
      database.prepare(
        `INSERT INTO merchant_game_strategies (merchant_id, game_id, strategy_config) VALUES (?, ?, ?)`
      ).run(row.merchant_id, PINATA_GAME_ID, row.strategy_config);
    }
  });
  if (oldStrategies.length > 0) {
    database.prepare(`UPDATE merchants SET strategy_config = NULL`).run();
  }

  // 给所有 active 商户默认开启唯一游戏(merchant_games)
  // 这样升级后老商户能继续接入
  database.prepare(
    `INSERT OR IGNORE INTO merchant_games (merchant_id, game_id, enabled)
       SELECT merchant_id, ?, 1 FROM merchants WHERE status = 'active'`
  ).run(PINATA_GAME_ID);

  // 给所有 active 商户默认开启 FishStar(merchant_games); INSERT OR IGNORE 保留运营手动关闭的 enabled=0
  database.prepare(
    `INSERT OR IGNORE INTO merchant_games (merchant_id, game_id, enabled)
       SELECT merchant_id, ?, 1 FROM merchants WHERE status = 'active'`
  ).run(FISHSTAR_GAME_ID);
}

function init() {
  if (db) return db;
  ensureDir();
  db = new Database(DB_PATH);
  initSchema(db);
  return db;
}

function getDb() {
  if (!db) init();
  return db;
}

function close() {
  if (db) {
    db.close();
    db = null;
  }
}

// 每天清理 1 年前的 spin_history
function pruneOldHistory(retainDays = 365) {
  const database = getDb();
  const result = database
    .prepare("DELETE FROM spin_history WHERE created_at < datetime('now', ?)")
    .run(`-${retainDays} days`);
  return result.changes;
}

// 清理过期 session
function pruneExpiredSessions() {
  const database = getDb();
  const result = database
    .prepare("DELETE FROM admin_sessions WHERE expires_at < datetime('now')")
    .run();
  return result.changes;
}

// 清理过期或已用的 launch token
function pruneLaunchTokens() {
  const database = getDb();
  const result = database
    .prepare("DELETE FROM launch_tokens WHERE expires_at < datetime('now') OR consumed_at IS NOT NULL")
    .run();
  return result.changes;
}

module.exports = {
  init,
  getDb,
  close,
  pruneOldHistory,
  pruneExpiredSessions,
  pruneLaunchTokens,
  DB_PATH
};

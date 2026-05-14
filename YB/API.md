# API 文档 — WTNS Gaming Platform

> 服务端:`backend/server.js`,Node 原生 HTTP,默认端口 3002。
> 生产基地址(全部请用 HTTPS):**`https://yb.wtnslog.site`**
>
> **多游戏平台**:从 2026-05-12 起,`launch` 必须传 `gameId`,所有玩家 / 流水 / 策略
> 都按 (商户, 游戏) 维度切分。商户接入文档单独看 [`INTEGRATION.md`](./INTEGRATION.md);
> 这份文档面向"开发者 / 排查",细节多。

---

## 目录

- [基础约定](#基础约定)
- [HTTP API](#http-api)
  - [1. 游戏配置](#1-游戏配置)
  - [2. 独立 Spin(非 Socket 客户端)](#2-独立-spin非-socket-客户端)
  - [3. 玩家登录 authLogin](#3-玩家登录-authlogin)
  - [4. 前端运行时策略](#4-前端运行时策略)
  - [5. 管理后台 — 策略读写](#5-管理后台--策略读写)
  - [6. 管理后台 — 实时统计](#6-管理后台--实时统计)
  - [6a. 管理后台 — 审计日志](#6a-管理后台--审计日志)
  - [7. 管理后台 — 测试 Code](#7-管理后台--测试-code)
  - [8. 客户端日志上报](#8-客户端日志上报)
- [Socket.IO](#socketio)
  - [连接握手](#连接握手)
  - [事件 — 客户端发](#事件--客户端发)
  - [事件 — 服务端推](#事件--服务端推)
- [数据模型](#数据模型)
  - [StrategyConfig(策略配置全量)](#strategyconfig策略配置全量)
  - [lotteryResult.ResultData(spin 核心返回)](#lotteryresultresultdataspin-核心返回)
  - [Player(内部玩家对象)](#player内部玩家对象)
- [错误与边界](#错误与边界)

---

## 基础约定

| 项 | 说明 |
|---|---|
| 编码 | 全部 UTF-8,`Content-Type: application/json; charset=utf-8` |
| 时间 | 服务器本地 Unix 毫秒时间戳 |
| CORS | 通过环境变量 `CORS_ALLOWED_ORIGINS` 白名单;开发模式默认 `*`;生产环境为 `https://yb.wtnslog.site` |
| 认证 | `/api/admin/*` 除登录端点外都要 cookie session(`yb_admin_session`,HttpOnly + Secure,7 天过期) |
| 限流 | 目前没有限流 |
| 幂等 | `POST /api/admin/strategy`、`POST /api/admin/test-codes/generate` 等接口不幂等 |
| Cache-Control | `admin/*.html/js/css` 全部 `no-cache`;`pinatawins/` 带 hash 的文件 1 年;`.html` no-cache;其他静态 1 天 |

---

## HTTP API

### 1. 游戏配置

```http
GET /api/game
```

返回完整的游戏静态定义(轮数、paylines、符号表、默认下注档位等)。前端加载时调一次。

**响应 200**

```json
{
  "id": "pinata-fiesta-wins-original",
  "title": "Piñata Fiesta Wins",
  "type": "video-slot",
  "reels": 5,
  "rows": 3,
  "paylines": [[0,0,0,0,0], ...],
  "defaultBalance": 1200,
  "bets": [6, 12, 30, 60, 120, 300],
  "rtp": "demo math",
  "volatility": "medium-high demo",
  "maxWin": "simulated 5000x cap not enforced",
  "symbols": [
    {
      "id": "wild",
      "label": "Festival Wild",
      "asset": "wild",
      "role": "wild",
      "tier": "feature",
      "payouts": { "3": 20, "4": 80, "5": 400 }
    }
  ],
  "rules": ["5 reels × 3 rows with 20 fixed paylines...", ...]
}
```

---

### 2. 独立 Spin(非 Socket 客户端)

```http
POST /api/spin
Content-Type: application/json

{
  "bet": 12,
  "balance": 1200,
  "freeSpin": false
}
```

简化版 spin 接口,**不走策略引擎**(纯随机),不影响玩家会话,**Cocos 客户端走 Socket.IO 而不是这个**。

**请求体**

| 字段 | 类型 | 默认 | 范围/说明 |
|---|---|---|---|
| `bet` | number | 12 | 1 ~ 500,单局总下注 |
| `balance` | number | 1200 | 0 ~ ∞,玩家当前余额 |
| `freeSpin` | boolean | false | 是否免费旋转(不扣余额) |

**响应 200(成功)**

```json
{
  "accepted": true,
  "board": [[...], [...], [...]],
  "bet": 12,
  "freeSpin": false,
  "balance": 1436,
  "totalWin": 248,
  "baseLineWin": 248,
  "scatterWin": 0,
  "multiplierApplied": 1,
  "collectedMultipliers": [],
  "wins": [
    { "line": 1, "symbol": "maracas", "label": "Maracas",
      "count": 3, "positions": [...], "amount": 144 }
  ],
  "freeSpinsAwarded": 0,
  "roundId": "PFW-1715000000000-abcdef"
}
```

**响应 200(余额不足)**

```json
{
  "accepted": false,
  "reason": "Insufficient balance",
  "balance": 5
}
```

---

### 3. 玩家登录 authLogin

```http
POST /authLogin?code=<CODE>
或
GET  /authLogin?code=<CODE>
```

Cocos 客户端启动时调用,创建或返回本地玩家会话。第一次用某 `code` 会创建新玩家;后续同 `code` 返回已有玩家。

**Query**

| 参数 | 类型 | 必填 | 说明 |
|---|---|---|---|
| `code` | string | 是 | 玩家唯一 code;不传会用 `"local"` 作为默认 |

**响应 200**

```json
{
  "resultid": 1,
  "Obj": {
    "account": "local_10001",
    "sign": "sgn_a4a2f82f6b92afea",
    "id": 10001,
    "nickname": "Local Player 10001",
    "score": 100000,
    "diamond": 0,
    "official": true
  }
}
```

`Obj.id` 用于 Socket.IO 里 LoginGame 事件的 `userid` 字段。

---

### 4. 前端运行时策略

```http
GET /api/strategy
```

前端启动时(`runtime-config.js`)读取,只暴露玩家可见的配置。

**响应 200**

```json
{
  "bigWinMultiplier": 20,
  "rtpTarget": 0.92
}
```

---

### 4a. 管理后台 — 登录 / 退出 / me

#### 4a.1 登录

```http
POST /api/admin/login
Content-Type: application/json

{
  "username": "admin",
  "password": "..."
}
```

成功返回 200 + `Set-Cookie: yb_admin_session=<token>; ...`。**后续所有 /api/admin/\* 请求都要带这个 cookie**。

```json
{
  "ok": true,
  "username": "admin",
  "expiresAt": "2026-05-18 14:18:47"
}
```

错误返回 401 `{"ok": false, "error": "invalid credentials"}`。

#### 4a.2 退出

```http
POST /api/admin/logout
Cookie: yb_admin_session=...
```

返回 200 + `Set-Cookie` 清空 cookie。

#### 4a.3 当前登录身份

```http
GET /api/admin/me
Cookie: yb_admin_session=...
```

```json
{ "ok": true, "username": "admin", "expiresAt": "2026-05-18 14:18:47" }
```

没登录返回 401。

---

### 5. 管理后台 — 策略读写

> ⚠️ 多游戏平台后,strategy 走三级 fallback:
> **(merchant, game) override > game.default_strategy > strategy-config.json 全局兜底**。
> 下面 `/api/admin/strategy` 是改全局兜底;改 (merchant, game) 走 `5.3`;改 game default 走 `5.4`。

#### 5.1 GET 完整策略(全局兜底)

```http
GET /api/admin/strategy
```

**响应 200**:完整的 [StrategyConfig](#strategyconfig策略配置全量) 对象。

#### 5.2 POST 部分/完整策略(全局兜底)

```http
POST /api/admin/strategy
Content-Type: application/json
```

请求体是 StrategyConfig 的**部分 patch**,后端会深合并到当前配置并 sanitize(clamp 所有数字到合理范围),最后落盘 `backend/strategy-config.json`。

**请求示例:只改 2 个字段**

```json
{
  "bigWinMultiplier": 30,
  "rtpTarget": 0.95
}
```

**请求示例:只改某一个 tier 的参数**

```json
{
  "betTiers": {
    "high": {
      "forceWinChance": 0.08,
      "surplusBetMultiplier": 2
    }
  }
}
```

**响应 200**:sanitize 合并后的完整 StrategyConfig(即落盘后的真实值)。

**边界**

- 超出范围的数字会被 clamp(例如 `rtpTarget: 99` 会被限制到 1.5)
- `midMaxBet < lowMaxBet + 1` 会被强制到 `lowMaxBet + 1`

#### 5.3 GET / POST (商户, 游戏) 策略 override

```http
GET  /api/admin/merchants/{merchantId}/games/{gameId}/strategy
POST /api/admin/merchants/{merchantId}/games/{gameId}/strategy
```

GET 返回 `{ ok, strategy, hasOverride }`,`strategy` 是 `getEffectiveStrategy(m, g)` 的结果(已经
合并好了三级 fallback);`hasOverride: true` 说明真的有 row 在 `merchant_game_strategies` 表里。

POST body 是 strategy patch,只覆盖你给的字段,落到 `merchant_game_strategies` 表。
sanitize 规则跟 5.2 完全一致。

#### 5.4 POST 游戏的 default 策略

```http
POST /api/admin/games/{gameId}/default-strategy
```

body 是 patch,落到 `games.default_strategy` 字段(JSON column)。仅用于"该游戏开到任意商户、
该 (商户,游戏) 没自定义" 时的 fallback。

#### 5.5 平台游戏 CRUD

```http
GET  /api/admin/games                        列出所有游戏
POST /api/admin/games                        新增游戏(body: gameId, name, type, assetUrl, iconUrl, description)
GET  /api/admin/games/{gameId}               单个游戏详情
POST /api/admin/games/{gameId}               更新元信息(body: name/type/status/assetUrl/...)
GET  /api/admin/merchants/{m}/games          某商户已开通的游戏白名单
POST /api/admin/merchants/{m}/games          切换某游戏 enabled(body: { gameId, enabled })
```

---

### 6. 管理后台 — 实时统计

```http
GET /api/admin/stats
```

**响应 200**

```json
{
  "totalBet": 24500,
  "totalWon": 22120,
  "rtp": 0.9029,
  "playerCount": 3,
  "players": [
    {
      "id": 10001,
      "nickname": "Local Player 10001",
      "score": 100345,
      "spinCount": 45,
      "totalBet": 2700,
      "totalWon": 3045,
      "rtp": 1.1278,
      "net": 345,
      "consecutiveLosses": 0,
      "consecutiveWins": 2
    }
  ]
}
```

`totalBet` / `totalWon` / `rtp` 从 SQLite `players` 表聚合。**pm2 restart 数据保留**。

---

### 6a. 管理后台 — 审计日志

```http
GET /api/admin/audit?limit=100
```

返回 `admin_audit` 表的最新 N 条(默认 100,最多 500)。每条记录了**谁、什么时候、改了什么**。

**响应 200**

```json
{
  "ok": true,
  "items": [
    {
      "id": 2,
      "action": "strategy.update",
      "patch": { "bigWinMultiplier": 25 },
      "before": { "bigWinMultiplier": 20, "...": "..." },
      "after":  { "bigWinMultiplier": 25, "...": "..." },
      "actorIp": "120.53.24.116",
      "createdAt": "2026-05-11 11:02:49"
    }
  ]
}
```

---

### 7. 管理后台 — 测试 Code

> ⚠️ 测试 code 现在**必须绑 (商户, 游戏)**:`generate` body 里 `merchantId` + `gameId` 都是必填,
> 服务端会校验 `(merchant, game)` 在白名单里且 enabled。

#### 7.1 列出最近生成记录

```http
GET /api/admin/test-codes?merchantId=&gameId=&limit=
```

可按 `merchantId` / `gameId` 过滤;limit 默认 50。

**响应 200**

```json
{
  "ok": true,
  "count": 3,
  "codes": [
    {
      "code": "qa-new-user-l4kj0x1p-abc12345",
      "scenario": "new-user-journey",
      "note": "给 QA 测试第一局中奖体验",
      "createdAt": "2026-05-11T14:35:22.000Z",
      "playUrl": "https://yb.wtnslog.site/mobile-preview.html?lang=en&code=..."
    }
  ]
}
```

**限制**:只保留最近 500 条,`pm2 restart` 会清空。

#### 7.2 批量生成

```http
POST /api/admin/test-codes/generate
Content-Type: application/json

{
  "merchantId": "demo-app",
  "gameId": "pinata-fiesta-wins",
  "prefix": "qa-new-user",
  "count": 3,
  "scenario": "new-user-journey",
  "note": "给 QA 测试前 30 局"
}
```

**请求体**

| 字段 | 类型 | 默认 | 限制 |
|---|---|---|---|
| `merchantId` | string | — | **必填**,且必须存在 |
| `gameId` | string | — | **必填**,且 (merchantId, gameId) 必须在 `merchant_games` 表里 enabled |
| `prefix` | string | `"new-user-test"` | 自动 slug 化;≤ 40 字符 |
| `count` | number | 1 | 1 ~ 100 |
| `scenario` | string | `"new-user-journey"` | slug;≤ 40 字符 |
| `note` | string | `""` | ≤ 200 字符 |

**响应 200**

```json
{
  "ok": true,
  "count": 3,
  "codes": [
    {
      "code": "qa-new-user-l4kj0x1p-abc12345",
      "scenario": "new-user-journey",
      "note": "给 QA 测试前 30 局",
      "createdAt": "2026-05-11T14:35:22.000Z",
      "playUrl": "https://yb.wtnslog.site/mobile-preview.html?lang=en&code=qa-new-user-l4kj0x1p-abc12345&backurl=openurl://closegame&debugLog=1"
    }
  ]
}
```

`playUrl` 可以直接发给测试人员,打开即可用新用户身份玩。

---

### 8. 客户端日志上报

```http
POST /__client-log
Content-Type: application/json or text/plain

任何 JSON 字符串
```

仅当客户端 URL 带 `?debugLog=1` 时,Cocos 客户端会把 XHR 请求/响应、JS error 发到这里。服务端只 `console.log`,不持久化。

**响应 200**

```json
{ "ok": true }
```

---

## Socket.IO

使用 **Socket.IO v3 polling transport**(仅 polling,无 websocket 升级),协议为 Engine.IO v3。

> 推荐的原因:Cocos 客户端直接用这个协议,服务端实现成本低。

### 连接握手

#### 1. GET 拿 sid

```http
GET /socket.io/?EIO=3&transport=polling
```

返回 1 个 open packet:

```
86:0{"sid":"sid_f963a8c170bf6894","upgrades":[],"pingInterval":25000,"pingTimeout":60000}
```

从中提取 `sid`(会话 ID)。

#### 2. 发送 socket namespace 连接

客户端发:`40` (不带 sid 时)

#### 3. 心跳

每 25 秒客户端发 `2`,服务端回 `3`。

### 事件 — 客户端发

所有事件用 Socket.IO 标准格式:`42["<eventName>", <payload>]`,包装在 Engine.IO packet 里。

#### `LoginGame`

游戏登录,绑定会话和玩家账号。

```json
42["LoginGame", { "code": "<同 authLogin 的 code>", "gameId": 1, "phoneType": "web", "userid": 10001 }]
```

服务端返回:`loginGameResult`(见下方)。

#### `LoginfreeCount`

查询玩家当前免费旋转次数。

```json
42["LoginfreeCount", {}]
```

#### `lottery`

**Spin 核心事件**,请求一次旋转。

```json
42["lottery", {
  "nBetList": [100, 1],
  "code": "<code>"
}]
```

| 字段 | 类型 | 说明 |
|---|---|---|
| `nBetList` | number[] | 数组第 0 位是本局总下注(支持组合投注但只取第一个) |
| `code` | string | 玩家 code(用于 fallback 匹配会话) |
| `bet` | number | `nBetList` 不存在时的兼容字段 |

服务端返回:`lotteryResult`(详见下方 [ResultData](#lotteryresultresultdataspin-核心返回))。

#### `history`

查询该会话最近的旋转历史(最多 20 条)。

```json
42["history", {}]
```

#### `syncBalance`

同步当前玩家余额。

```json
42["syncBalance", {}]
```

### 事件 — 服务端推

| 事件 | 作用 |
|---|---|
| `loginGameResult` | 登录结果 |
| `LoginfreeCountResult` | 免费旋转次数 |
| `lotteryResult` | spin 结果(**核心**) |
| `historyResult` | 历史记录 |
| `syncBalanceResult` | 当前余额 |

#### `loginGameResult`

```json
[ "loginGameResult", { "resultid": 1, "Obj": { "nGamblingWinPool": 8888888 } } ]
```

#### `LoginfreeCountResult`

```json
[ "LoginfreeCountResult", { "ResultCode": 1, "freeCount": 0 } ]
```

#### `lotteryResult`

**核心返回**,详细字段见 [ResultData](#lotteryresultresultdataspin-核心返回)。

#### `historyResult`

```json
[ "historyResult", { "ResultCode": 1, "Result": [ { "lotteryTime": 1715000000000, "id": "PFW_xxx", "score_linescore": 100, "score_win": 240 } ] } ]
```

#### `syncBalanceResult`

```json
[ "syncBalanceResult", { "ResultCode": 1, "Result": { "balance": 100345 } } ]
```

---

## 数据模型

### StrategyConfig(策略配置全量)

全量 schema 见 [`backend/strategy-config.example.jsonc`](./backend/strategy-config.example.jsonc)(带注释)。
字段参考默认值:

```json
{
  "rtpTarget": 0.92,
  "rtpTolerance": 0.03,
  "bigWinMultiplier": 20,
  "maxWinMultiplier": 5000,
  "baseForceWinChance": 0.18,
  "baseNearMissChance": 0.24,

  "newUserProtection": { "enabled": true, "spins": 30, "...": "..." },
  "lossRelief":         { "enabled": true, "consecutiveLosses": 4, "...": "..." },
  "winCooling":         { "enabled": true, "consecutiveWins": 3, "...": "..." },
  "nearMiss":           { "enabled": true, "chance": 0.28 },

  "betTiers": {
    "enabled": true,
    "lowMaxBet": 50,
    "midMaxBet": 500,
    "low":  { "forceWinChance": 0.32, "...": "..." },
    "mid":  { "forceWinChance": 0.18, "...": "..." },
    "high": { "forceWinChance": 0.10, "...": "..." }
  }
}
```

### lotteryResult.ResultData(spin 核心返回)

```json
{
  "id": "PFW_xxx",                 // string  本轮 ID
  "userscore": 100250,             // number  spin 后的玩家余额
  "winscore": 1364,                // number  本局赢的分数(0 表示没中奖)
  "totalBet": 100,                 // number  本局总下注
  "freeCount": 0,                  // number  剩余免费旋转次数
  "bigWinMultiplier": 20,          // number  当前大奖阈值(给前端判断播不播动画)
  "rtpTarget": 0.92,               // number  当前目标 RTP(前端展示用)
  "strategy": "base-win",          // string  本局走的策略路径,见下表
  "betTier": "mid",                // string  low / mid / high / null
  "gameId": "pinata-fiesta-wins",  // string  本局对应的游戏(WTNS Gaming 平台标识)
  "getFreeTime": {
    "bFlag": false,                // boolean 本局是否新触发了免费旋转
    "nFreeTime": 0                 // number  新触发的免费旋转次数
  },
  "viewarray": [                    // 前端盘面呈现用(中奖动画 / 终态)
    {
      "nHandCards": [0, 0, 0, ...], // 15 个符号 ID,从下到上从左到右
      "nWinCards":  [false, ...],   // 15 个 boolean,中奖格标 true
      "nWinLinesDetail": [[0,0,0,0,0]],
      "win": 1364,
      "scl": {},
      "combo_num": 0,
      "aw": 1364
    }
  ]
}
```

#### `strategy` 枚举

| 值 | 什么时候出现 |
|---|---|
| `random` | 随机盘面,没有任何干预 |
| `base-win` | 走 base/tier 的 forceWin 路径,主动给中奖 |
| `base-near-miss` | 走 base/tier 的 nearMiss 路径,给差一点中 |
| `near-miss` | nearMiss 配置的独立触发 |
| `cooldown` | 连续赢 / 盈余过多触发冷却 |
| `loss-relief` | 连续亏 / 亏损过多触发补偿 |
| `new-user-first-win` | 新用户第 1 局 88% 走这个 |
| `new-user-first-near-miss` | 新用户第 1 局 12% 走这个 |
| `new-user-early-win` | 新用户前 25% 局中奖 |
| `new-user-paced-win` | 新用户 25%-100% 局中奖 |
| `new-user-loss-relief` | 新用户连输补偿 |
| `new-user-breathing-room` | 新用户连赢降温 |
| `new-user-near-miss` | 新用户 near-miss |
| `new-user-quiet-spin` | 新用户普通局(没中) |

#### `ResultCode` 枚举

| 值 | 含义 |
|---|---|
| `1` | 正常 |
| `-2` | 余额不足(`userscore < totalBet`) |

### Player(内部玩家对象)

内部结构,给管理后台的 `/api/admin/stats.players[]` 参考:

| 字段 | 说明 |
|---|---|
| `id` | number,10001 起递增 |
| `account` | `local_<id>` |
| `nickname` | `Local Player <id>` |
| `sign` | 内部签名 |
| `score` | 当前余额(默认起始 100000) |
| `diamond` | 钻石(默认 0,未启用) |
| `official` | 是否官方账号(默认 true,没什么用) |
| `freeCount` | 剩余免费旋转次数 |
| `spinCount` | 累计旋转次数 |
| `totalBet` | 累计下注 |
| `totalWon` | 累计赢的 |
| `consecutiveLosses` | 连输次数 |
| `consecutiveWins` | 连赢次数 |

**`score`、`totalBet`、`totalWon` 等全部在 SQLite `players` 表里,`pm2 restart` 不丢**。

---

## 错误与边界

| 场景 | HTTP Status | Body |
|---|---|---|
| 请求体 > 1 MB | 请求被 destroy,**连接中断** | — |
| 请求路径不存在 | 404 | `Not found` |
| 请求访问 rootDir 外 | 403 | `Forbidden` |
| Method 不允许 | 405(仅 socket.io) | `Method not allowed` |
| 抛异常 | 500 | `{ "error": "<message>" }` |
| Socket.IO 非 polling | 400 | `Only polling transport is supported locally` |
| Socket.IO sid 不存在 | 400 | `Unknown Socket.IO session` |

---

## 附录:curl 速查

```bash
# 游戏配置
curl https://yb.wtnslog.site/api/game

# 策略配置(完整)
curl https://yb.wtnslog.site/api/admin/strategy | jq

# 改配置(只改两个字段)
curl -X POST https://yb.wtnslog.site/api/admin/strategy \
  -H 'Content-Type: application/json' \
  -d '{"bigWinMultiplier": 30, "rtpTarget": 0.95}' | jq

# 实时统计
curl https://yb.wtnslog.site/api/admin/stats | jq

# 生成 3 个测试 code
curl -X POST https://yb.wtnslog.site/api/admin/test-codes/generate \
  -H 'Content-Type: application/json' \
  -d '{"prefix": "qa-test", "count": 3}' | jq

# authLogin
curl -X POST 'https://yb.wtnslog.site/authLogin?code=test_user' | jq

# 独立 spin(bypass 玩家会话)
curl -X POST https://yb.wtnslog.site/api/spin \
  -H 'Content-Type: application/json' \
  -d '{"bet": 12, "balance": 1000}' | jq
```

---

**最后更新**:2026-05-11

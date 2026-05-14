# WTNS Gaming Platform

多游戏第三方接入平台。当前内置游戏:Pinata Fiesta Wins(5x3 老虎机)和 FishStar(捕鱼)。
平台层把"游戏 / 商户 / 策略 / 流水"完全解耦,新游戏只需注册 +
绑商户即可上线,旧游戏的玩家 / 流水 / 策略全部迁移完毕。

> 历史名:YB Pinata Fiesta(单游戏时代),已演进为 WTNS Gaming Platform。

## 📚 相关文档

| 文档 | 给谁看 | 讲什么 |
|---|---|---|
| [`README.md`](./README.md)(本文) | 所有人 | 总览、架构、功能、快速上手 |
| [`API.md`](./API.md) | 开发 / 对接 | 所有 HTTP + Socket.IO 接口,数据模型 |
| [`INTEGRATION.md`](./INTEGRATION.md) | 第三方接入方 | 商户接入手册:HMAC、launch、JS Bridge、回调 |
| [`OPERATIONS.md`](./OPERATIONS.md) | 运营 / 老板 | 业务视角,不写代码 — 怎么调 RTP、应对投诉、whale 保护 |
| [`SERVER-OPS.md`](./SERVER-OPS.md) | 运维 | 服务器运维、调参经验、故障排查、变更记录 |
| [`DEPLOYMENT.md`](./DEPLOYMENT.md) | 换服务器时 | 从零到一的完整部署流程 |
| [`backend/strategy-config.example.jsonc`](./backend/strategy-config.example.jsonc) | 开发 / 运营 | 策略配置每个字段的注释版参考 |

---

## 一、生产环境

| 项 | 值 |
|---|---|
| 平台官网 | https://yb.wtnslog.site/(WTNS Gaming landing) |
| 商户接入入口 | `POST https://yb.wtnslog.site/api/merchant/launch` |
| 玩家 embed 入口 | `https://yb.wtnslog.site/embed?token=<launchToken>` |
| 管理后台 | https://yb.wtnslog.site/admin/(WTNS Gaming · Admin) |
| API 健康检查 | https://yb.wtnslog.site/api/game |
| 公开游戏列表 | https://yb.wtnslog.site/api/public/games |

> ⚠️ **不再支持游戏直链访问**:
> `/pinata-fiesta-wins/*`、`/fishstar/*` 等游戏资源目录现在受签名 cookie 保护,匿名访问会被 302 弹到官网。
> 玩家**必须**走商户的 `POST /api/merchant/launch` 拿一次性 token,通过 `/embed?token=…`
> 颁发 `yb_embed_session` cookie 后才能进游戏。

---

## 二、架构(平台 = 游戏 × 商户)

```
WTNS Gaming Platform
    │
    ├── 游戏库 (games)
    │     └── pinata-fiesta-wins  (asset_url=/pinata-fiesta-wins/index.html)
    │     └── fishstar            (asset_url=/fishstar/index.html)
    │     └── future-spins        (active / disabled / beta)
    │     └── …
    │
    ├── 商户 (merchants)
    │     └── demo-app  (secret, IP 白名单, status)
    │     └── partner-x …
    │
    ├── 商户 × 游戏 白名单 (merchant_games)
    │     "demo-app" + "pinata-fiesta-wins" → enabled
    │     "demo-app" + "fishstar"           → enabled / disabled
    │
    └── 商户 × 游戏 策略 override (merchant_game_strategies)
          (商户希望对 pinata 调高 RTP,只覆盖该 (商户, 游戏) 对)
```

策略优先级(同一 spin 计算时):

```
merchant_game_strategies.(商户, 游戏)   ← 最高
   │
   ↓ fallback
games.default_strategy.(游戏)
   │
   ↓ fallback
strategy-config.json (全局兜底)
```

---

## 三、目录结构

```text
backend/
  server.js                  Node 原生 HTTP,API/Socket.IO/静态托管(端口 3002)
  db.js                      SQLite schema + 自动迁移(games 表、game_id 列)
  gameService.js             游戏库 CRUD + 商户白名单 + (商户,游戏) 策略
  merchantService.js         商户 CRUD、HMAC 校验、launch token、流水
  pinataLocalService.js      authLogin、Socket.IO 事件、玩家会话(走 (商户,游戏) 策略)
  gameStrategyConfig.js      全局策略配置 + getEffectiveStrategy(merchantId, gameId)
  gameEngine.js              老虎机算法
  testCodeService.js         测试 code 生成(必须带 gameId)
  adminAuth.js               admin 登录、session
  strategy-config.json       全局兜底策略数据(管理后台写回)

frontend/
  index.html                 WTNS Gaming 官网 landing(暗色 + 渐变)
  site.css / site.js         landing 配套样式 + 游戏列表 fetch 脚本
  pinata-fiesta-wins/        Pinata Fiesta Wins 游戏(必须有签名 launch cookie 才能访问)
    index.html
    bridge.js                JS Bridge:setMute/setSound/setVolume/closeGame
    win-effect.js / .css     英文大奖动画
    runtime-config.js
  fishstar/                  本地重构的 FishStar 捕鱼游戏,复用同一后端协议和 PinataGame bridge
    index.html
    assets.js / game.js      Canvas 捕鱼 UI + 远程真实音效链接
    bridge.js / protocol.js  App bridge + /authLogin + Socket.IO polling

admin/                       WTNS Gaming · Admin 后台(每页内联 JS + shared.js)
  login.html / login.js
  index.html                 总览(全平台 + 24h 各游戏分布)
  games.html / game.html     游戏库 / 单游戏详情(默认策略 + 已开通商户)
  merchants.html             商户列表
  merchant.html              商户详情(可用游戏 / 策略×游戏 / Tier×游戏 / Code×游戏 / 流水 / 玩家)
  transactions.html          全局流水(可按 merchant + game 过滤)
  audit.html                 操作审计(可按 merchant + game + action 过滤)
  shared.js / styles.css

scripts/                     仅本地准备资源用,不要上生产
ecosystem.config.js          PM2 配置(PORT=3002, CORS 白名单)
deploy.sh                    服务器一键部署脚本
```

---

## 四、SQLite 表(`backend/data/yb.db`,WAL)

| 表 | 存什么 |
|---|---|
| `games` | 游戏库:`game_id`、`name`、`type`、`status (active/beta/disabled)`、`asset_url`、`default_strategy` |
| `merchants` | 商户:`merchant_id`、`secret`、`ip_whitelist`、`callback_url`、`status` |
| `merchant_games` | 商户 × 游戏 白名单:`(merchant_id, game_id, enabled)` |
| `merchant_game_strategies` | 商户 × 游戏 策略 override:`(merchant_id, game_id, strategy_config_json)` |
| `players` | 玩家:`(merchant_id, external_user_id, game_id)` 唯一 — 同一外部用户在不同游戏视为独立账户 |
| `transactions` | 流水:每条带 `game_id` |
| `spin_history` | spin 记录(保留 1 年,启动后每 24h 清理),带 `game_id` |
| `launch_tokens` | merchant launch 颁发的一次性 token,带 `game_id` |
| `test_codes` | QA 测试 code,**必须带 `game_id`** + `merchant_id` |
| `admin_audit` | admin 操作审计,带可选 `merchant_id` + `game_id` |
| `admin_users` / `admin_sessions` | 管理员账号 / 登录态 |

数据 / 配置在 `pm2 restart` 后保留。

---

## 五、平台核心流程

### 5.1 注册一个新游戏

1. 把游戏前端资源放到 `frontend/<game-id>/`(必须有 `index.html` 入口)
2. Admin · 游戏 · 新增 → 填 `gameId`、`name`、`type`、`assetUrl=/<game-id>/index.html`
3. 进每个商户详情 · 可用游戏 → 勾选启用
4. 商户 launch 时传 `gameId` 即可走通

### 5.2 商户接入(完整集成方式见 [`INTEGRATION.md`](./INTEGRATION.md))

```
商户后端 ──HMAC 签名──▶  /api/merchant/launch (gameId 必填)
                              │
                              ▼
                        服务端校验:
                          - HMAC 时间戳 + 签名
                          - IP 白名单
                          - 商户 status=active
                          - merchant_games.(商户, 游戏).enabled=1   ← 关键!
                              │
                              ▼
                        颁发一次性 launchToken
                              │
                              ▼
玩家浏览器 ──▶  /embed?token=...  ──▶  Set-Cookie(含 gameId) ──▶ 302 → game.asset_url
```

### 5.3 策略生效优先级(spin 时)

```js
// pinataLocalService.recordSpin → pickStrategy
const cfg = getEffectiveStrategy(merchantId, gameId);
// 内部:
//   1) merchant_game_strategies.(merchantId, gameId)  → 浅合并
//   2) games.(gameId).default_strategy                → 浅合并
//   3) strategy-config.json (全局)                    → 兜底
```

任意一层缺失就 fallback 到下一层,运营可以"只覆盖关心的字段"。

### 5.4 同一玩家跨游戏

`players` 唯一键 = `(merchant_id, external_user_id, game_id)`。
同一商户的 `userA` 在 pinata-fiesta-wins 是 100k 余额,在 future-spins 是另一个独立账户。

---

## 六、返奖策略(自研)

下面字段都属于"全局兜底",在游戏 / (商户, 游戏) 上可以单独覆盖:

| 字段 | 默认 | 作用 |
|---|---|---|
| `rtpTarget` | 0.92 | 目标返奖率 |
| `rtpTolerance` | 0.03 | 实际偏离目标超过这个值才触发补偿/降温 |
| `bigWinMultiplier` | 20 | 中奖倍数 ≥ 这个值才触发大奖动画 |
| `maxWinMultiplier` | 5000 | 单次中奖封顶倍数 |

新用户保护(前 30 局)、玩家级 lossRelief / winCooling / nearMiss、Bet-Tier 分级体验等
全部组合在策略对象里,详情见 [`backend/strategy-config.example.jsonc`](./backend/strategy-config.example.jsonc)。

### Bet-Tier 分级下注

| Tier | 边界(默认) | 设计目标 |
|---|---|---|
| **Low** | totalBet ≤ 50 | 高频小奖,新手梦想感,中奖率 ~65% / 平均 2.7× |
| **Mid** | 50 < totalBet ≤ 500 | 标准体验,中奖率 ~17% / 平均 6.6× |
| **High** | totalBet > 500 | 低频大奖、whale 体验,中奖率 ~13% / 平均 16× |

每个 tier 7 个独立参数(`forceWinChance` / `nearMissChance` / `targetWinMultiplierMin/Max` /
`surplusBetMultiplier` / `deficitBetMultiplier` / `bigWinBoost`),管理后台可视化编辑。

---

## 七、英文大奖动画

`frontend/pinatawins/win-effect.js` 的全屏英文 overlay,根据 `winscore / totalBet` 倍数分级显示:

| 倍数(基于 `bigWinMultiplier`) | 标题 |
|---|---|
| 1× ~ 2× threshold | **BIG WIN** |
| 2× ~ 5× threshold | **MEGA WIN** |
| 5× ~ 10× threshold | **SUPER MEGA WIN** |
| ≥ 10× threshold | **EPIC WIN** |

阈值跟着 (商户,游戏) 的 `bigWinMultiplier` 走,改 admin 立即生效。

URL 参数:
- `?testWin=1` — 测试模式,加载后 1.2s 触发一次假 BIG WIN
- `?socketWinFx=0` — 关闭 overlay,显示 Cocos 自带中文动画

---

## 八、管理后台 (`/admin/`)

需要登录(`ADMIN_USERNAME` / `ADMIN_PASSWORD` 环境变量初始化,scrypt 哈希存,7 天 cookie)。

| 页面 | 内容 |
|---|---|
| **首页** (`/admin/`) | 平台 KPI:游戏数、商户数、24h 总下注/中奖/GGR/RTP、24h **各游戏分布表** |
| **游戏** (`/admin/games.html`) | 游戏库列表 + 新增游戏(注册 `gameId`、资源 URL 等) |
| **游戏详情** (`/admin/game.html?id=xxx`) | 编辑元信息、改本游戏的**默认策略**、看哪些商户开通了它 |
| **商户** (`/admin/merchants.html`) | 商户列表 + 新建 |
| **商户详情** (`/admin/merchant.html?id=xxx`) | 6 个 tab: 可用游戏 / 策略×游戏 / Tier×游戏 / 测试 Code×游戏 / 流水 / 玩家 |
| **流水** (`/admin/transactions.html`) | 全局流水,按 merchant + game + 用户 + 类型过滤 |
| **审计** (`/admin/audit.html`) | 谁什么时候改了什么(strategy / game / merchant 都被记录) |

---

## 九、本地开发

```bash
npm install
npm start                              # 默认 PORT=3000
ADMIN_PASSWORD=xxx npm start           # 第一次起会创建 admin 用户
PORT=3999 ADMIN_PASSWORD=xxx node backend/server.js
npm run check                          # 全部 .js 语法检查(包括 gameService.js)
```

### 环境变量

| 变量 | 默认 | 说明 |
|---|---|---|
| `PORT` | 3000 | Node 监听端口 |
| `CORS_ALLOWED_ORIGINS` | `*`(dev) | CORS 白名单,生产必须显式 |
| `ADMIN_USERNAME` | `admin` | 默认管理员账号 |
| `ADMIN_PASSWORD` | (无,**必填**) | 第一次启动会用 scrypt 写入 admin_users |

参考 [`.env.example`](./.env.example)。

---

## 十、合规说明

这是一个原创实现,只保留"彩罐/节日/Slot"的通用玩法氛围,不包含原 PinataWins 的专有资源、源代码或品牌素材。

如需替换成你拥有授权的素材:

1. 把图片放进 `frontend/assets/licensed/`
2. 编辑 `frontend/assets/asset-manifest.json` 映射符号 → 图片
3. 刷新页面前端会优先用授权素材,缺失的回落到内置 SVG

镜像脚本(只在拥有授权时显式传入 base URL):

```bash
PINATA_MIRROR_BASE_URL="<your-authorized-asset-base-url>/" python3 scripts/mirror_pinatawins.py
```

---

## 十一、当前已知限制

- Socket.IO session 仍是内存态,`pm2 restart` 后会断连(客户端自动重连,玩家无感)
- 公开域名(yb.wtnslog.site)境外解析占位 IP,**国内用户不受影响**
- 当前游戏库只有 1 个生产游戏(pinata-fiesta-wins),其它游戏接入时把资源拷到
  `frontend/<game-id>/` 后在 admin 注册即可

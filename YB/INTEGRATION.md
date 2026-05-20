# 三方接入文档 — WTNS Gaming Platform

> 给接入方(iOS / Android App / Web 开发者)看的对接指南。
>
> 平台同时承载多个游戏,商户在 launch 时**必须**指定 `gameId`,服务端会校验
> 该商户是否被开通了这个游戏(白名单)。

---

## 接入流程总览

```
┌────────┐     1. server-to-server: POST /api/merchant/launch    ┌──────────┐
│ 商户   │ ────────  body 必须含 gameId  ─────────────────────►  │ 我们的   │
│ 后端   │     ◄─── 返回 { token, gameUrl, gameId } ────────────  │ 服务     │
└────────┘                                                       └──────────┘
    │
    │ 2. 把 gameUrl 推给 App
    ▼
┌──────────────────────────────────────────────────────────────────┐
│ App                                                              │
│   ┌──────────────────────────────────┐                           │
│   │ WKWebView / WebView              │                           │
│   │   加载 gameUrl                   │                           │
│   │   ↕ JS Bridge ↕                  │                           │
│   │ window.PinataGame ⟷ App native    │                          │
│   └──────────────────────────────────┘                           │
└──────────────────────────────────────────────────────────────────┘
```

---

## 一、商户准备

向我们申请一个商户账号,得到:

| 字段 | 说明 |
|---|---|
| `merchantId` | 商户 ID(例:`demo-app`) |
| `secret` | HMAC-SHA256 共享密钥(64 hex 字符) |
| App 凭据 | 每个商户可以配置多个 App,每个 App 有 `app-id`、`app-channel`、`app-key` |
| **可用游戏列表** | 我们会在 admin 后台给你商户开通需要的游戏(例:`pinata-fiesta-wins`),你才能 launch 它 |

后端存好 `merchantId` + `secret`。App 服务端发码推荐使用 App 凭据。**`secret` 和 `app-key` 千万别带到前端 / App / git**。

---

## 二、Server-to-Server API

基地址:`https://yb.wtnslog.site`

### 通用约定

旧商户级接口使用这三个 Header:

| Header | 值 |
|---|---|
| `X-Merchant-Id` | 你的 merchantId |
| `X-Timestamp` | 当前 Unix 时间戳(秒) |
| `X-Signature` | `HMAC_SHA256(secret, timestamp + "." + body)`(hex 小写) |

> body 是 HTTP body 的**原始字符串**(GET 没有 body 时用空串 `""`)。
> 时间戳容差 **±5 分钟**,过期返回 `401 invalid_signature`。

App 服务端生成 code 游戏地址时,推荐用 App 凭据签名:

| Header | 值 |
|---|---|
| `app-id` | 管理后台商户详情里配置的 App ID,例如 `7990057035` |
| `app-channel` | 管理后台商户详情里配置的 App Channel,例如 `chatna` |
| `X-Timestamp` | 当前 Unix 时间戳(秒) |
| `X-Signature` | `HMAC_SHA256(app-key, timestamp + "." + body)`(hex 小写) |

`app-key` 只用于 App 服务端本地签名,不要作为 Header / Body 明文发送。

### 1. `POST /api/merchant/launch` — 启动游戏会话

为某个玩家创建一个一次性 game token + 拼好的 gameUrl,5 分钟内有效,只能用一次。

**请求**

```json
{
  "externalUserId": "u_12345",
  "gameId": "fishstar",
  "nickname": "Alice",
  "lang": "en",
  "initialBalance": 50000,
  "baishunUserId": "100425025",
  "baishunCode": "81acc4a9-986f-425b-83ce-d9f57df0ac7f"
}
```

| 字段 | 必填 | 说明 |
|---|---|---|
| `externalUserId` | ✅ | 你那边的玩家唯一 ID(string) |
| `gameId` | ✅ | 你想 launch 哪个游戏(我们给你开通后才有权限,见错误码) |
| `nickname` | | 昵称,用于游戏内显示 |
| `lang` | | 语言,默认 `en` |
| `initialBalance` | | 玩家**首次**进游戏时的初始余额。后续登录沿用 DB 里的余额,这个值不再生效 |
| `baishunUserId` | FishStar/A 服务对接时推荐 | A 服务用户 ID；不传时默认使用 `userId` / `fishstarUserId` / `externalUserId` |
| `baishunCode` | FishStar/A 服务对接且需要换 token 时必填 | YB 服务端用它调用 A 服务 `/baishun/get-token` 换 `ss_token` |
| `baishunSsToken` | 可选 | 如果业务侧已经有 `ss_token`，可直接传；否则 YB 会用 `baishunCode` 换 token |
| `baishunGameId` | 可选 | A 服务 provider 侧游戏 ID；默认取服务端环境变量 `BAISHUN_GAME_ID` |
| `baishunCurrencyType` | 可选 | A 服务币种类型；默认取服务端环境变量 `BAISHUN_CURRENCY_TYPE` |
| `clientIp` | 可选 | A 服务 `get-userinfo` 需要的用户客户端 IP；不传时 YB 使用请求 IP |

> ⚠️ 同一 `externalUserId` 在 **(merchantId, gameId)** 三元组上才唯一。
> 也就是 `userA` 在 `pinata-fiesta-wins` 是一个独立账户,在 `fishstar` 是另一个,余额互不干扰。

**响应**

```json
{
  "ok": true,
  "token": "9c3a...",
  "expiresAt": "2026-05-11 14:30:00",
  "gameUrl": "https://yb.wtnslog.site/embed?token=9c3a...",
  "gameId": "fishstar"
}
```

把 `gameUrl` 推给 App,App 在 webview 里加载。**不要重写 URL**,我们会按 token 找到对应的 `game.asset_url`,并颁发签名 `yb_embed_session`。游戏静态资源、`/authLogin` 和 `/socket.io/` 都会校验这个会话。

### 1a. `POST /api/merchant/play-code` — App 服务端生成一次性 code 游戏地址

如果 App 侧链路要求“客户端先从你们 App 服务端拿一个带 `code` 的游戏地址”,就让 **App 服务端** 调这个接口。
它等同于商户后台生成测试 code 的效果,但走 server-to-server HMAC 鉴权,返回的 `gameUrl` 是 `/play?code=...&raw=1`。
这个接口支持上面的 App 凭据签名,也兼容旧的 `X-Merchant-Id` + `secret` 签名。

**App 凭据 Header 示例**

```http
app-id: 7990057035
app-channel: chatna
X-Timestamp: <unix-seconds>
X-Signature: HMAC_SHA256(app-key, timestamp + "." + rawBody)
```

**请求**

```json
{
  "externalUserId": "u_12345",
  "gameId": "fishstar",
  "nickname": "Alice",
  "initialBalance": 50000,
  "displayMode": "half"
}
```

| 字段 | 必填 | 说明 |
|---|---|---|
| `externalUserId` | ✅ | 你那边的玩家唯一 ID(string) |
| `gameId` | ✅ | 要打开的游戏,必须已给当前商户开通 |
| `nickname` | | 首次创建玩家时使用的昵称 |
| `initialBalance` | | 首次创建玩家时使用的初始余额；FishStar 已存在同用户时会按测试 code 逻辑追加余额 |
| `displayMode` | | FishStar 可选:`half` / `full`,默认 `half` |

**响应**

```json
{
  "ok": true,
  "code": "app-launch-l4kj0x1p-abc12345",
  "gameUrl": "https://yb.wtnslog.site/play?code=app-launch-l4kj0x1p-abc12345&raw=1&displayMode=half",
  "playUrl": "https://yb.wtnslog.site/play?code=app-launch-l4kj0x1p-abc12345&raw=1&displayMode=half",
  "gameId": "fishstar",
  "externalUserId": "u_12345",
  "expiresOnFirstUse": true
}
```

App 客户端只加载 `gameUrl`,不要去掉 `raw=1`。`code` 在 `/play` 换取内部 launch token 时会立即消费,同一个 `code` 第二次打开会返回 `410 code already used or expired`。
不要在客户端生成 code,也不要把 merchant `secret` 放到 App 或 H5。

### 2. `GET /api/merchant/games` — 查询本商户已开通的游戏

```json
{
  "ok": true,
  "items": [
    {
      "gameId": "pinata-fiesta-wins",
      "name": "Pinata Fiesta Wins",
      "type": "video-slot",
      "status": "active"
    },
    {
      "gameId": "fishstar",
      "name": "FishStar",
      "type": "fishing",
      "status": "active"
    }
  ]
}
```

可以在你 App 的"游戏大厅"里展示。

### 3. `GET /api/merchant/balance?externalUserId=xxx&gameId=xxx` — 查玩家余额

`gameId` 可选;不带则返回该玩家在所有游戏的总览(数组),带则定向查单游戏。

```json
{
  "ok": true,
  "externalUserId": "u_12345",
  "gameId": "pinata-fiesta-wins",
  "balance": 102345,
  "totalBet": 4200,
  "totalWon": 6545,
  "spinCount": 38
}
```

### 4. `GET /api/merchant/transactions` — 拉流水(对账)

Query 参数(都可选):

| 参数 | 说明 |
|---|---|
| `externalUserId` | 限定某玩家 |
| `gameId` | 限定某游戏(强烈推荐对账时带上) |
| `type` | `bet` / `win` / `adjust` |
| `from` | 起始时间(`YYYY-MM-DD HH:MM:SS`) |
| `to` | 截止时间 |
| `limit` | 最多返回 N 条,默认 100,最大 500 |

**响应**

```json
{
  "ok": true,
  "items": [
    {
      "txn_id": "PFW_xxx-bet",
      "merchant_id": "demo-app",
      "external_user_id": "u_12345",
      "game_id": "pinata-fiesta-wins",
      "type": "bet",
      "amount": 100,
      "balance_before": 100000,
      "balance_after": 99900,
      "round_id": "PFW_abc",
      "meta": { "strategy": "base-win", "betTier": "mid" },
      "created_at": "2026-05-11 14:25:30"
    },
    {
      "txn_id": "PFW_xxx-win",
      "type": "win",
      "amount": 240,
      "balance_after": 100140,
      "...": "..."
    }
  ]
}
```

每次 spin 会产出 1 条 `bet` + (如果中奖) 1 条 `win`,通过 `round_id` 关联。**注意 `game_id` 字段是新加的**,旧记录可能为空,新流水都会带。

### 5. `GET /api/merchant/summary?day=YYYY-MM-DD&gameId=xxx` — 当日聚合

`gameId` 可选;不带是该商户全部游戏汇总。

```json
{
  "ok": true,
  "summary": {
    "merchantId": "demo-app",
    "gameId": "pinata-fiesta-wins",
    "day": "2026-05-11",
    "totalBet": 12500,
    "totalWin": 11425,
    "totalAdjust": 0,
    "ggr": 1075,
    "rtp": 0.914,
    "txnCount": 84,
    "userCount": 3
  }
}
```

`ggr` = Gross Gaming Revenue = 总下注 - 总中奖,**正数表示庄家赚**。

### 错误码

| HTTP | error | 含义 |
|---|---|---|
| 401 | `merchant_not_found` | 商户 ID 不存在 |
| 401 | `invalid_signature` | 签名错误或时间戳过期 |
| 403 | `merchant_disabled` | 商户被禁用 |
| 403 | `ip_not_allowed` | 请求 IP 不在商户白名单里 |
| 400 | `externalUserId required` | 必填字段缺失 |
| 400 | `gameId required` | launch 没传 gameId |
| 403 | `game_not_allowed_for_merchant` | 该商户没被开通这个游戏(去 admin 找运营加白名单) |
| 404 | `game_not_found` | gameId 不存在 |

---

## 三、App 集成 (Webview JS Bridge)

### FishStar iOS WKWebView Bridge

FishStar 已兼容你们现有 iOS bridge 注册名：

```swift
let BSGameName = ["getConfig", "destroy", "gameRecharge", "gameLoaded"]
```

H5 会通过 WKWebView 标准入口调用：

```js
window.webkit.messageHandlers.gameLoaded.postMessage({ gameId: "fishstar" })
window.webkit.messageHandlers.getConfig.postMessage({ gameId: "fishstar" })
window.webkit.messageHandlers.gameRecharge.postMessage({ gameId: "fishstar" })
window.webkit.messageHandlers.destroy.postMessage({ gameId: "fishstar" })
```

事件含义：

| Bridge | H5 调用时机 | App 建议处理 |
|---|---|---|
| `gameLoaded` | 页面资源完成加载后 | 隐藏原生 loading，允许用户操作 |
| `getConfig` | 页面加载完成后请求 App 配置,消息体会带 `gameId` / `location` / 脱敏 `query` | 只回传客户端配置；不要让 App 直接调用 A 服务 |
| `gameRecharge` | H5 需要唤起充值时 | 打开 App 充值页；充值成功后通知 H5 刷新余额 |
| `destroy` | H5 请求关闭游戏时 | 关闭当前 `WKWebView` / 返回游戏大厅 |

`getConfig` 收到的 `message.body` 示例：

```json
{
  "gameId": "fishstar",
  "location": "/games/fishstar/index.html?gsp=101&roomId=85422171&userId=10121934",
  "query": {
    "roomId": "85422171",
    "userId": "10121934"
  },
  "phase": "window.load",
  "ts": 1770000000000
}
```

充值成功后,App 调 H5 的 `walletUpdate(userId)`。H5 只通知 YB 服务端刷新余额,YB 服务端再调用 A 服务 `get-userinfo`:

```swift
callJs(method: "walletUpdate", arguments: "100425025")
```

H5 会请求：

```http
POST /api/fishstar/wallet-update
Content-Type: application/json

{ "userId": "100425025" }
```

YB 会校验 `userId` 必须等于当前 `yb_embed_session` 里的 FishStar 用户,然后更新本地 `players.score` 并向当前 WebSocket 推送 `1019` balance change。

YB 服务端调用 A 服务的用户信息接口契约是：

```http
POST /callback/baishun/get-userinfo
Host: api-ga.chatnaapp.com
Content-Type: application/json
```

请求体字段：

| 字段 | 来源/说明 |
|---|---|
| `app_id` | 业务 App ID |
| `user_id` | 业务用户 ID |
| `ss_token` | 当前用户登录 token |
| `provider_name` | provider 名，历史样例为 `bobi` |
| `client_ip` | 用户客户端 IP |
| `game_id` | provider 侧游戏 ID，历史样例为 `1083` |
| `signature` | 业务后端签名 |
| `signature_nonce` | 签名随机串 |
| `timestamp` | Unix 秒时间戳 |
| `currency_type` | 币种类型，历史样例为 `0` |

这些字段里的 `ss_token`、`signature`、`signature_nonce` 不会暴露给 H5 或 App；它们由 YB 服务端按配置生成或缓存。

App 充值成功或余额变化后，可按你们现有封装调用 H5：

```swift
callJs(method: "onBalanceUpdate", arguments: ["balance": newBalance])
```

H5 侧也提供了这些兼容入口，便于后续扩展或 native 主动调用：

```js
window.FishStarNativeBridge.onConfig({ locale: "zh-CN" })
window.onBalanceUpdate({ balance: 100000 })
window.walletUpdate("100425025")
window.requestGameRecharge({ reason: "insufficient_balance" })
window.closeFishStarGame({ reason: "user_close" })
```

> App 仍然应该加载 `/api/merchant/launch` 返回的 `gameUrl`，不要在客户端重写 URL。FishStar 玩家身份、余额和房间信息都由这个 URL 内的一次性 token 建立。

### FishStar A 服务服务端对接

FishStar 对 A 服务的调用全部在 YB 服务端完成，客户端不直接请求 A 服务：

| 时机 | YB 服务端动作 |
|---|---|
| 首次进入 / 获取余额 | 调 `/baishun/get-token` 获取 `ss_token`，再调 `/baishun/get-userinfo` 同步余额 |
| 开炮下注 | 调 `/baishun/change-balance`，`currency_diff` 为负数 |
| 打死鱼派奖 | 调 `/baishun/change-balance`，`currency_diff` 为正数 |
| App 充值成功 | H5 `walletUpdate(userId)` 触发 YB 调 `/baishun/get-userinfo` 刷新余额 |

服务端环境变量：

| 环境变量 | 说明 |
|---|---|
| `BAISHUN_BASE_URL` | A 服务域名，例如 `https://api-ga.chatnaapp.com`；不配置则保持本地余额逻辑，不请求 A 服务 |
| `BAISHUN_PATH_PREFIX` | 路径前缀，默认 `/callback/baishun` |
| `BAISHUN_APP_ID` | 默认 `8146186998` |
| `BAISHUN_PROVIDER_NAME` | 默认 `bobi` |
| `BAISHUN_GAME_ID` | A 服务 provider 游戏 ID，默认 `1022` |
| `BAISHUN_CURRENCY_TYPE` | 默认 `0` |
| `BAISHUN_SIGNATURE_SECRET` | 生成请求体 `signature` 的服务端密钥 |
| `BAISHUN_HEADER_SIGN_SECRET` | 如 A 服务要求 header `sign`，用这个密钥生成；不配置则不发送 `sign` |
| `BAISHUN_TIMEOUT_MS` | 请求超时，默认 `5000` |

> 还需要和 A 服务确认 `signature` / `sign` 的精确签名算法。如果算法和当前服务端配置不一致，只需要调整 YB 服务端签名生成逻辑，不需要改 H5 或 App。

### 通用 Pinata Bridge（Pinata Fiesta 旧游戏）

Pinata Fiesta Wins 加载 `gameUrl` 后,网页内部通过 `window.PinataGame` 与 App 互通。

> `PinataGame` 只用于 Pinata Fiesta Wins 旧游戏兼容。FishStar 使用上文的
> `getConfig` / `destroy` / `gameRecharge` / `gameLoaded` bridge 和 `walletUpdate(userId)`。

### iOS (Swift,WKWebView)

```swift
import WebKit

class GameViewController: UIViewController, WKScriptMessageHandler {
    var webView: WKWebView!

    override func viewDidLoad() {
        super.viewDidLoad()

        let userController = WKUserContentController()
        userController.add(self, name: "PinataGame")  // Pinata Fiesta 旧游戏必须叫 PinataGame

        let config = WKWebViewConfiguration()
        config.userContentController = userController

        webView = WKWebView(frame: view.bounds, configuration: config)
        view.addSubview(webView)

        // gameUrl 是从你后端调 launch 接口拿到的
        let url = URL(string: gameUrl)!
        webView.load(URLRequest(url: url))
    }

    // 收网页消息
    func userContentController(_ userContentController: WKUserContentController,
                                didReceive message: WKScriptMessage) {
        guard let body = message.body as? [String: Any],
              let event = body["event"] as? String else { return }
        let payload = body["payload"] as? [String: Any] ?? [:]

        switch event {
        case "pinata.ready":
            // 游戏加载完成,可以做一些初始化
            print("game ready")

        case "pinata.balance.update":
            let balance = payload["balance"] as? Double ?? 0
            print("玩家当前余额:\(balance)")
            // 你可以同步给后端(可选)

        case "pinata.bigwin":
            let amount = payload["amount"] as? Double ?? 0
            let multiplier = payload["multiplier"] as? Double ?? 0
            print("大奖:\(amount),倍数:\(multiplier)")

        case "pinata.close":
            // 玩家点了关闭按钮,关 webview
            self.dismiss(animated: true)

        case "pinata.error":
            let msg = payload["message"] as? String ?? ""
            print("game error: \(msg)")

        default:
            print("unknown event: \(event)")
        }
    }

    // App 主动调网页方法(比如玩家充值后通知刷新余额)
    func updateBalanceFromApp(_ newBalance: Double) {
        let js = "window.PinataGame.bridge('setBalance', { balance: \(newBalance) })"
        webView.evaluateJavaScript(js)
    }
}
```

### Android (Kotlin,WebView)

```kotlin
class GameActivity : AppCompatActivity() {
    private lateinit var webView: WebView

    @SuppressLint("SetJavaScriptEnabled", "AddJavascriptInterface")
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        webView = WebView(this)
        setContentView(webView)

        webView.settings.javaScriptEnabled = true
        webView.settings.domStorageEnabled = true
        webView.addJavascriptInterface(PinataGameInterface(), "PinataGameAndroid")

        // gameUrl 从你后端 launch 接口拿
        webView.loadUrl(gameUrl)
    }

    inner class PinataGameInterface {
        @JavascriptInterface
        fun postMessage(jsonString: String) {
            val msg = JSONObject(jsonString)
            val event = msg.optString("event")
            val payload = msg.optJSONObject("payload") ?: JSONObject()

            runOnUiThread {
                when (event) {
                    "pinata.ready" -> Log.d("YB", "ready")
                    "pinata.balance.update" -> {
                        val balance = payload.optDouble("balance")
                        Log.d("YB", "balance=$balance")
                    }
                    "pinata.bigwin" -> {
                        val amount = payload.optDouble("amount")
                        Log.d("YB", "BIG WIN! $amount")
                    }
                    "pinata.close" -> finish()
                }
            }
        }
    }

    // App 主动调网页
    fun updateBalanceFromApp(newBalance: Double) {
        webView.evaluateJavascript(
            "window.PinataGame.bridge('setBalance', { balance: $newBalance })", null
        )
    }
}
```

---

## 四、JS Bridge 协议详细

### 网页 → App 事件(Native 收)

每个事件 payload 是 JSON 对象。**iOS 是 Dict 直接收,Android 是字符串需要 JSON.parse**。

| event | payload 字段 | 触发时机 |
|---|---|---|
| `pinata.ready` | `{ gameId }` | 网页和 bridge 完全加载好 |
| `pinata.balance.update` | `{ balance, bet, win, roundId, gameId }` | 每次 spin 完毕,后端确认了余额变化 |
| `pinata.bigwin` | `{ amount, bet, multiplier, threshold, roundId, gameId }` | 中奖倍数 ≥ `bigWinMultiplier`(默认 20)时触发 |
| `pinata.close` | `{ reason, gameId }` | 玩家点关闭按钮,App 应该关 webview。`reason` 取值见下 |
| `pinata.error` | `{ message }` | JS 异常 |

`pinata.close` 的 `reason`:
- `user-tap-close` — 用户主动点关闭
- `force-close-acked` — App 调用 `forceClose` 后 game 完成保存的回执

### App → 网页 方法(Native 调)

App 通过 `webView.evaluateJavaScript("window.PinataGame.bridge('METHOD', PAYLOAD)")` 调:

| method | payload | 作用 |
|---|---|---|
| `setUser` | `{ extUserId, nickname, avatar, balance }` | 注入用户身份(已经在 launch 阶段传过的话不用重复) |
| `setBalance` | `{ balance }` | 玩家在 App 充值后,通知游戏更新余额 |
| `setLanguage` | `{ lang }` | 切换语言(会刷新页面) |
| `setMute` / `setSound` / `setVolume` | `{ value }` | 音频控制(详见 `frontend/pinata-fiesta-wins/bridge.js`) |
| `forceClose` | `{}` | App 想关 webview 前,通知游戏保存状态。游戏会回 `pinata.close` 事件 |

---

## 五、HMAC 签名实现

### Node.js 示例

```javascript
const crypto = require("crypto");

function signRequest(secret, body, timestamp) {
  return crypto
    .createHmac("sha256", secret)
    .update(`${timestamp}.${body}`)
    .digest("hex");
}

// 调用 launch
const fetch = require("node-fetch");
const body = JSON.stringify({
  externalUserId: "u_12345",
  gameId: "pinata-fiesta-wins",   // 必填
  nickname: "Alice"
});
const timestamp = Math.floor(Date.now() / 1000);
const signature = signRequest(SECRET, body, timestamp);

const res = await fetch("https://yb.wtnslog.site/api/merchant/launch", {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    "X-Merchant-Id": MERCHANT_ID,
    "X-Timestamp": String(timestamp),
    "X-Signature": signature
  },
  body
});
const data = await res.json();
// data.gameUrl 推给 App
```

### Java 示例

```java
import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;
import java.nio.charset.StandardCharsets;

public static String hmacSha256(String secret, String body, long timestamp) throws Exception {
    String message = timestamp + "." + body;
    Mac mac = Mac.getInstance("HmacSHA256");
    mac.init(new SecretKeySpec(secret.getBytes(StandardCharsets.UTF_8), "HmacSHA256"));
    byte[] bytes = mac.doFinal(message.getBytes(StandardCharsets.UTF_8));
    StringBuilder sb = new StringBuilder();
    for (byte b : bytes) sb.append(String.format("%02x", b));
    return sb.toString();
}
```

### Python 示例

```python
import hmac, hashlib, time, json, requests

def sign_request(secret, body, timestamp):
    msg = f"{timestamp}.{body}".encode()
    return hmac.new(secret.encode(), msg, hashlib.sha256).hexdigest()

body = json.dumps({
    "externalUserId": "u_12345",
    "gameId": "pinata-fiesta-wins",   # 必填
    "nickname": "Alice"
})
ts = int(time.time())
sig = sign_request(SECRET, body, ts)

resp = requests.post("https://yb.wtnslog.site/api/merchant/launch",
    data=body,
    headers={
        "Content-Type": "application/json",
        "X-Merchant-Id": MERCHANT_ID,
        "X-Timestamp": str(ts),
        "X-Signature": sig
    })
```

### curl 调试

```bash
SECRET="<your-secret>"
TS=$(date +%s)
BODY='{"externalUserId":"u_12345","gameId":"pinata-fiesta-wins"}'
SIG=$(printf '%s.%s' "$TS" "$BODY" | openssl dgst -sha256 -hmac "$SECRET" -binary | xxd -p -c 256)

curl -X POST https://yb.wtnslog.site/api/merchant/launch \
  -H "Content-Type: application/json" \
  -H "X-Merchant-Id: <your-merchantId>" \
  -H "X-Timestamp: $TS" \
  -H "X-Signature: $SIG" \
  -d "$BODY"
```

---

## 六、URL 参数(只读了解)

我们的 `/embed?token=xxx` 拿到 token 之后,会查 `(token→gameId)`,302 跳到对应游戏的
`asset_url`(例如 `/pinatawins/index.html`),并 `Set-Cookie` 一个 24 小时的 `yb_embed_session`
(里面带了 `merchantId` + `externalUserId` + `gameId` + nickname/lang)。

**你不需要关心这层,gameUrl 拿到直接交给 webview 就行**。

> ⚠️ **游戏资源目录受 cookie 保护**:`/pinatawins/*` 这种游戏资源直链不再公开访问,
> 浏览器没有有效 `yb_embed_session` cookie 会被 302 弹回平台官网 `/`。
> 请**始终**用我们颁发的 `gameUrl`(即 `/embed?token=…`)作为 webview 装载入口,
> 它会自动颁发 cookie 并 302 到游戏页;不要尝试直接拼 `/pinatawins/index.html` 给 webview,
> 那样会失败。

### 公开游戏目录(展示用)

```http
GET https://yb.wtnslog.site/api/public/games
```

无需签名,返回当前平台所有 `status=active` 的游戏:`gameId` / `name` / `type` /
`iconUrl` / `description`。可以用来在你 App 的"游戏选择"页展示;但**实际能 launch 哪些**
仍取决于商户白名单(`/api/merchant/games`)。

---

## 七、限制 / 注意

1. **launch token 只能用 1 次**,5 分钟内必须装载,过期或重复使用都会返回 401。
2. **同一 `externalUserId` 在 (商户, 游戏) 三元组上才永远是同一个 player**;
   跨游戏时 player 是独立的(余额、累计下注/中奖独立)。
3. **测试环境的所有玩家初始余额是 100000**(运营可改),后续余额完全在我们 DB 里,商户调 `/balance` 拉。
4. **HTTPS 必须**;HTTP 请求会被 nginx 强制跳到 HTTPS,签名时间戳可能漂移。
5. **签名时间戳容差 ±5 分钟**,服务器要做好时间同步(NTP)。
6. **暂不支持 server-to-server debit/credit**(纯虚拟币模式),如果要接真钱给我们说。
7. **新增游戏需要我们手工开通**:运营在 admin 把游戏加到你商户的"可用游戏"白名单后,
   你才能 launch 它。你不能自助添加游戏。

---

## 八、自检清单

接入前过一遍:

- [ ] 商户 ID + secret 已保存到你后端(不在前端 / App)
- [ ] 已确认运营给你商户开通了你想 launch 的 `gameId`
- [ ] HMAC 签名能跑通(自测一次 `/api/merchant/games` 返回 200 且能看到你预期的游戏即说明签名对了)
- [ ] launch 调用带上 `gameId`,返回 200 + token + gameUrl
- [ ] launch 故意传一个没开通的 `gameId`,确认返回 `403 game_not_allowed_for_merchant`
- [ ] 你 App 能成功打开 gameUrl,看到游戏界面
- [ ] 网页发的 `pinata.ready` 事件 native 收到了
- [ ] 玩家中奖后 native 收到 `pinata.balance.update`
- [ ] 玩家点游戏右上角 ✕ 后,native 收到 `pinata.close` 并关了 webview
- [ ] 商户后台调 `/api/merchant/transactions?gameId=xxx` 能拉到这玩家的下注/中奖记录,且每条带 `game_id` 字段

---

## 九、联系

接入有问题、想要更多功能(rollback、真实扣款回调、多币种、多游戏游戏大厅)告诉我们。

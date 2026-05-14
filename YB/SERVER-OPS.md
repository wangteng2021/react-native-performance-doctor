# WTNS Gaming Platform 服务器运维手册

> 实际部署快照,2026-05-11 首次部署、2026-05-12 升级为多游戏平台
> 这份文档同时存放在服务器 `/www/wwwroot/yb/SERVER-OPS.md`

---

## 一、当前部署信息(关键数据)

| 项 | 值 |
|---|---|
| 服务器 IP | `120.53.24.116` |
| 系统 | OpenCloudOS 9.4(腾讯云,RHEL 系) |
| SSH | `ssh root@120.53.24.116`(端口 22) |
| 域名 | `yb.wtnslog.site` |
| HTTPS | ✅ 已启用,Let's Encrypt,自动续期 |
| 证书到期 | 2026-08-09(自动续) |
| 项目目录 | `/www/wwwroot/yb` |
| Node 版本 | 20.9.0(`/www/server/nvm/versions/node/v20.9.0/bin/node`) |
| 后端端口 | `127.0.0.1:3002`(只本地,不对外) |
| PM2 进程名 | `yb-server` |
| Nginx 站点 | `/www/server/panel/vhost/nginx/yb.wtnslog.site.conf` |
| 同机其他项目 | `app-server`(3000)、`paike`、`official-website`、`language.local` 等 — **不要动** |

---

## 二、访问入口

| 入口 | URL |
|---|---|
| 平台官网(landing) | https://yb.wtnslog.site/ |
| 商户接入 launch | `POST https://yb.wtnslog.site/api/merchant/launch` |
| 玩家 embed 入口 | `https://yb.wtnslog.site/embed?token=…` |
| 管理后台 | https://yb.wtnslog.site/admin/(WTNS Gaming · Admin) |
| 公开游戏列表 | https://yb.wtnslog.site/api/public/games |
| API 健康检查 | https://yb.wtnslog.site/api/game |
| Socket.IO | https://yb.wtnslog.site/socket.io/ |
| 宝塔面板 | http://120.53.24.116:8888 |

⚠️ **游戏直链(`/pinatawins/*`)受 cookie 保护**:匿名访问会 302 弹回官网,
玩家必须先走商户 launch → /embed?token= 拿到 `yb_embed_session` cookie 才能进。详情 §17.5。

admin 用户名/密码从 ecosystem.config.js 的 env 注入,scrypt + cookie session,详情 §七。

---

## 三、最常用运维命令(SSH 上去执行)

```bash
ssh root@120.53.24.116
cd /www/wwwroot/yb
```

### 看进程状态

```bash
pm2 list                          # 所有 PM2 进程
pm2 logs yb-server                # 实时日志
pm2 logs yb-server --lines 200    # 最近 200 行
pm2 monit                         # 实时监控 CPU/内存
```

### 重启服务

```bash
pm2 reload yb-server              # 零停机重启(推荐,内存数据保留)
pm2 restart yb-server             # 强制重启(玩家会话/测试 code 会丢)
pm2 stop yb-server                # 停止
pm2 start yb-server               # 启动
```

### 改环境变量(端口、CORS 白名单)

```bash
nano /www/wwwroot/yb/ecosystem.config.js
pm2 reload yb-server --update-env  # ⚠️ 必须加 --update-env 才会重读
```

### 看日志文件

```bash
# Node 日志
tail -f ~/.pm2/logs/yb-server-out.log
tail -f ~/.pm2/logs/yb-server-error.log

# Nginx 日志
tail -f /www/wwwlogs/yb.wtnslog.site.log
tail -f /www/wwwlogs/yb.wtnslog.site.error.log
```

---

## 四、更新代码(发版流程)

### 方式 A:本地 scp(快速)

```bash
# 在本机
cd "/Users/wt/Desktop/AI 研究"
tar --exclude='YB/.git' --exclude='YB/.sisyphus' --exclude='YB/node_modules' \
    --exclude='YB/.DS_Store' -czf /tmp/yb.tar.gz YB
scp /tmp/yb.tar.gz root@120.53.24.116:/tmp/yb.tar.gz

# 服务器
ssh root@120.53.24.116
cd /www/wwwroot
mv yb yb.bak.$(date +%s)              # 备份
tar -xzf /tmp/yb.tar.gz && mv YB yb
chown -R www:www yb
# 把保留的 ecosystem.config.js 拷回来
cp /www/wwwroot/yb.bak.*/ecosystem.config.js /www/wwwroot/yb/ 2>/dev/null
# 把 strategy-config.json 拷回来(有真实数据时)
cp /www/wwwroot/yb.bak.*/backend/strategy-config.json /www/wwwroot/yb/backend/ 2>/dev/null
pm2 reload yb-server
pm2 logs yb-server --lines 30 --nostream
```

### 方式 B:推到 git 仓库后 git pull(推荐长期用)

需要先把项目推到 GitHub/Gitee,然后服务器上做一次 `git clone`。之后:

```bash
cd /www/wwwroot/yb
git pull
./deploy.sh              # 项目自带的脚本会做 syntax check + pm2 reload
```

---

## 五、改 Nginx 配置

```bash
nano /www/server/panel/vhost/nginx/yb.wtnslog.site.conf
nginx -t                                  # 语法检查
nginx -s reload                           # reload
```

> ⚠️ 不要改 `# managed by Certbot` 标记的那几行,certbot 续期时会重写。

---

## 六、SSL 证书续期(已自动)

certbot.timer 已经配置自动续期,每天检查一次,到期前 30 天会自动续。

手动验证 / 强制续期:

```bash
systemctl list-timers --all | grep certbot       # 看 timer 是否在跑
certbot renew --dry-run                          # 演练续期(不真签发)
certbot renew --force-renewal                    # 强制续期(慎用,有频率限制)
```

---

## 七、管理后台账号密码

### 7.1 当前生效的密码哪里改

ecosystem.config.js 里的环境变量:

```bash
nano /www/wwwroot/yb/ecosystem.config.js
# 改 ADMIN_PASSWORD 为新值,保存
# 然后强制 reseed:
ADMIN_FORCE_RESET=1 加进 env,或者直接命令行
pm2 restart yb-server --update-env --env ADMIN_FORCE_RESET=1
# 改完密码后把 ADMIN_FORCE_RESET 改回 0
```

或者**直接改数据库**(不重启服务):

```bash
NODE=/www/server/nvm/versions/node/v20.9.0/bin/node
$NODE -e '
  const auth = require("/www/wwwroot/yb/backend/adminAuth.js");
  const { getDb } = require("/www/wwwroot/yb/backend/db.js");
  const db = getDb();
  const hash = auth.hashPassword("你的新密码");
  db.prepare("UPDATE admin_users SET password_hash=?, updated_at=datetime(\"now\") WHERE username=?").run(hash, "admin");
  console.log("ok");
'
```

### 7.2 忘记密码了

最简单的办法,改 ecosystem.config.js 把 `ADMIN_FORCE_RESET` 设为 "1",改新密码,然后:

```bash
pm2 reload /www/wwwroot/yb/ecosystem.config.js --update-env
# 启动日志会打印 [auth] admin user "admin" updated
# 把 ADMIN_FORCE_RESET 改回 "0",再 reload 一次,防止后续重启时密码被反复 reset
```

### 7.3 给所有 session 强制下线

```bash
$NODE -e '
  const { getDb } = require("/www/wwwroot/yb/backend/db.js");
  const db = getDb();
  console.log("removed sessions:", db.prepare("DELETE FROM admin_sessions").run().changes);
'
```

所有已登录用户下次刷新都会被踢到登录页。改密码后建议执行一次,作废老 session。

### 7.4 (历史)Basic Auth 旧方案 — 已废弃

```bash
# 1. 装工具
dnf install -y httpd-tools

# 2. 创建用户(把 ADMINUSER 换成你想要的用户名)
htpasswd -c /etc/nginx/.htpasswd ADMINUSER
# 输入两次密码

# 3. 改 nginx 配置
nano /www/server/panel/vhost/nginx/yb.wtnslog.site.conf
```

在 `server { ... }`(443 那个)里、`location / { ... }` 之前,加这两段:

```nginx
location /admin/ {
    auth_basic "Admin Area";
    auth_basic_user_file /etc/nginx/.htpasswd;
    proxy_pass http://127.0.0.1:3002;
    proxy_http_version 1.1;
    proxy_set_header Host $host;
}

location /api/admin/ {
    auth_basic "Admin Area";
    auth_basic_user_file /etc/nginx/.htpasswd;
    proxy_pass http://127.0.0.1:3002;
    proxy_http_version 1.1;
    proxy_set_header Host $host;
}
```

```bash
nginx -t && nginx -s reload
```

---

## 八、回滚

```bash
# 查看最近备份
ls -lt /www/wwwroot/yb.bak.*

# 回滚到指定备份(把 1715000000 换成实际时间戳)
cd /www/wwwroot
mv yb yb.broken.$(date +%s)
mv yb.bak.1715000000 yb
pm2 reload yb-server
```

---

## 九、常见故障排查

### 502 Bad Gateway

```bash
pm2 list                          # yb-server 是不是 online?
pm2 logs yb-server --lines 50     # 看错误
ss -tlnp | grep 3002              # 端口 3002 是不是被监听?
```

### Socket.IO 连不上

- 确认 nginx 配置里 `/socket.io/` 段保留了 `proxy_http_version 1.1` 和 `Upgrade/Connection` 头
- 看 nginx error 日志:`tail -50 /www/wwwlogs/yb.wtnslog.site.error.log`

### 浏览器报 CORS

- 检查 `ecosystem.config.js` 里 `CORS_ALLOWED_ORIGINS` 包含的域名是否完整(注意 `https://` 开头)
- `pm2 reload yb-server --update-env` 必须加 `--update-env`

### 证书过期 / HTTPS 显示不安全

```bash
certbot certificates              # 看证书状态
certbot renew                     # 强制续期
nginx -s reload
```

### 内存吃紧

机器只有 2GB,常驻 ~1GB。如果 yb-server 内存涨到 300MB 会自动重启(`max_memory_restart` 设的)。
玩家/测试 code 等数据已经落盘到 SQLite(`backend/data/yb.db`),内存只剩 Socket.IO session,重启/OOM 都不会丢数据。

---

## 十、几个必须知道的坑

### 10.1 数据持久化

平台已迁到 SQLite,所有业务数据都在 `backend/data/yb.db`(WAL 模式),`pm2 restart` 不丢:

| 数据 | 存放位置 | 重启后保留? |
|---|---|---|
| 全局兜底策略 | `backend/strategy-config.json` 文件 | ✅ |
| 游戏库 | `games` 表 | ✅ |
| 商户 | `merchants` 表 | ✅ |
| 商户 × 游戏白名单 | `merchant_games` 表 | ✅ |
| 商户 × 游戏 策略 override | `merchant_game_strategies` 表 | ✅ |
| 玩家账号 / 余额 / 累计 | `players` 表(`(merchant_id, external_user_id, game_id)` 唯一) | ✅ |
| 测试 code | `test_codes` 表 | ✅ |
| 流水(bet/win/adjust) | `transactions` 表 | ✅ |
| 历史 spin | `spin_history` 表(保留 1 年) | ✅ |
| Admin 操作审计 | `admin_audit` 表 | ✅ |
| Admin 用户 / session | `admin_users` / `admin_sessions` 表 | ✅ |
| Socket.IO session | 内存 | ❌(客户端会自动重连) |
| Launch token | `launch_tokens` 表 | ✅ 但 5 分钟过期 |

→ `pm2 reload` 是零停机优先方案,只在改 env 时才用 `restart --update-env`。

### 10.2 strategy-config.json 是全局兜底

管理后台 `POST /api/admin/strategy` 会改这个文件(全局兜底)。每次发版前先**备份**这个文件,
新代码上去后再放回去。但其实从平台改造后,大部分商户策略已经迁到 `merchant_game_strategies` 表(SQLite),
strategy-config.json 只剩"没人覆盖时的最后兜底"。

### 10.3 端口 3002 是 YB 专用,不要碰

其他项目占用情况(2026-05 时):

| 端口 | 占用方 |
|---|---|
| 3000 | `app-server`(28+ 天的生产 Node 项目,**不要动**) |
| 3001 | nginx(某个站点) |
| 3002 | **yb-server**(我们) |
| 8080 | java |
| 8081 | nginx |
| 8888 | 宝塔面板 |
| 80, 443 | nginx 共享 |

### 10.4 境外 DNS 解析返回占位地址

`yb.wtnslog.site` 在国内 DNS 能正常解析到 `120.53.24.116`,但境外(google DNS、Cloudflare 等)会返回 `198.18.0.95`。这是 DNSPod 默认对境外的策略。**国内用户不受影响**。如果有海外用户,去 DNSPod 控制台关闭"境外屏蔽"或开启全球解析。

### 10.5 同机有多个 PM2 进程,操作时认清名字

```
yb-server     ← 我们的(端口 3002)
app-server    ← 别人的(端口 3000)
```

操作时一定要 `pm2 reload yb-server`,不能 `pm2 reload all` 或 `pm2 reload 0`,会误伤别人。

### 10.6 PM2 dump 文件位置

`/root/.pm2/dump.pm2`(因为 yb-server 是 root 启动的)。开机自启走的是 `pm2-root.service`(已 enable)。

### 10.7 ⚠️ 宝塔默认 nginx 全局开了 proxy_cache

宝塔的 `/www/server/nginx/conf/proxy.conf` 里默认有:

```nginx
proxy_cache cache_one;        # 全局给所有反代站点开了 1 天 nginx 缓存
```

这会导致**改了 admin/ 文件后浏览器拿到的还是旧文件**(nginx 缓存了一份老的)。

我们的 `yb.wtnslog.site.conf` 已经在两个 location 里加了:

```nginx
location / {
    proxy_cache off;          # ← 关掉,避免 nginx 缓存
    proxy_pass http://127.0.0.1:3002;
    ...
}
location /socket.io/ {
    proxy_cache off;          # ← 同上
    ...
}
```

**重要**:以后用宝塔的 GUI 改这个站点的反向代理时,宝塔可能会**自动删掉** `proxy_cache off` 那一行,这时记得手动加回来。

如果发现"明明改了 admin 但页面没变",先看响应头:

```bash
curl -s -D - -o /dev/null https://yb.wtnslog.site/admin/app.js | grep -iE "cache-control"
# 期望:no-cache
# 如果是 max-age=N 之类的,说明 nginx 又开缓存了,得加回 proxy_cache off
```

---

## 十一、紧急联系/速查

```bash
# 一行体检
ssh root@120.53.24.116 "pm2 list && curl -s -o /dev/null -w '%{http_code}\n' https://yb.wtnslog.site/api/game"

# 强制重启(玩家会话会丢)
ssh root@120.53.24.116 "pm2 restart yb-server"

# 临时停止(对外返回 502)
ssh root@120.53.24.116 "pm2 stop yb-server"

# 恢复
ssh root@120.53.24.116 "pm2 start yb-server"
```

---

## 十二、管理后台运维

入口:**https://yb.wtnslog.site/admin/**(WTNS Gaming · Admin)

### 12.1 页面速览

| 页面 | 干啥用 | 改完是否立即生效 |
|---|---|---|
| 首页 (`/admin/`) | 全平台 KPI + 24h 各游戏分布 + 最近审计 | — |
| 游戏 (`/admin/games.html`) | 游戏库列表 + 注册新游戏 | ✅ |
| 游戏详情 (`/admin/game.html?id=…`) | 编辑游戏元信息 + **本游戏的默认策略** | ✅ |
| 商户 (`/admin/merchants.html`) | 商户列表 + 新建商户 | ✅ |
| 商户详情 (`/admin/merchant.html?id=…`) | **可用游戏 / 策略×游戏 / Tier×游戏 / Code×游戏 / 流水 / 玩家** 6 个 tab | ✅ |
| 流水 (`/admin/transactions.html`) | 全局流水,支持 merchant + game 过滤 | — |
| 审计 (`/admin/audit.html`) | 操作记录,支持 merchant + game + action 过滤 | — |

### 12.2 多游戏配置流程速记

```
1. 进 "游戏" → 注册新游戏(填 gameId, name, assetUrl=/<game-id>/index.html)
2. 进 "商户" → 选商户 → "可用游戏" tab → 勾选启用刚加的游戏
3. 同一详情页 → 顶部"当前游戏"下拉切到刚加的游戏
4. "策略配置" / "Bet Tier" 这两个 tab 现在配的就是 (本商户, 本游戏)
5. "测试 Code" 也是 per-(商户, 游戏);商户 launch 时必须传 gameId
```

### 12.3 配置改了没生效?排查清单

1. 浏览器状态标签是不是「已保存,后端已生效」?如果不是,看 Network tab 看 POST 是不是 200
2. 直接拉值看是不是更新:
   ```bash
   curl -s -b cookies.txt 'https://yb.wtnslog.site/api/admin/merchants/<mid>/games/<gid>/strategy' | jq '.strategy.bigWinMultiplier, .hasOverride'
   ```
3. 看 SQLite:
   ```bash
   sqlite3 /www/wwwroot/yb/backend/data/yb.db \
     "SELECT length(strategy_config), updated_at FROM merchant_game_strategies WHERE merchant_id='<mid>' AND game_id='<gid>'"
   ```
4. 还不行就是浏览器缓存问题,**`Cmd+Shift+R` 强制刷新**(详见 §10.7)

### 12.4 ⚠️ 改边界值时(lowMaxBet / midMaxBet)注意事项

后端 sanitize 里有一行:`midMaxBet = Math.max(lowMaxBet + 1, midMaxBet)`,**确保 mid > low**。
所以你不能让 `midMaxBet < lowMaxBet`,系统会自动纠正。

---

## 十三、Bet-Tier 分级策略调参经验

### 13.1 默认值速查

| 参数 | Low(≤50) | Mid(51-500) | High(>500) | 经验解释 |
|---|---|---|---|---|
| forceWinChance | 0.32 | 0.18 | 0.10 | 大注玩家中奖低频,体验集中在大奖 |
| nearMissChance | 0.18 | 0.24 | 0.40 | 大注更多 near-miss,刮刮乐感 |
| targetWinMultiplierMax | 5 | 12 | 30 | 大注期望大奖 |
| surplusBetMultiplier | 8 | 6 | 3 | 大注盈余增长快,3 倍下注就冷却防赢爆 |
| deficitBetMultiplier | 6 | 4 | 3 | 大注亏损快,3 倍就给补偿,留住 whale |
| bigWinBoost | 1.2 | 1.0 | 1.5 | high tier 大奖触发权重最高 |

### 13.2 调参常见场景

#### A. RTP 太高,玩家普遍盈利,亏不到钱

调小所有 tier 的 `forceWinChance`,或者调小 `surplusBetMultiplier`(更早冷却)。

```
low.forceWinChance:  0.32 → 0.25
mid.forceWinChance:  0.18 → 0.14
high.surplusBetMultiplier: 3 → 2
```

#### B. RTP 太低,玩家投诉抢钱

调大 `lossRelief.forceWinChance`(主全局补偿)、调小所有 tier 的 `deficitBetMultiplier`(更早补偿)。

#### C. 大注玩家短时间赢爆

`high.surplusBetMultiplier` 调更小(到 2 甚至 1.5),让 high tier 玩家盈余 = 2 倍下注就立刻冷却。

#### D. 小注玩家觉得"中奖太频繁但都没什么钱"

调高 `low.targetWinMultiplierMax` 让小注偶尔也能上 BIG WIN(默认 5,可以调到 8 或 10)。

#### E. 需要重新跑一遍策略(测新配置)

通过管理后台的「测试 Code 生成器」生成一个新 code,用这个 code 在浏览器进游戏,所有数据从 0 开始。

### 13.3 怎么验证 tier 真的生效?

每次 spin 的 `lotteryResult.ResultData.betTier` 字段会告诉你这把是 low / mid / high 哪个。

服务器日志里看(开 debugLog):

```bash
ssh root@120.53.24.116 "pm2 logs yb-server" | grep lotteryResult
```

或者 PM2 进程里看玩家行为:

```bash
ssh root@120.53.24.116 "pm2 logs yb-server --lines 100"
```

---

## 十四、英文大奖动画

### 14.1 触发条件

**`winscore / totalBet ≥ bigWinMultiplier`(默认 20)** 才会播 overlay。

### 14.2 分级显示

| 倍数(基于 `bigWinMultiplier` 默认 20) | 显示 |
|---|---|
| 20× ~ 40× | BIG WIN |
| 40× ~ 100× | MEGA WIN |
| 100× ~ 200× | SUPER MEGA WIN |
| ≥ 200× | EPIC WIN |

阈值改了 admin 的 `bigWinMultiplier`,这些分级跟着自动变。

### 14.3 调试和回退

| URL 参数 | 作用 |
|---|---|
| `?testWin=1` | 加载后 1.2 秒触发一次假 BIG WIN(用来快速预览效果) |
| `?socketWinFx=0` | 关闭 overlay,显示 Cocos 自带的中文「大奖」动画(回退方案) |

测试地址:

```
https://yb.wtnslog.site/pinatawins/index.html?lang=en&code=cXO0E8snVT&backurl=openurl%3A%2F%2Fclosegame&testWin=1
```

### 14.4 改文案

`frontend/pinatawins/win-effect.js` 的 `pickTitle()` 函数(在文件靠前面)。改完同步到生产,记得改 `index.html` 里 `?v=2` 的版本号(否则浏览器缓存):

```html
<script src="win-effect.js?v=3"></script>
<link rel="stylesheet" href="win-effect.css?v=3">
```

---

## 十五、SQLite 数据库运维

### 15.1 基础信息

| 项 | 值 |
|---|---|
| 数据文件 | `/www/wwwroot/yb/backend/data/yb.db` |
| 模式 | WAL(Write-Ahead Log) |
| 业务表 | `games`、`merchants`、`merchant_games`、`merchant_game_strategies`、`players`、`transactions`、`spin_history`、`test_codes`、`launch_tokens` |
| 系统表 | `admin_users`、`admin_sessions`、`admin_audit` |
| 大小预期 | 1 年期 spin_history 约 500MB ~ 1GB |

### 15.2 常用 DB 操作

```bash
# 服务器上其实已装了 sqlite3 CLI:
sqlite3 /www/wwwroot/yb/backend/data/yb.db ".tables"

# 看游戏库
sqlite3 /www/wwwroot/yb/backend/data/yb.db \
  "SELECT game_id, name, status, asset_url FROM games"

# 看商户 × 游戏白名单
sqlite3 /www/wwwroot/yb/backend/data/yb.db \
  "SELECT merchant_id, game_id, enabled, created_at FROM merchant_games"

# 看玩家(按累计下注 desc)
sqlite3 /www/wwwroot/yb/backend/data/yb.db \
  "SELECT id, merchant_id, external_user_id, game_id, score, spin_count, total_bet, total_won FROM players ORDER BY total_bet DESC LIMIT 20"

# 看最近 10 次 spin
sqlite3 /www/wwwroot/yb/backend/data/yb.db \
  "SELECT round_id, player_id, game_id, bet, win, strategy, bet_tier, created_at FROM spin_history ORDER BY id DESC LIMIT 10"

# 看 (商户, 游戏) override 的策略 list
sqlite3 /www/wwwroot/yb/backend/data/yb.db \
  "SELECT merchant_id, game_id, length(strategy_config), updated_at FROM merchant_game_strategies"

# 看策略改动审计
sqlite3 /www/wwwroot/yb/backend/data/yb.db \
  "SELECT id, action, merchant_id, game_id, actor_user, actor_ip, created_at FROM admin_audit ORDER BY id DESC LIMIT 20"

# 或者走 API 拿审计(可加 gameId / merchantId 过滤)
curl -s -b cookies.txt "https://yb.wtnslog.site/api/admin/audit?limit=20&gameId=pinata-fiesta-wins" | jq
```

### 15.3 备份

```bash
# 复制 db 文件就是完整备份(SQLite 的优点)
cp /www/wwwroot/yb/backend/data/yb.db /www/backup/yb.db.$(date +%F)

# 也可以在运行时用 sqlite 的在线备份(更安全,不会破坏 WAL)
$NODE -e 'const d=require("./backend/db.js").init();d.backup("/www/backup/yb.db.online.backup").then(r=>console.log("backup ok:",r))'
```

建议用 cron 每天备份一次:

```bash
# 编辑 root 的 crontab
crontab -e

# 加一行(每天 03:00 备份,保留 14 天)
0 3 * * * cp /www/wwwroot/yb/backend/data/yb.db /www/backup/yb.db.$(date +\%F) && find /www/backup/yb.db.* -mtime +14 -delete
```

### 15.4 自动清理 1 年前数据

`backend/server.js` 已内置一个定时任务:每 24 小时执行一次 `DELETE FROM spin_history WHERE created_at < datetime('now', '-365 days')`。

要临时手动触发:

```bash
$NODE -e 'const d=require("./backend/db.js");d.init();console.log("deleted:", d.pruneOldHistory(365))'
```

### 15.5 如果 DB 满了 / 损坏了

```bash
# 1. 备份现有的
cp /www/wwwroot/yb/backend/data/yb.db /tmp/yb.db.broken

# 2. 检查完整性
$NODE -e 'const d=require("./backend/db.js").init();console.log(d.prepare("PRAGMA integrity_check").all())'

# 3. VACUUM 压缩
$NODE -e 'const d=require("./backend/db.js").init();d.prepare("VACUUM").run();console.log("vacuumed")'
```

### 15.6 从 DB 迁走 / 升级到 MySQL

如果数据量上来 SQLite 吃不住,迁 MySQL 大致步骤:

1. 写一个小脚本,`SELECT * FROM <table>` → 转成 MySQL `INSERT`
2. 改 `backend/db.js` 改用 mysql2 驱动和 API
3. 其他代码不用动(访问 db 都在 db.js 里封装了)

---

## 十六、变更记录

| 日期 | 变更 |
|---|---|
| 2026-05-11 | 首次部署到 yb.wtnslog.site,PM2 守护、HTTPS、Nginx 反代 |
| 2026-05-11 | 修复 nginx 全局 proxy_cache 拦截 admin 改动的问题(§10.7) |
| 2026-05-11 | 管理后台新增策略配置面板、实时统计面板 |
| 2026-05-11 | admin/ 路径改 no-cache,避免管理后台改文件后浏览器拿到旧版 |
| 2026-05-11 | 中大奖动画从 Cocos 中文图替换为自研英文 overlay,分级 BIG/MEGA/SUPER MEGA/EPIC |
| 2026-05-11 | 后端 ResultData 加 `totalBet` 和 `betTier` 字段 |
| 2026-05-11 | 上线行业标准 Bet-Tier 分级下注策略(low/mid/high),admin 23 个参数可调 |
| 2026-05-11 | **引入 SQLite 数据库**,玩家/spin_history/test_codes/admin_audit 全部持久化 |
| 2026-05-11 | 加 `/api/admin/audit` 审计日志接口,记录策略变更 |
| 2026-05-11 | **管理后台改用自研登录页**(scrypt + HttpOnly Cookie + 7 天 session),替代之前 Nginx Basic Auth |
| 2026-05-11 | 加 `admin_users` 和 `admin_sessions` 表;`admin_audit` 增加 `actor_user` 字段 |
| 2026-05-11 | **第三方商户接入(V1)**:商户 CRUD、HMAC 签名、launch token、流水回调、JS Bridge `bridge.js` |
| 2026-05-11 | Admin 后台拆成 5 页:dashboard / merchants / merchant 详情 / transactions / audit;每商户独立策略 + 测试 code 绑定商户 |
| 2026-05-12 | **🌟 升级为 WTNS Gaming Platform 多游戏平台:** |
| 2026-05-12 | 加 `games` / `merchant_games` / `merchant_game_strategies` 表,所有业务表加 `game_id` 列,自动迁移现有数据到 `pinata-fiesta-wins` |
| 2026-05-12 | 拆出 `backend/gameService.js`(games CRUD + 商户白名单);`getEffectiveStrategy(merchantId, gameId)` 三级 fallback |
| 2026-05-12 | `POST /api/merchant/launch` 必填 `gameId`,服务端校验白名单(`game_not_allowed_for_merchant`) |
| 2026-05-12 | 新 admin 页面:`games.html`(游戏库)/ `game.html`(单游戏详情 + 默认策略)/ 商户详情新增"可用游戏"tab |
| 2026-05-12 | dashboard / transactions / audit 全部加 game 维度过滤;merchant.html 策略/Tier/Code 都按 (商户, 游戏) 操作 |
| 2026-05-12 | 品牌从 PinataWins · Admin 改为 WTNS Gaming · Admin |
| 2026-05-12 | 商户 API 加 `GET /api/merchant/games`,所有 merchant API 支持 `gameId` query 过滤 |
| 2026-05-12 | **平台官网上线**:`/` 改为 WTNS Gaming landing page(暗色 + 渐变),不再直接跳到游戏 |
| 2026-05-12 | **游戏直链访问控制**:`/pinatawins/*` 等游戏资源目录无 cookie 时 302 到 `/?reason=needs-launch-token` |
| 2026-05-12 | 加公开 API `GET /api/public/games`(只返展示字段,不返 assetUrl) |

---

## 十七、多游戏平台运维(2026-05-12 后新增)

### 17.1 注册新游戏的完整流程

1. **拷贝前端资源**到 `frontend/<game-id>/`(必须有 `index.html` 入口)
   ```bash
   # 例如新游戏 future-spins
   mkdir -p /www/wwwroot/yb/frontend/future-spins
   # 把 cocos build 出来的 web-mobile 整个 cp 进去
   ```
2. **admin 注册**:进 `/admin/games.html` → 新增 → `gameId=future-spins`,`assetUrl=/future-spins/index.html`
3. **给商户开通**:进 `/admin/merchants.html` → 选商户 → "可用游戏" tab → 勾选 future-spins
4. **(可选)**:在 `/admin/game.html?id=future-spins` 改本游戏的默认策略,
   或者在 `/admin/merchant.html?id=<m>` 的策略 tab 切到 future-spins 单独配
5. **告诉商户**:让对方 `POST /api/merchant/launch` 时把 `gameId` 改成 `future-spins`

### 17.2 把某商户某游戏临时下线

```bash
# 方式 1:admin 后台关白名单(推荐)
# /admin/merchant.html?id=<m> → 可用游戏 tab → 取消勾选

# 方式 2:DB 直改(应急)
sqlite3 /www/wwwroot/yb/backend/data/yb.db \
  "UPDATE merchant_games SET enabled=0 WHERE merchant_id='<m>' AND game_id='<g>'"
# 立即生效,无需重启;商户下次 launch 该游戏会拿到 403 game_not_allowed_for_merchant
```

### 17.3 把整个游戏全平台下线

```bash
# admin 进 /admin/game.html?id=<g> → 顶部 "禁用" 按钮
# 或 DB:
sqlite3 /www/wwwroot/yb/backend/data/yb.db \
  "UPDATE games SET status='disabled' WHERE game_id='<g>'"
# 任何商户 launch 该游戏会被拒绝(因为 isMerchantGameAllowed 也校验 games.status)
```

### 17.4 平台官网 (`/`)

`yb.wtnslog.site` 根目录现在是 WTNS Gaming 平台官网(B2B landing page),
不再直接跳到游戏。文件:

```
frontend/index.html       官网 HTML(暗色 + 渐变)
frontend/site.css         官网样式
frontend/site.js          官网脚本(拉 /api/public/games 渲染游戏卡片 + 弹回提示)
```

修改官网内容直接编辑这三个文件,`pm2 reload` 后刷浏览器即可。
记得官网静态资源默认 cache 1 天,改完想立即看效果用 `Cmd+Shift+R`。

### 17.5 游戏直链访问控制(防匿名访问)

**机制**:
1. server.js 在 serveStatic 之前加了一个 middleware:`isGameAssetPath(pathname)` 判断
   请求是否落在某个游戏的资源目录(`/pinatawins/*`、`/future-spins/*` 等)
2. 是的话,要求请求带 `yb_embed_session` cookie,且 cookie 里的 `gameId` 经过
   `gameService.getGame(gameId)` 解析出的 asset 目录前缀必须**精确匹配**当前请求的目录
3. 不满足 → 302 到 `/?reason=needs-launch-token`,前端弹 toast 提示

**白名单顶级路径**(不会被拦截):`/admin/`、`/api/`、`/socket.io/`、
`/embed`、`/play`、`/authLogin`、`/lottery`,以及 `/site.css` `/site.js` `/favicon.ico` 等
顶级文件(因为 `site` 不是任何游戏的 gameId)。

**测试**:

```bash
# 应该 302 到 /?reason=needs-launch-token
curl -s -i https://yb.wtnslog.site/pinatawins/index.html | head -3

# 应该 200(用 admin 后台拿一个测试 code,然后跑这条整个 flow)
CODE="<some code>"
rm -f /tmp/jar.txt
curl -s -L -c /tmp/jar.txt "https://yb.wtnslog.site/play?code=$CODE" -o /dev/null -w "Final HTTP: %{http_code}\n"
# 然后用同一个 cookie jar 直接拉游戏 index 应该 200
curl -s -o /dev/null -w "%{http_code}\n" -b /tmp/jar.txt https://yb.wtnslog.site/pinatawins/index.html
```

**新增游戏时**:在 admin 注册 + 上传资源到 `frontend/<game-id>/` 即可,
访问控制是基于 `games` 表里 `asset_url` 自动算出来的(30s 内存缓存),
**不需要改服务端代码**。

**遇到玩家说"打不开游戏"**(可能是 cookie 过期 / domain 不对):
1. 检查浏览器 application tab 里有没有 `yb_embed_session` cookie
2. 查看 cookie 的 `gameId` 是不是当前要访问的游戏
3. cookie 24h 过期,过期后需要重新走 launch 流程

### 17.6 公开游戏列表 API (`/api/public/games`)

无需登录、无需签名,任何人都可访问。返回的游戏对象**故意不包含 `assetUrl`**,
防止泄露内部资源路径(攻击者无法据此拼出"绕过"路径,反正 cookie 才是真正的门禁)。

返回字段:`gameId / name / type / iconUrl / description`,只展示 `status='active'` 的游戏。

官网 `frontend/site.js` 用这个接口渲染游戏卡片。第三方也可以拿来做"游戏目录"展示。

### 17.7 三级策略 fallback 调试

如果有玩家反映"策略不对",拉一下 effective strategy:

```bash
# admin 已登录拿到 cookie 后
curl -s -b cookies.txt \
  'https://yb.wtnslog.site/api/admin/merchants/<m>/games/<g>/strategy' \
  | jq '{ hasOverride, rtpTarget: .strategy.rtpTarget, bigWinMultiplier: .strategy.bigWinMultiplier }'
```

`hasOverride: true` = 走 (m, g) 单独配置;`false` = 该商户该游戏没单独配,
落到 `games.default_strategy` 或者 `strategy-config.json` 兜底。

如果发现策略不该是这个值:
- 查 `merchant_game_strategies` 表是否有意外 row
- 查 `games.default_strategy` 字段
- 查 `strategy-config.json` 的字段

---

**最后更新:** 2026-05-12 上线 WTNS Gaming 平台官网 + 游戏直链访问控制 + 公开游戏列表 API

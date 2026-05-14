# 后端部署文档

> 项目入口:`backend/server.js`(Node.js 原生 HTTP,0 npm 依赖)
> 这一个 Node 进程同时承担:API、Socket.IO polling、frontend 静态、admin 静态。
> 因此"部署后端"= 部署整个项目。

---

## 目录

- [0. 部署架构](#0-部署架构)
- [1. 服务器环境要求](#1-服务器环境要求)
- [2. 服务器初始化(一次性)](#2-服务器初始化一次性)
- [3. 上传代码](#3-上传代码)
- [4. 配置环境变量](#4-配置环境变量)
- [5. 用 PM2 启动 Node](#5-用-pm2-启动-node)
- [6. 配置 Nginx 反向代理](#6-配置-nginx-反向代理)
- [7. 配置 HTTPS](#7-配置-https)
- [8. 保护管理后台(可选)](#8-保护管理后台可选)
- [9. 后续更新流程](#9-后续更新流程)
- [10. 日常运维](#10-日常运维)
- [11. 必须知道的几个坑](#11-必须知道的几个坑)
- [12. 故障排查](#12-故障排查)
- [附录 A:PM2 ecosystem 配置](#附录-apm2-ecosystem-配置)
- [附录 B:文件清单](#附录-b文件清单)
- [附录 C:上线检查清单](#附录-c上线检查清单)

---

## 0. 部署架构

```
                     ┌─────────────────────────────┐
                     │   你的域名 your-domain.com   │
                     └──────────────┬──────────────┘
                                    │ 443 (HTTPS)
                            ┌───────▼────────┐
                            │     Nginx       │   ← 反向代理 + TLS + gzip
                            └───────┬────────┘
                                    │ 127.0.0.1:3000
                            ┌───────▼────────┐
                            │   Node 进程    │   ← PM2 守护
                            │ backend/server.js│
                            └───────┬────────┘
                                    │
                ┌───────────────────┼───────────────────┐
                │                   │                   │
        ┌───────▼────────┐  ┌───────▼────────┐  ┌──────▼──────┐
        │ games/<gameId> │  │ admin/    (静) │  │ /api  /authLogin│
        │ /fishstar/ 等  │  │ /admin/        │  │ /socket.io/   │
        └────────────────┘  └────────────────┘  └─────────────┘
```

---

## 1. 服务器环境要求

| 项 | 要求 |
|---|---|
| 操作系统 | Ubuntu 22.04 / Debian 12 |
| Node.js | ≥ 18(本文用 20 LTS) |
| 内存 | ≥ 1 GB |
| 磁盘 | ≥ 5 GB |
| 端口 | 22(SSH)、80、443 |
| 域名 | 强烈建议(否则没法上 HTTPS) |

---

## 2. 服务器初始化(一次性)

### 2.1 创建部署用户

```bash
ssh root@<服务器IP>
adduser deploy
usermod -aG sudo deploy
su - deploy
```

### 2.2 安装 Node.js 20 LTS

```bash
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs
node -v   # 应输出 v20.x
```

### 2.3 安装 PM2 和 Nginx

```bash
sudo npm install -g pm2
sudo apt-get install -y nginx
```

### 2.4 配置防火墙

```bash
sudo ufw allow 22
sudo ufw allow 80
sudo ufw allow 443
sudo ufw enable
sudo ufw status
```

---

## 3. 上传代码

### 方式 A:Git(推荐,长期维护省心)

```bash
# 本机:推到 GitHub/Gitee 私有仓库
cd <项目目录>
git remote add origin git@github.com:你的账号/yb.git
git push -u origin main

# 服务器:克隆
cd ~
git clone git@github.com:你的账号/yb.git
cd yb
```

### 方式 B:scp(一次性快上)

```bash
# 本机
cd <项目父目录>
tar -czf yb.tar.gz --exclude='YB/.sisyphus' --exclude='YB/.git' YB
scp yb.tar.gz deploy@<服务器IP>:~/

# 服务器
cd ~
tar -xzf yb.tar.gz
mv YB yb
cd yb
```

---

## 4. 配置环境变量

项目根目录有一份 `.env.example`,列出了所有可用的环境变量。

| 变量名 | 默认 | 作用 |
|---|---|---|
| `PORT` | `3000` | Node 监听端口 |
| `CORS_ALLOWED_ORIGINS` | `*`(开发模式) | CORS 白名单,逗号分隔。**生产必须设置成你的域名**,不要留 `*` |
| `EMBED_SESSION_SECRET` | 无 | `yb_embed_session` 签名密钥。生产必须固定配置,否则 Node 重启会让已打开的游戏会话失效 |
| `WTNS_GAMES_ROOT` | `/www/wwwroot/wtns/games` | 多游戏静态根目录,下面按 `gameId` 放置,例如 `fishstar/index.html` |
| `WTNS_ADMIN_DIR` / `WTNS_OFFICIAL_DIR` | `/www/wwwroot/wtns/admin` / `/www/wwwroot/wtns/official` | 拆 repo 部署时覆盖 admin 和官网静态目录 |

### 推荐做法:写到 PM2 ecosystem 文件(见[附录 A](#附录-apm2-ecosystem-配置))

也可以用 shell export 临时设置:

```bash
export PORT=3000
export CORS_ALLOWED_ORIGINS="https://your-domain.com"
export EMBED_SESSION_SECRET="replace-with-a-long-random-secret"
export WTNS_GAMES_ROOT="/www/wwwroot/wtns/games"
```

---

## 5. 用 PM2 启动 Node

### 5.1 第一次手动验证

```bash
cd ~/yb
PORT=3000 CORS_ALLOWED_ORIGINS="https://your-domain.com" EMBED_SESSION_SECRET="replace-with-a-long-random-secret" node backend/server.js
```

成功会看到:

```
WTNS Gaming running at http://localhost:3000
CORS allowed origins: https://your-domain.com
```

→ Ctrl+C 退出。

### 5.2 PM2 守护

推荐用项目自带的 `deploy.sh` 一把启动:

```bash
cd ~/yb
./deploy.sh
```

或者手动:

```bash
pm2 start backend/server.js --name yb-server --update-env
pm2 save
pm2 startup
# 上一行会输出一段命令,复制粘贴执行一次,实现开机自启
```

### 5.3 验证

```bash
curl http://127.0.0.1:3000/api/game
# 能返回 JSON 即成功
```

### 5.4 PM2 常用命令速查

| 命令 | 作用 |
|---|---|
| `pm2 status` | 查看进程状态 |
| `pm2 logs yb-server` | 实时日志 |
| `pm2 logs yb-server --lines 200` | 最近 200 行 |
| `pm2 restart yb-server` | 强制重启(DB 数据不丢,但 Socket.IO session 断开) |
| `pm2 reload yb-server` | 零停机重启(推荐) |
| `pm2 stop yb-server` | 停止 |
| `pm2 delete yb-server` | 删除进程 |
| `pm2 monit` | 实时监控面板 |

---

## 6. 配置 Nginx 反向代理

### 6.1 写配置文件

```bash
sudo nano /etc/nginx/sites-available/yb
```

粘贴以下内容,把 `your-domain.com` 替换成你的域名:

```nginx
server {
    listen 80;
    server_name your-domain.com;
    client_max_body_size 5m;

    # gzip 压缩(Cocos 引擎 2M js 压完只剩 600K)
    gzip on;
    gzip_types application/javascript text/css application/json image/svg+xml;
    gzip_min_length 1024;
    gzip_proxied any;

    # Socket.IO polling 长连接
    location /socket.io/ {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_read_timeout 60s;
        proxy_send_timeout 60s;
    }

    # 其余请求(前端静态、admin、API、authLogin)全部转给 Node
    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

### 6.2 启用并 reload

```bash
sudo ln -s /etc/nginx/sites-available/yb /etc/nginx/sites-enabled/yb
sudo rm -f /etc/nginx/sites-enabled/default
sudo nginx -t                          # 语法检查
sudo systemctl reload nginx
```

### 6.3 验证

- 浏览器访问 `http://your-domain.com/`,应该自动跳转到游戏。
- 访问 `http://your-domain.com/admin/`,应该看到管理后台。

---

## 7. 配置 HTTPS

```bash
sudo apt-get install -y certbot python3-certbot-nginx
sudo certbot --nginx -d your-domain.com
```

按提示操作:
- 输入邮箱
- 同意条款
- 选择 `Redirect`(把 HTTP 全部强制跳到 HTTPS)

certbot 会自动:
- 申请 Let's Encrypt 免费证书
- 修改你的 nginx 配置加上 443 server 段
- 设置自动续期(每 60 天自动续)

验证续期:

```bash
sudo certbot renew --dry-run
```

> ⚠️ 上了 HTTPS 之后,记得回到 [§4 环境变量](#4-配置环境变量)把 `CORS_ALLOWED_ORIGINS` 改成 `https://...` 开头,然后 `pm2 reload yb-server --update-env`。

---

## 8. 保护管理后台(可选)

`admin/` 路径默认任何人都能访问。建议加 HTTP Basic Auth。

```bash
sudo apt-get install -y apache2-utils
sudo htpasswd -c /etc/nginx/.htpasswd admin
# 输入你想要的密码
```

编辑 nginx 配置,在 `server { ... }` 内加两段:

```nginx
location /admin/ {
    auth_basic "Admin Area";
    auth_basic_user_file /etc/nginx/.htpasswd;
    proxy_pass http://127.0.0.1:3000;
    proxy_http_version 1.1;
    proxy_set_header Host $host;
}

location /api/admin/ {
    auth_basic "Admin Area";
    auth_basic_user_file /etc/nginx/.htpasswd;
    proxy_pass http://127.0.0.1:3000;
    proxy_http_version 1.1;
    proxy_set_header Host $host;
}
```

reload:

```bash
sudo nginx -t && sudo systemctl reload nginx
```

之后访问 `/admin/` 和 `/api/admin/*` 都需要密码,普通玩家进游戏不受影响。

---

## 9. 后续更新流程

### 标准更新(用 deploy.sh)

```bash
# 本机
git push

# 服务器
~/yb/deploy.sh
```

`deploy.sh` 会自动 `git pull → npm run check → pm2 reload → 打印最新日志`。

支持的参数:

| 参数 | 作用 |
|---|---|
| `--no-pull` | 不拉代码,只 reload(适合改了环境变量) |
| `--restart` | 用 restart 代替 reload(会断开所有 Socket.IO 长连接,DB 数据不丢) |
| `--help` | 查看帮助 |

### 回滚

```bash
cd ~/yb
git log --oneline -10                    # 查看最近 10 个 commit
git reset --hard <要回滚到的 commit hash>
./deploy.sh --no-pull
```

---

## 10. 日常运维

### 服务状态

```bash
pm2 status                            # Node 进程
sudo systemctl status nginx           # Nginx
df -h                                 # 磁盘
free -h                               # 内存
```

### 日志路径

| 日志 | 路径 |
|---|---|
| PM2 stdout | `~/.pm2/logs/yb-server-out.log` |
| PM2 stderr | `~/.pm2/logs/yb-server-error.log` |
| Nginx access | `/var/log/nginx/access.log` |
| Nginx error | `/var/log/nginx/error.log` |

### 日志轮转

PM2 日志可能越积越大,加上 logrotate:

```bash
pm2 install pm2-logrotate
pm2 set pm2-logrotate:max_size 50M
pm2 set pm2-logrotate:retain 7
```

---

## 11. 必须知道的几个坑

### 11.1 数据持久化

| 数据 | 存储方式 | 重启后是否保留 |
|---|---|---|
| `backend/strategy-config.json` 策略配置 | 文件 | ✅ 保留 |
| 玩家账号、余额 | 内存 | ❌ 丢失 |
| 测试 code | 内存 | ❌ 丢失 |
| Socket.IO session | 内存 | ❌ 丢失 |

→ 如果有真实玩家,**`pm2 restart` 前一定要慎重**。后续可以接 SQLite/Redis 做持久化。

### 11.2 strategy-config.json 会被管理后台写回

管理后台调 `POST /api/admin/strategy` 会改 `backend/strategy-config.json`。
建议把这个文件加到 `.gitignore`,否则每次 `git pull` 会冲突:

```bash
echo "backend/strategy-config.json" >> .gitignore
git rm --cached backend/strategy-config.json
git commit -m "ignore runtime strategy config"
git push
```

### 11.3 静态资源缓存策略

最新版 `backend/server.js` 已经按文件名做了分级缓存:

| 文件类型 | Cache-Control | 说明 |
|---|---|---|
| 带 hash 的文件(`main.8a7aa.js` 等) | `public, max-age=31536000, immutable` | 永久缓存,改了 hash 才会重新下载 |
| `*.html` | `no-cache` | 每次校验,保证发版立即生效 |
| 其他静态 | `public, max-age=86400` | 1 天 |

→ 玩家第二次开游戏不会再下载 24M Cocos 资源。

### 11.4 镜像脚本

`scripts/mirror_pinatawins.py` 只在本地准备资源时用,**不要在生产服务器上执行**。

### 11.5 PM2 startup 必须执行

`pm2 save` 只是保存当前进程列表,**服务器重启后并不会自动恢复**,必须先执行过一次 `pm2 startup` 输出的那段命令(它会装一个 systemd 服务)。

---

## 12. 故障排查

### 12.1 网站打不开

```bash
# 1. Node 进程是否在跑?
pm2 status
pm2 logs yb-server --lines 50

# 2. 3000 端口是否监听?
sudo ss -tlnp | grep 3000

# 3. Nginx 是否正常?
sudo systemctl status nginx
sudo nginx -t

# 4. 域名解析是否生效?
dig your-domain.com
```

### 12.2 502 Bad Gateway

→ Node 进程挂了或没监听 3000 端口。检查 `pm2 logs yb-server`。

### 12.3 Socket.IO 连不上

→ 检查 nginx `/socket.io/` 段配置是否完整,特别是:
- `proxy_http_version 1.1`
- `Upgrade $http_upgrade`
- `Connection "upgrade"`

### 12.4 CORS 报错

启动日志里会打印:

```
CORS allowed origins: https://your-domain.com
```

如果浏览器报 CORS,核对:
- `CORS_ALLOWED_ORIGINS` 是不是写了正确的 origin(注意 `http://` vs `https://`,有无端口号都要严格匹配)
- pm2 reload 时有没有用 `--update-env`

### 12.5 证书过期

```bash
sudo certbot renew
sudo systemctl reload nginx
```

---

## 附录 A:PM2 ecosystem 配置

如果环境变量很多,建议在项目根目录建一个 `ecosystem.config.js`(已经 .gitignore 掉,避免泄露密钥):

```javascript
module.exports = {
  apps: [{
    name: 'yb-server',
    script: 'backend/server.js',
    instances: 1,
    autorestart: true,
    watch: false,
    max_memory_restart: '500M',
    env: {
      NODE_ENV: 'production',
      PORT: 3000,
      CORS_ALLOWED_ORIGINS: 'https://your-domain.com'
    }
  }]
};
```

启动:

```bash
pm2 start ecosystem.config.js --update-env
pm2 save
```

之后改了环境变量,执行:

```bash
pm2 reload yb-server --update-env
```

---

## 附录 B:文件清单

| 文件 | 作用 |
|---|---|
| `backend/server.js` | 主入口,启动 HTTP 服务 |
| `backend/pinataLocalService.js` | authLogin、Socket.IO 事件、玩家会话 |
| `backend/gameEngine.js` | 老虎机算法 |
| `backend/gameStrategyConfig.js` | 策略读写 |
| `backend/testCodeService.js` | 测试 code 生成 |
| `backend/strategy-config.json` | **运行时数据**,管理后台会改写 |
| `frontend/` | 静态游戏前端(含 25M Cocos `pinatawins/`) |
| `admin/` | 管理后台静态文件 |
| `deploy.sh` | 服务器端一键部署脚本 |
| `.env.example` | 环境变量样例,文档作用 |
| `package.json` | `npm start` / `npm run check` |
| `scripts/` | 仅本地用的资源镜像脚本,**不要在生产跑** |

---

## 附录 C:上线检查清单

部署完成后,逐项确认:

- [ ] `pm2 status` 显示 `yb-server` 为 `online`
- [ ] `pm2 startup` 那段命令已经执行过(开机自启)
- [ ] `pm2 save` 已执行
- [ ] `curl http://127.0.0.1:3000/api/game` 返回 JSON
- [ ] 启动日志里 `CORS allowed origins` 不是 `* (wildcard, dev only)`
- [ ] 浏览器访问域名能进入游戏
- [ ] 浏览器访问 `/admin/` 能进入管理后台
- [ ] HTTPS 证书已配置,HTTP 自动跳转 HTTPS
- [ ] `/admin/` 已加 Basic Auth(如启用)
- [ ] `sudo certbot renew --dry-run` 通过
- [ ] `backend/strategy-config.json` 已加入 `.gitignore`
- [ ] PM2 日志轮转已配置
- [ ] `deploy.sh` 可以正常执行

---

**最后更新:** 2026-05-11

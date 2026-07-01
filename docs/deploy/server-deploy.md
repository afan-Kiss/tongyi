# tongyi 服务器部署指南

> 目标：生产环境 **只部署 tongyi**，不再单独部署旧记账、旧主播分析、旧扫码系统。

---

## 1. 环境要求

| 项 | 要求 |
|----|------|
| 操作系统 | Linux（推荐 Ubuntu 22.04+）或 Windows Server |
| Node.js | **20 LTS** 或 **22 LTS**（与开发一致） |
| npm | 10+ |
| 反向代理 | Nginx（HTTPS 必须） |
| 进程管理 | PM2 或 systemd |
| 磁盘 | SQLite + 图片目录，建议 ≥ 50GB |

---

## 2. 获取代码

```bash
git clone https://github.com/afan-Kiss/tongyi.git
cd tongyi
npm install
```

---

## 3. 环境变量

在 `apps/server/.env` 或系统环境中配置：

```env
# 必填
NODE_ENV=production
DATABASE_URL=file:../data/app.db
SESSION_SECRET=请换成随机长字符串

# 端口（Linux 服务器推荐默认 1212）
TONGYI_PORT_BASE=1212

# 图片与媒体
MEDIA_ROOT=/var/tongyi/media

# 旧系统备份（迁移期可选，非主入口）
JIZHANG_WEB_URL=http://127.0.0.1:3001
LIVE_ANALYSIS_WEB_URL=http://127.0.0.1:4723

# 本地助手连接（公司内网电脑）
AGENT_SHARED_SECRET=请换成随机字符串
```

说明：

- Windows 开发机若 1212 被 Hyper-V 保留，设置 `TONGYI_PORT_BASE=9000`。
- 服务器上 **不要** 把 Excel/打印机/千帆 CDP 配进 server；这些由 local-agent 执行。

---

## 4. 数据库迁移

```bash
cd tongyi
export DATABASE_URL=file:../data/app.db   # Linux/macOS
# PowerShell: $env:DATABASE_URL='file:../data/app.db'

npm run db:generate
npm run db:migrate
```

首次部署会在 `apps/server/data/app.db` 创建 SQLite 文件。

---

## 5. 构建

```bash
npm run build
# 等价于
npm run build:web && npm run build:server
```

构建产物：

- `apps/web/dist` — 前端静态文件（由 server 托管）
- `apps/server/dist` — 后端 JS

---

## 6. PM2 启动（推荐）

在项目根目录创建 `ecosystem.config.cjs`：

```javascript
module.exports = {
  apps: [
    {
      name: 'tongyi',
      cwd: './apps/server',
      script: 'dist/index.js',
      env: {
        NODE_ENV: 'production',
        DATABASE_URL: 'file:../data/app.db',
        TONGYI_PORT_BASE: '1212',
      },
      instances: 1,
      autorestart: true,
      max_memory_restart: '1G',
    },
  ],
}
```

或使用仓库自带 supervisor（含 Excel 桥、祥钰、print-agent）：

```bash
npm run start:all
```

生产 Linux 上若不需要 Windows Excel COM，可只 PM2 启动 `@jade/server`，Excel/打印任务交给 Windows local-agent。

---

## 7. Nginx HTTPS

```nginx
server {
    listen 443 ssl http2;
    server_name your-domain.com;   # 或服务器 IP 的域名

    ssl_certificate     /etc/nginx/ssl/fullchain.pem;
    ssl_certificate_key /etc/nginx/ssl/privkey.pem;

    client_max_body_size 50m;

    location / {
        proxy_pass http://127.0.0.1:1212;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    # 图片可直接由 Nginx 托管（可选，减轻 Node 压力）
    location /media/ {
        alias /var/tongyi/media/;
        expires 7d;
    }
}
```

HTTP 强制跳转 HTTPS：

```nginx
server {
    listen 80;
    server_name your-domain.com;
    return 301 https://$host$request_uri;
}
```

---

## 8. 目录规划

| 路径 | 用途 |
|------|------|
| `apps/server/data/app.db` | 主数据库 |
| `/var/tongyi/media` 或 `MEDIA_ROOT` | 图片中心 |
| `/var/tongyi/backups` | 数据库备份 |
| 公司电脑 `local-agent` | Excel、打印、千帆 |

---

## 9. 数据库备份

cron 示例（每日 3 点）：

```bash
0 3 * * * cp /path/to/tongyi/apps/server/data/app.db /var/tongyi/backups/app-$(date +\%Y\%m\%d).db
```

保留 30 天：

```bash
find /var/tongyi/backups -name 'app-*.db' -mtime +30 -delete
```

---

## 10. 本地助手连接服务器

1. 在公司 Windows 电脑克隆同一 tongyi 仓库或仅部署 `scripts/local-agent`。
2. 配置：

```env
TONGYI_SERVER_URL=https://your-domain.com
AGENT_SHARED_SECRET=与服务器相同
```

3. 启动：

```bash
npm run local-agent
```

4. 在 tongyi 页面 `/inventory/agents` 确认在线。

本地助手负责：

- Excel 读写
- 打印机
- 千帆客服台 CDP 发送/监听（第三批迁入后）

---

## 11. 迁移期注意事项

1. **不要** 在服务器再部署 `记账系统`、`主播分析软件` 独立服务。
2. `JIZHANG_WEB_URL` 仅作备份只读，主入口是 `/inventory/accounting`。
3. 旧 `扫码枪登记出入库系统` 端口 4725 系列不再使用。
4. 部署后验收：
   - `https://域名/inventory` 总览正常
   - `https://域名/inventory/scan` 扫码正常
   - `https://域名/api/v1/health` 返回 ok

---

## 12. 故障排查

| 现象 | 处理 |
|------|------|
| 端口占用 | 检查 `TONGYI_PORT_BASE`；运行 `node scripts/port-precheck.js` |
| 数据库锁定 | 停止重复 PM2 实例；检查备份脚本是否正在复制 db |
| 图片 404 | 检查 `MEDIA_ROOT` 权限与 Nginx alias |
| 扫码无财务提醒 | 检查 `OrderFinanceAlert` 表；记账是否填写订单/物流单号 |
| local-agent 离线 | 检查 `AGENT_SHARED_SECRET` 与防火墙 |

---

## 13. 升级流程

```bash
cd tongyi
git pull
npm install
npm run db:migrate
npm run build
pm2 restart tongyi
```

升级前务必备份 `app.db`。

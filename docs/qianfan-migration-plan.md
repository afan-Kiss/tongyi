# 千帆机器人迁移方案（第三批）

> 源仓库：`E:\我的软件源码\千帆中转机器人`  
> 目标：监听、发送、微信通知、Cookie 被动采集纳入 tongyi；**本地助手执行，服务器存数据与下发任务**。

---

## 1. 现状

### 1.1 千帆中转机器人（Electron）

| 项 | 内容 |
|----|------|
| 入口 | `src/main/main.js` |
| 本地 API | `src/qianfan-local-api.js` → 端口 **9323** |
| DevTools | 千帆客户端 **9322** |
| Workers | `qianfan-listener`、`qianfan-sender`、`wechat-notifier`、`wechat-reply`、`wechat-callback`、`persistence` |
| 关键文件 | `qianfan-message-listener.js`、`qianfan-send-guard.js`、`wechat-to-qianfan-reply.js`、`qianfan-cookie-collector.js`、`qf-send-payload.js` |

### 1.2 tongyi 已有能力

| 模块 | 路径 | 作用 |
|------|------|------|
| qianfan-relay | `apps/server/src/modules/qianfan-relay/` | 状态、消息缓存、启停 relay |
| qianfan-send | `apps/server/src/modules/qianfan-send/` | 任务队列 `QianfanSendJob`、严格目标锁字段 |
| local-agent | `scripts/local-agent/executors/qianfan-send.executor.js` | 调用 9323 `/send` |
| 前端 | `apps/web/src/pages/QianfanRelayPage.tsx` | 状态 + 发送任务列表 |

---

## 2. 目标架构

```
┌─────────────────────────────────────────────────────────┐
│  tongyi server (HTTPS)                                   │
│  modules/qianfan/  — 路由、设置、消息持久化、任务下发     │
│  SystemStatus      — 监听/发送/微信/Cookie 状态           │
│  Prisma            — QianfanMessage, QianfanSetting...   │
└───────────────────────────┬─────────────────────────────┘
                            │ WebSocket / HTTP 轮询
┌───────────────────────────▼─────────────────────────────┐
│  tongyi local-agent (Windows EXE)                        │
│  apps/agent/src/qianfan/                                 │
│    listener, sender, target-guard, payload-builder       │
│    ack-waiter, echo-verifier, cookie-collector           │
│    wechat-bridge                                         │
└───────────────────────────┬─────────────────────────────┘
                            │ CDP 9322 / 本地 API 9323
┌───────────────────────────▼─────────────────────────────┐
│  千帆客服台客户端 + 微信 wxbot 运行时                      │
└─────────────────────────────────────────────────────────┘
```

**原则**：服务器不直接操作 CDP；Cookie **被动采集**（只读同步，不伪造登录）。

---

## 3. 代码迁移映射

### 3.1 → `apps/agent/src/qianfan/`

| 源文件（千帆机器人） | 目标模块 | 说明 |
|---------------------|----------|------|
| `workers/qianfan-listener.worker.js` | `listener/` | WebSocket/页面监听 |
| `qianfan-message-listener.js` | `listener/message-parser.ts` | 消息解析 |
| `workers/qianfan-sender.worker.js` | `sender/` | CDP 发送 |
| `qianfan-send-guard.js` | `target-guard/` | shopTitle+buyerNick+appCid 目标锁 |
| `qf-send-payload.js` | `payload-builder/` | 发送载荷 |
| `qianfan-native-sync.js` + ACK 逻辑 | `ack-waiter/`、`echo-verifier/` | 发送确认 |
| `qianfan-cookie-collector.js` | `cookie-collector/` | 被动采集 |
| `shop-cookie-uploader.js` | `cookie-collector/upload.ts` | 上传至 server |
| `wechat-to-qianfan-reply.js` | `wechat-bridge/reply.ts` | 微信引用回复 |
| `workers/wechat-notifier.worker.js` | `wechat-bridge/notifier.ts` | 买家消息通知微信 |
| `qianfan-local-api.js` | `local-api/server.ts` | agent 内嵌 API（替代独立 Electron） |

### 3.2 → `apps/server/src/modules/qianfan/`

| 文件 | 职责 |
|------|------|
| `qianfan.routes.ts` | 统一 `/api/v1/qianfan/*`（逐步替代 relay 分散路由） |
| `qianfanMessage.service.ts` | 消息入库、查询、recent/pending |
| `qianfanSend.service.ts` | 合并现有 `qianfan-send` 模块 |
| `qianfanStatus.service.ts` | 聚合 agent 心跳 → SystemStatus |
| `qianfanSettings.service.ts` | 店铺、Cookie 元数据、开关 |

### 3.3 保留在 tongyi 不动

- `QianfanSendJob` / `QianfanSendAttempt` 表（已存在）
- 扫码、库存、记账模块

---

## 4. Prisma 数据表（计划新增）

| 模型 | 用途 |
|------|------|
| `QianfanMessage` | 持久化监听到的买家消息 |
| `QianfanNotification` | 微信通知记录 |
| `QianfanShopCookie` | 店铺 Cookie 快照（只读同步） |
| `QianfanSetting` | 全局/店铺开关 |

与现有 `QianfanSendJob` 通过 `replyId`、`appCid`、`buyerNick` 关联。

---

## 5. SystemStatus 集成

在 `apps/server/src/modules/system-status/` 增加：

| 键 | 含义 |
|----|------|
| `qianfan.listener` | 监听 worker 是否运行 |
| `qianfan.sender` | 发送 worker 是否运行 |
| `qianfan.wechat` | 微信回调是否在线 |
| `qianfan.cookie` | 最近 Cookie 同步时间 |
| `qianfan.devtools` | 9322 是否可达 |

local-agent 定期 POST `/api/v1/agent/heartbeat` 携带上述快照。

---

## 6. 自动回复与自动发送

1. **创建任务**：用户在 tongyi 页面或 API 创建 `QianfanSendJob`（必须带 target lock 字段）。
2. **下发**：server 写入 `AgentTask`，local-agent 拉取。
3. **执行**：agent `sender` 经 CDP 发送，**禁止**未带 receiverAppUids 的广播。
4. **ACK**：`ack-waiter` 等待千帆 ACK；超时 → 重试（最多 `maxAttempts`）。
5. **回声确认**：`echo-verifier` 在会话列表确认消息出现后才标记 `sent`。
6. **自动回复**：微信回调 → agent `wechat-bridge` → 解析引用 → 创建 send job（与现机器人相同链路）。

---

## 7. Cookie 被动采集原则

1. 仅当千帆客户端已登录且 CDP 可连接时采集。
2. 不存储明文密码；只存 cookie 字符串与过期时间。
3. server 提供 `POST /api/v1/qianfan/cookies/sync` 接收 agent 上传。
4. 主播分析等模块从 tongyi server 读 Cookie，**不再**各自独立上传逻辑。

---

## 8. 迁移步骤（建议顺序）

| 步骤 | 内容 | 风险 |
|------|------|------|
| 1 | 文档与目录脚手架 `apps/agent/src/qianfan/` | 低 |
| 2 | 迁移 `qianfan-send` executor 为 TypeScript，统一 ACK | 中 |
| 3 | 迁移 listener → 消息写 Prisma | 中 |
| 4 | 迁移 wechat-bridge → agent | 高（需 wxbot 运行时） |
| 5 | Cookie collector → server 表 | 中 |
| 6 | 前端 Qianfan 页合并 relay + send + 消息 | 低 |
| 7 | Electron 机器人改只读/对照模式 | 低 |
| 8 | 打包 local-agent.exe | 中 |

---

## 9. 不可破坏的 invariant（来自机器人 check 脚本）

- 目标锁：`shopTitle` + `buyerNick` + `appCid` + `receiverAppUids` 必填
- 发送去重：同 payload 短窗口内不重复
- Worker 崩溃 watchdog 重启
- 失败回执 owner 明确（agent vs server）
- Cookie API **只读**（check:qianfan-cookie-readonly）

迁移时必须保留这些检查，对应添加到 tongyi `scripts/check-qianfan-*.js`。

---

## 10. 验收

- [ ] tongyi `/inventory/qianfan` 可查看监听消息与发送任务
- [ ] 文字/图片发送经 agent 完成且有 ACK 状态
- [ ] 买家消息触发微信通知（local-agent 在线时）
- [ ] 微信引用回复可创建千帆发送任务
- [ ] Cookie 同步可在 server 查看，主播分析可复用
- [ ] 服务器 **无** CDP 直连代码
- [ ] 旧 Electron 机器人可停止且功能不丢失

---

## 11. 本阶段（与第一批并行）

**本提交仅交付本文档**，不做第三批代码迁移。第三批在记账稳定、主播分析第二批启动后进行。

# 统一经营台 — 全系统迁移规划

> 扫描基准：`E:\我的软件源码`（2026-07-01）  
> 主仓库：https://github.com/afan-Kiss/tongyi  
> 原则：**一个 tongyi 前端 + 一个 tongyi 后端 + 一个 tongyi 数据库 + 一个部署入口 + 一个本地助手**

---

## 1. 发现的系统清单

| # | 系统 | 本地路径 | 状态 |
|---|------|----------|------|
| 1 | **tongyi 统一经营台** | `E:\我的软件源码\tongyi` | **唯一主系统（目标形态）** |
| 2 | 记账系统 | `E:\我的软件源码\记账系统` | 独立 Vue+Express，待迁入 |
| 3 | 千帆中转机器人 | `E:\我的软件源码\千帆中转机器人` | Electron 本地，待拆入 agent/server |
| 4 | 主播分析软件 | `E:\我的软件源码\主播分析软件` | 独立 React+Express，待迁入 |
| 5 | 扫码枪登记出入库系统 | `E:\我的软件源码\扫码枪登记出入库系统` | tongyi 前身，已废弃独立部署 |
| 6 | 祥钰系统 | `E:\我的软件源码\祥钰系统` | 已并入 tongyi `apps/xiangyu` |
| 7 | 总控台 | `E:\我的软件源码\总控台` | Electron 归档/总控，非业务主入口 |
| 8 | 辅助出库软件 | `E:\我的软件源码\辅助出库软件` | Python 桌面 + Excel，功能与 tongyi 扫码重叠 |
| 9 | 其他 | `主播gemini分析`、`主播分析事件记录` 等 | 实验/归档，不纳入生产 |

---

## 2. 各系统详情

### 2.1 tongyi 统一经营台（主系统）

| 项 | 内容 |
|----|------|
| 技术栈 | React 18 + Vite + Tailwind（web）；Express + TypeScript + Prisma（server）；Node supervisor + local-agent |
| 启动 | 开发：`npm run dev`；生产：`npm run start:all`（`scripts/supervisor.js`） |
| 端口 | 主端口 **1212**（fallback 1312/1412）；Excel 桥 +1；祥钰 +2；print-agent +3；千帆 DevTools **9322/9323** 不变 |
| 数据库 | `apps/server/data/app.db`（`DATABASE_URL=file:../data/app.db`） |
| 核心页面 | `/inventory` 总览、`/inventory/scan` 扫码、`/inventory/stock` 库存、`/inventory/inbound` 标签入库、`/inventory/qianfan` 千帆、`/inventory/accounting` **原生记账**、`/inventory/live-analysis`（暂 iframe）、`/inventory/agents`、`/inventory/system-status` |
| 核心 API | `/api/v1/inventory/*`、`/api/v1/operations/*`、`/api/v1/accounting/*`、`/api/v1/order-finance-alerts/*`、`/api/v1/qianfan-send/*`、`/api/v1/qianfan-relay/*`、`/api/v1/agent/*` |
| 核心表 | `Bracelet`、`InventoryMovement`、`OrderFinanceAlert`、`AccountingRecord`、`QianfanSendJob`、`AgentTask`、`UserActivityLog` 等 |
| 迁入 tongyi | 已是主系统；持续吸收其他模块 |
| 重复/合并 | 与旧扫码枪系统完全重叠 → 只保留 tongyi |
| 废弃 | iframe 作为长期方案；旧独立扫码部署 |

### 2.2 记账系统（jade-accounting-system）

| 项 | 内容 |
|----|------|
| 技术栈 | Vue 3 + Vite（web）；Express + Prisma（server）；独立 worker（Excel/导出） |
| 启动 | `npm run dev`（server 3001 + web 5173）；生产 `npm run start:prod` |
| 端口 | Server **3001**；Web dev **5173** |
| 数据库 | `apps/server/data/accounting.db` |
| 核心页面 | 支出管理、销售/退款、报销导出、BI 看板、扫码绑定工作台 |
| 核心 API | `/api/expenses`、`/api/sales`、`/api/refunds`、`/api/stats`、`/api/bi`、`/api/scan-bindings` |
| 核心表 | `Expense`、`ExpenseAttachment`、`Sale`、`Refund`、`FinanceLedger`、`ScanBinding`、`Bracelet`（记账侧副本） |
| 迁入 tongyi | **第一批进行中**：支出/返现/退款/提醒 → `AccountingRecord` + `OrderFinanceAlert`；后续：Sale/Refund/Ledger/附件/BI |
| 重复/合并 | `Bracelet` 与 tongyi 库存重复 → 以 tongyi 库存为准，记账只存关联 ID/证书号；财务提醒与 tongyi `OrderFinanceAlert` 合并 |
| 废弃 | 独立 Web 入口、独立 server 部署、`/jizhang-proxy` 作为主入口 |
| 备份 | 保留 `JIZHANG_WEB_URL` 只读入口至数据全量迁移完成 |

### 2.3 千帆中转机器人

| 项 | 内容 |
|----|------|
| 技术栈 | Electron + Node workers + CDP（chrome-remote-interface） |
| 启动 | `npm start`（Electron）；CLI：`npm run start:cli` |
| 端口 | 本地 API **9323**；千帆 DevTools **9322** |
| 数据 | 文件 JSON（`data/`）、微信回调配置 |
| 核心能力 | 消息监听、微信通知、文字/图片发送、Cookie 被动采集、目标锁、ACK、回声确认 |
| 迁入 tongyi | 见 [qianfan-migration-plan.md](./qianfan-migration-plan.md) |
| 重复/合并 | tongyi 已有 `qianfan-relay`、`qianfan-send`、local-agent executor → 逐步替换 Electron 内重复逻辑 |
| 废弃 | 独立 Electron 作为长期生产入口（保留至 agent 打包 EXE 就绪） |

### 2.4 主播分析软件（live-business-web）

| 项 | 内容 |
|----|------|
| 技术栈 | React + Vite（web）；Express + Prisma（server） |
| 启动 | `npm run dev`（server 4723 + web 5173）；生产 `npm run start:server` |
| 端口 | Server **4723**；Web dev **5173** |
| 数据库 | `apps/server/data/app.db` |
| 核心页面 | 直播场次、主播榜单、退款分析、商品分析、经营报告、导入 |
| 核心 API | `/api/anchors`、`/api/metrics`、`/api/operations-report`、`/api/xhs-sync` 等 |
| 核心表 | `Anchor`、`XhsRawLiveSession`、`XhsRawOrder`、`AnchorDailySchedule`、`GoodReview` 等 30+ 模型 |
| 迁入 tongyi | **第二批**：`apps/server/src/modules/live-analysis/` + `apps/web/src/pages/live-analysis/` |
| 重复/合并 | 用户/权限与 tongyi 合并；小红书原始表保留命名空间前缀 |
| 废弃 | 独立部署、`/live-analysis-proxy` iframe 主入口 |

### 2.5 扫码枪登记出入库系统

| 项 | 内容 |
|----|------|
| 说明 | tongyi 直接 fork/演进来源，结构几乎相同 |
| 端口 | 旧默认 **4725** 系列 |
| 迁入 | 已完成（tongyi 即 successor） |
| 废弃 | 不再独立部署；目录保留只读备份 |

### 2.6 祥钰系统

| 项 | 内容 |
|----|------|
| 说明 | 已作为 `apps/xiangyu` 子服务由 supervisor 拉起 |
| 端口 | tongyi 端口规划 +2 |
| 迁入 | 已完成嵌入 |
| 废弃 | 独立祥钰部署 |

### 2.7 辅助出库软件

| 项 | 内容 |
|----|------|
| 技术栈 | Python + PyQt + Excel COM |
| 数据 | 本地 Excel + CSV 日志 |
| 迁入 | **不整包迁入**；出库逻辑已在 tongyi 扫码/Excel 桥实现 |
| 废弃 | 桌面独立工具（保留备份至 Excel 桥稳定） |

### 2.8 总控台

| 项 | 内容 |
|----|------|
| 技术栈 | Electron + 归档 Prisma |
| 迁入 | 系统发现/备份能力已部分在 tongyi `system-discovery` |
| 废弃 | 不作为业务入口 |

---

## 3. 功能重复与合并策略

| 功能 | 现存副本 | 合并决策 |
|------|----------|----------|
| 扫码出入库 | tongyi、旧扫码枪、辅助出库 | **tongyi 唯一** |
| 库存/手镯 | tongyi、记账系统 Bracelet | tongyi `Bracelet` 为准 |
| 财务提醒 | tongyi `OrderFinanceAlert`、记账 Expense 侧逻辑 | tongyi 统一；记账创建 → 自动生成 Alert |
| 千帆发送 | tongyi `QianfanSendJob`、机器人 sender worker | server 存任务，agent 执行 |
| 千帆监听 | tongyi relay、机器人 listener | 迁入 `apps/agent/src/qianfan` |
| 主播分析 | 独立 live-business-web | 迁入 `live-analysis` 模块 |
| Excel | tongyi Excel 桥、记账 worker、辅助出库 | tongyi local-agent 统一 |
| 打印 | tongyi print-agent | 保持 local-agent |
| 用户/登录 | 各系统独立 User 表 | tongyi session 统一（迁移期可双写） |

---

## 4. 迁移优先级

| 优先级 | 批次 | 内容 | 状态 |
|--------|------|------|------|
| P0 | — | tongyi 扫码/库存稳定 | ✅ 已完成 |
| P1 | **第一批** | 记账原生模块 + OrderFinanceAlert 联动 | ✅ 本提交 |
| P1 | — | 部署文档、端口规划 | ✅ |
| P2 | **第二批** | 主播分析原生页面 + API | 规划中 |
| P2 | — | 记账历史数据从 accounting.db 导入 | 待做 |
| P3 | **第三批** | 千帆机器人拆入 agent/server | 见 qianfan 文档 |
| P3 | — | local-agent 打包 Windows EXE | 待做 |
| P4 | — | 停旧系统独立部署、nginx 只指向 tongyi | 数据迁移后 |

---

## 5. 风险点

1. **双库并存**：记账历史在 `accounting.db`，新记录在 tongyi `app.db` — 迁移脚本必须可回滚。
2. **扫码主流程**：任何记账/提醒故障不得阻塞 `/inventory/scan`（已实现 try/catch 降级）。
3. **Windows 端口**：Hyper-V 可能占用 1212 段，需 `TONGYI_PORT_BASE=9000` 或 port-planner fallback。
4. **千帆 CDP**：必须本地执行，服务器不能直接操作千帆客户端。
5. **Cookie 采集**：保持被动采集原则，禁止服务器伪造登录。
6. **iframe 依赖**：live-analysis 仍 iframe，第二批前勿强化 proxy。
7. **权限模型**：记账系统 JWT+RBAC vs tongyi session — 合并时需映射角色。

---

## 6. 验收方式

### 6.1 全局

- [ ] 仅部署 tongyi 即可访问全部生产功能（最终态）
- [ ] `npm run build` 通过
- [ ] HTTPS 单入口（见 [deploy/server-deploy.md](./deploy/server-deploy.md)）

### 6.2 第一批（记账）

- [ ] `/inventory/accounting` 为 tongyi 原生页面（非默认 iframe）
- [ ] `POST /api/v1/accounting/records` 可创建支出/返现
- [ ] 创建后自动生成 `OrderFinanceAlert`（有订单号/物流单号时）
- [ ] 扫码匹配提醒；点「已处理」同步 `AccountingRecord.customerPaymentStatus`
- [ ] 设置页可打开旧记账备份（`JIZHANG_WEB_URL`）

### 6.3 第二批（主播分析）

- [ ] `/inventory/live-analysis` 原生页面
- [ ] 直播场次/主播榜单/退款分析可用

### 6.4 第三批（千帆）

- [ ] 监听、发送、微信通知由 local-agent 执行
- [ ] tongyi 页面可见状态与任务队列

---

## 7. 代码目录目标结构

```
tongyi/
├── apps/web/src/pages/accounting/     ← 第一批 ✅
├── apps/web/src/pages/live-analysis/  ← 第二批
├── apps/server/src/modules/accounting/ ← 第一批 ✅
├── apps/server/src/modules/live-analysis/
├── apps/agent/src/qianfan/            ← 第三批
├── apps/server/prisma/schema.prisma   ← 统一模型
├── scripts/                           ← 部署/备份/迁移
└── docs/                              ← 本文档
```

---

## 8. 当前提交范围（第一批交付）

- `docs/migration-plan.md`（本文档）
- `docs/deploy/server-deploy.md`
- `docs/qianfan-migration-plan.md`
- `apps/server/src/modules/accounting/*`
- `apps/web/src/pages/accounting/*`
- Prisma：`AccountingRecord`、`AccountingAttachment`、`OrderFinanceAlert.accountingRecordId`
- `/inventory/accounting` 路由改为原生嵌套页面

旧系统目录 **不删除**，验证通过后再标记废弃。

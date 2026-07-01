# 主播分析系统迁移方案（第二批）

> 扫描基准：`E:\我的软件源码\主播分析软件`（live-business-web）  
> tongyi 模块：`apps/server/src/modules/live-analysis/` + `apps/web/src/pages/live-analysis/`  
> 状态：**第二批第一版已迁入 tongyi 原生页面与 API**

---

## 1. 旧系统路径

| 项 | 值 |
|----|-----|
| 本地路径 | `E:\我的软件源码\主播分析软件` |
| GitHub | 独立仓库（与 tongyi 并列） |
| 包名 | `live-business-web` v0.2.0 |

---

## 2. 技术栈

| 层 | 技术 |
|----|------|
| 前端 | React 18 + Vite 5 + React Router 6 + Tailwind 4 + Recharts |
| 后端 | Express 4 + TypeScript + Prisma 6 |
| 数据库 | SQLite |
| 数据同步 | 小红书卖家 API（Cookie）、node-cron 定时任务 |
| 其他 | ExcelJS/xlsx、Python xhshow 签名（可选） |

---

## 3. 启动方式

```bash
cd E:\我的软件源码\主播分析软件
npm install
npm run dev          # API 4723 + Web 5173
npm run build
npm run start:server # 生产单端口
```

Windows：`build-and-start.bat` / `一键启动-含编译.bat`

---

## 4. 端口

| 端口 | 用途 |
|------|------|
| **4723** | 默认 API（`apps/server/src/config/env.ts`） |
| **5173** | Vite 开发前端 |
| **3001** | README 记载的生产同域端口（可被 `PORT` 覆盖） |

tongyi 代理环境变量：`LIVE_ANALYSIS_WEB_URL`（默认 `http://127.0.0.1:4723`）

---

## 5. 数据库位置

```
E:\我的软件源码\主播分析软件\apps\server\data\app.db
```

Prisma schema：`apps/server/prisma/schema.prisma`（30+ 模型）

tongyi 新表在：

```
E:\我的软件源码\tongyi\apps\server\data\app.db
```

模型：`LiveSession`、`LiveOrder`、`AnchorProfile`、`LiveImportBatch`

---

## 6. 核心页面（旧系统）

| 路由 | 页面 | 功能 |
|------|------|------|
| `/` | OverviewTab | 经营总览、GMV 卡片、主播榜 |
| `/anchors` | AnchorPerformanceTab | 主播业绩 |
| `/anchor-schedules` | AnchorSchedulePage | 排班 |
| `/buyers` | BuyerRankingTab | 买家排行 |
| `/operations-report` | OperationsReportPage | 日/周/月运营报表 |
| `/good-reviews` | GoodReviewsPage | 好评中心 |
| `/settings` | SettingsTab | 系统设置 |

---

## 7. 核心 API（旧系统）

主入口 **`GET /api/board/local-data`**（替代已废弃的 `POST /live-query`）

| 前缀 | 关键端点 |
|------|----------|
| `/api/board` | `local-data`, `metric-detail`, `operations-report/daily|weekly`, `operations-rankings`, `operations-business-insight-actions` |
| `/api/sync` | `POST /run`, `GET /status` |
| `/api/anchors` | 主播 CRUD、时间规则 |
| `/api/analytics` | `buyer-ranking` |
| `/api/debug` | `POST /import-order-excel`（仅 super_admin） |

核心服务文件：

- `business-metrics.service.ts` — 全站指标
- `valid-revenue-order.service.ts` — 有效成交池
- `board-local-query.service.ts` — 看板查询
- `operations-business-insights.service.ts` — 经营建议
- `operations-anchor-ranking.service.ts` — 主播榜单

---

## 8. 核心表结构（旧系统）

| 模型 | 用途 |
|------|------|
| `XhsRawOrder` | **主订单库**（packageId + liveAccountId） |
| `XhsRawLiveSession` | 直播场次原始数据 |
| `Anchor` / `AnchorTimeRule` | 主播与归因规则 |
| `XhsAfterSalesWorkbenchCache` | 官方退款金额 |
| `XhsSyncJob` | 同步任务 |
| `OperationsBusinessInsightAction` | 建议跟进状态 |
| `GoodReview` / `AnchorDailySchedule` 等 | 第二批以后迁入 |

---

## 9. 数据口径（必须对齐）

### 9.1 grossSalesAmount（支付金额 / GMV）

**旧系统字段名：** `totalGmv`（没有 `grossSalesAmount` 这个名字）

**计算逻辑**（`business-metrics.service.ts` + `order-amount-metrics.service.ts`）：

1. 单笔基数 `paymentBaseCent` 优先级：商家应收 > 实付 > 用户应付 > 商品金额
2. 计入条件：有支付时间、非未支付、`paymentBaseCent > 0`
3. **先付后退的订单仍计入 GMV**，退款单独统计

**tongyi 映射：** `LiveSession.grossSalesAmount` = 场次下订单 `amount` 之和（导入时写入）

### 9.2 validSalesAmount（有效成交金额）

**旧系统字段名：** `validSalesAmount` / `effectiveGmv`

**计算逻辑**（`valid-revenue-order.service.ts`）— **不是「支付 − 退款」**：

1. 必须 `includedInGmv` 且 `effectiveGmvCent > 0`
2. 订单状态匹配 `/已完成|已签收/`
3. 售后状态规则：
   - **计入：** 无售后、客户取消售后、关闭且退款为 0
   - **排除：** 售后处理中、退款成功、部分退款、退货退款中等
4. 对符合条件订单累加 `effectiveGmvCent`（按订单号去重）
5. 低价刷单排除：支付基数 < **¥29** 不计入核心指标（`low-price-brush-order.service.ts`）

**tongyi 第一版：** CSV 导入时用 `computeValidAmount()` 简化实现上述规则；未提供 `validAmount` 列时自动推算。

### 9.3 refundAmount（退款金额）

**旧系统：** `refundAmount` / `returnAmount`

**计算逻辑**（`order-refund-metrics.service.ts`）：

- 取 board / buyer / workbench / 实退 等来源的 **最大值**
- 按订单号去重后汇总

**tongyi 映射：** `LiveOrder.refundAmount`，场次 `LiveSession.refundAmount` 为订单之和。

### 9.4 orderCount（订单数）

**旧系统：** `orderCount` = 统计期内有支付时间的订单数（`business-metrics.service.ts`）

**tongyi 映射：** `LiveSession.orderCount` = 关联 `LiveOrder` 行数（导入一行计一单）。

### 9.5 退款订单是否扣除有效成交？

**是，通过有效成交池规则扣除，而不是 GMV 减法。**

- GMV（支付金额）**不扣除**退款
- 有效成交：订单若在售后中/已退款，**整单不进入有效池**（或 `effectiveGmvCent` 扣减后 ≤ 0）
- 客户取消售后、关闭无退款：可保留有效成交

### 9.6 售后如何影响有效成交？

| 售后状态 | 对有效成交 |
|----------|------------|
| 无售后 / 未申请 | 若已签收/完成 → 计入 |
| 客户取消售后 | 计入 |
| 售后关闭且退款 0 | 计入 |
| 退款中 / 退款成功 / 部分退款 | **不计入** |
| 未知状态 | 保守排除（旧系统会收集 unknown 样本） |

`afterSaleAmount`：有售后状态且非「无售后」的订单退款汇总（tongyi 场次字段）。

---

## 10. 需要迁入 tongyi 的功能

| 优先级 | 功能 | tongyi 状态 |
|--------|------|-------------|
| P0 | 原生页面入口 | ✅ 已完成 |
| P0 | 场次/订单/主播基础模型 | ✅ Prisma + API |
| P0 | 汇总、榜单、退款、商品、建议 | ✅ 第一版 |
| P0 | CSV 导入 + 导入批次 | ✅ 第一版 |
| P1 | 小红书 API 同步 (`XhsRawOrder`) | 待迁 |
| P1 | 完整 metrics 引擎（cent 精度、去重、刷单过滤） | 待迁 |
| P1 | 售后工作台缓存 | 待迁 |
| P2 | 运营日报/周报/月报 | 待迁 |
| P2 | 买家排行、排班、好评中心 | 待迁 |
| P3 | BI 钻取、验收脚本全集 | 待迁 |

---

## 11. 暂时不迁的功能

- 好评中心（`GoodReview*`）
- 质量负反馈（`QualityBadCase*`）
- 日报发货图片（`DailyReportImage`）
- 旧 Excel 下载管道（`DownloadBatch`）
- Debug/验收脚本（20+ 个）
- Electron 桌面壳
- 独立用户权限体系（合并到 tongyi session）

---

## 12. 风险点

1. **口径偏差：** tongyi 第一版基于导入汇总，未接入完整 `AnalyzedOrderView` 管道，与旧系统 live-query 可能有微小差异。
2. **双库并存：** 旧 `app.db` 历史数据未自动导入，需专门迁移脚本。
3. **Cookie 同步：** 小红书 API 必须在本地/agent 执行，服务器只存结果。
4. **性能：** 旧系统单表 `XhsRawOrder` 可达百万行；tongyi 需分批迁移或保留归档。
5. **扫码主流程：** 主播分析模块独立，不得影响 `/inventory/scan`。

---

## 13. 验收方式

### 13.1 页面

- [ ] `/inventory/live-analysis` — tongyi 原生总览（非 iframe）
- [ ] `/inventory/live-analysis/sessions` — 场次列表
- [ ] `/inventory/live-analysis/anchors` — 主播榜单
- [ ] `/inventory/live-analysis/refunds` — 退款分析
- [ ] `/inventory/live-analysis/import` — 导入页（CSV 可用，Excel 显示迁移中）
- [ ] `/inventory/live-analysis/suggestions` — 经营建议
- [ ] `/inventory/live-analysis/settings` — 旧系统备份入口

### 13.2 API

- [ ] `GET /api/v1/live-analysis/summary`
- [ ] `GET /api/v1/live-analysis/sessions`
- [ ] `GET /api/v1/live-analysis/anchors/ranking`
- [ ] `POST /api/v1/live-analysis/import`（CSV）
- [ ] `GET /api/v1/live-analysis/suggestions`

### 13.3 不破坏

- [ ] `/inventory/scan` 正常
- [ ] `/inventory/accounting` 正常
- [ ] `npm run build` 通过

---

## 14. tongyi 新模块结构

```
apps/server/src/modules/live-analysis/
  liveAnalysis.routes.ts
  liveAnalysis.service.ts
  liveAnalysis.repository.ts
  liveAnalysis.presenter.ts
  liveAnalysis.types.ts
  liveAnalysis.import.ts      # CSV 导入 + Excel 占位
  liveAnalysis.metrics.ts     # 汇总与商品聚合
  liveAnalysis.suggestions.ts # 大白话经营建议

apps/web/src/pages/live-analysis/
  LiveAnalysisLayout.tsx
  LiveAnalysisDashboardPage.tsx
  LiveSessionsPage.tsx
  LiveSessionDetailPage.tsx
  AnchorRankingPage.tsx
  RefundAnalysisPage.tsx
  ProductAnalysisPage.tsx
  LiveImportPage.tsx
  LiveSuggestionsPage.tsx
  LiveAnalysisSettingsPage.tsx
```

---

## 15. 字段映射（旧 → tongyi）

| 旧系统 | tongyi |
|--------|--------|
| `totalGmv` | `LiveSession.grossSalesAmount` |
| `validSalesAmount` | `LiveSession.validSalesAmount` |
| `refundAmount` | `LiveSession.refundAmount` |
| `XhsRawLiveSession` | `LiveSession` + `rawJson` |
| `XhsRawOrder` | `LiveOrder` + `rawJson` |
| `Anchor` | `AnchorProfile` |

旧系统 iframe 代理 `/zhubo-proxy` **不再作为默认入口**；`LIVE_ANALYSIS_WEB_URL` 仅设置页备份链接。

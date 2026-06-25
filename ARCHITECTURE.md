# 和田玉手镯管理系统 — 架构与业务说明

## 可靠性加固要点

- **Excel 部分成功**：数据库先写入，Excel 失败时返回 `partialSuccess`，扫码页可「重试 Excel 同步」
- **祥钰单端口**：`/xiangyu-proxy` 反代到 4726，外网/FRP 只需映射 **4725**
- **降级模式**：`/api/v1/settings/status` 返回 `degraded`，祥钰离线时禁用「打包拍照发送」Tab
- **进程守护**：`start.bat` → `npm run start:all`（supervisor 自动重启主进程）

## 系统总览

本系统由 **统一门户** + **两大业务板块** 组成，共用小红书风格 UI，单入口访问：

| 板块 | 路由 | 说明 |
|------|------|------|
| **出库入库** | `/inventory/*` | 扫码枪登记、库存查询、手机拍照、Excel 同步 |
| **打包拍照发送** | `/xiangyu` | 内嵌祥钰系统（订单拍照合成、标注、发送买家） |

```
浏览器 http://本机:4725
├── 顶部导航：出库入库 | 打包拍照发送
├── /inventory/*  → 出入库 React 应用
└── /xiangyu      → iframe 嵌入祥钰 Web (4726)
```

## 端口规划（从 4725 起）

| 端口 | 服务 | 说明 |
|------|------|------|
| **4725** | 主门户 | Express API + React 静态资源（单端口） |
| **4726** | 祥钰 Web | 订单/拍照/合成/发送（由主后端自动拉起） |
| **4727** | 祥钰 Bridge | 千帆发消息中继（本机 only） |
| **4728** | Excel 桥接 | Python win32com 实时写 Excel |
| **4729** | 打印 Agent | 热敏机预留（可选） |
| **4730** | 千帆 DevTools | 千帆客服工作台调试端口（外部程序） |

开发模式：Vite `5173` 代理 API 到 `4725`。

## 分层架构

```
┌─────────────────────────────────────────────────────────┐
│  前端 apps/web（交互层）                                  │
│  PortalLayout → InventoryLayout / XiangyuPage(iframe)    │
│  pages → hooks → api/client → HTTP                       │
└───────────────────────────┬─────────────────────────────┘
                            │ REST /api/v1/*
┌───────────────────────────▼─────────────────────────────┐
│  后端 apps/server（业务层）                               │
│  routes → services → repositories / adapters             │
│  process-manager：自动拉起 Excel桥接 + 祥钰 Web/Bridge     │
└───────────────┬─────────────────────────┬───────────────┘
                │                         │
    ┌───────────▼──────────┐   ┌──────────▼──────────────┐
    │ excel-bridge :4728   │   │ 祥钰系统 :4726/:4727     │
    │ win32com 写 Excel    │   │ 功能保持原样，仅改端口     │
    └──────────────────────┘   └───────────────────────────┘
```

**前端永远不直接访问 Excel 桥接或祥钰 Bridge**，统一经 `/api/v1`。

## 出库入库 — 业务流程

### 1. 扫码出库
1. 扫码枪输入编号（HID 键盘模式）
2. **仅查 SQLite**，未入库则提示不存在（不会从 Excel 自动建库或改 Excel）
3. 校验：编号存在、qty=1（在库）
3. 填写售价、订单号、销售人/渠道、备注
4. 写 SQLite `Bracelet`（qty→0，售出日期、售价等）
5. 同步 Excel A-N 列（备注与 DB 一致，使用 `fullRemark`）
6. 截图 Excel 行返回前端确认
7. 写 `OperationLog`

### 2. 扫码入库（退货）
1. 校验：编号存在、qty=0（已出库）
2. 写 SQLite（qty→1，退货日期、清空售出信息）
3. 同步 Excel（备注与 DB 一致）
4. 截图 + 日志

### 3. 新品入库
1. 编号不存在时跳转新品表单
2. 写 SQLite 基础字段 + `BraceletDetail` 扩展详情
3. Excel 新增一行（A-H）
4. 回写 `excelRow` / `excelSheet` 到数据库

### 4. 手机拍照
- 同 WiFi 访问 `/inventory/mobile/capture`
- 上传照片/视频 → `MediaAsset` + 本地 `data/media/`
- **不进 Excel**，仅在详情抽屉查看

### 数据存储分工

| 数据 | 存储 | 同步 Excel |
|------|------|-----------|
| 到货日期、批次、数量、编号、品类、圈口、成本、备注、订单号、退货/售出日期、售价、销售人/渠道 | `Bracelet` | **是**（A-N） |
| 材质、等级、克重、产地、颜色、瑕疵、内部备注 | `BraceletDetail` | **否** |
| 照片、视频 | `MediaAsset` + 磁盘 | **否** |
| 操作日志 | `OperationLog` | **否** |

### 吊牌条形码（与编号不同）

- **编号** `certNo`：镯子业务编号，吊牌文字展示。
- **数字条码**：`前缀 + round(成本×3+10) + floor(圈口)`，存 `barcodeValue`，打印在条码行。
- 改 Excel / 改库存数量：**仅**出库、退货入库、标签登记等操作接口，扫码查询只读。

## 打包拍照发送 — 祥钰板块

- 祥钰源码位于 **`apps/xiangyu`**（已内置，不依赖外部目录）
- iframe 使用同域路径 `/xiangyu-proxy/`（由主服务 4725 反代到祥钰 4726）
- 主后端启动时自动拉起祥钰 Web + Bridge
- 祥钰 `config.json` 端口不一致时默认**仅警告**；设 `XIANGYU_SYNC_CONFIG=true` 可自动同步

## API 规范

- 基础路径：`/api/v1`
- 响应：`{ ok: true, data }` 或 `{ ok: false, message }`
- 出入库：`POST /api/v1/operations/outbound|inbound|new`
- 查询：`GET /api/v1/inventory/by-cert/:certNo`
- 状态：`GET /api/v1/settings/status`（含各子服务在线状态）

## 启动方式

```bat
start.bat          # 构建 + 启动（推荐）
npm run start      # 仅后端（生产）
npm run dev        # 前端 5173 + 后端 4725
npm run start:all  # supervisor 守护重启
```

启动前：**打开 Excel 库存表**（Excel 桥接才能绑定工作簿）。

## 环境变量（apps/server/.env）

```env
PORT=4725
EXCEL_BRIDGE_URL=http://127.0.0.1:4728
XIANGYU_PORT=4726
XIANGYU_BRIDGE_PORT=4727
QIANFAN_DEVTOOLS_PORT=4730
XIANGYU_ENABLED=true
```

# 统一经营台 / 和田玉统一经营系统

和田玉统一经营平台：**扫码出入库、标签入库、库存、千帆客服、经营记账、主播分析、本地助手** 等模块一体化入口。高级统一 UI，支持本机、局域网与外网（HTTPS + 本地助手）访问。

> 正式仓库：[github.com/afan-Kiss/tongyi](https://github.com/afan-Kiss/tongyi)  
> 本地路径建议：`E:\我的软件源码\tongyi`

## 功能模块

| 模块 | 说明 |
|------|------|
| **总览** | 经营概况与快捷入口 |
| **扫码** | 出库 / 退货入库 / 查询（扫码枪 HID 输入） |
| **标签入库** | Excel 已有编号登记进系统、打印吊牌 |
| **库存** | 列表、详情、拍照、编辑并同步 Excel |
| **千帆客服** | 四店买家消息监听、微信通知与回复中转 |
| **经营记账** | 统一入口（iframe 代理，数据库暂不合并） |
| **主播分析** | 统一入口（iframe 代理） |
| **本地助手** | 云服务器模式下执行本地 Excel / 打印 / 千帆任务 |
| **系统状态** | 各模块健康、运行模式、同目录系统发现 |
| **设置** | 系统配置、局域网访问、打印等 |
| **操作日志** | 审计与操作记录 |

## 环境要求

- **Windows 10+**（Excel COM 桥接、打印 Agent 仅支持 Windows）
- **Node.js 18+**
- **Microsoft Excel**（库存表需保持打开）
- 可选：璞趣标签机、FRP / Nginx 内网穿透

## 快速开始

```bat
npm install
npm run db:generate
npm run db:migrate

# 一键启动（API + 前端 + Excel 桥接 + 打印 + 祥钰）
start.bat
# 或
npm run start:all
```

- 本机访问：<http://127.0.0.1:1212/inventory>
- API 健康检查：<http://127.0.0.1:1212/api/v1/health>（service: `tongyi-operations-api`）

**启动前请先打开 Excel 库存工作簿。**

## 开发模式

```bash
npm run dev          # Vite :5173 + 后端 :1212
npm run dev:web
npm run dev:server
```

## 本地助手

主系统部署在云服务器时，公司电脑需运行本地助手，由助手执行 Excel、打印、千帆等本地任务：

```bash
npm run local-agent -- --server http://127.0.0.1:1212 --qianfan-root "E:\我的软件源码\千帆中转机器人"
```

## 端口规划（1212–1222）

| 端口 | 用途 |
|------|------|
| **1212** | 主系统 Web / API |
| **1213** | 祥钰 Web（过渡子系统） |
| **1214** | 祥钰 Bridge / 本地桥接（过渡） |
| **1215** | Excel Bridge（过渡） |
| **1216** | Print Agent |
| **1217** | Scanner API |
| **1218** | Mobile HTTPS（手机拍照） |
| **1219** | Local Agent WebSocket（第三阶段预留） |
| **1220** | Local Agent HTTP API（第三阶段预留） |
| **1221** | 千帆 Relay 代理（预留） |
| **1222** | 诊断 / 调试（预留） |

**外部千帆机器人端口（暂不改动）：**

- 千帆 DevTools：**9322**
- 千帆本地 API：**9323**

## 运行模式

| 模式 | 说明 |
|------|------|
| **本地模式** | 主系统跑在公司电脑，可直接扫描同目录项目（如千帆、记账、主播分析） |
| **服务器模式** | 主系统在云服务器；不能直接操作本机 Excel / 打印机 / 千帆，需启动本地助手 |
| **混合模式** | 服务器正常 + 本地助手在线，可执行本地任务 |

## 同目录系统发现

本地模式下可扫描父目录（默认 `E:\我的软件源码`）下的 sibling 项目：

- `GET /api/v1/system-discovery/siblings`
- `POST /api/v1/system-discovery/apply`

云服务器不能直接访问本地磁盘，页面会提示「请启动本地助手」。

## 服务器部署

1. 后端监听 **1212**
2. Nginx / HTTPS 反代到 1212
3. **不要**让云服务器直接操作公司电脑 Excel、打印机、千帆
4. 本地 Excel / 打印 / 千帆必须通过 **本地助手** 执行

## 目录结构

```
├── apps/web          # React 前端（Vite + Tailwind + Premium UI）
├── apps/server       # Express API + Prisma + SQLite
├── apps/xiangyu      # 祥钰打包拍照子系统
├── agents/
│   ├── excel-bridge  # Python Flask，Excel COM 桥接 :1215
│   └── print-agent   # 标签打印 Agent :1216
├── scripts/          # supervisor、local-agent、重启脚本
└── ARCHITECTURE.md   # 详细架构与业务流程
```

## 构建

```bash
npm run build
npm run build:web
npm run build:server
```

### Windows 端口占用提示

若启动报 `EACCES` / `WinError 10013`，可能是 Hyper-V / WSL 保留了 **1125–1224** 端口段（含 1212–1222）。可执行：

```bat
netsh interface ipv4 show excludedportrange protocol=tcp
```

若 1212 落在排除范围内，需以管理员调整 Hyper-V 动态端口策略，或重启后再启动本系统。

## 许可证

私有业务项目，未经授权请勿商用分发。

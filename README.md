# 扫码枪登记出入库系统

和田玉手镯 **扫码枪出入库 + 标签入库 + Excel 实时同步** 一体化系统。小红书风格 Web 界面，支持本机、局域网与外网（FRP）访问。

> 仓库：[github.com/afan-Kiss/saomaqiang](https://github.com/afan-Kiss/saomaqiang)

## 功能概览

| 模块 | 说明 |
|------|------|
| **扫码工作台** | 出库 / 退货入库 / 查询，扫码枪 HID 输入 |
| **标签入库** | Excel 已有编号登记进系统、打印吊牌，**不写回 Excel** |
| **编号联想** | 预读 Excel D 列索引，输入时动态提示 |
| **库存管理** | 列表、详情、拍照、编辑基础字段并同步 Excel |
| **Excel 桥接** | win32com 读写本地已打开的工作簿，行截图回传确认 |
| **祥钰打包** | 订单拍照合成发送（`/xiangyu`，可选） |
| **标签打印** | 璞趣 AQ00 热敏吊牌（25×70mm） |

## 环境要求

- **Windows 10+**（Excel COM 桥接、打印 Agent 仅支持 Windows）
- **Node.js 18+**
- **Microsoft Excel**（库存表需保持打开）
- 可选：璞趣标签机、FRP 内网穿透

## 快速开始

```bat
# 克隆后
npm install
npm run db:generate
npm run db:migrate

# 一键启动（API + 前端 + Excel 桥接 + 打印 + 祥钰）
start.bat
# 或
npm run start:all
```

- 本机：<http://127.0.0.1:4725/inventory>
- API 健康检查：<http://127.0.0.1:4725/api/v1/health>

**启动前请先打开 Excel 库存工作簿。**

## 开发模式

```bash
npm run dev          # Vite :5173 + 后端 :4725
npm run dev:web
npm run dev:server
```

## 目录结构

```
├── apps/web          # React 前端（Vite + Tailwind）
├── apps/server       # Express API + Prisma + SQLite
├── apps/xiangyu      # 祥钰打包拍照子系统
├── agents/
│   ├── excel-bridge  # Python Flask，Excel COM 桥接 :4728
│   └── print-agent   # 标签打印 Agent :4729
├── deploy/           # FRP / VPS / nginx 部署示例
├── scripts/          # supervisor、重启脚本
└── ARCHITECTURE.md   # 详细架构与业务流程
```

## 核心 API（`/api/v1`）

| 方法 | 路径 | 说明 |
|------|------|------|
| POST | `/operations/outbound` | 出库（同步 Excel + 截图） |
| POST | `/operations/inbound` | 退货入库 |
| POST | `/operations/register` | 标签入库（仅写数据库） |
| GET | `/operations/excel-row/:certNo` | 从 Excel 只读预填 |
| GET | `/excel/cert-index/search?q=` | 编号联想搜索 |
| GET | `/inventory/by-cert/:certNo` | 按编号查询 |
| POST | `/media/upload` | 上传手镯照片 |

## 外网访问

1. 配置 `deploy/frpc.example.toml` → 复制为 `frpc.toml` 并填写 token（**勿提交**）
2. 在「设置」页配置 `publicUrl`（如 `https://你的域名:8443`）
3. 手机拍照需 **HTTPS** 才能调用摄像头

## 配置说明

| 文件 | 说明 |
|------|------|
| `apps/server/.env` | 数据库路径、端口等（见 `.env.example`） |
| `apps/xiangyu/config.json` | 祥钰配置（从 `config.example.json` 复制，已 gitignore） |
| `deploy/frpc.toml` | FRP 客户端（已 gitignore） |

## 构建

```bash
npm run build        # 前端 + 后端
npm run build:web
npm run build:server
```

## 许可证

私有业务项目，未经授权请勿商用分发。

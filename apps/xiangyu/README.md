# 祥钰珠宝 — 打包拍照发送（内置模块）

由原 `祥钰系统` 完整迁入本 monorepo，由主后端 `apps/server` 自动拉起，**不依赖外部目录**。

| 子服务 | 入口 | 端口 |
|--------|------|------|
| Web | `server/index.js` | 4726 |
| Bridge | `scripts/bridge-relay.js` | 4727 |

门户通过 `http://本机:4725/xiangyu` → iframe `/xiangyu-proxy/` 同域反代访问。

## 配置

- 首次启动从 `config.example.json` 生成 `config.json`
- 千帆路径等在祥钰「设置」或 `config.json` → `bridge.qianfanDataDir` 修改

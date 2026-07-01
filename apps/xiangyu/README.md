# 祥钰打包拍照（内置子系统）

| 服务 | 入口 | 默认端口 |
|------|------|----------|
| Web | `server/index.js` | 1213 |
| Bridge | `scripts/bridge-relay.js` | 1214 |

门户通过 `http://本机:1212/xiangyu` → iframe `/xiangyu-proxy/` 同域反代访问。

# 金额精度规划（money precision）

> tongyi 统一经营台 — 第一阶段用 Float 兼容，后续迁到「分（cent）整数」

---

## 1. 当前方案（第一阶段）

以下模型金额字段使用 **SQLite `REAL` / Prisma `Float`**：

| 模块 | 字段 |
|------|------|
| `AccountingRecord` | `amount` |
| `LiveSession` | `grossSalesAmount`, `validSalesAmount`, `refundAmount`, `afterSaleAmount` |
| `LiveOrder` | `amount`, `validAmount`, `refundAmount` |
| `OrderFinanceAlert` | `amount` |

**原因：**

- 与旧记账 `Decimal`、旧主播分析 JSON 元字段对接简单
- 第一批/第二批迁移可快速上线
- 页面展示以「元」为单位，Float 在 ¥0.01 量级对经营看板可接受

**风险：**

- 大量累加可能出现浮点累加误差
- 与旧系统「分（cent）整数」口径长期不一致

---

## 2. 目标方案（第二阶段）

与旧主播分析 cent 口径对齐：

- 库内存储 **整数分（cent）**
- 展示层格式化元
- 汇总用整数相加

建议字段：`amountCent`, `validAmountCent`, `grossSalesAmountCent` 等（见旧系统 `*Cent` 命名）

---

## 3. 迁移步骤

1. 加列不删列：增加 `*Cent` 整数列
2. 双写：创建/导入同时写 Float 与 Cent
3. 回填脚本：从 Float 回填 Cent
4. 切换读路径：service 读 Cent
5. 验收：与旧系统对比
6. 弃用 Float 列

---

## 4. 如何避免小数误差（过渡期）

1. 导入：`Math.round(yuan * 100) / 100`
2. 有效成交：使用 `liveAnalysis-valid-revenue.ts` 的 cent 逻辑再转元
3. 展示：`.toFixed(2)` 仅用于 UI

---

## 5. 何时执行

- **现在**：Float 不阻塞部署
- **API 全量同步后**：与 metrics 引擎一并切 cent
- **财务对账严格时**：优先迁 Accounting + OrderFinanceAlert

#!/usr/bin/env node
/**
 * 有效成交口径验收（典型订单状态）
 */
const path = require('node:path')

process.chdir(path.join(__dirname, '..'))

async function main() {
  const { register } = require('tsx/cjs/api')
  register()
  const {
    explainValidRevenueOrder,
    buildValidRevenueInputFromRow,
    yuanToCent,
  } = await import('../apps/server/src/modules/live-analysis/liveAnalysis-valid-revenue.ts')

  const cases = [
    {
      name: '已完成 + 无售后',
      row: { amount: 100, orderStatus: '已完成', afterSaleStatus: '无售后' },
      expectValid: true,
    },
    {
      name: '已签收 + 无售后',
      row: { amount: 200, orderStatus: '已签收', afterSaleStatus: '' },
      expectValid: true,
    },
    {
      name: '已完成 + 退款成功',
      row: { amount: 100, refundAmount: 100, orderStatus: '已完成', afterSaleStatus: '退款成功' },
      expectValid: false,
    },
    {
      name: '已完成 + 售后处理中',
      row: { amount: 100, orderStatus: '已完成', afterSaleStatus: '售后处理中' },
      expectValid: false,
    },
    {
      name: '已完成 + 客户取消售后',
      row: { amount: 100, orderStatus: '已完成', afterSaleStatus: '客户取消售后' },
      expectValid: true,
    },
    {
      name: '待发货（未完成）',
      row: { amount: 100, orderStatus: '待发货', afterSaleStatus: '无售后' },
      expectValid: false,
    },
    {
      name: '已完成 + 售后关闭无退款',
      row: { amount: 88, orderStatus: '已完成', afterSaleStatus: '售后关闭' },
      expectValid: true,
    },
  ]

  let failed = 0
  for (const c of cases) {
    const input = buildValidRevenueInputFromRow(c.row)
    const explain = explainValidRevenueOrder(input)
    const ok = explain.valid === c.expectValid
    if (!ok) {
      failed += 1
      console.error(`✗ ${c.name}：期望 ${c.expectValid ? '计入' : '不计入'}，实际 ${explain.valid ? '计入' : '不计入'}（${explain.reason}）`)
    } else {
      console.log(`✓ ${c.name}：${explain.reason}`)
    }
  }

  const lowPrice = explainValidRevenueOrder({
    includedInGmv: false,
    effectiveGmvCent: 0,
    gmvExcludeReason: '低价刷单',
    orderStatusText: '已完成',
  })
  if (!lowPrice.valid) {
    console.log(`✓ 低价刷单排除：${lowPrice.reason}`)
  } else {
    failed += 1
    console.error('✗ 低价刷单应排除')
  }

  if (failed > 0) {
    console.error(`\n${failed} 项未通过`)
    process.exit(1)
  }
  console.log('\n全部有效成交口径检查通过')
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})

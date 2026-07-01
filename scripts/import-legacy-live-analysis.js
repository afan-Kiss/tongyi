#!/usr/bin/env node
/**
 * 从旧主播分析 app.db 导入 XhsRawOrder / XhsRawLiveSession → tongyi LiveSession/LiveOrder
 * 用法：node scripts/import-legacy-live-analysis.js [旧库路径] [--limit=5000]
 */
const path = require('node:path')

process.chdir(path.join(__dirname, '..'))
process.env.DATABASE_URL =
  process.env.DATABASE_URL ||
  `file:${path.join(__dirname, '..', 'apps', 'server', 'data', 'app.db').replace(/\\/g, '/')}`

async function main() {
  const { register } = require('tsx/cjs/api')
  register()
  const { runLegacyLiveAnalysisImport } = await import(
    '../apps/server/src/modules/live-analysis/liveAnalysis-legacy-import.service.ts'
  )
  const dbPath = process.argv.find((a) => !a.startsWith('-') && a.endsWith('.db'))
  const limitArg = process.argv.find((a) => a.startsWith('--limit='))
  const limit = limitArg ? Number(limitArg.split('=')[1]) : undefined
  console.log('[import-legacy-live-analysis] 开始导入…')
  const result = await runLegacyLiveAnalysisImport({ dbPath, limit })
  console.log('\n========== 导入结果 ==========')
  console.log(`数据库：${result.dbPath}`)
  console.log(`批次：${result.batchId || '—'}`)
  console.log(`成功：${result.imported}（场次 ${result.sessions}，订单 ${result.orders}，主播 ${result.anchors}）`)
  console.log(`跳过：${result.skipped}`)
  console.log(`失败：${result.failed}`)
  if (result.warnings.length) {
    console.log('\n提示：')
    result.warnings.forEach((w) => console.log(' -', w))
  }
  if (result.errors.length) {
    console.log('\n错误明细（最多显示 20 条）：')
    result.errors.slice(0, 20).forEach((e) => console.log(' -', e))
  }
  if (result.failed > 0 && result.imported === 0) process.exit(1)
}

main().catch((err) => {
  console.error('[import-legacy-live-analysis] 失败：', err instanceof Error ? err.message : err)
  process.exit(1)
})

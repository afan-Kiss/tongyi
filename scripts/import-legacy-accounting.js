#!/usr/bin/env node
/**
 * 从旧记账系统 accounting.db 导入历史 Expense → tongyi AccountingRecord
 * 用法：node scripts/import-legacy-accounting.js [旧库路径]
 * 环境：DATABASE_URL=file:../data/app.db
 */
const path = require('node:path')

process.chdir(path.join(__dirname, '..'))
process.env.DATABASE_URL =
  process.env.DATABASE_URL ||
  `file:${path.join(__dirname, '..', 'apps', 'server', 'data', 'app.db').replace(/\\/g, '/')}`

async function main() {
  const { register } = require('tsx/cjs/api')
  register()
  const { runLegacyAccountingImport } = await import(
    '../apps/server/src/modules/accounting/accounting-legacy-import.service.ts'
  )
  const dbPath = process.argv[2]
  const copyAttachments = process.argv.includes('--copy-attachments')
  console.log('[import-legacy-accounting] 开始导入…')
  const result = await runLegacyAccountingImport({ dbPath, copyAttachments, createAlerts: true })
  console.log('\n========== 导入结果 ==========')
  console.log(`数据库：${result.dbPath}`)
  console.log(`成功：${result.imported}`)
  console.log(`跳过：${result.skipped}`)
  console.log(`失败：${result.failed}`)
  console.log(`财务提醒：${result.alertsCreated}`)
  if (result.errors.length) {
    console.log('\n错误明细（最多显示 20 条）：')
    result.errors.slice(0, 20).forEach((e) => console.log(' -', e))
  }
  if (result.failed > 0 && result.imported === 0) process.exit(1)
}

main().catch((err) => {
  console.error('[import-legacy-accounting] 失败：', err instanceof Error ? err.message : err)
  process.exit(1)
})

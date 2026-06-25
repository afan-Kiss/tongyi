/**
 * 为历史入库照片补打左上角水印（编号 + 时间）
 * 用法：在项目根目录
 *   set DATABASE_URL=file:../data/app.db
 *   node scripts/watermark-existing-photos.js
 */
const path = require('node:path')

process.chdir(path.join(__dirname, '../apps/server'))
process.env.DATABASE_URL = process.env.DATABASE_URL || 'file:../data/app.db'

async function main() {
  const { loadEnv } = require('./dist/config/env.js')
  loadEnv()
  const { prisma } = require('./dist/lib/prisma.js')
  const { backfillPhotoWatermarks } = require('./dist/lib/photo-watermark.js')

  await prisma.$connect()
  const r = await backfillPhotoWatermarks()
  console.log('补打完成：新增 %d，已跳过 %d，失败 %d', r.done, r.skipped, r.failed)
  await prisma.$disconnect()
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})

const fs = require('node:fs')
const path = require('node:path')
const { PrismaClient } = require('@prisma/client')

const LOG = path.join(__dirname, '..', 'debug-46fa35.log')
const sessionId = '46fa35'

function j(v) {
  return JSON.parse(JSON.stringify(v, (_k, val) => (typeof val === 'bigint' ? Number(val) : val)))
}

function log(hypothesisId, message, data, runId = 'audit-full') {
  const line = JSON.stringify({
    sessionId,
    hypothesisId,
    location: 'scripts/db-audit-full.js',
    message,
    data,
    timestamp: Date.now(),
    runId,
  })
  fs.appendFileSync(LOG, line + '\n')
  fetch('http://127.0.0.1:7451/ingest/a1117457-5c6f-452f-a54c-7fe92dbed71b', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Debug-Session-Id': sessionId },
    body: line,
  }).catch(() => {})
}

async function main() {
  const serverDir = path.join(__dirname, '..', 'apps', 'server')
  const dbUrl = process.env.DATABASE_URL || 'file:../data/app.db'
  const expectedDb = path.resolve(serverDir, 'data', 'app.db')

  const candidates = [
    path.resolve(serverDir, dbUrl.replace(/^file:/, '')),
    path.resolve(serverDir, 'prisma', dbUrl.replace(/^file:/, '')),
    expectedDb,
  ]
  const existing = candidates.filter((p) => fs.existsSync(p))
  log('H1', 'db file candidates', {
    DATABASE_URL: dbUrl,
    candidates: candidates.map((p) => ({
      path: p,
      exists: fs.existsSync(p),
      size: fs.existsSync(p) ? fs.statSync(p).size : 0,
    })),
    duplicateDbFiles: existing.length > 1 ? existing : null,
  })

  process.chdir(serverDir)
  const prisma = new PrismaClient()

  try {
    const [dbList, integrity, fkCheck, journalMode] = await Promise.all([
      prisma.$queryRawUnsafe('PRAGMA database_list'),
      prisma.$queryRawUnsafe('PRAGMA integrity_check'),
      prisma.$queryRawUnsafe('PRAGMA foreign_key_check'),
      prisma.$queryRawUnsafe('PRAGMA journal_mode'),
    ])
    log('H2', 'sqlite integrity', {
      dbList: j(dbList),
      integrity: j(integrity),
      fkCheck: j(fkCheck),
      journalMode: j(journalMode),
    })

    let migrations
    try {
      migrations = await prisma.$queryRawUnsafe(
        'SELECT migration_name, finished_at FROM _prisma_migrations ORDER BY finished_at',
      )
    } catch (e) {
      migrations = { error: String(e) }
    }
    log('H4', 'migration status', { migrations: j(migrations) })

    const [bracelet, detail, media, logs, labelTemplate, appSettings] = await Promise.all([
      prisma.bracelet.count(),
      prisma.braceletDetail.count(),
      prisma.mediaAsset.count(),
      prisma.operationLog.count(),
      prisma.labelTemplate.count(),
      prisma.appSettings.count(),
    ])
    const counts = { bracelet, detail, media, logs, labelTemplate, appSettings }
    log('H2', 'table row counts', counts)

    const [orphanMedia, orphanLogs, orphanDetail, dupCert, badQty] = await Promise.all([
      prisma.$queryRawUnsafe(`
        SELECT COUNT(*) as cnt FROM MediaAsset m
        LEFT JOIN Bracelet b ON m.braceletId = b.id WHERE b.id IS NULL
      `),
      prisma.$queryRawUnsafe(`
        SELECT COUNT(*) as cnt FROM OperationLog o
        LEFT JOIN Bracelet b ON o.braceletId = b.id WHERE b.id IS NULL
      `),
      prisma.$queryRawUnsafe(`
        SELECT COUNT(*) as cnt FROM BraceletDetail d
        LEFT JOIN Bracelet b ON d.braceletId = b.id WHERE b.id IS NULL
      `),
      prisma.$queryRawUnsafe(`
        SELECT certNo, COUNT(*) as cnt FROM Bracelet GROUP BY certNo HAVING cnt > 1
      `),
      prisma.$queryRawUnsafe(`
        SELECT id, certNo, qty FROM Bracelet WHERE qty NOT IN (0, 1)
      `),
    ])
    log('H5', 'orphan FK and data sanity', {
      orphanMedia: j(orphanMedia),
      orphanLogs: j(orphanLogs),
      orphanDetail: j(orphanDetail),
      dupCert: j(dupCert),
      badQty: j(badQty),
    })

    const mediaDir = path.join(serverDir, 'data', 'media')
    const allMedia = await prisma.mediaAsset.findMany({
      select: { id: true, path: true, thumbPath: true },
    })
    const missingFiles = []
    for (const m of allMedia) {
      const rel = m.path.replace(/^[/\\]/, '')
      const full = path.join(serverDir, 'data', rel)
      if (!fs.existsSync(full)) missingFiles.push({ id: m.id, path: m.path })
    }
    let orphanFilesCount = 0
    const orphanFilesSample = []
    if (fs.existsSync(mediaDir)) {
      const dbPaths = new Set(
        allMedia.flatMap((m) => [m.path, m.thumbPath].filter(Boolean).map((p) => p.replace(/\\/g, '/'))),
      )
      function walk(dir, base = '') {
        for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
          const rel = path.join(base, e.name).replace(/\\/g, '/')
          if (e.isDirectory()) walk(path.join(dir, e.name), rel)
          else {
            const hit = [...dbPaths].some((p) => p === rel || p.endsWith('/' + rel) || p.endsWith(rel))
            if (!hit) {
              orphanFilesCount++
              if (orphanFilesSample.length < 10) orphanFilesSample.push(rel)
            }
          }
        }
      }
      walk(mediaDir)
    }
    log('H3', 'media file consistency', {
      dbMediaCount: allMedia.length,
      missingFilesCount: missingFiles.length,
      missingFilesSample: missingFiles.slice(0, 10),
      orphanFilesCount,
      orphanFilesSample,
    })

    const [badSnapshots, certMismatch, logStats] = await Promise.all([
      prisma.$queryRawUnsafe(`
        SELECT id FROM OperationLog
        WHERE json_valid(snapshotJson) = 0
        LIMIT 10
      `).catch(() => []),
      prisma.$queryRawUnsafe(`
        SELECT o.id, o.certNo, o.opType FROM OperationLog o
        LEFT JOIN Bracelet b ON b.certNo = o.certNo
        WHERE b.id IS NULL AND o.opType != 'new_inbound'
        LIMIT 10
      `),
      prisma.$queryRawUnsafe(`
        SELECT
          COUNT(*) as total,
          SUM(CASE WHEN reverted = 1 THEN 1 ELSE 0 END) as reverted,
          SUM(CASE WHEN excelSynced = 0 AND reverted = 0 THEN 1 ELSE 0 END) as unsyncedExcel
        FROM OperationLog
      `),
    ])
    log('H5', 'operation log integrity', {
      badSnapshots: j(badSnapshots),
      certMismatch: j(certMismatch),
      logStats: j(logStats),
    })

    const braceletsNoDetail = await prisma.bracelet.count({ where: { detail: { is: null } } })
    log('H4', 'bracelet detail coverage', {
      braceletsNoDetail,
      braceletsWithDetail: detail,
      totalBracelets: bracelet,
    })

    log('H0', 'audit complete', { status: 'ok', counts })
  } catch (e) {
    log('H0', 'audit failed', { error: String(e), stack: e.stack?.split('\n').slice(0, 5) })
    process.exitCode = 1
  } finally {
    await prisma.$disconnect()
  }
}

main()

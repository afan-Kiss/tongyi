#!/usr/bin/env node
/** 在主播分析服务器 apps/server 目录运行：导出直播号 Cookie JSON */
const fs = require('node:fs')
const path = require('node:path')

const serverDir = '/www/wwwroot/zhubo-analysis/apps/server'
process.chdir(serverDir)

const envPath = path.join(serverDir, '.env')
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, 'utf8').split(/\r?\n/)) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    const eq = trimmed.indexOf('=')
    if (eq <= 0) continue
    const key = trimmed.slice(0, eq).trim()
    let val = trimmed.slice(eq + 1).trim()
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1)
    }
    if (!process.env[key]) process.env[key] = val
  }
}

const { listLiveAccountsForSettings } = require('./dist/services/live-account.service')
listLiveAccountsForSettings()
  .then((rows) => {
    const out = rows.map((x) => ({
      id: x.id,
      name: x.name,
      enabled: x.enabled,
      cookie: x.cookie || x.cookieText || '',
    }))
    process.stdout.write(JSON.stringify(out))
  })
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })

/**
 * 从主播分析服务器拉取直播号 Cookie，写入辅助出库软件 config.json
 * 用法: node scripts/sync-live-cookies-from-server.js
 * 环境变量: LIVE_API_BASE, LIVE_API_USER, LIVE_API_PASS
 */
const fs = require('node:fs')
const path = require('node:path')

const BASE = (process.env.LIVE_API_BASE || 'http://8.137.126.18').replace(/\/$/, '')
const USER = process.env.LIVE_API_USER || 'admin'
const PASS = process.env.LIVE_API_PASS || 'admin123456'

const OUTBOUND_PATHS = [
  path.resolve(__dirname, '../../辅助出库软件/config.json'),
  path.resolve(__dirname, '../../辅助出库软件/dist/config.json'),
]

function pickSessionCookie(headers) {
  const raw =
    (typeof headers.getSetCookie === 'function' ? headers.getSetCookie() : null) ||
    (headers.get('set-cookie') ? [headers.get('set-cookie')] : [])
  for (const line of raw) {
    const m = String(line).match(/^(live\.sid=[^;]+)/)
    if (m) return m[1]
  }
  for (const line of raw) {
    const part = String(line).split(';')[0].trim()
    if (part.includes('=')) return part
  }
  return ''
}

async function login() {
  const res = await fetch(`${BASE}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: USER, password: PASS }),
    signal: AbortSignal.timeout(15000),
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok || data.ok === false) {
    throw new Error(data.message || `登录失败 HTTP ${res.status}`)
  }
  const cookie = pickSessionCookie(res.headers)
  if (!cookie) throw new Error('登录成功但未拿到 session cookie')
  return cookie
}

async function fetchAccounts(sessionCookie) {
  const res = await fetch(`${BASE}/api/settings/live-accounts`, {
    headers: { Cookie: sessionCookie, Accept: 'application/json' },
    signal: AbortSignal.timeout(20000),
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok || data.ok === false) {
    throw new Error(data.message || `读取直播号失败 HTTP ${res.status}`)
  }
  const accounts = data.accounts || data.data?.accounts || []
  if (!Array.isArray(accounts) || !accounts.length) {
    throw new Error('服务器未返回任何直播号')
  }
  return accounts
}

function mergeAccounts(remoteAccounts, existing) {
  const byName = new Map((existing || []).map((a) => [String(a.name || '').trim(), a]))
  const now = new Date().toISOString().slice(0, 19).replace('T', ' ')
  return remoteAccounts.map((remote, idx) => {
    const name = String(remote.name || '').trim()
    const cookie = String(remote.cookie || remote.cookieText || '').trim()
    if (!name || !cookie || cookie.length < 80) {
      throw new Error(`直播号「${name || '(无名)'}」Cookie 无效或过短`)
    }
    const prev = byName.get(name)
    return {
      id: prev?.id || remote.id || `remote-${idx}`,
      name,
      cookie,
      enabled: remote.enabled !== false,
      is_default: prev?.is_default ?? idx === 0,
      last_test_status: '',
      last_test_message: '',
      last_test_at: now,
      created_at: prev?.created_at || now,
      updated_at: now,
    }
  })
}

function writeOutbound(accounts) {
  const written = []
  for (const filePath of OUTBOUND_PATHS) {
    if (!fs.existsSync(filePath)) continue
    const cfg = JSON.parse(fs.readFileSync(filePath, 'utf8'))
    cfg.xhs_accounts = accounts
    cfg.xhs_accounts_managed = true
    cfg.xhs_cookie = accounts.find((a) => a.is_default)?.cookie || accounts[0].cookie
    fs.writeFileSync(filePath, `${JSON.stringify(cfg, null, 2)}\n`, 'utf8')
    written.push(filePath)
  }
  if (!written.length) {
    throw new Error(`未找到可写入的配置文件: ${OUTBOUND_PATHS.join(', ')}`)
  }
  return written
}

;(async () => {
  console.log(`[sync] 登录 ${BASE} …`)
  const sessionCookie = await login()
  console.log('[sync] 登录成功，读取直播号 Cookie …')
  const remote = await fetchAccounts(sessionCookie)
  console.log(`[sync] 服务器共 ${remote.length} 个直播号: ${remote.map((a) => a.name).join('、')}`)

  const existingPath = OUTBOUND_PATHS.find((p) => fs.existsSync(p))
  const existing = existingPath
    ? JSON.parse(fs.readFileSync(existingPath, 'utf8')).xhs_accounts || []
    : []
  const merged = mergeAccounts(remote, existing)
  const written = writeOutbound(merged)

  console.log(`[sync] 已写入 ${merged.length} 个店铺 Cookie:`)
  for (const a of merged) {
    console.log(`  - ${a.name} (${a.cookie.length} 字符)`)
  }
  for (const p of written) console.log(`  → ${p}`)
})().catch((e) => {
  console.error('[sync] 失败:', e.message || e)
  process.exit(1)
})

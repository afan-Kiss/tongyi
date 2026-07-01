import fs from 'node:fs'
import { getOutboundConfigPath } from '../../config/env'
import type { OutboundXhsAccount } from './qianfanSync.types'
import { cookieHasArkToken } from './qianfanSync.xhsSigner'

interface OutboundConfig {
  xhs_accounts?: Array<{ name?: string; cookie?: string; enabled?: boolean; is_default?: boolean }>
  xhs_cookie?: string
  shop_name?: string
}

let cache: { path: string; mtimeMs: number; accounts: OutboundXhsAccount[] } = {
  path: '',
  mtimeMs: 0,
  accounts: [],
}

function normalizeAccount(raw: unknown): OutboundXhsAccount | null {
  if (!raw || typeof raw !== 'object') return null
  const r = raw as Record<string, unknown>
  const name = String(r.name || '').trim()
  const cookie = String(r.cookie || '').trim()
  if (!name || !cookie || cookie.includes('...') || cookie.length < 80) return null
  return {
    name,
    cookie,
    enabled: r.enabled !== false,
    isDefault: Boolean(r.is_default || r.isDefault),
  }
}

export function loadOutboundAccounts(force = false): OutboundXhsAccount[] {
  const configPath = getOutboundConfigPath()
  if (!fs.existsSync(configPath)) return []
  const stat = fs.statSync(configPath)
  if (!force && cache.path === configPath && cache.mtimeMs === stat.mtimeMs) return cache.accounts

  let data: OutboundConfig | null = null
  try {
    data = JSON.parse(fs.readFileSync(configPath, 'utf8')) as OutboundConfig
  } catch {
    data = null
  }
  if (!data) {
    cache = { path: configPath, mtimeMs: stat.mtimeMs, accounts: [] }
    return []
  }

  const fromList = (Array.isArray(data.xhs_accounts) ? data.xhs_accounts : [])
    .map(normalizeAccount)
    .filter((a): a is OutboundXhsAccount => Boolean(a))

  let accounts = fromList
  if (!accounts.length) {
    const legacy = String(data.xhs_cookie || '').trim()
    if (legacy && legacy.length >= 80 && !legacy.includes('...')) {
      accounts = [
        {
          name: String(data.shop_name || '默认店铺'),
          cookie: legacy,
          enabled: true,
          isDefault: true,
        },
      ]
    }
  }

  cache = { path: configPath, mtimeMs: stat.mtimeMs, accounts: accounts.filter((a) => a.enabled) }
  return cache.accounts
}

export function probeCookieStatus(cookie: string): 'ok' | 'missing' | 'expired' | 'unknown' {
  if (!cookie || cookie.length < 80) return 'missing'
  if (!cookieHasArkToken(cookie)) return 'expired'
  return 'ok'
}

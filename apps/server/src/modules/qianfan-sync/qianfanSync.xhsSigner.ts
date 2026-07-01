import fs from 'node:fs'
import path from 'node:path'
import { createRequire } from 'node:module'
import { MONOREPO_ROOT } from '../../config/env'

const modRequire = createRequire(path.join(MONOREPO_ROOT, 'package.json'))

function loadXhshowClient(): { Client: new () => { sign: (url: string, body: unknown, cookie: string, mode: string) => Record<string, string> } } {
  const candidates = [
    path.join(MONOREPO_ROOT, 'node_modules/xhshow-js/dist/index.cjs'),
    path.join(MONOREPO_ROOT, 'apps/xiangyu/node_modules/xhshow-js/dist/index.cjs'),
  ]
  for (const entry of candidates) {
    if (fs.existsSync(entry)) return modRequire(entry)
  }
  throw new Error('xhshow-js 未安装，请在项目根目录运行 npm install')
}

const { Client } = loadXhshowClient()
const signer = new Client()

export class XhsSignError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'XhsSignError'
  }
}

export function parseCookieString(cookie: string): Record<string, string> {
  const out: Record<string, string> = {}
  for (const part of String(cookie || '').split(';')) {
    const trimmed = part.trim()
    if (!trimmed || !trimmed.includes('=')) continue
    const idx = trimmed.indexOf('=')
    out[trimmed.slice(0, idx).trim()] = trimmed.slice(idx + 1).trim()
  }
  return out
}

export function extractAuthorizationFromCookie(cookie: string): string {
  const m = parseCookieString(cookie)
  for (const [key, val] of Object.entries(m)) {
    if (key.toLowerCase().includes('access-token-ark') && val) {
      const v = String(val).trim()
      if (v.startsWith('customer.ark.')) return v.slice('customer.ark.'.length)
      return v
    }
  }
  return ''
}

export function cookieHasArkToken(cookie: string): boolean {
  const auth = extractAuthorizationFromCookie(cookie)
  const m = parseCookieString(cookie)
  return Boolean(auth && (m.a1 || m.webId))
}

export function signPostHeaders(
  url: string,
  body: Record<string, unknown>,
  cookie: string,
  mode = 'seller',
): Record<string, string> {
  try {
    return signer.sign(url, body, cookie, mode)
  } catch (e) {
    throw new XhsSignError(e instanceof Error ? e.message : '小红书请求签名失败')
  }
}

export function signGetHeaders(
  url: string,
  query: Record<string, unknown>,
  cookie: string,
  mode = 'seller',
): Record<string, string> {
  try {
    return signer.sign(url, query, cookie, mode)
  } catch (e) {
    throw new XhsSignError(e instanceof Error ? e.message : '小红书请求签名失败')
  }
}

export const DEFAULT_XHS_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36'

export function buildArkHeaders(
  signed: Record<string, string>,
  cookie: string,
  referer: string,
): Record<string, string> {
  const auth = extractAuthorizationFromCookie(cookie)
  if (!auth) throw new Error('Cookie 中未找到 ark access token，请先打开千帆客服台或重新采集')
  return {
    accept: 'application/json, text/plain, */*',
    'content-type': 'application/json',
    origin: 'https://ark.xiaohongshu.com',
    referer,
    'bill-type': 'xhs',
    'user-agent': DEFAULT_XHS_UA,
    cookie,
    authorization: auth,
    ...signed,
  }
}

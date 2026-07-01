import http from 'node:http'
import type { Express, Request, Response } from 'express'
import { getEffectiveJizhangWebUrlSync, getEffectiveZhuboAnalysisWebUrlSync } from '../modules/system-discovery/systemDiscovery.service'

export const JIZHANG_PROXY_PREFIX = '/jizhang-proxy'
export const ZHUBO_PROXY_PREFIX = '/zhubo-proxy'

function parseTarget(baseUrl: string): { hostname: string; port: number; protocol: 'http:' | 'https:' } | null {
  if (!baseUrl) return null
  try {
    const u = new URL(baseUrl)
    return {
      hostname: u.hostname,
      port: u.port ? Number(u.port) : u.protocol === 'https:' ? 443 : 80,
      protocol: u.protocol as 'http:' | 'https:',
    }
  } catch {
    return null
  }
}

function proxyToTarget(req: Request, res: Response, baseUrl: string, prefix: string, label: string): void {
  const target = parseTarget(baseUrl)
  if (!target) {
    res.status(502).json({
      ok: false,
      message: `${label}未配置，请在环境变量中设置地址`,
    })
    return
  }

  let p = req.path
  if (p.startsWith(prefix)) {
    p = p.slice(prefix.length) || '/'
  }
  const qs = req.url.includes('?') ? req.url.slice(req.url.indexOf('?')) : ''
  const pathWithQuery = p + qs

  const headers = { ...req.headers, host: `${target.hostname}:${target.port}` }
  delete headers['accept-encoding']
  delete headers['content-length']

  const proxyReq = http.request(
    {
      hostname: target.hostname,
      port: target.port,
      path: pathWithQuery,
      method: req.method,
      headers,
    },
    (proxyRes) => {
      res.status(proxyRes.statusCode || 502)
      Object.entries(proxyRes.headers).forEach(([k, v]) => {
        if (v !== undefined && k.toLowerCase() !== 'transfer-encoding') {
          res.setHeader(k, v)
        }
      })
      proxyRes.pipe(res)
    },
  )

  proxyReq.on('error', (err) => {
    if (!res.headersSent) {
      res.status(502).json({
        ok: false,
        message: `${label}暂时连不上：${err.message}。不影响扫码出库功能。`,
      })
    }
  })

  const hasBody = req.body && typeof req.body === 'object' && Object.keys(req.body).length > 0
  if (['POST', 'PUT', 'PATCH'].includes(req.method || '') && hasBody) {
    const body = JSON.stringify(req.body)
    proxyReq.setHeader('Content-Type', 'application/json')
    proxyReq.setHeader('Content-Length', Buffer.byteLength(body))
    proxyReq.write(body)
    proxyReq.end()
    return
  }

  if (req.readable && req.method !== 'GET' && req.method !== 'HEAD') {
    req.pipe(proxyReq)
  } else {
    proxyReq.end()
  }
}

export function mountPortalProxies(app: Express): void {
  app.use((req, res, next) => {
    if (req.path.startsWith(JIZHANG_PROXY_PREFIX)) {
      proxyToTarget(req, res, getEffectiveJizhangWebUrlSync(), JIZHANG_PROXY_PREFIX, '经营记账')
      return
    }
    if (req.path.startsWith(ZHUBO_PROXY_PREFIX)) {
      proxyToTarget(req, res, getEffectiveZhuboAnalysisWebUrlSync(), ZHUBO_PROXY_PREFIX, '主播分析')
      return
    }
    next()
  })
}

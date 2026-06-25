import http from 'node:http'
import type { Express, NextFunction, Request, Response } from 'express'
import { getXiangyuPort, isXiangyuEnabled } from '../config/env'

export const XIANGYU_PROXY_PREFIX = '/xiangyu-proxy'

function targetPort(): number {
  return getXiangyuPort()
}

function shouldProxyApi(path: string): boolean {
  if (!path.startsWith('/api')) return false
  if (path.startsWith('/api/v1')) return false
  if (path === '/api/health') return false
  return true
}

function shouldProxyStatic(path: string): boolean {
  return path.startsWith('/css/') || path.startsWith('/js/')
}

function targetPath(req: Request): string {
  let p = req.path
  if (p.startsWith(XIANGYU_PROXY_PREFIX)) {
    p = p.slice(XIANGYU_PROXY_PREFIX.length) || '/'
  }
  const qs = req.url.includes('?') ? req.url.slice(req.url.indexOf('?')) : ''
  return p + qs
}

function proxyRequest(req: Request, res: Response): void {
  const path = targetPath(req)
  const port = targetPort()
  const headers = { ...req.headers, host: `127.0.0.1:${port}` }
  delete headers['accept-encoding']

  const proxyReq = http.request(
    {
      hostname: '127.0.0.1',
      port,
      path,
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
      res.status(502).json({ ok: false, message: `祥钰代理不可用: ${err.message}` })
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

export function mountXiangyuProxy(app: Express, requireAuth?: (req: Request, res: Response, next: NextFunction) => void): void {
  if (!isXiangyuEnabled()) return

  app.use((req, res, next) => {
    const p = req.path
    if (
      p.startsWith(XIANGYU_PROXY_PREFIX) ||
      shouldProxyApi(p) ||
      shouldProxyStatic(p)
    ) {
      if (requireAuth) {
        requireAuth(req, res, () => proxyRequest(req, res))
        return
      }
      proxyRequest(req, res)
      return
    }
    next()
  })
}

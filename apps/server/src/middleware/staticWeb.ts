import fs from 'node:fs'
import path from 'node:path'
import type { Express, Request, Response } from 'express'
import express from 'express'
import { SERVER_ROOT } from '../config/env'

export function getWebDistPath(): string {
  return path.resolve(SERVER_ROOT, '../web/dist')
}

export function mountWebStatic(app: Express): boolean {
  const dist = getWebDistPath()
  const indexHtml = path.join(dist, 'index.html')
  if (!fs.existsSync(indexHtml)) return false

  const assetsDir = path.join(dist, 'assets')
  if (fs.existsSync(assetsDir)) {
    app.use(
      '/assets',
      express.static(assetsDir, {
        index: false,
        maxAge: '365d',
        immutable: true,
      }),
    )
  }

  app.use(express.static(dist, { index: false, maxAge: 0 }))

  const sendSpa = (_req: Request, res: Response) => {
    res.setHeader('Cache-Control', 'no-cache')
    res.sendFile(indexHtml)
  }

  app.get(
    [
      '/',
      '/inventory',
      '/inventory/scan',
      '/inventory/stock',
      '/inventory/inbound',
      '/inventory/inventory',
      '/inventory/settings',
      '/xiangyu',
      '/scan',
      '/inbound',
      '/settings',
    ],
    sendSpa,
  )

  app.use((req, res, next) => {
    if (req.method !== 'GET' && req.method !== 'HEAD') return next()
    if (req.path.startsWith('/api')) return next()
    sendSpa(req, res)
  })

  return true
}

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

  const mobileCameraHtml = path.join(dist, 'mobile-camera.html')
  const sendMobileCamera = (_req: Request, res: Response) => {
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate')
    res.setHeader('Permissions-Policy', 'camera=(self)')
    if (fs.existsSync(mobileCameraHtml)) {
      res.sendFile(mobileCameraHtml)
      return
    }
    sendSpa(_req, res)
  }

  const redirectMobileCamera = (req: Request, res: Response) => {
    const qs = req.url.includes('?') ? req.url.slice(req.url.indexOf('?')) : ''
    res.redirect(302, `/inventory/mobile-camera${qs}`)
  }

  app.get('/m', redirectMobileCamera)
  app.get('/mobile/capture', redirectMobileCamera)

  app.get('/inventory/mobile/capture', redirectMobileCamera)

  app.get('/inventory/mobile-camera', sendMobileCamera)
  app.get(
    [
      '/',
      '/login',
      '/inventory',
      '/inventory/scan',
      '/inventory/stock',
      '/inventory/inbound',
      '/inventory/inventory',
      '/inventory/settings',
      '/inventory/audit',
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

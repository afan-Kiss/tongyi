import type { Request, Response, NextFunction } from 'express'
import express from 'express'

import { getBraceletByCode, searchBracelets } from './scanner-bracelet.service'
import {
  contentTypeForImage,
  ensureBraceletThumbAbs,
  isPathWithinAllowedRoots,
  resolveAllowedImagePath,
  resolveImageServePath,
} from './scanner-file.service'
import { logScannerApi } from './scanner-api-logger'
import type { ScannerApiFailure } from './types'

const SERVICE_VERSION = '1.0.0'

function formatHealthTime(): string {
  const d = new Date()
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
}

function fail(res: Response, status: number, code: string, message: string): Response {
  const body: ScannerApiFailure = { success: false, code, message }
  return res.status(status).json(body)
}

function stripRaw<T extends { raw?: unknown }>(row: T): Omit<T, 'raw'> {
  const { raw: _raw, ...rest } = row
  return rest
}

export function createScannerApiApp(): express.Application {
  const app = express()
  app.disable('x-powered-by')
  app.set('trust proxy', false)

  app.use((req, res, next) => {
    res.setHeader('Access-Control-Allow-Origin', '127.0.0.1')
    next()
  })

  app.get('/api/health', (_req, res) => {
    res.json({
      success: true,
      service: 'scanner-api',
      version: SERVICE_VERSION,
      time: formatHealthTime(),
    })
  })

  app.get('/api/bracelets/search', async (req, res) => {
    const q = String(req.query.q || '').trim()
    logScannerApi({ action: 'search', query: q })
    if (!q) {
      return fail(res, 400, 'INVALID_QUERY', '请提供搜索关键词 q')
    }
    try {
      const rows = await searchBracelets(q, 20)
      logScannerApi({ action: 'search', query: q, found: rows.length > 0, count: rows.length })
      return res.json({
        success: true,
        data: rows.map((row) => stripRaw(row)),
      })
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      logScannerApi({ action: 'search', query: q, found: false, error: message })
      return fail(res, 500, 'DATA_SOURCE_ERROR', message)
    }
  })

  app.get('/api/bracelets/:code/thumb', async (req, res) => {
    const code = String(req.params.code || '').trim()
    logScannerApi({ action: 'thumb', code })
    if (!code) {
      return fail(res, 400, 'INVALID_QUERY', '请提供镯子编号')
    }
    try {
      const thumbAbs = await ensureBraceletThumbAbs(code)
      if (!thumbAbs || !resolveAllowedImagePath(thumbAbs)) {
        logScannerApi({ action: 'thumb', code, found: false, error: 'FILE_NOT_FOUND' })
        return fail(res, 404, 'FILE_NOT_FOUND', `未找到镯子图片：${code}`)
      }
      logScannerApi({ action: 'thumb', code, found: true })
      res.setHeader('Content-Type', 'image/jpeg')
      res.setHeader('Cache-Control', 'private, max-age=3600')
      return res.sendFile(thumbAbs)
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      logScannerApi({ action: 'thumb', code, found: false, error: message })
      return fail(res, 500, 'INTERNAL_ERROR', message)
    }
  })

  app.get('/api/bracelets/:code', async (req, res) => {
    const code = String(req.params.code || '').trim()
    logScannerApi({ action: 'get', code })
    if (!code) {
      return fail(res, 400, 'INVALID_QUERY', '请提供镯子编号')
    }
    try {
      const row = await getBraceletByCode(code)
      if (!row) {
        logScannerApi({ action: 'get', code, found: false, error: 'BRACELET_NOT_FOUND' })
        return fail(res, 404, 'BRACELET_NOT_FOUND', `未找到镯子：${code}`)
      }
      logScannerApi({ action: 'get', code, found: true })
      return res.json({ success: true, data: row })
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      logScannerApi({ action: 'get', code, found: false, error: message })
      return fail(res, 500, 'DATA_SOURCE_ERROR', message)
    }
  })

  app.get('/api/files/image', (req, res) => {
    const rawPath = String(req.query.path || '').trim()
    const size = String(req.query.size || '').trim().toLowerCase()
    logScannerApi({ action: 'image', path: rawPath, size: size || 'original' })

    if (!rawPath) {
      return fail(res, 400, 'INVALID_PATH', '请提供图片路径 path')
    }

    if (!isPathWithinAllowedRoots(rawPath)) {
      logScannerApi({ action: 'image', path: rawPath, found: false, error: 'INVALID_PATH' })
      return fail(res, 403, 'INVALID_PATH', '不允许读取该路径')
    }

    const abs = resolveImageServePath(rawPath, size === 'thumb' ? 'thumb' : undefined)
    if (!abs || !resolveAllowedImagePath(abs)) {
      logScannerApi({ action: 'image', path: rawPath, found: false, error: 'FILE_NOT_FOUND' })
      return fail(res, 404, 'FILE_NOT_FOUND', '图片不存在')
    }

    logScannerApi({ action: 'image', path: rawPath, found: true })
    res.setHeader('Content-Type', contentTypeForImage(abs))
    res.setHeader('Cache-Control', 'private, max-age=600')
    return res.sendFile(abs)
  })

  app.use((_req, res) => {
    fail(res, 404, 'NOT_FOUND', '接口不存在')
  })

  app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
    const message = err instanceof Error ? err.message : String(err)
    logScannerApi({ action: 'error', error: message })
    fail(res, 500, 'INTERNAL_ERROR', message)
  })

  return app
}

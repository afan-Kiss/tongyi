import compression from 'compression'
import cors from 'cors'
import express from 'express'
import { v1Router } from './routes/v1'
import { mountWebStatic } from './middleware/staticWeb'
import { mountXiangyuProxy } from './middleware/xiangyuProxy'

export function createApp() {
  const app = express()
  app.set('trust proxy', true)
  app.use(cors({ origin: true, credentials: true }))
  app.use(compression())
  app.use(express.json({ limit: '10mb' }))

  app.use('/api/v1', v1Router)
  app.get('/api/health', (_req, res) => {
    res.json({ ok: true, service: 'jade-inventory-api', version: 'v1' })
  })

  mountXiangyuProxy(app)

  app.use('/api', (_req, res) => {
    res.status(404).json({ ok: false, message: '请使用 /api/v1/* 接口' })
  })

  const webMounted = mountWebStatic(app)
  return { app, webMounted }
}

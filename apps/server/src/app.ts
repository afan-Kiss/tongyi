import compression from 'compression'
import cors from 'cors'
import express from 'express'
import session from 'express-session'
import { v1Router } from './routes/v1'
import { authRouter } from './routes/v1/auth.routes'
import { mountWebStatic } from './middleware/staticWeb'
import { mountXiangyuProxy } from './middleware/xiangyuProxy'
import { mountPortalProxies } from './middleware/portalProxy'
import { requireApiAuth } from './middleware/requireAuth'
import { getSessionSecret } from './services/auth.service'
import { FileSessionStore } from './lib/fileSessionStore'

export function createApp() {
  const app = express()
  app.set('trust proxy', true)
  app.use(cors({ origin: true, credentials: true }))
  app.use(compression())
  app.use(express.json({ limit: '30mb' }))

  app.use(
    session({
      name: 'jade.sid',
      secret: getSessionSecret(),
      store: new FileSessionStore(),
      resave: false,
      saveUninitialized: false,
      rolling: true,
      cookie: {
        httpOnly: true,
        sameSite: 'lax',
        secure: false,
        path: '/',
        maxAge: 30 * 24 * 60 * 60 * 1000,
      },
    }),
  )

  app.use('/api/v1/auth', authRouter)
  app.use('/api/v1', requireApiAuth, v1Router)
  app.get('/api/health', (_req, res) => {
    res.json({ ok: true, service: 'jade-inventory-api', version: 'v1' })
  })

  mountXiangyuProxy(app)
  mountPortalProxies(app)

  app.use('/api', (_req, res) => {
    res.status(404).json({ ok: false, message: '请使用 /api/v1/* 接口' })
  })

  const webMounted = mountWebStatic(app)
  return { app, webMounted }
}

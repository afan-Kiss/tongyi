import { Router } from 'express'
import {
  getUserDisplayName,
  getUserProfile,
  setUserDisplayName,
  verifyLogin,
} from '../../services/auth.service'
import { checkStartupLicense, getCachedLicense } from '../../services/youdaoLicense.service'
import { recordUserActivityFromRequest } from '../../services/user-activity.service'
import { requireSessionAuth } from '../../middleware/requireAuth'
import { sendErr, sendOk } from '../../utils/api-response'

export const authRouter = Router()

authRouter.get('/license', async (_req, res) => {
  const license = await checkStartupLicense({ force: true, timeoutMs: 12_000 })
  sendOk(res, {
    allowed: license.allowed,
    message: license.message,
    switchValue: license.switchValue,
  })
})

authRouter.get('/status', (req, res) => {
  const license = getCachedLicense()
  const username = req.session?.username || ''
  sendOk(res, {
    authed: Boolean(req.session?.authed),
    username,
    displayName: req.session?.authed ? getUserDisplayName(username) : '',
    license: {
      allowed: license.allowed,
      message: license.message,
      switchValue: license.switchValue,
    },
  })
})

authRouter.get('/profile', requireSessionAuth, (req, res) => {
  sendOk(res, getUserProfile(req.session?.username || ''))
})

authRouter.put('/profile', requireSessionAuth, (req, res) => {
  try {
    sendOk(res, setUserDisplayName(req.session?.username || '', String(req.body?.displayName ?? '')))
  } catch (e) {
    sendErr(res, e instanceof Error ? e.message : '保存失败', 400)
  }
})

authRouter.post('/login', async (req, res) => {
  const license = await checkStartupLicense({ timeoutMs: 12_000 })
  if (!license.allowed) {
    return sendErr(res, license.message, 403, 'LICENSE_DISABLED')
  }

  const username = String(req.body?.username || '').trim()
  const password = String(req.body?.password || '')
  const result = verifyLogin(username, password)
  if (!result.ok) {
    recordUserActivityFromRequest(req, {
      username: username || null,
      category: 'auth',
      action: 'login_failed',
      path: '/login',
      detail: { attemptedUsername: username },
    })
    return sendErr(res, '账号或密码错误', 401)
  }
  req.session.authed = true
  req.session.username = result.username
  req.session.save((err) => {
    if (err) return sendErr(res, '登录状态保存失败', 500)
    recordUserActivityFromRequest(req, {
      category: 'auth',
      action: 'login_success',
      path: '/login',
    })
    sendOk(res, { username: result.username })
  })
})

authRouter.post('/logout', (req, res) => {
  const username = req.session?.username
  recordUserActivityFromRequest(req, {
    username: username || null,
    category: 'auth',
    action: 'logout',
    path: '/logout',
  })
  req.session.authed = false
  req.session.username = undefined
  req.session.destroy((err) => {
    if (err) return sendErr(res, '退出失败', 500)
    res.clearCookie('jade.sid')
    sendOk(res, { loggedOut: true })
  })
})

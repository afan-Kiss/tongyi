import { Router } from 'express'
import { getPrintAgentUrl } from '../config/env'

export const printRouter = Router()

printRouter.post('/label', async (req, res) => {
  try {
    const agentRes = await fetch(`${getPrintAgentUrl()}/print/label`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(req.body),
      signal: AbortSignal.timeout(10000),
    })
    const data = await agentRes.json()
    res.status(agentRes.ok ? 200 : 502).json(data)
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    res.status(502).json({ ok: false, message: `打印 Agent 不可用: ${msg}` })
  }
})

printRouter.get('/health', async (_req, res) => {
  try {
    const agentRes = await fetch(`${getPrintAgentUrl()}/health`, { signal: AbortSignal.timeout(2000) })
    const data = await agentRes.json()
    res.json(data)
  } catch {
    res.json({ ok: false, message: '打印 Agent 离线' })
  }
})

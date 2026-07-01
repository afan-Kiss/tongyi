import { Router } from 'express'
import { sendErr, sendOk } from '../../utils/api-response'
import {
  getAgentOverview,
  listAgentMachines,
  registerAgent,
  requireAgentAuth,
  resolveAgentFromRequest,
} from './agent.service'
import { recordAgentHeartbeat } from './agent-heartbeat.service'
import {
  createAgentTask,
  listAgentTasks,
  pullAgentTask,
  retryAgentTask,
  submitAgentTaskResult,
} from './agent-task.service'
import type { AgentHeartbeatBody, AgentRegisterBody, AgentTaskResultBody } from './agent.types'

export const agentRouter = Router()

agentRouter.post('/register', async (req, res) => {
  try {
    const body = req.body as AgentRegisterBody
    const result = await registerAgent(body, req)
    sendOk(res, result, '本地助手注册成功')
  } catch (err) {
    sendErr(res, err instanceof Error ? err.message : '注册失败', 400)
  }
})

agentRouter.post('/heartbeat', requireAgentAuth, async (req, res) => {
  try {
    const agent = (req as typeof req & { agentMachine: { id: string } }).agentMachine
    const body = req.body as AgentHeartbeatBody
    const result = await recordAgentHeartbeat(agent.id, body, req)
    sendOk(res, result)
  } catch (err) {
    sendErr(res, err instanceof Error ? err.message : '心跳失败', 500)
  }
})

agentRouter.get('/tasks/pull', requireAgentAuth, async (req, res) => {
  try {
    const agent = (req as typeof req & { agentMachine: { id: string } }).agentMachine
    const task = await pullAgentTask(agent.id)
    sendOk(res, { task })
  } catch (err) {
    sendErr(res, err instanceof Error ? err.message : '拉取任务失败', 500)
  }
})

agentRouter.post('/tasks/:id/result', requireAgentAuth, async (req, res) => {
  try {
    const agent = (req as typeof req & { agentMachine: { id: string } }).agentMachine
    const body = req.body as AgentTaskResultBody
    const task = await submitAgentTaskResult(req.params.id, agent.id, body)
    sendOk(res, { task })
  } catch (err) {
    sendErr(res, err instanceof Error ? err.message : '回传结果失败', 400)
  }
})

agentRouter.get('/status', async (_req, res) => {
  try {
    const overview = await getAgentOverview()
    sendOk(res, overview)
  } catch (err) {
    sendErr(res, err instanceof Error ? err.message : '读取助手状态失败', 500)
  }
})

agentRouter.get('/machines', async (_req, res) => {
  try {
    const machines = await listAgentMachines()
    sendOk(res, { machines })
  } catch (err) {
    sendErr(res, err instanceof Error ? err.message : '读取机器列表失败', 500)
  }
})

agentRouter.get('/tasks', async (req, res) => {
  try {
    const limit = Math.min(Number(req.query.limit) || 50, 200)
    const tasks = await listAgentTasks(limit)
    sendOk(res, { tasks })
  } catch (err) {
    sendErr(res, err instanceof Error ? err.message : '读取任务列表失败', 500)
  }
})

agentRouter.post('/tasks', async (req, res) => {
  try {
    const { type, payload, machineId, maxRetries } = req.body || {}
    const task = await createAgentTask({ type, payload, machineId, maxRetries })
    sendOk(res, { task }, '任务已创建')
  } catch (err) {
    sendErr(res, err instanceof Error ? err.message : '创建任务失败', 400)
  }
})

agentRouter.post('/tasks/:id/retry', async (req, res) => {
  try {
    const task = await retryAgentTask(req.params.id)
    sendOk(res, { task }, '任务已重新排队')
  } catch (err) {
    sendErr(res, err instanceof Error ? err.message : '重试失败', 400)
  }
})

/** 供 middleware 判断是否为 agent 自认证路由 */
export function isAgentSelfAuthPath(path: string): boolean {
  return (
    path === '/agent/register' ||
    path.startsWith('/agent/heartbeat') ||
    path.startsWith('/agent/tasks/pull') ||
    /^\/agent\/tasks\/[^/]+\/result/.test(path)
  )
}

export { resolveAgentFromRequest, requireAgentAuth }

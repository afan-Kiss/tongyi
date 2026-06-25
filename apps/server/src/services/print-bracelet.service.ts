import { getPrintAgentUrl } from '../config/env'
import type { ApiError } from '../types/api.types'
import {
  classifyPrintFailure,
  pingPrintAgent,
  recoverPrintAgent,
} from './print-agent-recovery.service'

export interface PrintBraceletPayload {
  bracelet: Record<string, unknown>
  template?: unknown
  printerName?: string
  side?: string
}

type PrintAgentResult = { ok?: boolean; message?: string }

async function callPrintAgent(payload: PrintBraceletPayload, timeoutMs: number): Promise<{
  ok: boolean
  message: string
  agentStatus: number
}> {
  const agentRes = await fetch(`${getPrintAgentUrl()}/print/bracelet-tag`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(timeoutMs),
  })
  const data = (await agentRes.json().catch(() => ({
    ok: false,
    message: '打印 Agent 返回无效响应',
  }))) as PrintAgentResult
  return {
    ok: agentRes.ok && data.ok !== false,
    message: String(data.message || (agentRes.ok ? '已发送打印' : '打印失败')),
    agentStatus: agentRes.status,
  }
}

function isAgentUnavailable(message: string, status: number): boolean {
  if (status === 502 || status === 503) return true
  const m = message.toLowerCase()
  return (
    m.includes('timed out') ||
    m.includes('timeout') ||
    m.includes('abort') ||
    m.includes('agent 不可用') ||
    m.includes('econnrefused') ||
    m.includes('fetch failed') ||
    m.includes('invalid response') ||
    m.includes('无响应') ||
    m.includes('offline')
  )
}

export function printFailureResponse(rawMessage: string, extra?: Partial<ApiError>): ApiError {
  const { code, solutions } = classifyPrintFailure(rawMessage)
  return {
    ok: false,
    message: rawMessage,
    code,
    solutions,
    ...extra,
  }
}

/** 打印吊牌：Agent 异常时自动重启并重试一次 */
export async function printBraceletTagWithRecovery(
  payload: PrintBraceletPayload,
): Promise<{ ok: true; message: string; recovered?: boolean } | ApiError> {
  if (!(await pingPrintAgent(2500))) {
    const recovery = await recoverPrintAgent('pre-print-health-check')
    if (!recovery.ok) {
      return printFailureResponse(
        `打印 Agent 无响应，自动重启失败：${recovery.message}`,
      )
    }
  }

  try {
    let result = await callPrintAgent(payload, 55_000)
    let recovered = false

    if (!result.ok && isAgentUnavailable(result.message, result.agentStatus)) {
      const recovery = await recoverPrintAgent(`print-failed: ${result.message}`)
      if (recovery.ok) {
        recovered = true
        result = await callPrintAgent(payload, 55_000)
      }
    }

    if (result.ok) {
      return {
        ok: true,
        message: recovered ? `${result.message}（已自动重启打印服务）` : result.message,
        recovered,
      }
    }

    return printFailureResponse(result.message)
  } catch (e) {
    const raw = e instanceof Error ? e.message : String(e)
    const recovery = await recoverPrintAgent(`print-exception: ${raw}`)
    if (recovery.ok) {
      try {
        const retry = await callPrintAgent(payload, 55_000)
        if (retry.ok) {
          return {
            ok: true,
            message: `${retry.message}（已自动重启打印服务）`,
            recovered: true,
          }
        }
        return printFailureResponse(retry.message)
      } catch (retryErr) {
        const retryRaw = retryErr instanceof Error ? retryErr.message : String(retryErr)
        return printFailureResponse(retryRaw)
      }
    }
    return printFailureResponse(`打印 Agent 不可用: ${raw}`)
  }
}

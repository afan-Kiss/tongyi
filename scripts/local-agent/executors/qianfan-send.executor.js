/**
 * 千帆发送任务执行器 — 调用千帆机器人本地 API (9323)
 */
const QIANFAN_API = (process.env.QIANFAN_LOCAL_API_URL || 'http://127.0.0.1:9323').replace(/\/$/, '')
const TIMEOUT_MS = 120_000

async function fetchJson(pathname, init = {}) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS)
  try {
    const res = await fetch(`${QIANFAN_API}${pathname}`, { ...init, signal: controller.signal })
    const data = await res.json().catch(() => ({}))
    if (!res.ok) {
      const err = new Error(data.error || data.message || `HTTP ${res.status}`)
      err.code = data.code || (res.status === 404 ? 'qianfan_not_running' : 'network_error')
      throw err
    }
    return data
  } catch (err) {
    if (err.name === 'AbortError') {
      const e = new Error('千帆本地 API 超时')
      e.code = 'local_api_timeout'
      throw e
    }
    if (err.code === 'ECONNREFUSED' || String(err.message).includes('fetch failed')) {
      const e = new Error('千帆机器人未运行')
      e.code = 'qianfan_not_running'
      throw e
    }
    throw err
  } finally {
    clearTimeout(timer)
  }
}

async function ensureQianfanReady() {
  try {
    await fetchJson('/health')
  } catch (err) {
    if (err.code === 'qianfan_not_running') throw err
    // /health 不存在时尝试 /ready
    try {
      await fetchJson('/ready')
    } catch (e) {
      throw err
    }
  }
}

function validateTarget(payload) {
  const lock = payload.targetLock || {}
  if (!payload.appCid?.trim() && !lock.appCid?.trim()) {
    const e = new Error('缺少 appCid')
    e.code = 'missing_appCid'
    throw e
  }
  const uids = payload.receiverAppUids || lock.receiverAppUids || []
  if (!Array.isArray(uids) || !uids.length) {
    const e = new Error('缺少 receiverAppUids')
    e.code = 'missing_receiverAppUids'
    throw e
  }
  if (!payload.buyerNick?.trim()) {
    const e = new Error('缺少 buyerNick')
    e.code = 'missing_buyerNick'
    throw e
  }
  if (!payload.shopTitle?.trim()) {
    const e = new Error('缺少 shopTitle')
    e.code = 'missing_shopTitle'
    throw e
  }
}

function buildSendBody(payload, type) {
  validateTarget(payload)
  const lock = payload.targetLock || {}
  return {
    type,
    shopTitle: payload.shopTitle || lock.shopTitle,
    buyerNick: payload.buyerNick || lock.buyerNick,
    appCid: payload.appCid || lock.appCid,
    receiverAppUids: payload.receiverAppUids || lock.receiverAppUids,
    replyId: payload.replyId ?? lock.replyId,
    text: payload.text,
    imagePath: payload.imageLocalPath,
    imageUrl: payload.imageUrl,
    orderId: payload.replyId ? String(payload.replyId) : '',
  }
}

function mapSendResult(data) {
  if (data.ok === false || data.error) {
    const msg = String(data.error || data.message || '发送失败')
    const e = new Error(msg)
    if (/target|不匹配|mismatch/i.test(msg)) e.code = 'target_mismatch'
    else if (/ack|确认/i.test(msg)) e.code = 'ack_timeout'
    else if (/websocket|ws/i.test(msg)) e.code = 'ws_not_ready'
    else if (/cdp|devtools/i.test(msg)) e.code = 'cdp_not_ready'
    else e.code = 'network_error'
    throw e
  }
  const ackMsgId = data.ackMsgId || data.msgId || data.receipt?.msgId
  const qianfanMsgId = data.qianfanMsgId || data.messageId || data.receipt?.messageId
  if (!ackMsgId && !qianfanMsgId && !data.sent) {
    const e = new Error('千帆未返回发送确认')
    e.code = 'ack_timeout'
    throw e
  }
  return {
    ackMsgId: ackMsgId || null,
    qianfanMsgId: qianfanMsgId || null,
    sentAt: new Date().toISOString(),
    raw: data,
  }
}

async function executeSendText(payload) {
  await ensureQianfanReady()
  const body = buildSendBody(payload, 'send_text')
  const data = await fetchJson('/send', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  return mapSendResult(data)
}

async function executeSendImage(payload) {
  await ensureQianfanReady()
  const body = buildSendBody(payload, 'send_image')
  const data = await fetchJson('/send', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  return mapSendResult(data)
}

function isRetryableCode(code) {
  return ['qianfan_not_running', 'cdp_not_ready', 'ws_not_ready', 'ack_timeout', 'network_error', 'local_api_timeout'].includes(code)
}

async function executeQianfanSend(task) {
  const payload = task.payload || {}
  try {
    const result =
      task.type === 'qianfan.sendImage'
        ? await executeSendImage(payload)
        : await executeSendText(payload)
    return { status: 'success', result }
  } catch (err) {
    const code = err.code || 'network_error'
    const retryable = isRetryableCode(code)
    return {
      status: retryable ? 'retryable_failed' : 'failed',
      errorMessage: err.message,
      result: { errorCode: code },
    }
  }
}

module.exports = { executeQianfanSend }

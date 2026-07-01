import type { CreateQianfanImageJobInput, CreateQianfanTextJobInput } from './qianfanSend.types'

function requireNonEmpty(value: unknown, field: string): string {
  const s = String(value ?? '').trim()
  if (!s) throw new Error(`${field} 必填`)
  return s
}

function requireReceiverUids(value: unknown): string[] {
  if (!Array.isArray(value) || !value.length) {
    throw new Error('receiverAppUids 必填，不能只靠最近会话')
  }
  const uids = value.map((v) => String(v).trim()).filter(Boolean)
  if (!uids.length) throw new Error('receiverAppUids 不能为空')
  return uids
}

export function validateTextJobInput(input: CreateQianfanTextJobInput) {
  const shopTitle = requireNonEmpty(input.shopTitle, 'shopTitle')
  const buyerNick = requireNonEmpty(input.buyerNick, 'buyerNick')
  const appCid = requireNonEmpty(input.appCid, 'appCid')
  const receiverAppUids = requireReceiverUids(input.receiverAppUids)
  const text = requireNonEmpty(input.text, 'text')
  const source = input.source || 'manual'
  if (source === 'wechat_reply' && (input.replyId == null || input.replyId === 0)) {
    throw new Error('微信引用回复必须带 replyId')
  }
  return { shopTitle, buyerNick, appCid, receiverAppUids, text, source, replyId: input.replyId ?? null }
}

export function validateImageJobInput(input: CreateQianfanImageJobInput) {
  const shopTitle = requireNonEmpty(input.shopTitle, 'shopTitle')
  const buyerNick = requireNonEmpty(input.buyerNick, 'buyerNick')
  const appCid = requireNonEmpty(input.appCid, 'appCid')
  const receiverAppUids = requireReceiverUids(input.receiverAppUids)
  const imageUrl = String(input.imageUrl || '').trim()
  const imageLocalPath = String(input.imageLocalPath || '').trim()
  if (!imageUrl && !imageLocalPath) throw new Error('imageUrl 或 imageLocalPath 必填其一')
  const source = input.source || 'manual'
  if (source === 'wechat_reply' && (input.replyId == null || input.replyId === 0)) {
    throw new Error('微信引用回复必须带 replyId')
  }
  return {
    shopTitle,
    buyerNick,
    appCid,
    receiverAppUids,
    imageUrl: imageUrl || null,
    imageLocalPath: imageLocalPath || null,
    mediaId: input.mediaId || null,
    source,
    replyId: input.replyId ?? null,
  }
}

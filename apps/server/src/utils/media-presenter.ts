import { mediaPublicUrl } from '../adapters/media/media-store.adapter'

type MediaRow = {
  path: string
  thumbPath?: string | null
  type: string
  mimeType?: string | null
}

export function presentMediaAsset<T extends MediaRow>(asset: T) {
  return {
    ...asset,
    url: mediaPublicUrl(asset.path),
    thumbUrl: asset.thumbPath ? mediaPublicUrl(asset.thumbPath) : mediaPublicUrl(asset.path),
  }
}

/** 对外只暴露内部详细说明，隐藏已废弃的 detail 列 */
export function presentBraceletDetail<T extends Record<string, unknown> | null | undefined>(detail: T) {
  if (!detail) return detail
  const description = typeof detail.description === 'string' ? detail.description : ''
  if (!description.trim()) return null
  return { description }
}

export function presentBracelet<T extends { mediaAssets?: MediaRow[]; detail?: Record<string, unknown> | null }>(
  bracelet: T,
) {
  return {
    ...bracelet,
    detail: presentBraceletDetail(bracelet.detail),
    mediaAssets: (bracelet.mediaAssets || []).map(presentMediaAsset),
  }
}

import path from 'node:path'
import fs from 'node:fs'
import { mediaPublicUrl } from '../adapters/media/media-store.adapter'
import { getDataDir } from '../config/env'

type MediaRow = {
  path: string
  thumbPath?: string | null
  type: string
  mimeType?: string | null
}

function mediaFileExists(relPath: string): boolean {
  return fs.existsSync(path.join(getDataDir(), relPath.replace(/\\/g, '/')))
}

export function presentMediaAsset<T extends MediaRow>(asset: T) {
  const thumbOk = asset.thumbPath ? mediaFileExists(asset.thumbPath) : false
  const thumbServePath = thumbOk ? asset.thumbPath! : asset.path
  return {
    ...asset,
    url: mediaPublicUrl(asset.path),
    thumbUrl: mediaPublicUrl(thumbServePath),
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

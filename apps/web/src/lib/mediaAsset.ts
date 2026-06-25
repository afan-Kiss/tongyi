import type { MediaAsset } from '@/api/types'

function encodeMediaPath(relPath: string): string {
  return relPath.split('/').map((seg) => encodeURIComponent(seg)).join('/')
}

export function mediaAssetUrl(asset: MediaAsset): string {
  if (asset.path) return `/api/v1/media/file/${encodeMediaPath(asset.path)}`
  if (asset.url) return asset.url
  return ''
}

export function mediaThumbUrl(asset: MediaAsset): string {
  if (asset.thumbUrl) return asset.thumbUrl
  if (asset.thumbPath) return `/api/v1/media/file/${encodeMediaPath(asset.thumbPath)}`
  return mediaAssetUrl(asset)
}

export function isPhotoAsset(asset: MediaAsset): boolean {
  return asset.type === 'photo' || (asset.mimeType?.startsWith('image/') ?? false)
}

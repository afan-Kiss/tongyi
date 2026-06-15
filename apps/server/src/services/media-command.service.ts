import fs from 'node:fs'
import path from 'node:path'
import { getDataDir } from '../config/env'
import { prisma } from '../lib/prisma'

function resolveAssetPath(relPath: string): string {
  return path.join(getDataDir(), relPath)
}

export async function deleteMediaAsset(assetId: string) {
  const asset = await prisma.mediaAsset.findUnique({ where: { id: assetId } })
  if (!asset) return null

  await prisma.mediaAsset.delete({ where: { id: assetId } })

  for (const rel of [asset.path, asset.thumbPath]) {
    if (!rel) continue
    try {
      const full = resolveAssetPath(rel)
      if (fs.existsSync(full)) fs.unlinkSync(full)
    } catch {
      /* 磁盘清理失败不影响删除记录 */
    }
  }

  return asset
}

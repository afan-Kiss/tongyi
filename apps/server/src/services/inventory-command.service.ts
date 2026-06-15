import fs from 'node:fs'
import path from 'node:path'
import { getMediaDir } from '../config/env'
import { normalizeCertNo } from '../domain/inventory.rules'
import { braceletRepo } from '../repositories/bracelet.repository'

export async function deleteBraceletByCert(certNo: string) {
  const code = normalizeCertNo(certNo)
  const bracelet = await braceletRepo.findByCert(code)
  if (!bracelet) return null

  await braceletRepo.delete(bracelet.id)

  const mediaDir = path.join(getMediaDir(), code)
  try {
    fs.rmSync(mediaDir, { recursive: true, force: true })
  } catch {
    /* 磁盘文件清理失败不影响删除记录 */
  }

  return bracelet
}

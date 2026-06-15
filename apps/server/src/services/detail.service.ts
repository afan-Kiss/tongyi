import { detailRepo, type BraceletDetailInput } from '../repositories/detail.repository'
import { braceletRepo } from '../repositories/bracelet.repository'
import { normalizeCertNo } from '../domain/inventory.rules'

export async function getDetailByCertNo(certNo: string) {
  const bracelet = await braceletRepo.findByCert(certNo)
  if (!bracelet) return null
  if (!bracelet.detail) {
    const detail = await ensureDetailRecord(bracelet.id)
    return { ...bracelet, detail }
  }
  return bracelet
}

export async function saveDetailByCertNo(certNo: string, input: BraceletDetailInput) {
  const code = normalizeCertNo(certNo)
  const bracelet = await braceletRepo.findByCert(code)
  if (!bracelet) return { ok: false as const, message: `编号 ${code} 不存在` }

  const detail = await detailRepo.upsert(bracelet.id, input)
  return { ok: true as const, detail, braceletId: bracelet.id }
}

export async function ensureDetailRecord(braceletId: string) {
  const existing = await detailRepo.findByBraceletId(braceletId)
  if (existing) return existing
  return detailRepo.createEmpty(braceletId)
}

import { Router } from 'express'
import { normalizeCertNo } from '../../domain/inventory.rules'
import { allocateNextCertNo } from '../../services/cert-no.service'
import {
  executeInbound,
  executeNewInbound,
  executeOutbound,
  executeRegisterBracelet,
  executeRevert,
  executeRetryExcel,
  getExcelRowPreview,
  getExcelSnapshot,
} from '../../services/operation.service'
import { sendErr, sendOk } from '../../utils/api-response'

export const operationsRouter = Router()

operationsRouter.get('/next-cert-no', async (req, res) => {
  try {
    const prefix = typeof req.query.prefix === 'string' ? req.query.prefix : undefined
    const data = await allocateNextCertNo(prefix)
    sendOk(res, data)
  } catch (e) {
    sendErr(res, e instanceof Error ? e.message : String(e), 400)
  }
})

operationsRouter.post('/outbound', async (req, res) => {
  const result = await executeOutbound(req.body)
  if (!result.ok) return sendErr(res, result.message)
  sendOk(res, result)
})

operationsRouter.post('/inbound', async (req, res) => {
  const result = await executeInbound(req.body)
  if (!result.ok) return sendErr(res, result.message)
  sendOk(res, result)
})

operationsRouter.post('/new', async (req, res) => {
  const certNo = normalizeCertNo(req.body.certNo || '')
  const result = await executeNewInbound({ ...req.body, certNo })
  if (!result.ok) return sendErr(res, result.message)
  sendOk(res, result)
})

operationsRouter.get('/excel-row/:certNo', async (req, res) => {
  const result = await getExcelRowPreview(req.params.certNo)
  if (!result.ok) return sendErr(res, result.message, 404)
  sendOk(res, result.data)
})

operationsRouter.post('/register', async (req, res) => {
  const certNo = normalizeCertNo(req.body.certNo || '')
  const result = await executeRegisterBracelet({ ...req.body, certNo })
  if (!result.ok) return sendErr(res, result.message)
  sendOk(res, result)
})

operationsRouter.post('/revert/:logId', async (req, res) => {
  const result = await executeRevert(req.params.logId)
  if (!result.ok) return sendErr(res, result.message)
  sendOk(res, result, result.message)
})

operationsRouter.post('/retry-excel/:logId', async (req, res) => {
  const result = await executeRetryExcel(req.params.logId)
  if (!result.ok) return sendErr(res, result.message)
  sendOk(res, result)
})

operationsRouter.get('/excel-snapshot/:certNo', async (req, res) => {
  const refresh = req.query.refresh === '1' || req.query.refresh === 'true'
  const result = await getExcelSnapshot(req.params.certNo, { refresh })
  if (!result.ok) return sendErr(res, result.message, 502)
  sendOk(res, result)
})

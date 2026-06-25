import { Router } from 'express'
import { deleteBraceletByCert } from '../../services/inventory-command.service'
import { importBraceletFromExcelOnQuery } from '../../services/excel-query-import.service'
import {
  findBraceletInDb,
  queryByScanCode,
  queryDashboard,
  queryList,
} from '../../services/inventory-query.service'
import { updateBraceletByCert } from '../../services/bracelet-update.service'
import { sendErr, sendOk } from '../../utils/api-response'

export const inventoryRouter = Router()

inventoryRouter.get('/stats', async (_req, res) => {
  sendOk(res, await queryDashboard())
})

inventoryRouter.get('/', async (req, res) => {
  const filter = String(req.query.filter || '')
  sendOk(res, await queryList({
    q: String(req.query.q || ''),
    inStockOnly: filter === 'inStock' || req.query.inStockOnly === '1',
    outStockOnly: filter === 'outStock',
    todayOp: filter === 'todayInbound' ? 'inbound' : filter === 'todayOutbound' ? 'outbound' : undefined,
    page: Number(req.query.page || 1),
    pageSize: Number(req.query.pageSize || 50),
  }))
})

inventoryRouter.get('/by-cert/:certNo', async (req, res) => {
  const bracelet = await findBraceletInDb(req.params.certNo)
  if (!bracelet) return sendErr(res, `未找到编号或条形码 ${req.params.certNo}`, 404)
  sendOk(res, bracelet)
})

inventoryRouter.get('/by-scan/:code', async (req, res) => {
  const includeList = req.query.includeList === '1' || req.query.includeList === 'true'
  const importFromExcel = req.query.importFromExcel === '1' || req.query.importFromExcel === 'true'
  let items = await queryByScanCode(req.params.code, { includeList })
  let importedFromExcel = false
  let excelSource: 'cache' | 'live' | null = null
  let needsPhoto = false

  if (!items.length && importFromExcel) {
    const imported = await importBraceletFromExcelOnQuery(req.params.code)
    if (imported) {
      const refetched = await findBraceletInDb(imported.certNo)
      if (refetched) items = [refetched]
      importedFromExcel = imported.imported
      excelSource = imported.fromCache ? 'cache' : 'live'
      needsPhoto = imported.needsPhoto
    }
  }

  if (!items.length) {
    return sendErr(res, `未找到编号或条形码 ${req.params.code}（系统与 Excel 均无匹配）`, 404)
  }
  sendOk(res, {
    items,
    importedFromExcel,
    excelSource,
    needsPhoto,
  })
})

inventoryRouter.patch('/by-cert/:certNo', async (req, res) => {
  const result = await updateBraceletByCert(req.params.certNo, req.body)
  if (!result.ok) return sendErr(res, result.message)
  sendOk(res, result)
})

inventoryRouter.delete('/by-cert/:certNo', async (req, res) => {
  const deleted = await deleteBraceletByCert(req.params.certNo)
  if (!deleted) return sendErr(res, `编号 ${req.params.certNo} 不存在`, 404)
  sendOk(res, { certNo: deleted.certNo })
})

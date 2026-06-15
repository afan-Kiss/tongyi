import { Router } from 'express'
import { getDetailByCertNo, saveDetailByCertNo } from '../../services/detail.service'
import { sendErr, sendOk } from '../../utils/api-response'

export const detailRouter = Router()

/** 获取手镯完整信息（基础字段 + SQL扩展详情 + 图片视频） */
detailRouter.get('/:certNo', async (req, res) => {
  const data = await getDetailByCertNo(req.params.certNo)
  if (!data) return sendErr(res, `编号 ${req.params.certNo} 不存在`, 404)
  sendOk(res, data)
})

/** 更新 SQL 扩展详情（不写 Excel） */
detailRouter.put('/:certNo', async (req, res) => {
  const result = await saveDetailByCertNo(req.params.certNo, req.body)
  if (!result.ok) return sendErr(res, result.message)
  sendOk(res, result)
})

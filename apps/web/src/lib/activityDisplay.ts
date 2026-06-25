import type { UserActivityLogRow } from '@/lib/userActivity'

const PAGE_LABELS: Record<string, string> = {
  '/inventory': '经营总览',
  '/inventory/scan': '扫码出入库',
  '/inventory/stock': '库存列表',
  '/inventory/inbound': '标签入库',
  '/inventory/settings': '系统设置',
  '/inventory/audit': '操作日志',
  '/inventory/mobile-camera': '手机拍照',
  '/xiangyu': '祥钰系统',
  '/login': '登录页',
}

export function pathToPageLabel(path?: string | null): string {
  if (!path) return '未知页面'
  const full = path.trim()
  const pathname = full.split('?')[0]
  if (PAGE_LABELS[pathname]) return PAGE_LABELS[pathname]
  if (pathname === '/inventory/inbound') {
    if (full.includes('type=return')) return '退货入库'
    if (full.includes('type=register')) return '标签入库'
    return '入库登记'
  }
  if (pathname.startsWith('/inventory/stock')) return '库存列表'
  return pathname.replace(/^\/inventory\/?/, '') || pathname
}

export function formatDurationMs(ms: number): string {
  const n = Math.max(0, Math.round(ms))
  if (n < 1000) return '不足 1 秒'
  const sec = Math.floor(n / 1000)
  if (sec < 60) return `${sec} 秒`
  const min = Math.floor(sec / 60)
  const remSec = sec % 60
  if (min < 60) {
    return remSec > 0 ? `${min} 分 ${remSec} 秒` : `${min} 分钟`
  }
  const hour = Math.floor(min / 60)
  const remMin = min % 60
  return remMin > 0 ? `${hour} 小时 ${remMin} 分钟` : `${hour} 小时`
}

function normalizeApiPath(path?: string | null, action?: string): { method: string; apiPath: string } {
  const fromDetail = action?.match(/^(GET|POST|PUT|PATCH|DELETE)\s+(\S+)/)
  if (fromDetail) {
    return { method: fromDetail[1], apiPath: fromDetail[2].replace(/\s→.*$/, '') }
  }
  const p = (path || '').replace(/^\/api\/v1/, '') || '/'
  return { method: 'GET', apiPath: p }
}

function describeApiCall(method: string, apiPath: string): string {
  const p = apiPath.split('?')[0]

  if (p === '/auth/login' && method === 'POST') return '登录系统'
  if (p === '/auth/logout') return '退出登录'
  if (p === '/operations/outbound' && method === 'POST') return '提交出库'
  if (p === '/operations/inbound' && method === 'POST') return '提交入库 / 恢复在库'
  if (p === '/operations/register' && method === 'POST') return '登记新品入库'
  if (p === '/operations/new' && method === 'POST') return '新品入库'
  if (p.startsWith('/operations/revert/')) return '撤销操作'
  if (p.startsWith('/operations/retry-excel/')) return '重试 Excel 同步'
  if (p.startsWith('/operations/excel-snapshot/')) {
    return `加载 Excel 截图（${decodeCert(p.split('/').pop() || '')}）`
  }
  if (p.startsWith('/operations/excel-row/')) {
    return `读取 Excel 行（${decodeCert(p.split('/').pop() || '')}）`
  }
  if (p.startsWith('/inventory/by-cert/')) {
    return method === 'PUT' || method === 'PATCH'
      ? `修改商品 ${decodeCert(p.split('/').pop() || '')}`
      : `查看商品 ${decodeCert(p.split('/').pop() || '')}`
  }
  if (p.startsWith('/inventory/by-scan/')) return '扫码查询商品'
  if (p === '/inventory/stats') return '刷新统计数据'
  if (p === '/inventory' || p === '/inventory/') return '查询库存列表'
  if (p === '/media/upload') return '上传照片或视频'
  if (p.startsWith('/media/file/')) return '查看图片文件'
  if (p.startsWith('/media/') && method === 'DELETE') return '删除媒体文件'
  if (p === '/settings' && method === 'PUT') return '保存系统设置'
  if (p === '/settings') return '读取系统设置'
  if (p === '/settings/label-template' && method === 'PUT') return '保存吊牌模板'
  if (p.startsWith('/print/bracelet-tag')) return '打印吊牌'
  if (p.startsWith('/print/label')) return '打印标签'
  if (p === '/excel/import') return '导入 Excel'
  if (p === '/excel/export') return '导出 Excel'

  if (method === 'PUT' || method === 'PATCH') return `修改数据（${p}）`
  if (method === 'POST') return `提交数据（${p}）`
  if (method === 'DELETE') return `删除数据（${p}）`
  return `请求 ${method} ${p}`
}

function decodeCert(matched: string): string {
  const part = matched.split('/').pop() || ''
  try {
    return decodeURIComponent(part)
  } catch {
    return part
  }
}

/** 列表主列：给用户看的操作说明 */
export function formatActivitySummary(row: UserActivityLogRow): string {
  const detail = row.detail || {}

  if (row.category === 'auth') {
    if (row.action === 'login_success') return '登录成功'
    if (row.action === 'logout') return '退出登录'
    if (row.action === 'login_failed') {
      const who = detail.attemptedUsername ? `（账号 ${detail.attemptedUsername}）` : ''
      return `登录失败${who}`
    }
    return '登录相关操作'
  }

  if (row.category === 'navigation') {
    const page = pathToPageLabel(row.path)
    if (row.action === 'page_stay') {
      const ms = Number(detail.durationMs)
      if (Number.isFinite(ms) && ms > 0) {
        return `在「${page}」停留 ${formatDurationMs(ms)}`
      }
      return `离开「${page}」`
    }
    if (row.action === 'page_view') return `打开「${page}」`
    return `浏览「${page}」`
  }

  if (row.category === 'click') {
    const page = pathToPageLabel(row.path)
    const target = String(detail.text || detail.label || '').trim()
    if (target) return `在「${page}」点击「${target}」`
    return `在「${page}」点击页面按钮`
  }

  if (row.category === 'api') {
    const { method, apiPath } = normalizeApiPath(row.path, row.action)
    const label = describeApiCall(method, apiPath)
    const status = detail.status
    if (status != null && Number(status) >= 400) {
      return `${label}（失败 ${status}）`
    }
    return label
  }

  if (row.category === 'action') {
    const text = detail.text ?? detail.label
    if (text) return String(text)
  }

  return row.action || '其他操作'
}

/** 详情面板：技术字段 */
export function formatActivityTechnical(row: UserActivityLogRow): Record<string, unknown> {
  const detail = row.detail || {}
  const base: Record<string, unknown> = {
    类型: row.category,
    动作代码: row.action,
    页面路径: row.path,
    IP: row.ip,
    浏览器: row.userAgent,
  }

  if (row.category === 'navigation' && detail.durationMs != null) {
    base.停留毫秒 = detail.durationMs
  }

  if (row.category === 'api') {
    const { method, apiPath } = normalizeApiPath(row.path, row.action)
    base.请求方法 = method
    base.接口路径 = apiPath
    if (detail.status != null) base.状态码 = detail.status
    if (detail.query && Object.keys(detail.query as object).length) base.查询参数 = detail.query
  }

  if (row.category === 'click') {
    if (detail.tag) base.元素 = detail.tag
    if (detail.href) base.链接 = detail.href
    if (detail.id) base.元素ID = detail.id
  }

  if (Object.keys(detail).length) {
    base.原始详情 = detail
  }

  return base
}

/** 与 cert-no.rules / certSearch 一致的货号前缀 */

const CERT_PREFIXES = [

  'DA', 'DB', 'DC', 'DD', 'DE', 'DF', 'DG', 'DH', 'DI', 'DK', 'DL', 'DM', 'DN', 'DP', 'DQ', 'DR', 'DW',

  'ZF', 'ZQ', 'ZX', 'ZL', 'F', 'D',

] as const



/** 小红书订单号 / 售后单号 */

function looksLikeXhsOrderToken(code: string): boolean {

  const s = code.trim().toUpperCase()

  return /^P\d{6,}$/.test(s) || /^R\d{4,}$/.test(s)

}



/** 完整快递单号（完整单号，与服务端 looksLikeLogisticsQuery 对齐） */

function looksLikeExpressToken(code: string): boolean {

  const s = code.trim().toUpperCase()

  if (s.length < 8) return false

  if (/^P\d{10,}$/.test(s)) return false

  if (/^(SF|YT|YD|JD|EMS|ZTO|YTO|STO|HTKY|DBL|HHTT|UC|QFKD|ANE|ZJS|JT|FW|LB|DN)[A-Z0-9-]+$/.test(s)) {

    return true

  }

  return /^[A-Z0-9-]{10,24}$/.test(s)

}



/** 货号编号（含前缀片段，如 DA、DA00114、ZL000249） */

export function looksLikeCertScanInput(code: string): boolean {

  const s = code.trim().toUpperCase()

  if (!s || looksLikeXhsOrderToken(s) || looksLikeExpressToken(s)) return false



  for (const prefix of CERT_PREFIXES) {

    if (!s.startsWith(prefix)) continue

    const rest = s.slice(prefix.length)

    if (rest === '' || /^\d+$/.test(rest)) return true

  }



  if (/^[A-Z]{1,2}$/.test(s) && CERT_PREFIXES.some((p) => p.startsWith(s))) return true



  // 其它字母+数字货号（如 ZL000249）

  if (/^[A-Z]{1,3}\d+$/.test(s)) return true



  return false

}



/**

 * 吊牌条形码：8–20 位纯数字，或带前导零的 6–20 位（如 02229055）

 */

export function looksLikeBarcodeScanInput(code: string): boolean {

  const s = code.trim()

  if (/^\d{8,20}$/.test(s)) return true

  if (/^0\d{5,19}$/.test(s)) return true

  return false

}



/** 完整订单/物流单号，可精确查订单（不支持片段、地址、昵称） */

export function looksLikeExactOrderSearchInput(code: string): boolean {

  const s = code.trim()

  if (!s) return false

  return looksLikeXhsOrderToken(s) || looksLikeExpressToken(s)

}



/** 应先查库存（货号 / 条码） */

export function shouldTryInventoryScan(code: string): boolean {

  return looksLikeCertScanInput(code) || looksLikeBarcodeScanInput(code)

}



/** 库存未命中后是否改查订单（完整单号 / 物流单号） */

export function shouldFallbackToOrderSearch(code: string): boolean {

  if (looksLikeCertScanInput(code)) return false

  if (looksLikeExactOrderSearchInput(code)) return true

  if (looksLikeBarcodeScanInput(code) && looksLikeExpressToken(code)) return true

  return false

}



/** 直接走查订单（不经库存，须完整单号） */

export function shouldRouteDirectToOrderSearch(code: string): boolean {

  const s = code.trim()

  if (!s) return false

  if (shouldTryInventoryScan(s)) return false

  return looksLikeExactOrderSearchInput(s)

}



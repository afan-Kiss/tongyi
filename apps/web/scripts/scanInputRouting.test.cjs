/**
 * 扫码路由单元测试 — 运行: node apps/web/scripts/scanInputRouting.test.cjs
 */
const assert = require('assert')

const CERT_PREFIXES = [
  'DA', 'DB', 'DC', 'DD', 'DE', 'DF', 'DG', 'DH', 'DI', 'DK', 'DL', 'DM', 'DN', 'DP', 'DQ', 'DR', 'DW',
  'ZF', 'ZQ', 'ZX', 'ZL', 'F', 'D',
]

function looksLikeXhsOrderToken(code) {
  const s = code.trim().toUpperCase()
  return /^P\d{6,}$/.test(s) || /^R\d{4,}$/.test(s)
}

function looksLikeExpressToken(code) {
  const s = code.trim().toUpperCase()
  if (s.length < 8) return false
  return /^(SF|YT|YD|JD|EMS|ZTO|YTO|STO|HTKY|DBL|HHTT|UC|QFKD|ANE|ZJS|JT|FW|LB|DN)[A-Z0-9-]+$/.test(s)
}

function looksLikeCertScanInput(code) {
  const s = code.trim().toUpperCase()
  if (!s || looksLikeXhsOrderToken(s) || looksLikeExpressToken(s)) return false
  for (const prefix of CERT_PREFIXES) {
    if (!s.startsWith(prefix)) continue
    const rest = s.slice(prefix.length)
    if (rest === '' || /^\d+$/.test(rest)) return true
  }
  if (/^[A-Z]{1,2}$/.test(s) && CERT_PREFIXES.some((p) => p.startsWith(s))) return true
  if (/^[A-Z]{1,3}\d+$/.test(s)) return true
  return false
}

function looksLikeBarcodeScanInput(code) {
  const s = code.trim()
  if (/^\d{8,20}$/.test(s)) return true
  if (/^0\d{5,19}$/.test(s)) return true
  return false
}

function looksLikeExactOrderSearchInput(code) {
  const s = code.trim()
  if (!s) return false
  return looksLikeXhsOrderToken(s) || looksLikeExpressToken(s)
}

function shouldTryInventoryScan(code) {
  return looksLikeCertScanInput(code) || looksLikeBarcodeScanInput(code)
}

function shouldRouteDirectToOrderSearch(code) {
  const s = code.trim()
  if (!s) return false
  if (shouldTryInventoryScan(s)) return false
  return looksLikeExactOrderSearchInput(s)
}

let passed = 0
let failed = 0

function run(name, fn) {
  try {
    fn()
    console.log(`  ✓ ${name}`)
    passed += 1
  } catch (err) {
    console.error(`  ✗ ${name}`)
    console.error(`    ${err.message}`)
    failed += 1
  }
}

console.log('scanInputRouting tests\n')

run('ZL000249 → inventory scan', () => {
  assert.strictEqual(shouldTryInventoryScan('ZL000249'), true)
  assert.strictEqual(shouldRouteDirectToOrderSearch('ZL000249'), false)
})

run('02229055 → inventory not order', () => {
  assert.strictEqual(shouldTryInventoryScan('02229055'), true)
  assert.strictEqual(shouldRouteDirectToOrderSearch('02229055'), false)
})

run('780290 fragment → not order search', () => {
  assert.strictEqual(shouldRouteDirectToOrderSearch('780290'), false)
})

run('full SF logistics → order search', () => {
  assert.strictEqual(shouldRouteDirectToOrderSearch('SF5117802909776'), true)
})

run('P order no → order search', () => {
  assert.strictEqual(shouldRouteDirectToOrderSearch('P797946048767210121'), true)
})

run('address text → not order search', () => {
  assert.strictEqual(shouldRouteDirectToOrderSearch('道颐景园小'), false)
})

console.log(`\n${passed} passed, ${failed} failed`)
if (failed > 0) process.exit(1)

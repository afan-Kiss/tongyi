/**
 * 订单精确匹配单元测试 — 运行: node apps/xiangyu/server/services/orderSearchMatch.test.js
 */
const assert = require('assert');
const {
  orderMatchesQuery,
  isExactOrderSearchQuery,
  filterOrdersByQuery,
  dedupeSearchOrders,
  normalizeOrderExpressFields,
} = require('./orderSearchMatch');

function test(name, fn) {
  try {
    fn();
    console.log(`  ✓ ${name}`);
    return true;
  } catch (err) {
    console.error(`  ✗ ${name}`);
    console.error(`    ${err.message}`);
    return false;
  }
}

let passed = 0;
let failed = 0;

function run(name, fn) {
  if (test(name, fn)) passed += 1;
  else failed += 1;
}

const sample = {
  orderNo: 'P797946048767210121',
  packageId: 'P797946048767210121',
  returnsId: 'R6721012134447912',
  shipExpressNo: 'SF5194410309423',
  returnExpressNo: 'SF5117802909776',
};

console.log('orderSearchMatch tests\n');

run('exact orderNo match', () => {
  assert.strictEqual(orderMatchesQuery(sample, 'P797946048767210121'), true);
});

run('exact returnExpressNo match', () => {
  assert.strictEqual(orderMatchesQuery(sample, 'SF5117802909776'), true);
});

run('partial logistics does not match', () => {
  assert.strictEqual(orderMatchesQuery(sample, '780290'), false);
  assert.strictEqual(orderMatchesQuery(sample, 'sf511780290'), false);
});

run('partial orderNo does not match', () => {
  assert.strictEqual(orderMatchesQuery(sample, '0129844'), false);
});

run('isExactOrderSearchQuery accepts full tokens', () => {
  assert.strictEqual(isExactOrderSearchQuery('P797946048767210121'), true);
  assert.strictEqual(isExactOrderSearchQuery('R6721012134447912'), true);
  assert.strictEqual(isExactOrderSearchQuery('SF5117802909776'), true);
});

run('isExactOrderSearchQuery rejects fragments', () => {
  assert.strictEqual(isExactOrderSearchQuery('780290'), false);
  assert.strictEqual(isExactOrderSearchQuery('道颐景园小'), false);
});

run('filterOrdersByQuery keeps exact only', () => {
  const rows = [
    sample,
    { ...sample, orderNo: 'P798012984411219551', returnExpressNo: 'SF5117802909776' },
  ];
  const out = filterOrdersByQuery(rows, 'SF5117802909776');
  assert.strictEqual(out.length, 2);
});

run('dedupe merges order page and after sales', () => {
  const orderPage = {
    shopTitle: '拾玉居',
    orderNo: 'P797942075892086221',
    packageId: 'P797942075892086221',
    shipExpressNo: 'SF5194016034245',
    statusDesc: '已签收',
    searchSource: 'order_page',
  };
  const afterSales = {
    shopTitle: '拾玉居',
    orderNo: 'P797942075892086221',
    packageId: 'P797942075892086221',
    returnsId: 'R123',
    shipExpressNo: 'SF5194016034245',
    returnExpressNo: 'SF5194016034245',
    afterSaleStatusDesc: '待商家收货',
    searchSource: 'after_sales',
  };
  const out = dedupeSearchOrders([orderPage, afterSales]);
  assert.strictEqual(out.length, 1);
  assert.strictEqual(out[0].returnsId, 'R123');
  assert.strictEqual(out[0].returnExpressNo, '');
  assert.strictEqual(out[0].shipExpressNo, 'SF5194016034245');
});

run('normalizeOrderExpressFields clears duplicate return', () => {
  const o = normalizeOrderExpressFields({
    shipExpressNo: 'SF5194016034245',
    returnExpressNo: 'SF5194016034245',
  });
  assert.strictEqual(o.returnExpressNo, '');
});

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);

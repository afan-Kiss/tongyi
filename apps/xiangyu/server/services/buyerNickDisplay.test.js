/**
 * 买家昵称展示 — 运行: node apps/xiangyu/server/services/buyerNickDisplay.test.js
 */
const assert = require('assert');
const { isMaskedBuyerNick, pickBestBuyerNick } = require('./buyerNickDisplay');
const { mergeOrderSearchRecords } = require('./orderSearchMatch');

let passed = 0;
let failed = 0;

function run(name, fn) {
  try {
    fn();
    console.log(`  ✓ ${name}`);
    passed += 1;
  } catch (err) {
    console.error(`  ✗ ${name}`);
    console.error(`    ${err.message}`);
    failed += 1;
  }
}

console.log('buyerNickDisplay tests\n');

run('detect masked nick S*', () => {
  assert.strictEqual(isMaskedBuyerNick('S*'), true);
  assert.strictEqual(isMaskedBuyerNick('AlphaChan'), false);
});

run('pickBestBuyerNick prefers full nick', () => {
  assert.strictEqual(pickBestBuyerNick('S*', 'AlphaChan'), 'AlphaChan');
  assert.strictEqual(pickBestBuyerNick('AlphaChan', 'S*'), 'AlphaChan');
});

run('merge keeps full nick when order page masked', () => {
  const merged = mergeOrderSearchRecords(
    { buyerNick: 'AlphaChan', orderNo: 'P1' },
    { buyerNick: 'S*', orderNo: 'P1' },
  );
  assert.strictEqual(merged.buyerNick, 'AlphaChan');
});

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);

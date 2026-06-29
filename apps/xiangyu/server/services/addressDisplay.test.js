/**
 * 地址展示单元测试 — 运行: node apps/xiangyu/server/services/addressDisplay.test.js
 */
const assert = require('assert');
const {
  pickBuyerReceiveAddress,
  pickSellerShipFromAddress,
  isReturnWarehouseAddress,
  sanitizeAddressForDisplay,
  mergeOrderAddressFields,
} = require('./addressDisplay');

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

const pollutedAfterSale = {
  return_address:
    '13429852441 陕西省 西安市 碑林区 长安路街道 陕西省西安市碑林区长安路街道中贸广场15号楼3单元2420',
  return_express_no: 'SF5117802909776',
  ship_express_no: 'SF5194410309423',
  send_address: '甘肃省兰州市西固区庄浪东路',
  user_address: '',
};

console.log('addressDisplay tests\n');

run('detect return warehouse 中贸广场', () => {
  assert.strictEqual(
    isReturnWarehouseAddress('陕西省西安市碑林区长安路街道中贸广场15号楼3单元2420'),
    true,
  );
});

run('polluted return_address not shown as buyer receive', () => {
  const addr = pickBuyerReceiveAddress(pollutedAfterSale);
  assert.ok(!addr || !/中贸广场/.test(addr));
});

run('seller ship-from prefers 庄浪东路', () => {
  const addr = pickSellerShipFromAddress(pollutedAfterSale);
  assert.ok(/庄浪东路/.test(addr));
  assert.ok(!/中贸广场/.test(addr));
});

run('sanitize strips noise from concatenated blob', () => {
  const raw =
    '6a1a80892300910015e858f8 7天无理由 半山水湖水绿54.5 7天无理由退货 13429852441 陕西省 西安市 碑林区 长安路街道 中贸广场15号楼3单元2420';
  const clean = sanitizeAddressForDisplay(raw);
  assert.ok(!/7天无理由/.test(clean));
  assert.ok(!/6a1a8089/.test(clean));
});

run('merge prefers order-page ship-from over after-sales warehouse', () => {
  const afterSales = {
    receiverAddress: '',
    senderAddress: '陕西省西安市碑林区中贸广场15号楼3单元2420',
  };
  const orderPage = {
    receiverAddress: '买家真实地址 北京市朝阳区',
    senderAddress: '甘肃省兰州市西固区庄浪东路',
  };
  const merged = mergeOrderAddressFields({ ...afterSales, ...orderPage }, afterSales);
  assert.ok(/庄浪东路/.test(merged.senderAddress));
  assert.ok(!/中贸广场/.test(merged.senderAddress));
  assert.ok(/朝阳区/.test(merged.receiverAddress));
});

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);

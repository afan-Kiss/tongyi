/**
 * 打包拍照端到端测试：搜索买家 → 发测试图
 * 用法: node scripts/test-pack-photo-send.js [买家昵称关键词]
 */
const BASE = process.env.XIANGYU_URL || 'http://127.0.0.1:4726';
const KEYWORD = process.argv[2] || '饭饭';

// 最小有效 JPEG (1x1 红像素)
const TEST_JPEG_B64 =
  '/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/2wBDAQkJCQwLDBgNDRgyIRwhMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjL/wAARCAABAAEDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAn/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/8QAFQEBAQAAAAAAAAAAAAAAAAAAAAX/xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oADAMBAAIRAxEAPwCwAA8A/9k=';

async function json(url, opts) {
  const res = await fetch(url, opts);
  const text = await res.text();
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    data = { raw: text };
  }
  if (!res.ok) {
    const err = new Error(data.error || data.message || `HTTP ${res.status}`);
    err.status = res.status;
    err.data = data;
    throw err;
  }
  return data;
}

function pickOrder(searchResult) {
  const items = searchResult.items || searchResult.all || [];
  if (!items.length) return null;
  return items[0];
}

function toSendOrder(o) {
  return {
    shopTitle: o.shopTitle,
    orderId: o.orderId || o.orderNo,
    buyerNick: o.buyerNick,
    buyerUserId: o.buyerUserId,
    sellerId: o.sellerId,
    packageId: o.packageId,
    appCid: o.appCid,
    receiverAppUids: o.receiverAppUids,
  };
}

async function main() {
  console.log('[1/4] bridge health');
  const health = await json(`${BASE}/api/bridge/health`);
  console.log('  ok:', health.ok, 'devtools:', health.devtoolsOk, 'pages:', health.qianfanPages);
  if (!health.ok) {
    console.error('Bridge 未就绪，无法发图');
    process.exit(1);
  }

  console.log(`[2/4] 搜索买家「${KEYWORD}」`);
  let search;
  try {
    search = await json(`${BASE}/api/orders/search?q=${encodeURIComponent(KEYWORD)}&days=30`);
  } catch (e) {
    console.error('  搜索失败:', e.message);
    if (e.data) console.error('  detail:', JSON.stringify(e.data).slice(0, 300));
    process.exit(1);
  }
  const count = (search.items || []).length;
  console.log('  命中:', count, search.message || '');
  const order = pickOrder(search);
  if (!order) {
    console.error('  未找到订单，请换关键词或确认店铺 Cookie 有效');
    process.exit(1);
  }
  console.log('  选中订单:', order.orderNo || order.orderId, '| 买家:', order.buyerNick, '| 店铺:', order.shopTitle);
  if (!order.buyerUserId && !order.appCid) {
    console.error('  订单缺少 buyerUserId，无法发送');
    process.exit(1);
  }

  console.log('[3/4] 打开会话（可选预检）');
  try {
    const session = await json(`${BASE}/api/bridge/open-session`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ order: toSendOrder(order) }),
    });
    console.log('  session ok, created:', session.created, 'appCid:', session.appCid ? 'yes' : 'no');
  } catch (e) {
    console.warn('  open-session 警告（send 会自动打开）:', e.message);
  }

  console.log('[4/4] 发送测试照片');
  const sendBody = {
    order: toSendOrder(order),
    imageBase64: `data:image/jpeg;base64,${TEST_JPEG_B64}`,
    sendPreface: true,
    prefaceText: '【系统测试】打包拍照流程验证，请忽略此消息',
  };
  const result = await json(`${BASE}/api/send`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(sendBody),
  });
  console.log('  发送结果:', JSON.stringify({
    ok: result.ok,
    delivered: result.delivered,
    msgId: result.msgId,
    message: result.message,
    preface: result.preface,
  }, null, 2));
  console.log('\n✓ 打包拍照流程走通');
}

main().catch((e) => {
  console.error('\n✗ 失败:', e.message);
  if (e.data) console.error(JSON.stringify(e.data, null, 2));
  process.exit(1);
});

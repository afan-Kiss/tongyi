const fs = require('fs');
const path = require('path');
const { ROOT } = require('../config');

const FILE = path.join(ROOT, 'data', 'sent-orders.json');
const MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;

function normalizeShopTitle(title) {
  return String(title || '')
    .replace(/-工作台\s*$/i, '')
    .trim();
}

/** 与订单列表合并键一致：店铺 + 订单号 */
function orderSentKey(order) {
  if (!order || typeof order !== 'object') return '';
  const shop = normalizeShopTitle(order.shopTitle || order.sourceAccountName || '');
  const id = String(order.orderNo || order.packageId || order.orderId || '').trim();
  if (!id) return '';
  return shop ? `${shop}::${id}` : id;
}

function readRawMap() {
  try {
    if (!fs.existsSync(FILE)) return {};
    const parsed = JSON.parse(fs.readFileSync(FILE, 'utf8'));
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

function writeRawMap(map) {
  fs.mkdirSync(path.dirname(FILE), { recursive: true });
  fs.writeFileSync(FILE, `${JSON.stringify(map, null, 2)}\n`, 'utf8');
}

function pruneMap(map) {
  const cutoff = Date.now() - MAX_AGE_MS;
  const next = {};
  for (const [key, meta] of Object.entries(map || {})) {
    if (meta && Number(meta.sentAt || 0) >= cutoff) next[key] = meta;
  }
  return next;
}

function listSentOrders() {
  return pruneMap(readRawMap());
}

function markOrderSent(order, kind = 'image') {
  const key = orderSentKey(order);
  if (!key) return null;
  const map = pruneMap(readRawMap());
  const entry = {
    sentAt: Date.now(),
    kind: String(kind || 'image'),
    orderNo: String(order.orderNo || order.orderId || order.packageId || ''),
    buyerNick: String(order.buyerNick || ''),
    shopTitle: normalizeShopTitle(order.shopTitle || order.sourceAccountName || ''),
  };
  map[key] = entry;
  writeRawMap(map);
  return { key, ...entry };
}

function isOrderSent(order) {
  const key = orderSentKey(order);
  if (!key) return false;
  const meta = listSentOrders()[key];
  return Boolean(meta);
}

module.exports = {
  orderSentKey,
  listSentOrders,
  markOrderSent,
  isOrderSent,
  SENT_ORDERS_FILE: FILE,
};

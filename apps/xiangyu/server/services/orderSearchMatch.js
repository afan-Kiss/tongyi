/** 订单精确搜索：仅匹配订单号 / 发货物流 / 退货物流（全量相等，非模糊） */

const ADDRESS_KEY_RE =
  /^(sender|send|shipper|consignor|from|receiver|receive|delivery|shipping|consignee|user|return)?_?(address|addr|detail|full|location|street|region|area|town|city|province|name|phone|mobile|tel|contact)$/i;
const EXPRESS_KEY_RE =
  /^(ship|delivery|return|express|logistics|waybill|tracking|carrier)?_?(express|logistics|waybill|tracking)?_?(no|number|code|id)?$/i;

function str(v) {
  if (v == null || v === '') return '';
  return String(v).trim();
}

function normalizeExactToken(v) {
  return str(v).toUpperCase().replace(/\s+/g, '');
}

function walkCollect(obj, keyRe, out, depth = 0) {
  if (depth > 8 || obj == null) return;
  if (typeof obj === 'string') {
    const v = str(obj);
    if (v) out.push(v);
    return;
  }
  if (Array.isArray(obj)) {
    for (const item of obj.slice(0, 60)) walkCollect(item, keyRe, out, depth + 1);
    return;
  }
  if (typeof obj !== 'object') return;
  for (const [key, val] of Object.entries(obj)) {
    if (keyRe.test(key)) {
      if (typeof val === 'string') {
        const v = str(val);
        if (v) out.push(v);
      } else if (val && typeof val === 'object') {
        walkCollect(val, () => true, out, depth + 1);
      }
    } else if (val && typeof val === 'object') {
      walkCollect(val, keyRe, out, depth + 1);
    }
  }
}

const {
  pickBuyerReceiveAddress,
  pickSellerShipFromAddress,
  mergeOrderAddressFields,
} = require('./addressDisplay');
const { pickBestBuyerNick } = require('./buyerNickDisplay');

function joinUnique(parts) {
  const seen = new Set();
  const out = [];
  for (const p of parts) {
    const v = str(p);
    if (!v || seen.has(v)) continue;
    seen.add(v);
    out.push(v);
  }
  return out.join(' ');
}

function extractReceiverAddress(pkg) {
  return pickBuyerReceiveAddress(pkg);
}

function extractSenderAddress(pkg) {
  return pickSellerShipFromAddress(pkg);
}

function extractReceiverPhone(pkg) {
  if (!pkg || typeof pkg !== 'object') return '';
  const direct = [
    pkg.receiverPhone,
    pkg.receiver_phone,
    pkg.receiverMobile,
    pkg.phone,
    pkg.mobile,
    pkg.receiverInfo?.phone,
    pkg.receiverInfo?.mobile,
    pkg.userInfo?.phone,
    pkg.addressInfo?.phone,
  ];
  const collected = [];
  walkCollect(pkg, /phone|mobile|tel/i, collected);
  return joinUnique([...direct.map(str), ...collected.filter((x) => /^\d{7,}$/.test(x.replace(/\D/g, '')))]);
}

function extractExpressNumbers(pkg) {
  if (!pkg || typeof pkg !== 'object') return { ship: '', ret: '' };
  const shipDirect = [
    pkg.expressNo,
    pkg.express_no,
    pkg.shipExpressNo,
    pkg.ship_express_no,
    pkg.logisticsNo,
    pkg.waybillNo,
    pkg.trackingNo,
    pkg.deliveryExpressNo,
    pkg.expressInfo?.expressNo,
    pkg.logisticsInfo?.expressNo,
    pkg.logistics?.expressNo,
  ];
  const retDirect = [pkg.returnExpressNo, pkg.return_express_no, pkg.returnLogisticsNo, pkg.returnWaybillNo];
  const ship = str(shipDirect.find((x) => str(x)) || '').toUpperCase();
  let ret = str(retDirect.find((x) => str(x)) || '').toUpperCase();
  if (ret && ship && ret === ship) ret = '';
  return { ship, ret };
}

function extractShipExpressNo(pkg) {
  return extractExpressNumbers(pkg).ship;
}

function extractReturnExpressNo(pkg) {
  return extractExpressNumbers(pkg).ret;
}

function looksLikePartialOrderQuery(q) {
  const s = str(q).toUpperCase();
  return /^P\d{6,}$/.test(s) || /^R\d{4,}$/.test(s);
}

function looksLikeLogisticsQuery(q) {
  const s = str(q).toUpperCase();
  if (s.length < 8) return false;
  if (/^P\d{10,}$/.test(s)) return false;
  return /^(SF|YT|YD|JD|EMS|ZTO|YTO|STO|HTKY|DBL|HHTT|UC|QFKD|ANE|ZJS|JT|FW|LB|DN)[A-Z0-9-]+$/.test(s)
    || /^[A-Z0-9-]{10,24}$/.test(s);
}

/** 是否允许发起订单/物流查询（须为完整单号，不支持片段） */
function isExactOrderSearchQuery(q) {
  const s = str(q);
  if (!s) return false;
  if (looksLikePartialOrderQuery(s)) return true;
  return looksLikeLogisticsQuery(s);
}

/** 千帆 API 关键词：仅原样查询，不做片段扩展 */
function buildSearchCandidates(q) {
  const s = str(q);
  if (!s) return [];
  const upper = s.toUpperCase();
  return s === upper ? [s] : [s, upper];
}

const EXACT_ORDER_SEARCH_FIELDS = [
  'orderNo',
  'packageId',
  'returnsId',
  'orderId',
  'shipExpressNo',
  'returnExpressNo',
];

function orderSearchFields(order) {
  return {
    orderNo: str(order.orderNo),
    packageId: str(order.packageId),
    returnsId: str(order.returnsId),
    orderId: str(order.orderId),
    shipExpressNo: str(order.shipExpressNo),
    returnExpressNo: str(order.returnExpressNo),
  };
}

function fieldEqualsQuery(fieldValue, query) {
  const fv = normalizeExactToken(fieldValue);
  const q = normalizeExactToken(query);
  if (!fv || !q) return false;
  return fv === q;
}

function orderMatchesQuery(order, query) {
  const q = str(query);
  if (!q) return false;
  const fields = orderSearchFields(order);
  for (const key of EXACT_ORDER_SEARCH_FIELDS) {
    if (fieldEqualsQuery(fields[key], q)) return true;
  }
  return false;
}

function filterOrdersByQuery(orders, query) {
  const q = str(query);
  if (!q) return orders;
  return orders.filter((o) => orderMatchesQuery(o, q));
}

function normalizeOrderExpressFields(order) {
  const ship = str(order.shipExpressNo).toUpperCase();
  let ret = str(order.returnExpressNo).toUpperCase();
  if (ret && ship && ret === ship) ret = '';
  return { ...order, shipExpressNo: ship, returnExpressNo: ret };
}

function canonicalOrderSearchKey(order) {
  const shop = str(order.shopTitle || order.sourceAccountName);
  const pkg = str(order.packageId || order.orderNo).toUpperCase();
  return `${shop}::${pkg}`;
}

/** 同一 packageId 合并为一张卡片（订单页 + 售后页） */
function mergeOrderSearchRecords(existing, incoming) {
  const merged = {
    ...existing,
    ...incoming,
    ...mergeOrderAddressFields({ ...existing, ...incoming }, existing),
    returnsId: str(incoming.returnsId) || str(existing.returnsId),
    afterSaleStatusDesc: str(incoming.afterSaleStatusDesc) || str(existing.afterSaleStatusDesc),
    afterSaleStatus: str(incoming.afterSaleStatus) || str(existing.afterSaleStatus),
    statusDesc: str(incoming.statusDesc) || str(existing.statusDesc),
    status: str(incoming.status) || str(existing.status),
    shipExpressNo: str(incoming.shipExpressNo) || str(existing.shipExpressNo),
    returnExpressNo: str(incoming.returnExpressNo) || str(existing.returnExpressNo),
    buyerNick: pickBestBuyerNick(incoming.buyerNick, existing.buyerNick),
    productTitle: str(incoming.productTitle) || str(existing.productTitle),
    orderPaid: Number(incoming.orderPaid || 0) || Number(existing.orderPaid || 0),
    createdAt: Number(incoming.createdAt || 0) || Number(existing.createdAt || 0),
    searchSource: [existing.searchSource, incoming.searchSource].filter(Boolean).join('+') || incoming.searchSource,
  };
  return normalizeOrderExpressFields(merged);
}

function dedupeSearchOrders(orders) {
  const map = new Map();
  for (const order of orders) {
    const key = canonicalOrderSearchKey(order);
    if (!key.endsWith('::')) {
      const prev = map.get(key);
      map.set(key, prev ? mergeOrderSearchRecords(prev, order) : normalizeOrderExpressFields(order));
    }
  }
  return [...map.values()];
}

module.exports = {
  extractReceiverAddress,
  extractSenderAddress,
  extractReceiverPhone,
  extractShipExpressNo,
  extractReturnExpressNo,
  extractExpressNumbers,
  looksLikePartialOrderQuery,
  looksLikeLogisticsQuery,
  isExactOrderSearchQuery,
  buildSearchCandidates,
  orderSearchFields,
  fieldEqualsQuery,
  orderMatchesQuery,
  filterOrdersByQuery,
  normalizeOrderExpressFields,
  mergeOrderSearchRecords,
  dedupeSearchOrders,
  canonicalOrderSearchKey,
  mergeOrderAddressFields,
};

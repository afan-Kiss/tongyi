const TZ_OFFSET_MS = 8 * 3600000;

function parseTs(val) {
  if (val == null || val === '') return 0;
  if (typeof val === 'number') {
    return val > 1e12 ? val : val * 1000;
  }
  const s = String(val).trim();
  const n = Number(s);
  if (!Number.isNaN(n) && n > 0) return n > 1e12 ? n : n * 1000;
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{2}):(\d{2})(?::(\d{2}))?)?/);
  if (m) {
    const [, y, mo, d, h = '0', mi = '0', se = '0'] = m;
    return Date.UTC(Number(y), Number(mo) - 1, Number(d), Number(h) - 8, Number(mi), Number(se));
  }
  return 0;
}

function str(val) {
  if (val == null) return '';
  return String(val).trim();
}

function extractBuyerUserId(pkg) {
  const ui = pkg.userInfo || pkg.user_info || {};
  const fields = [pkg.userId, pkg.user_id, ui.userId, ui.user_id, ui.id, pkg.buyerId, pkg.buyer_id];
  for (const f of fields) {
    const v = str(f);
    if (v) return v;
  }
  return '';
}

function extractSellerId(pkg) {
  const si = pkg.sellerInfo || pkg.seller_info || {};
  const fields = [pkg.sellerId, pkg.seller_id, si.sellerId, si.seller_id, si.id];
  for (const f of fields) {
    const v = str(f);
    if (v) return v;
  }
  return '';
}

function buildReceiverAppUid(buyerUserId) {
  const uid = str(buyerUserId);
  if (!uid) return '';
  return `1#2#2#${uid}`;
}

function extractNickName(pkg) {
  const ui = pkg.userInfo || {};
  const bi = pkg.buyer_info || {};
  const uinfo = pkg.user_info || {};
  const fields = [
    pkg.nickName,
    pkg.nickname,
    pkg.buyerNickName,
    pkg.buyerNickname,
    pkg.buyerName,
    bi.nickName,
    bi.nickname,
    ui.nickName,
    ui.nickname,
    uinfo.nickName,
    uinfo.nickname,
  ];
  for (const f of fields) {
    const v = str(f);
    if (v) return v;
  }
  return '';
}

function orderNoAsStr(val) {
  if (val == null || val === '') return '';
  if (typeof val === 'boolean') return '';
  if (typeof val === 'number') {
    if (!Number.isFinite(val)) return '';
    if (Number.isInteger(val)) return String(val);
    return Math.abs(val) > 1e15 ? val.toFixed(0) : String(val);
  }
  return String(val).trim();
}

const P_ORDER_PATTERN = /^P\d{10,}$/i;

const ORDER_NO_FIELD_PRIORITY = [
  'orderSn',
  'order_sn',
  'orderNo',
  'order_no',
  'orderIdStr',
  'order_id_str',
  'fulfillmentOrderNo',
  'fulfillment_order_no',
  'packageOrderNo',
  'package_order_no',
  'packageId',
  'package_id',
  'orderId',
  'order_id',
  'id',
];

function scanPOrderNoInObj(obj, depth = 0) {
  if (depth > 5 || obj == null) return '';
  if (typeof obj === 'string') {
    const s = obj.trim();
    return P_ORDER_PATTERN.test(s) ? s : '';
  }
  if (Array.isArray(obj)) {
    for (const item of obj.slice(0, 30)) {
      const found = scanPOrderNoInObj(item, depth + 1);
      if (found) return found;
    }
    return '';
  }
  if (typeof obj === 'object') {
    for (const v of Object.values(obj)) {
      const found = scanPOrderNoInObj(v, depth + 1);
      if (found) return found;
    }
  }
  return '';
}

/** 解析完整小红书订单号（优先 P 开头 packageId / orderSn，避免截断的 orderId） */
function resolveOrderNo(pkg) {
  let chosen = '';
  for (const key of ORDER_NO_FIELD_PRIORITY) {
    const v = orderNoAsStr(pkg[key]);
    if (!v) continue;
    if (!chosen) chosen = v;
    if (P_ORDER_PATTERN.test(v)) {
      chosen = v;
      break;
    }
  }

  const pInRaw = scanPOrderNoInObj(pkg);
  if (pInRaw && (!chosen || !/^P/i.test(chosen))) {
    chosen = pInRaw;
  } else if (chosen && !/^P/i.test(chosen) && pInRaw && chosen !== pInRaw) {
    chosen = pInRaw;
  }

  return chosen;
}

function isExcludedPackage(pkg) {
  return String(pkg.statusDesc || '').includes('取消');
}

function firstProductTitle(pkg) {
  const skus = Array.isArray(pkg.skus) ? pkg.skus : [];
  for (const sku of skus) {
    const scskus = Array.isArray(sku.scskus) ? sku.scskus : [];
    if (scskus.length) {
      for (const sc of scskus) {
        const name = str(sc.name || sc.skuName || sku.displayName || sku.skuName);
        if (name) return name;
      }
    }
    const name = str(sku.displayName || sku.skuName);
    if (name) return name;
  }
  return '商品';
}

function firstProductImage(pkg) {
  const skus = Array.isArray(pkg.skus) ? pkg.skus : [];
  for (const sku of skus) {
    const img = str(sku.image || sku.imageUrl || sku.cover || sku.thumbUrl);
    if (img) return img.startsWith('//') ? `https:${img}` : img;
    const scskus = Array.isArray(sku.scskus) ? sku.scskus : [];
    for (const sc of scskus) {
      const scImg = str(sc.image || sc.imageUrl || sc.cover);
      if (scImg) return scImg.startsWith('//') ? `https:${scImg}` : scImg;
    }
  }
  return '';
}

function toAmount(val, fieldName = '') {
  if (val == null || val === '') return 0;
  const n = Number(String(val).replace(/,/g, ''));
  if (Number.isNaN(n)) return 0;
  const fn = (fieldName || '').toLowerCase().replace(/_/g, '');
  if (fn.includes('cent') || fn.includes('fen')) return n / 100;
  return n;
}

function extractRedDiscount(pkg) {
  for (const key of [
    'redDiscountAmount',
    'red_discount_amount',
    'redDiscount',
    'platformDiscountAmount',
    'discountAmount',
  ]) {
    if (pkg[key] != null && pkg[key] !== '') return toAmount(pkg[key], key);
  }
  return 0;
}

function totalProductPrice(pkg) {
  const skus = Array.isArray(pkg.skus) ? pkg.skus : [];
  let total = 0;
  for (const sku of skus) {
    const scskus = Array.isArray(sku.scskus) ? sku.scskus : [];
    if (scskus.length) {
      for (const sc of scskus) {
        const price = toAmount(sc.soldPrice ?? sc.price, 'soldPrice');
        const qty = Number(sc.quantity || 1) || 1;
        total += price * qty;
      }
    } else {
      const price = toAmount(sku.skuSoldPrice ?? sku.soldPrice, 'skuSoldPrice');
      const qty = Number(sku.skuQuantity || 1) || 1;
      total += price * qty;
    }
  }
  return total;
}

function formatAmount(val) {
  const n = Number(val);
  if (!n) return '';
  return `¥${n.toFixed(2)}`;
}

function extractPackagesFromResponse(body) {
  if (!body || typeof body !== 'object') return [];
  const packages = body?.data?.packages;
  if (Array.isArray(packages)) return packages.filter((x) => x && typeof x === 'object');
  return [];
}

function normalizePackage(pkg, shopTitle = '') {
  if (!pkg || isExcludedPackage(pkg)) return null;

  const orderNo = resolveOrderNo(pkg);
  const packageId = orderNoAsStr(pkg.packageId) || orderNoAsStr(pkg.package_id);
  const internalId = orderNoAsStr(pkg.orderId) || orderNoAsStr(pkg.order_id) || packageId;
  if (!orderNo && !internalId) return null;

  const nickName = extractNickName(pkg);
  const buyerUserId = extractBuyerUserId(pkg);
  const sellerId = extractSellerId(pkg);
  const receiverUid = buildReceiverAppUid(buyerUserId);
  const orderPaidNum = toAmount(pkg.actualPaid ?? pkg.totalOrderAmount, 'actualPaid');
  const productPriceNum = totalProductPrice(pkg);
  const shippingFeeNum = toAmount(pkg.shippingFee, 'shippingFee');
  const redDiscountNum = extractRedDiscount(pkg);

  return {
    orderId: internalId || orderNo,
    orderNo: orderNo || internalId,
    packageId,
    buyerNick: nickName || '买家',
    buyerName: str(pkg.userInfo?.name) || nickName,
    buyerUserId,
    sellerId,
    productTitle: firstProductTitle(pkg),
    amount: formatAmount(orderPaidNum),
    orderPaid: orderPaidNum,
    orderPaidNum,
    productPrice: productPriceNum,
    productPriceNum,
    shippingFee: shippingFeeNum,
    shippingFeeNum,
    redDiscountAmount: redDiscountNum,
    redDiscountNum,
    status: str(pkg.statusDesc || pkg.status || '待处理'),
    statusDesc: str(pkg.statusDesc || pkg.status || ''),
    afterSaleStatus: str(pkg.afterSaleStatus || ''),
    afterSaleStatusDesc: str(pkg.afterSaleStatusDesc || ''),
    createdAt: parseTs(pkg.orderedAt || pkg.paidAt || pkg.createdAt),
    imageUrl: firstProductImage(pkg),
    shopTitle,
    sourceAccountName: shopTitle,
    appCid: '',
    receiverAppUids: receiverUid ? [receiverUid] : [],
    raw: pkg,
  };
}

function normalizePackagesBatch(packages, shopTitle = '') {
  const orders = [];
  for (const pkg of packages) {
    const order = normalizePackage(pkg, shopTitle);
    if (order) orders.push(order);
  }
  return orders;
}

module.exports = {
  extractPackagesFromResponse,
  normalizePackage,
  normalizePackagesBatch,
  parseTs,
  extractBuyerUserId,
  extractSellerId,
  buildReceiverAppUid,
};

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

function resolveOrderNo(pkg) {
  const keys = [
    'orderSn',
    'order_sn',
    'orderNo',
    'order_no',
    'orderIdStr',
    'fulfillmentOrderNo',
    'packageOrderNo',
    'orderId',
    'packageId',
    'id',
  ];
  for (const key of keys) {
    const v = str(pkg[key]);
    if (v) return v;
  }
  return '';
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
  const orderId = str(pkg.orderId) || str(pkg.packageId) || orderNo;
  if (!orderNo && !orderId) return null;

  const nickName = extractNickName(pkg);
  const buyerUserId = extractBuyerUserId(pkg);
  const sellerId = extractSellerId(pkg);
  const receiverUid = buildReceiverAppUid(buyerUserId);
  const orderPaid = Number(pkg.actualPaid || pkg.totalOrderAmount || 0);

  return {
    orderId: orderNo || orderId,
    orderNo: orderNo || orderId,
    packageId: str(pkg.packageId),
    buyerNick: nickName || '买家',
    buyerName: str(pkg.userInfo?.name) || nickName,
    buyerUserId,
    sellerId,
    productTitle: firstProductTitle(pkg),
    amount: formatAmount(orderPaid),
    status: str(pkg.statusDesc || pkg.status || '待处理'),
    createdAt: parseTs(pkg.orderedAt || pkg.paidAt || pkg.createdAt),
    imageUrl: firstProductImage(pkg),
    shopTitle,
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

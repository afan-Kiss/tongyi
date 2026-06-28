/** 订单综合搜索：任意片段模糊匹配（订单号/物流/昵称/收寄件地址等） */

const ADDRESS_KEY_RE =
  /^(sender|send|shipper|consignor|from|receiver|receive|delivery|shipping|consignee|user|return)?_?(address|addr|detail|full|location|street|region|area|town|city|province|name|phone|mobile|tel|contact)$/i;
const EXPRESS_KEY_RE =
  /^(ship|delivery|return|express|logistics|waybill|tracking|carrier)?_?(express|logistics|waybill|tracking)?_?(no|number|code|id)?$/i;

function str(v) {
  if (v == null || v === '') return '';
  return String(v).trim();
}

function compactText(s) {
  return str(s).replace(/\s+/g, '').toLowerCase();
}

function digitsOnly(s) {
  return str(s).replace(/\D/g, '');
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

function collectAllStrings(obj, out, depth = 0) {
  if (depth > 10 || obj == null) return;
  if (typeof obj === 'string') {
    const v = str(obj);
    if (v.length >= 1 && v.length <= 500) out.push(v);
    return;
  }
  if (Array.isArray(obj)) {
    for (const item of obj.slice(0, 80)) collectAllStrings(item, out, depth + 1);
    return;
  }
  if (typeof obj !== 'object') return;
  for (const val of Object.values(obj)) {
    if (typeof val === 'string' || typeof val === 'object') collectAllStrings(val, out, depth + 1);
  }
}

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

function extractAddressByRole(pkg, roleRe) {
  if (!pkg || typeof pkg !== 'object') return '';
  const direct = [];
  if (roleRe.test('receiver')) {
    direct.push(
      pkg.receiverAddress,
      pkg.receiver_address,
      pkg.receiveAddress,
      pkg.consigneeAddress,
      pkg.userReceiveAddress,
      pkg.receiverInfo?.address,
      pkg.receiver_info?.address,
      pkg.receiverInfo?.fullAddress,
      pkg.addressInfo?.address,
      pkg.addressInfo?.fullAddress,
      pkg.deliveryInfo?.address,
      pkg.deliveryPackage?.address,
      pkg.userInfo?.address,
    );
  }
  if (roleRe.test('sender') || roleRe.test('send')) {
    direct.push(
      pkg.senderAddress,
      pkg.sender_address,
      pkg.sendAddress,
      pkg.shipperAddress,
      pkg.shipper_address,
      pkg.consignorAddress,
      pkg.fromAddress,
      pkg.returnAddress,
      pkg.return_address,
      pkg.senderInfo?.address,
      pkg.sender_info?.address,
      pkg.shipperInfo?.address,
      pkg.deliverySenderAddress,
    );
  }
  direct.push(pkg.fullAddress, pkg.full_address, pkg.address, pkg.detailAddress);
  const collected = [];
  walkCollect(pkg, ADDRESS_KEY_RE, collected);
  return joinUnique([...direct.map(str), ...collected]);
}

function extractReceiverAddress(pkg) {
  return extractAddressByRole(pkg, /receiver|receive|consignee|user/i);
}

function extractSenderAddress(pkg) {
  return extractAddressByRole(pkg, /sender|send|shipper|consignor|from|return/i);
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
  const collected = [];
  walkCollect(pkg, EXPRESS_KEY_RE, collected);
  const expressLike = collected.filter((v) => /^[A-Z0-9-]{4,40}$/i.test(v));
  const ship = str(shipDirect.find((x) => str(x)) || expressLike[0] || '');
  const ret = str(retDirect.find((x) => str(x)) || expressLike[1] || '');
  return { ship: ship.toUpperCase(), ret: ret.toUpperCase() };
}

function extractShipExpressNo(pkg) {
  return extractExpressNumbers(pkg).ship;
}

function extractReturnExpressNo(pkg) {
  return extractExpressNumbers(pkg).ret;
}

function looksLikeAddressQuery(q) {
  const s = str(q);
  if (/[\u4e00-\u9fff]/.test(s)) return true;
  return /(省|市|区|县|路|街|号|镇|乡|村|小区|大厦|楼|单元|室)/.test(s);
}

function looksLikePartialOrderQuery(q) {
  const s = str(q);
  return /^P?\d+$/i.test(s) || /^R?\d+$/i.test(s);
}

function looksLikeLogisticsQuery(q) {
  const s = str(q).toUpperCase();
  if (s.length < 4) return false;
  if (/^P\d{10,}$/.test(s)) return false;
  return /^[A-Z0-9-]{4,40}$/.test(s);
}

function buildSearchCandidates(q) {
  const s = str(q);
  const set = new Set();
  if (!s) return [];
  set.add(s);
  if (/^\d+$/.test(s)) {
    set.add(`P${s}`);
    if (s.length >= 4) set.add(s.slice(-8));
    if (s.length >= 3) set.add(s.slice(-6));
  }
  if (/^P?\d+$/i.test(s)) {
    const digits = digitsOnly(s);
    if (digits.length >= 3) set.add(digits.slice(-8));
  }
  if (/^R?\d+$/i.test(s)) {
    const digits = digitsOnly(s);
    if (digits) set.add(`R${digits}`);
  }
  return [...set].filter(Boolean);
}

function orderSearchHaystack(order) {
  const parts = [
    order.orderNo,
    order.orderId,
    order.packageId,
    order.returnsId,
    order.buyerNick,
    order.buyerName,
    order.receiverName,
    order.senderName,
    order.receiverPhone,
    order.receiverAddress,
    order.senderAddress,
    order.shipExpressNo,
    order.returnExpressNo,
    order.productTitle,
    order.status,
    order.statusDesc,
    order.afterSaleStatusDesc,
  ]
    .map((x) => str(x))
    .filter(Boolean);

  if (order.raw && typeof order.raw === 'object') {
    collectAllStrings(order.raw, parts);
  }
  return [...new Set(parts)];
}

function orderMatchesQuery(order, query) {
  const q = str(query);
  if (!q) return false;

  const qc = compactText(q);
  const qu = q.toUpperCase();
  const qDigits = digitsOnly(q);
  const parts = orderSearchHaystack(order);

  const hayCompact = parts.map(compactText).join('\x00');
  const hayUpper = parts.join('\x00').toUpperCase();
  const hayDigits = parts.map(digitsOnly).filter(Boolean).join('');

  if (qc && hayCompact.includes(qc)) return true;
  if (qu && hayUpper.includes(qu)) return true;
  if (qDigits && hayDigits.includes(qDigits)) return true;

  return false;
}

function filterOrdersByQuery(orders, query) {
  const q = str(query);
  if (!q) return orders;
  return orders.filter((o) => orderMatchesQuery(o, q));
}

function needsBroadLocalScan(query, items) {
  const q = str(query);
  if (!q) return false;
  if (items.length === 0) return true;
  return q.length >= 1;
}

module.exports = {
  compactText,
  extractReceiverAddress,
  extractSenderAddress,
  extractReceiverPhone,
  extractShipExpressNo,
  extractReturnExpressNo,
  extractExpressNumbers,
  looksLikeAddressQuery,
  looksLikePartialOrderQuery,
  looksLikeLogisticsQuery,
  buildSearchCandidates,
  orderSearchHaystack,
  orderMatchesQuery,
  filterOrdersByQuery,
  needsBroadLocalScan,
};

/** 订单/售后地址：展示用结构化提取（不与搜索用的全文扫描混用） */

function str(v) {
  if (v == null || v === '') return '';
  return String(v).trim();
}

/** 卖家退货仓（买家寄回地址），展示时应排除 */
const RETURN_WAREHOUSE_MARKERS = [
  '中贸广场',
  '碑林区长安路',
  '长安路街道中贸',
];

const SELLER_SHIP_KEY_NAMES = new Set([
  'send_address',
  'sender_address',
  'ship_address',
  'shipping_address',
  'delivery_sender_address',
  'seller_address',
  'origin_address',
  'warehouse_address',
  'ship_from_address',
  'from_address',
  'send_info',
  'sendinfo',
  'ship_info',
  'shipinfo',
  'sender_info',
  'senderinfo',
  'warehouse_info',
  'warehouseinfo',
  'seller_send_info',
]);

const BUYER_RECEIVE_KEY_NAMES = new Set([
  'user_address',
  'receive_address',
  'receiver_address',
  'consignee_address',
  'buyer_address',
  'to_address',
  'delivery_address',
  'user_info',
  'userinfo',
  'receiver_info',
  'receiverinfo',
  'receive_info',
  'receiveinfo',
  'consignee_info',
  'consigneeinfo',
  'buyer_info',
  'buyerinfo',
  'address_info',
  'addressinfo',
]);

const RETURN_WAREHOUSE_KEY_NAMES = new Set([
  'return_address',
  'returnaddress',
  'seller_receive_address',
  'return_info',
  'returninfo',
]);

const NOISE_RE = /7天无理由|无理由退货|[a-f0-9]{12,}/i;

const CN_ADDR_RE =
  /(?:[\u4e00-\u9fff]{2,}(?:省|自治区|特别行政区))?[\u4e00-\u9fff]{2,}(?:市|州|盟|地区)[\u4e00-\u9fff]{2,}(?:区|县|旗|市)[\u4e00-\u9fff0-9\-A-Za-z号楼单元室层商铺弄村组街道路巷]+/g;

function normalizeKeyName(key) {
  return String(key || '')
    .replace(/([A-Z])/g, '_$1')
    .toLowerCase()
    .replace(/^_/, '');
}

function isReturnWarehouseAddress(text) {
  const a = str(text);
  if (!a) return false;
  return RETURN_WAREHOUSE_MARKERS.some((m) => a.includes(m));
}

function extractChinaAddressLines(text) {
  const s = str(text);
  if (!s) return [];
  const found = [];
  for (const m of s.matchAll(CN_ADDR_RE)) {
    const line = m[0].trim();
    if (line.length < 8 || NOISE_RE.test(line)) continue;
    found.push(line);
  }
  return [...new Set(found)];
}

function dedupeAddressSegments(text) {
  const parts = str(text).split(/\s+/).filter(Boolean);
  if (parts.length < 4) return str(text);
  const out = [];
  for (let i = 0; i < parts.length; i += 1) {
    if (i >= 3) {
      const tri = parts.slice(i - 3, i).join(' ');
      const prevTri = parts.slice(i - 6, i - 3).join(' ');
      if (tri && tri === prevTri) continue;
    }
    out.push(parts[i]);
  }
  return out.join(' ');
}

function sanitizeAddressForDisplay(raw) {
  const s = str(raw);
  if (!s) return '';
  let cleaned = s;
  if (NOISE_RE.test(s) && s.length > 40) {
    const lines = extractChinaAddressLines(s);
    cleaned = lines.length ? pickBestAddressLine(lines) : '';
  } else if (/^[\u4e00-\u9fff]/.test(s) && s.length <= 100 && !NOISE_RE.test(s)) {
    cleaned = s;
  } else {
    const lines = extractChinaAddressLines(s);
    cleaned = lines.length ? pickBestAddressLine(lines) : '';
  }
  return cleaned ? dedupeAddressSegments(cleaned) : '';
}

function pickBestAddressLine(lines) {
  const list = [...lines].filter((l) => !isReturnWarehouseAddress(l));
  if (!list.length) return '';
  // 优先发货仓（兰州等），否则取最长有效地址
  const shipHint = list.find((l) => /庄浪东路|西固区|兰州市/.test(l));
  if (shipHint) return shipHint;
  return list.sort((a, b) => b.length - a.length)[0];
}

function readLeaf(obj, keys) {
  if (!obj || typeof obj !== 'object') return '';
  for (const key of keys) {
    const v = str(obj[key]);
    if (v) return v;
  }
  return '';
}

function formatAddressObject(obj) {
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return '';
  const province = readLeaf(obj, ['province', 'province_name', 'provinceName']);
  const city = readLeaf(obj, ['city', 'city_name', 'cityName']);
  const district = readLeaf(obj, ['district', 'district_name', 'districtName', 'county', 'area']);
  const street = readLeaf(obj, ['street', 'street_name', 'streetName', 'town', 'town_name', 'townName']);
  const detail = readLeaf(obj, ['detail', 'detail_address', 'detailAddress', 'address_detail', 'address', 'full_address', 'fullAddress']);
  const name = readLeaf(obj, ['name', 'receiver_name', 'receiverName', 'user_name', 'userName', 'consignee_name']);
  const phone = readLeaf(obj, ['phone', 'mobile', 'tel', 'receiver_phone', 'receiverPhone']);
  const parts = [name, phone, province, city, district, street, detail].filter(Boolean);
  return parts.join(' ').trim();
}

function deepCollectByKeyNames(obj, allowedNames, depth = 0, out = []) {
  if (depth > 8 || obj == null) return out;
  if (typeof obj === 'string') return out;
  if (Array.isArray(obj)) {
    for (const item of obj.slice(0, 40)) deepCollectByKeyNames(item, allowedNames, depth + 1, out);
    return out;
  }
  if (typeof obj !== 'object') return out;

  for (const [key, val] of Object.entries(obj)) {
    const nk = normalizeKeyName(key);
    const matched = [...allowedNames].some((n) => nk === n || nk.endsWith(`_${n}`) || nk.includes(n));
    if (matched) {
      if (typeof val === 'string') {
        const v = str(val);
        if (v) out.push(v);
      } else if (val && typeof val === 'object') {
        const formatted = formatAddressObject(val);
        if (formatted) out.push(formatted);
      }
    }
    if (val && typeof val === 'object') deepCollectByKeyNames(val, allowedNames, depth + 1, out);
  }
  return out;
}

function firstValidAddress(candidates, { excludeWarehouse = true } = {}) {
  for (const raw of candidates) {
    const clean = sanitizeAddressForDisplay(raw);
    if (!clean) continue;
    if (excludeWarehouse && isReturnWarehouseAddress(clean)) continue;
    return clean;
  }
  return '';
}

function pickBuyerReceiveAddress(item) {
  if (!item || typeof item !== 'object') return '';

  const direct = [
    item.user_address,
    item.receive_address,
    item.receiver_address,
    item.consignee_address,
    item.buyer_address,
    item.to_address,
    item.delivery_address,
  ].map(str);

  const nested = deepCollectByKeyNames(item, BUYER_RECEIVE_KEY_NAMES);
  const addr = firstValidAddress([...direct, ...nested.map(formatAddressObject), ...nested]);

  if (addr) return addr;

  // 兜底：从整段文本里提取，但排除退货仓
  const lines = extractChinaAddressLines(JSON.stringify(item));
  return pickBestAddressLine(lines.filter((l) => !isReturnWarehouseAddress(l)));
}

function pickSellerShipFromAddress(item) {
  if (!item || typeof item !== 'object') return '';

  const direct = [
    item.send_address,
    item.sender_address,
    item.ship_address,
    item.shipping_address,
    item.delivery_sender_address,
    item.seller_address,
    item.origin_address,
    item.warehouse_address,
    item.ship_from_address,
    item.from_address,
  ].map(str);

  const nested = deepCollectByKeyNames(item, SELLER_SHIP_KEY_NAMES);
  const candidates = [...direct, ...nested.map(formatAddressObject), ...nested];

  // 优先兰州发货仓
  for (const raw of candidates) {
    const lines = extractChinaAddressLines(str(raw));
    const lanzhou = lines.find((l) => /庄浪东路|西固区|兰州市/.test(l));
    if (lanzhou && !isReturnWarehouseAddress(lanzhou)) return lanzhou;
  }

  return firstValidAddress(candidates, { excludeWarehouse: true });
}

function pickReturnWarehouseAddress(item) {
  if (!item || typeof item !== 'object') return '';
  const direct = [item.return_address, item.returnAddress].map(str);
  const nested = deepCollectByKeyNames(item, RETURN_WAREHOUSE_KEY_NAMES);
  return firstValidAddress([...direct, ...nested], { excludeWarehouse: false });
}

/** 合并两条记录时优先保留更合理的展示地址 */
function preferDisplayAddress(current, incoming, { shipFrom = false } = {}) {
  const a = str(current);
  const b = str(incoming);
  if (!a) return b;
  if (!b) return a;
  if (isReturnWarehouseAddress(a) && !isReturnWarehouseAddress(b)) return b;
  if (!isReturnWarehouseAddress(a) && isReturnWarehouseAddress(b)) return a;
  if (shipFrom) {
    if (/庄浪东路|西固区|兰州市/.test(b)) return b;
    if (/庄浪东路|西固区|兰州市/.test(a)) return a;
  }
  return a.length >= b.length ? a : b;
}

function mergeOrderAddressFields(target, source) {
  if (!source) return target;
  return {
    ...target,
    receiverAddress: preferDisplayAddress(target.receiverAddress, source.receiverAddress),
    senderAddress: preferDisplayAddress(target.senderAddress, source.senderAddress, { shipFrom: true }),
    receiverPhone: str(target.receiverPhone) || str(source.receiverPhone),
    receiverName: str(target.receiverName) || str(source.receiverName),
    senderName: str(target.senderName) || str(source.senderName),
  };
}

module.exports = {
  isReturnWarehouseAddress,
  sanitizeAddressForDisplay,
  extractChinaAddressLines,
  pickBuyerReceiveAddress,
  pickSellerShipFromAddress,
  pickReturnWarehouseAddress,
  preferDisplayAddress,
  mergeOrderAddressFields,
};

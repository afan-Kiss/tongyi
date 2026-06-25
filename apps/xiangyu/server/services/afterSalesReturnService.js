/**
 * 售后退货列表 API — 支持物流单号 / 订单号关键词搜索（来自千帆 aftersale/list HAR）
 */
const { loadConfig } = require('../config');
const { listEnabledAccounts } = require('./xhsAccountImport');
const {
  signGetHeaders,
  extractAuthorizationFromCookie,
  XhsSignError,
} = require('./xhsSigner');
const { buildArkOrderDetailUrl, normalizePackageId, buildDetailServiceUrl, buildAftersaleDetailServiceUrl } = require('./arkSsoTicketService');

const AFTER_SALES_RETURNS_URL = 'https://ark.xiaohongshu.com/api/edith/after-sales/returns/v3';
const AFTER_SALE_REFERER = 'https://ark.xiaohongshu.com/app-order/aftersale/list';
const DEFAULT_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36';
const FETCH_TIMEOUT_MS = 12000;

/** 物流单号 / 快递单号 */
function isLogisticsQuery(q) {
  const s = String(q || '').trim().toUpperCase();
  if (s.length < 8) return false;
  if (/^P\d{10,}$/.test(s)) return false;
  return /^(SF|YT|YD|JD|EMS|ZTO|YTO|STO|HTKY|DBL|HHTT|UC|QFKD|ANE|ZJS|JT|FW|LB|DN)/.test(s)
    || /^[A-Z0-9]{10,24}$/.test(s);
}

function str(v) {
  if (v == null || v === '') return '';
  return String(v).trim();
}

function resolvePackageId(item) {
  let pkg = str(item.delivery_package_id);
  if (pkg) return normalizePackageId(pkg);
  const oid = str(item.order_id);
  if (oid) return normalizePackageId(oid);
  return '';
}

function buildAfterSalesSignParams(keywords, page = 1) {
  return {
    page,
    number: 20,
    keywords: String(keywords || '').trim(),
    'goods_source[]': [1, 2],
    sort: 'deadline_for_sort_v1',
    order: 'asc',
    status_in: '1,3,12',
  };
}

function buildAfterSalesRequestUrl(keywords, page = 1) {
  const kw = encodeURIComponent(String(keywords || '').trim());
  const parts = [
    `page=${page}`,
    'number=20',
    `keywords=${kw}`,
    'goods_source[]=1',
    'goods_source[]=2',
    'sort=deadline_for_sort_v1',
    'order=asc',
    'status_in=1,3,12',
  ];
  return `${AFTER_SALES_RETURNS_URL}?${parts.join('&')}`;
}

function buildAfterSalesHeaders(queryParams, cookie) {
  const auth = extractAuthorizationFromCookie(cookie);
  if (!auth) {
    throw new Error('Cookie 中未找到 ark access token，请重新复制完整 Cookie');
  }
  const signed = signGetHeaders(AFTER_SALES_RETURNS_URL, queryParams, cookie, 'seller');
  return {
    accept: 'application/json, text/plain, */*',
    origin: 'https://ark.xiaohongshu.com',
    referer: AFTER_SALE_REFERER,
    'bill-type': 'xhs',
    'user-agent': DEFAULT_UA,
    cookie,
    authorization: auth,
    ...signed,
  };
}

function normalizeAfterSaleRow(item, shopTitle, cookie) {
  const packageId = resolvePackageId(item);
  const payAmount = Number(item.pay_amount || item.applied_amount || 0);
  const applied = Number(item.applied_amount || 0);
  const skus = Array.isArray(item.skus) ? item.skus : [];
  const sku = skus[0] || {};
  const productTitle = str(sku.name_without_v || sku.sku_name || sku.name);
  const ts = Number(item.time || item.deadline_for_sort || 0);

  return {
    orderId: str(item.order_id) || packageId,
    orderNo: packageId || str(item.returns_id),
    packageId,
    returnsId: str(item.returns_id),
    buyerNick: str(item.nick_name) || '买家',
    shopTitle,
    sourceAccountName: shopTitle,
    amount: payAmount ? `¥${payAmount}` : '',
    orderPaid: payAmount,
    productPrice: applied || Number(sku.price || 0),
    shippingFee: 0,
    redDiscountAmount: 0,
    createdAt: ts > 1e12 ? ts : ts > 0 ? ts : 0,
    status: str(item.status_name),
    statusDesc: str(item.status_name),
    afterSaleStatus: str(item.return_type_name),
    afterSaleStatusDesc: [item.return_type_name, item.sub_status_name].filter(Boolean).join(' · '),
    returnExpressNo: str(item.return_express_no),
    shipExpressNo: str(item.ship_express_no),
    productTitle,
    arkDetailUrl: str(item.returns_id)
      ? buildAftersaleDetailServiceUrl(item.returns_id)
      : packageId
        ? buildDetailServiceUrl(packageId)
        : '',
    searchSource: 'after_sales',
  };
}

async function requestAfterSalesPage(account, keywords, page = 1) {
  const queryParams = buildAfterSalesSignParams(keywords, page);
  const url = buildAfterSalesRequestUrl(keywords, page);
  const headers = buildAfterSalesHeaders(queryParams, account.cookie);

  const res = await fetch(url, {
    method: 'GET',
    headers,
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  });

  const text = await res.text();
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error(`售后 API 返回非 JSON（HTTP ${res.status}）`);
  }

  if (res.status === 401 || res.status === 403) {
    throw new Error(`账号「${account.name}」Cookie 可能已过期`);
  }
  if (!res.ok) {
    throw new Error(`账号「${account.name}」请求失败 HTTP ${res.status}`);
  }

  const code = data.code;
  const success = data.success;
  const msg = String(data.msg || data.message || '');
  if (success === false || (code != null && ![0, '0', 200, '200', true].includes(code))) {
    if (/登录|cookie|鉴权|token/i.test(msg)) {
      throw new Error(`账号「${account.name}」Cookie 可能已过期`);
    }
    if (/sign|签名|风控/i.test(msg)) {
      throw new Error(`账号「${account.name}」请求签名失败`);
    }
    throw new Error(`账号「${account.name}」接口失败：${msg || code}`);
  }

  const list = data?.data?.after_sales;
  const rows = Array.isArray(list) ? list : [];
  const total = Number(data?.data?.total_count || rows.length);
  const hasMore = rows.length >= 20 && page * 20 < total;
  return { rows, hasMore, total };
}

async function searchAfterSalesForAccount(account, keywords, maxPages = 2) {
  const all = [];
  for (let page = 1; page <= maxPages; page += 1) {
    const { rows, hasMore } = await requestAfterSalesPage(account, keywords, page);
    all.push(...rows);
    if (!hasMore || !rows.length) break;
  }
  return all.map((item) => normalizeAfterSaleRow(item, account.name, account.cookie));
}

async function searchAfterSalesByKeywords(query, options = {}) {
  const q = String(query || '').trim();
  if (!q) throw new Error('请输入物流单号、订单号或买家信息');

  const config = loadConfig();
  const accounts = listEnabledAccounts(config);
  if (!accounts.length) {
    throw new Error('未读取到店铺 Cookie，请确认辅助出库软件已配置账号');
  }

  const merged = new Map();
  const errors = [];
  const perShop = new Map();

  const settled = await Promise.allSettled(
    accounts.map(async (account) => searchAfterSalesForAccount(account, q, options.maxPages || 2)),
  );

  for (let i = 0; i < settled.length; i += 1) {
    const result = settled[i];
    const account = accounts[i];
    const shopName = account?.name || '未命名店铺';
    if (result.status === 'fulfilled') {
      perShop.set(shopName, result.value.length);
      for (const order of result.value) {
        const key = `${order.shopTitle}::${order.orderNo}::${order.returnsId || ''}`;
        if (!merged.has(key)) merged.set(key, order);
      }
      continue;
    }
    const err = result.reason;
    const msg = err instanceof XhsSignError ? err.message : String(err?.message || err);
    errors.push(`${shopName}：${msg}`);
    perShop.set(shopName, 0);
  }

  const items = [...merged.values()].sort(
    (a, b) => Number(b.createdAt || 0) - Number(a.createdAt || 0),
  );

  const shopSummary = accounts.map((a) => ({
    name: a.name || '未命名店铺',
    count: perShop.get(a.name || '未命名店铺') || 0,
  }));

  let message = items.length
    ? `四店售后列表共 ${items.length} 条匹配`
    : '未找到匹配售后/退货单，可核对物流单号或换店铺 Cookie';
  if (errors.length && items.length) {
    message = `${message}（${errors.length} 个店铺查询失败）`;
  }
  if (errors.length && !items.length) {
    throw new Error(errors[0] || '查询失败');
  }

  return {
    query: q,
    days: 0,
    searchMode: 'after_sales',
    message,
    warnings: errors,
    shopSummary,
    items,
    returnRelatedCount: items.length,
  };
}

module.exports = {
  isLogisticsQuery,
  buildArkOrderDetailUrl,
  searchAfterSalesByKeywords,
  AFTER_SALES_RETURNS_URL,
};

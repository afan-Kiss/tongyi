const { loadConfig } = require('../config');
const { listEnabledAccounts } = require('./xhsAccountImport');
const { debugLog } = require('../debugLog');
const {
  signPostHeaders,
  extractAuthorizationFromCookie,
  extractSellerIdFromCookie,
  XhsSignError,
} = require('./xhsSigner');
const {
  extractPackagesFromResponse,
  normalizePackagesBatch,
} = require('./xhsPackageParse');

const ORDER_API_URL = 'https://ark.xiaohongshu.com/api/edith/fulfillment/order/page';
const ORDER_REFERER = 'https://ark.xiaohongshu.com/app-order/order/query';
const DEFAULT_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36';

const ORDER_FETCH_TIMEOUT_MS = 10000;
const ORDER_PAGE_SIZE = 20;
const ORDER_MAX_PAGES = 1;
const TZ_OFFSET_MS = 8 * 3600000;

function shanghaiTodayParts() {
  const now = Date.now();
  const sh = new Date(now + TZ_OFFSET_MS);
  return { y: sh.getUTCFullYear(), m: sh.getUTCMonth(), d: sh.getUTCDate() };
}

function startOfShanghaiDay(offsetDays = 0) {
  const { y, m, d } = shanghaiTodayParts();
  return Date.UTC(y, m, d - offsetDays, -8, 0, 0, 0);
}

function endOfShanghaiDay(offsetDays = 0) {
  const { y, m, d } = shanghaiTodayParts();
  return Date.UTC(y, m, d - offsetDays, 15, 59, 59, 999);
}

function buildOrderBody(pageNo, pageSize, startMs, endMs) {
  return {
    page_no: pageNo,
    page_size: pageSize,
    multi_search_field: '',
    order_tag_list: [],
    order_type_list: [],
    promise_ship_time_type_list: [],
    after_sale_status_list: [],
    seller_mark_priority_list: [],
    seller_mark_note_status_list: [],
    status: [],
    time_range_list: [{ time_type: 3, start_time: startMs, end_time: endMs }],
    overdue_status: -2,
    sort_by: { sort_field: 'ordered_at', desc: true },
    need_declare_info: false,
    need_declare_times: false,
    allow_es_fallback: true,
  };
}

function buildHeaders(body, cookie) {
  const auth = extractAuthorizationFromCookie(cookie);
  if (!auth) {
    throw new Error('Cookie 中未找到 ark access token，请重新复制完整 Cookie');
  }

  const signed = signPostHeaders(ORDER_API_URL, body, cookie, 'seller');
  return {
    accept: 'application/json, text/plain, */*',
    'content-type': 'application/json',
    origin: 'https://ark.xiaohongshu.com',
    referer: ORDER_REFERER,
    'bill-type': 'xhs',
    'user-agent': DEFAULT_UA,
    cookie,
    authorization: auth,
    ...signed,
  };
}

async function requestOrderPage(account, startMs, endMs, pageNo = 1, pageSize = ORDER_PAGE_SIZE) {
  const body = buildOrderBody(pageNo, pageSize, startMs, endMs);
  const headers = buildHeaders(body, account.cookie);

  const res = await fetch(ORDER_API_URL, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(ORDER_FETCH_TIMEOUT_MS),
  });

  const text = await res.text();
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error(`订单 API 返回非 JSON（HTTP ${res.status}）`);
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

  const packages = extractPackagesFromResponse(data);
  const hasMore = packages.length >= pageSize;
  return { packages, hasMore, raw: data };
}

async function fetchOrdersForAccount(account, startMs, endMs, maxPages = ORDER_MAX_PAGES, pageSize = ORDER_PAGE_SIZE) {
  const allPackages = [];
  for (let page = 1; page <= maxPages; page += 1) {
    const { packages, hasMore } = await requestOrderPage(account, startMs, endMs, page, pageSize);
    allPackages.push(...packages);
    if (!hasMore || !packages.length) break;
  }
  const sellerIdFromCookie = extractSellerIdFromCookie(account.cookie);
  return normalizePackagesBatch(allPackages, account.name).map((order) => ({
    ...order,
    sellerId: order.sellerId || sellerIdFromCookie,
  }));
}

function filterTodayAndYesterday(orders) {
  const todayStart = startOfShanghaiDay(0);
  const todayEnd = endOfShanghaiDay(0);
  const yesterdayStart = startOfShanghaiDay(1);
  const yesterdayEnd = endOfShanghaiDay(1);

  const today = [];
  const yesterday = [];

  for (const order of orders) {
    const ts = Number(order.createdAt || 0);
    if (ts >= todayStart && ts <= todayEnd) {
      today.push({ ...order, dayLabel: '今日' });
    } else if (ts >= yesterdayStart && ts <= yesterdayEnd) {
      yesterday.push({ ...order, dayLabel: '昨日' });
    }
  }

  today.sort((a, b) => b.createdAt - a.createdAt);
  yesterday.sort((a, b) => b.createdAt - a.createdAt);
  return { today, yesterday, all: [...today, ...yesterday] };
}

function resolveDayRange(day) {
  if (day === 'today') {
    return { startMs: startOfShanghaiDay(0), endMs: endOfShanghaiDay(0) };
  }
  if (day === 'yesterday') {
    return { startMs: startOfShanghaiDay(1), endMs: endOfShanghaiDay(1) };
  }
  return { startMs: startOfShanghaiDay(1), endMs: endOfShanghaiDay(0) };
}

async function fetchOrdersFromApi(config, options = {}) {
  const day = options.day || 'both';
  const accounts = listEnabledAccounts(config);
  if (!accounts.length) {
    throw new Error('未读取到店铺 Cookie，请确认辅助出库软件已配置账号');
  }

  const { startMs, endMs } = resolveDayRange(day);
  const merged = new Map();
  const errors = [];

  const settled = await Promise.allSettled(
    accounts.map(async (account) => {
      const orders = await fetchOrdersForAccount(account, startMs, endMs);
      return { account, orders };
    })
  );

  for (let i = 0; i < settled.length; i += 1) {
    const result = settled[i];
    const account = accounts[i];
    if (result.status === 'fulfilled') {
      for (const order of result.value.orders) {
        const key = `${order.shopTitle}::${order.orderId}`;
        if (!merged.has(key)) merged.set(key, order);
      }
      continue;
    }
    const err = result.reason;
    const msg = err instanceof XhsSignError ? err.message : String(err?.message || err);
    errors.push(`${account?.name || '账号'}：${msg}`);
  }

  const allOrders = [...merged.values()];
  if (!allOrders.length) {
    if (errors.length) {
      throw new Error(errors[0] || '订单暂时加载不出来');
    }
    return {
      source: 'empty',
      message: '今日和昨日暂无订单',
      today: [],
      yesterday: [],
      all: [],
    };
  }

  const filtered = filterTodayAndYesterday(allOrders);
  let today = filtered.today;
  let yesterday = filtered.yesterday;
  if (day === 'today') {
    yesterday = [];
  } else if (day === 'yesterday') {
    today = [];
  }
  const all = [...today, ...yesterday];

  let message = all.length ? '点击订单进入拍照和发送' : '今日和昨日暂无订单';
  if (day === 'today' && !all.length) message = '今日暂无订单';
  if (day === 'yesterday' && !all.length) message = '昨日暂无订单';
  if (errors.length && all.length) {
    message = `${message}（${errors.length} 个店铺加载失败）`;
  }

  return { source: 'api', message, warnings: errors, today, yesterday, all, day };
}

let ordersCache = { data: null, at: 0, key: '' };

function ordersCacheKey(config, day = 'both') {
  const base = listEnabledAccounts(config)
    .map((a) => `${a.name || ''}:${String(a.cookie || '').length}`)
    .join('|');
  return `${day}::${base}`;
}

async function getOrders(options = {}) {
  const config = loadConfig();
  const refresh = Boolean(options.refresh);
  const day = options.day === 'today' || options.day === 'yesterday' ? options.day : 'both';
  const ttlMs = Number(config.orders?.cacheTtlMs || 60000);
  const key = ordersCacheKey(config, day);
  const now = Date.now();

  if (!refresh && ordersCache.data && ordersCache.key === key && now - ordersCache.at < ttlMs) {
    // #region agent log
    debugLog('orderService.js:getOrders', 'server cache hit', { ageMs: now - ordersCache.at, ttlMs, day }, 'H2');
    // #endregion
    return { ...ordersCache.data, cached: true, cachedAt: ordersCache.at };
  }

  const t0 = Date.now();
  const data = await fetchOrdersFromApi(config, { day });
  // #region agent log
  debugLog('orderService.js:getOrders', 'fetch complete', { refresh, day, ms: Date.now() - t0, count: data.all?.length || 0 }, 'H2');
  // #endregion
  ordersCache = { data, at: now, key };
  return { ...data, cached: false };
}

function clearOrdersCache() {
  ordersCache = { data: null, at: 0, key: '' };
}

module.exports = {
  getOrders,
  clearOrdersCache,
  fetchOrdersFromApi,
  fetchOrdersForAccount,
  filterTodayAndYesterday,
  buildOrderBody,
  ORDER_API_URL,
};

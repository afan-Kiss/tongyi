/**
 * 四店订单 + 售后工作台本地缓存（默认每 180 分钟全量同步）
 * 查单时优先命中缓存，未命中再走实时 API。
 */
const fs = require('fs');
const path = require('path');
const { ROOT, loadConfig } = require('../config');
const { listEnabledAccounts, clearOutboundAccountCache } = require('./xhsAccountImport');
const {
  fetchOrdersBroadForAccount,
  resolveSearchRange,
} = require('./orderService');
const { fetchAfterSalesBroadForAccount } = require('./afterSalesReturnService');
const {
  canonicalOrderSearchKey,
  dedupeSearchOrders,
  filterOrdersByQuery,
  mergeOrderSearchRecords,
  normalizeOrderExpressFields,
  orderSearchFields,
} = require('./orderSearchMatch');
const { XhsSignError } = require('./xhsSigner');

const CACHE_DIR = path.join(ROOT, 'data');
const CACHE_FILE = path.join(CACHE_DIR, 'order-search-cache.json');
const DEFAULT_SYNC_MS = 180 * 60 * 1000;
const DEFAULT_DAYS = 30;

let memoryCache = null;
let syncTimer = null;
let syncInProgress = false;

function syncIntervalMs() {
  const config = loadConfig();
  return Number(config.orders?.searchCacheSyncIntervalMs || DEFAULT_SYNC_MS);
}

function cacheDays() {
  const config = loadConfig();
  return Math.min(Math.max(Number(config.orders?.searchCacheDays || DEFAULT_DAYS), 7), 90);
}

function slimOrder(order) {
  if (!order || typeof order !== 'object') return order;
  const { raw, ...rest } = order;
  return normalizeOrderExpressFields(rest);
}

function buildIndex(ordersMap) {
  const index = {};
  for (const [key, order] of Object.entries(ordersMap || {})) {
    const fields = orderSearchFields(order);
    const tokens = new Set(
      Object.values(fields)
        .map((v) => String(v || '').trim().toUpperCase().replace(/\s+/g, ''))
        .filter((v) => v.length >= 4),
    );
    for (const token of tokens) {
      if (!index[token]) index[token] = [];
      if (!index[token].includes(key)) index[token].push(key);
    }
  }
  return index;
}

function readCacheFile() {
  if (!fs.existsSync(CACHE_FILE)) return null;
  try {
    return JSON.parse(fs.readFileSync(CACHE_FILE, 'utf8'));
  } catch {
    return null;
  }
}

function loadCache() {
  if (memoryCache) return memoryCache;
  memoryCache = readCacheFile();
  return memoryCache;
}

function persistCache(cache) {
  fs.mkdirSync(CACHE_DIR, { recursive: true });
  fs.writeFileSync(CACHE_FILE, `${JSON.stringify(cache, null, 2)}\n`, 'utf8');
  memoryCache = cache;
}

function upsertOrderToMap(map, order, source) {
  const slim = slimOrder({ ...order, searchSource: source });
  const key = canonicalOrderSearchKey(slim);
  if (key.endsWith('::')) return;
  const prev = map[key];
  map[key] = prev
    ? mergeOrderSearchRecords(prev, { ...slim, searchSource: [prev.searchSource, source].filter(Boolean).join('+') })
    : slim;
}

function mergeOrdersIntoMap(map, orders, source) {
  for (const order of orders || []) upsertOrderToMap(map, order, source);
}

function cacheAccountsKey(config) {
  return listEnabledAccounts(config)
    .map((a) => `${a.name || ''}:${String(a.cookie || '').length}`)
    .join('|');
}

function isCacheStale(cache) {
  if (!cache?.syncedAt) return true;
  const age = Date.now() - Number(cache.syncedAt);
  return age >= syncIntervalMs();
}

function getCacheStatus() {
  const config = loadConfig();
  const cache = loadCache();
  const accounts = listEnabledAccounts(config);
  const orderCount = cache?.orders ? Object.keys(cache.orders).length : 0;
  return {
    enabled: accounts.length > 0,
    syncedAt: cache?.syncedAt || null,
    stale: !cache || isCacheStale(cache),
    syncInProgress,
    lastSyncError: cache?.lastSyncError || null,
    orderCount,
    indexTokenCount: cache?.index ? Object.keys(cache.index).length : 0,
    stats: cache?.stats || null,
    nextSyncInMs: cache?.syncedAt
      ? Math.max(0, syncIntervalMs() - (Date.now() - Number(cache.syncedAt)))
      : 0,
    accountsKey: cache?.accountsKey || '',
  };
}

function searchOrdersFromCache(query) {
  const q = String(query || '').trim();
  if (!q) return { items: [], hit: false };
  const cache = loadCache();
  if (!cache?.orders || !cache.index) return { items: [], hit: false };

  const token = q.toUpperCase().replace(/\s+/g, '');
  const keys = cache.index[token] || [];
  const rawItems = keys.map((k) => cache.orders[k]).filter(Boolean);
  const items = dedupeSearchOrders(filterOrdersByQuery(rawItems, q));
  return {
    items,
    hit: items.length > 0,
    cachedAt: cache.syncedAt || null,
    stale: isCacheStale(cache),
  };
}

function upsertLiveResultsToCache(items) {
  if (!items?.length) return;
  const cache = loadCache() || {
    syncedAt: 0,
    orders: {},
    index: {},
    stats: {},
    accountsKey: cacheAccountsKey(loadConfig()),
  };
  for (const item of items) upsertOrderToMap(cache.orders, item, 'live');
  cache.index = buildIndex(cache.orders);
  cache.liveUpdatedAt = Date.now();
  persistCache(cache);
}

async function syncOrderSearchCache(options = {}) {
  if (syncInProgress && !options.force) {
    return { ok: false, message: '同步正在进行中', status: getCacheStatus() };
  }

  syncInProgress = true;
  const config = loadConfig();
  const accounts = listEnabledAccounts(config);
  const started = Date.now();
  const days = cacheDays();
  const { startMs, endMs } = resolveSearchRange(days);
  const ordersMap = {};
  const shopStats = [];
  const errors = [];

  try {
    if (!accounts.length) {
      throw new Error('未读取到店铺 Cookie，请确认辅助出库软件已配置账号');
    }

    const settled = await Promise.allSettled(
      accounts.map(async (account) => {
        const shopName = account.name || '未命名店铺';
        const orderRows = await fetchOrdersBroadForAccount(account, startMs, endMs, 35);
        mergeOrdersIntoMap(ordersMap, orderRows, 'order_page');
        const afterRows = await fetchAfterSalesBroadForAccount(account, 40);
        mergeOrdersIntoMap(ordersMap, afterRows, 'after_sales');
        return {
          shop: shopName,
          orderCount: orderRows.length,
          afterSalesCount: afterRows.length,
        };
      }),
    );

    for (let i = 0; i < settled.length; i += 1) {
      const result = settled[i];
      const account = accounts[i];
      const shopName = account?.name || '未命名店铺';
      if (result.status === 'fulfilled') {
        shopStats.push(result.value);
        continue;
      }
      const err = result.reason;
      const msg = err instanceof XhsSignError ? err.message : String(err?.message || err);
      errors.push(`${shopName}：${msg}`);
      shopStats.push({ shop: shopName, orderCount: 0, afterSalesCount: 0, error: msg });
    }

    const cache = {
      syncedAt: Date.now(),
      accountsKey: cacheAccountsKey(config),
      days,
      orders: ordersMap,
      index: buildIndex(ordersMap),
      stats: {
        shopStats,
        orderCount: Object.keys(ordersMap).length,
        durationMs: Date.now() - started,
        errors,
      },
      lastSyncError: errors.length ? errors.join('；') : null,
    };
    persistCache(cache);

    const orderCount = Object.keys(ordersMap).length;
    const message = errors.length
      ? `已缓存 ${orderCount} 条（${errors.length} 个店铺部分失败）`
      : `已缓存 ${orderCount} 条订单/售后记录`;
    console.log(`[order-search-cache] ${message}，耗时 ${Date.now() - started}ms`);
    return { ok: true, message, status: getCacheStatus(), warnings: errors };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const prev = loadCache() || { orders: {}, index: {} };
    persistCache({
      ...prev,
      lastSyncError: message,
      stats: { ...(prev.stats || {}), lastFailedAt: Date.now() },
    });
    console.error('[order-search-cache] 同步失败:', message);
    return { ok: false, message, status: getCacheStatus() };
  } finally {
    syncInProgress = false;
  }
}

function invalidateOrderSearchCache() {
  memoryCache = null;
  try {
    if (fs.existsSync(CACHE_FILE)) fs.unlinkSync(CACHE_FILE);
  } catch {
    /* ignore */
  }
}

function scheduleOrderSearchCacheSync() {
  if (syncTimer) return;

  const run = () => {
    void syncOrderSearchCache().catch((err) => {
      console.error('[order-search-cache] 定时同步异常:', err?.message || err);
    });
  };

  const status = getCacheStatus();
  if (status.stale || !status.orderCount) {
    setTimeout(run, 8000);
  }

  syncTimer = setInterval(run, syncIntervalMs());
  if (typeof syncTimer.unref === 'function') syncTimer.unref();
  console.log(`[order-search-cache] 已启动定时同步（每 ${Math.round(syncIntervalMs() / 60000)} 分钟）`);
}

function clearOrderSearchCacheOnAccountChange() {
  clearOutboundAccountCache();
  invalidateOrderSearchCache();
}

module.exports = {
  searchOrdersFromCache,
  upsertLiveResultsToCache,
  syncOrderSearchCache,
  scheduleOrderSearchCacheSync,
  getCacheStatus,
  invalidateOrderSearchCache,
  clearOrderSearchCacheOnAccountChange,
};

const KEY = 'xiangyu.session';
let capturedPhotosMemory = null;

export function saveSession(data) {
  try {
    sessionStorage.setItem(KEY, JSON.stringify(data));
    return true;
  } catch {
    if (data.mergedImage) {
      delete data.mergedImage;
      try {
        sessionStorage.setItem(KEY, JSON.stringify(data));
        return true;
      } catch {
        return false;
      }
    }
    return false;
  }
}

export function loadSession() {
  try {
    return JSON.parse(sessionStorage.getItem(KEY) || '{}');
  } catch {
    return {};
  }
}

export function setSelectedOrder(order) {
  capturedPhotosMemory = null;
  const session = loadSession();
  delete session.capturedPhotos;
  delete session.mergedImage;
  delete session.videoPrepared;
  delete session.photoFingerprint;
  delete session.capturedPhotoCount;
  session.selectedOrder = order;
  session.sendReady = null;
  saveSession(session);
}

export function getSelectedOrder() {
  return loadSession().selectedOrder || null;
}

export function patchSelectedOrder(patch) {
  const session = loadSession();
  if (!session.selectedOrder) return;
  session.selectedOrder = { ...session.selectedOrder, ...patch };
  saveSession(session);
}

export function setSendReady(info) {
  const session = loadSession();
  session.sendReady = info;
  saveSession(session);
}

export function getSendReady() {
  return loadSession().sendReady || null;
}

function photoFingerprint(photos) {
  return `${photos.length}:${photos.map((p) => String(p).length).join('-')}`;
}

export function setCapturedPhotos(photos) {
  capturedPhotosMemory = Array.isArray(photos) ? [...photos] : [];
  const session = loadSession();
  session.photoFingerprint = photoFingerprint(capturedPhotosMemory);
  session.capturedPhotoCount = capturedPhotosMemory.length;
  delete session.mergedImage;
  const serialized = JSON.stringify(capturedPhotosMemory);
  if (serialized.length < 2_000_000) {
    session.capturedPhotos = capturedPhotosMemory;
  } else {
    delete session.capturedPhotos;
  }
  return saveSession(session);
}

export function getCapturedPhotos() {
  if (capturedPhotosMemory?.length) return capturedPhotosMemory;
  const fromSession = loadSession().capturedPhotos;
  if (Array.isArray(fromSession) && fromSession.length) {
    capturedPhotosMemory = fromSession;
    return capturedPhotosMemory;
  }
  return [];
}

export function getPhotoFingerprint() {
  return loadSession().photoFingerprint || '';
}

export function setMergedImage(dataUrl) {
  const session = loadSession();
  session.mergedImage = dataUrl;
  saveSession(session);
}

export function getMergedImage() {
  return loadSession().mergedImage || '';
}

export function setVideoPrepared(data) {
  const session = loadSession();
  session.videoPrepared = data;
  saveSession(session);
}

export function getVideoPrepared() {
  return loadSession().videoPrepared || null;
}

export function clearVideoPrepared() {
  const session = loadSession();
  delete session.videoPrepared;
  saveSession(session);
}

export function clearWorkflow() {
  capturedPhotosMemory = null;
  const session = loadSession();
  delete session.capturedPhotos;
  delete session.mergedImage;
  delete session.videoPrepared;
  delete session.photoFingerprint;
  delete session.capturedPhotoCount;
  saveSession(session);
}

export function formatBuyerWithShop(order) {
  const buyer = String(order?.buyerNick || order?.buyerUserId || '买家').trim() || '买家';
  const shop = String(order?.shopTitle || '').trim();
  return shop ? `${buyer} · 【${shop}】` : buyer;
}

const ORDERS_CACHE_KEY = 'xiangyu.ordersCache';
const ORDERS_CACHE_TTL_MS = 45000;

export function getCachedOrders() {
  try {
    const raw = sessionStorage.getItem(ORDERS_CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed?.data || Date.now() - Number(parsed.at || 0) > ORDERS_CACHE_TTL_MS) return null;
    return parsed.data;
  } catch {
    return null;
  }
}

export function setCachedOrders(data) {
  try {
    sessionStorage.setItem(ORDERS_CACHE_KEY, JSON.stringify({ data, at: Date.now() }));
  } catch {
    // ignore quota
  }
}

export function clearCachedOrders() {
  try {
    sessionStorage.removeItem(ORDERS_CACHE_KEY);
  } catch {
    // ignore
  }
}

export const DEFAULT_PREFACE_MESSAGE =
  '亲，您的和田玉已经检查好啦，准备正常安排发出。发货前给您拍几张实物图留个记录，方便您提前看一下实物状态。后续物流信息您在订单里就可以查看哈。如果您想看视频实拍的话 把您的\\/ 给我';

const PREFACE_DRAFT_KEY = 'xiangyu.prefaceDraft';

export function loadPrefaceDraft() {
  try {
    const raw = localStorage.getItem(PREFACE_DRAFT_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return null;
    return {
      text: String(parsed.text || '').trim(),
      enabled: parsed.enabled !== false,
      savedAt: Number(parsed.savedAt || 0),
    };
  } catch {
    return null;
  }
}

export function savePrefaceDraft({ text, enabled }) {
  try {
    localStorage.setItem(
      PREFACE_DRAFT_KEY,
      JSON.stringify({
        text: String(text ?? '').trim(),
        enabled: enabled !== false,
        savedAt: Date.now(),
      }),
    );
    return true;
  } catch {
    return false;
  }
}

/** 服务端配置 + 本地草稿合并，保证刷新后仍能恢复说明文字 */
export function resolvePrefaceForEditor(serverEditor) {
  const local = loadPrefaceDraft();
  const serverText = String(serverEditor?.prefaceMessage || '').trim();
  const serverEnabled = serverEditor?.prefaceEnabled !== false;

  if (local?.text) {
    return {
      prefaceMessage: local.text,
      prefaceEnabled: local.enabled ?? serverEnabled,
    };
  }

  return {
    prefaceMessage: serverText || DEFAULT_PREFACE_MESSAGE,
    prefaceEnabled: serverEnabled,
  };
}

const SENT_ORDERS_KEY = 'xiangyu.sentOrders';
const SENT_ORDERS_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;

let sentOrdersMemory = null;
let sentOrdersInitPromise = null;

function normalizeShopTitle(title) {
  return String(title || '')
    .replace(/-工作台\s*$/i, '')
    .trim();
}

function orderSentKey(order) {
  if (!order) return '';
  const shop = normalizeShopTitle(order.shopTitle || order.sourceAccountName || '');
  const id = String(order.orderNo || order.packageId || order.orderId || '').trim();
  if (!id) return '';
  return shop ? `${shop}::${id}` : id;
}

function keysForOrder(order) {
  const keys = new Set();
  const main = orderSentKey(order);
  if (main) keys.add(main);
  for (const id of [order?.orderId, order?.orderNo, order?.packageId]) {
    const s = String(id || '').trim();
    if (s) keys.add(s);
  }
  return [...keys];
}

function loadSentOrdersMap() {
  try {
    const raw = localStorage.getItem(SENT_ORDERS_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

function saveSentOrdersMap(map) {
  try {
    localStorage.setItem(SENT_ORDERS_KEY, JSON.stringify(map));
  } catch {
    // ignore quota
  }
}

function pruneSentOrders(map) {
  const cutoff = Date.now() - SENT_ORDERS_MAX_AGE_MS;
  const next = {};
  for (const [key, meta] of Object.entries(map)) {
    if (meta && Number(meta.sentAt || 0) >= cutoff) next[key] = meta;
  }
  return next;
}

function getSentMap() {
  return sentOrdersMemory || loadSentOrdersMap();
}

function isSentMetaFresh(meta) {
  return meta && Date.now() - Number(meta.sentAt || 0) <= SENT_ORDERS_MAX_AGE_MS;
}

/** 从服务端 + 本地合并已发送记录（刷新后仍保留） */
export async function refreshSentOrders(api) {
  let serverMap = {};
  try {
    const data = await api.getSentOrders();
    serverMap = data?.orders && typeof data.orders === 'object' ? data.orders : {};
  } catch {
    serverMap = {};
  }

  const localMap = pruneSentOrders(loadSentOrdersMap());
  const merged = { ...localMap, ...serverMap };

  for (const [key, meta] of Object.entries(localMap)) {
    if (!serverMap[key] && isSentMetaFresh(meta)) {
      api.markSentOrderByKey(key, meta).catch(() => {});
    }
  }

  sentOrdersMemory = merged;
  saveSentOrdersMap(merged);
  return merged;
}

export function initSentOrders(api, { force = false } = {}) {
  if (force || !sentOrdersInitPromise) {
    sentOrdersInitPromise = refreshSentOrders(api);
  }
  return sentOrdersInitPromise;
}

/** 打包拍照（合成图/文字/视频）已成功发送 */
export function markOrderPackSent(order, kind = 'image', api = null) {
  const key = orderSentKey(order);
  if (!key) return;
  const map = pruneSentOrders(getSentMap());
  map[key] = {
    sentAt: Date.now(),
    kind,
    orderNo: String(order.orderNo || order.orderId || order.packageId || ''),
    buyerNick: String(order.buyerNick || ''),
    shopTitle: normalizeShopTitle(order.shopTitle || order.sourceAccountName || ''),
  };
  sentOrdersMemory = map;
  saveSentOrdersMap(map);
  if (api?.markSentOrder) {
    api.markSentOrder({ order, kind }).catch(() => {});
  }
}

export function isOrderPackSent(order) {
  const map = getSentMap();
  for (const key of keysForOrder(order)) {
    const meta = map[key];
    if (isSentMetaFresh(meta)) return true;
  }
  return false;
}

export function getOrderSentMeta(order) {
  const map = getSentMap();
  for (const key of keysForOrder(order)) {
    const meta = map[key];
    if (isSentMetaFresh(meta)) return meta;
  }
  return null;
}

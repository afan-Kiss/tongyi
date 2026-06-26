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

const SENT_ORDERS_KEY = 'xiangyu.sentOrders';
const SENT_ORDERS_MAX_AGE_MS = 14 * 24 * 60 * 60 * 1000;

function orderSentKey(order) {
  if (!order) return '';
  return String(order.orderId || order.orderNo || order.packageId || '').trim();
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

/** 打包拍照（合成图/文字）已成功发送 */
export function markOrderPackSent(order, kind = 'image') {
  const key = orderSentKey(order);
  if (!key) return;
  const map = pruneSentOrders(loadSentOrdersMap());
  map[key] = {
    sentAt: Date.now(),
    kind,
    orderNo: String(order.orderNo || order.orderId || ''),
    buyerNick: String(order.buyerNick || ''),
  };
  saveSentOrdersMap(map);
}

export function isOrderPackSent(order) {
  const key = orderSentKey(order);
  if (!key) return false;
  const map = loadSentOrdersMap();
  const meta = map[key];
  if (!meta) return false;
  if (Date.now() - Number(meta.sentAt || 0) > SENT_ORDERS_MAX_AGE_MS) return false;
  return true;
}

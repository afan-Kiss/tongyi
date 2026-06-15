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

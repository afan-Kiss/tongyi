import { api } from './api.js';
import { getSelectedOrder } from './store.js';

let bridgeHealthCache = { at: 0, result: null };
const BRIDGE_HEALTH_TTL_MS = 30000;

export async function ensureSendReady() {
  const now = Date.now();
  let health = bridgeHealthCache.result;
  if (!health || now - bridgeHealthCache.at > BRIDGE_HEALTH_TTL_MS) {
    health = await api.bridgeHealth();
    bridgeHealthCache = { at: now, result: health };
  }
  if (!health.ok) {
    return {
      ready: false,
      canSendImage: false,
      canSendVideo: false,
      message: health.message || '发消息功能还没准备好，请先打开千帆客服工作台',
    };
  }

  const order = getSelectedOrder();
  if (!order) {
    return { ready: false, canSendImage: false, canSendVideo: false, message: '请先选择一个订单' };
  }

  return {
    ready: true,
    canSendImage: true,
    canSendVideo: true,
    message: '',
  };
}

const { loadConfig } = require('../config');

async function openSessionWithBuyer(payload) {
  const config = loadConfig();
  const bridgeUrl = String(config.bridge.url || '').trim();
  if (!bridgeUrl) {
    throw new Error('发消息功能还没配置好，请联系管理员');
  }

  const openUrl = bridgeUrl.replace(/\/send\/?$/, '/open-session');
  const body = {
    shopTitle: payload.shopTitle || config.shop.name,
    buyerNick: payload.buyerNick || '',
    buyerUserId: payload.buyerUserId || '',
    sellerId: payload.sellerId || '',
    packageId: payload.packageId || '',
    orderId: payload.orderId || '',
  };

  if (!body.buyerUserId) {
    throw new Error('这个订单找不到买家信息，请换一个订单试试');
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), Number(config.bridge.timeoutMs || 30000));

  try {
    const res = await fetch(openUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: controller.signal,
    });

    const text = await res.text();
    let data;
    try {
      data = JSON.parse(text);
    } catch {
      data = { raw: text };
    }

    if (!res.ok) {
      throw new Error(data?.error || data?.message || '发送出了点问题，请稍后再试');
    }

    const session = data.session || {};
    return {
      ok: true,
      created: Boolean(data.created),
      pending: Boolean(data.pending),
      message: data.message || '',
      appCid: session.appCid || '',
      receiverAppUids: session.receiverAppUids || [],
      buyerNick: session.buyerNick || body.buyerNick,
      shopTitle: session.shopTitle || body.shopTitle,
      source: session.source || data.source || '',
    };
  } catch (err) {
    if (err.name === 'AbortError') {
      throw new Error('打开买家聊天有点慢，请确认千帆客服软件已打开');
    }
    const msg = String(err.message || err);
    if (/千帆|DevTools|未找到店铺|买家聊天/i.test(msg)) {
      throw err;
    }
    if (String(err.cause?.code || '') === 'ECONNREFUSED' || msg === 'fetch failed') {
      throw new Error('发消息桥接未启动，请在项目目录运行 npm run bridge');
    }
    throw err;
  } finally {
    clearTimeout(timeout);
  }
}

async function sendTextToBuyer(payload) {
  return sendMediaToBuyer({ ...payload, type: 'send_text' });
}

async function sendMediaToBuyer(payload) {
  const config = loadConfig();
  const bridgeUrl = String(config.bridge.url || '').trim();

  if (!bridgeUrl) {
    throw new Error('发消息功能还没配置好，请联系管理员');
  }

  const {
    type = 'send_image',
    shopTitle = config.shop.name,
    appCid,
    receiverAppUids = [],
    orderId = '',
    buyerNick = '',
    buyerUserId = '',
    sellerId = '',
    packageId = '',
    imageBase64,
    imageUrl = '',
    imagePath = '',
    videoPath = '',
    coverPath = '',
    videoMeta = {},
    fileName = '',
    text = '',
    sendPreface = false,
    prefaceText = '',
  } = payload;

  if (type === 'send_text' && !String(text || '').trim()) {
    throw new Error('请先填写要发送的文字');
  }
  if (type === 'send_image' && !imageBase64 && !imageUrl && !imagePath) {
    throw new Error('请先拍照或选图');
  }
  if (type === 'send_video' && !videoPath) {
    throw new Error('请先准备好要发的视频');
  }

  const body = {
    type,
    shopTitle,
    appCid,
    receiverAppUids,
    orderId,
    buyerNick,
    buyerUserId,
    sellerId,
    packageId,
    imageBase64: imageBase64 || undefined,
    imageUrl: imageUrl || undefined,
    imagePath: imagePath || undefined,
    videoPath: videoPath || undefined,
    coverPath: coverPath || undefined,
    videoMeta,
    fileName: fileName || undefined,
    text: text || undefined,
    sendPreface: Boolean(sendPreface),
    prefaceText: prefaceText || undefined,
    autoOpenSession: true,
    timestamp: Date.now(),
  };

  const controller = new AbortController();
  const timeoutMs =
    type === 'send_video'
      ? 300000
      : type === 'send_image'
        ? 180000
        : type === 'send_text'
          ? 90000
          : Number(config.bridge.timeoutMs || 120000);
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetch(bridgeUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: controller.signal,
    });

    const text = await res.text();
    let data;
    try {
      data = JSON.parse(text);
    } catch {
      data = { raw: text };
    }

    if (!res.ok) {
      throw new Error(data?.error || data?.message || '发送出了点问题，请稍后再试');
    }

    return {
      ok: Boolean(data.delivered ?? data.ok),
      delivered: Boolean(data.delivered ?? data.ok),
      msgId: data.msgId || '',
      message: data.message || '',
      preface: data.preface || null,
      bridgeMode: config.bridge.mode,
      result: data,
    };
  } catch (err) {
    if (err.name === 'AbortError') {
      throw new Error(
        type === 'send_video' ? '发送视频时间有点长，请稍等再试' : '发送有点慢，请确认千帆客服软件已打开后再试'
      );
    }
    const msg = String(err.message || err);
    if (/千帆|DevTools|未找到店铺|买家聊天|ACK timeout/i.test(msg)) {
      throw err;
    }
    if (String(err.cause?.code || '') === 'ECONNREFUSED' || msg === 'fetch failed') {
      throw new Error('发消息桥接未启动，请在项目目录运行 npm run bridge');
    }
    throw err;
  } finally {
    clearTimeout(timeout);
  }
}

async function sendImageToBuyer(payload) {
  return sendMediaToBuyer({ ...payload, type: 'send_image' });
}

async function sendVideoToBuyer(payload) {
  return sendMediaToBuyer({ ...payload, type: 'send_video' });
}

async function fetchArkTicketFromBridge({ serviceUrl, shopTitle = '', sellerUserId = '' }) {
  const config = loadConfig();
  const bridgeUrl = String(config.bridge.url || '').trim();
  if (!bridgeUrl) return '';

  const base = bridgeUrl.replace(/\/send\/?$/, '');
  const params = new URLSearchParams({
    serviceUrl: String(serviceUrl || ''),
    shopTitle: String(shopTitle || ''),
    sellerUserId: String(sellerUserId || ''),
  });
  const ticketUrl = `${base}/ark-ticket?${params.toString()}`;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), Number(config.bridge.timeoutMs || 20000));
  try {
    const res = await fetch(ticketUrl, { method: 'GET', signal: controller.signal });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data?.ticket) return '';
    return String(data.ticket);
  } catch {
    return '';
  } finally {
    clearTimeout(timeout);
  }
}

async function checkBridgeHealth() {
  const config = loadConfig();
  const bridgeUrl = String(config.bridge.url || '').trim();
  if (!bridgeUrl) {
    return { ok: false, message: '发消息功能还没配置好' };
  }

  try {
    const healthUrl = bridgeUrl.replace(/\/send\/?$/, '/health');
    const res = await fetch(healthUrl, { method: 'GET' });
    if (res.ok) {
      const data = await res.json().catch(() => ({}));
      const ready = Boolean(data.ok);
      return {
        ok: ready,
        message: data.message || (ready ? '可以正常发消息' : '千帆客服未连接，请先打开千帆客服工作台'),
        data,
      };
    }
    return { ok: false, message: '发消息功能暂时不可用，请联系管理员' };
  } catch (err) {
    return { ok: false, message: String(err.message || err) };
  }
}

module.exports = {
  sendImageToBuyer,
  sendVideoToBuyer,
  sendTextToBuyer,
  sendMediaToBuyer,
  openSessionWithBuyer,
  fetchArkTicketFromBridge,
  checkBridgeHealth,
};

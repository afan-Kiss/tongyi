/**
 * 千帆 PC 原生 UI 同步（ACK 后：右侧气泡 + 左侧倒计时清除）
 */
const crypto = require('crypto');

const NATIVE_SYNC_BRIDGE_SCRIPT = `(function(){
  if (window.__qfNativeSyncInstalled) return { ok: true, already: true };
  window.__qfNativeSyncInstalled = true;

  function pickLonglinkSockets() {
    var list = (window.__qfImpaasSockets || []).filter(function(w){ return w && w.readyState === 1; });
    var longlink = list.filter(function(w){ return String(w.url || '').indexOf('longlink') >= 0; });
    return longlink.length ? longlink : list;
  }

  window.__qfDispatchWsMessage = function(payloadStr) {
    var evt;
    try { evt = new MessageEvent('message', { data: String(payloadStr || '') }); }
    catch (e) { return { fired: 0, error: 'message_event_fail' }; }
    var list = pickLonglinkSockets();
    var fired = 0;
    for (var i = 0; i < list.length; i++) {
      try { list[i].dispatchEvent(evt); fired++; } catch (e2) {}
    }
    return { fired: fired, sockets: list.length };
  };

  window.__qfSendWsPayload = function(payloadStr, appCid) {
    var list = pickLonglinkSockets();
    var pick = window.__qfPickSendSocket && window.__qfPickSendSocket(appCid || '');
    var ws = null;
    if (pick && pick.ok) {
      ws = list.find(function(w){ return String(w.url || '') === pick.url; });
    }
    if (!ws) ws = list.find(function(w){ return (w.__qfSendRank || 0) >= 1; });
    if (!ws) ws = list[0];
    if (!ws) return { ok: false, reason: 'no_ws', count: list.length };
    ws.send(String(payloadStr || ''));
    return { ok: true, url: String(ws.url || ''), count: list.length };
  };

  window.__qfObservePcState = function(appCid, msgId, text) {
    function norm(s) { return String(s || '').replace(/\\s+/g, ' ').trim(); }
    var chatItems = document.querySelectorAll('.chat-item, [class*="chat-item"], [class*="conv"], [class*="session"]');
    var hasCountdown = false;
    for (var i = 0; i < chatItems.length; i++) {
      var el = chatItems[i];
      var t = norm(el.textContent);
      if (!t) continue;
      if (/active|selected|current/i.test(String(el.className || ''))) {
        hasCountdown = /\\d+\\s*秒|倒计时|待回复|未回复|waitReply|countdown/i.test(t + ' ' + el.className);
      }
    }
    var msgRoot = document.querySelector('[class*="msg-list"],[class*="message-list"],[class*="chat-content"],[class*="chat-main"]');
    var bubbleFound = false;
    var bodyHtml = document.body ? (document.body.innerHTML || '') : '';
    if (msgId && bodyHtml.indexOf(msgId) >= 0) bubbleFound = true;
    if (msgRoot && !bubbleFound) {
      var html = msgRoot.innerHTML || '';
      if (msgId && html.indexOf(msgId) >= 0) bubbleFound = true;
      if (!bubbleFound && text && text !== '[图片]' && text !== '[视频]' && text !== '[媒体消息]') {
        bubbleFound = html.indexOf(text) >= 0;
      }
    }
    return {
      pcBubbleInsertedByQianfan: bubbleFound,
      pcCountdownClearedByQianfan: !hasCountdown,
      conversationUpdatedByQianfan: bubbleFound || !hasCountdown,
    };
  };

  return { ok: true };
})()`;

const SYNC_TYPE_PRELUDE = 31010;
const SYNC_TYPE_USER_MESSAGE = 30001;
const DEFAULT_SELLER_TOKEN = '1#1#4#4333439630';

function makeTraceId() {
  return crypto.randomBytes(16).toString('hex');
}

function makeSequenceId() {
  return `${Math.floor(Math.random() * 900 + 100)}.${Date.now()}${Math.floor(Math.random() * 1000)}`;
}

function parseSenderAppUid(extension) {
  if (!extension) return '';
  try {
    const raw = extension.sender;
    const sender = typeof raw === 'string' ? JSON.parse(raw) : raw;
    return sender?.representInfo?.appUid || sender?.presentInfo?.appUid || '';
  } catch {
    return '';
  }
}

function buildSellerExtension(senderAppUid) {
  const uid = String(senderAppUid || DEFAULT_SELLER_TOKEN).trim() || DEFAULT_SELLER_TOKEN;
  const sender = {
    presentInfo: { appUid: uid, type: 'SELLER' },
    representInfo: { appUid: uid, type: 'SELLER' },
  };
  return { sender: JSON.stringify(sender) };
}

function ensureExtensionWithSender(extension, senderAppUid) {
  const ext = { ...(extension || {}) };
  if (!parseSenderAppUid(ext)) {
    Object.assign(ext, buildSellerExtension(senderAppUid));
  }
  return ext;
}

function buildContentInfo101(summary) {
  const text = String(summary || '').trim() || '[媒体消息]';
  return {
    contentType: 101,
    content: JSON.stringify({
      data: JSON.stringify({ content: text, content_type: 1 }),
      summary: text,
      type: 1,
    }),
  };
}

function buildUserMessageFromAck({ ackData, appCid, text, token }) {
  const createAt = Number(ackData?.createAt || Date.now());
  const msgId = String(ackData?.msgId || '').trim();
  const senderAppUid =
    String(ackData?.senderAppUid || '').trim() ||
    parseSenderAppUid(ackData?.extension) ||
    String(token || DEFAULT_SELLER_TOKEN).trim() ||
    DEFAULT_SELLER_TOKEN;

  let contentInfo = ackData?.contentInfo;
  const contentType = Number(contentInfo?.contentType);
  if (!contentInfo) {
    contentInfo = buildContentInfo101(text);
  } else if (contentType === 1 && typeof contentInfo.content !== 'string') {
    contentInfo = buildContentInfo101(text);
  }

  return {
    appCid,
    msgId,
    convType: 1,
    createAt,
    displayStyle: 0,
    contentInfo,
    extension: ensureExtensionWithSender(ackData?.extension, senderAppUid),
    msgReadStatusSetting: ackData?.msgReadStatusSetting ?? 1,
    receiverCount: ackData?.receiverCount ?? 2,
    redPointPolicy: ackData?.redPointPolicy ?? 1,
    senderAppUid,
    status: ackData?.status ?? 0,
    unreadCount: ackData?.unreadCount ?? 0,
  };
}

function buildSyncFrameBase(token) {
  return {
    header: {
      type: 4,
      domain: 'cs',
      seq: 0,
      action: '/sync/unreliable',
      ts: Date.now(),
      qos: 0,
      bizId: 10,
      contentType: 'json',
      sMid: crypto.randomUUID(),
      oneWay: true,
    },
    body: {
      context: {
        eventTime: Date.now(),
        sequenceId: makeSequenceId(),
        reqId: makeTraceId(),
        token: token || DEFAULT_SELLER_TOKEN,
      },
      payload: [],
    },
  };
}

function buildSyncUnreliableFrames({ ackData, appCid, text, token }) {
  const createAt = Number(ackData?.createAt || Date.now());
  const msgId = String(ackData?.msgId || '').trim();
  const sellerToken =
    String(token || '').trim() ||
    parseSenderAppUid(ackData?.extension) ||
    String(ackData?.senderAppUid || '').trim() ||
    DEFAULT_SELLER_TOKEN;
  const userMessage = buildUserMessageFromAck({ ackData, appCid, text, token: sellerToken });

  const prelude = buildSyncFrameBase(sellerToken);
  prelude.body.payload = [{ type: SYNC_TYPE_PRELUDE, data: JSON.stringify({ appCid, msgId, time: createAt }) }];

  const full = buildSyncFrameBase(sellerToken);
  full.header.ts = Date.now();
  full.header.sMid = crypto.randomUUID();
  full.body.context.eventTime = Date.now();
  full.body.context.sequenceId = makeSequenceId();
  full.body.context.reqId = makeTraceId();
  full.body.payload = [
    { type: SYNC_TYPE_USER_MESSAGE, data: JSON.stringify({ time: createAt, userMessage }) },
  ];

  return [prelude, full];
}

function buildReadFromOneFrame({ appCid, msgId, targetAppUid, seq }) {
  return {
    header: {
      sTime: Date.now(),
      seq: Number(seq) > 0 ? Number(seq) : 1,
      type: 3,
      bizId: 10,
      contentType: 'json',
      traceId: makeTraceId(),
      action: '/message/read/from/one',
      serviceId: 'impaas.oim',
      oneWay: true,
    },
    body: {
      msgId,
      appCid,
      targetAppUid,
      convType: 1,
      targetType: 0,
    },
  };
}

async function evalPage(client, expression, awaitPromise = false) {
  const result = await client.Runtime.evaluate({ expression, awaitPromise, returnByValue: true });
  return result?.result?.value;
}

async function installNativeSyncBridge(client) {
  if (!client?.Runtime) return false;
  await client.Runtime.evaluate({ expression: NATIVE_SYNC_BRIDGE_SCRIPT, returnByValue: true }).catch(() => null);
  return true;
}

async function dispatchSyncFrames(client, frames) {
  let totalFired = 0;
  for (const frame of frames) {
    const dispatch = await evalPage(
      client,
      `(function(){
        if (!window.__qfDispatchWsMessage) return { fired: 0, reason: 'no_dispatch' };
        return window.__qfDispatchWsMessage(${JSON.stringify(JSON.stringify(frame))});
      })()`
    );
    totalFired += Number(dispatch?.fired || 0);
    await new Promise((r) => setTimeout(r, 120));
  }
  return totalFired;
}

async function triggerNativeSyncAfterSend(client, ctx) {
  const {
    appCid,
    msgId,
    receiverAppUids,
    text = '[媒体消息]',
    seq = 1,
    token,
    ackData: inputAckData,
  } = ctx;
  const result = {
    syncDispatched: false,
    readFromOneSent: false,
    pcBubbleInsertedByQianfan: false,
    pcCountdownClearedByQianfan: false,
  };

  if (!client?.Runtime || !appCid || !msgId) return result;

  await installNativeSyncBridge(client);

  const ackData = {
    createAt: Date.now(),
    ...(inputAckData || {}),
    msgId,
  };
  const sellerToken =
    String(token || '').trim() ||
    parseSenderAppUid(ackData.extension) ||
    String(ackData.senderAppUid || '').trim() ||
    DEFAULT_SELLER_TOKEN;
  ackData.extension = ensureExtensionWithSender(ackData.extension, sellerToken);

  const targetAppUid = (Array.isArray(receiverAppUids) ? receiverAppUids[0] : '') || '';

  try {
    const frames = buildSyncUnreliableFrames({ ackData, appCid, text, token: sellerToken });
    const fired = await dispatchSyncFrames(client, frames);
    result.syncDispatched = fired > 0;
    await new Promise((r) => setTimeout(r, 200));
    await dispatchSyncFrames(client, [frames[1]]);
  } catch {
    // ignore
  }

  if (targetAppUid) {
    try {
      const readFrame = buildReadFromOneFrame({ appCid, msgId, targetAppUid, seq });
      const readSent = await evalPage(
        client,
        `(function(){
          if (!window.__qfSendWsPayload) return { ok: false };
          return window.__qfSendWsPayload(${JSON.stringify(JSON.stringify(readFrame))}, ${JSON.stringify(appCid)});
        })()`
      );
      result.readFromOneSent = Boolean(readSent?.ok);
    } catch {
      // ignore
    }
  }

  await new Promise((r) => setTimeout(r, 1200));

  try {
    const observed = await evalPage(
      client,
      `(function(){
        if (!window.__qfObservePcState) return null;
        return window.__qfObservePcState(${JSON.stringify(appCid)}, ${JSON.stringify(msgId)}, ${JSON.stringify(text)});
      })()`
    );
    if (observed) {
      result.pcBubbleInsertedByQianfan = Boolean(observed.pcBubbleInsertedByQianfan);
      result.pcCountdownClearedByQianfan = Boolean(observed.pcCountdownClearedByQianfan);
    }
  } catch {
    // ignore
  }

  return result;
}

module.exports = {
  triggerNativeSyncAfterSend,
  installNativeSyncBridge,
  parseSenderAppUid,
  buildSellerExtension,
  NATIVE_SYNC_BRIDGE_SCRIPT,
};

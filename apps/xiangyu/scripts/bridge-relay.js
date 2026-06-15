/**
 * 千帆 HTTP 中继（跑在你电脑上，与千帆工作台同机）
 * 祥钰系统发送图片时 POST 到此服务，由它通过 CDP 连接千帆并走 WebSocket 发给买家。
 *
 * 启动: node scripts/bridge-relay.js
 * 默认: http://127.0.0.1:9323/send  与  /open-session
 */
const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const CDP = require('chrome-remote-interface');
const {
  getCaptureStatus,
  pickUploadTemplate,
  pickPermitTemplate,
  pickWsSendTemplate,
  buildUploadPageScript,
  buildEvaMediaUploadScript,
  installNetworkCapture,
  normalizeCdnUrl,
  syncBotLogTemplates,
} = require('./qianfan-capture-lib');
const { triggerNativeSyncAfterSend, installNativeSyncBridge, parseSenderAppUid, buildSellerExtension } = require('./qianfan-native-sync');

const PORT = Number(process.env.BRIDGE_PORT || 4727);
const DEVTOOLS_HOST = process.env.DEVTOOLS_HOST || '127.0.0.1';

function loadBridgeConfig() {
  try {
    const cfgPath = path.join(__dirname, '../config.json');
    if (fs.existsSync(cfgPath)) {
      return JSON.parse(fs.readFileSync(cfgPath, 'utf8')).bridge || {};
    }
  } catch {
    // ignore
  }
  return {};
}

const bridgeCfg = loadBridgeConfig();
const DEVTOOLS_PORT = Number(
  process.env.DEVTOOLS_PORT || bridgeCfg.devtoolsPort || 9322,
);
const QIANFAN_DATA_DIR =
  process.env.QIANFAN_DATA_DIR ||
  bridgeCfg.qianfanDataDir ||
  path.resolve(__dirname, '../../../千帆中转机器人/dist/win-unpacked/data');

const WS_HOOK_SCRIPT = String.raw`(function(){
  window.__qfImpaasSockets = (window.__qfImpaasSockets || []).filter(function(w){ return w && w.readyState === 1; });
  window.__qfCapturedSessions = window.__qfCapturedSessions || {};
  window.__qfAckEvents = window.__qfAckEvents || [];
  function storeSession(appCid, recv, buyerUserId) {
    if (!appCid || appCid.indexOf('$3$') !== 0) return;
    var entry = { appCid: appCid, receiverAppUids: recv || [], buyerUserId: buyerUserId || '', at: Date.now() };
    window.__qfCapturedSessions[appCid] = entry;
    window.__qfLastAppCid = appCid;
    window.__qfLastAppCidAt = Date.now();
    if (buyerUserId) window.__qfCapturedSessions['uid:' + buyerUserId] = entry;
    else if (recv && recv.length) {
      var uid = String(recv[0] || '').split('#').pop();
      if (uid) window.__qfCapturedSessions['uid:' + uid] = entry;
    }
  }
  function walkCaptureJson(obj, depth) {
    if (!obj || typeof obj !== 'object' || (depth || 0) > 12) return;
    if (Array.isArray(obj)) {
      for (var i = 0; i < obj.length; i++) walkCaptureJson(obj[i], (depth || 0) + 1);
      return;
    }
    var appCid = obj.appCid || obj.conversationId || '';
    if (typeof appCid === 'string' && appCid.indexOf('$3$') === 0) {
      var uid = String(obj.customerId || obj.buyerId || obj.cUserId || obj.buyerUserId || obj.userId || '');
      var recv = Array.isArray(obj.receiverAppUids) ? obj.receiverAppUids : [];
      storeSession(appCid, recv, uid.length >= 10 ? uid : '');
    }
    for (var k in obj) {
      if (Object.prototype.hasOwnProperty.call(obj, k)) walkCaptureJson(obj[k], (depth || 0) + 1);
    }
  }
  function captureFromPayload(s) {
    try {
      var text = String(s || '');
      if (!text.includes('appCid') && text.indexOf('$3$') < 0) return;
      try { walkCaptureJson(JSON.parse(text), 0); } catch (e1) {}
      var re = /"appCid"\s*:\s*"(\$3\$[^"\\]+)"/g;
      var m;
      while ((m = re.exec(text)) !== null) {
        var appCid = m[1];
        var recv = [];
        var recvM = text.match(/"receiverAppUids"\s*:\s*\[([^\]]+)\]/);
        if (recvM) {
          var parts = recvM[1].match(/"([^"]+)"/g) || [];
          for (var i = 0; i < parts.length; i++) recv.push(parts[i].slice(1, -1));
        }
        var uidM = text.match(/"(?:customerId|buyerId|cUserId|buyerUserId|userId)"\s*:\s*"([^"]+)"/);
        var buyerUserId = uidM ? uidM[1] : '';
        storeSession(appCid, recv, buyerUserId.length >= 10 ? buyerUserId : '');
      }
    } catch (e) {}
  }
  function noteAckFrame(raw) {
    try {
      var s = String(raw || '');
      if (s.indexOf('/message/send') < 0) return;
      window.__qfAckEvents.push({ t: Date.now(), raw: s });
      if (window.__qfAckEvents.length > 80) window.__qfAckEvents.shift();
    } catch (e) {}
  }
  function noteSeqFromFrame(raw) {
    try {
      var parsed = JSON.parse(String(raw || ''));
      var seq = Number(parsed.header && parsed.header.seq || 0);
      if (seq > 0) window.__qfLastSendSeq = Math.max(window.__qfLastSendSeq || 0, seq);
    } catch (e) {}
  }
  function hookWsMessage(ws) {
    if (!ws || ws.__qfAckMsgHooked) return;
    ws.__qfAckMsgHooked = true;
    ws.addEventListener('message', function(ev) {
      captureFromPayload(ev && ev.data);
      noteSeqFromFrame(ev && ev.data);
      noteAckFrame(ev && ev.data);
    });
    if (!ws.__qfSendHooked) {
      ws.__qfSendHooked = true;
      var origSend = ws.send.bind(ws);
      ws.send = function(data) {
        noteSeqFromFrame(data);
        return origSend(data);
      };
    }
  }
  window.__qfScanSendAck = function(ctx, sentAfterMs) {
    var events = window.__qfAckEvents || [];
    for (var i = events.length - 1; i >= 0; i--) {
      var ev = events[i];
      if (sentAfterMs && ev.t < sentAfterMs - 200) continue;
      try {
        var parsed = JSON.parse(ev.raw);
        var hdr = parsed.header || {};
        var body = parsed.body || {};
        if (hdr.action !== '/message/send') continue;
        if (Number(hdr.type) === 3) continue;
        if (body.code == null && body.msg == null && !body.data) continue;
        var match = (ctx.traceId && hdr.traceId === ctx.traceId)
          || (ctx.sMid && hdr.sMid === ctx.sMid)
          || (ctx.uuid && ((body.data && body.data.uuid) || body.uuid) === ctx.uuid);
        if (!match) continue;
        if (body.code === 0 && body.data && body.data.msgId) {
          return { ok: true, msgId: String(body.data.msgId), createAt: body.data.createAt, ackParsed: parsed, ackData: body.data || {} };
        }
        if (body.code != null && body.code !== 0) {
          return { ok: false, error: body.msg || ('ACK code ' + body.code) };
        }
      } catch (e) {}
    }
    return null;
  };
  window.__qfScanSendAckLoose = function(sentAfterMs) {
    var events = window.__qfAckEvents || [];
    for (var i = events.length - 1; i >= 0; i--) {
      var ev = events[i];
      if (sentAfterMs && ev.t < sentAfterMs - 500) continue;
      try {
        var parsed = JSON.parse(ev.raw);
        var hdr = parsed.header || {};
        var body = parsed.body || {};
        if (hdr.action !== '/message/send') continue;
        if (Number(hdr.type) === 3) continue;
        if (body.code === 0 && body.data && body.data.msgId) {
          return { ok: true, msgId: String(body.data.msgId), createAt: body.data.createAt, ackData: body.data || {}, loose: true };
        }
        if (body.code != null && body.code !== 0) {
          return { ok: false, error: body.msg || ('ACK code ' + body.code) };
        }
      } catch (e) {}
    }
    return null;
  };
  function track(ws) {
    try {
      if (!ws || ws.readyState !== 1) return;
      var u = String(ws.url || '');
      if (u.includes('longlink') || u.includes('impaas') || u.includes('walle') || u.includes('xiaohongshu') || u.includes('edith')) {
        if (!window.__qfImpaasSockets.includes(ws)) {
          window.__qfImpaasSockets.push(ws);
          if (u.includes('impaas')) ws.__qfSendRank = Math.max(ws.__qfSendRank || 0, 30);
          if (u.includes('longlink')) ws.__qfSendRank = Math.max(ws.__qfSendRank || 0, 10);
        }
        hookWsMessage(ws);
      }
    } catch (e) {}
  }
  window.__qfPickSendSocket = function(appCid) {
    var list = (window.__qfImpaasSockets || []).filter(function(w){ return w && w.readyState === 1; });
    var best = null;
    var bestScore = -1;
    for (var i = 0; i < list.length; i++) {
      var ws = list[i];
      var score = ws.__qfSendRank || 0;
      if (appCid && ws.__qfAppCids && ws.__qfAppCids.indexOf(appCid) >= 0) score += 1000;
      if (score > bestScore) { bestScore = score; best = ws; }
    }
    if (!best) return { ok: false, count: list.length };
    return { ok: true, url: String(best.url || ''), score: bestScore };
  };
  window.__qfNextSendSeq = function() {
    return Math.max((window.__qfLastSendSeq || 0) + 1, 1);
  };
  window.__qfBumpSendSeq = function(seq) {
    var n = Number(seq || 0);
    if (n > 0) window.__qfLastSendSeq = Math.max(window.__qfLastSendSeq || 0, n);
  };
  window.__qfBridgeHooked = window.__qfBridgeHooked || false;
  if (!window.__qfBridgeHooked) {
    window.__qfBridgeHooked = true;
    var Orig = WebSocket;
    function PatchedWebSocket(url, protocols) {
      var ws = protocols !== undefined ? new Orig(url, protocols) : new Orig(url);
      track(ws);
      return ws;
    }
    PatchedWebSocket.prototype = Orig.prototype;
    Object.setPrototypeOf(PatchedWebSocket, Orig);
    window.WebSocket = PatchedWebSocket;
  }
  var existing = window.__qfImpaasSockets || [];
  for (var j = 0; j < existing.length; j++) hookWsMessage(existing[j]);
  return { ok: true, sockets: existing.length };
})()`;

let cachedClient = null;
let cachedShopTitle = '';
const captureWatchClients = new Map();
const sessionSniffer = new Map();

function isCdpTransportError(err) {
  const msg = String(err?.message || err || '');
  return /WebSocket is not open|readyState\s*3|CLOSED|disconnected|Target closed|Protocol error/i.test(msg);
}

async function releaseCdpClient() {
  if (!cachedClient) return;
  try {
    await cachedClient.close();
  } catch {
    // ignore
  }
  cachedClient = null;
  cachedShopTitle = '';
}

function shopMatches(orderShop, ctxShop) {
  const a = normalizeShopKey(orderShop).toLowerCase();
  const b = normalizeShopKey(ctxShop).toLowerCase();
  if (!a || !b) return true;
  return a === b || a.includes(b) || b.includes(a);
}

function readSessionContext() {
  const file = path.join(QIANFAN_DATA_DIR, 'qianfan-session-context.json');
  if (!fs.existsSync(file)) return {};
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return {};
  }
}

function readAppCidReceivers() {
  const file = path.join(QIANFAN_DATA_DIR, 'app-cid-receivers.json');
  if (!fs.existsSync(file)) return {};
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return {};
  }
}

function buildReceiverAppUid(buyerUserId) {
  const uid = String(buyerUserId || '').trim();
  if (!uid) return '';
  return `1#2#2#${uid}`;
}

function sessionSnifferKey(shopTitle, kind, id) {
  return `${normalizeShopKey(shopTitle)}::${kind}::${id}`;
}

function sniffSessionFromText(text, shopTitle) {
  const s = String(text || '');
  if (!s.includes('appCid') && !s.includes('$3$')) return;
  const shop = normalizeShopKey(shopTitle);
  const appCidMatches = [...s.matchAll(/"appCid"\s*:\s*"(\$3\$[^"\\]+)"/g)];
  const uidMatches = [...s.matchAll(/"(?:customerId|buyerId|cUserId|buyerUserId|userId)"\s*:\s*"([^"]+)"/g)];
  const uids = uidMatches.map((m) => m[1]).filter((u) => u.length >= 10);
  const recvMatch = s.match(/"receiverAppUids"\s*:\s*\[([^\]]+)\]/);
  let receivers = [];
  if (recvMatch) {
    receivers = (recvMatch[1].match(/"([^"]+)"/g) || []).map((x) => x.slice(1, -1));
  }
  for (const m of appCidMatches) {
    const appCid = m[1];
    const entry = { appCid, receiverAppUids: receivers, at: Date.now() };
    sessionSniffer.set(sessionSnifferKey(shop, 'cid', appCid), entry);
    for (const uid of uids) {
      sessionSniffer.set(sessionSnifferKey(shop, 'uid', uid), { ...entry, buyerUserId: uid });
    }
    if (receivers.length) {
      const derivedUid = receivers[0].split('#').pop();
      if (derivedUid) {
        sessionSniffer.set(sessionSnifferKey(shop, 'uid', derivedUid), { ...entry, buyerUserId: derivedUid });
      }
    }
  }
}

function getSniffedSession(shopTitle, buyerUserId) {
  const shop = normalizeShopKey(shopTitle);
  const uid = String(buyerUserId || '').trim();
  if (!uid) return null;
  const hit = sessionSniffer.get(sessionSnifferKey(shop, 'uid', uid));
  if (!hit?.appCid) return null;
  const recv =
    hit.receiverAppUids?.length > 0 ? hit.receiverAppUids : [buildReceiverAppUid(uid)].filter(Boolean);
  return {
    appCid: hit.appCid,
    receiverAppUids: recv,
    buyerUserId: uid,
    source: 'network_sniffer',
  };
}

function installSessionSniffer(client, shopTitle) {
  if (client.__sessionSnifferInstalled) return;
  client.__sessionSnifferInstalled = true;
  const shop = normalizeShopKey(shopTitle);
  client.Network.webSocketFrameReceived(({ response }) => {
    if (response?.payloadData) sniffSessionFromText(response.payloadData, shop);
  });
  client.Network.responseReceived(async ({ requestId, response }) => {
    const url = String(response?.url || '');
    if (
      !url.includes('impaas') &&
      !url.includes('walle') &&
      !url.includes('xiaohongshu') &&
      !url.includes('edith')
    ) {
      return;
    }
    try {
      const body = await client.Network.getResponseBody({ requestId });
      const text = body.base64Encoded ? Buffer.from(body.body, 'base64').toString('utf8') : body.body;
      sniffSessionFromText(text, shop);
    } catch {
      // ignore
    }
  });
}

function persistDiscoveredSession({ shopTitle, appCid, buyerUserId }) {
  const shop = normalizeShopKey(shopTitle);
  const uid = String(buyerUserId || '').trim();
  const cid = String(appCid || '').trim();
  if (!shop || !cid || !uid) return;
  const recv = buildReceiverAppUid(uid);
  if (!recv) return;
  try {
    const recvMap = readAppCidReceivers();
    recvMap[`${shop}::${cid}`] = [recv];
    const file = path.join(QIANFAN_DATA_DIR, 'app-cid-receivers.json');
    fs.writeFileSync(file, `${JSON.stringify(recvMap, null, 2)}\n`, 'utf8');
  } catch (err) {
    console.warn('[bridge-relay] 保存会话失败:', err.message || err);
  }
}

async function collectPageAppCids(client) {
  if (!client?.Runtime) return [];
  try {
    const result = await client.Runtime.evaluate({
      expression: `(function(){
        var html = document.documentElement ? document.documentElement.innerHTML : '';
        var re = /\\$3\\$[A-Za-z0-9._+\\/=-]+/g;
        var set = {};
        var m;
        while ((m = re.exec(html)) !== null) set[m[0]] = true;
        return Object.keys(set);
      })()`,
      returnByValue: true,
    });
    return result?.result?.value || [];
  } catch {
    return [];
  }
}

async function clickBuyerNickInPage(client, buyerNick) {
  if (!client?.Runtime || !buyerNick) return false;
  try {
    const result = await client.Runtime.evaluate({
      expression: `(function(){
        var nick = ${JSON.stringify(String(buyerNick))};
        var nodes = document.querySelectorAll('[class*="chat"],[class*="conv"],[class*="session"],[class*="list"] *,li,div');
        for (var i = 0; i < nodes.length; i++) {
          var el = nodes[i];
          if (el.children && el.children.length > 12) continue;
          var text = String(el.textContent || '').trim();
          if (text === nick || (text.length <= 80 && text.indexOf(nick) >= 0)) {
            try { el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true })); } catch (e) {}
            try { el.click(); } catch (e2) {}
            return { clicked: true };
          }
        }
        return { clicked: false };
      })()`,
      returnByValue: true,
    });
    return Boolean(result?.result?.value?.clicked);
  } catch {
    return false;
  }
}

function sessionFromNewAppCids(newCids, buyerUserId, shopTitle) {
  if (!newCids?.length) return null;
  if (newCids.length === 1) {
    const uid = String(buyerUserId || '').trim();
    return {
      appCid: newCids[0],
      receiverAppUids: uid ? [buildReceiverAppUid(uid)].filter(Boolean) : [],
      shopTitle,
      source: 'eva_new_appcid',
    };
  }
  return null;
}

function receiverMatchesUserId(receiverAppUids, buyerUserId) {
  const uid = String(buyerUserId || '').trim();
  if (!uid) return false;
  const list = Array.isArray(receiverAppUids) ? receiverAppUids : [];
  return list.some((r) => String(r || '').endsWith(uid) || String(r || '').includes(uid));
}

function findSessionInContext({ shopTitle, buyerNick, buyerUserId, appCid }) {
  const ctxMap = readSessionContext();
  const shopKey = normalizeShopKey(shopTitle);
  const nick = String(buyerNick || '').trim();
  const uid = String(buyerUserId || '').trim();

  if (appCid) {
    for (const ctx of Object.values(ctxMap)) {
      if (ctx.appCid === appCid && ctx.receiverAppUids?.length) {
        return {
          appCid: ctx.appCid,
          receiverAppUids: ctx.receiverAppUids,
          buyerNick: ctx.buyerNick || nick,
          shopTitle: normalizeShopKey(ctx.shopTitle) || shopTitle,
          source: 'session_context_appCid',
        };
      }
    }
  }

  for (const [key, ctx] of Object.entries(ctxMap)) {
    const ctxShop = normalizeShopKey(ctx.shopTitle || key.split('::')[0]);
    if (shopKey && ctxShop && !shopMatches(shopKey, ctxShop)) continue;
    const ctxNick = String(ctx.buyerNick || '').trim();
    if (nick && ctxNick && ctxNick !== nick && !ctxNick.includes(nick) && !nick.includes(ctxNick)) continue;
    if (uid && ctx.receiverAppUids?.length && !receiverMatchesUserId(ctx.receiverAppUids, uid)) continue;
    if (ctx.appCid && ctx.receiverAppUids?.length) {
      return {
        appCid: ctx.appCid,
        receiverAppUids: ctx.receiverAppUids,
        buyerNick: ctxNick || nick,
        shopTitle: ctxShop || shopTitle,
        source: 'session_context',
      };
    }
  }

  if (nick && !uid) {
    for (const [key, ctx] of Object.entries(ctxMap)) {
      const ctxShop = normalizeShopKey(ctx.shopTitle || key.split('::')[0]);
      if (shopKey && ctxShop && !shopMatches(shopKey, ctxShop)) continue;
      const ctxNick = String(ctx.buyerNick || '').trim();
      if (!ctxNick || (ctxNick !== nick && !ctxNick.includes(nick) && !nick.includes(ctxNick))) continue;
      if (ctx.appCid && ctx.receiverAppUids?.length) {
        return {
          appCid: ctx.appCid,
          receiverAppUids: ctx.receiverAppUids,
          buyerNick: ctxNick,
          shopTitle: ctxShop || shopTitle,
          source: 'session_context_nick',
        };
      }
    }
  }

  const recvMap = readAppCidReceivers();
  for (const [key, receivers] of Object.entries(recvMap)) {
    const [mapShop, mapAppCid] = key.split('::');
    const ctxShop = normalizeShopKey(mapShop);
    if (shopKey && ctxShop && !shopMatches(shopKey, ctxShop)) continue;
    if (!Array.isArray(receivers) || !receivers.length) continue;
    if (uid && !receiverMatchesUserId(receivers, uid)) continue;
    return {
      appCid: mapAppCid,
      receiverAppUids: receivers,
      buyerNick: nick,
      shopTitle: ctxShop || shopTitle,
      source: 'app_cid_receivers',
    };
  }

  if (uid) {
    const uidHits = [];
    for (const [key, receivers] of Object.entries(recvMap)) {
      if (!Array.isArray(receivers) || !receivers.length) continue;
      if (!receiverMatchesUserId(receivers, uid)) continue;
      const [mapShop, mapAppCid] = key.split('::');
      uidHits.push({
        appCid: mapAppCid,
        receiverAppUids: receivers,
        buyerNick: nick,
        shopTitle: normalizeShopKey(mapShop) || shopTitle,
        source: 'app_cid_receivers_uid',
      });
    }
    if (uidHits.length === 1) return uidHits[0];
  }

  return null;
}

function normalizeShopKey(title) {
  return String(title || '')
    .replace(/-工作台\s*$/i, '')
    .trim();
}

function resolveSession({ shopTitle, buyerNick, buyerUserId, appCid, receiverAppUids }) {
  if (appCid && receiverAppUids?.length) {
    return { appCid, receiverAppUids, buyerNick, shopTitle, source: 'request' };
  }

  const found = findSessionInContext({ shopTitle, buyerNick, buyerUserId, appCid });
  if (found) return found;

  const uid = String(buyerUserId || '').trim();
  const derivedReceiver = buildReceiverAppUid(uid);
  if (appCid && derivedReceiver) {
    return {
      appCid,
      receiverAppUids: [derivedReceiver],
      buyerNick,
      shopTitle,
      source: 'derived_receiver',
    };
  }

  throw new Error(
    `找不到买家「${buyerNick || uid || ''}」的会话，请确认千帆里该店铺工作台已打开`
  );
}

function buildEvaUrl({ customerId, sellerId }) {
  const cid = String(customerId || '').trim();
  const sid = String(sellerId || '').trim();
  if (!cid) throw new Error('缺少买家信息，无法打开聊天');
  if (!sid) throw new Error('缺少店铺信息，无法打开聊天');
  return `eva:?type=createChat&customerId=${encodeURIComponent(cid)}&sellerId=${encodeURIComponent(sid)}`;
}

async function openEvaInPage(client, evaUrl) {
  const { Runtime } = client;
  const urlLit = JSON.stringify(evaUrl);
  const methods = [
    `(function(){
      var url = ${urlLit};
      try {
        var a = document.createElement('a');
        a.href = url;
        a.style.display = 'none';
        document.body.appendChild(a);
        a.click();
        a.remove();
        return { ok: true, method: 'anchor.click' };
      } catch (e) { return { ok: false, error: String(e.message || e) }; }
    })()`,
    `(function(){
      var url = ${urlLit};
      try {
        var iframe = document.querySelector('#xiangyuEvaFrame');
        if (!iframe) {
          iframe = document.createElement('iframe');
          iframe.id = 'xiangyuEvaFrame';
          iframe.style.display = 'none';
          document.body.appendChild(iframe);
        }
        iframe.contentWindow.location.href = url;
        return { ok: true, method: 'iframe' };
      } catch (e1) {
        try {
          window.location.href = url;
          return { ok: true, method: 'location.href' };
        } catch (e2) {
          return { ok: false, error: String(e2 && e2.message || e2 || e1) };
        }
      }
    })()`,
  ];
  for (const expr of methods) {
    const result = await Runtime.evaluate({ expression: expr, returnByValue: true });
    const value = result?.result?.value;
    if (value?.ok) return value;
  }
  throw new Error('打不开买家聊天，请联系管理员');
}

function buildDomSessionExpr(buyerNick, buyerUserId) {
  return `(function(){
  function getCid(el) {
    if (!el) return '';
    return el.getAttribute('data-app-cid') || el.getAttribute('data-appcid') || el.getAttribute('data-cid') ||
      (el.dataset && (el.dataset.appCid || el.dataset.appcid || el.dataset.cid)) || '';
  }
  function getCidDeep(el) {
    var cid = getCid(el);
    if (cid) return cid;
    if (!el || !el.querySelector) return '';
    var inner = el.querySelector('[data-app-cid],[data-appcid],[data-cid]');
    return getCid(inner);
  }
  function pickNearestAppCid(html, anchor) {
    if (!html || !anchor) return '';
    var idx = html.indexOf(anchor);
    if (idx < 0) return '';
    var re = /\\$3\\$[A-Za-z0-9._+\\/=-]+/g;
    var best = '', bestDist = 999999;
    var m;
    while ((m = re.exec(html)) !== null) {
      var dist = Math.abs(m.index - idx);
      if (dist < bestDist) { bestDist = dist; best = m[0]; }
    }
    return bestDist < 4000 ? best : '';
  }
  var buyerNick = ${JSON.stringify(String(buyerNick || ''))};
  var buyerUserId = ${JSON.stringify(String(buyerUserId || ''))};
  var map = window.__qfCapturedSessions || {};
  var captured = map['uid:' + buyerUserId];
  if (captured && captured.appCid) return { appCid: captured.appCid, source: 'ws_capture' };
  if (window.__qfLastAppCid && window.__qfLastAppCidAt && Date.now() - window.__qfLastAppCidAt < 60000) {
    return { appCid: window.__qfLastAppCid, source: 'ws_last_appcid' };
  }
  var html = document.documentElement ? document.documentElement.innerHTML : '';
  if (buyerUserId) {
    var near = pickNearestAppCid(html, buyerUserId);
    if (near) return { appCid: near, source: 'html_uid_proximity' };
  }
  if (buyerNick) {
    near = pickNearestAppCid(html, buyerNick);
    if (near) return { appCid: near, source: 'html_nick_proximity' };
  }
  var loc = String(window.location.href || '');
  var locM = loc.match(/\\$3\\$[^&\\s#]+/);
  if (locM) return { appCid: locM[0], source: 'url' };
  var nodes = document.querySelectorAll('[data-app-cid],[data-appcid],[data-cid]');
  var hits = [];
  for (var i = 0; i < nodes.length; i++) {
    var el = nodes[i];
    var appCid = getCid(el);
    if (!appCid || appCid.indexOf('$3$') !== 0) continue;
    var text = String(el.textContent || '').trim();
    var active = !!(el.classList && (el.classList.contains('active') || el.classList.contains('selected') || el.getAttribute('aria-selected') === 'true'));
    hits.push({ appCid: appCid, text: text.slice(0, 80), active: active });
  }
  if (buyerNick) {
    for (var j = 0; j < hits.length; j++) {
      if (hits[j].text.indexOf(buyerNick) >= 0) return hits[j];
    }
    var all = document.querySelectorAll('[class*="chat"],[class*="conv"],[class*="session"],li,div');
    for (var k = 0; k < all.length; k++) {
      var row = all[k];
      var rowText = String(row.textContent || '').trim();
      if (rowText === buyerNick || (rowText.length <= 80 && rowText.indexOf(buyerNick) >= 0)) {
        var rowCid = getCidDeep(row);
        if (rowCid && rowCid.indexOf('$3$') === 0) return { appCid: rowCid, source: 'nick_row' };
      }
    }
  }
  for (var a = 0; a < hits.length; a++) {
    if (hits[a].active) return hits[a];
  }
  if (hits.length === 1) return hits[0];
  var actives = document.querySelectorAll('[class*="active"],[class*="selected"],[aria-selected="true"]');
  for (var b = 0; b < actives.length; b++) {
    var activeCid = getCidDeep(actives[b]);
    if (activeCid && activeCid.indexOf('$3$') === 0) return { appCid: activeCid, source: 'active_el' };
  }
  return null;
})()`;
}

async function readSessionFromDom(client, buyerNick, buyerUserId) {
  if (!client?.Runtime) return null;
  try {
    const result = await client.Runtime.evaluate({
      expression: buildDomSessionExpr(buyerNick, buyerUserId),
      returnByValue: true,
    });
    const hit = result?.result?.value;
    if (!hit?.appCid) return null;
    const uid = String(buyerUserId || '').trim();
    return {
      appCid: hit.appCid,
      receiverAppUids: uid ? [buildReceiverAppUid(uid)] : [],
      buyerNick,
      source: hit.source || 'dom',
    };
  } catch (err) {
    if (isCdpTransportError(err)) await releaseCdpClient();
    return null;
  }
}

async function readCapturedSessionFromPage(client, buyerUserId) {
  if (!client?.Runtime) return null;
  try {
    const uid = String(buyerUserId || '').trim();
    const expr = `(function(){
      var map = window.__qfCapturedSessions || {};
      var hit = map['uid:' + ${JSON.stringify(uid)}] || null;
      if (hit && hit.appCid) return hit;
      return null;
    })()`;
    const result = await client.Runtime.evaluate({ expression: expr, returnByValue: true });
    return result?.result?.value || null;
  } catch (err) {
    if (isCdpTransportError(err)) await releaseCdpClient();
    return null;
  }
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function allocSendSeq(client) {
  if (!client?.Runtime) return 1;
  try {
    const result = await client.Runtime.evaluate({
      expression: `(function(){ return window.__qfNextSendSeq ? window.__qfNextSendSeq() : 1; })()`,
      returnByValue: true,
    });
    const seq = Number(result?.result?.value);
    return seq > 0 ? seq : 1;
  } catch {
    return 1;
  }
}

async function bumpSendSeq(client, seq) {
  if (!client?.Runtime) return;
  const n = Number(seq) || 0;
  if (n <= 0) return;
  try {
    await client.Runtime.evaluate({
      expression: `(function(){ window.__qfBumpSendSeq && window.__qfBumpSendSeq(${n}); return true; })()`,
      returnByValue: true,
    });
  } catch {
    // ignore
  }
}

function enrichSendSession(body, session, templateKind = 'image') {
  const { shopTitle = '祥钰珠宝', buyerNick = '', buyerUserId = '' } = body || {};
  let receiverAppUids = [...(session.receiverAppUids || [])].filter(Boolean);

  const ctxHit = findSessionInContext({
    shopTitle: session.shopTitle || shopTitle,
    buyerNick: session.buyerNick || buyerNick,
    buyerUserId,
    appCid: session.appCid,
  });
  if (!receiverAppUids.length && ctxHit?.receiverAppUids?.length) {
    receiverAppUids = [...ctxHit.receiverAppUids];
  }

  const manualTemplate = pickWsSendTemplate(QIANFAN_DATA_DIR, templateKind);
  if (!receiverAppUids.length && manualTemplate?.receiverAppUids?.length) {
    receiverAppUids = [...manualTemplate.receiverAppUids];
  }

  const uid = String(buyerUserId || '').trim();
  if (!receiverAppUids.length && uid) {
    const derived = buildReceiverAppUid(uid);
    if (derived) receiverAppUids = [derived];
  }

  if (!session.appCid) {
    throw new Error(`找不到买家「${buyerNick || uid || ''}」的会话，请确认千帆里该店铺工作台已打开`);
  }
  if (!receiverAppUids.length) {
    throw new Error('缺少 receiverAppUids，无法向买家发送');
  }

  return {
    ...session,
    shopTitle: session.shopTitle || shopTitle,
    buyerNick: session.buyerNick || buyerNick,
    receiverAppUids,
  };
}

async function waitForSession({ shopTitle, buyerNick, buyerUserId, timeoutMs = 25000, beforeAppCids = null }) {
  const started = Date.now();
  let lastReconnectAt = 0;

  while (Date.now() - started < timeoutMs) {
    const found = findSessionInContext({ shopTitle, buyerNick, buyerUserId });
    if (found?.appCid && found.receiverAppUids?.length) return found;

    const sniffed = getSniffedSession(shopTitle, buyerUserId);
    if (sniffed?.appCid) {
      return { ...sniffed, buyerNick, shopTitle };
    }

    const now = Date.now();
    if (now - lastReconnectAt >= 1200) {
      lastReconnectAt = now;
      try {
        const client = await getCdpClient(shopTitle, { force: true });
        const domHit = await readSessionFromDom(client, buyerNick, buyerUserId);
        if (domHit?.appCid) {
          const recv =
            domHit.receiverAppUids?.length > 0
              ? domHit.receiverAppUids
              : [buildReceiverAppUid(buyerUserId)].filter(Boolean);
          return { ...domHit, receiverAppUids: recv, shopTitle };
        }

        const captured = await readCapturedSessionFromPage(client, buyerUserId);
        if (captured?.appCid) {
          const recv =
            captured.receiverAppUids?.length > 0
              ? captured.receiverAppUids
              : [buildReceiverAppUid(buyerUserId)].filter(Boolean);
          return {
            appCid: captured.appCid,
            receiverAppUids: recv,
            buyerNick,
            shopTitle,
            source: 'ws_capture',
          };
        }

        if (beforeAppCids) {
          const afterCids = await collectPageAppCids(client);
          const newCids = afterCids.filter((c) => !beforeAppCids.includes(c));
          const fromNew = sessionFromNewAppCids(newCids, buyerUserId, shopTitle);
          if (fromNew?.appCid) {
            return { ...fromNew, buyerNick };
          }
        }
      } catch (err) {
        if (!isCdpTransportError(err)) {
          console.warn('[bridge-relay] waitForSession reconnect:', err.message || err);
        }
        await releaseCdpClient();
      }
    }

    await sleep(400);
  }
  return null;
}

async function handleOpenSession(body) {
  const {
    shopTitle = '祥钰珠宝',
    buyerNick = '',
    buyerUserId = '',
    sellerId = '',
    packageId = '',
    orderId = '',
  } = body || {};

  const uid = String(buyerUserId || '').trim();
  if (!uid) {
    throw new Error('缺少买家信息，无法打开聊天');
  }

  const existing = findSessionInContext({ shopTitle, buyerNick, buyerUserId: uid });
  if (existing?.appCid) {
    return { ok: true, created: false, session: existing };
  }

  const client = await getCdpClient(shopTitle);
  const beforeCids = await collectPageAppCids(client);
  const evaUrl = buildEvaUrl({
    customerId: uid,
    sellerId,
  });

  console.log('[bridge-relay] 打开千帆会话', { shopTitle, buyerNick, buyerUserId: uid, evaUrl, orderId });
  const evaResult = await openEvaInPage(client, evaUrl);
  console.log('[bridge-relay] eva 已触发', evaResult);

  await sleep(600);
  const clicked = await clickBuyerNickInPage(client, buyerNick);
  if (clicked) console.log('[bridge-relay] 已点击买家会话行', { buyerNick });
  await sleep(500);

  const session = await waitForSession({
    shopTitle,
    buyerNick,
    buyerUserId: uid,
    timeoutMs: 45000,
    beforeAppCids: beforeCids,
  });

  if (!session?.appCid) {
    const derivedReceiver = buildReceiverAppUid(uid);
    console.warn('[bridge-relay] 未在超时内拿到 appCid，千帆可能已打开会话', { shopTitle, buyerNick, uid });
    return {
      ok: true,
      created: true,
      pending: true,
      evaTriggered: true,
      evaUrl,
      session: {
        appCid: '',
        receiverAppUids: derivedReceiver ? [derivedReceiver] : [],
        buyerNick,
        shopTitle,
        buyerUserId: uid,
        source: 'eva_pending',
      },
      message: '买家聊天已打开，拍完照直接点发送就行',
    };
  }

  console.log('[bridge-relay] 会话就绪', {
    shopTitle,
    buyerNick,
    appCid: session.appCid,
    source: session.source,
  });

  persistDiscoveredSession({ shopTitle, appCid: session.appCid, buyerUserId: uid });

  return { ok: true, created: true, session, evaUrl };
}

async function fetchDevtoolsTargets() {
  const url = `http://${DEVTOOLS_HOST}:${DEVTOOLS_PORT}/json/list`;
  let res;
  try {
    res = await fetch(url);
  } catch {
    throw new Error(`千帆客服未连接，请先打开千帆客服工作台（调试端口 ${DEVTOOLS_PORT}）`);
  }
  if (!res.ok) throw new Error(`千帆 DevTools 异常 (${res.status})，请重启千帆客服工作台`);
  return res.json();
}

function pickShopTarget(targets, shopTitle) {
  const key = normalizeShopKey(shopTitle).toLowerCase();
  const pages = targets.filter((t) => t.type === 'page');
  let best = null;
  let bestScore = -1;

  for (const p of pages) {
    const title = String(p.title || '').toLowerCase();
    const url = String(p.url || '').toLowerCase();
    if (!url.includes('walle.xiaohongshu.com') && !title.includes('工作台')) continue;

    let score = 0;
    if (title.includes(key)) score += 100;
    else if (key && [...key].every((ch) => title.includes(ch)) && title.includes('工作台')) score += 60;
    else if (key.length >= 2 && title.includes(key.slice(0, 2)) && title.includes('工作台')) score += 40;

    if (title.includes('工作台')) score += 10;
    if (url.includes('walle.xiaohongshu.com/cstools/seller/dashboard')) score += 5;

    if (score > bestScore) {
      bestScore = score;
      best = p;
    }
  }

  if (best) return best;
  const dashboard = pages.find((p) => String(p.url || '').includes('walle.xiaohongshu.com/cstools/seller/dashboard'));
  return dashboard || pages[0] || null;
}

function extractShopTitleFromPageTitle(pageTitle) {
  const title = String(pageTitle || '').trim();
  if (!title) return '';
  return title.replace(/[-–—]\s*工作台.*$/i, '').trim();
}

function listQianfanShopPages(targets) {
  const pages = (targets || []).filter((t) => t.type === 'page');
  const out = [];
  const seen = new Set();
  for (const p of pages) {
    const url = String(p.url || '');
    const title = String(p.title || '');
    if (!url.includes('walle.xiaohongshu.com') && !title.includes('工作台')) continue;
    const shopTitle = extractShopTitleFromPageTitle(title) || title;
    const shopKey = normalizeShopKey(shopTitle).toLowerCase();
    if (!shopKey || seen.has(shopKey)) continue;
    seen.add(shopKey);
    out.push({ ...p, shopTitle, shopKey });
  }
  return out;
}

async function connectCaptureWatcher(pageInfo) {
  const { shopKey, shopTitle, webSocketDebuggerUrl } = pageInfo;
  if (!webSocketDebuggerUrl || captureWatchClients.has(shopKey)) return captureWatchClients.get(shopKey);

  const client = await CDP({ target: webSocketDebuggerUrl });
  const { Runtime, Page, Network } = client;
  await Runtime.enable();
  await Page.enable();
  await Network.enable();
  await Runtime.evaluate({ expression: WS_HOOK_SCRIPT, returnByValue: true });
  installSessionSniffer(client, shopTitle);
  installNetworkCapture(client, { dataDir: QIANFAN_DATA_DIR, shopTitle });

  captureWatchClients.set(shopKey, client);
  console.log(`[bridge-capture] 已监听店铺「${shopTitle}」，手动发图/视频时会在此终端输出`);
  return client;
}

async function armCaptureWatchers() {
  try {
    const targets = await fetchDevtoolsTargets();
    const shops = listQianfanShopPages(targets);
    if (!shops.length) {
      console.warn('[bridge-capture] 未找到千帆工作台页面，请打开千帆客服工作台');
      return;
    }
    for (const shop of shops) {
      try {
        await connectCaptureWatcher(shop);
      } catch (err) {
        console.warn(`[bridge-capture] 连接「${shop.shopTitle}」失败:`, err.message || err);
      }
    }
  } catch (err) {
    console.warn('[bridge-capture] DevTools 不可用:', err.message || err);
  }
}

function logCaptureStatus() {
  const status = getCaptureStatus(QIANFAN_DATA_DIR);
  for (const kind of ['image', 'video']) {
    const s = status[kind] || {};
    const label = kind === 'video' ? '视频' : '图片';
    const parts = [];
    if (s.send || s.botLogSend) parts.push('WS发送✓');
    else parts.push('WS发送✗');
    if (s.upload) parts.push('HTTP上传✓');
    else parts.push('HTTP上传✗(需在 bridge 运行时再手动发一次)');
    console.log(`[bridge-capture] ${label}: ${parts.join(' ')}`);
  }
}

async function getCdpClient(shopTitle, options = {}) {
  const { force = false } = options;
  const shopKey = normalizeShopKey(shopTitle);
  if (!force && cachedClient && cachedShopTitle === shopKey) {
    try {
      await cachedClient.Runtime.evaluate({ expression: '1+1', returnByValue: true });
      return cachedClient;
    } catch {
      await releaseCdpClient();
    }
  }

  const targets = await fetchDevtoolsTargets();
  const target = pickShopTarget(targets, shopTitle);
  if (!target?.webSocketDebuggerUrl) {
    throw new Error(`未找到店铺「${shopTitle}」的千帆页面，请确认千帆客服工作台已打开`);
  }

  await releaseCdpClient();

  const client = await CDP({ target: target.webSocketDebuggerUrl });
  const { Runtime, Page, Network } = client;
  await Runtime.enable();
  await Page.enable();
  await Network.enable();
  await Runtime.evaluate({ expression: WS_HOOK_SCRIPT, returnByValue: true });
  installSessionSniffer(client, shopKey);
  installNetworkCapture(client, { dataDir: QIANFAN_DATA_DIR, shopTitle: shopKey });

  cachedClient = client;
  cachedShopTitle = shopKey;
  return client;
}

function makeTraceId() {
  return crypto.randomBytes(16).toString('hex');
}

function makeSMid() {
  return `${crypto.randomBytes(6).toString('hex')}-${Date.now().toString(16).slice(-12)}`;
}

function makeUuid(prefix = 'img') {
  return `${prefix}-${crypto.randomBytes(8).toString('hex')}-${Date.now().toString(16)}`;
}

async function measureImageSize(client, imageBase64) {
  const { Runtime } = client;
  const expr = `(function(b64){
    return new Promise(function(resolve) {
      var img = new Image();
      img.onload = function(){ resolve({ width: img.naturalWidth || 1080, height: img.naturalHeight || 1920 }); };
      img.onerror = function(){ resolve({ width: 1080, height: 1920 }); };
      img.src = b64.indexOf('data:') === 0 ? b64 : ('data:image/jpeg;base64,' + b64);
    });
  })(${JSON.stringify(imageBase64)})`;
  const result = await Runtime.evaluate({ expression: expr, awaitPromise: true, returnByValue: true });
  return result?.result?.value || { width: 1080, height: 1920 };
}

async function readImTokenFromPage(client) {
  if (!client?.Runtime) return '';
  try {
    const result = await client.Runtime.evaluate({
      expression: `(function(){
        function pick(str) {
          var m = String(str || '').match(/mario\\.token\\.[A-Za-z0-9]+/i);
          return m ? m[0] : '';
        }
        try {
          for (var i = 0; i < localStorage.length; i++) {
            var t = pick(localStorage.getItem(localStorage.key(i)));
            if (t) return t;
          }
        } catch (e) {}
        try {
          for (var j = 0; j < sessionStorage.length; j++) {
            var t2 = pick(sessionStorage.getItem(sessionStorage.key(j)));
            if (t2) return t2;
          }
        } catch (e) {}
        return '';
      })()`,
      returnByValue: true,
    });
    return result?.result?.value || '';
  } catch {
    return '';
  }
}

function extractImTokenFromUrl(url) {
  try {
    return new URL(String(url || '')).searchParams.get('im_token') || '';
  } catch {
    return '';
  }
}

async function uploadMediaInPage(client, fileBase64, kind = 'image', meta = {}) {
  const permitTpl = pickPermitTemplate(QIANFAN_DATA_DIR, kind);
  const pageImToken = await readImTokenFromPage(client);
  const templateImToken = extractImTokenFromUrl(permitTpl?.url);
  const imToken = pageImToken || templateImToken;
  let lastError = '';
  if (permitTpl?.url) {
    const mime = kind === 'video' ? 'video/mp4' : 'image/jpeg';
    const filename = kind === 'video' ? 'xiangyu.mp4' : 'xiangyu.jpg';
    const { Runtime } = client;
    const expr = buildEvaMediaUploadScript({
      permitUrl: permitTpl.url,
      fileBase64,
      kind,
      mime,
      filename,
      meta,
      imToken,
    });
    const result = await Runtime.evaluate({ expression: expr, awaitPromise: true, returnByValue: true });
    const value = result?.result?.value;
    if (value?.ok && value.fileId) {
      console.log('[bridge-relay] eva 上传成功', { kind, fileId: value.fileId, method: value.method });
      return {
        ...value,
        width: meta.width || value.width,
        height: meta.height || value.height,
      };
    }
    console.warn('[bridge-relay] eva 上传失败', {
      error: value?.error || value?.detail,
      hasImToken: value?.hasImToken,
      pageImToken: Boolean(pageImToken),
      templateImToken: Boolean(templateImToken),
    });
    lastError = value?.error || value?.detail || '';
  }

  const label = kind === 'video' ? '视频' : '图片';
  const detail = String(lastError).trim();
  throw new Error(
    detail
      ? `${label}上传失败：${detail}`
      : `${label}上传失败，请确认千帆已登录并在工作台手动发一次${label}后再试`
  );
}

async function uploadImageInPage(client, imageBase64) {
  return uploadMediaInPage(client, imageBase64, 'image');
}

function isUsableTextManualTemplate(manualTemplate, appCid) {
  const body = manualTemplate?.template?.body;
  if (!body) return false;
  const templateAppCid = String(body.appCid || manualTemplate.appCid || '').trim();
  const targetAppCid = String(appCid || '').trim();
  if (templateAppCid && targetAppCid && templateAppCid !== targetAppCid) return false;
  const contentType = Number(body.contentInfo?.contentType ?? 1);
  return contentType === 1;
}

function buildTextSendPayload({ appCid, receiverAppUids, text, seq = 1, manualTemplate = null }) {
  const traceId = makeTraceId();
  const sMid = makeSMid();
  const uuid = makeUuid('text');
  const safeText = String(text || '').trim();
  if (!safeText) throw new Error('文案不能为空');

  const uids = Array.isArray(receiverAppUids) ? receiverAppUids.filter(Boolean) : [];
  const useManual = isUsableTextManualTemplate(manualTemplate, appCid);
  const manualBody = useManual ? manualTemplate.template.body : null;
  const manualHeader = useManual ? manualTemplate.template.header : null;

  const payload = {
    header: {
      sTime: Date.now(),
      seq,
      type: 3,
      bizId: Number(manualHeader?.bizId) > 0 ? Number(manualHeader.bizId) : 10,
      contentType: 'json',
      traceId,
      action: '/message/send',
      serviceId: 'impaas.oi',
      oneWay: false,
      sMid,
    },
    body: {
      appCid,
      convType: Number(manualBody?.convType) > 0 ? Number(manualBody.convType) : 1,
      uuid,
      receiverAppUids: uids,
      contentInfo: {
        contentType: 1,
        content: safeText,
      },
      convCreateIsSelfVisible: manualBody?.convCreateIsSelfVisible !== false,
      convRedPointIsNotSelfClear: manualBody?.convRedPointIsNotSelfClear !== false,
      extension: {
        additionInfo: JSON.stringify({
          uuid: crypto.randomUUID(),
          sendMsgDoubleCheck: false,
        }),
      },
      callbackCtx: {},
    },
  };

  return {
    payloadStr: JSON.stringify(payload),
    traceId,
    sMid,
    uuid,
    usedManualTemplate: useManual,
  };
}

async function deliverTextMessage(client, sendSession, { text, seq, shopTitle, buyerNick, orderId = '' }) {
  const safeText = String(text || '').trim();
  if (!safeText) throw new Error('请先填写要发送的文字');

  const manualTemplate = pickWsSendTemplate(QIANFAN_DATA_DIR, 'text');
  const built = buildTextSendPayload({
    appCid: sendSession.appCid,
    receiverAppUids: sendSession.receiverAppUids,
    text: safeText,
    seq,
    manualTemplate,
  });
  if (built.usedManualTemplate) {
    console.log('[bridge-relay] 使用已录制的文字发送 WS 模板');
  }

  const sent = await sendPayloadViaWs(client, built.payloadStr, sendSession.appCid);
  let sendContentInfo = null;
  try {
    sendContentInfo = JSON.parse(built.payloadStr)?.body?.contentInfo || null;
  } catch {
    sendContentInfo = null;
  }
  const { ack, syncResult } = await confirmSendAndSync(client, sendSession, built, safeText.slice(0, 80), {
    skipNativeSync: false,
    allowLooseAck: false,
    contentInfo: sendContentInfo,
  });
  await refreshConversationAfterSend(client, sendSession.buyerNick || buyerNick);

  console.log('[bridge-relay] 文字已发送', {
    shopTitle: sendSession.shopTitle || shopTitle,
    buyerNick: sendSession.buyerNick || buyerNick,
    orderId,
    ws: sent.url,
    traceId: built.traceId,
    msgId: ack.msgId,
    seq,
  });

  return buildSendReceipt({
    ack,
    syncResult,
    session: sendSession,
    built,
    mediaType: 'text',
  });
}

async function handleSendText(body) {
  const { shopTitle = '祥钰珠宝', buyerNick = '', orderId = '' } = body || {};
  const session = enrichSendSession(body, await resolveSessionForSend(body), 'text');
  const client = await getCdpClient(session.shopTitle || shopTitle, { force: true });
  const seq = await allocSendSeq(client);
  const receipt = await deliverTextMessage(client, session, {
    text: body.text,
    seq,
    shopTitle,
    buyerNick,
    orderId,
  });
  await bumpSendSeq(client, seq);
  return receipt;
}

function buildImageSendPayload({
  appCid,
  receiverAppUids,
  imageUrl,
  width = 1080,
  height = 1920,
  seq = 1,
  manualTemplate = null,
  uploadResult = null,
}) {
  const traceId = makeTraceId();
  const sMid = makeSMid();
  const uuid = makeUuid('img');
  const url = normalizeCdnUrl(imageUrl);

  if (manualTemplate?.template) {
    const payload = JSON.parse(JSON.stringify(manualTemplate.template));
    payload.header = { ...(payload.header || {}) };
    payload.header.sTime = Date.now();
    payload.header.seq = seq;
    payload.header.type = 3;
    payload.header.traceId = traceId;
    payload.header.sMid = sMid;
    payload.header.action = '/message/send';
    payload.header.serviceId = 'impaas.oi';

    payload.body = { ...(payload.body || {}) };
    payload.body.appCid = appCid;
    payload.body.uuid = uuid;
    payload.body.receiverAppUids = receiverAppUids;
    payload.body.convType = payload.body.convType || 1;
    payload.body.callbackCtx = payload.body.callbackCtx || {};
    if (payload.body.contentInfo) payload.body.contentInfo.contentType = 2;

    if (payload.body.extension?.additionInfo) {
      payload.body.extension.additionInfo = JSON.stringify({ extType: '' });
    }

    const content = payload.body.contentInfo?.content;
    if (content && typeof content === 'object') {
      if (content.extension && typeof content.extension === 'object') {
        delete content.extension.resource;
      }
      delete content.url;
    }
    if (uploadResult?.resource && content && typeof content === 'object') {
      content.width = uploadResult.width || width;
      content.height = uploadResult.height || height;
      content.size = content.size || '';
      content.extension = content.extension || {};
      content.extension.resource = JSON.stringify(uploadResult.resource);
    } else if (manualTemplate?.template) {
      throw new Error('图片上传未得到 fileId，请确认千帆已登录后重试');
    } else if (content && typeof content === 'object' && url) {
      content.url = url;
      content.width = width;
      content.height = height;
    }

    return { payloadStr: JSON.stringify(payload), traceId, sMid, uuid, usedManualTemplate: true };
  }

  const resource = uploadResult?.resource
    ? JSON.stringify(uploadResult.resource)
    : '{}';

  return {
    payloadStr: JSON.stringify({
      header: {
        sTime: Date.now(),
        seq,
        type: 3,
        bizId: 10,
        contentType: 'json',
        traceId,
        action: '/message/send',
        serviceId: 'impaas.oi',
        oneWay: false,
        sMid,
      },
      body: {
        appCid,
        convType: 1,
        uuid,
        receiverAppUids,
        contentInfo: {
          contentType: 2,
          content: {
            width,
            height,
            size: '',
            extension: { resource },
            url: uploadResult?.resource ? undefined : url,
          },
        },
        convCreateIsSelfVisible: true,
        convRedPointIsNotSelfClear: true,
        extension: {
          additionInfo: JSON.stringify({ extType: '', uuid: crypto.randomUUID(), sendMsgDoubleCheck: false }),
        },
        callbackCtx: {},
      },
    }),
    traceId,
    sMid,
    uuid,
    usedManualTemplate: false,
  };
}

function normalizeVideoFileId(fileId) {
  const id = String(fileId || '').trim();
  if (!id) return id;
  if (/\.mp4$/i.test(id)) return id;
  if (id.includes('evanewsdk/')) return `${id}.mp4`;
  return id;
}

function normalizeVideoMeta(videoMeta = {}) {
  const width = Math.max(1, Number(videoMeta.width) || 720);
  const height = Math.max(1, Number(videoMeta.height) || 1280);
  let duration = Number(videoMeta.duration);
  if (!Number.isFinite(duration) || duration <= 0) duration = 1;
  return {
    width,
    height,
    duration,
    dimension: videoMeta.dimension || `${width}*${height}`,
  };
}

function buildVideoSendPayload({
  appCid,
  receiverAppUids,
  videoMeta,
  coverResource,
  videoResource,
  seq = 1,
  manualTemplate = null,
  fileName = 'xiangyu.mp4',
}) {
  const traceId = makeTraceId();
  const sMid = makeSMid();
  const uuid = makeUuid('video');

  const meta = normalizeVideoMeta(videoMeta);

  const innerContent = {
    name: /\.mp4$/i.test(fileName) ? fileName : `${fileName.replace(/\.[^.]+$/, '') || 'xiangyu'}.mp4`,
    coverPictureResource: coverResource,
    originResource: videoResource,
    trancodeResource: videoResource,
    duration: meta.duration,
    dimension: meta.dimension,
  };

  if (manualTemplate?.template) {
    const payload = JSON.parse(JSON.stringify(manualTemplate.template));
    payload.header = { ...(payload.header || {}) };
    payload.header.sTime = Date.now();
    payload.header.seq = seq;
    payload.header.traceId = traceId;
    payload.header.sMid = sMid;
    payload.header.action = '/message/send';
    payload.header.serviceId = 'impaas.oi';

    payload.body = { ...(payload.body || {}) };
    payload.body.appCid = appCid;
    payload.body.uuid = uuid;
    payload.body.receiverAppUids = receiverAppUids;

    if (payload.body.contentInfo?.content && typeof payload.body.contentInfo.content === 'object') {
      payload.body.contentInfo.content.type = 73;
      payload.body.contentInfo.content.data = JSON.stringify({
        content: innerContent,
        content_type: 73,
      });
    }

    return { payloadStr: JSON.stringify(payload), traceId, sMid, uuid, usedManualTemplate: true };
  }

  return {
    payloadStr: JSON.stringify({
      header: {
        sTime: Date.now(),
        seq,
        type: 3,
        bizId: 10,
        contentType: 'json',
        traceId,
        action: '/message/send',
        serviceId: 'impaas.oi',
        oneWay: false,
        sMid,
      },
      body: {
        appCid,
        convType: 1,
        uuid,
        receiverAppUids,
        contentInfo: {
          contentType: 101,
          content: {
            type: 73,
            data: JSON.stringify({ content: innerContent, content_type: 73 }),
          },
        },
        convCreateIsSelfVisible: true,
        convRedPointIsNotSelfClear: true,
        extension: {},
        callbackCtx: {},
      },
    }),
    traceId,
    sMid,
    uuid,
    usedManualTemplate: false,
  };
}

async function sendPayloadViaWs(client, payloadStr, appCid) {
  const { Runtime } = client;
  const expr = `(function(){
    var payloadStr = ${JSON.stringify(payloadStr)};
    var appCid = ${JSON.stringify(appCid)};
    var pick = window.__qfPickSendSocket && window.__qfPickSendSocket(appCid);
    var list = window.__qfImpaasSockets || [];
    var ws = null;
    if (pick && pick.ok) {
      ws = list.find(function(w){ return w && w.readyState === 1 && String(w.url||'') === pick.url; });
    }
    if (!ws) ws = list.find(function(w){ return w && w.readyState === 1; });
    if (!ws) return { ok: false, reason: 'no_ws', count: list.length };
    ws.send(payloadStr);
    return { ok: true, url: String(ws.url || ''), count: list.length };
  })()`;
  const result = await Runtime.evaluate({ expression: expr, returnByValue: true });
  const value = result?.result?.value;
  if (!value?.ok) {
    throw new Error('未找到可用的千帆连接，请确认千帆客服软件已打开');
  }
  return value;
}

const ACK_TIMEOUT_MS = 15000;

function mapAckErrorMessage(raw) {
  const s = String(raw || '').trim();
  if (/extension\.sender|imMessageToRim/i.test(s)) {
    return '千帆处理消息失败，请重启千帆客服后再试';
  }
  if (/超时|timeout/i.test(s)) {
    return '千帆未确认收到消息，请稍后在千帆里检查是否发送成功';
  }
  return s || '发送失败，请稍后再试';
}

function parseAckFromFrame(raw, ctx, { strict = true } = {}) {
  try {
    const parsed = JSON.parse(String(raw || ''));
    const hdr = parsed?.header || {};
    const body = parsed?.body || {};
    if (hdr.action !== '/message/send') return null;
    if (Number(hdr.type) === 3) return null;
    if (body.code == null && body.msg == null && !body.data) return null;
    if (strict) {
      const dataUuid = body.data?.uuid || body.uuid;
      const match =
        (ctx.traceId && hdr.traceId === ctx.traceId) ||
        (ctx.sMid && hdr.sMid === ctx.sMid) ||
        (ctx.uuid && dataUuid === ctx.uuid);
      if (!match) return null;
    }
    if (body.code === 0 && body.data?.msgId) {
      return {
        msgId: String(body.data.msgId),
        createAt: body.data.createAt,
        ackData: body.data || {},
        ackSource: strict ? 'page' : 'loose',
      };
    }
    if (body.code != null && body.code !== 0) {
      return { error: new Error(mapAckErrorMessage(body.msg || `ACK code ${body.code}`)) };
    }
  } catch {
    // ignore
  }
  return null;
}

async function scanPageSendAckLoose(client, sentAfterMs) {
  const { Runtime } = client;
  const result = await Runtime.evaluate({
    expression: `(function(){
      return window.__qfScanSendAckLoose && window.__qfScanSendAckLoose(${Number(sentAfterMs) || 0});
    })()`,
    returnByValue: true,
  });
  const value = result?.result?.value;
  if (!value) return null;
  if (value.ok && value.msgId) {
    return {
      msgId: String(value.msgId),
      createAt: value.createAt,
      ackData: value.ackData || {},
      ackSource: 'loose',
    };
  }
  if (value.error) {
    throw new Error(mapAckErrorMessage(value.error));
  }
  return null;
}

async function scanPageSendAck(client, ctx, sentAfterMs) {
  const { Runtime } = client;
  const result = await Runtime.evaluate({
    expression: `(function(){
      return window.__qfScanSendAck && window.__qfScanSendAck(
        ${JSON.stringify({ traceId: ctx.traceId, sMid: ctx.sMid, uuid: ctx.uuid })},
        ${Number(sentAfterMs) || 0}
      );
    })()`,
    returnByValue: true,
  });
  const value = result?.result?.value;
  if (!value) return null;
  if (value.ok && value.msgId) {
    return {
      msgId: String(value.msgId),
      createAt: value.createAt,
      ackData: value.ackData || {},
      ackSource: 'page',
    };
  }
  if (value.error) {
    throw new Error(mapAckErrorMessage(value.error));
  }
  return null;
}

async function waitForSendAck(client, ctx, sentAfterMs, options = {}) {
  const { timeoutMs = ACK_TIMEOUT_MS, allowLoose = true } = options;
  let cdpHit = null;
  let cdpError = null;
  let done = false;

  const onCdpFrame = ({ response }) => {
    if (done) return;
    const parsed = parseAckFromFrame(response?.payloadData, ctx, { strict: true });
    if (!parsed) return;
    if (parsed.error) {
      cdpError = parsed.error;
      return;
    }
    if (parsed.msgId) cdpHit = { ...parsed, ackSource: 'cdp' };
  };

  try {
    if (client?.Network) {
      await client.Network.enable().catch(() => null);
      client.Network.webSocketFrameReceived(onCdpFrame);
    }
  } catch {
    // ignore
  }

  const deadline = Date.now() + timeoutMs;
  const strictUntil = Date.now() + Math.min(8000, timeoutMs - 2000);

  try {
    while (Date.now() < deadline) {
      if (cdpHit?.msgId) return cdpHit;
      if (cdpError) throw cdpError;

      const pageHit = await scanPageSendAck(client, ctx, sentAfterMs);
      if (pageHit?.msgId) return pageHit;

      if (allowLoose && Date.now() >= strictUntil) {
        const loose = await scanPageSendAckLoose(client, sentAfterMs);
        if (loose?.msgId) {
          console.log('[bridge-relay] ACK 宽松匹配 msgId=', loose.msgId);
          return loose;
        }
      }

      await sleep(150);
    }

    if (allowLoose) {
      const loose = await scanPageSendAckLoose(client, sentAfterMs);
      if (loose?.msgId) {
        console.log('[bridge-relay] ACK 超时后宽松匹配 msgId=', loose.msgId);
        return loose;
      }
    }

    throw new Error(mapAckErrorMessage('ACK timeout'));
  } finally {
    done = true;
  }
}

async function lookupSessionFromPage(shopTitle, buyerNick, buyerUserId) {
  const sniffed = getSniffedSession(shopTitle, buyerUserId);
  if (sniffed?.appCid) {
    return { ...sniffed, buyerNick, shopTitle };
  }
  try {
    const client = await getCdpClient(shopTitle, { force: false });
    const domHit = await readSessionFromDom(client, buyerNick, buyerUserId);
    if (domHit?.appCid) {
      const uid = String(buyerUserId || '').trim();
      const recv =
        domHit.receiverAppUids?.length > 0
          ? domHit.receiverAppUids
          : [buildReceiverAppUid(uid)].filter(Boolean);
      return { ...domHit, receiverAppUids: recv, shopTitle: shopTitle || domHit.shopTitle, source: 'dom' };
    }
    const captured = await readCapturedSessionFromPage(client, buyerUserId);
    if (captured?.appCid) {
      return {
        appCid: captured.appCid,
        receiverAppUids: captured.receiverAppUids || [buildReceiverAppUid(buyerUserId)].filter(Boolean),
        buyerNick,
        shopTitle,
        source: 'ws_capture',
      };
    }
  } catch (err) {
    console.warn('[bridge-relay] 页面会话查找失败:', err.message || err);
  }
  return null;
}

async function readSellerTokenFromPage(client) {
  try {
    const result = await client.Runtime.evaluate({
      expression: `(function(){
        var events = window.__qfAckEvents || [];
        for (var i = events.length - 1; i >= 0; i--) {
          try {
            var body = JSON.parse(events[i].raw).body || {};
            var data = body.data || {};
            if (data.senderAppUid) return String(data.senderAppUid);
            var ext = data.extension || {};
            if (ext.sender) {
              var s = typeof ext.sender === 'string' ? JSON.parse(ext.sender) : ext.sender;
              var uid = (s.presentInfo && s.presentInfo.appUid) || (s.representInfo && s.representInfo.appUid);
              if (uid) return String(uid);
            }
          } catch (e) {}
        }
        return '';
      })()`,
      returnByValue: true,
    });
    return result?.result?.value || '';
  } catch {
    return '';
  }
}

function buildSendReceipt({ ack, syncResult, session, built, mediaType, extra = {} }) {
  const delivered = Boolean(ack?.msgId);
  return {
    ok: delivered,
    delivered,
    ackOk: delivered,
    msgId: ack?.msgId || '',
    traceId: built.traceId,
    ackSource: ack?.ackSource || 'page',
    shopTitle: session.shopTitle,
    buyerNick: session.buyerNick,
    appCid: session.appCid,
    mediaType,
    pcBubbleVisible: Boolean(syncResult?.pcBubbleInsertedByQianfan),
    nativeSync: syncResult,
    message: delivered ? '发送成功，千帆已确认收到' : '发送未确认',
    ...extra,
  };
}

function mergeSyncContentInfo(ackData, sendContentInfo) {
  const ackCi = ackData?.contentInfo;
  const ackType = Number(ackCi?.contentType);
  const sendType = Number(sendContentInfo?.contentType);
  if (ackCi && ackType > 1) return ackCi;
  if (sendContentInfo && sendType > 1) return sendContentInfo;
  if (sendContentInfo && sendType === 1) return sendContentInfo;
  return ackCi || sendContentInfo || null;
}

async function refreshConversationAfterSend(client, buyerNick) {
  if (!client?.Runtime || !buyerNick) return false;
  const clicked = await clickBuyerNickInPage(client, buyerNick);
  if (clicked) await sleep(600);
  return clicked;
}

async function confirmSendAndSync(client, session, built, label, options = {}) {
  const { skipNativeSync = false, allowLooseAck = true, contentInfo = null } = options;
  const sentAtMs = Date.now();
  const ack = await waitForSendAck(
    client,
    { traceId: built.traceId, sMid: built.sMid, uuid: built.uuid },
    sentAtMs,
    { allowLoose: allowLooseAck }
  );

  let sellerToken =
    parseSenderAppUid(ack.ackData?.extension) ||
    String(ack.ackData?.senderAppUid || '').trim() ||
    (await readSellerTokenFromPage(client));

  if (!parseSenderAppUid(ack.ackData?.extension)) {
    ack.ackData = {
      ...(ack.ackData || {}),
      extension: {
        ...(ack.ackData?.extension || {}),
        ...buildSellerExtension(sellerToken),
      },
    };
  }

  let syncResult = { skipped: true };
  if (!skipNativeSync) {
    const ackData = {
      ...(ack.ackData || {}),
      msgId: ack.msgId,
    };
    const mergedContentInfo = mergeSyncContentInfo(ackData, contentInfo);
    if (mergedContentInfo) ackData.contentInfo = mergedContentInfo;
    syncResult = await triggerNativeSyncAfterSend(client, {
      appCid: session.appCid,
      msgId: ack.msgId,
      receiverAppUids: session.receiverAppUids,
      text: label,
      seq: 1,
      token: sellerToken,
      ackData,
    });
    console.log('[bridge-relay] 原生 UI 同步', syncResult);
    if (!syncResult?.pcBubbleInsertedByQianfan) {
      await refreshConversationAfterSend(client, session.buyerNick);
      await sleep(400);
      syncResult = await triggerNativeSyncAfterSend(client, {
        appCid: session.appCid,
        msgId: ack.msgId,
        receiverAppUids: session.receiverAppUids,
        text: label,
        seq: 1,
        token: sellerToken,
        ackData,
      });
      console.log('[bridge-relay] 原生 UI 同步（重试）', syncResult);
    }
  }

  return { ack, syncResult };
}

async function resolveSessionForSend(body) {
  const {
    shopTitle = '祥钰珠宝',
    buyerNick = '',
    buyerUserId = '',
    sellerId = '',
    packageId = '',
    orderId = '',
    appCid: inputAppCid = '',
    receiverAppUids: inputReceiver = [],
    autoOpenSession = true,
  } = body || {};

  const uid = String(buyerUserId || '').trim();
  const nick = String(buyerNick || '').trim();

  // 1. 优先用千帆页面当前会话（比磁盘缓存的 appCid 更准确）
  const pageSession = await lookupSessionFromPage(shopTitle, nick, uid);
  if (pageSession?.appCid) {
    console.log('[bridge-relay] 从千帆页面找到会话', {
      buyerNick: nick,
      source: pageSession.source,
    });
    return pageSession;
  }

  // 2. 订单/历史记录/磁盘缓存
  try {
    const existing = resolveSession({
      shopTitle,
      buyerNick: nick,
      buyerUserId: uid,
      appCid: inputAppCid,
      receiverAppUids: inputReceiver,
    });
    if (existing?.appCid) {
      console.log('[bridge-relay] 已有买家会话，直接发送', {
        buyerNick: nick,
        source: existing.source,
      });
      return existing;
    }
  } catch {
    // 继续走下面的查找/打开流程
  }

  // 3. 找不到会话 → 自动打开买家聊天，再发送
  if (!autoOpenSession) {
    throw new Error(`找不到买家「${nick || uid}」的会话，请确认千帆里该店铺工作台已打开`);
  }
  if (!uid) {
    throw new Error(`订单缺少买家 ID，无法发送给「${nick || '该买家'}」`);
  }
  if (!String(sellerId || '').trim()) {
    throw new Error(`订单缺少店铺 ID，无法打开买家「${nick || uid}」的聊天`);
  }

  console.log('[bridge-relay] 未找到会话，正在打开买家聊天…', {
    shopTitle,
    buyerNick: nick,
    buyerUserId: uid,
  });

  const opened = await handleOpenSession({
    shopTitle,
    buyerNick: nick,
    buyerUserId: uid,
    sellerId,
    packageId,
    orderId,
  });

  let session = opened.session;
  if (!session?.appCid) {
    const waited = await waitForSession({
      shopTitle,
      buyerNick: nick,
      buyerUserId: uid,
      timeoutMs: 30000,
    });
    if (waited?.appCid) session = waited;
  }

  if (!session?.appCid) {
    throw new Error(`买家「${nick || uid}」聊天暂时打不开，请确认千帆已登录后再试`);
  }

  persistDiscoveredSession({
    shopTitle: session.shopTitle || shopTitle,
    appCid: session.appCid,
    buyerUserId: uid,
  });

  console.log('[bridge-relay] 买家聊天已打开，继续发送', {
    buyerNick: nick,
    source: session.source || 'eva_open',
    appCid: `${session.appCid.slice(0, 36)}…`,
  });
  return session;
}

function readFileAsBase64(filePath, mimeOverride) {
  const buf = fs.readFileSync(filePath);
  const ext = path.extname(filePath).toLowerCase();
  const mime =
    mimeOverride ||
    (ext === '.mp4' ? 'video/mp4' : ext === '.jpg' || ext === '.jpeg' ? 'image/jpeg' : 'application/octet-stream');
  return `data:${mime};base64,${buf.toString('base64')}`;
}

async function handleSend(body) {
  const {
    type = 'send_image',
    shopTitle = '祥钰珠宝',
    buyerNick = '',
    orderId = '',
    imageBase64 = '',
    imagePath = '',
    imageUrl: presetUrl = '',
    videoBase64 = '',
    videoPath = '',
    coverBase64 = '',
    videoMeta = {},
    fileName = 'xiangyu.mp4',
    sendPreface = false,
    prefaceText = '',
  } = body || {};

  if (type === 'send_text') {
    return handleSendText(body);
  }

  if (type === 'send_video' || videoBase64 || videoPath) {
    return handleSendVideo(body);
  }

  let imageData = imageBase64;
  if (!imageData && imagePath && fs.existsSync(imagePath)) {
    imageData = readFileAsBase64(imagePath, 'image/jpeg');
  }

  if (!imageData && !presetUrl) {
    throw new Error('请先拍照或选图');
  }

  const session = enrichSendSession(body, await resolveSessionForSend(body), 'image');
  console.log('[bridge-relay] 发送图片', {
    shopTitle: session.shopTitle || shopTitle,
    buyerNick: session.buyerNick || buyerNick,
    source: session.source,
    appCid: session.appCid ? `${session.appCid.slice(0, 30)}…` : '',
    withPreface: Boolean(sendPreface && String(prefaceText || '').trim()),
  });
  const client = await getCdpClient(session.shopTitle || shopTitle, { force: true });

  let prefaceReceipt = null;
  const safePreface = String(prefaceText || '').trim();
  if (sendPreface && safePreface) {
    const textSeq = await allocSendSeq(client);
    prefaceReceipt = await deliverTextMessage(client, session, {
      text: safePreface,
      seq: textSeq,
      shopTitle: session.shopTitle || shopTitle,
      buyerNick: session.buyerNick || buyerNick,
      orderId,
    });
    await bumpSendSeq(client, textSeq);
    if (!prefaceReceipt.delivered && !prefaceReceipt.msgId) {
      throw new Error(prefaceReceipt.message || '说明文字发送未确认');
    }
    await sleep(400);
  }

  const imageSize = await measureImageSize(client, imageData);
  console.log('[bridge-relay] 合成图尺寸', {
    width: imageSize.width,
    height: imageSize.height,
  });

  let uploaded;
  if (presetUrl) {
    uploaded = { url: presetUrl, width: imageSize.width, height: imageSize.height };
  } else {
    uploaded = await uploadMediaInPage(client, imageData, 'image', {
      width: imageSize.width,
      height: imageSize.height,
    });
    uploaded.width = imageSize.width;
    uploaded.height = imageSize.height;
    console.log('[bridge-relay] 图片上传完成', {
      fileId: uploaded.fileId || '',
      hasResource: Boolean(uploaded.resource),
      method: uploaded.method || '',
      width: uploaded.width,
      height: uploaded.height,
    });
  }

  const imageSeq = await allocSendSeq(client);
  const manualTemplate = pickWsSendTemplate(QIANFAN_DATA_DIR, 'image');
  const built = buildImageSendPayload({
    appCid: session.appCid,
    receiverAppUids: session.receiverAppUids,
    imageUrl: uploaded.url || '',
    width: uploaded.width,
    height: uploaded.height,
    seq: imageSeq,
    manualTemplate,
    uploadResult: uploaded.fileId || uploaded.resource ? uploaded : null,
  });
  if (built.usedManualTemplate) {
    console.log('[bridge-relay] 使用已录制的图片发送 WS 模板');
  }

  const sent = await sendPayloadViaWs(client, built.payloadStr, session.appCid);
  let ack;
  let syncResult;
  let sendContentInfo = null;
  try {
    sendContentInfo = JSON.parse(built.payloadStr)?.body?.contentInfo || null;
  } catch {
    sendContentInfo = null;
  }
  try {
    ({ ack, syncResult } = await confirmSendAndSync(client, session, built, '[图片]', {
      skipNativeSync: false,
      allowLooseAck: false,
      contentInfo: sendContentInfo,
    }));
    await bumpSendSeq(client, imageSeq);
    await refreshConversationAfterSend(client, session.buyerNick || buyerNick);
  } catch (ackErr) {
    throw ackErr;
  }

  console.log('[bridge-relay] 图片已发送', {
    shopTitle: session.shopTitle || shopTitle,
    buyerNick: session.buyerNick || buyerNick,
    orderId,
    ws: sent.url,
    traceId: built.traceId,
    msgId: ack.msgId,
    seq: imageSeq,
  });

  const imageReceipt = buildSendReceipt({
    ack,
    syncResult,
    session,
    built,
    mediaType: 'image',
    extra: {
      imageUrl: uploaded.url || '',
      fileId: uploaded.fileId || '',
    },
  });

  if (prefaceReceipt) {
    return {
      ...imageReceipt,
      preface: prefaceReceipt,
      message:
        prefaceReceipt.delivered && imageReceipt.delivered
          ? '说明与图片均已发送，千帆已确认收到'
          : imageReceipt.message,
    };
  }

  return imageReceipt;
}

async function handleSendVideo(body) {
  const {
    shopTitle = '祥钰珠宝',
    buyerNick = '',
    orderId = '',
    videoBase64 = '',
    videoPath = '',
    coverBase64 = '',
    coverPath = '',
    videoMeta = {},
    fileName = 'xiangyu.mp4',
  } = body || {};

  let b64 = videoBase64;
  if (!b64 && videoPath) {
    if (!fs.existsSync(videoPath)) throw new Error('找不到要发的视频，请重新准备一下');
    b64 = readFileAsBase64(videoPath, 'video/mp4');
  }
  if (!b64) throw new Error('请先准备好要发的视频');

  let coverB64 = coverBase64;
  if (!coverB64 && coverPath && fs.existsSync(coverPath)) {
    coverB64 = readFileAsBase64(coverPath, 'image/jpeg');
  }

  const session = enrichSendSession(body, await resolveSessionForSend(body), 'video');
  const client = await getCdpClient(session.shopTitle || shopTitle, { force: true });
  const videoSeq = await allocSendSeq(client);

  const meta = normalizeVideoMeta(videoMeta);

  const videoUpload = await uploadMediaInPage(client, b64, 'video', meta);
  const rawFileId = videoUpload.fileId || videoUpload.resource?.fileId || '';
  const videoFileId = normalizeVideoFileId(rawFileId);
  const videoResource = {
    ...(videoUpload.resource || {}),
    cloudType: 4,
    bizName: 'cs',
    scene: 'feeva_sdk',
    fileId: videoFileId,
  };

  let coverResource;
  if (coverB64) {
    const coverUpload = await uploadMediaInPage(client, coverB64, 'image', {
      width: meta.width,
      height: meta.height,
    });
    coverResource = coverUpload.resource || {
      cloudType: 4,
      bizName: 'cs',
      scene: 'feeva_img',
      fileId: coverUpload.fileId,
    };
  } else {
    throw new Error('缺少视频封面，请确认 ffmpeg 已安装并能正常生成封面');
  }

  console.log('[bridge-relay] 视频上传完成', {
    fileId: videoFileId,
    duration: meta.duration,
    dimension: meta.dimension,
    hasCover: Boolean(coverResource?.fileId),
  });

  const manualTemplate = pickWsSendTemplate(QIANFAN_DATA_DIR, 'video');
  const built = buildVideoSendPayload({
    appCid: session.appCid,
    receiverAppUids: session.receiverAppUids,
    videoMeta: meta,
    coverResource,
    videoResource,
    seq: videoSeq,
    manualTemplate,
    fileName,
  });

  const sent = await sendPayloadViaWs(client, built.payloadStr, session.appCid);
  let sendContentInfo = null;
  try {
    sendContentInfo = JSON.parse(built.payloadStr)?.body?.contentInfo || null;
  } catch {
    sendContentInfo = null;
  }
  const { ack, syncResult } = await confirmSendAndSync(client, session, built, '[视频]', {
    skipNativeSync: false,
    allowLooseAck: false,
    contentInfo: sendContentInfo,
  });
  await bumpSendSeq(client, videoSeq);
  await refreshConversationAfterSend(client, session.buyerNick || buyerNick);

  console.log('[bridge-relay] 视频已发送', {
    shopTitle: session.shopTitle || shopTitle,
    buyerNick: session.buyerNick || buyerNick,
    orderId,
    ws: sent.url,
    traceId: built.traceId,
    msgId: ack.msgId,
  });

  return buildSendReceipt({
    ack,
    syncResult,
    session: { ...session, shopTitle: session.shopTitle || shopTitle, buyerNick: session.buyerNick || buyerNick },
    built,
    mediaType: 'video',
  });
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', () => {
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}'));
      } catch (err) {
        reject(err);
      }
    });
    req.on('error', reject);
  });
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://127.0.0.1:${PORT}`);
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  try {
    if (req.method === 'GET' && url.pathname === '/health') {
      let devtoolsOk = false;
      let qianfanPages = 0;
      let devtoolsMessage = '';
      try {
        const targets = await fetchDevtoolsTargets();
        devtoolsOk = true;
        qianfanPages = listQianfanShopPages(targets).length;
      } catch (err) {
        devtoolsMessage = String(err.message || err);
      }
      const ready = devtoolsOk && qianfanPages > 0;
      const message = ready
        ? '可以正常发消息'
        : devtoolsMessage ||
          (devtoolsOk ? '千帆已连接但未检测到工作台页面，请登录千帆客服' : '千帆客服未连接');
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(
        JSON.stringify({
          ok: ready,
          service: 'qianfan-bridge-relay',
          devtoolsPort: DEVTOOLS_PORT,
          devtoolsOk,
          qianfanPages,
          message,
        })
      );
      return;
    }

    if (req.method === 'GET' && url.pathname === '/capture/status') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: true, ...getCaptureStatus(QIANFAN_DATA_DIR) }));
      return;
    }

    if (req.method === 'POST' && url.pathname === '/open-session') {
      const body = await readBody(req);
      const result = await handleOpenSession(body);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(result));
      return;
    }

    if (req.method === 'POST' && url.pathname === '/send') {
      const body = await readBody(req);
      const result = await handleSend(body);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(result));
      return;
    }

    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'not found' }));
  } catch (err) {
    console.error('[bridge-relay] error:', err.message || err);
    res.writeHead(500, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: String(err.message || err) }));
  }
});

server.listen(PORT, '127.0.0.1', () => {
  console.log(`[bridge-relay] http://127.0.0.1:${PORT}`);
  console.log(`[bridge-relay] POST /send  /open-session  GET /health  GET /capture/status`);
  console.log(`[bridge-relay] 录制说明: 启动后会自动监听千帆页面；手动发图/视频时终端会输出 [bridge-capture]`);
  console.log(`[bridge-relay] DevTools ${DEVTOOLS_HOST}:${DEVTOOLS_PORT}`);
  console.log(`[bridge-relay] 千帆数据目录 ${QIANFAN_DATA_DIR}`);

  if (syncBotLogTemplates(QIANFAN_DATA_DIR)) {
    console.log('[bridge-capture] 已从千帆中转机器人日志同步 WS 发送模板');
  }
  logCaptureStatus();
  armCaptureWatchers().catch((err) => {
    console.warn('[bridge-capture] 启动监听失败:', err.message || err);
  });
  setInterval(() => {
    armCaptureWatchers().catch(() => {});
  }, 30000);
});

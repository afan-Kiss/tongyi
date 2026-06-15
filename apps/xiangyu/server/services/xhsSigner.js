const path = require('path');
const fs = require('fs');

function loadXhshowClient() {
  const candidates = [
    path.join(__dirname, '../../node_modules/xhshow-js/dist/index.cjs'),
    path.join(__dirname, '../../../../node_modules/xhshow-js/dist/index.cjs'),
  ];
  for (const entry of candidates) {
    if (fs.existsSync(entry)) return require(entry);
  }
  throw new Error('xhshow-js not found; 请在项目根目录运行 npm install');
}

const { Client } = loadXhshowClient();

const XHS_SIGN_ERROR = '小红书请求签名失败';

class XhsSignError extends Error {
  constructor(message) {
    super(message);
    this.name = 'XhsSignError';
  }
}

function parseCookieString(cookie) {
  const out = {};
  for (const part of String(cookie || '').split(';')) {
    const trimmed = part.trim();
    if (!trimmed || !trimmed.includes('=')) continue;
    const idx = trimmed.indexOf('=');
    out[trimmed.slice(0, idx).trim()] = trimmed.slice(idx + 1).trim();
  }
  return out;
}

function extractA1FromCookie(cookie) {
  const m = parseCookieString(cookie);
  return m.a1 || m.webId || '';
}

function extractAuthorizationFromCookie(cookie) {
  const m = parseCookieString(cookie);
  for (const [key, val] of Object.entries(m)) {
    if (key.toLowerCase().includes('access-token-ark') && val) {
      const v = String(val).trim();
      if (v.startsWith('customer.ark.')) return v.slice('customer.ark.'.length);
      return v;
    }
  }
  return '';
}

function decodeJwtPayload(token) {
  const raw = String(token || '').trim();
  if (!raw) return null;
  const parts = raw.split('.');
  if (parts.length < 2) return null;
  try {
    const b64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
    const pad = b64.length % 4 ? '='.repeat(4 - (b64.length % 4)) : '';
    return JSON.parse(Buffer.from(b64 + pad, 'base64').toString('utf8'));
  } catch {
    return null;
  }
}

function extractSellerIdFromCookie(cookie) {
  const auth = extractAuthorizationFromCookie(cookie);
  const payload = decodeJwtPayload(auth);
  if (!payload || typeof payload !== 'object') return '';
  const candidates = [
    payload.sellerId,
    payload.seller_id,
    payload.sellerUserId,
    payload.userId,
    payload.uid,
  ];
  for (const val of candidates) {
    const s = String(val || '').trim();
    if (s) return s;
  }
  return '';
}

function signPostHeaders(url, body, cookie, xsecAppId = 'seller') {
  const cookies = parseCookieString(cookie);
  const a1 = extractA1FromCookie(cookie);
  if (!a1 && !Object.keys(cookies).length) {
    throw new XhsSignError(`${XHS_SIGN_ERROR}（Cookie 为空或缺少 a1）`);
  }

  let uri;
  try {
    uri = new URL(url).pathname;
  } catch {
    uri = url;
  }

  const client = new Client();
  const appIds = [xsecAppId, 'seller', 'xhs-pc-web'];
  let lastErr = null;

  for (const appId of appIds) {
    try {
      const xs = client.signXS('POST', uri, a1 || cookies.a1, appId, body);
      if (!xs) continue;
      return {
        'x-s': xs,
        'x-t': String(client.getXT()),
        'x-s-common': client.signXSCommon({ a1: a1 || cookies.a1, ...cookies }),
        'x-b3-traceid': client.getB3TraceId(),
        'x-xray-traceid': client.getXrayTraceId(),
      };
    } catch (err) {
      lastErr = err;
    }
  }

  throw new XhsSignError(`${XHS_SIGN_ERROR}：${lastErr?.message || '未知错误'}`);
}

module.exports = {
  XhsSignError,
  parseCookieString,
  decodeJwtPayload,
  extractSellerIdFromCookie,
  extractA1FromCookie,
  extractAuthorizationFromCookie,
  signPostHeaders,
};

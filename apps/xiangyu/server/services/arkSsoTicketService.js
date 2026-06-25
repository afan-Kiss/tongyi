/**
 * 千帆订单详情跨店打开：用店铺 Cookie 向 CAS 换取 ST ticket，拼进详情 URL。
 * 与客服工作台跳转一致：?ticket=ST-... 由 ark 前端 ssologin 自动切换店铺。
 */
const { signPostHeaders, parseCookieString, extractAuthorizationFromCookie } = require('./xhsSigner');
const { fetchArkTicketFromBridge } = require('./bridgeService');

const SERVICE_TICKET_URL = 'https://customer.xiaohongshu.com/api/cas/customer/web/service-ticket';
const DEFAULT_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36';
const FETCH_TIMEOUT_MS = 12000;
const ARK_ROOT = 'https://ark.xiaohongshu.com';

/** ST ticket 一次性，禁止跨请求缓存（复用会报「登录凭证已被使用」） */

function normalizePackageId(packageId) {
  const raw = String(packageId || '').trim();
  if (!raw) return '';
  return raw.startsWith('P') ? raw : `P${raw}`;
}

function normalizeReturnId(returnId) {
  const raw = String(returnId || '').trim();
  if (!raw) return '';
  return raw.startsWith('R') ? raw : `R${raw}`;
}

function buildAftersaleDetailServiceUrl(returnId) {
  const rid = normalizeReturnId(returnId);
  if (!rid) return '';
  return `https://ark.xiaohongshu.com/app-order/aftersale/detail?returnId=${encodeURIComponent(rid)}`;
}

function buildDetailServiceUrl(packageId) {
  const pkg = normalizePackageId(packageId);
  if (!pkg) return '';
  return `https://ark.xiaohongshu.com/app-order/order/detail/${encodeURIComponent(pkg)}`;
}

function extractSellerUserIdFromCookie(cookie) {
  return String(parseCookieString(cookie)['x-user-id-ark.xiaohongshu.com'] || '').trim();
}

function extractFuwuAuthorization(cookie) {
  const m = parseCookieString(cookie);
  for (const [key, val] of Object.entries(m)) {
    if (!key.includes('access-token-fuwu') || key.includes('beta')) continue;
    const v = String(val || '').trim();
    if (v.startsWith('customer.fuwu.')) return v.slice('customer.fuwu.'.length);
  }
  return '';
}

function extractTicketFromResponse(data) {
  if (!data || typeof data !== 'object') return '';
  const direct = data?.data?.ticket || data?.ticket || data?.data?.st || '';
  const s = String(direct || '').trim();
  if (s.startsWith('ST-')) return s;
  return '';
}

function buildTicketRequestBodies(serviceUrl, cookie) {
  const m = parseCookieString(cookie);
  const sid = String(m['customer-sso-sid'] || '').trim();
  const auth = extractAuthorizationFromCookie(cookie);
  const sellerId = String(m['x-user-id-ark.xiaohongshu.com'] || '').trim();
  const webSession = String(m.web_session || '').trim();
  const enc = encodeURIComponent(serviceUrl);
  const bodies = [];

  const push = (body, tag) => bodies.push({ body, tag });

  // 抓包优先：ark 根域 + type=at（与客服台点击订单一致）
  push({ service: ARK_ROOT, type: 'at' }, 'at+root');
  push({ service: encodeURIComponent(ARK_ROOT), type: 'at' }, 'at+root-enc');
  if (sid) {
    push({ service: ARK_ROOT, type: 'at', sid, source: '' }, 'at+root+sid');
  }

  if (sid) {
    for (const type of ['st', 'sso']) {
      push({ service: enc, type, sid, source: '' }, `${type}+sid`);
      push({ service: enc, type, customerSid: sid, source: '' }, `${type}+customerSid`);
      push({ service: enc, type, ssoSid: sid, source: '' }, `${type}+ssoSid`);
      push({ service: serviceUrl, type, sid, source: '' }, `${type}+sid+rawService`);
    }
  }

  if (sid && auth) {
    push({ service: enc, type: 'st', sid, accessToken: auth, source: '' }, 'st+sid+at');
    push({ service: enc, type: 'sso', sid, accessToken: auth, source: '' }, 'sso+sid+at');
  }

  if (sid && sellerId) {
    push({ service: enc, type: 'sso', sid, sellerId, source: '' }, 'sso+sid+seller');
    push({ service: enc, type: 'st', sid, sellerId, source: '' }, 'st+sid+seller');
  }

  if (webSession) {
    push({ service: enc, type: 'sso', webSession, source: '' }, 'sso+webSession');
    push({ service: enc, type: 'st', webSession, source: '' }, 'st+webSession');
    push({ service: enc, type: 'sso', session: webSession, source: '' }, 'sso+session');
  }

  const homeEnc = encodeURIComponent('https://ark.xiaohongshu.com/app-system/home');
  if (sid) {
    for (const type of ['st', 'sso']) {
      push({ service: homeEnc, type, sid, source: '' }, `${type}+sid+home`);
    }
    push({ service: enc, type: 'sso', source: '' }, 'sso-only');
  }

  return bodies;
}

async function postServiceTicket(cookie, body, opts = {}) {
  const xsec = parseCookieString(cookie).xsecappid || 'seller';
  const headers = {
    accept: 'application/json, text/plain, */*',
    'content-type': 'application/json;charset=UTF-8',
    origin: opts.origin || 'https://customer.xiaohongshu.com',
    referer: opts.referer || 'https://customer.xiaohongshu.com/',
    'user-agent': DEFAULT_UA,
    cookie,
    ...signPostHeaders(SERVICE_TICKET_URL, body, cookie, xsec),
  };
  if (opts.authorization) headers.authorization = opts.authorization;

  const res = await fetch(SERVICE_TICKET_URL, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  });

  const text = await res.text();
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    return '';
  }

  if (!res.ok) return '';

  const ticket = extractTicketFromResponse(data);
  if (ticket) return ticket;

  const msg = String(data?.msg || data?.message || '').trim();
  if (/登录|过期|鉴权|token/i.test(msg)) {
    throw new Error('店铺 Cookie 可能已过期，请在辅助出库软件重新复制');
  }
  return '';
}

async function fetchTicketWithCookie(cookie, serviceUrl, meta = {}) {
  const attempts = buildTicketRequestBodies(serviceUrl, cookie);
  const fuwuAuth = extractFuwuAuthorization(cookie);
  const arkAuth = extractAuthorizationFromCookie(cookie);
  const sellerUserId = String(meta.sellerUserId || extractSellerUserIdFromCookie(cookie)).trim();

  if (sellerUserId) {
    const enc = encodeURIComponent(serviceUrl);
    for (const type of ['sso', 'st']) {
      attempts.unshift({ body: { service: enc, type, sellerId: sellerUserId, source: '' } });
      attempts.unshift({ body: { service: enc, type, sid: parseCookieString(cookie)['customer-sso-sid'], sellerId: sellerUserId, source: '' } });
    }
  }

  const headerVariants = [
    { tag: 'customer' },
    {
      tag: 'ark',
      origin: 'https://ark.xiaohongshu.com',
      referer: 'https://ark.xiaohongshu.com/app-order/aftersale/list',
      authorization: arkAuth,
    },
    {
      tag: 'walle',
      origin: 'https://walle.xiaohongshu.com',
      referer: 'https://walle.xiaohongshu.com/cstools/seller/dashboard',
      authorization: fuwuAuth || arkAuth,
    },
  ];

  let lastMsg = '';
  for (const hv of headerVariants) {
    if (hv.tag === 'walle' && !fuwuAuth && !arkAuth) continue;
    for (const { body } of attempts) {
      try {
        const ticket = await postServiceTicket(cookie, body, hv);
        if (ticket) return ticket;
      } catch (err) {
        lastMsg = String(err?.message || err);
      }
    }
  }
  if (lastMsg) throw new Error(lastMsg);
  return '';
}

async function requestServiceTicket(cookie, serviceUrl, meta = {}) {
  const shopTitle = String(meta.shopTitle || '').trim();
  const sellerUserId = String(meta.sellerUserId || extractSellerUserIdFromCookie(cookie)).trim();

  try {
    const bridgeTicket = await fetchArkTicketFromBridge({
      serviceUrl,
      shopTitle,
      sellerUserId,
    });
    if (bridgeTicket) return bridgeTicket;
  } catch {
    // bridge 不可用时继续走 Cookie 直连 CAS
  }

  return fetchTicketWithCookie(cookie, serviceUrl, meta);
}

/** 与千帆客服台点击订单一致：详情 URL 上直接带 ?ticket=ST-... */
function buildArkUrlWithTicketDirect(serviceUrl, ticket) {
  const base = String(serviceUrl || '').trim();
  const st = String(ticket || '').trim();
  if (!base || !st.startsWith('ST-')) return base;
  const u = new URL(base);
  u.searchParams.set('ticket', st);
  return u.toString();
}

async function buildArkUrlWithTicket(serviceUrl, cookie, meta = {}) {
  const base = String(serviceUrl || '').trim();
  if (!base) return '';
  if (!cookie) return base;
  try {
    const ticket = await requestServiceTicket(cookie, base, meta);
    if (ticket) {
      return buildArkUrlWithTicketDirect(base, ticket);
    }
  } catch {
    // 无 ticket 时仍返回基础链接
  }
  return base;
}

/** 经 ssologin 网关跳转（跨店切换店铺比直接拼 detail URL 更可靠） */
function buildArkSsologinUrl(serviceUrl, ticket) {
  const base = String(serviceUrl || '').trim();
  const st = String(ticket || '').trim();
  if (!base || !st.startsWith('ST-')) return base;
  const params = new URLSearchParams({
    service: base,
    ticket: st,
  });
  return `https://ark.xiaohongshu.com/app-sso/ssologin?${params.toString()}`;
}

async function buildArkOrderDetailUrl(packageId, cookie, meta = {}) {
  const pkg = normalizePackageId(packageId);
  if (!pkg) return '';
  return buildArkUrlWithTicket(buildDetailServiceUrl(pkg), cookie, meta);
}

async function buildArkAftersaleDetailUrl(returnId, cookie, meta = {}) {
  const rid = normalizeReturnId(returnId);
  if (!rid) return '';
  return buildArkUrlWithTicket(buildAftersaleDetailServiceUrl(rid), cookie, meta);
}

function decodeShopQuery(raw) {
  let s = String(raw || '').trim();
  if (!s) return '';
  for (let i = 0; i < 3; i++) {
    if (!/%[0-9A-Fa-f]{2}/.test(s)) break;
    try {
      const next = decodeURIComponent(s.replace(/\+/g, ' '));
      if (next === s) break;
      s = next;
    } catch {
      break;
    }
  }
  return s.trim();
}

function shopNamesMatch(a, b) {
  const x = String(a || '').trim().toLowerCase();
  const y = String(b || '').trim().toLowerCase();
  if (!x || !y) return false;
  return x === y || x.includes(y) || y.includes(x);
}

function findAccountByShopName(accounts, shopName) {
  const target = decodeShopQuery(shopName).toLowerCase();
  if (!target) return null;
  const exact = accounts.find((a) => String(a.name || '').trim().toLowerCase() === target);
  if (exact) return exact;
  return (
    accounts.find((a) => {
      const n = String(a.name || '').trim().toLowerCase();
      return n.includes(target) || target.includes(n);
    }) || null
  );
}

/** 必须匹配到店铺；禁止 silent fallback 到第一家 */
function requireAccountByShopName(accounts, shopName) {
  const shop = decodeShopQuery(shopName);
  if (!shop) return { ok: false, error: '缺少店铺参数 shop' };
  const account = findAccountByShopName(accounts, shop);
  if (account) return { ok: true, account };
  const names = accounts.map((a) => a.name).filter(Boolean).join('、') || '（无）';
  return { ok: false, error: `未找到店铺「${shop}」的 Cookie，已配置：${names}` };
}

module.exports = {
  SERVICE_TICKET_URL,
  normalizePackageId,
  normalizeReturnId,
  buildDetailServiceUrl,
  buildAftersaleDetailServiceUrl,
  buildTicketRequestBodies,
  requestServiceTicket,
  buildArkOrderDetailUrl,
  buildArkAftersaleDetailUrl,
  buildArkUrlWithTicket,
  buildArkUrlWithTicketDirect,
  buildArkSsologinUrl,
  fetchTicketWithCookie,
  extractSellerUserIdFromCookie,
  decodeShopQuery,
  shopNamesMatch,
  findAccountByShopName,
  requireAccountByShopName,
};

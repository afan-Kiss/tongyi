/**
 * 四店 Cookie 健康探测（扫码工作台提醒用）
 */
const { loadConfig } = require('../config');
const { listEnabledAccounts } = require('./xhsAccountImport');
const { extractAuthorizationFromCookie, XhsSignError } = require('./xhsSigner');
const { requestOrderPage } = require('./orderService');

const CACHE_MS = 5 * 60 * 1000;
let lastResult = { checkedAt: 0, accounts: [], allOk: false, message: '' };

function startOfTodayMs() {
  const TZ = 8 * 3600000;
  const sh = new Date(Date.now() + TZ);
  const y = sh.getUTCFullYear();
  const m = sh.getUTCMonth();
  const d = sh.getUTCDate();
  return Date.UTC(y, m, d, -8, 0, 0, 0);
}

async function probeAccountCookie(account) {
  const name = account.name || '未命名店铺';
  try {
    const auth = extractAuthorizationFromCookie(account.cookie);
    if (!auth) {
      return { name, ok: false, error: 'Cookie 缺少 ark access-token，请重新复制完整 Cookie' };
    }
    const startMs = startOfTodayMs();
    const endMs = Date.now();
    await requestOrderPage(account, startMs, endMs, 1, 5, '');
    return { name, ok: true };
  } catch (err) {
    const msg = err instanceof XhsSignError ? err.message : String(err?.message || err);
    const expired = /cookie|登录|鉴权|token|过期/i.test(msg);
    return {
      name,
      ok: false,
      expired,
      error: expired ? `Cookie 可能已过期：${msg}` : msg,
    };
  }
}

async function getCookieHealth(options = {}) {
  const force = Boolean(options.force);
  const now = Date.now();
  if (!force && lastResult.checkedAt && now - lastResult.checkedAt < CACHE_MS) {
    return { ...lastResult, cached: true };
  }

  const config = loadConfig();
  const accounts = listEnabledAccounts(config);
  if (!accounts.length) {
    lastResult = {
      checkedAt: now,
      allOk: false,
      cached: false,
      message: '未读取到店铺 Cookie，请在辅助出库软件配置四个店的 Cookie',
      accounts: [],
    };
    return lastResult;
  }

  const settled = await Promise.allSettled(accounts.map((a) => probeAccountCookie(a)));
  const rows = settled.map((result, i) => {
    const name = accounts[i]?.name || '未命名店铺';
    if (result.status === 'fulfilled') {
      return { ...result.value, checkedAt: now };
    }
    return {
      name,
      ok: false,
      expired: true,
      error: String(result.reason?.message || result.reason || '探测失败'),
      checkedAt: now,
    };
  });

  const bad = rows.filter((r) => !r.ok);
  lastResult = {
    checkedAt: now,
    cached: false,
    allOk: bad.length === 0,
    accounts: rows,
    message: bad.length
      ? `${bad.map((r) => r.name).join('、')} Cookie 不可用，订单/退货查询会失败`
      : '四个店铺 Cookie 均可用',
  };
  return lastResult;
}

module.exports = {
  getCookieHealth,
  probeAccountCookie,
};

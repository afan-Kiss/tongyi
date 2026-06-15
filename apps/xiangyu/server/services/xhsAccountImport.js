const path = require('path');
const fs = require('fs');

const XIANGYU_ROOT = path.resolve(__dirname, '..', '..');

function outboundConfigCandidates(config) {
  const fromConfig = String(config?.orders?.importFrom || '').trim();
  const fromEnv = String(process.env.OUTBOUND_CONFIG_PATH || '').trim();
  const candidates = [];
  if (fromEnv) candidates.push(path.resolve(fromEnv));
  if (fromConfig) candidates.push(path.resolve(fromConfig));
  candidates.push(
    path.join(XIANGYU_ROOT, '..', '..', '..', '辅助出库软件', 'config.json'),
    path.join(XIANGYU_ROOT, '..', '..', '..', '辅助出库软件', 'dist', 'config.json'),
    path.join(XIANGYU_ROOT, '..', '辅助出库软件', 'config.json'),
  );
  return [...new Set(candidates)];
}

function resolveOutboundConfigPath(config) {
  for (const candidate of outboundConfigCandidates(config)) {
    if (fs.existsSync(candidate)) return candidate;
  }
  return outboundConfigCandidates(config)[0];
}

function getOutboundConfigPath(config) {
  return resolveOutboundConfigPath(config);
}

function readJsonSafe(filePath) {
  if (!filePath || !fs.existsSync(filePath)) return null;
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch {
    return null;
  }
}

function normalizeAccount(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const name = String(raw.name || '').trim();
  const cookie = String(raw.cookie || '').trim();
  if (!name || !cookie) return null;
  if (cookie.includes('...') || cookie.length < 80) return null;
  return {
    id: String(raw.id || `${name}-${cookie.length}`),
    name,
    cookie,
    enabled: raw.enabled !== false,
    isDefault: Boolean(raw.is_default || raw.isDefault),
  };
}

function importAccountsFromOutboundConfig(configPath) {
  const data = readJsonSafe(configPath);
  if (!data) return [];

  const accounts = Array.isArray(data.xhs_accounts) ? data.xhs_accounts : [];
  const normalized = accounts.map(normalizeAccount).filter(Boolean);
  if (normalized.length) return normalized;

  const legacy = String(data.xhs_cookie || data.cookie || '').trim();
  if (legacy && !legacy.includes('...') && legacy.length >= 80) {
    return [
      {
        id: 'legacy-default',
        name: String(data.shop_name || '默认店铺'),
        cookie: legacy,
        enabled: true,
        isDefault: true,
      },
    ];
  }
  return [];
}

let outboundCache = { path: '', mtimeMs: 0, accounts: [] };

function resolveAccounts(config) {
  const outboundPath = resolveOutboundConfigPath(config);
  try {
    const stat = fs.statSync(outboundPath);
    if (outboundCache.accounts.length && outboundCache.path === outboundPath && stat.mtimeMs === outboundCache.mtimeMs) {
      return outboundCache.accounts;
    }
    const imported = importAccountsFromOutboundConfig(outboundPath);
    outboundCache = { path: outboundPath, mtimeMs: stat.mtimeMs, accounts: imported };
    if (imported.length) return imported;
  } catch {
    if (outboundCache.accounts.length && outboundCache.path === outboundPath) return outboundCache.accounts;
  }

  const legacyCookie = String(config?.shop?.cookie || '').trim();
  if (legacyCookie && !legacyCookie.includes('...') && legacyCookie.length >= 80) {
    return [
      {
        id: 'legacy-shop',
        name: String(config?.shop?.name || '默认店铺'),
        cookie: legacyCookie,
        enabled: true,
        isDefault: true,
      },
    ];
  }

  return [];
}

function clearOutboundAccountCache() {
  outboundCache = { path: '', mtimeMs: 0, accounts: [] };
}

function listEnabledAccounts(config) {
  return resolveAccounts(config).filter((a) => a.enabled);
}

module.exports = {
  XIANGYU_ROOT,
  getOutboundConfigPath,
  resolveOutboundConfigPath,
  importAccountsFromOutboundConfig,
  resolveAccounts,
  listEnabledAccounts,
  normalizeAccount,
  clearOutboundAccountCache,
};

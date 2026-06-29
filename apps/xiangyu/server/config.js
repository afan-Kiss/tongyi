const fs = require('fs');
const path = require('path');
const bcrypt = require('bcryptjs');

const ROOT = path.resolve(__dirname, '..');
const CONFIG_PATH = path.join(ROOT, 'config.json');
const EXAMPLE_PATH = path.join(ROOT, 'config.example.json');

const DEFAULT_CONFIG = {
  server: {
    port: 4726,
    host: '0.0.0.0',
    sessionSecret: 'xiangyu-change-me',
  },
  auth: {
    settingsPassword: 'admin123',
    passwordHash: '',
  },
  shop: {
    name: '祥钰珠宝',
    cookie: '',
  },
  orders: {
    apiUrl: 'https://ark.xiaohongshu.com/api/edith/fulfillment/order/page',
    apiMethod: 'POST',
    apiBody: '',
    cacheTtlMs: 45000,
    searchCacheSyncIntervalMs: 180 * 60 * 1000,
    searchCacheDays: 30,
  },
  bridge: {
    mode: 'http',
    url: 'http://127.0.0.1:4727/send',
    timeoutMs: 120000,
    devtoolsPort: 9322,
    qianfanDataDir: 'E:\\我的软件源码\\千帆中转机器人\\dist\\win-unpacked\\data',
  },
  tunnel: {
    publicUrl: '',
    note: 'Debian 服务器仅做外网入口，通过 frp 反代到你电脑的 3080 端口',
  },
  upload: {
    maxImageMb: 15,
  },
  editor: {
    prefaceMessage: '亲，以下是和田玉手镯的实拍图，供您参考，有任何问题随时联系我～',
    prefaceEnabled: true,
    annotationTags: [
      '棉', '棉点', '纹裂', '绺裂', '内裂', '水线', '石纹', '黑点', '脏点',
      '沁色', '色根', '糖色', '皮色', '僵', '闪丝', '晶体', '结构松',
      '杂色', '絮状', '颗粒感', '抠手', '发干', '油润', '籽料特征', '俄料特征',
    ],
  },
};

function deepMerge(base, patch) {
  const out = { ...base };
  for (const [key, value] of Object.entries(patch || {})) {
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      out[key] = deepMerge(base[key] || {}, value);
    } else if (value !== undefined) {
      out[key] = value;
    }
  }
  return out;
}

function ensureConfigFile() {
  if (!fs.existsSync(CONFIG_PATH)) {
    fs.copyFileSync(EXAMPLE_PATH, CONFIG_PATH);
  }
}

function loadConfig() {
  ensureConfigFile();
  const raw = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
  const config = deepMerge(DEFAULT_CONFIG, raw);

  if (!config.auth.passwordHash && config.auth.settingsPassword) {
    config.auth.passwordHash = bcrypt.hashSync(String(config.auth.settingsPassword), 10);
    saveConfig(config);
  }

  return config;
}

function saveConfig(config) {
  const toSave = deepMerge(DEFAULT_CONFIG, config);
  delete toSave.auth.settingsPassword;
  fs.writeFileSync(CONFIG_PATH, `${JSON.stringify(toSave, null, 2)}\n`, 'utf8');
  return toSave;
}

function getEditorConfig(config) {
  const raw = config.editor || {};
  const prefaceRaw = typeof raw.prefaceMessage === 'string' ? raw.prefaceMessage.trim() : '';
  return {
    prefaceMessage: prefaceRaw || DEFAULT_CONFIG.editor.prefaceMessage,
    prefaceEnabled: raw.prefaceEnabled !== false,
    annotationTags:
      Array.isArray(raw.annotationTags) && raw.annotationTags.length
        ? raw.annotationTags
        : DEFAULT_CONFIG.editor.annotationTags,
  };
}

function getPublicConfig(config) {
  const { listEnabledAccounts } = require('./services/xhsAccountImport');
  const accounts = listEnabledAccounts(config);
  return {
    shop: { name: config.shop.name },
    orders: {
      accountCount: accounts.length,
      accountSource: accounts.length ? '辅助出库软件' : '',
    },
    bridge: { mode: config.bridge.mode, url: maskUrl(config.bridge.url) },
    tunnel: {
      publicUrl: String(config.tunnel?.publicUrl || '').trim(),
    },
    upload: { maxImageMb: config.upload.maxImageMb },
    editor: getEditorConfig(config),
    hasCookie: accounts.length > 0 || Boolean(String(config.shop.cookie || '').trim()),
    hasBridge: Boolean(String(config.bridge.url || '').trim()),
  };
}

function maskUrl(url) {
  const s = String(url || '');
  if (!s) return '';
  try {
    const u = new URL(s);
    return `${u.protocol}//${u.host}${u.pathname}`;
  } catch {
    return s.slice(0, 32);
  }
}

function updateSettings(config, patch, plainPassword) {
  const next = deepMerge(config, patch);

  if (plainPassword) {
    next.auth.passwordHash = bcrypt.hashSync(String(plainPassword), 10);
  }

  return saveConfig(next);
}

function verifySettingsPassword(config, password) {
  const hash = config.auth.passwordHash;
  if (!hash) return false;
  return bcrypt.compareSync(String(password || ''), hash);
}

module.exports = {
  ROOT,
  CONFIG_PATH,
  loadConfig,
  saveConfig,
  getEditorConfig,
  getPublicConfig,
  updateSettings,
  verifySettingsPassword,
};

async function request(path, options = {}, attempt = 0) {
  const res = await fetch(`/api${path}`, {
    credentials: 'include',
    ...options,
    headers: {
      ...(options.body instanceof FormData ? {} : { 'Content-Type': 'application/json' }),
      ...(options.headers || {}),
    },
  });

  const text = await res.text();
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    data = { raw: text };
  }

  if (!res.ok) {
    const rawMsg = String(data.error || data.message || '').trim();
    const retryAuth =
      res.status === 401 &&
      attempt < 3 &&
      (/请先登录|登录状态同步|AUTH_REQUIRED/i.test(rawMsg) || data.code === 'AUTH_REQUIRED');
    if (retryAuth) {
      await new Promise((r) => setTimeout(r, 350 * (attempt + 1)));
      return request(path, options, attempt + 1);
    }
    throw new Error(toFriendlyError(rawMsg));
  }
  if (data.result && typeof data.result === 'object') {
    return { ...data, ...data.result };
  }
  return data;
}

function toFriendlyError(raw) {
  const s = String(raw || '').trim();
  if (!s) return '出了点问题，请稍后再试';
  if (/请先登录|登录状态同步|AUTH_REQUIRED/i.test(s)) {
    return '系统登录状态同步中，请稍候再点「刷新订单」（无需另注册账号）';
  }
  if (/extension\.sender|imMessageToRim|ACK timeout/i.test(s)) {
    if (/买家聊天|千帆|拍照|管理员|订单|配置|确认|发送|未确认/.test(s)) return s;
    return '发送未成功，请确认千帆客服已打开并重试';
  }
  if (/appCid|桥接|DevTools|WebSocket|HTTP\s*\d|9323|userId|eva:|impaas|videoPath|npm run|模板重放|录制.*上传|Cookie|签名|HTTP/i.test(s)) {
    if (/买家聊天|千帆|拍照|选图|视频|管理员|订单|配置|确认|发送/.test(s)) return s;
    return '出了点问题，请联系管理员';
  }
  return s;
}

export const api = {
  getPublicConfig: () => request('/config/public'),
  getOrders: (refresh = false, day = 'both') => {
    const qs = new URLSearchParams();
    if (refresh) qs.set('refresh', '1');
    if (day === 'today' || day === 'yesterday') qs.set('day', day);
    const q = qs.toString();
    return request(`/orders${q ? `?${q}` : ''}`);
  },
  loginSettings: (password) => request('/auth/settings', { method: 'POST', body: JSON.stringify({ password }) }),
  logoutSettings: () => request('/auth/logout', { method: 'POST' }),
  authStatus: () => request('/auth/status'),
  getSettings: () => request('/settings'),
  saveSettings: (payload) => request('/settings', { method: 'PUT', body: JSON.stringify(payload) }),
  mergeImages: (files) => {
    const fd = new FormData();
    files.forEach((file, idx) => fd.append('images', file, `photo-${idx}.jpg`));
    return request('/images/merge', { method: 'POST', body: fd });
  },
  sendImage: (payload) => request('/send', { method: 'POST', body: JSON.stringify(payload) }),
  savePreface: ({ text, enabled }) =>
    request('/editor/preface', { method: 'POST', body: JSON.stringify({ text, enabled }) }),
  prepareVideo: (formData) => request('/video/prepare', { method: 'POST', body: formData }),
  sendVideo: (payload) => request('/send/video', { method: 'POST', body: JSON.stringify(payload) }),
  openSession: (order) => request('/bridge/open-session', { method: 'POST', body: JSON.stringify({ order }) }),
  bridgeHealth: () => request('/bridge/health'),
  importAccounts: () => request('/settings/import-accounts', { method: 'POST', body: JSON.stringify({}) }),
};

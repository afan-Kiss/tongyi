const fs = require('fs');
const path = require('path');

const CAPTURE_FILENAME = 'xiangyu-captured-templates.json';

function captureFilePath(dataDir) {
  return path.join(dataDir, CAPTURE_FILENAME);
}

function botDebugLogDir(dataDir) {
  return path.join(path.dirname(dataDir), 'logs', 'debug');
}

function todayStamp() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function loadCapturedTemplates(dataDir) {
  const file = captureFilePath(dataDir);
  if (!fs.existsSync(file)) return {};
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return {};
  }
}

function saveCapturedTemplates(dataDir, data) {
  const file = captureFilePath(dataDir);
  fs.writeFileSync(file, `${JSON.stringify(data, null, 2)}\n`, 'utf8');
}

function sanitizeHeaders(headers) {
  const out = { ...(headers || {}) };
  delete out.Cookie;
  delete out.cookie;
  delete out['Content-Length'];
  delete out['content-length'];
  return out;
}

function isUploadUrl(url) {
  const u = String(url || '').toLowerCase();
  return /upload|\/file\/|media\/v1|ros-upload|impaas.*file|\/permit/.test(u);
}

function detectMediaKind(url, postData, responseJson) {
  const hay = `${url} ${postData || ''} ${JSON.stringify(responseJson || {})}`.toLowerCase();
  if (/video|\.mp4|mime_type.*video|contenttype.*video/.test(hay)) return 'video';
  return 'image';
}

function extractUploadedUrl(responseJson, rawText) {
  const json = responseJson || {};
  const data = json.data || {};
  const candidates = [
    data.url,
    data.imageUrl,
    data.fileUrl,
    data.cdnUrl,
    data.previewUrl,
    data.videoUrl,
    json.url,
    json.imageUrl,
  ];
  for (const val of candidates) {
    const u = String(val || '').trim();
    if (u) return normalizeCdnUrl(u);
  }
  const raw = String(rawText || '');
  const m = raw.match(/\/\/ci\.xiaohongshu\.com[^\s"']+|https?:\/\/ci\.xiaohongshu\.com[^\s"']+/i);
  if (m) return normalizeCdnUrl(m[0]);
  return '';
}

function normalizeCdnUrl(val) {
  const u = String(val || '').trim();
  if (!u) return '';
  if (u.startsWith('//')) return u;
  if (u.startsWith('http://') || u.startsWith('https://')) return u.replace(/^https?:/, '');
  return `//${u.replace(/^\/+/, '')}`;
}

function parseWsSendPayload(raw) {
  try {
    const parsed = JSON.parse(String(raw || ''));
    const action = parsed?.header?.action || '';
    if (action !== '/message/send') return null;
    return parsed;
  } catch {
    return null;
  }
}

function classifyWsSend(parsed) {
  const ct = Number(parsed?.body?.contentInfo?.contentType);
  const content = parsed?.body?.contentInfo?.content;
  const contentStr = JSON.stringify(content || {}).toLowerCase();
  const additionInfo = String(parsed?.body?.extension?.additionInfo || '');

  if (ct === 1 && typeof content === 'string') {
    return 'text';
  }
  if (ct === 2) {
    if (additionInfo.includes('emoji')) return '';
    return 'image';
  }
  if (ct === 101 && typeof content === 'object') {
    const innerType = Number(content.type);
    if (innerType === 73) return 'video';
    if (innerType === 74) return '';
  }
  if (ct === 3 || /video|\.mp4|videourl|playurl|originresource|trancoderesource/.test(contentStr)) {
    return 'video';
  }
  if (typeof content === 'object' && (content.videoUrl || content.playUrl)) return 'video';
  return '';
}

function summarizeWsSend(parsed) {
  const body = parsed?.body || {};
  return {
    header: parsed?.header || {},
    body: {
      convType: body.convType,
      convCreateIsSelfVisible: body.convCreateIsSelfVisible,
      convRedPointIsNotSelfClear: body.convRedPointIsNotSelfClear,
      contentInfo: body.contentInfo,
      extension: body.extension,
    },
  };
}

function readLatestManualSendFromBotLogs(dataDir, kind) {
  const dir = botDebugLogDir(dataDir);
  if (!fs.existsSync(dir)) return null;

  const files = fs
    .readdirSync(dir)
    .filter((name) => name.startsWith('qianfan-manual-send-sample-') && name.endsWith('.jsonl'))
    .sort()
    .reverse();

  for (const name of files) {
    const file = path.join(dir, name);
    let text;
    try {
      text = fs.readFileSync(file, 'utf8');
    } catch {
      continue;
    }
    const lines = text.trim().split('\n').filter(Boolean).reverse();
    for (const line of lines) {
      try {
        const row = JSON.parse(line);
        const payload = row.payload;
        const mediaKind = classifyWsSend(payload);
        if (mediaKind !== kind) continue;
        return {
          source: 'qianfan-bot-log',
          file,
          shopTitle: row.shopTitle,
          appCid: row.appCid,
          receiverAppUids: row.receiverAppUids,
          template: summarizeWsSend(payload),
          capturedAt: row.time,
        };
      } catch {
        // ignore bad line
      }
    }
  }
  return null;
}

function syncBotLogTemplates(dataDir) {
  const templates = loadCapturedTemplates(dataDir);
  let changed = false;
  for (const kind of ['image', 'video', 'text']) {
    if (templates[`${kind}Send`]?.template) continue;
    const fromBot = readLatestManualSendFromBotLogs(dataDir, kind);
    if (!fromBot) continue;
    templates[`${kind}Send`] = fromBot;
    changed = true;
  }
  if (changed) saveCapturedTemplates(dataDir, templates);
  return changed;
}

function getCaptureStatus(dataDir) {
  const tpl = loadCapturedTemplates(dataDir);
  const kinds = ['image', 'video', 'text'];
  const status = {};
  for (const kind of kinds) {
    status[kind] = {
      upload:
        (Array.isArray(tpl[`${kind}UploadFlow`]) && tpl[`${kind}UploadFlow`].length > 0) ||
        Boolean(tpl[`${kind}Upload`]?.url),
      uploadSteps: Array.isArray(tpl[`${kind}UploadFlow`]) ? tpl[`${kind}UploadFlow`].length : tpl[`${kind}Upload`]?.url ? 1 : 0,
      send: Boolean(tpl[`${kind}Send`]?.template),
      uploadUrl: tpl[`${kind}Upload`]?.url || '',
      uploadCapturedAt: tpl[`${kind}Upload`]?.capturedAt || '',
      sendCapturedAt: tpl[`${kind}Send`]?.capturedAt || '',
      botLogSend: Boolean(readLatestManualSendFromBotLogs(dataDir, kind)),
    };
  }
  status.file = captureFilePath(dataDir);
  status.botLogDir = botDebugLogDir(dataDir);
  return status;
}

function pickWsSendTemplate(dataDir, kind) {
  const tpl = loadCapturedTemplates(dataDir);
  if (tpl[`${kind}Send`]?.template) return tpl[`${kind}Send`];
  const fromBot = readLatestManualSendFromBotLogs(dataDir, kind);
  if (fromBot) return fromBot;
  return null;
}

function pickUploadTemplate(dataDir, kind) {
  const tpl = loadCapturedTemplates(dataDir);
  const flow = tpl[`${kind}UploadFlow`];
  if (Array.isArray(flow) && flow.length) return flow;
  const hit = tpl[`${kind}Upload`];
  if (hit?.url) return [hit];
  return [];
}

function buildFreshPermitUrl(scene, imToken = '') {
  const base = `https://edith.xiaohongshu.com/api/eva/upload/permit?biz_name=cs&scene=${encodeURIComponent(scene)}&file_count=1&version=1&source=web`;
  const token = String(imToken || '').trim();
  if (!token) return base;
  return `${base}&im_token=${encodeURIComponent(token)}`;
}

function normalizePermitUrl(url, scene, imToken = '') {
  const targetScene = scene || 'feeva_img';
  try {
    const u = new URL(String(url || ''));
    if (!u.pathname.includes('/api/eva/upload/permit')) {
      return buildFreshPermitUrl(targetScene, imToken);
    }
    u.searchParams.set('biz_name', 'cs');
    u.searchParams.set('scene', targetScene);
    u.searchParams.set('file_count', '1');
    u.searchParams.set('version', '1');
    u.searchParams.set('source', 'web');
    const token = String(imToken || u.searchParams.get('im_token') || '').trim();
    if (token) u.searchParams.set('im_token', token);
    return u.toString();
  } catch {
    return buildFreshPermitUrl(targetScene, imToken);
  }
}

function pickPermitTemplate(dataDir, kind) {
  const flow = pickUploadTemplate(dataDir, kind);
  const scene = kind === 'video' ? 'feeva_sdk' : 'feeva_img';
  const hit = [...flow].reverse().find(
    (step) =>
      step?.method === 'GET' &&
      String(step.url || '').includes('/api/eva/upload/permit') &&
      String(step.url || '').includes(`scene=${scene}`)
  );
  const picked = hit ||
    [...flow].reverse().find(
      (step) => step?.method === 'GET' && String(step.url || '').includes('/api/eva/upload/permit')
    );
  if (picked?.url) {
    return { ...picked, url: normalizePermitUrl(picked.url, scene) };
  }
  return { method: 'GET', url: buildFreshPermitUrl(scene), headers: { Accept: 'application/json, text/plain, */*' } };
}

function buildEvaMediaUploadScript({ permitUrl, fileBase64, kind, mime, filename, meta = {}, imToken = '' }) {
  const scene = kind === 'video' ? 'feeva_sdk' : 'feeva_img';
  const bizName = 'cs';
  const b64 = JSON.stringify(fileBase64);
  const fileMime = JSON.stringify(mime || (kind === 'video' ? 'video/mp4' : 'image/jpeg'));
  const fileName = JSON.stringify(filename || (kind === 'video' ? 'xiangyu.mp4' : 'xiangyu.jpg'));
  const permit = JSON.stringify(normalizePermitUrl(String(permitUrl || ''), scene, imToken));
  const metaJson = JSON.stringify(meta);

  return `(async function(){
    function b64ToBlob(b64, mime) {
      var parts = String(b64 || '').split(',');
      var m = (parts[0].match(/data:(.*?);/) || [])[1] || mime;
      var bin = atob(parts[1] || parts[0]);
      var len = bin.length;
      var arr = new Uint8Array(len);
      for (var i = 0; i < len; i++) arr[i] = bin.charCodeAt(i);
      return new Blob([arr], { type: m });
    }
    function parseXmlTag(xml, tag) {
      var m = String(xml || '').match(new RegExp('<' + tag + '>([^<]+)</' + tag + '>'));
      return m ? m[1] : '';
    }
    function resourceObj(fileId, sceneName) {
      return { cloudType: 4, bizName: ${JSON.stringify(bizName)}, scene: sceneName, fileId: fileId };
    }
    function pickImToken(str) {
      var m = String(str || '').match(/mario\\.token\\.[A-Za-z0-9]+/i);
      return m ? m[0] : '';
    }
    function findImToken() {
      var fromArg = pickImToken(${JSON.stringify(String(imToken || ''))});
      if (fromArg) return fromArg;
      try {
        for (var i = 0; i < localStorage.length; i++) {
          var t = pickImToken(localStorage.getItem(localStorage.key(i)));
          if (t) return t;
        }
      } catch (e) {}
      try {
        for (var j = 0; j < sessionStorage.length; j++) {
          var t2 = pickImToken(sessionStorage.getItem(sessionStorage.key(j)));
          if (t2) return t2;
        }
      } catch (e) {}
      try {
        var html = (document.documentElement && document.documentElement.innerHTML) || '';
        var m = html.match(/im_token=(mario\\.token\\.[A-Za-z0-9]+)/i);
        if (m) return m[1];
      } catch (e) {}
      return '';
    }
    function buildPermitCandidates(baseUrl, token) {
      var list = [];
      var seen = {};
      function add(url) {
        var u = String(url || '').trim();
        if (!u || seen[u]) return;
        seen[u] = true;
        list.push(u);
      }
      add(baseUrl);
      if (token) {
        try {
          var u = new URL(baseUrl);
          u.searchParams.set('im_token', token);
          add(u.toString());
        } catch (e) {
          add(baseUrl + (baseUrl.indexOf('?') >= 0 ? '&' : '?') + 'im_token=' + encodeURIComponent(token));
        }
      }
      return list;
    }

    var meta = ${metaJson};
    var blob = b64ToBlob(${b64}, ${fileMime});
    var permitBase = ${permit};
    var imToken = findImToken();
    var permitCandidates = buildPermitCandidates(permitBase, imToken);
    if (!permitCandidates.length) return { ok: false, error: '缺少 permit 地址' };

    var permitJson = null;
    var permitText = '';
    var permitRes = null;
    var permitUrlUsed = '';
    var permitErrors = [];
    for (var pi = 0; pi < permitCandidates.length; pi++) {
      var tryUrl = permitCandidates[pi];
      try {
        permitRes = await fetch(tryUrl, {
          method: 'GET',
          headers: { Accept: 'application/json, text/plain, */*', Referer: 'https://walle.xiaohongshu.com/' },
          credentials: 'include',
        });
        permitText = await permitRes.text();
        permitJson = null;
        try { permitJson = JSON.parse(permitText); } catch (e) { permitJson = null; }
        if (permitRes.ok && permitJson?.data?.uploadTempPermits?.length) {
          permitUrlUsed = tryUrl;
          break;
        }
        permitErrors.push('HTTP ' + permitRes.status + ' ' + permitText.slice(0, 120));
      } catch (e) {
        permitErrors.push(String(e && e.message || e));
      }
    }
    if (!permitJson?.data?.uploadTempPermits?.length) {
      return { ok: false, error: 'permit 失败', detail: permitErrors.slice(0, 2).join(' | '), hasImToken: !!imToken };
    }

    var permitInfo = permitJson.data.uploadTempPermits[0];
    var fileId = (permitInfo.fileIds && permitInfo.fileIds[0]) || '';
    var token = permitInfo.token || '';
    var uploadAddr = permitInfo.uploadAddr || 'ros-upload.xiaohongshu.com';
    if (!fileId) return { ok: false, error: 'permit 未返回 fileId' };
    if (${JSON.stringify(kind === 'video')} && fileId && !/\\.mp4$/i.test(String(fileId).split('/').pop() || '')) {
      fileId = fileId + '.mp4';
    }

    var baseUrl = 'https://' + uploadAddr + '/' + fileId;
    var commonHeaders = { 'x-cos-security-token': token, Referer: 'https://walle.xiaohongshu.com/' };

    function normalizeEtag(raw) {
      var e = String(raw || '').trim();
      if (!e) return '';
      if (e.charAt(0) === '"') return e;
      return '"' + e + '"';
    }

    function xhrRequest(method, url, headers, body) {
      return new Promise(function(resolve) {
        var xhr = new XMLHttpRequest();
        xhr.open(method, url, true);
        Object.keys(headers || {}).forEach(function(k) { xhr.setRequestHeader(k, headers[k]); });
        xhr.onload = function() {
          resolve({
            ok: xhr.status >= 200 && xhr.status < 300,
            status: xhr.status,
            text: xhr.responseText || '',
            etag: xhr.getResponseHeader('ETag') || xhr.getResponseHeader('etag') || '',
          });
        };
        xhr.onerror = function() { resolve({ ok: false, status: 0, text: '', etag: '' }); };
        xhr.send(body == null ? null : body);
      });
    }

    async function multipartPut() {
      var initRes = await xhrRequest('POST', baseUrl + '?uploads', Object.assign({}, commonHeaders, { 'Content-Type': blob.type || ${fileMime} }), null);
      var initText = initRes.text || '';
      if (!initRes.ok) return { ok: false, error: 'init multipart 失败', detail: initText.slice(0, 160) };
      var uploadId = parseXmlTag(initText, 'UploadId');
      if (!uploadId) return { ok: false, error: '无 uploadId', detail: initText.slice(0, 160) };

      var partSize = 5 * 1024 * 1024;
      var parts = [];
      var partNum = 0;
      for (var offset = 0; offset < blob.size; offset += partSize) {
        partNum += 1;
        var chunk = blob.slice(offset, Math.min(offset + partSize, blob.size));
        var partUrl = baseUrl + '?partNumber=' + partNum + '&uploadId=' + encodeURIComponent(uploadId);
        var partRes = await xhrRequest('PUT', partUrl, Object.assign({}, commonHeaders, { 'Content-Type': blob.type || ${fileMime} }), chunk);
        if (!partRes.ok) {
          return { ok: false, error: '分片 ' + partNum + ' 失败 HTTP ' + partRes.status, detail: (partRes.text || '').slice(0, 120) };
        }
        var etag = normalizeEtag(partRes.etag || '');
        if (!etag) return { ok: false, error: '分片 ' + partNum + ' 无 ETag' };
        parts.push({ PartNumber: partNum, ETag: etag });
      }

      var xml = '<CompleteMultipartUpload>' + parts.map(function(p) {
        return '<Part><PartNumber>' + p.PartNumber + '</PartNumber><ETag>' + p.ETag + '</ETag></Part>';
      }).join('') + '</CompleteMultipartUpload>';

      var doneRes = await xhrRequest('POST', baseUrl + '?uploadId=' + encodeURIComponent(uploadId), Object.assign({}, commonHeaders, { 'Content-Type': 'application/xml' }), xml);
      if (!doneRes.ok) {
        return { ok: false, error: 'complete multipart 失败', detail: (doneRes.text || '').slice(0, 160) };
      }
      if (/<Error>/i.test(doneRes.text || '')) {
        return { ok: false, error: 'complete multipart 返回错误', detail: (doneRes.text || '').slice(0, 160) };
      }
      return { ok: true };
    }

    // 抓包对比：千帆手动发图走 ?uploads multipart，simple PUT 会拿到 fileId 但图片裂开
    var mp = await multipartPut();
    if (!mp.ok) return mp;

    return {
      ok: true,
      fileId: fileId,
      resource: resourceObj(fileId, ${JSON.stringify(scene)}),
      width: meta.width || 720,
      height: meta.height || 1280,
      duration: meta.duration || 0,
      dimension: (meta.width || 720) + '*' + (meta.height || 1280),
      method: 'multipart',
      permitUrlUsed: permitUrlUsed,
    };
  })()`;
}

function buildUploadPageScript({ templates, fileBase64, kind }) {
  const uploadTemplates = JSON.stringify(Array.isArray(templates) ? templates : [templates].filter(Boolean));
  const b64 = JSON.stringify(fileBase64);
  const mime = kind === 'video' ? 'video/mp4' : 'image/jpeg';
  const filename = kind === 'video' ? 'xiangyu.mp4' : 'xiangyu.jpg';

  return `(async function(){
    function b64ToBlob(b64, mime) {
      var parts = String(b64 || '').split(',');
      var m = (parts[0].match(/data:(.*?);/) || [])[1] || mime;
      var bin = atob(parts[1] || parts[0]);
      var len = bin.length;
      var arr = new Uint8Array(len);
      for (var i = 0; i < len; i++) arr[i] = bin.charCodeAt(i);
      return new Blob([arr], { type: m });
    }
    function normalizeUrl(val) {
      var u = String(val || '').trim();
      if (!u) return '';
      if (u.indexOf('//') === 0) return u;
      if (u.indexOf('http://') === 0 || u.indexOf('https://') === 0) return u.replace(/^https?:/, '');
      return '//' + u.replace(/^\\/+/, '');
    }
    function pickUrl(json, raw) {
      var data = json && json.data || {};
      var list = [data.url, data.imageUrl, data.fileUrl, data.cdnUrl, data.previewUrl, data.videoUrl, json && json.url, json && json.imageUrl];
      for (var i = 0; i < list.length; i++) {
        if (list[i]) return normalizeUrl(list[i]);
      }
      var m = String(raw || '').match(/\\/\\/ci\\.xiaohongshu\\.com[^\\s\"']+|https?:\\/\\/ci\\.xiaohongshu\\.com[^\\s\"']+/i);
      return m ? normalizeUrl(m[0]) : '';
    }
    async function replayOne(tpl, blob) {
      var headers = Object.assign({}, tpl.headers || {});
      var res, text, json, url;
      if (tpl.method === 'PUT') {
        if (!headers['Content-Type'] && !headers['content-type']) headers['Content-Type'] = blob.type;
        res = await fetch(tpl.url, { method: 'PUT', headers: headers, body: blob, credentials: 'include' });
        text = await res.text();
        try { json = JSON.parse(text); } catch (e) { json = null; }
        url = pickUrl(json, text);
        return { ok: !!url, url: url, method: 'template-put', status: res.status, raw: text.slice(0, 300) };
      }
      if (tpl.method === 'GET') {
        res = await fetch(tpl.url, { method: 'GET', headers: headers, credentials: 'include' });
        text = await res.text();
        try { json = JSON.parse(text); } catch (e) { json = null; }
        return { ok: res.ok, json: json, raw: text.slice(0, 300), method: 'template-get', status: res.status };
      }
      var fields = tpl.formFields && tpl.formFields.length ? tpl.formFields : ['file', 'image', 'multipartFile'];
      var errors = [];
      for (var fi = 0; fi < fields.length; fi++) {
        try {
          var fd = new FormData();
          fd.append(fields[fi], blob, ${JSON.stringify(filename)});
          res = await fetch(tpl.url, { method: tpl.method || 'POST', headers: headers, body: fd, credentials: 'include' });
          text = await res.text();
          try { json = JSON.parse(text); } catch (e) { json = null; }
          url = pickUrl(json, text);
          if (url) return { ok: true, url: url, method: 'template-form:' + fields[fi], status: res.status };
          errors.push((tpl.url || '') + ' field=' + fields[fi] + ' HTTP ' + res.status + ' ' + text.slice(0, 120));
        } catch (e) {
          errors.push(String(e && e.message || e));
        }
      }
      return { ok: false, error: '单步上传失败', detail: errors.slice(0, 2).join(' | ') };
    }

    var flow = ${uploadTemplates};
    var blob = b64ToBlob(${b64}, ${JSON.stringify(mime)});
    var lastUrl = '';
    var permitJson = null;
    for (var i = 0; i < flow.length; i++) {
      var step = flow[i];
      if (!step || !step.url) continue;
      var out = await replayOne(step, blob);
      if (out.json) permitJson = out.json;
      if (out.url) lastUrl = out.url;
      if (out.ok && out.url) return { ok: true, url: out.url, method: out.method || ('flow-step-' + i) };
    }
    if (lastUrl) return { ok: true, url: lastUrl, method: 'flow-last-url' };
    return { ok: false, error: '上传模板重放失败', detail: '共 ' + flow.length + ' 步，未得到 CDN URL' };
  })()`;
}

function installNetworkCapture(client, { dataDir, shopTitle, onEvent }) {
  if (client.__xiangyuCaptureInstalled) return;
  client.__xiangyuCaptureInstalled = true;
  client.__xiangyuPendingUploads = new Map();

  client.Network.requestWillBeSent(({ request, requestId }) => {
    const url = String(request?.url || '');
    if (!isUploadUrl(url)) return;
    const method = String(request?.method || 'GET').toUpperCase();
    if (method !== 'POST' && method !== 'PUT') {
      if (!(method === 'GET' && /permit|upload\/web/i.test(url))) return;
    }

    client.__xiangyuPendingUploads.set(requestId, {
      url,
      method,
      headers: sanitizeHeaders(request.headers),
      postData: request.postData || '',
      shopTitle,
      at: Date.now(),
    });
  });

  client.Network.responseReceived(async ({ requestId, response }) => {
    const pending = client.__xiangyuPendingUploads.get(requestId);
    if (!pending) return;
    client.__xiangyuPendingUploads.delete(requestId);

    const status = Number(response?.status || 0);
    if (status < 200 || status >= 400) return;

    let rawText = '';
    try {
      const body = await client.Network.getResponseBody({ requestId });
      rawText = body.base64Encoded ? Buffer.from(body.body, 'base64').toString('utf8') : body.body;
    } catch {
      return;
    }

    let responseJson = null;
    try {
      responseJson = JSON.parse(rawText);
    } catch {
      responseJson = null;
    }

    const kind = detectMediaKind(pending.url, pending.postData, responseJson);
    const templates = loadCapturedTemplates(dataDir);
    const key = `${kind}Upload`;
    const flowKey = `${kind}UploadFlow`;

    const formFields = [];
    const pd = String(pending.postData || '');
    const nameMatch = pd.match(/name="([^"]+)"/g);
    if (nameMatch) {
      for (const m of nameMatch) {
        const name = m.slice(6, -1);
        if (name && !formFields.includes(name)) formFields.push(name);
      }
    }

    const entry = {
      ...pending,
      formFields,
      responseSample: responseJson,
      uploadedUrl: extractUploadedUrl(responseJson, rawText),
      capturedAt: new Date().toISOString(),
    };

    templates[key] = entry;
    templates[flowKey] = Array.isArray(templates[flowKey]) ? templates[flowKey] : [];
    templates[flowKey].push(entry);
    if (templates[flowKey].length > 10) templates[flowKey] = templates[flowKey].slice(-10);
    saveCapturedTemplates(dataDir, templates);

    const msg = `[bridge-capture] 已录制${kind === 'video' ? '视频' : '图片'}上传: ${pending.method} ${pending.url}`;
    console.log(msg);
    if (onEvent) onEvent({ type: 'upload', kind, entry });
  });

  client.Network.webSocketFrameSent(({ response }) => {
    const payload = response?.payloadData;
    const parsed = parseWsSendPayload(payload);
    if (!parsed) return;

    const kind = classifyWsSend(parsed);
    if (!kind) return;

    const templates = loadCapturedTemplates(dataDir);
    const key = `${kind}Send`;
    templates[key] = {
      shopTitle,
      template: summarizeWsSend(parsed),
      appCid: parsed?.body?.appCid || '',
      receiverAppUids: parsed?.body?.receiverAppUids || [],
      capturedAt: new Date().toISOString(),
      source: 'bridge-ws-capture',
    };
    saveCapturedTemplates(dataDir, templates);

    const msg = `[bridge-capture] 已录制${kind === 'video' ? '视频' : '图片'}发送 WS 模板`;
    console.log(msg);
    if (onEvent) onEvent({ type: 'send', kind, entry: templates[key] });
  });
}

module.exports = {
  CAPTURE_FILENAME,
  captureFilePath,
  botDebugLogDir,
  loadCapturedTemplates,
  saveCapturedTemplates,
  getCaptureStatus,
  pickUploadTemplate,
  pickPermitTemplate,
  pickWsSendTemplate,
  buildUploadPageScript,
  buildEvaMediaUploadScript,
  installNetworkCapture,
  classifyWsSend,
  normalizeCdnUrl,
  readLatestManualSendFromBotLogs,
  syncBotLogTemplates,
};

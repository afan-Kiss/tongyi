const express = require('express');
const fs = require('fs');
const path = require('path');
const multer = require('multer');
const {
  loadConfig,
  getPublicConfig,
  getEditorConfig,
  updateSettings,
  verifySettingsPassword,
} = require('../config');
const { getOrders, clearOrdersCache } = require('../services/orderService');
const { resolveAccounts, clearOutboundAccountCache, getOutboundConfigPath } = require('../services/xhsAccountImport');
const { debugLog } = require('../debugLog');
const { sendImageToBuyer, sendVideoToBuyer, openSessionWithBuyer, checkBridgeHealth } = require('../services/bridgeService');
const { mergeImagesVertically } = require('../services/imageService');
const { prepareVideoForSend, MAX_VIDEO_BYTES, findFfmpeg, extractCoverJpeg, pickVideoExt } = require('../services/videoService');
const { ROOT } = require('../config');

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 20 * 1024 * 1024 },
});

const videoUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 500 * 1024 * 1024 },
});

function requireSettingsAuth(req, res, next) {
  if (req.session?.settingsAuthed) return next();
  return res.status(401).json({ error: '需要设置密码' });
}

function createApiRouter() {
  const router = express.Router();

  router.get('/health', (_req, res) => {
    res.json({ ok: true, service: 'xiangyu-system' });
  });

  router.get('/config/public', (_req, res) => {
    const config = loadConfig();
    res.json(getPublicConfig(config));
  });

  router.post('/auth/settings', (req, res) => {
    const config = loadConfig();
    const password = String(req.body?.password || '');
    if (!verifySettingsPassword(config, password)) {
      return res.status(401).json({ error: '密码错误' });
    }
    req.session.settingsAuthed = true;
    res.json({ ok: true });
  });

  router.post('/auth/logout', (req, res) => {
    req.session.settingsAuthed = false;
    res.json({ ok: true });
  });

  router.get('/auth/status', (req, res) => {
    res.json({ authed: Boolean(req.session?.settingsAuthed) });
  });

  router.get('/settings', requireSettingsAuth, (_req, res) => {
    // #region agent log
    debugLog('api.js:settings', 'settings handler enter', { hasGetOutboundConfigPath: typeof getOutboundConfigPath === 'function' }, 'H1');
    // #endregion
    try {
      const config = loadConfig();
      const accounts = resolveAccounts(config).map((a) => ({
        ...a,
        cookie: a.cookie ? `${a.cookie.slice(0, 24)}...` : '',
      }));
      res.json({
        shop: config.shop,
        orders: { cacheTtlMs: config.orders?.cacheTtlMs },
        bridge: config.bridge,
        tunnel: config.tunnel,
        upload: config.upload,
        editor: getEditorConfig(config),
        accounts,
        accountSource: getOutboundConfigPath(),
        server: { port: config.server.port, host: config.server.host },
      });
    } catch (err) {
      // #region agent log
      debugLog('api.js:settings', 'settings handler error', { error: String(err.message || err) }, 'H1');
      // #endregion
      res.status(500).json({ error: String(err.message || err) });
    }
  });

  router.post('/settings/import-accounts', requireSettingsAuth, (_req, res) => {
    const config = loadConfig();
    const imported = resolveAccounts(config);
    if (!imported.length) {
      return res.status(400).json({
        error: `未从辅助出库软件读取到店铺 Cookie，请确认文件存在：${getOutboundConfigPath()}`,
      });
    }
    clearOrdersCache();
    clearOutboundAccountCache();
    res.json({
      ok: true,
      message: `已从辅助出库软件读取 ${imported.length} 个店铺`,
      accounts: imported.map((a) => ({
        ...a,
        cookie: a.cookie ? `${a.cookie.slice(0, 24)}...` : '',
      })),
    });
  });

  router.put('/settings', requireSettingsAuth, (req, res) => {
    const config = loadConfig();
    const patch = req.body || {};
    const newPassword = patch.newPassword;
    delete patch.newPassword;

    const next = updateSettings(config, patch, newPassword || '');
    clearOrdersCache();
    clearOutboundAccountCache();
    res.json({ ok: true, public: getPublicConfig(next) });
  });

  router.post('/editor/preface', (req, res) => {
    const text = String(req.body?.text || '').trim();
    if (!text) {
      return res.status(400).json({ error: '说明文字不能为空' });
    }
    const enabled = req.body?.enabled !== false;
    const config = loadConfig();
    const next = updateSettings(config, {
      editor: {
        ...config.editor,
        prefaceMessage: text,
        prefaceEnabled: enabled,
      },
    });
    res.json({
      ok: true,
      editor: {
        prefaceMessage: next.editor.prefaceMessage,
        prefaceEnabled: next.editor.prefaceEnabled !== false,
      },
    });
  });

  router.get('/orders', async (req, res) => {
    const t0 = Date.now();
    const refresh = req.query.refresh === '1' || req.query.refresh === 'true';
    const day = req.query.day === 'today' || req.query.day === 'yesterday' ? req.query.day : 'both';
    // #region agent log
    debugLog('api.js:orders', 'orders request start', { refresh, day }, 'H2');
    // #endregion
    try {
      const data = await getOrders({ refresh, day });
      // #region agent log
      debugLog('api.js:orders', 'orders request done', {
        refresh,
        ms: Date.now() - t0,
        cached: Boolean(data.cached),
        count: data.all?.length || 0,
      }, 'H2');
      // #endregion
      if (data.cached) {
        res.setHeader('X-Orders-Cache', 'hit');
      }
      res.json(data);
    } catch (err) {
      // #region agent log
      debugLog('api.js:orders', 'orders request error', { refresh, ms: Date.now() - t0, error: String(err.message || err) }, 'H2');
      // #endregion
      res.status(500).json({ error: err.message || '订单暂时加载不出来' });
    }
  });

  router.get('/bridge/health', async (_req, res) => {
    const result = await checkBridgeHealth();
    res.json(result);
  });

  router.post('/images/merge', upload.array('images', 20), async (req, res) => {
    try {
      const files = req.files || [];
      if (!files.length) {
        return res.status(400).json({ error: '请上传至少一张图片' });
      }
      const merged = await mergeImagesVertically(files.map((f) => f.buffer));
      res.json({
        ok: true,
        width: merged.width,
        height: merged.height,
        mime: merged.mime,
        imageBase64: `data:${merged.mime};base64,${merged.buffer.toString('base64')}`,
      });
    } catch (err) {
      res.status(500).json({ error: String(err.message || err) });
    }
  });

  router.post('/bridge/open-session', async (req, res) => {
    try {
      const { order } = req.body || {};
      const result = await openSessionWithBuyer({
        shopTitle: order?.shopTitle,
        buyerNick: order?.buyerNick,
        buyerUserId: order?.buyerUserId,
        sellerId: order?.sellerId,
        packageId: order?.packageId,
        orderId: order?.orderId,
      });
      res.json(result);
    } catch (err) {
      res.status(500).json({ error: String(err.message || err) });
    }
  });

  router.post('/send', async (req, res) => {
    let imagePath = '';
    try {
      const { order, imageBase64, imageUrl, prefaceText, sendPreface } = req.body || {};
      if (!order?.buyerUserId && !order?.appCid) {
        return res.status(400).json({ error: '订单缺少买家信息，无法发送' });
      }

      if (imageBase64 && !imageUrl) {
        const tmpDir = path.join(ROOT, 'data', 'image-tmp');
        fs.mkdirSync(tmpDir, { recursive: true });
        const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
        imagePath = path.join(tmpDir, `${id}.jpg`);
        const b64 = String(imageBase64).replace(/^data:image\/\w+;base64,/, '');
        fs.writeFileSync(imagePath, Buffer.from(b64, 'base64'));
      }

      const result = await sendImageToBuyer({
        shopTitle: order?.shopTitle,
        appCid: order?.appCid,
        receiverAppUids: order?.receiverAppUids,
        orderId: order?.orderId,
        buyerNick: order?.buyerNick,
        buyerUserId: order?.buyerUserId,
        sellerId: order?.sellerId,
        packageId: order?.packageId,
        imagePath: imagePath || undefined,
        imageUrl,
        sendPreface: Boolean(sendPreface && prefaceText),
        prefaceText: sendPreface ? String(prefaceText || '').trim() : '',
      });

      if (sendPreface && prefaceText) {
        const prefaceOk = Boolean(result.preface?.delivered ?? result.preface?.msgId);
        if (!prefaceOk) {
          return res.status(500).json({
            error: result.preface?.message || '说明文字发送未确认，请稍后在千帆里检查',
          });
        }
      }
      if (!result.delivered && !result.msgId) {
        return res.status(500).json({ error: result.message || '发送未确认，请稍后在千帆里检查' });
      }
      res.json(result);
    } catch (err) {
      res.status(500).json({ error: String(err.message || '发送失败，请稍后再试') });
    } finally {
      if (imagePath && fs.existsSync(imagePath)) {
        try {
          fs.unlinkSync(imagePath);
        } catch {
          // ignore
        }
      }
    }
  });

  router.post('/video/prepare', videoUpload.single('video'), async (req, res) => {
    try {
      const file = req.file;
      if (!file) {
        return res.status(400).json({ error: '请上传视频文件' });
      }

      const originalSize = file.size;
      const { buffer, compressed, transcoded, skipped, size, meta } = await prepareVideoForSend(file.buffer, {
        originalName: file.originalname,
      });

      const tmpDir = path.join(ROOT, 'data', 'video-tmp');
      fs.mkdirSync(tmpDir, { recursive: true });
      const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      const ext = skipped ? pickVideoExt(file.originalname) : '.mp4';
      const videoPath = path.join(tmpDir, `${id}${ext}`);
      fs.writeFileSync(videoPath, buffer);

      let coverPath = '';
      const ffmpeg = await findFfmpeg();
      if (ffmpeg) {
        try {
          const coverBuf = await extractCoverJpeg(ffmpeg, videoPath);
          coverPath = path.join(tmpDir, `${id}-cover.jpg`);
          fs.writeFileSync(coverPath, coverBuf);
        } catch {
          // cover optional
        }
      }

      res.json({
        ok: true,
        videoPath,
        coverPath,
        originalSize,
        size,
        compressed,
        transcoded: Boolean(transcoded),
        skipped: Boolean(skipped),
        maxBytes: MAX_VIDEO_BYTES,
        meta: {
          width: meta.width,
          height: meta.height,
          duration: meta.duration,
          dimension: `${meta.width}*${meta.height}`,
        },
      });
    } catch (err) {
      res.status(500).json({ error: String(err.message || err) });
    }
  });

  router.post('/send/video', async (req, res) => {
    try {
      const { order, videoPath, coverPath, videoMeta, fileName } = req.body || {};
      const videoTmpDir = path.join(ROOT, 'data', 'video-tmp');
      const resolvedVideo = videoPath ? path.resolve(String(videoPath)) : '';
      const videoInTmp = resolvedVideo.startsWith(path.resolve(videoTmpDir));
      // #region agent log
      debugLog('api.js:send/video', 'video send path check', { videoInTmp, hasCover: Boolean(coverPath) }, 'H4');
      // #endregion
      if (!videoPath) {
        return res.status(400).json({ error: '请先准备好视频再发送' });
      }
      const result = await sendVideoToBuyer({
        shopTitle: order?.shopTitle,
        appCid: order?.appCid,
        receiverAppUids: order?.receiverAppUids,
        orderId: order?.orderId,
        buyerNick: order?.buyerNick,
        buyerUserId: order?.buyerUserId,
        sellerId: order?.sellerId,
        packageId: order?.packageId,
        videoPath,
        coverPath,
        videoMeta,
        fileName,
      });
      if (!result.delivered && !result.msgId) {
        return res.status(500).json({ error: result.message || '发送未确认，请稍后在千帆里检查' });
      }
      res.json(result);
    } catch (err) {
      res.status(500).json({ error: String(err.message || err) });
    }
  });

  return router;
}

module.exports = { createApiRouter };

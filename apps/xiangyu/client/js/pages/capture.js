import { api } from '../api.js';
import { ensureSendReady } from '../sessionSetup.js';
import { getSelectedOrder, setCapturedPhotos, getCapturedPhotos, clearVideoPrepared, setSendReady, formatBuyerWithShop, markOrderPackSent, initSentOrders } from '../store.js';
import { isMobileDevice, canUseLiveCamera, liveCameraBlockedReason } from '../media.js';

function escapeHtml(str) {
  return String(str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function dataUrlToFile(dataUrl, filename) {
  const [meta, base64] = dataUrl.split(',');
  const mime = meta.match(/data:(.*);base64/)?.[1] || 'image/jpeg';
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return new File([bytes], filename, { type: mime });
}

function formatBytes(n) {
  const v = Number(n) || 0;
  if (v < 1024 * 1024) return `${(v / 1024).toFixed(1)} KB`;
  return `${(v / 1024 / 1024).toFixed(2)} MB`;
}

function formatDuration(sec) {
  const s = Math.floor(Number(sec) || 0);
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m}:${String(r).padStart(2, '0')}`;
}

async function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}

async function normalizePhotoDataUrl(dataUrl, maxSide = 1280) {
  const img = await loadImage(dataUrl);
  const scale = Math.min(1, maxSide / Math.max(img.width, img.height));
  const w = Math.max(1, Math.round(img.width * scale));
  const h = Math.max(1, Math.round(img.height * scale));
  if (scale >= 1 && dataUrl.includes('image/jpeg') && Math.max(img.width, img.height) <= maxSide) {
    return dataUrl;
  }
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  canvas.getContext('2d').drawImage(img, 0, 0, w, h);
  return canvas.toDataURL('image/jpeg', 0.82);
}

export async function renderCapturePage(root, { navigate, toast }) {
  const order = getSelectedOrder();
  if (!order) {
    root.innerHTML = `<div class="empty card">请先选择订单 <button class="btn primary" id="backOrders">返回订单</button></div>`;
    root.querySelector('#backOrders').addEventListener('click', () => navigate('orders'));
    return;
  }

  const liveCameraOk = canUseLiveCamera();
  const mobileDevice = isMobileDevice();
  const cameraBlockedHint = liveCameraBlockedReason();
  let videoSubMode = liveCameraOk ? 'record' : 'upload';
  let photos = getCapturedPhotos();
  let stream = null;
  let mediaRecorder = null;
  let recordedChunks = [];
  let recordedBlob = null;
  let uploadedFile = null;
  let recordSeconds = 0;
  let recordTimer = null;
  let photoCameraActive = false;
  let photoNormalizeQueue = Promise.resolve();

  root.innerHTML = `
    <section>
        <div class="page-header">
        <button type="button" class="back-btn" id="backBtn">← 返回</button>
        <div class="page-header-main">
          <h1 class="page-title">拍摄发送</h1>
          <p class="page-desc">${escapeHtml(formatBuyerWithShop(order))}${order.productTitle ? ` · ${escapeHtml(order.productTitle)}` : ''}</p>
        </div>
      </div>

      <div class="workflow-strip">
        <span class="workflow-step done">① 选订单</span>
        <span class="workflow-arrow">→</span>
        <span class="workflow-step active">② 拍照</span>
        <span class="workflow-arrow">→</span>
        <span class="workflow-step">③ 标注发送</span>
      </div>

      <div class="status-bar" id="envStatus" hidden></div>

      <div class="mode-tabs main-tabs">
        <button type="button" class="mode-tab active" data-main="photo">拍照</button>
        <button type="button" class="mode-tab" data-main="video">拍视频</button>
      </div>

      <div class="card card-accent-top" id="photoPanel">
        <div class="camera-wrap">
          <video id="cameraVideo" autoplay playsinline muted hidden></video>
          <div class="capture-flash" id="captureFlash" aria-hidden="true"></div>
          <div class="photo-live-badge" id="photoLiveBadge" hidden>连拍</div>
          <div class="camera-placeholder" id="cameraPlaceholder">
            <div class="camera-placeholder-icon">📷</div>
            <p id="cameraPlaceholderText">${cameraBlockedHint || '正在打开摄像头…'}</p>
          </div>
        </div>
        <div class="toolbar photo-sub-toolbar">
          <button type="button" class="btn ghost" id="pickBtn">从相册选图</button>
          <button type="button" class="btn ghost" id="clearBtn">清空</button>
        </div>
        <div class="sticky-action-bar photo-shoot-bar">
          <button type="button" class="btn primary btn-shoot" id="shootBtn">拍一张</button>
          <button type="button" class="btn secondary" id="nextBtn" ${photos.length ? '' : 'disabled'}>去合成 (${photos.length})</button>
        </div>
        <p class="photo-hint" id="photoHint">${cameraBlockedHint || '预览中连点「拍一张」可连续拍摄'}</p>
        <input type="file" id="fileInputAlbum" accept="image/*" multiple hidden />
        <div class="thumb-grid" id="thumbGrid"></div>
      </div>

      <div class="card card-accent-top" id="videoPanel" hidden>
        <div class="mode-tabs video-sub-tabs ${liveCameraOk ? '' : 'video-sub-tabs--single'}">
          <button type="button" class="mode-tab ${liveCameraOk ? 'active' : ''}" data-vsub="record" ${liveCameraOk ? '' : 'hidden'}>录制</button>
          <button type="button" class="mode-tab ${liveCameraOk ? '' : 'active'}" data-vsub="upload">上传文件</button>
        </div>
        <div class="video-preview-wrap">
          <video id="videoPreview" autoplay playsinline muted></video>
          <div class="rec-indicator" id="recIndicator" hidden>
            <span class="rec-dot"></span>
            <span id="recTime">00:00</span>
          </div>
        </div>
        <div class="toolbar video-toolbar" id="videoToolbar">
          <button type="button" class="btn primary video-rec-btn" id="startRecBtn">开始录制</button>
          <button type="button" class="btn ghost video-rec-btn" id="stopRecBtn" disabled>停止</button>
          <button type="button" class="btn ghost video-rec-btn" id="resetRecBtn">重录</button>
        </div>
        <div class="sticky-action-bar">
          <button type="button" class="btn primary video-send-btn" id="sendVideoBtn" disabled>发送视频</button>
        </div>
        <input type="file" id="videoFileInput" accept="video/*" hidden />
        <div class="video-info" id="videoInfo">录好后点「发送视频」即可</div>
        <div class="status-bar" id="videoStatus">录好视频后，直接点「发送视频」</div>
      </div>
    </section>
  `;

  const envStatus = root.querySelector('#envStatus');
  const photoPanel = root.querySelector('#photoPanel');
  const videoPanel = root.querySelector('#videoPanel');
  const cameraVideo = root.querySelector('#cameraVideo');
  const videoPreview = root.querySelector('#videoPreview');
  const thumbGrid = root.querySelector('#thumbGrid');
  const nextBtn = root.querySelector('#nextBtn');
  const fileInputAlbum = root.querySelector('#fileInputAlbum');
  const cameraPlaceholder = root.querySelector('#cameraPlaceholder');
  const cameraPlaceholderText = root.querySelector('#cameraPlaceholderText');
  const photoLiveBadge = root.querySelector('#photoLiveBadge');
  const photoHint = root.querySelector('#photoHint');
  const shootBtn = root.querySelector('#shootBtn');
  const captureFlash = root.querySelector('#captureFlash');
  const videoStatus = root.querySelector('#videoStatus');
  const sendVideoBtn = root.querySelector('#sendVideoBtn');
  const videoFileInput = root.querySelector('#videoFileInput');
  const videoToolbar = root.querySelector('#videoToolbar');
  const videoInfo = root.querySelector('#videoInfo');

  function updatePhotoUi() {
    nextBtn.disabled = photos.length === 0;
    nextBtn.textContent = `去合成 (${photos.length})`;
    if (photoCameraActive) {
      shootBtn.textContent = photos.length ? `拍一张 · 共 ${photos.length} 张` : '拍一张';
    }
  }

  function renderThumbs() {
    thumbGrid.innerHTML = photos
      .map((src, idx) => `<div class="thumb"><img src="${src}" alt="photo-${idx}" /></div>`)
      .join('');
    updatePhotoUi();
  }

  function setPhotoCameraUi(active, placeholderText) {
    photoCameraActive = active;
    cameraVideo.hidden = !active;
    if (cameraPlaceholder) cameraPlaceholder.hidden = active;
    if (photoLiveBadge) photoLiveBadge.hidden = !active;
    if (placeholderText && cameraPlaceholderText) cameraPlaceholderText.textContent = placeholderText;
    if (photoHint) {
      photoHint.textContent = active
        ? '预览中连点「拍一张」可连续拍摄'
        : cameraBlockedHint || '点击「拍一张」尝试打开摄像头，或用相册选图';
    }
    updatePhotoUi();
  }

  function flashCapture() {
    if (!captureFlash) return;
    captureFlash.classList.remove('active');
    void captureFlash.offsetWidth;
    captureFlash.classList.add('active');
    if (navigator.vibrate) navigator.vibrate(20);
  }

  function captureFrameFromPreview() {
    if (!cameraVideo.videoWidth) return null;
    const canvas = document.createElement('canvas');
    canvas.width = cameraVideo.videoWidth;
    canvas.height = cameraVideo.videoHeight;
    canvas.getContext('2d').drawImage(cameraVideo, 0, 0);
    return canvas.toDataURL('image/jpeg', 0.82);
  }

  function queuePhotoNormalize(index) {
    photoNormalizeQueue = photoNormalizeQueue.then(async () => {
      if (index >= photos.length) return;
      try {
        photos[index] = await normalizePhotoDataUrl(photos[index]);
        renderThumbs();
      } catch {
        /* keep raw frame */
      }
      await persistPhotos();
    });
  }

  function shootFromPreview() {
    const dataUrl = captureFrameFromPreview();
    if (!dataUrl) return false;
    flashCapture();
    const index = photos.length;
    photos.push(dataUrl);
    renderThumbs();
    queuePhotoNormalize(index);
    return true;
  }

  async function persistPhotos() {
    const ok = setCapturedPhotos(photos);
    if (!ok) toast('照片过多或过大，请减少张数');
    renderThumbs();
  }

  async function addPhoto(dataUrl) {
    try {
      photos.push(await normalizePhotoDataUrl(dataUrl));
    } catch {
      photos.push(dataUrl);
    }
    await persistPhotos();
  }

  function stopStream() {
    if (stream) {
      stream.getTracks().forEach((t) => t.stop());
      stream = null;
    }
  }

  async function startPhotoCamera() {
    if (!navigator.mediaDevices?.getUserMedia) {
      setPhotoCameraUi(false, cameraBlockedHint || '当前浏览器不支持摄像头，请从相册选图');
      return false;
    }
    stopStream();
    if (cameraPlaceholderText) cameraPlaceholderText.textContent = '正在打开摄像头…';
    if (cameraPlaceholder) cameraPlaceholder.hidden = false;
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: 'environment' } },
        audio: false,
      });
      cameraVideo.srcObject = stream;
      await new Promise((resolve) => {
        if (cameraVideo.readyState >= 2) {
          resolve();
          return;
        }
        cameraVideo.onloadeddata = () => resolve();
      });
      setPhotoCameraUi(true);
      return true;
    } catch {
      setPhotoCameraUi(
        false,
        cameraBlockedHint || '无法打开摄像头，请从相册选图，或改用 HTTPS 访问以实时连拍',
      );
      return false;
    }
  }

  async function startVideoCamera() {
    if (!liveCameraOk) return false;
    const tries = [
      { video: { facingMode: { ideal: 'environment' } }, audio: true },
      { video: { facingMode: { ideal: 'environment' } }, audio: false },
      { video: true, audio: false },
    ];
    let lastErr = null;
    for (const constraints of tries) {
      try {
        stream = await navigator.mediaDevices.getUserMedia(constraints);
        videoPreview.srcObject = stream;
        videoPreview.muted = true;
        videoPreview.controls = false;
        return true;
      } catch (err) {
        lastErr = err;
      }
    }
    if (mobileDevice) {
      videoInfo.textContent = '手机 HTTP 访问无法录制，请用「上传文件」';
      videoStatus.textContent = '请切换到「上传文件」选择视频';
    } else {
      toast('无法打开摄像头，可改用「上传文件」', { type: 'err' });
    }
    console.warn('video camera:', lastErr?.message || lastErr);
    return false;
  }

  function switchMainMode(mode) {
    root.querySelectorAll('.main-tabs .mode-tab').forEach((tab) => {
      tab.classList.toggle('active', tab.dataset.main === mode);
    });
    photoPanel.hidden = mode !== 'photo';
    videoPanel.hidden = mode !== 'video';

    if (mode === 'photo') {
      if (recordTimer) clearInterval(recordTimer);
      if (mediaRecorder && mediaRecorder.state !== 'inactive') mediaRecorder.stop();
      root.querySelector('#recIndicator').hidden = true;
      startPhotoCamera();
    } else {
      switchVideoSubMode(liveCameraOk ? videoSubMode : 'upload');
    }
  }

  function resetVideoState() {
    if (recordTimer) clearInterval(recordTimer);
    recordTimer = null;
    if (mediaRecorder && mediaRecorder.state !== 'inactive') mediaRecorder.stop();
    mediaRecorder = null;
    recordedChunks = [];
    recordedBlob = null;
    uploadedFile = null;
    recordSeconds = 0;
    clearVideoPrepared();
    sendVideoBtn.disabled = true;
    root.querySelector('#recIndicator').hidden = true;
    root.querySelector('#recTime').textContent = '00:00';
    root.querySelector('#startRecBtn').disabled = false;
    root.querySelector('#stopRecBtn').disabled = true;
    videoStatus.className = 'status-bar';
    if (videoPreview.src?.startsWith('blob:')) URL.revokeObjectURL(videoPreview.src);
    videoPreview.removeAttribute('src');
    videoPreview.srcObject = null;
    videoPreview.controls = false;
    videoFileInput.value = '';
  }

  function switchVideoSubMode(sub, { openPicker = false } = {}) {
    if (!liveCameraOk) sub = 'upload';
    const prevSub = videoSubMode;
    if (prevSub !== sub) resetVideoState();
    videoSubMode = sub;
    root.querySelectorAll('.video-sub-tabs .mode-tab').forEach((tab) => {
      tab.classList.toggle('active', tab.dataset.vsub === sub);
    });
    const isRecord = sub === 'record';
    videoToolbar.classList.toggle('video-toolbar--upload-only', !isRecord);

    if (isRecord) {
      videoInfo.textContent = '录好后点「发送视频」即可';
      videoStatus.textContent = '录好视频后，直接点「发送视频」';
      videoPreview.controls = false;
      startVideoCamera();
    } else {
      videoInfo.textContent = '不超过 100MB 会直接发送；超过时会自动缩小，选好文件后点「发送视频」';
      videoStatus.textContent = '点「上传文件」选择本地视频';
      stopStream();
      videoPreview.controls = true;
      if (openPicker) videoFileInput.click();
    }
  }

  function showVideoPreviewFromBlob(blob) {
    if (videoPreview.src?.startsWith('blob:')) URL.revokeObjectURL(videoPreview.src);
    videoPreview.srcObject = null;
    videoPreview.src = URL.createObjectURL(blob);
    videoPreview.muted = false;
    videoPreview.controls = true;
  }

  function setSendVideoEnabled() {
    sendVideoBtn.disabled = !(recordedBlob || uploadedFile);
  }

  function onVideoReady(label) {
    clearVideoPrepared();
    setSendVideoEnabled();
    videoStatus.textContent = label;
    videoStatus.className = 'status-bar ok';
  }

  root.querySelector('#backBtn').addEventListener('click', () => {
    stopStream();
    navigate('orders');
  });

  root.querySelectorAll('.main-tabs .mode-tab').forEach((tab) => {
    tab.addEventListener('click', () => switchMainMode(tab.dataset.main));
  });

  root.querySelectorAll('.video-sub-tabs .mode-tab').forEach((tab) => {
    tab.addEventListener('click', () => {
      const sub = tab.dataset.vsub;
      switchVideoSubMode(sub, { openPicker: sub === 'upload' });
    });
  });

  async function addPhotosFromFiles(files) {
    const list = [...files];
    if (!list.length) return 0;
    const before = photos.length;
    for (const file of list) {
      const dataUrl = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });
      await addPhoto(dataUrl);
    }
    const added = photos.length - before;
    if (added > 0) toast(`已添加 ${added} 张，共 ${photos.length} 张`);
    return added;
  }

  shootBtn.addEventListener('click', async () => {
    if (photoCameraActive && shootFromPreview()) return;
    if (!photoCameraActive) {
      const ok = await startPhotoCamera();
      if (ok && shootFromPreview()) return;
      toast(cameraBlockedHint || '摄像头未就绪，请从相册选图', { type: 'err' });
    }
  });

  root.querySelector('#pickBtn').addEventListener('click', () => fileInputAlbum.click());

  fileInputAlbum.addEventListener('change', async () => {
    await addPhotosFromFiles(fileInputAlbum.files);
    fileInputAlbum.value = '';
  });

  root.querySelector('#clearBtn').addEventListener('click', () => {
    photos = [];
    persistPhotos();
  });

  root.querySelector('#nextBtn').addEventListener('click', () => {
    if (!photos.length) return;
    stopStream();
    navigate('editor');
  });

  root.querySelector('#startRecBtn').addEventListener('click', () => {
    if (!liveCameraOk) {
      switchVideoSubMode('upload', { openPicker: true });
      return;
    }
    if (!stream) {
      toast('摄像头未就绪，请改用「上传文件」');
      return;
    }
    recordedChunks = [];
    recordedBlob = null;
    uploadedFile = null;
    clearVideoPrepared();
    sendVideoBtn.disabled = true;

    const mime = MediaRecorder.isTypeSupported('video/webm;codecs=vp9')
      ? 'video/webm;codecs=vp9'
      : 'video/webm';
    mediaRecorder = new MediaRecorder(stream, { mimeType: mime });
    mediaRecorder.ondataavailable = (e) => {
      if (e.data.size) recordedChunks.push(e.data);
    };
    mediaRecorder.onstop = () => {
      recordedBlob = new Blob(recordedChunks, { type: mediaRecorder.mimeType || 'video/webm' });
      showVideoPreviewFromBlob(recordedBlob);
      onVideoReady(`录制完成 ${formatBytes(recordedBlob.size)}，可以发送了`);
    };
    mediaRecorder.start(1000);
    root.querySelector('#recIndicator').hidden = false;
    recordSeconds = 0;
    root.querySelector('#recTime').textContent = '00:00';
    recordTimer = setInterval(() => {
      recordSeconds += 1;
      root.querySelector('#recTime').textContent = formatDuration(recordSeconds);
    }, 1000);
    root.querySelector('#startRecBtn').disabled = true;
    root.querySelector('#stopRecBtn').disabled = false;
  });

  root.querySelector('#stopRecBtn').addEventListener('click', () => {
    if (mediaRecorder && mediaRecorder.state !== 'inactive') mediaRecorder.stop();
    clearInterval(recordTimer);
    root.querySelector('#recIndicator').hidden = true;
    root.querySelector('#startRecBtn').disabled = false;
    root.querySelector('#stopRecBtn').disabled = true;
  });

  root.querySelector('#resetRecBtn').addEventListener('click', () => {
    resetVideoState();
    if (videoSubMode === 'record') startVideoCamera();
    videoStatus.textContent = '已重置，请重新录制';
  });

  videoFileInput.addEventListener('change', () => {
    const file = videoFileInput.files?.[0];
    if (!file) return;
    uploadedFile = file;
    recordedBlob = null;
    showVideoPreviewFromBlob(file);
    onVideoReady(`已选好 ${file.name}（${formatBytes(file.size)}），可以发送了`);
    videoFileInput.value = '';
  });

  sendVideoBtn.addEventListener('click', async () => {
    const source = uploadedFile || recordedBlob;
    if (!source) {
      toast('请先录制或上传视频');
      return;
    }

    sendVideoBtn.disabled = true;
    const directSend = uploadedFile && uploadedFile.size <= 100 * 1024 * 1024;
    videoStatus.textContent = directSend ? '正在发送视频…' : '正在处理视频，请稍等…';
    videoStatus.className = 'status-bar';

    try {
      const fd = new FormData();
      fd.append('video', source, uploadedFile?.name || 'record.webm');
      const prep = await api.prepareVideo(fd);
      if (prep.skipped || prep.compressed === false && !prep.transcoded) {
        videoStatus.textContent = '正在发送视频（原画质）…';
      } else if (prep.compressed) {
        videoStatus.textContent = '视频超过 100MB，已缩小画质，正在发送…';
      } else if (prep.transcoded) {
        videoStatus.textContent = '视频已转为 MP4，正在发送…';
      } else {
        videoStatus.textContent = '正在发送视频…';
      }

      await api.sendVideo({
        order: getSelectedOrder(),
        videoPath: prep.videoPath,
        coverPath: prep.coverPath,
        videoMeta: {
          ...prep.meta,
          duration:
            Number(prep.meta?.duration) > 0
              ? prep.meta.duration
              : (recordedBlob ? Math.max(1, recordSeconds) : 1),
        },
        fileName: 'xiangyu.mp4',
      });

      videoStatus.textContent = '发送成功，千帆已确认收到';
      videoStatus.className = 'status-bar ok';
      toast('发送成功，千帆已确认收到', { type: 'ok' });
      markOrderPackSent(getSelectedOrder(), 'video', api);
      await initSentOrders(api, { force: true });
      clearVideoPrepared();
      setTimeout(() => navigate('orders'), 1500);
    } catch (err) {
      videoStatus.textContent = `发送失败：${err.message}`;
      videoStatus.className = 'status-bar err';
      toast(err.message, { type: 'err' });
      setSendVideoEnabled();
    }
  });

  renderThumbs();
  startPhotoCamera();
  if (cameraBlockedHint && envStatus) {
    envStatus.hidden = false;
    envStatus.textContent = cameraBlockedHint;
    envStatus.className = 'status-bar';
  }

  ensureSendReady().then((result) => {
    setSendReady(result);
    if (!result.ready) {
      envStatus.hidden = false;
      envStatus.textContent = result.message;
      envStatus.className = 'status-bar err';
      toast(result.message, { type: 'err' });
    }
  });

  return () => {
    stopStream();
    clearInterval(recordTimer);
    if (mediaRecorder && mediaRecorder.state !== 'inactive') mediaRecorder.stop();
    if (videoPreview.src?.startsWith('blob:')) URL.revokeObjectURL(videoPreview.src);
  };
}

export { dataUrlToFile };

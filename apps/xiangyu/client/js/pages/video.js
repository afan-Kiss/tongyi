import { api } from '../api.js';
import { getSelectedOrder, setVideoPrepared, getVideoPrepared, clearVideoPrepared, formatBuyerWithShop } from '../store.js';

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

export async function renderVideoPage(root, { navigate, toast }) {
  const order = getSelectedOrder();
  if (!order) {
    root.innerHTML = `<div class="empty card">请先选择订单 <button class="btn primary" id="backOrders">返回订单</button></div>`;
    root.querySelector('#backOrders').addEventListener('click', () => navigate('orders'));
    return;
  }

  let mode = 'record';
  let mediaStream = null;
  let mediaRecorder = null;
  let recordedChunks = [];
  let recordedBlob = null;
  let uploadedFile = null;
  let recordSeconds = 0;
  let recordTimer = null;

  root.innerHTML = `
    <section>
      <h1 class="page-title">发送视频</h1>
      <p class="muted">${formatBuyerWithShop(order)} · ${order.productTitle || order.orderId}</p>
      <div class="workflow-links">
        <button class="link-chip" id="goCapture">去拍照发图</button>
      </div>
      <div class="card" style="margin-top:12px">
        <div class="mode-tabs">
          <button class="mode-tab active" data-mode="record">录制视频</button>
          <button class="mode-tab" data-mode="upload">上传视频</button>
        </div>
        <div class="video-preview-wrap">
          <video id="videoPreview" autoplay playsinline muted></video>
          <div class="rec-indicator" id="recIndicator" hidden>
            <span class="rec-dot"></span>
            <span id="recTime">00:00</span>
          </div>
        </div>
        <div class="toolbar" id="recordToolbar">
          <button class="btn primary" id="startRecBtn">开始录制</button>
          <button class="btn ghost" id="stopRecBtn" disabled>停止</button>
          <button class="btn ghost" id="resetRecBtn">重录</button>
        </div>
        <div class="toolbar" id="uploadToolbar" hidden>
          <button class="btn primary" id="pickVideoBtn">选择视频文件</button>
          <button class="btn ghost" id="clearVideoBtn">清除</button>
        </div>
        <input type="file" id="videoFileInput" accept="video/*" hidden />
        <div class="video-info" id="videoInfo">支持 MP4/MOV/WebM，超过 100MB 将自动压缩</div>
        <div class="toolbar">
          <button class="btn secondary" id="prepareBtn" disabled>压缩并准备发送</button>
          <button class="btn primary" id="sendVideoBtn" disabled>发送给买家</button>
        </div>
        <div class="status-bar" id="videoStatus">录制或选择视频后，点击「压缩并准备发送」</div>
      </div>
    </section>
  `;

  const preview = root.querySelector('#videoPreview');
  const recIndicator = root.querySelector('#recIndicator');
  const recTimeEl = root.querySelector('#recTime');
  const recordToolbar = root.querySelector('#recordToolbar');
  const uploadToolbar = root.querySelector('#uploadToolbar');
  const videoInfo = root.querySelector('#videoInfo');
  const status = root.querySelector('#videoStatus');
  const prepareBtn = root.querySelector('#prepareBtn');
  const sendBtn = root.querySelector('#sendVideoBtn');
  const fileInput = root.querySelector('#videoFileInput');

  function updatePreparedUI() {
    const prepared = getVideoPrepared();
    if (prepared?.videoPath) {
      sendBtn.disabled = false;
      status.textContent = `已准备：${formatBytes(prepared.size)}${prepared.compressed ? '（已压缩）' : ''}，可发送`;
      status.className = 'status-bar ok';
      videoInfo.innerHTML = `
        <div>时长 ${formatDuration(prepared.meta?.duration)} · ${prepared.meta?.dimension || ''}</div>
        <div>大小 ${formatBytes(prepared.size)}${prepared.compressed ? ' · 已从 ' + formatBytes(prepared.originalSize) + ' 压缩' : ''}</div>`;
    }
  }

  function setPrepareEnabled() {
    prepareBtn.disabled = !(recordedBlob || uploadedFile);
  }

  function showPreviewFromBlob(blob) {
    if (preview.src && preview.src.startsWith('blob:')) URL.revokeObjectURL(preview.src);
    preview.src = URL.createObjectURL(blob);
    preview.muted = false;
    preview.controls = true;
  }

  async function startCamera() {
    try {
      mediaStream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: 'environment' } },
        audio: true,
      });
      preview.srcObject = mediaStream;
      preview.muted = true;
      preview.controls = false;
    } catch (err) {
      toast('无法打开摄像头：' + err.message);
    }
  }

  function stopCamera() {
    if (mediaStream) {
      mediaStream.getTracks().forEach((t) => t.stop());
      mediaStream = null;
    }
  }

  function switchMode(next) {
    mode = next;
    root.querySelectorAll('.mode-tab').forEach((tab) => {
      tab.classList.toggle('active', tab.dataset.mode === mode);
    });
    recordToolbar.hidden = mode !== 'record';
    uploadToolbar.hidden = mode !== 'upload';
    recordedBlob = null;
    uploadedFile = null;
    clearVideoPrepared();
    sendBtn.disabled = true;
    setPrepareEnabled();

    if (mode === 'record') {
      preview.controls = false;
      startCamera();
    } else {
      stopCamera();
      preview.srcObject = null;
      preview.controls = true;
      status.textContent = '选择本地视频文件';
      status.className = 'status-bar';
    }
  }

  root.querySelectorAll('.mode-tab').forEach((tab) => {
    tab.addEventListener('click', () => switchMode(tab.dataset.mode));
  });

  root.querySelector('#goCapture').addEventListener('click', () => navigate('capture'));

  root.querySelector('#startRecBtn').addEventListener('click', () => {
    if (!mediaStream) {
      toast('摄像头未就绪');
      return;
    }
    recordedChunks = [];
    recordedBlob = null;
    clearVideoPrepared();
    sendBtn.disabled = true;

    const mime = MediaRecorder.isTypeSupported('video/webm;codecs=vp9')
      ? 'video/webm;codecs=vp9'
      : 'video/webm';
    mediaRecorder = new MediaRecorder(mediaStream, { mimeType: mime });
    mediaRecorder.ondataavailable = (e) => {
      if (e.data.size) recordedChunks.push(e.data);
    };
    mediaRecorder.onstop = () => {
      recordedBlob = new Blob(recordedChunks, { type: mediaRecorder.mimeType || 'video/webm' });
      showPreviewFromBlob(recordedBlob);
      setPrepareEnabled();
      status.textContent = `录制完成 ${formatBytes(recordedBlob.size)}，请压缩并准备发送`;
      status.className = 'status-bar';
    };
    mediaRecorder.start(1000);
    recIndicator.hidden = false;
    recordSeconds = 0;
    recTimeEl.textContent = '00:00';
    recordTimer = setInterval(() => {
      recordSeconds += 1;
      recTimeEl.textContent = formatDuration(recordSeconds);
    }, 1000);
    root.querySelector('#startRecBtn').disabled = true;
    root.querySelector('#stopRecBtn').disabled = false;
  });

  root.querySelector('#stopRecBtn').addEventListener('click', () => {
    if (mediaRecorder && mediaRecorder.state !== 'inactive') mediaRecorder.stop();
    clearInterval(recordTimer);
    recIndicator.hidden = true;
    root.querySelector('#startRecBtn').disabled = false;
    root.querySelector('#stopRecBtn').disabled = true;
  });

  root.querySelector('#resetRecBtn').addEventListener('click', () => {
    recordedBlob = null;
    recordedChunks = [];
    clearVideoPrepared();
    sendBtn.disabled = true;
    setPrepareEnabled();
    if (mode === 'record') startCamera();
    status.textContent = '已重置，可重新录制';
    status.className = 'status-bar';
  });

  root.querySelector('#pickVideoBtn').addEventListener('click', () => fileInput.click());

  fileInput.addEventListener('change', () => {
    const file = fileInput.files?.[0];
    if (!file) return;
    uploadedFile = file;
    recordedBlob = null;
    clearVideoPrepared();
    sendBtn.disabled = true;
    showPreviewFromBlob(file);
    setPrepareEnabled();
    status.textContent = `已选择 ${file.name}（${formatBytes(file.size)}）`;
    status.className = 'status-bar';
    fileInput.value = '';
  });

  root.querySelector('#clearVideoBtn').addEventListener('click', () => {
    uploadedFile = null;
    clearVideoPrepared();
    sendBtn.disabled = true;
    setPrepareEnabled();
    preview.removeAttribute('src');
    status.textContent = '已清除';
  });

  prepareBtn.addEventListener('click', async () => {
    const source = uploadedFile || recordedBlob;
    if (!source) return;
    prepareBtn.disabled = true;
    status.textContent = '正在压缩并准备视频…';
    status.className = 'status-bar';

    try {
      const fd = new FormData();
      const name = uploadedFile?.name || 'record.webm';
      fd.append('video', source, name);
      const result = await api.prepareVideo(fd);
      setVideoPrepared(result);
      updatePreparedUI();
      toast(result.compressed ? '已压缩到 100MB 以内' : '视频已准备就绪');
    } catch (err) {
      status.textContent = `准备失败：${err.message}`;
      status.className = 'status-bar err';
      toast(err.message);
    } finally {
      prepareBtn.disabled = false;
      setPrepareEnabled();
    }
  });

  sendBtn.addEventListener('click', async () => {
    const prep = getVideoPrepared();
    if (!prep?.videoPath) {
      toast('请先压缩并准备视频');
      return;
    }
    sendBtn.disabled = true;
    status.textContent = '正在上传并发送到千帆…';
    status.className = 'status-bar';

    try {
      await api.sendVideo({
        order,
        videoPath: prep.videoPath,
        coverPath: prep.coverPath,
        videoMeta: prep.meta,
        fileName: uploadedFile?.name || 'xiangyu.mp4',
      });
      status.textContent = '视频发送成功';
      status.className = 'status-bar ok';
      toast('视频已发送给买家');
      clearVideoPrepared();
      setTimeout(() => navigate('orders'), 1200);
    } catch (err) {
      status.textContent = `发送失败：${err.message}`;
      status.className = 'status-bar err';
      toast(err.message);
      sendBtn.disabled = false;
    }
  });

  updatePreparedUI();
  await startCamera();

  return () => {
    stopCamera();
    clearInterval(recordTimer);
    if (mediaRecorder && mediaRecorder.state !== 'inactive') mediaRecorder.stop();
    if (preview.src && preview.src.startsWith('blob:')) URL.revokeObjectURL(preview.src);
  };
}

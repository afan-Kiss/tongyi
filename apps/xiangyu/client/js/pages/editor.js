import { api } from '../api.js';
import {
  getSelectedOrder,
  getCapturedPhotos,
  setMergedImage,
  clearWorkflow,
  formatBuyerWithShop,
  markOrderPackSent,
} from '../store.js';
import { dataUrlToFile } from './capture.js';

class AnnotationEditor {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.tool = 'arrow';
    this.color = '#ef4444';
    this.lineWidth = 4;
    this.drawing = false;
    this.start = null;
    this.history = [];
    this.baseImage = null;
    this.textInput = '';
    this.pendingTag = '';
    this.tagFontSize = 32;
  }

  setImage(img) {
    this.baseImage = img;
    this.canvas.width = img.width;
    this.canvas.height = img.height;
    this.redraw();
  }

  setPendingTag(tag) {
    this.pendingTag = String(tag || '').trim();
    if (this.pendingTag) this.tool = 'text';
  }

  clearPendingTag() {
    this.pendingTag = '';
  }

  redraw() {
    if (!this.baseImage) return;
    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    this.ctx.drawImage(this.baseImage, 0, 0);
    for (const item of this.history) {
      this.drawItem(item);
    }
  }

  drawItem(item) {
    if (item.type === 'arrow') {
      this.drawArrow(item.x1, item.y1, item.x2, item.y2, item.color, item.lineWidth);
    } else if (item.type === 'text') {
      this.ctx.fillStyle = item.color;
      this.ctx.font = `bold ${item.fontSize || 28}px sans-serif`;
      this.ctx.strokeStyle = 'rgba(255,255,255,0.85)';
      this.ctx.lineWidth = 3;
      this.ctx.strokeText(item.text, item.x, item.y);
      this.ctx.fillText(item.text, item.x, item.y);
    }
  }

  drawArrow(x1, y1, x2, y2, color, width) {
    const head = 14 + width;
    const angle = Math.atan2(y2 - y1, x2 - x1);
    this.ctx.strokeStyle = color;
    this.ctx.fillStyle = color;
    this.ctx.lineWidth = width;
    this.ctx.beginPath();
    this.ctx.moveTo(x1, y1);
    this.ctx.lineTo(x2, y2);
    this.ctx.stroke();
    this.ctx.beginPath();
    this.ctx.moveTo(x2, y2);
    this.ctx.lineTo(x2 - head * Math.cos(angle - Math.PI / 6), y2 - head * Math.sin(angle - Math.PI / 6));
    this.ctx.lineTo(x2 - head * Math.cos(angle + Math.PI / 6), y2 - head * Math.sin(angle + Math.PI / 6));
    this.ctx.closePath();
    this.ctx.fill();
  }

  pointerPos(evt) {
    const rect = this.canvas.getBoundingClientRect();
    const scaleX = this.canvas.width / rect.width;
    const scaleY = this.canvas.height / rect.height;
    const clientX = evt.clientX ?? evt.touches?.[0]?.clientX;
    const clientY = evt.clientY ?? evt.touches?.[0]?.clientY;
    return {
      x: (clientX - rect.left) * scaleX,
      y: (clientY - rect.top) * scaleY,
    };
  }

  placeTextAt(pos) {
    const text = this.pendingTag || this.textInput.trim() || '标注';
    this.history.push({
      type: 'text',
      text,
      x: pos.x,
      y: pos.y,
      color: this.color,
      fontSize: this.pendingTag ? this.tagFontSize : 28,
    });
    this.redraw();
  }

  bindEvents(onChange) {
    const TAP_PX = 12;
    let touchId = null;
    let touchStartClient = null;
    let scrollGesture = false;

    const posFromClient = (clientX, clientY) =>
      this.pointerPos({ clientX, clientY, touches: [{ clientX, clientY }] });

    const resetTouch = () => {
      touchId = null;
      touchStartClient = null;
      scrollGesture = false;
    };

    const isTextTool = () => this.tool === 'text' || Boolean(this.pendingTag);

    const down = (evt) => {
      if (evt.type.startsWith('touch')) {
        if (touchId != null) return;
        const t = evt.touches[0];
        if (!t) return;
        touchId = t.identifier;
        touchStartClient = { x: t.clientX, y: t.clientY };
        scrollGesture = false;
        return;
      }

      evt.preventDefault();
      const pos = this.pointerPos(evt);
      if (isTextTool()) {
        this.placeTextAt(pos);
        onChange?.();
        return;
      }
      this.drawing = true;
      this.start = pos;
    };

    const move = (evt) => {
      if (evt.type.startsWith('touch')) {
        if (touchId == null || !touchStartClient) return;
        const t = [...evt.touches].find((item) => item.identifier === touchId);
        if (!t) return;

        const dx = t.clientX - touchStartClient.x;
        const dy = t.clientY - touchStartClient.y;
        const dist = Math.hypot(dx, dy);

        if (!this.drawing && !scrollGesture) {
          if (dist < TAP_PX) return;
          if (Math.abs(dy) > Math.abs(dx) * 1.2) {
            scrollGesture = true;
            resetTouch();
            return;
          }
          if (isTextTool()) return;
          this.drawing = true;
          this.start = posFromClient(touchStartClient.x, touchStartClient.y);
        }

        if (scrollGesture || !this.drawing || !this.start) return;
        evt.preventDefault();
        const pos = this.pointerPos(t);
        this.redraw();
        if (this.tool === 'arrow') {
          this.drawArrow(this.start.x, this.start.y, pos.x, pos.y, this.color, this.lineWidth);
        }
        return;
      }

      if (!this.drawing || !this.start) return;
      evt.preventDefault();
      const pos = this.pointerPos(evt);
      this.redraw();
      if (this.tool === 'arrow') {
        this.drawArrow(this.start.x, this.start.y, pos.x, pos.y, this.color, this.lineWidth);
      }
    };

    const up = (evt) => {
      if (evt.type.startsWith('touch')) {
        const t = [...evt.changedTouches].find((item) => item.identifier === touchId);
        if (!t || scrollGesture) {
          resetTouch();
          this.drawing = false;
          this.start = null;
          this.redraw();
          return;
        }

        const dx = t.clientX - touchStartClient.x;
        const dy = t.clientY - touchStartClient.y;
        const dist = Math.hypot(dx, dy);

        if (!this.drawing && dist < TAP_PX && isTextTool()) {
          this.placeTextAt(this.pointerPos(t));
          onChange?.();
        } else if (this.drawing && this.start && this.tool === 'arrow') {
          const pos = this.pointerPos(t);
          this.history.push({
            type: 'arrow',
            x1: this.start.x,
            y1: this.start.y,
            x2: pos.x,
            y2: pos.y,
            color: this.color,
            lineWidth: this.lineWidth,
          });
          onChange?.();
        }

        this.drawing = false;
        this.start = null;
        resetTouch();
        this.redraw();
        return;
      }

      if (!this.drawing || !this.start) return;
      evt.preventDefault();
      const pos = this.pointerPos(evt);
      if (this.tool === 'arrow') {
        this.history.push({
          type: 'arrow',
          x1: this.start.x,
          y1: this.start.y,
          x2: pos.x,
          y2: pos.y,
          color: this.color,
          lineWidth: this.lineWidth,
        });
      }
      this.drawing = false;
      this.start = null;
      this.redraw();
      onChange?.();
    };

    this.canvas.addEventListener('mousedown', down);
    this.canvas.addEventListener('mousemove', move);
    this.canvas.addEventListener('mouseup', up);
    this.canvas.addEventListener('touchstart', down, { passive: true });
    this.canvas.addEventListener('touchmove', move, { passive: false });
    this.canvas.addEventListener('touchend', up, { passive: true });
    this.canvas.addEventListener('touchcancel', up, { passive: true });
  }

  undo() {
    this.history.pop();
    this.redraw();
  }

  exportDataUrl() {
    return this.canvas.toDataURL('image/jpeg', 0.92);
  }
}

function escapeHtml(str) {
  return String(str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export async function renderEditorPage(root, { navigate, toast }) {
  const order = getSelectedOrder();
  const photos = getCapturedPhotos();

  if (!order || !photos.length) {
    root.innerHTML = `
      <div class="empty card">
        缺少订单或照片
        <div class="toolbar" style="justify-content:center;margin-top:12px">
          <button type="button" class="btn ghost" id="backCapture">返回拍摄</button>
          <button type="button" class="btn primary" id="backOrders">返回订单</button>
        </div>
      </div>`;
    root.querySelector('#backCapture').addEventListener('click', () => navigate('capture'));
    root.querySelector('#backOrders').addEventListener('click', () => navigate('orders'));
    return;
  }

  let editorConfig = { prefaceMessage: '', prefaceEnabled: true, annotationTags: [] };
  try {
    const pub = await api.getPublicConfig();
    editorConfig = pub.editor || editorConfig;
  } catch {
    // use defaults
  }

  const savedPreface = editorConfig.prefaceMessage || '';
  const prefaceEnabled = editorConfig.prefaceEnabled !== false;
  const buyerLabel = formatBuyerWithShop(order);
  const tags = Array.isArray(editorConfig.annotationTags) ? editorConfig.annotationTags : [];

  root.innerHTML = `
    <section>
      <div class="page-header">
        <button type="button" class="back-btn" id="backBtn">← 返回拍摄</button>
        <div class="page-header-main">
          <h1 class="page-title">合成与标注</h1>
        </div>
      </div>

      <div class="workflow-strip">
        <span class="workflow-step done">① 选订单</span>
        <span class="workflow-arrow">→</span>
        <span class="workflow-step done">② 拍照</span>
        <span class="workflow-arrow">→</span>
        <span class="workflow-step active">③ 标注发送</span>
      </div>

      <div class="buyer-banner board-stagger" style="--i:0">
        <div class="buyer-banner-label">当前买家</div>
        <div class="buyer-banner-name">${escapeHtml(buyerLabel)}</div>
        <div class="buyer-banner-meta">
          <span class="buyer-photo-count">共 ${photos.length} 张实拍</span>
        </div>
      </div>

      <div class="card card-accent-top board-stagger" style="--i:1;margin-bottom:14px">
        <div class="section-title" style="margin-top:0">原始照片</div>
        <div class="thumb-grid" id="sourceThumbs"></div>
      </div>

      <div class="editor-layout">
        <div class="card card-accent-top editor-canvas-wrap board-stagger" style="--i:2">
          <canvas id="editorCanvas"></canvas>
          <div class="canvas-hint" id="canvasHint">点选下方标签后，再点图片可快速写字</div>
        </div>
        <div class="card card-accent-top board-stagger" style="--i:3">
          <div class="preface-box">
            <label class="preface-check">
              <input type="checkbox" id="prefaceCheck" ${prefaceEnabled ? 'checked' : ''} />
              <span>发图片之前，先发一段说明文字</span>
            </label>
            <textarea id="prefaceInput" rows="3" placeholder="例如：亲，以下是和田玉手镯的实拍图…"></textarea>
            <button type="button" class="btn ghost btn-sm" id="savePrefaceBtn">保存这段文字</button>
          </div>

          <div class="section-title">瑕疵标签（点标签 → 点图片）</div>
          <div class="tag-grid" id="tagGrid">
            ${tags.map((t) => `<button type="button" class="tag-btn" data-tag="${escapeHtml(t)}">${escapeHtml(t)}</button>`).join('')}
          </div>

          <div class="editor-tools">
            <button type="button" class="btn ghost tool-btn active" data-tool="arrow">箭头</button>
            <button type="button" class="btn ghost tool-btn" data-tool="text">自由文字</button>
            <button type="button" class="btn ghost" id="undoBtn">撤销</button>
            <button type="button" class="btn ghost" id="remakeBtn">重拍</button>
          </div>
          <div class="form-grid" style="margin-top:12px">
            <label>自由文字
              <input id="textInput" placeholder="或在这里输入，再点图片" />
            </label>
            <label>颜色
              <input id="colorInput" type="color" value="#ef4444" />
            </label>
            <label>线宽
              <input id="widthInput" type="range" min="2" max="10" value="4" />
            </label>
          </div>
          <div class="sticky-action-bar">
            <div class="toolbar" style="margin-top:0">
              <button type="button" class="btn primary" id="sendBtn">发送给买家</button>
              <button type="button" class="btn ghost" id="previewBtn">查看合成图</button>
            </div>
          </div>
          <div class="status-bar" id="sendStatus">正在合成图片…</div>
        </div>
      </div>
    </section>
  `;

  root.querySelector('#sourceThumbs').innerHTML = photos
    .map((src, idx) => `<div class="thumb"><img src="${src}" alt="源图${idx + 1}" /></div>`)
    .join('');

  const canvas = root.querySelector('#editorCanvas');
  const editor = new AnnotationEditor(canvas);
  const status = root.querySelector('#sendStatus');
  const canvasHint = root.querySelector('#canvasHint');
  root.querySelector('#prefaceInput').value = savedPreface;

  function updateTagUi(activeTag) {
    root.querySelectorAll('.tag-btn').forEach((btn) => {
      btn.classList.toggle('active', btn.dataset.tag === activeTag);
    });
    if (activeTag) {
      canvasHint.textContent = `已选中「${activeTag}」，轻点图片写入（上下滑可滚动页面）`;
      canvas.classList.add('tag-mode');
    } else {
      canvasHint.textContent = '上下滑浏览页面；画箭头请横向拖；点标签后轻点图片写字';
      canvas.classList.remove('tag-mode');
    }
  }

  async function loadMergedImage() {
    status.textContent = '正在合成图片…';
    status.className = 'status-bar';
    try {
      const files = photos.map((src, idx) => dataUrlToFile(src, `photo-${idx}.jpg`));
      const merged = await api.mergeImages(files);
      const dataUrl = merged.imageBase64;
      setMergedImage(dataUrl);

      const img = await new Promise((resolve, reject) => {
        const image = new Image();
        image.onload = () => resolve(image);
        image.onerror = () => reject(new Error('合成图加载失败'));
        image.src = dataUrl;
      });
      editor.setImage(img);
      status.textContent = '合成完成，可标注后发送';
      status.className = 'status-bar ok';
    } catch (err) {
      status.textContent = `合成失败：${err.message}`;
      status.className = 'status-bar err';
      toast(err.message);
    }
  }

  editor.bindEvents();
  root.querySelector('#textInput').addEventListener('input', (e) => {
    editor.textInput = e.target.value;
    editor.clearPendingTag();
    updateTagUi('');
  });
  root.querySelector('#colorInput').addEventListener('input', (e) => {
    editor.color = e.target.value;
  });
  root.querySelector('#widthInput').addEventListener('input', (e) => {
    editor.lineWidth = Number(e.target.value);
  });

  root.querySelectorAll('.tool-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      root.querySelectorAll('.tool-btn').forEach((b) => b.classList.remove('active'));
      btn.classList.add('active');
      editor.tool = btn.dataset.tool;
      editor.clearPendingTag();
      updateTagUi('');
    });
  });

  root.querySelectorAll('.tag-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      const tag = btn.dataset.tag || '';
      const isActive = btn.classList.contains('active');
      if (isActive) {
        editor.clearPendingTag();
        updateTagUi('');
      } else {
        editor.setPendingTag(tag);
        root.querySelectorAll('.tool-btn').forEach((b) => b.classList.remove('active'));
        updateTagUi(tag);
      }
    });
  });

  root.querySelector('#savePrefaceBtn').addEventListener('click', async () => {
    const text = root.querySelector('#prefaceInput').value.trim();
    const enabled = root.querySelector('#prefaceCheck').checked;
    const btn = root.querySelector('#savePrefaceBtn');
    if (!text) {
      toast('请先写一段说明文字');
      return;
    }
    btn.disabled = true;
    try {
      await api.savePreface({ text, enabled });
      toast('说明文字已保存，下次会自动填入', { type: 'ok' });
    } catch (err) {
      toast(err.message, { type: 'err' });
    } finally {
      btn.disabled = false;
    }
  });

  root.querySelector('#backBtn').addEventListener('click', () => navigate('capture'));
  root.querySelector('#undoBtn').addEventListener('click', () => editor.undo());
  root.querySelector('#remakeBtn').addEventListener('click', () => navigate('capture'));

  root.querySelector('#previewBtn').addEventListener('click', () => {
    const dataUrl = editor.exportDataUrl();
    const dlg = document.createElement('dialog');
    dlg.className = 'dialog preview-dialog';
    dlg.innerHTML = `
      <div class="dialog-body">
        <h3>合成图预览</h3>
        <img src="${dataUrl}" alt="合成图" style="width:100%;border-radius:12px;max-height:70vh;object-fit:contain;background:#111" />
        <div class="dialog-actions">
          <button type="button" class="btn ghost" id="closePreview">关闭</button>
        </div>
      </div>`;
    document.body.appendChild(dlg);
    dlg.showModal();
    dlg.querySelector('#closePreview').addEventListener('click', () => {
      dlg.close();
      dlg.remove();
    });
    dlg.addEventListener('close', () => dlg.remove());
  });

  root.querySelector('#sendBtn').addEventListener('click', async () => {
    const imageBase64 = editor.exportDataUrl();
    const sendPreface = root.querySelector('#prefaceCheck').checked;
    const prefaceText = root.querySelector('#prefaceInput').value.trim();

    if (sendPreface && !prefaceText) {
      toast('请先写说明文字，或取消勾选');
      return;
    }

    status.textContent = sendPreface ? '正在发送说明和图片…' : '正在发送给买家…';
    status.className = 'status-bar';
    root.querySelector('#sendBtn').disabled = true;

    try {
      if (prefaceText) {
        api.savePreface({ text: prefaceText, enabled: sendPreface }).catch(() => {});
      }
      await api.sendImage({
        order: getSelectedOrder(),
        imageBase64,
        sendPreface,
        prefaceText: sendPreface ? prefaceText : '',
      });
      status.textContent = sendPreface ? '发送成功，说明与图片均已发出' : '发送成功，千帆已确认收到';
      status.className = 'status-bar ok';
      toast(sendPreface ? '说明与图片均已发送' : '发送成功，千帆已确认收到', { type: 'ok' });
      markOrderPackSent(getSelectedOrder(), 'image');
      clearWorkflow();
      setTimeout(() => navigate('orders'), 1500);
    } catch (err) {
      status.textContent = `发送失败：${err.message}`;
      status.className = 'status-bar err';
      toast(err.message, { type: 'err' });
    } finally {
      root.querySelector('#sendBtn').disabled = false;
    }
  });

  await loadMergedImage();
}

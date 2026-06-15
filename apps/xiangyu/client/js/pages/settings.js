import { api } from '../api.js';

export async function renderSettingsPage(root, { toast, onAuthedChange }) {
  root.innerHTML = `
    <section>
      <div class="page-hero">
        <h1 class="page-title">系统设置</h1>
        <p class="page-desc">配置发消息、标注等（店铺 Cookie 自动从辅助出库软件读取）</p>
      </div>
      <div class="card card-accent-top form-grid settings-section" id="settingsForm" style="--i:0">
        <p class="muted">正在加载...</p>
      </div>
    </section>
  `;

  const form = root.querySelector('#settingsForm');

  try {
    const data = await api.getSettings();
    const accounts = data.accounts || [];
    const accountsHtml = accounts.length
      ? accounts
          .map(
            (a, idx) => `
        <div class="card" style="padding:12px;margin-top:8px">
          <div><strong>${escapeHtml(a.name || `店铺 ${idx + 1}`)}</strong></div>
          <div class="muted" style="margin-top:6px;font-size:12px">Cookie：${escapeHtml(a.cookie || '未读取')}</div>
          <div class="muted" style="margin-top:4px;font-size:12px">状态：${a.enabled !== false ? '启用' : '停用'}</div>
        </div>`
          )
          .join('')
      : '<p class="muted">暂未读取到店铺账号，请确认辅助出库软件里已配置 Cookie</p>';

    form.innerHTML = `
      <div class="section-title" style="margin-top:0">店铺账号（自动同步）</div>
      <p class="muted">每次加载订单都会从辅助出库软件读取最新 Cookie，无需在此手动配置。</p>
      <div class="toolbar">
        <button class="btn ghost" id="reloadImport">重新读取店铺</button>
      </div>
      <div id="accountsBox">${accountsHtml}</div>
      <label>千帆桥接地址（本机 HTTP 中继）
        <input id="bridgeUrl" value="${escapeHtml(data.bridge?.url || '')}" placeholder="http://127.0.0.1:9323/send" />
      </label>
      <label>千帆 DevTools 端口
        <input id="devtoolsPort" type="number" value="${Number(data.bridge?.devtoolsPort || 9322)}" />
      </label>
      <label>千帆数据目录（读取买家会话 appCid）
        <input id="qianfanDataDir" value="${escapeHtml(data.bridge?.qianfanDataDir || '')}" />
      </label>
      <label>外网访问地址（手机浏览器打开的 URL）
        <input id="publicUrl" value="${escapeHtml(data.tunnel?.publicUrl || '')}" placeholder="https://xiangyu.duckdns.org" />
      </label>
      <div class="section-title settings-section" style="--i:5">标注页设置</div>
      <label>默认说明文字（发图前可选发送）
        <textarea id="prefaceMessage" rows="2">${escapeHtml(data.editor?.prefaceMessage || '')}</textarea>
      </label>
      <label>瑕疵标签（每行一个，或逗号分隔）
        <textarea id="annotationTags" rows="6" placeholder="棉&#10;纹裂&#10;水线">${escapeHtml((data.editor?.annotationTags || []).join('\n'))}</textarea>
      </label>
      <label>修改管理密码（留空则不修改）
        <input id="newPassword" type="password" autocomplete="new-password" />
      </label>
      <div class="toolbar">
        <button class="btn primary" id="saveSettings">保存设置</button>
        <button class="btn ghost" id="checkBridge">检测桥接</button>
        <button class="btn ghost" id="logoutSettings">退出设置</button>
      </div>
      <div class="status-bar" id="settingsStatus"></div>
    `;

    const status = form.querySelector('#settingsStatus');
    let accountRows = [...accounts];

    function renderAccounts() {
      const box = form.querySelector('#accountsBox');
      if (!accountRows.length) {
        box.innerHTML = '<p class="muted">暂未读取到店铺账号，请确认辅助出库软件里已配置 Cookie</p>';
        return;
      }
      box.innerHTML = accountRows
        .map(
          (a, idx) => `
        <div class="card" style="padding:12px;margin-top:8px">
          <div><strong>${escapeHtml(a.name || `店铺 ${idx + 1}`)}</strong></div>
          <div class="muted" style="margin-top:6px;font-size:12px">Cookie：${escapeHtml(a.cookie || '未读取')}</div>
          <div class="muted" style="margin-top:4px;font-size:12px">状态：${a.enabled !== false ? '启用' : '停用'}</div>
        </div>`
        )
        .join('');
    }

    form.querySelector('#reloadImport').addEventListener('click', async () => {
      status.textContent = '正在从辅助出库软件读取...';
      try {
        const result = await api.importAccounts();
        accountRows = result.accounts || [];
        renderAccounts();
        status.textContent = result.message || '读取完成';
        status.className = 'status-bar ok';
      } catch (err) {
        status.textContent = err.message;
        status.className = 'status-bar err';
      }
    });

    form.querySelector('#saveSettings').addEventListener('click', async () => {
      status.textContent = '保存中...';
      try {
        const payload = {
          bridge: {
            url: form.querySelector('#bridgeUrl').value.trim(),
            devtoolsPort: Number(form.querySelector('#devtoolsPort').value || 9322),
            qianfanDataDir: form.querySelector('#qianfanDataDir').value.trim(),
          },
          tunnel: {
            publicUrl: form.querySelector('#publicUrl').value.trim(),
          },
          editor: {
            prefaceMessage: form.querySelector('#prefaceMessage').value.trim(),
            annotationTags: form
              .querySelector('#annotationTags')
              .value.split(/[\n,，]+/)
              .map((s) => s.trim())
              .filter(Boolean),
          },
          newPassword: form.querySelector('#newPassword').value,
        };
        await api.saveSettings(payload);
        status.textContent = '保存成功';
        status.className = 'status-bar ok';
        toast('设置已保存');
        form.querySelector('#newPassword').value = '';
      } catch (err) {
        status.textContent = err.message;
        status.className = 'status-bar err';
      }
    });

    form.querySelector('#checkBridge').addEventListener('click', async () => {
      status.textContent = '检测桥接中...';
      const result = await api.bridgeHealth();
      status.textContent = result.message || (result.ok ? '桥接在线' : '桥接不可用');
      status.className = result.ok ? 'status-bar ok' : 'status-bar err';
    });

    form.querySelector('#logoutSettings').addEventListener('click', async () => {
      await api.logoutSettings();
      onAuthedChange?.(false);
      toast('已退出设置');
    });
  } catch (err) {
    form.innerHTML = `<div class="status-bar err">${escapeHtml(err.message)}</div>`;
  }
}

function escapeHtml(str) {
  return String(str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

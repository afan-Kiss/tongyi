import { api } from '../api.js';
import { setSelectedOrder, formatBuyerWithShop, getCachedOrders, setCachedOrders, isOrderPackSent } from '../store.js';

function formatTime(ts) {
  const n = Number(ts);
  const ms = n < 1e12 ? n * 1000 : n;
  const d = new Date(ms);
  return `${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

function escapeHtml(str) {
  return String(str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function renderOrderItem(order, index) {
  const thumb = order.imageUrl
    ? `<img class="order-thumb" src="${escapeHtml(order.imageUrl)}" alt="" loading="lazy" decoding="async" />`
    : `<div class="order-thumb"></div>`;
  const isToday = order.dayLabel === '今日';
  const sent = isOrderPackSent(order);
  const badgeLabel = sent ? '已发送' : (order.dayLabel || order.status);
  const badgeClass = sent ? 'badge sent' : `badge ${isToday ? 'today' : ''}`;

  return `
    <button class="order-item board-stagger${sent ? ' sent' : ''}" style="--i:${index}" data-order-id="${escapeHtml(order.orderId)}">
      ${thumb}
      <div class="order-meta">
        <div class="order-title">${sent ? '<span class="sent-check" aria-hidden="true">✓ </span>' : ''}${escapeHtml(order.productTitle)}</div>
        <div class="order-sub">${escapeHtml(formatBuyerWithShop(order))}</div>
        <div class="order-sub">${escapeHtml(order.amount || '')} · ${formatTime(order.createdAt)}${sent ? ' · <span class="sent-hint">已发合成图</span>' : ''}</div>
      </div>
      <span class="${badgeClass}">${escapeHtml(badgeLabel)}</span>
    </button>
  `;
}

function renderSection(title, orders, startIndex) {
  if (!orders.length) {
    return `
      <div class="empty">
        <div class="empty-state-icon">📭</div>
        暂无${title}订单
      </div>`;
  }
  return `<div class="order-list">${orders.map((o, i) => renderOrderItem(o, startIndex + i)).join('')}</div>`;
}

export async function renderOrdersPage(root, { navigate, toast }) {
  root.innerHTML = `
    <section>
      <div class="page-hero">
        <h1 class="page-title">选择订单</h1>
        <p class="page-desc" id="ordersHint">正在加载订单…</p>
      </div>

      <div class="workflow-strip">
        <span class="workflow-step active">① 选订单</span>
        <span class="workflow-arrow">→</span>
        <span class="workflow-step">② 拍照</span>
        <span class="workflow-arrow">→</span>
        <span class="workflow-step">③ 标注发送</span>
      </div>

      <div class="stat-row" id="statRow" hidden>
        <div class="stat-card board-stagger" style="--i:0">
          <div class="stat-label">今日订单</div>
          <div class="stat-value" id="todayCount">0</div>
        </div>
        <div class="stat-card secondary board-stagger" style="--i:1">
          <div class="stat-label">昨日订单</div>
          <div class="stat-value" id="yesterdayCount">0</div>
        </div>
      </div>

      <div class="toolbar">
        <button type="button" class="btn ghost" id="refreshOrders">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 12a9 9 0 1 1-3-6.7"/><polyline points="21 3 21 9 15 9"/></svg>
          刷新订单
        </button>
      </div>

      <div class="card card-accent-top">
        <div id="todayEmptyHint" class="today-empty-hint" hidden>
          今日还没有新订单，请往下滑查看 <strong>昨日订单</strong>，点击即可拍照发送
        </div>
        <div class="section-title">今日订单</div>
        <div id="todayOrders"><div class="empty"><div class="empty-state-icon">⏳</div>加载中…</div></div>
        <div class="section-title">昨日订单</div>
        <div id="yesterdayOrders"></div>
      </div>
    </section>
  `;

  const hint = root.querySelector('#ordersHint');
  const todayEl = root.querySelector('#todayOrders');
  const yesterdayEl = root.querySelector('#yesterdayOrders');
  const statRow = root.querySelector('#statRow');

  function paintOrders(data, { showYesterday = true } = {}) {
    const today = data.today || [];
    const yesterday = data.yesterday || [];

    statRow.hidden = false;
    root.querySelector('#todayCount').textContent = today.length;
    root.querySelector('#yesterdayCount').textContent = showYesterday ? yesterday.length : '—';
    root.querySelector('#todayEmptyHint').hidden = !(showYesterday && today.length === 0 && yesterday.length > 0);

    todayEl.innerHTML = renderSection('今日', today, 0);

    if (showYesterday) {
      yesterdayEl.innerHTML = renderSection('昨日', yesterday, today.length);
    } else {
      yesterdayEl.innerHTML = '<div class="empty muted" style="padding:12px 0;font-size:13px;">今日订单加载完成后显示昨日订单</div>';
    }

    root.querySelectorAll('.order-item').forEach((btn) => {
      btn.addEventListener('click', () => {
        const orderId = btn.dataset.orderId;
        const order = (data.all || []).find((o) => o.orderId === orderId);
        if (!order) return;
        setSelectedOrder(order);
        navigate('capture');
      });
    });
  }

  async function load({ force = false } = {}) {
    const cached = !force ? getCachedOrders() : null;
    if (cached) {
      paintOrders(cached, { showYesterday: true });
      hint.textContent = '已显示缓存，正在刷新…';
    } else {
      hint.textContent = '正在加载今日订单…';
      todayEl.innerHTML = '<div class="empty"><div class="empty-state-icon">⏳</div>加载中…</div>';
      yesterdayEl.innerHTML = '<div class="empty muted" style="padding:12px 0;font-size:13px;">今日订单加载完成后显示昨日订单</div>';
    }

    try {
      const todayData = await api.getOrders(force, 'today');
      const merged = {
        today: todayData.today || [],
        yesterday: [],
        all: [...(todayData.today || [])],
        warnings: todayData.warnings || [],
        message: todayData.message || '点击订单，进入拍照和发送',
      };

      paintOrders(merged, { showYesterday: false });
      hint.textContent = merged.today.length
        ? '今日订单已加载，正在加载昨日订单…'
        : '今日暂无订单，正在加载昨日订单…';

      yesterdayEl.innerHTML = '<div class="empty"><div class="empty-state-icon">⏳</div>正在加载昨日订单…</div>';

      const yesterdayData = await api.getOrders(force, 'yesterday');
      merged.yesterday = yesterdayData.yesterday || [];
      merged.all = [...merged.today, ...merged.yesterday];
      if (yesterdayData.warnings?.length) {
        merged.warnings = [...merged.warnings, ...yesterdayData.warnings];
      }
      if (merged.all.length) {
        merged.message = '点击订单，进入拍照和发送';
      } else if (merged.warnings.length) {
        merged.message = merged.warnings[0];
      } else {
        merged.message = '今日和昨日暂无订单';
      }

      paintOrders(merged, { showYesterday: true });
      const sentCount = merged.all.filter((o) => isOrderPackSent(o)).length;
      hint.textContent = sentCount
        ? `${merged.message} · 已发送 ${sentCount} 单（绿色标记）`
        : merged.message;
      setCachedOrders(merged);

      if (merged.warnings.length) {
        toast(merged.warnings[0], { type: 'err' });
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      if (!cached) {
        hint.textContent = message || '订单加载失败，请稍后点刷新重试';
        todayEl.innerHTML = `<div class="empty"><div class="empty-state-icon">⚠️</div>${escapeHtml(message || '订单加载失败，请稍后重试')}</div>`;
        yesterdayEl.innerHTML = '';
      } else {
        hint.textContent = '刷新失败，仍显示上次订单';
      }
      toast(message || '订单加载失败，请稍后重试', { type: 'err' });
    }
  }

  root.querySelector('#refreshOrders').addEventListener('click', () => load({ force: true }));
  load().catch(() => {});
}

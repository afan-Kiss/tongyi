import { api } from './api.js';
import { renderOrdersPage } from './pages/orders.js';
import { renderCapturePage } from './pages/capture.js';
import { renderEditorPage } from './pages/editor.js';
import { renderSettingsPage } from './pages/settings.js';

const app = document.getElementById('app');
const toastEl = document.getElementById('toast');
const passwordDialog = document.getElementById('passwordDialog');
const passwordForm = document.getElementById('passwordForm');
const settingsPassword = document.getElementById('settingsPassword');
const passwordCancel = document.getElementById('passwordCancel');
const shopNameEl = document.getElementById('shopName');
const navPill = document.getElementById('navPill');
const mainNav = document.getElementById('mainNav');
const navWrap = document.getElementById('navWrap');
const menuToggle = document.getElementById('menuToggle');
const mobileTabBar = document.getElementById('mobileTabBar');

let currentRoute = 'orders';
let settingsAuthed = false;
let cleanup = null;

function toast(message, options = {}) {
  const text = String(message || '').trim();
  if (!text) {
    toastEl.classList.remove('show', 'toast-ok', 'toast-err');
    toastEl.textContent = '';
    return;
  }
  toastEl.textContent = text;
  toastEl.classList.remove('toast-ok', 'toast-err');
  if (options.type === 'ok') toastEl.classList.add('toast-ok');
  if (options.type === 'err') toastEl.classList.add('toast-err');
  toastEl.classList.add('show');
  clearTimeout(toast._timer);
  const duration = Math.min(Number(options.duration) || 5000, 5000);
  toast._timer = setTimeout(() => {
    toastEl.classList.remove('show');
    toastEl.textContent = '';
  }, duration);
}

function clearPasswordError() {
  const el = document.getElementById('passwordError');
  if (el) {
    el.hidden = true;
    el.textContent = '';
  }
}

function showPasswordError(message) {
  const el = document.getElementById('passwordError');
  if (!el) return;
  el.textContent = String(message || '密码错误');
  el.hidden = false;
}

function setActiveNav(route) {
  const navRoute = route === 'capture' || route === 'editor' ? 'orders' : route;
  document.querySelectorAll('.nav-btn').forEach((btn) => {
    btn.classList.toggle('active', btn.dataset.route === navRoute);
  });
  document.querySelectorAll('.mobile-tab').forEach((btn) => {
    btn.classList.toggle('active', btn.dataset.route === navRoute);
  });
  document.body.classList.toggle('route-subpage', route === 'capture' || route === 'editor');
  requestAnimationFrame(updateNavPill);
}

function updateNavPill() {
  if (!navPill || !mainNav) return;
  const active = mainNav.querySelector('.nav-btn.active');
  if (!active) {
    navPill.classList.remove('ready');
    return;
  }
  const track = mainNav.getBoundingClientRect();
  const btn = active.getBoundingClientRect();
  navPill.style.width = `${btn.width}px`;
  navPill.style.transform = `translateX(${btn.left - track.left}px)`;
  navPill.classList.add('ready');
}

async function navigate(route) {
  if (route === 'settings' && !settingsAuthed) {
    clearPasswordError();
    settingsPassword.value = '';
    passwordDialog.showModal();
    return;
  }

  if (typeof cleanup === 'function') {
    cleanup();
    cleanup = null;
  }

  currentRoute = route;
  setActiveNav(route);
  navWrap?.classList.remove('open');

  app.className = 'app-main page-enter';

  if (route === 'orders') {
    await renderOrdersPage(app, { navigate, toast });
  } else if (route === 'capture') {
    cleanup = await renderCapturePage(app, { navigate, toast });
  } else if (route === 'editor') {
    await renderEditorPage(app, { navigate, toast });
  } else if (route === 'settings') {
    await renderSettingsPage(app, {
      toast,
      onAuthedChange: (v) => {
        settingsAuthed = v;
      },
    });
  }
}

document.querySelectorAll('.nav-btn').forEach((btn) => {
  btn.addEventListener('click', () => navigate(btn.dataset.route));
});

mobileTabBar?.querySelectorAll('.mobile-tab').forEach((btn) => {
  btn.addEventListener('click', () => navigate(btn.dataset.route));
});

menuToggle?.addEventListener('click', () => {
  navWrap?.classList.toggle('open');
});

passwordForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  clearPasswordError();
  try {
    await api.loginSettings(settingsPassword.value);
    settingsAuthed = true;
    passwordDialog.close();
    settingsPassword.value = '';
    clearPasswordError();
    await navigate('settings');
  } catch (err) {
    showPasswordError(err.message || '密码错误');
    settingsPassword.value = '';
    settingsPassword.focus();
  }
});

passwordCancel.addEventListener('click', () => {
  clearPasswordError();
  settingsPassword.value = '';
  passwordDialog.close();
});

window.addEventListener('resize', updateNavPill);

async function bootstrap() {
  const configTask = Promise.all([api.getPublicConfig(), api.authStatus()]);
  navigate('orders');
  try {
    const [publicConfig, auth] = await configTask;
    shopNameEl.textContent = publicConfig.shop?.name || '祥钰系统';
    settingsAuthed = Boolean(auth.authed);
  } catch {
    shopNameEl.textContent = '祥钰系统';
  }
}

bootstrap().catch(() => {
  app.innerHTML =
    '<div class="card status-bar err">页面加载失败，请刷新重试<br><span class="muted">若仍不行请联系管理员</span></div>';
});

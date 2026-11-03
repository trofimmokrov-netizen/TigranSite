const API = 'https://tigransite.trofimmokrov.workers.dev';
const SESSION_KEY = 'dw-account-session-v1';
const tgAccount = window.Telegram?.WebApp;
if (tgAccount?.initData) { tgAccount.ready(); tgAccount.expand(); }
const guest = document.querySelector('#account-guest');
const dashboard = document.querySelector('#account-dashboard');
const status = document.querySelector('#account-status');
const loginButton = document.querySelector('#load-login');
const draftStatus = document.querySelector('#draft-status');
const form = document.querySelector('#draft-form');
let session = null;
let services = [];
let drafts = [];
let editing = null;
let deleted = null;
let apiReady = false;

async function api(path, options = {}) {
  let response;
  try {
    response = await fetch(API + path, { ...options, headers: {
      ...(options.body ? { 'Content-Type': 'application/json' } : {}),
      ...(session?.token ? { 'Authorization': 'Bearer ' + session.token } : {}), ...options.headers
    }, signal: AbortSignal.timeout(12000) });
  } catch { throw new Error('Сервис входа временно недоступен. Можно обратиться к мастеру напрямую или повторить позже.'); }
  let data;
  try { data = await response.json(); } catch { throw new Error('Сервис входа пока недоступен. Повторите попытку позже.'); }
  if (!response.ok) throw new Error(data.error || 'Не удалось выполнить запрос.');
  return data;
}
function showGuest(message = '') {
  session = null; drafts = []; editing = null; deleted = null;
  try { sessionStorage.removeItem(SESSION_KEY); } catch { /* Optional tab storage. */ }
  guest.hidden = false; dashboard.hidden = true;
  document.querySelector('#draft-message').hidden = true;
  document.querySelector('#draft-message-text').value = '';
  document.querySelector('#draft-undo').hidden = true;
  form.reset(); status.textContent = message;
}
function isActive() {
  if (session && session.expires_at > Date.now() / 1000) return true;
  showGuest('Сессия истекла. Выполните вход повторно.');
  return false;
}
const storageKey = () => `dw-account-drafts-v1:${session.profile.id}`;
function loadDrafts() {
  try {
    const stored = JSON.parse(localStorage.getItem(storageKey()) || '[]');
    drafts = Array.isArray(stored) ? stored.filter(item => typeof item?.id === 'string' && typeof item.device === 'string' && typeof item.details === 'string' && services.some(s => s.id === item.service_id)).slice(0, 20) : [];
  } catch { drafts = []; }
}
function persistDrafts(next) {
  try { localStorage.setItem(storageKey(), JSON.stringify(next)); drafts = next; }
  catch { draftStatus.textContent = 'Браузер не разрешил сохранить данные. Можно подготовить сообщение без сохранения.'; return false; }
  renderDrafts(); return true;
}
function displaySession(data, token) {
  form.reset(); deleted = null;
  document.querySelector('#draft-undo').hidden = true;
  session = { ...data, token: token || data.token };
  try { sessionStorage.setItem(SESSION_KEY, session.token); } catch { /* Session remains in memory until navigation. */ }
  guest.hidden = true; dashboard.hidden = false; status.textContent = '';
  const user = session.profile;
  document.querySelector('#profile-name').textContent = [user.first_name, user.last_name].filter(Boolean).join(' ');
  document.querySelector('#profile-username').textContent = user.username ? '@' + user.username : 'Личный Telegram-профиль';
  document.querySelector('.profile-avatar').textContent = (user.first_name || 'T').slice(0, 1).toUpperCase();
  loadDrafts(); renderDrafts();
}
async function login(proof) {
  status.textContent = 'Проверка подписи Telegram…'; loginButton.disabled = true;
  try { displaySession(await api('/api/account/login', { method: 'POST', body: JSON.stringify(proof) })); }
  catch (error) { showGuest(error.message); }
  finally { loginButton.disabled = !apiReady; }
}
window.onDeviceWorkshopLogin = user => login({ type: 'widget', data: user });
loginButton.addEventListener('click', () => {
  if (tgAccount?.initData) { login({ type: 'miniapp', init_data: tgAccount.initData }); return; }
  const holder = document.querySelector('#telegram-login-widget');
  if (holder.querySelector('script')) return;
  const script = document.createElement('script');
  script.src = 'https://telegram.org/js/telegram-widget.js?22'; script.async = true;
  script.setAttribute('data-telegram-login', 'DeviceWorkshop_bot');
  script.setAttribute('data-size', 'large'); script.setAttribute('data-userpic', 'false');
  script.setAttribute('data-lang', 'ru');
  script.setAttribute('data-onauth', 'onDeviceWorkshopLogin(user)');
  script.onerror = () => { status.textContent = 'Не удалось загрузить кнопку Telegram. Используйте ссылку «Открыть кабинет в Telegram».'; holder.replaceChildren(); };
  holder.append(script);
  status.textContent = 'Для входа нажмите официальную кнопку Telegram. Если она недоступна, откройте кабинет через бота.';
});
document.querySelector('#account-logout').addEventListener('click', () => showGuest('Вы вышли из кабинета. Черновики остались в этом браузере.'));
function currentDraft() {
  if (!form.reportValidity()) return null;
  const device = document.querySelector('#draft-device').value.trim();
  const service = document.querySelector('#draft-service').value;
  if (!device || !services.some(item => item.id === service)) { draftStatus.textContent = 'Выберите услугу и укажите устройство или задачу.'; return null; }
  return { service_id: service, device, details: document.querySelector('#draft-details').value.trim() };
}
form.addEventListener('submit', event => {
  event.preventDefault(); if (!isActive()) return;
  const data = currentDraft(); if (!data) return;
  if (!editing && drafts.length >= 20) { draftStatus.textContent = 'Достигнут лимит 20 черновиков. Удалите ненужный черновик.'; return; }
  const now = Date.now();
  const previous = drafts.find(item => item.id === editing);
  const draft = { ...data, id: editing || crypto.randomUUID(), created_at: previous?.created_at || now, updated_at: now };
  const next = [draft, ...drafts.filter(item => item.id !== draft.id)];
  if (persistDrafts(next)) {
    editing = draft.id; document.querySelector('#editor-heading').textContent = 'Редактирование черновика';
    draftStatus.textContent = 'Черновик сохранён на этом устройстве. Для отправки подготовьте сообщение мастеру.';
  }
});
form.addEventListener('reset', () => {
  editing = null; document.querySelector('#editor-heading').textContent = 'Новый черновик';
  document.querySelector('#draft-message').hidden = true; draftStatus.textContent = '';
});
function prepareMessage(draft, open = true) {
  if (!isActive()) return;
  const service = services.find(item => item.id === draft.service_id);
  const price = service.price === null ? 'стоимость после диагностики' : `от ${service.price.toLocaleString('ru-RU')} ₽`;
  const text = `Здравствуйте, Тигран! Обращение в Device Workshop.\nУслуга: ${service.name} (${price}).\nУстройство / задача: ${draft.device}${draft.details ? '\nОписание: ' + draft.details : ''}\nПрошу уточнить стоимость и время визита.`;
  document.querySelector('#draft-message-text').value = text;
  document.querySelector('#draft-message').hidden = false;
  const url = 'https://t.me/DeviceWorkshop?text=' + encodeURIComponent(text);
  document.querySelector('#open-draft-chat').href = url;
  draftStatus.textContent = 'Сообщение подготовлено. Отправьте его самостоятельно в Telegram.';
  if (open) {
    if (tgAccount?.initData) tgAccount.openTelegramLink(url);
    else window.open(url, '_blank', 'noopener,noreferrer');
  }
}
document.querySelector('#prepare-draft').addEventListener('click', () => { const draft = currentDraft(); if (draft) prepareMessage(draft); });
document.querySelector('#copy-draft-message').addEventListener('click', async () => {
  const field = document.querySelector('#draft-message-text');
  try { await navigator.clipboard.writeText(field.value); draftStatus.textContent = 'Сообщение скопировано.'; }
  catch { field.focus(); field.select(); draftStatus.textContent = 'Текст выделен. Скопируйте его через меню устройства.'; }
});
function renderDrafts() {
  const list = document.querySelector('#draft-list'); list.replaceChildren();
  document.querySelector('#draft-count').textContent = String(drafts.length);
  document.querySelector('#draft-empty').hidden = drafts.length > 0;
  drafts.forEach(draft => {
    const card = document.createElement('article'); card.className = 'account-draft';
    const badge = document.createElement('span'); badge.className = 'draft-badge'; badge.textContent = 'Черновик';
    const title = document.createElement('h3'); title.textContent = services.find(s => s.id === draft.service_id).name;
    const device = document.createElement('p'); device.textContent = draft.device;
    const date = document.createElement('small');
    const stamp = Number(draft.updated_at);
    date.textContent = Number.isFinite(stamp) && stamp > 0 && stamp < Date.now() + 86400000 ? 'Обновлён: ' + new Intl.DateTimeFormat('ru-RU', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Europe/Moscow' }).format(stamp) + ' МСК' : 'Локальный черновик';
    const actions = document.createElement('div'); actions.className = 'account-draft-actions';
    for (const [label, action] of [
      ['Редактировать', () => {
        if (!isActive()) return;
        editing = draft.id; document.querySelector('#draft-service').value = draft.service_id;
        document.querySelector('#draft-device').value = draft.device; document.querySelector('#draft-details').value = draft.details;
        document.querySelector('#editor-heading').textContent = 'Редактирование черновика';
        document.querySelector('#draft-message').hidden = true; document.querySelector('.account-editor').scrollIntoView({ behavior: 'auto' });
      }],
      ['Сообщение мастеру', () => prepareMessage(draft)],
      ['Удалить', () => {
        if (!isActive()) return;
        if (persistDrafts(drafts.filter(item => item.id !== draft.id))) {
          deleted = draft; document.querySelector('#draft-undo').hidden = false;
          if (editing === draft.id) form.reset();
        }
      }]
    ]) {
      const button = document.createElement('button'); button.type = 'button'; button.textContent = label;
      button.addEventListener('click', action); actions.append(button);
    }
    card.append(badge, title, device, date, actions); list.append(card);
  });
}
document.querySelector('#draft-undo button').addEventListener('click', () => {
  if (!isActive() || !deleted || drafts.length >= 20) return;
  if (persistDrafts([deleted, ...drafts])) { deleted = null; document.querySelector('#draft-undo').hidden = true; }
});
async function initAccount() {
  try {
    const response = await fetch('data/services.json');
    if (!response.ok) throw new Error();
    services = await response.json();
    for (const service of services) {
      const option = document.createElement('option'); option.value = service.id; option.textContent = service.name;
      document.querySelector('#draft-service').append(option);
    }
  } catch { showGuest('Не удалось загрузить каталог услуг. Обновите страницу или свяжитесь с мастером.'); return; }
  try {
    const config = await api('/api/account/config');
    apiReady = config.auth_enabled === true; loginButton.disabled = !apiReady;
    if (!apiReady) throw new Error('Вход временно недоступен.');
    let token;
    try { token = sessionStorage.getItem(SESSION_KEY); } catch { /* Optional tab storage. */ }
    if (token) {
      session = { token };
      try { displaySession(await api('/api/account/me'), token); return; }
      catch { showGuest('Сессия истекла. Выполните вход повторно.'); }
    }
    if (tgAccount?.initData) { await login({ type: 'miniapp', init_data: tgAccount.initData }); return; }
    status.textContent = 'Выполните вход, чтобы открыть кабинет.';
  } catch (error) { showGuest(error.message); }
}
initAccount();

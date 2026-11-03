// Stateless Telegram authentication. No customer database or remote draft storage.
const SITE = 'https://trofimmokrov-netizen.github.io/TigranSite';
const enc = new TextEncoder();
const SESSION_TTL = 3600;
const failure = (status, message) => Object.assign(new Error(message), { status });

async function key(bytes, usage = ['sign', 'verify']) {
  return crypto.subtle.importKey('raw', bytes, { name: 'HMAC', hash: 'SHA-256' }, false, usage);
}
async function hmac(secret, value) {
  return new Uint8Array(await crypto.subtle.sign('HMAC', await key(secret), enc.encode(value)));
}
function hexBytes(value) {
  if (typeof value !== 'string' || !/^[a-f0-9]{64}$/i.test(value)) throw failure(401, 'Не удалось проверить подпись Telegram.');
  return Uint8Array.from(value.match(/../g), pair => parseInt(pair, 16));
}
async function verify(secret, value, signature) {
  return crypto.subtle.verify('HMAC', await key(secret), signature, enc.encode(value));
}
function base64url(bytes) {
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}
function decode64(text) {
  if (!/^[A-Za-z0-9_-]+$/.test(text)) throw failure(401, 'Сессия недействительна.');
  try { return Uint8Array.from(atob(text.replace(/-/g, '+').replace(/_/g, '/')), c => c.charCodeAt(0)); }
  catch { throw failure(401, 'Сессия недействительна.'); }
}
function checkTime(date, now, age) {
  if (!Number.isSafeInteger(date) || date > now + 30 || now - date > age) throw failure(401, 'Подтверждение Telegram истекло. Выполните вход повторно.');
}
function profile(user) {
  if (!user || typeof user !== 'object' || !Number.isSafeInteger(user.id) || user.id <= 0 || user.is_bot) throw failure(401, 'Telegram не передал профиль пользователя.');
  const firstName = String(user.first_name || '').slice(0, 128);
  if (!firstName) throw failure(401, 'Telegram не передал имя пользователя.');
  return { id: user.id, first_name: firstName, last_name: String(user.last_name || '').slice(0, 128), username: String(user.username || '').slice(0, 64) };
}

export async function verifyTelegramWidget(data, token, now = Math.floor(Date.now() / 1000)) {
  if (!data || typeof data !== 'object' || Array.isArray(data) || Object.keys(data).length > 16) throw failure(400, 'Некорректные данные входа.');
  const fields = Object.keys(data).filter(name => name !== 'hash').sort();
  if (fields.some(name => !['string', 'number'].includes(typeof data[name]))) throw failure(400, 'Некорректные данные входа.');
  const check = fields.map(name => `${name}=${data[name]}`).join('\n');
  const secret = new Uint8Array(await crypto.subtle.digest('SHA-256', enc.encode(token)));
  if (!await verify(secret, check, hexBytes(data.hash))) throw failure(401, 'Не удалось проверить подпись Telegram.');
  checkTime(Number(data.auth_date), now, 600);
  return profile({ ...data, id: Number(data.id) });
}

export async function verifyTelegramMiniApp(raw, token, now = Math.floor(Date.now() / 1000)) {
  if (typeof raw !== 'string' || raw.length > 16000) throw failure(400, 'Некорректные данные Telegram.');
  const params = new URLSearchParams(raw);
  const fields = Array.from(params.entries());
  if (new Set(fields.map(([name]) => name)).size !== fields.length) throw failure(401, 'Некорректная подпись Telegram.');
  const check = fields.filter(([name]) => name !== 'hash').sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0).map(([name, value]) => `${name}=${value}`).join('\n');
  const secret = await hmac(enc.encode('WebAppData'), token);
  if (!await verify(secret, check, hexBytes(params.get('hash')))) throw failure(401, 'Не удалось проверить подпись Telegram.');
  checkTime(Number(params.get('auth_date')), now, 3600);
  let user;
  try { user = JSON.parse(params.get('user') || '{}'); } catch { throw failure(401, 'Некорректный профиль Telegram.'); }
  return profile(user);
}

function sessionSecret(token) { return enc.encode('device-workshop-account:v1:' + token); }
export async function issueSession(user, token, site = SITE, now = Math.floor(Date.now() / 1000)) {
  const payload = { v: 1, aud: site.replace(/\/$/, ''), iat: now, exp: now + SESSION_TTL, user: profile(user) };
  const body = base64url(enc.encode(JSON.stringify(payload)));
  return { token: `dw1.${body}.${base64url(await hmac(sessionSecret(token), 'dw1.' + body))}`, profile: payload.user, expires_at: payload.exp };
}
export async function readSession(raw, token, site = SITE, now = Math.floor(Date.now() / 1000)) {
  if (typeof raw !== 'string' || raw.length > 4096) throw failure(401, 'Выполните вход через Telegram.');
  const parts = raw.split('.');
  if (parts.length !== 3 || parts[0] !== 'dw1') throw failure(401, 'Сессия недействительна.');
  if (!await verify(sessionSecret(token), parts[0] + '.' + parts[1], decode64(parts[2]))) throw failure(401, 'Сессия недействительна.');
  let payload;
  try { payload = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(decode64(parts[1]))); }
  catch { throw failure(401, 'Сессия недействительна.'); }
  if (payload.v !== 1 || payload.aud !== site.replace(/\/$/, '') || !Number.isSafeInteger(payload.iat) || !Number.isSafeInteger(payload.exp) || payload.exp <= now || payload.exp <= payload.iat || payload.exp - payload.iat > SESSION_TTL || payload.iat > now + 30) throw failure(401, 'Сессия истекла. Выполните вход повторно.');
  return { profile: profile(payload.user), expires_at: payload.exp };
}

export async function accountAPI(request, env) {
  const site = (env.PUBLIC_URL || SITE).replace(/\/$/, '');
  const origin = request.headers.get('Origin');
  const allowedOrigin = new URL(site).origin;
  const respond = (value, status = 200) => new Response(JSON.stringify(value), {
    status, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff', 'Vary': 'Origin', ...(origin === allowedOrigin ? {
        'Access-Control-Allow-Origin': allowedOrigin, 'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Authorization, Content-Type', 'Access-Control-Max-Age': '600'
      } : {}) }
  });
  if (origin !== allowedOrigin) return respond({ error: 'Источник запроса не разрешён.' }, 403);
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: {
    'Access-Control-Allow-Origin': allowedOrigin, 'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Authorization, Content-Type', 'Access-Control-Max-Age': '600', 'Vary': 'Origin'
  } });
  const path = new URL(request.url).pathname;
  if (!env.TELEGRAM_BOT_TOKEN) return respond({ error: 'Авторизация временно недоступна. Можно обратиться к мастеру напрямую.' }, 503);
  try {
    if (path === '/api/account/config' && request.method === 'GET') return respond({ auth_enabled: true, bot_username: 'DeviceWorkshop_bot', local_drafts: true, session_ttl: SESSION_TTL });
    if (path === '/api/account/me' && request.method === 'GET') {
      const auth = request.headers.get('Authorization') || '';
      if (!auth.startsWith('Bearer ')) throw failure(401, 'Выполните вход через Telegram.');
      return respond(await readSession(auth.slice(7), env.TELEGRAM_BOT_TOKEN, site));
    }
    if (path === '/api/account/login' && request.method === 'POST') {
      if (!request.headers.get('Content-Type')?.startsWith('application/json')) return respond({ error: 'Ожидается JSON.' }, 415);
      if (Number(request.headers.get('Content-Length')) > 24000) return respond({ error: 'Превышен размер запроса.' }, 413);
      const raw = await request.text();
      if (enc.encode(raw).byteLength > 24000) return respond({ error: 'Превышен размер запроса.' }, 413);
      let body;
      try { body = JSON.parse(raw); } catch { throw failure(400, 'Некорректные данные входа.'); }
      if (!body || typeof body !== 'object' || Array.isArray(body)) throw failure(400, 'Некорректные данные входа.');
      let user;
      if (body.type === 'miniapp') user = await verifyTelegramMiniApp(body.init_data, env.TELEGRAM_BOT_TOKEN);
      else if (body.type === 'widget') user = await verifyTelegramWidget(body.data, env.TELEGRAM_BOT_TOKEN);
      else throw failure(400, 'Неизвестный способ входа.');
      return respond(await issueSession(user, env.TELEGRAM_BOT_TOKEN, site));
    }
    return respond({ error: 'Маршрут не найден.' }, 404);
  } catch (error) {
    return respond({ error: error.status ? error.message : 'Не удалось выполнить вход. Повторите попытку.' }, error.status || 500);
  }
}

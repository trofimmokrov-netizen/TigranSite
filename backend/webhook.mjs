// Fetch-compatible webhook handler for a hosted service (Sites/Workers).
// Secrets belong in that service's environment, never in the static site.
import services from '../data/services.json' with { type: 'json' };

const CONTACT = 'https://t.me/DeviceWorkshop';
const DEFAULT_URL = 'https://trofimmokrov-netizen.github.io/TigranSite';
export async function webhookSecret(token) {
  const bytes = new TextEncoder().encode('device-workshop:webhook:v1:' + token);
  const hash = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(hash), n => n.toString(16).padStart(2, '0')).join('');
}
const CONTACTS = 'Москва, проспект Куприна, 34, корпус 2\nЕжедневно 10:00–20:00\n+7 977 997-76-77\nМастер: @DeviceWorkshop';
const json = (data, status = 200) => new Response(JSON.stringify(data), {
  status, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' }
});

export function keyboard(env) {
  const base = (env.PUBLIC_URL || DEFAULT_URL).replace(/\/$/, '');
  return { inline_keyboard: [
    [{ text: 'Услуги и цены', web_app: { url: base + '/miniapp.html' } }],
    [{ text: 'Цены', callback_data: 'prices' }, { text: 'Контакты', callback_data: 'contacts' }],
    [{ text: 'Написать мастеру', url: CONTACT }],
    [{ text: 'Маршрут', url: 'https://yandex.ru/maps/org/device_workshop/223528800071/' }]
  ] };
}

export function content(command, env) {
  switch (command) {
    case 'start': return 'Здравствуйте! Это Device Workshop — мастерская Тиграна.\n\nРемонт Apple и Android, компьютеров и ноутбуков. Защита экрана, настройка программ и печать А4.\n\nВыберите услугу или напишите мастеру.\n\n' + CONTACTS;
    case 'prices': return 'Услуги Device Workshop\n\n' + services.map(s => `• ${s.name} — ${s.price === null ? 'стоимость уточняйте' : 'от ' + s.price.toLocaleString('ru-RU') + ' ₽'}`).join('\n') + '\n\nЦены ориентировочные. Стоимость и сроки согласуются до работ. Лицензии на программы — отдельно.';
    case 'contacts': return CONTACTS;
    case 'hours': return 'Ежедневно 10:00–20:00, по московскому времени. В праздники возможны изменения — уточните перед визитом.\n+7 977 997-76-77';
    case 'print': return 'Копирование и печать А4\nЧёрно-белая — от 25 ₽ за 1 шт.\nЦветная — цену уточняйте.\n\nНапишите мастеру: количество страниц, цветность и желаемое время.';
    case 'repair': return 'Откройте Mini App, выберите услугу и опишите задачу. Кнопка «Написать мастеру» подготовит сообщение в Telegram. Отправьте его самостоятельно. Стоимость и время визита согласуются с Тиграном.';
    case 'site': return 'Сайт мастерской: ' + (env.PUBLIC_URL || DEFAULT_URL) + '\nЦены, контакты, отзывы и полезные статьи.';
    case 'help': return '/start — главное меню\n/repair — выбрать услугу\n/prices — цены\n/print — печать А4\n/contacts — контакты\n/hours — график\n/site — сайт\n/help — помощь\n\nБот не пересылает переписку мастеру. Нажмите «Написать мастеру» для личного обращения.';
    default: return 'Это автоматический помощник. Сообщение не переслано мастеру. Для личного разговора нажмите «Написать мастеру» или откройте /help.';
  }
}

export function makeAPI(token, fetcher = fetch) {
  return async (method, payload) => {
    let response;
    try {
      response = await fetcher(`https://api.telegram.org/bot${token}/${method}`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload), signal: AbortSignal.timeout(12000)
      });
    } catch { throw new Error('Telegram connection failed'); }
    let body;
    try { body = await response.json(); } catch { throw new Error('Invalid Telegram response'); }
    if (!response.ok || !body.ok) {
      const error = new Error('Telegram request failed');
      error.code = body.error_code;
      throw error;
    }
    return body.result;
  };
}

export async function handleUpdate(update, env, api) {
  const callback = update.callback_query;
  const message = callback?.message || update.message;
  const user = callback?.from || message?.from;
  if (!message || message.chat?.type !== 'private' || !user || user.is_bot || user.id !== message.chat.id) return;
  let command;
  if (callback) {
    await api('answerCallbackQuery', { callback_query_id: callback.id });
    if (!['prices', 'contacts'].includes(callback.data)) return;
    command = callback.data;
  } else {
    command = message.text?.match(/^\/([a-z_]+)(?:@[a-z0-9_]+)?(?:\s|$)/i)?.[1]?.toLowerCase() || 'unknown';
  }
  await api('sendMessage', { chat_id: message.chat.id, text: content(command, env), reply_markup: keyboard(env) });
}

export async function webhook(request, env, apiOverride) {
  if (request.method !== 'POST') return json({ error: 'Method not allowed' }, 405);
  if (!env.TELEGRAM_BOT_TOKEN || !env.TELEGRAM_WEBHOOK_SECRET || env.TELEGRAM_WEBHOOK_SECRET.length < 32) return json({ error: 'Service not configured' }, 503);
  const supplied = request.headers.get('X-Telegram-Bot-Api-Secret-Token') || '';
  if (supplied !== env.TELEGRAM_WEBHOOK_SECRET) return json({ error: 'Forbidden' }, 403);
  if (Number(request.headers.get('content-length')) > 65536) return json({ error: 'Request too large' }, 413);
  let update;
  try {
    const text = await request.text();
    if (new TextEncoder().encode(text).byteLength > 65536) return json({ error: 'Request too large' }, 413);
    update = JSON.parse(text);
    if (!update || !Number.isSafeInteger(update.update_id)) return json({ error: 'Invalid update' }, 400);
  } catch { return json({ error: 'Invalid update' }, 400); }
  try {
    await handleUpdate(update, env, apiOverride || makeAPI(env.TELEGRAM_BOT_TOKEN));
    return json({ ok: true });
  } catch (error) {
    if ([400, 403].includes(error.code)) return json({ ok: true });
    return json({ error: 'Temporary delivery failure' }, 503);
  }
}

export default {
  async fetch(request, env) {
    const path = new URL(request.url).pathname;
    if (path === '/health') return json({ ok: true, service: 'device-workshop-bot', configured: Boolean(env.TELEGRAM_BOT_TOKEN) });
    if (path === '/telegram/webhook') {
      const secret = env.TELEGRAM_WEBHOOK_SECRET || (env.TELEGRAM_BOT_TOKEN ? await webhookSecret(env.TELEGRAM_BOT_TOKEN) : '');
      return webhook(request, { ...env, TELEGRAM_WEBHOOK_SECRET: secret });
    }
    return json({ error: 'Not found' }, 404);
  }
};

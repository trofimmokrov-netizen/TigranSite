import test from 'node:test';
import assert from 'node:assert/strict';
import worker, { webhook, handleUpdate, content } from './webhook.mjs';
const env = { TELEGRAM_BOT_TOKEN: 'test-only', TELEGRAM_WEBHOOK_SECRET: 'a'.repeat(40) };
const update = { update_id: 1, message: { chat: { id: 42, type: 'private' }, from: { id: 42 }, text: '/start' } };
function request(body, secret = env.TELEGRAM_WEBHOOK_SECRET) {
  return new Request('https://example.org/telegram/webhook', {
    method: 'POST', headers: { 'X-Telegram-Bot-Api-Secret-Token': secret }, body: JSON.stringify(body)
  });
}
test('authenticated start responds with contacts and Mini App', async () => {
  const calls = [];
  const result = await webhook(request(update), env, async (method, payload) => calls.push([method, payload]));
  assert.equal(result.status, 200);
  assert.equal(calls[0][0], 'sendMessage');
  assert.match(calls[0][1].text, /мастерская Тиграна/);
  assert.match(calls[0][1].reply_markup.inline_keyboard[0][0].web_app.url, /TigranSite\/miniapp.html$/);
});
test('rejects wrong secret and invalid body without responding to chats', async () => {
  const api = () => { throw new Error('must not run'); };
  assert.equal((await webhook(request(update, 'invalid'), env, api)).status, 403);
  assert.equal((await webhook(request({}), env, api)).status, 400);
  assert.equal((await webhook(request(update), {}, api)).status, 503);
});
test('ignores group messages and forged user/chat mismatch', async () => {
  let calls = 0;
  const api = async () => calls++;
  await handleUpdate({ ...update, message: { ...update.message, chat: { id: -1, type: 'group' } } }, env, api);
  await handleUpdate({ ...update, message: { ...update.message, from: { id: 43 } } }, env, api);
  assert.equal(calls, 0);
});
test('prices are shared with Mini App and callbacks are acknowledged', async () => {
  assert.match(content('prices', env), /25 ₽/);
  const calls = [];
  await handleUpdate({ callback_query: { id: 'q', data: 'contacts', from: { id: 42 }, message: update.message } }, env, async method => calls.push(method));
  assert.deepEqual(calls, ['answerCallbackQuery', 'sendMessage']);
});
test('temporary failures ask Telegram to retry and health exposes no secrets', async () => {
  assert.equal((await webhook(request(update), env, async () => { throw new Error('offline'); })).status, 503);
  const health = await worker.fetch(new Request('https://example.org/health'), env);
  assert.equal(health.status, 200);
  assert.deepEqual(await health.json(), { ok: true, service: 'device-workshop-bot' });
});

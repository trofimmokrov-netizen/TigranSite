import test from 'node:test';
import assert from 'node:assert/strict';
import { createHmac, createHash } from 'node:crypto';
import { verifyTelegramWidget, verifyTelegramMiniApp, issueSession, readSession, accountAPI } from './account.mjs';
const TOKEN = 'test-account-token';
const SITE = 'https://trofimmokrov-netizen.github.io/TigranSite';
const ORIGIN = new URL(SITE).origin;
const USER = { id: 12345, first_name: 'Иван', last_name: 'Петров', username: 'client_example' };
const NOW = 1800000000;
function widget(user = USER, date = NOW) {
  const data = { ...user, auth_date: date };
  const check = Object.keys(data).sort().map(k => `${k}=${data[k]}`).join('\n');
  data.hash = createHmac('sha256', createHash('sha256').update(TOKEN).digest()).update(check).digest('hex');
  return data;
}
function mini(user = USER, date = NOW) {
  const fields = { auth_date: String(date), query_id: 'example', user: JSON.stringify(user) };
  const check = Object.keys(fields).sort().map(k => `${k}=${fields[k]}`).join('\n');
  const secret = createHmac('sha256', 'WebAppData').update(TOKEN).digest();
  return new URLSearchParams({ ...fields, hash: createHmac('sha256', secret).update(check).digest('hex') }).toString();
}
test('official widget proof verifies Unicode profile; altered ID and wrong token fail', async () => {
  assert.deepEqual(await verifyTelegramWidget(widget(), TOKEN, NOW), USER);
  await assert.rejects(verifyTelegramWidget({ ...widget(), id: 99 }, TOKEN, NOW), /подпись/);
  await assert.rejects(verifyTelegramWidget(widget(), 'wrong', NOW), /подпись/);
});
test('expired and future widget proofs are rejected even when signed correctly', async () => {
  await assert.rejects(verifyTelegramWidget(widget(USER, NOW - 601), TOKEN, NOW), /истекло/);
  await assert.rejects(verifyTelegramWidget(widget(USER, NOW + 31), TOKEN, NOW), /истекло/);
});
test('Mini App proof uses WebAppData derivation and rejects tampering and duplicate fields', async () => {
  assert.deepEqual(await verifyTelegramMiniApp(mini(), TOKEN, NOW), USER);
  await assert.rejects(verifyTelegramMiniApp(mini() + '&auth_date=1', TOKEN, NOW), /подпись/);
  await assert.rejects(verifyTelegramMiniApp(mini().replace('example', 'forged'), TOKEN, NOW), /подпись/);
  await assert.rejects(verifyTelegramMiniApp(mini(USER, NOW - 3601), TOKEN, NOW), /истекло/);
});
test('signed session expires after one hour and is bound to the configured site and bot', async () => {
  const session = await issueSession(USER, TOKEN, SITE, NOW);
  assert.deepEqual((await readSession(session.token, TOKEN, SITE, NOW + 5)).profile, USER);
  await assert.rejects(readSession(session.token, TOKEN, SITE, NOW + 3600), /истекла/);
  await assert.rejects(readSession(session.token, TOKEN, 'https://other.example', NOW), /истекла/);
  await assert.rejects(readSession(session.token, 'another-bot', SITE, NOW), /недействительна/);
  const [version, body, signature] = session.token.split('.');
  const payload = JSON.parse(Buffer.from(body, 'base64url').toString());
  payload.user.id = 999;
  const altered = `${version}.${Buffer.from(JSON.stringify(payload)).toString('base64url')}.${signature}`;
  await assert.rejects(readSession(altered, TOKEN, SITE, NOW), /недействительна/);
});
test('account API authenticates widget and verifies the resulting bearer token', async () => {
  const env = { TELEGRAM_BOT_TOKEN: TOKEN };
  const login = await accountAPI(new Request('https://worker.example/api/account/login', {
    method: 'POST', headers: { Origin: ORIGIN, 'Content-Type': 'application/json' },
    body: JSON.stringify({ type: 'widget', data: widget(USER, Math.floor(Date.now() / 1000)) })
  }), env);
  assert.equal(login.status, 200);
  assert.equal(login.headers.get('Access-Control-Allow-Origin'), ORIGIN);
  const data = await login.json();
  const me = await accountAPI(new Request('https://worker.example/api/account/me', {
    headers: { Origin: ORIGIN, Authorization: 'Bearer ' + data.token }
  }), env);
  assert.equal(me.status, 200);
  assert.deepEqual((await me.json()).profile, USER);
  assert.equal(me.headers.get('Cache-Control'), 'no-store');
});
test('API does not accept a browser-asserted identity or reflect arbitrary CORS origins', async () => {
  const env = { TELEGRAM_BOT_TOKEN: TOKEN };
  const malicious = await accountAPI(new Request('https://worker.example/api/account/config', { headers: { Origin: 'https://attacker.example' } }), env);
  assert.equal(malicious.status, 403);
  assert.equal(malicious.headers.get('Access-Control-Allow-Origin'), null);
  const forged = await accountAPI(new Request('https://worker.example/api/account/login', {
    method: 'POST', headers: { Origin: ORIGIN, 'Content-Type': 'application/json' },
    body: JSON.stringify({ type: 'widget', data: { ...USER, auth_date: NOW, hash: '0'.repeat(64) } })
  }), env);
  assert.equal(forged.status, 401);
  const unauthenticated = await accountAPI(new Request('https://worker.example/api/account/me', { headers: { Origin: ORIGIN } }), env);
  assert.equal(unauthenticated.status, 401);
});
test('CORS preflight, missing server credential and oversized login are handled explicitly', async () => {
  const request = path => new Request('https://worker.example' + path, { headers: { Origin: ORIGIN } });
  assert.equal((await accountAPI(request('/api/account/config'), {})).status, 503);
  const preflight = await accountAPI(new Request('https://worker.example/api/account/login', { method: 'OPTIONS', headers: { Origin: ORIGIN } }), {});
  assert.equal(preflight.status, 204);
  const oversized = await accountAPI(new Request('https://worker.example/api/account/login', {
    method: 'POST', headers: { Origin: ORIGIN, 'Content-Type': 'application/json' }, body: ' '.repeat(24001)
  }), { TELEGRAM_BOT_TOKEN: TOKEN });
  assert.equal(oversized.status, 413);
});

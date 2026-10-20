'use strict';

const { test, before, after } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'fidgetlab-'));
process.env.DATA_DIR = dir;
process.env.PORT = '0';
const { server, store } = require('../server');

let base;
before(async () => {
  await new Promise((r) => server.listening ? r() : server.once('listening', r));
  base = `http://127.0.0.1:${server.address().port}`;
});
after(() => {
  server.close();
  fs.rmSync(dir, { recursive: true, force: true });
});

async function call(p, { method = 'GET', body, cookie } = {}) {
  const res = await fetch(base + p, {
    method,
    headers: { ...(body ? { 'Content-Type': 'application/json' } : {}), ...(cookie ? { Cookie: cookie } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const setCookie = res.headers.get('set-cookie');
  return { status: res.status, data: await res.json().catch(() => null), cookie: setCookie && setCookie.split(';')[0] };
}

test('serves the app shell and manifest', async () => {
  const html = await fetch(base + '/');
  assert.equal(html.status, 200);
  assert.match(await html.text(), /FidgetLab/);
  const mf = await fetch(base + '/manifest.webmanifest');
  assert.equal(mf.status, 200);
  assert.match(mf.headers.get('content-type'), /manifest\+json/);
});

test('guest has no user', async () => {
  const r = await call('/api/me');
  assert.deepEqual(r.data, { user: null });
});

test('register, sync, login, logout, delete', async () => {
  const reg = await call('/api/register', {
    method: 'POST',
    body: { username: 'Tester', password: 'correct horse', settings: { scheme: 'ocean', bogus: 1 }, stats: { pops: 5, nope: 3 } },
  });
  assert.equal(reg.status, 201);
  assert.equal(reg.data.settings.scheme, 'ocean');
  assert.equal(reg.data.stats.pops, 5);
  assert.equal(reg.data.settings.bogus, undefined);
  const cookie = reg.cookie;

  assert.equal((await call('/api/register', { method: 'POST', body: { username: 'tester', password: 'whatever123' } })).status, 409);

  const s = await call('/api/settings', { method: 'PUT', cookie, body: { scheme: 'custom', custom: { c1: '#112233', c2: 'red' } } });
  assert.equal(s.data.settings.scheme, 'custom');
  assert.equal(s.data.settings.custom.c1, '#112233');
  assert.notEqual(s.data.settings.custom.c2, 'red');

  const st = await call('/api/stats', { method: 'POST', cookie, body: { deltas: { pops: 3, spins: -4, clicks: 2.7 } } });
  assert.equal(st.data.stats.pops, 8);
  assert.equal(st.data.stats.spins, 0);
  assert.equal(st.data.stats.clicks, 2);

  assert.equal((await call('/api/login', { method: 'POST', body: { username: 'tester', password: 'wrong pass' } })).status, 401);
  const login = await call('/api/login', { method: 'POST', body: { username: 'TESTER', password: 'correct horse' } });
  assert.equal(login.status, 200);
  assert.equal(login.data.user.username, 'Tester');

  await call('/api/logout', { method: 'POST', cookie: login.cookie, body: {} });
  assert.deepEqual((await call('/api/me', { cookie: login.cookie })).data, { user: null });

  // Non-JSON writes are refused (CSRF guard).
  const form = await fetch(base + '/api/stats', { method: 'POST', headers: { Cookie: cookie, 'Content-Type': 'text/plain' }, body: '{}' });
  assert.equal(form.status, 415);

  assert.equal((await call('/api/account', { method: 'DELETE', cookie, body: { password: 'nope nope' } })).status, 401);
  assert.equal((await call('/api/account', { method: 'DELETE', cookie, body: { password: 'correct horse' } })).status, 200);
  assert.equal(store.getUser('tester'), null);

  store.flush();
  const onDisk = JSON.parse(fs.readFileSync(path.join(dir, 'fidgetlab.json'), 'utf8'));
  assert.deepEqual(onDisk.users, {});
});

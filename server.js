'use strict';

const path = require('path');
const crypto = require('crypto');
const { promisify } = require('util');
const express = require('express');
const { Store } = require('./lib/store');
const v = require('./lib/validate');

const scrypt = promisify(crypto.scrypt);

const PORT = Number(process.env.PORT) || 3000;
// On Railway, attaching a volume sets RAILWAY_VOLUME_MOUNT_PATH automatically.
const DATA_DIR = process.env.DATA_DIR || process.env.RAILWAY_VOLUME_MOUNT_PATH || path.join(__dirname, 'data');
const SESSION_COOKIE = 'fl_session';
const SESSION_TTL = 1000 * 60 * 60 * 24 * 60; // 60 days
const PUBLIC_DIR = path.join(__dirname, 'public');

const store = new Store(DATA_DIR);
const app = express();

app.disable('x-powered-by');
app.set('trust proxy', 1); // Railway terminates TLS in front of us

app.use((req, res, next) => {
  res.set({
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'same-origin',
    'X-Frame-Options': 'DENY',
    'Content-Security-Policy':
      "default-src 'self'; img-src 'self' data:; style-src 'self' 'unsafe-inline'; script-src 'self'; connect-src 'self'; manifest-src 'self'; worker-src 'self'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'",
  });
  next();
});

// ---------- helpers ----------

async function hashPassword(password, salt = crypto.randomBytes(16)) {
  const key = await scrypt(password, salt, 64, { N: 16384, r: 8, p: 1 });
  return { salt: salt.toString('base64'), hash: key.toString('base64') };
}

async function verifyPassword(password, user) {
  const { hash } = await hashPassword(password, Buffer.from(user.salt, 'base64'));
  return crypto.timingSafeEqual(Buffer.from(hash, 'base64'), Buffer.from(user.hash, 'base64'));
}

// Used when the username does not exist so the response time looks the same.
const DUMMY_USER = { salt: crypto.randomBytes(16).toString('base64'), hash: crypto.randomBytes(64).toString('base64') };

const sha256 = (s) => crypto.createHash('sha256').update(s).digest('hex');

function readCookie(req, name) {
  const header = req.headers.cookie || '';
  for (const part of header.split(';')) {
    const i = part.indexOf('=');
    if (i > 0 && part.slice(0, i).trim() === name) return decodeURIComponent(part.slice(i + 1).trim());
  }
  return null;
}

function setSessionCookie(req, res, token, maxAgeMs) {
  const attrs = [
    `${SESSION_COOKIE}=${token}`,
    'Path=/',
    'HttpOnly',
    'SameSite=Lax',
    `Max-Age=${Math.floor(maxAgeMs / 1000)}`,
  ];
  if (req.secure) attrs.push('Secure');
  res.append('Set-Cookie', attrs.join('; '));
}

function startSession(req, res, user) {
  const token = crypto.randomBytes(32).toString('base64url');
  store.createSession(sha256(token), user.username.toLowerCase(), SESSION_TTL);
  setSessionCookie(req, res, token, SESSION_TTL);
}

function publicUser(user) {
  return {
    user: { username: user.username, createdAt: user.createdAt },
    settings: user.settings,
    stats: { ...v.emptyStats(), ...user.stats },
  };
}

// Very small fixed-window limiter for the password endpoints.
const attempts = new Map();
function rateLimit(max, windowMs) {
  return (req, res, next) => {
    const key = `${req.path}|${req.ip}`;
    const now = Date.now();
    let entry = attempts.get(key);
    if (!entry || entry.reset < now) entry = { count: 0, reset: now + windowMs };
    entry.count += 1;
    attempts.set(key, entry);
    if (entry.count > max) {
      res.set('Retry-After', String(Math.ceil((entry.reset - now) / 1000)));
      return res.status(429).json({ error: 'Too many attempts. Please wait a few minutes and try again.' });
    }
    next();
  };
}
setInterval(() => {
  const now = Date.now();
  for (const [k, e] of attempts) if (e.reset < now) attempts.delete(k);
  store.purgeSessions();
}, 10 * 60 * 1000).unref();

// ---------- API ----------

const api = express.Router();
api.use(express.json({ limit: '16kb' }));

// State-changing requests must be JSON. Browsers cannot send a cross-site JSON
// body without a CORS preflight, which we never grant, so this blocks CSRF.
api.use((req, res, next) => {
  if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method) && !req.is('application/json')) {
    return res.status(415).json({ error: 'Expected application/json' });
  }
  next();
});

api.use((req, res, next) => {
  res.set('Cache-Control', 'no-store');
  const token = readCookie(req, SESSION_COOKIE);
  if (token) {
    const id = sha256(token);
    const session = store.getSession(id);
    const user = session && store.data.users[session.userKey];
    if (user) {
      req.user = user;
      req.sessionId = id;
    }
  }
  next();
});

function requireUser(req, res, next) {
  if (!req.user) return res.status(401).json({ error: 'Not signed in' });
  next();
}

api.get('/health', (req, res) => res.json({ ok: true }));

api.get('/me', (req, res) => {
  if (!req.user) return res.json({ user: null });
  res.json(publicUser(req.user));
});

api.post('/register', rateLimit(10, 15 * 60 * 1000), async (req, res) => {
  const { username, password } = req.body || {};
  if (typeof username !== 'string' || !v.USERNAME.test(username)) {
    return res.status(400).json({ error: 'Username must be 3–24 characters: letters, numbers, dot, dash or underscore.' });
  }
  if (typeof password !== 'string' || password.length < 8 || password.length > 200) {
    return res.status(400).json({ error: 'Password must be at least 8 characters.' });
  }
  if (store.getUser(username)) return res.status(409).json({ error: 'That username is taken.' });

  const { salt, hash } = await hashPassword(password);
  if (store.getUser(username)) return res.status(409).json({ error: 'That username is taken.' });
  // A guest's local progress and look carry over into their new account.
  const user = store.createUser({
    username,
    salt,
    hash,
    createdAt: new Date().toISOString(),
    settings: v.cleanSettings(req.body.settings),
    stats: v.addStats(v.emptyStats(), v.cleanCounts(req.body.stats)),
  });
  startSession(req, res, user);
  res.status(201).json(publicUser(user));
});

api.post('/login', rateLimit(10, 15 * 60 * 1000), async (req, res) => {
  const { username, password } = req.body || {};
  if (typeof username !== 'string' || typeof password !== 'string' || password.length > 200) {
    return res.status(400).json({ error: 'Enter your username and password.' });
  }
  const user = store.getUser(username);
  const ok = await verifyPassword(password, user || DUMMY_USER);
  if (!user || !ok) return res.status(401).json({ error: 'Wrong username or password.' });
  startSession(req, res, user);
  res.json(publicUser(user));
});

api.post('/logout', (req, res) => {
  if (req.sessionId) store.deleteSession(req.sessionId);
  setSessionCookie(req, res, '', 0);
  res.json({ ok: true });
});

api.put('/settings', requireUser, (req, res) => {
  req.user.settings = v.cleanSettings(req.body, req.user.settings);
  store.save();
  res.json({ settings: req.user.settings });
});

// Clients send increments rather than totals so several devices can play at
// once without overwriting each other.
api.post('/stats', requireUser, (req, res) => {
  const deltas = v.cleanCounts(req.body && req.body.deltas, 100000);
  req.user.stats = v.addStats(req.user.stats, deltas);
  store.save();
  res.json({ stats: req.user.stats });
});

api.post('/password', requireUser, rateLimit(10, 15 * 60 * 1000), async (req, res) => {
  const { current, next } = req.body || {};
  if (typeof current !== 'string' || !(await verifyPassword(current, req.user))) {
    return res.status(401).json({ error: 'Current password is incorrect.' });
  }
  if (typeof next !== 'string' || next.length < 8 || next.length > 200) {
    return res.status(400).json({ error: 'New password must be at least 8 characters.' });
  }
  Object.assign(req.user, await hashPassword(next));
  store.deleteSessionsFor(req.user.username.toLowerCase(), req.sessionId);
  res.json({ ok: true });
});

api.delete('/account', requireUser, rateLimit(10, 15 * 60 * 1000), async (req, res) => {
  const { password } = req.body || {};
  if (typeof password !== 'string' || !(await verifyPassword(password, req.user))) {
    return res.status(401).json({ error: 'Password is incorrect.' });
  }
  store.deleteUser(req.user.username);
  setSessionCookie(req, res, '', 0);
  res.json({ ok: true });
});

api.use((req, res) => res.status(404).json({ error: 'Not found' }));
api.use((err, req, res, _next) => {
  if (err.type === 'entity.parse.failed') return res.status(400).json({ error: 'Invalid JSON' });
  if (err.type === 'entity.too.large') return res.status(413).json({ error: 'Request too large' });
  console.error(err);
  res.status(500).json({ error: 'Something went wrong' });
});

app.use('/api', api);

// ---------- static PWA ----------

app.use(
  express.static(PUBLIC_DIR, {
    setHeaders(res, file) {
      const name = path.basename(file);
      if (name === 'sw.js' || name === 'index.html' || name.endsWith('.webmanifest')) {
        res.set('Cache-Control', 'no-cache');
      } else {
        res.set('Cache-Control', 'public, max-age=3600');
      }
      if (name.endsWith('.webmanifest')) res.type('application/manifest+json');
    },
  })
);

app.use((req, res) => {
  if (req.method === 'GET' && req.accepts('html')) {
    res.set('Cache-Control', 'no-cache');
    return res.sendFile(path.join(PUBLIC_DIR, 'index.html'));
  }
  res.status(404).end();
});

const server = app.listen(PORT, () => {
  console.log(`FidgetLab listening on :${PORT} (data: ${DATA_DIR})`);
});

function shutdown() {
  try { store.flush(); } catch (err) { console.error('[store] flush failed', err); }
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(0), 3000).unref();
}
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);

module.exports = { app, server, store };

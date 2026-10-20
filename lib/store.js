'use strict';

// Tiny JSON-file database. Everything lives in memory and is flushed to disk
// atomically (write temp file, then rename) shortly after each change. That is
// plenty for FidgetLab's small per-user records and needs no native modules.

const fs = require('fs');
const path = require('path');

const EMPTY = () => ({ version: 1, users: {}, sessions: {} });

class Store {
  constructor(dir) {
    this.dir = dir;
    this.file = path.join(dir, 'fidgetlab.json');
    this.timer = null;
    fs.mkdirSync(dir, { recursive: true });
    this.data = this.load();
    this.purgeSessions();
  }

  load() {
    try {
      const raw = fs.readFileSync(this.file, 'utf8');
      const parsed = JSON.parse(raw);
      return { ...EMPTY(), ...parsed };
    } catch (err) {
      if (err.code !== 'ENOENT') {
        // Keep the unreadable file around rather than silently overwriting it.
        const backup = `${this.file}.corrupt-${Date.now()}`;
        try { fs.renameSync(this.file, backup); } catch { /* ignore */ }
        console.error(`[store] could not read ${this.file}, moved to ${backup}:`, err.message);
      }
      return EMPTY();
    }
  }

  save() {
    clearTimeout(this.timer);
    this.timer = setTimeout(() => this.flush(), 150);
  }

  flush() {
    clearTimeout(this.timer);
    this.timer = null;
    const tmp = `${this.file}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(this.data));
    fs.renameSync(tmp, this.file);
  }

  purgeSessions() {
    const now = Date.now();
    let changed = false;
    for (const [id, s] of Object.entries(this.data.sessions)) {
      if (s.expiresAt <= now || !this.data.users[s.userKey]) {
        delete this.data.sessions[id];
        changed = true;
      }
    }
    if (changed) this.save();
  }

  // Users are keyed by lower-cased username so "Alex" and "alex" collide.
  getUser(username) {
    return this.data.users[String(username).toLowerCase()] || null;
  }

  createUser(user) {
    this.data.users[user.username.toLowerCase()] = user;
    this.save();
    return user;
  }

  deleteUser(username) {
    const key = username.toLowerCase();
    delete this.data.users[key];
    for (const [id, s] of Object.entries(this.data.sessions)) {
      if (s.userKey === key) delete this.data.sessions[id];
    }
    this.save();
  }

  createSession(id, userKey, ttlMs) {
    this.data.sessions[id] = { userKey, expiresAt: Date.now() + ttlMs };
    this.save();
  }

  getSession(id) {
    const s = this.data.sessions[id];
    if (!s) return null;
    if (s.expiresAt <= Date.now()) {
      delete this.data.sessions[id];
      this.save();
      return null;
    }
    return s;
  }

  deleteSession(id) {
    delete this.data.sessions[id];
    this.save();
  }

  deleteSessionsFor(userKey, exceptId) {
    for (const [id, s] of Object.entries(this.data.sessions)) {
      if (s.userKey === userKey && id !== exceptId) delete this.data.sessions[id];
    }
    this.save();
  }
}

module.exports = { Store };

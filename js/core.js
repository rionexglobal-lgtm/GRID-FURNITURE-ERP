// GRID Shop Manager — core: utilities, data adapters (Firebase / demo), live store, auth
'use strict';

/* ============ utilities ============ */
export const $ = id => document.getElementById(id);
export const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export const num = (v, d = 0) => { const n = Number(v); return Number.isFinite(n) ? n : d; };
export const r2 = n => Math.round((num(n) + Number.EPSILON) * 100) / 100;
export const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
export const pad = (n, w = 4) => String(n).padStart(w, '0');
export function today(d = new Date()) { return d.getFullYear() + '-' + pad(d.getMonth() + 1, 2) + '-' + pad(d.getDate(), 2); }
export function addDays(iso, n) { const d = new Date(iso + 'T00:00:00'); d.setDate(d.getDate() + n); return today(d); }
export function weekStart(iso) { const d = new Date(iso + 'T00:00:00'); const k = (d.getDay() + 6) % 7; d.setDate(d.getDate() - k); return today(d); }
export const monthOf = iso => String(iso).slice(0, 7);
export function fmtDate(iso, opt = { day: 'numeric', month: 'short' }) { if (!iso) return ''; const d = new Date(String(iso).length === 10 ? iso + 'T00:00:00' : iso); return isNaN(d) ? String(iso) : d.toLocaleDateString('en-IN', opt); }
export function fmtTime(ms) { return ms ? new Date(ms).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : ''; }
export function clean(o) { // Firestore rejects undefined; strip it everywhere
  if (Array.isArray(o)) return o.map(clean);
  if (o && typeof o === 'object') { const r = {}; for (const [k, v] of Object.entries(o)) if (v !== undefined) r[k] = clean(v); return r; }
  return o;
}
export const LS = {
  get(k, d) { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { } }
};

/* ============ query helpers (shared by both adapters) ============ */
// spec: [[field, op, value], ...]  ops: == != >= <= > < in
function match(doc, spec) {
  return (spec || []).every(([f, op, v]) => {
    const x = doc[f];
    switch (op) {
      case '==': return x === v; case '!=': return x !== v;
      case '>=': return x != null && x >= v; case '<=': return x != null && x <= v;
      case '>': return x != null && x > v; case '<': return x != null && x < v;
      case 'in': return v.includes(x); default: return false;
    }
  });
}

/* ============ Claude & Full-Stack store adapters ============ */
const PAGE_ID = Math.random().toString(36).slice(2, 10), NUM_Q = {};
let ACT_Q = Promise.resolve(), ACT_DOC = null;

export class FullStackAdapter {
  constructor(apiBase = '/api') {
    this.apiBase = apiBase;
    this.mode = 'fullstack';
    this.watchers = new Map();
    this.initSSE();
    this.db = {
      collection: (name) => ({
        onSnapshot: (cb, onErr) => this.watch(name, [], docs => cb({ docs: docs.map(d => ({ data: () => d, id: d.id })) }), onErr)
      }),
      doc: (path) => {
        const parts = path.split('/');
        const id = parts.pop();
        const coll = parts.join('/');
        return {
          get: async () => {
            const d = await this.get(coll, id);
            return { exists: !!d, data: () => d };
          },
          set: async (data) => this.commit([{ t: 'set', coll, id, data }]),
          update: async (data) => this.commit([{ t: 'update', coll, id, data }]),
          delete: async () => this.commit([{ t: 'delete', coll, id }])
        };
      }
    };
  }

  initSSE() {
    try {
      this.es = new EventSource('/api/db/events');
      this.es.onmessage = (e) => {
        try {
          const msg = JSON.parse(e.data);
          if (msg.type === 'commit' && Array.isArray(msg.ops)) {
            const affectedColls = new Set(msg.ops.map(o => o.coll));
            for (const coll of affectedColls) {
              if (this.watchers.has(coll)) {
                this.fetchColl(coll);
              }
            }
          }
        } catch (err) {}
      };
    } catch (e) {
      console.warn('SSE not available:', e);
    }
  }

  async fetchColl(coll) {
    try {
      const res = await fetch(`${this.apiBase}/db/collection/${encodeURIComponent(coll)}`);
      if (res.ok) {
        const docs = await res.json();
        const cbs = this.watchers.get(coll);
        if (cbs) cbs.forEach(cb => cb(docs));
      }
    } catch (e) {}
  }

  watch(coll, spec, cb, onErr) {
    if (!this.watchers.has(coll)) {
      this.watchers.set(coll, new Set());
    }
    const cbs = this.watchers.get(coll);
    cbs.add(cb);

    fetch(`${this.apiBase}/db/collection/${encodeURIComponent(coll)}`)
      .then(r => r.json())
      .then(docs => {
        const filtered = (spec && spec.length) ? docs.filter(d => match(d, spec)) : docs;
        cb(filtered);
      })
      .catch(e => {
        console.error('watch err', coll, e);
        onErr && onErr(e);
      });

    return () => {
      cbs.delete(cb);
      if (cbs.size === 0) this.watchers.delete(coll);
    };
  }

  async get(coll, id) {
    const res = await fetch(`${this.apiBase}/db/get/${encodeURIComponent(coll)}/${encodeURIComponent(id)}`);
    if (res.status === 404) return null;
    if (!res.ok) throw Error('Failed to get doc ' + id);
    const data = await res.json();
    return data ? { ...data, id } : null;
  }

  async query(coll, spec) {
    const src = coll === 'journals' ? (store.data.journals_ || []) : coll === 'stockMoves' ? (store.data.stockMoves_ || []) : all(coll);
    if (src && src.length) {
      return src.filter(d => match(d, spec)).map(d => ({ ...d }));
    }
    const res = await fetch(`${this.apiBase}/db/query`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ coll, spec })
    });
    if (!res.ok) throw Error('Query failed');
    return await res.json();
  }

  async commit(ops) {
    if (store.guard) store.guard(ops);
    const before = ops.map(op => { const d = (store.data[op.coll] || {})[op.id]; return d ? { ...d } : null; });
    for (const op of ops) localApply(op);
    store.version++;
    store.rerender && store.rerender();

    const res = await fetch(`${this.apiBase}/db/commit`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ops })
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw Error(err.error || 'Failed to save changes');
    }
    this.logActivity(ops, before);
  }

  logActivity(ops, before) {
    let entry = null;
    try { entry = store.describe && store.me?.id ? store.describe(ops, before) : null; } catch (e) { console.warn('activity', e); }
    if (!entry) return;
    entry.at = Date.now();
    entry.by = store.me.id;
    entry.view = (location.hash || '').replace(/^#\/?/, '');
    const id = today() + '-' + PAGE_ID;
    this.commit([{
      t: 'update',
      coll: 'activity/' + store.me.id + '/log',
      id,
      data: {
        id,
        date: today(),
        by: store.me.id,
        entries: [...((byId('activity/' + store.me.id + '/log', id) || {}).entries || []), entry]
      }
    }]).catch(e => console.warn('activity log', e));
  }

  async nextNumber(key) {
    const res = await fetch(`${this.apiBase}/db/next-number`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ key })
    });
    if (!res.ok) throw Error('Could not get next number for ' + key);
    const data = await res.json();
    return data.n;
  }
}

export class ClaudeAdapter {
  constructor(db) { this.db = db; this.mode = 'claude'; }
  watch(coll, spec, cb, onErr) {
    let q = this.db.collection(coll); for (const [f, op, v] of spec || []) q = q.where(f, op, v);
    return q.onSnapshot(snap => cb(snap.docs.map(d => ({ ...d.data(), id: d.id }))), e => { console.error('watch', coll, e); onErr && onErr(e); });
  }
  async get(coll, id) { const d = await this.db.doc(coll + '/' + id).get(); return d.exists ? { ...d.data(), id } : null; }
  async query(coll, spec) {
    // everything this viewer may read is already loaded; calculated collections come from the engine
    const src = coll === 'journals' ? (store.data.journals_ || []) : coll === 'stockMoves' ? (store.data.stockMoves_ || []) : all(coll);
    return src.filter(d => match(d, spec)).map(d => ({ ...d }));
  }
  async commit(ops) {
    if (store.guard) store.guard(ops);
    const before = ops.map(op => { const d = (store.data[op.coll] || {})[op.id]; return d ? { ...d } : null; });
    for (const op of ops) {
      const ref = this.db.doc(op.coll + '/' + op.id);
      try {
        if (op.t === 'set') await ref.set(clean({ ...op.data, id: op.id }));
        else if (op.t === 'update') await ref.update(clean(op.data));
        else if (op.t === 'delete') await ref.delete();
        else throw Error('Unsupported write ' + op.t);
      } catch (e) { throw dbError(e); }
      localApply(op);
    }
    store.version++; store.rerender && store.rerender();
    this.logActivity(ops, before);
  }
  // one line per saved action in the person's own activity log: activity/<user id>/log/<day>-<page> (only they can write it)
  logActivity(ops, before) {
    let entry = null; try { entry = store.describe && store.me?.id ? store.describe(ops, before) : null; } catch (e) { console.warn('activity', e); }
    if (!entry) return;
    entry.at = Date.now(); entry.by = store.me.id; entry.view = (location.hash || '').replace(/^#\/?/, '');
    ACT_Q = ACT_Q.then(async () => {
      const id = today() + '-' + PAGE_ID; if (!ACT_DOC || ACT_DOC.id !== id) ACT_DOC = { id, entries: [] };
      ACT_DOC.entries.push(entry);
      await this.db.doc('activity/' + store.me.id + '/log/' + id).set(clean({ date: today(), by: store.me.id, entries: ACT_DOC.entries }));
    }).catch(e => console.warn('activity log', e && (e.code || e.message)));
  }
  async nextNumber(key) {
    // a short lease on the counter makes numbering safe when two people save at the same moment.
    // The holder is stable for this open page, so this page can take several numbers in a row without waiting for its own lease
    // to lapse; calls from this page are queued per key so they never overlap.
    const prev = NUM_Q[key] || Promise.resolve(); let done; NUM_Q[key] = new Promise(r => done = r);
    await prev.catch(() => { });
    try {
      const ref = this.db.doc('counters/' + key), holder = (store.me?.id || 'x') + '-' + PAGE_ID;
      for (let i = 0; i < 25; i++) {
        const r = await ref.acquire({ holder, ttlMs: 4000 }).catch(e => { throw dbError(e); });
        if (r.acquired) { const d = await ref.get(); const n = num(d.exists ? d.data().n : 0) + 1; await ref.set({ n, at: Date.now() }); return n; }
        await new Promise(res => setTimeout(res, 150 + Math.random() * 350));
      }
      throw Error('Numbering is busy — please try again in a moment.');
    } finally { done(); }
  }
}
function localApply(op) { // show our own write at once, before the live update arrives
  const m = store.data[op.coll] || (store.data[op.coll] = {});
  if (op.t === 'set') m[op.id] = clean({ ...op.data, id: op.id });
  else if (op.t === 'update' && m[op.id]) m[op.id] = { ...m[op.id], ...clean(op.data) };
  else if (op.t === 'delete') delete m[op.id];
}
function dbError(e) {
  const c = e && e.code;
  const msg = c === 'invalid_argument' ? 'You do not have permission to change this. The owner must share the page with you as an Editor for billing and accounts work, or as a Contributor for sales.'
    : c === 'quota_exceeded' ? 'The shop database is full. Download a backup, then ask the owner to archive old records.'
    : c === 'resource_exhausted' ? 'Too many changes at once — wait a few seconds and try again.'
    : c === 'revoked' ? 'Your access to this page was changed. Reload the page.' : (e && e.message) || String(e);
  const err = Error(msg); err.code = c; return err;
}

export function authMessage(e) {
  const c = e && (e.code || '');
  const m = {
    'auth/invalid-credential': 'Wrong email or password.', 'auth/wrong-password': 'Wrong email or password.', 'auth/user-not-found': 'No account with that email.',
    'auth/email-already-in-use': 'An account with this email already exists — sign in instead.', 'auth/weak-password': 'Password must be at least 6 characters.',
    'auth/invalid-email': 'Please enter a valid email address.', 'auth/too-many-requests': 'Too many attempts. Wait a few minutes and try again.',
    'auth/network-request-failed': 'No internet connection.', 'permission-denied': 'You do not have permission to do that.'
  };
  return m[c] || (e && e.message) || String(e);
}

/* ============ live store ============ */
// Keeps the collections the screens need in memory and re-renders when anything changes.
export const store = { db: null, me: null, data: {}, listeners: [], unsubs: [], ready: new Set(), rerender: null, errors: [], version: 0, names: {} };
export const all = c => Object.values(store.data[c] || {});
export const byId = (c, id) => (store.data[c] || {})[id] || null;

function merge(coll, key, docs) {
  const m = store.data['__' + coll] || (store.data['__' + coll] = {});
  m[key] = docs;
  const out = {};
  for (const list of Object.values(m)) for (const d of list) out[d.id] = d;
  store.data[coll] = out; store.version++;
}
let rrTimer = 0;
function schedule() { clearTimeout(rrTimer); rrTimer = setTimeout(() => store.rerender && store.rerender(), 60); }

export function startWatching(role, colls) {
  stopWatching();
  for (const coll of colls) store.unsubs.push(store.db.watch(coll, [], docs => { merge(coll, 'all', docs); store.ready.add(coll); schedule(); },
    err => { store.errors.push(coll + ': ' + (err.code || err.message)); schedule(); }));
}
export function stopWatching() { store.unsubs.forEach(u => { try { u(); } catch (e) { } }); store.unsubs = []; store.data = {}; store.ready.clear(); }
export const setting = (k, d) => (byId('settings', 'company') || {})[k] ?? d;

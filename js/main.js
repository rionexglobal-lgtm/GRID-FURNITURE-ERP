// GRID Shop Manager (Full-stack edition) — start-up, Google OAuth & Role management, navigation
import { $, esc, LS, store, all, byId, startWatching, stopWatching, ClaudeAdapter, FullStackAdapter, setting } from './core.js';
import * as L from './logic.js';
import { toast, fail, openModal, closeModal } from './ui.js';
import { myday, enquiries, customers, followups, orders, deliveries, invoices } from './views-sales.js';
import { dashboard, money_, purchases, suppliers, items, cash, cashbook, accounts, staff, users, activity, settings } from './views-office.js';
import { assistant, draft } from './views-ai.js';
import { reports } from './views-reports.js';
import { tasks } from './views-tasks.js';
import { teamtasks } from './views-team.js';
import { punch, hratt, hrstaff, hrshifts, hrset } from './views-hr.js';
import { hrpay, hradv, hrinc, hrrep } from './views-hr-pay.js';
import * as HR from './logic-hr.js';
import { labels, stockcount } from './views-stock.js';
import { porders } from './views-po.js';
import { service } from './views-service.js';

const VIEWS = { service, porders, punch, hratt, hrstaff, hrshifts, hrpay, hradv, hrinc, hrrep, hrset, dashboard, myday, tasks, teamtasks, assistant, enquiries, customers, followups, orders, deliveries, invoices, money: money_, cashbook, reports, purchases, suppliers, items, stockcount, labels, cash, accounts, staff, users, activity, settings };
const SECTIONS = [['', ['dashboard', 'myday', 'punch', 'tasks', 'teamtasks', 'assistant']], ['Sales & CRM', ['enquiries', 'customers', 'followups', 'orders', 'deliveries', 'service']], ['Billing & money', ['invoices', 'cashbook', 'money', 'cash']], ['Stock & buying', ['items', 'stockcount', 'labels', 'porders', 'purchases', 'suppliers']], ['HR & Payroll', ['hratt', 'hrstaff', 'hrshifts', 'hrpay', 'hradv', 'hrinc', 'hrrep', 'hrset']], ['Management', ['reports', 'accounts', 'staff', 'users', 'activity', 'settings']]];
const BOTTOM = { sales: ['myday', 'punch', 'enquiries', 'followups'], billing: ['myday', 'punch', 'orders', 'invoices'], manager: ['dashboard', 'orders', 'tasks', 'assistant'], admin: ['dashboard', 'orders', 'deliveries', 'assistant'] };
const SHORT = { dashboard: 'Dashboard', myday: 'My Day', punch: 'My Attendance', hratt: 'Attendance', hrstaff: 'Staff Directory', hrshifts: 'Shifts & Rules', hrpay: 'Payroll', hradv: 'Advances', hrinc: 'Incentives & Allowances', hrrep: 'HR Reports', hrset: 'HR Settings', tasks: 'Tasks', teamtasks: 'Team Tasks', assistant: 'Ask Claude', enquiries: 'Enquiries', customers: 'Customers', followups: 'Follow-ups', orders: 'Orders', deliveries: 'Deliveries', invoices: 'Invoices', money: 'Money', cashbook: 'Cash Book', reports: 'Reports', service: 'After-sales Service', porders: 'Purchase Orders', purchases: 'Purchases', suppliers: 'Suppliers', items: 'Stock', stockcount: 'Stock Count', labels: 'Labels', cash: 'Cash Closing', accounts: 'Accounts', staff: 'Staff', users: 'Users & Roles', activity: 'Activity Log', settings: 'Settings' };
const LOGO = `<svg width="20" height="20" viewBox="0 0 24 24" fill="#fff" aria-hidden="true"><rect x="3" y="4" width="2" height="16"/><rect x="7" y="4" width="1" height="16"/><rect x="10" y="4" width="3" height="16"/><rect x="15" y="4" width="1" height="16"/><rect x="18" y="4" width="3" height="16"/></svg>`;
window.__committed = L.committedMap;
// header buttons that create something, hidden when the role has no “Add” right on that module
const HEAD_ADD = { hratt: ['quick'], hrstaff: ['newst'], hradv: ['newadv'], hrinc: ['newit'], money: ['rcv', 'pay', 'exp', 'trf', 'ref'], cashbook: ['rcv', 'exp', 'trf'], service: ['newsvc'], porders: ['newpo'], purchases: ['newp'], suppliers: ['news'], items: ['openstk', 'newi', 'imp'], accounts: ['jv', 'newacc'], enquiries: ['newq'], customers: ['newc'], followups: ['newfc', 'newfs'], orders: ['newo'], stockcount: ['newcount'], tasks: ['newt'] };
const allowed = n => {
  const v = VIEWS[n]; if (!v || !v.roles.includes(store.me?.role) || (n === 'assistant' && !store.sample)) return false;
  if (store.me.role === 'admin') return true;
  const rd = L.roleDef(store.me.roleId || store.me.role), m = rd.modules; return m ? m.includes(n) : L.defaultOn(n, rd.base);
};
const home = () => [L.can.manage(store.me?.role) ? 'dashboard' : 'myday', ...SECTIONS.flatMap(s => s[1])].find(allowed) || 'myday';
window.__gsmNav = { VIEWS, SECTIONS, SHORT };
let current = (() => { try { return sessionStorage.getItem('gsm-view') || null; } catch (e) { return null; } })();
const brand = `<div style="display:flex;gap:10px;align-items:center"><div class="logo">${LOGO}</div><div><b style="font-size:17px">GRID Shop Manager</b><div class="hint">Sales · CRM · Billing · Accounts</div></div></div>`;
const screen = (title, html) => { $('app').innerHTML = `<div class="auth"><div class="auth-card">${brand}<h1>${title}</h1>${html}</div></div>`; };

/* ---------- boot ---------- */
async function boot() {
  // If running inside Claude sandbox, preserve backward compatibility
  if (window.claude && window.claude.use) {
    const [db, user, dl, sample] = await Promise.all(['db', 'user', 'downloads', 'sample'].map(n => window.claude.use(n).catch(() => null)));
    if (db && user) {
      store.db = new ClaudeAdapter(db); store.user = user; store.dl = dl; store.sample = sample;
      if (sample) window.__ai = { draft };
      const meV = await user.me();
      if (!meV.id) return screen('Sign in to continue', '<p>Please sign in to Claude to use the shop system.</p>');
      store.me = { id: meV.id, name: meV.name || '', role: 'pending' };
      store.names[meV.id] = meV.name || '';
      const owner = meV.isOwner, canWrite = await user.can('data.write');
      $('app').innerHTML = '<div class="loading">Loading the shop…</div>';
      try {
        const mem = await store.db.get('members', meV.id).catch(() => null);
        if (!mem && canWrite !== false) await store.db.commit([{ t: 'set', coll: 'members', id: meV.id, data: { joinedAt: Date.now() } }]).catch(() => { });
        let team = await store.db.get('team', 'roles');
        if (owner && !team) { await store.db.commit([{ t: 'set', coll: 'team', id: 'roles', data: { owner: meV.id, roles: { [meV.id]: 'admin' }, createdAt: Date.now() } }]); team = await store.db.get('team', 'roles'); }
        if (owner && !(await store.db.get('settings', 'company'))) await L.bootstrapCompany('GRID Furniture');
        const myEmail = (mem && mem.claimEmail) || meV.email || '', myInvite = !owner && myEmail ? ((team || {}).invites || {})[L.normEmail(myEmail)] : null;
        const roleId = owner ? 'admin' : (team?.roles || {})[meV.id] || myInvite?.role || 'pending';
        store.bootTeam = team || {}; const rd = L.roleDef(roleId, store.bootTeam), role = rd.base;
        store.me.role = role; store.me.roleId = roleId; store.me.roleName = rd.name; store.canEdit = meV.canEdit;
        if (role === 'pending' || role === 'disabled') {
          screen(role === 'pending' ? 'Waiting for the owner' : 'Access turned off', '<p>Access turned off or waiting for role.</p>');
          return;
        }
        const colls = L.can.office(role) ? [...L.SHARED, ...L.FIN, ...(HR.hrAccess() ? HR.HR_COLLS : [])] : L.SHARED;
        startWatching(role, colls);
        shell();
        return;
      } catch (e) {
        console.error(e);
      }
    }
  }

  // Standalone Full-Stack Mode: check current session from server
  try {
    const authRes = await fetch('/api/auth/me');
    if (authRes.ok) {
      const authData = await authRes.json();
      if (authData.authenticated && authData.user) {
        return bootUser(authData.user);
      }
    }
  } catch (e) {
    console.warn('Auth check error:', e);
  }

  // Not signed in: show Google OAuth & Whitelisted Login screen
  showLoginScreen();
}

async function bootUser(user) {
  store.me = user;
  store.names[user.id] = user.name || '';
  store.db = new FullStackAdapter();
  store.user = {
    me: async () => ({
      id: user.id,
      name: user.name,
      email: user.email,
      isOwner: user.isOwner,
      canEdit: user.canEdit
    }),
    can: async () => true,
    profiles: async (ids) => {
      const map = {};
      for (const id of ids) {
        const m = byId('members', id) || (store.data.users && store.data.users[id]) || {};
        map[id] = { name: m.name || store.names[id] || '', email: m.email || '' };
      }
      return map;
    },
    search: async (q) => {
      const query = q.trim().toLowerCase();
      const list = Object.values(store.data.users || {}).concat(all('members'));
      const unique = new Map();
      for (const u of list) {
        if (u && u.id && !unique.has(u.id)) {
          if ((u.name && u.name.toLowerCase().includes(query)) || (u.email && u.email.toLowerCase().includes(query))) {
            unique.set(u.id, { id: u.id, name: u.name || '', email: u.email || '', isMe: u.id === store.me.id });
          }
        }
      }
      return Array.from(unique.values());
    }
  };
  store.dl = {
    save: async ({ filename, data }) => {
      const blob = new Blob([data], { type: 'text/plain;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      setTimeout(() => { URL.revokeObjectURL(url); a.remove(); }, 1000);
      return true;
    }
  };

  const role = user.role;
  const colls = L.can.office(role) ? [...L.SHARED, ...L.FIN, ...(HR.hrAccess() ? HR.HR_COLLS : [])] : L.SHARED;
  startWatching(role, colls);
  shell();
  route(home());
}

async function showLoginScreen(errMessage = '') {
  let authConfig = { googleClientId: '', adminEmail: 'marashidnk@gmail.com' };
  try {
    const r = await fetch('/api/auth/config');
    if (r.ok) authConfig = await r.json();
  } catch (e) {}

  const errHtml = errMessage
    ? `<div class="alert a-bad" style="margin:14px 0;line-height:1.5;text-align:left;border-left:4px solid var(--danger)">
        <b>⛔ Access Denied:</b> ${esc(errMessage)}
       </div>`
    : '';

  const html = `
    <div id="loginCard">
      <p style="color:var(--muted);margin:6px 0 16px;line-height:1.5">Sign in to manage sales, CRM, billing, stock, and accounts.</p>
      <div id="loginAlert">${errHtml}</div>

      <!-- Google Sign-In Container (GIS) -->
      <div id="gsiButton" style="display:flex;justify-content:center;margin-bottom:8px"></div>

      <button type="button" class="btn btn-ink" id="btnGoogleSignIn" style="width:100%;display:flex;align-items:center;justify-content:center;gap:12px;padding:12px;font-size:14.5px;font-weight:600;margin:6px 0 12px;border-radius:12px">
        <svg width="20" height="20" viewBox="0 0 24 24"><path fill="#4285F4" d="M23.745 12.27c0-.7-.06-1.4-.19-2.07H12v4.51h6.6c-.29 1.52-1.14 2.82-2.4 3.68v3.05h3.88c2.27-2.09 3.665-5.17 3.665-9.17Z"/><path fill="#34A853" d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.88-3.05c-1.08.72-2.45 1.16-4.05 1.16-3.12 0-5.77-2.1-6.72-4.93H1.25v3.15C3.26 21.36 7.33 24 12 24Z"/><path fill="#FBBC05" d="M5.28 14.27c-.25-.72-.38-1.49-.38-2.27s.13-1.55.38-2.27V6.58H1.25C.45 8.17 0 9.97 0 12s.45 3.83 1.25 5.42l4.03-3.15Z"/><path fill="#EA4335" d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.33 0 3.26 2.64 1.25 6.58l4.03 3.15c.95-2.83 3.6-4.98 6.72-4.98Z"/></svg>
        <span>Continue with Google</span>
      </button>

      <div style="display:flex;align-items:center;gap:12px;margin:16px 0;color:var(--muted)">
        <div style="flex:1;height:1px;background:var(--line)"></div>
        <span style="font-size:11px;text-transform:uppercase;letter-spacing:1px">Direct Access</span>
        <div style="flex:1;height:1px;background:var(--line)"></div>
      </div>

      <!-- Direct Admin Login Button (Requirement 2) -->
      <button type="button" class="btn btn-ok" id="btnAdminDirect" style="width:100%;padding:11px;font-size:13.5px;font-weight:700;border-radius:12px;display:flex;align-items:center;justify-content:center;gap:8px">
        <span>👑</span><span>Direct Admin Login (${esc(authConfig.adminEmail || 'marashidnk@gmail.com')})</span>
      </button>

      <!-- Whitelisted Email Direct Login -->
      <div style="margin-top:16px;border-top:1px dashed var(--line);padding-top:14px">
        <label style="font-size:12px;color:var(--muted);display:block;margin-bottom:6px">Or enter pre-whitelisted email:</label>
        <div style="display:flex;gap:8px">
          <input id="directEmail" class="inp" type="email" placeholder="name@gmail.com" style="flex:1;font-size:13px">
          <button type="button" class="btn" id="btnDirectGo" style="white-space:nowrap">Sign In</button>
        </div>
      </div>

      <div style="background:var(--panel-2);border:1px solid var(--line);border-radius:10px;padding:10px 12px;margin-top:16px;font-size:11.5px;color:var(--muted);line-height:1.5">
        🔒 <b>Role &amp; Whitelist Restricted:</b> Only users pre-added by the Administrator (<b>${esc(authConfig.adminEmail || 'marashidnk@gmail.com')}</b>) can log in. Users are redirected strictly into their assigned role.
      </div>
    </div>
  `;

  screen('Sign In', html);

  // Initialize Google Identity Services if loaded and client ID provided
  if (window.google?.accounts?.id && authConfig.googleClientId) {
    window.handleGoogleCredential = async (response) => {
      try {
        const res = await fetch('/api/auth/google', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ credential: response.credential })
        });
        const data = await res.json();
        if (data.success && data.user) {
          bootUser(data.user);
        } else {
          showLoginScreen(data.error || 'Login not permitted.');
        }
      } catch (e) {
        showLoginScreen(e.message || 'Google authentication failed.');
      }
    };

    try {
      google.accounts.id.initialize({
        client_id: authConfig.googleClientId,
        callback: window.handleGoogleCredential
      });
      google.accounts.id.renderButton(
        document.getElementById('gsiButton'),
        { theme: 'outline', size: 'large', width: '100%', text: 'continue_with' }
      );
      const manualBtn = document.getElementById('btnGoogleSignIn');
      if (manualBtn && document.getElementById('gsiButton').children.length > 0) {
        manualBtn.style.display = 'none';
      }
    } catch (err) {
      console.warn('GSI render error:', err);
    }
  }

  // Google sign in click handler (fallback/direct)
  const btnGoogle = document.getElementById('btnGoogleSignIn');
  if (btnGoogle) {
    btnGoogle.onclick = async () => {
      const email = prompt('Enter your Google Account email:');
      if (!email) return;
      btnGoogle.disabled = true;
      try {
        const res = await fetch('/api/auth/google', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email: email.trim(), name: email.split('@')[0] })
        });
        const data = await res.json();
        if (data.success && data.user) {
          bootUser(data.user);
        } else {
          showLoginScreen(data.error || 'Access denied.');
        }
      } catch (e) {
        showLoginScreen(e.message);
      } finally {
        btnGoogle.disabled = false;
      }
    };
  }

  // Direct Admin Login (Requirement 2)
  const adminBtn = document.getElementById('btnAdminDirect');
  if (adminBtn) {
    adminBtn.onclick = async () => {
      adminBtn.disabled = true;
      try {
        const res = await fetch('/api/auth/admin-direct', { method: 'POST' });
        const data = await res.json();
        if (data.success && data.user) {
          bootUser(data.user);
        } else {
          showLoginScreen(data.error || 'Failed to login as admin.');
        }
      } catch (err) {
        showLoginScreen(err.message);
      } finally {
        adminBtn.disabled = false;
      }
    };
  }

  // Direct Whitelisted Email Login
  const directBtn = document.getElementById('btnDirectGo');
  const directInput = document.getElementById('directEmail');
  if (directBtn && directInput) {
    const doDirect = async () => {
      const email = directInput.value.trim();
      if (!email) return;
      directBtn.disabled = true;
      try {
        const res = await fetch('/api/auth/direct-login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email })
        });
        const data = await res.json();
        if (data.success && data.user) {
          bootUser(data.user);
        } else {
          showLoginScreen(data.error || 'Access denied.');
        }
      } catch (e) {
        showLoginScreen(e.message);
      } finally {
        directBtn.disabled = false;
      }
    };
    directBtn.onclick = doDirect;
    directInput.onkeydown = e => { if (e.key === 'Enter') doDirect(); };
  }
}

/* ---------- names from the Claude directory (never stored) ---------- */
let nameBusy = false;
// owner: swap email invites for the person's id once they have opened the page
let claimBusy = false, claimDone = new Set();
async function claimInvites() {
  if (claimBusy || store.me?.role !== 'admin' || !store.user) return;
  const inv = L.invites(); if (!Object.keys(inv).length) return;
  const roles = (byId('team', 'roles') || {}).roles || {};
  const ids = all('members').filter(m => !roles[m.id] && !claimDone.has(m.id + '|' + (m.claimEmail || ''))).map(m => m.id); if (!ids.length) return;
  claimBusy = true;
  try { const ps = await store.user.profiles(ids).catch(() => ({})); const map = {}; ids.forEach(id => { claimDone.add(id + '|' + ((byId('members', id) || {}).claimEmail || '')); const em = (byId('members', id) || {}).claimEmail || ps[id]?.email; if (em) map[id] = em; }); const n = await L.claimInvites(map); if (n) toast(`${n} invited staff member${n === 1 ? '' : 's'} joined and got their role.`); } catch (e) { console.warn('invites', e); } finally { claimBusy = false; }
}
async function refreshNames() {
  if (nameBusy || !store.user) return;
  const ids = new Set(); all('members').forEach(m => ids.add(m.id)); Object.keys((byId('team', 'roles') || {}).roles || {}).forEach(i => ids.add(i));
  ['quotations', 'salesOrders', 'invoices'].forEach(c => all(c).forEach(d => d.salesman && ids.add(d.salesman))); all('followups').forEach(f => f.assignedTo && ids.add(f.assignedTo)); all('customers').forEach(c => c.salesman && ids.add(c.salesman));
  const missing = [...ids].filter(i => !(i in store.names)); if (!missing.length) return;
  nameBusy = true;
  try { const ps = await store.user.profiles(missing); for (const [id, p] of Object.entries(ps)) store.names[id] = p.name || ''; store.version++; rerender(false, true); } catch (e) { } finally { nameBusy = false; }
}

/* ---------- shell ---------- */
// side menu: groups expand / collapse like an accordion (only the open screen's group stays open), and the whole rail can shrink to icons
const SEC_ICON = { 'Sales & CRM': '💼', 'Billing & money': '💳', 'Stock & buying': '📦', 'HR & Payroll': '🧑‍💼', Management: '⚙️' };
const secOf = n => SECTIONS.findIndex(s => s[1].includes(n));
// one colour per menu group: face / darker same-hue base / glow (rgb) — used by the 3D menu keys
const SEC_COLOR = [['#6366f1', '#4338ca', '99 102 241'], ['#3b82f6', '#1d4ed8', '59 130 246'], ['#16a34a', '#166534', '22 163 74'], ['#ea580c', '#9a3412', '234 88 12'], ['#8b5cf6', '#6d28d9', '139 92 246'], ['#0d9488', '#115e59', '13 148 136']];
const keyStyle = n => { const c = SEC_COLOR[Math.max(0, secOf(n))] || SEC_COLOR[0]; return `--kf:${c[0]};--kb:${c[1]};--kg:${c[2]}`; };
// haptic tick on touch: vibration where the browser allows it, the iOS switch-control tick otherwise; always silent on failure
let hapticEl = null; const IOS = /iP(hone|ad|od)/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
function haptic() {
  try { if (navigator.vibrate && navigator.vibrate(10)) return; } catch (e) { }
  if (!IOS) return;
  try { if (!hapticEl) { hapticEl = document.createElement('label'); hapticEl.setAttribute('aria-hidden', 'true'); hapticEl.style.cssText = 'position:fixed;left:-20px;top:0;width:1px;height:1px;opacity:0;overflow:hidden;pointer-events:none'; const i = document.createElement('input'); i.type = 'checkbox'; i.setAttribute('switch', ''); i.tabIndex = -1; hapticEl.appendChild(i); document.body.appendChild(hapticEl); } hapticEl.click(); } catch (e) { }
}
const jiggle = (el, deg = 1) => { try { if (el && el.animate && !matchMedia('(prefers-reduced-motion: reduce)').matches) el.animate([{ rotate: '0deg' }, { rotate: -deg + 'deg', offset: 0.3 }, { rotate: deg + 'deg', offset: 0.65 }, { rotate: '0deg' }], { duration: 140, easing: 'cubic-bezier(0.16, 1, 0.3, 1)' }); } catch (e) { } };
let openSec = -1, rail = (() => { try { return localStorage.getItem('gsm-rail') === '1'; } catch (e) { return false; } })();
function navHTML() {
  const cur = secOf(current);
  return SECTIONS.map(([sec, list], i) => {
    const vis = list.filter(allowed); if (!vis.length) return '';
    let sum = 0; const items = vis.map(n => { const v = VIEWS[n], b = v.badge ? v.badge() : 0; sum += Number(b) || 0; return `<button class="nav${n === current ? ' active' : ''}" data-nav="${n}" style="${keyStyle(n)}" title="${esc(SHORT[n])}"${n === current ? ' aria-current="page"' : ''}><span class="ic">${v.icon}</span><span class="nav-lbl">${SHORT[n]}</span>${b ? `<span class="badge">${b}</span>` : ''}</button>`; }).join('');
    if (!sec) return `<div class="nav-top">${items}</div>`;
    const open = i === openSec;
    return `<div class="nav-g${open ? ' open' : ''}${i === cur ? ' has-active' : ''}"><button type="button" class="nav-head" data-sec="${i}" style="--kf:${(SEC_COLOR[i] || SEC_COLOR[0])[0]}" aria-expanded="${open}" aria-controls="navg${i}" title="${esc(sec)}"><span class="ic">${SEC_ICON[sec] || '•'}</span><span class="nav-lbl">${sec}</span>${sum ? `<span class="badge">${sum}</span>` : ''}<span class="chev" aria-hidden="true"></span></button>
      <div class="nav-grp" id="navg${i}" role="group" aria-label="${esc(sec)}"${open ? '' : ' inert'}><div>${items}</div></div></div>`;
  }).join('');
}
// open one group and close the rest (i = -1 closes all); done on the live menu so it animates
function setOpenSec(i) {
  openSec = i;
  document.querySelectorAll('#navList .nav-g').forEach(g => { const h = g.querySelector('[data-sec]'), on = +h.dataset.sec === i; g.classList.toggle('open', on); h.setAttribute('aria-expanded', on); g.querySelector('.nav-grp').inert = !on; });
}
function setRail(on) {
  rail = on; try { localStorage.setItem('gsm-rail', on ? '1' : '0'); } catch (e) { }
  const sh = document.querySelector('.shell'); if (sh) sh.classList.toggle('rail', on);
  const b = $('railBtn'); if (b) { b.setAttribute('aria-expanded', !on); b.title = on ? 'Expand menu' : 'Shrink menu'; b.setAttribute('aria-label', b.title); }
}
function bottomHTML() {
  return (BOTTOM[store.me.role] || BOTTOM.sales).filter(allowed).map(n => { const v = VIEWS[n], b = v.badge ? v.badge() : 0; return `<button class="${n === current ? 'active' : ''}" data-nav="${n}" style="${keyStyle(n)}"><span class="ic">${v.icon}</span>${SHORT[n]}${b ? `<span class="badge">${b}</span>` : ''}</button>`; }).join('') + `<button data-more="1"><span class="ic">☰</span>More</button>`;
}
function shell() {
  $('app').innerHTML = `<div class="shell${rail ? ' rail' : ''}"><aside class="side"><div class="brand"><div class="logo" id="brandLogo">${LOGO}</div><div class="brand-t"><b id="shopName"></b><span>Shop Manager</span></div><button type="button" class="rail-btn" id="railBtn" aria-controls="navList" aria-expanded="${!rail}" title="${rail ? 'Expand menu' : 'Shrink menu'}" aria-label="${rail ? 'Expand menu' : 'Shrink menu'}"></button></div><nav id="navList" aria-label="Main menu"></nav>
    <div class="me"><b>${esc(store.me.name || 'You')}</b><div style="display:flex;justify-content:space-between;align-items:center;margin-top:2px"><span>${esc(store.me.roleName || L.ROLES[store.me.role])}</span><button type="button" class="btn btn-sm btn-ghost" id="btnSignOut" style="padding:1px 6px;font-size:11px;color:var(--rail-muted);box-shadow:none">Sign out</button></div></div></aside>
    <div style="min-width:0"><div class="mtop"><div class="logo" id="mLogo" style="width:30px;height:30px">${LOGO}</div><b id="mTitle"></b><button class="btn btn-sm" id="mNew">＋ Walk-in</button></div>
    <main><div id="banner"></div><div class="top"><h1 id="vTitle"></h1><div id="vHead" style="display:flex;gap:8px;flex-wrap:wrap"></div></div><div id="vBody"></div></main></div></div><nav class="bnav" id="bnav"></nav>`;
  $('mNew').onclick = () => import('./views-sales.js').then(m => m.openQuotation(null));
  const so = $('btnSignOut'); if (so) so.onclick = async () => { await fetch('/api/auth/logout', { method: 'POST' }); location.reload(); };
  document.addEventListener('pointerdown', e => { if ((e.pointerType === 'touch' || e.pointerType === 'pen') && e.target.closest && e.target.closest('button:not(:disabled), .btn, [data-nav], [data-go], .chip')) haptic(); }, { passive: true, capture: true });
  document.querySelector('.shell').addEventListener('click', e => { const n = e.target.closest('[data-nav]'); if (n) return go(n.dataset.nav); const h = e.target.closest('[data-sec]'); if (h) { const i = +h.dataset.sec; return setOpenSec(openSec === i ? -1 : i); } if (e.target.closest('#railBtn')) setRail(!rail); });
  $('bnav').addEventListener('click', e => { const n = e.target.closest('[data-nav]'); if (n) go(n.dataset.nav); if (e.target.closest('[data-more]')) moreSheet(); });
  store.rerender = () => rerender(false, true);
  window.__rerender = keep => rerender(keep);
  window.addEventListener('hashchange', () => { const h = location.hash.replace(/^#\/?/, ''); if (VIEWS[h]) go(h); });
  route(current);
}
function go(name) { route(name); }
function moreSheet() {
  openModal('Menu', SECTIONS.map(([sec, list]) => { const vis = list.filter(allowed); return vis.length ? (sec ? `<div class="nav-sec" style="color:var(--muted);margin:10px 0 6px">${sec}</div>` : '') + `<div class="grid g3 more-grid" style="gap:8px 8px;padding-bottom:4px">${vis.map(n => `<button class="btn more-key" data-go="${n}" style="${keyStyle(n)};flex-direction:column;padding:12px 6px;white-space:normal"><span style="font-size:22px">${VIEWS[n].icon}</span>${SHORT[n]}</button>`).join('')}</div>` : ''; }).join('') + `<div style="margin-top:14px;display:flex;justify-content:space-between;align-items:center"><p class="hint" style="margin:0">${esc(store.me.name || 'You')} · ${esc(L.ROLES[store.me.role])}</p><button type="button" class="btn btn-danger btn-sm" id="btnMoreSignOut">Sign out</button></div>`, [], {
    onOpen: b => {
      b.querySelectorAll('[data-go]').forEach(x => x.onclick = () => { closeModal(); go(x.dataset.go); });
      const mso = b.querySelector('#btnMoreSignOut'); if (mso) mso.onclick = async () => { await fetch('/api/auth/logout', { method: 'POST' }); location.reload(); };
    } });
}
function route(name) {
  if (!store.me || !$('vBody')) return;
  if (!allowed(name)) name = home();
  current = name; try { sessionStorage.setItem('gsm-view', name); } catch (e) { }
  { const si = secOf(name); openSec = si >= 0 && SECTIONS[si][0] ? si : -1; }
  const v = VIEWS[name];
  $('vTitle').textContent = v.title; $('mTitle').textContent = v.title;
  $('vHead').innerHTML = v.head ? v.head() : '';
  if (!L.may(name, 'add')) (HEAD_ADD[name] || []).forEach(k => $('vHead').querySelectorAll(`[data-a="${k}"],[data-act="${k}"]`).forEach(b => b.remove()));
  const fresh = $('vBody').cloneNode(false); $('vBody').replaceWith(fresh);
  const freshHead = $('vHead').cloneNode(true); $('vHead').replaceWith(freshHead);
  v.bind && v.bind(fresh); v.bind && v.bind(freshHead);
  rerender(); window.scrollTo(0, 0);
  const act = document.querySelector('#navList .nav.active'); if (act && act.scrollIntoView) act.scrollIntoView({ block: 'nearest' });
  jiggle(act); jiggle(document.querySelector('#bnav button.active'), 2);
}
// the shop's own logo (Settings → Logo) replaces the GRID mark in the menu and phone header
let shownLogo = null;
function paintLogo() {
  const P = byId('settings', 'print') || {}, lg = P.logo || '', h = Math.max(24, Math.min(160, Number(P.menuLogoH) || 64));
  document.documentElement.style.setProperty('--logo-h', h + 'px');
  if (lg === shownLogo) return; shownLogo = lg;
  ['brandLogo', 'mLogo'].forEach(id => { const el = $(id); if (!el) return; el.classList.toggle('has-img', !!lg); el.innerHTML = lg ? `<img src="${esc(lg)}" alt="${esc(setting('name', 'Shop'))} logo">` : LOGO; });
}
let firstData = true;
function rerender(keep, fromData) {
  const v = VIEWS[current]; if (!v || !$('vBody')) return;
  if (fromData && firstData && store.ready.size) { firstData = false; refreshNames(); }
  else if (fromData) refreshNames();
  if (fromData) claimInvites();
  L.derive();
  if (L.can.office(store.me?.role)) { try { L.watchActivity(); } catch (e) { } }
  if ($('shopName')) $('shopName').textContent = setting('name', 'GRID Furniture');
  paintLogo();
  if (fromData && v.static) { $('navList').innerHTML = navHTML(); $('bnav').innerHTML = bottomHTML(); try { v.onData && v.onData(); } catch (e) { console.error(e); } return; }
  const a = document.activeElement, keepId = a && a.id && $('vBody').contains(a) ? a.id : null, sel = keepId && a.selectionStart != null ? [a.selectionStart, a.selectionEnd] : null, y = window.scrollY;
  try { $('vBody').innerHTML = v.body(); } catch (e) { console.error(e); $('vBody').innerHTML = `<div class="alert a-bad">${esc(e.message)}</div>`; }
  if (keepId && $(keepId)) { const el = $(keepId); if (el.tagName === 'INPUT' && a.value !== undefined) el.value = a.value; el.focus(); if (sel) try { el.setSelectionRange(...sel); } catch (e) { } }
  if (fromData) window.scrollTo(0, y);
  v.after && v.after();
  $('navList').innerHTML = navHTML(); $('bnav').innerHTML = bottomHTML();
  $('banner').innerHTML = store.errors.length ? `<div class="alert a-bad">Some data could not be loaded (${esc(store.errors.slice(-2).join(', '))}). Reload the page; if it keeps happening, check your sharing level with the owner.</div>` : '';
}
cash.static = true;
window.__gsm = { store, L }; // handy for support: inspect data from the browser console
boot();

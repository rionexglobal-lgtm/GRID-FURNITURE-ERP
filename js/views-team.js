// GRID Shop Manager — Team Tasks: everyone's open work in one place (tasks, follow-ups, deliveries) with reassigning
import { esc, num, today, addDays, fmtDate, store, all, byId } from './core.js';
import * as L from './logic.js';
import { pill, searchBox, empty, words, hit, toast, fail, openModal, val, field, input } from './ui.js';
import { openSO } from './views-sales.js';

const rr = () => window.__rerender();
let fStatus = 'open', fType = 'all', fWho = '', fPer = 'week', fSearch = '';
const sel = new Set();
const TYPES = { task: '📋 Task', followup: '⏰ Follow-up', delivery: '🚚 Delivery', service: '🛠 Service visit' };
const STATUS = { pending: 'Pending', overdue: 'Overdue', unassigned: 'Not assigned', done: 'Completed' };
const PERIOD = { today: 'Today', week: 'Last 7 days', month: 'Last 30 days', all: 'All time' };

// staff who can be given work
const staff = () => all('users').filter(u => u.active !== false && !['pending', 'disabled'].includes(u.role)).sort((a, b) => String(a.name).localeCompare(String(b.name)));
const activeIds = () => new Set(staff().map(u => u.id));
const dayOf = ms => ms ? today(new Date(ms)) : '';

// every piece of work as one list: { key, kind, id, title, sub, due, who, open, doneOn }
export function workItems() {
  const out = [];
  all('tasks').filter(t => t.status !== 'cancelled').forEach(t => out.push({ key: 'task:' + t.id, kind: 'task', id: t.id, title: `${t.no || ''} · ${t.name}${t.qty > 1 ? ' × ' + t.qty : ''}`, sub: [t.kind === 'custom' ? 'Customisation' : 'Re-order', L.TASK_STATUS[t.status], t.soNo ? t.soNo + ' · ' + t.customerName : '', t.supplierName ? 'Supplier: ' + t.supplierName : 'No supplier yet'].filter(Boolean).join(' · '),
    due: t.expectedDate || t.deliveryDate || '', who: t.assignedTo || '', open: t.status !== 'done', doneOn: t.status === 'done' ? dayOf(t.updatedAt) : '' }));
  all('followups').forEach(f => out.push({ key: 'followup:' + f.id, kind: 'followup', id: f.id, title: (f.partyName || 'General') + (f.partyType === 'supplier' ? ' (supplier)' : ''), sub: [f.note, f.mobile, f.time].filter(Boolean).join(' · '),
    due: f.due || '', who: f.assignedTo || '', open: f.status === 'open', doneOn: f.status === 'done' ? dayOf(f.doneAt) : '' }));
  all('salesOrders').filter(o => ['open', 'scheduled', 'delivered'].includes(o.status)).forEach(o => out.push({ key: 'delivery:' + o.id, kind: 'delivery', id: o.id, title: `${o.no} · ${o.customerName}`, sub: [o.deliveryDate ? o.deliverySlot : 'Date not fixed yet', o.deliveryAddress, o.lines.map(l => l.name + ' ×' + l.qty).join(', ')].filter(Boolean).join(' · '),
    due: o.deliveryDate || '', who: o.deliveryBy || '', open: o.status !== 'delivered', doneOn: o.status === 'delivered' ? o.deliveredOn || '' : '' }));
  L.serviceVisits().filter(({ s, v }) => v.status !== 'cancelled' && s.status !== 'cancelled').forEach(({ s, v }) => out.push({ key: 'service:' + s.id + '|' + v.id, kind: 'service', id: s.id + '|' + v.id, title: `${s.no} · ${s.customerName}`, sub: [s.product, v.time, v.note || s.complaint].filter(Boolean).join(' · '),
    due: v.date || '', who: v.assignedTo || '', open: v.status === 'scheduled' && L.SVC_OPEN.includes(s.status), doneOn: v.status === 'done' ? dayOf(v.doneAt) : '' }));
  const ids = activeIds(), t = today();
  out.forEach(x => { x.assigned = !!x.who && ids.has(x.who); x.state = !x.open ? 'done' : !x.assigned ? 'unassigned' : x.due && x.due < t ? 'overdue' : 'pending'; if (x.open && x.due && x.due < t) x.late = true; });
  return out;
}
const inPeriod = d => { if (fPer === 'all') return true; const t = today(); return d && d >= (fPer === 'today' ? t : addDays(t, fPer === 'week' ? -6 : -29)) && d <= t; };
const reassignable = x => L.may('teamtasks', 'edit') && (x.kind !== 'task' || L.can.office(store.me?.role)) && (x.kind !== 'delivery' || L.can.office(store.me?.role)) && (x.kind !== 'service' || L.may('service', 'edit'));

export const teamtasks = {
  title: 'Team Tasks', icon: '👥', roles: ['admin', 'manager', 'billing', 'sales'],
  badge: () => L.can.manage(store.me?.role) ? workItems().filter(x => x.state === 'overdue' || x.state === 'unassigned').length : 0,
  body() {
    const items = workItems(), people = staff(), w = words(fSearch);
    const byType = items.filter(x => fType === 'all' || x.kind === fType);
    const count = (who, st) => byType.filter(x => (who === '' ? x.state === 'unassigned' || (st === 'done' && !x.assigned) : x.who === who && x.assigned) && (st === 'done' ? x.state === 'done' && inPeriod(x.doneOn) : x.state === st)).length;
    const rows = people.map(u => ({ id: u.id, name: u.name, role: u.roleName || L.ROLES[u.role] || '', p: count(u.id, 'pending'), o: count(u.id, 'overdue'), d: count(u.id, 'done') }));
    const un = byType.filter(x => x.state === 'unassigned').length;
    const tot = { p: rows.reduce((s, r) => s + r.p, 0), o: rows.reduce((s, r) => s + r.o, 0), d: rows.reduce((s, r) => s + r.d, 0) };
    const cell = (who, st, n, cls = '') => `<td class="num"><button class="tt-n${n ? '' : ' z'}${cls}${fWho === who && fStatus === st ? ' on' : ''}" data-pick="${who}|${st}">${n}</button></td>`;
    const list = byType.filter(x => {
      if (fStatus === 'open' ? x.state === 'done' : fStatus === 'done' ? !(x.state === 'done' && inPeriod(x.doneOn)) : x.state !== fStatus) return false;
      if (fWho === '_none') { if (x.assigned) return false; } else if (fWho && x.who !== fWho) return false;
      return hit(x.title + ' ' + x.sub + ' ' + L.nm(x.who), w);
    }).sort((a, b) => fStatus === 'done' ? String(b.doneOn).localeCompare(String(a.doneOn)) : (a.state === 'overdue' ? 0 : 1) - (b.state === 'overdue' ? 0 : 1) || (a.due || '9999').localeCompare(b.due || '9999'));
    [...sel].forEach(k => { if (!list.some(x => x.key === k && reassignable(x) && x.open)) sel.delete(k); });
    const canRe = L.may('teamtasks', 'edit');
    const opts = (cur, kind) => `${kind === 'followup' ? '' : `<option value=""${!cur ? ' selected' : ''}>— Not assigned —</option>`}${people.map(u => `<option value="${u.id}"${u.id === cur ? ' selected' : ''}>${esc(u.name)}</option>`).join('')}${cur && !people.some(u => u.id === cur) ? `<option value="${cur}" selected>${esc(L.nm(cur) || 'Former staff')} (inactive)</option>` : ''}`;
    const stPill = x => x.state === 'overdue' ? pill('unpaid', 'Overdue') : x.state === 'unassigned' ? pill('followup', 'Not assigned') + (x.late ? ' ' + pill('unpaid', 'Overdue') : '') : x.state === 'done' ? pill('done', 'Completed') : pill('open', 'Pending');
    const acts = x => `${x.kind === 'followup' && x.open && (x.who === store.me?.id || L.may('followups', 'edit')) ? `<button class="btn btn-sm btn-ok" data-done="${x.id}">✓ Done</button> ` : ''}<button class="btn btn-sm" data-open="${x.key}">Open</button>`;
    const whoLabel = fWho === '_none' ? 'Not assigned' : fWho ? L.nm(fWho) : 'Everyone';
    return `<div class="grid g4" style="margin-bottom:14px">
        <div class="kpi click" data-pick="|pending"><span>Pending</span><b>${tot.p}</b><small>open, on time</small></div>
        <div class="kpi click" data-pick="|overdue"><span>Overdue</span><b style="color:${tot.o ? 'var(--danger)' : 'inherit'}">${tot.o}</b><small>past the due date</small></div>
        <div class="kpi click" data-pick="_none|unassigned"><span>Not assigned</span><b style="color:${un ? 'var(--warn)' : 'inherit'}">${un}</b><small>nobody is on it</small></div>
        <div class="kpi click" data-pick="|done"><span>Completed</span><b style="color:var(--ok)">${tot.d}</b><small>${esc(PERIOD[fPer].toLowerCase())}</small></div></div>
      <div class="toolbar"><div class="chips">${Object.entries({ all: 'All work', task: TYPES.task, followup: TYPES.followup, delivery: TYPES.delivery, service: TYPES.service }).map(([k, l]) => `<button class="chip${k === fType ? ' active' : ''}" data-ty="${k}">${l}<small>${k === 'all' ? items.filter(x => x.open).length : items.filter(x => x.kind === k && x.open).length}</small></button>`).join('')}</div>
        <select class="inp" id="ttPer" style="width:auto" title="Period for completed work">${Object.entries(PERIOD).map(([k, l]) => `<option value="${k}"${k === fPer ? ' selected' : ''}>Completed: ${l}</option>`).join('')}</select></div>
      <div class="grid tt-grid" style="gap:16px;align-items:start">
        <div class="panel" style="padding:0;overflow:hidden"><div class="tw" style="border:0;border-radius:0"><table class="tt-t"><thead><tr><th>Staff</th><th class="num">Pending</th><th class="num">Overdue</th><th class="num">Done</th></tr></thead><tbody>
          ${rows.map(r => `<tr class="${fWho === r.id ? 'tt-me' : ''}"><td><button class="tt-name" data-pick="${r.id}|open"><b>${esc(r.name)}</b><span class="muted">${esc(r.role)}</span></button></td>${cell(r.id, 'pending', r.p)}${cell(r.id, 'overdue', r.o, r.o ? ' bad' : '')}${cell(r.id, 'done', r.d, r.d ? ' good' : '')}</tr>`).join('')}
          <tr class="${fWho === '_none' ? 'tt-me' : ''}"><td><button class="tt-name" data-pick="_none|unassigned"><b>Not assigned</b><span class="muted">needs an owner</span></button></td>${cell('_none', 'unassigned', un, un ? ' warn' : '')}<td class="num"></td><td class="num"></td></tr>
          ${un ? '' : ''}</tbody><tfoot><tr><td><button class="tt-name" data-pick="|open"><b>Everyone</b></button></td><td class="num">${tot.p}</td><td class="num">${tot.o}</td><td class="num">${tot.d}</td></tr></tfoot></table></div></div>
        <div style="min-width:0">
          <div class="toolbar" style="margin-bottom:8px">${searchBox('ttS', 'Search customer, item, note, order no…')}
            <div class="seg">${Object.entries({ open: 'All open', pending: STATUS.pending, overdue: STATUS.overdue, unassigned: STATUS.unassigned, done: STATUS.done }).map(([k, l]) => `<button type="button" data-st="${k}" class="${k === fStatus ? 'active' : ''}">${l}</button>`).join('')}</div></div>
          <div class="hint" style="margin-bottom:8px">Showing <b>${list.length}</b> · ${esc(whoLabel)}${fWho ? ' <a href="#" data-pick="|' + fStatus + '">show everyone</a>' : ''}</div>
          ${canRe && fStatus !== 'done' ? `<div class="tt-bulk${sel.size ? ' on' : ''}"><span><b>${sel.size}</b> selected</span><select class="inp inp-sm" id="ttTo" style="width:auto;min-width:170px"><option value="">Reassign selected to…</option>${people.map(u => `<option value="${u.id}">${esc(u.name)}</option>`).join('')}</select><button class="btn btn-sm btn-ink" data-a="bulk"${sel.size ? '' : ' disabled'}>Reassign</button>${sel.size ? '<button class="btn btn-sm" data-a="clr">Clear</button>' : ''}</div>` : ''}
          <div class="tw"><table><thead><tr>${canRe && fStatus !== 'done' ? `<th style="width:34px"><input type="checkbox" data-all="1" aria-label="Select all"${list.length && list.filter(x => reassignable(x)).every(x => sel.has(x.key)) ? ' checked' : ''}></th>` : ''}<th>Work</th><th class="hide-m">Due</th><th>Assigned to</th><th></th></tr></thead><tbody>
          ${list.map(x => `<tr>${canRe && fStatus !== 'done' ? `<td>${reassignable(x) ? `<input type="checkbox" data-sel="${x.key}"${sel.has(x.key) ? ' checked' : ''} aria-label="Select">` : ''}</td>` : ''}
            <td style="min-width:0"><div class="li-s" style="margin:0 0 2px">${pill(x.kind === 'task' ? 'custom' : x.kind === 'delivery' ? 'scheduled' : x.kind === 'service' ? 'ordered' : 'followup', TYPES[x.kind])} ${stPill(x)}</div><a href="#" class="tt-open" data-open="${x.key}"><b>${esc(x.title)}</b></a><div class="muted" style="font-size:12px;overflow-wrap:anywhere">${esc(x.sub)}</div><div class="muted show-m" style="font-size:12px">${x.due ? 'Due ' + fmtDate(x.due) : ''}</div><div class="show-m" style="margin-top:6px">${acts(x)}</div></td>
            <td class="hide-m nowrap">${x.state === 'done' ? `<span class="muted">Done ${fmtDate(x.doneOn)}</span>` : x.due ? `<span style="${x.late ? 'color:var(--danger);font-weight:700' : ''}">${fmtDate(x.due, { weekday: 'short', day: 'numeric', month: 'short' })}</span>${x.late ? `<div class="muted" style="font-size:11px">${(n => n + (n === 1 ? ' day' : ' days'))(Math.round((new Date(today()) - new Date(x.due)) / 864e5))} late</div>` : ''}` : '<span class="muted">No date</span>'}</td>
            <td>${x.open && reassignable(x) ? `<select class="inp inp-sm" data-re="${x.key}" style="width:auto;max-width:170px" aria-label="Assigned to">${opts(x.assigned ? x.who : (x.who || ''), x.kind)}</select>` : `<span>${x.who ? esc(L.nm(x.who)) : '<span class="muted">—</span>'}</span>`}</td>
            <td class="nowrap hide-m" style="text-align:right">${acts(x)}</td></tr>`).join('') || `<tr><td colspan="5">${empty('✅', fStatus === 'overdue' ? 'Nothing overdue. Well done!' : fStatus === 'unassigned' ? 'Everything has an owner.' : 'Nothing here.')}</td></tr>`}</tbody></table></div>
          <p class="hint" style="margin-top:8px">Tasks come from Tasks (re-orders and customisations), follow-ups from Follow-ups, and deliveries from sales orders waiting to go out. Overdue = past the due date and still open. Not assigned = nobody is on it, or it belongs to someone who no longer has access.</p>
        </div></div>`;
  },
  bind(root) {
    root.addEventListener('click', async e => {
      const pk = e.target.closest('[data-pick]'); if (pk) { e.preventDefault(); const [w, s] = pk.dataset.pick.split('|'); fWho = w; fStatus = s; sel.clear(); return rr(); }
      const ty = e.target.closest('[data-ty]'); if (ty) { fType = ty.dataset.ty; sel.clear(); return rr(); }
      const st = e.target.closest('[data-st]'); if (st) { fStatus = st.dataset.st; if (fStatus === 'unassigned') fWho = ''; sel.clear(); return rr(); }
      const op = e.target.closest('[data-open]'); if (op) { e.preventDefault(); return openWork(op.dataset.open); }
      const dn = e.target.closest('[data-done]'); if (dn) { const f = byId('followups', dn.dataset.done); if (f) doneDialog(f); return; }
      const a = e.target.closest('[data-a]')?.dataset.a;
      if (a === 'clr') { sel.clear(); return rr(); }
      if (a === 'bulk') {
        const to = val('ttTo'); if (!to) return toast('Choose who should take the selected work.', 'warn');
        const keys = [...sel]; let ok = 0;
        for (const k of keys) { const [kind, id] = k.split(':'); try { await L.reassignWork(kind, id, to); ok++; } catch (er) { fail(er); break; } }
        sel.clear(); toast(`${ok} item${ok === 1 ? '' : 's'} reassigned to ${L.nm(to)}.`); rr();
      }
    });
    root.addEventListener('change', async e => {
      const t = e.target;
      if (t.id === 'ttPer') { fPer = t.value; return rr(); }
      if (t.dataset.all) { root.querySelectorAll('[data-sel]').forEach(c => t.checked ? sel.add(c.dataset.sel) : sel.delete(c.dataset.sel)); return rr(); }
      if (t.dataset.sel) { t.checked ? sel.add(t.dataset.sel) : sel.delete(t.dataset.sel); return rr(); }
      if (t.dataset.re) { const [kind, id] = t.dataset.re.split(':'); try { const who = await L.reassignWork(kind, id, t.value); toast(`Reassigned to ${who}.`); } catch (er) { fail(er); rr(); } }
    });
    root.addEventListener('input', e => { if (e.target.id === 'ttS') { fSearch = e.target.value; window.__rerender(true); } });
  },
  keep: ['ttS']
};

function openWork(key) {
  const [kind, id] = key.split(':');
  if (kind === 'delivery') { const so = byId('salesOrders', id); if (so) openSO(so); return; }
  if (kind === 'task') { window.__openTask && window.__openTask(id); return; }
  if (kind === 'service') { window.__openService && window.__openService(id.split('|')[0]); return; }
  const f = byId('followups', id); if (!f) return;
  openModal('Follow-up · ' + (f.partyName || 'General'), `<div class="dl"><dt>Due</dt><dd>${fmtDate(f.due, { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })}${f.time ? ' ' + esc(f.time) : ''}</dd><dt>Assigned to</dt><dd>${esc(L.nm(f.assignedTo))}</dd>${f.mobile ? `<dt>Mobile</dt><dd>${esc(f.mobile)}</dd>` : ''}<dt>Note</dt><dd style="white-space:pre-wrap">${esc(f.note || '—')}</dd><dt>Status</dt><dd>${f.status === 'done' ? 'Done' + (f.doneAt ? ' · ' + fmtDate(today(new Date(f.doneAt))) : '') + (f.outcome ? ' — ' + esc(f.outcome) : '') : 'Open'}</dd>${f.createdBy ? `<dt>Set by</dt><dd>${esc(L.nm(f.createdBy))}</dd>` : ''}</div>`,
    [...(f.status === 'open' ? [{ label: '✓ Mark done', cls: 'btn-ok', onClick: () => { setTimeout(() => doneDialog(f), 30); } }] : []), { label: 'Close' }]);
}
function doneDialog(f) {
  openModal('Follow-up done', `<p style="margin:0 0 10px"><b>${esc(f.partyName || 'General')}</b> · ${esc(f.note || '')}</p>${field('What happened?', input('ttOut', '', 'placeholder="e.g. Customer will visit on Saturday"'))}`,
    [{ label: 'Cancel' }, { label: 'Mark done', cls: 'btn-ok', onClick: async () => { await L.completeFollowup(f, val('ttOut')); toast('Follow-up done.'); } }]);
}

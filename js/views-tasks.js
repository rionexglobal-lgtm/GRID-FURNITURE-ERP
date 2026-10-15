// GRID Shop Manager — Tasks: re-orders and customisation jobs coming from sales orders (or added by hand)
import { $, esc, num, today, addDays, fmtDate, store, all, byId, setting } from './core.js';
import * as L from './logic.js';
import { pill, searchBox, empty, words, hit, toast, openModal, closeModal, val, field, input, select, userOptions, partyPicker, waLink } from './ui.js';
import { followupDialog, openSO } from './views-sales.js';
import { serviceTasksPanel } from './views-service.js';

const role = () => store.me?.role, office = () => L.can.office(role()), myId = () => store.me?.id;
const rr = () => window.__rerender();
let tFilter = 'active', tKind = 'all', tMine = false, tSearch = '';

const visible = () => all('tasks').filter(t => office() || t.salesman === myId());
const openFU = t => all('followups').filter(f => f.refType === 'task' && f.refId === t.id && f.status === 'open').sort((a, b) => a.due.localeCompare(b.due));
const statusPill = t => pill(t.status === 'open' ? 'followup' : t.status, L.TASK_STATUS[t.status]);
const kindPill = t => pill(t.kind === 'custom' ? 'custom' : 'reorder', t.kind === 'custom' ? 'Customisation' : 'Re-order');
const isLate = t => t.deliveryDate && ['open', 'ordered'].includes(t.status) && t.deliveryDate <= addDays(today(), 3);
const managers = () => userOptions(['admin', 'manager', 'billing']);
const GROUPS = { active: t => ['open', 'ordered', 'received'].includes(t.status), open: t => t.status === 'open', ordered: t => t.status === 'ordered', received: t => t.status === 'received', done: t => t.status === 'done', cancelled: t => t.status === 'cancelled', all: () => true };
const GLABEL = { all: 'All', active: 'Active', open: 'To do', ordered: 'Ordered', received: 'Received', done: 'Done', cancelled: 'Cancelled' };
// items whose free stock (on hand − open orders) is at or below their re-order level and that have no active task yet
function lowStock() {
  const c = L.committedMap(), act = new Set(all('tasks').filter(t => GROUPS.active(t) && t.itemId).map(t => t.itemId));
  return all('items').filter(i => num(i.reorder) > 0 && num(i.onHand) - (c[i.id] || 0) <= num(i.reorder) && !act.has(i.id)).map(i => ({ ...i, free: num(i.onHand) - (c[i.id] || 0) })).sort((a, b) => a.free - b.free);
}

export const tasks = {
  title: 'Tasks', icon: '📋', roles: ['admin', 'manager', 'billing', 'sales'],
  badge: () => office() ? all('tasks').filter(t => t.status === 'open' && t.assignedTo === myId()).length : 0,
  head: () => office() ? `<button class="btn btn-accent" data-a="newt">＋ New task</button>` : '',
  body() {
    const base = visible().filter(t => (tKind === 'all' || t.kind === tKind) && (!tMine || t.assignedTo === myId())), w = words(tSearch);
    const list = base.filter(GROUPS[tFilter]).filter(t => hit([t.no, t.name, t.sku, t.desc, t.spec, t.soNo, t.customerName, t.supplierName].join(' '), w))
      .sort((a, b) => (a.deliveryDate || '9999').localeCompare(b.deliveryDate || '9999') || (a.createdAt || 0) - (b.createdAt || 0));
    const low = office() ? lowStock() : [];
    return `${!office() ? '<div class="alert a-info">These are the re-orders and customisation jobs for your customers’ orders. The billing team and managers update them.</div>' : ''}
      <div class="toolbar">${searchBox('ts', 'Search item, order, customer, supplier…')}
        <select class="inp" id="tKind" style="width:auto">${[['all', 'Re-orders & customisation'], ['reorder', 'Re-orders only'], ['custom', 'Customisation only']].map(([k, l]) => `<option value="${k}"${k === tKind ? ' selected' : ''}>${l}</option>`).join('')}</select>
        ${office() ? `<label class="check" style="margin:0"><input type="checkbox" id="tMine"${tMine ? ' checked' : ''}> Assigned to me</label>` : ''}</div>
      <div class="chips" style="margin-bottom:12px">${Object.keys(GLABEL).map(k => `<button class="chip${k === tFilter ? ' active' : ''}" data-f="${k}">${GLABEL[k]}<small>${base.filter(GROUPS[k]).length}</small></button>`).join('')}</div>
      <div class="tw"><table><thead><tr><th>Task</th><th>Item</th><th class="hide-m">For order</th><th>Supplier / vendor</th><th class="hide-m">Assigned</th><th class="hide-m">Next follow-up</th><th>Status</th></tr></thead><tbody>
      ${list.length ? list.map(t => { const fu = openFU(t)[0]; return `<tr class="click" data-t="${t.id}">
        <td class="nowrap"><b class="mono">${esc(t.no)}</b><div>${kindPill(t)}</div></td>
        <td style="min-width:160px"><b>${esc(t.name)}</b> × ${num(t.qty)}${t.desc ? `<div style="font-size:12px">${esc(t.desc)}</div>` : ''}${t.kind === 'custom' && t.spec ? `<div class="hint" style="max-width:280px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(t.spec)}</div>` : ''}</td>
        <td class="hide-m">${t.soNo ? `<b class="mono">${esc(t.soNo)}</b><div style="font-size:12px">${esc(t.customerName)}</div>` : '<span class="muted">Stock re-order</span>'}${t.deliveryDate ? `<div class="${isLate(t) ? 'pill p-unpaid' : 'muted'}" style="font-size:11px">Deliver ${fmtDate(t.deliveryDate)}</div>` : ''}</td>
        <td>${t.supplierName ? esc(t.supplierName) : `<span class="pill p-unpaid">Not assigned</span>`}${t.expectedDate ? `<div class="muted" style="font-size:11px">Expected ${fmtDate(t.expectedDate)}</div>` : ''}</td>
        <td class="hide-m">${esc(L.nm(t.assignedTo))}</td>
        <td class="hide-m">${fu ? `<span class="pill ${fu.due < today() ? 'p-unpaid' : 'p-followup'}">${fmtDate(fu.due)}</span>` : ['open', 'ordered'].includes(t.status) ? '<span class="muted">None set</span>' : ''}</td>
        <td>${statusPill(t)}</td></tr>`; }).join('') : `<tr><td colspan="7">${empty('📋', tFilter === 'active' ? 'No open tasks. Lines marked “New order” or “Customisation” on a sales order appear here.' : 'Nothing here.')}</td></tr>`}
      </tbody></table></div>
      ${serviceTasksPanel()}
      ${low.length ? `<div class="panel" style="margin-top:14px"><div class="panel-h"><h2>📉 Low stock — needs re-order</h2></div><p class="hint" style="margin:0 0 8px">Free stock (on hand minus open orders) is at or below the re-order level set on the item.</p>
        <div class="tw"><table><thead><tr><th>Item</th><th class="num">Free</th><th class="num">Re-order level</th><th></th></tr></thead><tbody>${low.slice(0, 30).map(i => `<tr><td><b>${esc(i.name)}</b><div class="muted mono" style="font-size:11px">${esc(i.sku)} · ${esc(i.category)}</div></td><td class="num">${i.free}</td><td class="num">${num(i.reorder)}</td><td class="num"><button class="btn btn-sm" data-lowt="${i.id}">＋ Re-order task</button></td></tr>`).join('')}</tbody></table></div></div>` : ''}`;
  },
  after() { if ($('ts') && document.activeElement?.id !== 'ts') $('ts').value = tSearch; },
  bind(root) {
    root.addEventListener('click', e => {
      if (e.target.closest('[data-a=newt]')) return newTaskDialog({});
      const lt = e.target.closest('[data-lowt]'); if (lt) { const i = byId('items', lt.dataset.lowt); return newTaskDialog({ kind: 'reorder', item: i, qty: Math.max(1, num(i.reorder) * 2 - num(i.onHand)) }); }
      const f = e.target.closest('[data-f]'); if (f) { tFilter = f.dataset.f; return rr(); }
      const t = e.target.closest('[data-t]'); if (t) openTask(t.dataset.t);
    });
    root.addEventListener('input', e => { if (e.target.id === 'ts') { tSearch = e.target.value; rr(); } });
    root.addEventListener('change', e => { if (e.target.id === 'tKind') { tKind = e.target.value; rr(); } if (e.target.id === 'tMine') { tMine = e.target.checked; rr(); } });
  },
  keep: ['ts']
};

export function openTask(id) {
  const t = byId('tasks', id); if (!t) return toast('Task not loaded.', 'warn');
  const ed = office() && !['done', 'cancelled'].includes(t.status), sp = t.supplierId ? byId('suppliers', t.supplierId) : null, so = t.soId ? byId('salesOrders', t.soId) : null, fus = openFU(t);
  const who = t.kind === 'custom' ? 'Vendor' : 'Supplier';
  const msg = [`Hello${sp ? ' ' + sp.name : ''},`, t.kind === 'custom' ? 'Please confirm this customised order:' : 'Please confirm this order:', `${t.name}${t.desc ? ' – ' + t.desc : ''} × ${num(t.qty)}`, t.kind === 'custom' && t.spec ? 'Details: ' + t.spec : '', t.deliveryDate ? 'Needed by ' + fmtDate(t.deliveryDate, { day: 'numeric', month: 'short', year: 'numeric' }) + '.' : '', `– ${setting('name', 'GRID Furniture')}`].filter(Boolean).join('\n');
  const body = `<div id="tkWrap"><div class="li-s" style="margin:-4px 0 12px">${kindPill(t)}${statusPill(t)}<span>Created ${fmtDate(t.createdAt ? today(new Date(t.createdAt)) : today())} by ${esc(L.nm(t.createdBy))}</span></div>
    <div class="grid g2" style="gap:12px;margin-bottom:12px">
      <div class="panel" style="box-shadow:none;padding:12px"><div class="hint">Item</div><b>${esc(t.name)}</b> × ${num(t.qty)}<div class="muted mono" style="font-size:11px">${esc(t.sku || '')}</div>${t.desc ? `<div style="margin-top:4px">${esc(t.desc)}</div>` : ''}</div>
      <div class="panel" style="box-shadow:none;padding:12px"><div class="hint">For</div>${t.soNo ? `<a href="#" id="tkSO"><b class="mono">${esc(t.soNo)}</b></a> · ${esc(t.customerName)}<div class="hint">Salesman ${esc(L.nm(t.salesman))}</div>${t.deliveryDate ? `<div class="${isLate(t) ? 'pill p-unpaid' : 'hint'}">Delivery ${fmtDate(t.deliveryDate)}</div>` : '<div class="hint">Delivery not scheduled</div>'}` : '<b>Stock re-order</b>'}</div></div>
    ${t.kind === 'custom' ? field('Customisation details (full description for the vendor)', `<textarea id="tkSpec" rows="4"${ed ? '' : ' readonly'} placeholder="Size, fabric / wood, colour code, finish, design changes…">${esc(t.spec || '')}</textarea>`) : ''}
    ${ed ? `<div class="row2"><div class="field"><label>${who}</label><div id="tkSup"></div></div>${field('Manager following up', select('tkWho', managers(), t.assignedTo))}</div>
      ${(po => po ? `<div class="alert a-info" style="display:flex;justify-content:space-between;gap:8px;align-items:center"><span>On purchase order <b class="mono">${esc(po.no)}</b> · ${esc({ draft: 'draft — confirm it in Purchase Orders', open: 'confirmed', sent: 'sent to supplier', partial: 'part received', received: 'received', cancelled: 'cancelled' }[L.poState(po)] || '')}</span><button class="btn btn-sm" type="button" id="tkPO">Open order</button></div>` : '')(t.poId ? byId('purchaseOrders', t.poId) : null)}
      ${t.status === 'open' && t.itemId && office() ? '<p class="hint" style="margin:0 0 8px">“Mark ordered” also puts this item on a <b>draft purchase order</b> for the supplier (one draft per supplier collects all items until you confirm it).</p>' : ''}
      <div class="row2">${field('Expected date', input('tkExp', t.expectedDate || '', 'type="date"'))}${field(t.kind === 'custom' ? 'Vendor job / order ref' : 'Supplier order ref', input('tkRef', t.poRef || '', 'placeholder="PO no., quote no."'))}</div>
      ${field('Add a note', input('tkNote', '', 'placeholder="e.g. Supplier confirmed, dispatch Friday"'))}`
    : `<div class="row2"><div><div class="hint">${who}</div><b>${esc(t.supplierName || 'Not assigned')}</b>${t.expectedDate ? `<div class="hint">Expected ${fmtDate(t.expectedDate)}</div>` : ''}${t.poRef ? `<div class="hint">Ref ${esc(t.poRef)}</div>` : ''}</div><div><div class="hint">Manager</div><b>${esc(L.nm(t.assignedTo))}</b></div></div>`}
    <div style="display:flex;justify-content:space-between;align-items:center;margin:14px 0 6px"><h3 style="margin:0;font-size:14px">Follow-ups</h3>${office() && GROUPS.active(t) ? '<button class="btn btn-sm" type="button" id="tkFU">⏰ Set follow-up</button>' : ''}</div>
    ${fus.length ? fus.map(f => `<div class="list-item" style="padding:8px 10px"><span><span class="pill ${f.due < today() ? 'p-unpaid' : 'p-followup'}">${fmtDate(f.due)}</span> ${esc(f.note || '')}</span><span class="muted" style="font-size:12px">→ ${esc(L.nm(f.assignedTo))}</span></div>`).join('') : '<p class="hint" style="margin:0">No follow-up set.</p>'}
    <h3 style="margin:14px 0 6px;font-size:14px">History</h3><ul class="tlog">${[...(t.log || [])].reverse().map(x => `<li><b>${esc(fmtDate(today(new Date(x.at))))}</b> · ${esc(L.nm(x.by))}: ${esc(x.text)}</li>`).join('')}</ul></div>`;
  let pick;
  const fields = () => ({ supplierId: pick ? (pick() || '') : t.supplierId, assignedTo: val('tkWho'), expectedDate: val('tkExp'), poRef: val('tkRef'), ...(t.kind === 'custom' ? { spec: val('tkSpec') } : {}) });
  const save = async status => { await L.updateTask(t, { ...fields(), ...(status ? { status } : {}) }, val('tkNote')); const n = byId('tasks', t.id); toast(status === 'ordered' && n?.poNo && n.poNo !== t.poNo ? `Task ordered — on draft purchase order ${n.poNo}.` : status ? 'Task ' + L.TASK_STATUS[status].toLowerCase() + '.' : 'Task saved.'); };
  const acts = [];
  if (sp?.mobile) acts.push({ label: '💬 WhatsApp ' + who.toLowerCase(), href: waLink(sp.mobile, msg) });
  if (ed) {
    acts.push({ label: 'Cancel task', cls: 'btn-danger', onClick: () => save('cancelled') });
    acts.push({ label: 'Save', onClick: () => save() });
    const next = { open: ['ordered', t.kind === 'custom' ? '✓ Sent to vendor' : '✓ Mark ordered'], ordered: ['received', '✓ Mark received'], received: ['done', '✓ Done'] }[t.status];
    if (next) acts.push({ label: next[1], cls: 'btn-ok', onClick: () => save(next[0]) });
  } else if (office() && t.status === 'cancelled') acts.push({ label: 'Reopen', onClick: () => L.updateTask(t, { status: 'open' }).then(() => toast('Task reopened.')) });
  if (!acts.length) acts.push({ label: 'Close' });
  openModal(`Task ${t.no}`, body, acts, { wide: true, onOpen: () => {
    if ($('tkSup')) pick = partyPicker($('tkSup'), 'supplier', t.supplierId || '');
    if ($('tkPO')) $('tkPO').onclick = () => { const po = byId('purchaseOrders', t.poId); closeModal(); if (po) setTimeout(() => import('./views-po.js').then(m => m.openPO(byId('purchaseOrders', po.id) || po)), 50); };
    if ($('tkSO')) $('tkSO').onclick = e => { e.preventDefault(); if (so) { closeModal(); setTimeout(() => openSO(so), 50); } };
    if ($('tkFU')) $('tkFU').onclick = () => {
      const sid = pick ? pick() : t.supplierId, s2 = sid ? byId('suppliers', sid) : null;
      if (s2 && sid !== t.supplierId) L.updateTask(t, { supplierId: sid }).catch(() => { });
      setTimeout(() => followupDialog({ refType: 'task', refId: t.id, partyType: 'supplier', partyId: s2?.id || '', partyName: s2?.name || '', mobile: s2?.mobile || '', note: `${t.no}: ${t.kind === 'custom' ? 'check progress of' : 'confirm dispatch of'} ${t.name}${t.desc ? ' (' + t.desc + ')' : ''} × ${num(t.qty)}`, assignedTo: val('tkWho') || t.assignedTo }), 30);
    };
  } });
}
window.__openTask = openTask;

function newTaskDialog({ kind = 'reorder', item = null, qty = 1 }) {
  let pick, k = kind;
  const items = all('items').sort((a, b) => a.name.localeCompare(b.name));
  openModal('New task', `<div id="ntWrap"><div class="field"><label>Type</label><div class="seg" id="ntKind"><button type="button" data-k="reorder" class="${k === 'reorder' ? 'active' : ''}">Re-order stock</button><button type="button" data-k="custom" class="${k === 'custom' ? 'active' : ''}">Customisation job</button></div></div>
    <div class="row2">${field('Item (type to search, or describe a new one)', `<input class="inp" id="ntItem" list="ntItems" value="${item ? esc(item.sku + ' · ' + item.name) : ''}" placeholder="SKU or name" autocomplete="off"><datalist id="ntItems">${items.map(i => `<option value="${esc(i.sku + ' · ' + i.name)}">`).join('')}</datalist>`)}${field('Quantity', input('ntQty', qty, 'type="number" min="1" step="1" inputmode="numeric"'))}</div>
    ${field('Description (colour / material / size)', input('ntDesc', '', 'placeholder="e.g. Teak, walnut polish, grey fabric"'))}
    <div id="ntSpecBox"${k === 'custom' ? '' : ' hidden'}>${field('Customisation details', '<textarea id="ntSpec" rows="3" placeholder="Full description for the vendor"></textarea>')}</div>
    <div class="row2"><div class="field"><label>Supplier / vendor</label><div id="ntSup"></div></div>${field('Manager following up', select('ntWho', managers(), L.defaultTaskOwner()))}</div>
    ${field('Needed by (optional)', input('ntBy', '', 'type="date"'))}</div>`,
    [{ label: 'Cancel' }, { label: 'Create task', cls: 'btn-ok', onClick: async () => {
      const raw = val('ntItem').trim(), it = items.find(i => i.sku + ' · ' + i.name === raw) || items.find(i => i.sku === raw);
      const id = await L.newTask({ kind: k, itemId: it?.id || '', sku: it?.sku || '', name: it ? it.name : raw, qty: val('ntQty'), desc: val('ntDesc'), spec: val('ntSpec'), supplierId: pick() || '', assignedTo: val('ntWho'), neededBy: val('ntBy') });
      toast('Task created.'); setTimeout(() => openTask(id), 80);
    } }],
    { wide: true, onOpen: () => {
      pick = partyPicker($('ntSup'), 'supplier', '');
      $('ntKind').onclick = e => { const b = e.target.closest('[data-k]'); if (!b) return; k = b.dataset.k; $('ntKind').querySelectorAll('button').forEach(x => x.classList.toggle('active', x === b)); $('ntSpecBox').hidden = k !== 'custom'; };
    } });
}

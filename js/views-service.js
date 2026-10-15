// GRID Shop Manager — After-sales Service: customer complaints, warranty, service visits (with staff, date and time),
// parts / components and chargeable service invoices. Visits also show in Tasks, Team Tasks and the Dashboard.
import { $, esc, num, r2, today, addDays, fmtDate, fmtTime, store, all, byId, setting } from './core.js';
import * as L from './logic.js';
import { money, money0, pill, empty, words, hit, toast, fail, openModal, closeModal, confirmBox, val, field, input, select, userOptions, partyPicker, waLink, taxBox, readTax, bindTaxBox } from './ui.js';
import { company, shopLogo, savePdf } from './print.js';
import { openInvoice } from './views-sales.js';
import { attachField, recordFiles, bindRecordFiles } from './attach.js';

const rr = () => window.__rerender && window.__rerender(true);
const role = () => store.me?.role, office = () => L.can.office(role()), myId = () => store.me?.id;
const ST_CLS = { open: 'followup', scheduled: 'scheduled', in_progress: 'ordered', waiting_parts: 'partial', resolved: 'paid', closed: 'done', cancelled: 'cancelled' };
const stSvc = s => pill(ST_CLS[s] || s, L.SVC_STATUS[s] || s);
const WAR = { in: ['paid', 'In warranty'], out: ['unpaid', 'Out of warranty'], na: ['open', 'Warranty n/a'] };
const warPill = w => pill(...(WAR[w] || WAR.na));
const staffOpts = () => userOptions(['admin', 'manager', 'billing', 'sales']);
const when = v => `${fmtDate(v.date, { weekday: 'short', day: 'numeric', month: 'short' })}${v.time ? ' · ' + esc(v.time) : ''}`;
let sFilter = 'open', sSearch = '', sMine = false;

// open a request from anywhere (dashboard, tasks, team tasks)
window.__openService = id => { const s = byId('services', id); if (s) openService(s); else toast('Service request not loaded.', 'warn'); };
document.addEventListener('click', e => { const x = e.target.closest && e.target.closest('[data-svcopen]'); if (x) { e.preventDefault(); window.__openService(x.dataset.svcopen); } });

export const service = {
  title: 'After-sales Service', icon: '🛠', roles: ['admin', 'manager', 'billing', 'sales'],
  badge: () => L.serviceVisits().filter(({ s, v }) => v.status === 'scheduled' && v.assignedTo === myId() && v.date <= today() && L.SVC_OPEN.includes(s.status)).length || 0,
  head: () => `<button class="btn btn-accent" data-a="newsvc">＋ New complaint</button>`,
  body() {
    const list = all('services'), w = words(sSearch);
    const G = { open: s => L.SVC_OPEN.includes(s.status), today: s => L.SVC_OPEN.includes(s.status) && (s.visits || []).some(v => v.status === 'scheduled' && v.date === today()),
      late: s => L.SVC_OPEN.includes(s.status) && (s.visits || []).some(v => v.status === 'scheduled' && v.date < today()), unplanned: s => ['open', 'in_progress', 'waiting_parts'].includes(s.status) && !L.nextVisit(s),
      resolved: s => s.status === 'resolved', closed: s => ['closed', 'cancelled'].includes(s.status), all: () => true };
    const lab = { all: 'All', open: 'Open', today: 'Visits today', late: 'Overdue visits', unplanned: 'No visit planned', resolved: 'Resolved', closed: 'Closed' };
    const base = list.filter(s => !sMine || (s.visits || []).some(v => v.assignedTo === myId()) || s.createdBy === myId());
    const shown = base.filter(G[sFilter]).filter(s => !sSearch.trim() || hit([s.no, s.customerName, s.mobile, s.product, s.complaint, s.invoiceNo].join(' '), w))
      .sort((a, b) => (a.priority === 'urgent' ? 0 : 1) - (b.priority === 'urgent' ? 0 : 1) || ((L.nextVisit(a)?.date || '9999') + (L.nextVisit(a)?.time || '')).localeCompare((L.nextVisit(b)?.date || '9999') + (L.nextVisit(b)?.time || '')) || (b.createdAt || 0) - (a.createdAt || 0));
    return `<div class="chips" style="margin-bottom:12px">${Object.keys(lab).map(k => `<button class="chip${k === sFilter ? ' active' : ''}" data-f="${k}">${lab[k]}<small>${base.filter(G[k]).length}</small></button>`).join('')}</div>
      <div class="toolbar" style="margin-bottom:12px"><input id="svS" class="inp" style="flex:1" placeholder="Search request no., customer, mobile, product, complaint…" value="${esc(sSearch)}" autocomplete="off">
        <label class="check" style="margin:0"><input type="checkbox" id="svMine"${sMine ? ' checked' : ''}> Mine</label></div>
      <div class="tw"><table><thead><tr><th>Request</th><th>Customer</th><th>Product · complaint</th><th class="hide-m">Next visit</th><th>Status</th></tr></thead><tbody>
      ${shown.map(s => { const nv = L.nextVisit(s), late = nv && nv.date < today();
        return `<tr class="click" data-sv="${s.id}"><td class="nowrap"><b class="mono">${esc(s.no)}</b>${s.priority === 'urgent' ? ' <span class="pill p-unpaid">Urgent</span>' : ''}<div class="muted" style="font-size:11px">${fmtDate(s.date)} · ${esc(L.SVC_TYPES[s.type] || '')}</div></td>
          <td><b>${esc(s.customerName)}</b><div class="muted" style="font-size:12px">${esc(s.mobile || '')}</div></td>
          <td style="min-width:180px"><b>${esc(s.product)}</b> ${warPill(s.warranty)}<div class="hint" style="max-width:320px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(s.complaint)}</div></td>
          <td class="hide-m nowrap">${nv ? `<span${late ? ' style="color:var(--danger);font-weight:700"' : ''}>${when(nv)}</span><div class="muted" style="font-size:12px">${esc(L.nm(nv.assignedTo))}</div>` : '<span class="muted">—</span>'}</td>
          <td>${stSvc(s.status)}</td></tr>`; }).join('') || `<tr><td colspan="5">${empty('🛠', sFilter === 'open' ? 'No open complaints. Press “＋ New complaint” when a customer calls.' : 'Nothing here.')}</td></tr>`}</tbody></table></div>
      ${L.can.admin(role()) ? `<p class="hint" style="margin-top:12px">Warranty period for new complaints: <input id="svWm" class="inp inp-sm num" type="number" min="0" max="240" value="${L.warrantyMonths()}" style="width:70px"> months from the invoice date <button class="btn btn-sm" data-a="svwm">Save</button></p>` : ''}`;
  },
  bind(root) {
    root.addEventListener('click', async e => {
      if (e.target.closest('[data-a=newsvc]')) return serviceEditor();
      if (e.target.closest('[data-a=svwm]')) { try { await store.db.commit([{ t: 'update', coll: 'settings', id: 'company', data: { warrantyMonths: Math.max(0, Math.round(num(val('svWm')))), updatedAt: Date.now(), updatedBy: myId() } }]); toast('Warranty period saved.'); } catch (er) { fail(er); } return; }
      const f = e.target.closest('[data-f]'); if (f) { sFilter = f.dataset.f; return rr(); }
      const r = e.target.closest('[data-sv]'); if (r) openService(byId('services', r.dataset.sv));
    });
    root.addEventListener('input', e => { if (e.target.id === 'svS') { sSearch = e.target.value; rr(); } });
    root.addEventListener('change', e => { if (e.target.id === 'svMine') { sMine = e.target.checked; rr(); } });
  }
};

/* ---------- new / edit complaint ---------- */
export function serviceEditor(s, { customerId } = {}) {
  const S = s || {}; let pick, att, cust = S.customerId || customerId || '';
  const invOpts = () => all('invoices').filter(i => i.customerId === cust && i.status !== 'void' && i.kind !== 'service').sort((a, b) => b.date.localeCompare(a.date));
  const drawInv = () => {
    const iv = invOpts(); $('svInv').innerHTML = `<option value="">— not linked / bought elsewhere —</option>${iv.map(i => `<option value="${i.id}"${i.id === S.invoiceId ? ' selected' : ''}>${esc(i.no)} · ${fmtDate(i.date)} · ${money0(i.total)}</option>`).join('')}`;
    drawProd();
  };
  const drawProd = () => {
    const inv = byId('invoices', val('svInv'));
    $('svProdPick').innerHTML = inv ? `<select id="svLine" class="inp">${inv.lines.filter(l => l.itemId).map((l, k) => `<option value="${k}">${esc(l.name)}${l.sku ? ' (' + esc(l.sku) + ')' : ''}</option>`).join('')}<option value="x">Other / not on this invoice</option></select>` : '';
    if (inv) { const l = inv.lines.filter(x => x.itemId)[0]; if (l && !S.product) { $('svProd').value = l.name; $('svProd').dataset.item = l.itemId; } $('svPd').value = inv.date; setWarranty(); }
  };
  const setWarranty = () => { const pd = val('svPd'); if (!pd) return; const end = L.warrantyEnd(pd), inW = end && today() <= end; $('svWar').value = inW ? 'in' : 'out'; $('svWarHint').textContent = end ? `Warranty ${L.warrantyMonths()} months → ${inW ? 'valid until' : 'ended on'} ${fmtDate(end, { day: 'numeric', month: 'short', year: 'numeric' })}` : ''; $('svChg').checked = !inW; };
  openModal(s ? 'Edit ' + s.no : 'New complaint / service request', `${field('Customer', '<div id="svParty"></div>')}
    <div class="row2">${field('Purchase invoice (optional)', '<select id="svInv" class="inp"></select>')}<div class="field"><label>Product</label><div id="svProdPick" style="margin-bottom:6px"></div>${input('svProd', S.product || '', 'placeholder="e.g. 3 seater sofa, teak" maxlength="160"')}</div></div>
    <div class="row3">${field('Purchase date', input('svPd', S.purchaseDate || '', 'type="date"'))}${field('Warranty', `<select id="svWar">${[['in', 'In warranty'], ['out', 'Out of warranty'], ['na', 'Not applicable']].map(([k, l]) => `<option value="${k}"${k === (S.warranty || 'na') ? ' selected' : ''}>${l}</option>`).join('')}</select>`)}${field('Type', select('svType', Object.entries(L.SVC_TYPES), S.type || 'repair'))}</div>
    <p class="hint" id="svWarHint" style="margin:-6px 0 8px"></p>
    ${field('Customer complaint', `<textarea id="svComp" rows="3" placeholder="What is wrong? e.g. recliner mechanism stuck, fabric torn on the left arm, door hinge broken">${esc(S.complaint || '')}</textarea>`)}
    <div class="row2">${field('Priority', select('svPri', [['normal', 'Normal'], ['urgent', 'Urgent']], S.priority || 'normal'))}<div class="field"><label>&nbsp;</label><label class="check" style="margin:8px 0 0"><input type="checkbox" id="svChg"${S.chargeable ? ' checked' : ''}> Chargeable (customer pays)</label></div></div>
    ${field('Mobile', input('svMob', S.mobile || '', 'inputmode="tel"'))}${field('Visit address', `<textarea id="svAddr" rows="2">${esc(S.address || '')}</textarea>`)}
    ${office() ? '<div class="field"><label>Photos of the problem (optional)</label><div id="svFiles"></div></div>' : ''}`,
    [{ label: 'Cancel' }, { label: s ? 'Save changes' : 'Register complaint', cls: 'btn-ok', onClick: async () => {
      if (att && att.busy()) throw Error('Wait for the photo to finish uploading.');
      const cid = pick(); if (!cid) throw Error('Choose the customer.');
      const prodEl = $('svProd'), id = await L.saveService({ id: s?.id, customerId: cid, invoiceId: val('svInv'), product: prodEl.value, itemId: prodEl.dataset.item || S.itemId || '', purchaseDate: val('svPd'), warranty: val('svWar'), type: val('svType'),
        complaint: val('svComp'), priority: val('svPri'), chargeable: $('svChg').checked, mobile: val('svMob'), address: val('svAddr'), files: att ? att.get() : (S.files || []) });
      toast(s ? 'Saved.' : 'Complaint registered.'); setTimeout(() => { const x = byId('services', id); if (x) openService(x); }, 300);
    } }],
    { wide: true, onOpen: b => {
      pick = partyPicker($('svParty'), 'customer', cust || null, c => { cust = c ? c.id : ''; if (c) { if (!val('svMob')) $('svMob').value = c.mobile || ''; if (!val('svAddr')) $('svAddr').value = c.address || ''; } drawInv(); });
      drawInv(); if (S.invoiceId) $('svInv').value = S.invoiceId;
      $('svInv').onchange = () => { $('svProd').value = ''; delete $('svProd').dataset.item; S.product = ''; drawProd(); };
      $('svPd').onchange = setWarranty;
      b.addEventListener('change', e => { if (e.target.id !== 'svLine') return; const inv = byId('invoices', val('svInv')); if (e.target.value === 'x') { $('svProd').value = ''; delete $('svProd').dataset.item; $('svProd').focus(); return; } const l = inv.lines.filter(x => x.itemId)[+e.target.value]; $('svProd').value = l.name; $('svProd').dataset.item = l.itemId; });
      if (office()) att = attachField($('svFiles'), S.files || []);
      if (!s && cust) { const c = byId('customers', cust); if (c) { $('svMob').value = c.mobile || ''; $('svAddr').value = c.address || ''; } }
    } });
}

/* ---------- one request ---------- */
export function openService(s) {
  if (!s) return; s = byId('services', s.id) || s;
  const ed = L.may('service', 'edit'), closed = ['closed', 'cancelled'].includes(s.status), invs = (s.invoiceIds || []).map(id => byId('invoices', id)).filter(Boolean);
  const visits = [...(s.visits || [])].sort((a, b) => (a.date + (a.time || '')).localeCompare(b.date + (b.time || '')));
  const vRow = v => { const mine = v.assignedTo === myId(), canAct = v.status === 'scheduled' && (ed || mine) && !closed;
    return `<div class="list-item" style="padding:8px 10px;align-items:flex-start"><span><b>${when(v)}</b> · ${esc(L.nm(v.assignedTo))} ${v.status === 'done' ? pill('done', 'Done') : v.status === 'cancelled' ? pill('cancelled', 'Cancelled') : v.date < today() ? pill('unpaid', 'Overdue') : pill('scheduled', 'Planned')}
      ${v.note ? `<div class="hint">${esc(v.note)}</div>` : ''}${v.outcome ? `<div style="font-size:13px;margin-top:2px">→ ${esc(v.outcome)}</div>` : ''}</span>
      ${canAct ? `<span style="display:flex;gap:6px;flex-wrap:wrap;justify-content:flex-end"><button class="btn btn-sm btn-ok" data-vdone="${v.id}">✓ Done</button>${ed ? `<button class="btn btn-sm" data-vmove="${v.id}">Change</button><button class="btn btn-sm" data-vcancel="${v.id}">✕</button>` : ''}</span>` : ''}</div>`; };
  const body = `<div id="svWrap"><div class="li-s" style="margin:-4px 0 12px">${stSvc(s.status)} ${warPill(s.warranty)} ${s.priority === 'urgent' ? pill('unpaid', 'Urgent') : ''}<span>${esc(L.SVC_TYPES[s.type] || '')}</span><span>Registered ${fmtDate(s.date)} by ${esc(L.nm(s.createdBy))}</span>${s.chargeable ? '<span class="pill p-followup">Chargeable</span>' : ''}</div>
    <div class="grid g2" style="gap:12px;margin-bottom:12px">
      <div class="panel" style="box-shadow:none;padding:12px"><div class="hint">Customer</div><b>${esc(s.customerName)}</b><div>${esc(s.mobile || '')}</div>${s.address ? `<div class="hint">${esc(s.address)}</div>` : ''}</div>
      <div class="panel" style="box-shadow:none;padding:12px"><div class="hint">Product</div><b>${esc(s.product)}</b>${s.invoiceNo ? `<div class="hint">Bought on ${esc(s.invoiceNo)}${s.purchaseDate ? ' · ' + fmtDate(s.purchaseDate, { day: 'numeric', month: 'short', year: 'numeric' }) : ''}</div>` : s.purchaseDate ? `<div class="hint">Bought ${fmtDate(s.purchaseDate, { day: 'numeric', month: 'short', year: 'numeric' })}</div>` : ''}${s.purchaseDate && L.warrantyEnd(s.purchaseDate) ? `<div class="hint">Warranty until ${fmtDate(L.warrantyEnd(s.purchaseDate), { day: 'numeric', month: 'short', year: 'numeric' })}</div>` : ''}</div></div>
    <div class="alert a-info" style="margin-bottom:12px"><b>Complaint:</b> ${esc(s.complaint)}</div>
    ${s.resolution ? `<div class="alert a-ok" style="margin-bottom:12px"><b>Resolution:</b> ${esc(s.resolution)}</div>` : ''}
    <h3 style="margin:6px 0 6px;font-size:14px">🗓 Visits</h3>${visits.length ? `<div class="list">${visits.map(vRow).join('')}</div>` : '<p class="hint">No visit planned yet.</p>'}
    ${invs.length ? `<h3 style="margin:14px 0 6px;font-size:14px">🧾 Parts &amp; service invoices</h3><div class="list">${invs.map(i => `<div class="list-item click" data-svinv="${i.id}" style="padding:8px 10px;cursor:pointer"><span><b class="mono">${esc(i.no)}</b> · ${fmtDate(i.date)} · ${i.lines.length} line${i.lines.length === 1 ? '' : 's'}</span><span>${i.total > 0 ? money0(i.total) + ' ' + pill(i.status, i.status === 'paid' ? 'Paid' : i.status === 'partial' ? 'Part paid' : i.status === 'void' ? 'Void' : 'Unpaid') : pill('paid', 'Free · warranty')}</span></div>`).join('')}</div>` : ''}
    ${office() ? recordFiles('services', s.id, ed) : ''}
    ${(s.log || []).length ? `<details style="margin-top:12px"><summary class="hint" style="cursor:pointer">History</summary><div class="hint" style="margin-top:6px;line-height:1.7">${s.log.map(x => `${fmtTime(x.at)} · ${esc(L.nm(x.by))} — ${esc(x.text)}`).join('<br>')}</div></details>` : ''}</div>`;
  const nv = L.nextVisit(s), wa = s.mobile ? waLink(s.mobile, `Dear ${s.customerName}, regarding your service request ${s.no} (${s.product}):` + (nv ? ` our technician ${L.nm(nv.assignedTo)} will visit on ${fmtDate(nv.date, { weekday: 'long', day: 'numeric', month: 'short' })}${nv.time ? ' at ' + nv.time : ''}.` : ' we are working on it and will contact you soon.') + `\n— ${setting('name', '')}`) : '';
  openModal('Service ' + s.no, body, [
    ...(!closed && ed ? [{ label: '🗓 Schedule visit', cls: 'btn-ok', onClick: () => { setTimeout(() => visitDialog(s), 60); } }] : []),
    ...(!closed && office() ? [{ label: '🧾 Parts / service invoice', perm: 'invoices:add', onClick: () => { setTimeout(() => invoiceDialog(s), 60); } }] : []),
    ...(!closed && ed ? [{ label: '✓ Resolve / close', onClick: () => { setTimeout(() => statusDialog(s), 60); } }] : []),
    ...(closed && ed ? [{ label: '↩ Reopen', onClick: async () => { await L.setServiceStatus(s, 'open', ''); toast('Reopened.'); } }] : []),
    { label: '⬇ Job card PDF', onClick: () => { jobCardPdf(s); return false; } },
    ...(wa ? [{ label: '💬 WhatsApp', href: wa }] : []),
    ...(!closed && ed ? [{ label: '✎ Edit', onClick: () => { setTimeout(() => serviceEditor(s), 60); } }] : []),
    { label: 'Close' }], { wide: true, onOpen: b => {
      bindRecordFiles(b);
      b.addEventListener('click', e => {
        const d = e.target.closest('[data-vdone]'); if (d) return setTimeout(() => finishDialog(s, d.dataset.vdone), 30);
        const m = e.target.closest('[data-vmove]'); if (m) return setTimeout(() => visitDialog(s, (s.visits || []).find(v => v.id === m.dataset.vmove)), 30);
        const c = e.target.closest('[data-vcancel]'); if (c) { confirmBox('Cancel this visit?', 'The visit is removed from the staff member’s tasks.', 'Cancel visit', true).then(ok => ok && L.cancelVisit(s, c.dataset.vcancel, 'Cancelled').then(() => { toast('Visit cancelled.'); setTimeout(() => openService(byId('services', s.id)), 200); }).catch(fail)); return; }
        const i = e.target.closest('[data-svinv]'); if (i) { const inv = byId('invoices', i.dataset.svinv); if (inv) setTimeout(() => openInvoice(inv), 30); }
      });
    } });
}
const reopen = s => setTimeout(() => { const x = byId('services', s.id); if (x) openService(x); }, 250);

function visitDialog(s, v) {
  const nv = v || {}, def = (L.nextVisit(s) || {}).assignedTo || '';
  openModal((v ? 'Change visit · ' : 'Schedule visit · ') + s.no, `<div class="row3">${field('Date', input('vsDate', nv.date || addDays(today(), 1), 'type="date"'))}${field('Time', input('vsTime', nv.time || '10:00', 'type="time"'))}${field('Service staff', select('vsWho', staffOpts(), nv.assignedTo || def || myId()))}</div>
    ${field('Instructions for the staff (optional)', input('vsNote', nv.note || '', 'placeholder="e.g. Take hinge set and drill; customer available after 4 pm" maxlength="300"'))}
    <p class="hint">The visit appears in the staff member’s Tasks, in Team Tasks and on the Dashboard.</p>`,
    [{ label: 'Cancel', onClick: () => reopen(s) }, { label: v ? 'Save' : 'Schedule', cls: 'btn-ok', onClick: async () => { await L.scheduleVisit(s, { visitId: v?.id, date: val('vsDate'), time: val('vsTime'), assignedTo: val('vsWho'), note: val('vsNote') }); toast(v ? 'Visit changed.' : 'Visit scheduled.'); reopen(s); } }]);
}
function finishDialog(s, vid) {
  openModal('Visit done · ' + s.no, `${field('What was done?', `<textarea id="vdOut" rows="3" placeholder="e.g. Replaced recliner lever and tightened frame; customer satisfied"></textarea>`)}
    ${field('Next step', select('vdNext', [['resolved', 'Problem solved'], ['in_progress', 'Another visit needed'], ['waiting_parts', 'Waiting for parts']], 'resolved'))}
    ${office() ? '<p class="hint">Parts used or a charge to the customer? Use “Parts / service invoice” on the request afterwards.</p>' : ''}`,
    [{ label: 'Cancel', onClick: () => reopen(s) }, { label: 'Save', cls: 'btn-ok', onClick: async () => { await L.finishVisit(byId('services', s.id) || s, vid, { outcome: val('vdOut'), next: val('vdNext') }); toast('Visit recorded.'); reopen(s); } }], { onOpen: () => $('vdOut').focus() });
}
function statusDialog(s) {
  openModal('Close request · ' + s.no, `${field('Status', select('ssSt', [['resolved', 'Resolved (customer satisfied)'], ['waiting_parts', 'Waiting for parts'], ['closed', 'Closed'], ['cancelled', 'Cancelled (not needed / rejected)']], 'resolved'))}${field('Note', input('ssNote', s.resolution || '', 'placeholder="e.g. Replaced cushion under warranty" maxlength="300"'))}
    ${s.chargeable && !(s.invoiceIds || []).length ? '<div class="alert a-warn" style="margin:0">This request is chargeable but has no service invoice yet.</div>' : ''}`,
    [{ label: 'Cancel', onClick: () => reopen(s) }, { label: 'Save', cls: 'btn-ok', onClick: async () => { await L.setServiceStatus(s, val('ssSt'), val('ssNote')); toast('Saved.'); reopen(s); } }]);
}

/* ---------- parts from stock + service charges → service invoice ---------- */
function invoiceDialog(s) {
  const parts = [], charges = s.chargeable ? [{ desc: 'Service charge', amount: '' }, { desc: 'Visit charge', amount: '' }] : [{ desc: 'Service charge', amount: '' }];
  const free = s.warranty === 'in' && !s.chargeable;
  const total = () => r2(parts.reduce((x, l) => x + num(l.qty) * num(l.rate), 0) + charges.reduce((x, c) => x + num(c.amount), 0));
  const draw = () => {
    $('siParts').innerHTML = parts.length ? `<div class="tw"><table><thead><tr><th>Part / component (from stock)</th><th class="num">Qty</th><th class="num">Rate</th><th></th></tr></thead><tbody>${parts.map((l, i) => { const it = byId('items', l.itemId); return `<tr><td><b>${esc(l.name)}</b><div class="muted mono" style="font-size:11px">${esc(l.sku || '')}${it ? ' · stock ' + num(it.onHand) : ''}</div></td><td><input class="inp inp-sm num" type="number" min="1" step="1" data-pq="${i}" value="${l.qty}" style="width:70px"></td><td><input class="inp inp-sm num" type="number" min="0" step=".01" data-pr="${i}" value="${l.rate}" style="width:110px"></td><td><button class="icon-btn" type="button" data-prm="${i}">✕</button></td></tr>`; }).join('')}</tbody></table></div>` : '<p class="hint" style="margin:0">No parts. Search above to add a component or replacement product from stock.</p>';
    $('siCh').innerHTML = charges.map((c, i) => `<div class="toolbar" style="margin-bottom:6px"><input class="inp" style="flex:1" data-cd="${i}" value="${esc(c.desc)}" placeholder="e.g. Labour / service charge" maxlength="120"><input class="inp num" type="number" min="0" step=".01" data-ca="${i}" value="${c.amount}" placeholder="0.00" style="width:120px"><button class="icon-btn" type="button" data-crm="${i}">✕</button></div>`).join('');
    sum();
  };
  let taxUpd = () => {};
  const sum = () => { const t = total(); $('siTax').style.display = t > 0 ? '' : 'none'; taxUpd(); $('siTot').innerHTML = t === 0 ? 'Total to charge the customer: <b>' + money(0) + '</b> — nothing to pay (parts given free under warranty).' : ''; };
  openModal('Parts & service invoice · ' + s.no, `${free ? '<div class="alert a-ok" style="margin-bottom:10px">In warranty and not chargeable: parts are added at rate 0 (free). Their cost goes to “Warranty &amp; Service Cost”.</div>' : ''}
    <div class="field"><label>Parts / components used (stock goes down)</label><div class="picker" style="margin-bottom:8px"><input class="inp" id="siSearch" placeholder="Scan barcode or type item name / SKU…" autocomplete="off"><div class="dropdown" id="siDd"></div></div><div id="siParts"></div></div>
    <div class="field"><label>Service charges (no stock)</label><div id="siCh"></div><button class="btn btn-sm" type="button" id="siAddC">＋ Add charge</button></div>
    <div class="row2">${field('Invoice date', input('siDate', today(), 'type="date"'))}${field('Note on the invoice (optional)', input('siNote', '', 'maxlength="200"'))}</div>
    ${taxBox('siTax', { ...L.taxDefaults(), type: L.customerTaxType(s.customerId) })}
    <p id="siTot" style="margin:6px 0 0"></p>`,
    [{ label: 'Cancel', onClick: () => reopen(s) }, { label: 'Save invoice', cls: 'btn-ok', onClick: async () => {
      const id = await L.createServiceInvoice(byId('services', s.id) || s, { date: val('siDate'), parts, charges, note: val('siNote'), tax: readTax('siTax') });
      const inv = byId('invoices', id); toast(inv && inv.total > 0 ? `Service invoice ${inv.no} saved — ${money(inv.total)} added to the customer’s balance.` : 'Parts recorded (free under warranty).'); setTimeout(() => { const i = byId('invoices', id); if (i) openInvoice(i); }, 300);
    } }],
    { wide: true, onOpen: b => {
      const dd = $('siDd'), srch = $('siSearch');
      const add = it => { const ex = parts.find(p => p.itemId === it.id); if (ex) ex.qty = num(ex.qty) + 1; else parts.push({ itemId: it.id, sku: it.sku, name: it.name, qty: 1, rate: free ? 0 : r2(it.mrp) }); srch.value = ''; dd.classList.remove('open'); draw(); };
      srch.addEventListener('input', () => { const q = srch.value.trim(), w = words(q), hits = q ? all('items').filter(i => i.sku.toLowerCase() === q.toLowerCase() || hit(i.name + ' ' + i.sku + ' ' + i.category, w)).slice(0, 10) : [];
        dd.innerHTML = hits.map(i => `<div class="dd" data-it="${i.id}"><span><b>${esc(i.name)}</b><div class="muted" style="font-size:12px">${esc(i.sku)} · stock ${num(i.onHand)} · ${money(i.mrp)}</div></span></div>`).join(''); dd.classList.toggle('open', hits.length > 0); });
      srch.addEventListener('keydown', e => { if (e.key !== 'Enter') return; e.preventDefault(); const ex = all('items').filter(i => i.sku.toLowerCase() === srch.value.trim().toLowerCase()); if (ex.length === 1) add(ex[0]); });
      dd.addEventListener('mousedown', e => { const r = e.target.closest('[data-it]'); if (!r) return; e.preventDefault(); add(byId('items', r.dataset.it)); });
      srch.addEventListener('blur', () => setTimeout(() => dd.classList.remove('open'), 150));
      b.addEventListener('input', e => { const t = e.target.dataset; if (t.pq) parts[+t.pq].qty = num(e.target.value); if (t.pr) parts[+t.pr].rate = num(e.target.value); if (t.cd) charges[+t.cd].desc = e.target.value; if (t.ca) charges[+t.ca].amount = e.target.value; sum(); });
      b.addEventListener('click', e => { const p = e.target.closest('[data-prm]'); if (p) { parts.splice(+p.dataset.prm, 1); draw(); } const c = e.target.closest('[data-crm]'); if (c) { charges.splice(+c.dataset.crm, 1); draw(); } if (e.target.id === 'siAddC') { charges.push({ desc: '', amount: '' }); draw(); } });
      taxUpd = bindTaxBox('siTax', total);
      draw();
    } });
}

/* ---------- job card (PDF): complaint, visits, parts, signatures ---------- */
export function jobCardPdf(s) {
  const co = company(), lg = shopLogo(), D = d => fmtDate(d, { day: 'numeric', month: 'short', year: 'numeric' });
  const invs = (s.invoiceIds || []).map(id => byId('invoices', id)).filter(Boolean), lines = invs.flatMap(i => i.lines.map(l => ({ ...l, inv: i.no })));
  const html = `<!doctype html><html><head><meta charset="utf-8"><title>${esc(s.no)}</title><style>*{box-sizing:border-box}body{margin:0;background:#fff;font:10pt/1.45 Arial,Helvetica,sans-serif;color:#1b1b1b}
.jc{width:190mm;padding:2mm 0}.hd{display:flex;justify-content:space-between;align-items:flex-start;gap:6mm;border-bottom:.7mm solid #5b2d14;padding-bottom:3mm;margin-bottom:5mm}.hd img{height:16mm;width:auto;max-width:45mm;object-fit:contain;margin-right:3mm}.co{display:flex;align-items:center}
h1{margin:0;font:700 15pt Georgia,serif;color:#4a2511}h2{margin:0;font:700 15pt Georgia,serif;color:#4a2511;text-align:right}.meta{text-align:right;font-size:9pt;color:#444;line-height:1.6}
.box{display:grid;grid-template-columns:1fr 1fr;gap:5mm;margin-bottom:4mm}.box div{border:.3mm solid #dcc4a0;border-radius:2mm;padding:3mm;background:#fffaf1}.box span,.lbl{display:block;font-size:7.5pt;text-transform:uppercase;letter-spacing:.06em;color:#7a604b;margin-bottom:1mm}
.blk{border:.3mm solid #dcc4a0;border-radius:2mm;padding:3mm;margin-bottom:4mm}table{width:100%;border-collapse:collapse;margin-bottom:4mm}th{background:#f3e3c7;color:#4a2511;text-align:left;font-size:8pt;text-transform:uppercase;letter-spacing:.04em;padding:1.8mm 2mm}td{padding:1.8mm 2mm;border-bottom:.2mm solid #eadcc4;vertical-align:top}.n{text-align:right;white-space:nowrap}
.sig{display:grid;grid-template-columns:1fr 1fr;gap:20mm;margin-top:18mm}.sig div{border-top:.3mm solid #555;padding-top:1.5mm;font-size:8.5pt;color:#555;text-align:center}</style></head><body><div class="jc">
<div class="hd"><div class="co">${lg ? `<img src="${esc(lg)}" alt="">` : ''}<div><h1>${esc(co.name || setting('name', ''))}</h1><div style="color:#666;font-size:8.5pt">${esc(co.address || '').replace(/\n/g, ', ')}${co.phone || co.mobile ? '<br>' + esc(co.phone || co.mobile) : ''}</div></div></div>
<div><h2>SERVICE JOB CARD</h2><div class="meta"><b>${esc(s.no)}</b><br>Registered ${esc(D(s.date))}<br>${esc(L.SVC_TYPES[s.type] || '')} · ${esc(L.SVC_STATUS[s.status] || '')}</div></div></div>
<div class="box"><div><span>Customer</span><b>${esc(s.customerName)}</b><br>${esc(s.mobile || '')}${s.address ? '<br>' + esc(s.address) : ''}</div><div><span>Product</span><b>${esc(s.product)}</b>${s.invoiceNo ? '<br>Invoice ' + esc(s.invoiceNo) : ''}${s.purchaseDate ? '<br>Bought ' + esc(D(s.purchaseDate)) : ''}<br>${s.warranty === 'in' ? 'In warranty' : s.warranty === 'out' ? 'Out of warranty' : 'Warranty n/a'}${s.chargeable ? ' · chargeable' : ''}</div></div>
<div class="blk"><span class="lbl">Complaint</span>${esc(s.complaint)}</div>
${(s.visits || []).length ? `<table><thead><tr><th>Visit</th><th>Staff</th><th>Work done</th></tr></thead><tbody>${[...s.visits].sort((a, b) => (a.date + (a.time || '')).localeCompare(b.date + (b.time || ''))).map(v => `<tr><td class="n" style="text-align:left">${esc(D(v.date))}${v.time ? ' ' + esc(v.time) : ''}</td><td>${esc(L.nm(v.assignedTo))}</td><td>${esc(v.outcome || (v.status === 'scheduled' ? 'Planned' : v.status))}</td></tr>`).join('')}</tbody></table>` : ''}
${lines.length ? `<table><thead><tr><th>Parts / charges</th><th class="n">Qty</th><th class="n">Rate</th><th class="n">Amount</th></tr></thead><tbody>${lines.map(l => `<tr><td>${esc(l.name)}${l.free ? ' (warranty, free)' : ''}</td><td class="n">${esc(l.qty)}</td><td class="n">${esc(money(l.rate))}</td><td class="n">${esc(money(num(l.qty) * num(l.rate)))}</td></tr>`).join('')}</tbody>${invs.some(i => i.tax) || invs.length > 1 ? `<tfoot>${invs.map(i => `<tr><td colspan="3" class="n">${esc(i.no)}${i.tax ? ` · ${i.tax.type === 'inter' ? 'IGST ' + i.tax.rate + '% ' + esc(money(i.tax.igst)) : 'CGST ' + esc(money(i.tax.cgst)) + ' + SGST ' + esc(money(i.tax.sgst))}${i.tax.mode === 'inclusive' ? ' (included)' : ''}` : ''} · total</td><td class="n"><b>${esc(money(i.total))}</b></td></tr>`).join('')}</tfoot>` : ''}</table>` : ''}
<div class="blk" style="min-height:18mm"><span class="lbl">Resolution / remarks</span>${esc(s.resolution || '')}</div>
<div class="sig"><div>Service staff</div><div>Customer — work completed to my satisfaction</div></div></div></body></html>`;
  return savePdf(html, 'Service_' + s.no, '.jc', { fit: 'A4', margin: 10, width: 900 });
}

/* ---------- panels for the Dashboard and Tasks ---------- */
export function servicePanel() {
  const t = today(), vs = L.serviceVisits().filter(({ s, v }) => v.status === 'scheduled' && L.SVC_OPEN.includes(s.status));
  const tod = vs.filter(x => x.v.date === t).sort((a, b) => (a.v.time || '').localeCompare(b.v.time || '')), late = vs.filter(x => x.v.date < t);
  const open = all('services').filter(s => L.SVC_OPEN.includes(s.status)), unpl = open.filter(s => !L.nextVisit(s) && s.status !== 'waiting_parts');
  if (!open.length && !tod.length) return '';
  return `<div class="panel" style="margin-bottom:16px"><div class="panel-h"><h2>🛠 After-sales service</h2><a class="btn btn-sm" href="#/service">Open</a></div>
    <div class="grid g3" style="gap:10px;margin-bottom:10px"><div class="kpi"><span>Open complaints</span><b>${open.length}</b></div><div class="kpi"><span>Visits today</span><b>${tod.length}</b></div><div class="kpi"><span>Overdue / not planned</span><b style="color:${late.length + unpl.length ? 'var(--danger)' : 'inherit'}">${late.length} / ${unpl.length}</b></div></div>
    ${tod.length || late.length ? `<div class="list">${[...late, ...tod].slice(0, 8).map(({ s, v }) => `<div class="list-item click" data-svcopen="${s.id}" style="padding:8px 10px;cursor:pointer"><span><b>${v.date < t ? '<span style="color:var(--danger)">Overdue</span> · ' : ''}${esc(v.time || '')}</b> ${esc(s.customerName)} · ${esc(s.product)}<div class="hint">${esc(s.no)} · ${esc(L.nm(v.assignedTo))}</div></span>${stSvc(s.status)}</div>`).join('')}</div>` : '<p class="hint" style="margin:0">No visits today.</p>'}</div>`;
}
export function serviceTasksPanel() {
  const t = today(), all1 = L.can.manage(role());
  const vs = L.serviceVisits().filter(({ s, v }) => v.status === 'scheduled' && L.SVC_OPEN.includes(s.status) && (all1 || v.assignedTo === myId())).sort((a, b) => (a.v.date + (a.v.time || '')).localeCompare(b.v.date + (b.v.time || '')));
  if (!vs.length) return '';
  return `<div class="panel" style="margin-top:14px"><div class="panel-h"><h2>🛠 ${all1 ? 'Service visits' : 'My service visits'}</h2><a class="btn btn-sm" href="#/service">All service</a></div>
    <div class="list">${vs.slice(0, 15).map(({ s, v }) => `<div class="list-item click" data-svcopen="${s.id}" style="padding:8px 10px;cursor:pointer"><span><b${v.date < t ? ' style="color:var(--danger)"' : ''}>${when(v)}</b> · ${esc(s.customerName)}${s.mobile ? ' · ' + esc(s.mobile) : ''}<div class="hint">${esc(s.no)} · ${esc(s.product)} — ${esc(s.complaint.slice(0, 80))}${all1 ? ' · ' + esc(L.nm(v.assignedTo)) : ''}</div></span>${stSvc(s.status)}</div>`).join('')}</div></div>`;
}

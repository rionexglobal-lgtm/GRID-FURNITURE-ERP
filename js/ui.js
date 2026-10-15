// GRID Shop Manager — shared UI pieces: modal, toast, money, tables, line editor, pickers, printing, chart
import { $, esc, num, r2, today, fmtDate, store, all, byId, setting } from './core.js';
import { lineTotal, docTotals, normMobile, saveItem, nextSku, can, SRC, journalFor, accName, may, calcTax, taxDefaults, GST_RATES, CHARGE_TYPES } from './logic.js';
// perm: 'module:add|edit|delete' — hides a button the person's role isn't allowed to use
export const mayDo = perm => { const [m, a] = String(perm).split(':'); return may(m, a); };

export const money = (n, dec = 2) => (setting('currency', '₹') || '') + ' ' + Number(num(n)).toLocaleString('en-IN', { minimumFractionDigits: 0, maximumFractionDigits: dec });
export const money0 = n => money(n, 0);
export const pill = (s, label) => `<span class="pill p-${esc(s)}">${esc(label || s)}</span>`;
export const STATUS = { open: 'Open', followup: 'Follow-up', confirmed: 'Sent to billing', converted: 'Converted', lost: 'Lost', scheduled: 'Scheduled', delivered: 'Delivered', cancelled: 'Cancelled', unpaid: 'Unpaid', partial: 'Part paid', paid: 'Paid', void: 'Void', done: 'Done' };
export const st = s => pill(s, STATUS[s] || s);
export const searchBox = (id, ph) => `<div class="search"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg><input id="${id}" placeholder="${esc(ph)}" autocomplete="off"></div>`;
export const empty = (icon, text) => `<div class="empty"><div class="big">${icon}</div>${text}</div>`;
export const words = q => String(q || '').toLowerCase().split(/\s+/).filter(Boolean);
export const hit = (text, w) => { const t = String(text).toLowerCase(); return w.every(x => t.includes(x)); };

/* ---------- toast & modal ---------- */
export function toast(msg, kind = '') {
  const box = $('toasts'); while (box.children.length >= 3) box.firstElementChild.remove();
  const t = document.createElement('div'); t.className = 'toast ' + kind; t.textContent = msg; box.appendChild(t);
  setTimeout(() => { t.style.transition = 'opacity .3s'; t.style.opacity = '0'; }, kind === 'err' ? 5000 : 3000); setTimeout(() => t.remove(), kind === 'err' ? 5400 : 3400);
}
export const fail = e => { console.error(e); toast((e && e.code === 'permission-denied') ? 'You do not have permission to do that.' : (e && e.message) || String(e), 'err'); };
let modalStack = 0;
export function openModal(title, html, actions = [], { wide = false, onOpen } = {}) {
  { const ob = $('modalBody'), nb = ob.cloneNode(false); ob.replaceWith(nb); } // fresh element: drops listeners left by earlier dialogs
  $('modalTitle').textContent = title; $('modalBody').innerHTML = html; $('modal').classList.toggle('wide', wide);
  const f = $('modalFoot'); f.innerHTML = ''; f.style.display = actions.length ? '' : 'none';
  actions.forEach(a => {
    if (a.perm && !mayDo(a.perm)) return;
    if (a.href) { const l = document.createElement('a'); l.className = 'btn ' + (a.cls || ''); l.textContent = a.label; l.href = a.href; l.target = '_blank'; l.rel = 'noopener'; f.appendChild(l); return; }
    const b = document.createElement('button'); b.className = 'btn ' + (a.cls || ''); b.textContent = a.label;
    b.onclick = async () => {
      if (!a.onClick) return closeModal();
      b.disabled = true;
      try { const r = await a.onClick(); if (r !== false) closeModal(); } catch (e) { fail(e); } finally { b.disabled = false; }
    };
    f.appendChild(b);
  });
  $('modalBg').classList.add('open'); modalStack++;
  const first = $('modalBody').querySelector('input:not([type=checkbox]):not([readonly]),select,textarea'); if (first && matchMedia('(pointer:fine)').matches) setTimeout(() => first.focus(), 40);
  onOpen && onOpen($('modalBody'));
}
export function closeModal() { $('modalBg').classList.remove('open'); $('modalBody').innerHTML = ''; }
$('modalX').onclick = closeModal;
$('modalBg').addEventListener('mousedown', e => { if (e.target === $('modalBg')) closeModal(); });
document.addEventListener('keydown', e => { if (e.key === 'Escape' && $('modalBg').classList.contains('open')) closeModal(); });
export const modalOpen = () => $('modalBg').classList.contains('open');
export const confirmBox = (title, msg, ok = 'OK', danger = false) => new Promise(res => openModal(title, `<p style="margin:0;line-height:1.55">${msg}</p>`, [{ label: 'Cancel', onClick: () => res(false) }, { label: ok, cls: danger ? 'btn-danger' : 'btn-ink', onClick: () => res(true) }]));
export const val = id => { const el = document.getElementById(id); return el ? el.value.trim() : ''; };

/* ---------- form helpers ---------- */
export const field = (label, inner, cls = '') => `<div class="field ${cls}"><label>${esc(label)}</label>${inner}</div>`;
export const input = (id, v = '', attrs = '') => `<input id="${id}" value="${esc(v)}" ${attrs}>`;
/* ---------- GST box used on invoices: on/off, rate, inclusive/exclusive, CGST+SGST or IGST, live summary ---------- */
export const taxBox = (id, t, what = 'invoice') => `<div class="panel" id="${id}" style="box-shadow:none;padding:10px 12px;margin:4px 0 10px">
  <label style="display:flex;gap:8px;align-items:center;cursor:pointer;margin-bottom:6px"><input type="checkbox" id="${id}On"${t.on ? ' checked' : ''} style="width:auto;height:auto;flex:none;margin:0"> <b>${esc(t.name || 'GST')}</b> <span class="hint">(tax on this ${what})</span></label>
  <div class="row3" id="${id}F"${t.on ? '' : ' style="display:none"'}>${field('Rate %', `<input id="${id}Rate" class="num" type="number" min="0" max="100" step=".01" inputmode="decimal" list="${id}Rl" value="${esc(t.rate)}"><datalist id="${id}Rl">${GST_RATES.map(r => `<option value="${r}">`).join('')}</datalist>`)}
    ${field('Prices are', select(id + 'Mode', [['exclusive', 'Exclusive — add GST'], ['inclusive', 'Inclusive of GST']], t.mode))}${field('Place of supply', select(id + 'Type', [['intra', 'Within state — CGST + SGST'], ['inter', 'Other state — IGST']], t.type))}</div>
  <div id="${id}Sum" style="font-size:13px;line-height:1.6"></div></div>`;
export const readTax = id => ({ on: $(id + 'On').checked, rate: num($(id + 'Rate').value), mode: $(id + 'Mode').value, type: $(id + 'Type').value, name: taxDefaults().name });
// lines for screens and WhatsApp: [label, amount]
export function taxRowsOf(tx) {
  if (!tx) return []; const h = r2(tx.rate / 2);
  return [['Taxable value', tx.taxable], ...(tx.type === 'inter' ? [[`IGST @ ${tx.rate}%`, tx.igst]] : [[`CGST @ ${h}%`, tx.cgst], [`SGST @ ${h}%`, tx.sgst]])];
}
// keeps the summary under the box up to date; onTotal gets the invoice total (with tax)
export function bindTaxBox(id, getNet, onTotal, word = 'Invoice') {
  const box = $(id); if (!box) return () => {};
  const upd = () => { const t = readTax(id); $(id + 'F').style.display = t.on ? '' : 'none'; const net = r2(getNet()), tx = calcTax(net, t);
    $(id + 'Sum').innerHTML = tx ? `${taxRowsOf(tx).map(([a, b]) => `${esc(a)} <b>${money(b)}</b>`).join(' · ')}<br>${word} total <b style="font-size:15px">${money(tx.total)}</b>${tx.mode === 'inclusive' ? ' <span class="hint">(GST included in the prices)</span>' : ` <span class="hint">(${money(net)} + GST ${money(tx.tax)})</span>`}` : `No GST · ${word.toLowerCase()} total <b>${money(net)}</b>`;
    if (onTotal) onTotal(tx ? tx.total : net); };
  box.addEventListener('input', upd); box.addEventListener('change', upd); upd(); return upd;
}
export const select = (id, opts, v = '') => `<select id="${id}">${opts.map(o => { const [k, l] = Array.isArray(o) ? o : [o, o]; return `<option value="${esc(k)}"${String(k) === String(v) ? ' selected' : ''}>${esc(l)}</option>`; }).join('')}</select>`;
export const accountOptions = (filter) => all('accounts').filter(filter).sort((a, b) => a.code.localeCompare(b.code)).map(a => [a.id, a.code + ' · ' + a.name]);
export const userOptions = (roles) => all('users').filter(u => u.active !== false && (!roles || roles.includes(u.role))).sort((a, b) => a.name.localeCompare(b.name)).map(u => [u.id, u.name]);

/* ---------- customer / supplier picker ---------- */
// renders a picker; returns getter for chosen id. New parties can be added inline.
export function partyPicker(host, kind, initialId, onPick) {
  const coll = kind === 'supplier' ? 'suppliers' : 'customers';
  let chosen = initialId ? byId(coll, initialId) : null;
  host.innerHTML = `<div class="picker"><input class="inp" placeholder="${kind === 'supplier' ? 'Search supplier name or mobile…' : 'Customer mobile number or name…'}" autocomplete="off" inputmode="${kind === 'supplier' ? 'text' : 'search'}"><div class="dropdown"></div></div><div class="pp-chosen" style="margin-top:6px"></div>`;
  const inp = host.querySelector('input'), dd = host.querySelector('.dropdown'), ch = host.querySelector('.pp-chosen');
  const show = () => { ch.innerHTML = chosen ? `<div class="alert a-ok" style="margin:0;display:flex;justify-content:space-between;gap:8px;align-items:center"><span><b>${esc(chosen.name)}</b>${chosen.mobile ? ' · ' + esc(chosen.mobile) : ' · <span class="muted">no mobile</span>'}${chosen.area ? ' · ' + esc(chosen.area) : ''}</span><span style="display:flex;gap:6px;flex:none">${may(kind === 'supplier' ? 'suppliers' : 'customers', 'edit') ? '<button class="btn btn-sm pp-edit" type="button">✎ Edit</button>' : ''}<button class="btn btn-sm pp-change" type="button">Change</button></span></div>` : ''; inp.parentElement.style.display = chosen ? 'none' : '';
    const b = ch.querySelector('.pp-change'); if (b) b.onclick = () => { host.querySelector('.pp-new')?.remove(); chosen = null; show(); inp.focus(); onPick && onPick(null); };
    const e = ch.querySelector('.pp-edit'); if (e) e.onclick = editChosen; };
  // edit the chosen customer / supplier right here, without leaving the form
  const editChosen = () => {
    const c = chosen && byId(coll, chosen.id); if (!c) return; host.querySelector('.pp-new')?.remove();
    const box = document.createElement('div'); box.className = 'pp-new panel'; box.style.cssText = 'margin-top:8px;padding:12px;box-shadow:none;background:var(--panel-2)';
    box.innerHTML = `<div style="font-weight:700;margin-bottom:8px">Edit ${kind}</div><div class="row2"><div class="field"><label>Name</label><input class="pn" value="${esc(c.name || '')}"></div><div class="field"><label>Mobile (optional)</label><input class="pm" inputmode="tel" value="${esc(c.mobile || '')}"></div></div>
      <div class="row2"><div class="field"><label>Area / location</label><input class="pa" value="${esc(c.area || '')}"></div><div class="field"><label>GSTIN (optional)</label><input class="pg" maxlength="15" style="text-transform:uppercase" value="${esc(c.gstin || '')}"></div></div>
      <div class="field"><label>Address</label><textarea class="pad" rows="2">${esc(c.address || '')}</textarea></div>
      <div style="display:flex;gap:6px"><button class="btn btn-ink btn-sm pp-save" type="button">Save changes</button><button class="btn btn-sm pp-cancel" type="button">Cancel</button></div>`;
    host.appendChild(box); box.querySelector('.pn').focus();
    box.querySelector('.pp-cancel').onclick = () => box.remove();
    box.querySelector('.pp-save').onclick = async () => {
      try {
        const { saveParty } = await import('./logic.js'), v = cl => box.querySelector(cl).value;
        await saveParty(kind, { ...c, id: c.id, name: v('.pn'), mobile: v('.pm'), area: v('.pa'), address: v('.pad'), gstin: v('.pg') });
        chosen = byId(coll, c.id) || chosen; box.remove(); show(); onPick && onPick(chosen); toast(`${kind === 'supplier' ? 'Supplier' : 'Customer'} updated.`);
      } catch (er) { fail(er); }
    };
  };
  const render = () => {
    const q = inp.value.trim(); if (!q) { dd.classList.remove('open'); return; }
    const w = words(q), qm = normMobile(q).replace(/\D/g, '');
    const list = all(coll).filter(p => hit(p.name + ' ' + (p.mobile || '') + ' ' + (p.area || ''), w) || (qm.length >= 3 && (p.mobile || '').replace(/\D/g, '').includes(qm))).slice(0, 8);
    dd.innerHTML = list.map(p => `<div class="dd" data-id="${p.id}"><span><b>${esc(p.name)}</b> <span class="muted">${esc(p.mobile || '')}</span></span><span class="muted">${esc(p.area || '')}</span></div>`).join('') + `<div class="dd" data-new="1"><b style="color:var(--accent-2)">＋ New ${kind}${/^\+?\d[\d\s-]{5,}$/.test(q) ? ' with mobile ' + esc(q) : ': ' + esc(q)}</b></div>`;
    dd.classList.add('open');
  };
  inp.addEventListener('input', render); inp.addEventListener('focus', render);
  dd.addEventListener('mousedown', e => e.preventDefault());
  dd.addEventListener('click', e => {
    const d = e.target.closest('.dd'); if (!d) return;
    if (d.dataset.id) { chosen = byId(coll, d.dataset.id); dd.classList.remove('open'); show(); onPick && onPick(chosen); return; }
    const q = inp.value.trim(), isNum = /^\+?\d[\d\s-]{5,}$/.test(q);
    host.querySelector('.pp-new')?.remove();
    const box = document.createElement('div'); box.className = 'pp-new panel'; box.style.cssText = 'margin-top:8px;padding:12px;box-shadow:none;background:var(--panel-2)';
    box.innerHTML = `<div class="row2"><div class="field"><label>Name</label><input class="pn" value="${isNum ? '' : esc(q)}"></div><div class="field"><label>Mobile (optional)</label><input class="pm" inputmode="tel" value="${isNum ? esc(q) : ''}"></div></div><div class="row2"><div class="field"><label>Area / location</label><input class="pa"></div><div class="field"><label>${kind === 'supplier' ? 'Contact person' : 'Source'}</label>${kind === 'supplier' ? '<input class="pc">' : '<select class="ps"><option>Walk-in</option><option>Phone call</option><option>Referral</option><option>Instagram / Facebook</option><option>WhatsApp</option><option>Repeat customer</option><option>Other</option></select>'}</div></div><button class="btn btn-ink btn-sm" type="button">Save ${kind}</button>`;
    host.appendChild(box); dd.classList.remove('open'); box.querySelector(isNum ? '.pn' : '.pm').focus();
    box.querySelector('button').onclick = async () => {
      try {
        const { saveParty } = await import('./logic.js');
        const id = await saveParty(kind, { name: box.querySelector('.pn').value, mobile: box.querySelector('.pm').value, area: box.querySelector('.pa').value, source: box.querySelector('.ps')?.value, contact: box.querySelector('.pc')?.value });
        chosen = byId(coll, id) || { id, name: box.querySelector('.pn').value, mobile: normMobile(box.querySelector('.pm').value) };
        box.remove(); inp.value = ''; show(); onPick && onPick(chosen); toast(`${kind === 'supplier' ? 'Supplier' : 'Customer'} saved.`);
      } catch (e) { fail(e); }
    };
  });
  document.addEventListener('click', e => { if (!host.contains(e.target)) dd.classList.remove('open'); });
  show();
  return () => chosen ? chosen.id : '';
}

/* ---------- line editor (quotation / order / purchase) ---------- */
export function lineEditor(host, { lines = [], discount = 0, charges = [], mode = 'sale', showStock = true, tax = null, taxId = 'leTax' }) {
  const L = lines.map(l => ({ ...l })), C = (charges || []).map(c => ({ ...c }));
  let disc = num(discount);
  const priceKey = mode === 'purchase' ? 'cost' : 'mrp';
  const office = can.office(store.me?.role);
  const sale = mode !== 'purchase';
  const committed = showStock ? (window.__committed ? window.__committed() : {}) : {};
  host.innerHTML = `<div class="picker" style="margin-bottom:10px"><input class="inp li-search" placeholder="Scan barcode or type item name / SKU…" autocomplete="off" enterkeyhint="go"><div class="dropdown"></div></div><div class="ni-form" hidden></div>
    <div class="tw"><table class="le-table"><thead><tr><th>Item</th><th class="num">Qty</th><th class="num">${mode === 'purchase' ? 'Cost' : 'Rate'}</th>${mode === 'purchase' ? '' : '<th class="num hide-m">Disc.</th>'}<th class="num hide-m">Amount</th><th></th></tr></thead><tbody></tbody></table></div>
    <div class="totals"></div>${tax && mode !== 'purchase' ? `<div style="display:flex;justify-content:flex-end"><div style="width:min(100%,560px)">${taxBox(taxId, tax, 'order')}</div></div>` : ''}`;
  const inp = host.querySelector('.li-search'), dd = host.querySelector('.dropdown'), tb = host.querySelector('tbody'), tot = host.querySelector('.totals');
  const stockTxt = it => { if (!it || !showStock) return ''; const c = committed[it.id] || 0, av = num(it.onHand) - c; return `<span class="${av <= 0 ? 'p-unpaid pill' : 'muted'}" style="font-size:11px">Stock ${num(it.onHand)} · free ${av}</span>`; };
  const draw = () => {
    tb.innerHTML = L.length ? L.map((l, i) => `<tr data-i="${i}"><td style="min-width:${sale ? 210 : 150}px"><b style="font-size:13px">${esc(l.name)}</b><div class="muted mono" style="font-size:11px">${esc(l.sku || '')} ${l.itemId ? stockTxt(byId('items', l.itemId)) : l.newItem ? `<span class="pill p-confirmed" title="Billing adds this to the item list when the sales order is made">New item</span>` : ''}</div>
      ${sale ? `<div class="le-x"><input class="inp inp-sm ds" placeholder="Colour / material / size…" value="${esc(l.desc || '')}" maxlength="160"><select class="inp inp-sm src src-${l.src || 'stock'}" title="How this item will be supplied">${Object.entries(SRC).map(([k, v]) => `<option value="${k}"${k === (l.src || 'stock') ? ' selected' : ''}>${v}</option>`).join('')}</select></div>
      ${l.src === 'custom' ? `<textarea class="inp inp-sm sp" rows="2" placeholder="Full customisation details: size, fabric / wood, colour code, finish, design changes, reference photo…" style="margin-top:5px;width:100%">${esc(l.spec || '')}</textarea>` : ''}` : ''}</td>
      <td><input class="q num" type="number" min="0" step="1" inputmode="decimal" value="${l.qty}"></td><td><input class="r num" type="number" min="0" step=".01" inputmode="decimal" value="${l.rate}"></td>
      ${mode === 'purchase' ? '' : `<td class="hide-m"><input class="d num" type="number" min="0" step=".01" inputmode="decimal" value="${l.disc || 0}"></td>`}
      <td class="num nowrap amt hide-m">${money(mode === 'purchase' ? num(l.qty) * num(l.rate) : lineTotal(l))}</td><td><button class="icon-btn" type="button" data-del="${i}">✕</button></td></tr>`).join('')
      : `<tr><td colspan="6" class="muted" style="text-align:center;padding:18px">No items yet — search above.</td></tr>`;
    drawTot();
  };
  const drawTot = () => {
    if (mode === 'purchase') { const t = r2(L.reduce((s, l) => s + num(l.qty) * num(l.rate), 0)); tot.innerHTML = `<span>Items total</span><b>${money(t)}</b>`; return; }
    const t = docTotals(L, disc, C.filter(c => num(c.amount) > 0));
    tot.innerHTML = `<span>Subtotal</span><b>${money(t.subtotal)}</b><span>Extra discount</span><b><input class="inp inp-sm num le-disc" type="number" min="0" step=".01" value="${disc}" style="width:110px"></b>
      ${C.map((c, i) => `<span class="le-chl" style="display:flex;gap:6px;align-items:center;justify-content:flex-end"><select class="inp inp-sm le-ct" data-ci="${i}" style="width:auto">${Object.entries(CHARGE_TYPES).map(([k, v]) => `<option value="${k}"${k === c.type ? ' selected' : ''}>${esc(v)}</option>`).join('')}</select>${c.type === 'other' ? `<input class="inp inp-sm le-cn" data-ci="${i}" value="${esc(c.name === CHARGE_TYPES.other ? '' : c.name || '')}" placeholder="What for? (optional)" maxlength="60" style="width:150px">` : ''}</span>
        <b style="display:flex;gap:4px;align-items:center;justify-content:flex-end"><input class="inp inp-sm num le-ca" data-ci="${i}" type="number" min="0" step=".01" inputmode="decimal" value="${c.amount === '' ? '' : num(c.amount)}" placeholder="0.00" style="width:110px"><button class="icon-btn" type="button" data-cdel="${i}" title="Remove this charge" style="margin:0">✕</button></b>`).join('')}
      <span><button class="btn btn-sm le-cadd" type="button">＋ Delivery / other charges</button></span><b></b>
      <span style="font-size:16px;font-weight:800">Total${tax ? ' <span class="muted le-tl" style="font-size:12px;font-weight:600"></span>' : ''}</span><b style="font-size:16px" class="le-total">${money(t.total)}</b>`;
    if (taxUpd) taxUpd();
  };
  const netNow = () => docTotals(L, disc, C.filter(c => num(c.amount) > 0)).total;
  let taxUpd = null; // with a GST box the Total line shows the amount including GST
  const sumTot = () => { const el = tot.querySelector('.le-total'); if (!el) return; if (taxUpd) taxUpd(); else el.textContent = money(netNow()); };
  if (sale) {
    tot.addEventListener('input', e => { const i = e.target.dataset.ci;
      if (e.target.classList.contains('le-disc')) disc = num(e.target.value);
      if (e.target.classList.contains('le-ca')) C[+i].amount = e.target.value;
      if (e.target.classList.contains('le-cn')) C[+i].name = e.target.value;
      sumTot(); });
    tot.addEventListener('change', e => { if (!e.target.classList.contains('le-ct')) return; const c = C[+e.target.dataset.ci]; c.type = e.target.value; c.name = CHARGE_TYPES[c.type]; drawTot(); });
    tot.addEventListener('click', e => {
      if (e.target.closest('.le-cadd')) { const used = new Set(C.map(c => c.type)), type = ['delivery', 'processing', 'other'].find(k => !used.has(k)) || 'other'; C.push({ type, name: CHARGE_TYPES[type], amount: '' }); drawTot(); const a = tot.querySelectorAll('.le-ca'); if (a.length) a[a.length - 1].focus(); }
      const d = e.target.closest('[data-cdel]'); if (d) { C.splice(+d.dataset.cdel, 1); drawTot(); } });
  }
  tb.addEventListener('input', e => {
    const tr = e.target.closest('tr'); if (!tr) return; const l = L[+tr.dataset.i];
    if (e.target.classList.contains('ds')) { l.desc = e.target.value; return; } if (e.target.classList.contains('sp')) { l.spec = e.target.value; return; }
    if (e.target.classList.contains('q')) l.qty = num(e.target.value); if (e.target.classList.contains('r')) l.rate = num(e.target.value); if (e.target.classList.contains('d')) l.disc = num(e.target.value);
    tr.querySelector('.amt').textContent = money(mode === 'purchase' ? num(l.qty) * num(l.rate) : lineTotal(l)); drawTot();
  });
  tb.addEventListener('change', e => { if (!e.target.classList.contains('src')) return; const l = L[+e.target.closest('tr').dataset.i]; l.src = e.target.value; draw(); if (l.src === 'custom') { const t = tb.querySelector(`tr[data-i="${L.indexOf(l)}"] .sp`); if (t) t.focus(); } });
  tb.addEventListener('click', e => { const b = e.target.closest('[data-del]'); if (b) { L.splice(+b.dataset.del, 1); draw(); } });
  const add = it => { const ex = L.find(l => l.itemId === it.id); if (ex) ex.qty = num(ex.qty) + 1; else L.push({ itemId: it.id, sku: it.sku, name: it.name, qty: 1, rate: r2(it[priceKey] || 0), disc: 0, ...(sale ? { src: num(it.onHand) - (committed[it.id] || 0) >= 1 ? 'stock' : 'order' } : {}) }); inp.value = ''; dd.classList.remove('open'); draw(); };
  const find = () => { const q = inp.value.trim(); if (!q) return []; const w = words(q); return all('items').filter(it => it.sku.toLowerCase() === q.toLowerCase() || hit(it.name + ' ' + it.sku + ' ' + it.category, w)).sort((a, b) => (b.sku.toLowerCase() === q.toLowerCase()) - (a.sku.toLowerCase() === q.toLowerCase())).slice(0, 12); };
  inp.addEventListener('input', () => {
    const r = find(); if (!inp.value.trim()) { dd.classList.remove('open'); return; }
    const q = inp.value.trim();
    dd.innerHTML = (r.length ? r.map(it => `<div class="dd" data-id="${it.id}"><span><b>${esc(it.name)}</b><br><span class="muted mono" style="font-size:11px">${esc(it.sku)} · ${esc(it.category)}</span> ${stockTxt(it)}</span><b class="nowrap">${money(it[priceKey])}</b></div>`).join('') : `<div class="dd muted">No item found.</div>`)
      + `<div class="dd dd-new" data-new="1"><span><b>＋ Add “${esc(q)}” as a new item</b><br><span class="muted" style="font-size:11px">Not in the list? Create it here${office ? '' : ' — billing adds it to stock'}</span></span></div>`;
    dd.classList.add('open');
  });
  inp.addEventListener('keydown', e => { if (e.key !== 'Enter') return; e.preventDefault(); const q = inp.value.trim(); const exact = all('items').filter(it => it.sku.toLowerCase() === q.toLowerCase()); const r = exact.length === 1 ? exact : find(); if (r.length === 1) add(r[0]); else if (!r.length && q) { toast('Not in the item list — add it as a new item.', 'warn'); newItemForm(q); } });
  dd.addEventListener('mousedown', e => e.preventDefault());
  dd.addEventListener('click', e => { if (e.target.closest('[data-new]')) return newItemForm(inp.value.trim()); const d = e.target.closest('[data-id]'); if (d) add(byId('items', d.dataset.id)); });
  // ---- create a new item without leaving the document
  const nf = host.querySelector('.ni-form');
  function newItemForm(q) {
    dd.classList.remove('open');
    const code = /^[A-Za-z0-9._\/-]+$/.test(q) && /\d/.test(q);
    const cats = [...new Set(all('items').map(i => i.category).filter(Boolean))].sort(), lid = 'nic' + Math.random().toString(36).slice(2, 8);
    const askCost = office;
    nf.hidden = false;
    nf.innerHTML = `<div class="ni-card"><div class="ni-h"><b>＋ New item</b><span class="muted">${office ? (mode === 'purchase' ? 'Added to the item list now; stock comes in with this purchase.' : 'Added to the item list now, with 0 stock.') : 'Goes on this enquiry now. Billing adds it to the item list when they make the sales order.'}</span></div>
      <div class="ni-grid"><label class="field ni-wide"><span class="ni-l">Item name</span><input class="inp ni-name" value="${esc(code ? '' : q.toUpperCase())}" placeholder="e.g. SOFA 3 SEATER GREY" autocomplete="off"></label>
      <label class="field"><span class="ni-l">Barcode / SKU</span><input class="inp mono ni-sku" value="${esc(code ? q : nextSku())}" autocomplete="off"></label>
      <label class="field"><span class="ni-l">Category</span><input class="inp ni-cat" list="${lid}" placeholder="GENERAL" autocomplete="off"><datalist id="${lid}">${cats.map(c => `<option value="${esc(c)}">`).join('')}</datalist></label>
      <label class="field"><span class="ni-l">MRP / selling price</span><input class="inp num ni-mrp" type="number" min="0" step=".01" inputmode="decimal"></label>
      ${askCost ? `<label class="field"><span class="ni-l">Cost price${mode === 'purchase' ? '' : ' (optional)'}</span><input class="inp num ni-cost" type="number" min="0" step=".01" inputmode="decimal"></label>` : ''}</div>
      <div class="ni-msg"></div><div class="ni-acts"><button type="button" class="btn btn-sm ni-cancel">Cancel</button><button type="button" class="btn btn-sm btn-ok ni-save">Add item</button></div></div>`;
    const g = c => nf.querySelector(c), msg = t => { g('.ni-msg').innerHTML = t ? `<div class="alert a-warn" style="margin:8px 0 0">${esc(t)}</div>` : ''; };
    (code ? g('.ni-name') : g('.ni-mrp')).focus();
    g('.ni-cancel').onclick = () => { nf.hidden = true; nf.innerHTML = ''; inp.focus(); };
    nf.onkeydown = e => { if (e.key === 'Enter') { e.preventDefault(); g('.ni-save').click(); } if (e.key === 'Escape') { e.stopPropagation(); g('.ni-cancel').click(); } };
    g('.ni-save').onclick = async () => {
      const name = g('.ni-name').value.trim().replace(/\s+/g, ' ').toUpperCase(), sku = g('.ni-sku').value.trim(), category = (g('.ni-cat').value.trim() || 'GENERAL').toUpperCase();
      const mrp = r2(g('.ni-mrp').value), cost = askCost ? r2(g('.ni-cost').value) : 0;
      if (!name) return msg('Enter the item name.'); if (!sku) return msg('Enter a barcode / SKU.');
      const dup = all('items').find(x => x.sku.toLowerCase() === sku.toLowerCase());
      if (dup) return msg(`Barcode ${sku} is already used by “${dup.name}”. Pick that item from the search, or use another code.`);
      if (L.some(l => !l.itemId && (l.sku || '').toLowerCase() === sku.toLowerCase())) return msg(`Barcode ${sku} is already on this list.`);
      if (mode !== 'purchase' && !(mrp > 0)) return msg('Enter the MRP / selling price.');
      if (mode === 'purchase' && !(cost > 0)) return msg('Enter the cost price.');
      if (office) {
        const b = g('.ni-save'); b.disabled = true; b.textContent = 'Saving…';
        try { const id = await saveItem({ name, sku, category, mrp, cost, onHand: 0 }); L.push({ itemId: id, sku, name, qty: 1, rate: mode === 'purchase' ? cost : mrp, disc: 0, ...(sale ? { src: 'order' } : {}) }); toast(`“${name}” added to the item list.`); }
        catch (err) { b.disabled = false; b.textContent = 'Add item'; return msg(err.message || String(err)); }
      } else L.push({ itemId: '', sku, name, qty: 1, rate: mrp, disc: 0, newItem: { category, mrp }, src: 'order' });
      nf.hidden = true; nf.innerHTML = ''; inp.value = ''; draw(); inp.focus();
    };
  }
  if (tax && sale) taxUpd = bindTaxBox(taxId, netNow, total => { const el = tot.querySelector('.le-total'); if (el) el.textContent = money(total); const tl = tot.querySelector('.le-tl'), t = readTax(taxId); if (tl) tl.textContent = t.on && num(t.rate) ? (t.mode === 'inclusive' ? '(incl. GST)' : '(with GST)') : ''; }, 'Order');
  draw();
  return { get: () => ({ lines: L.filter(l => num(l.qty) > 0).map(l => ({ ...l, qty: num(l.qty), rate: r2(l.rate), disc: r2(l.disc || 0) })), discount: r2(disc), charges: C.filter(c => num(c.amount) > 0).map(c => ({ type: c.type, name: String(c.name || '').trim() || CHARGE_TYPES[c.type], amount: r2(c.amount) })), ...(tax && sale ? { tax: readTax(taxId) } : {}) }) };
}

/* ---------- WhatsApp & phone ---------- */
export function waLink(mobile, text) {
  let d = String(mobile || '').replace(/[^\d+]/g, '');
  if (!d) return '';
  if (d.startsWith('+')) d = d.slice(1); else if (d.startsWith('0')) d = setting('countryCode', '91') + d.replace(/^0+/, ''); else if (d.length <= 10) d = setting('countryCode', '91') + d;
  return `https://wa.me/${d}?text=${encodeURIComponent(text || '')}`;
}
export const telLink = m => m ? `tel:${String(m).replace(/[^\d+]/g, '')}` : '';
export function docText(kind, d) {
  const c = setting('name', 'Our shop');
  const lines = (d.lines || []).map(l => `• ${l.name}${l.desc ? ' (' + l.desc + ')' : ''} × ${l.qty} = ${money(lineTotal(l))}`).join('\n');
  return `${c}\n${kind} ${d.no} (${fmtDate(d.date, { day: 'numeric', month: 'short', year: 'numeric' })})\n\n${lines}${num(d.discount) ? '\nDiscount: − ' + money(d.discount) : ''}${(d.charges || []).map(c => '\n' + c.name + ': ' + money(c.amount)).join('')}${d.tax ? '\n\n' + taxRowsOf(d.tax).map(([a, b]) => a + ': ' + money(b)).join('\n') : ''}\n\nTotal${d.tax ? ' (incl. ' + (d.tax.name || 'GST') + ')' : ''}: ${money(d.total)}${d.advance ? '\nAdvance paid: ' + money(d.advance) : ''}${d.deliveryDate ? '\nDelivery: ' + fmtDate(d.deliveryDate, { weekday: 'short', day: 'numeric', month: 'short' }) + (d.deliverySlot ? ' ' + d.deliverySlot : '') : ''}\n\nThank you!`;
}

/* ---------- printing ---------- */
export function printDoc(kind, d, extra = '') { return saveDocument((d.no || kind) + '.html', kind, docHTML(kind, d, extra)); }
export function docHTML(kind, d, extra = '') {
  const co = byId('settings', 'company') || {};
  const rows = (d.lines || []).map((l, i) => `<tr><td>${i + 1}</td><td>${esc(l.name)}${l.desc ? ` – ${esc(l.desc)}` : ''}<div style="font-size:8pt;color:#555">${esc(l.sku || '')}${l.src === 'custom' && l.spec ? ' · Customised: ' + esc(l.spec) : ''}</div></td><td class="num">${l.qty}</td><td class="num">${money(l.rate)}</td><td class="num">${l.disc ? money(l.disc) : ''}</td><td class="num">${money(lineTotal(l))}</td></tr>`).join('');
  const party = d.customerName || d.supplierName || '';
  return `<div class="doc"><div class="dh"><div><h1>${esc(co.name || '')}</h1><div>${esc(co.address || '').replace(/\n/g, '<br>')}</div><div>${[co.phone && 'Tel: ' + esc(co.phone), co.mobile && 'Mobile: ' + esc(co.mobile), co.whatsapp && 'WhatsApp: ' + esc(co.whatsapp)].filter(Boolean).join(' · ')}</div>${co.email || co.website ? `<div>${[esc(co.email || ''), esc(co.website || '')].filter(Boolean).join(' · ')}</div>` : ''}${co.taxNo ? `<div><b>${esc(co.taxLabel || 'Tax no.')}: ${esc(co.taxNo)}</b></div>` : ''}</div>
    <div><h2>${esc(kind)}</h2><div style="text-align:right">No: <b>${esc(d.no)}</b><br>Date: ${fmtDate(d.date, { day: 'numeric', month: 'short', year: 'numeric' })}${d.deliveryDate ? '<br>Delivery: ' + fmtDate(d.deliveryDate, { day: 'numeric', month: 'short', year: 'numeric' }) + ' ' + esc(d.deliverySlot || '') : ''}</div></div></div>
    <div><b>${esc(party)}</b>${d.mobile ? ' · ' + esc(d.mobile) : ''}${d.deliveryAddress ? '<br>' + esc(d.deliveryAddress) : ''}${d.salesmanName ? '<br>Salesman: ' + esc(d.salesmanName) : ''}</div>
    ${rows ? `<table><thead><tr><th>#</th><th>Item</th><th class="num">Qty</th><th class="num">Rate</th><th class="num">Disc.</th><th class="num">Amount</th></tr></thead><tbody>${rows}</tbody>
    <tfoot>${num(d.discount) || num(d.chargesTotal) ? `<tr><td colspan="5" class="num">Subtotal</td><td class="num">${money(d.subtotal)}</td></tr>` : ''}${num(d.discount) ? `<tr><td colspan="5" class="num">Discount</td><td class="num">− ${money(d.discount)}</td></tr>` : ''}${(d.charges || []).map(c => `<tr><td colspan="5" class="num">${esc(c.name)}</td><td class="num">${money(c.amount)}</td></tr>`).join('')}
    <tr class="tot"><td colspan="5" class="num">Total</td><td class="num">${money(d.total)}</td></tr>
    ${d.paid != null && kind === 'INVOICE' ? `<tr><td colspan="5" class="num">Paid</td><td class="num">${money(d.paid)}</td></tr><tr class="tot"><td colspan="5" class="num">Balance due</td><td class="num">${money(d.balance)}</td></tr>` : ''}
    ${d.advance && kind !== 'INVOICE' ? `<tr><td colspan="5" class="num">Advance received</td><td class="num">${money(d.advance)}</td></tr>` : ''}</tfoot></table>` : ''}
    ${extra}
    ${co.invoiceNote && kind !== 'PAYMENT RECEIPT' ? `<p style="margin-top:6mm">${esc(co.invoiceNote)}</p>` : ''}
    <div class="sig"><span>Customer signature</span><span>For ${esc(co.name || '')}</span></div></div>`;
}

const DOC_CSS = `body{margin:0;padding:12mm;font-family:Arial,Helvetica,sans-serif;color:#000;background:#fff}@page{size:A4;margin:12mm}@media print{body{padding:0}}.doc{font-size:10pt}.doc .dh{display:flex;justify-content:space-between;gap:20px;border-bottom:2px solid #000;padding-bottom:4mm;margin-bottom:4mm}.doc h1{font-size:16pt;margin:0}.doc h2{font-size:14pt;margin:0;text-align:right}.doc table{width:100%;border-collapse:collapse;margin-top:4mm}.doc th,.doc td{border:.2mm solid #999;padding:1.5mm 2mm;font-size:9.5pt;text-align:left}.doc th{background:#eee}.doc .num{text-align:right}.doc .tot td{font-weight:bold}.doc .sig{display:flex;justify-content:space-between;margin-top:18mm}`;
// Claude pages can't open the print dialog, so documents are saved as a file that prints itself when opened
export async function saveDocument(filename, title, inner) {
  const html = `<!doctype html><html><head><meta charset="utf-8"><title>${esc(title)}</title><style>${DOC_CSS}</style></head><body>${inner}<script>window.onload=function(){setTimeout(function(){window.print()},300)}<\/script></body></html>`;
  return download(filename.replace(/[^\w.\-]+/g, '_'), html, 'text/html');
}
/* ---------- grouped column chart (SO vs invoice) ---------- */
export function barChart(host, data, series) {
  const W = Math.max(320, host.clientWidth || 600), H = 220, padL = 52, padB = 26, padT = 10, innerW = W - padL - 8, innerH = H - padB - padT;
  const max = Math.max(4, ...data.flatMap(d => series.map(s => num(d[s.key]))));
  const step = niceStep(max / 4), top = Math.ceil(max / step) * step;
  const band = innerW / data.length, bw = Math.min(22, Math.max(4, (band - 10) / series.length - 2));
  const y = v => padT + innerH - (v / top) * innerH;
  let svg = `<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" role="img" aria-label="Sales orders and invoices chart">`;
  for (let v = 0; v <= top + 1e-9; v += step) svg += `<line x1="${padL}" x2="${W - 8}" y1="${y(v)}" y2="${y(v)}" style="stroke:var(--line)" stroke-width="1"/><text x="${padL - 6}" y="${y(v) + 4}" font-size="10.5" text-anchor="end" style="fill:var(--muted)">${compact(v)}</text>`;
  data.forEach((d, i) => {
    const x0 = padL + i * band + (band - (series.length * (bw + 2) - 2)) / 2;
    series.forEach((s, j) => { const v = num(d[s.key]), h = Math.max(0, innerH - (y(v) - padT)), x = x0 + j * (bw + 2), r = Math.min(4, h / 2, bw / 2);
      if (h > 0) svg += `<path d="M${x},${y(0)} v${-(h - r)} q0,${-r} ${r},${-r} h${bw - 2 * r} q${r},0 ${r},${r} v${h - r} z" fill="${s.color}"/>`; });
    if (data.length <= 14 || i % Math.ceil(data.length / 12) === 0) svg += `<text x="${padL + i * band + band / 2}" y="${H - 8}" font-size="10.5" text-anchor="middle" style="fill:var(--muted)">${esc(d.label)}</text>`;
    svg += `<rect data-i="${i}" x="${padL + i * band}" y="${padT}" width="${band}" height="${innerH}" fill="transparent"/>`;
  });
  svg += `</svg>`;
  host.innerHTML = `<div class="legend">${series.map(s => `<span><i style="background:${s.color}"></i>${esc(s.label)}</span>`).join('')}</div><div class="chart-wrap">${svg}<div class="chart-tip"></div></div>`;
  const tip = host.querySelector('.chart-tip'), wrap = host.querySelector('.chart-wrap');
  wrap.addEventListener('mousemove', e => { const r = e.target.closest('rect[data-i]'); if (!r) { tip.style.display = 'none'; return; } const d = data[+r.dataset.i];
    tip.innerHTML = `<b>${esc(d.label)}</b><br>` + series.map(s => `<i style="display:inline-block;width:8px;height:8px;border-radius:2px;background:${s.color};margin-right:5px"></i>${esc(s.label)}: ${money0(d[s.key])}`).join('<br>') + (d.del != null ? `<br>Deliveries: ${d.del}` : '');
    const b = wrap.getBoundingClientRect(); tip.style.display = 'block'; tip.style.left = Math.min(e.clientX - b.left + 12, b.width - tip.offsetWidth - 4) + 'px'; tip.style.top = (e.clientY - b.top - 10) + 'px'; });
  wrap.addEventListener('mouseleave', () => tip.style.display = 'none');
}
function niceStep(x) { const p = Math.pow(10, Math.floor(Math.log10(x || 1))); const m = x / p; return (m <= 1 ? 1 : m <= 2 ? 2 : m <= 5 ? 5 : 10) * p; }
function compact(v) { return v >= 1e7 ? (v / 1e7).toFixed(1).replace(/\.0$/, '') + 'Cr' : v >= 1e5 ? (v / 1e5).toFixed(1).replace(/\.0$/, '') + 'L' : v >= 1e3 ? (v / 1e3).toFixed(0) + 'K' : String(Math.round(v)); }

/* ---------- CSV ---------- */
export function toCSV(rows) { return '﻿' + rows.map(r => r.map(v => '"' + String(v ?? '').replace(/"/g, '""') + '"').join(',')).join('\r\n') + '\r\n'; }
export async function download(name, content) {
  if (!store.dl) { toast('Downloads are not available in this view of the page.', 'warn'); return false; }
  try { await store.dl.save({ filename: name, data: content }); toast('Saved ' + name + '.'); return true; }
  catch (e) { if (e && e.code === 'declined') return false; toast(e && e.code === 'rate_limited' ? 'A download is already waiting for your answer.' : 'Could not save the file.', 'warn'); return false; }
}
export function parseCSV(text) { const out = []; let row = [], f = '', q = false; text = text.replace(/^﻿/, ''); for (let i = 0; i < text.length; i++) { const c = text[i]; if (c === '"') { if (q && text[i + 1] === '"') { f += '"'; i++; } else q = !q; } else if (c === ',' && !q) { row.push(f); f = ''; } else if ((c === '\n' || c === '\r') && !q) { if (c === '\r' && text[i + 1] === '\n') i++; row.push(f); if (row.some(x => x.trim())) out.push(row); row = []; f = ''; } else f += c; } row.push(f); if (row.some(x => x.trim())) out.push(row); return out; }
export function pickFile(accept) { return new Promise(res => { const i = document.createElement('input'); i.type = 'file'; i.accept = accept; i.onchange = () => res(i.files[0] || null); i.click(); }); }

/* ---------- the journal entry behind a document ---------- */
// the accounting entry behind a document — folded away under a small link unless open is asked for
export function journalHTML(no, title = 'Journal entry', open = false) {
  const js = journalFor(no), wrap = h => `<details class="jv-d" style="margin-top:12px"${open ? ' open' : ''}><summary class="hint" style="cursor:pointer;user-select:none">📒 ${open ? esc(title) : 'Show journal entry (accounts)'}</summary>${h}</details>`;
  if (!js.length) return wrap(`<p class="hint" style="margin:6px 0 0">No accounting entry for this document.</p>`);
  const party = l => l.c ? byId('customers', l.c)?.name : l.s ? byId('suppliers', l.s)?.name : '';
  return wrap(js.map(j => { const dr = j.lines.reduce((x, l) => x + num(l.dr), 0), cr = j.lines.reduce((x, l) => x + num(l.cr), 0);
    return `<h3 style="margin:14px 0 6px;font-size:14px">${esc(title)}${js.length > 1 ? ' · ' + esc(j.memo || '') : ''} <span class="muted" style="font-weight:500;font-size:12px">${fmtDate(j.date)}</span></h3>
    <div class="tw"><table class="jv-t"><thead><tr><th>Account</th><th class="num">Debit</th><th class="num">Credit</th></tr></thead><tbody>${j.lines.map(l => `<tr><td${l.cr && !l.dr ? ' style="padding-left:26px"' : ''}>${esc(accName(l.acc))}${party(l) ? `<div class="muted" style="font-size:11px">${esc(party(l))}</div>` : ''}</td><td class="num">${l.dr ? money(l.dr) : ''}</td><td class="num">${l.cr ? money(l.cr) : ''}</td></tr>`).join('')}</tbody>
    <tfoot><tr><td>${Math.abs(dr - cr) < .01 ? '✓ Balanced' : '⚠ Not balanced'}</td><td class="num">${money(dr)}</td><td class="num">${money(cr)}</td></tr></tfoot></table></div>`; }).join(''));
}

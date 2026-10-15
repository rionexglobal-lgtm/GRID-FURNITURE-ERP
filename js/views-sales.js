// GRID Shop Manager — CRM & sales screens
import { $, esc, num, r2, today, addDays, fmtDate, fmtTime, store, all, byId, setting } from './core.js';
import * as L from './logic.js';
import { creditNoteDialog, openCreditNote, notesTable } from './views-returns.js';
import { printPreview, templateDialog } from './print.js';
import { money, money0, st, pill, searchBox, empty, words, hit, toast, fail, openModal, closeModal, confirmBox, val, field, input, select, accountOptions, userOptions, partyPicker, lineEditor, waLink, telLink, docText, taxBox, readTax, bindTaxBox, taxRowsOf, printDoc, journalHTML } from './ui.js';

const role = () => store.me?.role;
const office = () => L.can.office(role());
const mgmt = () => L.can.manage(role());
const myId = () => store.me?.id;
const moneyAcc = () => accountOptions(a => a.group === 'cash' || a.group === 'bank');
const dateLong = d => fmtDate(d, { weekday: 'short', day: 'numeric', month: 'short' });
const contactBtns = (m, text = '') => m ? `<span style="display:inline-flex;gap:5px"><a class="btn btn-sm" href="${telLink(m)}" onclick="event.stopPropagation()" title="Call">📞</a><a class="btn btn-sm" target="_blank" rel="noopener" href="${waLink(m, text)}" onclick="event.stopPropagation()" title="WhatsApp">💬</a></span>` : '';
export const nav = h => { location.hash = h; };

/* ================= quotation (enquiry) ================= */
export function openQuotation(q) {
  const isNew = !q || !q.id, cust = q ? byId('customers', q.customerId) : null;
  const locked = !isNew && ['converted', 'lost'].includes(q.status);
  let pick, le;
  const body = `${!isNew ? `<div class="li-s" style="margin:-4px 0 10px">${st(q.status)}<span class="mono">${esc(q.no)}</span><span>${fmtDate(q.date)}</span><span>by ${esc(q.salesmanName)}</span>${q.followUpDate && q.status === 'followup' ? `<span>Follow-up ${dateLong(q.followUpDate)}</span>` : ''}${q.soNo ? `<span>→ ${esc(q.soNo)}</span>` : ''}</div>` : ''}
    ${q?.lostReason ? `<div class="alert a-bad">Lost: ${esc(q.lostReason)}</div>` : ''}${q?.billingNote && q.status === 'confirmed' ? `<div class="alert a-info">Note to billing: ${esc(q.billingNote)}</div>` : ''}
    ${field('Customer', '<div id="qParty"></div>')}
    <div class="field"><label>Items enquired</label><div id="qLines"></div></div>
    ${field('Notes (colour, size, finish, budget…)', `<textarea id="qNotes" rows="2">${esc(q?.notes || '')}</textarea>`)}`;
  const save = async () => { const id = pick(); if (!id) throw Error('Choose or add the customer first.'); const v = le.get(); return L.saveQuotation({ id: isNew ? undefined : q.id, customerId: id, lines: v.lines, discount: v.discount, charges: v.charges, notes: val('qNotes') }); };
  const acts = [];
  if (!locked) {
    acts.push({ label: 'Save', cls: 'btn-ink', onClick: async () => { await save(); toast('Enquiry saved.'); } });
    acts.push({ label: '⏰ Save & follow-up', onClick: async () => { const id = await save(); setTimeout(() => followupDialog({ refType: 'quotation', refId: id }), 50); } });
    acts.push({ label: '➜ Send to billing', cls: 'btn-accent', onClick: async () => { const id = await save(); setTimeout(() => sendToBilling(byId('quotations', id) || { id, lines: le.get().lines }), 50); } });
  }
  if (!isNew) {
    acts.unshift({ label: '⬇ Download', onClick: () => { printDoc('QUOTATION', q); return false; } });
    if (q.mobile) acts.unshift({ label: '💬 WhatsApp', href: waLink(q.mobile, docText('Quotation', q)) });
    if (window.__ai) acts.unshift({ label: '✨ Draft follow-up', onClick: () => { setTimeout(() => window.__ai.draft(q), 50); } });
    if (!locked) acts.unshift({ label: 'Lost', cls: 'btn-danger', onClick: () => { setTimeout(() => lostDialog(q), 50); } });
    if (q.status === 'confirmed') acts.push({ label: '↩ Recall from billing', perm: 'enquiries:edit', onClick: async () => { await L.recallQuotation(q); toast('Taken back from billing — it is an open enquiry again.'); } });
    if (q.status !== 'converted') acts.push({ label: '🗑 Delete', cls: 'btn-danger', perm: 'enquiries:delete', onClick: () => { setTimeout(() => deleteQuotationDialog(q), 50); } });
    if (q.status === 'lost') acts.push({ label: 'Reopen', onClick: () => L.reopenQuotation(q).then(() => toast('Reopened.')) });
    if (office() && ['open', 'followup', 'confirmed'].includes(q.status)) acts.push({ label: '✓ Convert to sales order', cls: 'btn-ok', onClick: async () => { await save(); setTimeout(() => openSOEditor({ fromQuotation: byId('quotations', q.id) || q }), 50); } });
  }
  openModal(isNew ? 'New enquiry / quotation' : 'Quotation ' + q.no, body, acts, { wide: true, onOpen: () => {
    pick = partyPicker($('qParty'), 'customer', cust?.id);
    le = lineEditor($('qLines'), { lines: q?.lines || [], discount: q?.discount || 0, charges: q?.charges || [] });
    if (locked) $('modalBody').querySelectorAll('input,textarea,button:not(.btn-sm)').forEach(e => e.disabled = true);
  } });
}
function sendToBilling(q) {
  if (!q.lines?.length) return toast('Add at least one item first.', 'warn');
  openModal('Send to billing', `<p class="hint" style="margin:0 0 10px">The billing team will convert this into a sales order. Tell them about any agreed price or quantity changes.</p>${field('Note to billing team', '<textarea id="bNote" rows="3" placeholder="e.g. Customer agreed ₹500 off. Delivery Saturday morning."></textarea>')}`,
    [{ label: 'Cancel' }, { label: 'Send to billing', cls: 'btn-accent', onClick: async () => { await L.confirmQuotation(byId('quotations', q.id) || q, val('bNote')); toast('Sent to billing — it now shows in Sales Orders as a draft.'); } }]);
}
function deleteQuotationDialog(q) {
  confirmBox('Delete ' + q.no + '?', `The enquiry for <b>${esc(q.customerName)}</b> (${money(q.total)}) is removed completely, with its open follow-ups. The customer stays. Use “Lost” instead if you want to keep a record.`, 'Delete enquiry', true)
    .then(yes => yes && L.deleteQuotation(q).then(() => toast(q.no + ' deleted.')).catch(fail));
}
// a draft in Sales Orders (enquiry sent to billing): convert, send back, or delete
function draftDialog(q) {
  openModal('Draft · ' + q.no, `<p style="margin:0 0 8px"><b>${esc(q.customerName)}</b> · ${money(q.total)} · sent to billing by ${esc(L.nm(q.salesman))}${q.confirmedAt ? ' on ' + fmtDate(new Date(q.confirmedAt).toISOString().slice(0, 10)) : ''}</p>${q.billingNote ? `<div class="alert a-info">Note to billing: ${esc(q.billingNote)}</div>` : ''}
    <p class="hint" style="margin:0">Sent by mistake? <b>Send back to enquiry</b> keeps it as an open enquiry for the salesman to correct and send again. <b>Delete</b> removes it completely.</p>`,
    [{ label: '🗑 Delete', cls: 'btn-danger', perm: 'enquiries:delete', onClick: () => { setTimeout(() => deleteQuotationDialog(q), 50); } },
      { label: '↩ Send back to enquiry', perm: 'enquiries:edit', onClick: async () => { await L.recallQuotation(q); toast(q.no + ' is an open enquiry again.'); } },
      { label: '✎ Open enquiry', onClick: () => { setTimeout(() => openQuotation(byId('quotations', q.id) || q), 50); } },
      ...(office() ? [{ label: '✓ Convert to sales order', cls: 'btn-ok', onClick: () => { setTimeout(() => openSOEditor({ fromQuotation: byId('quotations', q.id) || q }), 50); } }] : [{ label: 'Close' }])]);
}
function lostDialog(q) {
  openModal('Mark as lost', field('Reason', select('lReason', ['Price too high', 'Bought elsewhere', 'Design / colour not available', 'Just browsing', 'Delivery time too long', 'Not reachable', 'Other'])) + field('Details (optional)', input('lNote')),
    [{ label: 'Cancel' }, { label: 'Mark lost', cls: 'btn-danger', onClick: async () => { await L.markLost(q, val('lReason') + (val('lNote') ? ' – ' + val('lNote') : '')); toast('Marked as lost.'); } }]);
}
export function followupDialog({ refType, refId, partyType, partyId, partyName, mobile, note, assignedTo }) {
  const q = refType === 'quotation' ? byId('quotations', refId) : null;
  partyType = partyType || 'customer'; partyId = partyId || q?.customerId || ''; partyName = partyName || q?.customerName || ''; mobile = mobile || q?.mobile || '';
  const assignOpts = userOptions();
  openModal('Set follow-up', `${partyName ? `<div class="alert a-info">${esc(partyName)}${mobile ? ' · ' + esc(mobile) : ''}${q ? ' · ' + esc(q.no) : ''}</div>` : `<div class="field"><label>${partyType === 'supplier' ? 'Supplier' : 'Customer'}</label><div id="fParty"></div></div>`}
    <div class="row2">${field('Follow-up date', input('fDue', addDays(today(), 1), 'type="date"'))}${field('Time (optional)', input('fTime', '', 'type="time"'))}</div>
    <div class="chips" style="margin:-4px 0 10px">${[['Tomorrow', 1], ['In 3 days', 3], ['Next week', 7], ['In 2 weeks', 14]].map(([l, d]) => `<button class="chip" type="button" data-d="${d}">${l}</button>`).join('')}</div>
    ${field('What to follow up', `<textarea id="fNote" rows="2" placeholder="e.g. Call to confirm sofa colour, send new price">${esc(note || '')}</textarea>`)}
    ${field('Assigned to', select('fWho', assignOpts, assignedTo || myId()))}`,
    [{ label: 'Cancel' }, { label: 'Save follow-up', cls: 'btn-ink', onClick: async () => {
      let pid = partyId, pname = partyName, mob = mobile;
      if (!pname && window.__fpick) { pid = window.__fpick(); const p = byId(partyType === 'supplier' ? 'suppliers' : 'customers', pid); if (!p) throw Error('Choose who to follow up.'); pname = p.name; mob = p.mobile; }
      await L.setFollowup({ refType, refId, partyType, partyId: pid, partyName: pname, mobile: mob, due: val('fDue'), time: val('fTime'), note: val('fNote'), assignedTo: val('fWho') }); toast('Follow-up saved.');
    } }], { onOpen: b => {
      b.querySelectorAll('[data-d]').forEach(c => c.onclick = () => { $('fDue').value = addDays(today(), +c.dataset.d); });
      window.__fpick = $('fParty') ? partyPicker($('fParty'), partyType, '') : null;
    } });
}

/* ================= sales order ================= */
export function openSOEditor({ fromQuotation, so, customerId } = {}) {
  const src = so || fromQuotation || {}; let pick, le;
  const editing = !!so;
  openModal(editing ? 'Edit ' + so.no : fromQuotation ? `Convert ${fromQuotation.no} to sales order` : 'New sales order', `
    ${fromQuotation?.billingNote ? `<div class="alert a-info">Salesman's note: ${esc(fromQuotation.billingNote)}</div>` : ''}
    ${field('Customer', '<div id="soParty"></div>')}
    <div class="field"><label>Items — adjust price and quantity as agreed</label><div id="soLines"></div></div>
    <div class="row3">${field('Delivery date', input('soDate', src.deliveryDate || '', 'type="date"'))}${field('Time slot', select('soSlot', ['', 'Morning (9–12)', 'Afternoon (12–4)', 'Evening (4–8)'], src.deliverySlot || ''))}${field('Salesman', select('soMan', userOptions(), src.salesman || byId('customers', src.customerId || customerId)?.salesman || myId()))}</div>
    ${field('Delivery address', `<textarea id="soAddr" rows="2">${esc(src.deliveryAddress || (c0 => c0 ? [c0.address, c0.area].filter(Boolean).join(', ') : '')(byId('customers', src.customerId || customerId)))}</textarea>`)}
    ${field('Delivery / fitting notes', input('soDNote', src.deliveryNote || ''))}
    ${editing ? '' : `<div class="row2">${field('Advance received now', input('soAdv', '', 'type="number" min="0" step=".01" inputmode="decimal" placeholder="0"'))}${field('Received in', select('soAcc', moneyAcc(), L.ACC.cash))}</div>`}`,
    [{ label: 'Cancel' }, { label: editing ? 'Save changes' : 'Create sales order', cls: 'btn-ok', onClick: async () => {
      const v = le.get(), cid = pick(); if (!cid) throw Error('Choose the customer.');
      const data = { lines: v.lines, discount: v.discount, charges: v.charges, tax: v.tax, deliveryDate: val('soDate'), deliverySlot: val('soSlot'), deliveryAddress: val('soAddr'), deliveryNote: val('soDNote') };
      if (editing) { await L.updateSalesOrder(so, data); toast('Order updated.'); return; }
      const id = await L.createSalesOrder({ ...data, customerId: cid, quotationId: fromQuotation?.id, salesman: val('soMan'), advance: num(val('soAdv')), advanceAccount: val('soAcc') });
      toast('Sales order created.');
      setTimeout(() => { const o = byId('salesOrders', id); if (o) openSO(o); }, 300);
    } }], { wide: true, onOpen: () => { pick = partyPicker($('soParty'), 'customer', src.customerId || customerId); le = lineEditor($('soLines'), { lines: src.lines || [], discount: src.discount || 0, charges: src.charges || [], taxId: 'soTax', tax: editing ? L.soTax(so) : { ...L.taxDefaults(), type: L.customerTaxType(src.customerId || customerId) } }); } });
}
export const lineInfo = (l, so) => {
  const t = so && l.lk ? all('tasks').find(x => x.soId === so.id && x.lk === l.lk) : null;
  return `${esc(l.name)}${l.desc ? `<div style="font-size:12px">${esc(l.desc)}</div>` : ''}<div class="muted mono" style="font-size:11px">${esc(l.sku || '')} ${l.src && l.src !== 'stock' ? pill(l.src === 'custom' ? 'custom' : 'reorder', L.SRC[l.src]) : ''} ${t ? `<a href="#" data-task="${t.id}" style="text-decoration:none">${pill(t.status === 'open' ? 'followup' : t.status, t.no + ' · ' + L.TASK_STATUS[t.status] + (t.supplierName ? ' · ' + t.supplierName : ''))}</a>` : ''}</div>${l.src === 'custom' && l.spec ? `<div class="hint" style="white-space:pre-wrap;margin-top:3px">${esc(l.spec)}</div>` : ''}`;
};
export function openSO(so) {
  so = byId('salesOrders', so.id) || so;
  const open = ['open', 'scheduled'].includes(so.status), due = r2(so.total - num(so.advance));
  const acts = [{ label: '🖨 Print', onClick: () => { setTimeout(() => printPreview('so', so, openSO), 30); } }];
  if (so.mobile) acts.push({ label: '💬 WhatsApp', href: waLink(so.mobile, docText('Sales order', so)) });
  acts.push({ label: '⏰ Follow-up', onClick: () => { setTimeout(() => followupDialog({ refType: 'salesOrder', refId: so.id, partyId: so.customerId, partyName: so.customerName, mobile: so.mobile, note: 'Order ' + so.no + ': ' }), 50); } });
  if (open && office()) {
    acts.push({ label: 'Cancel order', cls: 'btn-danger', perm: 'orders:edit', onClick: () => { setTimeout(async () => { if (await confirmBox('Cancel order?', `Cancel ${esc(so.no)}?${so.advance ? `<br><br>The advance of <b>${money(so.advance)}</b> stays as the customer's credit — refund it from Money if needed.` : ''}`, 'Cancel order', true)) { try { await L.cancelSalesOrder(so); toast('Order cancelled.'); } catch (e) { fail(e); } } }, 50); } });
    acts.push({ label: 'Edit', perm: 'orders:edit', onClick: () => { setTimeout(() => openSOEditor({ so }), 50); } });
    acts.push({ label: '＋ Advance', onClick: () => { setTimeout(() => receiveDialog({ customerId: so.customerId, against: 'so', refId: so.id, amount: due }), 50); } });
    acts.push({ label: '🚚 Delivered → Invoice', cls: 'btn-ok', perm: 'orders:edit', onClick: () => { setTimeout(() => deliverDialog(so), 50); } });
  }
  if (so.invoiceId) acts.push({ label: 'Open invoice', cls: 'btn-ink', onClick: () => { const i = byId('invoices', so.invoiceId); setTimeout(() => i ? openInvoice(i) : toast('Invoice not loaded — see Invoices.', 'warn'), 50); } });
  const committed = L.committedMap();
  openModal('Sales order ' + so.no, `<div class="li-s" style="margin:-4px 0 12px">${st(so.status)}<span>${fmtDate(so.date)}</span><span>Salesman: ${esc(so.salesmanName)}</span>${so.quotationNo ? `<span>from ${esc(so.quotationNo)}</span>` : ''}${so.invoiceNo ? `<span>Invoice ${esc(so.invoiceNo)}</span>` : ''}</div>
    <div class="grid g2" style="gap:12px;margin-bottom:12px"><div class="panel" style="box-shadow:none;padding:12px"><b>${esc(so.customerName)}</b><div class="li-s">${esc(so.mobile)} ${contactBtns(so.mobile)}</div><div class="hint" style="margin-top:6px">${esc(so.deliveryAddress || 'No address')}</div></div>
    <div class="panel" style="box-shadow:none;padding:12px"><div class="hint">Delivery</div><b>${so.deliveryDate ? dateLong(so.deliveryDate) + ' ' + esc(so.deliverySlot || '') : 'Not scheduled yet'}</b>${so.deliveryNote ? `<div class="hint">${esc(so.deliveryNote)}</div>` : ''}<div class="hint">Delivery by: ${so.deliveryBy ? '<b>' + esc(L.nm(so.deliveryBy)) + '</b>' : 'not assigned'}</div>${so.deliveredOn ? `<div class="hint">Delivered ${fmtDate(so.deliveredOn)}</div>` : ''}</div></div>
    <div class="tw"><table><thead><tr><th>Item</th><th class="num">Qty</th><th class="num">Rate</th><th class="num">Amount</th>${open ? '<th class="num hide-m">Free stock</th>' : ''}</tr></thead><tbody>${so.lines.map(l => { const it = byId('items', l.itemId); const free = it ? num(it.onHand) - (committed[it.id] || 0) + num(l.qty) : null; return `<tr><td>${lineInfo(l, so)}</td><td class="num">${l.qty}</td><td class="num">${money(l.rate)}${l.disc ? `<div class="muted" style="font-size:11px">− ${money(l.disc)}</div>` : ''}</td><td class="num">${money(L.lineTotal(l))}</td>${open ? `<td class="num hide-m">${free == null ? '—' : free < num(l.qty) ? pill('unpaid', 'Only ' + Math.max(0, free) + ' — order more') : free}</td>` : ''}</tr>`; }).join('')}</tbody>
    <tfoot>${num(so.discount) ? `<tr><td colspan="3" class="num">Discount</td><td class="num">− ${money(so.discount)}</td>${open ? '<td class="hide-m"></td>' : ''}</tr>` : ''}${(so.charges || []).map(c => `<tr><td colspan="3" class="num">${esc(c.name)}</td><td class="num">${money(c.amount)}</td>${open ? '<td class="hide-m"></td>' : ''}</tr>`).join('')}${so.tax ? taxRowsOf(so.tax).map(([a, b]) => `<tr><td colspan="3" class="num">${esc(a)}</td><td class="num">${money(b)}</td>${open ? '<td class="hide-m"></td>' : ''}</tr>`).join('') : ''}<tr><td colspan="3" class="num">Total${so.tax ? ` <span class="muted" style="font-weight:400">(incl. ${esc(so.tax.name || 'GST')})</span>` : ''}</td><td class="num">${money(so.total)}</td>${open ? '<td class="hide-m"></td>' : ''}</tr><tr><td colspan="3" class="num">Advance received</td><td class="num">${money(so.advance || 0)}</td>${open ? '<td class="hide-m"></td>' : ''}</tr><tr><td colspan="3" class="num">To collect on delivery</td><td class="num">${money(due)}</td>${open ? '<td class="hide-m"></td>' : ''}</tr></tfoot></table></div>
    ${so.notes ? `<p class="hint" style="margin-top:8px">${esc(so.notes)}</p>` : ''}`, acts, { wide: true, onOpen: b => b.addEventListener('click', e => { const a = e.target.closest('[data-task]'); if (a) { e.preventDefault(); window.__openTask && window.__openTask(a.dataset.task); } }) });
}
function deliverDialog(so) {
  so = byId('salesOrders', so.id) || so; const due = r2(so.total - num(so.advance)), td = L.soTax(so);
  openModal('Mark delivered & create invoice', `<p style="margin:0 0 10px;line-height:1.55"><b>${esc(so.no)}</b> · ${esc(so.customerName)}<br>Order total <b>${money(so.total)}</b> · advance ${money(so.advance || 0)}<span id="dvBal"> · balance <b>${money(due)}</b></span></p>
    ${taxBox('dvTax', td)}
    <p class="hint" style="margin:0 0 12px">Creating the invoice reduces stock for these items.</p>
    ${(tk => tk.length ? `<div class="alert a-warn">Open tasks for this order: ${tk.map(t => `<b>${esc(t.no)}</b> ${esc(t.name)} (${L.TASK_STATUS[t.status]})`).join(', ')}. They will be marked done when you create the invoice.</div>` : '')(all('tasks').filter(t => t.soId === so.id && !['done', 'cancelled'].includes(t.status)))}
    ${(sh => sh.length ? `<div class="alert a-warn">⚠️ Not enough stock recorded for: ${sh.map(l => `<b>${esc(l.name)}</b> (have ${num(byId('items', l.itemId).onHand)}, need ${l.qty})`).join(', ')}. Record the purchase first if it has arrived — otherwise stock will go negative.</div>` : '')(so.lines.filter(l => byId('items', l.itemId) && num(byId('items', l.itemId).onHand) < num(l.qty)))}
    ${field('Delivery / invoice date', input('dvDate', today(), 'type="date"'))}
    <div class="row2" id="dvPay">${field('Collected on delivery', input('dvAmt', due > 0 ? due : 0, 'type="number" min="0" step=".01" inputmode="decimal"'))}${field('Received in', select('dvAcc', moneyAcc(), L.ACC.cash))}</div>`,
    [{ label: 'Cancel' }, { label: 'Create invoice', cls: 'btn-ok', onClick: async () => {
      const id = await L.deliverAndInvoice(so, { date: val('dvDate'), tax: readTax('dvTax') });
      const amt = num(val('dvAmt'));
      if (amt > 0) await L.receivePayment({ customerId: so.customerId, amount: amt, accountId: val('dvAcc'), date: val('dvDate'), against: 'invoice', refId: id, note: 'Collected on delivery' }).catch(fail);
      toast('Invoice created and stock updated.');
      setTimeout(() => { const i = byId('invoices', id); if (i) openInvoice(i); }, 300);
    } }], { onOpen: () => { let first = true; bindTaxBox('dvTax', () => L.docNet(so), tot => { const bal = r2(Math.max(0, tot - Math.min(tot, num(so.advance)))); $('dvBal').innerHTML = ` · balance <b>${money(bal)}</b>`; $('dvPay').style.display = bal > 0 ? '' : 'none'; if (!first || num($('dvAmt').value) === due) $('dvAmt').value = bal; first = false; }); } });
}
// change, add or remove GST on an existing invoice (no sales returns yet)
function invoiceTaxDialog(inv) {
  const net = L.invoiceNet(inv), td = inv.tax ? { ...inv.tax, on: true } : { ...L.taxDefaults(), on: true, type: L.customerTaxType(inv.customerId) };
  openModal('GST · ' + inv.no, `<p class="hint" style="margin:0 0 8px">Value of the items after discounts${num(inv.chargesTotal) ? ', plus other charges' : ''}: <b>${money(net)}</b>. Payments already received stay on the invoice; the balance is worked out again.</p>${taxBox('ivTax', td)}`,
    [{ label: 'Cancel', onClick: () => setTimeout(() => openInvoice(inv), 50) }, { label: 'Save', cls: 'btn-ok', onClick: async () => { await L.setInvoiceTax(inv, readTax('ivTax')); toast('Invoice tax updated.'); setTimeout(() => { const i = byId('invoices', inv.id); if (i) openInvoice(i); }, 300); } }],
    { onOpen: () => bindTaxBox('ivTax', () => net) });
}
export function receiveDialog({ customerId, against = 'account', refId, amount }) {
  let pick;
  const ref = against === 'so' ? byId('salesOrders', refId) : against === 'invoice' ? byId('invoices', refId) : null;
  openModal('Receive payment', `${ref ? `<div class="alert a-info">${esc(ref.no)} · ${esc(ref.customerName)} · total ${money(ref.total)}</div>` : field('Customer', '<div id="rvParty"></div>')}
    <div class="row2">${field('Amount', input('rvAmt', amount > 0 ? amount : '', 'type="number" min="0" step=".01" inputmode="decimal"'))}${field('Date', input('rvDate', today(), 'type="date"'))}</div>
    <div class="row2">${field('Received in', select('rvAcc', moneyAcc(), L.ACC.cash))}${field('Mode / reference', input('rvMode', '', 'placeholder="e.g. UPI ref, cheque no."'))}</div>${field('Note', input('rvNote'))}`,
    [{ label: 'Cancel' }, { label: 'Save receipt', cls: 'btn-ok', onClick: async () => {
      const cid = ref ? ref.customerId : pick(); if (!cid) throw Error('Choose the customer.');
      await L.receivePayment({ customerId: cid, amount: val('rvAmt'), accountId: val('rvAcc'), date: val('rvDate'), against: ref ? against : 'account', refId: ref?.id, mode: val('rvMode'), note: val('rvNote') });
      toast('Payment recorded.');
    } }], { onOpen: () => { if (!ref) pick = partyPicker($('rvParty'), 'customer', customerId); } });
}
export function openInvoice(inv) {
  inv = byId('invoices', inv.id) || inv;
  const acts = [{ label: '🖨 Print', onClick: () => { setTimeout(() => printPreview('inv', inv, openInvoice), 30); } }];
  if (inv.mobile) acts.push({ label: '💬 WhatsApp', href: waLink(inv.mobile, docText('Invoice', inv) + (inv.balance > 0 ? `\nBalance due: ${money(inv.balance)}` : '')) });
  if (mgmt() && inv.status !== 'void') acts.push({ label: 'Void', cls: 'btn-danger', perm: 'invoices:edit', onClick: () => { setTimeout(async () => { if (await confirmBox('Void invoice?', `Void <b>${esc(inv.no)}</b>? Stock comes back, the sale is reversed and the order goes back to "scheduled". Payments already received stay as customer credit.`, 'Void invoice', true)) { try { await L.voidInvoice(inv, 'Voided'); toast('Invoice voided.'); } catch (e) { fail(e); } } }, 50); } });
  if (office() && inv.status !== 'void' && !all('creditNotes').some(n => n.invoiceId === inv.id)) acts.push({ label: inv.tax ? '% GST' : '＋ GST', perm: 'invoices:edit', onClick: () => { setTimeout(() => invoiceTaxDialog(inv), 50); } });
  if (office() && inv.status !== 'void') acts.push({ label: '↩ Sales return', perm: 'invoices:add', onClick: () => { setTimeout(() => creditNoteDialog(inv), 50); } });
  if (office() && inv.balance > 0 && inv.status !== 'void') acts.push({ label: '＋ Receive payment', cls: 'btn-ok', onClick: () => { setTimeout(() => receiveDialog({ customerId: inv.customerId, against: 'invoice', refId: inv.id, amount: inv.balance }), 50); } });
  openModal('Invoice ' + inv.no, `<div class="li-s" style="margin:-4px 0 12px">${st(inv.status)}<span>${fmtDate(inv.date)}</span><span>${esc(inv.customerName)} · ${esc(inv.mobile || '')}</span><span>${inv.kind === 'service' ? 'Service ' + esc(inv.serviceNo || '') : 'Order ' + esc(inv.soNo || '')}</span><span>Salesman ${esc(inv.salesmanName || '')}</span></div>
    <div class="tw"><table><thead><tr><th>Item</th><th class="num">Qty</th><th class="num">Rate</th><th class="num">Amount</th></tr></thead><tbody>${inv.lines.map(l => `<tr><td>${esc(l.name)}${l.desc ? `<div class="muted" style="font-size:12px">${esc(l.desc)}</div>` : ''}</td><td class="num">${l.qty}</td><td class="num">${money(l.rate)}</td><td class="num">${money(L.lineTotal(l))}</td></tr>`).join('')}</tbody>
    <tfoot>${num(inv.discount) ? `<tr><td colspan="3" class="num">Discount</td><td class="num">− ${money(inv.discount)}</td></tr>` : ''}${(inv.charges || []).map(c => `<tr><td colspan="3" class="num">${esc(c.name)}</td><td class="num">${money(c.amount)}</td></tr>`).join('')}${inv.tax ? taxRowsOf(inv.tax).map(([a, b]) => `<tr><td colspan="3" class="num">${esc(a)}</td><td class="num">${money(b)}</td></tr>`).join('') : ''}<tr><td colspan="3" class="num">Total${inv.tax ? ` <span class="muted" style="font-weight:400">(incl. ${esc(inv.tax.name || 'GST')}${inv.tax.mode === 'inclusive' ? ', prices inclusive' : ''})</span>` : ''}</td><td class="num">${money(inv.total)}</td></tr><tr><td colspan="3" class="num">Paid</td><td class="num">${money(inv.paid)}</td></tr>${num(inv.credited) ? `<tr><td colspan="3" class="num">Returned (credit notes)</td><td class="num">− ${money(inv.credited)}</td></tr>` : ''}<tr><td colspan="3" class="num">Balance due</td><td class="num">${money(inv.balance)}</td></tr></tfoot></table></div>
    ${mgmt() ? `<p class="hint" style="margin-top:8px">Cost of goods ${money(inv.costTotal)} · gross profit ${money(L.netSales(inv) - inv.costTotal)} (${L.netSales(inv) ? ((1 - inv.costTotal / L.netSales(inv)) * 100).toFixed(1) : 0}%)${inv.tax ? ' · before GST' : ''}</p>` : ''}${(cns => cns.length ? `<h3 style="margin:14px 0 6px;font-size:14px">Sales returns</h3><div class="list">${cns.map(n => `<div class="list-item click" data-cn="${n.id}" style="padding:8px 10px;cursor:pointer"><span><b class="mono">${esc(n.no)}</b> · ${fmtDate(n.date)} · ${n.lines.map(l => esc(l.name) + ' × ' + l.qty).join(', ')}</span><b>− ${money(n.total)}</b></div>`).join('')}</div>` : '')(all('creditNotes').filter(n => n.invoiceId === inv.id))}${office() ? journalHTML(inv.no) : ''}`, acts, { wide: true, onOpen: b => b.addEventListener('click', e => { const c = e.target.closest('[data-cn]'); if (c) { const n = byId('creditNotes', c.dataset.cn); closeModal(); if (n) setTimeout(() => openCreditNote(n), 50); } }) });
}

/* ================= My Day ================= */
function followRow(f) {
  const over = f.due < today();
  return `<div class="list-item"><div style="min-width:0"><div class="li-t">${esc(f.partyName || 'General')} ${f.partyType === 'supplier' ? pill('scheduled', 'Supplier') : ''}</div><div class="li-s"><span class="${over ? 'pill p-unpaid' : 'pill p-followup'}">${over ? 'Overdue · ' : ''}${dateLong(f.due)}${f.time ? ' ' + esc(f.time) : ''}</span><span>${esc(f.note || '')}</span>${mgmt() && f.assignedTo !== myId() ? `<span>→ ${esc(f.assignedName)}</span>` : ''}</div></div>
    <div style="display:flex;gap:5px;flex-wrap:wrap;justify-content:flex-end">${window.__ai && f.partyType !== 'supplier' ? `<button class="btn btn-sm" data-draft="${f.id}" title="Draft a WhatsApp message with Claude">✨</button>` : ''}${contactBtns(f.mobile, '')}${f.refType === 'quotation' ? `<button class="btn btn-sm" data-openq="${f.refId}">Open</button>` : ''}${f.refType === 'task' ? `<button class="btn btn-sm" data-opent="${f.refId}">Task</button>` : ''}<button class="btn btn-sm btn-ok" data-done="${f.id}">✓ Done</button></div></div>`;
}
export function bindFollowActions(root) {
  root.addEventListener('click', e => {
    const d = e.target.closest('[data-done]'); if (d) { const f = byId('followups', d.dataset.done); if (f) doneDialog(f); }
    const dr = e.target.closest('[data-draft]'); if (dr) { const f = byId('followups', dr.dataset.draft); if (f && window.__ai) window.__ai.draft(f.refType === 'quotation' ? byId('quotations', f.refId) || f : f, f); }
    const ot = e.target.closest('[data-opent]'); if (ot) { if (window.__openTask) window.__openTask(ot.dataset.opent); return; }
    const o = e.target.closest('[data-openq]'); if (o) { const q = byId('quotations', o.dataset.openq); if (q) openQuotation(q); else toast('Quotation not loaded.', 'warn'); }
  });
}
function doneDialog(f) {
  openModal('Follow-up done', `<div class="alert a-info">${esc(f.partyName)} · ${esc(f.note || '')}</div>${field('What happened?', `<textarea id="fdOut" rows="2" placeholder="e.g. Coming Saturday with family"></textarea>`)}<label class="check"><input type="checkbox" id="fdNext"> Set another follow-up</label>`,
    [{ label: 'Cancel' }, { label: 'Save', cls: 'btn-ok', onClick: async () => { const next = $('fdNext').checked, out = val('fdOut'); await L.completeFollowup(f, out); toast('Follow-up closed.'); if (next) setTimeout(() => followupDialog({ refType: f.refType, refId: f.refId, partyType: f.partyType, partyId: f.partyId, partyName: f.partyName, mobile: f.mobile, note: out }), 50); } }]);
}
export const myday = {
  title: 'My Day', icon: '☀️', roles: ['admin', 'manager', 'billing', 'sales'],
  head: () => `<button class="btn btn-accent" data-act="newq">＋ New walk-in / enquiry</button>`,
  body() {
    const t = today(), mine = f => f.assignedTo === myId();
    const fu = all('followups').filter(f => f.status === 'open' && mine(f) && f.due <= t).sort((a, b) => a.due.localeCompare(b.due));
    const myOrders = all('salesOrders').filter(o => (o.salesman === myId() || office()) && o.status === 'scheduled' && o.deliveryDate >= t && o.deliveryDate <= addDays(t, 6)).sort((a, b) => a.deliveryDate.localeCompare(b.deliveryDate));
    const ms = monthStats(myId());
    let h = '';
    if (office()) {
      const conf = all('quotations').filter(q => q.status === 'confirmed').sort((a, b) => (a.confirmedAt || 0) - (b.confirmedAt || 0));
      const todayDel = all('salesOrders').filter(o => o.status === 'scheduled' && o.deliveryDate && o.deliveryDate <= t);
      h += `<div class="grid g2" style="margin-bottom:16px"><div class="panel"><h2>🧾 Waiting for billing <span class="pill p-confirmed">${conf.length}</span></h2>${conf.length ? conf.map(q => `<div class="list-item click" data-q="${q.id}"><div style="min-width:0"><div class="li-t">${esc(q.customerName)} · ${money(q.total)}</div><div class="li-s"><span class="mono">${esc(q.no)}</span><span>${esc(q.salesmanName)}</span><span>${q.lines.length} items</span>${q.billingNote ? `<span>“${esc(q.billingNote)}”</span>` : ''}</div></div><button class="btn btn-sm btn-ok" data-conv="${q.id}">Convert</button></div>`).join('') : empty('✅', 'Nothing waiting.')}</div>
        <div class="panel"><h2>🚚 Deliveries due today <span class="pill p-scheduled">${todayDel.length}</span></h2>${todayDel.length ? todayDel.map(o => soRow(o)).join('') : empty('🚚', 'No deliveries due.')}</div></div>`;
    }
    h += `<div class="grid g4" style="margin-bottom:16px"><div class="kpi"><span>My enquiries · month</span><b>${ms.enquiries}</b></div><div class="kpi"><span>Converted</span><b>${ms.converted}</b><small>${ms.enquiries ? (ms.converted / ms.enquiries * 100).toFixed(0) : 0}% conversion</small></div><div class="kpi"><span>My orders · month</span><b>${money0(ms.soValue)}</b></div><div class="kpi"><span>Open follow-ups</span><b>${all('followups').filter(f => f.status === 'open' && mine(f)).length}</b></div></div>`;
    h += `<div class="grid g2"><div class="panel"><h2>⏰ My follow-ups today & overdue <span class="pill p-followup">${fu.length}</span></h2>${fu.length ? fu.map(followRow).join('') : empty('🎉', 'All caught up.')}</div>
      <div class="panel"><h2>📦 ${office() ? 'Deliveries' : 'My customers’ deliveries'} · next 7 days</h2>${myOrders.length ? myOrders.map(o => soRow(o)).join('') : empty('📦', 'No deliveries scheduled.')}</div></div>`;
    const myOpen = all('quotations').filter(q => q.salesman === myId() && ['open', 'followup', 'confirmed'].includes(q.status)).sort((a, b) => b.date.localeCompare(a.date)).slice(0, 8);
    h += `<div class="panel" style="margin-top:16px"><h2>📝 My open enquiries</h2>${myOpen.length ? myOpen.map(qRow).join('') : empty('📝', 'No open enquiries.')}</div>`;
    return h;
  },
  bind(root) {
    bindFollowActions(root);
    root.addEventListener('click', e => {
      if (e.target.closest('[data-act=newq]')) return openQuotation(null);
      const c = e.target.closest('[data-conv]'); if (c) { e.stopPropagation(); return openSOEditor({ fromQuotation: byId('quotations', c.dataset.conv) }); }
      const q = e.target.closest('[data-q]'); if (q) return openQuotation(byId('quotations', q.dataset.q));
      const o = e.target.closest('[data-so]'); if (o) return openSO(byId('salesOrders', o.dataset.so));
    });
  }
};
function monthStats(uid) { const m = today().slice(0, 7); const r = { enquiries: 0, converted: 0, soValue: 0 }; all('staffStats').filter(s => s.uid === uid && s.date.startsWith(m)).forEach(s => { r.enquiries += num(s.enquiries); r.converted += num(s.converted); r.soValue += num(s.soValue); }); return r; }
const qRow = q => `<div class="list-item click" data-q="${q.id}"><div style="min-width:0"><div class="li-t">${esc(q.customerName)} <span class="muted" style="font-weight:500">· ${esc(q.mobile)}</span></div><div class="li-s">${st(q.status)}<span class="mono">${esc(q.no)}</span><span>${fmtDate(q.date)}</span><span>${q.lines.length} item${q.lines.length === 1 ? '' : 's'}</span>${office() || mgmt() ? `<span>${esc(q.salesmanName)}</span>` : ''}${q.status === 'followup' && q.followUpDate ? `<span>⏰ ${dateLong(q.followUpDate)}</span>` : ''}</div></div><b class="nowrap">${money0(q.total)}</b></div>`;
const soRow = o => `<div class="list-item click" data-so="${o.id}"><div style="min-width:0"><div class="li-t">${esc(o.customerName)} · ${money0(o.total)}</div><div class="li-s">${st(o.status)}<span class="mono">${esc(o.no)}</span>${o.deliveryDate ? `<span>🚚 ${dateLong(o.deliveryDate)} ${esc(o.deliverySlot || '')}</span>` : ''}<span>${esc(o.salesmanName)}</span>${r2(o.total - num(o.advance)) > 0 ? `<span>collect ${money0(o.total - num(o.advance))}</span>` : ''}</div></div>${contactBtns(o.mobile)}</div>`;

/* ================= Enquiries ================= */
let qFilter = 'active', qMine = null, qSearch = '';
export const enquiries = {
  title: 'Enquiries & Quotations', icon: '📝', roles: ['admin', 'manager', 'billing', 'sales'],
  head: () => `<button class="btn btn-accent" data-act="newq">＋ New walk-in / enquiry</button>`,
  body() {
    if (qMine === null) qMine = role() === 'sales';
    let list = all('quotations'); if (qMine) list = list.filter(q => q.salesman === myId());
    const groups = { active: q => ['open', 'followup', 'confirmed'].includes(q.status), open: q => q.status === 'open', followup: q => q.status === 'followup', confirmed: q => q.status === 'confirmed', converted: q => q.status === 'converted', lost: q => q.status === 'lost', all: () => true };
    const labels = { all: 'All', active: 'Active', open: 'Open', followup: 'Follow-up', confirmed: 'Sent to billing', converted: 'Converted', lost: 'Lost' };
    const w = words(qSearch);
    const shown = list.filter(groups[qFilter]).filter(q => hit(q.customerName + ' ' + q.mobile + ' ' + q.no + ' ' + q.lines.map(l => l.name).join(' '), w)).sort((a, b) => b.date.localeCompare(a.date) || (b.createdAt || 0) - (a.createdAt || 0));
    return `<div class="toolbar">${searchBox('qs', 'Search customer, mobile, item, number…')}<label class="check" style="margin:0"><input type="checkbox" id="qMine" ${qMine ? 'checked' : ''}> Only mine</label></div>
      <div class="chips" style="margin-bottom:12px">${Object.keys(labels).map(k => `<button class="chip${k === qFilter ? ' active' : ''}" data-f="${k}">${labels[k]}<small>${list.filter(groups[k]).length}</small></button>`).join('')}</div>
      <div class="panel" style="padding:10px">${shown.length ? shown.map(qRow).join('') : empty('📝', 'No enquiries here.')}</div>`;
  },
  bind(root) {
    root.addEventListener('click', e => {
      if (e.target.closest('[data-act=newq]')) return openQuotation(null);
      const f = e.target.closest('[data-f]'); if (f) { qFilter = f.dataset.f; return window.__rerender(); }
      const q = e.target.closest('[data-q]'); if (q) openQuotation(byId('quotations', q.dataset.q));
    });
    root.addEventListener('change', e => { if (e.target.id === 'qMine') { qMine = e.target.checked; window.__rerender(); } });
    root.addEventListener('input', e => { if (e.target.id === 'qs') { qSearch = e.target.value; window.__rerender(true); } });
  },
  keep: ['qs']
};

/* ================= Customers ================= */
let cSearch = '', cFilter = 'all';
export const customers = {
  title: 'Customers', icon: '👥', roles: ['admin', 'manager', 'billing', 'sales'],
  head: () => `<button class="btn btn-accent" data-act="newc">＋ New customer</button>`,
  body() {
    const w = words(cSearch), mob = cSearch.replace(/\D/g, '');
    let list = all('customers');
    if (cFilter === 'mine') list = list.filter(c => c.salesman === myId());
    if (cFilter === 'due') list = list.filter(c => num(c.balance) > 0.009);
    if (cFilter === 'credit') list = list.filter(c => num(c.balance) < -0.009);
    list = list.filter(c => hit(c.name + ' ' + (c.mobile || '') + ' ' + (c.area || ''), w) || (mob.length >= 3 && (c.mobile || '').replace(/\D/g, '').includes(mob))).sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
    const shown = list.slice(0, 300);
    return `<div class="toolbar">${searchBox('cs', 'Search name, mobile, area…')}</div>
      <div class="chips" style="margin-bottom:12px">${[['all', 'All'], ['mine', 'My customers'], ['due', 'Balance due'], ['credit', 'Has credit']].map(([k, l]) => `<button class="chip${k === cFilter ? ' active' : ''}" data-f="${k}">${l}</button>`).join('')}</div>
      <div class="tw"><table><thead><tr><th>Customer</th><th>Mobile</th><th class="hide-m">Area</th><th class="hide-m">Salesman</th>${office() ? '<th class="num">Balance</th>' : ''}</tr></thead><tbody>
      ${shown.map(c => `<tr class="click" data-c="${c.id}"><td><b>${esc(c.name)}</b><div class="muted" style="font-size:11px">${esc(c.source || '')}</div></td><td class="nowrap">${esc(c.mobile)}</td><td class="hide-m">${esc(c.area || '')}</td><td class="hide-m">${esc((byId('users', c.salesman) || {}).name || '')}</td>${office() ? `<td class="num ${num(c.balance) > 0 ? '' : 'muted'}">${num(c.balance) > 0.009 ? money(c.balance) : num(c.balance) < -0.009 ? 'Credit ' + money(-c.balance) : '—'}</td>` : ''}</tr>`).join('') || `<tr><td colspan="5">${empty('👥', 'No customers found.')}</td></tr>`}</tbody></table></div>
      ${list.length > 300 ? `<p class="hint" style="margin-top:8px">Showing 300 of ${list.length}. Search to narrow down.</p>` : ''}`;
  },
  bind(root) {
    root.addEventListener('click', e => {
      if (e.target.closest('[data-act=newc]')) return editParty('customer');
      const f = e.target.closest('[data-f]'); if (f) { cFilter = f.dataset.f; return window.__rerender(); }
      const c = e.target.closest('[data-c]'); if (c) openCustomer(byId('customers', c.dataset.c));
    });
    root.addEventListener('input', e => { if (e.target.id === 'cs') { cSearch = e.target.value; window.__rerender(true); } });
  },
  keep: ['cs']
};
export function editParty(kind, p) {
  openModal((p ? 'Edit ' : 'New ') + kind, `<div class="row2">${field('Name', input('pName', p?.name))}${field('Mobile (optional)', input('pMob', p?.mobile, 'inputmode="tel"'))}</div>
    <div class="row2">${field('Area / location', input('pArea', p?.area))}${kind === 'supplier' ? field('Contact person', input('pCon', p?.contact)) : field('Source', select('pSrc', ['Walk-in', 'Phone call', 'Referral', 'Instagram / Facebook', 'WhatsApp', 'Repeat customer', 'Other'], p?.source || 'Walk-in'))}</div>
    ${field('Address', `<textarea id="pAddr" rows="2">${esc(p?.address || '')}</textarea>`)}
    <div class="row2">${field(kind === 'supplier' ? 'GSTIN' : 'GSTIN (business customers, optional)', input('pGst', p?.gstin || '', 'maxlength="15" placeholder="15 characters" style="text-transform:uppercase"'))}${field('Notes', input('pNote', p?.note))}</div>`,
    [{ label: 'Cancel' }, { label: 'Save', cls: 'btn-ink', onClick: async () => { await L.saveParty(kind, { id: p?.id, name: val('pName'), mobile: val('pMob'), area: val('pArea'), address: val('pAddr'), note: val('pNote'), source: val('pSrc'), contact: val('pCon'), gstin: val('pGst') }); toast('Saved.'); } }]);
}
export async function openCustomer(c) {
  const qs = all('quotations').filter(q => q.customerId === c.id), os = all('salesOrders').filter(o => o.customerId === c.id);
  let invs = all('invoices').filter(i => i.customerId === c.id), rcs = [];
  const acts = [{ label: 'Edit', perm: 'customers:edit', onClick: () => { setTimeout(() => editParty('customer', c), 50); } }, { label: '⏰ Follow-up', onClick: () => { setTimeout(() => followupDialog({ partyType: 'customer', partyId: c.id, partyName: c.name, mobile: c.mobile }), 50); } }, ...(L.can.office(role()) ? [{ label: '📄 Statement', onClick: () => { setTimeout(() => import('./views-reports.js').then(m => m.customerStatement(c.id)), 50); } }] : []), { label: '🛠 Complaint', onClick: () => { setTimeout(() => import('./views-service.js').then(m => m.serviceEditor(null, { customerId: c.id })), 50); } }, { label: '＋ Enquiry', cls: 'btn-accent', onClick: () => { setTimeout(() => openQuotation({ customerId: c.id, lines: [], status: 'open', _new: true }), 50); } }];
  if (office()) acts.unshift({ label: 'Opening balance', onClick: () => { setTimeout(() => openingDialog('customer', c), 50); } });
  if (office()) { acts.splice(2, 0, { label: '＋ Payment', cls: 'btn-ok', onClick: () => { setTimeout(() => receiveDialog({ customerId: c.id }), 50); } }); acts.splice(2, 0, { label: '＋ Order', onClick: () => { setTimeout(() => openSOEditor({ customerId: c.id }), 50); } }); }
  const render = () => {
    const rows = [...qs.map(q => ({ d: q.date, t: 'Quotation', no: q.no, s: st(q.status), amt: q.total, open: `data-q="${q.id}"` })), ...os.map(o => ({ d: o.date, t: 'Sales order', no: o.no, s: st(o.status), amt: o.total, open: `data-so="${o.id}"` })), ...invs.map(i => ({ d: i.date, t: 'Invoice', no: i.no, s: st(i.status), amt: i.total, open: `data-inv="${i.id}"` })), ...rcs.map(r => ({ d: r.date, t: r.amount < 0 ? 'Refund' : 'Payment', no: r.no, s: esc(r.accountName || ''), amt: r.amount }))].sort((a, b) => b.d.localeCompare(a.d));
    $('custHist').innerHTML = rows.length ? `<div class="tw"><table><thead><tr><th>Date</th><th>Type</th><th>No.</th><th></th><th class="num">Amount</th></tr></thead><tbody>${rows.map(r => `<tr class="${r.open ? 'click' : ''}" ${r.open || ''}><td class="nowrap">${fmtDate(r.d)}</td><td>${r.t}</td><td class="mono">${esc(r.no)}</td><td>${r.s}</td><td class="num">${money(r.amt)}</td></tr>`).join('')}</tbody></table></div>` : empty('🗂', 'No history yet.');
  };
  openModal(c.name, `<div class="li-s" style="margin:-4px 0 12px"><span>${esc(c.mobile)}</span>${contactBtns(c.mobile, '')}<span>${esc(c.area || '')}</span><span>Salesman: ${esc((byId('users', c.salesman) || {}).name || '—')}</span><span>Since ${fmtDate(c.createdAt ? new Date(c.createdAt).toISOString().slice(0, 10) : '')}</span></div>
    <div class="grid g3" style="gap:10px;margin-bottom:12px"><div class="kpi"><span>Balance</span><b>${num(c.balance) < 0 ? 'Credit ' + money(-c.balance) : money(c.balance)}</b></div><div class="kpi"><span>Enquiries</span><b>${qs.length}</b></div><div class="kpi"><span>Orders</span><b>${os.length}</b></div></div>
    ${c.address ? `<p class="hint">${esc(c.address)}</p>` : ''}<div id="custHist"><div class="empty">Loading history…</div></div>`, acts, { wide: true, onOpen: b => {
      render();
      if (office()) Promise.all([store.db.query('invoices', [['customerId', '==', c.id]]), store.db.query('receipts', [['customerId', '==', c.id]])]).then(([i, r]) => { invs = i; rcs = r; if ($('custHist')) render(); }).catch(() => { });
      b.addEventListener('click', e => { const q = e.target.closest('[data-q]'), o = e.target.closest('[data-so]'), i = e.target.closest('[data-inv]');
        if (q) openQuotation(byId('quotations', q.dataset.q) || qs.find(x => x.id === q.dataset.q)); if (o) openSO(byId('salesOrders', o.dataset.so) || os.find(x => x.id === o.dataset.so)); if (i) openInvoice(byId('invoices', i.dataset.inv) || invs.find(x => x.id === i.dataset.inv)); });
    } });
}

/* ================= Follow-ups ================= */
let fFilter = 'due', fMine = null, fType = 'all';
export const followups = {
  title: 'Follow-ups & Reminders', icon: '⏰', roles: ['admin', 'manager', 'billing', 'sales'],
  head: () => `<button class="btn btn-ink" data-act="newfc">＋ Customer follow-up</button><button class="btn" data-act="newfs">＋ Supplier reminder</button>`,
  badge: () => all('followups').filter(f => f.status === 'open' && f.assignedTo === myId() && f.due <= today()).length,
  body() {
    if (fMine === null) fMine = !mgmt();
    const t = today();
    let list = all('followups'); if (fMine) list = list.filter(f => f.assignedTo === myId()); if (fType !== 'all') list = list.filter(f => (f.partyType || 'customer') === fType);
    const g = { due: f => f.status === 'open' && f.due <= t, overdue: f => f.status === 'open' && f.due < t, upcoming: f => f.status === 'open' && f.due > t, done: f => f.status === 'done' };
    const lab = { due: 'Today & overdue', overdue: 'Overdue', upcoming: 'Upcoming', done: 'Done' };
    const shown = list.filter(g[fFilter]).sort((a, b) => fFilter === 'done' ? (b.doneAt || 0) - (a.doneAt || 0) : a.due.localeCompare(b.due));
    return `<div class="toolbar"><div class="chips">${Object.keys(lab).map(k => `<button class="chip${k === fFilter ? ' active' : ''}" data-f="${k}">${lab[k]}<small>${list.filter(g[k]).length}</small></button>`).join('')}</div>
      <select class="inp" id="fType" style="width:auto">${[['all', 'Customers & suppliers'], ['customer', 'Customers'], ['supplier', 'Suppliers']].map(([k, l]) => `<option value="${k}"${k === fType ? ' selected' : ''}>${l}</option>`).join('')}</select>
      <label class="check" style="margin:0"><input type="checkbox" id="fMine" ${fMine ? 'checked' : ''}> Only mine</label></div>
      <div class="panel" style="padding:10px">${shown.length ? shown.map(f => fFilter === 'done' ? `<div class="list-item"><div><div class="li-t">${esc(f.partyName)}</div><div class="li-s">${pill('done', 'Done ' + fmtTime(f.doneAt))}<span>${esc(f.note)}</span>${f.outcome ? `<span>→ ${esc(f.outcome)}</span>` : ''}<span>${esc(f.assignedName)}</span></div></div></div>` : followRow(f)).join('') : empty('⏰', 'Nothing here.')}</div>`;
  },
  bind(root) {
    bindFollowActions(root);
    root.addEventListener('click', e => {
      if (e.target.closest('[data-act=newfc]')) return followupDialog({ partyType: 'customer' });
      if (e.target.closest('[data-act=newfs]')) return followupDialog({ partyType: 'supplier' });
      const f = e.target.closest('[data-f]'); if (f) { fFilter = f.dataset.f; window.__rerender(); }
    });
    root.addEventListener('change', e => { if (e.target.id === 'fMine') { fMine = e.target.checked; window.__rerender(); } if (e.target.id === 'fType') { fType = e.target.value; window.__rerender(); } });
  }
};

/* ================= Sales orders ================= */
let oFilter = 'active', oSearch = '';
export const orders = {
  title: 'Sales Orders', icon: '🛒', roles: ['admin', 'manager', 'billing', 'sales'],
  head: () => office() ? `<button class="btn" data-act="tpl">⚙ Print template</button><button class="btn btn-accent" data-act="newo">＋ New sales order</button>` : '',
  body() {
    let list = all('salesOrders'); if (role() === 'sales') list = list.filter(o => o.salesman === myId());
    const g = { active: o => ['open', 'scheduled'].includes(o.status), open: o => o.status === 'open', scheduled: o => o.status === 'scheduled', delivered: o => o.status === 'delivered', cancelled: o => o.status === 'cancelled', all: () => true, draft: () => false };
    const lab = { active: 'Pending delivery', open: 'Not scheduled', scheduled: 'Scheduled', delivered: 'Delivered', cancelled: 'Cancelled', all: 'All' };
    const w = words(oSearch);
    const shown = list.filter(g[oFilter]).filter(o => hit(o.customerName + ' ' + o.mobile + ' ' + o.no + ' ' + o.lines.map(l => l.name).join(' '), w)).sort((a, b) => b.date.localeCompare(a.date) || (b.createdAt || 0) - (a.createdAt || 0));
    // enquiries sent to billing show here as draft orders until billing converts them
    let drafts = all('quotations').filter(q => q.status === 'confirmed'); if (role() === 'sales') drafts = drafts.filter(q => q.salesman === myId());
    const dShown = ['active', 'draft', 'all'].includes(oFilter) ? drafts.filter(q => hit(q.customerName + ' ' + (q.mobile || '') + ' ' + q.no + ' ' + q.lines.map(l => l.name).join(' '), w)).sort((a, b) => (a.confirmedAt || 0) - (b.confirmedAt || 0)) : [];
    const shownO = oFilter === 'draft' ? [] : shown, tot = shownO.reduce((s, o) => s + o.total, 0) + dShown.reduce((s, q) => s + num(q.total), 0);
    const cnt = k => k === 'draft' ? drafts.length : list.filter(g[k]).length + (['active', 'all'].includes(k) ? drafts.length : 0);
    return `<div class="toolbar">${searchBox('os', 'Search customer, mobile, item, order no…')}</div>
      <div class="chips" style="margin-bottom:12px">${['all', 'active', 'draft', ...Object.keys(lab).filter(k => !['active', 'all'].includes(k))].map(k => `<button class="chip${k === oFilter ? ' active' : ''}" data-f="${k}">${k === 'draft' ? 'Draft (from enquiries)' : lab[k]}<small>${cnt(k)}</small></button>`).join('')}</div>
      <div class="tw"><table><thead><tr><th>Order</th><th>Customer</th><th class="hide-m">Salesman</th><th>Delivery</th><th class="num">Total</th><th class="num hide-m">Advance</th><th></th></tr></thead><tbody>
      ${dShown.map(q => `<tr class="click" data-qd="${q.id}" style="background:var(--panel-2)"><td class="nowrap"><b class="mono">Draft</b><div class="muted" style="font-size:11px">from ${esc(q.no)} · ${fmtDate(q.date)}</div></td><td><b>${esc(q.customerName)}</b><div class="muted" style="font-size:11px">${esc(q.mobile || '')}</div></td><td class="hide-m">${esc(L.nm(q.salesman))}</td><td class="nowrap">—</td><td class="num">${money0(q.total)}</td><td class="num hide-m">—</td><td class="nowrap">${pill('followup', office() ? 'Draft · convert' : 'Draft · with billing')} <button class="icon-btn ib-n" data-qx="${q.id}" title="Send back or delete" aria-label="Send back or delete ${esc(q.no)}">✕</button></td></tr>`).join('')}
      ${shownO.map(o => `<tr class="click" data-so="${o.id}"><td class="nowrap"><b class="mono">${esc(o.no)}</b><div class="muted" style="font-size:11px">${fmtDate(o.date)}</div></td><td><b>${esc(o.customerName)}</b><div class="muted" style="font-size:11px">${esc(o.mobile)}</div></td><td class="hide-m">${esc(o.salesmanName)}</td><td class="nowrap">${o.deliveryDate ? dateLong(o.deliveryDate) : '—'}</td><td class="num">${money0(o.total)}</td><td class="num hide-m">${money0(o.advance || 0)}</td><td class="nowrap">${st(o.status)} <button class="icon-btn ib-n" data-pr="${o.id}" title="Print" aria-label="Print ${esc(o.no)}">🖨</button></td></tr>`).join('') || (dShown.length ? '' : `<tr><td colspan="7">${empty('🛒', oFilter === 'draft' ? 'No drafts. Enquiries sent to billing show here until they are converted into sales orders.' : 'No orders here.')}</td></tr>`)}</tbody>
      ${shownO.length || dShown.length ? `<tfoot><tr><td colspan="4">${shownO.length} orders${dShown.length ? ' + ' + dShown.length + ' draft' + (dShown.length > 1 ? 's' : '') : ''}</td><td class="num">${money0(tot)}</td><td class="hide-m"></td><td></td></tr></tfoot>` : ''}</table></div>`;
  },
  bind(root) {
    root.addEventListener('click', e => {
      if (e.target.closest('[data-act=newo]')) return openSOEditor({});
      if (e.target.closest('[data-act=tpl]')) return templateDialog('so');
      const pr = e.target.closest('[data-pr]'); if (pr) { e.stopPropagation(); return printPreview('so', byId('salesOrders', pr.dataset.pr)); }
      const f = e.target.closest('[data-f]'); if (f) { oFilter = f.dataset.f; return window.__rerender(); }
      const o = e.target.closest('[data-so]'); if (o) openSO(byId('salesOrders', o.dataset.so));
      const x = e.target.closest('[data-qx]'); if (x) { e.stopPropagation(); const q = byId('quotations', x.dataset.qx); if (q) draftDialog(q); return; }
      const d = e.target.closest('[data-qd]'); if (d) { const q = byId('quotations', d.dataset.qd); if (q) office() ? openSOEditor({ fromQuotation: q }) : openQuotation(q); }
    });
    root.addEventListener('input', e => { if (e.target.id === 'os') { oSearch = e.target.value; window.__rerender(true); } });
  },
  keep: ['os']
};

/* ================= Delivery schedule ================= */
export const deliveries = {
  title: 'Delivery Schedule', icon: '🚚', roles: ['admin', 'manager', 'billing', 'sales'],
  badge: () => all('salesOrders').filter(o => o.status === 'scheduled' && o.deliveryDate && o.deliveryDate <= today()).length,
  body() {
    const t = today();
    let list = all('salesOrders').filter(o => ['open', 'scheduled'].includes(o.status)); if (role() === 'sales') list = list.filter(o => o.salesman === myId());
    const late = list.filter(o => o.deliveryDate && o.deliveryDate < t), unsched = list.filter(o => !o.deliveryDate);
    const days = []; for (let i = 0; i < 14; i++) { const d = addDays(t, i); days.push([d, list.filter(o => o.deliveryDate === d)]); }
    const later = list.filter(o => o.deliveryDate > addDays(t, 13));
    const doneToday = all('salesOrders').filter(o => o.status === 'delivered' && o.deliveredOn === t);
    const card = o => `<div class="list-item click" data-so="${o.id}"><div style="min-width:0"><div class="li-t">${esc(o.customerName)} <span class="muted" style="font-weight:500">${esc(o.deliverySlot || '')}</span></div><div class="li-s"><span class="mono">${esc(o.no)}</span><span>${o.lines.map(l => esc(l.name) + ' ×' + l.qty).join(', ')}</span></div><div class="li-s">${o.deliveryBy ? '👤 ' + esc(L.nm(o.deliveryBy)) + ' · ' : ''}📍 ${esc(o.deliveryAddress || 'no address')}${r2(o.total - num(o.advance)) > 0 ? ` · <b>collect ${money0(o.total - num(o.advance))}</b>` : ' · fully paid'}</div></div><div style="display:flex;gap:5px">${contactBtns(o.mobile)}${office() ? `<button class="btn btn-sm btn-ok" data-dlv="${o.id}">Delivered</button>` : ''}</div></div>`;
    const sec = (title, arr, cls = '') => arr.length ? `<div class="panel" style="margin-bottom:12px"><h2>${title} <span class="pill ${cls}">${arr.length}</span></h2>${arr.map(card).join('')}</div>` : '';
    return `<div class="grid g4" style="margin-bottom:16px"><div class="kpi"><span>Due today</span><b>${list.filter(o => o.deliveryDate === t).length}</b></div><div class="kpi"><span>Delivered today</span><b>${doneToday.length}</b><small>${money0(doneToday.reduce((s, o) => s + o.total, 0))}</small></div><div class="kpi"><span>Late</span><b style="color:${late.length ? 'var(--danger)' : 'inherit'}">${late.length}</b></div><div class="kpi"><span>Not scheduled</span><b>${unsched.length}</b></div></div>
      ${sec('⚠️ Late — past delivery date', late, 'p-unpaid')}
      ${days.map(([d, arr]) => sec((d === t ? 'Today · ' : d === addDays(t, 1) ? 'Tomorrow · ' : '') + dateLong(d), arr, 'p-scheduled')).join('')}
      ${sec('Later', later)}${sec('📅 Not scheduled yet', unsched, 'p-open')}
      ${!list.length ? empty('🚚', 'No pending deliveries.') : ''}`;
  },
  bind(root) {
    root.addEventListener('click', e => {
      const d = e.target.closest('[data-dlv]'); if (d) { e.stopPropagation(); return deliverDialog(byId('salesOrders', d.dataset.dlv)); }
      const o = e.target.closest('[data-so]'); if (o) openSO(byId('salesOrders', o.dataset.so));
    });
  }
};

/* ================= Invoices ================= */
let iFilter = 'unpaidAll', iSearch = '';
export const invoices = {
  title: 'Invoices', icon: '🧾', roles: ['admin', 'manager', 'billing'],
  head: () => `<button class="btn" data-act="tpl">⚙ Print template</button>`,
  body() {
    const list = all('invoices');
    const g = { unpaidAll: i => ['unpaid', 'partial'].includes(i.status), paid: i => i.status === 'paid', void: i => i.status === 'void', all: () => true };
    const lab = { all: 'All', unpaidAll: 'Balance due', paid: 'Paid', void: 'Void', cn: 'Sales returns (credit notes)' };
    g.cn = () => false;
    const w = words(iSearch);
    const shown = list.filter(g[iFilter]).filter(i => hit(i.customerName + ' ' + i.mobile + ' ' + i.no + ' ' + (i.soNo || ''), w)).sort((a, b) => b.date.localeCompare(a.date) || (b.createdAt || 0) - (a.createdAt || 0));
    const sum = k => shown.reduce((s, i) => s + num(i[k]), 0);
    return `<div class="toolbar">${searchBox('is', 'Search customer, mobile, invoice no…')}</div>
      <div class="chips" style="margin-bottom:12px">${Object.keys(lab).map(k => `<button class="chip${k === iFilter ? ' active' : ''}" data-f="${k}">${lab[k]}<small>${k === 'cn' ? all('creditNotes').length : list.filter(g[k]).length}</small></button>`).join('')}</div>
      ${iFilter === 'cn' ? (notesTable('creditNotes', all('creditNotes').filter(n => hit(n.customerName + ' ' + n.no + ' ' + n.invoiceNo, w)).sort((a, b) => b.date.localeCompare(a.date))) || empty('↩', 'No sales returns yet. Open an invoice and press “Sales return”.')) : `<div class="tw"><table><thead><tr><th>Invoice</th><th>Customer</th><th class="hide-m">Order</th><th class="num">Total</th><th class="num hide-m">Paid</th><th class="num">Balance</th><th></th></tr></thead><tbody>
      ${shown.map(i => `<tr class="click" data-inv="${i.id}"><td class="nowrap"><b class="mono">${esc(i.no)}</b><div class="muted" style="font-size:11px">${fmtDate(i.date)}</div></td><td><b>${esc(i.customerName)}</b><div class="muted" style="font-size:11px">${esc(i.mobile || '')}</div></td><td class="hide-m mono">${esc(i.soNo || '')}</td><td class="num">${money0(i.total)}</td><td class="num hide-m">${money0(i.paid)}</td><td class="num">${money0(i.balance)}</td><td class="nowrap">${st(i.status)} <button class="icon-btn ib-n" data-pr="${i.id}" title="Print" aria-label="Print ${esc(i.no)}">🖨</button></td></tr>`).join('') || `<tr><td colspan="7">${empty('🧾', 'No invoices here.')}</td></tr>`}</tbody>
      ${shown.length ? `<tfoot><tr><td colspan="3">${shown.length} invoices</td><td class="num">${money0(sum('total'))}</td><td class="num hide-m">${money0(sum('paid'))}</td><td class="num">${money0(sum('balance'))}</td><td></td></tr></tfoot>` : ''}</table></div>`}`;
  },
  bind(root) {
    root.addEventListener('click', e => { if (e.target.closest('[data-act=tpl]')) return templateDialog('inv'); const pr = e.target.closest('[data-pr]'); if (pr) return printPreview('inv', byId('invoices', pr.dataset.pr)); const f = e.target.closest('[data-f]'); if (f) { iFilter = f.dataset.f; return window.__rerender(); } const n = e.target.closest('[data-note]'); if (n) return openCreditNote(byId('creditNotes', n.dataset.note)); const i = e.target.closest('[data-inv]'); if (i) openInvoice(byId('invoices', i.dataset.inv)); });
    root.addEventListener('input', e => { if (e.target.id === 'is') { iSearch = e.target.value; window.__rerender(true); } });
  },
  keep: ['is']
};

export function openingDialog(kind, p) {
  openModal('Opening balance — ' + p.name, `<p class="hint" style="margin:0 0 10px">Use this once when you start, for money ${kind === 'supplier' ? 'you already owed this supplier' : 'this customer already owed you'} before using this app.</p><div class="row2">${field('Amount', input('obAmt', '', 'type="number" step=".01" inputmode="decimal"'))}${field('As of date', input('obDate', today(), 'type="date"'))}</div>`,
    [{ label: 'Cancel' }, { label: 'Save', cls: 'btn-ink', onClick: async () => { await L.openingBalance(kind, p.id, val('obAmt'), val('obDate')); toast('Opening balance saved.'); } }]);
}

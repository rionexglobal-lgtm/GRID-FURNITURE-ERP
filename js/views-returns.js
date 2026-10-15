// GRID Shop Manager — returns: credit notes for sales returns, debit notes for purchase returns
import { $, esc, num, r2, today, fmtDate, store, all, byId } from './core.js';
import * as L from './logic.js';
import { money, money0, toast, fail, openModal, closeModal, confirmBox, val, field, input, select, accountOptions, journalHTML, printDoc, taxRowsOf } from './ui.js';

const moneyAcc = () => accountOptions(a => a.group === 'cash' || a.group === 'bank');
const netUnit = (inv, l) => { const sub = num(inv.subtotal) || inv.lines.reduce((s, x) => s + L.lineTotal(x), 0), f = sub ? (sub - num(inv.discount)) / sub : 1; return num(l.qty) ? r2(L.lineTotal(l) * f / num(l.qty)) : 0; };

/* ---------- credit note (sales return) ---------- */
export function creditNoteDialog(inv) {
  L.derive(true); inv = byId('invoices', inv.id) || inv;
  const done = L.returnedQty('creditNotes', 'invoiceId', inv.id);
  const rows = inv.lines.map((l, i) => ({ l, i, left: r2(num(l.qty) - num(done[l.lk || l.itemId])), unit: netUnit(inv, l) }));
  if (!rows.some(r => r.left > 0)) return toast('Everything on this invoice has already been returned.', 'warn');
  const balance = num(inv.balance);
  openModal('Sales return · credit note for ' + inv.no, `<div id="cnWrap"><p class="hint" style="margin:0 0 10px">${esc(inv.customerName)} · invoice total ${money(inv.total)} · balance due ${money(balance)}. Enter how many of each item came back. The price is what the customer paid per piece, after the invoice discount${inv.tax ? (inv.tax.mode === 'inclusive' ? ', including ' + esc(inv.tax.name || 'GST') : ', before ' + esc(inv.tax.name || 'GST') + ' (GST is added back below as on the invoice)') : ''}.</p>
    <div class="tw"><table><thead><tr><th>Item</th><th class="num">Sold</th><th class="num">Can return</th><th class="num" style="width:90px">Return qty</th><th class="num" style="width:120px">Price / pc</th><th class="hide-m">Back to stock</th><th class="num">Amount</th></tr></thead><tbody>
    ${rows.map(r => `<tr data-i="${r.i}"><td><b>${esc(r.l.name)}</b>${r.l.desc ? `<div class="muted" style="font-size:11px">${esc(r.l.desc)}</div>` : ''}<div class="muted mono" style="font-size:11px">${esc(r.l.sku || '')}</div></td><td class="num">${num(r.l.qty)}</td><td class="num">${r.left}</td>
      <td><input class="inp inp-sm num cq" type="number" min="0" max="${r.left}" step="1" inputmode="decimal"${r.left > 0 ? '' : ' disabled'}></td><td><input class="inp inp-sm num cr" type="number" min="0" step=".01" value="${r.unit}"${r.left > 0 ? '' : ' disabled'}></td>
      <td class="hide-m"><label class="check" style="margin:0"><input type="checkbox" class="cs" checked${r.left > 0 ? '' : ' disabled'}> restock</label></td><td class="num ca"></td></tr>`).join('')}</tbody>
    <tfoot><tr><td colspan="6">Credit note total<div class="muted" id="cnTaxR" style="font-size:12px;font-weight:400"></div></td><td class="num" id="cnTot">${money(0)}</td></tr></tfoot></table></div>
    <div class="row2" style="margin-top:10px">${field('Return date', input('cnDate', today(), 'type="date"'))}${field('Reason', select('cnWhy', ['Damaged / defective', 'Wrong item delivered', 'Customer changed mind', 'Size / colour not suitable', 'Price adjustment', 'Other']))}</div>
    <div id="cnApply" class="alert a-info"></div>
    <label class="check"><input type="checkbox" id="cnRefund"> Refund money to the customer now</label>
    <div class="row2" id="cnRefBox" hidden>${field('Refund amount', input('cnRefAmt', '', 'type="number" min="0" step=".01" inputmode="decimal"'))}${field('Paid from', select('cnRefAcc', moneyAcc(), L.ACC.cash))}</div>
    <p class="hint">Untick "restock" for items that are damaged and won't be sold again: the sale is still reversed, but stock does not come back.</p></div>`,
    [{ label: 'Cancel' }, { label: 'Create credit note', cls: 'btn-ok', onClick: async () => {
      const lines = [...$('cnWrap').querySelectorAll('tr[data-i]')].map(tr => ({ idx: +tr.dataset.i, qty: num(tr.querySelector('.cq').value), rate: num(tr.querySelector('.cr').value), restock: tr.querySelector('.cs').checked })).filter(l => l.qty > 0);
      const id = await L.createCreditNote({ invoiceId: inv.id, lines, date: val('cnDate'), reason: val('cnWhy'), refundNow: $('cnRefund').checked ? val('cnRefAmt') : 0, refundAccount: val('cnRefAcc') });
      toast('Credit note created.'); setTimeout(() => { const n = byId('creditNotes', id); if (n) openCreditNote(n); }, 80);
    } }],
    { wide: true, onOpen: () => {
      const calc = () => { let t = 0; $('cnWrap').querySelectorAll('tr[data-i]').forEach(tr => { const a = r2(num(tr.querySelector('.cq').value) * num(tr.querySelector('.cr').value)); t += a; tr.querySelector('.ca').textContent = a ? money(a) : ''; });
        t = r2(t); const tx = inv.tax && t ? L.calcTax(t, inv.tax) : null; if (tx) t = tx.total; $('cnTot').textContent = money(t);
        $('cnTaxR').textContent = tx ? taxRowsOf(tx).map(([a, b]) => a + ' ' + money(b)).join(' · ') : ''; const toInv = Math.min(t, balance), extra = r2(t - toInv);
        $('cnApply').innerHTML = !t ? 'Enter the quantity returned.' : `${toInv > 0 ? `<b>${money(toInv)}</b> reduces what the customer still owes on ${esc(inv.no)}.` : ''} ${extra > 0 ? `<b>${money(extra)}</b> becomes the customer's credit (they already paid) — refund it below, or keep it for their next purchase.` : ''}`;
        if ($('cnRefund').checked && !$('cnRefAmt').dataset.touched) $('cnRefAmt').value = extra > 0 ? extra : ''; };
      $('cnWrap').addEventListener('input', e => { if (e.target.id === 'cnRefAmt') e.target.dataset.touched = '1'; calc(); });
      $('cnRefund').onchange = () => { $('cnRefBox').hidden = !$('cnRefund').checked; calc(); };
      calc();
    } });
}
export function openCreditNote(n) {
  n = byId('creditNotes', n.id) || n;
  const body = `<div class="li-s" style="margin:-4px 0 12px"><span>${fmtDate(n.date, { day: 'numeric', month: 'short', year: 'numeric' })}</span><span>${esc(n.customerName)}</span><span>Invoice ${esc(n.invoiceNo)}</span><span>${esc(n.reason || '')}</span><span>By ${esc(L.nm(n.createdBy))}</span></div>
    <div class="tw"><table><thead><tr><th>Item</th><th class="num">Qty</th><th class="num">Price</th><th class="num">Amount</th><th class="hide-m">Stock</th></tr></thead><tbody>${n.lines.map(l => `<tr><td>${esc(l.name)}<div class="muted mono" style="font-size:11px">${esc(l.sku)}</div></td><td class="num">${l.qty}</td><td class="num">${money(l.rate)}</td><td class="num">${money(l.amount)}</td><td class="hide-m">${l.restock ? 'Back in stock' : 'Not restocked'}</td></tr>`).join('')}</tbody>
    <tfoot>${n.tax ? taxRowsOf(n.tax).map(([a, b]) => `<tr><td colspan="3">${esc(a)}</td><td class="num">${money(b)}</td><td class="hide-m"></td></tr>`).join('') : ''}<tr><td colspan="3">Total credit</td><td class="num">${money(n.total)}</td><td class="hide-m"></td></tr></tfoot></table></div>${journalHTML(n.no)}`;
  openModal('Credit note ' + n.no, body, [
    { label: '🗑 Delete', cls: 'btn-danger', perm: 'invoices:delete', onClick: () => { setTimeout(() => deleteNote('creditNotes', n), 50); } },
    { label: '⬇ Download', onClick: () => { printDoc('CREDIT NOTE', { ...n, lines: n.lines.map(l => ({ ...l, disc: 0 })), subtotal: n.total, discount: 0 }, `<p>Against invoice ${esc(n.invoiceNo)} · ${esc(n.reason || '')}</p>${n.tax ? `<p>${taxRowsOf(n.tax).map(([a, b]) => esc(a) + ': <b>' + money(b) + '</b>').join(' · ')} · total includes ${esc(n.tax.name || 'GST')}</p>` : ''}`); return false; } },
    { label: 'Close' }], { wide: true });
}

/* ---------- debit note (purchase return) ---------- */
export function debitNoteDialog(pb) {
  L.derive(true); pb = byId('purchases', pb.id) || pb;
  const done = L.returnedQty('debitNotes', 'purchaseId', pb.id);
  const rows = pb.lines.map((l, i) => { const it = byId('items', l.itemId); return { l, i, left: r2(num(l.qty) - num(done[l.itemId])), stock: it ? num(it.onHand) : 0 }; });
  if (!rows.some(r => r.left > 0)) return toast('Everything on this bill has already been returned.', 'warn');
  openModal('Purchase return · debit note for ' + pb.no, `<div id="dnWrap"><p class="hint" style="margin:0 0 10px">${esc(pb.supplierName)}${pb.billNo ? ' · bill ' + esc(pb.billNo) : ''} · bill total ${money(pb.total)} · still to pay ${money(pb.balance)}. Enter how many of each item you are sending back.</p>
    <div class="tw"><table><thead><tr><th>Item</th><th class="num">Received</th><th class="num">Can return</th><th class="num hide-m">In stock</th><th class="num" style="width:90px">Return qty</th><th class="num" style="width:120px">Cost / pc</th><th class="num">Amount</th></tr></thead><tbody>
    ${rows.map(r => `<tr data-i="${r.i}"><td><b>${esc(r.l.name)}</b><div class="muted mono" style="font-size:11px">${esc(r.l.sku || '')}</div></td><td class="num">${num(r.l.qty)}</td><td class="num">${r.left}</td><td class="num hide-m">${r.stock}</td>
      <td><input class="inp inp-sm num dq" type="number" min="0" max="${r.left}" step="1" inputmode="decimal"${r.left > 0 ? '' : ' disabled'}></td><td><input class="inp inp-sm num dr" type="number" min="0" step=".01" value="${r2(r.l.rate)}"${r.left > 0 ? '' : ' disabled'}></td><td class="num da"></td></tr>`).join('')}</tbody>
    <tfoot><tr><td colspan="6">Debit note total</td><td class="num" id="dnTot">${money(0)}</td></tr></tfoot></table></div>
    <div class="row2" style="margin-top:10px">${field('Return date', input('dnDate', today(), 'type="date"'))}${field('Reason', select('dnWhy', ['Damaged in transit', 'Defective / poor quality', 'Wrong item sent', 'Excess quantity', 'Price difference', 'Other']))}</div>
    <div id="dnApply" class="alert a-info"></div><div id="dnWarn"></div></div>`,
    [{ label: 'Cancel' }, { label: 'Create debit note', cls: 'btn-ok', onClick: async () => {
      const lines = [...$('dnWrap').querySelectorAll('tr[data-i]')].map(tr => ({ idx: +tr.dataset.i, qty: num(tr.querySelector('.dq').value), rate: num(tr.querySelector('.dr').value) })).filter(l => l.qty > 0);
      const r = await L.createDebitNote({ purchaseId: pb.id, lines, date: val('dnDate'), reason: val('dnWhy') });
      toast(`${r.no} created${r.credit > 0 ? ' · ' + money(r.credit) + ' kept as advance with the supplier' : ''}.`); setTimeout(() => { const n = byId('debitNotes', r.id); if (n) openDebitNote(n); }, 80);
    } }],
    { wide: true, onOpen: () => {
      const calc = () => { let t = 0, low = []; $('dnWrap').querySelectorAll('tr[data-i]').forEach(tr => { const q = num(tr.querySelector('.dq').value), a = r2(q * num(tr.querySelector('.dr').value)); t += a; tr.querySelector('.da').textContent = a ? money(a) : ''; const rw = rows[+tr.dataset.i]; if (q > rw.stock) low.push(rw.l.name); });
        t = r2(t); $('dnTot').textContent = money(t); const toBill = Math.min(t, num(pb.balance)), extra = r2(t - toBill);
        $('dnApply').innerHTML = !t ? 'Enter the quantity returned.' : `${toBill > 0 ? `<b>${money(toBill)}</b> comes off what you owe on ${esc(pb.no)}.` : ''} ${extra > 0 ? `<b>${money(extra)}</b> is already paid — it is kept as an <b>advance with the supplier</b> to settle against their next bill.` : ''}`;
        $('dnWarn').innerHTML = low.length ? `<div class="alert a-warn">Stock on record is less than the return for: ${low.map(esc).join(', ')}. Stock will go below zero.</div>` : ''; };
      $('dnWrap').addEventListener('input', calc); calc();
    } });
}
export function openDebitNote(n) {
  n = byId('debitNotes', n.id) || n;
  const body = `<div class="li-s" style="margin:-4px 0 12px"><span>${fmtDate(n.date, { day: 'numeric', month: 'short', year: 'numeric' })}</span><span>${esc(n.supplierName)}</span><span>Bill ${esc(n.purchaseNo)}${n.billNo ? ' / ' + esc(n.billNo) : ''}</span><span>${esc(n.reason || '')}</span><span>By ${esc(L.nm(n.createdBy))}</span></div>
    <div class="tw"><table><thead><tr><th>Item</th><th class="num">Qty</th><th class="num">Cost</th><th class="num">Amount</th></tr></thead><tbody>${n.lines.map(l => `<tr><td>${esc(l.name)}<div class="muted mono" style="font-size:11px">${esc(l.sku)}</div></td><td class="num">${l.qty}</td><td class="num">${money(l.rate)}</td><td class="num">${money(l.amount)}</td></tr>`).join('')}</tbody>
    <tfoot><tr><td colspan="3">Total</td><td class="num">${money(n.total)}</td></tr><tr><td colspan="3">Set against bills</td><td class="num">${money(L.payAllocs(n).reduce((x, a) => x + num(a.amount), 0))}</td></tr>${num(n.unallocated) > 0.009 ? `<tr><td colspan="3">Advance with supplier</td><td class="num">${money(n.unallocated)}</td></tr>` : ''}</tfoot></table></div>${journalHTML(n.no)}`;
  openModal('Debit note ' + n.no, body, [
    { label: '🗑 Delete', cls: 'btn-danger', perm: 'purchases:delete', onClick: () => { setTimeout(() => deleteNote('debitNotes', n), 50); } },
    { label: '⬇ Download', onClick: () => { printDoc('DEBIT NOTE', { ...n, lines: n.lines.map(l => ({ ...l, disc: 0 })), subtotal: n.total, discount: 0 }, `<p>Goods returned against bill ${esc(n.purchaseNo)}${n.billNo ? ' (' + esc(n.billNo) + ')' : ''} · ${esc(n.reason || '')}</p>`); return false; } },
    { label: 'Close' }], { wide: true });
}
function deleteNote(coll, n) {
  openModal('Delete ' + n.no + '?', `<p style="margin:0 0 10px;line-height:1.55">This removes the ${coll === 'creditNotes' ? 'sales return: the invoice balance and the sale come back, and restocked items leave stock again. Any refund paid with it stays in Money — delete that refund too if it was a mistake' : 'purchase return: the items come back into stock and the bill balance goes up again'}. A copy is kept in the deleted-entries log.</p>${field('Reason', input('dnWhy2', '', 'placeholder="e.g. Entered by mistake"'))}`,
    [{ label: 'Cancel' }, { label: 'Delete', cls: 'btn-danger', onClick: async () => { if (!val('dnWhy2').trim()) throw Error('Write the reason for deleting.'); await L.deleteTxn(coll, n, val('dnWhy2')); toast(n.no + ' deleted.'); } }]);
}
export const notesTable = (coll, list) => list.length ? `<div class="tw"><table><thead><tr><th>${coll === 'creditNotes' ? 'Credit note' : 'Debit note'}</th><th>${coll === 'creditNotes' ? 'Customer' : 'Supplier'}</th><th class="hide-m">${coll === 'creditNotes' ? 'Invoice' : 'Bill'}</th><th class="hide-m">Reason</th><th class="num">Amount</th></tr></thead><tbody>
  ${list.map(n => `<tr class="click" data-note="${n.id}"><td class="nowrap"><b class="mono">${esc(n.no)}</b><div class="muted" style="font-size:11px">${fmtDate(n.date)}</div></td><td>${esc(n.customerName || n.supplierName)}</td><td class="hide-m mono">${esc(n.invoiceNo || n.purchaseNo || '')}</td><td class="hide-m">${esc(n.reason || '')}</td><td class="num">${money(n.total)}</td></tr>`).join('')}</tbody>
  <tfoot><tr><td colspan="4">${list.length} note${list.length === 1 ? '' : 's'}</td><td class="num">${money(list.reduce((x, n) => x + num(n.total), 0))}</td></tr></tfoot></table></div>` : '';

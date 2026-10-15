// GRID Shop Manager — Purchase Orders: order from a supplier, send it (PDF / WhatsApp), then receive the goods
// on a purchase bill made straight from the order. The order itself never changes stock or accounts.
import { $, esc, num, r2, today, addDays, fmtDate, fmtTime, store, all, byId, setting } from './core.js';
import * as L from './logic.js';
import { money, money0, pill, empty, words, hit, toast, fail, openModal, closeModal, confirmBox, val, field, input, partyPicker, lineEditor, waLink } from './ui.js';
import { company, shopLogo, savePdf } from './print.js';
import { purchaseEditor } from './views-office.js';

const rr = () => window.__rerender && window.__rerender(true);
const LABEL = { draft: 'Draft', open: 'Open', sent: 'Sent to supplier', partial: 'Part received', received: 'Received', cancelled: 'Cancelled' };
const CLS = { draft: 'followup', open: 'open', sent: 'ordered', partial: 'partial', received: 'received', cancelled: 'cancelled' };
const stPO = s => pill(CLS[s] || s, LABEL[s] || s);
const nm = id => L.nm(id);
let poFilter = 'open', poSearch = '';

export const porders = {
  title: 'Purchase Orders', icon: '📝', roles: ['admin', 'manager', 'billing'],
  head: () => `<button class="btn btn-accent" data-a="newpo">＋ New purchase order</button>`,
  badge: () => all('purchaseOrders').filter(po => ['open', 'sent', 'partial'].includes(L.poState(po)) && po.expected && po.expected < today()).length || 0,
  body() {
    const list = all('purchaseOrders').map(po => ({ po, s: L.poState(po) }));
    const F = { open: x => ['draft', 'open', 'sent', 'partial'].includes(x.s), draft: x => x.s === 'draft', late: x => ['open', 'sent', 'partial'].includes(x.s) && x.po.expected && x.po.expected < today(), received: x => x.s === 'received', cancelled: x => x.s === 'cancelled', all: () => true };
    const lab = { all: 'All', open: 'Pending', draft: 'Drafts', late: 'Late', received: 'Received', cancelled: 'Cancelled' };
    const w = words(poSearch);
    const shown = list.filter(F[poFilter]).filter(x => !poSearch.trim() || hit(`${x.po.no} ${x.po.supplierName} ${x.po.lines.map(l => l.name + ' ' + (l.sku || '')).join(' ')}`, w))
      .sort((a, b) => b.po.date.localeCompare(a.po.date) || (b.po.createdAt || 0) - (a.po.createdAt || 0));
    const pend = list.filter(F.open), value = pend.reduce((x, y) => x + num(y.po.total), 0);
    return `<div class="chips" style="margin-bottom:12px">${Object.keys(lab).map(k => `<button class="chip${k === poFilter ? ' active' : ''}" data-f="${k}">${lab[k]}<small>${list.filter(F[k]).length}</small></button>`).join('')}</div>
      <div class="toolbar" style="margin-bottom:12px"><input id="poS" class="inp" style="flex:1" placeholder="Search order no., supplier or item…" value="${esc(poSearch)}" autocomplete="off"><span class="hint">${pend.length} pending · ${money0(value)} on order</span></div>
      <div class="tw"><table><thead><tr><th>Order</th><th>Supplier</th><th class="hide-m">Items</th><th class="num">Total</th><th class="hide-m">Expected</th><th class="hide-m">Received</th><th></th></tr></thead><tbody>
      ${shown.map(({ po, s }) => { const pr = L.poProgress(po), late = ['open', 'sent', 'partial'].includes(s) && po.expected && po.expected < today();
        return `<tr class="click" data-po="${po.id}"><td class="nowrap"><b class="mono">${esc(po.no)}</b><div class="muted" style="font-size:11px">${fmtDate(po.date)}</div></td><td>${esc(po.supplierName)}</td><td class="hide-m">${po.lines.length} line${po.lines.length === 1 ? '' : 's'} · ${pr.ordered} pcs</td><td class="num">${money0(po.total)}</td>
          <td class="hide-m nowrap">${po.expected ? `<span${late ? ' style="color:var(--danger);font-weight:700"' : ''}>${fmtDate(po.expected)}${late ? ' · late' : ''}</span>` : '—'}</td><td class="hide-m">${pr.received} / ${pr.ordered}</td><td>${stPO(s)}</td></tr>`; }).join('')
        || `<tr><td colspan="7">${empty('📝', poFilter === 'open' ? 'No pending purchase orders. Press “＋ New purchase order”.' : 'No orders here.')}</td></tr>`}</tbody></table></div>`;
  },
  bind(root) {
    root.addEventListener('click', e => {
      if (e.target.closest('[data-a=newpo]')) return poEditor();
      const f = e.target.closest('[data-f]'); if (f) { poFilter = f.dataset.f; return rr(); }
      const r = e.target.closest('[data-po]'); if (r) openPO(byId('purchaseOrders', r.dataset.po));
    });
    root.addEventListener('input', e => { if (e.target.id === 'poS') { poSearch = e.target.value; rr(); } });
  }
};

export function poEditor(po, { supplierId, lines } = {}) {
  let pick, le;
  const P = po || {};
  openModal(po ? 'Edit ' + po.no : 'New purchase order', `${field('Supplier', '<div id="poParty"></div>')}
    <div class="row2">${field('Order date', input('poDate', P.date || today(), 'type="date"'))}${field('Expected delivery', input('poExp', P.expected || addDays(today(), 7), 'type="date"'))}</div>
    <div class="field"><label>Items to order (cost price)</label><div id="poLines"></div></div>
    <div class="row2">${field('Note to supplier (shown on the order)', `<textarea id="poNotes" rows="2" placeholder="e.g. Deliver to showroom, call before coming">${esc(P.notes || '')}</textarea>`)}${field('Terms (shown on the order)', `<textarea id="poTerms" rows="2" placeholder="e.g. Payment 30 days after delivery">${esc(P.terms ?? setting('poTerms', ''))}</textarea>`)}</div>`,
    [{ label: 'Cancel' }, { label: po ? 'Save changes' : 'Save order', cls: 'btn-ok', onClick: async () => {
      const sid = pick(); if (!sid) throw Error('Choose the supplier.');
      const id = await L.savePO({ id: po?.id, supplierId: sid, date: val('poDate'), expected: val('poExp'), lines: le.get().lines, notes: val('poNotes'), terms: val('poTerms') });
      toast(po ? 'Order updated.' : 'Purchase order saved.'); setTimeout(() => { const x = byId('purchaseOrders', id); if (x) openPO(x); }, 300);
    } }],
    { wide: true, onOpen: () => { pick = partyPicker($('poParty'), 'supplier', P.supplierId || supplierId || null); le = lineEditor($('poLines'), { lines: (P.lines || lines || []).map(l => ({ ...l })), mode: 'purchase', showStock: true }); } });
}

function waText(po) {
  const co = setting('name', '');
  return [`*Purchase order ${po.no}* — ${co}`, `Date: ${fmtDate(po.date, { day: 'numeric', month: 'short', year: 'numeric' })}${po.expected ? ` · Delivery by ${fmtDate(po.expected, { day: 'numeric', month: 'short', year: 'numeric' })}` : ''}`, '',
    ...po.lines.map((l, i) => `${i + 1}. ${l.name}${l.sku ? ' (' + l.sku + ')' : ''} — ${l.qty} × ${money(l.rate)}`), '', `*Total: ${money(po.total)}*`, ...(po.notes ? ['', po.notes] : []), ...(po.terms ? ['', 'Terms: ' + po.terms] : [])].join('\n');
}

export function openPO(po) {
  if (!po) return;
  const s = L.poState(po), rec = L.poReceived(po), bills = all('purchases').filter(p => p.poId === po.id).sort((a, b) => a.date.localeCompare(b.date)), sup = byId('suppliers', po.supplierId) || {};
  const closed = ['received', 'cancelled'].includes(s), left = L.poRemaining(po);
  const used = {}; // received split over repeated lines of the same item, in order
  const body = `<div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center;margin-bottom:10px">${stPO(s)}<span class="hint">${fmtDate(po.date)} · ${esc(po.supplierName)}${sup.mobile ? ' · ' + esc(sup.mobile) : ''}${po.expected ? ' · delivery by <b>' + fmtDate(po.expected) + '</b>' : ''}</span></div>
    ${s === 'draft' ? `<div class="alert a-warn">Draft — made from tasks marked “ordered”${po.lines.some(l => l.taskNo) ? ' (' + esc([...new Set(po.lines.map(l => l.taskNo).filter(Boolean))].join(', ')) + ')' : ''}. Check the quantities and cost prices (✎ Edit), then press <b>✓ Confirm order</b> and send it to the supplier. When the goods arrive, <b>🔄 Convert to purchase</b> makes the purchase bill.</div>` : ''}
    ${po.status === 'cancelled' && po.cancelReason ? `<div class="alert a-bad">Cancelled: ${esc(po.cancelReason)}</div>` : ''}
    <div class="tw"><table><thead><tr><th>Item</th><th class="num">Ordered</th><th class="num">Received</th><th class="num">Cost</th><th class="num">Amount</th></tr></thead><tbody>
    ${po.lines.map(l => { const avail = r2((rec[l.itemId] || 0) - (used[l.itemId] || 0)), got = Math.max(0, Math.min(num(l.qty), avail)); used[l.itemId] = r2((used[l.itemId] || 0) + got);
      return `<tr><td><b>${esc(l.name)}</b><div class="muted mono" style="font-size:11px">${esc(l.sku || '')}${l.taskNo ? ' · task ' + esc(l.taskNo) : ''}</div></td><td class="num">${l.qty}</td><td class="num"${got >= l.qty ? ' style="color:var(--ok);font-weight:700"' : ''}>${got}</td><td class="num">${money(l.rate)}</td><td class="num">${money(l.qty * l.rate)}</td></tr>`; }).join('')}</tbody>
    <tfoot><tr><td colspan="4">Total</td><td class="num">${money(po.total)}</td></tr></tfoot></table></div>
    ${po.notes ? `<p style="margin:10px 0 0"><b>Note:</b> ${esc(po.notes)}</p>` : ''}${po.terms ? `<p class="hint" style="margin:4px 0 0"><b>Terms:</b> ${esc(po.terms)}</p>` : ''}
    ${bills.length ? `<h3 style="margin:14px 0 6px;font-size:14px">Received on</h3><div class="list">${bills.map(p => `<div class="list-item" style="padding:8px 10px"><span><b class="mono">${esc(p.no)}</b>${p.billNo ? ' · bill ' + esc(p.billNo) : ''} · ${fmtDate(p.date)}</span><span>${p.lines.reduce((x, l) => x + num(l.qty), 0)} pcs · ${money0(p.total)}</span></div>`).join('')}</div>` : ''}
    ${(po.log || []).length ? `<details style="margin-top:12px"><summary class="hint" style="cursor:pointer">History</summary><div class="hint" style="margin-top:6px;line-height:1.7">${po.log.map(x => `${fmtTime(x.at)} · ${esc(nm(x.by))} — ${esc(x.text)}`).join('<br>')}</div></details>` : ''}`;
  const wa = waLink(sup.mobile || po.mobile, waText(po));
  openModal('Purchase order ' + po.no, body, [
    ...(s === 'draft' ? [{ label: '✓ Confirm order', cls: 'btn-ok', perm: 'porders:edit', onClick: async () => { if (!po.lines.every(l => num(l.rate) > 0) && !(await confirmBox('Some cost prices are 0', 'Confirm the order anyway? You can still edit it afterwards.', 'Confirm order'))) return false; await L.setPOStatus(po, 'open'); toast(po.no + ' confirmed — send it to the supplier.'); } }] : []),
    ...(!closed && left.length ? [{ label: '🔄 Convert to purchase', cls: 'btn-ok', perm: 'purchases:add', onClick: () => { setTimeout(() => purchaseEditor({ poId: po.id, supplierId: po.supplierId, lines: left.map(l => ({ itemId: l.itemId, sku: l.sku, name: l.name, qty: l.qty, rate: l.rate })) }), 60); } }] : []),
    { label: '⬇ Save as PDF', onClick: () => { poPdf(po); return false; } },
    ...(wa ? [{ label: '💬 WhatsApp', href: wa }] : []),
    ...(s === 'open' ? [{ label: '✓ Mark as sent', perm: 'porders:edit', onClick: async () => { await L.setPOStatus(po, 'sent'); toast('Marked as sent.'); } }] : []),
    ...(!closed ? [{ label: '✎ Edit', perm: 'porders:edit', onClick: () => { setTimeout(() => poEditor(po), 60); } }] : []),
    ...(!closed ? [{ label: 'Cancel order', cls: 'btn-danger', perm: 'porders:edit', onClick: () => { setTimeout(() => cancelDialog(po), 60); } }] : []),
    ...(!bills.length ? [{ label: '🗑 Delete', cls: 'btn-danger', perm: 'porders:delete', onClick: async () => { if (!(await confirmBox('Delete ' + po.no + '?', 'The order is removed completely. Use “Cancel order” instead if you want to keep a record.', 'Delete', true))) return false; await L.deletePO(po); toast('Order deleted.'); } }] : []),
    { label: 'Close' }], { wide: true });
}
function cancelDialog(po) {
  openModal('Cancel ' + po.no, `<p class="hint" style="margin-top:0">Goods already received stay in stock. The rest of the order is closed.</p>${field('Reason', input('poWhy', '', 'placeholder="e.g. Supplier out of stock" maxlength="200"'))}`,
    [{ label: 'Back' }, { label: 'Cancel order', cls: 'btn-danger', onClick: async () => { await L.setPOStatus(po, 'cancelled', val('poWhy')); toast('Order cancelled.'); } }], { onOpen: () => $('poWhy').focus() });
}

// A4 purchase order with letterhead, supplier, lines, total, notes, terms and signatures
export function poPdf(po) {
  const co = company(), lg = shopLogo(), sup = byId('suppliers', po.supplierId) || {}, m = v => esc(money(v)), D = d => fmtDate(d, { day: 'numeric', month: 'short', year: 'numeric' });
  const html = `<!doctype html><html><head><meta charset="utf-8"><title>${esc(po.no)}</title><style>*{box-sizing:border-box}body{margin:0;background:#fff;font:10pt/1.45 Arial,Helvetica,sans-serif;color:#1b1b1b}
.po-page{width:190mm;padding:2mm 0}.hd{display:flex;justify-content:space-between;align-items:flex-start;gap:6mm;border-bottom:.7mm solid #5b2d14;padding-bottom:3mm;margin-bottom:5mm}.hd img{height:17mm;width:auto;max-width:45mm;object-fit:contain;margin-right:3mm}.co{display:flex;align-items:center}
h1{margin:0;font:700 15pt Georgia,serif;color:#4a2511}h2{margin:0;font:700 16pt Georgia,serif;color:#4a2511;text-align:right;letter-spacing:.04em}.meta{text-align:right;font-size:9pt;color:#444;line-height:1.6}
.box{display:grid;grid-template-columns:1fr 1fr;gap:5mm;margin-bottom:5mm}.box div{border:.3mm solid #dcc4a0;border-radius:2mm;padding:3mm;background:#fffaf1}.box span{display:block;font-size:7.5pt;text-transform:uppercase;letter-spacing:.06em;color:#7a604b;margin-bottom:1mm}
table{width:100%;border-collapse:collapse}th{background:#f3e3c7;color:#4a2511;text-align:left;font-size:8pt;text-transform:uppercase;letter-spacing:.04em;padding:2mm}td{padding:2mm;border-bottom:.2mm solid #eadcc4;vertical-align:top}.n{text-align:right;white-space:nowrap}tfoot td{font-weight:700;background:#faf1e2;font-size:11pt}
.nt{margin-top:5mm;font-size:9pt}.sig{display:grid;grid-template-columns:1fr 1fr;gap:20mm;margin-top:22mm}.sig div{border-top:.3mm solid #555;padding-top:1.5mm;font-size:8.5pt;color:#555;text-align:center}.ft{margin-top:8mm;color:#999;font-size:7.5pt;border-top:.2mm solid #ddd;padding-top:2mm}</style></head><body><div class="po-page">
<div class="hd"><div class="co">${lg ? `<img src="${esc(lg)}" alt="">` : ''}<div><h1>${esc(co.name || setting('name', ''))}</h1><div style="color:#666;font-size:8.5pt">${esc(co.address || '').replace(/\n/g, ', ')}${co.phone || co.mobile ? '<br>' + esc(co.phone || co.mobile) : ''}${co.taxNo ? '<br>' + esc((co.taxLabel || 'TRN') + ': ' + co.taxNo) : ''}</div></div></div>
<div><h2>PURCHASE ORDER</h2><div class="meta"><b>${esc(po.no)}</b><br>Date: ${esc(D(po.date))}${po.expected ? '<br>Deliver by: <b>' + esc(D(po.expected)) + '</b>' : ''}</div></div></div>
<div class="box"><div><span>Supplier</span><b>${esc(po.supplierName)}</b>${sup.contact ? '<br>' + esc(sup.contact) : ''}${sup.mobile ? '<br>' + esc(sup.mobile) : ''}${sup.address ? '<br>' + esc(sup.address) : ''}</div><div><span>Deliver to</span><b>${esc(co.name || setting('name', ''))}</b><br>${esc(co.address || '').replace(/\n/g, '<br>')}</div></div>
<table><thead><tr><th style="width:8mm">#</th><th>Item</th><th>Code</th><th class="n">Qty</th><th class="n">Rate</th><th class="n">Amount</th></tr></thead><tbody>
${po.lines.map((l, i) => `<tr><td>${i + 1}</td><td>${esc(l.name)}</td><td>${esc(l.sku || '')}</td><td class="n">${esc(l.qty)}</td><td class="n">${m(l.rate)}</td><td class="n">${m(l.qty * l.rate)}</td></tr>`).join('')}</tbody>
<tfoot><tr><td colspan="5">Total (${po.lines.reduce((x, l) => x + num(l.qty), 0)} pcs)</td><td class="n">${m(po.total)}</td></tr></tfoot></table>
${po.notes ? `<div class="nt"><b>Note:</b> ${esc(po.notes)}</div>` : ''}${po.terms ? `<div class="nt"><b>Terms:</b> ${esc(po.terms)}</div>` : ''}
<div class="sig"><div>Authorised signature — ${esc(co.name || setting('name', ''))}</div><div>Accepted by supplier (name, signature, date)</div></div>
<div class="ft">${esc(po.no)} · issued ${esc(D(po.date))}</div></div></body></html>`;
  return savePdf(html, 'Purchase_order_' + po.no, '.po-page', { fit: 'A4', margin: 10, width: 900 });
}

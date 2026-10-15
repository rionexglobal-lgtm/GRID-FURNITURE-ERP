// GRID Shop Manager — management, money, purchases, stock, cash closing, accounting, staff, settings
import { $, esc, num, r2, today, addDays, weekStart, fmtDate, fmtTime, store, all, byId, setting, uid } from './core.js';
import * as L from './logic.js';
import * as H from './logic-hr.js';
import { money, money0, st, pill, searchBox, empty, words, hit, toast, fail, openModal, closeModal, confirmBox, val, field, input, select, accountOptions, userOptions, partyPicker, lineEditor, printDoc, saveDocument, barChart, toCSV, download, parseCSV, pickFile, waLink, telLink, journalHTML } from './ui.js';
import { templateDialog, companyForm, company, readCompany, shopLogo, saveShopLogo, shrinkImage, menuLogoH, saveLogoSize, templates, logoMM, voucherFromTxn, voucherFromStaff, printVouchers } from './print.js';
import { openSO, openInvoice, openQuotation, receiveDialog, followupDialog, editParty, bindFollowActions, openingDialog } from './views-sales.js';
import { queueLabelsFromPurchase } from './views-stock.js';
import { attachField, recordFiles, bindRecordFiles, clip } from './attach.js';
import { todayPanel } from './views-hr.js';
import { servicePanel } from './views-service.js';
import { debitNoteDialog, openDebitNote, openCreditNote, notesTable } from './views-returns.js';

const role = () => store.me?.role;
const mgmt = () => L.can.manage(role());
const office = () => L.can.office(role());
const moneyAcc = () => accountOptions(a => a.group === 'cash' || a.group === 'bank');
const dateLong = d => fmtDate(d, { weekday: 'short', day: 'numeric', month: 'short' });
const sumBy = (arr, k) => r2(arr.reduce((s, x) => s + num(typeof k === 'function' ? k(x) : x[k]), 0));
const rr = () => window.__rerender();

/* ================= Management dashboard ================= */
let dPeriod = 'daily';
export const dashboard = {
  title: 'Dashboard', icon: '📊', roles: ['admin', 'manager'],
  head: () => `<span class="hint">Live · ${fmtDate(today(), { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}</span>`,
  body() {
    const t = today(), S = byId('stats', t) || {}, acc = L.moneyAccounts(), cashTotal = sumBy(acc, 'bal'), flowAll = L.moneyFlow(acc.map(a => a.id), t, t);
    const delToday = all('salesOrders').filter(o => o.status === 'delivered' && o.deliveredOn === t), dueToday = all('salesOrders').filter(o => o.status === 'scheduled' && o.deliveryDate === t);
    const late = all('salesOrders').filter(o => o.status === 'scheduled' && o.deliveryDate && o.deliveryDate < t);
    const recv = sumBy(all('customers').filter(c => num(c.balance) > 0), 'balance'), pay = sumBy(all('suppliers').filter(s => num(s.balance) > 0), 'balance');
    const fuOver = all('followups').filter(f => f.status === 'open' && f.due < t).length, fuToday = all('followups').filter(f => f.status === 'open' && f.due === t).length;
    const pipe = st => all('quotations').filter(q => q.status === st);
    const committed = L.committedMap(), short = all('items').filter(i => committed[i.id] && num(i.onHand) - committed[i.id] < 0);
    const committedVal = sumBy(Object.entries(committed), ([id, q]) => q * num((byId('items', id) || {}).cost));
    const closed = L.activeClosing(t, L.ACC.cash), lock = L.lockedUpTo();
    const m0 = t.slice(0, 8) + '01', perf = L.staffPerformance(m0, t);
    const monthS = all('stats').filter(s => s.date >= m0 && s.date <= t);
    const ms = k => sumBy(monthS, k);
    return `
    <div class="grid g4" style="margin-bottom:16px">
      <div class="kpi click" data-go="#/cashbook"><span>Cash & bank · closing now</span><b>${money0(cashTotal)}</b><small>Opening today ${money0(flowAll.opening)} · in ${money0(flowAll.inflow)} · out ${money0(flowAll.outflow)}</small></div>
      <div class="kpi click" data-go="#/orders"><span>Sales orders today</span><b>${money0(S.soValue || 0)}</b><small>${num(S.soCount)} orders · month ${money0(ms('soValue'))}</small></div>
      <div class="kpi click" data-go="#/invoices"><span>Invoiced today</span><b>${money0(S.invValue || 0)}</b><small>${num(S.invCount)} invoices · month ${money0(ms('invValue'))}</small></div>
      <div class="kpi click" data-go="#/deliveries"><span>Deliveries today</span><b>${delToday.length} <small style="display:inline;font-size:14px">of ${delToday.length + dueToday.length}</small></b><small>${late.length ? `<span style="color:var(--danger)">${late.length} late</span>` : 'none late'}</small></div>
      <div class="kpi"><span>Received today</span><b>${money0(S.receipts || 0)}</b><small>Expenses ${money0(S.expenses || 0)} · Supplier paid ${money0(S.payments || 0)}</small></div>
      <div class="kpi click" data-go="#/enquiries"><span>Walk-ins / enquiries today</span><b>${num(S.enquiries)}</b><small>month ${ms('enquiries')} · quoted ${money0(ms('quoteValue'))}</small></div>
      <div class="kpi click" data-go="#/customers"><span>Customers owe us</span><b>${money0(recv)}</b><small>We owe suppliers ${money0(pay)}</small></div>
      <div class="kpi click" data-go="#/followups"><span>Follow-ups</span><b>${fuToday} <small style="display:inline;font-size:14px">today</small></b><small>${fuOver ? `<span style="color:var(--danger)">${fuOver} overdue</span>` : 'none overdue'}</small></div>
    </div>
    <div class="grid" style="grid-template-columns:minmax(0,2fr) minmax(0,1fr);margin-bottom:16px" id="dRow2">
      <div class="panel"><div class="panel-h"><h2>Sales orders vs invoices</h2><div class="tabs" style="margin:0">${[['daily', 'Daily'], ['weekly', 'Weekly'], ['monthly', 'Monthly']].map(([k, l]) => `<button data-p="${k}" class="${k === dPeriod ? 'active' : ''}">${l}</button>`).join('')}</div></div><div id="dChart"></div></div>
      <div class="panel"><h2>💰 Daily cash closing</h2>
        ${closed ? `<div class="alert a-ok">✓ Today's cash is closed. Counted ${money(closed.counted)}${closed.diff ? ` · difference ${money(closed.diff)}` : ''} · by ${esc(closed.closedByName)}</div>` : `<div class="alert a-warn">Today's cash is not closed yet.</div><button class="btn btn-accent" data-go="#/cash" style="width:100%;justify-content:center;margin-bottom:12px">Close today's cash</button>`}
        <div class="hint">Closed up to: <b>${lock ? fmtDate(lock, { day: 'numeric', month: 'short', year: 'numeric' }) : 'never'}</b></div>
        <div class="tw" style="margin-top:12px"><table><thead><tr><th>Today</th><th class="num">Opening</th><th class="num">Closing</th></tr></thead><tbody>${acc.map(a => { const f = L.moneyFlow([a.id], t, t); return `<tr class="click" data-go="#/cashbook"><td>${esc(a.name)}</td><td class="num">${money0(f.opening)}</td><td class="num"><b>${money0(f.closing)}</b></td></tr>`; }).join('')}</tbody></table></div>
        <a class="btn btn-sm" href="#/cashbook" style="margin-top:10px">Open Cash Book</a></div>
    </div>
    ${todayPanel()}
    ${servicePanel()}
    <div class="grid g2" style="margin-bottom:16px">
      <div class="panel"><div class="panel-h"><h2>👥 Staff performance · this month</h2><a class="btn btn-sm" href="#/staff">Details</a></div>
        <div class="tw"><table><thead><tr><th>Salesman</th><th class="num">Walk-ins</th><th class="num">Converted</th><th class="num">Conv.</th><th class="num">Orders</th><th class="num hide-m">Overdue FU</th></tr></thead><tbody>
        ${perf.map(p => `<tr><td><b>${esc(p.name)}</b></td><td class="num">${p.enquiries}</td><td class="num">${p.converted}</td><td class="num">${p.conv.toFixed(0)}%</td><td class="num">${money0(p.soValue)}</td><td class="num hide-m" style="${p.overdue ? 'color:var(--danger);font-weight:700' : ''}">${p.overdue}</td></tr>`).join('') || `<tr><td colspan="6" class="muted">No activity yet this month.</td></tr>`}</tbody></table></div></div>
      <div class="panel"><div class="panel-h"><h2>🚚 Today's deliveries</h2><a class="btn btn-sm" href="#/deliveries">Schedule</a></div>
        ${[...late.map(o => [o, 'late']), ...dueToday.map(o => [o, 'due']), ...delToday.map(o => [o, 'done'])].map(([o, k]) => `<div class="list-item click" data-so="${o.id}"><div><div class="li-t">${esc(o.customerName)} · ${money0(o.total)}</div><div class="li-s"><span class="mono">${esc(o.no)}</span>${k === 'late' ? pill('unpaid', 'Late · ' + dateLong(o.deliveryDate)) : k === 'done' ? pill('delivered', 'Delivered') : pill('scheduled', esc(o.deliverySlot || 'Today'))}<span>${esc(o.deliveryAddress || '')}</span></div></div></div>`).join('') || empty('🚚', 'No deliveries today.')}</div>
    </div>
    <div class="grid g3">
      <div class="panel"><h2>📝 Enquiry pipeline</h2>${[['open', 'Open'], ['followup', 'In follow-up'], ['confirmed', 'Waiting for billing']].map(([k, l]) => { const a = pipe(k); return `<div class="list-item click" data-go="#/enquiries" style="padding:9px 11px"><span>${st(k)} ${l}</span><b>${a.length} · ${money0(sumBy(a, 'total'))}</b></div>`; }).join('')}</div>
      <div class="panel"><h2>📦 Stock</h2><div class="list-item" style="padding:9px 11px"><span>Inventory value (cost)</span><b>${money0((byId('accounts', L.ACC.inv) || {}).bal)}</b></div><div class="list-item" style="padding:9px 11px"><span>Committed to open orders</span><b>${money0(committedVal)}</b></div>
        ${short.length ? `<div class="alert a-bad" style="margin-top:8px">${short.length} item(s) sold more than in stock — order from suppliers:<br>${short.slice(0, 5).map(i => `<b>${esc(i.name)}</b> (need ${committed[i.id] - num(i.onHand)})`).join(', ')}</div>` : '<div class="alert a-ok" style="margin-top:8px">Stock covers all open orders.</div>'}</div>
      <div class="panel"><h2>📈 This month</h2>
        <div class="list-item" style="padding:9px 11px"><span>Invoiced sales</span><b>${money0(ms('invValue'))}</b></div><div class="list-item" style="padding:9px 11px"><span>Gross profit</span><b>${money0(ms('invValue') - ms('cogs'))}</b></div>
        <div class="list-item" style="padding:9px 11px"><span>Collected</span><b>${money0(ms('receipts'))}</b></div><div class="list-item" style="padding:9px 11px"><span>Expenses paid</span><b>${money0(ms('expenses'))}</b></div><div class="list-item" style="padding:9px 11px"><span>Purchases</span><b>${money0(ms('purchases'))}</b></div></div>
    </div>`;
  },
  after() { const h = $('dChart'); if (h) barChart(h, L.statsSeries(dPeriod), [{ key: 'so', label: 'Sales orders', color: '#2f5aa8' }, { key: 'inv', label: 'Invoices', color: '#e4572e' }]); if (window.innerWidth < 1100 && $('dRow2')) $('dRow2').style.gridTemplateColumns = 'minmax(0,1fr)'; },
  bind(root) {
    root.addEventListener('click', e => {
      const p = e.target.closest('[data-p]'); if (p) { dPeriod = p.dataset.p; return rr(); }
      const g = e.target.closest('[data-go]'); if (g) { location.hash = g.dataset.go; return; }
      const o = e.target.closest('[data-so]'); if (o) openSO(byId('salesOrders', o.dataset.so));
    });
  }
};

/* ================= Money in / out ================= */
let mTab = 'receipts';
export const money_ = {
  title: 'Money In & Out', icon: '💵', roles: ['admin', 'manager', 'billing'],
  head: () => `<button class="btn btn-ok" data-a="rcv">＋ Receive payment</button><button class="btn" data-a="pay">Pay supplier</button><button class="btn" data-a="exp">＋ Expense</button><button class="btn" data-a="trf">⇄ Transfer</button><button class="btn" data-a="ref">Refund</button>${salOK() && L.may('hrpay', 'edit') ? '<button class="btn" data-a="sal">👥 Pay staff</button>' : ''}`,
  body() {
    const tabs = [['receipts', 'Received'], ['payments', 'Paid to suppliers'], ['expenses', 'Expenses'], ['transfers', 'Transfers'], ...(salOK() ? [['salaries', 'Staff payments']] : [])];
    if (mTab === 'salaries' && !salOK()) mTab = 'receipts';
    if (mTab === 'salaries') return `<div class="tabs">${tabs.map(([k, l]) => `<button data-t="${k}" class="${k === mTab ? 'active' : ''}">${l}</button>`).join('')}</div>${salariesTab()}`;
    const acts = r => `<td class="nowrap" style="text-align:right"><button class="icon-btn" data-tv="${r.id}" title="View with journal entry">👁</button>${L.may('money', 'edit') ? `<button class="icon-btn" data-te="${r.id}" title="Edit">✎</button>` : ''}${L.may('money', 'delete') ? `<button class="icon-btn" data-td="${r.id}" title="Delete">🗑</button>` : ''}</td>`;
    let rows = '', list = all(mTab).sort((a, b) => b.date.localeCompare(a.date) || (b.createdAt || 0) - (a.createdAt || 0));
    const no = r => `<td class="nowrap"><b class="mono">${esc(r.no)}</b>${clip(r)}<div class="muted" style="font-size:11px">${fmtDate(r.date)}${r.editedAt ? ' · edited' : ''}</div></td>`;
    if (mTab === 'receipts') rows = `<thead><tr><th>Receipt</th><th>Customer</th><th class="hide-m">For</th><th>In</th><th class="num">Amount</th><th></th></tr></thead><tbody>${list.map(r => `<tr class="click" data-tv="${r.id}">${no(r)}<td>${esc(r.customerName)}</td><td class="hide-m">${esc(r.refNo || (r.against === 'refund' ? 'Refund' : 'On account'))} ${esc(r.mode || '')}</td><td>${esc(r.accountName)}</td><td class="num">${money(r.amount)}</td>${acts(r)}</tr>`).join('')}</tbody>`;
    if (mTab === 'payments') rows = `<thead><tr><th>Payment</th><th>Supplier</th><th class="hide-m">Bill</th><th>From</th><th class="num">Amount</th><th></th></tr></thead><tbody>${list.map(r => `<tr class="click" data-tv="${r.id}">${no(r)}<td>${esc(r.supplierName)}</td><td class="hide-m">${esc(r.refNo || '')}${num(r.unallocated) > 0.009 ? ` <span class="pill p-followup">Advance ${money0(r.unallocated)}</span>` : ''}</td><td>${esc(r.accountName)}</td><td class="num">${money(r.amount)}</td>${acts(r)}</tr>`).join('')}</tbody>`;
    if (mTab === 'expenses') rows = `<thead><tr><th>Expense</th><th>Type</th><th class="hide-m">Paid to / note</th><th>From</th><th class="num">Amount</th><th></th></tr></thead><tbody>${list.map(r => `<tr class="click" data-tv="${r.id}">${no(r)}<td>${esc(r.expenseName)}</td><td class="hide-m">${esc([r.payee, r.note].filter(Boolean).join(' · '))}</td><td>${esc(r.fromName)}</td><td class="num">${money(r.amount)}</td>${acts(r)}</tr>`).join('')}</tbody>`;
    if (mTab === 'transfers') rows = `<thead><tr><th>Transfer</th><th>From</th><th>To</th><th class="hide-m">Note</th><th class="num">Amount</th><th></th></tr></thead><tbody>${list.map(r => `<tr class="click" data-tv="${r.id}">${no(r)}<td>${esc(L.accName(r.from))}</td><td>${esc(L.accName(r.to))}</td><td class="hide-m">${esc(r.note || '')}</td><td class="num">${money(r.amount)}</td>${acts(r)}</tr>`).join('')}</tbody>`;
    return `<div class="tabs">${tabs.map(([k, l]) => `<button data-t="${k}" class="${k === mTab ? 'active' : ''}">${l}</button>`).join('')}</div>
      <div class="tw"><table>${rows}${list.length ? `<tfoot><tr><td colspan="4">${list.length} entries</td><td class="num">${money(sumBy(list, 'amount'))}</td><td></td></tr></tfoot>` : `<tbody><tr><td colspan="6">${empty('💵', 'Nothing recorded yet.')}</td></tr></tbody>`}</table></div>
      <p class="hint" style="margin-top:8px">👁 shows the entry with its journal entry · ✎ edit · 🗑 delete. Entries on a day that is already cash-closed are locked.</p>`;
  },
  bind(root) {
    root.addEventListener('click', e => {
      const t = e.target.closest('[data-t]'); if (t) { mTab = t.dataset.t; return rr(); }
      const ed = e.target.closest('[data-te]'); if (ed) { e.stopPropagation(); const d = byId(mTab, ed.dataset.te); return d && editTxn(mTab, d); }
      const dl = e.target.closest('[data-td]'); if (dl) { e.stopPropagation(); const d = byId(mTab, dl.dataset.td); return d && deleteTxnDialog(mTab, d); }
      const v = e.target.closest('[data-tv]'); if (v) { const d = byId(mTab, v.dataset.tv); return d && openTxn(mTab, d); }
      const a = e.target.closest('[data-a]')?.dataset.a;
      const svp = e.target.closest('[data-svp]'); if (svp) { e.stopPropagation(); const p = H.staffPayments().filter(x => !sType || x.type === sType)[+svp.dataset.svp]; if (p) printVouchers([voucherFromStaff(p)]); return; }
      const sj = e.target.closest('[data-sj]'); if (sj) { if (sj.dataset.sj) return import('./views-hr-pay.js').then(m => m.openHrJournal(sj.dataset.sj)); window.__hrPayMonth = sj.dataset.sm; location.hash = '#/hrpay'; return; }
      const sty = e.target.closest('[data-sty]'); if (sty) { sType = sty.dataset.sty; return rr(); }
      if (a === 'sal') return import('./views-hr-pay.js').then(m => m.staffPayDialog({}));
      if (a === 'salpay') return import('./views-hr-pay.js').then(m => m.salaryPayDialog({}));
      if (a === 'rcv') receiveDialog({}); if (a === 'pay') payDialog({}); if (a === 'exp') expenseDialog(); if (a === 'trf') transferDialog(); if (a === 'ref') refundDialog();
    });
  }
};
const salOK = () => H.hrAccess() && H.allowedView('hrpay');
function salariesTab() {
  const dues = H.salaryDues(), owed = r2(dues.reduce((t, d) => t + d.due, 0)), pays = H.staffPayments().filter(p => !sType || p.type === sType), pe = L.may('hrpay', 'edit');
  const types = [...new Set(H.staffPayments().map(p => p.type))], byM = {}; dues.forEach(d => { byM[d.month] = (byM[d.month] || 0) + 1; });
  return `${dues.length ? `<div class="alert a-warn" style="display:flex;justify-content:space-between;gap:10px;align-items:center;flex-wrap:wrap"><span><b>${dues.length} salar${dues.length === 1 ? 'y' : 'ies'} waiting to be paid · ${money(owed)}</b><br><span style="font-size:12px">${Object.entries(byM).map(([m, n]) => esc(H.monthLabel(m)) + ': ' + n).join(' · ')}${dues.some(d => d.paidSoFar) ? ' · includes part-paid salaries' : ''}</span></span>${pe ? '<button class="btn btn-ok" data-a="salpay">💵 Pay salaries</button>' : ''}</div>` : ''}
    ${types.length > 1 ? `<div class="chips" style="margin-bottom:10px"><button class="chip${!sType ? ' active' : ''}" data-sty="">All</button>${types.map(t => `<button class="chip${t === sType ? ' active' : ''}" data-sty="${esc(t)}">${esc(t)}</button>`).join('')}</div>` : ''}
    <div class="tw"><table><thead><tr><th>Paid on</th><th>Staff</th><th>Type</th><th class="hide-m">For</th><th class="hide-m">Method · from</th><th class="num">Amount</th><th></th></tr></thead><tbody>
    ${pays.map((p, i) => `<tr class="click" data-sj="${p.journalId || ''}" data-sm="${p.month || ''}"><td class="nowrap">${fmtDate(p.date)}${p.ref ? `<div class="muted" style="font-size:11px">${esc(p.ref)}</div>` : ''}</td><td>${esc(p.name)}</td><td>${pill(p.type === 'Salary' ? 'paid' : p.type === 'Advance' || p.type === 'Loan' ? 'followup' : 'scheduled', p.type)}</td><td class="hide-m" style="font-size:12px">${esc(p.forText || '')}</td><td class="hide-m" style="font-size:12px">${esc(H.PAY_METHODS[p.method] || p.method || '')}${p.accountId ? ' · ' + esc(L.accName(p.accountId)) : ''}</td><td class="num">${money(p.amount)}</td><td style="text-align:right"><button class="icon-btn" data-svp="${i}" title="Print payment voucher">🖨</button></td></tr>`).join('') || `<tr><td colspan="7">${empty('👥', 'No staff payments yet.')}</td></tr>`}</tbody>
    ${pays.length ? `<tfoot><tr><td colspan="5">${pays.length} payments</td><td class="num">${money(r2(pays.reduce((t, p) => t + num(p.amount), 0)))}</td><td></td></tr></tfoot>` : ''}</table></div>
    <p class="hint" style="margin-top:8px">“👥 Pay staff” pays a salary, advance, loan, incentive, bonus, allowance or commission. Every employee has their own “Salary Payable – name” account in the chart of accounts. Tap a payment to see its journal entry, or 🖨 to print its payment voucher with the receiver's signature. Salary payments are undone from HR &amp; Payroll → Payroll → the person; incentives paid ahead from Incentives, Bonus &amp; Allowances.</p>`;
}
let sType = '';
/* ---- view / edit / delete a money entry ---- */
export function openTxn(coll, d) {
  d = byId(coll, d.id) || d;
  const kv = (k, v) => v ? `<div><div class="hint">${k}</div><b>${v}</b></div>` : '';
  const info = {
    receipts: () => [kv(num(d.amount) < 0 ? 'Refunded to' : 'Received from', esc(d.customerName)), kv('Amount', money(Math.abs(d.amount))), kv(num(d.amount) < 0 ? 'Paid from' : 'Received in', esc(d.accountName)), kv('Against', esc(d.refNo || (d.against === 'refund' ? 'Refund' : 'On account'))), kv('Mode', esc(d.mode || '')), kv('Note', esc(d.note || ''))],
    payments: () => [kv('Paid to', esc(d.supplierName)), kv('Amount', money(d.amount)), kv('Paid from', esc(d.accountName)), kv('Bills', esc(L.payAllocs(d).map(a => a.no + ' ' + money0(a.amount)).join(', ') || '—')), kv('Advance left', num(d.unallocated) > 0.009 ? money(d.unallocated) : ''), kv('Note', esc(d.note || ''))],
    expenses: () => [kv('Expense account', esc(d.expenseName)), kv('Amount', money(d.amount)), kv('Paid from', esc(d.fromName)), kv('Paid to', esc(d.payee || '')), kv('Note', esc(d.note || ''))],
    transfers: () => [kv('From', esc(L.accName(d.from))), kv('To', esc(L.accName(d.to))), kv('Amount', money(d.amount)), kv('Note', esc(d.note || ''))]
  }[coll]();
  const body = `<div class="li-s" style="margin:-4px 0 12px"><span>${fmtDate(d.date, { day: 'numeric', month: 'short', year: 'numeric' })}</span><span>Entered by ${esc(L.nm(d.createdBy))}</span>${d.editedAt ? `<span>Edited by ${esc(L.nm(d.editedBy))}</span>` : ''}</div>
    <div class="grid g3" style="gap:12px">${info.join('')}</div>${coll === 'payments' || coll === 'expenses' ? recordFiles(coll, d.id, L.may('money', 'edit')) : ''}${journalHTML(d.no)}
    ${historyHTML(d.id)}${(d.edits || []).length ? `<h3 style="margin:14px 0 6px;font-size:14px">Change history</h3><ul class="tlog">${d.edits.map(x => `<li><b>${fmtDate(today(new Date(x.at)))}</b> · ${esc(L.nm(x.by))}: before — ${fmtDate(x.before.date)}, ${money(x.before.amount)}</li>`).join('')}</ul>` : ''}`;
  openModal(L.TXN[coll] + ' ' + d.no, body, [{ label: '🗑 Delete', cls: 'btn-danger', perm: 'money:delete', onClick: () => { setTimeout(() => deleteTxnDialog(coll, d), 50); } }, { label: '✎ Edit', perm: 'money:edit', onClick: () => { setTimeout(() => editTxn(coll, d), 50); } }, ...(coll === 'payments' || coll === 'expenses' ? [{ label: '🖨 Print voucher', onClick: async () => { await printVouchers([voucherFromTxn(coll, byId(coll, d.id) || d)]); return false; } }] : []), { label: 'Close' }], { wide: true, onOpen: bindRecordFiles });
}
function deleteTxnDialog(coll, d) {
  openModal('Delete ' + d.no + '?', `<p style="margin:0 0 10px;line-height:1.55">This removes the ${L.TXN[coll].toLowerCase()} of <b>${money(Math.abs(num(d.amount ?? d.total)))}</b> and its journal entry from the books.${coll === 'receipts' && d.against === 'invoice' ? ` Invoice ${esc(d.refNo)} will show as unpaid again by this amount.` : ''}${coll === 'payments' && L.payAllocs(d).length ? ` Bills ${esc(L.payAllocs(d).map(a => a.no).join(', '))} will show as unpaid again.` : ''}${coll === 'purchases' ? ' Stock for its items goes down again.' : ''} A copy is kept in the deleted-entries log.</p>${field('Reason', input('dtWhy', '', 'placeholder="e.g. Entered twice"'))}`,
    [{ label: 'Cancel' }, { label: 'Delete', cls: 'btn-danger', onClick: async () => { if (!val('dtWhy').trim()) throw Error('Write the reason for deleting.'); await L.deleteTxn(coll, d, val('dtWhy')); toast(d.no + ' deleted.'); } }]);
}
function editTxn(coll, d) {
  const moneyOpts = moneyAcc();
  const f = {
    receipts: () => `<div class="row2">${field('Amount', input('teAmt', Math.abs(num(d.amount)), 'type="number" step=".01" min="0" inputmode="decimal"'))}${field('Date', input('teDate', d.date, 'type="date"'))}</div><div class="row2">${field(num(d.amount) < 0 ? 'Paid from' : 'Received in', select('teAcc', moneyOpts, d.accountId))}${field('Mode / reference', input('teMode', d.mode || ''))}</div>${field('Note', input('teNote', d.note || ''))}`,
    payments: () => `<div class="row2">${field('Amount', input('teAmt', d.amount, 'type="number" step=".01" min="0" inputmode="decimal"'))}${field('Date', input('teDate', d.date, 'type="date"'))}</div><div class="row2">${field('Paid from', select('teAcc', moneyOpts, d.accountId))}${field('Note / reference', input('teNote', d.note || ''))}</div>${L.payAllocs(d).length ? `<p class="hint">Set against bills: ${esc(L.payAllocs(d).map(a => a.no + ' ' + money0(a.amount)).join(', '))}. To change which bills, delete this payment and enter it again.</p>` : ''}`,
    expenses: () => `<div class="row2">${field('Expense account', expenseSelect().replace('id="exAcc"', 'id="teExp"').replace(`value="${d.expenseAcc}"`, `value="${d.expenseAcc}" selected`))}${field('Amount', input('teAmt', d.amount, 'type="number" step=".01" min="0" inputmode="decimal"'))}</div><div class="row2">${field('Paid from', select('teAcc', moneyOpts, d.fromAcc))}${field('Date', input('teDate', d.date, 'type="date"'))}</div><div class="row2">${field('Paid to', input('tePayee', d.payee || ''))}${field('Note', input('teNote', d.note || ''))}</div>`,
    transfers: () => `<div class="row2">${field('From', select('teFrom', moneyOpts, d.from))}${field('To', select('teTo', moneyOpts, d.to))}</div><div class="row2">${field('Amount', input('teAmt', d.amount, 'type="number" step=".01" min="0" inputmode="decimal"'))}${field('Date', input('teDate', d.date, 'type="date"'))}</div>${field('Note', input('teNote', d.note || ''))}`
  }[coll]();
  openModal('Edit ' + d.no, f + '<p class="hint" style="margin-top:6px">The journal entry is updated to match. The previous date and amount are kept in the change history.</p>',
    [{ label: 'Cancel' }, { label: 'Save changes', cls: 'btn-ink', onClick: async () => {
      await L.updateTxn(coll, d, { amount: val('teAmt'), date: val('teDate'), note: val('teNote'), accountId: $('teAcc')?.value, mode: $('teMode')?.value, expenseAcc: $('teExp')?.value, fromAcc: $('teAcc')?.value, payee: $('tePayee')?.value, from: $('teFrom')?.value, to: $('teTo')?.value });
      toast(d.no + ' updated.'); setTimeout(() => openTxn(coll, d), 60);
    } }]);
}
/* ---- bill-wise supplier payments ---- */
// Table of a supplier's unpaid bills (and opening balance) with a tick + amount for each. Returns helpers.
function billPicker(host, supplierId, { pre = {}, onChange } = {}) {
  const dues = supplierId ? L.supplierDues(supplierId) : [];
  if (!supplierId) { host.innerHTML = '<div class="hint">Choose the supplier to see their unpaid bills.</div>'; return { get: () => [], fill: () => 0, total: () => 0, count: 0 }; }
  if (!dues.length) { host.innerHTML = '<div class="alert a-ok" style="margin:0">No unpaid bills for this supplier.</div>'; return { get: () => [], fill: () => 0, total: () => 0, count: 0 }; }
  const overdue = d => d.dueDate && d.dueDate < today();
  host.innerHTML = `<div class="tw"><table class="bp-t"><thead><tr><th style="width:34px"></th><th>Bill</th><th class="hide-m">Date</th><th class="num hide-m">Bill total</th><th class="num">Balance</th><th class="num" style="width:130px">Pay now</th></tr></thead><tbody>
    ${dues.map(d => `<tr data-ref="${d.refId}"><td><input type="checkbox" class="bp-c"${pre[d.refId] ? ' checked' : ''}></td><td><b class="mono">${esc(d.no)}</b>${d.billNo ? `<div class="muted" style="font-size:11px">Bill ${esc(d.billNo)}</div>` : ''}${d.dueDate ? `<div style="font-size:11px" class="${overdue(d) ? 'p-unpaid pill' : 'muted'}">Due ${fmtDate(d.dueDate)}</div>` : ''}</td>
      <td class="hide-m nowrap">${fmtDate(d.date)}</td><td class="num hide-m">${money(d.total)}</td><td class="num nowrap"><b>${money(d.balance)}</b></td><td><input class="inp inp-sm num bp-a" type="number" min="0" step=".01" inputmode="decimal" value="${pre[d.refId] || ''}"></td></tr>`).join('')}</tbody>
    <tfoot><tr><td></td><td>${dues.length} unpaid</td><td class="hide-m"></td><td class="num hide-m"></td><td class="num">${money(dues.reduce((x, d) => x + d.balance, 0))}</td><td class="num bp-tot"></td></tr></tfoot></table></div>`;
  const rows = [...host.querySelectorAll('tr[data-ref]')], D = new Map(dues.map(d => [d.refId, d]));
  const total = () => r2(rows.reduce((x, r) => x + (r.querySelector('.bp-c').checked ? num(r.querySelector('.bp-a').value) : 0), 0));
  const changed = () => { host.querySelector('.bp-tot').innerHTML = `<b>${money(total())}</b>`; onChange && onChange(total()); };
  host.addEventListener('change', e => { const r = e.target.closest('tr[data-ref]'); if (!r) return; if (e.target.classList.contains('bp-c')) { const a = r.querySelector('.bp-a'); a.value = e.target.checked ? D.get(r.dataset.ref).balance : ''; } changed(); });
  host.addEventListener('input', e => { const r = e.target.closest('tr[data-ref]'); if (r && e.target.classList.contains('bp-a')) { r.querySelector('.bp-c').checked = num(e.target.value) > 0; changed(); } });
  changed();
  return {
    count: dues.length, total,
    get: () => rows.filter(r => r.querySelector('.bp-c').checked && num(r.querySelector('.bp-a').value) > 0).map(r => { const d = D.get(r.dataset.ref); return { refType: d.refType, refId: d.refId, no: d.no, amount: r2(r.querySelector('.bp-a').value) }; }),
    fill: amt => { let left = r2(amt); rows.forEach(r => { const d = D.get(r.dataset.ref), take = r2(Math.max(0, Math.min(left, d.balance))); r.querySelector('.bp-c').checked = take > 0; r.querySelector('.bp-a').value = take > 0 ? take : ''; left = r2(left - take); }); changed(); return left; }
  };
}
export function payDialog({ supplierId, purchaseId, amount }) {
  let pick, bp, att, sid = supplierId || (purchaseId ? byId('purchases', purchaseId)?.supplierId : '') || '', mode = 'bills', autoAmt = true;
  const pre = purchaseId ? { [purchaseId]: num(amount) || num(byId('purchases', purchaseId)?.balance) } : {};
  openModal('Pay supplier', `<div id="pyWrap">${field('Supplier', '<div id="pyParty"></div>')}<div id="pyAdv"></div>
    <div class="field"><label>Payment is for</label><div class="seg" id="pyMode"><button type="button" data-m="bills" class="active">Against bills</button><button type="button" data-m="adv">Advance (no bill yet)</button></div></div>
    <div id="pyBillsBox"><div id="pyBills"></div><div style="display:flex;gap:8px;align-items:center;margin:8px 0 4px;flex-wrap:wrap"><button type="button" class="btn btn-sm" id="pyFill">Fill oldest bills from amount</button><span class="hint">Tick bills to pay in full, or type a part amount.</span></div></div>
    <div class="row2">${field('Amount paid', input('pyAmt', amount > 0 ? amount : '', 'type="number" min="0" step=".01" inputmode="decimal"'))}${field('Date', input('pyDate', today(), 'type="date"'))}</div>
    <div class="row2">${field('Paid from', select('pyAcc', moneyAcc(), L.ACC.cash))}${field('Note / reference', input('pyNote', '', 'placeholder="Cheque no., UPI ref…"'))}</div><div id="pySum"></div>
    <div class="field" style="margin-top:8px"><label>Attachments</label><div id="pyFiles"></div></div></div>`,
    [{ label: 'Cancel' }, ...[['🖨 Save & print', 'btn-accent', true], ['Save payment', 'btn-ink', false]].map(([label, cls, pr]) => ({ label, cls, onClick: async () => {
      if (!sid) throw Error('Choose the supplier.');
      const al = mode === 'bills' && bp ? bp.get() : [], amt = r2(val('pyAmt'));
      if (att && att.busy()) throw Error('Wait for the file to finish uploading.');
      const no = await L.paySupplier({ supplierId: sid, amount: amt, accountId: val('pyAcc'), date: val('pyDate'), note: val('pyNote'), allocations: al, files: att ? att.get() : [] });
      const adv = r2(amt - al.reduce((x, a) => x + a.amount, 0)); toast(`${no} saved${al.length ? ' · ' + al.length + ' bill' + (al.length > 1 ? 's' : '') + ' settled' : ''}${adv > 0.009 ? ' · advance ' + money(adv) : ''}.`);
      if (pr) { const d = all('payments').find(x => x.no === no); if (d) await printVouchers([voucherFromTxn('payments', d)]); }
    } }))],
    { wide: true, onOpen: () => {
      const sum = () => { const amt = r2(val('pyAmt')), b = mode === 'bills' && bp ? bp.total() : 0, adv = r2(amt - b);
        $('pySum').innerHTML = !amt ? '' : mode === 'bills' && bp && bp.count && !b ? `<div class="alert a-warn" style="margin:0">No bill ticked — the whole <b>${money(amt)}</b> will be kept as an advance. Tick bills above, or press “Fill oldest bills from amount”.</div>` : adv < -0.009 ? `<div class="alert a-bad" style="margin:0">Bills ticked (${money(b)}) are more than the amount paid. Increase the amount or reduce the bills.</div>` : `<div class="alert a-info" style="margin:0">${b ? `Against bills <b>${money(b)}</b>` : ''}${b && adv > 0.009 ? ' · ' : ''}${adv > 0.009 ? `Kept as advance <b>${money(adv)}</b> — you can settle it against bills later` : ''}</div>`; };
      const loadBills = () => {
        const s = sid ? byId('suppliers', sid) : null; L.derive(true);
        $('pyAdv').innerHTML = s && num(s.advance) > 0.009 ? `<div class="alert a-warn" style="display:flex;justify-content:space-between;gap:8px;align-items:center;flex-wrap:wrap"><span>${esc(s.name)} already has <b>${money(s.advance)}</b> paid in advance.</span><button type="button" class="btn btn-sm" id="pyUseAdv">Settle advance against bills</button></div>` : '';
        if ($('pyUseAdv')) $('pyUseAdv').onclick = () => { closeModal(); setTimeout(() => settleDialog({ supplierId: sid }), 50); };
        bp = billPicker($('pyBills'), sid, { pre, onChange: t => { if (autoAmt && mode === 'bills') $('pyAmt').value = t || ''; sum(); } });
      };
      pick = partyPicker($('pyParty'), 'supplier', sid, c => { sid = c ? c.id : ''; autoAmt = true; Object.keys(pre).forEach(k => delete pre[k]); loadBills(); sum(); });
      $('pyMode').onclick = e => { const b = e.target.closest('[data-m]'); if (!b) return; mode = b.dataset.m; $('pyMode').querySelectorAll('button').forEach(x => x.classList.toggle('active', x === b)); $('pyBillsBox').hidden = mode !== 'bills'; sum(); };
      $('pyAmt').oninput = () => { autoAmt = !val('pyAmt'); sum(); };
      $('pyFill').onclick = () => { if (!bp) return; const amt = r2(val('pyAmt')); if (!amt) return toast('Enter the amount paid first.', 'warn'); autoAmt = false; bp.fill(amt); sum(); };
      loadBills(); sum(); att = attachField($('pyFiles'));
    } });
}
export function settleDialog({ supplierId, purchaseId }) {
  L.derive(true); const s = byId('suppliers', supplierId); if (!s) return;
  const adv = num(s.advance); if (!(adv > 0.009)) return toast('This supplier has no advance to settle.', 'warn');
  let bp; const pb = purchaseId ? byId('purchases', purchaseId) : null;
  const pre = pb ? { [pb.id]: r2(Math.min(adv, pb.balance)) } : {};
  openModal('Settle advance · ' + s.name, `<div id="stWrap"><div class="alert a-info">Advance available: <b>${money(adv)}</b>. Settling links this advance to bills. No cash moves, and the supplier's total balance stays the same.</div>
    <div id="stBills"></div><div style="display:flex;gap:8px;align-items:center;margin:8px 0;flex-wrap:wrap"><button type="button" class="btn btn-sm" id="stFill">Use full advance on oldest bills</button></div>
    <div class="row2">${field('Settlement date', input('stDate', today(), 'type="date"'))}<div id="stSum" style="align-self:end"></div></div></div>`,
    [{ label: 'Cancel' }, { label: 'Settle', cls: 'btn-ok', onClick: async () => { const al = bp.get(); if (!al.length) throw Error('Tick at least one bill.'); const t = await L.settleAdvance({ supplierId, allocations: al, date: val('stDate') }); toast(`${money(t)} of advance settled against ${al.length} bill${al.length > 1 ? 's' : ''}.`); } }],
    { wide: true, onOpen: () => {
      const sum = t => { $('stSum').innerHTML = t > adv + 0.009 ? `<div class="alert a-bad" style="margin:0">More than the advance (${money(adv)}).</div>` : `<div class="hint">Settling <b>${money(t)}</b> · advance left <b>${money(r2(adv - t))}</b></div>`; };
      bp = billPicker($('stBills'), supplierId, { pre, onChange: sum });
      $('stFill').onclick = () => { bp.fill(adv); };
    } });
}
function expenseSelect() {
  const ex = all('accounts').filter(a => a.type === 'expense' && !['cogs', 'stockadj', 'cashdiff'].includes(a.group)).sort((a, b) => a.code.localeCompare(b.code));
  return `<select id="exAcc">${[['Operating expenses', L.isOpex], ['Cost of sales', L.isCOS], ['Non-operating expenses', L.isNonOpExp]].map(([l, f]) => { const a = ex.filter(f); return a.length ? `<optgroup label="${l}">${a.map(x => `<option value="${x.id}">${esc(x.code + ' · ' + x.name)}</option>`).join('')}</optgroup>` : ''; }).join('')}</select>`;
}
function expenseDialog() {
  openModal('Add expense', `<div class="row2">${field('Expense account', expenseSelect())}${field('Amount', input('exAmt', '', 'type="number" min="0" step=".01" inputmode="decimal"'))}</div>
    <div class="row2">${field('Paid from', select('exFrom', moneyAcc(), L.ACC.cash))}${field('Date', input('exDate', today(), 'type="date"'))}</div><div class="row2">${field('Paid to', input('exPayee'))}${field('Note', input('exNote'))}</div>`,
    [{ label: 'Cancel' }, ...[['🖨 Save & print', 'btn-accent', true], ['Save expense', 'btn-ink', false]].map(([label, cls, pr]) => ({ label, cls, onClick: async () => { const no = await L.addExpense({ date: val('exDate'), expenseAcc: val('exAcc'), fromAcc: val('exFrom'), amount: val('exAmt'), payee: val('exPayee'), note: val('exNote') }); toast('Expense saved.'); if (pr) { const d = all('expenses').find(x => x.no === no); if (d) await printVouchers([voucherFromTxn('expenses', d)]); } } }))]);
}
function transferDialog() {
  openModal('Transfer between cash & bank', `<div class="row2">${field('From', select('tFrom', moneyAcc(), L.ACC.cash))}${field('To', select('tTo', moneyAcc(), L.ACC.bank))}</div><div class="row2">${field('Amount', input('tAmt', '', 'type="number" min="0" step=".01" inputmode="decimal"'))}${field('Date', input('tDate', today(), 'type="date"'))}</div>${field('Note', input('tNote', '', 'placeholder="e.g. Cash deposited to bank"'))}`,
    [{ label: 'Cancel' }, { label: 'Save transfer', cls: 'btn-ink', onClick: async () => { await L.transferMoney({ date: val('tDate'), from: val('tFrom'), to: val('tTo'), amount: val('tAmt'), note: val('tNote') }); toast('Transfer saved.'); } }]);
}
function refundDialog() {
  let pick;
  openModal('Refund to customer', `${field('Customer', '<div id="rfParty"></div>')}<div class="row2">${field('Amount', input('rfAmt', '', 'type="number" min="0" step=".01"'))}${field('Paid from', select('rfAcc', moneyAcc(), L.ACC.cash))}</div><div class="row2">${field('Date', input('rfDate', today(), 'type="date"'))}${field('Reason', input('rfNote', '', 'placeholder="e.g. Order cancelled"'))}</div>`,
    [{ label: 'Cancel' }, { label: 'Save refund', cls: 'btn-danger', onClick: async () => { const id = pick(); if (!id) throw Error('Choose the customer.'); await L.refundCustomer({ customerId: id, amount: val('rfAmt'), accountId: val('rfAcc'), date: val('rfDate'), note: val('rfNote') }); toast('Refund saved.'); } }], { onOpen: () => { pick = partyPicker($('rfParty'), 'customer'); } });
}

/* ================= Purchases ================= */
let pFilter = 'due';
export const purchases = {
  title: 'Purchases', icon: '📥', roles: ['admin', 'manager', 'billing'],
  head: () => `<button class="btn btn-accent" data-a="newp">＋ New purchase bill</button>`,
  body() {
    const list = all('purchases'), g = { due: p => ['unpaid', 'partial'].includes(p.status), paid: p => p.status === 'paid', all: () => true, dn: () => false }, lab = { all: 'All', due: 'To pay', paid: 'Paid', dn: 'Purchase returns (debit notes)' };
    const shown = list.filter(g[pFilter]).sort((a, b) => b.date.localeCompare(a.date));
    return `<div class="chips" style="margin-bottom:12px">${Object.keys(lab).map(k => `<button class="chip${k === pFilter ? ' active' : ''}" data-f="${k}">${lab[k]}<small>${k === 'dn' ? all('debitNotes').length : list.filter(g[k]).length}</small></button>`).join('')}</div>
      ${pFilter === 'dn' ? (notesTable('debitNotes', all('debitNotes').sort((a, b) => b.date.localeCompare(a.date))) || empty('↩', 'No purchase returns yet. Open a purchase bill and press “Purchase return”.')) : `<div class="tw"><table><thead><tr><th>Bill</th><th>Supplier</th><th class="hide-m">Items</th><th class="num">Total</th><th class="num">Balance</th><th class="hide-m">Due</th><th></th></tr></thead><tbody>
      ${shown.map(p => `<tr class="click" data-p="${p.id}"><td class="nowrap"><b class="mono">${esc(p.no)}</b>${clip(p)}<div class="muted" style="font-size:11px">${fmtDate(p.date)}${p.billNo ? ' · ' + esc(p.billNo) : ''}</div></td><td>${esc(p.supplierName)}</td><td class="hide-m">${p.lines.length} lines · ${sumBy(p.lines, 'qty')} pcs</td><td class="num">${money0(p.total)}</td><td class="num">${money0(p.balance)}</td><td class="hide-m">${p.dueDate ? fmtDate(p.dueDate) : ''}</td><td>${st(p.status)}</td></tr>`).join('') || `<tr><td colspan="7">${empty('📥', 'No purchase bills here.')}</td></tr>`}</tbody></table></div>`}`;
  },
  bind(root) {
    root.addEventListener('click', e => {
      if (e.target.closest('[data-a=newp]')) return purchaseEditor();
      const f = e.target.closest('[data-f]'); if (f) { pFilter = f.dataset.f; return rr(); }
      const n = e.target.closest('[data-note]'); if (n) return openDebitNote(byId('debitNotes', n.dataset.note));
      const p = e.target.closest('[data-p]'); if (p) openPurchase(byId('purchases', p.dataset.p));
    });
  }
};
// opts (receiving a purchase order): { poId, supplierId, lines }
export function purchaseEditor(opts = {}) {
  let pick, le, att;
  const po = opts.poId ? byId('purchaseOrders', opts.poId) : null;
  openModal(po ? 'Convert ' + po.no + ' to purchase' : 'New purchase bill', `${po ? `<div class="alert a-info" style="margin-bottom:10px">Purchase bill from order <b>${esc(po.no)}</b>: supplier, items and costs are filled in from the order, with the quantities still to come. Add the supplier's bill no., change quantities or costs to what actually arrived, and save — stock and accounts update. Anything not received stays open on the order.</div>` : ''}${field('Supplier', '<div id="pbParty"></div>')}<div class="row3">${field("Supplier's bill no.", input('pbNo'))}${field('Bill date', input('pbDate', today(), 'type="date"'))}${field('Payment due', input('pbDue', '', 'type="date"'))}</div>
    <div class="field"><label>Items received (stock goes up; cost is averaged)</label><div id="pbLines"></div></div>
    <div class="row3">${field('Transport / other charges', input('pbExtra', '', 'type="number" min="0" step=".01"'))}${field('Paid now', input('pbPaid', '', 'type="number" min="0" step=".01"'))}${field('Paid from', select('pbAcc', moneyAcc(), L.ACC.cash))}</div><div id="pbAdv"></div>
    <div class="field"><label>Attachments</label><div id="pbFiles"></div></div>`,
    [{ label: 'Cancel' }, { label: 'Save bill', cls: 'btn-ok', onClick: async () => { if (att && att.busy()) throw Error('Wait for the file to finish uploading.'); const sid = pick(); if (!sid) throw Error('Choose the supplier.');
      const lines = le.get().lines, total = r2(lines.reduce((x, l) => x + num(l.qty) * num(l.rate), 0) + num(val('pbExtra'))), useAdv = $('pbUseAdv')?.checked ? r2(Math.min(num($('pbAdvAmt').value), Math.max(0, total - num(val('pbPaid'))))) : 0;
      const id = await L.savePurchase({ poId: po ? po.id : '', supplierId: sid, billNo: val('pbNo'), date: val('pbDate'), dueDate: val('pbDue'), lines, extra: val('pbExtra'), paidNow: val('pbPaid'), paidFrom: val('pbAcc'), useAdvance: useAdv, files: att ? att.get() : [] }); toast('Purchase saved — stock updated' + (useAdv ? ` · advance ${money(useAdv)} settled` : '') + '.'); setTimeout(() => { const p = byId('purchases', id); if (p) openPurchase(p); }, 300); } }],
    { wide: true, onOpen: () => {
      const advBox = c => { L.derive(true); const sp = c ? byId('suppliers', c.id) : null, adv = sp ? num(sp.advance) : 0;
        $('pbAdv').innerHTML = adv > 0.009 ? `<div class="alert a-warn" style="margin:4px 0 0"><label style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;cursor:pointer"><input type="checkbox" id="pbUseAdv" checked> <span><b>${esc(sp.name)}</b> has <b>${money(adv)}</b> paid in advance. Settle against this bill:</span> <input class="inp inp-sm num" id="pbAdvAmt" type="number" min="0" step=".01" value="${adv}" style="width:130px"></label><div class="hint" style="margin-top:4px">Only up to the bill total is used; any extra stays as advance.</div></div>` : ''; };
      pick = partyPicker($('pbParty'), 'supplier', opts.supplierId || null, advBox); le = lineEditor($('pbLines'), { lines: opts.lines || [], mode: 'purchase', showStock: false }); if (opts.supplierId) advBox(byId('suppliers', opts.supplierId)); att = attachField($('pbFiles')); } });
}
// labels are printed in GRID Label Studio: this file goes into its Print queue → Import CSV
export function labelsCSV(lines, name) { return download(name, toCSV([['name', 'sku', 'mrp', 'qty'], ...lines.map(l => { const it = byId('items', l.itemId) || {}; return [l.name, l.sku, num(it.mrp), Math.round(num(l.qty))]; })])); }
function openPurchase(p) {
  const acts = [{ label: '🏷 Print labels', onClick: async () => { await queueLabelsFromPurchase(p); toast(`Stickers for ${p.no} added to the print queue.`); setTimeout(() => { location.hash = '#/labels'; }, 50); } }];
  if (p.balance > 0) acts.push({ label: 'Pay', cls: 'btn-ink', onClick: () => { setTimeout(() => payDialog({ purchaseId: p.id, amount: p.balance }), 50); } });
  acts.unshift({ label: '🗑 Delete', cls: 'btn-danger', perm: 'purchases:delete', onClick: () => { setTimeout(() => deleteTxnDialog('purchases', p), 50); } }, { label: '✎ Edit', perm: 'purchases:edit', onClick: () => { setTimeout(() => editPurchase(p), 50); } });
  acts.push({ label: '↩ Purchase return', perm: 'purchases:add', onClick: () => { setTimeout(() => debitNoteDialog(p), 50); } });
  const sp = byId('suppliers', p.supplierId); if (p.balance > 0 && num(sp?.advance) > 0.009) acts.push({ label: `Settle advance (${money0(sp.advance)})`, cls: 'btn-ok', onClick: () => { setTimeout(() => settleDialog({ supplierId: p.supplierId, purchaseId: p.id }), 50); } });
  const paidRows = [...all('payments'), ...all('debitNotes')].flatMap(y => L.payAllocs(y).filter(a => a.refId === p.id).map(a => ({ y, a }))).sort((x, z) => (x.a.settledOn || x.y.date).localeCompare(z.a.settledOn || z.y.date));
  openModal('Purchase ' + p.no, `<div class="li-s" style="margin:-4px 0 12px">${st(p.status)}<span>${fmtDate(p.date)}</span><span>${esc(p.supplierName)}</span>${p.billNo ? `<span>Bill ${esc(p.billNo)}</span>` : ''}${p.dueDate ? `<span>Due ${fmtDate(p.dueDate)}</span>` : ''}</div>
    <div class="tw"><table><thead><tr><th>Item</th><th class="num">Qty</th><th class="num">Cost</th><th class="num">Amount</th></tr></thead><tbody>${p.lines.map(l => `<tr><td>${esc(l.name)}<div class="muted mono" style="font-size:11px">${esc(l.sku)}</div></td><td class="num">${l.qty}</td><td class="num">${money(l.rate)}</td><td class="num">${money(l.qty * l.rate)}</td></tr>`).join('')}</tbody>
    <tfoot>${p.extra ? `<tr><td colspan="3" class="num">Other charges</td><td class="num">${money(p.extra)}</td></tr>` : ''}<tr><td colspan="3" class="num">Total</td><td class="num">${money(p.total)}</td></tr><tr><td colspan="3" class="num">Paid</td><td class="num">${money(p.paid)}</td></tr><tr><td colspan="3" class="num">Balance</td><td class="num">${money(p.balance)}</td></tr></tfoot></table></div>
    ${paidRows.length ? `<h3 style="margin:14px 0 6px;font-size:14px">Payments against this bill</h3><div class="tw"><table><thead><tr><th>Date</th><th>Payment</th><th>How</th><th class="num">Amount</th></tr></thead><tbody>${paidRows.map(({ y, a }) => `<tr><td class="nowrap">${fmtDate(a.settledOn || y.date)}</td><td class="mono">${esc(y.no)}</td><td>${y.purchaseNo !== undefined && y.lines ? 'Purchase return (debit note)' : a.settledOn ? `Advance of ${fmtDate(y.date)} settled` : esc(y.accountName || '')}</td><td class="num">${money(a.amount)}</td></tr>`).join('')}</tbody></table></div>` : ''}${recordFiles('purchases', p.id, L.may('purchases', 'edit'))}${journalHTML(p.no)}${historyHTML(p.id)}`, acts, { wide: true, onOpen: bindRecordFiles });
}

function editPurchase(p) {
  openModal('Edit ' + p.no, `<div class="row3">${field("Supplier's bill no.", input('epNo', p.billNo || ''))}${field('Bill date', input('epDate', p.date, 'type="date"'))}${field('Payment due', input('epDue', p.dueDate || '', 'type="date"'))}</div>${field('Notes', input('epNotes', p.notes || ''))}
    <p class="hint">To change items, quantities or costs, delete this bill and enter it again — that keeps stock and average cost correct.</p>`,
    [{ label: 'Cancel' }, { label: 'Save changes', cls: 'btn-ink', onClick: async () => { await L.updateTxn('purchases', p, { billNo: val('epNo'), date: val('epDate'), dueDate: val('epDue'), notes: val('epNotes') }); toast(p.no + ' updated.'); } }]);
}

/* ================= Suppliers ================= */
let sSearch = '';
export const suppliers = {
  title: 'Suppliers', icon: '🏭', roles: ['admin', 'manager', 'billing'],
  head: () => `<button class="btn btn-accent" data-a="news">＋ New supplier</button>`,
  body() {
    const w = words(sSearch), list = all('suppliers').filter(s => hit(s.name + ' ' + (s.mobile || '') + ' ' + (s.contact || ''), w)).sort((a, b) => a.name.localeCompare(b.name));
    return `<div class="toolbar">${searchBox('ss', 'Search supplier…')}</div><div class="tw"><table><thead><tr><th>Supplier</th><th>Mobile</th><th class="hide-m">Contact</th><th class="num">We owe</th><th></th></tr></thead><tbody>
      ${list.map(s => `<tr class="click" data-s="${s.id}"><td><b>${esc(s.name)}</b></td><td>${esc(s.mobile || '')}</td><td class="hide-m">${esc(s.contact || '')}</td><td class="num">${num(s.balance) ? money(s.balance) : '—'}</td><td class="nowrap">${s.mobile ? `<a class="btn btn-sm" href="${telLink(s.mobile)}" onclick="event.stopPropagation()">📞</a>` : ''}</td></tr>`).join('') || `<tr><td colspan="5">${empty('🏭', 'No suppliers yet.')}</td></tr>`}</tbody>
      <tfoot><tr><td colspan="3">${list.length} suppliers</td><td class="num">${money(sumBy(list, 'balance'))}</td><td></td></tr></tfoot></table></div>`;
  },
  bind(root) {
    root.addEventListener('click', e => {
      if (e.target.closest('[data-a=news]')) return editParty('supplier');
      const s = e.target.closest('[data-s]'); if (s) openSupplier(byId('suppliers', s.dataset.s));
    });
    root.addEventListener('input', e => { if (e.target.id === 'ss') { sSearch = e.target.value; rr(); } });
  },
  keep: ['ss']
};
async function openSupplier(s) {
  openModal(s.name, `<div class="li-s" style="margin:-4px 0 12px"><span>${esc(s.mobile || '')}</span><span>${esc(s.contact || '')}</span><span>We owe: <b>${money(s.balance)}</b></span>${num(s.advance) > 0.009 ? `<span>Advance with supplier: <b>${money(s.advance)}</b></span>` : ''}</div><div id="supHist"><div class="empty">Loading…</div></div>`,
    [{ label: 'Opening balance', onClick: () => { setTimeout(() => openingDialog('supplier', s), 50); } }, { label: 'Edit', perm: 'suppliers:edit', onClick: () => { setTimeout(() => editParty('supplier', s), 50); } }, { label: '⏰ Reminder', onClick: () => { setTimeout(() => followupDialog({ partyType: 'supplier', partyId: s.id, partyName: s.name, mobile: s.mobile }), 50); } }, ...(num(s.advance) > 0.009 ? [{ label: 'Settle advance', cls: 'btn-ok', onClick: () => { setTimeout(() => settleDialog({ supplierId: s.id }), 50); } }] : []), { label: 'Pay', cls: 'btn-ink', onClick: () => { setTimeout(() => payDialog({ supplierId: s.id }), 50); } }], { wide: true });
  const [pb, py] = await Promise.all([store.db.query('purchases', [['supplierId', '==', s.id]]), store.db.query('payments', [['supplierId', '==', s.id]])]).catch(() => [[], []]);
  const rows = [...pb.map(p => ({ d: p.date, t: 'Purchase', no: p.no + (p.billNo ? ' / ' + p.billNo : ''), amt: p.total })), ...py.map(p => ({ d: p.date, t: 'Payment' + (p.refNo ? ' · ' + p.refNo : ''), no: p.no, amt: -p.amount }))].sort((a, b) => b.d.localeCompare(a.d));
  if ($('supHist')) $('supHist').innerHTML = rows.length ? `<div class="tw"><table><thead><tr><th>Date</th><th>Type</th><th>No.</th><th class="num">Amount</th></tr></thead><tbody>${rows.map(r => `<tr><td>${fmtDate(r.d)}</td><td>${r.t}</td><td class="mono">${esc(r.no)}</td><td class="num">${money(r.amt)}</td></tr>`).join('')}</tbody></table></div>` : empty('🗂', 'No purchases yet.');
}

/* ================= Items & stock ================= */
let itSearch = '', itCat = '', itFilter = 'all';
export const items = {
  title: 'Items & Stock', icon: '📦', roles: ['admin', 'manager', 'billing', 'sales'],
  head: () => office() ? `<button class="btn" data-a="openstk">📦 Opening stock</button><button class="btn btn-accent" data-a="newi">＋ New item</button><button class="btn" data-a="imp">⬆ Import items</button><button class="btn" data-a="exp">⬇ Export</button>` : '',
  body() {
    const committed = L.committedMap(), w = words(itSearch), cats = [...new Set(all('items').map(i => i.category))].sort();
    const f = { all: () => true, committed: i => committed[i.id] > 0, short: i => num(i.onHand) - (committed[i.id] || 0) < 0, out: i => num(i.onHand) <= 0, low: i => num(i.reorder) > 0 && num(i.onHand) - (committed[i.id] || 0) <= num(i.reorder) };
    const lab = { all: 'All', committed: 'Committed in sales orders', short: 'Oversold', out: 'Out of stock', low: 'Below reorder level' };
    const pool = all('items').filter(i => !itCat || i.category === itCat), sumQ = fn => pool.reduce((x, i) => x + fn(i), 0);
    const tOn = sumQ(i => Math.max(0, num(i.onHand))), tCm = sumQ(i => committed[i.id] || 0), tAv = sumQ(i => num(i.onHand) - (committed[i.id] || 0));
    const openSOs = all('salesOrders').filter(o => (o.status === 'open' || o.status === 'scheduled') && o.lines.some(l => pool.some(i => i.id === l.itemId))).length;
    const list = all('items').filter(i => (!itCat || i.category === itCat) && f[itFilter](i) && hit(i.name + ' ' + i.sku + ' ' + i.category, w)).sort((a, b) => a.category.localeCompare(b.category) || a.name.localeCompare(b.name, undefined, { numeric: true }));
    const shown = list.slice(0, 400);
    return `<div class="toolbar">${searchBox('its', 'Search item, barcode / SKU, category…')}<select class="inp" id="itCat" style="width:auto"><option value="">All categories</option>${cats.map(c => `<option${c === itCat ? ' selected' : ''}>${esc(c)}</option>`).join('')}</select></div>
      <div class="grid g4" style="gap:10px;margin-bottom:12px"><div class="kpi"><span>In stock</span><b>${tOn} pcs</b></div><div class="kpi"><span>Committed</span><b style="color:var(--violet)">${tCm} pcs</b><small class="hint">${openSOs} confirmed order${openSOs === 1 ? '' : 's'} not delivered</small></div><div class="kpi"><span>Available to sell</span><b>${tAv} pcs</b></div>${office() ? `<div class="kpi"><span>Stock value (cost)</span><b>${money0(sumQ(i => num(i.onHand) * num(i.cost)))}</b></div>` : `<div class="kpi"><span>Oversold items</span><b style="color:var(--danger)">${pool.filter(f.short).length}</b></div>`}</div>
      <div class="chips" style="margin-bottom:12px">${Object.keys(lab).map(k => `<button class="chip${k === itFilter ? ' active' : ''}" data-f="${k}">${lab[k]}<small>${all('items').filter(f[k]).length}</small></button>`).join('')}</div>
      <div class="tw"><table><thead><tr><th>Item</th><th class="hide-m">SKU</th><th class="num">In stock</th><th class="num">Committed</th><th class="num">Available</th><th class="num">MRP</th>${office() ? '<th class="num hide-m">Cost</th>' : ''}</tr></thead><tbody>
      ${shown.map(i => { const c = committed[i.id] || 0, av = num(i.onHand) - c; return `<tr class="${office() ? 'click' : ''}" data-i="${i.id}"><td><b>${esc(i.name)}</b><div class="muted" style="font-size:11px">${esc(i.category)}</div></td><td class="hide-m mono">${esc(i.sku)}</td><td class="num">${num(i.onHand)}</td><td class="num">${c ? `<a href="#" data-cm="${i.id}" title="See the sales orders" style="color:var(--violet);font-weight:700">${c}</a>` : '—'}</td><td class="num"><b style="color:${av < 0 ? 'var(--danger)' : av === 0 ? 'var(--warn)' : 'inherit'}">${av}</b></td><td class="num">${money0(i.mrp)}</td>${office() ? `<td class="num hide-m">${money0(i.cost)}</td>` : ''}</tr>`; }).join('') || `<tr><td colspan="7">${empty('📦', 'No items found.')}</td></tr>`}</tbody></table></div>
      <p class="hint" style="margin-top:8px"><b>Committed</b> = quantity in confirmed sales orders that are not delivered yet. <b>Available</b> = in stock − committed. Stock goes down when the order is delivered and invoiced. Tap a committed number to see the orders.</p>
      ${list.length > 400 ? `<p class="hint" style="margin-top:8px">Showing 400 of ${list.length}. Search to narrow down.</p>` : ''}`;
  },
  bind(root) {
    root.addEventListener('click', e => {
      const a = e.target.closest('[data-a]')?.dataset.a;
      if (a === 'openstk') return openingStockDialog();
      if (a === 'newi') return itemEditor(); if (a === 'imp') return importItemsDialog(); if (a === 'exp') return exportItems();
      const f = e.target.closest('[data-f]'); if (f) { itFilter = f.dataset.f; return rr(); }
      const cm = e.target.closest('[data-cm]'); if (cm) { e.preventDefault(); e.stopPropagation(); return committedDialog(byId('items', cm.dataset.cm)); }
      const i = e.target.closest('[data-i]'); if (i && office()) openItem(byId('items', i.dataset.i));
    });
    root.addEventListener('input', e => { if (e.target.id === 'its') { itSearch = e.target.value; rr(); } });
    root.addEventListener('change', e => { if (e.target.id === 'itCat') { itCat = e.target.value; rr(); } });
  },
  keep: ['its']
};
function itemEditor(it) {
  openModal(it ? 'Edit item' : 'New item', `<div class="row2">${field('Item name', input('iName', it?.name))}${field('Barcode / SKU', input('iSku', it?.sku, 'class="mono"'))}</div>
    <div class="row3">${field('Category', input('iCat', it?.category, 'list="catL"'))}${field('MRP / selling price', input('iMrp', it?.mrp, 'type="number" min="0" step=".01"'))}${field('Cost price', input('iCost', it?.cost, 'type="number" min="0" step=".01"'))}</div>
    <div class="row2">${it ? '' : field('Opening stock', input('iQty', '', 'type="number" step="1"'))}${field('Reorder level (optional)', input('iRe', it?.reorder || '', 'type="number" min="0"'))}</div>
    <datalist id="catL">${[...new Set(all('items').map(i => i.category))].map(c => `<option value="${esc(c)}">`).join('')}</datalist>${it ? '<p class="hint">Stock quantity changes through purchases, invoices and stock adjustments.</p>' : ''}`,
    [{ label: 'Cancel' }, { label: 'Save', cls: 'btn-ink', onClick: async () => { await L.saveItem({ id: it?.id, name: val('iName'), sku: val('iSku'), category: val('iCat'), mrp: val('iMrp'), cost: val('iCost'), onHand: val('iQty'), reorder: val('iRe') }); toast('Item saved.'); } }]);
}
/* ---- opening stock: quantity, cost and value per item ---- */
export function openingStockDialog() {
  const cur = L.openingStockMap(), draft = {}, cats = [...new Set(all('items').map(i => i.category))].sort();
  let q = '', cat = '', only = false;
  const get = id => draft[id] || { qty: num((cur[id] || {}).qty), cost: num((cur[id] || {}).cost) || num((byId('items', id) || {}).cost) };
  const rowsHTML = () => { const w = words(q); const list = all('items').filter(i => (!cat || i.category === cat) && (!only || num((draft[i.id] || cur[i.id] || {}).qty)) && hit(i.name + ' ' + i.sku + ' ' + i.category, w)).sort((a, b) => a.category.localeCompare(b.category) || a.name.localeCompare(b.name, undefined, { numeric: true }));
    return list.slice(0, 300).map(i => { const v = get(i.id); return `<tr data-os="${i.id}"${draft[i.id] ? ' class="os-ch"' : ''}><td><b>${esc(i.name)}</b><div class="muted mono" style="font-size:11px">${esc(i.sku)} · ${esc(i.category)}</div></td>
      <td><input class="inp inp-sm num osq" type="number" min="0" step="1" inputmode="decimal" value="${v.qty || ''}"></td><td><input class="inp inp-sm num osc" type="number" min="0" step=".01" inputmode="decimal" value="${v.cost || ''}"></td><td><input class="inp inp-sm num osv" type="number" min="0" step=".01" inputmode="decimal" value="${v.qty && v.cost ? r2(v.qty * v.cost) : ''}"></td></tr>`; }).join('') + (list.length > 300 ? `<tr><td colspan="4" class="hint">Showing 300 of ${list.length} — search or pick a category to narrow down.</td></tr>` : '') || `<tr><td colspan="4">${empty('📦', 'No items match.')}</td></tr>`; };
  const totals = () => { let n = 0, qt = 0, val = 0; all('items').forEach(i => { const v = get(i.id); if (num(v.qty)) { n++; qt += num(v.qty); val += num(v.qty) * num(v.cost); } }); return { n, qt: r2(qt), val: r2(val) }; };
  openModal('Opening stock', `<div id="osWrap"><p class="hint" style="margin:0 0 10px">Enter the stock you had on the opening date, with its cost per piece. Type either the <b>cost per piece</b> or the total <b>value</b> — the other is worked out. Saving updates stock on hand, average cost and the Inventory opening balance (against Opening Balance Equity).</p>
    <div class="toolbar" style="margin-bottom:8px"><input class="inp" id="osQ" placeholder="Search item / barcode…" style="flex:1;min-width:160px"><select class="inp" id="osCat" style="width:auto"><option value="">All categories</option>${cats.map(c => `<option>${esc(c)}</option>`).join('')}</select><label class="check" style="margin:0"><input type="checkbox" id="osOnly"> Only items with stock</label><label class="hint">Opening date</label><input type="date" class="inp" id="osDate" value="${L.openingDate()}" style="width:auto"></div>
    <div class="tw" style="max-height:52vh"><table><thead><tr><th>Item</th><th class="num" style="width:100px">Qty</th><th class="num" style="width:130px">Cost / piece</th><th class="num" style="width:140px">Value</th></tr></thead><tbody id="osBody">${rowsHTML()}</tbody></table></div>
    <div id="osTot" class="alert a-info" style="margin-top:10px"></div></div>`,
    [{ label: 'Cancel' }, { label: 'Save opening stock', cls: 'btn-ok', onClick: async () => { const n = await L.saveOpeningStock(draft, val('osDate')); toast(n ? `Opening stock saved for ${n} item${n > 1 ? 's' : ''}.` : 'Nothing changed.'); } }],
    { wide: true, onOpen: () => {
      const tot = () => { const t = totals(), ch = Object.keys(draft).length; $('osTot').innerHTML = `<b>${t.n}</b> items · <b>${t.qt}</b> pieces · opening stock value <b>${money(t.val)}</b>${ch ? ` · <span style="color:var(--accent)">${ch} item${ch > 1 ? 's' : ''} changed — not saved yet</span>` : ''}`; };
      const redraw = () => { $('osBody').innerHTML = rowsHTML(); tot(); };
      $('osWrap').addEventListener('input', e => {
        if (e.target.id === 'osQ') { q = e.target.value; return redraw(); }
        const tr = e.target.closest('tr[data-os]'); if (!tr) return; const id = tr.dataset.os, qi = tr.querySelector('.osq'), ci = tr.querySelector('.osc'), vi = tr.querySelector('.osv');
        let qty = num(qi.value), cost = num(ci.value);
        if (e.target === vi) { cost = qty ? r2(num(vi.value) / qty) : cost; ci.value = cost || ''; } else vi.value = qty && cost ? r2(qty * cost) : '';
        draft[id] = { qty, cost }; tr.classList.add('os-ch'); tot();
      });
      $('osWrap').addEventListener('change', e => { if (e.target.id === 'osCat') { cat = e.target.value; redraw(); } if (e.target.id === 'osOnly') { only = e.target.checked; redraw(); } });
      tot();
    } });
}
window.__openingStock = openingStockDialog;

function committedTable(it) {
  const rows = L.committedOrders(it.id);
  return rows.length ? `<div class="tw"><table><thead><tr><th>Sales order</th><th>Customer</th><th class="hide-m">Salesman</th><th>Delivery</th><th class="num">Qty</th></tr></thead><tbody>${rows.map(r => `<tr class="click" data-so="${r.so.id}"><td class="mono"><b>${esc(r.so.no)}</b><div class="muted" style="font-size:11px">${fmtDate(r.so.date)}</div></td><td>${esc(r.so.customerName)}</td><td class="hide-m">${esc(r.so.salesmanName || '')}</td><td>${r.so.deliveryDate ? fmtDate(r.so.deliveryDate) : '<span class="muted">Not scheduled</span>'}</td><td class="num"><b>${r.qty}</b></td></tr>`).join('')}</tbody>
    <tfoot><tr><td colspan="4">Committed</td><td class="num">${rows.reduce((x, r) => x + r.qty, 0)}</td></tr></tfoot></table></div>` : '<p class="hint">Not in any open sales order.</p>';
}
function committedDialog(it) {
  if (!it) return; const c = L.committedMap()[it.id] || 0;
  openModal('Committed · ' + it.name, `<div class="grid g3" style="gap:10px;margin-bottom:12px"><div class="kpi"><span>In stock</span><b>${num(it.onHand)}</b></div><div class="kpi"><span>Committed</span><b style="color:var(--violet)">${c}</b></div><div class="kpi"><span>Available</span><b>${num(it.onHand) - c}</b></div></div>${committedTable(it)}`, [{ label: 'Close' }],
    { wide: true, onOpen: b => b.addEventListener('click', e => { const r = e.target.closest('[data-so]'); if (r) { const so = byId('salesOrders', r.dataset.so); closeModal(); if (so) setTimeout(() => openSO(so), 50); } }) });
}
async function openItem(it) {
  const c = L.committedMap()[it.id] || 0;
  openModal(it.name, `<div class="li-s" style="margin:-4px 0 12px"><span class="mono">${esc(it.sku)}</span><span>${esc(it.category)}</span><span>MRP ${money(it.mrp)}</span><span>Cost ${money(it.cost)}</span></div>
    <div class="grid g3" style="gap:10px;margin-bottom:12px"><div class="kpi"><span>In stock</span><b>${num(it.onHand)}</b></div><div class="kpi"><span>Committed</span><b style="color:var(--violet)">${c}</b></div><div class="kpi"><span>Available</span><b>${num(it.onHand) - c}</b></div></div>${c ? `<h3 style="margin:0 0 6px;font-size:14px">Committed in sales orders</h3><div id="itCm">${committedTable(it)}</div><h3 style="margin:14px 0 6px;font-size:14px">Stock movements</h3>` : ''}<div id="itMoves"><div class="empty">Loading stock history…</div></div>`,
    [{ label: '🏷 Labels', onClick: async () => { await L.addLabels([{ itemId: it.id, sku: it.sku, name: it.name, mrp: it.mrp, qty: Math.max(1, num(it.onHand)) }]); toast('Added to the label print queue.'); setTimeout(() => { location.hash = '#/labels'; }, 50); } }, { label: 'Adjust stock', perm: 'items:add', onClick: () => { setTimeout(() => adjustDialog(it), 50); } }, { label: 'Edit', cls: 'btn-ink', perm: 'items:edit', onClick: () => { setTimeout(() => itemEditor(it), 50); } }], { wide: true });
  if ($('itCm')) $('itCm').onclick = e => { const r = e.target.closest('[data-so]'); if (r) { const so = byId('salesOrders', r.dataset.so); closeModal(); if (so) setTimeout(() => openSO(so), 50); } };
  const mv = (await store.db.query('stockMoves', [['itemId', '==', it.id]]).catch(() => [])).sort((a, b) => b.date.localeCompare(a.date) || (b.createdAt || 0) - (a.createdAt || 0)).slice(0, 100);
  if ($('itMoves')) $('itMoves').innerHTML = mv.length ? `<div class="tw"><table><thead><tr><th>Date</th><th>Type</th><th>Ref</th><th class="num">Qty</th></tr></thead><tbody>${mv.map(m => `<tr><td>${fmtDate(m.date)}</td><td>${esc(m.refType)}</td><td class="mono">${esc(m.refNo)}</td><td class="num" style="color:${m.qty < 0 ? 'var(--danger)' : 'var(--ok)'}">${m.qty > 0 ? '+' : ''}${m.qty}</td></tr>`).join('')}</tbody></table></div>` : empty('📦', 'No stock movements yet.');
}
function adjustDialog(it) {
  openModal('Adjust stock — ' + it.name, `<p class="hint" style="margin:0 0 10px">System stock: <b>${num(it.onHand)}</b>. Enter the quantity actually in the shop. The difference is posted to "Stock Adjustments" at cost.</p><div class="row2">${field('Actual quantity', input('adQty', num(it.onHand), 'type="number" step="1"'))}${field('Date', input('adDate', today(), 'type="date"'))}</div>${field('Reason', select('adWhy', ['Stock count', 'Damaged', 'Lost / missing', 'Found', 'Correction', 'Other']))}`,
    [{ label: 'Cancel' }, { label: 'Save adjustment', cls: 'btn-ink', onClick: async () => { await L.adjustStock({ itemId: it.id, counted: val('adQty'), reason: val('adWhy'), date: val('adDate') }); toast('Stock adjusted.'); } }]);
}
const ALIAS = { name: ['name', 'item name', 'item', 'product name'], sku: ['sku', 'barcode', 'item code', 'item sku'], category: ['category', 'category name', 'group name', 'item group'], mrp: ['mrp', 'rate', 'selling price', 'sales rate'], cost: ['cost', 'purchase rate', 'purchase price', 'cost price'], stock: ['stock', 'stock on hand', 'quantity on hand', 'opening stock', 'qty'] };
async function importItemsDialog() {
  openModal('Import items', `<p style="margin:0 0 10px;line-height:1.55">Choose a CSV file with item name, SKU/barcode, MRP, cost and stock. Works with:</p><ul class="hint" style="line-height:1.8;margin:0 0 10px"><li>GRID Label Studio → Item Master → <b>Export CSV</b></li><li>Zoho Books → Items → Export (CSV)</li><li>Any sheet saved as CSV with columns <span class="mono">name, sku, category, mrp, cost, stock</span></li></ul>
    <label class="check"><input type="checkbox" id="imOpen" checked> Use the stock column as opening stock for new items (posts to Inventory and Opening Balance Equity)</label><p class="hint">Existing items (same SKU) get their name, category, MRP and cost updated; their stock is not changed.</p>`,
    [{ label: 'Cancel' }, { label: 'Choose CSV file…', cls: 'btn-ink', onClick: async () => {
      const asOpening = $('imOpen').checked; const f = await pickFile('.csv,text/csv'); if (!f) return false;
      const rows = parseCSV(await f.text()); const head = (rows.shift() || []).map(h => h.trim().toLowerCase()); const col = k => { for (const a of ALIAS[k]) { const i = head.indexOf(a); if (i >= 0) return i; } return -1; };
      const C = Object.fromEntries(Object.keys(ALIAS).map(k => [k, col(k)])); if (C.name < 0 || C.sku < 0) throw Error('The file needs at least item name and SKU / barcode columns.');
      const cn = v => num(String(v ?? '').replace(/[^\d.\-]/g, ''), NaN);
      const data = rows.map(r => ({ name: (r[C.name] || '').trim(), sku: (r[C.sku] || '').trim(), category: C.category >= 0 ? (r[C.category] || '').trim() : '', mrp: C.mrp >= 0 ? cn(r[C.mrp]) : 0, cost: C.cost >= 0 ? cn(r[C.cost]) : null, stock: C.stock >= 0 ? cn(r[C.stock]) : 0 })).filter(r => r.name && r.sku).map(r => ({ ...r, mrp: Number.isFinite(r.mrp) ? r.mrp : 0, cost: Number.isFinite(r.cost) ? r.cost : null, stock: Number.isFinite(r.stock) ? r.stock : 0 }));
      if (!data.length) throw Error('No rows with a name and SKU were found.');
      const res = await L.importItems(data, { asOpening }); toast(`${res.added} items added, ${res.updated} updated${res.value ? ' · opening stock ' + money0(res.value) : ''}.`);
    } }]);
}
function exportItems() {
  const c = L.committedMap();
  download('GRID_items_' + today() + '.csv', toCSV([['category', 'name', 'sku', 'cost', 'stock', 'mrp', 'committed', 'available'], ...all('items').map(i => [i.category, i.name, i.sku, i.cost, i.onHand, i.mrp, c[i.id] || 0, num(i.onHand) - (c[i.id] || 0)])]));
}

/* ================= Cash Book (separate cash window) ================= */
let cbAcc = 'cash', cbPeriod = 'month', cbFrom = null, cbTo = null;
function cbRange() { const t = today(); return { today: [t, t], week: [weekStart(t), t], month: [t.slice(0, 8) + '01', t], last: lastMonth(), custom: [cbFrom || t.slice(0, 8) + '01', cbTo || t] }[cbPeriod]; }
function cbAccounts() { const m = L.moneyAccounts(); return cbAcc === 'all' ? m.map(a => a.id) : cbAcc === 'cash' ? m.filter(a => a.group === 'cash').map(a => a.id) : [cbAcc]; }
export const cashbook = {
  title: 'Cash Book', icon: '💰', roles: ['admin', 'manager', 'billing'],
  head: () => `<button class="btn btn-ok" data-a="rcv">＋ Money in</button><button class="btn" data-a="exp">－ Expense</button><button class="btn" data-a="trf">⇄ Transfer</button><a class="btn btn-accent" href="#/cash">🔐 Close the day</a>`,
  body() {
    const [from, to] = cbRange(), ids = cbAccounts(), f = L.moneyFlow(ids, from, to), m = L.moneyAccounts(), t = today();
    const label = cbAcc === 'all' ? 'All cash & bank' : cbAcc === 'cash' ? 'Cash in hand' : L.accName(cbAcc);
    const closings = new Set(all('cashClosings').filter(c => ids.includes(c.accountId) && c.status !== 'reopened').map(c => c.date));
    const days = f.days.slice().reverse();
    return `<div class="toolbar"><select class="inp" id="cbAcc" style="width:auto;min-width:200px"><option value="cash"${cbAcc === 'cash' ? ' selected' : ''}>Cash in hand</option><option value="all"${cbAcc === 'all' ? ' selected' : ''}>All cash & bank</option>${m.filter(a => a.group !== 'cash').map(a => `<option value="${a.id}"${a.id === cbAcc ? ' selected' : ''}>${esc(a.name)}</option>`).join('')}</select>
      <div class="chips">${[['today', 'Today'], ['week', 'This week'], ['month', 'This month'], ['last', 'Last month'], ['custom', 'Custom']].map(([k, l]) => `<button class="chip${k === cbPeriod ? ' active' : ''}" data-p="${k}">${l}</button>`).join('')}</div>
      ${cbPeriod === 'custom' ? `<input type="date" class="inp" id="cbFrom" value="${from}" style="width:auto"><input type="date" class="inp" id="cbTo" value="${to}" style="width:auto">` : `<span class="hint">${fmtDate(from)} – ${fmtDate(to, { day: 'numeric', month: 'short', year: 'numeric' })}</span>`}</div>
    <div class="grid g4" style="margin-bottom:16px">
      <div class="kpi"><span>Opening balance</span><b>${money0(f.opening)}</b><small>${esc(label)} on ${fmtDate(from)} morning</small></div>
      <div class="kpi"><span>Money in</span><b style="color:var(--ok)">${money0(f.inflow)}</b><small>${f.rows.filter(j => j.amt > 0).length} entries</small></div>
      <div class="kpi"><span>Money out</span><b style="color:var(--danger)">${money0(f.outflow)}</b><small>${f.rows.filter(j => j.amt < 0).length} entries</small></div>
      <div class="kpi"><span>Closing balance</span><b>${money0(f.closing)}</b><small>${to === t ? 'as of now' : 'on ' + fmtDate(to) + ' evening'}</small></div></div>
    ${cbAcc === 'all' || cbAcc === 'cash' ? '' : ''}
    <div class="grid" style="grid-template-columns:minmax(0,3fr) minmax(0,2fr)" id="cbGrid">
      <div class="panel"><h2>Day by day</h2><div class="tw" style="max-height:520px"><table><thead><tr><th>Date</th><th class="num">Opening</th><th class="num">In</th><th class="num">Out</th><th class="num">Closing</th>${cbAcc === 'cash' ? '<th></th>' : ''}</tr></thead><tbody>
        ${days.map(d => `<tr class="click" data-day="${d.date}"><td class="nowrap">${dateLong(d.date)}</td><td class="num">${money0(d.opening)}</td><td class="num" style="color:var(--ok)">${d.inflow ? money0(d.inflow) : ''}</td><td class="num" style="color:var(--danger)">${d.outflow ? money0(d.outflow) : ''}</td><td class="num"><b>${money0(d.closing)}</b></td>${cbAcc === 'cash' ? `<td>${closings.has(d.date) ? pill('done', 'Closed') : d.date < t && (d.inflow || d.outflow) ? pill('followup', 'Not closed') : ''}</td>` : ''}</tr>`).join('')}</tbody>
        <tfoot><tr><td>Period</td><td class="num">${money0(f.opening)}</td><td class="num">${money0(f.inflow)}</td><td class="num">${money0(f.outflow)}</td><td class="num">${money0(f.closing)}</td>${cbAcc === 'cash' ? '<td></td>' : ''}</tr></tfoot></table></div></div>
      <div class="panel"><h2>Each account · ${cbPeriod === 'today' ? 'today' : 'this period'}</h2><div class="tw"><table><thead><tr><th>Account</th><th class="num">Opening</th><th class="num">Closing</th></tr></thead><tbody>
        ${m.map(a => { const x = L.moneyFlow([a.id], from, to); return `<tr class="click" data-acc="${a.id}"><td>${esc(a.name)}</td><td class="num">${money0(x.opening)}</td><td class="num"><b>${money0(x.closing)}</b></td></tr>`; }).join('')}</tbody>
        <tfoot><tr><td>Total</td><td class="num">${money0(L.moneyFlow(m.map(a => a.id), from, to).opening)}</td><td class="num">${money0(L.moneyFlow(m.map(a => a.id), from, to).closing)}</td></tr></tfoot></table></div>
        <p class="hint" style="margin-top:8px">Tap a day to see every entry. Transfers between your own cash and bank accounts don't count as money in or out under "All cash & bank".</p></div></div>`;
  },
  after() { if (window.innerWidth < 1000 && $('cbGrid')) $('cbGrid').style.gridTemplateColumns = 'minmax(0,1fr)'; },
  bind(root) {
    root.addEventListener('click', e => {
      const a = e.target.closest('[data-a]')?.dataset.a; if (a === 'rcv') return receiveDialog({}); if (a === 'exp') return expenseDialog(); if (a === 'trf') return transferDialog();
      const p = e.target.closest('[data-p]'); if (p) { cbPeriod = p.dataset.p; return rr(); }
      const ac = e.target.closest('[data-acc]'); if (ac) { cbAcc = ac.dataset.acc; return rr(); }
      const d = e.target.closest('[data-day]'); if (d) dayDialog(d.dataset.day);
    });
    root.addEventListener('change', e => { if (e.target.id === 'cbAcc') { cbAcc = e.target.value; rr(); } if (e.target.id === 'cbFrom') { cbFrom = e.target.value; rr(); } if (e.target.id === 'cbTo') { cbTo = e.target.value; rr(); } });
  }
};
function dayDialog(date) {
  const f = L.moneyFlow(cbAccounts(), date, date);
  openModal((cbAcc === 'all' ? 'All cash & bank' : cbAcc === 'cash' ? 'Cash in hand' : L.accName(cbAcc)) + ' · ' + dateLong(date), `<div class="grid g4" style="gap:10px;margin-bottom:12px"><div class="kpi"><span>Opening</span><b>${money0(f.opening)}</b></div><div class="kpi"><span>In</span><b style="color:var(--ok)">${money0(f.inflow)}</b></div><div class="kpi"><span>Out</span><b style="color:var(--danger)">${money0(f.outflow)}</b></div><div class="kpi"><span>Closing</span><b>${money0(f.closing)}</b></div></div>
    <div class="tw"><table><thead><tr><th>Entry</th><th>Details</th><th class="num">In</th><th class="num">Out</th></tr></thead><tbody>${f.rows.map(j => `<tr><td class="mono nowrap">${esc(j.refNo)}</td><td>${esc([j.party, j.memo].filter(Boolean).join(' · '))}</td><td class="num">${j.amt > 0 ? money(j.amt) : ''}</td><td class="num">${j.amt < 0 ? money(-j.amt) : ''}</td></tr>`).join('') || '<tr><td colspan="4" class="muted">No money moved on this day.</td></tr>'}</tbody></table></div>`, [{ label: 'Close' }], { wide: true });
}

/* ================= Daily cash closing ================= */
let ccDate = null, ccAcc = null;
const DENOMS = [500, 200, 100, 50, 20, 10, 5, 2, 1];
export const cash = {
  title: 'Cash Closing', icon: '🔐', roles: ['admin', 'manager', 'billing'],
  head: () => `<input type="date" class="inp" id="ccDate" style="width:auto" value="${ccDate || today()}"><select class="inp" id="ccAcc" style="width:auto"><option value="all"${ccAcc === 'all' ? ' selected' : ''}>All cash & bank accounts</option>${L.moneyAccounts().map(a => `<option value="${a.id}"${a.id === (ccAcc || L.ACC.cash) ? ' selected' : ''}>${esc(a.name)}</option>`).join('')}</select>`,
  body() {
    const hist = all('cashClosings').sort((a, b) => b.date.localeCompare(a.date) || (b.reopenedAt || 0) - (a.reopenedAt || 0)).slice(0, 40), canRe = L.can.admin(role()) || L.may('cash', 'delete'), lim = L.cashDiffLimit();
    const pend = hist.filter(h => h.status !== 'reopened' && h.diffPending);
    return `<div class="grid" style="grid-template-columns:minmax(0,3fr) minmax(0,2fr)" id="ccGrid"><div class="panel"><div id="ccBox"><div class="empty">Working out the cash for this day…</div></div></div>
      <div class="panel"><h2>Recent closings</h2><div class="hint" style="margin-bottom:8px">Closed up to <b>${L.lockedUpTo() ? fmtDate(L.lockedUpTo(), { day: 'numeric', month: 'short', year: 'numeric' }) : 'never'}</b> — entries on or before this date are locked.</div>
      ${pend.length ? `<div class="alert a-bad">${pend.length} closing${pend.length > 1 ? 's have' : ' has'} a difference over ${money0(lim)} waiting for review — it is <b>not</b> posted to Cash Short / Over. Find the missing entry (reopen the day, add it, close again) or post the difference.</div>` : ''}
      ${hist.map(h => { const re = h.status === 'reopened', key = h.date + '|' + h.accountId; return `<div class="list-item cc-row${re ? ' cc-re' : ''}" style="padding:8px 11px"><div><div class="li-t">${dateLong(h.date)} · ${esc(h.accountName)}${re ? ' <span class="pill">Reopened</span>' : h.diffPending ? ' <span class="pill p-unpaid">Difference not posted</span>' : ''}</div>
        <div class="li-s"><span>Expected ${money0(h.expected)}</span><span>Counted ${money0(h.counted)}</span><span>${esc(h.closedByName)}</span>${re ? `<span>Reopened by ${esc(L.nm(h.reopenedBy))}${h.reopenReason ? ': ' + esc(h.reopenReason) : ''}</span>` : ''}</div>
        ${!re && canRe ? `<div style="display:flex;gap:6px;margin-top:6px;flex-wrap:wrap"><button class="btn btn-sm" data-ccre="${key}">↩ Reopen</button>${h.diffPending && L.can.admin(role()) ? `<button class="btn btn-sm btn-danger" data-ccpost="${key}">Post ${money0(h.diff)} to Short / Over</button>` : ''}</div>` : ''}</div>
        <b style="color:${re ? 'var(--muted)' : h.diff < 0 ? 'var(--danger)' : h.diff > 0 ? 'var(--ok)' : 'var(--muted)'};${re ? 'text-decoration:line-through' : ''}">${h.diff ? (h.diff > 0 ? '+' : '') + money0(h.diff) : '✓'}</b></div>`; }).join('') || empty('🔐', 'No closings yet.')}
      ${L.can.admin(role()) ? `<div class="row2" style="margin-top:12px;align-items:end">${field('Auto-post differences up to', input('ccLim', lim, 'type="number" min="0" step="1" inputmode="numeric"'))}<div class="field"><button class="btn" data-a="cclim">Save limit</button></div></div><p class="hint" style="margin-top:-4px">A short or excess up to this amount goes to “Cash Short / Over” when the day is closed. Above it, the day still closes but the difference is held until you post it.</p>` : ''}</div></div>`;
  },
  async after() {
    if (window.innerWidth < 1000 && $('ccGrid')) $('ccGrid').style.gridTemplateColumns = 'minmax(0,1fr)';
    const date = ccDate || today(), acc = ccAcc || L.ACC.cash, box = $('ccBox'); if (!box) return;
    if (acc === 'all') return closeAllView(date);
    const done = L.activeClosing(date, acc);
    let pos; try { pos = await L.cashPosition(acc, date); } catch (e) { box.innerHTML = `<div class="alert a-bad">${esc(e.message)}</div>`; return; }
    if (!pos || !$('ccBox')) return;
    const isCash = (byId('accounts', acc) || {}).group === 'cash';
    $('ccBox').innerHTML = `<h2>${esc(L.accName(acc))} · ${dateLong(date)}</h2>
      <div class="grid g4" style="gap:10px;margin-bottom:12px"><div class="kpi"><span>Opening</span><b>${money0(pos.opening)}</b></div><div class="kpi"><span>Money in</span><b style="color:var(--ok)">${money0(pos.inflow)}</b></div><div class="kpi"><span>Money out</span><b style="color:var(--danger)">${money0(pos.outflow)}</b></div><div class="kpi"><span>Should be</span><b>${money0(pos.expected)}</b></div></div>
      <div class="tw" style="max-height:260px;margin-bottom:12px"><table><thead><tr><th>Entry</th><th>Details</th><th class="num">In</th><th class="num">Out</th></tr></thead><tbody>${pos.rows.map(j => `<tr><td class="mono nowrap">${esc(j.refNo)}</td><td>${esc(j.party ? j.party + ' · ' : '')}${esc(j.memo)}</td><td class="num">${j.amt > 0 ? money(j.amt) : ''}</td><td class="num">${j.amt < 0 ? money(-j.amt) : ''}</td></tr>`).join('') || `<tr><td colspan="4" class="muted">No entries on this day.</td></tr>`}</tbody></table></div>
      ${done ? `<div class="alert ${done.diffPending ? 'a-bad' : 'a-ok'}">✓ Closed by ${esc(done.closedByName)} at ${fmtTime(done.createdAt)}. Counted ${money(done.counted)} · difference ${money(done.diff)}${done.diffPending ? ' — <b>held for review, not posted</b>' : ''}${done.note ? ' · ' + esc(done.note) : ''}</div>${L.can.admin(role()) || L.may('cash', 'delete') ? `<button class="btn btn-sm" data-ccre="${date}|${acc}">↩ Reopen this day</button>` : ''}`
      : `<h2 style="margin-top:6px">Count the ${isCash ? 'cash in the drawer' : 'bank balance'}</h2>
        ${isCash ? `<div class="grid g3" style="gap:8px;margin-bottom:10px">${DENOMS.map(d => `<div class="field" style="margin:0"><label>${setting('currency', '₹')} ${d} ×</label><input type="number" min="0" step="1" data-den="${d}" inputmode="numeric" placeholder="0"></div>`).join('')}</div>` : ''}
        <div class="row2">${field('Counted total', input('ccCount', isCash ? '' : pos.expected, 'type="number" step=".01" inputmode="decimal"'))}${field('Note', input('ccNote', '', 'placeholder="e.g. ₹200 given for tea, no bill"'))}</div>
        <div id="ccDiff" class="alert a-info">Enter the counted amount.</div>
        <button class="btn btn-accent btn-lg" data-a="close" style="width:100%;justify-content:center">🔐 Close ${dateLong(date)}</button>`}`;
    const upd = () => { const c = num($('ccCount')?.value, NaN); const d = $('ccDiff'); if (!d) return; if (!Number.isFinite(c)) { d.className = 'alert a-info'; d.textContent = 'Enter the counted amount.'; return; } const diff = r2(c - pos.expected); d.className = 'alert ' + (diff ? (diff < 0 ? 'a-bad' : 'a-warn') : 'a-ok'); const big = Math.abs(diff) > L.cashDiffLimit(); if (big) d.className = 'alert a-bad'; d.textContent = diff ? (diff < 0 ? `Short by ${money(-diff)}` : `Over by ${money(diff)}`) + (big ? ` — more than ${money0(L.cashDiffLimit())}, so it will NOT be posted automatically. Check for a missing entry first; if you still close, the difference is held for the owner to review.` : ' — it will be posted to "Cash Short / Over".') : '✓ Matches exactly.'; };
    $('ccBox').addEventListener('input', e => { if (e.target.dataset.den) { let t = 0; $('ccBox').querySelectorAll('[data-den]').forEach(i => t += num(i.value) * num(i.dataset.den)); $('ccCount').value = t; } upd(); });
    $('ccBox').addEventListener('click', async e => { if (!e.target.closest('[data-a=close]')) return; const c = num($('ccCount').value, NaN); if (!Number.isFinite(c)) return toast('Enter the counted amount.', 'warn');
      const den = {}; $('ccBox').querySelectorAll('[data-den]').forEach(i => { if (num(i.value)) den[i.dataset.den] = num(i.value); });
      const dd = r2(c - pos.expected), big = Math.abs(dd) > L.cashDiffLimit();
      if (!(await confirmBox(big ? 'Large difference' : 'Close this day?', `Counted <b>${money(c)}</b>, system says <b>${money(pos.expected)}</b>.${big ? `<br><br>The difference of <b>${money(dd)}</b> is more than ${money0(L.cashDiffLimit())}. It will <b>not</b> be posted to Cash Short / Over — it stays held until the owner posts it, or you reopen the day and add the missing entry.` : ''}${isCash ? '<br><br>After closing, nobody can add or change entries on or before this date.' : ''}`, big ? 'Close and hold the difference' : 'Close day', big))) return;
      try { await L.closeCash({ date, accountId: acc, counted: c, note: $('ccNote').value, denominations: den }); toast('Day closed.'); rr(); } catch (er) { fail(er); } });
  },
  bind(root) {
    root.addEventListener('change', e => { if (e.target.id === 'ccDate') { ccDate = e.target.value; rr(); } if (e.target.id === 'ccAcc') { ccAcc = e.target.value; rr(); } });
    root.addEventListener('click', async e => {
      const re = e.target.closest('[data-ccre]');
      if (re) { const [d, a] = re.dataset.ccre.split('|'), later = all('cashClosings').filter(c => c.accountId === a && c.date > d && c.status !== 'reopened').length;
        openModal('Reopen ' + dateLong(d) + '?', `<p style="margin:0 0 10px;line-height:1.55">This unlocks <b>${esc(L.accName(a))}</b> for ${dateLong(d)}${later ? ` and the <b>${later} later closed day${later > 1 ? 's' : ''}</b> (they depend on this day's closing balance)` : ''}. Entries can then be added or changed, and the day closed again. Any short/over posted for ${later ? 'these days' : 'this day'} is taken out of the accounts. The old closing stays in the list, marked “Reopened”.</p>${field('Reason (required)', input('ccReW', '', 'placeholder="e.g. Closed by mistake, missed a receipt"'))}`,
          [{ label: 'Cancel' }, { label: '↩ Reopen', cls: 'btn-danger', onClick: async () => { const n = await L.reopenCash(d, a, val('ccReW')); toast(n > 1 ? `${n} days reopened.` : 'Day reopened.'); ccDate = d; ccAcc = a; setTimeout(rr, 60); } }]);
        return; }
      const po = e.target.closest('[data-ccpost]');
      if (po) { const [d, a] = po.dataset.ccpost.split('|'), c = L.activeClosing(d, a); if (c && await confirmBox('Post the difference?', `Post <b>${money(c.diff)}</b> for ${dateLong(d)} (${esc(c.accountName)}) to “Cash Short / Over”? Only do this once you are sure no entry is missing.`, 'Post difference', true)) { try { await L.postCashDiff(d, a); toast('Difference posted.'); rr(); } catch (er) { fail(er); } } return; }
      if (e.target.closest('[data-a=cclim]')) { const v = num(val('ccLim'), NaN); if (!Number.isFinite(v) || v < 0) return toast('Enter the limit as an amount.', 'warn'); try { await store.db.commit([{ t: 'update', coll: 'settings', id: 'company', data: { cashDiffLimit: r2(v), updatedAt: Date.now() } }]); toast('Limit saved.'); rr(); } catch (er) { fail(er); } return; }
    });
  }
};

// All money accounts on one screen: count each, then close them together
async function closeAllView(date) {
  const accs = L.moneyAccounts(), rows = [];
  for (const a of accs) { const pos = await L.cashPosition(a.id, date); if (pos) rows.push({ a, pos, done: L.activeClosing(date, a.id), isCash: a.group === 'cash' }); }
  const box = $('ccBox'); if (!box) return;
  const flow = L.moneyFlow(accs.map(a => a.id), date, date), open = rows.filter(r => !r.done);
  const T = k => r2(rows.reduce((x, r) => x + num(r.pos[k]), 0));
  box.innerHTML = `<h2>All cash & bank accounts · ${dateLong(date)}</h2>
    <div class="grid g4" style="gap:10px;margin-bottom:12px"><div class="kpi"><span>Opening</span><b>${money0(flow.opening)}</b></div><div class="kpi"><span>Money in</span><b style="color:var(--ok)">${money0(flow.inflow)}</b></div><div class="kpi"><span>Money out</span><b style="color:var(--danger)">${money0(flow.outflow)}</b></div><div class="kpi"><span>Should be</span><b>${money0(flow.closing)}</b></div></div>
    <p class="hint" style="margin:-4px 0 10px">Money moved between your own accounts (e.g. cash deposited in the bank) is left out of the totals above but shows on each account below.</p>
    <div class="tw"><table><thead><tr><th>Account</th><th class="num hide-m">Opening</th><th class="num hide-m">In</th><th class="num hide-m">Out</th><th class="num">Should be</th><th class="num" style="width:150px">Counted</th><th class="num">Difference</th></tr></thead><tbody>
    ${rows.map(r => `<tr><td><b>${esc(r.a.name)}</b>${r.done ? `<div><span class="pill p-done">Closed${r.done.closedByName ? ' · ' + esc(r.done.closedByName) : ''}</span></div>` : r.isCash ? `<div><button class="btn btn-sm" type="button" data-den-t="${r.a.id}" style="margin-top:4px">🧮 Count notes</button></div>` : ''}</td>
      <td class="num hide-m">${money0(r.pos.opening)}</td><td class="num hide-m">${money0(r.pos.inflow)}</td><td class="num hide-m">${money0(r.pos.outflow)}</td><td class="num"><b>${money0(r.pos.expected)}</b></td>
      <td>${r.done ? `<div class="num">${money0(r.done.counted)}</div>` : `<input class="inp inp-sm num" type="number" step=".01" inputmode="decimal" data-cc="${r.a.id}" value="${r.isCash ? '' : r.pos.expected}" placeholder="${r.isCash ? 'count' : ''}">`}</td>
      <td class="num" data-cd="${r.a.id}">${r.done ? (r.done.diff ? `<b style="color:var(--${r.done.diff < 0 ? 'danger' : 'ok'})">${money(r.done.diff)}</b>` : '✓') : ''}</td></tr>
      ${r.isCash && !r.done ? `<tr data-den-row="${r.a.id}" hidden><td colspan="7"><div class="grid g3" style="gap:8px">${DENOMS.map(d => `<div class="field" style="margin:0"><label>${setting('currency', '₹')} ${d} ×</label><input type="number" min="0" step="1" data-den2="${r.a.id}" data-d="${d}" inputmode="numeric" placeholder="0"></div>`).join('')}</div></td></tr>` : ''}`).join('')}</tbody>
    <tfoot><tr><td>Total</td><td class="num hide-m">${money0(T('opening'))}</td><td class="num hide-m">${money0(T('inflow'))}</td><td class="num hide-m">${money0(T('outflow'))}</td><td class="num">${money0(T('expected'))}</td><td class="num" id="ccAllCount"></td><td class="num" id="ccAllDiff"></td></tr></tfoot></table></div>
    ${open.length ? `${field('Note (saved with each closing)', input('ccNoteAll', '', 'placeholder="e.g. ₹200 given for tea, no bill"'))}<button class="btn btn-accent btn-lg" data-a="closeall" style="width:100%;justify-content:center">🔐 Close ${open.length} account${open.length > 1 ? 's' : ''} for ${dateLong(date)}</button>` : '<div class="alert a-ok" style="margin-top:10px">✓ Every cash and bank account is closed for this day.</div>'}`;
  const exp = Object.fromEntries(rows.map(r => [r.a.id, r.pos.expected]));
  const recalc = () => { let tc = 0, td = 0, any = false;
    rows.forEach(r => { if (r.done) { tc += num(r.done.counted); td += num(r.done.diff); any = true; return; } const i = box.querySelector(`[data-cc="${r.a.id}"]`), cell = box.querySelector(`[data-cd="${r.a.id}"]`), v = num(i.value, NaN);
      if (!Number.isFinite(v) || i.value === '') { cell.innerHTML = ''; return; } any = true; const d = r2(v - exp[r.a.id]); tc += v; td += d; cell.innerHTML = d ? `<b style="color:var(--${d < 0 ? 'danger' : 'ok'})">${d > 0 ? '+' : ''}${money(d)}</b>` : '✓'; });
    $('ccAllCount').textContent = any ? money0(tc) : ''; $('ccAllDiff').innerHTML = any ? (r2(td) ? `<b style="color:var(--${td < 0 ? 'danger' : 'ok'})">${money(r2(td))}</b>` : '✓') : ''; };
  box.addEventListener('input', e => {
    const id = e.target.dataset.den2; if (id) { let t = 0; box.querySelectorAll(`[data-den2="${id}"]`).forEach(i => t += num(i.value) * num(i.dataset.d)); box.querySelector(`[data-cc="${id}"]`).value = t; }
    recalc();
  });
  box.addEventListener('click', async e => {
    const dt = e.target.closest('[data-den-t]'); if (dt) { const tr = box.querySelector(`[data-den-row="${dt.dataset.denT}"]`); tr.hidden = !tr.hidden; return; }
    if (!e.target.closest('[data-a=closeall]')) return;
    const list = open.map(r => ({ r, v: box.querySelector(`[data-cc="${r.a.id}"]`).value }));
    const miss = list.filter(x => x.v === '' || !Number.isFinite(num(x.v, NaN)));
    if (miss.length) return toast('Enter the counted amount for ' + miss.map(x => x.r.a.name).join(', ') + '.', 'warn');
    const sumTxt = list.map(x => `${esc(x.r.a.name)}: counted <b>${money(num(x.v))}</b>, system <b>${money(x.r.pos.expected)}</b>`).join('<br>');
    const bigs = list.filter(x => Math.abs(r2(num(x.v) - x.r.pos.expected)) > L.cashDiffLimit());
    if (!(await confirmBox(bigs.length ? 'Large difference' : 'Close all accounts?', `${sumTxt}${bigs.length ? `<br><br><b>${bigs.map(x => esc(x.r.a.name)).join(', ')}</b>: difference more than ${money0(L.cashDiffLimit())} — it will <b>not</b> be posted to Cash Short / Over and stays held for the owner.` : ''}<br><br>After closing the cash account, nobody can add or change entries on or before this date.`, 'Close all', !!bigs.length))) return;
    const note = val('ccNoteAll');
    try {
      for (const x of list) { const den = {}; box.querySelectorAll(`[data-den2="${x.r.a.id}"]`).forEach(i => { if (num(i.value)) den[i.dataset.d] = num(i.value); }); await L.closeCash({ date, accountId: x.r.a.id, counted: num(x.v), note, denominations: den }); }
      toast(`${list.length} account${list.length > 1 ? 's' : ''} closed.`); rr();
    } catch (er) { fail(er); rr(); }
  });
  recalc();
}

/* ================= Accounts: ledgers & manual journals ================= */
let tbView = 'summary', aTab = 'ledger', aFrom = null, aTo = null, aAcc = null, aKind = 'account', aParty = { customer: null, supplier: null }, jvShow = 'posted';
export const accounts = {
  title: 'Accounts', icon: '📒', roles: ['admin', 'manager'],
  head: () => `<button class="btn btn-accent" data-a="jv">＋ Manual journal</button><button class="btn" data-a="newacc">＋ Account</button>`,
  body() {
    const tabs = [['ledger', 'Ledger'], ['jv', 'Manual Journals'], ['daybook', 'Day Book'], ['tb', 'Trial Balance'], ['coa', 'Chart of Accounts'], ['opening', 'Opening Balances']];
    if (!tabs.some(t => t[0] === aTab)) aTab = 'ledger';
    const needRange = ['ledger', 'daybook', 'jv'].includes(aTab), needAsOf = aTab === 'tb';
    aFrom = aFrom || today().slice(0, 8) + '01'; aTo = aTo || today();
    const partyOpts = k => all(k === 'customer' ? 'customers' : 'suppliers').sort((a, b) => a.name.localeCompare(b.name));
    const pick = aTab === 'ledger' ? `<select class="inp" id="aKind" style="width:auto">${[['account', 'Account'], ['customer', 'Customer'], ['supplier', 'Supplier']].map(([k, l]) => `<option value="${k}"${k === aKind ? ' selected' : ''}>${l} ledger</option>`).join('')}</select>
      ${aKind === 'account' ? `<select class="inp" id="aAcc" style="width:auto;min-width:220px">${accountOptions(() => true).map(([k, l]) => `<option value="${k}"${k === (aAcc || L.ACC.cash) ? ' selected' : ''}>${esc(l)}</option>`).join('')}</select>`
        : `<select class="inp" id="aParty" style="width:auto;min-width:220px"><option value="">Choose ${aKind}…</option>${partyOpts(aKind).map(p => `<option value="${p.id}"${p.id === aParty[aKind] ? ' selected' : ''}>${esc(p.name)}${p.mobile ? ' · ' + esc(p.mobile) : ''}</option>`).join('')}</select>`}` : '';
    const tbSel = aTab === 'tb' ? `<select class="inp" id="tbView" style="width:auto"><option value="summary"${tbView === 'summary' ? ' selected' : ''}>Summary view</option><option value="expanded"${tbView === 'expanded' ? ' selected' : ''}>Expanded view (every ledger)</option></select>` : '';
    const jvFilter = aTab === 'jv' ? `<select class="inp" id="jvShow" style="width:auto">${[['posted', 'Posted'], ['void', 'Deleted'], ['all', 'All']].map(([k, l]) => `<option value="${k}"${k === jvShow ? ' selected' : ''}>${l}</option>`).join('')}</select>` : '';
    return `<div class="tabs">${tabs.map(([k, l]) => `<button data-t="${k}" class="${k === aTab ? 'active' : ''}">${l}</button>`).join('')}</div>
      ${!['coa', 'opening'].includes(aTab) ? `<div class="toolbar">${pick}${jvFilter}${tbSel}
        ${needRange ? `<label class="hint">From</label><input type="date" class="inp" id="aFrom" value="${aFrom}" style="width:auto">` : ''}<label class="hint">${needAsOf ? 'As of' : 'To'}</label><input type="date" class="inp" id="aTo" value="${aTo}" style="width:auto">
        ${needRange ? `<div class="chips">${[['This month', today().slice(0, 8) + '01', today()], ['Last month', ...lastMonth()], ['This year', today().slice(0, 5) + '01-01', today()]].map(([l, f, t]) => `<button class="chip" data-r="${f}|${t}">${l}</button>`).join('')}</div>` : ''}
        <button class="btn btn-sm" data-a="print">⬇ Printable file</button><button class="btn btn-sm" data-a="csv">⬇ CSV</button></div>` : ''}
      <div class="panel" id="rep"><div class="empty">Loading…</div></div>`;
  },
  async after() {
    const box = $('rep'); if (!box) return; const accs = all('accounts').sort((a, b) => a.code.localeCompare(b.code)); let html = '';
    const tbl = (head, rows, foot = '') => `<div class="tw"><table><thead><tr>${head.map(h => `<th class="${h.endsWith(' ') ? 'num' : ''}">${h.trim()}</th>`).join('')}</tr></thead><tbody>${rows || `<tr><td colspan="${head.length}" class="muted">Nothing to show.</td></tr>`}</tbody>${foot}</table></div>`;
    const period = `<span class="muted" style="font-size:13px;font-weight:600"> · ${fmtDate(aFrom)} – ${fmtDate(aTo, { day: 'numeric', month: 'short', year: 'numeric' })}</span>`;
    const refCell = j => j.srcId ? `<a href="#" class="mono" data-jvopen="${j.srcId}">${esc(j.refNo)}</a>` : `<span class="mono">${esc(j.refNo)}</span>`;
    window.__repCSV = null;
    try {
      if (aTab === 'opening') { html = openingHTML(); }
      else if (aTab === 'coa') {
        const preset = { 'Assets': 'asset:other', 'Liabilities': 'liability:other', 'Equity': 'equity:other', 'Income': 'income:opinc', 'Cost of sales': 'expense:cos', 'Operating expenses': 'expense:opex', 'Other income': 'income:other', 'Non-operating expenses': 'expense:nonop' };
        html = '<div class="coa">' + Object.keys(preset).map(l => { const a = accs.filter(x => L.accClass(x) === l); return `<div style="display:flex;justify-content:space-between;align-items:center;margin-top:10px"><h2 style="margin:0">${l}</h2><button class="btn btn-sm btn-ghost" data-accnew="${preset[l]}">＋ Add</button></div>` + tbl(['Code', 'Account', 'Balance ', ''], a.map(x => `<tr class="click" data-acc="${x.id}"><td class="mono nowrap">${x.code}</td><td>${x.parent ? '<span class="muted" style="padding-left:14px">↳</span> ' : ''}${esc(x.name)}${x.system ? '' : ' <span class="pill">Custom</span>'}</td><td class="num">${money(sign(x, x.bal))}</td><td style="width:40px"><button class="icon-btn" data-accedit="${x.id}" title="Edit account">✎</button></td></tr>`).join('')); }).join('') + '</div>'
          + '<p class="hint" style="margin-top:8px">Tap an account to open its ledger, or ✎ to rename it or change its type. The Profit & Loss follows these sections: Income − Cost of sales = Gross profit; − Operating expenses = Operating profit; + Other income − Non-operating expenses = Net profit.</p>';
      } else if (aTab === 'tb') {
        GO.reset(); const items = L.statementItems(aTo), ex = tbView === 'expanded';
        const ORDER = [['asset', 'Assets'], ['liability', 'Liabilities'], ['equity', 'Equity'], ['income', 'Income'], ['expense', 'Expenses']];
        let dr = 0, cr = 0; const csv = [['Group', 'Ledger', 'Debit', 'Credit']];
        const line = (name, v, go, cls = '') => { v = r2(v); if (v > 0) dr += v; else cr -= v; return `<tr class="${cls}${go != null ? ' go' : ''}"${go != null ? ` data-go="${go}"` : ''}><td>${esc(name)}</td><td class="num">${v > 0 ? money(v) : ''}</td><td class="num">${v < 0 ? money(-v) : ''}</td></tr>`; };
        let body = '';
        ORDER.forEach(([t, l]) => {
          const its = items.filter(i => i.type === t && Math.abs(i.bal) > 0.009); if (!its.length) return;
          body += `<tr class="r-sec"><td colspan="3">${l}</td></tr>`;
          if (ex) its.forEach(i => { body += line((i.code ? i.code + ' · ' : '') + i.name, i.bal, GO.put(i.go), 'r-ind'); csv.push([l, i.name, i.bal > 0 ? i.bal : '', i.bal < 0 ? -i.bal : '']); });
          else [...new Set(its.map(i => i.grp))].forEach(g => { const gi = its.filter(i => i.grp === g), v = r2(gi.reduce((x, i) => x + i.bal, 0)), nm = g.charAt(0).toUpperCase() + g.slice(1);
            body += line(nm, v, GO.put(gi.length === 1 ? gi[0].go : { t: 'group', title: nm, items: gi.map(i => ({ name: i.name, bal: i.bal, go: i.go })) }), 'r-ind'); csv.push([l, nm, v > 0 ? v : '', v < 0 ? -v : '']); });
        });
        html = `<h2>Trial Balance as of ${fmtDate(aTo, { day: 'numeric', month: 'short', year: 'numeric' })} <span class="muted" style="font-size:13px;font-weight:600">· ${ex ? 'Expanded' : 'Summary'} view</span></h2><div class="tw"><table class="rep"><thead><tr><th>${ex ? 'Ledger' : 'Group'}</th><th class="num">Debit</th><th class="num">Credit</th></tr></thead><tbody>${body}</tbody><tfoot><tr><td>Total ${Math.abs(dr - cr) < 0.01 ? '✓ balanced' : '⚠ not balanced'}</td><td class="num">${money(dr)}</td><td class="num">${money(cr)}</td></tr></tfoot></table></div>
          <p class="hint" style="margin-top:8px">Tap any line to open its ledger. Receivables and payables are split: what customers owe vs the advances they paid (unearned revenue), and what we owe vendors vs the advances we paid them — tap them for the customer or vendor list.</p>`;
        window.__repCSV = [...csv, ['Total', '', r2(dr), r2(cr)]];
      } else if (aTab === 'ledger') {
        L.derive(true); const J = store.data.journals_ || [];
        let title, match, net, show, csvHead;
        if (aKind === 'account') {
          const acc = aAcc || L.ACC.cash, a = byId('accounts', acc); title = a.code + ' · ' + a.name;
          match = j => j.accs.includes(acc); net = j => r2(j.lines.filter(l => l.acc === acc).reduce((s, l) => s + l.dr - l.cr, 0)); show = v => money(sign(a, v));
        } else {
          const id = aParty[aKind], p = id ? byId(aKind === 'customer' ? 'customers' : 'suppliers', id) : null;
          if (!p) { html = `<div class="empty">Choose a ${aKind} above to see their ledger.</div>`; throw null; }
          const key = aKind === 'customer' ? 'c' : 's'; title = p.name + (p.mobile ? ' · ' + p.mobile : '');
          match = j => j.lines.some(l => l[key] === id);
          net = j => r2(j.lines.filter(l => l[key] === id).reduce((s, l) => s + (key === 'c' ? l.dr - l.cr : l.cr - l.dr), 0));
          show = v => money(Math.abs(v)) + (r2(v) ? `<span class="muted" style="font-size:11px"> ${key === 'c' ? (v > 0 ? 'Dr' : 'Cr') : (v > 0 ? 'Cr' : 'Dr')}</span>` : '');
        }
        const before = J.filter(j => j.date < aFrom && match(j)), inside = J.filter(j => j.date >= aFrom && j.date <= aTo && match(j));
        const open = r2(before.reduce((s, j) => s + net(j), 0)); let run = open, td = 0, tc = 0;
        const isParty = aKind !== 'account', sup = aKind === 'supplier';
        const csv = [['Date', 'Ref', 'Type', 'Details', 'Debit', 'Credit', 'Balance'], ['', '', '', 'Opening balance', '', '', open]];
        const rows = inside.map(j => {
          const v = net(j); run = r2(run + v);
          const d = sup ? (v < 0 ? -v : 0) : (v > 0 ? v : 0), c = sup ? (v > 0 ? v : 0) : (v < 0 ? -v : 0); td += d; tc += c;
          csv.push([j.date, j.refNo, j.refType, [j.party, j.memo].filter(Boolean).join(' · '), d || '', c || '', run]);
          return `<tr><td class="nowrap">${fmtDate(j.date)}</td><td>${refCell(j)}</td><td><span class="pill">${esc(TYPE_NAMES[j.refType] || j.refType)}</span></td><td>${esc([isParty ? '' : j.party, j.memo].filter(Boolean).join(' · '))}</td><td class="num">${d ? money(d) : ''}</td><td class="num">${c ? money(c) : ''}</td><td class="num nowrap">${show(run)}</td></tr>`;
        }).join('');
        csv.push(['', '', '', 'Closing balance', r2(td), r2(tc), run]); window.__repCSV = csv;
        const staffAcc = aKind === 'account' && ['staffadv', 'salpay', 'eosb'].includes((byId('accounts', aAcc) || {}).group);
        html = `<h2>${esc(title)}${period}</h2>${staffAcc ? `<p style="margin:-6px 0 10px"><a href="#" data-empacc="${aAcc}">👥 Balances by staff member</a></p>` : ''}` + tbl(['Date', 'Ref', 'Type', 'Details', 'Debit ', 'Credit ', 'Balance '],
          `<tr><td colspan="6"><b>Opening balance</b></td><td class="num nowrap"><b>${show(open)}</b></td></tr>` + rows,
          `<tfoot><tr><td colspan="4">Closing balance · ${inside.length} entr${inside.length === 1 ? 'y' : 'ies'}</td><td class="num">${money(td)}</td><td class="num">${money(tc)}</td><td class="num nowrap">${show(run)}</td></tr></tfoot>`)
          + `<p class="hint" style="margin-top:8px">${isParty ? (sup ? 'Cr = we owe the supplier, Dr = the supplier owes us (advance).' : 'Dr = the customer owes us, Cr = we hold their advance.') : 'Tap a JV number to open that manual journal.'}</p>`;
      } else if (aTab === 'daybook') {
        const js = (await L.journalsBetween(aFrom, aTo)).reverse();
        html = `<h2>Day Book${period}</h2>` + tbl(['Date', 'Ref', 'Details', 'Account', 'Debit ', 'Credit '], js.map(j => j.lines.map((l, i) => `<tr${i === 0 ? ' style="border-top:2px solid var(--line)"' : ''}><td class="nowrap">${i === 0 ? fmtDate(j.date) : ''}</td><td>${i === 0 ? refCell(j) : ''}</td><td>${i === 0 ? esc([j.party, j.memo].filter(Boolean).join(' · ')) : ''}</td><td>${esc(L.accName(l.acc))}${l.e && byId('hrStaff', l.e) ? `<div class="muted" style="font-size:11px">${esc(byId('hrStaff', l.e).name)}</div>` : ''}</td><td class="num">${l.dr ? money(l.dr) : ''}</td><td class="num">${l.cr ? money(l.cr) : ''}</td></tr>`).join('')).join(''));
      } else if (aTab === 'jv') {
        const list = all('journals').filter(j => j.date >= aFrom && j.date <= aTo && (jvShow === 'all' || (jvShow === 'void' ? j.status === 'void' : j.status !== 'void')))
          .sort((a, b) => b.date.localeCompare(a.date) || (b.createdAt || 0) - (a.createdAt || 0));
        const tot = j => r2(j.total || j.lines.reduce((s, l) => s + num(l.dr), 0));
        const side = (j, k) => [...new Set(j.lines.filter(l => num(l[k])).map(l => L.accName(l.acc)))].join(', ');
        html = `<h2>Manual Journals${period}</h2>` + tbl(['Date', 'JV No.', 'Description', 'Debit', 'Credit', 'Amount ', 'By'], list.map(j => `<tr class="click" data-jvopen="${j.id}"${j.status === 'void' ? ' style="opacity:.55"' : ''}>
            <td class="nowrap">${fmtDate(j.date)}</td><td class="mono nowrap">${esc(j.no)}${j.status === 'void' ? ' <span class="pill p-void">Deleted</span>' : j.reversedBy ? ' <span class="pill">Reversed</span>' : ''}</td>
            <td>${esc(j.memo || '—')}${j.party ? `<div class="muted" style="font-size:12px">${esc(j.party)}</div>` : ''}</td><td style="font-size:12px">${esc(side(j, 'dr'))}</td><td style="font-size:12px">${esc(side(j, 'cr'))}</td>
            <td class="num nowrap"><b>${money(tot(j))}</b></td><td class="muted nowrap" style="font-size:12px">${esc(L.nm(j.createdBy))}</td></tr>`).join(''),
          `<tfoot><tr><td colspan="5">${list.length} journal${list.length === 1 ? '' : 's'}</td><td class="num">${money(list.filter(j => j.status !== 'void').reduce((s, j) => s + tot(j), 0))}</td><td></td></tr></tfoot>`)
          + `<p class="hint" style="margin-top:8px">Use a manual journal for entries that have no screen of their own: owner's capital or drawings, loans, depreciation, corrections, writing off a customer balance. Tap a journal to view, edit, reverse or delete it.</p>`;
        window.__repCSV = [['Date', 'JV No', 'Status', 'Description', 'Account', 'Customer/Supplier', 'Debit', 'Credit'], ...list.flatMap(j => j.lines.map(l => [j.date, j.no, j.status === 'void' ? 'Deleted' : 'Posted', j.memo || '', L.accName(l.acc), l.c ? byId('customers', l.c)?.name || '' : l.s ? byId('suppliers', l.s)?.name || '' : '', l.dr || '', l.cr || '']))];
      }
    } catch (e) { if (e) html = `<div class="alert a-bad">${esc(e.message)}</div>`; }
    if ($('rep')) $('rep').innerHTML = html;
    if (aTab === 'opening') obTotals();
  },
  bind(root) {
    root.addEventListener('click', e => {
      const go = e.target.closest('[data-go]'); if (go && aTab === 'tb') return openGo(GO.reg[+go.dataset.go], aTo);
      const ea = e.target.closest('[data-empacc]'); if (ea) { e.preventDefault(); return import('./views-hr-pay.js').then(m => m.empListDialog(ea.dataset.empacc, aTo)); }
      if (e.target.closest('[data-a=obsave]')) return saveOpenings();
      if (e.target.closest('[data-a=obreset]')) { obDraft = null; return rr(); }
      const obl = e.target.closest('[data-obgo]'); if (obl) { e.preventDefault(); if (obl.dataset.obgo === 'items') return openingStockDialog(); location.hash = '#/' + obl.dataset.obgo; return; }
      const ae = e.target.closest('[data-accedit]'); if (ae) { e.stopPropagation(); return accountDialog(byId('accounts', ae.dataset.accedit)); }
      const an = e.target.closest('[data-accnew]'); if (an) return accountDialog(null, an.dataset.accnew);
      const jo = e.target.closest('[data-jvopen]'); if (jo) { e.preventDefault(); const j = byId('journals', jo.dataset.jvopen); if (j) openJournal(j); return; }
      const t = e.target.closest('[data-t]'); if (t) { aTab = t.dataset.t; return rr(); }
      const r = e.target.closest('[data-r]'); if (r) { [aFrom, aTo] = r.dataset.r.split('|'); return rr(); }
      const a = e.target.closest('[data-a]')?.dataset.a;
      if (a === 'jv') return journalDialog(); if (a === 'newacc') return accountDialog();
      if (a === 'print') saveDocument(aTab + '_' + aTo + '.html', 'Report', `<div class="doc"><h1>${esc(setting('name', ''))}</h1>${$('rep').innerHTML}</div>`);
      if (a === 'csv') { if (window.__repCSV) download(aTab + '_' + aTo + '.csv', toCSV(window.__repCSV)); else { const rows = [...$('rep').querySelectorAll('tr')].map(tr => [...tr.children].map(td => td.innerText)); download(aTab + '_' + aTo + '.csv', toCSV(rows)); } }
      const acc = e.target.closest('[data-acc]'); if (acc) { aAcc = acc.dataset.acc; aKind = 'account'; aTab = 'ledger'; rr(); }
    });
    root.addEventListener('input', e => { const ob = e.target.dataset.ob; if (!ob) return; obDraft = obDraft || {}; const tr = e.target.closest('tr'), dr = num(tr.querySelector('[data-side=dr]').value), cr = num(tr.querySelector('[data-side=cr]').value);
      if (e.target.value && num(e.target.value)) tr.querySelector(`[data-side=${e.target.dataset.side === 'dr' ? 'cr' : 'dr'}]`).value = '';
      obDraft[ob] = r2(e.target.dataset.side === 'dr' ? num(e.target.value) : -num(e.target.value)); obTotals(); });
    root.addEventListener('change', e => {
      const id = e.target.id, v = e.target.value;
      if (id === 'obDate') { obDateV = v; return; }
      if (id === 'tbView') { tbView = v; return rr(); }
      if (id === 'aFrom') aFrom = v; else if (id === 'aTo') aTo = v; else if (id === 'aAcc') aAcc = v; else if (id === 'aKind') aKind = v; else if (id === 'aParty') aParty[aKind] = v; else if (id === 'jvShow') jvShow = v; else return;
      rr();
    });
  }
};
/* ---- drill-down from statements: ledger, party lists, groups ---- */
export const GO = { reg: [], reset() { this.reg = []; }, put(g) { if (!g) return null; this.reg.push(g); return this.reg.length - 1; } };
export function openLedger({ kind = 'account', id, to }) {
  aTab = 'ledger'; aKind = kind; if (kind === 'account') aAcc = id; else aParty[kind] = id;
  aTo = to || today(); const y0 = aTo.slice(0, 4) + '-01-01', od = L.openingDate(); aFrom = od && od < y0 ? od : y0;
  closeModal(); if ((location.hash || '').includes('accounts')) rr(); else location.hash = '#/accounts';
}
export function openGo(g, date) {
  if (!g) return;
  if (g.t === 'acc') return openLedger({ kind: 'account', id: g.id, to: date });
  if (g.t === 'party') return partyListDialog(g.kind, g.side, date);
  if (g.t === 'emp') return import('./views-hr-pay.js').then(m => m.empListDialog(g.acc, date));
  if (g.t === 'group') {
    openModal(g.title, `<div class="tw"><table><thead><tr><th>Ledger</th><th class="num">Balance</th></tr></thead><tbody>${g.items.map((x, i) => `<tr class="click" data-gi="${i}"><td>${esc(x.name)}</td><td class="num">${money(x.bal)}</td></tr>`).join('')}</tbody><tfoot><tr><td>Total</td><td class="num">${money(g.items.reduce((s, x) => s + x.bal, 0))}</td></tr></tfoot></table></div><p class="hint" style="margin-top:8px">Tap a ledger to open it.</p>`, [{ label: 'Close' }],
      { onOpen: b => b.addEventListener('click', e => { const r = e.target.closest('[data-gi]'); if (r) { const x = g.items[+r.dataset.gi]; closeModal(); setTimeout(() => openGo(x.go, date), 50); } }) });
  }
}
function partyListDialog(kind, side, date) {
  const { c, s: sp } = L.partyBalancesAsOf(date || today()), m = kind === 'customer' ? c : sp, coll = kind === 'customer' ? 'customers' : 'suppliers';
  const want = v => side === (kind === 'customer' ? 'dr' : 'cr') ? v > 0.009 : v < -0.009;
  const list = Object.entries(m).filter(([, v]) => want(v)).map(([id, v]) => ({ p: byId(coll, id) || { id, name: '(deleted)' }, v: Math.abs(v) })).sort((a, b) => b.v - a.v);
  const title = kind === 'customer' ? (side === 'dr' ? 'Accounts Receivable — customers who owe us' : 'Customer Advances (Unearned Revenue) — paid before delivery') : (side === 'cr' ? 'Accounts Payable — vendors we owe' : 'Advances to Vendors — paid before their bill');
  openModal(title, `<p class="hint" style="margin:0 0 8px">As of ${fmtDate(date || today(), { day: 'numeric', month: 'short', year: 'numeric' })} · ${list.length} ${kind === 'customer' ? 'customer' : 'vendor'}${list.length === 1 ? '' : 's'}</p>
    ${list.length ? `<div class="tw" style="max-height:60vh"><table><thead><tr><th>${kind === 'customer' ? 'Customer' : 'Vendor'}</th><th class="hide-m">Mobile</th><th class="num">Balance</th></tr></thead><tbody>${list.map(x => `<tr class="click" data-pl="${x.p.id}"><td><b>${esc(x.p.name)}</b></td><td class="hide-m">${esc(x.p.mobile || '')}</td><td class="num">${money(x.v)}</td></tr>`).join('')}</tbody>
    <tfoot><tr><td>Total</td><td class="hide-m"></td><td class="num">${money(list.reduce((s, x) => s + x.v, 0))}</td></tr></tfoot></table></div><p class="hint" style="margin-top:8px">Tap a name to open their ledger.</p>` : empty('✓', 'Nobody in this list.')}`, [{ label: 'Close' }],
    { wide: true, onOpen: b => b.addEventListener('click', e => { const r = e.target.closest('[data-pl]'); if (r) openLedger({ kind, id: r.dataset.pl, to: date }); }) });
}

let obDraft = null, obDateV = null;
const OB_GO = { ar: ['customers', 'Customers → open a customer → Opening balance'], ap: ['suppliers', 'Suppliers → open a supplier → Opening balance'], inventory: ['items', 'Stock → 📦 Opening stock'] };
function openingHTML() {
  const accs = L.openingAccounts(), date = obDateV || L.openingDate(), locked = L.lockedUpTo() && date <= L.lockedUpTo();
  const val = a => obDraft && obDraft[a.id] !== undefined ? obDraft[a.id] : L.accountOpening(a);
  const sec = t => accs.filter(a => a.type === t);
  const row = a => { const v = val(a), sub = L.SUBLEDGER[a.group];
    return `<tr><td class="mono">${a.code}</td><td>${esc(a.name)}${sub ? `<div class="hint">From ${OB_GO[a.group][1]} <a href="#" data-obgo="${OB_GO[a.group][0]}">Open</a></div>` : ''}</td>
      ${sub ? `<td class="num">${v > 0 ? money(v) : ''}</td><td class="num">${v < 0 ? money(-v) : ''}</td>`
      : `<td><input class="inp inp-sm num" type="number" step=".01" min="0" data-ob="${a.id}" data-side="dr" value="${v > 0 ? v : ''}"${locked ? ' disabled' : ''}></td><td><input class="inp inp-sm num" type="number" step=".01" min="0" data-ob="${a.id}" data-side="cr" value="${v < 0 ? -v : ''}"${locked ? ' disabled' : ''}></td>`}</tr>`; };
  return `<div class="toolbar" style="margin-bottom:10px"><label class="hint">Opening date (the day you start using this system)</label><input type="date" class="inp" id="obDate" value="${date}" style="width:auto"${locked ? ' disabled' : ''}>
      <button class="btn btn-ok" data-a="obsave"${locked ? ' disabled' : ''}>Save opening balances</button>${obDraft ? '<button class="btn btn-sm" data-a="obreset">Undo changes</button>' : ''}</div>
    <p class="hint" style="margin:0 0 10px">Only <b>balance-sheet</b> ledgers have opening balances: assets, liabilities and equity. Income and expense accounts start from zero. Enter assets as <b>Debit</b> and liabilities / capital as <b>Credit</b>. Any difference between the totals goes to <b>Opening Balance Equity</b>, so the books always balance.</p>
    ${locked ? `<div class="alert a-warn">Cash is closed up to ${fmtDate(L.lockedUpTo())}, so opening balances dated on or before it can't change.</div>` : ''}
    <div class="tw"><table><thead><tr><th style="width:70px">Code</th><th>Ledger</th><th class="num" style="width:150px">Debit</th><th class="num" style="width:150px">Credit</th></tr></thead><tbody>
    ${[['asset', 'Assets'], ['liability', 'Liabilities'], ['equity', 'Equity']].map(([t, l]) => `<tr><td colspan="4" style="font-weight:800;background:var(--panel-2)">${l}</td></tr>${sec(t).map(row).join('')}`).join('')}</tbody>
    <tfoot><tr><td></td><td>Total</td><td class="num" id="obDr"></td><td class="num" id="obCr"></td></tr><tr><td></td><td>Difference → Opening Balance Equity</td><td class="num" id="obDiffDr"></td><td class="num" id="obDiffCr"></td></tr></tfoot></table></div>
`;
}
function obTotals() {
  let dr = 0, cr = 0; L.openingAccounts().forEach(a => { const v = obDraft && obDraft[a.id] !== undefined && !L.SUBLEDGER[a.group] ? obDraft[a.id] : L.accountOpening(a); if (v > 0) dr += v; else cr -= v; });
  if (!$('obDr')) return; $('obDr').textContent = money(dr); $('obCr').textContent = money(cr); const d = r2(dr - cr);
  $('obDiffDr').textContent = d < 0 ? money(-d) : ''; $('obDiffCr').textContent = d > 0 ? money(d) : ''; if (!d) $('obDiffDr').textContent = '✓ balanced';
}
async function saveOpenings() {
  const vals = {}; document.querySelectorAll('[data-ob][data-side=dr]').forEach(i => { const tr = i.closest('tr'); vals[i.dataset.ob] = r2(num(i.value) - num(tr.querySelector('[data-side=cr]').value)); });
  try { const n = await L.saveAccountOpenings(vals, val('obDate')); obDraft = null; toast(n ? 'Opening balances saved.' : 'Nothing changed.'); rr(); } catch (e) { fail(e); }
}
const TYPE_NAMES = { payroll: 'Payroll', salarypay: 'Salary paid', staffpay: 'Staff payment', advance: 'Staff advance', advrepay: 'Advance repaid', eosbopen: 'Gratuity opening', eosbpay: 'Gratuity paid', creditnote: 'Credit note', debitnote: 'Debit note', manual: 'Journal', opening: 'Opening', invoice: 'Invoice', void: 'Void', receipt: 'Receipt', refund: 'Refund', purchase: 'Purchase', payment: 'Payment', expense: 'Expense', transfer: 'Transfer', adjustment: 'Stock adj.', cashdiff: 'Cash short/over' };
const TYPE_LABELS = [['asset', 'Assets'], ['liability', 'Liabilities'], ['equity', 'Equity'], ['income', 'Income'], ['expense', 'Expenses']];
const sign = (a, v) => (a.type === 'asset' || a.type === 'expense') ? r2(v) : r2(-v);
function lastMonth() { const d = new Date(today() + 'T00:00'); d.setDate(0); const e = today(d); d.setDate(1); return [today(d), e]; }
function openJournal(j) {
  const locked = L.lockedUpTo() && j.date <= L.lockedUpTo(), dead = j.status === 'void';
  const pty = l => l.c ? byId('customers', l.c)?.name : l.s ? byId('suppliers', l.s)?.name : l.e ? (byId('hrStaff', l.e)?.name || 'Staff member') : '';
  const body = `<div class="row2" style="margin-bottom:10px"><div><div class="hint">Date</div><b>${fmtDate(j.date, { day: 'numeric', month: 'short', year: 'numeric' })}</b></div><div><div class="hint">Entered by</div><b>${esc(L.nm(j.createdBy))}</b>${j.updatedBy && j.updatedAt !== j.createdAt ? `<div class="hint">Last changed by ${esc(L.nm(j.updatedBy))}</div>` : ''}</div></div>
    ${j.memo ? `<p style="margin:0 0 10px">${esc(j.memo)}</p>` : ''}
    ${dead ? `<div class="alert a-bad">Deleted${j.voidReason ? ' — ' + esc(j.voidReason) : ''}. It no longer counts in the books.</div>` : ''}${j.reversedBy ? `<div class="alert a-info">Reversed by ${esc(j.reversedBy)}.</div>` : ''}${j.reverses ? `<div class="alert a-info">This entry reverses ${esc(j.reverses)}.</div>` : ''}
    ${j.src === 'hr' ? `<div class="alert a-info">Made by HR &amp; Payroll (${esc(j.refType || '')}). Change it from HR &amp; Payroll — it can’t be edited here.</div>` : ''}${locked && !dead ? `<div class="alert a-warn">Cash is closed up to ${fmtDate(L.lockedUpTo())}, so this journal can't be edited or deleted. Use Reverse to cancel it with a new entry dated today.</div>` : ''}
    <div class="tw"><table><thead><tr><th>Account</th><th class="num">Debit</th><th class="num">Credit</th></tr></thead><tbody>${j.lines.map(l => `<tr><td>${esc(L.accName(l.acc))}${pty(l) ? `<div class="muted" style="font-size:12px">${esc(pty(l))}</div>` : ''}</td><td class="num">${l.dr ? money(l.dr) : ''}</td><td class="num">${l.cr ? money(l.cr) : ''}</td></tr>`).join('')}</tbody>
    <tfoot><tr><td>Total</td><td class="num">${money(j.lines.reduce((s, l) => s + num(l.dr), 0))}</td><td class="num">${money(j.lines.reduce((s, l) => s + num(l.cr), 0))}</td></tr></tfoot></table></div>`;
  const acts = [{ label: 'Close' }];
  if (!dead) {
    if (j.src === 'hr') { acts.unshift({ label: '↗ Open in HR & Payroll', onClick: () => { const to = j.refType === 'payroll' || j.refType === 'salarypay' ? 'hrpay' : j.refType === 'advance' || j.refType === 'advrepay' ? 'hradv' : j.refType === 'staffpay' ? 'hrinc' : 'hrstaff'; if (to === 'hrpay' && j.srcRef) window.__hrPayMonth = j.srcRef; location.hash = '#/' + to; } }, { label: '⬇ Download', onClick: () => { saveDocument(j.no + '.html', 'Journal ' + j.no, `<div class="doc"><h1>${esc(setting('name', ''))}</h1><h2>Journal voucher ${esc(j.no)}</h2>${$('modalBody').innerHTML}</div>`); return false; } }); return openModal('Journal ' + j.no, body, acts, { wide: true }); }
    acts.unshift({ label: '⬇ Download', onClick: () => { saveDocument(j.no + '.html', 'Journal ' + j.no, `<div class="doc"><h1>${esc(setting('name', ''))}</h1><h2>Journal voucher ${esc(j.no)}</h2>${$('modalBody').innerHTML}</div>`); return false; } });
    if (!j.reversedBy) acts.unshift({ label: '↺ Reverse', perm: 'accounts:add', onClick: () => { setTimeout(async () => { if (!await confirmBox('Reverse ' + j.no, `Post a new journal dated today that cancels ${esc(j.no)}? The original stays in the books, and the two entries cancel each other.`, 'Post reversal')) return; try { const id = await L.reverseJournal(j); toast('Reversal posted.'); setTimeout(() => openJournal(byId('journals', id)), 60); } catch (err) { fail(err); } }, 50); } });
    if (!locked) {
      acts.unshift({ label: 'Delete', cls: 'btn-danger', perm: 'accounts:delete', onClick: () => { setTimeout(() => openModal('Delete ' + j.no, field('Reason', input('jvWhy', '', 'placeholder="e.g. Entered twice"')) + '<p class="hint">The journal stays in the list marked “Deleted” for the record, but no longer counts in the books.</p>', [{ label: 'Cancel' }, { label: 'Delete journal', cls: 'btn-danger', onClick: async () => { await L.deleteJournal(j, val('jvWhy')); toast('Journal deleted.'); } }]), 50); } });
      acts.unshift({ label: '✎ Edit', perm: 'accounts:edit', onClick: () => { setTimeout(() => journalDialog(j), 50); } });
    }
  }
  openModal('Journal ' + j.no, body, acts, { wide: true });
}
function journalDialog(j) {
  const opts = accountOptions(() => true), AR = L.ACC.ar, AP = L.ACC.ap;
  const custs = all('customers').sort((a, b) => a.name.localeCompare(b.name)), sups = all('suppliers').sort((a, b) => a.name.localeCompare(b.name));
  const partySel = (acc, l = {}) => acc === AR ? `<select class="inp inp-sm jP" data-k="c"><option value="">Choose customer…</option>${custs.map(c => `<option value="${c.id}"${c.id === l.c ? ' selected' : ''}>${esc(c.name)}${c.mobile ? ' · ' + esc(c.mobile) : ''}</option>`).join('')}</select>`
    : acc === AP ? `<select class="inp inp-sm jP" data-k="s"><option value="">Choose supplier…</option>${sups.map(s => `<option value="${s.id}"${s.id === l.s ? ' selected' : ''}>${esc(s.name)}</option>`).join('')}</select>` : '';
  const row = (l = {}) => { const acc = l.acc || opts[0]?.[0]; return `<tr><td><select class="inp inp-sm jA">${opts.map(([k, lb]) => `<option value="${k}"${k === acc ? ' selected' : ''}>${esc(lb)}</option>`).join('')}</select><div class="jPw" style="margin-top:4px">${partySel(acc, l)}</div></td><td><input class="inp inp-sm num jD" type="number" step=".01" min="0" value="${l.dr || ''}"></td><td><input class="inp inp-sm num jC" type="number" step=".01" min="0" value="${l.cr || ''}"></td><td><button class="icon-btn jX" type="button" title="Remove line">✕</button></td></tr>`; };
  const start = j ? j.lines : [{}, {}];
  openModal(j ? 'Edit journal ' + j.no : 'Manual journal', `<div id="jvWrap"><div class="row2">${field('Date', input('jDate', j?.date || today(), 'type="date"'))}${field('Description', input('jMemo', j?.memo || '', 'placeholder="e.g. Owner invested capital, monthly depreciation"'))}</div>
    <div class="tw"><table class="le-table"><thead><tr><th>Account</th><th class="num">Debit</th><th class="num">Credit</th><th></th></tr></thead><tbody id="jRows">${start.map(row).join('')}</tbody></table></div>
    <button class="btn btn-sm" type="button" id="jAdd" style="margin-top:8px">＋ Line</button><p class="hint" id="jTot" style="margin-top:8px"></p>
    <p class="hint">Lines on Accounts Receivable or Accounts Payable need a customer or supplier, so their balances stay correct.</p></div>`,
    [{ label: 'Cancel' }, { label: j ? 'Save changes' : 'Post journal', cls: 'btn-ink', onClick: async () => {
      const lines = [...$('jRows').children].map(tr => { const p = tr.querySelector('.jP'); return { acc: tr.querySelector('.jA').value, dr: num(tr.querySelector('.jD').value), cr: num(tr.querySelector('.jC').value), ...(p ? { [p.dataset.k]: p.value } : {}) }; });
      await L.manualJournal({ id: j?.id, date: val('jDate'), memo: val('jMemo'), lines }); toast(j ? 'Journal updated.' : 'Journal posted.'); } }],
    { wide: true, onOpen: () => {
      const b = $('jvWrap');
      const sum = () => { if (!$('jTot')) return; let d = 0, c = 0; b.querySelectorAll('.jD').forEach(i => d += num(i.value)); b.querySelectorAll('.jC').forEach(i => c += num(i.value)); $('jTot').textContent = `Debit ${money(d)} · Credit ${money(c)} ${Math.abs(d - c) < 0.01 ? (d ? '✓ balanced' : '') : '— difference ' + money(Math.abs(d - c))}`; };
      $('jAdd').onclick = () => { $('jRows').insertAdjacentHTML('beforeend', row()); sum(); };
      b.addEventListener('input', sum);
      b.addEventListener('change', e => { if (e.target.classList.contains('jA')) e.target.closest('td').querySelector('.jPw').innerHTML = partySel(e.target.value); });
      b.addEventListener('click', e => { const x = e.target.closest('.jX'); if (x && $('jRows').children.length > 2) { x.closest('tr').remove(); sum(); } });
      sum();
    } });
}
const KIND_GROUPS = [['asset', 'Assets'], ['liability', 'Liabilities'], ['equity', 'Equity'], ['income', 'Income'], ['expense', 'Expenses']];
const kindOf = a => (L.ACCOUNT_KINDS.find(k => k[1] === a.type && k[2] === a.group) || L.ACCOUNT_KINDS.find(k => k[1] === a.type && (a.type !== 'expense' || k[2] === (L.isCOS(a) ? 'cos' : 'opex')) && (a.type !== 'income' || k[2] === 'opinc')) || [])[0];
function accountDialog(acc, preset) {
  const fixed = acc && L.FIXED_GROUPS.includes(acc.group), cur = acc ? kindOf(acc) : (preset || 'expense:opex');
  const kinds = L.ACCOUNT_KINDS.filter(k => !acc || k[1] === acc.type);
  const kindSel = fixed ? `<select id="acKind" disabled><option value="">${esc(L.accClass(acc))} · used by the app</option></select>` : `<select id="acKind">${KIND_GROUPS.filter(([t]) => kinds.some(k => k[1] === t)).map(([t, l]) => `<optgroup label="${l}">${kinds.filter(k => k[1] === t).map(k => `<option value="${k[0]}"${k[0] === cur ? ' selected' : ''}>${esc(k[3])}</option>`).join('')}</optgroup>`).join('')}</select>`;
  const help = { 'expense:cos': 'Costs that go into the goods you sell — freight inward, loading, carpenter / polishing labour, packing. Shown under Cost of sales, before Gross profit.', 'expense:opex': 'Running costs of the shop — rent, salaries, electricity, advertising. Shown before Operating profit.', 'expense:nonop': 'Costs outside normal trading — loan interest, bank charges, loss on sale of assets, penalties. Shown after Operating profit.', 'income:other': 'Income outside normal trading — interest received, rent received, scrap sale. Shown after Operating profit.', 'income:opinc': 'Income from normal trading, like Sales — e.g. delivery or assembly charges.' };
  openModal(acc ? 'Edit account' : 'New account', `<div id="acWrap"><div class="row2">${field('Account type', kindSel)}${field('Code', input('acCode', acc ? acc.code : '', acc ? 'readonly' : 'placeholder="e.g. 5200"'))}</div>
    ${field('Name', input('acName', acc ? acc.name : '', 'placeholder="e.g. Freight inward"'))}<p class="hint" id="acHelp"></p>
    ${fixed ? '<p class="hint" style="margin-top:6px">The type of this account is fixed because the app posts to it automatically. You can still rename it.</p>' : acc ? '<p class="hint" style="margin-top:6px">Changing the type moves the account to another section of the Profit & Loss. Past entries move with it.</p>' : ''}</div>`,
    [{ label: 'Cancel' }, { label: acc ? 'Save changes' : 'Add account', cls: 'btn-ink', onClick: async () => { await L.saveAccount({ id: acc?.id, code: val('acCode'), name: val('acName'), kind: $('acKind').value }); toast(acc ? 'Account updated.' : 'Account added.'); } }],
    { onOpen: () => {
      const upd = () => { const k = $('acKind').value; $('acHelp').textContent = help[k] || ''; if (!acc) { const st = (L.ACCOUNT_KINDS.find(x => x[0] === k) || [])[4]; if (st && (!$('acCode').value || $('acCode').dataset.auto)) { $('acCode').value = L.nextAccCode(st); $('acCode').dataset.auto = '1'; } } };
      $('acKind').onchange = upd; $('acCode').oninput = () => delete $('acCode').dataset.auto; upd();
    } });
}

/* ================= Staff performance & users ================= */
let sfPeriod = 'month', sfFrom = null, sfTo = null;
export const staff = {
  title: 'Staff Performance', icon: '🏆', roles: ['admin', 'manager'],
  body() {
    const t = today(), periods = { today: [t, t], week: [weekStart(t), t], month: [t.slice(0, 8) + '01', t], last: lastMonth(), custom: [sfFrom || t.slice(0, 8) + '01', sfTo || t] };
    const [from, to] = periods[sfPeriod]; const rows = L.staffPerformance(from, to);
    const T = k => rows.reduce((s, r) => s + num(r[k]), 0);
    const pend = all('users').filter(u => u.role === 'pending');
    return `${pend.length ? `<div class="alert a-warn">🔔 ${pend.length} new staff waiting for approval — <a href="#/users">open Users &amp; Roles</a>.</div>` : ''}
      <div class="toolbar"><div class="chips">${[['today', 'Today'], ['week', 'This week'], ['month', 'This month'], ['last', 'Last month'], ['custom', 'Custom']].map(([k, l]) => `<button class="chip${k === sfPeriod ? ' active' : ''}" data-p="${k}">${l}</button>`).join('')}</div>
      ${sfPeriod === 'custom' ? `<input type="date" class="inp" id="sfFrom" value="${from}" style="width:auto"><input type="date" class="inp" id="sfTo" value="${to}" style="width:auto">` : `<span class="hint">${fmtDate(from)} – ${fmtDate(to)}</span>`}</div>
      <div class="tw" style="margin-bottom:18px"><table><thead><tr><th>Salesman</th><th class="num">Customers attended</th><th class="num">Quoted</th><th class="num">Converted</th><th class="num">Conversion</th><th class="num">Lost</th><th class="num">Sales orders</th><th class="num">Invoiced</th><th class="num">Open FU</th><th class="num">Overdue FU</th></tr></thead><tbody>
      ${rows.map(r => `<tr><td><b>${esc(r.name)}</b></td><td class="num">${r.enquiries}</td><td class="num">${money0(r.quoteValue)}</td><td class="num">${r.converted}</td><td class="num"><b>${r.conv.toFixed(0)}%</b></td><td class="num">${r.lost}</td><td class="num">${money0(r.soValue)} <span class="muted">(${r.soCount})</span></td><td class="num">${money0(r.invValue)}</td><td class="num">${r.openFollowups}</td><td class="num" style="${r.overdue ? 'color:var(--danger);font-weight:800' : ''}">${r.overdue}</td></tr>`).join('') || `<tr><td colspan="10">${empty('🏆', 'No activity in this period.')}</td></tr>`}</tbody>
      ${rows.length ? `<tfoot><tr><td>Total</td><td class="num">${T('enquiries')}</td><td class="num">${money0(T('quoteValue'))}</td><td class="num">${T('converted')}</td><td class="num">${T('enquiries') ? (T('converted') / T('enquiries') * 100).toFixed(0) : 0}%</td><td class="num">${T('lost')}</td><td class="num">${money0(T('soValue'))}</td><td class="num">${money0(T('invValue'))}</td><td class="num">${T('openFollowups')}</td><td class="num">${T('overdue')}</td></tr></tfoot>` : ''}</table></div>
      <p class="hint">Add staff, approve new people and set what each role can open in <a href="#/users">Users &amp; Roles</a>.</p>`;
  },
  bind(root) {
    root.addEventListener('click', e => { const p = e.target.closest('[data-p]'); if (p) { sfPeriod = p.dataset.p; rr(); } });
    root.addEventListener('change', async e => {
      if (e.target.id === 'sfFrom') { sfFrom = e.target.value; rr(); } if (e.target.id === 'sfTo') { sfTo = e.target.value; rr(); }
    });
  }
};

/* ================= Users & roles ================= */
const LEVEL = { admin: 'Owner', manager: 'Manager level', billing: 'Billing level', sales: 'Salesman level', pending: '—', disabled: '—' };
const rightsNote = (r, on) => { const rt = r.rights || {}, mods = on.filter(n => !L.VIEW_ONLY.includes(n)); const vo = mods.filter(n => (rt[n] ?? 'aed') === '').length, nd = mods.filter(n => { const x = rt[n] ?? 'aed'; return x && !x.includes('d'); }).length, lim = mods.filter(n => { const x = rt[n] ?? 'aed'; return x && x !== 'aed'; }).length;
  return !vo && !lim ? '<div class="muted">Full access</div>' : `<div>${[vo ? vo + ' view only' : '', nd ? nd + ' without delete' : '', lim - nd > 0 ? (lim - nd) + ' limited' : ''].filter(Boolean).map(x => `<span class="pill p-followup">${x}</span>`).join(' ')}</div>`; };
const needsEditor = b => ['admin', 'manager', 'billing'].includes(b);
export const users = {
  title: 'Users & Roles', icon: '🔑', roles: ['admin', 'manager'],
  head: () => L.can.admin(role()) ? `<button class="btn btn-ok" data-a="adduser">＋ Add user</button><button class="btn btn-accent" data-a="newrole">＋ New role</button>` : '',
  body() {
    const isOwner = L.can.admin(role()), nav = window.__gsmNav, roles = L.roleList(), people = all('users');
    const modsOf = r => { const avail = nav.SECTIONS.flatMap(x => x[1]).filter(n => nav.VIEWS[n].roles.includes(r.base)); const on = r.modules ? avail.filter(n => r.modules.includes(n)) : avail.filter(n => L.defaultOn(n, r.base)); return { on, avail }; };
    const pend = people.filter(u => u.role === 'pending');
    const roleSel = u => `<select class="inp inp-sm" data-role="${u.id}" style="width:auto;max-width:220px"><optgroup label="Built-in">${['manager', 'billing', 'sales'].map(k => `<option value="${k}"${k === u.roleId ? ' selected' : ''}>${esc(L.ROLES[k])}</option>`).join('')}</optgroup>
      ${roles.some(r => !r.builtin) ? `<optgroup label="Your roles">${roles.filter(r => !r.builtin).map(r => `<option value="${r.id}"${r.id === u.roleId ? ' selected' : ''}>${esc(r.name)}</option>`).join('')}</optgroup>` : ''}
      <optgroup label="Other"><option value="pending"${u.roleId === 'pending' ? ' selected' : ''}>Waiting (no access)</option><option value="disabled"${u.roleId === 'disabled' ? ' selected' : ''}>Disabled</option></optgroup></select>`;
    return `${pend.length ? `<div class="alert a-warn">🔔 ${pend.length} new staff waiting for a role — choose one for them below.</div>` : ''}
      <div class="panel" style="margin-bottom:16px"><div class="panel-h"><h2>🔑 Roles, modules & permissions</h2></div>
        <p class="hint" style="margin:0 0 10px">Each role is built on an <b>access level</b> (what data it can reach) and <b>permissions for each module</b> — View, Add, Edit and Delete. Create roles such as “Store keeper” or “Senior salesman” and tick only the modules they need.</p>
        <div class="tw"><table><thead><tr><th>Role</th><th>Access level</th><th>Modules</th><th class="num">People</th><th></th></tr></thead><tbody>
        ${roles.map(r => { const { on, avail } = modsOf(r), n = people.filter(u => u.roleId === r.id).length; return `<tr${isOwner && r.id !== 'admin' ? ` class="click" data-editrole="${r.id}"` : ''}><td><b>${esc(r.name)}</b> ${r.builtin ? '<span class="pill">Built-in</span>' : '<span class="pill p-custom">Custom</span>'}</td><td>${LEVEL[r.base]}</td>
          <td style="font-size:12px">${r.id === 'admin' ? 'All modules · full access' : `<b>${on.length}</b> of ${avail.length} · <span class="muted">${on.slice(0, 6).map(m => esc(nav.SHORT[m])).join(', ')}${on.length > 6 ? '…' : ''}</span>${rightsNote(r, on)}`}</td><td class="num">${n}</td>
          <td class="num">${isOwner && r.id !== 'admin' ? '<button class="btn btn-sm">Edit</button>' : ''}</td></tr>`; }).join('')}</tbody></table></div></div>
      <div class="panel"><div class="panel-h"><h2>👤 Staff</h2>${isOwner ? '<button class="btn btn-ok btn-sm" data-a="adduser">＋ Add user</button>' : ''}</div>
        <div class="alert a-info" style="margin-bottom:12px">Press <b>＋ Add user</b>, enter their Full Name, Email, and select a Role. The user is instantly whitelisted in the system. They can then sign in directly with <b>Google OAuth</b> using that email address, and will be redirected strictly into their assigned role and role-specific permissions.</div>
        <div class="tw"><table><thead><tr><th>Name</th><th>Role</th><th class="hide-m">Access level</th><th class="hide-m">Status</th></tr></thead><tbody>
        ${people.sort((a, b) => (a.role === 'pending' ? -1 : 0) - (b.role === 'pending' ? -1 : 0) || a.name.localeCompare(b.name)).map(u => `<tr><td><b>${esc(u.name)}</b>${u.id === store.me.id ? ' <span class="pill">you</span>' : ''}${u.role === 'pending' ? ' <span class="pill p-followup">Needs a role</span>' : ''}</td>
          <td>${isOwner && u.roleId !== 'admin' ? roleSel(u) : pill(u.role === 'pending' ? 'followup' : 'open', u.roleName)}</td><td class="hide-m">${LEVEL[u.role] || ''}</td><td class="hide-m"><span class="pill p-done">Active</span></td></tr>`).join('')}
        ${Object.entries(L.invites()).sort((a, b) => a[0].localeCompare(b[0])).map(([em, x]) => { const d = L.roleDef(x.role); return `<tr><td><b>${esc(x.name || em)}</b>${x.name ? `<div class="muted" style="font-size:12px">${esc(em)}</div>` : ''}${x.note ? `<div class="muted" style="font-size:12px">${esc(x.note)}</div>` : ''}<div><span class="pill p-scheduled">Whitelisted · waiting for first sign-in</span></div></td>
          <td>${isOwner ? `<span style="display:inline-flex;gap:6px;align-items:center"><select class="inp inp-sm" data-inv="${esc(em)}" style="width:auto;max-width:220px">${roles.filter(r => r.id !== 'admin').map(r => `<option value="${r.id}"${r.id === x.role ? ' selected' : ''}>${esc(r.name)}</option>`).join('')}</select><button class="icon-btn" data-uninv="${esc(em)}" title="Revoke access">✕</button></span>` : pill('scheduled', d.name)}</td><td class="hide-m">${LEVEL[d.base] || ''}</td><td class="hide-m"><span class="pill p-scheduled">Whitelisted</span></td></tr>`; }).join('')}</tbody></table></div>
        ${isOwner ? '<p class="hint" style="margin-top:8px">Role changes apply when the person reloads or signs in.</p>' : '<p class="hint" style="margin-top:8px">Only the owner can create roles and manage user access.</p>'}</div>`;
  },
  bind(root) {
    root.addEventListener('click', e => {
      if (e.target.closest('[data-a=newrole]')) return roleDialog(null);
      if (e.target.closest('[data-a=adduser]')) return addUserDialog();
      const ui = e.target.closest('[data-uninv]'); if (ui) { confirmBox('Revoke whitelist access?', `Remove access for <b>${esc(ui.dataset.uninv)}</b>? They will no longer be permitted to log in with Google.`, 'Revoke', true).then(ok => ok && L.removeInvite(ui.dataset.uninv).then(() => toast('Access revoked.')).catch(fail)); return; }
      const r = e.target.closest('[data-editrole]'); if (r) roleDialog(r.dataset.editrole);
    });
    root.addEventListener('change', async e => {
      if (e.target.dataset.inv) { try { await L.setInviteRole(e.target.dataset.inv, e.target.value); toast('Invite updated.'); } catch (er) { fail(er); } return; }
      const r = e.target.dataset.role; if (!r) return;
      try { await L.setRole(r, e.target.value); const d = L.roleDef(e.target.value); toast(`Role updated to ${d.name}.`); } catch (er) { fail(er); }
    });
  }
};
// Add a user: pick a colleague or type name, email, and choose role
function addUserDialog() {
  const roles = L.roleList().filter(r => r.id !== 'admin');
  let picked = null, seq = 0;
  const pickBox = (id, label, attrs) => `<div class="field"><label>${label}</label><div class="picker"><input id="${id}" autocomplete="off" ${attrs}><div class="dropdown" id="${id}Dd"></div></div></div>`;
  openModal('Add user', `<div class="row2">${pickBox('auName', 'Full name', 'placeholder="e.g. Anil Kumar"')}${pickBox('auEmail', 'Email', 'type="email" inputmode="email" placeholder="name@gmail.com"')}</div>
    <div id="auPicked" class="hint" style="margin:-6px 0 10px"></div>
    <div class="row2">${field('Role', `<select id="auRole">${roles.map(r => `<option value="${r.id}"${r.id === 'sales' ? ' selected' : ''}>${esc(r.name)}${r.builtin ? '' : ' (custom)'}</option>`).join('')}</select>`)}${field('Note (optional)', input('auNote', '', 'placeholder="e.g. Showroom salesman, Al Quoz"'))}</div>
    <div class="alert a-info" id="auLvl" style="margin-bottom:0"></div>`,
    [{ label: 'Cancel' }, { label: 'Add user', cls: 'btn-ok', onClick: async () => {
      const name = val('auName'), email = val('auEmail'), role = $('auRole').value, d = L.roleDef(role);
      if (!picked && !name) throw Error('Enter the person’s name.');
      if (!picked && !email) throw Error('Enter the person’s email.');
      const how = await L.addStaff({ id: picked?.id, email, name: picked ? '' : name, role, note: val('auNote') });
      const who = picked ? (picked.name || email) : name;
      setTimeout(() => openModal('User Whitelisted & Provisioned', `<p style="margin:0 0 10px;line-height:1.6"><b>${esc(who)}</b> (${esc(email)}) is now whitelisted in the system with the role <b>${esc(d.name)}</b>.</p>
        <div style="background:var(--panel-2);padding:14px;border-radius:12px;border:1px solid var(--line);margin:10px 0">
          <div><b>Full Name:</b> ${esc(who)}</div>
          <div><b>Email:</b> ${esc(email)}</div>
          <div><b>Assigned Role:</b> ${esc(d.name)} (${esc(LEVEL[d.base] || d.base)})</div>
        </div>
        <p class="hint" style="margin:0">They can now sign in using Google OAuth with <b>${esc(email)}</b>. Their access is strictly restricted to their assigned role and role-specific permissions.</p>`,
        [...(email && navigator.clipboard ? [{ label: '📋 Copy email', onClick: async () => { try { await navigator.clipboard.writeText(email); toast('Email copied.'); } catch (e) { toast('Copy failed', 'warn'); } return false; } }] : []), { label: 'Done', cls: 'btn-ink' }]), 60);
    } }],
    { onOpen: () => {
      const lvl = () => { const d = L.roleDef($('auRole').value); $('auLvl').innerHTML = `${esc(L.BASES[d.base] || '')}<br>Share the page with them as <b>${needsEditor(d.base) ? 'Editor' : 'Contributor'}</b>.`; };
      const showPicked = () => { $('auPicked').innerHTML = picked ? `✓ <b>${esc(picked.name)}</b> found in your organisation — the role applies straight away. <a href="#" id="auUnpick">not this person</a>` : ''; };
      const team = byId('team', 'roles') || {}, have = new Set([team.owner, ...Object.keys(team.roles || {})]);
      const search = async (q, dd) => {
        const my = ++seq; let hits = [];
        try { hits = store.user && q.trim().length >= 2 ? await store.user.search(q.trim()) : []; } catch (e) { hits = []; }
        if (my !== seq) return;
        hits = hits.filter(h => !h.isMe);
        ['auNameDd', 'auEmailDd'].forEach(x => $(x).classList.remove('open'));
        dd.innerHTML = hits.map((h, i) => `<div class="dd" data-i="${i}"><span><b>${esc(h.name)}</b>${h.email ? `<div class="muted" style="font-size:12px">${esc(h.email)}</div>` : ''}</span>${have.has(h.id) ? '<span class="pill">already staff</span>' : ''}</div>`).join('');
        dd.classList.toggle('open', hits.length > 0); dd._hits = hits;
      };
      ['auName', 'auEmail'].forEach(id => {
        const inp = $(id), dd = $(id + 'Dd');
        inp.addEventListener('input', () => { if (picked && id === 'auName') { picked = null; showPicked(); } if (!picked) search(inp.value, dd); });
        inp.addEventListener('blur', () => setTimeout(() => dd.classList.remove('open'), 150));
        dd.addEventListener('mousedown', e => { const r = e.target.closest('[data-i]'); if (!r) return; e.preventDefault(); picked = { ...dd._hits[+r.dataset.i] }; $('auName').value = picked.name; if (picked.email) $('auEmail').value = picked.email; dd.classList.remove('open'); showPicked(); if (!val('auEmail')) $('auEmail').focus(); });
      });
      $('auPicked').addEventListener('click', e => { if (e.target.id === 'auUnpick') { e.preventDefault(); picked = null; showPicked(); $('auName').focus(); } });
      $('auRole').onchange = lvl; lvl();
    } });
}

function roleDialog(id) {
  const nav = window.__gsmNav, r = id ? L.roleDef(id) : { id: '', name: '', base: 'sales', modules: null, rights: null, builtin: false };
  let base = r.base;
  const avail = () => nav.SECTIONS.flatMap(x => x[1]).filter(n => nav.VIEWS[n].roles.includes(base) && (n !== 'users' || base === 'manager'));
  const defMods = () => avail().filter(n => L.defaultOn(n, base));
  let chosen = new Set(r.modules || defMods());
  const rights = {}; nav.SECTIONS.flatMap(x => x[1]).forEach(n => { rights[n] = (r.rights && r.rights[n] != null) ? r.rights[n] : 'aed'; });
  const NA = n => L.VIEW_ONLY.includes(n), COLS = [['v', 'View'], ['a', 'Add'], ['e', 'Edit'], ['d', 'Delete']];
  const has = (n, c) => c === 'v' ? chosen.has(n) : chosen.has(n) && rights[n].includes(c);
  const set = (n, c, on) => {
    if (c === 'v') { on ? chosen.add(n) : chosen.delete(n); return; }
    if (NA(n)) return;
    const cur = new Set(rights[n]); on ? cur.add(c) : cur.delete(c); rights[n] = [...'aed'].filter(x => cur.has(x)).join('');
    if (on) chosen.add(n);
  };
  const colState = c => { const ns = avail().filter(n => c === 'v' || !NA(n)); const k = ns.filter(n => has(n, c)).length; return k === 0 ? '' : k === ns.length ? ' checked' : ' data-mixed="1"'; };
  const grid = () => `<table class="rp-t"><thead><tr><th>Module</th>${COLS.map(([c, l]) => `<th class="rp-c"><label title="All modules"><input type="checkbox" data-col="${c}"${colState(c)}><span>${l}</span></label></th>`).join('')}</tr></thead><tbody>
    ${nav.SECTIONS.map(([sec, list]) => { const vis = list.filter(n => n !== 'users' || base === 'manager'); return `<tr class="rp-sec"><td colspan="5">${esc(sec || 'Main')}</td></tr>` + vis.map(n => { const ok = nav.VIEWS[n].roles.includes(base);
      return `<tr class="${ok ? '' : 'rp-off'}"><td>${nav.VIEWS[n].icon} ${esc(nav.SHORT[n])}${ok ? '' : ' <span class="muted" style="font-size:11px">· not on this level</span>'}</td>${COLS.map(([c]) => `<td class="rp-c">${!ok ? '' : c !== 'v' && NA(n) ? '<span class="muted" title="Nothing to add, edit or delete here">—</span>' : `<input type="checkbox" data-p="${n}:${c}"${has(n, c) ? ' checked' : ''}${c !== 'v' && !chosen.has(n) ? ' class="rp-dim"' : ''} aria-label="${COLS.find(x => x[0] === c)[1]} ${esc(nav.SHORT[n])}">`}</td>`).join('')}</tr>`; }).join(''); }).join('')}</tbody></table>`;
  openModal(id ? 'Edit role · ' + r.name : 'New role', `<div id="rlWrap">
    <div class="row2">${field('Role name', input('rlName', r.name, `placeholder="e.g. Store keeper"${r.builtin ? ' readonly' : ''}`))}${field('Access level', `<select id="rlBase"${r.builtin ? ' disabled' : ''}>${Object.entries(L.BASES).map(([k, l]) => `<option value="${k}"${k === base ? ' selected' : ''}>${esc(l.split(' — ')[0])}</option>`).join('')}</select>`)}</div>
    <p class="hint" id="rlBaseHelp" style="margin:-4px 0 10px"></p>
    <div style="display:flex;justify-content:space-between;align-items:center;gap:8px;flex-wrap:wrap;margin-bottom:6px"><b>Permissions for each module</b><span style="display:flex;gap:6px;flex-wrap:wrap"><button type="button" class="btn btn-sm" id="rlAll">Full access</button><button type="button" class="btn btn-sm" id="rlView">View only</button><button type="button" class="btn btn-sm" id="rlNoDel">No deleting</button><button type="button" class="btn btn-sm" id="rlNone">Clear</button></span></div>
    <div id="rlGrid" class="tw rp-wrap"></div>
    <p class="hint" style="margin-top:8px"><b>View</b> shows the module in the menu. <b>Add</b> creates new records, <b>Edit</b> changes them (including cancel / void), <b>Delete</b> removes them. Add also counts when the record is made from another screen you can use (e.g. a receipt taken from an invoice, a new customer typed into a sales order); Edit and Delete need the module the record belongs to. Data access still follows the access level and the person's sharing level.</p></div>`,
    [...(id && !r.builtin ? [{ label: 'Delete role', cls: 'btn-danger', onClick: async () => { await L.deleteRole(id); toast('Role deleted.'); } }] : []),
     ...(r.builtin && (r.modules || r.rights) ? [{ label: 'Reset to default', onClick: async () => { await L.resetRole(id); toast('Back to full access on the default modules.'); } }] : []),
     { label: 'Cancel' },
     { label: id ? 'Save role' : 'Create role', cls: 'btn-ok', onClick: async () => { const mods = avail().filter(n => chosen.has(n)); await L.saveRole({ id: r.id, name: val('rlName'), base, modules: mods, rights }); toast(id ? 'Role saved.' : 'Role created — choose it for staff in the list.'); } }],
    { wide: true, onOpen: () => {
      const draw = () => { $('rlGrid').innerHTML = grid(); $('rlGrid').querySelectorAll('[data-mixed]').forEach(x => x.indeterminate = true); $('rlBaseHelp').textContent = L.BASES[base] ? 'Can reach: ' + L.BASES[base].split(' — ')[1] + '. Needs the ' + (needsEditor(base) ? 'Editor' : 'Contributor') + ' sharing level.' : ''; };
      $('rlGrid').addEventListener('change', e => {
        const t = e.target;
        if (t.dataset.p) { const [n, c] = t.dataset.p.split(':'); set(n, c, t.checked); }
        else if (t.dataset.col) { const c = t.dataset.col; avail().forEach(n => set(n, c, t.checked)); }
        else return;
        draw();
      });
      $('rlBase').onchange = () => { base = $('rlBase').value; chosen = new Set(defMods()); draw(); };
      const preset = (rt) => { chosen = new Set(avail()); avail().forEach(n => rights[n] = rt); draw(); };
      $('rlAll').onclick = () => preset('aed'); $('rlView').onclick = () => preset(''); $('rlNoDel').onclick = () => preset('ae');
      $('rlNone').onclick = () => { chosen = new Set(); draw(); };
      draw();
    } });
}

/* ================= Activity log ================= */
let alWho = '', alType = '', alPer = 'today', alSearch = '', alFrom = null, alTo = null;
export const activity = {
  title: 'Activity Log', icon: '🕘', roles: ['admin', 'manager', 'billing'],
  head: () => `<button class="btn" data-a="alcsv">⬇ CSV</button>`,
  body() {
    L.watchActivity(() => { if ((location.hash || '').includes('activity')) rr(); });
    const t = today(), per = { today: [t, t], week: [addDays(t, -6), t], month: [addDays(t, -29), t], custom: [alFrom || addDays(t, -6), alTo || t] }, [f, to] = per[alPer];
    const from = new Date(f + 'T00:00').getTime(), until = new Date(to + 'T23:59:59').getTime(), w = words(alSearch);
    const allE = L.activityEntries(), list = allE.filter(e => e.at >= from && e.at <= until && (!alWho || e.by === alWho) && (!alType || e.coll === alType) && hit(e.text + ' ' + (e.lines || []).join(' ') + ' ' + L.nm(e.by), w));
    const people = [...new Set(allE.map(e => e.by))], types = [...new Set(allE.map(e => e.coll))].sort();
    const byDay = {}; list.forEach(e => { const d = today(new Date(e.at)); (byDay[d] || (byDay[d] = [])).push(e); });
    const verbPill = v => pill(v === 'created' ? 'open' : v === 'deleted' || v === 'voided' || v === 'cancelled' ? 'void' : 'followup', v);
    return `<div class="toolbar"><div class="chips">${[['today', 'Today'], ['week', 'Last 7 days'], ['month', 'Last 30 days'], ['custom', 'Custom']].map(([k, l]) => `<button class="chip${k === alPer ? ' active' : ''}" data-alp="${k}">${l}</button>`).join('')}</div>
        ${alPer === 'custom' ? `<input type="date" class="inp" id="alFrom" value="${f}" style="width:auto"><input type="date" class="inp" id="alTo" value="${to}" style="width:auto">` : ''}
        <select class="inp" id="alWho" style="width:auto"><option value="">Everyone</option>${people.map(u => `<option value="${u}"${u === alWho ? ' selected' : ''}>${esc(L.nm(u))}</option>`).join('')}</select>
        <select class="inp" id="alType" style="width:auto"><option value="">All types</option>${types.map(c => `<option value="${c}"${c === alType ? ' selected' : ''}>${esc(L.ACT_LABEL[c] || c)}</option>`).join('')}</select>
        <input class="inp" id="als" placeholder="Search number, customer, item…" value="${esc(alSearch)}" style="flex:1;min-width:180px"></div>
      <p class="hint" style="margin:0 0 10px">${list.length} action${list.length === 1 ? '' : 's'} · every save, change and delete is recorded with who did it and when. Tap a row to open the document.</p>
      ${list.length ? Object.entries(byDay).map(([d, es]) => `<h3 style="margin:14px 0 6px;font-size:14px">${dateLongA(d)}</h3><div class="al-list">
        ${es.map(e => `<div class="al-row${OPENERS[e.coll] ? ' click' : ''}" data-al="${esc(e.coll)}|${esc(e.docId || '')}"><div class="al-meta"><span class="mono">${hhmm(e.at)}</span><b>${esc(L.nm(e.by))}</b>${verbPill(e.verb || 'updated')}<span class="muted">${esc(L.ACT_LABEL[e.coll] || e.coll)}</span></div><div class="al-text">${esc(e.text)}</div>${(e.lines || []).length > 1 ? `<details><summary class="hint" style="cursor:pointer">${e.lines.length} changes</summary><ul style="margin:4px 0 0;padding-left:18px;font-size:12px">${e.lines.map(x => `<li>${esc(x)}</li>`).join('')}</ul></details>` : ''}</div>`).join('')}</div>`).join('')
      : empty('🕘', allE.length ? 'Nothing matches these filters.' : 'No activity recorded yet. From now on every save, change and delete appears here.')}`;
  },
  after() { if ($('als') && document.activeElement?.id !== 'als') $('als').value = alSearch; },
  bind(root) {
    root.addEventListener('click', e => {
      const p = e.target.closest('[data-alp]'); if (p) { alPer = p.dataset.alp; return rr(); }
      if (e.target.closest('summary')) return;
      if (e.target.closest('[data-a=alcsv]')) { const es = L.activityEntries(); return download('activity_log_' + today() + '.csv', toCSV([['Date', 'Time', 'Who', 'Action', 'Type', 'Number', 'Details', 'Screen'], ...es.map(x => [today(new Date(x.at)), hhmm(x.at), L.nm(x.by), x.verb || '', L.ACT_LABEL[x.coll] || x.coll, x.no || '', (x.lines || [x.text]).join(' | '), x.view || ''])])); }
      const r = e.target.closest('[data-al]'); if (r) { const [c, id] = r.dataset.al.split('|'); const fn = OPENERS[c], d = byId(c, id); if (fn && d) fn(d); else if (fn) toast('That record no longer exists (it may have been deleted).', 'warn'); }
    });
    root.addEventListener('change', e => { const id = e.target.id; if (id === 'alWho') alWho = e.target.value; else if (id === 'alType') alType = e.target.value; else if (id === 'alFrom') alFrom = e.target.value; else if (id === 'alTo') alTo = e.target.value; else return; rr(); });
    root.addEventListener('input', e => { if (e.target.id === 'als') { alSearch = e.target.value; rr(); } });
  },
  keep: ['als']
};
const OPENERS = { creditNotes: d => openCreditNote(d), debitNotes: d => openDebitNote(d), invoices: d => openInvoice(d), salesOrders: d => openSO(d), quotations: d => openQuotation(d), purchases: d => openPurchase(d), receipts: d => openTxn('receipts', d), payments: d => openTxn('payments', d), expenses: d => openTxn('expenses', d), transfers: d => openTxn('transfers', d), journals: d => openJournal(d), items: d => openItem(d), suppliers: d => openSupplier(d), tasks: d => window.__openTask && window.__openTask(d.id) };
const hhmm = t => new Date(t).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });
const dateLongA = d => fmtDate(d, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
// the history of one document, for its detail screen
export function historyHTML(docId) {
  const es = L.activityEntries().filter(e => e.docId === docId); if (!es.length) return '';
  return `<h3 style="margin:14px 0 6px;font-size:14px">Activity</h3><ul class="tlog">${es.map(e => `<li><b>${fmtDate(today(new Date(e.at)))} ${hhmm(e.at)}</b> · ${esc(L.nm(e.by))}: ${esc(e.text)}</li>`).join('')}</ul>`;
}

/* ================= Settings ================= */
export const settings = {
  title: 'Settings', icon: '⚙️', roles: ['admin', 'manager'],
  body() {
    const c = byId('settings', 'company') || {};
    const lg = shopLogo();
    return `<div class="grid g2"><div class="panel"><h2>Company details (printed on documents)</h2>
      <div class="field"><label>Logo</label><div class="logo-set">
        <div class="logo-prev logo-prev-dark" title="In the menu">${lg ? `<img id="lgPrevM" src="${esc(lg)}" alt="Shop logo" style="height:${menuLogoH()}px">` : '<span class="hint" style="color:#aebbd6">No logo</span>'}</div>
        <div class="logo-prev" title="On printed documents (shown at about half size)">${lg ? `<img id="lgPrevD" src="${esc(lg)}" alt="" style="height:${Math.round(logoMM(templates().T.inv) * 1.9)}px">` : '<span class="hint">No logo</span>'}</div>
        <div style="display:flex;gap:8px;flex-wrap:wrap"><button class="btn btn-ink" data-a="logoup">${lg ? '🔄 Change logo' : '⬆ Upload logo'}</button>${lg ? '<button class="btn btn-danger" data-a="logorm">Remove</button>' : ''}</div></div>
        ${lg ? (() => { const mH = menuLogoH(), dMM = logoMM(templates().T.inv); return `<div class="logo-size">
          <label for="lgMenu">Size in the menu <b id="lgMenuV">${mH} px</b></label><input type="range" id="lgMenu" min="24" max="160" step="2" value="${mH}">
          <label for="lgDoc">Size on sales orders &amp; invoices <b id="lgDocV">${dMM} mm</b></label><input type="range" id="lgDoc" min="6" max="40" step="1" value="${dMM}"></div>`; })() : ''}
        <p class="hint" style="margin-top:6px">PNG or JPG. Shown in the side menu, the phone header and on printed sales orders and invoices. A square or wide logo on a transparent or white background works best.</p></div>
      ${companyForm(company(), 'st')}
      <div class="row2">${field('Currency symbol', input('stCur', c.currency || '₹'))}${field('Mobile country code (for WhatsApp)', input('stCC', c.countryCode || '91', 'placeholder="91 India · 971 UAE"'))}</div>
      ${field('Note at the bottom of invoices', input('stNote', c.invoiceNote))}
      <button class="btn btn-ink" data-a="save">Save settings</button>
      <h2 style="margin-top:18px">Printing</h2>
      <p class="hint" style="margin:0 0 8px">Design, paper size, colour, logo, terms and what shows on printed sales orders and invoices.</p>
      <button class="btn" data-a="tpl">🖨 Print templates</button>
      <h2 style="margin-top:18px">Inventory valuation method</h2>
      <p class="hint" style="margin:0 0 8px">How the cost of items sold and the value of stock are worked out. Now using: <b>${esc(L.VALUATION[L.valuationMethod()])}</b>.</p>
      <div class="row2">${field('Method', select('stVal', Object.entries(L.VALUATION), L.valuationMethod()))}${field('Use from date', input('stValFrom', today(), 'type="date"'))}</div>
      <div class="hint" style="margin:-4px 0 10px;line-height:1.55"><b>Weighted average</b>: every piece costs the average of all pieces in stock; the average is recalculated with each purchase. <b>FIFO</b>: the oldest pieces are sold first, so each sale carries the cost of the earliest purchase still in stock and the remaining stock is valued at the latest purchase prices. Switching keeps today's stock value unchanged and applies to sales from the chosen date; it can't be on or before a cash-closed day.</div>
      ${L.valuationHistory().length ? `<div class="hint" style="margin-bottom:8px">History: ${L.valuationHistory().map(h => `${esc(L.VALUATION[h.method])} from ${fmtDate(h.from)}`).join(' → ')}</div>` : ''}
      ${L.can.admin(role()) ? '<button class="btn" data-a="valset">Change method</button>' : '<p class="hint">Only the owner can change the method.</p>'}</div>
      <div class="panel"><h2>Document numbers</h2><p class="hint" style="margin-bottom:10px">Prefixes used for new documents.</p><div class="row3">${Object.keys(L.PREFIX).map(k => field(k, input('px' + k, c['prefix' + k] || L.PREFIX[k]))).join('')}</div>
      <h2 style="margin-top:14px">Tax on invoices (GST)</h2>${(t => `<p class="hint" style="margin:0 0 8px">Default for new sales and service invoices; each invoice can still be changed when it is created. Old invoices keep what they had.</p>
      <label style="display:flex;gap:8px;align-items:center;margin-bottom:8px;cursor:pointer"><input type="checkbox" id="txOn"${t.on ? ' checked' : ''}> Add tax to new invoices</label>
      <div class="row2">${field('Tax name', input('txName', t.name, 'maxlength="12"'))}${field('Default rate %', `<input id="txRate" class="num" type="number" min="0" max="100" step=".01" list="txRl" value="${t.rate}"><datalist id="txRl">${L.GST_RATES.map(r => `<option value="${r}">`).join('')}</datalist>`)}</div>
      <div class="row2">${field('Prices are', select('txMode', [['inclusive', 'Inclusive — GST included in the price'], ['exclusive', 'Exclusive — GST added on top']], t.mode))}${field('Usual place of supply', select('txType', [['intra', 'Within state — CGST + SGST (half each)'], ['inter', 'Other state — IGST (full rate)']], t.type))}</div>
      <p class="hint" style="margin:-2px 0 8px">Each customer's last choice of within / other state is remembered. Tax goes to the accounts Output CGST / SGST / IGST Payable. Your GSTIN is set in Company details (Tax label + number) and prints on invoices.</p>
      <button class="btn btn-ink" data-a="taxsave">Save tax settings</button>`)(L.taxDefaults())}
      <h2 style="margin-top:14px">Your data</h2><p class="hint">Stored in this page's Claude database and shared live with everyone you share the page with. Records used: <b>${L.recordCount().toLocaleString('en-IN')}</b> of 25,000.</p><div style="height:8px;border-radius:6px;background:var(--line-2);overflow:hidden;margin:6px 0 4px"><div style="height:100%;width:${Math.min(100, L.recordCount() / 250).toFixed(1)}%;background:${L.recordCount() > 20000 ? 'var(--danger)' : 'var(--ok)'}"></div></div>
      <button class="btn" data-a="backup" style="margin-top:10px">⬇ Download full backup</button> 
      <p class="hint" style="margin-top:8px">Download a backup every week and keep it safe (e.g. Google Drive).</p></div></div>`;
  },
  bind(root) {
    // logo size sliders: live preview while dragging, saved when released
    root.addEventListener('input', e => {
      if (e.target.id === 'lgMenu') { const v = +e.target.value; $('lgMenuV').textContent = v + ' px'; if ($('lgPrevM')) $('lgPrevM').style.height = v + 'px'; document.documentElement.style.setProperty('--logo-h', v + 'px'); }
      if (e.target.id === 'lgDoc') { const v = +e.target.value; $('lgDocV').textContent = v + ' mm'; if ($('lgPrevD')) $('lgPrevD').style.height = Math.round(v * 1.9) + 'px'; }
    });
    root.addEventListener('change', async e => {
      if (e.target.id === 'lgMenu' || e.target.id === 'lgDoc') { try { await saveLogoSize(e.target.id === 'lgMenu' ? { menu: e.target.value } : { doc: e.target.value }); toast(e.target.id === 'lgMenu' ? 'Menu logo size saved.' : 'Logo size on documents saved.'); } catch (er) { fail(er); } }
    });
    root.addEventListener('click', async e => {
      const a = e.target.closest('[data-a]')?.dataset.a;
      if (a === 'save') { let d; try { d = { ...readCompany('st'), currency: val('stCur') || '₹', countryCode: val('stCC').replace(/\D/g, ''), invoiceNote: val('stNote'), updatedAt: Date.now() }; } catch (er) { return fail(er); } Object.keys(L.PREFIX).forEach(k => d['prefix' + k] = val('px' + k) || L.PREFIX[k]); try { await store.db.commit([{ t: 'update', coll: 'settings', id: 'company', data: d }]); toast('Settings saved.'); } catch (er) { fail(er); } }
      if (a === 'taxsave') { const rate = num(val('txRate')); if (!(rate >= 0 && rate <= 100)) return fail(Error('Enter a rate between 0 and 100.'));
        const on = $('txOn').checked, data = { taxOn: on, taxName: val('txName').trim() || 'GST', taxRate: rate, taxMode: val('txMode'), taxType: val('txType'), updatedAt: Date.now() }; // read before saving: the screen redraws after the save
        try { await store.db.commit([{ t: 'update', coll: 'settings', id: 'company', data }]); if (on) await L.setupTaxAccounts(); toast('Tax settings saved.'); } catch (er) { fail(er); } return; }
      if (a === 'logoup') { const f = await pickFile('image/*'); if (!f) return; try { await saveShopLogo(await shrinkImage(f)); toast('Logo saved — it now shows in the menu and on printed documents.'); } catch (er) { fail(er); } return; }
      if (a === 'logorm') { if (await confirmBox('Remove logo?', 'The menu goes back to the GRID mark and printed documents show no logo.', 'Remove', true)) { try { await saveShopLogo(''); toast('Logo removed.'); } catch (er) { fail(er); } } return; }
      if (a === 'tpl') return templateDialog('so');
      if (a === 'valset') { const m = val('stVal'), f = val('stValFrom'); if (m === L.valuationMethod()) return toast('That method is already in use.', 'warn');
        if (await confirmBox('Change valuation method?', `Switch to <b>${esc(L.VALUATION[m])}</b> from ${fmtDate(f)}? Stock value stays the same on the switch date; cost of goods sold for sales from then on uses the new method. Past invoices keep their recorded cost.`, 'Change method')) { try { await L.setValuationMethod(m, f); toast('Valuation method changed.'); } catch (er) { fail(er); } } }
      if (a === 'backup') { try { toast('Preparing backup…'); const d = await L.backupAll(); download('GRID_Shop_backup_' + today() + '.json', JSON.stringify(d), 'application/json'); toast('Backup downloaded.'); } catch (er) { fail(er); } }
      if (a === 'reset' && await confirmBox('Reset demo?', 'Delete all demo data in this browser and start again?', 'Reset', true)) { store.db.reset(); location.reload(); }
    });
  }
};

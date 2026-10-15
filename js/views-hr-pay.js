// GRID Shop Manager — HR & Payroll screens: Payroll, Advances, Incentives/Bonus/Allowances, HR Reports, payslips and the guide
import { $, esc, num, r2, fmtDate, store, all, byId, setting } from './core.js';
import * as L from './logic.js';
import * as H from './logic-hr.js';
import { STATUS, fmtMin, clock } from './hr-calc.js';
import { money, pill, searchBox, empty, words, hit, toast, fail, openModal, closeModal, confirmBox, val, field, input, select, accountOptions, toCSV, download, saveDocument } from './ui.js';
import { company, amountWords, templates, printVouchers, voucherFromStaff, savePdf, reportPdf } from './print.js';
import { avatar, monthSummary, dayDialog, stPill } from './views-hr.js';

const rr = keep => window.__rerender(keep);
const may = (m, a) => L.may(m, a);
const moneyAcc = () => accountOptions(a => a.group === 'cash' || a.group === 'bank');
const monthInput = (id, v) => `<input type="month" class="inp" id="${id}" value="${v}" style="width:auto">`;
const RUN_CLS = { draft: 'open', submitted: 'followup', approved: 'confirmed', finalized: 'paid' };
const staffOpts = (sel, any) => `${any ? `<option value="">${esc(any)}</option>` : ''}${H.staffList({ all: true }).map(s => `<option value="${s.id}"${s.id === sel ? ' selected' : ''}>${esc(s.name)}</option>`).join('')}`;

/* ===================== 💰 Payroll ===================== */
let pMonth = null;
export const hrpay = {
  title: 'Payroll', icon: '💰', roles: ['admin', 'manager', 'billing'],
  body() {
    H.watchHR();
    const now = H.shopNow(); if (window.__hrPayMonth) { pMonth = window.__hrPayMonth; window.__hrPayMonth = null; } pMonth = pMonth || H.prevMonth(now.month);
    const run = H.runOf(pMonth), rows = H.preview(pMonth), probs = H.runProblems(pMonth, rows), st = run?.status || 'draft', fin = st === 'finalized';
    const tot = k => r2(rows.reduce((s, r) => s + (r.pay ? num(r.pay[k]) : 0), 0));
    const adv = r2(rows.reduce((s, r) => s + (r.pay ? r.pay.recoveries.reduce((x, y) => x + y.amount, 0) : 0), 0));
    const unpaid = fin ? rows.filter(r => r.x && !r.x.paid && r.pay) : [];
    const R = H.hrRules(), ownerOnly = R.ownerApproval && !H.isOwner();
    const btn = [];
    if (!fin && may('hrpay', 'edit')) {
      if (st === 'draft') btn.push(`<button class="btn btn-ink" data-a="submit">${ownerOnly ? 'Send to owner for approval' : '✓ Approve'}</button>`);
      if (st === 'submitted' && H.isOwner()) btn.push('<button class="btn btn-ok" data-a="approve">✓ Approve</button>');
      if (st === 'submitted' || st === 'approved') btn.push('<button class="btn" data-a="back">↩ Back to draft</button>');
      if (st === 'approved') btn.push('<button class="btn btn-accent" data-a="final">🔒 Finalize & post to accounts</button>');
    }
    if (fin) { if (unpaid.length && may('hrpay', 'edit')) btn.push(`<button class="btn btn-ok" data-a="pay">💵 Pay salaries (${unpaid.length})</button>`); if (H.isOwner()) btn.push('<button class="btn btn-danger" data-a="reopen">Reopen</button>'); }
    btn.push('<button class="btn" data-a="slips">⬇ Payslips</button><button class="btn" data-a="csv">⬇ Excel (CSV)</button>');
    return `<div class="toolbar">${monthInput('pyM', pMonth)}${pill(RUN_CLS[st], H.RUN_STATUS[st])}${run?.submittedBy && st === 'submitted' ? `<span class="hint">sent by ${esc(L.nm(run.submittedBy))}</span>` : ''}${fin ? `<span class="hint">finalized ${fmtDate(H.localParts(run.finalizedAt, R.tz).date)} by ${esc(L.nm(run.finalizedBy))} · posted ${fmtDate(run.postDate)}</span>` : ''}<span style="flex:1"></span>${btn.join('')}</div>
      ${!fin && probs.length ? `<div class="alert a-warn"><b>Before approval:</b><br>${probs.slice(0, 10).map(esc).join('<br>')}${probs.length > 10 ? '<br>…' : ''}<br><span style="font-size:12px">Attendance is verified in Attendance → Daily review / Monthly.</span></div>` : ''}
      ${run?.returnNote && st === 'draft' ? `<div class="alert a-info">Sent back: ${esc(run.returnNote)}</div>` : ''}
      <div class="grid g4" style="margin-bottom:14px"><div class="kpi"><span>Staff</span><b>${rows.filter(r => r.pay).length}</b><small>${rows.filter(r => r.missing).length ? rows.filter(r => r.missing).length + ' without salary setup' : 'with salary'}</small></div>
        <div class="kpi"><span>Gross earnings</span><b>${money(tot('gross'))}</b></div><div class="kpi"><span>Deductions</span><b>${money(tot('totalDed'))}</b><small>incl. ${money(adv)} advance recovery</small></div>
        <div class="kpi"><span>Net to pay</span><b style="color:var(--ok)">${money(tot('net'))}</b><small>${fin ? (unpaid.length ? unpaid.length + ' not paid yet' : 'all paid') : 'preview'}</small></div></div>
      <div class="tw"><table><thead><tr><th>Staff</th><th class="hide-m">Attendance</th><th class="num">Gross</th><th class="num">Deductions</th><th class="num hide-m">Advance</th><th class="num">Net pay</th><th></th></tr></thead><tbody>
      ${rows.map(r => r.missing ? `<tr><td><b>${esc(r.staff.name)}</b></td><td colspan="6"><span class="pill p-unpaid">No salary set up</span> <a href="#/hrstaff">Staff Directory</a></td></tr>` : `<tr class="click" data-ps="${r.staff.id}"><td><span style="display:flex;gap:8px;align-items:center">${avatar(r.staff, 30)}<span><b>${esc(r.staff.name)}</b><div class="muted" style="font-size:11px">${esc(r.pay.type)} · ${money(r.frozen ? r.x.base : r.salary.base)}</div></span></span></td>
        <td class="hide-m" style="font-size:12px">${att(r.m.totals)}</td><td class="num">${money(r.pay.gross)}</td><td class="num">${money(r.pay.totalDed - r.pay.recoveries.reduce((s, x) => s + x.amount, 0))}</td><td class="num hide-m">${r.pay.recoveries.length ? money(r.pay.recoveries.reduce((s, x) => s + x.amount, 0)) : ''}</td><td class="num"><b>${money(r.pay.net)}</b></td>
        <td>${fin ? r.x.paid ? pill('paid', 'Paid ' + fmtDate(r.x.paid.date)) : H.paidOf(r.x) ? pill('scheduled', 'Part paid ' + money(H.paidOf(r.x))) : pill('unpaid', 'Unpaid') : (r.x.adjustments || []).length || Object.keys(r.x.recovery || {}).length ? pill('scheduled', 'adjusted') : ''}${r.pay.warnings.length ? ' ⚠️' : ''}</td></tr>`).join('') || `<tr><td colspan="7">${empty('👥', 'No staff employed in this month.')}</td></tr>`}</tbody></table></div>
      ${fin ? postedHTML(run) : R.eosb.enabled ? `<p class="hint" style="margin-top:8px">Gratuity provision for this month (posted when finalized): <b>${money(rows.filter(r => r.pay).reduce((x, r) => x + H.eosbFor(r.staff, r.salary, pMonth), 0))}</b></p>` : ''}
      <p class="hint" style="margin-top:8px">Pay is worked out from <b>verified attendance</b> with the rules in Shifts &amp; Rules, plus the salary setup, allowances, incentives and advance instalments. Click a person to see the breakdown, add an adjustment or change this month’s advance instalment. Steps: preview → ${R.ownerApproval ? 'send for owner approval → approve' : 'approve'} → finalize (locks attendance, posts to Accounts) → record payment.</p>`;
  },
  bind(root) {
    root.addEventListener('change', e => { if (e.target.id === 'pyM' && e.target.value) { pMonth = e.target.value; rr(); } });
    root.addEventListener('click', async e => {
      const r = e.target.closest('[data-ps]'); if (r) return payDetail(pMonth, r.dataset.ps);
      const jo = e.target.closest('[data-jopen]'); if (jo) { e.preventDefault(); return openHrJournal(jo.dataset.jopen); }
      const a = e.target.closest('[data-a]')?.dataset.a; if (!a) return;
      try {
        if (a === 'submit') { const s = await H.submitRun(pMonth); toast(s === 'approved' ? 'Payroll approved.' : 'Sent to the owner for approval.'); }
        if (a === 'approve') { await H.approveRun(pMonth); toast('Payroll approved.'); }
        if (a === 'back') openModal('Back to draft', field('Note (optional)', input('bkN')), [{ label: 'Cancel' }, { label: 'Back to draft', cls: 'btn-ink', onClick: async () => { await H.backToDraft(pMonth, val('bkN')); toast('Back to draft.'); } }]);
        if (a === 'final') finalizeDialog(pMonth);
        if (a === 'reopen') openModal('Reopen payroll', `<p style="margin:0 0 10px;line-height:1.55">Reopening cancels the payroll journal and the advance recoveries for ${esc(H.monthLabel(pMonth))}; payslips stay until you finalize again. Salaries already marked paid must be undone first.</p>${field('Reason (required)', input('roW'))}`, [{ label: 'Cancel' }, { label: 'Reopen', cls: 'btn-danger', onClick: async () => { await H.reopenRun(pMonth, val('roW')); toast('Payroll reopened.'); } }]);
        if (a === 'pay') payDialog(pMonth);
        if (a === 'csv') { const rows = H.preview(pMonth); download(`Payroll_${pMonth}.csv`, toCSV([['Staff', 'ID', 'Type', 'Present', 'Half', 'Absent', 'Paid leave', 'Unpaid leave', 'Late', 'OT h', 'Gross', 'Deductions', 'Advance recovered', 'Net', 'Paid'], ...rows.filter(r => r.pay).map(r => [r.staff.name, r.staff.empNo, r.pay.type, r.m.totals.present, r.m.totals.half, r.m.totals.absent, r.m.totals.leavePaid, r.m.totals.leaveUnpaid, r.m.totals.lateCount, fmtMin(r.m.totals.otMin + r.m.totals.otOffMin), r.pay.gross, r.pay.totalDed, r2(r.pay.recoveries.reduce((s, x) => s + x.amount, 0)), r.pay.net, r.x?.paid ? r.x.paid.date : ''])])); }
        if (a === 'slips') { const rows = H.preview(pMonth).filter(r => r.pay); if (!rows.length) return toast('Nothing to print.', 'warn'); savePayslips(rows.map(r => slipFromRow(pMonth, r)), `Payslips_${pMonth}${H.runOf(pMonth)?.status === 'finalized' ? '' : '_PREVIEW'}.html`); }
      } catch (er) { fail(er); }
    });
  }
};
const att = T => `${T.present}P${T.half ? ' ' + T.half + '½' : ''}${T.absent ? ' · ' + T.absent + 'A' : ''}${T.leavePaid + T.leaveUnpaid ? ' · ' + (T.leavePaid + T.leaveUnpaid) + 'L' : ''}${T.lateCount ? ' · late ' + T.lateCount : ''}${T.otMin + T.otOffMin ? ' · OT ' + fmtMin(T.otMin + T.otOffMin) : ''}${T.unverified ? ` <span class="pill p-followup">${T.unverified} to verify</span>` : ''}`;
function lines(arr) { return arr.map(x => `<tr><td>${esc(x.label)}${x.note ? `<div class="muted" style="font-size:11px">${esc(x.note)}</div>` : ''}</td><td class="num">${money(x.amount)}</td></tr>`).join(''); }
function payDetail(month, staffId) {
  const r = H.preview(month).find(x => x.staff.id === staffId); if (!r || !r.pay) return;
  const run = H.runOf(month), locked = run && ['approved', 'finalized'].includes(run.status), ed = may('hrpay', 'edit') && !locked;
  let adj = [...(r.x.adjustments || [])]; const rec = { ...(r.x.recovery || {}) };
  const body = () => `${monthSummary(r.m.totals)}
    ${r.pay.warnings.length ? `<div class="alert a-warn">${r.pay.warnings.map(esc).join('<br>')}</div>` : ''}
    <div class="grid g2" style="gap:12px"><div><h3 style="margin:0 0 6px;font-size:14px">Earnings</h3><div class="tw"><table><tbody>${lines(r.pay.earnings)}</tbody><tfoot><tr><td>Gross</td><td class="num">${money(r.pay.gross)}</td></tr></tfoot></table></div></div>
      <div><h3 style="margin:0 0 6px;font-size:14px">Deductions</h3><div class="tw"><table><tbody>${lines(r.pay.deductions) || '<tr><td class="muted">None</td><td></td></tr>'}</tbody><tfoot><tr><td>Total</td><td class="num">${money(r.pay.totalDed)}</td></tr></tfoot></table></div></div></div>
    ${H.hrRules().eosb.enabled && !r.frozen ? `<p class="hint" style="margin:10px 0 0">Gratuity provision this month (company cost, not deducted): <b>${money(H.eosbFor(r.staff, r.salary, month))}</b></p>` : r.x.eosb ? `<p class="hint" style="margin:10px 0 0">Gratuity provision: <b>${money(r.x.eosb)}</b></p>` : ''}
    <div class="alert a-ok" style="margin-top:12px;font-size:16px">Net pay <b>${money(r.pay.net)}</b> <span style="font-size:12px">· day rate ${money(r.pay.dayRate)} · hourly ${money(r.pay.hourRate)}</span></div>
    ${run?.status === 'finalized' ? (() => { const P = H.paymentsOf(r.x), due = H.dueOf(r.x), ue = may('hrpay', 'edit'); return `<h3 style="margin:12px 0 6px;font-size:14px">Payments</h3>${P.map(p => `<div class="list-item"><span>${fmtDate(p.date)} · ${esc(H.PAY_METHODS[p.method] || p.method || '')} · ${esc(L.accName(p.accountId))}${p.ref ? ' · ' + esc(p.ref) : ''}</span><span><b>${money(p.amount)}</b>${ue ? ` <button class="icon-btn" data-undo="${p.id}" title="Undo this payment">↩</button>` : ''}</span></div>`).join('') || '<p class="hint" style="margin:0">Not paid yet.</p>'}
      ${r.x.paid ? '<p class="hint" style="margin:6px 0 0">✓ Fully paid.</p>' : `<div style="display:flex;gap:8px;align-items:center;margin-top:6px;flex-wrap:wrap"><span class="hint">Still to pay: <b>${money(due)}</b></span>${ue ? '<button class="btn btn-sm btn-ok" data-a="paynow">💵 Pay now</button>' : ''}</div>`}`; })() : ''}
    ${ed ? `<h3 style="margin:12px 0 6px;font-size:14px">Adjustments this month</h3><div id="pdAdj">${adj.map((a, i) => `<div class="list-item"><span>${esc(a.label)} · ${esc(a.reason || '')}</span><span><b>${num(a.amount) >= 0 ? '+' : '−'} ${money(Math.abs(a.amount))}</b> <button class="icon-btn" data-rmadj="${i}">✕</button></span></div>`).join('') || '<p class="hint">None.</p>'}</div>
      <div class="row3" style="align-items:end">${field('Label', input('adL', '', 'placeholder="e.g. Arrears, Correction"'))}${field('Amount (+ adds, − deducts)', input('adA', '', 'type="number" step=".01"'))}${field('Reason', input('adR'))}</div><button class="btn btn-sm" data-a="addadj">＋ Add adjustment</button>
      ${(r.advs || []).length ? `<h3 style="margin:12px 0 6px;font-size:14px">Advance instalments</h3>${r.advs.map(a => `<div class="row3" style="align-items:center"><span>${esc(a.no)} · balance ${money(a.outstanding)}</span>${field('This month', `<input type="number" min="0" step=".01" data-rec="${a.id}" value="${rec[a.id] ?? a.perInst}">`)}<span class="hint">normal ${money(a.perInst)} — 0 to skip</span></div>`).join('')}` : ''}` : ''}
    <p class="hint" style="margin-top:10px">Sales this month (for sales-based incentives): ${money(H.salesFor(r.staff, month))}. <a href="#" data-a="att">Open attendance</a></p>`;
  const save = async () => { const rc = {}; document.querySelectorAll('[data-rec]').forEach(i => { const a = r.advs.find(x => x.id === i.dataset.rec); if (a && num(i.value) !== a.perInst) rc[a.id] = num(i.value); }); await H.saveRunItem(month, staffId, { adjustments: adj, recovery: rc }); };
  openModal(`${r.staff.name} · ${H.monthLabel(month)}`, body(), [{ label: '⬇ Payslip', onClick: () => { savePayslips([slipFromRow(month, r)], `Payslip_${r.staff.empNo}_${month}.html`); return false; } }, ...(ed ? [{ label: 'Save', cls: 'btn-ink', onClick: async () => { await save(); toast('Saved — the preview is updated.'); } }] : []), { label: 'Close' }],
    { wide: true, onOpen: b => b.addEventListener('click', async e => {
      const a = e.target.closest('[data-a]')?.dataset.a;
      if (a === 'att') { e.preventDefault(); closeModal(); location.hash = '#/hratt'; return; }
      if (a === 'paynow') { closeModal(); setTimeout(() => salaryPayDialog({ month, staffId }), 50); return; }
      const ud = e.target.closest('[data-undo]'); if (ud) { const p = H.paymentsOf(r.x).find(x => x.id === ud.dataset.undo); closeModal(); setTimeout(() => undoPayDialog(month, staffId, p), 50); return; }
      if (a === 'addadj') { const amt = num(val('adA')); if (!amt) return toast('Enter the amount.', 'warn'); if (!val('adR')) return toast('Give a reason.', 'warn'); adj.push({ label: val('adL') || 'Adjustment', amount: r2(amt), reason: val('adR'), by: store.me.id, at: Date.now() }); try { await H.saveRunItem(month, staffId, { adjustments: adj }); setTimeout(() => payDetail(month, staffId), 200); } catch (er) { fail(er); } }
      const rm = e.target.closest('[data-rmadj]'); if (rm) { adj.splice(+rm.dataset.rmadj, 1); try { await H.saveRunItem(month, staffId, { adjustments: adj }); setTimeout(() => payDetail(month, staffId), 200); } catch (er) { fail(er); } }
    }) });
}
function finalizeDialog(month) {
  const R = H.hrRules(), end = month + '-' + String(H.daysInMonth(month)).padStart(2, '0'), lock = L.lockedUpTo(), def = lock && end <= lock ? H.shopNow().date : end;
  const rows = H.preview(month).filter(r => r.pay), lines = H.payrollLines(rows.map(r => ({ staffId: r.staff.id, pay: r.pay, eosb: H.eosbFor(r.staff, r.salary, month), payAcc: H.staffPayAcc(r.staff.id) })), H.acct());
  openModal('Finalize payroll · ' + H.monthLabel(month), `<p style="margin:0 0 10px;line-height:1.6">Finalizing will:<br>• lock ${esc(H.monthLabel(month))} attendance for everyone,<br>• freeze each payslip and give staff with the app their payslip,<br>• record the advance instalments,<br>• post this journal to Accounts:</p>${journalTable(lines)}${field('Posting date', input('fnD', def, 'type="date"'))}`,
    [{ label: 'Cancel' }, { label: 'Finalize', cls: 'btn-accent', onClick: async () => { await H.finalizeRun(month, val('fnD')); toast('Payroll finalized and posted to Accounts.'); } }]);
}
/* ---------- salary payments (also opened from Money In & Out) ---------- */
const VARIABLE = k => ['ot', 'otoff', 'adj'].includes(k) || /^(incentive|bonus):/.test(k || '');
function sifFile(list, date, ref) {
  const P = H.hrRules().pay, errs = [];
  if (!/^\d{13}$/.test(P.employerId || '')) errs.push('Your employer ID (13 digits) — HR Settings → Salary payments');
  if (!/^\d{9}$/.test(P.routing || '')) errs.push('Your bank’s routing code (9 digits) — HR Settings → Salary payments');
  list.forEach(e => { const miss = [!/^\d{14}$/.test(e.d.wpsId) && 'WPS person ID', !/^\d{9}$/.test(e.d.routing) && 'bank routing code', !/^AE\d{21}$/.test(e.d.iban) && 'UAE IBAN'].filter(Boolean); if (miss.length) errs.push(`${e.d.name}: ${miss.join(', ')} — Staff Directory → Edit`); });
  if (errs.length) throw Error('Missing for the WPS file:\n• ' + errs.slice(0, 10).join('\n• ') + (errs.length > 10 ? '\n…' : ''));
  const now = new Date(), p2 = n => String(n).padStart(2, '0');
  let total = 0; const edr = list.map(e => {
    const x = e.d.x, varNet = r2(x.result.earnings.filter(l => VARIABLE(l.key)).reduce((t, l) => t + l.amount, 0)), fixedNet = Math.max(0, r2(x.result.net - varNet));
    const fixed = r2(Math.min(e.amount, fixedNet)), vr = r2(e.amount - fixed), T = x.month?.totals || {}, dim = H.daysInMonth(e.d.month); total += e.amount;
    return ['EDR', e.d.wpsId, e.d.routing, e.d.iban, e.d.month + '-01', e.d.month + '-' + p2(dim), dim, fixed.toFixed(2), vr.toFixed(2), num(T.leavePaid) + num(T.leaveUnpaid)].join(',');
  });
  const lastM = list.map(e => e.d.month).sort().pop(), [y, m] = lastM.split('-');
  const scr = ['SCR', P.employerId, P.routing, date, p2(now.getHours()) + p2(now.getMinutes()), m + y, edr.length, r2(total).toFixed(2), 'AED', String(ref || 'Salary ' + H.monthLabel(lastM)).replace(/,/g, ' ')].join(',');
  const name = P.employerId + String(now.getFullYear()).slice(2) + p2(now.getMonth() + 1) + p2(now.getDate()) + p2(now.getHours()) + p2(now.getMinutes()) + p2(now.getSeconds()) + '.SIF';
  download(name, [...edr, scr].join('\r\n') + '\r\n');
}
export function salaryPayDialog({ month, staffId } = {}) {
  const dues = H.salaryDues(); if (!dues.length) return toast('No salaries waiting to be paid. Finalize a payroll month first.', 'warn');
  const months = [...new Set(dues.map(d => d.month))];
  let mSel = month && months.includes(month) ? month : months.length === 1 ? months[0] : '';
  const accs = all('accounts').filter(a => (a.group === 'cash' || a.group === 'bank') && a.status !== 'inactive').sort((a, b) => String(a.code).localeCompare(String(b.code)));
  const accSel = (cur, attr) => `<select ${attr}>${accs.map(a => `<option value="${a.id}"${a.id === cur ? ' selected' : ''}>${esc(a.code + ' · ' + a.name)}</option>`).join('')}</select>`;
  const mSelOpt = (cur, attr) => `<select ${attr}>${Object.entries(H.PAY_METHODS).map(([k, l]) => `<option value="${k}"${k === cur ? ' selected' : ''}>${esc(l)}</option>`).join('')}</select>`;
  const state = {}; dues.forEach(d => { const k = d.month + '|' + d.staffId; state[k] = { d, on: staffId ? d.staffId === staffId : true, amount: d.due, method: d.payMethod, acc: H.payDefaultAcc(d.payMethod) }; });
  const vis = () => Object.entries(state).filter(([, v]) => !mSel || v.d.month === mSel);
  const picked = () => vis().filter(([, v]) => v.on).map(([, v]) => ({ d: v.d, month: v.d.month, staffId: v.d.staffId, amount: r2(v.amount), method: v.method, accountId: v.acc }));
  const table = () => `<div class="tw"><table class="sp-t"><thead><tr><th style="width:30px"><input type="checkbox" id="spAll"${vis().every(([, v]) => v.on) ? ' checked' : ''}></th><th>Staff</th><th class="num">Due</th><th class="num" style="width:120px">Pay now</th><th style="width:170px">Method</th><th style="width:190px">Paid from</th></tr></thead><tbody>
    ${vis().map(([k, v]) => `<tr data-k="${k}"><td><input type="checkbox" class="sp-on"${v.on ? ' checked' : ''}></td><td><b>${esc(v.d.name)}</b><div class="muted" style="font-size:11px">${esc(H.monthLabel(v.d.month))}${v.d.paidSoFar ? ' · ' + money(v.d.paidSoFar) + ' paid already' : ''}${v.d.iban || v.d.bankInfo ? ' · ' + esc(v.d.iban || v.d.bankInfo) : ''}</div></td>
      <td class="num nowrap">${money(v.d.due)}${v.d.paidSoFar ? `<div class="muted" style="font-size:11px">of ${money(v.d.net)}</div>` : ''}</td><td><input class="inp inp-sm num sp-amt" type="number" min="0" step=".01" inputmode="decimal" value="${v.amount}"></td><td>${mSelOpt(v.method, 'class="inp inp-sm sp-m"')}</td><td>${accSel(v.acc, 'class="inp inp-sm sp-a"')}</td></tr>`).join('') || '<tr><td colspan="6" class="muted">Nobody left to pay for this month.</td></tr>'}</tbody></table></div>`;
  const summary = () => {
    const P = picked(), tot = r2(P.reduce((s, e) => s + e.amount, 0)), part = P.filter(e => e.amount < e.d.due - 0.005 && e.amount > 0);
    const byAcc = {}, byM = {}; P.forEach(e => { if (e.amount > 0) { byAcc[e.accountId] = r2((byAcc[e.accountId] || 0) + e.amount); byM[e.method] = r2((byM[e.method] || 0) + e.amount); } });
    return `<div class="alert a-info" style="margin:8px 0 0"><b>${P.length} staff · ${money(tot)}</b>${part.length ? ` · ${part.length} paid in part (the rest stays as salary owed)` : ''}<br><span style="font-size:12px">By method: ${Object.entries(byM).map(([m, v]) => esc(H.PAY_METHODS[m]) + ' ' + money(v)).join(' · ') || '—'}<br>Posted: Salaries Payable ← ${Object.entries(byAcc).map(([a, v]) => esc(L.accName(a)) + ' ' + money(v)).join(' · ') || '—'}${Object.keys(byAcc).length > 1 ? ' (one entry per account)' : ''}</span></div>`;
  };
  const body = () => `<div class="row3">${field('Payroll month', `<select id="spMo">${months.length > 1 ? `<option value="">All unpaid months (${dues.length})</option>` : ''}${months.map(m => `<option value="${m}"${m === mSel ? ' selected' : ''}>${esc(H.monthLabel(m))} (${dues.filter(d => d.month === m).length})</option>`).join('')}</select>`)}${field('Paid on', input('spD', H.shopNow().date, 'type="date"'))}${field('Reference', input('spR', '', 'placeholder="WPS batch, cheque no., bank ref…"'))}</div>
    <div class="sp-bulk"><span class="hint">Set for ticked:</span>${mSelOpt('', 'id="spBM" class="inp inp-sm"').replace('<select', '<select').replace('>', '><option value="">Method…</option>')}${accSel('', 'id="spBA" class="inp inp-sm"').replace('>', '><option value="">Paid from…</option>')}<button type="button" class="btn btn-sm" id="spBGo">Apply</button><span style="flex:1"></span><button type="button" class="btn btn-sm" id="spUsual" title="Each person's usual method from their salary setup">Usual method each</button><button type="button" class="btn btn-sm" id="spFull">Full amounts</button></div>
    <div id="spTbl">${table()}</div><div id="spErr"></div><div id="spSum">${summary()}</div>
    <p class="hint" style="margin-top:8px">Pay everyone, a few people, or part of someone's salary — type a smaller amount and the rest stays unpaid until the next payment. Each person can be paid by a different method and from a different cash or bank account. Default accounts per method are in HR Settings → Salary payments.</p>`;
  const rows = () => picked().filter(e => e.amount > 0);
  openModal('Pay salaries', body(), [{ label: 'Cancel' },
    { label: '⬇ Bank list (CSV)', onClick: () => { const P = rows(); if (!P.length) return toast('Tick someone to pay.', 'warn'), false; download(`Salary_transfers_${val('spD')}.csv`, toCSV([['Staff', 'Employee ID', 'Month', 'Method', 'IBAN', 'Bank routing code', 'Other details', 'Amount', 'Reference'], ...P.map(e => [e.d.name, e.d.empNo, e.month, H.PAY_METHODS[e.method], e.d.iban, e.d.routing, e.d.bankInfo, e.amount, val('spR') || 'Salary ' + H.monthLabel(e.month)])])); return false; } },
    { label: '⬇ WPS file (SIF)', onClick: () => { const P = rows().filter(e => e.method === 'wps'); if (!P.length) return toast('No ticked person is set to “WPS salary transfer”.', 'warn'), false; $('spErr').innerHTML = ''; try { sifFile(P, val('spD'), val('spR')); } catch (er) { $('spErr').innerHTML = `<div class="alert a-bad" style="margin:8px 0 0">${esc(er.message).replace(/\n/g, '<br>')}</div>`; } return false; } },
    ...[['🖨 Record & print', 'btn-accent', true], ['Record payment', 'btn-ok', false]].map(([label, cls, pr]) => ({ label, cls, onClick: async () => { const P = picked(); if (!P.length) throw Error('Tick who was paid.'); const t0 = Date.now(); const r = await H.paySalaries(P, { date: val('spD'), ref: val('spR') }); toast(`Salary payment of ${money(r.total)} recorded${r.journals > 1 ? ` (${r.journals} entries, one per account)` : ''}.`);
      if (pr) { const keys = new Set(P.filter(e => e.amount > 0).map(e => e.month + '|' + e.staffId)); await printVouchers(H.staffPayments().filter(p => p.type === 'Salary' && keys.has(p.month + '|' + p.staffId) && (p.at || 0) >= t0).map(voucherFromStaff), 'Salary_vouchers_' + val('spD')); } } }))],
    { wide: true, onOpen: b => {
      const redraw = () => { $('spTbl').innerHTML = table(); $('spSum').innerHTML = summary(); }, sum = () => { $('spSum').innerHTML = summary(); };
      const rowOf = t => { const tr = t.closest('tr[data-k]'); return tr ? state[tr.dataset.k] : null; };
      b.addEventListener('change', e => {
        if (e.target.id === 'spMo') { mSel = e.target.value; return redraw(); }
        if (e.target.id === 'spAll') { vis().forEach(([, v]) => v.on = e.target.checked); return redraw(); }
        const v = rowOf(e.target); if (!v) return;
        if (e.target.classList.contains('sp-on')) v.on = e.target.checked;
        if (e.target.classList.contains('sp-m')) { v.method = e.target.value; v.acc = H.payDefaultAcc(v.method); e.target.closest('tr').querySelector('.sp-a').value = v.acc; }
        if (e.target.classList.contains('sp-a')) v.acc = e.target.value;
        if (e.target.classList.contains('sp-amt')) { v.amount = Math.min(r2(num(e.target.value)), v.d.due); e.target.value = v.amount; v.on = v.amount > 0 || v.d.net <= 0; e.target.closest('tr').querySelector('.sp-on').checked = v.on; }
        sum();
      });
      b.addEventListener('input', e => { const v = rowOf(e.target); if (v && e.target.classList.contains('sp-amt')) { v.amount = r2(num(e.target.value)); sum(); } });
      b.addEventListener('click', e => {
        const id = e.target.id;
        if (id === 'spBGo') { const m = val('spBM'), a = val('spBA'); if (!m && !a) return toast('Choose a method or an account.', 'warn'); vis().forEach(([, v]) => { if (!v.on) return; if (m) { v.method = m; v.acc = H.payDefaultAcc(m); } if (a) v.acc = a; }); redraw(); }
        if (id === 'spUsual') { vis().forEach(([, v]) => { v.method = v.d.payMethod; v.acc = H.payDefaultAcc(v.method); }); redraw(); }
        if (id === 'spFull') { vis().forEach(([, v]) => { v.amount = v.d.due; }); redraw(); }
      });
    } });
}
export const PAY_TYPES = [['salary', '💰 Salary'], ['advance', 'Advance'], ['loan', 'Loan'], ['incentive', 'Incentive'], ['bonus', 'Bonus'], ['allowance', 'Allowance'], ['commission', 'Commission']];
// one place to pay staff: pick the type, then the form for it
export function staffPayDialog({ type = '', staffId = '' } = {}) {
  let t = type, sid = staffId;
  const now = H.shopNow(), cur = H.runOf(now.month), defM = cur && ['approved', 'finalized'].includes(cur.status) ? H.nextMonth(now.month) : now.month;
  const usual = () => (H.salaryOf(sid) || {}).payMethod || 'cash';
  const form = () => {
    if (!t) return '<p class="hint" style="margin:4px 0 0">Choose what you are paying.</p>';
    if (t === 'salary') { const d = H.salaryDues(), tot = r2(d.reduce((x, y) => x + y.due, 0)); return d.length ? `<div class="alert a-info" style="margin:0">${d.length} finalized salar${d.length === 1 ? 'y' : 'ies'} waiting to be paid · <b>${money(tot)}</b>. Press Continue to choose who, how much, method and account.</div>` : '<div class="alert a-warn" style="margin:0">No finalized salary is waiting. Finalize the month in HR &amp; Payroll → Payroll first — or pay an <b>Advance</b> now and it is taken back from the salary.</div>'; }
    const m = usual(), loan = t === 'loan', adv = t === 'advance' || loan;
    return `${field('Staff', `<select id="stS">${staffOpts(sid, 'Choose…')}</select>`)}
      <div class="row3">${field('Amount', input('stA', '', 'type="number" min="0" step=".01" inputmode="decimal"'))}${field('Date', input('stD', now.date, 'type="date"'))}${field('Reference', input('stR', '', 'placeholder="Cheque no., bank ref…"'))}</div>
      <div class="row2">${field('Method', select('stM', Object.entries(H.PAY_METHODS), m))}${field('Paid from', select('stF', moneyAcc(), H.payDefaultAcc(m)))}</div>
      ${adv ? `${field('Reason', input('stW', '', `placeholder="${loan ? 'e.g. car purchase, family need' : 'e.g. family emergency'}"`))}<div class="row3">${field('Repay', `<select id="stP"><option value="inst">In instalments</option><option value="once">In one go</option></select>`)}${field('Instalments', input('stN', loan ? 12 : 3, 'type="number" min="1" max="60"'))}${field('Start recovering', monthInput('stSM', H.nextMonth(now.month)).replace('class="inp" ', ''))}</div>`
        : `<div class="row3">${field('Label', input('stL', t === 'commission' ? 'Sales commission' : H.EXTRA_PAY[t]))}${field('Expense account', `<select id="stE">${all('accounts').filter(a => a.type === 'expense' && a.status !== 'inactive').sort((a, b) => String(a.code).localeCompare(String(b.code))).map(a => `<option value="${a.id}"${a.id === H.extraExpAcc(t) ? ' selected' : ''}>${esc(a.code + ' · ' + a.name)}</option>`).join('')}${byId('accounts', H.extraExpAcc(t)) ? '' : `<option value="${H.extraExpAcc(t)}" selected>New: ${t === 'allowance' ? 'Staff Allowances' : 'Incentives, Bonuses &amp; Commission'}</option>`}</select>`)}${field('Reason / note', input('stW', '', 'placeholder="e.g. September sales target"'))}</div>`}
      <p class="hint" id="stInfo" style="margin:4px 0 0"></p>`;
  };
  const info = () => { const el = $('stInfo'); if (!el) return; const a = num(val('stA'));
    if (t === 'advance' || t === 'loan') { const n = val('stP') === 'once' ? 1 : Math.max(1, num(val('stN'), 1)), s = H.staffById(val('stS')), out = s ? H.advList(s.id).reduce((x, y) => x + y.outstanding, 0) : 0; el.innerHTML = `${a ? `Taken back from salary: ${n} × <b>${money(a / n)}</b> from ${esc(H.monthLabel(val('stSM') || now.month))}. ` : ''}${out ? `Already owes ${money(out)}. ` : ''}Posted: Staff Advances ← ${esc(L.accName(val('stF')))}.`; }
    else el.innerHTML = `Recorded straight away as an expense, no payroll needed: <b>Dr ${esc(L.accName(val('stE')) || 'Incentives, Bonuses & Commission')}</b> · <b>Cr ${esc(L.accName(val('stF')))}</b>${a ? ' ' + money(a) : ''}, tagged ${esc(H.staffById(val('stS'))?.name || 'with the staff member')}. It isn't added to the payslip.`; };
  const body = () => `<div class="field"><label>Type of payment</label><div class="chips" id="stT">${PAY_TYPES.map(([k, l]) => `<button type="button" class="chip${k === t ? ' active' : ''}" data-pt="${k}">${l}</button>`).join('')}</div></div><div id="stFm">${form()}</div>`;
  const save = async pr => {
    if (!t) throw Error('Choose the type of payment.');
    if (t === 'salary') { if (!H.salaryDues().length) throw Error('No finalized salary is waiting to be paid.'); setTimeout(() => salaryPayDialog({ staffId: sid }), 60); return; }
    if (!val('stS')) throw Error('Choose the staff member.');
    if (t === 'advance' || t === 'loan') { const id = await H.addAdvance({ staffId: val('stS'), date: val('stD'), amount: val('stA'), reason: val('stW'), plan: val('stP'), installments: val('stN'), startMonth: val('stSM'), accountId: val('stF'), kind: t, method: val('stM'), ref: val('stR') }); toast(`${t === 'loan' ? 'Loan' : 'Advance'} paid and posted to Accounts.`); if (pr) { const p = H.staffPayments().find(x => x.advId === id); if (p) await printVouchers([voucherFromStaff(p)]); } return; }
    const no = await H.payStaffExtra({ staffId: val('stS'), kind: t, label: val('stL'), amount: val('stA'), date: val('stD'), accountId: val('stF'), method: val('stM'), ref: val('stR'), reason: val('stW'), expenseAcc: val('stE') }); toast(`${no} saved — ${H.EXTRA_PAY[t]} recorded as an expense.`);
    if (pr) { const p = H.staffPayments().find(x => x.no === no); if (p) await printVouchers([voucherFromStaff(p)]); }
  };
  openModal('Pay staff', body(), [{ label: 'Cancel' }, { label: '🖨 Save & print', cls: 'btn-accent', onClick: () => save(true) }, { label: 'Save payment', cls: 'btn-ok', onClick: () => save(false) }], { wide: true, onOpen: b => {
    const redraw = () => { $('stFm').innerHTML = form(); b.querySelectorAll('[data-pt]').forEach(x => x.classList.toggle('active', x.dataset.pt === t)); const fb = [...document.querySelectorAll('#modalFoot button')], btn = fb.pop(), pb = fb.pop(); if (btn) btn.textContent = t === 'salary' ? 'Continue' : 'Save payment'; if (pb) pb.hidden = t === 'salary'; info(); };
    b.addEventListener('click', e => { const p = e.target.closest('[data-pt]'); if (p) { if ($('stS')) sid = val('stS'); t = p.dataset.pt; redraw(); } });
    b.addEventListener('change', e => { if (e.target.id === 'stS') { sid = e.target.value; if ($('stM')) { $('stM').value = usual(); $('stF').value = H.payDefaultAcc(usual()); } } if (e.target.id === 'stM') $('stF').value = H.payDefaultAcc(e.target.value); info(); });
    b.addEventListener('input', info); redraw();
  } });
}
function payDialog(month) { salaryPayDialog({ month }); }
function undoPayDialog(month, staffId, p) {
  openModal('Undo salary payment', `<p style="margin:0 0 10px;line-height:1.55">${p ? `This cancels the payment of <b>${money(p.amount)}</b> on ${fmtDate(p.date)} (${esc(H.PAY_METHODS[p.method] || p.method || '')}).` : 'This cancels every payment recorded for this person this month.'} A reversing entry is posted today, so the money goes back to ${p ? esc(L.accName(p.accountId)) : 'the account(s) it was paid from'} and the salary shows as owed again.</p>${field('Reason (required)', input('upW', '', 'placeholder="e.g. Entered twice, cheque bounced"'))}`,
    [{ label: 'Cancel' }, { label: 'Undo payment', cls: 'btn-danger', onClick: async () => { await H.undoPaid(month, staffId, val('upW'), p?.id); toast('Payment undone.'); } }]);
}

/* ---------- accounting views ---------- */
function journalTable(lines) {
  const sd = l => l.e ? `<div class="muted" style="font-size:11px">${esc(H.staffById(l.e)?.name || '')}</div>` : '';
  const grouped = {}; lines.forEach(l => { const k = (String(l.acc).startsWith('asp_') ? 'asp' : l.acc) + (l.dr ? 'd' : 'c'); const g = grouped[k] || (grouped[k] = { acc: l.acc, dr: 0, cr: 0, n: 0, e: l.e }); g.dr = r2(g.dr + l.dr); g.cr = r2(g.cr + l.cr); g.n++; if (g.e !== l.e) g.e = null; });
  const G = Object.values(grouped).sort((a, b) => (b.dr ? 1 : 0) - (a.dr ? 1 : 0));
  return `<div class="tw" style="margin-bottom:10px"><table><thead><tr><th>Account</th><th class="num">Debit</th><th class="num">Credit</th></tr></thead><tbody>${G.map(g => `<tr><td>${esc(g.n > 1 && String(g.acc).startsWith('asp_') ? 'Salary Payable – each employee' : L.accName(g.acc) || (String(g.acc).startsWith('asp_') ? 'Salary Payable – ' + (H.staffById(g.acc.slice(4))?.name || '') : g.acc))}${g.n > 1 ? `<div class="muted" style="font-size:11px">${g.n} staff</div>` : sd(g)}</td><td class="num">${g.dr ? money(g.dr) : ''}</td><td class="num">${g.cr ? money(g.cr) : ''}</td></tr>`).join('')}</tbody><tfoot><tr><td>Total</td><td class="num">${money(lines.reduce((s, l) => s + l.dr, 0))}</td><td class="num">${money(lines.reduce((s, l) => s + l.cr, 0))}</td></tr></tfoot></table></div>`;
}
function postedHTML(run) {
  const js = all('journals').filter(j => j.src === 'hr' && j.srcRef === run.month && ['payroll', 'salarypay'].includes(j.refType)).sort((a, b) => a.date.localeCompare(b.date) || (a.createdAt || 0) - (b.createdAt || 0));
  if (!js.length) return '';
  return `<div class="panel" style="margin-top:14px"><h2>📒 In the accounts</h2>${js.map(j => `<div class="list-item click" data-jopen="${j.id}"${j.status === 'void' ? ' style="opacity:.55"' : ''}><div><div class="li-t mono">${esc(j.no)}${j.status === 'void' ? ' <span class="pill p-void">cancelled</span>' : ''}</div><div class="li-s">${fmtDate(j.date)} · ${esc(j.memo)}</div></div><b>${money(j.total)}</b></div>`).join('')}
    <p class="hint">Payroll: expenses by kind against Salaries Payable${run.advRecovered ? ', Staff Advances' : ''}${run.eosb ? ', End-of-service Provision' : ''}. Payments clear Salaries Payable. Tap to see the entry.</p></div>`;
}
export function openHrJournal(id) {
  const j = byId('journals', id); if (!j) return;
  openModal(j.no, `<div class="li-s" style="margin:-4px 0 10px"><span>${fmtDate(j.date, { day: 'numeric', month: 'short', year: 'numeric' })}</span><span>${esc(j.memo)}</span>${j.status === 'void' ? pill('void', 'Cancelled') : ''}</div>${journalTable(j.lines.map(l => ({ ...l, dr: num(l.dr), cr: num(l.cr) })))}
    <p class="hint">Made by HR &amp; Payroll — it appears in Accounts (ledgers, trial balance, balance sheet, P&amp;L) and can only be changed from here.</p>`, [{ label: '↗ Open in Accounts', onClick: () => { closeModal(); location.hash = '#/accounts'; } }, { label: 'Close' }], { wide: true });
}
// who makes up the Staff Advances / Salaries Payable / End-of-service Provision balance
export function empListDialog(accId, date) {
  L.derive(true); const A = H.acct(), a = byId('accounts', accId);
  if (a && a.staffId && H.staffById(a.staffId)) return staffStatement(a.staffId);
  const k = accId === A.adv ? 'adv' : H.isPayableAcc(accId) ? 'payable' : accId === A.eosbProv ? 'eosb' : null;
  const b = H.staffBalances(date), list = Object.entries(b).map(([id, x]) => ({ s: H.staffById(id) || { id, name: '(removed staff)' }, v: k ? x[k] : 0 })).filter(x => Math.abs(x.v) > 0.009).sort((x, y) => y.v - x.v);
  const SI = L.statementItems(date || H.shopNow().date), bal = r2(k === 'payable' ? SI.filter(i => H.isPayableAcc(i.key)).reduce((t, i) => t + num(i.bal), 0) : (SI.find(i => i.key === accId) || {}).bal || 0), total = r2(list.reduce((s, x) => s + x.v, 0)), acctTotal = k === 'adv' ? bal : -bal, resid = r2(acctTotal - total);
  const title = { adv: 'Staff Advances — owed by staff', payable: 'Salaries Payable (all employee accounts) — owed to staff', eosb: 'End-of-service Provision — by staff' }[k] || (a ? a.name : 'Staff');
  openModal(title, `<p class="hint" style="margin:0 0 8px">As of ${fmtDate(date || H.shopNow().date, { day: 'numeric', month: 'short', year: 'numeric' })}${a ? ' · account ' + esc(a.code) : ''}</p>
    ${H.hrAccess() ? '' : '<div class="alert a-info">Staff names are visible to people with HR access.</div>'}
    <div class="tw" style="max-height:60vh"><table><thead><tr><th>Staff</th><th class="num">Balance</th></tr></thead><tbody>${list.map(x => `<tr class="click" data-es="${x.s.id || ''}"><td><b>${esc(x.s.name)}</b>${x.s.empNo ? ` <span class="muted">${esc(x.s.empNo)}</span>` : ''}</td><td class="num">${money(x.v)}</td></tr>`).join('') || `<tr><td colspan="2" class="muted">Nobody.</td></tr>`}
    ${Math.abs(resid) > 0.009 ? `<tr><td class="muted">Not linked to a staff member (manual journals)</td><td class="num">${money(resid)}</td></tr>` : ''}</tbody><tfoot><tr><td>Total</td><td class="num">${money(acctTotal)}</td></tr></tfoot></table></div><p class="hint" style="margin-top:8px">Tap a name for their statement.</p>`,
    [{ label: '📒 Ledger', onClick: () => { closeModal(); import('./views-office.js').then(m => m.openLedger({ kind: 'account', id: accId, to: date })); } }, { label: 'Close' }],
    { wide: true, onOpen: bd => bd.addEventListener('click', e => { const r = e.target.closest('[data-es]'); if (r && r.dataset.es && H.staffById(r.dataset.es)) staffStatement(r.dataset.es); }) });
}
export function staffStatement(staffId) {
  L.derive(true); const s = H.staffById(staffId), A = H.acct(), rows = H.staffLines(staffId).sort((a, b) => a.j.date.localeCompare(b.j.date) || (a.j.createdAt || 0) - (b.j.createdAt || 0)), bal = (H.staffBalances()[staffId] || { adv: 0, payable: 0, eosb: 0 });
  const run = { adv: 0, payable: 0, eosb: 0 }, kOf = acc => acc === A.adv ? 'adv' : acc === A.payable ? 'payable' : acc === A.eosbProv ? 'eosb' : null;
  const body = rows.flatMap(({ j, lines }) => lines.map(l => { const k = kOf(l.acc); if (k) run[k] = r2(run[k] + (k === 'adv' ? l.dr - l.cr : l.cr - l.dr)); return `<tr><td class="nowrap">${fmtDate(j.date)}</td><td class="mono" style="font-size:12px">${esc(j.no)}</td><td style="font-size:12px">${esc(j.memo)}</td><td style="font-size:12px">${esc(L.accName(l.acc))}</td><td class="num">${l.dr ? money(l.dr) : ''}</td><td class="num">${l.cr ? money(l.cr) : ''}</td><td class="num nowrap">${k ? money(run[k]) : ''}</td></tr>`; })).join('');
  openModal(`${s?.name || 'Staff'} · account statement`, `<div class="grid g3" style="gap:10px;margin-bottom:12px"><div class="kpi"><span>Advance owed by them</span><b>${money(bal.adv)}</b></div><div class="kpi"><span>Salary owed to them</span><b>${money(bal.payable)}</b></div><div class="kpi"><span>Gratuity provision</span><b>${money(bal.eosb)}</b></div></div>
    <div class="tw" style="max-height:60vh"><table><thead><tr><th>Date</th><th>Entry</th><th>Details</th><th>Account</th><th class="num">Debit</th><th class="num">Credit</th><th class="num">Balance</th></tr></thead><tbody>${body || `<tr><td colspan="7">${empty('📒', 'No entries yet.')}</td></tr>`}</tbody></table></div>
    <p class="hint" style="margin-top:8px">Balance = that account's running balance for this person (advance: what they owe; salaries payable and gratuity: what the shop owes them).</p>`,
    [{ label: '⬇ CSV', onClick: () => { download(`Staff_statement_${s?.empNo || staffId}.csv`, toCSV([['Date', 'Entry', 'Details', 'Account', 'Debit', 'Credit'], ...rows.flatMap(({ j, lines }) => lines.map(l => [j.date, j.no, j.memo, L.accName(l.acc), l.dr || '', l.cr || '']))])); return false; } }, { label: 'Close' }], { wide: true });
}
export function eosbDialog(s) {
  const now = H.shopNow(), E = H.hrRules().eosb, sal = H.salaryOf(s.id, s.endDate || now.date), yrs = H.serviceYears(s, s.endDate || now.date), due = H.eosbDue(sal, yrs, E), prov = r2((H.staffBalances()[s.id] || {}).eosb || 0);
  openModal('End-of-service gratuity · ' + s.name, `<dl class="dl" style="margin-bottom:10px"><dt>Service</dt><dd>${yrs.toFixed(2)} years (${fmtDate(s.joinDate, { day: 'numeric', month: 'short', year: 'numeric' })} → ${fmtDate(s.endDate || now.date, { day: 'numeric', month: 'short', year: 'numeric' })})</dd><dt>Basic salary</dt><dd>${money(sal?.base || 0)} ${esc(sal?.type || '')}</dd><dt>Worked out</dt><dd><b>${money(due)}</b> <span class="muted">${E.days1} days/year for the first ${E.afterYears} years, ${E.days2} after; none under ${E.minYears} year; max 2 years' pay</span></dd><dt>Provision in the books</dt><dd>${money(prov)}</dd></dl>
    <div class="row3">${field('Amount to pay', input('eoA', due, 'type="number" min="0" step=".01"'))}${field('Paid on', input('eoD', now.date, 'type="date"'))}${field('Paid from', select('eoF', moneyAcc(), L.ACC.cash))}</div>
    <label class="check"><input type="checkbox" id="eoR" checked> Release any provision left over (credit back to the expense)</label>
    <p class="hint">Check the amount against the labour contract (resignation vs termination, unpaid leave, deductions). The provision is used first; any extra goes to End-of-service Benefits expense.</p>`,
    [{ label: 'Cancel' }, { label: 'Record payment', cls: 'btn-ok', onClick: async () => { await H.settleEosb(s.id, { amount: val('eoA'), date: val('eoD'), accountId: val('eoF'), release: $('eoR').checked }); toast('Gratuity recorded and posted to Accounts.'); } }]);
}

/* ---------- payslips ---------- */
function slipFromRow(month, r) {
  if (r.frozen) return { ...H.payslipFor(month, r.staff.id) };
  return { month, staffId: r.staff.id, name: r.staff.name, empNo: r.staff.empNo, dept: r.staff.dept, designation: r.staff.designation || '', salaryType: r.pay.type, earnings: r.pay.earnings, deductions: r.pay.deductions, gross: r.pay.gross, totalDed: r.pay.totalDed, net: r.pay.net, preview: true,
    att: { present: r.m.totals.present, half: r.m.totals.half, absent: r.m.totals.absent, leavePaid: r.m.totals.leavePaid, leaveUnpaid: r.m.totals.leaveUnpaid, holidays: r.m.totals.holidays, offs: r.m.totals.offs, lateCount: r.m.totals.lateCount, lateMin: r.m.totals.lateMin, earlyCount: r.m.totals.earlyCount, earlyMin: r.m.totals.earlyMin, otMin: r.m.totals.otMin + r.m.totals.otOffMin, netMin: r.m.totals.netMin, notEmployed: r.m.totals.notEmployed } };
}
const SLIP_CSS = `.slip{font:10pt/1.45 Arial,Helvetica,sans-serif;color:#1b1b1b;padding:0 0 8mm;page-break-after:always}.slip:last-child{page-break-after:auto}.sh{display:flex;justify-content:space-between;gap:8mm;border-bottom:.6mm solid #15213b;padding-bottom:3mm;margin-bottom:4mm}.sh h1{margin:0;font-size:15pt;color:#15213b}.sh h2{margin:0;font-size:13pt;text-align:right;letter-spacing:.06em}
.sg{display:grid;grid-template-columns:1fr 1fr;gap:6mm}.slip table{width:100%;border-collapse:collapse}.slip td,.slip th{padding:1.4mm 2mm;border-bottom:.2mm solid #ddd;text-align:left;font-size:9.5pt}.slip th{background:#f0f0ec}.slip .n{text-align:right;white-space:nowrap}.slip tfoot td{font-weight:bold;border-top:.4mm solid #999}
.att{display:grid;grid-template-columns:repeat(6,1fr);gap:2mm;margin:3mm 0 4mm}.att div{border:.2mm solid #ccc;border-radius:1.5mm;padding:1.5mm;text-align:center}.att b{display:block;font-size:12pt}.att span{font-size:7.5pt;color:#555;text-transform:uppercase}
.net{margin-top:4mm;background:#15213b;color:#fff;padding:3mm 4mm;border-radius:1.5mm;display:flex;justify-content:space-between;font-size:12pt;font-weight:bold}.wd{font-size:9pt;color:#444;margin-top:1.5mm}.sig{display:flex;justify-content:space-between;margin-top:14mm}.sig span{border-top:.3mm solid #555;padding-top:1mm;width:60mm;text-align:center;font-size:9pt}.pv{background:#fdeee8;color:#c9461f;padding:2mm 3mm;border-radius:1.5mm;margin-bottom:3mm;font-weight:bold}`;
export function slipHTML(d) {
  const co = company(), cur = setting('currency', ''), A = d.att || {}, G = templates().G;
  const m = n => Number(num(n)).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const rows = arr => arr.map(x => `<tr><td>${esc(x.label)}${x.note ? `<div style="font-size:8pt;color:#666">${esc(x.note)}</div>` : ''}</td><td class="n">${m(x.amount)}</td></tr>`).join('');
  return `<div class="slip">${d.preview ? '<div class="pv">PREVIEW — not final</div>' : ''}<div class="sh"><div><h1>${esc(co.name || '')}</h1><div>${esc(co.address || '').replace(/\n/g, '<br>')}</div>${co.phone ? `<div>Tel: ${esc(co.phone)}</div>` : ''}</div><div><h2>PAYSLIP</h2><div style="text-align:right">${esc(H.monthLabel(d.month))}</div></div></div>
    <div class="sg" style="margin-bottom:2mm"><div><b>${esc(d.name)}</b><br>ID ${esc(d.empNo || '')} · ${esc(d.designation || d.dept || '')}</div><div style="text-align:right">Salary type: ${esc(d.salaryType || '')}${d.paid ? `<br>Paid ${esc(d.paid.date)} · ${esc(H.PAY_METHODS[d.paid.method] || d.paid.method || '')}${d.paid.ref ? ' · ' + esc(d.paid.ref) : ''}` : ''}</div></div>
    <div class="att"><div><b>${num(A.present)}</b><span>Present</span></div><div><b>${num(A.half)}</b><span>Half-day</span></div><div><b>${num(A.absent)}</b><span>Absent</span></div><div><b>${num(A.leavePaid) + num(A.leaveUnpaid)}</b><span>Leave</span></div><div><b>${num(A.lateCount)}</b><span>Late</span></div><div><b>${fmtMin(A.otMin || 0)}</b><span>OT hours</span></div></div>
    <div class="sg"><table><thead><tr><th>Earnings</th><th class="n">${esc(cur)}</th></tr></thead><tbody>${rows(d.earnings || [])}</tbody><tfoot><tr><td>Gross</td><td class="n">${m(d.gross)}</td></tr></tfoot></table>
      <table><thead><tr><th>Deductions</th><th class="n">${esc(cur)}</th></tr></thead><tbody>${rows(d.deductions || []) || '<tr><td>—</td><td></td></tr>'}</tbody><tfoot><tr><td>Total</td><td class="n">${m(d.totalDed)}</td></tr></tfoot></table></div>
    <div class="net"><span>Net pay</span><span>${esc(cur)} ${m(d.net)}</span></div><div class="wd">${esc(amountWords(num(d.net), G))}</div>
    <div class="sig"><span>Employee signature</span><span>For ${esc(co.name || '')}</span></div></div>`;
}
function savePayslips(list, name) { return savePdf(`<!doctype html><html><head><meta charset="utf-8"><style>body{margin:0;background:#fff}.slip{width:186mm;background:#fff;padding:2mm 0 4mm}${SLIP_CSS}</style></head><body>${list.map(slipHTML).join('')}</body></html>`, name.replace(/\.html$/i, '').replace(/[^\w.\-]+/g, '_'), '.slip', { fit: 'A4', margin: 12, width: 900 }); }
function savePayslipsHtml(list, name) { return download(name.replace(/[^\w.\-]+/g, '_'), `<!doctype html><html><head><meta charset="utf-8"><title>Payslips</title><style>@page{size:A4;margin:12mm}body{margin:0;padding:12mm;background:#fff}@media print{body{padding:0}}${SLIP_CSS}</style></head><body>${list.map(slipHTML).join('')}<script>window.onload=function(){setTimeout(function(){window.print()},300)}<\/script></body></html>`); }
export function showPayslip(d) {
  openModal('Payslip · ' + H.monthLabel(d.month), `<div class="hr-slip-prev"><style>${SLIP_CSS.replace(/(^|})\s*\./g, '$1 .hr-slip-prev .')}</style>${slipHTML(d)}</div>`, [{ label: '⬇ Download / print', cls: 'btn-ink', onClick: () => { savePayslips([d], `Payslip_${d.empNo || ''}_${d.month}.html`); return false; } }, { label: 'Close' }], { wide: true });
}

/* ===================== 💸 Advances ===================== */
let adStaff = '', adShow = 'open';
export const hradv = {
  title: 'Salary Advances', icon: '💸', roles: ['admin', 'manager', 'billing'],
  head: () => `<button class="btn btn-accent" data-a="newadv">＋ New advance</button>`,
  body() {
    const list = H.advList(adStaff).filter(a => adShow === 'all' || a.status === adShow), out = r2(H.advList().reduce((s, a) => s + a.outstanding, 0));
    return `<div class="grid g3" style="margin-bottom:14px"><div class="kpi"><span>Outstanding</span><b>${money(out)}</b><small>${H.advList().filter(a => a.status === 'open').length} open advance(s)</small></div><div class="kpi"><span>Given this year</span><b>${money(H.advList().filter(a => a.date.startsWith(H.shopNow().date.slice(0, 4))).reduce((s, a) => s + num(a.amount), 0))}</b></div><div class="kpi"><span>Recovered this year</span><b>${money(H.advList().reduce((s, a) => s + (a.recoveries || []).filter(x => String(x.date).startsWith(H.shopNow().date.slice(0, 4))).reduce((y, x) => y + num(x.amount), 0), 0))}</b></div></div>
      <div class="toolbar"><select class="inp" id="adS" style="width:auto">${staffOpts(adStaff, 'All staff')}</select><div class="chips">${[['all', 'All'], ['open', 'Open'], ['closed', 'Repaid']].map(([k, l]) => `<button class="chip${k === adShow ? ' active' : ''}" data-sh="${k}">${l}</button>`).join('')}</div></div>
      <div class="tw"><table><thead><tr><th>Advance</th><th>Staff</th><th class="hide-m">Reason</th><th class="hide-m">Plan</th><th class="num">Amount</th><th class="num hide-m">Recovered</th><th class="num">Balance</th></tr></thead><tbody>
      ${list.map(a => `<tr class="click" data-adv="${a.id}"><td class="nowrap"><b class="mono">${esc(a.no)}</b>${a.kind === 'loan' ? ' <span class="pill p-followup">Loan</span>' : ''}<div class="muted" style="font-size:11px">${fmtDate(a.date)}</div></td><td>${esc(a.staffName)}</td><td class="hide-m">${esc(a.reason)}</td><td class="hide-m" style="font-size:12px">${a.plan === 'once' ? 'One-time' : a.installments + ' × ' + money(a.perInst)}<div class="muted">from ${esc(H.monthLabel(a.startMonth))}</div></td><td class="num">${money(a.amount)}</td><td class="num hide-m">${money(a.recovered)}</td><td class="num"><b>${money(a.outstanding)}</b></td></tr>`).join('') || `<tr><td colspan="7">${empty('💸', 'No advances here.')}</td></tr>`}</tbody></table></div>
      <p class="hint" style="margin-top:8px">Instalments are taken from payroll automatically (never below zero pay) and can be changed per month in Payroll. Each advance is posted to Accounts as <b>Staff Advances</b> against the cash or bank account it was paid from.</p>`;
  },
  bind(root) {
    root.addEventListener('change', e => { if (e.target.id === 'adS') { adStaff = e.target.value; rr(); } });
    root.addEventListener('click', e => { if (e.target.closest('[data-a=newadv]')) return advDialog(); const c = e.target.closest('[data-sh]'); if (c) { adShow = c.dataset.sh; return rr(); } const r = e.target.closest('[data-adv]'); if (r) advLedger(r.dataset.adv); });
  }
};
function advDialog() {
  const now = H.shopNow();
  openModal('New salary advance', `${field('Staff', `<select id="avS">${staffOpts(adStaff)}</select>`)}<div class="row2">${field('Date', input('avD', now.date, 'type="date"'))}${field('Amount', input('avA', '', 'type="number" min="0" step=".01" inputmode="decimal"'))}</div>
    ${field('Reason', input('avR', '', 'placeholder="e.g. family emergency"'))}<div class="row3">${field('Repay', `<select id="avP"><option value="inst">In instalments</option><option value="once">In one go</option></select>`)}${field('Instalments', input('avN', 3, 'type="number" min="1" max="36"'))}${field('Start recovering', monthInput('avM', H.nextMonth(now.month)).replace('class="inp" ', ''))}</div>
    ${field('Paid from', select('avF', [...moneyAcc(), ['a3900', 'Opening balance — given before using the app']], L.ACC.cash))}<p class="hint" id="avInfo"></p>`,
    [{ label: 'Cancel' }, { label: 'Save advance', cls: 'btn-ok', onClick: async () => { await H.addAdvance({ staffId: val('avS'), date: val('avD'), amount: val('avA'), reason: val('avR'), plan: val('avP'), installments: val('avN'), startMonth: val('avM'), accountId: val('avF') }); toast('Advance recorded and posted to Accounts.'); } }],
    { onOpen: b => { const info = () => { const n = val('avP') === 'once' ? 1 : Math.max(1, num(val('avN'), 1)); $('avInfo').innerHTML = num(val('avA')) ? `${n} × <b>${money(num(val('avA')) / n)}</b> from ${esc(H.monthLabel(val('avM') || now.month))}` : ''; const s = H.staffById(val('avS')), out = s ? H.advList(s.id).reduce((x, a) => x + a.outstanding, 0) : 0; if (out) $('avInfo').innerHTML += ` · already owes ${money(out)}`; }; b.addEventListener('input', info); b.addEventListener('change', info); info(); } });
}
function advLedger(id) {
  const a = H.advList().find(x => x.id === id) || { ...byId('hrAdvances', id), ...H.advanceState(byId('hrAdvances', id)) };
  let bal = num(a.amount);
  openModal(`${a.no} · ${a.staffName}`, `<dl class="dl" style="margin-bottom:10px"><dt>Given</dt><dd>${fmtDate(a.date)} · ${money(a.amount)} from ${esc(L.accName(a.accountId))}</dd><dt>Reason</dt><dd>${esc(a.reason)}</dd><dt>Plan</dt><dd>${a.plan === 'once' ? 'One-time' : a.installments + ' instalments of ' + money(a.perInst)} from ${esc(H.monthLabel(a.startMonth))}</dd><dt>Entered by</dt><dd>${esc(L.nm(a.createdBy))}</dd></dl>
    <div class="tw"><table><thead><tr><th>Date</th><th>Entry</th><th class="num">Amount</th><th class="num">Balance</th></tr></thead><tbody><tr><td>${a.date}</td><td>Advance paid</td><td class="num">${money(a.amount)}</td><td class="num">${money(bal)}</td></tr>
    ${(a.recoveries || []).map(r => { bal = r2(bal - num(r.amount)); return `<tr><td>${esc(r.date)}</td><td>${r.source === 'payroll' ? 'Payroll ' + esc(H.monthLabel(r.runId)) : 'Repaid in cash' + (r.note ? ' · ' + esc(r.note) : '')}</td><td class="num">− ${money(r.amount)}</td><td class="num">${money(bal)}</td></tr>`; }).join('')}</tbody></table></div>`,
    [...(a.outstanding > 0 && may('hradv', 'edit') ? [{ label: 'Repaid in cash…', onClick: () => { setTimeout(() => repayDialog(a), 30); } }] : []), ...(!(a.recoveries || []).length && may('hradv', 'delete') ? [{ label: 'Delete', cls: 'btn-danger', onClick: () => { setTimeout(() => openModal('Delete advance', field('Reason (required)', input('dvW')), [{ label: 'Cancel' }, { label: 'Delete', cls: 'btn-danger', onClick: async () => { await H.voidAdvance(byId('hrAdvances', id), val('dvW')); toast('Advance deleted and its journal cancelled.'); } }]), 30); } }] : []), { label: 'Close' }], { wide: true });
}
function repayDialog(a) {
  openModal('Advance repaid · ' + a.no, `<div class="row2">${field('Date', input('rpD', H.shopNow().date, 'type="date"'))}${field('Amount', input('rpA', a.outstanding, 'type="number" min="0" step=".01"'))}</div>${field('Received in', select('rpF', moneyAcc(), L.ACC.cash))}${field('Note', input('rpN'))}`,
    [{ label: 'Cancel' }, { label: 'Save', cls: 'btn-ok', onClick: async () => { await H.repayAdvance(byId('hrAdvances', a.id), { amount: val('rpA'), date: val('rpD'), accountId: val('rpF'), note: val('rpN') }); toast('Repayment recorded.'); } }]);
}

/* ===================== 🎁 Incentives, Bonus & Allowances ===================== */
let inMonth = null, inKind = '';
export const hrinc = {
  title: 'Incentives, Bonus & Allowances', icon: '🎁', roles: ['admin', 'manager', 'billing'],
  head: () => `<button class="btn btn-accent" data-a="newit">＋ Add</button>`,
  body() {
    inMonth = inMonth || H.shopNow().month;
    const list = all('hrItems').filter(i => i.status !== 'deleted' && (i.recurring ? i.fromMonth <= inMonth && (!i.toMonth || inMonth <= i.toMonth) : i.month === inMonth) && (!inKind || i.kind === inKind)).sort((a, b) => String(H.staffById(a.staffId)?.name).localeCompare(String(H.staffById(b.staffId)?.name)));
    const amt = i => { const s = H.staffById(i.staffId), S = H.salaryMonth(i.staffId, inMonth); return i.calc === 'percent' ? num(S?.base) * num(i.value) / 100 : i.calc === 'sales' ? H.salesFor(s || {}, inMonth) * num(i.value) / 100 : num(i.value); };
    const fixed = H.staffList().map(s => ({ s, a: (H.salaryOf(s.id)?.allowances || []) })).filter(x => x.a.length);
    return `<div class="toolbar">${monthInput('inM', inMonth)}<div class="chips"><button class="chip${!inKind ? ' active' : ''}" data-k="">All</button>${Object.entries(H.ITEM_KINDS).map(([k, l]) => `<button class="chip${k === inKind ? ' active' : ''}" data-k="${k}">${l}</button>`).join('')}</div></div>
      <div class="tw"><table><thead><tr><th>Staff</th><th>Type</th><th>Label</th><th class="hide-m">How</th><th class="hide-m">When</th><th class="num">This month</th><th></th></tr></thead><tbody>
      ${list.map(i => `<tr><td>${esc(H.staffById(i.staffId)?.name || '?')}</td><td>${pill(['fine', 'deduction'].includes(i.kind) ? 'unpaid' : i.kind === 'bonus' ? 'paid' : 'scheduled', H.ITEM_KINDS[i.kind])}</td><td>${esc(i.label)}${i.prepaid ? ` <span class="pill p-paid">${i.direct ? 'Paid directly (expense)' : 'Paid'} ${fmtDate(i.prepaid.date)} · ${esc(H.PAY_METHODS[i.prepaid.method] || '')}</span>` : ''}${i.reason ? `<div class="muted" style="font-size:11px">${esc(i.reason)}</div>` : ''}</td><td class="hide-m" style="font-size:12px">${i.calc === 'fixed' ? money(i.value) : i.value + (i.calc === 'percent' ? '% of basic' : '% of own sales')}</td>
        <td class="hide-m" style="font-size:12px">${i.recurring ? 'Every month from ' + esc(H.monthLabel(i.fromMonth)) + (i.toMonth ? ' to ' + esc(H.monthLabel(i.toMonth)) : '') : 'One-time'}</td><td class="num">${['fine', 'deduction'].includes(i.kind) ? '− ' : ''}${money(amt(i))}</td><td>${may('hrinc', 'delete') && !H.usedInFinal(i) ? `<button class="icon-btn" data-del="${i.id}" title="Delete">✕</button>` : H.usedInFinal(i) ? '🔒' : ''}</td></tr>`).join('') || `<tr><td colspan="7">${empty('🎁', 'Nothing for this month.')}</td></tr>`}</tbody></table></div>
      ${fixed.length ? `<div class="panel" style="margin-top:14px"><h2>Fixed monthly allowances (from salary setup)</h2>${fixed.map(x => `<div class="list-item"><span>${esc(x.s.name)}</span><span>${x.a.map(a => esc(a.name) + ' ' + money(a.amount)).join(' · ')}</span></div>`).join('')}<p class="hint">Change these in Staff Directory → Edit → Salary setup.</p></div>` : ''}
      <p class="hint" style="margin-top:8px">Items marked “Paid directly” were paid from Money In &amp; Out → Pay staff and booked straight to expenses — they are not part of payroll. One-time items apply to one month; recurring items repeat every month until the end month. Sales-based incentives use the person’s invoices (as salesman) for the month, less returns.</p>`;
  },
  bind(root) {
    root.addEventListener('change', e => { if (e.target.id === 'inM' && e.target.value) { inMonth = e.target.value; rr(); } });
    root.addEventListener('click', async e => {
      if (e.target.closest('[data-a=newit]')) return itemDialog();
      const k = e.target.closest('[data-k]'); if (k && k.classList.contains('chip')) { inKind = k.dataset.k; return rr(); }
      const d = e.target.closest('[data-del]'); if (d) { const it = byId('hrItems', d.dataset.del); if (it && await confirmBox('Delete?', it.prepaid ? `This ${esc(it.label)} was paid on ${fmtDate(it.prepaid.date)}. Deleting it cancels its entry (${esc(it.prepaid.no || '')}) in Accounts — only do this if it was entered by mistake.` : 'Remove this item? Payroll previews update straight away.', 'Delete', true)) { try { await H.deleteItem(it); toast('Deleted.'); } catch (er) { fail(er); } } }
    });
  }
};
function itemDialog() {
  openModal('Add incentive, bonus, allowance or deduction', `<div class="row2">${field('Type', select('itK', Object.entries(H.ITEM_KINDS), 'incentive'))}${field('Label', input('itL', '', 'placeholder="e.g. Sales target bonus, Food allowance"'))}</div>
    <div class="row2">${field('Worked out as', select('itC', Object.entries(H.ITEM_CALC)))}${field('Amount or %', input('itV', '', 'type="number" min="0" step=".01"'))}</div>
    <div class="row3">${field('Repeat', `<select id="itR"><option value="">One-time</option><option value="1">Every month</option></select>`)}${field('Month / from', monthInput('itM', inMonth || H.shopNow().month).replace('class="inp" ', ''))}${field('Until (optional)', `<input type="month" id="itTo">`)}</div>
    ${field('Reason', input('itW'))}
    <div class="field"><label>Who</label><label class="check"><input type="checkbox" id="itAll"> All active staff</label><div class="hr-pick" id="itWho">${H.staffList().map(s => `<label class="check"><input type="checkbox" data-who="${s.id}"> ${esc(s.name)}</label>`).join('')}</div></div>`,
    [{ label: 'Cancel' }, { label: 'Save', cls: 'btn-ok', onClick: async () => { const ids = [...document.querySelectorAll('[data-who]:checked')].map(x => x.dataset.who); const rec = !!val('itR'); const n = await H.saveItem({ staffIds: ids, kind: val('itK'), label: val('itL'), calc: val('itC'), value: val('itV'), recurring: rec, month: rec ? '' : val('itM'), fromMonth: rec ? val('itM') : '', toMonth: rec ? val('itTo') : '', reason: val('itW') }); toast(`Added for ${n} staff.`); } }],
    { onOpen: b => { $('itAll').onchange = e => document.querySelectorAll('[data-who]').forEach(c => c.checked = e.target.checked); } });
}

/* ===================== 📊 HR Reports ===================== */
let rpKind = 'monthly', rpMonth = null, rpDate = null, rpStaff = '';
const REPORTS = { staffacc: 'Staff accounts (books)', daily: 'Daily attendance', monthly: 'Monthly attendance', lateot: 'Late / early / overtime', breaks: 'Breaks & out-time', payroll: 'Payroll summary', advances: 'Advances outstanding', incentives: 'Incentives & bonuses', history: 'Staff history' };
export const hrrep = {
  title: 'HR Reports', icon: '📈', roles: ['admin', 'manager', 'billing'],
  body() {
    H.watchHR();
    const now = H.shopNow(); rpMonth = rpMonth || now.month; rpDate = rpDate || now.date; rpStaff = rpStaff || (H.staffList()[0] || {}).id || '';
    const r = buildReport();
    return `<div class="rep-grid"><div class="panel rep-menu">${Object.entries(REPORTS).map(([k, l]) => `<button class="rep-i${k === rpKind ? ' active' : ''}" data-rk="${k}">${l}</button>`).join('')}</div>
      <section class="panel" style="min-width:0"><div class="panel-h"><div><h2 style="margin:0">${esc(REPORTS[rpKind])}</h2><div class="hint">${esc(r.sub || '')}</div></div><div style="display:flex;gap:8px;flex-wrap:wrap">
        ${rpKind === 'daily' ? `<input type="date" class="inp" id="rpD" value="${rpDate}" style="width:auto">` : rpKind === 'advances' ? '' : monthInput('rpM', rpMonth)}${rpKind === 'history' ? `<select class="inp" id="rpS" style="width:auto">${staffOpts(rpStaff)}</select>` : ''}
        <button class="btn btn-sm btn-accent" data-a="rpdf">⬇ Save as PDF</button><button class="btn btn-sm" data-a="csv">⬇ Excel (CSV)</button><button class="btn btn-sm" data-a="pdf">⬇ Printable file</button></div></div>
        <div class="tw" id="hrRep"><table class="rep"><thead><tr>${r.head.map((h, i) => `<th${i && r.num?.[i] !== false ? ' class="num"' : ''}>${esc(h)}</th>`).join('')}</tr></thead><tbody>${r.rows.map(row => `<tr>${row.map((c, i) => `<td${i && r.num?.[i] !== false ? ' class="num"' : ''}>${esc(c)}</td>`).join('')}</tr>`).join('') || `<tr><td colspan="${r.head.length}">${empty('📈', 'Nothing to show.')}</td></tr>`}</tbody>${r.foot ? `<tfoot><tr>${r.foot.map((c, i) => `<td${i ? ' class="num"' : ''}>${esc(c)}</td>`).join('')}</tr></tfoot>` : ''}</table></div>
        ${r.note ? `<p class="hint" style="margin-top:8px">${r.note}</p>` : ''}</section></div>`;
  },
  bind(root) {
    root.addEventListener('click', e => {
      const k = e.target.closest('[data-rk]'); if (k) { rpKind = k.dataset.rk; return rr(); }
      const a = e.target.closest('[data-a]')?.dataset.a; if (!a) return; const r = buildReport();
      if (a === 'csv') download(`HR_${rpKind}_${rpKind === 'daily' ? rpDate : rpMonth}.csv`, toCSV([r.head, ...r.rows, ...(r.foot ? [r.foot] : [])]));
      if (a === 'rpdf') return reportPdf({ title: REPORTS[rpKind], sub: (r.sub || '') + ' · ' + setting('name', ''), html: $('hrRep').innerHTML, name: `HR_${rpKind}_${rpKind === 'daily' ? rpDate : rpMonth}` }).catch(fail);
      if (a === 'pdf') saveDocument(`HR_${rpKind}_${rpKind === 'daily' ? rpDate : rpMonth}.html`, REPORTS[rpKind], `<div class="doc"><h1>${esc(setting('name', ''))}</h1><h2 style="text-align:left;margin:2mm 0">${esc(REPORTS[rpKind])} · ${esc(r.sub || '')}</h2>${$('hrRep').innerHTML}</div>`);
    });
    root.addEventListener('change', e => { if (e.target.id === 'rpM' && e.target.value) rpMonth = e.target.value; if (e.target.id === 'rpD' && e.target.value) rpDate = e.target.value; if (e.target.id === 'rpS') rpStaff = e.target.value; if (['rpM', 'rpD', 'rpS'].includes(e.target.id)) rr(); });
  }
};
const h = m => fmtMin(m || 0);
function buildReport() {
  const st = H.staffList({ all: true }), R = H.hrRules();
  if (rpKind === 'staffacc') {
    L.derive(true); const b = H.staffBalances(rpKind === 'staffacc' ? null : null), ids = [...new Set([...st.map(s => s.id), ...Object.keys(b)])];
    const rows = ids.map(id => ({ s: H.staffById(id) || { name: '(removed staff)' }, x: b[id] || { adv: 0, payable: 0, eosb: 0 } })).filter(r => r.x.adv || r.x.payable || r.x.eosb || r.s.status !== 'inactive');
    const t = k => r2(rows.reduce((a, r) => a + r.x[k], 0));
    return { sub: 'From the accounts, as of today', head: ['Staff', 'Advance owed by staff', 'Salary owed to staff', 'Gratuity provision'], rows: rows.map(r => [r.s.name, money(r.x.adv), money(r.x.payable), money(r.x.eosb)]), foot: ['Total', money(t('adv')), money(t('payable')), money(t('eosb'))], note: 'These match the Staff Advances, Salaries Payable and End-of-service Provision accounts. Open a person in the Staff Directory → Accounts for their full statement.' };
  }
  if (rpKind === 'daily') {
    const rows = st.filter(s => (!s.joinDate || s.joinDate <= rpDate) && (!s.endDate || s.endDate >= rpDate)).map(s => { const d = H.dayFor(s, rpDate); return [s.name, d.firstIn != null ? clock(d.firstIn) : '', d.lastOut != null ? clock(d.lastOut) : d.open ? 'in' : '', h(d.grossMin), h(d.outMin), h(d.netMin), d.lateMin || '', d.earlyMin || '', h(d.otMin), d.status, (d.flags.includes('manual') || d.flags.includes('edited') ? 'MANUAL ' : '') + (d.verified ? '✓' : '')]; });
    return { sub: fmtDate(rpDate, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }), head: ['Staff', 'In', 'Out', 'Gross', 'Out time', 'Net', 'Late min', 'Early min', 'OT', 'Status', 'Manual / verified'], rows, num: [false, true, true, true, true, true, true, true, true, false, false], note: '“MANUAL” = punches entered or changed by a manager (see Attendance → Audit log).' };
  }
  const ms = st.filter(s => H.employedIn(s, rpMonth)).map(s => ({ s, m: H.monthFor(s, rpMonth) }));
  const sum = (k, f = x => x) => ms.reduce((a, x) => a + f(x.m.totals[k] || 0), 0);
  if (rpKind === 'monthly') return { sub: H.monthLabel(rpMonth), head: ['Staff', 'Present', 'Half', 'Absent', 'Paid leave', 'Unpaid leave', 'Holidays', 'Off days', 'Hours', 'Manual days', 'To verify'], rows: ms.map(({ s, m }) => { const T = m.totals; return [s.name, T.present, T.half, T.absent, T.leavePaid, T.leaveUnpaid, T.holidays, T.offs, h(T.netMin), T.manual, T.unverified]; }), foot: ['Total', sum('present'), sum('half'), sum('absent'), sum('leavePaid'), sum('leaveUnpaid'), '', '', h(sum('netMin')), sum('manual'), sum('unverified')] };
  if (rpKind === 'lateot') return { sub: H.monthLabel(rpMonth) + ` · grace ${R.graceLate} / ${R.graceEarly} min`, head: ['Staff', 'Late (times)', 'Late (min)', 'Early (times)', 'Early (min)', 'OT normal', 'OT off days', 'OT waiting approval'], rows: ms.map(({ s, m }) => { const T = m.totals; return [s.name, T.lateCount, T.lateMin, T.earlyCount, T.earlyMin, h(T.otMin), h(T.otOffMin), h(T.otPendingMin)]; }), foot: ['Total', sum('lateCount'), sum('lateMin'), sum('earlyCount'), sum('earlyMin'), h(sum('otMin')), h(sum('otOffMin')), h(sum('otPendingMin'))] };
  if (rpKind === 'breaks') { const keys = R.reasons.map(x => x.key); return { sub: H.monthLabel(rpMonth) + ' · hours:minutes out of the shop by reason', head: ['Staff', ...R.reasons.map(x => x.label + (x.paid ? ' (paid)' : '')), 'Total out', 'Over break allowance'], rows: ms.map(({ s, m }) => [s.name, ...keys.map(k => h(m.totals.outBy[k])), h(m.totals.outMin), h(m.totals.excessBreak)]), foot: ['Total', ...keys.map(k => h(ms.reduce((a, x) => a + (x.m.totals.outBy[k] || 0), 0))), h(sum('outMin')), h(sum('excessBreak'))] }; }
  if (rpKind === 'payroll') { const rows = H.preview(rpMonth).filter(r => r.pay), run = H.runOf(rpMonth); const t = k => r2(rows.reduce((a, r) => a + num(r.pay[k]), 0)); return { sub: H.monthLabel(rpMonth) + ' · ' + H.RUN_STATUS[run?.status || 'draft'], head: ['Staff', 'Type', 'Gross', 'Deductions', 'Advance', 'Net', 'Paid'], rows: rows.map(r => [r.staff.name, r.pay.type, money(r.pay.gross), money(r.pay.totalDed), money(r.pay.recoveries.reduce((a, x) => a + x.amount, 0)), money(r.pay.net), r.x?.paid ? r.x.paid.date + ' ' + (H.PAY_METHODS[r.x.paid.method] || '') : '']), foot: ['Total', '', money(t('gross')), money(t('totalDed')), money(rows.reduce((a, r) => a + r.pay.recoveries.reduce((b, x) => b + x.amount, 0), 0)), money(t('net')), ''], num: [false, false, true, true, true, true, false] }; }
  if (rpKind === 'advances') { const list = H.advList().filter(a => a.outstanding > 0); return { sub: 'As of today', head: ['Advance', 'Staff', 'Date', 'Amount', 'Recovered', 'Balance', 'Per month'], rows: list.map(a => [a.no, a.staffName, a.date, money(a.amount), money(a.recovered), money(a.outstanding), money(a.perInst)]), foot: ['Total', '', '', money(list.reduce((s, a) => s + num(a.amount), 0)), money(list.reduce((s, a) => s + a.recovered, 0)), money(list.reduce((s, a) => s + a.outstanding, 0)), ''], num: [false, false, false, true, true, true, true] }; }
  if (rpKind === 'incentives') { const rows = H.preview(rpMonth).filter(r => r.pay); const out = []; rows.forEach(r => [...r.pay.earnings, ...r.pay.deductions].filter(x => /^(incentive|bonus|allowance|fine|deduction):/.test(x.key) || x.key === 'allow').forEach(x => out.push([r.staff.name, x.label, x.note || '', (r.pay.deductions.includes(x) ? '− ' : '') + money(x.amount)]))); return { sub: H.monthLabel(rpMonth), head: ['Staff', 'Item', 'Detail', 'Amount'], rows: out, num: [false, false, false, true] }; }
  if (rpKind === 'history') {
    const s = H.staffById(rpStaff); if (!s) return { head: ['Month'], rows: [] };
    const months = []; let m = rpMonth; for (let i = 0; i < 12; i++) { if (H.employedIn(s, m)) months.push(m); m = H.prevMonth(m); }
    return { sub: s.name + ' · last 12 months', head: ['Month', 'Present', 'Absent', 'Leave', 'Late', 'OT', 'Hours', 'Net pay', 'Paid'], rows: months.map(mm => { const T = H.monthFor(s, mm).totals, x = H.runOf(mm)?.items?.[s.id]; return [H.monthLabel(mm), T.present + (T.half ? ' +' + T.half + '½' : ''), T.absent, T.leavePaid + T.leaveUnpaid, T.lateCount, h(T.otMin + T.otOffMin), h(T.netMin), x?.result ? money(x.result.net) : '', x?.paid ? x.paid.date : '']; }) };
  }
  return { head: [], rows: [] };
}

/* ===================== 📖 Guide ===================== */
export function guideDialog() {
  openModal('HR & Payroll guide', `<div class="hr-guide">
    <h3>For staff</h3><ol><li>Open <b>⏱ My Attendance</b> and press <b>Punch In</b> when you arrive.</li><li>Going out during work? Press <b>Punch Out → Step out</b> and choose why: Lunch/Break, Official errand, Prayer, Personal or Other (write a note). Press <b>Back In</b> when you return.</li><li>Leaving for the day: <b>Punch Out → Out — leaving for the day</b>.</li><li>See your month, leave balance, payslips and advance balance in the tabs. Ask for leave in <b>Leave</b>.</li><li>Forgot a punch? Tell your manager — only managers can correct attendance.</li></ol>
    <h3>Every day (manager)</h3><ol><li><b>Attendance → Today</b> shows who is in, late, out on a break or not in, plus alerts (missing punch-out, repeated lateness, documents expiring, leave requests).</li><li>Staff without the app: <b>Quick entry</b> — tap the person, then In or Out. <b>Mark present for all</b> fills a day in one go; untick or change anyone who was different.</li><li><b>Daily review</b>: open a day to add a missing punch, change or delete one (a reason is always required and the old value is kept), approve overtime or change the status. Then <b>Verify</b>. “Verify all clean entries” verifies days with no problems.</li></ol>
    <h3>Month end</h3><ol><li><b>Attendance → Monthly</b>: fix flagged days (red), verify the rest, then <b>Lock month</b>.</li><li>Add bonuses, incentives, fines in <b>Incentives, Bonus &amp; Allowances</b>; give advances in <b>Salary Advances</b>.</li><li><b>Payroll</b>: pick the month, check each person (add adjustments or change the advance instalment), then approve${H.hrRules().ownerApproval ? ' (the owner approves)' : ''} and <b>Finalize</b>. This locks attendance, freezes payslips and posts the payroll to Accounts.</li><li>Pay salaries, then <b>Record salary payment</b> (cash, bank or wallet). Download payslips for printing or as PDF.</li></ol>
    <h3>Rules you decide</h3><ul><li><b>Shifts &amp; Rules</b>: shift times and break, grace minutes, half-day and absent thresholds, overtime rate and approval, and the <b>late punch-in</b> and <b>early punch-out</b> deductions — none, per minute, a fixed amount each time, or half / full day after N times, with free times per month.</li><li><b>Auto punch-out</b> (Shifts &amp; Rules): anyone still punched In a set time after their shift ends is punched Out at the shift end time; those days are marked “Auto punch-out” for review.</li><li><b>HR Settings</b>: leave types (paid / unpaid, days per year), public holidays, out reasons (paid or not), weekly off, how a monthly salary becomes a day rate, owner approval, own-phone punching, shop terminal with PIN and the location check.</li></ul>
    <h3>Who sees what</h3><ul><li>Owner: everything, approves payroll, settings.</li><li>Manager (and any role you give the HR modules in Users &amp; Roles): attendance, verification, advances, incentives, payroll.</li><li>Staff: only their own punches, attendance, payslips and advance balance.</li><li>Salary data needs the <b>Editor</b> sharing level; give HR modules only to people who should see pay.</li></ul></div>`, [{ label: 'Close' }], { wide: true });
}

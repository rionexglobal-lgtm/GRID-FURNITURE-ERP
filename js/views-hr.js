// GRID Shop Manager — HR & Payroll screens: My Attendance (punch), Attendance, Staff Directory, Shifts & Rules, HR Settings
import { $, esc, num, r2, fmtDate, store, all, byId } from './core.js';
import * as L from './logic.js';
import * as H from './logic-hr.js';
import { STATUS, clock, fmtMin, hm, monthDates, weekday } from './hr-calc.js';
import { money, pill, searchBox, empty, words, hit, toast, fail, openModal, closeModal, confirmBox, val, field, input, select, pickFile, accountOptions } from './ui.js';

const rr = keep => window.__rerender(keep);
const may = (m, a) => L.may(m, a);
const dLong = d => fmtDate(d, { weekday: 'short', day: 'numeric', month: 'short' });
const ST_CLS = { [STATUS.P]: 'paid', [STATUS.H]: 'partial', [STATUS.A]: 'unpaid', [STATUS.L]: 'scheduled', [STATUS.HO]: 'confirmed', [STATUS.WO]: 'confirmed', [STATUS.NA]: '', [STATUS.UP]: '' };
const ST_SHORT = { [STATUS.P]: 'P', [STATUS.H]: '½', [STATUS.A]: 'A', [STATUS.L]: 'L', [STATUS.HO]: 'H', [STATUS.WO]: 'W', [STATUS.NA]: '–', [STATUS.UP]: '·' };
const CAL_CLS = { [STATUS.P]: 'p', [STATUS.H]: 'half', [STATUS.A]: 'a', [STATUS.L]: 'l', [STATUS.HO]: 'ho', [STATUS.WO]: 'wo', [STATUS.NA]: 'na', [STATUS.UP]: 'up' };
export const stPill = s => pill(ST_CLS[s] || 'open', s);
const FLAG = { 'missing-out': 'No punch-out', 'double-in': 'Two Ins', 'out-without-in': 'Out without In', 'long-day': 'Very long day', 'too-short': 'Too short', manual: 'Manual', edited: 'Edited', 'worked-off-day': 'Worked on off day', 'assumed-out': 'Out assumed', 'auto-out': 'Auto punch-out' };
const flagPills = d => d.flags.filter(f => FLAG[f]).map(f => pill(['manual', 'edited', 'worked-off-day', 'auto-out'].includes(f) ? 'scheduled' : 'unpaid', FLAG[f])).join(' ');
export const avatar = (s, size = 36) => s && s.photo ? `<img src="${esc(s.photo)}" alt="" style="width:${size}px;height:${size}px;border-radius:50%;object-fit:cover;flex:none">` : `<span class="hr-av" style="width:${size}px;height:${size}px;font-size:${Math.round(size * 0.38)}px">${esc(String(s?.name || '?').replace(/^Sample – /, '').split(/\s+/).map(w => w[0]).slice(0, 2).join('').toUpperCase())}</span>`;
const staffOpts = (sel, opt = {}) => `${opt.any ? `<option value="">${esc(opt.any)}</option>` : ''}${H.staffList({ all: opt.all }).map(s => `<option value="${s.id}"${s.id === sel ? ' selected' : ''}>${esc(s.name)}${s.status === 'inactive' ? ' (inactive)' : ''}</option>`).join('')}`;
const monthInput = (id, v) => `<input type="month" class="inp" id="${id}" value="${v}" style="width:auto">`;
const reasonBtns = () => H.hrRules().reasons.map(r => `<button type="button" class="hr-big hr-r" data-reason="${esc(r.key)}"><span>${r.key === 'break' ? '🍽' : r.key === 'errand' ? '🧾' : r.key === 'prayer' ? '🕌' : r.key === 'personal' ? '🚶' : '💬'}</span>${esc(r.label)}<small>${r.paid ? 'paid time' : 'not paid'}</small></button>`).join('');

/* ===================== punch dialog (own phone, manager entry, shop terminal) ===================== */
export function punchDialog(s, src = 'self', after) {
  const today = H.shopNow().date, ps = (src === 'self' ? selfPunches(today) : H.dayPunches(s, today));
  const last = [...ps].sort((a, b) => a.t - b.t).pop(), isIn = last && last.type === 'in';
  const title = src === 'self' ? 'Punch' : s.name;
  const body = `<div class="hr-who">${avatar(s, 52)}<div><b style="font-size:18px">${esc(s.name)}</b><div class="muted">${isIn ? 'In since ' + clock(localMin(last.t)) : last ? (last.reason === 'end' ? 'Left at ' : 'Out (' + esc(H.reasonLabel(last.reason)) + ') since ') + clock(localMin(last.t)) : 'Not punched in today'}</div></div></div>
    <div id="pdMain" class="hr-bigs">${isIn
      ? `<button type="button" class="hr-big hr-out" data-p="end"><span>⏹</span>Out — leaving for the day</button><button type="button" class="hr-big" data-p="step"><span>⏸</span>Step out (break, errand…)</button>`
      : `<button type="button" class="hr-big hr-in" data-p="in"><span>▶</span>${last && last.reason !== 'end' ? 'Back In' : 'Punch In'}</button>${src !== 'self' ? '<button type="button" class="hr-big" data-p="errandIn"><span>🧾</span>In, then out on an official errand</button>' : ''}`}</div>
    <div id="pdReasons" class="hr-bigs" hidden>${reasonBtns()}</div>
    <div id="pdNote" hidden>${field('Note (needed for “Other”)', input('pdNoteIn', '', 'placeholder="Where / why"'))}<button type="button" class="btn btn-ink btn-lg" id="pdGo" style="width:100%">Save</button></div>
    <p class="hint" style="margin-top:10px">${src === 'self' ? 'Time is taken from the clock (Dubai time).' : src === 'kiosk' ? 'Shop terminal — time is taken from the clock.' : 'Entered by you for ' + esc(s.name) + ' — your name is recorded with the punch.'}</p>`;
  let reason = null;
  const go = async (type, rsn, note) => {
    try { await H.addPunch(s, { type, reason: rsn, note, src }); if (type === 'in' && rsn === 'errand-after') await H.addPunch(s, { type: 'out', reason: 'errand', note, src }); toast(type === 'in' ? `${s.name.replace(/^Sample – /, '')} — In ✓` : `${s.name.replace(/^Sample – /, '')} — Out ✓`); closeModal(); after && after(); }
    catch (e) { fail(e); }
  };
  openModal(title, body, [{ label: 'Close' }], { onOpen: b => b.addEventListener('click', e => {
    const p = e.target.closest('[data-p]')?.dataset.p;
    if (p === 'in') return go('in');
    if (p === 'end') return go('out', 'end');
    if (p === 'errandIn') { $('pdMain').hidden = true; reason = 'errand-in'; $('pdNote').hidden = false; $('pdNoteIn').focus(); return; }
    if (p === 'step') { $('pdMain').hidden = true; $('pdReasons').hidden = false; return; }
    const r = e.target.closest('[data-reason]')?.dataset.reason;
    if (r) { reason = r; if (r === 'other' || r === 'errand') { $('pdReasons').hidden = true; $('pdNote').hidden = false; $('pdNoteIn').focus(); } else go('out', r); return; }
    if (e.target.id === 'pdGo') { if (reason === 'errand-in') go('in', 'errand-after', val('pdNoteIn')); else go('out', reason, val('pdNoteIn')); }
  }) });
}
const localMin = t => H.localParts(t, H.hrRules().tz).min;
const selfPunches = date => { const p = H.myProfile(); if (!p) return []; const doc = (store.data['hrPunch/' + store.me.id + '/m'] || {})[date.slice(0, 7)]; return ((doc && doc.days || {})[date] || []).filter(x => !x.del).sort((a, b) => a.t - b.t); };

/* ===================== ⏱ My Attendance ===================== */
let myMonth = null, myTab = 'today';
export const punch = {
  title: 'My Attendance', icon: '⏱', roles: ['admin', 'manager', 'billing', 'sales'],
  body() {
    H.watchMine();
    const p = H.myProfile(), now = H.shopNow(); myMonth = myMonth || now.month;
    if (!p) return `<div class="panel" style="max-width:620px">${empty('⏱', 'Your login isn’t linked to a staff profile yet.')}<p class="hint" style="text-align:center">Ask HR to open <b>HR &amp; Payroll → Staff Directory</b>, open your profile and choose your name under “App login”. ${H.hrAccess() ? '<br><a href="#/hrstaff">Open Staff Directory</a>' : ''}</p></div>`;
    if (store.data['hrPunch/' + store.me.id + '/m']) H.autoPunchOut([p]).catch(() => { });
    const R = H.hrRules(), M = H.mine(), sum = M.summary || {};
    if (p.noPunch && myTab === 'today') myTab = 'pay';
    const ps = selfPunches(now.date), last = ps[ps.length - 1], isIn = last && last.type === 'in';
    const month = H.monthFor({ ...p, weeklyOff: p.weeklyOff }, myMonth, { salary: { type: p.salaryType, stdHours: p.stdHours }, leaves: sum.leaves || [], ver: {}, punches: myPunchMap(myMonth) });
    const today = month.rows.find(r => r.date === now.date) || H.monthFor(p, now.month, { salary: { type: p.salaryType, stdHours: p.stdHours }, leaves: sum.leaves || [], ver: {}, punches: myPunchMap(now.month) }).rows.find(r => r.date === now.date);
    const slips = Object.values(M).filter(d => String(d.id).startsWith('ps_')).sort((a, b) => b.month.localeCompare(a.month));
    const tabs = p.noPunch ? [['pay', 'Payslips & advance'], ['leave', 'Leave']] : [['today', 'Today'], ['month', 'My month'], ['leave', 'Leave'], ['pay', 'Payslips & advance']];
    return `${p.noPunch ? '<div class="alert a-info">Your attendance isn’t tracked — no need to punch in or out.</div>' : ''}<div class="tabs">${tabs.map(([k, l]) => `<button data-mt="${k}" class="${k === myTab ? 'active' : ''}">${l}</button>`).join('')}</div>
      ${myTab === 'today' ? `<div class="grid g2" style="align-items:start">
        <div class="panel hr-punch"><div class="hr-who">${avatar(p, 56)}<div><b style="font-size:18px">${esc(p.name)}</b><div class="muted">${esc(p.designation || p.dept || '')} · ${esc(H.shiftOf(p).name)} ${esc(H.shiftOf(p).start)}–${esc(H.shiftOf(p).end)}</div></div></div>
          <div class="hr-clock" id="hrClock">${clock(now.min)}</div><div class="muted" style="text-align:center;margin-top:-6px">${dLong(now.date)} · Dubai time</div>
          <div class="hr-state ${isIn ? 'in' : last ? 'out' : ''}">${isIn ? '● You are IN since ' + clock(localMin(last.t)) : last ? (last.reason === 'end' ? 'You left at ' : 'Out — ' + esc(H.reasonLabel(last.reason)) + ' since ') + clock(localMin(last.t)) : 'Not punched in yet'}</div>
          ${R.punch.self === false ? '<div class="alert a-info">Punching from your own phone is turned off — use the shop terminal or ask your manager.</div>' : `<button class="hr-big ${isIn ? 'hr-out' : 'hr-in'}" data-a="punch" style="width:100%"><span>${isIn ? '⏹' : '▶'}</span>${isIn ? 'Punch Out' : last && last.reason !== 'end' ? 'Back In' : 'Punch In'}</button>`}
        </div>
        <div class="panel"><h2>Today</h2>${ps.length ? `<ul class="tlog">${ps.map(x => `<li><b>${clock(localMin(x.t))}</b> · ${x.type === 'in' ? 'In' : 'Out — ' + esc(H.reasonLabel(x.reason))}${x.note ? ' · ' + esc(x.note) : ''}${x.src === 'auto' ? ' <span class="pill p-scheduled">auto punch-out</span>' : x.src !== 'self' ? ' <span class="pill p-scheduled">entered by ' + esc(L.nm(x.by)) + '</span>' : ''}</li>`).join('')}</ul>` : '<p class="hint">No punches yet today.</p>'}
          ${today ? `<div class="grid hr-k3" style="gap:8px;margin-top:10px"><div class="kpi"><span>Worked</span><b>${fmtMin(today.netMin)}</b></div><div class="kpi"><span>Out time</span><b>${fmtMin(today.outMin)}</b></div><div class="kpi"><span>Late</span><b style="color:${today.lateMin ? 'var(--danger)' : 'inherit'}">${today.lateMin ? today.lateMin + ' min' : '—'}</b></div></div>` : ''}
          ${(sum.advanceBalance || 0) > 0 ? `<p class="hint" style="margin-top:10px">Advance balance: <b>${money(sum.advanceBalance)}</b></p>` : ''}</div></div>` : ''}
      ${myTab === 'month' ? `<div class="toolbar">${monthInput('myM', myMonth)}</div>${monthSummary(month.totals)}${dayTable(month.rows.filter(r => r.status !== STATUS.NA && (r.date <= now.date)).reverse(), false)}<p class="hint" style="margin-top:8px">Your manager checks and verifies attendance before payroll; corrections are made by them.</p>` : ''}
      ${myTab === 'leave' ? `<div class="grid g2" style="align-items:start"><div class="panel"><h2>Ask for leave</h2>
          <div class="row2">${field('Type', select('lrType', R.leaveTypes.map(t => [t.key, t.label + (t.paid ? '' : ' (unpaid)')])))}${field('Half day?', `<select id="lrHalf"><option value="">Full day(s)</option><option value="1">Half day</option></select>`)}</div>
          <div class="row2">${field('From', input('lrFrom', now.date, 'type="date"'))}${field('To', input('lrTo', now.date, 'type="date"'))}</div>${field('Reason', input('lrWhy', '', 'placeholder="e.g. family function"'))}
          <button class="btn btn-ink" data-a="lreq">Send request</button></div>
        <div class="panel"><h2>My leave this year</h2>${(sum.leave || []).length ? `<div class="tw"><table><thead><tr><th>Type</th><th class="num">Allowed</th><th class="num">Used</th><th class="num">Left</th></tr></thead><tbody>${sum.leave.map(b => `<tr><td>${esc(b.label)}</td><td class="num">${b.quota}</td><td class="num">${b.used}</td><td class="num"><b>${b.left}</b></td></tr>`).join('')}</tbody></table></div>` : '<p class="hint">No leave balances set.</p>'}
          <h3 style="margin:14px 0 6px;font-size:14px">My requests</h3>${H.myRequests().map(q => `<div class="list-item"><div><div class="li-t">${esc(H.leaveLabel(q.type))} · ${q.from}${q.to !== q.from ? ' – ' + q.to : ''}${q.half ? ' (half)' : ''}</div><div class="li-s">${esc(q.reason || '')}${q.note ? ' · ' + esc(q.note) : ''}</div></div>${pill(q.status === 'approved' ? 'paid' : q.status === 'rejected' ? 'unpaid' : 'followup', q.status)}</div>`).join('') || '<p class="hint">None yet.</p>'}</div></div>` : ''}
      ${myTab === 'pay' ? `<div class="grid g2" style="align-items:start"><div class="panel"><h2>Payslips</h2>${slips.map(sl => `<div class="list-item click" data-slip="${sl.month}"><div><div class="li-t">${esc(H.monthLabel(sl.month))}</div><div class="li-s">${sl.paid ? 'Paid ' + fmtDate(sl.paid.date) : 'Not paid yet'}</div></div><b>${money(sl.net)}</b></div>`).join('') || '<p class="hint">No payslips yet. They appear here when payroll is finalized.</p>'}</div>
        <div class="panel"><h2>Salary advances</h2>${(sum.advances || []).filter(a => a.outstanding > 0 || true).map(a => `<div class="list-item"><div><div class="li-t">${esc(a.no)} · ${fmtDate(a.date)}</div><div class="li-s">${esc(a.reason)} · ${money(a.perInst)} per month</div></div><div style="text-align:right"><b>${money(a.outstanding)}</b><div class="muted" style="font-size:11px">of ${money(a.amount)}</div></div></div>`).join('') || '<p class="hint">No advances.</p>'}
          ${(sum.advanceBalance || 0) > 0 ? `<p style="margin-top:8px">Balance to repay: <b>${money(sum.advanceBalance)}</b></p>` : ''}</div></div>` : ''}`;
  },
  after() { clearInterval(window.__hrClock); window.__hrClock = setInterval(() => { const c = $('hrClock'); if (!c) return clearInterval(window.__hrClock); c.textContent = clock(H.shopNow().min); }, 15000); },
  bind(root) {
    root.addEventListener('click', async e => {
      const t = e.target.closest('[data-mt]'); if (t) { myTab = t.dataset.mt; return rr(); }
      const a = e.target.closest('[data-a]')?.dataset.a;
      if (a === 'punch') { const p = H.myProfile(); if (p) punchDialog(p, 'self', () => rr()); }
      if (a === 'lreq') { try { await H.requestLeave({ type: val('lrType'), from: val('lrFrom'), to: val('lrTo'), half: !!val('lrHalf'), reason: val('lrWhy') }); toast('Leave request sent.'); } catch (er) { fail(er); } }
      const sl = e.target.closest('[data-slip]'); if (sl) { const d = H.mine()['ps_' + sl.dataset.slip]; if (d) import('./views-hr-pay.js').then(m => m.showPayslip(d)); }
    });
    root.addEventListener('change', e => { if (e.target.id === 'myM' && e.target.value) { myMonth = e.target.value; rr(); } });
  }
};
const myPunchMap = month => { const doc = (store.data['hrPunch/' + store.me.id + '/m'] || {})[month]; return (doc && doc.days) || {}; };
export function monthSummary(T) {
  return `<div class="grid g4" style="gap:10px;margin-bottom:12px"><div class="kpi"><span>Present</span><b>${T.present}${T.half ? ` <small style="display:inline">+${T.half} half</small>` : ''}</b><small>${T.absent} absent · ${T.leavePaid + T.leaveUnpaid} leave</small></div>
    <div class="kpi"><span>Worked</span><b>${fmtMin(T.netMin)}</b><small>hours (net)</small></div><div class="kpi"><span>Late / early</span><b>${T.lateCount} / ${T.earlyCount}</b><small>${T.lateMin} / ${T.earlyMin} min</small></div>
    <div class="kpi"><span>Overtime</span><b>${fmtMin(T.otMin + T.otOffMin)}</b><small>${T.otPendingMin ? fmtMin(T.otPendingMin) + ' waiting approval' : 'hours'}</small></div></div>`;
}
function dayTable(rows, admin, s) {
  if (!rows.length) return empty('📅', 'No days to show.');
  return `<div class="tw"><table><thead><tr><th>Date</th><th>In</th><th>Out</th><th class="num hide-m">Out time</th><th class="num">Worked</th><th class="num hide-m">Late</th><th class="num hide-m">Early</th><th class="num hide-m">OT</th><th>Status</th>${admin ? '<th></th>' : ''}</tr></thead><tbody>
    ${rows.map(d => `<tr${admin ? ` class="click" data-day="${s.id}|${d.date}"` : ''}><td class="nowrap">${dLong(d.date)}</td><td>${d.firstIn != null ? clock(d.firstIn) : '—'}</td><td>${d.lastOut != null ? clock(d.lastOut) : d.open ? '<span class="pill p-paid">in</span>' : '—'}</td><td class="num hide-m">${d.outMin ? fmtMin(d.outMin) : ''}</td><td class="num">${d.netMin ? fmtMin(d.netMin) : ''}</td>
      <td class="num hide-m">${d.lateMin ? `<span style="color:var(--danger)">${d.lateMin}m</span>` : ''}</td><td class="num hide-m">${d.earlyMin ? `<span style="color:var(--danger)">${d.earlyMin}m</span>` : ''}</td><td class="num hide-m">${d.otMin ? fmtMin(d.otMin) : d.otPending ? `<span class="muted">${fmtMin(d.otRaw)}?</span>` : ''}</td>
      <td>${stPill(d.status)}${d.leave ? ' <span class="muted" style="font-size:11px">' + esc(d.leave.label) + '</span>' : ''} ${flagPills(d)}</td>${admin ? `<td>${d.verified ? pill('paid', '✓ Verified') : d.needsCheck && d.date < H.shopNow().date ? pill('followup', 'Pending') : ''}</td>` : ''}</tr>`).join('')}</tbody></table></div>`;
}

/* ===================== 🕒 Attendance (HR) ===================== */
let aTab = 'today', aDate = null, aMonth = null, aStaff = '', aSearch = '';
export const hratt = {
  title: 'Attendance', icon: '🕒', roles: ['admin', 'manager', 'billing'],
  badge: () => { try { return H.pendingRequests().length; } catch (e) { return 0; } },
  head: () => `<button class="btn btn-accent" data-a="quick">👆 Quick entry</button>`,
  body() {
    H.watchHR();
    if (may('hratt', 'add') || may('hratt', 'edit')) H.autoPunchOut(H.staffList()).catch(() => { });
    const now = H.shopNow(); aDate = aDate || now.date; aMonth = aMonth || now.month;
    const staff = H.staffList();
    if (!staff.length) return `<div class="panel">${empty('👥', 'No staff yet.')}<p class="hint" style="text-align:center"><a href="#/hrstaff">Add staff in the Staff Directory</a>${H.isOwner() ? ' or load sample data in <a href="#/hrset">HR Settings</a>' : ''}.</p></div>`;
    const tabs = [['today', 'Today'], ['quick', 'Quick entry'], ['daily', 'Daily review'], ['monthly', 'Monthly'], ['leave', 'Leave' + (H.pendingRequests().length ? ` (${H.pendingRequests().length})` : '')], ['audit', 'Audit log']];
    return `<div class="tabs">${tabs.map(([k, l]) => `<button data-at="${k}" class="${k === aTab ? 'active' : ''}">${l}</button>`).join('')}</div>` + (aTab === 'today' ? todayHTML(now) : aTab === 'quick' ? quickHTML(now) : aTab === 'daily' ? dailyHTML(now) : aTab === 'monthly' ? monthlyHTML(now) : aTab === 'leave' ? leaveHTML(now) : auditHTML());
  },
  bind(root) {
    root.addEventListener('click', async e => {
      const t = e.target.closest('[data-at]'); if (t) { aTab = t.dataset.at; return rr(); }
      const a = e.target.closest('[data-a]')?.dataset.a;
      if (a === 'quick') { aTab = 'quick'; return rr(); }
      if (a === 'allp') return markAllDialog();
      if (a === 'vclean') { try { const n = await H.verifyClean(aStaff ? [aStaff] : H.staffList().map(s => s.id), aTab === 'daily' ? aDate.slice(0, 7) : aMonth); toast(n ? `${n} day(s) verified.` : 'Nothing clean left to verify — open flagged days to fix them.'); } catch (er) { fail(er); } return; }
      if (a === 'vday') { const ids = H.staffList().filter(s => { const d = H.dayFor(s, aDate); return d && d.needsCheck && !d.verified && !d.flags.some(f => ['double-in', 'out-without-in', 'missing-out', 'long-day'].includes(f)); }).map(s => s.id); try { for (const id of ids) await H.verifyDays(id, [aDate], { verified: true }); toast(`${ids.length} verified.`); } catch (er) { fail(er); } return; }
      if (a === 'lock' || a === 'unlock') { if (await confirmBox(a === 'lock' ? 'Lock ' + H.monthLabel(aMonth) + '?' : 'Unlock ' + H.monthLabel(aMonth) + '?', a === 'lock' ? 'Locked attendance can’t be changed and is ready for payroll.' : 'Attendance can be changed again. Payroll that is not finalized will recalculate.', a === 'lock' ? 'Lock month' : 'Unlock', a !== 'lock')) { try { await H.lockMonth(aMonth, a === 'lock'); toast(a === 'lock' ? 'Month locked.' : 'Month unlocked.'); } catch (er) { fail(er); } } return; }
      if (a === 'addleave') return leaveDialog();
      const q = e.target.closest('[data-quick]'); if (q) { const s = H.staffById(q.dataset.quick); if (!s) return; if (H.hrRules().punch.pin && aTab === 'quick' && s.pinHash && !may('hratt', 'edit')) return pinDialog(s); return punchDialog(s, 'manager', () => rr()); }
      const k = e.target.closest('[data-kiosk]'); if (k) return kioskDialog();
      const d = e.target.closest('[data-day]'); if (d) { const [sid, date] = d.dataset.day.split('|'); return dayDialog(H.staffById(sid), date); }
      const ap = e.target.closest('[data-lapp]'); if (ap) { const r = H.pendingRequests().find(x => x.path === ap.dataset.lapp); if (r) leaveDialog({ staffId: r.staff.id, type: r.type, from: r.from, to: r.to, half: r.half, reason: r.reason, reqPath: r.path }); return; }
      const rj = e.target.closest('[data-lrej]'); if (rj) { openModal('Reject leave request', field('Reason (shown to the staff member)', input('rjWhy')), [{ label: 'Cancel' }, { label: 'Reject', cls: 'btn-danger', onClick: async () => { await H.rejectRequest(rj.dataset.lrej, val('rjWhy')); toast('Request rejected.'); } }]); return; }
      const lc = e.target.closest('[data-lcan]'); if (lc) { const l = byId('hrLeave', lc.dataset.lcan); openModal('Cancel leave', field('Reason', input('lcWhy')), [{ label: 'Back' }, { label: 'Cancel leave', cls: 'btn-danger', onClick: async () => { if (!val('lcWhy')) throw Error('Give a reason.'); await H.cancelLeave(l, val('lcWhy')); toast('Leave cancelled.'); } }]); return; }
    });
    root.addEventListener('change', e => {
      const id = e.target.id;
      if (id === 'atDate') { aDate = e.target.value || aDate; rr(); }
      if (id === 'atMonth') { aMonth = e.target.value || aMonth; rr(); }
      if (id === 'atStaff') { aStaff = e.target.value; rr(); }
    });
    root.addEventListener('input', e => { if (e.target.id === 'atS') { aSearch = e.target.value; rr(true); } });
  },
  keep: ['atS']
};
// compact “who is in today” panel for the Dashboard
export function todayPanel() {
  if (!H.hrAccess() || !H.allowedView('hratt')) return '';
  H.watchHR();
  const now = H.shopNow(), B = H.todayBoard(), rows = [...B.present, ...B.absent, ...B.notIn, ...B.leave, ...B.off];
  const st = d => d.open ? pill('paid', 'In') : d.onBreak ? pill('followup', 'Out · ' + H.reasonLabel(d.onBreak)) : d.lastOut != null ? pill('confirmed', 'Left ' + clock(d.lastOut)) : d.status === STATUS.L ? pill('scheduled', d.leave?.label || 'Leave') : [STATUS.WO, STATUS.HO].includes(d.status) ? pill('confirmed', d.status === STATUS.HO ? 'Holiday' : 'Weekly off') : pill('unpaid', 'Not in');
  const absentIds = new Set(B.absent.map(x => x.s.id)), chip = (n, l, c) => n ? `<span class="pill ${c}" style="font-size:12px">${n} ${l}</span>` : '';
  return `<div class="panel" style="margin-bottom:16px" id="dAtt"><div class="panel-h"><h2>🕒 Staff attendance · today</h2><a class="btn btn-sm" href="#/hratt">Open Attendance</a></div>
    <div style="display:flex;gap:6px;flex-wrap:wrap;align-items:center;margin:-2px 0 10px">${rows.length ? `<b style="margin-right:4px">${B.present.length} of ${rows.length - B.off.length - B.leave.length} present</b>` : ''}${chip(B.present.filter(x => x.d.open).length, 'in now', 'p-paid')}${chip(B.left.length, 'left', 'p-confirmed')}${chip(B.onBreak.length, 'on break / out', 'p-followup')}${chip(B.late.length, 'late', B.late.length ? 'p-unpaid' : 'p-confirmed')}${chip(B.absent.length, 'absent', B.absent.length ? 'p-unpaid' : 'p-confirmed')}${chip(B.notIn.length, 'shift not started', 'p-confirmed')}${chip(B.leave.length, 'on leave', 'p-scheduled')}${chip(B.off.length, 'off', 'p-confirmed')}</div>
    ${rows.length ? `<div class="tw"><table><thead><tr><th>Staff</th><th>Status</th><th>First in</th><th class="hide-m">Shift</th><th class="num">Worked</th></tr></thead><tbody>${rows.map(({ s, d }) => { const sh = H.shiftOf(s); return `<tr class="click" data-go="#/hratt"><td><span style="display:flex;gap:8px;align-items:center">${avatar(s, 28)}<span><b>${esc(s.name)}</b><div class="muted" style="font-size:11px">${esc(s.designation || s.dept || '')}</div></span></span></td>
      <td>${absentIds.has(s.id) ? pill('unpaid', 'Absent') : st(d)}</td><td class="nowrap">${d.firstIn != null ? clock(d.firstIn) : '—'}${d.lateMin ? ` <span class="pill p-unpaid">${d.lateMin}m late</span>` : ''}</td><td class="hide-m nowrap muted" style="font-size:12px">${esc(sh.start)}–${esc(sh.end)}</td><td class="num">${d.netMin ? fmtMin(d.netMin) : ''}</td></tr>`; }).join('')}</tbody></table></div>` : `<p class="hint">No staff set up yet. Add them in HR &amp; Payroll → Staff Directory.</p>`}
    <p class="hint" style="margin-top:8px">As of ${clock(now.min)} · ${fmtDate(now.date, { weekday: 'short', day: 'numeric', month: 'short' })}. “Absent” = no punch after shift start + grace time. Owners and “no punching” staff aren't listed.</p></div>`;
}
function todayHTML(now) {
  const B = H.todayBoard(), al = H.alerts();
  const unver = H.staffList().reduce((s, st) => s + (H.employedIn(st, H.prevMonth(now.month)) && !H.isLocked(st.id, H.prevMonth(now.month)) ? H.monthFor(st, H.prevMonth(now.month)).totals.unverified : 0) + H.monthFor(st, now.month).totals.unverified, 0);
  const row = ({ s, d }) => `<tr class="click" data-day="${s.id}|${now.date}"><td><span style="display:flex;gap:8px;align-items:center">${avatar(s, 30)}<span><b>${esc(s.name)}</b><div class="muted" style="font-size:11px">${esc(s.dept)}</div></span></span></td>
    <td>${d.firstIn != null ? clock(d.firstIn) : '—'}${d.lateMin ? ` <span class="pill p-unpaid">${d.lateMin}m late</span>` : ''}</td><td>${d.open ? pill('paid', 'In') : d.onBreak ? pill('followup', 'Out · ' + H.reasonLabel(d.onBreak)) : d.lastOut != null ? 'Left ' + clock(d.lastOut) : d.status === STATUS.L ? pill('scheduled', d.leave?.label || 'Leave') : [STATUS.WO, STATUS.HO].includes(d.status) ? pill('confirmed', d.status) : pill('unpaid', 'Not in')}</td>
    <td class="num">${d.netMin ? fmtMin(d.netMin) : ''}</td><td style="text-align:right"><button class="btn btn-sm" data-quick="${s.id}">Punch</button></td></tr>`;
  const all_ = [...B.present, ...B.absent, ...B.notIn, ...B.leave, ...B.off];
  return `<div class="grid g4" style="margin-bottom:14px"><div class="kpi"><span>Present</span><b style="color:var(--ok)">${B.present.length}</b><small>${B.present.filter(x => x.d.open).length} in now · ${B.left.length} left</small></div>
      <div class="kpi"><span>Late today</span><b style="color:${B.late.length ? 'var(--danger)' : 'inherit'}">${B.late.length}</b><small>after the grace period</small></div>
      <div class="kpi"><span>Not in / absent</span><b style="color:${B.absent.length ? 'var(--warn)' : 'inherit'}">${B.absent.length}</b><small>${B.notIn.length} shift not started · ${B.leave.length} leave · ${B.off.length} off</small></div>
      <div class="kpi click" data-at="daily"><span>On break / out</span><b>${B.onBreak.length}</b><small>${unver} day(s) waiting verification</small></div></div>
    ${al.length ? `<div class="panel" style="margin-bottom:14px"><h2>⚠️ Alerts <span class="pill p-unpaid">${al.length}</span></h2>${al.slice(0, 12).map(x => `<div class="list-item${x.date ? ' click' : ''}"${x.date ? ` data-day="${x.s.id}|${x.date}"` : ''}><span>${esc(x.text)}</span>${pill(x.kind === 'missing' || x.kind === 'late' ? 'unpaid' : x.kind === 'leave' ? 'followup' : 'scheduled', { missing: 'Missing punch', unverified: 'Verify', late: 'Lateness', doc: 'Document', leave: 'Leave request' }[x.kind])}</div>`).join('')}${al.length > 12 ? `<p class="hint">+${al.length - 12} more</p>` : ''}</div>` : ''}
    <div class="tw"><table><thead><tr><th>Staff</th><th>First in</th><th>Now</th><th class="num">Worked</th><th></th></tr></thead><tbody>${all_.map(row).join('')}</tbody></table></div>`;
}
function quickHTML(now) {
  const B = H.todayBoard(), st = {}; [...B.present, ...B.absent, ...B.notIn, ...B.leave, ...B.off].forEach(x => st[x.s.id] = x.d);
  const w = words(aSearch);
  return `<div class="toolbar">${searchBox('atS', 'Find staff…')}${may('hratt', 'add') ? '<button class="btn" data-a="allp">✅ Mark present for all…</button>' : ''}${H.hrRules().punch.pin ? '<button class="btn btn-ink" data-kiosk="1">🖥 Shop terminal (PIN)</button>' : ''}</div>
    <p class="hint" style="margin:-4px 0 10px">Tap a person, then tap In or Out. Use this for staff who don’t use the app. Every entry records your name.</p>
    <div class="hr-cards">${H.tracked().filter(s => hit(s.name + ' ' + s.dept + ' ' + s.empNo, w)).map(s => { const d = st[s.id]; return `<button class="hr-card${d && d.open ? ' in' : ''}" data-quick="${s.id}">${avatar(s, 56)}<b>${esc(s.name.replace(/^Sample – /, ''))}</b><small>${d ? d.open ? '● In since ' + clock(d.firstIn) : d.onBreak ? 'Out · ' + esc(H.reasonLabel(d.onBreak)) : d.lastOut != null ? 'Left ' + clock(d.lastOut) : d.status === STATUS.L ? 'On leave' : [STATUS.WO, STATUS.HO].includes(d.status) ? d.status : 'Not in' : ''}</small></button>`; }).join('')}</div>`;
}
function dailyHTML(now) {
  const rows = H.tracked({ all: true }).filter(s => (!s.joinDate || s.joinDate <= aDate) && (!s.endDate || s.endDate >= aDate)).map(s => ({ s, d: H.dayFor(s, aDate) }));
  return `<div class="toolbar"><input type="date" class="inp" id="atDate" value="${aDate}" style="width:auto" max="${now.date}">${may('hratt', 'edit') ? '<button class="btn" data-a="vday">✓ Verify all clean entries for this day</button>' : ''}</div>
    <div class="tw"><table><thead><tr><th>Staff</th><th>In</th><th>Out</th><th class="num hide-m">Gross</th><th class="num hide-m">Out time</th><th class="num">Net</th><th class="num hide-m">Late</th><th class="num hide-m">Early</th><th class="num hide-m">OT</th><th>Status</th><th></th></tr></thead><tbody>
    ${rows.map(({ s, d }) => `<tr class="click" data-day="${s.id}|${aDate}"><td><b>${esc(s.name)}</b></td><td>${d.firstIn != null ? clock(d.firstIn) : '—'}</td><td>${d.lastOut != null ? clock(d.lastOut) : d.open ? pill('paid', 'in') : '—'}</td><td class="num hide-m">${d.grossMin ? fmtMin(d.grossMin) : ''}</td><td class="num hide-m">${d.outMin ? fmtMin(d.outMin) : ''}</td><td class="num">${d.netMin ? fmtMin(d.netMin) : ''}</td>
      <td class="num hide-m">${d.lateMin || ''}</td><td class="num hide-m">${d.earlyMin || ''}</td><td class="num hide-m">${d.otMin ? fmtMin(d.otMin) : d.otPending ? fmtMin(d.otRaw) + '?' : ''}</td><td>${stPill(d.status)} ${flagPills(d)}</td><td>${d.verified ? pill('paid', '✓') : d.needsCheck && aDate < now.date ? pill('followup', 'Pending') : ''}${H.isLocked(s.id, aDate.slice(0, 7)) ? ' 🔒' : ''}</td></tr>`).join('')}</tbody></table></div>
    <p class="hint" style="margin-top:8px">Click a row to see every punch, fix mistakes (a reason is required), approve overtime or change the day’s status, then verify. Verified days feed payroll.</p>`;
}
function monthlyHTML(now) {
  const days = monthDates(aMonth), list = H.staffList({ all: true }).filter(s => H.employedIn(s, aMonth) && (!aStaff || s.id === aStaff));
  const locked = list.length && list.every(s => H.isLocked(s.id, aMonth));
  const res = list.map(s => ({ s, m: H.monthFor(s, aMonth) }));
  const unv = res.reduce((x, r) => x + r.m.totals.unverified, 0);
  return `<div class="toolbar">${monthInput('atMonth', aMonth)}<select class="inp" id="atStaff" style="width:auto">${staffOpts(aStaff, { any: 'All staff', all: true })}</select>
      ${may('hratt', 'edit') && !locked ? '<button class="btn" data-a="vclean">✓ Verify all clean days</button>' : ''}${locked ? (H.isOwner() ? '<button class="btn btn-danger" data-a="unlock">🔓 Unlock month</button>' : '') : may('hratt', 'edit') && aMonth < now.month ? '<button class="btn btn-ink" data-a="lock">🔒 Lock month</button>' : ''}
      <span class="hint">${locked ? '🔒 Locked' : unv ? `<b>${unv}</b> day(s) still to verify` : 'All days verified'}</span></div>
    <div class="tw hr-cal-wrap"><table class="hr-cal"><thead><tr><th class="hr-cal-n">Staff</th>${days.map(d => `<th class="${[5, 6].includes(weekday(d)) ? 'we' : ''}">${+d.slice(8)}<div>${'SMTWTFS'[weekday(d)]}</div></th>`).join('')}<th>P</th><th>½</th><th>A</th><th>L</th><th>Late</th><th>OT</th><th>Hours</th></tr></thead><tbody>
    ${res.map(({ s, m }) => `<tr><td class="hr-cal-n"><b>${esc(s.name)}</b></td>${m.rows.map(d => `<td class="c-${CAL_CLS[d.status] || 'na'}${d.verified ? ' v' : ''}${d.flags.some(f => ['missing-out', 'double-in', 'out-without-in', 'long-day'].includes(f)) ? ' f' : ''}${d.flags.includes('manual') || d.flags.includes('edited') ? ' m' : ''}" data-day="${s.id}|${d.date}" title="${esc(d.date + ' · ' + d.status + (d.netMin ? ' · ' + fmtMin(d.netMin) : '') + (d.lateMin ? ' · late ' + d.lateMin + 'm' : '') + (d.verified ? ' · verified' : ''))}">${ST_SHORT[d.status] || ''}</td>`).join('')}
      <td class="num">${m.totals.present}</td><td class="num">${m.totals.half}</td><td class="num">${m.totals.absent}</td><td class="num">${m.totals.leavePaid + m.totals.leaveUnpaid}</td><td class="num">${m.totals.lateCount}</td><td class="num">${fmtMin(m.totals.otMin + m.totals.otOffMin)}</td><td class="num">${fmtMin(m.totals.netMin)}</td></tr>`).join('')}</tbody></table></div>
    <p class="hint" style="margin-top:8px">P present · ½ half-day · A absent · L leave · H holiday · W weekly off. <span class="hr-key v">verified</span> <span class="hr-key f">needs fixing</span> <span class="hr-key m">entered / edited by hand</span>. Click any day to open it.</p>`;
}
function leaveHTML(now) {
  const req = H.pendingRequests(), yr = now.date.slice(0, 4);
  const leaves = all('hrLeave').filter(l => l.status === 'approved' && l.to >= now.date.slice(0, 7) + '-01' || l.status === 'approved' && l.from >= H.prevMonth(now.month)).sort((a, b) => b.from.localeCompare(a.from));
  const R = H.hrRules(), types = R.leaveTypes.filter(t => num(t.quota) > 0);
  return `${req.length ? `<div class="panel" style="margin-bottom:14px"><h2>📨 Requests waiting <span class="pill p-followup">${req.length}</span></h2>${req.map(r => `<div class="list-item"><div><div class="li-t">${esc(r.staff.name)} · ${esc(H.leaveLabel(r.type))}</div><div class="li-s">${r.from}${r.to !== r.from ? ' – ' + r.to : ''}${r.half ? ' (half day)' : ''} · ${esc(r.reason || '')}</div></div><div style="display:flex;gap:6px">${may('hratt', 'add') ? `<button class="btn btn-sm btn-ok" data-lapp="${esc(r.path)}">Approve…</button><button class="btn btn-sm btn-danger" data-lrej="${esc(r.path)}">Reject</button>` : ''}</div></div>`).join('')}</div>` : ''}
    <div class="grid g2" style="align-items:start"><div class="panel"><div class="panel-h"><h2>Leave</h2>${may('hratt', 'add') ? '<button class="btn btn-sm btn-accent" data-a="addleave">＋ Add leave</button>' : ''}</div>
      ${leaves.map(l => { const s = H.staffById(l.staffId); return `<div class="list-item"><div><div class="li-t">${esc(s?.name || '?')} · ${esc(H.leaveLabel(l.type))} ${l.paid ? pill('paid', 'paid') : pill('unpaid', 'unpaid')}</div><div class="li-s">${l.from}${l.to !== l.from ? ' – ' + l.to : ''}${l.half ? ' (half day)' : ''} · ${l.days} day(s) · ${esc(l.reason || '')}</div></div>${may('hratt', 'edit') ? `<button class="icon-btn" data-lcan="${l.id}" title="Cancel">✕</button>` : ''}</div>`; }).join('') || '<p class="hint">No leave this month.</p>'}</div>
      <div class="panel"><h2>Balances ${yr}</h2>${types.length ? `<div class="tw"><table><thead><tr><th>Staff</th>${types.map(t => `<th class="num">${esc(t.label)}</th>`).join('')}</tr></thead><tbody>${H.staffList().map(s => { const b = H.leaveBalance(s, yr); return `<tr><td>${esc(s.name)}</td>${types.map(t => { const x = b.find(y => y.key === t.key); return `<td class="num"><b>${x.left}</b><span class="muted" style="font-size:11px"> / ${x.quota}</span></td>`; }).join('')}</tr>`; }).join('')}</tbody></table></div>` : '<p class="hint">Set yearly allowances for leave types in HR Settings.</p>'}</div></div>`;
}
function auditHTML() {
  aMonth = aMonth || H.shopNow().month;
  const out = [];
  for (const s of H.staffList({ all: true })) { const pm = H.punchesByDate(s, aMonth); for (const [d, list] of Object.entries(pm)) list.forEach(p => { if (p.src !== 'self' || (p.hist || []).length) out.push({ s, d, p }); }); }
  for (const v of all('hrDays').filter(x => x.month === aMonth)) for (const [d, x] of Object.entries(v.days || {})) (x.log || []).forEach(l => out.push({ s: H.staffById(v.staffId), d, log: l }));
  out.sort((a, b) => ((b.p ? (b.p.hist || []).slice(-1)[0]?.at || b.p.at : b.log.at) || 0) - ((a.p ? (a.p.hist || []).slice(-1)[0]?.at || a.p.at : a.log.at) || 0));
  return `<div class="toolbar">${monthInput('atMonth', aMonth)}<span class="hint">Every punch entered or changed by someone other than the person, and every correction made while verifying.</span></div>
    <div class="tw"><table><thead><tr><th>When</th><th>Staff</th><th>Day</th><th>What</th><th>By</th><th>Reason</th></tr></thead><tbody>
    ${out.map(x => x.p ? `<tr class="click" data-day="${x.s.id}|${x.d}"><td class="nowrap">${fmtDate(H.localParts((x.p.hist || []).slice(-1)[0]?.at || x.p.at, H.hrRules().tz).date)} ${clock(localMin((x.p.hist || []).slice(-1)[0]?.at || x.p.at))}</td><td>${esc(x.s.name)}</td><td>${x.d}</td>
      <td>${x.p.del ? '<s>' : ''}${x.p.type === 'in' ? 'In' : 'Out · ' + esc(H.reasonLabel(x.p.reason))} ${clock(localMin(x.p.t))}${x.p.del ? '</s> deleted' : ''}${(x.p.hist || []).length ? `<div class="muted" style="font-size:11px">was: ${x.p.hist.map(h => (h.type === 'in' ? 'In' : 'Out') + ' ' + clock(localMin(h.t)) + (h.del ? ' (deleted)' : '')).join(' → ')}</div>` : ''} ${pill('scheduled', x.p.src === 'kiosk' ? 'terminal' : (x.p.hist || []).length ? 'edited' : 'manual')}</td>
      <td>${esc(L.nm((x.p.hist || []).slice(-1)[0]?.by || x.p.by))}</td><td>${esc((x.p.hist || []).slice(-1)[0]?.why || x.p.why || '')}</td></tr>`
      : `<tr class="click" data-day="${x.s?.id}|${x.d}"><td class="nowrap">${fmtDate(H.localParts(x.log.at, H.hrRules().tz).date)} ${clock(localMin(x.log.at))}</td><td>${esc(x.s?.name || '')}</td><td>${x.d}</td><td>${esc(x.log.text.split(' — ')[0])} ${pill('followup', 'correction')}</td><td>${esc(L.nm(x.log.by))}</td><td>${esc(x.log.text.split(' — ').slice(1).join(' — '))}</td></tr>`).join('') || `<tr><td colspan="6">${empty('🧾', 'No manual entries or corrections this month.')}</td></tr>`}</tbody></table></div>`;
}

/* ---------- one person, one day: punches, corrections, verification ---------- */
export function dayDialog(s, date) {
  if (!s) return;
  const d = H.dayFor(s, date), ps = (H.punchesByDate(s, date.slice(0, 7))[date] || []), locked = H.isLocked(s.id, date.slice(0, 7)), ed = may('hratt', 'edit') && !locked;
  const R = H.hrRules(), sh = H.shiftOf(s), v = (H.verOf(s.id, date.slice(0, 7)).days || {})[date] || {};
  const body = `<div class="li-s" style="margin:-4px 0 10px">${stPill(d.status)} ${flagPills(d)} <span>${esc(sh.name)} ${sh.start}–${sh.end}</span>${locked ? ' 🔒 month locked' : ''}</div>
    <div class="grid g4" style="gap:8px;margin-bottom:12px"><div class="kpi"><span>In → Out</span><b style="font-size:17px">${d.firstIn != null ? clock(d.firstIn) : '—'} → ${d.lastOut != null ? clock(d.lastOut) : d.open ? 'now' : '—'}</b></div><div class="kpi"><span>Net worked</span><b style="font-size:17px">${fmtMin(d.netMin)}</b><small>gross ${fmtMin(d.grossMin)}${d.assumedBreak ? ' · break ' + d.assumedBreak + 'm taken off' : ''}</small></div>
      <div class="kpi"><span>Out time</span><b style="font-size:17px">${fmtMin(d.outMin)}</b><small>${Object.entries(d.outBy).map(([k, m]) => esc(H.reasonLabel(k)) + ' ' + m + 'm').join(' · ') || '—'}</small></div><div class="kpi"><span>Late / early / OT</span><b style="font-size:17px">${d.lateMin}m / ${d.earlyMin}m / ${fmtMin(d.otMin)}</b>${d.otPending ? `<small>${fmtMin(d.otRaw)} OT waiting approval</small>` : ''}</div></div>
    <h3 style="margin:0 0 6px;font-size:14px">Punches</h3>
    <div class="tw"><table><thead><tr><th>Time</th><th>In / Out</th><th>Reason / note</th><th>Entered</th>${ed ? '<th></th>' : ''}</tr></thead><tbody>${ps.map(p => `<tr${p.del ? ' style="opacity:.5"' : ''}><td>${p.del ? '<s>' : ''}${clock(localMin(p.t))}${p.del ? '</s>' : ''}</td><td>${p.type === 'in' ? pill('paid', 'In') : pill('followup', 'Out')}</td><td>${p.type === 'out' ? esc(H.reasonLabel(p.reason)) : ''}${p.note ? ' · ' + esc(p.note) : ''}${p.loc ? ` <span class="muted" style="font-size:11px">${p.loc.err ? '📍 no location' : '📍 ' + (p.loc.dist != null ? p.loc.dist + ' m from shop' : 'recorded')}</span>` : ''}</td>
      <td style="font-size:12px">${p.src === 'self' ? 'own phone' : p.src === 'kiosk' ? 'shop terminal' : p.src === 'auto' ? 'auto punch-out' + (p.by ? ' (saved from ' + esc(L.nm(p.by)) + '’s screen)' : '') : 'by ' + esc(L.nm(p.by))}${p.why ? `<div class="muted">${esc(p.why)}</div>` : ''}${(p.hist || []).map(h => `<div class="muted">changed by ${esc(L.nm(h.by))}: ${esc(h.why)} (was ${h.type === 'in' ? 'In' : 'Out'} ${clock(localMin(h.t))}${h.del ? ', deleted' : ''})</div>`).join('')}</td>
      ${ed ? `<td class="nowrap">${p.del ? `<button class="btn btn-sm" data-pr="${p.id}">Restore</button>` : `<button class="icon-btn" data-pe="${p.id}" title="Change">✎</button><button class="icon-btn" data-pd="${p.id}" title="Delete">🗑</button>`}</td>` : ''}</tr>`).join('') || `<tr><td colspan="5" class="muted">No punches.</td></tr>`}</tbody></table></div>
    ${ed ? `<details class="hr-det" style="margin-top:10px"><summary>＋ Add a missing punch</summary><div class="row3" style="margin-top:8px">${field('Time', input('dpT', '', 'type="time"'))}${field('In / Out', `<select id="dpType"><option value="in">In</option><option value="out">Out</option></select>`)}${field('Out reason', `<select id="dpR"><option value="end">Left for the day</option>${R.reasons.map(r => `<option value="${r.key}">${esc(r.label)}</option>`).join('')}</select>`)}</div>${field('Why are you adding it? (required)', input('dpWhy', '', 'placeholder="e.g. forgot to punch out, confirmed with supervisor"'))}<button class="btn btn-ink btn-sm" data-a="dpAdd">Add punch</button></details>
      <details class="hr-det"><summary>Status, overtime &amp; verification</summary><div class="row2" style="margin-top:8px">${field('Day status', `<select id="dvSt"><option value="">As punched (${esc(d.status)})</option>${[STATUS.P, STATUS.H, STATUS.A, STATUS.HO, STATUS.WO].map(x => `<option${v.override === x ? ' selected' : ''}>${x}</option>`).join('')}</select>`)}${field('Approved overtime (h:mm)', input('dvOt', v.otApproved != null ? fmtMin(v.otApproved) : '', `placeholder="${fmtMin(d.otRaw)} as punched"`))}</div>${field('Reason for the change (required)', input('dvWhy'))}<button class="btn btn-sm" data-a="dvSave">Save correction</button></details>` : ''}
    ${(v.log || []).length ? `<h3 style="margin:12px 0 6px;font-size:14px">Corrections</h3><ul class="tlog">${v.log.map(l => `<li>${esc(L.nm(l.by))}: ${esc(l.text)}</li>`).join('')}</ul>` : ''}`;
  const acts = [{ label: 'Close' }];
  if (ed) acts.unshift(v.verified ? { label: 'Mark unverified', onClick: async () => { await H.verifyDays(s.id, [date], { verified: false }); toast('Marked unverified.'); } } : { label: '✓ Verify day', cls: 'btn-ok', onClick: async () => { if (d.flags.includes('missing-out') && !await confirmBox('No punch-out', 'This day has no punch-out, so the time after the last In isn’t counted. Verify anyway?', 'Verify')) return false; await H.verifyDays(s.id, [date], { verified: true }); toast('Day verified.'); } });
  openModal(`${s.name} · ${dLong(date)}`, body, acts, { wide: true, onOpen: b => b.addEventListener('click', async e => {
    const again = () => setTimeout(() => dayDialog(H.staffById(s.id), date), 250);
    const a = e.target.closest('[data-a]')?.dataset.a;
    try {
      if (a === 'dpAdd') { if (!val('dpT')) throw Error('Enter the time.'); await H.addPunch(s, { type: val('dpType'), reason: val('dpType') === 'out' ? val('dpR') : '', time: val('dpT'), date, src: 'manager', why: val('dpWhy') }); toast('Punch added.'); again(); }
      if (a === 'dvSave') { const ot = val('dvOt'); let otm; if (ot) { const m = /^(\d+):(\d{2})$/.exec(ot) || /^(\d+)$/.exec(ot); if (!m) throw Error('Overtime as h:mm, e.g. 1:30'); otm = m[2] != null ? +m[1] * 60 + +m[2] : +m[1] * 60; } await H.verifyDays(s.id, [date], { override: val('dvSt'), otApproved: ot ? otm : null, note: val('dvWhy') }); toast('Correction saved.'); again(); }
      const pe = e.target.closest('[data-pe]'); if (pe) { const p = ps.find(x => x.id === pe.dataset.pe); editPunchDialog(s, date, p, again); }
      const pd = e.target.closest('[data-pd]'); if (pd) { openModal('Delete punch', field('Why? (required)', input('pdWhy')), [{ label: 'Cancel', onClick: () => { again(); } }, { label: 'Delete', cls: 'btn-danger', onClick: async () => { await H.editPunch(s, date, pd.dataset.pd, { delete: true }, val('pdWhy')); toast('Punch deleted (kept in history).'); again(); } }]); }
      const pr = e.target.closest('[data-pr]'); if (pr) { openModal('Restore punch', field('Why? (required)', input('pdWhy')), [{ label: 'Cancel', onClick: () => { again(); } }, { label: 'Restore', cls: 'btn-ok', onClick: async () => { await H.editPunch(s, date, pr.dataset.pr, { restore: true }, val('pdWhy')); toast('Restored.'); again(); } }]); }
    } catch (er) { fail(er); }
  }) });
}
function editPunchDialog(s, date, p, again) {
  const R = H.hrRules();
  openModal('Change punch', `<div class="row3">${field('Time', input('epT', clock(localMin(p.t)), 'type="time"'))}${field('In / Out', `<select id="epType"><option value="in"${p.type === 'in' ? ' selected' : ''}>In</option><option value="out"${p.type === 'out' ? ' selected' : ''}>Out</option></select>`)}${field('Out reason', `<select id="epR"><option value="end">Left for the day</option>${R.reasons.map(r => `<option value="${r.key}"${p.reason === r.key ? ' selected' : ''}>${esc(r.label)}</option>`).join('')}</select>`)}</div>${field('Note', input('epN', p.note || ''))}${field('Why are you changing it? (required)', input('epWhy'))}`,
    [{ label: 'Cancel', onClick: () => { again(); } }, { label: 'Save', cls: 'btn-ink', onClick: async () => { await H.editPunch(s, date, p.id, { time: val('epT'), type: val('epType'), reason: val('epR'), note: val('epN') }, val('epWhy')); toast('Punch changed — the old time is kept in history.'); again(); } }]);
}
function markAllDialog() {
  const now = H.shopNow(), list = H.tracked();
  const draw = date => list.filter(s => !s.joinDate || s.joinDate <= date).map(s => { const d = H.dayFor(s, date), sh = H.shiftOf(s), has = d.punches > 0, skip = has || d.status === STATUS.L || d.status === STATUS.WO || d.status === STATUS.HO;
    return `<tr><td><input type="checkbox" data-mp="${s.id}"${skip ? '' : ' checked'}${has ? ' disabled' : ''}></td><td><b>${esc(s.name)}</b>${has ? ' <span class="muted">already punched</span>' : d.status === STATUS.L || d.status === STATUS.WO || d.status === STATUS.HO ? ` <span class="muted">${esc(d.status)}</span>` : ''}</td><td><input type="time" class="inp inp-sm" data-mi="${s.id}" value="${sh.start}"></td><td><input type="time" class="inp inp-sm" data-mo="${s.id}" value="${date === now.date && hm(sh.end) > now.min ? '' : sh.end}" placeholder="still in"></td></tr>`; }).join('');
  openModal('Mark present for all', `<div class="row2">${field('Date', input('mpD', now.date, `type="date" max="${now.date}"`))}${field('Reason (recorded with every entry)', input('mpWhy', 'Marked present by manager'))}</div>
    <div class="tw"><table><thead><tr><th></th><th>Staff</th><th>In</th><th>Out</th></tr></thead><tbody id="mpRows">${draw(now.date)}</tbody></table></div><p class="hint" style="margin-top:6px">Untick anyone who wasn’t there and change times for anyone who came or left at a different time. Leave Out empty for people still at work.</p>`,
    [{ label: 'Cancel' }, { label: 'Save attendance', cls: 'btn-ok', onClick: async () => {
      const date = val('mpD'), why = val('mpWhy'); if (!why) throw Error('Give a reason.'); let n = 0;
      for (const c of document.querySelectorAll('[data-mp]:checked:not(:disabled)')) {
        const s = H.staffById(c.dataset.mp), ti = document.querySelector(`[data-mi="${s.id}"]`).value, to = document.querySelector(`[data-mo="${s.id}"]`).value;
        if (!ti) continue; await H.addPunch(s, { type: 'in', time: ti, date, src: 'manager', why }); if (to) await H.addPunch(s, { type: 'out', reason: 'end', time: to, date, src: 'manager', why }); n++;
      }
      toast(`Attendance saved for ${n} staff.`);
    } }], { wide: true, onOpen: b => { $('mpD').onchange = () => { $('mpRows').innerHTML = draw(val('mpD')); }; } });
}
// shop terminal: a manager's device left at the counter — staff tap their name and enter their PIN
function kioskDialog() {
  openModal('Shop terminal', `<p class="hint" style="margin:0 0 10px">Staff tap their name and type their PIN. Close this window to leave terminal mode.</p><div class="hr-cards">${H.tracked().filter(s => s.pinHash).map(s => `<button class="hr-card" data-ks="${s.id}">${avatar(s, 56)}<b>${esc(s.name.replace(/^Sample – /, ''))}</b></button>`).join('') || '<p class="hint">Nobody has a PIN yet — set PINs in the Staff Directory.</p>'}</div>`, [{ label: 'Close' }],
    { wide: true, onOpen: b => b.addEventListener('click', e => { const k = e.target.closest('[data-ks]'); if (k) pinDialog(H.staffById(k.dataset.ks), true); }) });
}
function pinDialog(s, kiosk) {
  openModal(s.name, `<div style="text-align:center">${avatar(s, 64)}<p>Enter your PIN</p><input id="pinIn" type="password" inputmode="numeric" maxlength="6" class="inp" style="font-size:28px;text-align:center;letter-spacing:8px;max-width:200px" autocomplete="off"></div>`,
    [{ label: 'Cancel', onClick: () => { if (kiosk) setTimeout(kioskDialog, 30); } }, { label: 'Continue', cls: 'btn-ink', onClick: async () => { if (!await H.checkPin(s, val('pinIn'))) throw Error('Wrong PIN.'); setTimeout(() => punchDialog(s, 'kiosk', () => { if (kiosk) setTimeout(kioskDialog, 400); rr(); }), 30); } }]);
}
export function leaveDialog(pre = {}) {
  const R = H.hrRules(), now = H.shopNow();
  openModal(pre.reqPath ? 'Approve leave' : 'Add leave', `${field('Staff', `<select id="lvS">${staffOpts(pre.staffId)}</select>`)}
    <div class="row2">${field('Leave type', select('lvT', R.leaveTypes.map(t => [t.key, t.label + (t.paid ? ' — paid' : ' — unpaid')]), pre.type || 'annual'))}${field('Length', `<select id="lvH"><option value="">Full day(s)</option><option value="1"${pre.half ? ' selected' : ''}>Half day</option></select>`)}</div>
    <div class="row2">${field('From', input('lvF', pre.from || now.date, 'type="date"'))}${field('To', input('lvTo', pre.to || pre.from || now.date, 'type="date"'))}</div>${field('Reason', input('lvR', pre.reason || ''))}<div id="lvBal" class="hint"></div>`,
    [{ label: 'Cancel' }, { label: pre.reqPath ? 'Approve' : 'Save leave', cls: 'btn-ok', onClick: async () => { const r = await H.addLeave({ staffId: val('lvS'), type: val('lvT'), from: val('lvF'), to: val('lvTo'), half: !!val('lvH'), reason: val('lvR'), reqPath: pre.reqPath }); toast(r.overQuota ? `Leave saved — ${r.overQuota} day(s) over the yearly allowance.` : 'Leave saved.', r.overQuota ? 'warn' : ''); } }],
    { onOpen: () => { const bal = () => { const s = H.staffById(val('lvS')); if (!s) return; const b = H.leaveBalance(s, (val('lvF') || now.date).slice(0, 4)).find(x => x.key === val('lvT')); $('lvBal').innerHTML = b && b.quota ? `Balance: <b>${b.left}</b> of ${b.quota} day(s) left this year.` : b && !b.paid ? 'Unpaid — the days are deducted in payroll.' : ''; }; ['lvS', 'lvT', 'lvF'].forEach(i => $(i).addEventListener('change', bal)); bal(); } });
}

/* ===================== 🪪 Staff Directory ===================== */
let sdSearch = '', sdShow = 'active';
export const hrstaff = {
  title: 'Staff Directory', icon: '🪪', roles: ['admin', 'manager', 'billing'],
  head: () => `<button class="btn btn-accent" data-a="newst">＋ Add staff</button>`,
  body() {
    H.watchHR();
    const w = words(sdSearch), sal = H.seesSalary(), list = H.staffList({ all: true }).filter(s => sdShow === 'all' || (sdShow === 'active' ? s.status !== 'inactive' : s.status === 'inactive')).filter(s => hit([s.name, s.empNo, s.dept, s.designation, s.phone].join(' '), w));
    const docs = H.expiringDocs(30);
    return `${docs.length ? `<div class="alert a-warn">🪪 ${docs.length} document(s) expired or expiring within 30 days: ${docs.slice(0, 4).map(d => esc((H.staffById(d.staffId) || {}).name || '') + ' – ' + esc(d.type) + ' ' + d.expiry).join(', ')}${docs.length > 4 ? '…' : ''}</div>` : ''}
      <div class="toolbar">${searchBox('sdS', 'Search name, ID, department…')}<div class="chips">${[['all', 'All'], ['active', 'Active'], ['inactive', 'Inactive']].map(([k, l]) => `<button class="chip${k === sdShow ? ' active' : ''}" data-sh="${k}">${l}</button>`).join('')}</div></div>
      <div class="tw"><table><thead><tr><th>Staff</th><th class="hide-m">Department</th><th class="hide-m">Joined</th><th class="hide-m">Shift / off</th><th>App login</th>${sal ? '<th class="num">Salary</th>' : ''}<th></th></tr></thead><tbody>
      ${list.map(s => { const S = H.salaryOf(s.id), sh = H.shiftOf(s); return `<tr class="click" data-st="${s.id}"><td><span style="display:flex;gap:10px;align-items:center">${avatar(s, 36)}<span><b>${esc(s.name)}</b><div class="muted" style="font-size:11px">${esc(s.empNo)} · ${esc(s.designation || '')}${s.phone ? ' · ' + esc(s.phone) : ''}</div></span></span></td>
        <td class="hide-m">${esc(s.dept)}</td><td class="hide-m">${fmtDate(s.joinDate, { day: 'numeric', month: 'short', year: 'numeric' })}</td><td class="hide-m" style="font-size:12px">${esc(sh.name)}<div class="muted">Off: ${(s.weeklyOff || []).map(d => H.WEEKDAYS[d]).join(', ') || 'none'}</div></td>
        <td>${s.userId ? '✓ ' + esc(L.nm(s.userId)) : '<span class="muted">—</span>'}${s.pinHash ? ' <span class="pill">PIN</span>' : ''}${s.noPunch ? ' <span class="pill p-confirmed">No punching</span>' : ''}</td>${sal ? `<td class="num">${S ? money(S.base) + `<div class="muted" style="font-size:11px">${S.type}${(n => n ? ` · <span style="color:var(--ok)">↑ ${money(n.base)} from ${fmtDate(n.from)}</span>` : '')(H.nextRevision(s.id))}</div>` : '<span class="pill p-unpaid">not set</span>'}</td>` : ''}<td>${s.status === 'inactive' ? pill('void', 'Inactive') : ''}</td></tr>`; }).join('') || `<tr><td colspan="7">${empty('🪪', 'No staff here.')}</td></tr>`}</tbody></table></div>
      <p class="hint" style="margin-top:8px">Link a staff profile to their app login so they can punch from their own phone and see their payslips. Staff without the app are punched in by a manager (Attendance → Quick entry) or at the shop terminal with a PIN.</p>`;
  },
  bind(root) {
    root.addEventListener('click', e => {
      if (e.target.closest('[data-a=newst]')) return staffEditor(null);
      const c = e.target.closest('[data-sh]'); if (c) { sdShow = c.dataset.sh; return rr(); }
      const t = e.target.closest('[data-st]'); if (t) staffCard(H.staffById(t.dataset.st));
    });
    root.addEventListener('input', e => { if (e.target.id === 'sdS') { sdSearch = e.target.value; rr(true); } });
  },
  keep: ['sdS']
};
export function staffEditor(s) {
  const R = H.hrRules(), S = s ? byId('hrSalary', s.id) || {} : { type: 'monthly', stdHours: 8, allowances: [] }, sal = H.seesSalary(), now = H.shopNow(), revs = s ? H.salaryRevs(s.id) : [];
  let photo = s?.photo || '', allow = [...(S.allowances || [])];
  const users = all('users').filter(u => !['pending', 'disabled'].includes(u.role)).sort((a, b) => String(a.name).localeCompare(String(b.name)));
  const allowRows = () => allow.map((a, i) => `<div class="row3" style="align-items:end"><div class="field"><label>Allowance</label><input data-al="${i}" data-k="name" value="${esc(a.name)}" list="alNames"></div><div class="field"><label>Monthly amount</label><input data-al="${i}" data-k="amount" type="number" min="0" step=".01" value="${a.amount ?? ''}"></div><div class="field"><button type="button" class="btn btn-sm btn-danger" data-alx="${i}">Remove</button></div></div>`).join('');
  openModal(s ? 'Edit · ' + s.name : 'Add staff', `<div style="display:flex;gap:14px;align-items:center;margin-bottom:10px"><span id="seAv">${avatar({ name: s?.name || '?', photo }, 64)}</span><div><button type="button" class="btn btn-sm" data-b="photo">📷 Photo</button> ${photo ? '<button type="button" class="btn btn-sm btn-danger" data-b="nophoto">Remove</button>' : ''}<div class="hint">${s ? esc(s.empNo) : 'Staff ID is given automatically'}</div></div></div>
    <div class="row2">${field('Full name', input('seN', s?.name || ''))}${field('Phone', input('seP', s?.phone || '', 'type="tel"'))}</div>
    <div class="row2">${field('Department / role', `<select id="seD">${H.DEPTS.map(d => `<option${(s?.dept || 'Sales') === d ? ' selected' : ''}>${d}</option>`).join('')}</select>`)}${field('Designation', input('seDg', s?.designation || '', 'placeholder="e.g. Senior salesman"'))}</div>
    <div class="row3">${field('Joining date', input('seJ', s?.joinDate || now.date, 'type="date"'))}${field('Status', `<select id="seSt"><option value="active">Active</option><option value="inactive"${s?.status === 'inactive' ? ' selected' : ''}>Inactive</option></select>`)}${field('Leaving date', input('seE', s?.endDate || '', 'type="date"'))}</div>
    <div class="row2">${field('Shift', `<select id="seSh">${R.shifts.map(x => `<option value="${x.id}"${(s?.shiftId || R.shifts[0].id) === x.id ? ' selected' : ''}>${esc(x.name)} ${x.start}–${x.end}</option>`).join('')}</select>`)}${field('App login (for own-phone punching)', `<select id="seU"><option value="">— Not using the app —</option>${users.map(u => `<option value="${u.id}"${s?.userId === u.id ? ' selected' : ''}>${esc(u.name)} · ${esc(u.roleName)}</option>`).join('')}</select>`)}</div>
    <label class="check"><input type="checkbox" id="seNP"${s ? (s.noPunch ? ' checked' : '') : ''}> No punch in / out needed — attendance not tracked (e.g. owners); paid as present every working day</label>
    <div class="field"><label>Weekly off day(s)</label><div style="display:flex;gap:6px;flex-wrap:wrap">${H.WEEKDAYS.map((d, i) => `<label class="check" style="margin:0"><input type="checkbox" data-wo="${i}"${(s ? s.weeklyOff || [] : R.defaultOff).includes(i) ? ' checked' : ''}> ${d}</label>`).join('')}</div></div>
    ${field('Notes', input('seNo', s?.notes || ''))}
    ${sal ? `<h3 style="margin:14px 0 6px;font-size:14px">💰 Salary setup${revs.length > 1 ? ` <span class="hint" style="font-weight:500">— latest revision, from ${fmtDate(revs[revs.length - 1].from, { day: 'numeric', month: 'short', year: 'numeric' })}</span>` : ''}</h3>${s && S.base ? '<p class="hint" style="margin:-4px 0 8px">Editing here corrects the salary. For a raise from a date, use <b>📈 Increment</b> below.</p>' : ''}
    <div class="row3">${field('Salary type', `<select id="seT"><option value="monthly">Monthly</option><option value="daily"${S.type === 'daily' ? ' selected' : ''}>Daily</option><option value="hourly"${S.type === 'hourly' ? ' selected' : ''}>Hourly</option></select>`)}${field('Basic salary / rate', input('seB', S.base ?? '', 'type="number" min="0" step=".01" inputmode="decimal"'))}${field('Working hours per day', input('seH', S.stdHours ?? 8, 'type="number" min="1" max="16" step=".5"'))}</div>
    <div class="row3">${field('Overtime rate per hour (blank = rule)', input('seO', S.otRate || '', `type="number" min="0" step=".01" placeholder="hourly × ${R.ot.multiplier}"`))}${field('Paid by', select('seM', Object.entries(H.PAY_METHODS), S.payMethod || 'cash'))}${field('Other payment details', input('seBi', S.bankInfo || '', 'placeholder="Bank name, card no.…"'))}</div>
    <div class="row3">${field('IBAN', input('seIb', S.iban || '', 'placeholder="AE07 0331 2345 6789 0123 456" autocomplete="off"'))}${field('WPS person ID (14 digits)', input('seW', S.wpsId || '', 'inputmode="numeric" placeholder="Labour card personal no."'))}${field('Bank routing code (9 digits)', input('seRt', S.routing || '', 'inputmode="numeric" placeholder="Employee bank / exchange"'))}</div>
    <div id="seAl">${allowRows()}</div><datalist id="alNames"><option>Housing</option><option>Transport</option><option>Food</option><option>Phone</option><option>Other</option></datalist><button type="button" class="btn btn-sm" data-b="addal">＋ Fixed monthly allowance</button>` : ''}`,
    [{ label: 'Cancel' }, ...(s && sal && S.base && may('hrstaff', 'edit') ? [{ label: '📈 Increment', onClick: () => { setTimeout(() => incrementDialog(s), 30); } }] : []), ...(s && H.isOwner() || s && may('hrstaff', 'edit') ? [{ label: '🔢 Set PIN', onClick: () => { setTimeout(() => pinSetDialog(s), 30); } }] : []), { label: s ? 'Save' : 'Add staff', cls: 'btn-ok', onClick: async () => {
      const wo = [...document.querySelectorAll('[data-wo]:checked')].map(x => +x.dataset.wo);
      const p = { id: s?.id, name: val('seN'), phone: val('seP'), dept: val('seD'), designation: val('seDg'), joinDate: val('seJ'), status: val('seSt'), endDate: val('seE'), shiftId: val('seSh'), userId: val('seU'), weeklyOff: wo, photo, notes: val('seNo'), noPunch: $('seNP').checked };
      const sv = sal ? { type: val('seT'), base: val('seB'), stdHours: val('seH'), otRate: val('seO'), payMethod: val('seM'), bankInfo: val('seBi'), iban: val('seIb'), wpsId: val('seW'), routing: val('seRt'), allowances: allow } : null;
      if (sal && !(num(val('seB')) > 0) && !await confirmBox('No salary', 'No basic salary entered — this person won’t be in payroll until it is set. Save anyway?', 'Save')) return false;
      await H.saveStaff(p, sal && num(val('seB')) > 0 ? sv : null); toast(s ? 'Saved.' : 'Staff added.');
    } }], { wide: true, onOpen: b => {
      b.addEventListener('click', async e => {
        const x = e.target.closest('[data-b]')?.dataset.b;
        if (x === 'photo') { const f = await pickFile('image/*'); if (!f) return; try { photo = await shrink(f, 240); $('seAv').innerHTML = avatar({ photo }, 64); } catch (er) { fail(er); } }
        if (x === 'nophoto') { photo = ''; $('seAv').innerHTML = avatar({ name: val('seN') || '?' }, 64); }
        if (x === 'addal') { allow.push({ name: '', amount: '' }); $('seAl').innerHTML = allowRows(); }
        const rx = e.target.closest('[data-alx]'); if (rx) { allow.splice(+rx.dataset.alx, 1); $('seAl').innerHTML = allowRows(); }
      });
      $('seD').addEventListener('change', () => { if (val('seD') === 'Owner') $('seNP').checked = true; });
      b.addEventListener('input', e => { const i = e.target.dataset.al; if (i != null) allow[+i][e.target.dataset.k] = e.target.dataset.k === 'amount' ? num(e.target.value) : e.target.value; });
    } });
}
export function incrementDialog(s) {
  const now = H.shopNow(), cur = H.salaryOf(s.id), latest = byId('hrSalary', s.id), next = now.month.slice(0, 5) + now.month.slice(5) ; if (!latest) return toast('Set up the salary first.', 'warn');
  const first = H.nextMonth(now.month) + '-01', allow = (latest.allowances || []).map(a => ({ ...a }));
  openModal('Salary increment · ' + s.name, `<p style="margin:0 0 10px">Current salary: <b>${money(latest.base)}</b> ${esc(latest.type)}${(latest.allowances || []).length ? ' + ' + latest.allowances.map(a => esc(a.name) + ' ' + money(a.amount)).join(', ') : ''}</p>
    <div class="row3">${field('Increase by', `<select id="icM"><option value="amt">Amount</option><option value="pct">Percent</option><option value="new">New salary</option></select>`)}${field('Value', input('icV', '', 'type="number" step=".01" inputmode="decimal"'))}${field('Effective from', input('icF', first, 'type="date"'))}</div>
    ${allow.length ? `<div class="field"><label>Allowances from that date</label>${allow.map((a, i) => `<div class="row2" style="align-items:center"><span>${esc(a.name)}</span><input type="number" min="0" step=".01" data-ia="${i}" value="${a.amount}"></div>`).join('')}</div>` : ''}
    ${field('Reason', input('icR', '', 'placeholder="e.g. Annual increment 2026, promotion to supervisor"'))}
    <div class="alert a-ok" id="icP" style="margin-bottom:0">Enter the increase.</div>
    <p class="hint" style="margin-top:8px">Payroll uses the old salary before this date and the new one from it. If it starts mid-month, that month is pro-rated by calendar days. Months already finalized can’t change — pay any back-dated difference as an “Arrears” adjustment in the next payroll.</p>`,
    [{ label: 'Cancel' }, { label: 'Save increment', cls: 'btn-ok', onClick: async () => {
      const nb = newBase(); document.querySelectorAll('[data-ia]').forEach(x => allow[+x.dataset.ia].amount = num(x.value));
      const r = await H.addIncrement(s.id, { from: val('icF'), base: nb, allowances: allow, reason: val('icR') });
      toast(`Salary ${money(r.prevBase)} → ${money(r.base)} from ${fmtDate(r.from, { day: 'numeric', month: 'short', year: 'numeric' })}.`);
    } }], { onOpen: b => { const show = () => { const nb = newBase(); $('icP').innerHTML = nb > 0 ? `New salary <b>${money(nb)}</b> (${nb >= latest.base ? '+' : '−'}${money(Math.abs(nb - latest.base))}, ${latest.base ? ((nb - latest.base) / latest.base * 100).toFixed(1) + '%' : ''}) from <b>${fmtDate(val('icF'), { day: 'numeric', month: 'short', year: 'numeric' })}</b>` : 'Enter the increase.'; }; b.addEventListener('input', show); b.addEventListener('change', show); } });
  function newBase() { const v = num(val('icV')), m = val('icM'); return r2(m === 'pct' ? latest.base * (1 + v / 100) : m === 'amt' ? latest.base + v : v); }
}
function pinSetDialog(s) {
  openModal('PIN for ' + s.name, `<p class="hint" style="margin:0 0 10px">Used at the shop terminal (Attendance → Quick entry → Shop terminal). 4–6 digits. Turn on PIN mode in HR Settings.</p>${field('New PIN', input('pnA', '', 'type="password" inputmode="numeric" maxlength="6" autocomplete="off"'))}${field('Repeat PIN', input('pnB', '', 'type="password" inputmode="numeric" maxlength="6" autocomplete="off"'))}`,
    [{ label: 'Cancel' }, { label: 'Save PIN', cls: 'btn-ink', onClick: async () => { if (val('pnA') !== val('pnB')) throw Error('The PINs don’t match.'); await H.setPin(s.id, val('pnA')); toast('PIN saved.'); } }]);
}
export function shrink(file, max = 240, q = 0.82) {
  return new Promise((res, rej) => { if (!/^image\//.test(file.type)) return rej(Error('Choose an image file.')); const fr = new FileReader(); fr.onload = () => { const im = new Image(); im.onload = () => { const k = Math.min(1, max / Math.max(im.width, im.height)), c = document.createElement('canvas'); c.width = Math.round(im.width * k); c.height = Math.round(im.height * k); const g = c.getContext('2d'); g.fillStyle = '#fff'; g.fillRect(0, 0, c.width, c.height); g.drawImage(im, 0, 0, c.width, c.height); res(c.toDataURL('image/jpeg', q)); }; im.onerror = () => rej(Error('Could not read the image.')); im.src = fr.result; }; fr.readAsDataURL(file); });
}
let scTab = 'profile';
export function staffCard(s, tab) {
  if (!s) return; scTab = tab || scTab;
  const now = H.shopNow(), S = H.salaryOf(s.id), sal = H.seesSalary(), m = H.monthFor(s, now.month), sh = H.shiftOf(s);
  const tabs = [['profile', 'Profile'], ['att', 'Attendance'], ['leave', 'Leave'], ...(sal ? [['adv', 'Advances'], ['slips', 'Payslips']] : []), ['docs', 'Documents']];
  const docs = H.docsOf(s.id), advs = H.advList(s.id), runs = all('hrRuns').filter(r => r.status === 'finalized' && r.items?.[s.id]).sort((a, b) => b.month.localeCompare(a.month));
  const body = `<div class="hr-who" style="margin-bottom:10px">${avatar(s, 56)}<div><b style="font-size:18px">${esc(s.name)}</b><div class="muted">${esc(s.empNo)} · ${esc(s.designation || s.dept)} · joined ${fmtDate(s.joinDate, { day: 'numeric', month: 'short', year: 'numeric' })}${s.status === 'inactive' ? ' · inactive' : ''}</div></div></div>
    <div class="tabs">${tabs.map(([k, l]) => `<button data-sct="${k}" class="${k === scTab ? 'active' : ''}">${l}</button>`).join('')}</div>
    ${scTab === 'profile' ? `<dl class="dl"><dt>Department</dt><dd>${esc(s.dept)}</dd><dt>Phone</dt><dd>${esc(s.phone || '—')}</dd><dt>Shift</dt><dd>${esc(sh.name)} ${sh.start}–${sh.end} (break ${sh.breakMin} min)</dd><dt>Weekly off</dt><dd>${(s.weeklyOff || []).map(d => H.WEEKDAYS[d]).join(', ') || 'none'}</dd><dt>App login</dt><dd>${s.userId ? esc(L.nm(s.userId)) : 'Not linked'}</dd><dt>Terminal PIN</dt><dd>${s.pinHash ? 'Set' : 'Not set'}</dd>
      ${sal && S ? `<dt>Salary</dt><dd>${money(S.base)} ${esc(S.type)} <span class="muted">(today)</span> · ${S.stdHours} h/day${S.otRate ? ' · OT ' + money(S.otRate) + '/h' : ''}</dd><dt>Allowances</dt><dd>${(S.allowances || []).map(a => esc(a.name) + ' ' + money(a.amount)).join(', ') || '—'}</dd><dt>Paid by</dt><dd>${esc(H.PAY_METHODS[S.payMethod] || '')}${S.bankInfo ? ' · ' + esc(S.bankInfo) : ''}</dd>` : ''}${s.notes ? `<dt>Notes</dt><dd>${esc(s.notes)}</dd>` : ''}</dl>
      ${sal && S ? `<div class="panel-h" style="margin:14px 0 6px"><h3 style="margin:0;font-size:14px">Salary history</h3>${may('hrstaff', 'edit') ? '<button class="btn btn-sm btn-ok" data-inc="1">📈 Increment</button>' : ''}</div>
        <div class="tw"><table><thead><tr><th>From</th><th class="num">Basic</th><th class="num">Change</th><th class="hide-m">Allowances</th><th>Reason</th><th></th></tr></thead><tbody>${H.salaryRevs(s.id).slice().reverse().map((r, i, a) => { const prev = a[i + 1]; const ch = prev ? r.base - prev.base : 0; return `<tr><td class="nowrap">${fmtDate(r.from, { day: 'numeric', month: 'short', year: 'numeric' })}${r.from > now.date ? ' ' + pill('scheduled', 'upcoming') : ''}</td><td class="num">${money(r.base)}</td><td class="num">${prev ? `<span style="color:${ch >= 0 ? 'var(--ok)' : 'var(--danger)'}">${ch >= 0 ? '+' : '−'}${money(Math.abs(ch))}${prev.base ? ' (' + (ch >= 0 ? '+' : '') + (ch / prev.base * 100).toFixed(1) + '%)' : ''}</span>` : ''}</td><td class="hide-m" style="font-size:12px">${(r.allowances || []).map(x => esc(x.name) + ' ' + money(x.amount)).join(', ') || '—'}</td><td style="font-size:12px">${esc(r.reason || '')}${r.by ? `<div class="muted">${esc(L.nm(r.by))}</div>` : ''}</td><td>${prev && may('hrstaff', 'edit') ? `<button class="icon-btn" data-delrev="${r.from}" title="Remove this revision">✕</button>` : ''}</td></tr>`; }).join('')}</tbody></table></div>` : ''}` : ''}
    ${scTab === 'att' ? `${monthSummary(m.totals)}${dayTable(m.rows.filter(r => r.status !== STATUS.NA && r.date <= now.date).reverse().slice(0, 31), true, s)}` : ''}
    ${scTab === 'leave' ? `<div class="tw" style="margin-bottom:10px"><table><thead><tr><th>Type</th><th class="num">Allowed</th><th class="num">Used</th><th class="num">Left</th></tr></thead><tbody>${H.leaveBalance(s, now.date.slice(0, 4)).map(b => `<tr><td>${esc(b.label)} ${b.paid ? '' : '<span class="muted">(unpaid)</span>'}</td><td class="num">${b.quota || '—'}</td><td class="num">${b.used}</td><td class="num"><b>${b.left ?? '—'}</b></td></tr>`).join('')}</tbody></table></div>
      ${all('hrLeave').filter(l => l.staffId === s.id && l.status === 'approved').sort((a, b) => b.from.localeCompare(a.from)).map(l => `<div class="list-item"><span>${esc(H.leaveLabel(l.type))} · ${l.from}${l.to !== l.from ? ' – ' + l.to : ''}${l.half ? ' (half)' : ''} · ${l.days} day(s)</span><span class="muted">${esc(l.reason || '')}</span></div>`).join('') || '<p class="hint">No leave taken.</p>'}` : ''}
    ${scTab === 'adv' ? (advs.map(a => `<div class="list-item"><div><div class="li-t">${esc(a.no)} · ${fmtDate(a.date)} · ${money(a.amount)}</div><div class="li-s">${esc(a.reason)} · ${a.plan === 'once' ? 'one-time' : a.installments + ' instalments of ' + money(a.perInst)} · recovered ${money(a.recovered)}</div></div><b>${money(a.outstanding)}</b></div>`).join('') || '<p class="hint">No advances.</p>') : ''}
    ${scTab === 'slips' ? (runs.map(r => `<div class="list-item click" data-ps="${r.month}"><div><div class="li-t">${esc(H.monthLabel(r.month))}</div><div class="li-s">${r.items[s.id].paid ? 'Paid ' + fmtDate(r.items[s.id].paid.date) + ' · ' + esc(H.PAY_METHODS[r.items[s.id].paid.method] || '') : H.paidOf(r.items[s.id]) ? 'Part paid ' + money(H.paidOf(r.items[s.id])) + ' · ' + money(H.dueOf(r.items[s.id])) + ' still owed' : 'Not paid yet'}</div></div><b>${money(r.items[s.id].result.net)}</b></div>`).join('') || '<p class="hint">No finalized payroll yet.</p>') : ''}
    ${scTab === 'docs' ? `${docs.map(d => `<div class="list-item"><div style="display:flex;gap:10px;align-items:center">${d.image ? `<img src="${esc(d.image)}" alt="" style="width:46px;height:46px;object-fit:cover;border-radius:6px;cursor:pointer" data-img="${d.id}">` : ''}<div><div class="li-t">${esc(d.type)}${d.number ? ' · ' + esc(d.number) : ''}</div><div class="li-s">${d.expiry ? (d.expiry < now.date ? pill('unpaid', 'Expired ' + d.expiry) : 'Expires ' + d.expiry) : 'No expiry'}${d.note ? ' · ' + esc(d.note) : ''}</div></div></div>${may('hrstaff', 'edit') ? `<button class="icon-btn" data-dd="${d.id}" title="Delete">🗑</button>` : ''}</div>`).join('') || '<p class="hint">No documents.</p>'}
      ${may('hrstaff', 'edit') ? `<details class="hr-det" style="margin-top:8px"><summary>＋ Add document</summary><div class="row3" style="margin-top:8px">${field('Type', `<select id="dcT">${['Emirates ID', 'Passport', 'Visa', 'Labour card', 'Contract', 'Driving licence', 'Health card', 'Other'].map(x => `<option>${x}</option>`).join('')}</select>`)}${field('Number', input('dcN'))}${field('Expiry', input('dcE', '', 'type="date"'))}</div>${field('Note', input('dcNo'))}<button type="button" class="btn btn-sm" data-b="dcimg">📎 Attach photo</button> <span id="dcImgOk" class="hint"></span> <button type="button" class="btn btn-sm btn-ink" data-b="dcsave">Save document</button></details>` : ''}` : ''}`;
  let dimg = '';
  openModal(s.name, body, [...(sal ? [{ label: '📒 Account statement', onClick: () => { setTimeout(() => import('./views-hr-pay.js').then(m => m.staffStatement(s.id)), 30); } }] : []), ...(sal && may('hrpay', 'edit') && (s.status === 'inactive' || s.endDate || H.hrRules().eosb.enabled) && !s.noPunch ? [{ label: s.eosbPaid ? '🏁 Gratuity paid ' + s.eosbPaid.date : '🏁 End of service', onClick: () => { setTimeout(() => import('./views-hr-pay.js').then(m => m.eosbDialog(H.staffById(s.id))), 30); } }] : []), ...(may('hrstaff', 'edit') ? [{ label: '✎ Edit', onClick: () => { setTimeout(() => staffEditor(s), 30); } }] : []), { label: 'Close' }], { wide: true, onOpen: b => b.addEventListener('click', async e => {
    const t = e.target.closest('[data-sct]'); if (t) return staffCard(H.staffById(s.id), t.dataset.sct);
    if (e.target.closest('[data-inc]')) return incrementDialog(s);
    const dr = e.target.closest('[data-delrev]'); if (dr) { if (await confirmBox('Remove salary revision?', `Remove the revision from ${esc(dr.dataset.delrev)}? The salary before it applies again from that date.`, 'Remove', true)) { try { await H.deleteRevision(s.id, dr.dataset.delrev); toast('Revision removed.'); setTimeout(() => staffCard(H.staffById(s.id), 'profile'), 250); } catch (er) { fail(er); } } return; }
    const dy = e.target.closest('[data-day]'); if (dy) { const [sid, date] = dy.dataset.day.split('|'); return dayDialog(H.staffById(sid), date); }
    const ps = e.target.closest('[data-ps]'); if (ps) { const d = H.payslipFor(ps.dataset.ps, s.id); if (d) import('./views-hr-pay.js').then(m => m.showPayslip(d)); return; }
    const im = e.target.closest('[data-img]'); if (im) { const d = byId('hrDocs', im.dataset.img); openModal(d.type, `<img src="${esc(d.image)}" alt="" style="max-width:100%">`, [{ label: 'Back', onClick: () => { setTimeout(() => staffCard(H.staffById(s.id), 'docs'), 30); } }], { wide: true }); return; }
    const x = e.target.closest('[data-b]')?.dataset.b;
    try {
      if (x === 'dcimg') { const f = await pickFile('image/*'); if (f) { dimg = await shrink(f, 1000, 0.7); $('dcImgOk').textContent = '✓ photo attached'; } }
      if (x === 'dcsave') { await H.saveDoc({ staffId: s.id, type: val('dcT'), number: val('dcN'), expiry: val('dcE'), note: val('dcNo'), image: dimg }); toast('Document saved.'); setTimeout(() => staffCard(H.staffById(s.id), 'docs'), 250); }
      const dd = e.target.closest('[data-dd]'); if (dd && await confirmBox('Delete document?', 'This removes the record and its photo.', 'Delete', true)) { await H.deleteDoc(dd.dataset.dd); toast('Deleted.'); setTimeout(() => staffCard(H.staffById(s.id), 'docs'), 250); }
    } catch (er) { fail(er); }
  }) });
}

/* ===================== ⏰ Shifts & Rules ===================== */
export const hrshifts = {
  title: 'Shifts & Rules', icon: '⏰', roles: ['admin', 'manager', 'billing'],
  body() {
    const R = H.hrRules(), ed = may('hrshifts', 'edit');
    const pol = (k, title, help) => { const p = R[k]; return `<div class="panel"><h2>${title}</h2><p class="hint" style="margin:-6px 0 10px">${help}</p>
      ${field('Deduction', `<select id="${k}Mode">${[['none', 'No deduction'], ['perMinute', 'Pay cut for the minutes (pro-rata)'], ['fixed', 'Fixed amount each time'], ['halfDay', 'Half a day’s pay after every N times'], ['fullDay', 'A full day’s pay after every N times']].map(([v, l]) => `<option value="${v}"${p.mode === v ? ' selected' : ''}>${l}</option>`).join('')}</select>`)}
      <div class="row3">${field('Amount each time', input(k + 'Amt', p.amount || '', 'type="number" min="0" step=".01"'))}${field('Every N times', input(k + 'N', p.everyN || 3, 'type="number" min="1" step="1"'))}${field('Free times per month', input(k + 'Free', p.freeCount || 0, 'type="number" min="0" step="1"'))}</div>
      ${field('Pro-rata multiplier', input(k + 'F', p.factor ?? 1, 'type="number" min="0" step=".25"'))}</div>`; };
    return `<fieldset ${ed ? '' : 'disabled'} style="border:0;padding:0;margin:0"><div class="grid g2" style="align-items:start">
      <div class="panel"><div class="panel-h"><h2>Shifts</h2><button type="button" class="btn btn-sm" data-a="addsh">＋ Shift</button></div>
        <div id="shRows">${R.shifts.map((s, i) => `<div class="row3 hr-sh" data-i="${i}" style="grid-template-columns:1.5fr 1.3fr 1.3fr .9fr auto;align-items:end"><div class="field"><label>Name</label><input data-f="name" value="${esc(s.name)}"></div><div class="field"><label>Start</label><input type="time" data-f="start" value="${s.start}"></div><div class="field"><label>End</label><input type="time" data-f="end" value="${s.end}"></div><div class="field"><label>Break (min)</label><input type="number" min="0" data-f="breakMin" value="${s.breakMin}"></div><div class="field">${R.shifts.length > 1 ? `<button type="button" class="icon-btn" data-rmsh="${i}">✕</button>` : ''}<input type="hidden" data-f="id" value="${esc(s.id)}"></div></div>`).join('')}</div>
        <p class="hint">Standard working hours = shift length minus break, unless set per person in their salary setup.</p>
        <h2 style="margin-top:16px">Day rules</h2>
        <div class="row2">${field('Late after (grace minutes)', input('rGL', R.graceLate, 'type="number" min="0"'))}${field('Early leaving before (grace minutes)', input('rGE', R.graceEarly, 'type="number" min="0"'))}</div>
        <div class="row2">${field('Half-day if worked less than (hours)', input('rHD', R.halfDayHours, 'type="number" min="0" step=".5"'))}${field('Absent if worked less than (hours)', input('rAB', R.absentHours, 'type="number" min="0" step=".5"'))}</div>
        <label class="check"><input type="checkbox" id="rAuto"${R.autoBreak ? ' checked' : ''}> Take the shift break off a full day when no break was punched</label>
        <div class="hr-det" style="margin:4px 0 10px"><label class="check" style="margin:0 0 6px"><input type="checkbox" id="rAO"${R.autoOut.enabled ? ' checked' : ''}> <b>Auto punch-out</b> at the end of each person’s shift</label>${field('…if still punched In this many minutes after the shift ends', input('rAOm', R.autoOut.afterMin, 'type="number" min="0" step="5"'))}<p class="hint" style="margin:0">The Out is recorded at the shift end time, so time after the shift isn’t counted as overtime unless a manager corrects it. Days are marked “Auto punch-out” so you can review them.</p></div>
        ${field('When there is no punch-out (auto punch-out off)', `<select id="rMO"><option value="flag"${R.missingOut === 'flag' ? ' selected' : ''}>Flag it, count nothing after the last In (manager fixes it)</option><option value="shiftEnd"${R.missingOut === 'shiftEnd' ? ' selected' : ''}>Assume they left at shift end</option></select>`)}</div>
      <div class="panel"><h2>Overtime</h2><label class="check"><input type="checkbox" id="oE"${R.ot.enabled ? ' checked' : ''}> Pay overtime</label>
        <div class="row2">${field('Count only if at least (minutes)', input('oMin', R.ot.minMinutes, 'type="number" min="0"'))}${field('Round down to (minutes)', input('oR', R.ot.round, 'type="number" min="1"'))}</div>
        <div class="row2">${field('Rate × hourly pay', input('oM', R.ot.multiplier, 'type="number" min="0" step=".05"'))}${field('Off days & holidays × hourly pay', input('oMO', R.ot.offDayMultiplier, 'type="number" min="0" step=".05"'))}</div>
        <label class="check"><input type="checkbox" id="oA"${R.ot.needApproval ? ' checked' : ''}> Overtime must be approved by a manager (per day)</label>
        <p class="hint">Hourly pay = monthly salary ÷ day basis ÷ working hours. UAE law: at least 1.25× (1.5× for 10 pm–4 am, off days and holidays).</p></div>
      ${pol('late', '⏰ Late punch-in deduction', 'Counted when the first In is later than shift start + grace minutes.')}
      ${pol('early', '🚪 Early punch-out deduction', 'Counted when the last Out is earlier than shift end − grace minutes.')}
    </div></fieldset>
    ${ed ? '<div style="position:sticky;bottom:10px;margin-top:14px;text-align:right"><button class="btn btn-ok btn-lg" data-a="saverules">Save shifts &amp; rules</button></div>' : '<p class="hint">You can view these rules; ask the owner to change them.</p>'}`;
  },
  bind(root) {
    root.addEventListener('click', async e => {
      const a = e.target.closest('[data-a]')?.dataset.a;
      if (a === 'addsh') { const sh = readShifts(); sh.push({ id: 's' + Date.now().toString(36), name: 'New shift', start: '10:00', end: '22:00', breakMin: 60 }); await H.saveRules({ shifts: sh }).catch(fail); }
      const rm = e.target.closest('[data-rmsh]'); if (rm) { const sh = readShifts(); const x = sh[+rm.dataset.rmsh]; if (H.staffList({ all: true }).some(s => s.shiftId === x.id)) return toast('Some staff use this shift — move them first.', 'warn'); sh.splice(+rm.dataset.rmsh, 1); await H.saveRules({ shifts: sh }).catch(fail); }
      if (a === 'saverules') {
        const pol = k => ({ mode: val(k + 'Mode'), amount: num(val(k + 'Amt')), everyN: Math.max(1, num(val(k + 'N'), 1)), freeCount: num(val(k + 'Free')), factor: num(val(k + 'F'), 1) });
        try {
          const sh = readShifts(); if (sh.some(s => !s.start || !s.end)) throw Error('Every shift needs a start and end time.');
          await H.saveRules({ shifts: sh, graceLate: num(val('rGL')), graceEarly: num(val('rGE')), halfDayHours: num(val('rHD')), absentHours: num(val('rAB')), autoBreak: $('rAuto').checked, missingOut: val('rMO'), autoOut: { enabled: $('rAO').checked, afterMin: Math.max(0, num(val('rAOm'), 60)) },
            ot: { enabled: $('oE').checked, minMinutes: num(val('oMin')), round: Math.max(1, num(val('oR'), 1)), multiplier: num(val('oM'), 1.25), offDayMultiplier: num(val('oMO'), 1.5), needApproval: $('oA').checked }, late: pol('late'), early: pol('early') });
          toast('Shifts & rules saved. Payroll that isn’t finalized uses them straight away.');
        } catch (er) { fail(er); }
      }
    });
  }
};
const readShifts = () => [...document.querySelectorAll('.hr-sh')].map(r => { const g = f => r.querySelector(`[data-f="${f}"]`).value; return { id: g('id'), name: g('name').trim() || 'Shift', start: g('start'), end: g('end'), breakMin: num(g('breakMin')) }; });

/* ===================== ⚙️ HR Settings ===================== */
export const hrset = {
  title: 'HR Settings', icon: '🛠', roles: ['admin', 'manager', 'billing'],
  body() {
    const R = H.hrRules(), ed = may('hrset', 'edit'), sample = all('hrStaff').some(s => s.sample);
    const rowList = (id, list, cols) => `<div id="${id}">${list.map((x, i) => `<div class="hr-lrow" data-i="${i}">${cols.map(([k, l, type, w]) => `<div class="field" style="flex:${w || 1}"><label>${l}</label>${type === 'check' ? `<label class="check" style="margin:6px 0 0"><input type="checkbox" data-k="${k}"${x[k] ? ' checked' : ''}> yes</label>` : `<input data-k="${k}" ${type ? `type="${type}"` : ''} value="${esc(x[k] ?? '')}">`}</div>`).join('')}<input type="hidden" data-k="key" value="${esc(x.key || '')}"><button type="button" class="icon-btn" data-rm="${id}" data-ri="${i}" title="Remove">✕</button></div>`).join('')}</div>`;
    return `<fieldset ${ed ? '' : 'disabled'} style="border:0;padding:0;margin:0"><div class="grid g2" style="align-items:start">
      <div class="panel"><div class="panel-h"><h2>Leave types</h2><button type="button" class="btn btn-sm" data-add="lt">＋ Type</button></div>${rowList('lt', R.leaveTypes, [['label', 'Name', '', 3], ['paid', 'Paid?', 'check', 1], ['quota', 'Days / year', 'number', 1.4]])}<p class="hint">Paid leave counts as a paid day in payroll; unpaid leave is deducted. Days / year = yearly allowance (0 = no limit tracked).</p>
        <div class="panel-h" style="margin-top:14px"><h2>Out reasons</h2><button type="button" class="btn btn-sm" data-add="rs">＋ Reason</button></div>${rowList('rs', R.reasons, [['label', 'Reason', '', 3], ['paid', 'Paid time?', 'check', 1.2]])}<p class="hint">Staff pick one when they step out. Paid reasons (e.g. official errand) count as working time.</p></div>
      <div class="panel"><div class="panel-h"><h2>Public holidays</h2><button type="button" class="btn btn-sm" data-add="ho">＋ Holiday</button></div>${rowList('ho', [...R.holidays].sort((a, b) => a.date.localeCompare(b.date)), [['date', 'Date', 'date', 1.4], ['name', 'Name', '', 2]])}
        <h2 style="margin-top:14px">Weekly off & payroll</h2>
        <div class="field"><label>Default weekly off for new staff</label><div style="display:flex;gap:6px;flex-wrap:wrap">${H.WEEKDAYS.map((d, i) => `<label class="check" style="margin:0"><input type="checkbox" data-dwo="${i}"${R.defaultOff.includes(i) ? ' checked' : ''}> ${d}</label>`).join('')}</div></div>
        ${field('Monthly salary → day rate', `<select id="psB"><option value="30"${R.dayBasis === '30' ? ' selected' : ''}>Salary ÷ 30 (UAE practice)</option><option value="calendar"${R.dayBasis === 'calendar' ? ' selected' : ''}>Salary ÷ days in the month</option><option value="working"${R.dayBasis === 'working' ? ' selected' : ''}>Salary ÷ working days in the month</option></select>`)}
        <label class="check"><input type="checkbox" id="psPr"${R.prorateAllowances ? ' checked' : ''}> Reduce fixed allowances for unpaid days</label>
        <label class="check"><input type="checkbox" id="psDH"${R.dailyPaidHolidays ? ' checked' : ''}> Pay daily / hourly staff for public holidays</label>
        <label class="check"><input type="checkbox" id="psOA"${R.ownerApproval ? ' checked' : ''}> Payroll needs the owner’s approval before it is finalized</label>
        <h2 style="margin-top:14px">Punching</h2>
        <label class="check"><input type="checkbox" id="pcS"${R.punch.self !== false ? ' checked' : ''}> Staff can punch from their own phone (My Attendance)</label>
        <label class="check"><input type="checkbox" id="pcP"${R.punch.pin ? ' checked' : ''}> Shop terminal with staff PIN (Attendance → Quick entry)</label>
        ${field('Location check on own-phone punches', `<select id="pcL"><option value="off"${R.punch.location === 'off' ? ' selected' : ''}>Off</option><option value="record"${R.punch.location === 'record' ? ' selected' : ''}>Record location (if the phone allows)</option><option value="require"${R.punch.location === 'require' ? ' selected' : ''}>Require being at the shop</option></select>`)}
        <div class="row3">${field('Shop latitude', input('pcLa', R.punch.lat || '', 'type="number" step="any"'))}${field('Longitude', input('pcLo', R.punch.lng || '', 'type="number" step="any"'))}${field('Radius (m)', input('pcR', R.punch.radius || 200, 'type="number" min="20"'))}</div>
        <button type="button" class="btn btn-sm" data-a="here">📍 Use this device’s location</button>
        <p class="hint" style="margin-top:6px">Some browsers block location inside Claude pages — then “Record” saves “no location” and “Require” stops own-phone punching (managers can still enter). Wi-Fi checks and photo capture aren’t possible from a web page.</p>
        ${field('Shop time zone', input('pcTz', R.tz || 'Asia/Dubai'))}</div>
    </div></fieldset>
    ${ed ? '<div style="position:sticky;bottom:10px;margin-top:14px;text-align:right"><button class="btn btn-ok btn-lg" data-a="save">Save HR settings</button></div>' : ''}
    <div class="grid g2" style="margin-top:16px;align-items:start"><div class="panel"><h2>Sample data</h2><p class="hint" style="margin:0 0 10px">Four sample staff (monthly, daily and hourly pay) with two months of punches, a missing punch-out to fix, an advance, a commission and a bonus — to try every screen. Names start with “Sample –”.</p>
      ${H.isOwner() ? (sample ? '<button class="btn btn-danger" data-a="unsample">Remove sample data</button>' : '<button class="btn" data-a="sample">Load sample HR data</button>') : '<p class="hint">Only the owner can load or remove sample data.</p>'}</div>
      <div class="panel"><h2>Guide</h2><p class="hint" style="margin:0 0 10px">How HR & Payroll works, for managers and staff.</p><button class="btn" data-a="guide">📖 Open the guide</button></div></div>
    ${acctPanel(R, ed)}`;
  },
  bind(root) {
    root.addEventListener('click', async e => {
      const ad = e.target.closest('[data-add]')?.dataset.add;
      if (ad) { const c = $(ad), i = c.children.length, cols = { lt: [['label', 'Name', '', 3], ['paid', 'Paid?', 'check', 1], ['quota', 'Days / year', 'number', 1.4]], rs: [['label', 'Reason', '', 3], ['paid', 'Paid time?', 'check', 1.2]], ho: [['date', 'Date', 'date', 1.4], ['name', 'Name', '', 2]] }[ad];
        c.insertAdjacentHTML('beforeend', `<div class="hr-lrow" data-i="${i}">${cols.map(([k, l, type, w]) => `<div class="field" style="flex:${w}"><label>${l}</label>${type === 'check' ? `<label class="check" style="margin:6px 0 0"><input type="checkbox" data-k="${k}"> yes</label>` : `<input data-k="${k}" ${type ? `type="${type}"` : ''}>`}</div>`).join('')}<input type="hidden" data-k="key" value=""><button type="button" class="icon-btn" data-rm="${ad}" title="Remove">✕</button></div>`); return; }
      const rm = e.target.closest('[data-rm]'); if (rm) { rm.closest('.hr-lrow').remove(); return; }
      const a = e.target.closest('[data-a]')?.dataset.a;
      if (a === 'here') { if (!navigator.geolocation) return toast('Location isn’t available here.', 'warn'); navigator.geolocation.getCurrentPosition(p => { $('pcLa').value = p.coords.latitude.toFixed(5); $('pcLo').value = p.coords.longitude.toFixed(5); toast('Location filled in — press Save.'); }, () => toast('This page wasn’t allowed to read the location.', 'warn'), { timeout: 8000 }); }
      if (a === 'save') { try { await H.saveRules(readSettings()); toast('HR settings saved.'); } catch (er) { fail(er); } }
      if (a === 'sample') { try { toast('Loading sample data…'); const n = await H.loadSample(); toast(`${n} sample staff loaded with punches, an advance and a bonus.`); } catch (er) { fail(er); } }
      if (a === 'unsample' && await confirmBox('Remove sample data?', 'Deletes the sample staff and everything linked to them (punches, leave, advance and its journal, allowances).', 'Remove', true)) { try { const n = await H.removeSample(); toast(`${n} sample staff removed.`); } catch (er) { fail(er); } }
      if (a === 'guide') import('./views-hr-pay.js').then(m => m.guideDialog());
      if (a === 'acsave') { try { const ac = {}; Object.keys(H.ACCT_LABELS).forEach(k => ac[k] = val('ac_' + k)); const pmAcc = {}; Object.keys(H.PAY_METHODS).forEach(k => { if ($('pm_' + k)) pmAcc[k] = val('pm_' + k); }); const em = val('pmEm').replace(/\s+/g, ''), rt = val('pmRt').replace(/\s+/g, ''); if (em && !/^\d{13}$/.test(em)) throw Error('The WPS employer ID should be 13 digits.'); if (rt && !/^\d{9}$/.test(rt)) throw Error('The bank routing code should be 9 digits.'); await H.saveRules({ pay: { employerId: em, routing: rt, acc: pmAcc, perStaff: $('pmPS').checked }, acct: ac, eosb: { enabled: $('eoOn').checked, days1: num(val('eoD1'), 21), days2: num(val('eoD2'), 30), afterYears: num(val('eoY'), 5), minYears: num(val('eoMin'), 1) } }); const n = await H.setupAccounts(); toast('Accounting settings saved' + (n ? ` — ${n} account(s) set up in the chart of accounts.` : '.')); } catch (er) { fail(er); } }
      if (a === 'eoob') { try { const d = val('eoObD'); let n = 0; for (const i of document.querySelectorAll('[data-eoob]')) { const cur = r2(num(i.dataset.cur)), v = r2(num(i.value)); if (v !== cur) { await H.saveEosbOpening(i.dataset.eoob, v, d); n++; } } toast(n ? `${n} opening provision(s) posted.` : 'Nothing changed.'); } catch (er) { fail(er); } }
    });
  }
};
function acctPanel(R, ed) {
  if (!H.isOwner() && !H.allowedView('accounts')) return '';
  const accs = all('accounts').sort((a, b) => String(a.code).localeCompare(String(b.code)));
  const types = { basic: ['expense'], ot: ['expense'], allow: ['expense'], incentive: ['expense'], eosbExp: ['expense'], fines: ['income', 'expense'], adv: ['asset'], payable: ['liability'], eosbProv: ['liability'] };
  const D = H.DEFAULT_ACCT, opt = (k, cur) => { const list = accs.filter(a => types[k].includes(a.type)); const hasCur = list.some(a => a.id === cur); return (hasCur ? '' : `<option value="${cur}" selected>${esc(cur === D[k] ? 'New: ' + ({ basic: 'Salaries & Wages', ot: 'Overtime', allow: 'Staff Allowances', incentive: 'Incentives, Bonuses & Commission', fines: 'Staff Fines & Recoveries', adv: 'Staff Advances', payable: 'Salaries Payable', eosbExp: 'End-of-service Benefits', eosbProv: 'End-of-service Provision' }[k]) + ' (created on save)' : cur)}</option>`) + list.map(a => `<option value="${a.id}"${a.id === cur ? ' selected' : ''}>${esc(a.code + ' · ' + a.name)}</option>`).join(''); };
  L.derive(true); const bal = H.staffBalances(), E = R.eosb, od = L.openingDate();
  const obs = H.staffList().filter(s => !s.noPunch).map(s => { const j = all('journals').find(x => x.src === 'hr' && x.refType === 'eosbopen' && x.srcRef === s.id && x.status !== 'void'); return { s, v: j ? num(j.total) : 0 }; });
  return `<div class="panel" style="margin-top:16px"><h2>📒 Accounting</h2><p class="hint" style="margin:-6px 0 10px">Where payroll, advances and gratuity are posted. Each staff member's advance, unpaid salary and gratuity are tracked by name inside these accounts (Accounts → Trial balance / Balance sheet → tap the line).</p>
    <fieldset ${ed ? '' : 'disabled'} style="border:0;padding:0;margin:0"><div class="grid g2" style="gap:0 16px">${Object.entries(H.ACCT_LABELS).map(([k, l]) => field(l, `<select id="ac_${k}">${opt(k, R.acct[k])}</select>`)).join('')}</div>
    <h3 style="margin:10px 0 6px;font-size:14px">End-of-service gratuity provision</h3>
    <label class="check"><input type="checkbox" id="eoOn"${E.enabled ? ' checked' : ''}> Set aside gratuity every month when payroll is finalized</label>
    <div class="row3" style="grid-template-columns:repeat(4,minmax(0,1fr))">${field('Days per year (first years)', input('eoD1', E.days1, 'type="number" min="0"'))}${field('…for this many years', input('eoY', E.afterYears, 'type="number" min="0" step=".5"'))}${field('Days per year after that', input('eoD2', E.days2, 'type="number" min="0"'))}${field('Nothing if under (years)', input('eoMin', E.minYears, 'type="number" min="0" step=".5"'))}</div>
    <p class="hint" style="margin:0 0 10px">UAE private sector: 21 days' basic per year for the first 5 years, 30 days per year after, from 1 year of service, capped at 2 years' pay. Monthly provision = basic × 12 ÷ 365 × days ÷ 12. Owners and “no punching” staff are left out.</p>
    <h3 style="margin:10px 0 6px;font-size:14px">Salary payments</h3>
    <label class="check"><input type="checkbox" id="pmPS"${R.pay.perStaff ? ' checked' : ''}> A separate “Salary Payable – name” account for each employee (under Salaries payable, codes 2300-001, 2300-002 …)</label>
    <div class="grid g3" style="gap:0 16px">${Object.entries(H.PAY_METHODS).map(([k, l]) => field(l + ' — paid from', `<select id="pm_${k}">${all('accounts').filter(a => (a.group === 'cash' || a.group === 'bank') && a.status !== 'inactive').sort((a, b) => String(a.code).localeCompare(String(b.code))).map(a => `<option value="${a.id}"${a.id === H.payDefaultAcc(k) ? ' selected' : ''}>${esc(a.code + ' · ' + a.name)}</option>`).join('')}</select>`)).join('')}</div>
    <div class="row2">${field('WPS employer ID (13 digits)', input('pmEm', R.pay.employerId || '', 'inputmode="numeric" placeholder="MOHRE establishment no."'))}${field('Your bank’s routing code (9 digits)', input('pmRt', R.pay.routing || '', 'inputmode="numeric" placeholder="Bank / exchange that runs your payroll"'))}</div>
    <p class="hint" style="margin:0 0 10px">The account picked for each method is filled in automatically when you pay salaries (you can still change it per person). The WPS details are used for the WPS salary file (SIF) in Pay salaries. Check the file format with your bank or exchange house the first time.</p>
    ${ed ? '<button class="btn btn-ink" data-a="acsave">Save accounting settings</button>' : ''}</fieldset>
    ${E.enabled && obs.length ? `<h3 style="margin:16px 0 6px;font-size:14px">Opening gratuity provision (built up before using the app)</h3><div class="row3" style="align-items:end">${field('Opening date', input('eoObD', od, 'type="date"'))}</div>
      <div class="tw"><table><thead><tr><th>Staff</th><th class="hide-m">Joined</th><th class="num">Provision now</th><th class="num" style="width:160px">Opening amount</th></tr></thead><tbody>${obs.map(({ s, v }) => `<tr><td>${esc(s.name)}</td><td class="hide-m">${fmtDate(s.joinDate, { day: 'numeric', month: 'short', year: 'numeric' })}</td><td class="num">${money((bal[s.id] || {}).eosb || 0)}</td><td><input type="number" min="0" step=".01" class="inp inp-sm num" data-eoob="${s.id}" data-cur="${v}" value="${v || ''}"></td></tr>`).join('')}</tbody></table></div>
      ${ed ? '<button class="btn btn-sm" data-a="eoob" style="margin-top:8px">Post opening provisions</button>' : ''}<p class="hint" style="margin-top:6px">Posted as Opening Balance Equity → End-of-service Provision, per person. Opening <b>advances</b>: use Salary Advances → New advance → “Paid from: Opening balance”.</p>` : ''}</div>`;
}
const slug = s => String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, '').slice(0, 14) || 'x' + Date.now().toString(36);
function readSettings() {
  const rows = id => [...$(id).querySelectorAll('.hr-lrow')].map(r => { const o = {}; r.querySelectorAll('[data-k]').forEach(i => o[i.dataset.k] = i.type === 'checkbox' ? i.checked : i.value.trim()); return o; });
  const lt = rows('lt').filter(x => x.label).map(x => ({ key: x.key || slug(x.label), label: x.label, paid: !!x.paid, quota: num(x.quota) }));
  const rs = rows('rs').filter(x => x.label).map(x => ({ key: x.key || slug(x.label), label: x.label, paid: !!x.paid }));
  const ho = rows('ho').filter(x => x.date).map(x => ({ date: x.date, name: x.name || 'Holiday' }));
  if (!lt.length) throw Error('Keep at least one leave type.'); if (!rs.length) throw Error('Keep at least one out reason.');
  if (new Set(lt.map(x => x.key)).size !== lt.length || new Set(rs.map(x => x.key)).size !== rs.length) throw Error('Two items have the same name.');
  const tz = val('pcTz') || 'Asia/Dubai'; try { new Intl.DateTimeFormat('en', { timeZone: tz }); } catch (e) { throw Error('Unknown time zone — use a name like Asia/Dubai.'); }
  return { leaveTypes: lt, reasons: rs, holidays: ho, defaultOff: [...document.querySelectorAll('[data-dwo]:checked')].map(x => +x.dataset.dwo), dayBasis: val('psB'), prorateAllowances: $('psPr').checked, dailyPaidHolidays: $('psDH').checked, ownerApproval: $('psOA').checked,
    punch: { self: $('pcS').checked, pin: $('pcP').checked, kiosk: $('pcP').checked, location: val('pcL'), lat: num(val('pcLa')), lng: num(val('pcLo')), radius: num(val('pcR'), 200) }, tz };
}

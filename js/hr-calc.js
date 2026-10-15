// GRID Shop Manager — HR & Payroll calculation engine.
// Pure functions only (no screen or database code), so the same rules run in the app and in the automated tests.
'use strict';

export const DEFAULT_RULES = {
  tz: 'Asia/Dubai',
  shifts: [{ id: 'gen', name: 'General shift', start: '09:00', end: '18:00', breakMin: 60 }],
  graceLate: 10, graceEarly: 10,            // minutes allowed before lateness / early leaving counts
  halfDayHours: 4, absentHours: 2,         // net hours below these → Half-day / Absent
  // deduction policy for late punch-in and for early punch-out — decided by management
  // mode: none | perMinute (pro-rata pay for the minutes) | fixed (amount per time) | halfDay / fullDay (after every N times)
  late: { mode: 'none', amount: 0, everyN: 3, freeCount: 0, factor: 1 },
  early: { mode: 'none', amount: 0, everyN: 3, freeCount: 0, factor: 1 },
  ot: { enabled: true, minMinutes: 30, round: 15, multiplier: 1.25, offDayMultiplier: 1.5, needApproval: false },
  dayBasis: '30',                           // '30' | 'calendar' | 'working' — how a monthly salary becomes a day rate
  prorateAllowances: true,
  dailyPaidHolidays: false,                 // daily / hourly staff paid for public holidays?
  missingOut: 'flag',                       // 'flag' (count nothing after the last In) | 'shiftEnd' (assume they left at shift end)
  autoOut: { enabled: false, afterMin: 60 }, // auto punch-out at shift end for anyone still In this long after the shift ends
  autoBreak: true,                          // take the shift's break allowance off a full day when the break wasn't punched
  reasons: [
    { key: 'break', label: 'Lunch / Break', paid: false }, { key: 'errand', label: 'Official errand', paid: true },
    { key: 'personal', label: 'Personal', paid: false }, { key: 'prayer', label: 'Prayer', paid: true }, { key: 'other', label: 'Other', paid: false }
  ],
  leaveTypes: [
    { key: 'annual', label: 'Annual leave', paid: true, quota: 30 }, { key: 'sick', label: 'Sick leave', paid: true, quota: 15 },
    { key: 'paid', label: 'Other paid leave', paid: true, quota: 0 }, { key: 'unpaid', label: 'Unpaid leave', paid: false, quota: 0 }
  ],
  holidays: [],                             // [{ date: 'YYYY-MM-DD', name }]
  defaultOff: [5],                          // weekly off days, 0 = Sunday … 5 = Friday
  ownerApproval: true,                      // payroll needs the owner's approval before it can be finalized
  punch: { self: true, kiosk: false, pin: false, location: 'off', lat: 0, lng: 0, radius: 200 }
};
export const STATUS = { P: 'Present', H: 'Half-day', A: 'Absent', L: 'Leave', HO: 'Holiday', WO: 'Weekly off', NA: 'Not employed', UP: 'Upcoming' };
export const STATUS_KEY = Object.fromEntries(Object.entries(STATUS).map(([k, v]) => [v, k]));

const r2 = n => Math.round((Number(n) + Number.EPSILON) * 100) / 100;
const num = (v, d = 0) => { const n = Number(v); return Number.isFinite(n) ? n : d; };
export const hm = s => { const m = /^(\d{1,2}):(\d{2})$/.exec(String(s || '')); return m ? +m[1] * 60 + +m[2] : 0; };
export const fmtMin = m => { m = Math.round(num(m)); const s = m < 0 ? '-' : ''; m = Math.abs(m); return s + Math.floor(m / 60) + ':' + String(m % 60).padStart(2, '0'); };
export const clock = m => m == null ? '' : String(Math.floor(((m % 1440) + 1440) % 1440 / 60)).padStart(2, '0') + ':' + String(((m % 60) + 60) % 60).padStart(2, '0');

/* ---------- shop time zone ---------- */
const FMT = {};
// local date (YYYY-MM-DD) and minute of the day for a timestamp in the shop's time zone
export function localParts(t, tz = 'Asia/Dubai') {
  const f = FMT[tz] || (FMT[tz] = new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }));
  const p = {}; for (const x of f.formatToParts(new Date(t))) p[x.type] = x.value;
  return { date: `${p.year}-${p.month}-${p.day}`, min: (+p.hour % 24) * 60 + +p.minute };
}
// timestamp for a local date + "HH:MM" in the shop's time zone
export function tsFor(date, time, tz = 'Asia/Dubai') {
  const [y, mo, d] = date.split('-').map(Number), m = hm(time);
  let t = Date.UTC(y, mo - 1, d, Math.floor(m / 60), m % 60);
  for (let i = 0; i < 2; i++) { const lp = localParts(t, tz), want = Date.UTC(y, mo - 1, d) / 6e4 + m, got = Date.UTC(...lp.date.split('-').map((v, k) => k === 1 ? v - 1 : +v)) / 6e4 + lp.min; t += (want - got) * 6e4; }
  return t;
}
export const daysInMonth = month => { const [y, m] = month.split('-').map(Number); return new Date(Date.UTC(y, m, 0)).getUTCDate(); };
export const monthDates = month => Array.from({ length: daysInMonth(month) }, (_, i) => month + '-' + String(i + 1).padStart(2, '0'));
export const weekday = date => new Date(date + 'T00:00:00Z').getUTCDay();

/* ---------- one day ---------- */
// punches: [{ t, type: 'in' | 'out', reason }] for one person and one local date.
// ctx: { date, today, nowMin, tz, shift, stdMin, rules, off, holiday, leave: { paid, half, label }, override: { status }, otApproved, employed }
export function computeDay(punches, ctx) {
  const R = ctx.rules || DEFAULT_RULES, tz = ctx.tz || R.tz, sh = ctx.shift || R.shifts[0];
  const start = hm(sh.start), end = hm(sh.end) > hm(sh.start) ? hm(sh.end) : hm(sh.end) + 1440;
  const stdMin = num(ctx.stdMin) || Math.max(60, end - start - num(sh.breakMin));
  const paidReason = new Set((R.reasons || []).filter(x => x.paid).map(x => x.key));
  const P = (punches || []).filter(p => !p.del && p.t).map(p => { const lp = localParts(p.t, tz); let m = lp.min; if (lp.date > ctx.date) m += 1440; return { ...p, m }; }).sort((a, b) => a.m - b.m || a.t - b.t);
  const flags = [], outBy = {};
  let state = 'out', lastIn = null, lastOut = null, work = 0, firstIn = null, open = false, assumedOut = null;
  for (const p of P) {
    if (p.type === 'in') {
      if (state === 'in') { flags.push('double-in'); continue; }
      if (lastOut) { const r = !lastOut.reason || lastOut.reason === 'end' ? 'other' : lastOut.reason; outBy[r] = (outBy[r] || 0) + (p.m - lastOut.m); }
      if (firstIn == null) firstIn = p.m;
      state = 'in'; lastIn = p;
    } else {
      if (state !== 'in') { flags.push('out-without-in'); continue; }
      work += p.m - lastIn.m; state = 'out'; lastOut = p;
    }
  }
  const isToday = ctx.today && ctx.date === ctx.today;
  const AO = R.autoOut || {};
  if (state === 'in' && AO.enabled && (!isToday || (ctx.nowMin != null && num(ctx.nowMin) >= end + num(AO.afterMin)))) {
    assumedOut = Math.max(end, lastIn.m); work += assumedOut - lastIn.m; flags.push('auto-out'); state = 'auto';
  }
  if (state === 'in') {
    if (isToday) { open = true; work += Math.max(0, num(ctx.nowMin, lastIn.m) - lastIn.m); }
    else { flags.push('missing-out'); if (R.missingOut === 'shiftEnd' && end > lastIn.m) { assumedOut = end; work += end - lastIn.m; flags.push('assumed-out'); } }
  }
  const lastOutM = state === 'out' && lastOut ? lastOut.m : assumedOut;
  const outMin = Object.values(outBy).reduce((s, v) => s + v, 0);
  const paidOut = Object.entries(outBy).reduce((s, [k, v]) => s + (paidReason.has(k) ? v : 0), 0), unpaidOut = outMin - paidOut;
  const dayOff = !!(ctx.off || ctx.holiday), worked = P.some(p => p.type === 'in');
  let netMin = Math.max(0, work + paidOut), assumedBreak = 0;
  if (R.autoBreak && !dayOff && !open && !(flags.includes('missing-out') && assumedOut == null) && unpaidOut < num(sh.breakMin) && netMin > num(R.halfDayHours) * 60) { assumedBreak = Math.min(num(sh.breakMin) - unpaidOut, netMin - num(R.halfDayHours) * 60); netMin -= assumedBreak; }
  const lateMin = worked && !dayOff && !ctx.exempt && firstIn > start + num(R.graceLate) ? firstIn - start : 0;
  const earlyMin = worked && !dayOff && !ctx.exempt && !open && lastOutM != null && lastOutM < end - num(R.graceEarly) ? end - lastOutM : 0;
  const excessBreak = Math.max(0, unpaidOut - num(sh.breakMin));
  if (P.some(p => !p.del && (p.src === 'manager' || p.typed))) flags.push('manual');
  if (P.some(p => p.src === 'auto')) flags.push('auto-out');
  if (P.some(p => (p.hist || []).length)) flags.push('edited');
  if (netMin > 14 * 60) flags.push('long-day');

  let status;
  if (ctx.employed === false) status = STATUS.NA;
  else if (ctx.override && ctx.override.status) status = ctx.override.status;
  else if (!worked && ctx.today && ctx.date > ctx.today) status = ctx.leave && !ctx.leave.half ? STATUS.L : ctx.holiday ? STATUS.HO : ctx.off ? STATUS.WO : STATUS.UP;
  else if (ctx.leave && !ctx.leave.half && !worked) status = STATUS.L;
  else if (ctx.exempt && !worked) status = ctx.holiday ? STATUS.HO : ctx.off ? STATUS.WO : ctx.today && ctx.date > ctx.today ? STATUS.UP : STATUS.P; // attendance not tracked (e.g. owners)
  else if (!worked) status = ctx.holiday ? STATUS.HO : ctx.off ? STATUS.WO : isToday ? STATUS.UP : STATUS.A;
  else if (open) status = STATUS.P;
  else if (netMin < num(R.absentHours) * 60) { status = STATUS.A; flags.push('too-short'); }
  else if (netMin < num(R.halfDayHours) * 60) status = STATUS.H;
  else status = STATUS.P;
  if (worked && dayOff) flags.push('worked-off-day');

  // overtime: on a normal day, minutes beyond the standard hours; on an off day / holiday, all of it
  let otRaw = 0;
  const O = R.ot || {};
  if (O.enabled && worked && !open && [STATUS.P, STATUS.H].includes(status)) otRaw = dayOff ? netMin : netMin - stdMin;
  let otMin = otRaw >= num(O.minMinutes) && otRaw > 0 ? Math.floor(otRaw / Math.max(1, num(O.round, 1))) * Math.max(1, num(O.round, 1)) : 0;
  const otPending = O.needApproval && otMin > 0 && ctx.otApproved == null;
  if (ctx.otApproved != null) otMin = Math.max(0, num(ctx.otApproved)); else if (O.needApproval) otMin = 0;

  // pay units for the day (monthly staff): 1 = paid in full, 0 = not paid
  const leavePaid = ctx.leave ? !!ctx.leave.paid : false;
  let paidUnits = 0;
  if (status === STATUS.P || status === STATUS.UP) paidUnits = 1;
  else if (status === STATUS.H) paidUnits = ctx.leave && ctx.leave.half && leavePaid ? 1 : 0.5;
  else if (status === STATUS.L) paidUnits = leavePaid ? 1 : 0;
  else if (status === STATUS.HO || status === STATUS.WO) paidUnits = 1;
  return {
    date: ctx.date, status, punches: P.length, firstIn, lastOut: lastOutM, open, assumedOut,
    grossMin: firstIn != null && lastOutM != null ? lastOutM - firstIn : open ? Math.max(0, num(ctx.nowMin) - firstIn) : 0,
    workMin: work, assumedBreak, outMin, outBy, paidOutMin: paidOut, unpaidOutMin: unpaidOut, excessBreak, netMin, stdMin,
    lateMin, earlyMin, otMin, otRaw: Math.max(0, otRaw), otPending, offDay: dayOff, leave: ctx.leave || null,
    paidUnits, regularMin: Math.min(netMin, stdMin), flags: [...new Set(flags)], onBreak: state === 'out' && isToday && lastOut && lastOut.reason && lastOut.reason !== 'end' ? lastOut.reason : null
  };
}

/* ---------- one month for one person ---------- */
// opt: { month, today, nowMin, staff: { joinDate, endDate, weeklyOff, shiftId }, salary: { type, stdHours }, punchesByDate, verByDate, leaves, rules }
export function computeMonth(opt) {
  const R = opt.rules || DEFAULT_RULES, st = opt.staff || {}, sal = opt.salary || {};
  const shift = (R.shifts || []).find(s => s.id === st.shiftId) || (R.shifts || [])[0] || DEFAULT_RULES.shifts[0];
  const stdMin = num(sal.stdHours) ? num(sal.stdHours) * 60 : 0;
  const offs = Array.isArray(st.weeklyOff) ? st.weeklyOff : (R.defaultOff || []);
  const hol = Object.fromEntries((R.holidays || []).map(h => [h.date, h.name || 'Holiday']));
  const T = { days: 0, employedDays: 0, workDays: 0, workDaysFull: 0, present: 0, half: 0, absent: 0, leavePaid: 0, leaveUnpaid: 0, holidays: 0, offs: 0, upcoming: 0, notEmployed: 0,
    lateCount: 0, lateMin: 0, earlyCount: 0, earlyMin: 0, otMin: 0, otOffMin: 0, otPendingMin: 0, netMin: 0, regularMin: 0, outMin: 0, outBy: {}, excessBreak: 0,
    unverified: 0, flagged: 0, manual: 0, paidUnits: 0, unpaidUnits: 0, missingOut: 0 };
  const rows = monthDates(opt.month).map(date => {
    const employed = (!st.joinDate || date >= st.joinDate) && (!st.endDate || date <= st.endDate);
    const off = offs.includes(weekday(date)), holiday = hol[date] || null;
    const lv = (opt.leaves || []).find(l => l.status === 'approved' && date >= l.from && date <= (l.to || l.from));
    const lt = lv ? (R.leaveTypes || []).find(t => t.key === lv.type) : null;
    const leave = lv && !off && !holiday ? { paid: lt ? !!lt.paid : !!lv.paid, half: !!lv.half, label: lt ? lt.label : lv.type, id: lv.id } : null;
    const ver = (opt.verByDate || {})[date] || {};
    const d = computeDay((opt.punchesByDate || {})[date] || [], { date, today: opt.today, nowMin: opt.nowMin, tz: R.tz, shift, stdMin, rules: R, off, holiday, leave, override: ver.override ? { status: ver.override } : null, otApproved: ver.otApproved, employed, exempt: !!st.noPunch });
    d.verified = !!ver.verified; d.verifiedBy = ver.by || ''; d.note = ver.note || ''; d.holidayName = holiday; d.weekday = weekday(date);
    T.days++;
    if (!employed) { T.notEmployed++; return d; }
    T.employedDays++;
    if (!off && !holiday) T.workDays++;
    const past = !opt.today || date < opt.today;
    switch (d.status) {
      case STATUS.P: T.present++; break; case STATUS.H: T.half++; break; case STATUS.A: T.absent++; break;
      case STATUS.L: d.leave && d.leave.paid ? T.leavePaid++ : T.leaveUnpaid++; break; case STATUS.HO: T.holidays++; break; case STATUS.WO: T.offs++; break; case STATUS.UP: T.upcoming++; break;
    }
    if (d.status === STATUS.H && d.leave && d.leave.half) d.leave.paid ? (T.leavePaid += 0.5) : (T.leaveUnpaid += 0.5);
    if (d.lateMin) { T.lateCount++; T.lateMin += d.lateMin; }
    if (d.earlyMin) { T.earlyCount++; T.earlyMin += d.earlyMin; }
    if (d.offDay) T.otOffMin += d.otMin; else T.otMin += d.otMin;
    if (d.otPending) T.otPendingMin += d.otRaw;
    T.netMin += d.netMin; T.regularMin += [STATUS.P, STATUS.H].includes(d.status) && !d.offDay ? d.regularMin : 0; T.outMin += d.outMin; T.excessBreak += d.excessBreak;
    for (const [k, v] of Object.entries(d.outBy)) T.outBy[k] = (T.outBy[k] || 0) + v;
    d.needsCheck = !st.noPunch && (d.punches > 0 || [STATUS.P, STATUS.H, STATUS.A].includes(d.status));
    if (past && !d.verified && d.needsCheck) T.unverified++;
    if (d.flags.some(f => ['double-in', 'out-without-in', 'missing-out', 'long-day', 'too-short'].includes(f))) T.flagged++;
    if (d.flags.includes('missing-out')) T.missingOut++;
    if (d.flags.includes('manual') || d.flags.includes('edited')) T.manual++;
    T.paidUnits += d.paidUnits; T.unpaidUnits += 1 - d.paidUnits;
    return d;
  });
  // working days in the whole month (for the "working days" salary basis), ignoring join / leave dates
  T.workDaysFull = monthDates(opt.month).filter(d => !offs.includes(weekday(d)) && !hol[d]).length;
  return { rows, totals: T, shift, stdMin: stdMin || Math.max(60, hm(shift.end) - hm(shift.start) - num(shift.breakMin)) };
}

/* ---------- pay for one person for one month ---------- */
// opt: { month, salary: { type, base, stdHours, otRate, allowances: [{ name, amount }] }, summary (computeMonth().totals), stdMin, rules,
//        items: [{ id, kind, label, calc, value }], sales, advances: [{ id, no, outstanding, perInst }], recovery: { advId: amount }, adjustments: [{ label, amount, reason }] }
export function computePay(opt) {
  const R = opt.rules || DEFAULT_RULES, S = opt.salary || {}, T = opt.summary, dim = daysInMonth(opt.month);
  const type = S.type || 'monthly', base = num(S.base), stdH = (num(S.stdHours) || num(opt.stdMin) / 60 || 8);
  const basis = R.dayBasis === 'calendar' ? dim : R.dayBasis === 'working' ? Math.max(1, T.workDaysFull) : 30;
  const dayRate = type === 'monthly' ? base / basis : type === 'daily' ? base : base * stdH;
  const hourRate = type === 'hourly' ? base : dayRate / stdH;
  const E = [], D = [], warn = [];
  const add = (arr, label, amount, note = '', key = '') => { amount = r2(amount); if (Math.abs(amount) >= 0.005) arr.push({ label, amount, note, key }); };
  let payRatio = 1;
  if (type === 'monthly') {
    add(E, 'Basic salary', base, S.split && S.split.length > 1 ? 'revised mid-month: ' + S.split.map(x => `${x.d1}–${x.d2}: ${r2(x.base)}`).join(' · ') : '', 'basic');
    if (T.notEmployed) { const notEmp = basis === dim || R.dayBasis === '30' ? base * T.notEmployed / dim : dayRate * T.notEmployed; add(D, 'Not employed', notEmp, `${T.notEmployed} of ${dim} days (joined / left mid-month)`, 'notemp'); }
    const unpaid = r2(T.unpaidUnits);
    if (unpaid > 0) add(D, 'Absence & unpaid leave', unpaid * dayRate, `${unpaid} day${unpaid === 1 ? '' : 's'} × ${r2(dayRate)}`, 'absence');
    payRatio = Math.max(0, (dim - T.notEmployed - unpaid) / dim);
  } else if (type === 'daily') {
    const units = T.present + T.half * 0.5 + T.leavePaid + (R.dailyPaidHolidays ? T.holidays : 0);
    add(E, 'Days worked', units * base, `${r2(units)} day${units === 1 ? '' : 's'} × ${r2(base)}`, 'basic');
    payRatio = T.employedDays ? units / Math.max(1, T.workDays) : 0;
  } else {
    const hrs = T.regularMin / 60 + (T.leavePaid + (R.dailyPaidHolidays ? T.holidays : 0)) * stdH;
    add(E, 'Hours worked', hrs * base, `${r2(hrs)} h × ${r2(base)}`, 'basic');
    payRatio = T.employedDays ? Math.min(1, hrs / Math.max(1, T.workDays * stdH)) : 0;
  }
  // overtime
  const otRate = num(S.otRate) > 0 ? num(S.otRate) : hourRate * num((R.ot || {}).multiplier, 1.25);
  const otOffRate = num(S.otRate) > 0 ? num(S.otRate) : hourRate * num((R.ot || {}).offDayMultiplier, 1.5);
  if (T.otMin) add(E, 'Overtime', T.otMin / 60 * otRate, `${fmtMin(T.otMin)} h × ${r2(otRate)}`, 'ot');
  if (T.otOffMin) add(E, 'Overtime (off days / holidays)', T.otOffMin / 60 * otOffRate, `${fmtMin(T.otOffMin)} h × ${r2(otOffRate)}`, 'otoff');
  if (T.otPendingMin) warn.push(`${fmtMin(T.otPendingMin)} h overtime waiting for approval is not included.`);
  // fixed allowances from the salary setup
  for (const a of S.allowances || []) if (num(a.amount)) add(E, a.name || 'Allowance', num(a.amount) * (R.prorateAllowances && payRatio < 1 ? payRatio : 1), R.prorateAllowances && payRatio < 1 ? `prorated ${Math.round(payRatio * 100)}%` : '', 'allow');
  // late punch-in and early punch-out — the management policy
  const policy = (p, count, mins, label, key) => {
    if (!p || p.mode === 'none' || !count) return;
    const n = Math.max(0, count - num(p.freeCount));
    if (p.mode === 'perMinute') { if (mins) add(D, label, mins / 60 * hourRate * num(p.factor, 1), `${mins} min${num(p.factor, 1) !== 1 ? ' × ' + p.factor : ''}`, key); }
    else if (p.mode === 'fixed') { if (n) add(D, label, n * num(p.amount), `${n} time${n === 1 ? '' : 's'} × ${r2(p.amount)}`, key); }
    else if (p.mode === 'halfDay' || p.mode === 'fullDay') { const k = Math.floor(n / Math.max(1, num(p.everyN, 1))); if (k) add(D, label, k * (p.mode === 'halfDay' ? 0.5 : 1) * dayRate, `${n} time${n === 1 ? '' : 's'} → ${k} × ${p.mode === 'halfDay' ? 'half' : 'full'} day`, key); }
  };
  policy(R.late, T.lateCount, T.lateMin, 'Late arrival deduction', 'late');
  policy(R.early, T.earlyCount, T.earlyMin, 'Early leaving deduction', 'early');
  // incentives, bonuses, allowances, fines and other deductions entered for the month
  for (const it of opt.items || []) {
    const v = num(it.value), amt = it.calc === 'percent' ? base * v / 100 : it.calc === 'sales' ? num(opt.sales) * v / 100 : v;
    const note = it.calc === 'percent' ? `${v}% of basic` : it.calc === 'sales' ? `${v}% of sales ${r2(opt.sales)}` : (it.note || '');
    add(['fine', 'deduction'].includes(it.kind) ? D : E, it.label || it.kind, amt, note, it.kind + ':' + (it.id || ''));
    if (it.prepaid && !['fine', 'deduction'].includes(it.kind)) add(D, (it.label || it.kind) + ' — paid already', amt, 'paid ' + (it.prepaid.date || ''), 'prepaid:' + (it.id || ''));
  }
  for (const a of opt.adjustments || []) { const v = num(a.amount); if (v > 0) add(E, a.label || 'Adjustment', v, a.reason || '', 'adj'); else if (v < 0) add(D, a.label || 'Adjustment', -v, a.reason || '', 'adj'); }
  const gross = r2(E.reduce((s, x) => s + x.amount, 0));
  let ded = r2(D.reduce((s, x) => s + x.amount, 0));
  // advance instalments, never taking pay below zero
  const rec = []; let room = Math.max(0, gross - ded);
  for (const a of opt.advances || []) {
    const out = r2(num(a.outstanding)); if (out <= 0) continue;
    let due = opt.recovery && opt.recovery[a.id] != null ? num(opt.recovery[a.id]) : Math.min(out, num(a.perInst) || out);
    due = r2(Math.max(0, Math.min(due, out)));
    if (due > room) { warn.push(`Advance ${a.no || ''}: only ${r2(room)} of ${due} could be recovered this month.`); due = r2(room); }
    room = r2(room - due);
    if (due > 0) { rec.push({ advId: a.id, no: a.no || '', amount: due, before: out, after: r2(out - due) }); add(D, 'Advance recovery' + (a.no ? ' ' + a.no : ''), due, `balance ${r2(out - due)} after this`, 'adv:' + a.id); }
  }
  ded = r2(D.reduce((s, x) => s + x.amount, 0));
  const net = r2(gross - ded);
  if (net < 0) warn.push('Deductions are more than earnings — net pay is below zero.');
  return { type, basis, dayRate: r2(dayRate), hourRate: r2(hourRate), earnings: E, deductions: D, gross, totalDed: ded, net, recoveries: rec, warnings: warn, payRatio: r2(payRatio) };
}

/* ---------- salary revisions (increments) ---------- */
// revs: [{ from: 'YYYY-MM-DD', type, base, stdHours, otRate, allowances }] — each one applies from its date until the next
export function salaryAtDate(revs, date) { const R = [...(revs || [])].sort((a, b) => a.from.localeCompare(b.from)); if (!R.length) return null; let cur = R[0]; for (const r of R) if (r.from <= date) cur = r; return cur; }
// salary for a payroll month: when a revision starts inside the month, basic and allowances are pro-rated by calendar days
export function salaryForMonth(revs, month) {
  const R = [...(revs || [])].sort((a, b) => a.from.localeCompare(b.from)); if (!R.length) return null;
  const dim = daysInMonth(month), first = month + '-01', last = month + '-' + String(dim).padStart(2, '0');
  const start = salaryAtDate(R, first), inside = R.filter(r => r.from > first && r.from <= last);
  if (!inside.length) return { ...start, split: null };
  const segs = []; let cur = start, d1 = 1;
  for (const r of inside) { const d = +r.from.slice(8); if (d > d1) segs.push({ s: cur, d1, d2: d - 1 }); cur = r; d1 = d; }
  segs.push({ s: cur, d1, d2: dim });
  const w = g => (g.d2 - g.d1 + 1) / dim;
  const names = [...new Set(segs.flatMap(g => (g.s.allowances || []).map(a => a.name)))];
  return { ...cur, base: r2(segs.reduce((x, g) => x + num(g.s.base) * w(g), 0)),
    allowances: names.map(n => ({ name: n, amount: r2(segs.reduce((x, g) => x + num(((g.s.allowances || []).find(a => a.name === n) || {}).amount) * w(g), 0)) })).filter(a => a.amount),
    split: segs.map(g => ({ d1: g.d1, d2: g.d2, base: r2(num(g.s.base)) })) };
}

/* ---------- accounting ---------- */
// ledger accounts payroll posts to (HR Settings → Accounting can point them elsewhere)
export const DEFAULT_ACCT = { basic: 'a6100', ot: 'a6110', allow: 'a6120', incentive: 'a6130', fines: 'a4110', adv: 'a1450', payable: 'a2300', eosbExp: 'a6140', eosbProv: 'a2310' };
// UAE-style end-of-service gratuity accrued per month: 21 days' basic per year of service for the first 5 years, 30 days after
export function eosbMonthly(sal, years, E = {}) {
  const days = years >= num(E.afterYears, 5) ? num(E.days2, 30) : num(E.days1, 21), base = num(sal && sal.base);
  const daily = !sal ? 0 : sal.type === 'daily' ? base : sal.type === 'hourly' ? base * num(sal.stdHours, 8) : base * 12 / 365;
  return r2(daily * days / 12);
}
// gratuity due on leaving: 21 days per year for the first 5 years + 30 days per year after, nothing under 1 year, capped at 2 years' basic
export function eosbDue(sal, years, E = {}) {
  if (years < num(E.minYears, 1)) return 0;
  const a = num(E.afterYears, 5), base = num(sal && sal.base), daily = !sal ? 0 : sal.type === 'daily' ? base : sal.type === 'hourly' ? base * num(sal.stdHours, 8) : base * 12 / 365;
  const days = num(E.days1, 21) * Math.min(years, a) + num(E.days2, 30) * Math.max(0, years - a);
  const cap = sal && sal.type === 'monthly' ? base * 24 : daily * 730;
  return r2(Math.min(daily * days, cap));
}
// the payroll journal: expenses by kind (basic net of absence / late, overtime, allowances, incentives & bonuses, gratuity)
// against what each person is owed (Salaries Payable), advances recovered (Staff Advances), fines (income) and the gratuity provision.
// Lines tagged e = staff id so every staff balance can be traced.
export function payrollLines(rows, A = DEFAULT_ACCT) {
  const exp = {}, out = [], addExp = (acc, v) => { exp[acc] = (exp[acc] || 0) + v; };
  for (const r of rows) {
    const p = r.pay;
    for (const x of p.earnings) { const k = x.key || ''; addExp(k === 'ot' || k === 'otoff' ? A.ot : k === 'allow' || k.startsWith('allowance:') ? A.allow : k.startsWith('incentive:') || k.startsWith('bonus:') ? A.incentive : A.basic, x.amount); }
    const PA = r.payAcc || A.payable;
    for (const x of p.deductions) { const k = x.key || ''; if (k.startsWith('adv:')) out.push({ acc: A.adv, cr: x.amount, e: r.staffId }); else if (k.startsWith('prepaid:')) out.push({ acc: PA, cr: x.amount, e: r.staffId }); else if (k.startsWith('fine:') || k.startsWith('deduction:')) out.push({ acc: A.fines, cr: x.amount, e: r.staffId }); else addExp(A.basic, -x.amount); }
    if (p.net > 0) out.push({ acc: PA, cr: p.net, e: r.staffId }); else if (p.net < 0) out.push({ acc: PA, dr: -p.net, e: r.staffId });
    if (num(r.eosb) > 0) { addExp(A.eosbExp, num(r.eosb)); out.push({ acc: A.eosbProv, cr: num(r.eosb), e: r.staffId }); }
  }
  const lines = [...Object.entries(exp).map(([acc, v]) => (v = r2(v)) >= 0 ? { acc, dr: v, cr: 0 } : { acc, dr: 0, cr: -v }), ...out.map(l => ({ ...l, dr: r2(l.dr || 0), cr: r2(l.cr || 0) }))].filter(l => l.dr || l.cr);
  const diff = r2(lines.reduce((s, l) => s + l.dr - l.cr, 0)); // rounding cents go to basic salaries
  if (diff) { const b = lines.find(l => l.acc === A.basic); if (b) { if (b.dr) b.dr = r2(b.dr - diff); else b.cr = r2(b.cr + diff); } }
  return lines;
}

/* ---------- advances ---------- */
// outstanding balance from the advance and every recovery recorded against it
export function advanceState(a) {
  const recovered = r2((a.recoveries || []).reduce((s, x) => s + num(x.amount), 0));
  const outstanding = r2(Math.max(0, num(a.amount) - recovered));
  const perInst = a.plan === 'once' ? num(a.amount) : r2(num(a.amount) / Math.max(1, num(a.installments, 1)));
  return { recovered, outstanding, perInst, status: outstanding <= 0.004 ? 'closed' : 'open' };
}
// leave days in a period (half days count 0.5), excluding weekly offs and holidays
export function leaveDays(l, offs = [], holidays = []) {
  if (l.half) return 0.5;
  const H = new Set(holidays.map(h => h.date)); let n = 0;
  for (let d = new Date(l.from + 'T00:00:00Z'); ; d.setUTCDate(d.getUTCDate() + 1)) { const s = d.toISOString().slice(0, 10); if (s > (l.to || l.from)) break; if (!offs.includes(d.getUTCDay()) && !H.has(s)) n++; }
  return n;
}

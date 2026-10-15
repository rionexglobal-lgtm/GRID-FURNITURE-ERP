// GRID Shop Manager — HR & Payroll: data layer (staff, punches, verification, leave, advances, allowances, payroll runs)
// Calculations live in hr-calc.js; this file reads and writes the shop database and posts payroll to the accounts.
import { num, r2, uid, pad, store, all, byId } from './core.js';
import { can, roleDef, may, nm, ACC, lockedUpTo, defaultOn, goodsNet } from './logic.js';
import { DEFAULT_RULES, STATUS, computeMonth, computePay, advanceState, localParts, tsFor, leaveDays, monthDates, daysInMonth, fmtMin, salaryAtDate, salaryForMonth, DEFAULT_ACCT, payrollLines, eosbMonthly, eosbDue } from './hr-calc.js';
export { STATUS, fmtMin, monthDates, daysInMonth, advanceState, leaveDays, tsFor, localParts };

// collections every HR user loads (Editor level only — see the access rules)
export const HR_COLLS = ['hrStaff', 'hrSalary', 'hrDocs', 'hrDays', 'hrLeave', 'hrAdvances', 'hrItems', 'hrRuns'];
export const HR_VIEWS = ['hratt', 'hrstaff', 'hrshifts', 'hrpay', 'hradv', 'hrinc', 'hrrep', 'hrset'];
export const ACCT = { salaries: 'a6100', advances: 'a1450', payable: 'a2300' };
export { DEFAULT_ACCT, payrollLines, eosbDue, eosbMonthly };
export const acct = () => hrRules().acct;
export const ACCT_LABELS = { basic: 'Basic salaries (net of absence & lateness)', ot: 'Overtime', allow: 'Allowances', incentive: 'Incentives, bonuses & commission', fines: 'Fines & other staff deductions (income)', adv: 'Staff advances (asset)', payable: 'Salaries payable (liability)', eosbExp: 'End-of-service benefits (expense)', eosbProv: 'End-of-service provision (liability)' };
export const DEPTS = ['Owner', 'Sales', 'Cashier', 'Store / Warehouse', 'Delivery & Fitting', 'Carpentry / Workshop', 'Cleaning', 'Office / Accounts', 'Management', 'Other'];
export const ITEM_KINDS = { allowance: 'Allowance', incentive: 'Incentive', bonus: 'Bonus', fine: 'Fine', deduction: 'Other deduction' };
export const ITEM_CALC = { fixed: 'Fixed amount', percent: '% of basic salary', sales: '% of own sales (invoices)' };
export const PAY_METHODS = { cash: 'Cash', bank: 'Bank transfer', wps: 'WPS salary transfer', cheque: 'Cheque', wallet: 'Payroll card / wallet' };
export const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

const me = () => store.me;
const stamp = () => ({ updatedAt: Date.now(), updatedBy: me()?.id || '' });
const created = () => ({ createdAt: Date.now(), createdBy: me()?.id || '' });
const set = (coll, id, data) => ({ t: 'set', coll, id, data });
const upd = (coll, id, data) => ({ t: 'update', coll, id, data });
const commit = ops => store.db.commit(ops);
const nextNo = async (key, prefix, w = 5) => prefix + '-' + pad(await store.db.nextNumber(key), w);

/* ============ rules & time ============ */
export function hrRules() {
  const s = byId('settings', 'hr') || {}, D = DEFAULT_RULES;
  return { ...D, ...s, late: { ...D.late, ...(s.late || {}) }, early: { ...D.early, ...(s.early || {}) }, ot: { ...D.ot, ...(s.ot || {}) }, autoOut: { ...D.autoOut, ...(s.autoOut || {}) }, punch: { ...D.punch, ...(s.punch || {}) },
    shifts: s.shifts && s.shifts.length ? s.shifts : D.shifts, reasons: s.reasons && s.reasons.length ? s.reasons : D.reasons, leaveTypes: s.leaveTypes && s.leaveTypes.length ? s.leaveTypes : D.leaveTypes,
    holidays: s.holidays || [], defaultOff: s.defaultOff || D.defaultOff, acct: { ...DEFAULT_ACCT, ...(s.acct || {}) }, eosb: { enabled: false, days1: 21, days2: 30, afterYears: 5, minYears: 1, ...(s.eosb || {}) }, pay: { employerId: '', routing: '', perStaff: true, ...(s.pay || {}), acc: { ...((s.pay || {}).acc || {}) } } };
}
export async function saveRules(patch) { const cur = byId('settings', 'hr'); await commit([set('settings', 'hr', { ...(cur || {}), ...patch, ...stamp() })]); }
export const shopNow = () => { const R = hrRules(), p = localParts(Date.now(), R.tz); return { date: p.date, min: p.min, month: p.date.slice(0, 7), t: Date.now() }; };
export const reasonLabel = k => k === 'end' ? 'Left for the day' : (hrRules().reasons.find(r => r.key === k) || {}).label || k || '';
export const leaveLabel = k => (hrRules().leaveTypes.find(t => t.key === k) || {}).label || k;
export const shiftOf = s => { const R = hrRules(); return R.shifts.find(x => x.id === s.shiftId) || R.shifts[0]; };
export const prevMonth = m => { const [y, mo] = m.split('-').map(Number); return mo === 1 ? `${y - 1}-12` : `${y}-${pad(mo - 1, 2)}`; };
export const nextMonth = m => { const [y, mo] = m.split('-').map(Number); return mo === 12 ? `${y + 1}-01` : `${y}-${pad(mo + 1, 2)}`; };
export const monthLabel = m => new Date(m + '-01T00:00:00').toLocaleDateString('en-GB', { month: 'long', year: 'numeric' });

/* ============ who can do what ============ */
export const allowedView = n => { const m = me(); if (!m) return false; if (m.role === 'admin') return true; if (!can.office(m.role)) return false; const r = roleDef(m.roleId || m.role); return r.modules ? r.modules.includes(n) : defaultOn(n, r.base); };
export const hrAccess = () => HR_VIEWS.some(allowedView);
export const seesSalary = () => me()?.role === 'admin' || allowedView('hrpay') || allowedView('hradv');
export const isOwner = () => me()?.role === 'admin';

/* ============ staff ============ */
export const staffList = (opt = {}) => all('hrStaff').filter(s => opt.all || s.status !== 'inactive').sort((a, b) => String(a.name).localeCompare(String(b.name)));
export const staffById = id => byId('hrStaff', id);
// staff whose attendance is tracked (owners and anyone marked “no punching” are left out of punching screens)
export const tracked = (opt) => staffList(opt).filter(s => !s.noPunch);
// salary setup with its revisions: hrSalary/<staff id> holds the latest values plus history[] = every revision with its start date
const salFields = S => ({ type: S.type || 'monthly', base: r2(S.base), stdHours: num(S.stdHours) || 8, otRate: r2(S.otRate || 0), allowances: (S.allowances || []).map(a => ({ name: a.name, amount: r2(a.amount) })) });
export function salaryRevs(id) {
  const S = byId('hrSalary', id); if (!S) return [];
  const h = S.history && S.history.length ? S.history : [{ from: (byId('hrStaff', id) || {}).joinDate || '2000-01-01', ...salFields(S), reason: 'Starting salary' }];
  return [...h].sort((a, b) => a.from.localeCompare(b.from));
}
// salary in effect on a date (default: today); payMethod / bank details are always the latest
export const salaryOf = (id, date) => { const S = byId('hrSalary', id); if (!S) return null; const r = salaryAtDate(salaryRevs(id), date || shopNow().date); return { ...S, ...(r || {}) }; };
export const salaryMonth = (id, month) => { const S = byId('hrSalary', id); if (!S) return null; return { ...S, ...salaryForMonth(salaryRevs(id), month) }; };
export const nextRevision = id => salaryRevs(id).find(r => r.from > shopNow().date) || null;
export async function addIncrement(staffId, { from, base, allowances, reason }) {
  const s = byId('hrStaff', staffId), S = byId('hrSalary', staffId); if (!s || !S) throw Error('Set up the salary first.');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(from || '')) throw Error('Choose the effective date.');
  if (s.joinDate && from <= s.joinDate) throw Error('The effective date must be after the joining date.');
  const fin = all('hrRuns').filter(r => r.status === 'finalized' && r.items?.[staffId] && r.month >= from.slice(0, 7)).map(r => r.month).sort().pop();
  if (fin) throw Error(`Payroll for ${monthLabel(fin)} is already finalized. Choose a date after it, and add the difference for earlier months as an “Arrears” adjustment in the next payroll.`);
  base = r2(base); if (!(base > 0)) throw Error('Enter the new salary.');
  if (!String(reason || '').trim()) throw Error('Give a reason (e.g. annual increment, promotion).');
  const revs = salaryRevs(staffId).filter(r => r.from !== from), prev = salaryAtDate(revs, from) || revs[revs.length - 1];
  const rev = { from, ...salFields({ ...prev, base, allowances: allowances || prev.allowances }), reason: String(reason).trim(), prevBase: r2(prev.base), by: me()?.id || '', at: Date.now() };
  const history = [...revs, rev].sort((a, b) => a.from.localeCompare(b.from)), latest = history[history.length - 1];
  await commit([set('hrSalary', staffId, { ...S, ...salFields(latest), history, ...stamp() })]);
  return rev;
}
export async function deleteRevision(staffId, from) {
  const S = byId('hrSalary', staffId), revs = salaryRevs(staffId); if (revs.length < 2) throw Error('This is the only salary record.');
  if (all('hrRuns').some(r => r.status === 'finalized' && r.items?.[staffId] && r.month >= from.slice(0, 7))) throw Error('A finalized payroll already used this revision.');
  const history = revs.filter(r => r.from !== from), latest = history[history.length - 1];
  await commit([set('hrSalary', staffId, { ...S, ...salFields(latest), history, ...stamp() })]);
}
export const keysOf = s => [...new Set([s.userId, s.id].filter(Boolean))];
export const punchKey = s => s.userId || s.id;
export const employedIn = (s, month) => (!s.joinDate || s.joinDate.slice(0, 7) <= month) && (!s.endDate || s.endDate.slice(0, 7) >= month);
export async function saveStaff(p, salary) {
  const name = String(p.name || '').trim(); if (!name) throw Error('Enter the staff member’s name.');
  if (!p.joinDate) throw Error('Enter the joining date.');
  if (p.endDate && p.endDate < p.joinDate) throw Error('The leaving date is before the joining date.');
  if (p.userId && all('hrStaff').some(s => s.userId === p.userId && s.id !== p.id)) throw Error('That app user is already linked to another staff profile.');
  const id = p.id || 'st' + uid(), old = byId('hrStaff', id);
  const data = { name, empNo: p.empNo || old?.empNo || await nextNo('EMP', 'EMP', 3), dept: p.dept || 'Other', designation: String(p.designation || '').trim(), phone: String(p.phone || '').trim(),
    joinDate: p.joinDate, endDate: p.endDate || '', status: p.status === 'inactive' ? 'inactive' : 'active', userId: p.userId || '', shiftId: p.shiftId || hrRules().shifts[0].id,
    weeklyOff: Array.isArray(p.weeklyOff) ? p.weeklyOff.map(Number) : hrRules().defaultOff, photo: p.photo ?? old?.photo ?? '', noPunch: p.noPunch != null ? !!p.noPunch : p.dept === 'Owner', notes: String(p.notes || '').trim(), pinHash: p.pinHash ?? old?.pinHash ?? '',
    ...(old ? { createdAt: old.createdAt, createdBy: old.createdBy, ...stamp() } : created()) };
  const ops = [set('hrStaff', id, data)];
  await ensureAccounts(ops); await ensureStaffAccs(ops, [id]);
  if (salary) {
    const S = { type: ['monthly', 'daily', 'hourly'].includes(salary.type) ? salary.type : 'monthly', base: r2(salary.base), stdHours: num(salary.stdHours) || 8, otRate: r2(salary.otRate || 0),
      allowances: (salary.allowances || []).filter(a => a.name && num(a.amount)).map(a => ({ name: String(a.name).trim(), amount: r2(a.amount) })), payMethod: salary.payMethod || 'cash', bankInfo: String(salary.bankInfo || '').trim(), iban: String(salary.iban || '').replace(/\s+/g, '').toUpperCase(), wpsId: String(salary.wpsId || '').replace(/\s+/g, ''), routing: String(salary.routing || '').replace(/\s+/g, ''), ...stamp() };
    if (S.iban && !/^[A-Z]{2}\d{2}[A-Z0-9]{10,30}$/.test(S.iban)) throw Error('The IBAN doesn’t look right — it should start with the country code, e.g. AE07 0331 2345 6789 0123 456.');
    if (S.wpsId && !/^\d{14}$/.test(S.wpsId)) throw Error('The WPS person ID should be 14 digits (the personal number on the labour card).');
    if (S.routing && !/^\d{9}$/.test(S.routing)) throw Error('The bank routing code should be 9 digits.');
    if (S.base < 0) throw Error('Salary can’t be negative.');
    // editing the salary corrects the latest revision; increments are added with addIncrement
    const oldS = byId('hrSalary', id);
    if (oldS && oldS.history && oldS.history.length) { const h = [...oldS.history].sort((a, b) => a.from.localeCompare(b.from)); h[h.length - 1] = { ...h[h.length - 1], ...salFields(S) }; S.history = h; }
    ops.push(set('hrSalary', id, S));
  }
  // old link: clear the copy kept for the previously linked login
  if (old && old.userId && old.userId !== data.userId) ops.push(set('hrMine/' + old.userId + '/d', 'profile', { unlinked: true, ...stamp() }));
  ops.push(...mineOps({ ...data, id }, salary ? ops.find(o => o.coll === 'hrSalary').data : salaryOf(id)));
  if (data.userId && (!old || old.userId !== data.userId)) all('hrRuns').filter(r => r.status === 'finalized' && r.items?.[id]?.result).forEach(r => ops.push(set('hrMine/' + data.userId + '/d', 'ps_' + r.month, payslipData(r.month, r.items[id], { ...data, id }))));
  await commit(ops); return id;
}
export const hashPin = async (staffId, pin) => { const b = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(staffId + ':' + pin)); return [...new Uint8Array(b)].map(x => x.toString(16).padStart(2, '0')).join(''); };
export async function setPin(staffId, pin) { if (!/^\d{4,6}$/.test(pin || '')) throw Error('PIN must be 4–6 digits.'); await commit([upd('hrStaff', staffId, { pinHash: await hashPin(staffId, pin), ...stamp() })]); }
export async function checkPin(s, pin) { return !!s.pinHash && s.pinHash === await hashPin(s.id, pin); }
export async function saveDoc(d) {
  if (!d.staffId || !d.type) throw Error('Choose the document type.');
  if (d.image && d.image.length > 350000) throw Error('The image is too large — use a smaller photo.');
  const id = d.id || 'sd' + uid(); await commit([set('hrDocs', id, { staffId: d.staffId, type: d.type, number: String(d.number || '').trim(), expiry: d.expiry || '', note: String(d.note || '').trim(), image: d.image || '', ...stamp() })]); return id;
}
export async function deleteDoc(id) { await commit([{ t: 'delete', coll: 'hrDocs', id }]); }
export const docsOf = staffId => all('hrDocs').filter(d => d.staffId === staffId).sort((a, b) => String(a.expiry || '9').localeCompare(String(b.expiry || '9')));
export const expiringDocs = (days = 30) => { const lim = new Date(Date.now() + days * 864e5).toISOString().slice(0, 10); return all('hrDocs').filter(d => d.expiry && d.expiry <= lim).sort((a, b) => a.expiry.localeCompare(b.expiry)); };

/* ============ the private copy each linked person can read (hrMine/<their id>/d) ============ */
function mineOps(s, sal) {
  if (!s.userId) return [];
  const R = hrRules(), base = 'hrMine/' + s.userId + '/d';
  const advs = all('hrAdvances').filter(a => a.staffId === s.id && a.status !== 'void').map(a => { const st = advanceState(a); return { no: a.no, date: a.date, amount: r2(a.amount), outstanding: st.outstanding, perInst: st.perInst, reason: a.reason || '' }; });
  const yr = shopNow().date.slice(0, 4), leaves = all('hrLeave').filter(l => l.staffId === s.id && l.status === 'approved');
  const bal = R.leaveTypes.filter(t => num(t.quota) > 0).map(t => { const used = leaves.filter(l => l.type === t.key && l.from.startsWith(yr)).reduce((x, l) => x + leaveDays(l, s.weeklyOff || R.defaultOff, R.holidays), 0); return { key: t.key, label: t.label, quota: num(t.quota), used, left: r2(num(t.quota) - used) }; });
  return [set(base, 'profile', { staffId: s.id, name: s.name, empNo: s.empNo, dept: s.dept, designation: s.designation || '', joinDate: s.joinDate, shiftId: s.shiftId, weeklyOff: s.weeklyOff || [], noPunch: !!s.noPunch, stdHours: sal?.stdHours || 8, salaryType: sal?.type || 'monthly', status: s.status, ...stamp() }),
    set(base, 'summary', { advances: advs, advanceBalance: r2(advs.reduce((x, a) => x + a.outstanding, 0)), leave: bal, leaves: leaves.filter(l => l.from >= (+yr - 1) + '-01-01').map(l => ({ id: l.id, type: l.type, from: l.from, to: l.to, half: !!l.half, paid: !!l.paid, status: 'approved' })), ...stamp() })];
}
export const syncMineOps = staffId => { const s = byId('hrStaff', staffId); return s ? mineOps(s, salaryOf(staffId)) : []; };

/* ============ live loading of punches and leave requests (one subscription per person) ============ */
const subs = {};
let tick = 0; const bump = () => { store.version++; clearTimeout(tick); tick = setTimeout(() => store.rerender && store.rerender(), 80); };
function sub(path) {
  if (subs[path] || !store.db) return; subs[path] = true;
  store.db.watch(path, [], docs => { store.data[path] = Object.fromEntries(docs.map(d => [d.id, d])); bump(); }, e => { console.warn('hr read', path, e && (e.code || e.message)); subs[path] = 'err'; });
}
let accCheck = false;
export function watchHR() { if (!hrAccess()) return;
  if (!accCheck && isOwner() && hrRules().pay.perStaff && all('hrStaff').some(s => !byId('accounts', 'asp_' + s.id))) { accCheck = true; setTimeout(() => setupAccounts().catch(() => {}), 0); }
  staffList({ all: true }).forEach(s => { keysOf(s).forEach(k => sub('hrPunch/' + k + '/m')); if (s.userId) sub('hrLeaveReq/' + s.userId + '/r'); }); }
export function watchMine() { const id = me()?.id; if (!id) return; sub('hrPunch/' + id + '/m'); sub('hrMine/' + id + '/d'); sub('hrLeaveReq/' + id + '/r'); }
export const mine = () => store.data['hrMine/' + me()?.id + '/d'] || {};
export const myProfile = () => { const p = mine().profile; return p && !p.unlinked ? { ...p, id: p.staffId, userId: me()?.id } : (all('hrStaff').find(s => s.userId === me()?.id) || null); };

/* ============ punches ============ */
// one document per person per month: hrPunch/<key>/m/<YYYY-MM> → { staffId, month, days: { date: [punch] } }
function monthDocs(s, month) { return keysOf(s).map(k => ({ key: k, doc: (store.data['hrPunch/' + k + '/m'] || {})[month] })).filter(x => x.doc); }
export function punchesByDate(s, month) {
  const out = {};
  for (const { doc } of monthDocs(s, month)) for (const [d, list] of Object.entries(doc.days || {})) (out[d] = out[d] || []).push(...list);
  for (const d in out) out[d].sort((a, b) => a.t - b.t);
  return out;
}
export const dayPunches = (s, date) => (punchesByDate(s, date.slice(0, 7))[date] || []).filter(p => !p.del);
export const isLocked = (staffId, month) => !!(byId('hrDays', staffId + '_' + month) || {}).locked;
const lockedMonthMine = (s, month) => isLocked(s.id, month) || !!(mine()['lock_' + month] || {}).locked;
async function freshMonthDoc(key, month) { const coll = 'hrPunch/' + key + '/m'; let d = null; try { d = await store.db.get(coll, month); } catch (e) { d = (store.data[coll] || {})[month] || null; } return d; }
// current position (optional, set in HR settings)
async function location() {
  const P = hrRules().punch; if (!P.location || P.location === 'off') return null;
  const pos = await new Promise(res => { if (!navigator.geolocation) return res(null); navigator.geolocation.getCurrentPosition(p => res(p), () => res(null), { timeout: 8000, maximumAge: 60000, enableHighAccuracy: true }); });
  if (!pos) { if (P.location === 'require') throw Error('Location is needed to punch, but this device did not share it. Allow location, or ask a manager to enter your punch.'); return { err: 'unavailable' }; }
  const { latitude: lat, longitude: lng, accuracy: acc } = pos.coords;
  const dist = P.lat ? Math.round(haversine(lat, lng, num(P.lat), num(P.lng))) : null;
  if (P.location === 'require' && dist != null && dist > num(P.radius, 200) + Math.min(acc || 0, 100)) throw Error(`You seem to be ${dist} m from the shop. Punch from the shop, or ask a manager.`);
  return { lat: r2(lat * 1e4) / 1e4, lng: r2(lng * 1e4) / 1e4, acc: Math.round(acc || 0), dist };
}
function haversine(a, b, c, d) { const R = 6371000, t = x => x * Math.PI / 180, dl = t(c - a), dn = t(d - b); const h = Math.sin(dl / 2) ** 2 + Math.cos(t(a)) * Math.cos(t(c)) * Math.sin(dn / 2) ** 2; return 2 * R * Math.asin(Math.sqrt(h)); }
// add a punch. src: 'self' (own phone) | 'manager' (entered for them) | 'kiosk' (shop terminal with PIN)
export async function addPunch(s, { type, reason, note, time, date, src = 'self', why }) {
  if (!s) throw Error('Staff not found.');
  if (!['in', 'out'].includes(type)) throw Error('Choose In or Out.');
  const R = hrRules(), now = shopNow(), d = date || now.date, t = time ? tsFor(d, time, R.tz) : Date.now();
  if (type === 'out' && !reason) throw Error('Choose why you are going out.');
  if (reason === 'other' && src === 'self' && !String(note || '').trim()) throw Error('Write a short note for “Other”.');
  if (t > Date.now() + 5 * 60000) throw Error('That time is in the future.');
  const month = localParts(t, R.tz).date.slice(0, 7), day = localParts(t, R.tz).date;
  if (lockedMonthMine(s, month)) throw Error(`Attendance for ${monthLabel(month)} is locked.`);
  if (src !== 'self' && src !== 'auto' && time && !String(why || '').trim()) throw Error('Give a reason for entering a punch by hand.');
  const loc = src === 'self' && !time ? await location() : null;
  const key = punchKey(s), coll = 'hrPunch/' + key + '/m', cur = await freshMonthDoc(key, month);
  const days = { ...((cur || {}).days || {}) }, list = [...(days[day] || [])];
  const last = list.filter(p => !p.del).sort((a, b) => a.t - b.t).pop();
  if (last && last.type === type && !time) throw Error(type === 'in' ? 'Already punched In — punch Out first.' : 'Already Out — punch In first.');
  list.push({ id: 'p' + uid(), t, type, reason: type === 'out' ? reason : '', note: String(note || '').trim(), src, by: me()?.id || '', at: Date.now(), ...(time && src !== 'auto' ? { typed: true, why: String(why || '').trim() } : {}), ...(src === 'auto' ? { why: String(why || '') } : {}), ...(loc ? { loc } : {}) });
  days[day] = list;
  await commit([set(coll, month, { staffId: s.id, key, month, days, ...stamp() })]);
}
// change or delete a punch — always with a reason; the old values stay in the punch's history
export async function editPunch(s, date, punchId, ch, why) {
  if (!String(why || '').trim()) throw Error('A reason is required to change attendance.');
  const R = hrRules(), month = date.slice(0, 7); if (isLocked(s.id, month)) throw Error(`Attendance for ${monthLabel(month)} is locked. Unlock the month first.`);
  for (const key of keysOf(s)) {
    const coll = 'hrPunch/' + key + '/m', cur = await freshMonthDoc(key, month); if (!cur) continue;
    const days = { ...(cur.days || {}) }; const list = [...(days[date] || [])], i = list.findIndex(p => p.id === punchId); if (i < 0) continue;
    const p = list[i], h = { t: p.t, type: p.type, reason: p.reason || '', note: p.note || '', del: !!p.del, by: me()?.id || '', at: Date.now(), why: String(why).trim() };
    const np = { ...p, hist: [...(p.hist || []), h] };
    if (ch.delete) np.del = true;
    if (ch.restore) np.del = false;
    if (ch.time) { np.t = tsFor(date, ch.time, R.tz); if (np.t > Date.now() + 5 * 60000) throw Error('That time is in the future.'); }
    if (ch.type) np.type = ch.type;
    if (ch.reason !== undefined) np.reason = np.type === 'out' ? ch.reason : '';
    if (ch.note !== undefined) np.note = ch.note;
    list[i] = np; days[date] = list;
    await commit([set(coll, month, { ...cur, days, ...stamp() })]); return;
  }
  throw Error('Punch not found.');
}
// mark everyone present for a day (shift start → shift end), skipping people who already have punches, are on leave or off
export async function markAllPresent(staffIds, date, why) {
  const R = hrRules(); let n = 0;
  for (const id of staffIds) {
    const s = byId('hrStaff', id); if (!s || dayPunches(s, date).length) continue;
    const sh = shiftOf(s); await addPunch(s, { type: 'in', time: sh.start, date, src: 'manager', why: why || 'Marked present by manager' });
    const end = date === shopNow().date && hm2(sh.end) > shopNow().min ? null : sh.end;
    if (end) await addPunch(s, { type: 'out', reason: 'end', time: end, date, src: 'manager', why: why || 'Marked present by manager' });
    n++;
  }
  return n;
}
const hm2 = s => { const m = /^(\d{1,2}):(\d{2})$/.exec(s || ''); return m ? +m[1] * 60 + +m[2] : 0; };

// auto punch-out: write the Out punch at shift end for anyone still In after the wait time (yesterday or earlier, or today once the wait has passed).
// Runs from any open page that can write the punch (a manager's Attendance screen, or the person's own My Attendance), at most every few minutes.
let lastSweep = 0;
export async function autoPunchOut(list, force) {
  const R = hrRules(); if (!R.autoOut.enabled || (!force && Date.now() - lastSweep < 4 * 60000)) return 0;
  list = list.filter(s => !s.noPunch);
  lastSweep = Date.now(); const now = shopNow(); let n = 0;
  for (const s of list) {
    for (const month of [prevMonth(now.month), now.month]) {
      if (lockedMonthMine(s, month)) continue;
      const pm = punchesByDate(s, month);
      for (const [date, all_] of Object.entries(pm)) {
        if (date > now.date) continue;
        const ps = all_.filter(p => !p.del).sort((a, b) => a.t - b.t), last = ps[ps.length - 1];
        if (!last || last.type !== 'in') continue;
        const sh = shiftOf(s), end = hm2(sh.end) > hm2(sh.start) ? hm2(sh.end) : hm2(sh.end) + 1440;
        if (date === now.date && now.min < end + num(R.autoOut.afterMin)) continue;
        const inMin = localParts(last.t, R.tz).min, outMin = Math.max(end, inMin);
        if (outMin >= 1440) continue; // shift runs past midnight — leave it for a manager
        try { await addPunch(s, { type: 'out', reason: 'end', time: pad(Math.floor(outMin / 60), 2) + ':' + pad(outMin % 60, 2), date, src: 'auto', why: `Auto punch-out ${R.autoOut.afterMin} min after shift end` }); n++; } catch (e) { console.warn('auto punch-out', s.name, date, e.message); }
      }
    }
  }
  return n;
}

/* ============ attendance per person per month ============ */
export function verOf(staffId, month) { return byId('hrDays', staffId + '_' + month) || { days: {} }; }
export function monthFor(s, month, opt = {}) {
  const R = hrRules(), now = shopNow();
  const sal = opt.salary || salaryOf(s.id, month + '-' + String(daysInMonth(month)).padStart(2, '0')) || { type: 'monthly', stdHours: 8 };
  const leaves = opt.leaves || all('hrLeave').filter(l => l.staffId === s.id);
  return computeMonth({ month, today: now.date, nowMin: now.min, staff: s, salary: sal, punchesByDate: opt.punches || punchesByDate(s, month), verByDate: opt.ver || verOf(s.id, month).days || {}, leaves, rules: R });
}
export function dayFor(s, date) { const m = monthFor(s, date.slice(0, 7)); return m.rows.find(r => r.date === date); }
// verify / correct days: changes = { verified, override, otApproved, note }
export async function verifyDays(staffId, dates, ch = {}) {
  const month = dates[0].slice(0, 7); if (dates.some(d => d.slice(0, 7) !== month)) throw Error('Verify one month at a time.');
  if (isLocked(staffId, month)) throw Error(`${monthLabel(month)} is locked.`);
  if ((ch.override !== undefined || ch.otApproved !== undefined) && !String(ch.note || '').trim()) throw Error('Give a reason for the correction.');
  const cur = byId('hrDays', staffId + '_' + month), days = { ...((cur || {}).days || {}) };
  for (const d of dates) {
    const x = { ...(days[d] || {}) };
    if (ch.verified !== undefined) { x.verified = !!ch.verified; x.by = me()?.id || ''; x.at = Date.now(); }
    if (ch.override !== undefined) { if (ch.override) x.override = ch.override; else delete x.override; }
    if (ch.otApproved !== undefined) { if (ch.otApproved === null) delete x.otApproved; else x.otApproved = Math.max(0, Math.round(num(ch.otApproved))); }
    if (ch.note !== undefined && String(ch.note).trim()) x.log = [...(x.log || []), { by: me()?.id || '', at: Date.now(), text: [ch.override !== undefined ? 'Status → ' + (ch.override || 'as punched') : '', ch.otApproved !== undefined ? 'OT → ' + (ch.otApproved == null ? 'as punched' : fmtMin(ch.otApproved)) : '', ch.verified !== undefined ? (ch.verified ? 'Verified' : 'Unverified') : ''].filter(Boolean).join(', ') + ' — ' + String(ch.note).trim() }];
    days[d] = x;
  }
  await commit([set('hrDays', staffId + '_' + month, { staffId, month, days, locked: false, ...stamp() })]);
}
// verify every past day that has no problems
export async function verifyClean(staffIds, month) {
  let n = 0; const today = shopNow().date;
  for (const id of staffIds) {
    const s = byId('hrStaff', id); if (!s || isLocked(id, month)) continue;
    const m = monthFor(s, month), ds = m.rows.filter(r => r.date < today && r.needsCheck && !r.verified && !r.flags.some(f => ['double-in', 'out-without-in', 'missing-out', 'long-day'].includes(f))).map(r => r.date);
    if (ds.length) { await verifyDays(id, ds, { verified: true }); n += ds.length; }
  }
  return n;
}
export async function lockMonth(month, lock = true) {
  if (!lock && !isOwner()) throw Error('Only the owner can unlock a month.');
  if (lock && month >= shopNow().month) throw Error('A month can be locked only after it has ended.');
  if (!lock && byId('hrRuns', month)?.status === 'finalized') throw Error('Payroll for this month is finalized. Reopen the payroll first.');
  const ops = [], probs = [];
  for (const s of staffList({ all: true }).filter(s => employedIn(s, month))) {
    if (lock) { const m = monthFor(s, month); if (m.totals.unverified) probs.push(`${s.name}: ${m.totals.unverified} day(s) not verified`); }
    const cur = byId('hrDays', s.id + '_' + month);
    ops.push(set('hrDays', s.id + '_' + month, { staffId: s.id, month, days: (cur || {}).days || {}, locked: lock, lockedBy: me()?.id || '', lockedAt: Date.now(), ...stamp() }));
    if (s.userId) ops.push(set('hrMine/' + s.userId + '/d', 'lock_' + month, { locked: lock, ...stamp() }));
  }
  if (probs.length) throw Error('Verify all days before locking:\n' + probs.slice(0, 8).join('\n'));
  await commit(ops.filter(Boolean));
}

/* ============ leave ============ */
export function leaveBalance(s, year) {
  const R = hrRules(), leaves = all('hrLeave').filter(l => l.staffId === s.id && l.status === 'approved' && l.from.startsWith(year));
  return R.leaveTypes.map(t => { const used = leaves.filter(l => l.type === t.key).reduce((x, l) => x + leaveDays(l, s.weeklyOff || R.defaultOff, R.holidays), 0); return { ...t, used, left: num(t.quota) ? r2(num(t.quota) - used) : null }; });
}
export async function addLeave({ id, staffId, type, from, to, half, reason, reqPath }) {
  const s = byId('hrStaff', staffId); if (!s) throw Error('Choose the staff member.');
  if (!from) throw Error('Choose the date.'); to = half ? from : (to || from); if (to < from) throw Error('The end date is before the start date.');
  if (isLocked(staffId, from.slice(0, 7)) || isLocked(staffId, to.slice(0, 7))) throw Error('That month is locked.');
  const R = hrRules(), t = R.leaveTypes.find(x => x.key === type); if (!t) throw Error('Choose the leave type.');
  const clash = all('hrLeave').find(l => l.id !== id && l.staffId === staffId && l.status === 'approved' && l.from <= to && (l.to || l.from) >= from); if (clash) throw Error(`Overlaps another leave (${clash.from}${clash.to !== clash.from ? ' – ' + clash.to : ''}).`);
  const days = leaveDays({ from, to, half }, s.weeklyOff || R.defaultOff, R.holidays);
  const bal = leaveBalance(s, from.slice(0, 4)).find(x => x.key === type);
  const lid = id || 'lv' + uid();
  const ops = [set('hrLeave', lid, { staffId, type, paid: !!t.paid, from, to, half: !!half, days, reason: String(reason || '').trim(), status: 'approved', approvedBy: me()?.id || '', approvedAt: Date.now(), reqPath: reqPath || '', ...created() })];
  if (reqPath) { const [p, rid] = reqPath.split('#'); ops.push(upd(p, rid, { status: 'approved', decidedBy: me()?.id || '', decidedAt: Date.now(), leaveId: lid })); }
  ops.push(...syncMineOpsAfter(staffId, { leaveAdd: { id: lid, staffId, type, from, to, half: !!half, status: 'approved' } }));
  await commit(ops);
  return { id: lid, overQuota: bal && bal.left != null && days > bal.left ? r2(days - bal.left) : 0 };
}
export async function cancelLeave(l, why) {
  if (isLocked(l.staffId, l.from.slice(0, 7))) throw Error('That month is locked.');
  await commit([upd('hrLeave', l.id, { status: 'cancelled', cancelReason: why || '', cancelledBy: me()?.id || '', ...stamp() }), ...syncMineOpsAfter(l.staffId, { leaveDel: l.id })]);
}
const syncMineOpsAfter = (staffId, ch) => {
  // recompute the person's copy as it will be after this change
  const s = byId('hrStaff', staffId); if (!s || !s.userId) return [];
  const saved = store.data.hrLeave || {}; const tmp = { ...saved };
  if (ch.leaveAdd) tmp[ch.leaveAdd.id] = ch.leaveAdd; if (ch.leaveDel) tmp[ch.leaveDel] = { ...tmp[ch.leaveDel], status: 'cancelled' };
  store.data.hrLeave = tmp; try { return mineOps(s, salaryOf(staffId)); } finally { store.data.hrLeave = saved; }
};
// requests sent by staff from their phone (hrLeaveReq/<their id>/r)
export async function requestLeave({ type, from, to, half, reason }) {
  const p = myProfile(); if (!p) throw Error('Your login is not linked to a staff profile yet. Ask HR.');
  if (!from) throw Error('Choose the date.'); to = half ? from : (to || from); if (to < from) throw Error('The end date is before the start date.');
  if (!hrRules().leaveTypes.some(t => t.key === type)) throw Error('Choose the leave type.');
  await commit([set('hrLeaveReq/' + me().id + '/r', 'q' + uid(), { staffId: p.id || p.staffId, type, from, to, half: !!half, reason: String(reason || '').trim(), status: 'pending', ...created() })]);
}
export const myRequests = () => Object.values(store.data['hrLeaveReq/' + me()?.id + '/r'] || {}).sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
export function pendingRequests() {
  const out = []; for (const s of staffList({ all: true })) if (s.userId) Object.values(store.data['hrLeaveReq/' + s.userId + '/r'] || {}).forEach(r => { if (r.status === 'pending') out.push({ ...r, staff: s, path: 'hrLeaveReq/' + s.userId + '/r#' + r.id }); });
  return out.sort((a, b) => a.from.localeCompare(b.from));
}
export async function rejectRequest(path, why) { const [p, id] = path.split('#'); await commit([upd(p, id, { status: 'rejected', decidedBy: me()?.id || '', decidedAt: Date.now(), note: why || '' })]); }

/* ============ advances ============ */
export const advList = staffId => all('hrAdvances').filter(a => a.status !== 'void' && (!staffId || a.staffId === staffId)).map(a => ({ ...a, ...advanceState(a) })).sort((a, b) => b.date.localeCompare(a.date));
// the default payroll accounts are created the first time they are needed (codes shift if the shop already uses them)
const DEF_ACC = { a6100: ['6100', 'Salaries & Wages', 'expense', 'opex'], a6110: ['6110', 'Overtime', 'expense', 'opex'], a6120: ['6120', 'Staff Allowances', 'expense', 'opex'], a6130: ['6130', 'Incentives, Bonuses & Commission', 'expense', 'opex'],
  a4110: ['4110', 'Staff Fines & Recoveries', 'income', 'other'], a1450: ['1450', 'Staff Advances', 'asset', 'staffadv'], a2300: ['2300', 'Salaries Payable', 'liability', 'salpay'], a6140: ['6140', 'End-of-service Benefits', 'expense', 'opex'], a2310: ['2310', 'End-of-service Provision', 'liability', 'eosb'] };
export const STAFF_GROUPS = { staffadv: 'adv', salpay: 'payable', eosb: 'eosbProv' };
async function ensureAccounts(ops, ids) {
  const want = ids || Object.values(acct()), used = new Set(all('accounts').map(a => a.code));
  for (const id of want) {
    const d = DEF_ACC[id], a = byId('accounts', id); if (!d) continue;
    if (!a) { let code = d[0]; while (used.has(code)) code = String(+code + 1); used.add(code); ops.push(set('accounts', id, { code, name: d[1], type: d[2], group: d[3], system: true })); }
    else if (a.system && a.group === 'other' && ['staffadv', 'salpay', 'eosb'].includes(d[3])) ops.push(upd('accounts', id, { group: d[3] }));
  }
}
// one “Salary Payable – <name>” account per employee (group Salaries payable, code 2300-<emp no>), when turned on in HR Settings
export const staffPayAcc = id => hrRules().pay.perStaff ? 'asp_' + id : acct().payable;
export const isPayableAcc = acc => acc === acct().payable || (byId('accounts', acc) || {}).group === 'salpay';
async function ensureStaffAccs(ops, ids) {
  if (!hrRules().pay.perStaff) return;
  const used = new Set(all('accounts').map(a => a.code)); ops.forEach(o => { if (o.coll === 'accounts' && o.data?.code) used.add(o.data.code); });
  for (const id of ids) {
    const s = ops.find(o => o.coll === 'hrStaff' && o.id === id)?.data || byId('hrStaff', id); if (!s) continue;
    const aid = 'asp_' + id, a = byId('accounts', aid), name = 'Salary Payable – ' + s.name;
    if (!a) { let n = +(String(s.empNo || '').replace(/\D/g, '') || 1), code; while (used.has(code = '2300-' + String(n).padStart(3, '0'))) n++; used.add(code); ops.push(set('accounts', aid, { code, name, type: 'liability', group: 'salpay', system: true, staffId: id, parent: acct().payable })); }
    else if (a.name !== name || a.group !== 'salpay') ops.push(upd('accounts', aid, { name, group: 'salpay' }));
  }
}
export async function setupAccounts() { const ops = []; await ensureAccounts(ops); await ensureStaffAccs(ops, all('hrStaff').map(s => s.id)); if (ops.length) await commit(ops); return ops.filter(o => o.coll === 'accounts').length; }
const jv = (id, no, date, memo, refType, lines, extra = {}) => set('journals', id, { no, date, memo, lines: lines.filter(l => r2(l.dr) || r2(l.cr)).map(l => ({ acc: l.acc, dr: r2(l.dr || 0), cr: r2(l.cr || 0), ...(l.e ? { e: l.e } : {}) })), party: extra.party || '', total: r2(lines.reduce((s, l) => s + num(l.dr), 0)), status: 'posted', src: 'hr', refType, ...created(), ...extra });
const okDate = d => { const L = lockedUpTo(); if (L && d <= L) throw Error(`Cash is closed up to ${L}. Use a later date.`); };
export async function addAdvance({ staffId, date, amount, reason, plan, installments, startMonth, accountId, kind, method, ref }) {
  const s = byId('hrStaff', staffId); if (!s) throw Error('Choose the staff member.');
  amount = r2(amount); if (!(amount > 0)) throw Error('Enter the amount.'); if (!date) throw Error('Choose the date.'); okDate(date);
  if (!accountId || !byId('accounts', accountId)) throw Error('Choose the cash or bank account it was paid from.');
  const n = plan === 'once' ? 1 : Math.max(1, Math.round(num(installments, 1)));
  if (!String(reason || '').trim()) throw Error('Write the reason for the advance.');
  const id = 'ad' + uid(), no = await nextNo('ADV', 'ADV'), jid = 'jh' + uid(), ops = [];
  const a = { no, staffId, staffName: s.name, date, amount, reason: String(reason).trim(), plan: n === 1 ? 'once' : 'inst', installments: n, startMonth: startMonth || nextMonth(date.slice(0, 7)), accountId, kind: kind === 'loan' ? 'loan' : 'advance', method: method || '', ref: String(ref || '').trim(), recoveries: [], status: 'open', journalId: jid, ...created() };
  ops.push(set('hrAdvances', id, a));
  await ensureAccounts(ops);
  ops.push(jv(jid, no, date, `${a.kind === 'loan' ? 'Staff loan' : 'Salary advance'} – ${s.name}${a.reason ? ' – ' + a.reason : ''}`, 'advance', [{ acc: acct().adv, dr: amount, e: staffId }, { acc: accountId, cr: amount }], { party: s.name, srcRef: id }));
  const tmp = { ...(store.data.hrAdvances || {}) }; store.data.hrAdvances = { ...tmp, [id]: { ...a, id } }; try { ops.push(...syncMineOps(staffId)); } finally { store.data.hrAdvances = tmp; }
  await commit(ops); return id;
}
// money paid back in cash outside payroll
export async function repayAdvance(a, { amount, date, accountId, note }) {
  const st = advanceState(a); amount = r2(amount); if (!(amount > 0)) throw Error('Enter the amount.'); if (amount > st.outstanding + 0.001) throw Error(`Only ${st.outstanding} is outstanding.`);
  okDate(date); if (!accountId) throw Error('Choose the account it was received in.');
  const jid = 'jh' + uid(), rec = [...(a.recoveries || []), { date, amount, source: 'cash', accountId, note: note || '', journalId: jid, by: me()?.id || '', at: Date.now() }];
  const ops = [upd('hrAdvances', a.id, { recoveries: rec, status: advanceState({ ...a, recoveries: rec }).status, ...stamp() })]; await ensureAccounts(ops);
  ops.push(jv(jid, a.no + '-R' + rec.length, date, `Advance repaid – ${a.staffName}`, 'advrepay', [{ acc: accountId, dr: amount }, { acc: acct().adv, cr: amount, e: a.staffId }], { party: a.staffName, srcRef: a.id }));
  const tmp = store.data.hrAdvances; store.data.hrAdvances = { ...tmp, [a.id]: { ...a, recoveries: rec } }; try { ops.push(...syncMineOps(a.staffId)); } finally { store.data.hrAdvances = tmp; }
  await commit(ops);
}
export async function voidAdvance(a, why) {
  if ((a.recoveries || []).length) throw Error('Some of this advance has been recovered — it can’t be deleted.');
  if (!String(why || '').trim()) throw Error('Give a reason.');
  const ops = [upd('hrAdvances', a.id, { status: 'void', voidReason: why, voidedBy: me()?.id || '', voidedAt: Date.now(), ...stamp() })];
  if (a.journalId && byId('journals', a.journalId)) ops.push(upd('journals', a.journalId, { status: 'void', voidReason: 'Advance deleted: ' + why, voidedAt: Date.now(), voidedBy: me()?.id || '' }));
  const tmp = store.data.hrAdvances; store.data.hrAdvances = { ...tmp, [a.id]: { ...a, status: 'void' } }; try { ops.push(...syncMineOps(a.staffId)); } finally { store.data.hrAdvances = tmp; }
  await commit(ops);
}

/* ============ allowances, incentives, bonuses, fines ============ */
export async function saveItem(it) {
  if (!ITEM_KINDS[it.kind]) throw Error('Choose the type.'); if (!ITEM_CALC[it.calc || 'fixed']) throw Error('Choose how it is worked out.');
  if (!(num(it.value) > 0)) throw Error('Enter the amount or percentage.');
  if (!it.staffIds || !it.staffIds.length) throw Error('Choose who gets it.');
  if (it.recurring ? !it.fromMonth : !it.month) throw Error('Choose the month.');
  if (it.recurring && it.toMonth && it.toMonth < it.fromMonth) throw Error('The end month is before the start month.');
  const label = String(it.label || '').trim() || ITEM_KINDS[it.kind];
  const ops = it.staffIds.map(sid => { const id = it.id && it.staffIds.length === 1 ? it.id : 'hi' + uid(); const old = byId('hrItems', id);
    return set('hrItems', id, { staffId: sid, kind: it.kind, label, calc: it.calc || 'fixed', value: r2(it.value), recurring: !!it.recurring, month: it.recurring ? '' : it.month, fromMonth: it.recurring ? it.fromMonth : '', toMonth: it.recurring ? (it.toMonth || '') : '', reason: String(it.reason || '').trim(), status: 'active', ...(old ? { createdAt: old.createdAt, createdBy: old.createdBy, ...stamp() } : created()) }); });
  await commit(ops); return ops.length;
}
export async function deleteItem(it, why) {
  const ops = [upd('hrItems', it.id, { status: 'deleted', ...stamp() })];
  if (it.prepaid && it.direct) { const j = byId('journals', it.prepaid.journalId); if (j) { okDate(j.date); ops.push(upd('journals', j.id, { status: 'void', voidReason: 'Staff payment removed' + (why ? ': ' + why : ''), voidedAt: Date.now(), voidedBy: me()?.id || '' })); } }
  else if (it.prepaid) {
    if (usedInFinal(it)) throw Error('That payroll month is finalized — this payment can’t be removed.');
    const r = runOf(it.month); if (r && ['approved', 'finalized'].includes(r.status)) throw Error(`Payroll for ${monthLabel(it.month)} is approved — send it back to draft first.`);
    if (it.prepaid.journalId && byId('journals', it.prepaid.journalId)) { okDate(byId('journals', it.prepaid.journalId).date); ops.push(upd('journals', it.prepaid.journalId, { status: 'void', voidReason: 'Staff payment removed' + (why ? ': ' + why : ''), voidedAt: Date.now(), voidedBy: me()?.id || '' })); }
  }
  await commit(ops);
}
// incentive / bonus / allowance / commission paid out directly (not through payroll):
// recorded straight away as an expense — Dr Incentives (or the expense account chosen), Cr Cash / Bank — tagged with the staff member.
export const EXTRA_PAY = { incentive: 'Incentive', bonus: 'Bonus', allowance: 'Allowance', commission: 'Commission' };
export const extraExpAcc = kind => kind === 'allowance' ? acct().allow : acct().incentive;
export async function payStaffExtra({ staffId, kind, label, amount, date, accountId, method, ref, reason, expenseAcc }) {
  const s = byId('hrStaff', staffId); if (!s) throw Error('Choose the staff member.');
  if (!EXTRA_PAY[kind]) throw Error('Choose the type of payment.');
  amount = r2(amount); if (!(amount > 0)) throw Error('Enter the amount.'); if (!/^\d{4}-\d{2}-\d{2}$/.test(date || '')) throw Error('Choose the date.'); okDate(date);
  const acc = byId('accounts', accountId); if (!acc || !['cash', 'bank'].includes(acc.group)) throw Error('Choose the cash or bank account it was paid from.');
  if (!PAY_METHODS[method]) throw Error('Choose how it was paid.');
  const exp = expenseAcc || extraExpAcc(kind), ea = byId('accounts', exp); if (ea && ea.type !== 'expense') throw Error('Choose an expense account.');
  const id = 'hi' + uid(), jid = 'jh' + uid(), no = await nextNo('SPAY', 'SPAY'), lab = String(label || '').trim() || EXTRA_PAY[kind];
  const ops = [set('hrItems', id, { staffId, kind: kind === 'commission' ? 'incentive' : kind, label: lab, calc: 'fixed', value: amount, recurring: false, month: date.slice(0, 7), fromMonth: '', toMonth: '', reason: String(reason || '').trim(), status: 'active', direct: true,
    prepaid: { no, date, accountId, method, ref: String(ref || '').trim(), journalId: jid, payType: kind, expenseAcc: exp }, ...created() })];
  await ensureAccounts(ops);
  ops.push(jv(jid, no, date, `${lab} – ${s.name}${reason ? ' – ' + String(reason).trim() : ''}${ref ? ' – ' + String(ref).trim() : ''}`, 'staffpay', [{ acc: exp, dr: amount, e: staffId }, { acc: accountId, cr: amount }], { party: s.name, srcRef: id }));
  await commit(ops); return no;
}
// every payment made to staff (salary, advance, loan, incentive …) for Money In & Out
export function staffPayments() {
  const out = salaryPayments().map(p => ({ ...p, type: 'Salary', methodLabel: PAY_METHODS[p.method] || p.method, forText: monthLabel(p.month) + (num(p.amount) < num(p.net) - 0.005 ? ' (part)' : ''), no: (byId('journals', p.journalId) || {}).no || '', rows: num(p.amount) < num(p.net) - 0.005 ? [['Net pay ' + monthLabel(p.month), p.net], ['Paid now', p.amount]] : [] }));
  all('hrAdvances').filter(a => a.status !== 'void' && a.accountId !== 'a3900').forEach(a => out.push({ date: a.date, at: a.createdAt, name: a.staffName, staffId: a.staffId, type: a.kind === 'loan' ? 'Loan' : 'Advance', forText: (a.reason || '') + (a.installments > 1 ? ` · repay ${a.installments} × ${r2(a.amount / a.installments)} from ${monthLabel(a.startMonth)}` : ` · repay from ${monthLabel(a.startMonth)} salary`), method: a.method || '', methodLabel: PAY_METHODS[a.method] || '', accountId: a.accountId, amount: a.amount, ref: a.ref || '', journalId: a.journalId, no: a.no, advId: a.id, by: a.createdBy }));
  all('hrItems').filter(i => i.prepaid && i.status !== 'deleted').forEach(i => out.push({ date: i.prepaid.date, at: i.createdAt, name: (byId('hrStaff', i.staffId) || {}).name || '?', staffId: i.staffId, type: EXTRA_PAY[i.prepaid.payType] || i.label, forText: i.direct ? i.label + (i.reason ? ' · ' + i.reason : '') : i.label + ' · ' + monthLabel(i.month) + ' payslip', method: i.prepaid.method, methodLabel: PAY_METHODS[i.prepaid.method] || '', accountId: i.prepaid.accountId, amount: i.value, ref: i.prepaid.ref, journalId: i.prepaid.journalId, itemId: i.id, no: i.prepaid.no, by: i.createdBy }));
  return out.sort((a, b) => b.date.localeCompare(a.date) || (b.at || 0) - (a.at || 0));
}
export const itemsFor = (staffId, month) => all('hrItems').filter(i => i.status !== 'deleted' && !i.direct && i.staffId === staffId && (i.recurring ? i.fromMonth <= month && (!i.toMonth || month <= i.toMonth) : i.month === month));
export const usedInFinal = it => !it.direct && all('hrRuns').some(r => r.status === 'finalized' && (it.recurring ? it.fromMonth <= r.month && (!it.toMonth || r.month <= it.toMonth) : it.month === r.month) && r.items?.[it.staffId]);
export function salesFor(s, month) {
  if (!s.userId) return 0;
  // value of the goods sold — without GST and other charges — less returns (a plain invoice counts its total, as before)
  return r2(all('invoices').filter(i => i.status !== 'void' && i.salesman === s.userId && String(i.date).startsWith(month))
    .reduce((x, i) => x + ((i.tax || num(i.chargesTotal)) && num(i.total) ? goodsNet(i) * (num(i.total) - num(i.credited)) / num(i.total) : num(i.total) - num(i.credited)), 0));
}

/* ============ payroll ============ */
export const runOf = month => byId('hrRuns', month) || null;
export const RUN_STATUS = { draft: 'Draft', submitted: 'Waiting for owner approval', approved: 'Approved', finalized: 'Finalized' };
// preview for every staff member employed in the month who has a salary set up
export function preview(month) {
  const run = runOf(month), R = hrRules(), rows = [];
  for (const s of staffList({ all: true }).filter(s => employedIn(s, month))) {
    const sal = salaryMonth(s.id, month); const x = (run?.items || {})[s.id] || {};
    if (run?.status === 'finalized' && x.result) { rows.push({ staff: s, salary: sal, m: x.month, pay: x.result, x, frozen: true }); continue; }
    if (!sal || !num(sal.base)) { rows.push({ staff: s, salary: sal, missing: true, x }); continue; }
    const m = monthFor(s, month, { salary: sal });
    const advs = all('hrAdvances').filter(a => a.staffId === s.id && a.status !== 'void' && (a.startMonth || '') <= month).map(a => { const st = advanceState({ ...a, recoveries: (a.recoveries || []).filter(r => r.runId !== month) }); return { id: a.id, no: a.no, outstanding: st.outstanding, perInst: st.perInst }; }).filter(a => a.outstanding > 0);
    const pay = computePay({ month, salary: sal, summary: m.totals, stdMin: m.stdMin, rules: R, items: itemsFor(s.id, month), sales: salesFor(s, month), advances: advs, recovery: x.recovery || {}, adjustments: x.adjustments || [] });
    rows.push({ staff: s, salary: sal, m: { totals: m.totals, stdMin: m.stdMin }, pay, x, advs });
  }
  return rows;
}
export function runProblems(month, rows = preview(month)) {
  const p = [];
  if (month >= shopNow().month) p.push(`${monthLabel(month)} hasn't ended yet — you can preview, but finalize after the month ends.`);
  rows.forEach(r => { if (r.missing) p.push(`${r.staff.name}: no salary set up (Staff Directory → Salary).`); else if (!r.frozen && r.m.totals.unverified) p.push(`${r.staff.name}: ${r.m.totals.unverified} day(s) not verified.`); if (r.pay && r.pay.net < 0) p.push(`${r.staff.name}: net pay below zero.`); });
  return p;
}
export async function saveRunItem(month, staffId, patch) {
  const run = runOf(month); if (run && ['approved', 'finalized'].includes(run.status)) throw Error('This payroll is approved — reopen it to change.');
  const items = { ...((run || {}).items || {}) }; items[staffId] = { ...(items[staffId] || {}), ...patch };
  await commit([set('hrRuns', month, { month, status: run?.status === 'submitted' ? 'submitted' : 'draft', items, ...(run ? { createdAt: run.createdAt, createdBy: run.createdBy, ...stamp() } : created()) })]);
}
export async function submitRun(month) {
  const rows = preview(month), p = runProblems(month, rows).filter(x => !x.includes("hasn't ended"));
  if (p.length) throw Error('Fix these first:\n' + p.slice(0, 8).join('\n'));
  const run = runOf(month), R = hrRules(), direct = isOwner() || !R.ownerApproval;
  await commit([set('hrRuns', month, { month, items: (run || {}).items || {}, ...(run ? { createdAt: run.createdAt, createdBy: run.createdBy } : created()), status: direct ? 'approved' : 'submitted', submittedBy: me()?.id || '', submittedAt: Date.now(), ...(direct ? { approvedBy: me()?.id || '', approvedAt: Date.now() } : {}), net: r2(rows.reduce((s, r) => s + (r.pay ? r.pay.net : 0), 0)), ...stamp() })]);
  return direct ? 'approved' : 'submitted';
}
export async function approveRun(month) { if (!isOwner()) throw Error('Only the owner can approve payroll.'); const run = runOf(month); if (!run || run.status !== 'submitted') throw Error('Nothing waiting for approval.'); await commit([upd('hrRuns', month, { status: 'approved', approvedBy: me().id, approvedAt: Date.now(), ...stamp() })]); }
export async function backToDraft(month, why) {
  const run = runOf(month); if (!run) return; if (run.status === 'finalized') throw Error('Finalized payroll must be reopened instead.');
  await commit([upd('hrRuns', month, { status: 'draft', returnedBy: me()?.id || '', returnNote: why || '', ...stamp() })]);
}
// finalize: lock attendance, freeze every payslip, record advance recoveries, post the payroll journal, give each person their payslip
export async function finalizeRun(month, postDate) {
  const run = runOf(month); if (!run || run.status !== 'approved') throw Error('Approve the payroll first.');
  if (month >= shopNow().month) throw Error('Finalize after the month has ended.');
  okDate(postDate);
  const rows = preview(month), probs = runProblems(month, rows); if (probs.length) throw Error('Fix these first:\n' + probs.slice(0, 8).join('\n'));
  const ops = [], items = { ...(run.items || {}) }, jid = 'jh' + uid();
  let gross = 0, net = 0, adv = 0;
  for (const r of rows) {
    const s = r.staff, p = r.pay; gross += p.gross; net += p.net;
    const eo = eosbFor(s, r.salary, month);
    items[s.id] = { ...(items[s.id] || {}), result: p, eosb: eo, month: { totals: r.m.totals, stdMin: r.m.stdMin }, name: s.name, empNo: s.empNo, dept: s.dept, designation: s.designation || '', salaryType: r.salary.type, base: r.salary.base, payMethod: r.salary.payMethod || 'cash', payAcc: staffPayAcc(s.id) };
    for (const rc of p.recoveries) { adv += rc.amount; const a = byId('hrAdvances', rc.advId); const recs = [...(a.recoveries || []).filter(x => x.runId !== month), { date: postDate, amount: rc.amount, source: 'payroll', runId: month, by: me()?.id || '', at: Date.now() }]; ops.push(upd('hrAdvances', a.id, { recoveries: recs, status: advanceState({ ...a, recoveries: recs }).status, ...stamp() })); }
    // lock the month's attendance
    const cur = byId('hrDays', s.id + '_' + month); ops.push(set('hrDays', s.id + '_' + month, { staffId: s.id, month, days: (cur || {}).days || {}, locked: true, lockedBy: me()?.id || '', lockedAt: Date.now(), ...stamp() }));
  }
  gross = r2(gross); net = r2(net); adv = r2(adv);
  const lines = payrollLines(rows.map(r => ({ staffId: r.staff.id, pay: r.pay, eosb: items[r.staff.id].eosb, payAcc: items[r.staff.id].payAcc })), acct()), eosbTot = r2(rows.reduce((x, r) => x + num(items[r.staff.id].eosb), 0));
  ops.unshift(set('hrRuns', month, { ...run, items, status: 'finalized', finalizedBy: me()?.id || '', finalizedAt: Date.now(), postDate, journalId: lines.length ? jid : '', gross, net, advRecovered: adv, eosb: eosbTot, ...stamp() }));
  await ensureAccounts(ops); await ensureStaffAccs(ops, rows.map(r => r.staff.id));
  if (lines.length) ops.push(jv(jid, 'PAYROLL-' + month, postDate, `Payroll ${monthLabel(month)} – ${rows.length} staff`, 'payroll', lines, { srcRef: month }));
  // payslips and balances for people who use the app
  const saved = store.data.hrAdvances; const tmp = { ...saved }; ops.filter(o => o.coll === 'hrAdvances').forEach(o => tmp[o.id] = { ...tmp[o.id], ...o.data }); store.data.hrAdvances = tmp;
  try { for (const r of rows) if (r.staff.userId) { ops.push(set('hrMine/' + r.staff.userId + '/d', 'ps_' + month, payslipData(month, items[r.staff.id], r.staff))); ops.push(...syncMineOps(r.staff.id)); ops.push(set('hrMine/' + r.staff.userId + '/d', 'lock_' + month, { locked: true, ...stamp() })); } }
  finally { store.data.hrAdvances = saved; }
  await commit(ops);
}
const payslipData = (month, x, s) => ({ month, staffId: s.id, name: x.name, empNo: x.empNo, dept: x.dept, designation: x.designation, salaryType: x.salaryType, earnings: x.result.earnings, deductions: x.result.deductions, gross: x.result.gross, totalDed: x.result.totalDed, net: x.result.net,
  att: pickAtt(x.month.totals), paid: x.paid || null, paidSoFar: paidOf(x), ...stamp() });
const pickAtt = T => ({ present: T.present, half: T.half, absent: T.absent, leavePaid: T.leavePaid, leaveUnpaid: T.leaveUnpaid, holidays: T.holidays, offs: T.offs, lateCount: T.lateCount, lateMin: T.lateMin, earlyCount: T.earlyCount, earlyMin: T.earlyMin, otMin: T.otMin + T.otOffMin, netMin: T.netMin, notEmployed: T.notEmployed });
export async function reopenRun(month, why) {
  if (!isOwner()) throw Error('Only the owner can reopen finalized payroll.');
  const run = runOf(month); if (!run || run.status !== 'finalized') return;
  if (Object.values(run.items || {}).some(x => paymentsOf(x).length)) throw Error('Some salaries are already marked paid. Undo those payments first.');
  if (!String(why || '').trim()) throw Error('Give a reason.');
  const ops = [upd('hrRuns', month, { status: 'approved', reopenedBy: me().id, reopenedAt: Date.now(), reopenNote: why, journalId: '', ...stamp() })];
  if (run.journalId && byId('journals', run.journalId)) ops.push(upd('journals', run.journalId, { status: 'void', voidReason: 'Payroll reopened: ' + why, voidedAt: Date.now(), voidedBy: me().id }));
  all('hrAdvances').forEach(a => { if ((a.recoveries || []).some(r => r.runId === month)) { const recs = a.recoveries.filter(r => r.runId !== month); ops.push(upd('hrAdvances', a.id, { recoveries: recs, status: advanceState({ ...a, recoveries: recs }).status, ...stamp() })); } });
  await commit(ops);
}
// record salary payment for some people (one journal per payment batch)
// salary payments: each person can be paid in one go or in parts, by their own method and from their own account.
// items[id].payments = every payment; items[id].paid is set once the full net pay is paid (older data only has .paid).
export const paymentsOf = x => !x ? [] : x.payments || (x.paid ? [{ id: 'p0', ...x.paid }] : []);
export const paidOf = x => r2(paymentsOf(x).reduce((s, p) => s + num(p.amount), 0));
export const dueOf = x => x && x.result ? r2(Math.max(0, num(x.result.net) - paidOf(x))) : 0;
export function payDefaultAcc(method) {
  const a = hrRules().pay.acc[method]; if (a && byId('accounts', a)) return a;
  if (method === 'cash') return ACC.cash;
  const banks = all('accounts').filter(x => x.group === 'bank' && x.status !== 'inactive').sort((x, y) => String(x.code).localeCompare(String(y.code)));
  return (banks.find(x => x.id === ACC.bank) || banks[0] || { id: ACC.cash }).id;
}
export function salaryDues() {
  return all('hrRuns').filter(r => r.status === 'finalized').sort((a, b) => a.month.localeCompare(b.month)).flatMap(r => Object.entries(r.items || {}).filter(([, x]) => x.result && !x.paid).map(([id, x]) => {
    const S = byId('hrSalary', id) || {};
    return { month: r.month, staffId: id, name: x.name, empNo: x.empNo, net: r2(x.result.net), paidSoFar: paidOf(x), due: dueOf(x), payMethod: S.payMethod || x.payMethod || 'cash', bankInfo: S.bankInfo || '', iban: S.iban || '', wpsId: S.wpsId || '', routing: S.routing || '', x };
  }));
}
export const salaryPayments = () => all('hrRuns').flatMap(r => Object.entries(r.items || {}).flatMap(([id, x]) => paymentsOf(x).filter(p => num(p.amount) > 0).map(p => ({ ...p, month: r.month, staffId: id, name: x.name, net: r2(x.result?.net) }))))
  .sort((a, b) => b.date.localeCompare(a.date) || (b.at || 0) - (a.at || 0));
// entries: [{ month, staffId, amount, method, accountId }] — one journal per account paid from
export async function paySalaries(entries, { date, ref }) {
  okDate(date); if (!entries.length) throw Error('Choose who was paid.');
  const runs = {}, byAcc = {}, now = Date.now(), who = me()?.id || '', mineSync = new Set();
  for (const e of entries) {
    const run = runs[e.month] || (runs[e.month] = runOf(e.month) && { ...runOf(e.month), items: { ...runOf(e.month).items } });
    if (!run || run.status !== 'finalized') throw Error(`Finalize the ${monthLabel(e.month)} payroll first.`);
    const x = run.items[e.staffId]; if (!x || !x.result) throw Error('Staff not in that payroll.'); if (x.paid) continue;
    const due = dueOf(x), amt = r2(e.amount), net = r2(x.result.net);
    if (amt < 0) throw Error('Amounts can’t be negative.');
    if (amt > due + 0.005) throw Error(`${x.name}: ${monthLabel(e.month)} has only ${due.toFixed(2)} left to pay.`);
    if (!amt && net > 0) continue;
    if (!PAY_METHODS[e.method]) throw Error(`${x.name}: choose how it was paid.`);
    const acc = byId('accounts', e.accountId); if (!acc || !['cash', 'bank'].includes(acc.group)) throw Error(`${x.name}: choose the cash or bank account it was paid from.`);
    const rec = { id: 'p' + uid(), date, method: e.method, accountId: e.accountId, ref: String(ref || '').trim(), amount: amt, by: who, at: now, journalId: '' };
    if (amt > 0) { const g = byAcc[e.accountId] || (byAcc[e.accountId] = { jid: 'jh' + uid(), lines: [], names: [], months: new Set() }); g.lines.push({ acc: x.payAcc || acct().payable, dr: amt, e: e.staffId }); g.names.push(x.name); g.months.add(e.month); rec.journalId = g.jid; }
    const pays = [...paymentsOf(x), rec], paid = r2(pays.reduce((s, p) => s + num(p.amount), 0));
    run.items[e.staffId] = { ...x, payments: pays, paid: paid >= net - 0.005 ? { date, method: e.method, accountId: e.accountId, ref: rec.ref, amount: paid, by: who, at: now, journalId: rec.journalId } : null };
    mineSync.add(e.month + '|' + e.staffId);
  }
  if (!mineSync.size) throw Error('Nothing to pay — enter an amount.');
  const ops = Object.values(runs).map(r => upd('hrRuns', r.month, { items: r.items, ...stamp() })); await ensureAccounts(ops);
  let total = 0;
  for (const [accId, g] of Object.entries(byAcc)) {
    const t = r2(g.lines.reduce((s, l) => s + l.dr, 0)), ms = [...g.months].sort(); total += t;
    ops.push(jv(g.jid, 'SAL-' + ms[ms.length - 1] + '-' + uid().slice(-4).toUpperCase(), date, `Salary paid ${ms.map(monthLabel).join(', ')} – ${g.names.length > 3 ? g.names.length + ' staff' : g.names.join(', ')}${ref ? ' – ' + String(ref).trim() : ''}`, 'salarypay', [...g.lines, { acc: accId, cr: t }], { srcRef: ms[ms.length - 1] }));
  }
  for (const k of mineSync) { const [m, id] = k.split('|'), s = byId('hrStaff', id); if (s && s.userId) ops.push(set('hrMine/' + s.userId + '/d', 'ps_' + m, payslipData(m, runs[m].items[id], s))); }
  await commit(ops); return { total: r2(total), journals: Object.keys(byAcc).length };
}
export async function markPaid(month, staffIds, { date, method, accountId, ref }) {
  const run = runOf(month); if (!run || run.status !== 'finalized') throw Error('Finalize the payroll first.');
  return (await paySalaries(staffIds.map(id => ({ month, staffId: id, amount: dueOf(run.items[id]), method, accountId })), { date, ref })).total;
}
// undo one payment (paymentId) or all of a person's payments for the month: reverses the journal lines
export async function undoPaid(month, staffId, why, paymentId) {
  const run = runOf(month), x = run?.items?.[staffId]; const pays = paymentsOf(x); if (!pays.length) return; if (!String(why || '').trim()) throw Error('Give a reason.');
  const undo = paymentId ? pays.filter(p => p.id === paymentId) : pays; if (!undo.length) return;
  const keep = pays.filter(p => !undo.includes(p)), ops = [];
  ops.push(upd('hrRuns', month, { items: { ...run.items, [staffId]: { ...x, payments: keep, paid: null, unpaidLog: [...(x.unpaidLog || []), ...undo.map(p => ({ ...p, undoneBy: me()?.id || '', undoneAt: Date.now(), why }))] } }, ...stamp() }));
  const byAcc = {}; undo.filter(p => num(p.amount) > 0).forEach(p => byAcc[p.accountId] = r2((byAcc[p.accountId] || 0) + num(p.amount)));
  const d = shopNow().date; okDate(d);
  for (const [accId, amt] of Object.entries(byAcc)) ops.push(jv('jh' + uid(), 'SAL-REV-' + month + '-' + uid().slice(-4).toUpperCase(), d, `Salary payment undone – ${x.name} – ${why}`, 'salarypay', [{ acc: accId, dr: amt }, { acc: x.payAcc || acct().payable, cr: amt, e: staffId }], { srcRef: month }));
  const s = byId('hrStaff', staffId); if (s && s.userId) ops.push(set('hrMine/' + s.userId + '/d', 'ps_' + month, payslipData(month, { ...x, payments: keep, paid: null }, s)));
  await commit(ops);
}
// gratuity accrued for one month (only when turned on in HR Settings; owners and “no punching” staff are left out)
export function serviceYears(s, onDate) { if (!s.joinDate) return 0; return Math.max(0, (new Date(onDate + 'T00:00:00') - new Date(s.joinDate + 'T00:00:00')) / (365.25 * 864e5)); }
export function eosbFor(s, sal, month) {
  const E = hrRules().eosb; if (!E.enabled || !sal || s.dept === 'Owner' || s.noPunch) return 0;
  const end = month + '-' + String(daysInMonth(month)).padStart(2, '0'), yrs = serviceYears(s, s.endDate && s.endDate < end ? s.endDate : end);
  const share = employedIn(s, month) ? (monthDates(month).filter(d => (!s.joinDate || d >= s.joinDate) && (!s.endDate || d <= s.endDate)).length / daysInMonth(month)) : 0;
  return r2(eosbMonthly(sal, yrs, E) * share);
}
// staff balances from the books: { adv, payable, eosb } per staff id (from journal lines tagged with the staff id)
export function staffBalances(date) {
  const A = acct(), out = {}, J = store.data.journals_ || [];
  J.filter(j => !date || j.date <= date).forEach(j => j.lines.forEach(l => { if (!l.e) return; const k = l.acc === A.adv ? 'adv' : isPayableAcc(l.acc) ? 'payable' : l.acc === A.eosbProv ? 'eosb' : null; if (!k) return; const o = out[l.e] || (out[l.e] = { adv: 0, payable: 0, eosb: 0 }); o[k] = r2(o[k] + (k === 'adv' ? l.dr - l.cr : l.cr - l.dr)); }));
  return out;
}
export const staffLines = staffId => (store.data.journals_ || []).filter(j => j.lines.some(l => l.e === staffId)).map(j => ({ j, lines: j.lines.filter(l => l.e === staffId) }));
// opening gratuity provision per person (built up before using the app): Dr Opening Balance Equity, Cr End-of-service Provision
export async function saveEosbOpening(staffId, amount, date) {
  const s = byId('hrStaff', staffId); if (!s) throw Error('Staff not found.'); amount = r2(amount); if (amount < 0) throw Error('Amount can’t be negative.');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date || '')) throw Error('Choose the opening date.'); okDate(date);
  const old = all('journals').find(j => j.src === 'hr' && j.refType === 'eosbopen' && j.srcRef === staffId && j.status !== 'void'), ops = [];
  if (old) ops.push(upd('journals', old.id, { status: 'void', voidReason: 'Replaced', voidedAt: Date.now(), voidedBy: me()?.id || '' }));
  await ensureAccounts(ops, [acct().eosbProv]);
  if (amount > 0) ops.push(jv('jh' + uid(), 'EOSB-OB-' + (s.empNo || ''), date, `Opening end-of-service provision – ${s.name}`, 'eosbopen', [{ acc: 'a3900', dr: amount }, { acc: acct().eosbProv, cr: amount, e: staffId }], { party: s.name, srcRef: staffId }));
  if (!ops.length) return; await commit(ops);
}
// paying gratuity when someone leaves: uses up their provision; any difference goes to End-of-service Benefits expense
export async function settleEosb(staffId, { amount, date, accountId, release }) {
  const s = byId('hrStaff', staffId); if (!s) throw Error('Staff not found.'); amount = r2(amount); if (!(amount >= 0)) throw Error('Enter the amount.');
  okDate(date); if (amount > 0 && (!accountId || !byId('accounts', accountId))) throw Error('Choose the account it is paid from.');
  const A = acct(), prov = r2((staffBalances()[staffId] || {}).eosb || 0), use = Math.min(prov, amount), extra = r2(amount - use), left = r2(prov - use);
  const lines = [{ acc: A.eosbProv, dr: use, e: staffId }, { acc: A.eosbExp, dr: extra }, { acc: accountId, cr: amount }];
  if (release && left > 0) lines.push({ acc: A.eosbProv, dr: left, e: staffId }, { acc: A.eosbExp, cr: left });
  const ops = [upd('hrStaff', staffId, { eosbPaid: { date, amount, by: me()?.id || '', at: Date.now() }, ...stamp() })]; await ensureAccounts(ops, [A.eosbProv, A.eosbExp]);
  if (lines.some(l => r2(l.dr || 0) || r2(l.cr || 0))) ops.push(jv('jh' + uid(), 'EOSB-' + (s.empNo || ''), date, `End-of-service gratuity – ${s.name}`, 'eosbpay', lines.filter(l => l.acc), { party: s.name, srcRef: staffId }));
  await commit(ops);
}
export const payslipFor = (month, staffId) => { const run = runOf(month), x = run?.items?.[staffId], s = byId('hrStaff', staffId); return x && x.result && s ? payslipData(month, x, s) : null; };

/* ============ dashboard & alerts ============ */
export function todayBoard() {
  const now = shopNow(), out = { present: [], late: [], absent: [], onBreak: [], notIn: [], off: [], leave: [], left: [] };
  for (const s of tracked()) {
    if (s.joinDate && s.joinDate > now.date) continue;
    const d = dayFor(s, now.date), sh = shiftOf(s), started = now.min > hm2(sh.start) + num(hrRules().graceLate);
    const x = { s, d };
    if (d.status === STATUS.L) out.leave.push(x);
    else if ([STATUS.WO, STATUS.HO].includes(d.status) && !d.punches) out.off.push(x);
    else if (!d.punches) (started ? out.absent : out.notIn).push(x);
    else { out.present.push(x); if (d.lateMin) out.late.push(x); if (d.onBreak) out.onBreak.push(x); else if (!d.open) out.left.push(x); }
  }
  return out;
}
export function alerts(month = shopNow().month) {
  const A = [], now = shopNow(), prev = prevMonth(month);
  for (const s of tracked()) {
    for (const mm of [prev, month]) {
      if (!employedIn(s, mm)) continue;
      const m = monthFor(s, mm);
      m.rows.filter(r => r.flags.includes('missing-out')).forEach(r => A.push({ kind: 'missing', s, date: r.date, text: `${s.name} — no punch-out on ${r.date}` }));
      if (mm === prev && m.totals.unverified && !isLocked(s.id, mm)) A.push({ kind: 'unverified', s, month: mm, text: `${s.name} — ${m.totals.unverified} day(s) in ${monthLabel(mm)} not verified` });
      if (mm === month && m.totals.lateCount >= 3) A.push({ kind: 'late', s, month: mm, text: `${s.name} — late ${m.totals.lateCount} times this month (${fmtMin(m.totals.lateMin)} h)` });
    }
  }
  expiringDocs(30).forEach(d => { const s = byId('hrStaff', d.staffId); if (s && s.status !== 'inactive') A.push({ kind: 'doc', s, text: `${s.name} — ${d.type} ${d.expiry < now.date ? 'expired' : 'expires'} ${d.expiry}` }); });
  A.push(...pendingRequests().map(r => ({ kind: 'leave', s: r.staff, text: `${r.staff.name} asked for ${leaveLabel(r.type)} ${r.from}${r.to !== r.from ? ' – ' + r.to : ''}` })));
  return A;
}

/* ============ sample data (clearly marked, removable) ============ */
export async function loadSample() {
  if (all('hrStaff').some(s => s.sample)) throw Error('Sample staff are already loaded.');
  const R = hrRules(), now = shopNow(), month = now.month, pm = prevMonth(month);
  const people = [
    { name: 'Sample – Ravi Menon', dept: 'Sales', designation: 'Senior salesman', sal: { type: 'monthly', base: 4500, stdHours: 9, allowances: [{ name: 'Transport', amount: 300 }] }, late: 3 },
    { name: 'Sample – Aisha Khan', dept: 'Cashier', designation: 'Cashier', sal: { type: 'monthly', base: 3800, stdHours: 8, allowances: [{ name: 'Housing', amount: 500 }] }, late: 0 },
    { name: 'Sample – Joseph D.', dept: 'Delivery & Fitting', designation: 'Fitter', sal: { type: 'daily', base: 120, stdHours: 8 }, late: 1, ot: true },
    { name: 'Sample – Lakshmi', dept: 'Cleaning', designation: 'Cleaner', sal: { type: 'hourly', base: 15, stdHours: 6 }, late: 0, outT: '15:30' }
  ];
  const ids = [];
  for (const p of people) {
    const join = p.name.includes('Lakshmi') ? pm + '-10' : '2025-01-01';
    const id = await saveStaff({ name: p.name, dept: p.dept, designation: p.designation, joinDate: join, weeklyOff: R.defaultOff, shiftId: R.shifts[0].id, phone: '050 000 0000' }, p.sal);
    await commit([upd('hrStaff', id, { sample: true })]); ids.push([id, p]);
  }
  // punches for last month and this month up to yesterday, written as one document per person per month
  const sh = R.shifts[0];
  const leaveDates = new Set([pm + '-20', pm + '-21']);
  for (const [idx, [id, p]] of ids.entries()) {
    const s = byId('hrStaff', id);
    for (const mm of [pm, month]) {
      const days = {}; let lates = p.late;
      for (const d of monthDates(mm)) {
        if (d >= now.date || d < s.joinDate || (s.weeklyOff || []).includes(new Date(d + 'T00:00:00Z').getUTCDay())) continue;
        if (idx === 1 && leaveDates.has(d)) continue; // on annual leave
        const r = (d.charCodeAt(8) * 7 + d.charCodeAt(9) * 13 + idx * 5) % 23;
        if (r === 0) continue; // an absence now and then
        const inT = lates > 0 && r % 5 === 1 ? (lates--, '09:27') : r % 3 ? '08:55' : '09:04';
        const outT = p.ot && r % 4 === 0 ? '20:00' : r === 7 ? '16:30' : p.outT || sh.end;
        const L = [{ id: 'p' + uid(), t: tsFor(d, inT, R.tz), type: 'in', src: 'manager', by: me().id, at: Date.now(), why: 'Sample data' }];
        L.push({ id: 'p' + uid(), t: tsFor(d, '13:00', R.tz), type: 'out', reason: 'break', src: 'manager', by: me().id, at: Date.now() }, { id: 'p' + uid(), t: tsFor(d, '13:45', R.tz), type: 'in', src: 'manager', by: me().id, at: Date.now() });
        if (r === 11) L.push({ id: 'p' + uid(), t: tsFor(d, '15:00', R.tz), type: 'out', reason: 'errand', note: 'Bank deposit', src: 'manager', by: me().id, at: Date.now() }, { id: 'p' + uid(), t: tsFor(d, '15:40', R.tz), type: 'in', src: 'manager', by: me().id, at: Date.now() });
        if (r !== 19) L.push({ id: 'p' + uid(), t: tsFor(d, outT, R.tz), type: 'out', reason: 'end', src: 'manager', by: me().id, at: Date.now() }); // r === 19 → a missing punch-out to fix
        days[d] = L;
      }
      await commit([set('hrPunch/' + punchKey(s) + '/m', mm, { staffId: id, key: punchKey(s), month: mm, days, sample: true, ...stamp() })]);
    }
  }
  const cashAcc = 'a1000';
  await addAdvance({ staffId: ids[0][0], date: pm + '-05', amount: 1500, reason: 'Sample – family emergency', plan: 'inst', installments: 3, startMonth: pm, accountId: cashAcc }).catch(() => { });
  await saveItem({ staffIds: [ids[0][0]], kind: 'incentive', label: 'Sales commission', calc: 'sales', value: 1, recurring: true, fromMonth: pm, reason: 'Sample – 1% of own sales' });
  await saveItem({ staffIds: ids.map(x => x[0]), kind: 'bonus', label: 'Eid bonus', calc: 'fixed', value: 200, recurring: false, month: pm, reason: 'Sample' });
  await addLeave({ staffId: ids[1][0], type: 'annual', from: pm + '-20', to: pm + '-21', reason: 'Sample – family visit' }).catch(() => { });
  return ids.length;
}
export async function removeSample() {
  const st = all('hrStaff').filter(s => s.sample); if (!st.length) throw Error('No sample staff found.');
  const sid = new Set(st.map(s => s.id)), ops = [];
  if (all('hrRuns').some(r => r.status === 'finalized' && Object.keys(r.items || {}).some(k => sid.has(k)))) throw Error('Sample staff are in a finalized payroll — reopen it first.');
  st.forEach(s => { ops.push({ t: 'delete', coll: 'hrStaff', id: s.id }, { t: 'delete', coll: 'hrSalary', id: s.id }); keysOf(s).forEach(k => Object.keys(store.data['hrPunch/' + k + '/m'] || {}).forEach(m => ops.push({ t: 'delete', coll: 'hrPunch/' + k + '/m', id: m }))); });
  all('hrDays').filter(d => sid.has(d.staffId)).forEach(d => ops.push({ t: 'delete', coll: 'hrDays', id: d.id }));
  all('hrLeave').filter(d => sid.has(d.staffId)).forEach(d => ops.push({ t: 'delete', coll: 'hrLeave', id: d.id }));
  all('hrItems').filter(d => sid.has(d.staffId)).forEach(d => ops.push({ t: 'delete', coll: 'hrItems', id: d.id }));
  all('hrAdvances').filter(d => sid.has(d.staffId)).forEach(a => { ops.push({ t: 'delete', coll: 'hrAdvances', id: a.id }); if (a.journalId) ops.push({ t: 'delete', coll: 'journals', id: a.journalId }); (a.recoveries || []).forEach(r => r.journalId && ops.push({ t: 'delete', coll: 'journals', id: r.journalId })); });
  all('hrRuns').filter(r => r.status !== 'finalized').forEach(r => { const items = { ...(r.items || {}) }; let ch = false; Object.keys(items).forEach(k => { if (sid.has(k)) { delete items[k]; ch = true; } }); if (ch) ops.push(upd('hrRuns', r.id, { items })); });
  await commit(ops); return st.length;
}

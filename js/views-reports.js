// GRID Shop Manager — Reports: financial statements, cash flow, receivables/payables, sales, inventory and profit
import { $, esc, num, r2, today, addDays, weekStart, fmtDate, store, all, byId, setting } from './core.js';
import * as L from './logic.js';
import { money, toast, fail, toCSV, download, saveDocument, field, select, openModal } from './ui.js';
import { savePdf, company, shopLogo, reportPdf } from './print.js';
import { GO, openGo } from './views-office.js';

const role = () => store.me?.role, mgmt = () => L.can.manage(role());
const rr = () => window.__rerender();
const D = d => fmtDate(d, { day: 'numeric', month: 'short', year: 'numeric' });
const inR = (d, f, t) => d >= f && d <= t;
const lastMonth = () => { const d = new Date(today() + 'T00:00'); d.setDate(0); const e = today(d); d.setDate(1); return [today(d), e]; };
const ageDays = d => Math.max(0, Math.round((new Date(today() + 'T00:00') - new Date(d + 'T00:00')) / 864e5));
const bucket = d => { const a = ageDays(d); return a <= 30 ? 0 : a <= 60 ? 1 : a <= 90 ? 2 : 3; };
const pct = (p, s) => s ? (p / s * 100).toFixed(1) + '%' : '—';
// ---- comparison periods: previous periods (same length, calendar-aware) or the same dates in previous years
const ymd = (y, m, d) => { const last = new Date(y, m + 1, 0).getDate(); return today(new Date(y, m, Math.min(d, last))); };
const isMonthEnd = d => { const x = new Date(d + 'T00:00'); return new Date(x.getFullYear(), x.getMonth() + 1, 0).getDate() === x.getDate(); };
const shiftMonths = (d, n, toEnd) => { const x = new Date(d + 'T00:00'), y = x.getFullYear(), m = x.getMonth() + n; return toEnd ? today(new Date(y, m + 1, 0)) : ymd(y, m, x.getDate()); };
function comparePeriods(f, t, mode, n) {
  n = Math.max(0, Math.min(12, Math.round(num(n) || 0))); if (!mode || mode === 'none' || !n) return [];
  const out = [], df = new Date(f + 'T00:00'), dt = new Date(t + 'T00:00');
  const months = (dt.getFullYear() - df.getFullYear()) * 12 + dt.getMonth() - df.getMonth() + 1, monthly = df.getDate() === 1, end = isMonthEnd(t);
  for (let k = 1; k <= n; k++) {
    if (mode === 'year') out.push([shiftMonths(f, -12 * k, false), shiftMonths(t, -12 * k, end)]);
    else if (monthly) out.push([shiftMonths(f, -months * k, false), shiftMonths(t, -months * k, end)]);
    else { const days = Math.round((dt - df) / 864e5) + 1; out.push([addDays(f, -days * k), addDays(t, -days * k)]); }
  }
  return out;
}
function periodLabel(a, b) {
  const da = new Date(a + 'T00:00'), db = new Date(b + 'T00:00');
  if (da.getDate() === 1 && isMonthEnd(b)) {
    if (da.getMonth() === 0 && db.getMonth() === 11 && da.getFullYear() === db.getFullYear()) return String(da.getFullYear());
    if (da.getMonth() === db.getMonth() && da.getFullYear() === db.getFullYear()) return da.toLocaleDateString('en-IN', { month: 'short', year: 'numeric' });
    return da.toLocaleDateString('en-IN', { month: 'short', year: '2-digit' }) + ' – ' + db.toLocaleDateString('en-IN', { month: 'short', year: '2-digit' });
  }
  return fmtDate(a, { day: 'numeric', month: 'short' }) + ' – ' + fmtDate(b, { day: 'numeric', month: 'short', year: '2-digit' });
}
// a row is {c: [cells], k: '' | 'sec' | 'sub' | 'tot'}; numbers are formatted as money
const row = (c, k = '', go = null) => ({ c, k, go });
// sales value of each invoice line after the invoice's extra discount is shared out
function netLines(inv) { const sub = inv.lines.reduce((s, l) => s + L.lineTotal(l), 0) || num(inv.subtotal), f = sub ? L.goodsNet(inv) / sub : 1; /* goods value without GST and other charges */ return inv.lines.map(l => ({ ...l, net: r2(L.lineTotal(l) * f), costT: r2(num(l.cost) * num(l.qty)) })); }
const liveInvoices = (f, t) => all('invoices').filter(i => i.status !== 'void' && inR(i.date, f, t));
const catOf = l => (byId('items', l.itemId) || {}).category || 'OTHER';
const catOk = (o, c) => !o.category || c === o.category;
const customerOpts = () => all('customers').sort((a, b) => a.name.localeCompare(b.name)).map(c => [c.id, c.name + (c.mobile ? ' · ' + c.mobile : '')]);
// every posting to a customer's account (invoices, payments, advances, refunds, returns, voids, opening balance), oldest first
const custEvents = cid => { L.derive(); return (store.data.journals_ || []).flatMap(j => j.lines.filter(l => l.c === cid).map(l => ({ d: j.date, at: j.createdAt || 0, ref: j.refNo, what: j.memo, dr: r2(l.dr), cr: r2(l.cr) }))).sort((a, b) => a.d.localeCompare(b.d) || a.at - b.at); };
const supplierOpts = () => all('suppliers').sort((a, b) => a.name.localeCompare(b.name)).map(s => [s.id, s.name]);

/* ---------- management summary (sales activity, cash & bank, position) ---------- */
function mgmtData(f, t) {
  const inr = d => d >= f && d <= t, cnt = (l, k = 'total') => ({ n: l.length, v: r2(l.reduce((x, d) => x + num(d[k]), 0)) });
  const enq = cnt(all('quotations').filter(q => q.status !== 'deleted' && inr(q.date))), so = cnt(all('salesOrders').filter(o => o.status !== 'cancelled' && inr(o.date))), inv = cnt(all('invoices').filter(i => i.status !== 'void' && inr(i.date)));
  const accs = L.moneyAccounts(), flow = L.moneyFlow(accs.map(a => a.id), f, t);
  const per = accs.map(a => { const m = L.moneyFlow([a.id], f, t); return { name: a.name, code: a.code, opening: m.opening, inflow: m.inflow, outflow: m.outflow, closing: m.closing }; }).filter(x => x.opening || x.inflow || x.outflow || x.closing);
  const SI = L.statementItems(t), g = name => r2(SI.filter(i => i.grp === name).reduce((x, i) => x + num(i.bal), 0)) || 0;
  const pos = [['Stock value', g('Inventory')], ['Receivable (customers owe us)', g('Accounts receivable')], ['Advance to suppliers', g('Advances to vendors')], ['Payable (we owe suppliers)', -g('Accounts payable') || 0], ['Advance from customers', -g('Customer advances (unearned revenue)') || 0]];
  return { f, t, enq, so, inv, flow, per, pos };
}
const sumPeriod = (f, t) => f === t ? D(f) : D(f) + ' – ' + D(t);
function mgmtHTML(d) {
  const tile = (lab, x) => `<div class="kpi"><span>${lab}</span><b>${money(x.v)}</b><small>${x.n} Nos</small></div>`;
  return `<div class="sum">
    <h3 class="sum-h">Sales activity</h3><div class="grid g3" style="gap:10px">${tile('Total enquiries', d.enq)}${tile('Sales orders', d.so)}${tile('Invoices', d.inv)}</div>
    <h3 class="sum-h">Cash &amp; bank</h3>
    <div class="grid g4" style="gap:10px"><div class="kpi"><span>Opening cash &amp; bank</span><b>${money(d.flow.opening)}</b></div><div class="kpi"><span>Cash in</span><b style="color:var(--ok)">${money(d.flow.inflow)}</b></div><div class="kpi"><span>Cash out</span><b style="color:var(--danger)">${money(d.flow.outflow)}</b></div><div class="kpi"><span>Closing balance</span><b>${money(d.flow.closing)}</b></div></div>
    <div class="tw" style="margin-top:10px"><table><thead><tr><th>Balance in each account</th><th class="num">Opening</th><th class="num">In</th><th class="num">Out</th><th class="num">Closing</th></tr></thead><tbody>${d.per.map(a => `<tr><td>${esc(a.name)}</td><td class="num">${money(a.opening)}</td><td class="num">${money(a.inflow)}</td><td class="num">${money(a.outflow)}</td><td class="num"><b>${money(a.closing)}</b></td></tr>`).join('') || '<tr><td colspan="5" class="muted">No cash or bank movement.</td></tr>'}</tbody>
      <tfoot><tr><td>Total</td><td class="num">${money(d.flow.opening)}</td><td class="num">${money(d.flow.inflow)}</td><td class="num">${money(d.flow.outflow)}</td><td class="num">${money(d.flow.closing)}</td></tr></tfoot></table></div>
    <p class="hint" style="margin-top:6px">Money moved between your own accounts shows in each account but is left out of the totals.</p>
    <h3 class="sum-h">Position as of ${D(d.t)}</h3>
    <div class="tw"><table><tbody>${d.pos.map(([l, v]) => `<tr><td>${l}</td><td class="num"><b>${money(v)}</b></td></tr>`).join('')}</tbody></table></div></div>`;
}
function mgmtText(d) {
  const name = setting('name', 'GRID'), m = v => money(v).replace(/\s+/g, ' ');
  return [`*${name} — Management summary*`, sumPeriod(d.f, d.t), '',
    '*Sales activity*', `Total enquiry: ${m(d.enq.v)} (${d.enq.n} Nos)`, `Sales orders: ${m(d.so.v)} (${d.so.n} Nos)`, `Invoices: ${m(d.inv.v)} (${d.inv.n} Nos)`, '',
    '*Cash & bank*', `Opening cash & bank: ${m(d.flow.opening)}`, `Cash in: ${m(d.flow.inflow)}`, `Cash out: ${m(d.flow.outflow)}`, `Closing balance: ${m(d.flow.closing)}`, '',
    '*Balance in each account*', ...d.per.map(a => `${a.name}: ${m(a.closing)}`), '',
    `*Position as of ${D(d.t)}*`, ...d.pos.map(([l, v]) => `${l.replace(/ \(.*\)$/, '')}: ${m(v)}`)].join('\n');
}
function mgmtDoc(d) {
  const co = company(), lg = shopLogo(), m = v => esc(money(v)), row2 = (l, v, b) => `<tr><td>${l}</td><td class="n">${b ? '<b>' + m(v) + '</b>' : m(v)}</td></tr>`;
  return `<!doctype html><html><head><meta charset="utf-8"><title>Management summary</title><style>*{box-sizing:border-box}body{margin:0;background:#fff;font:10pt/1.45 Arial,Helvetica,sans-serif;color:#1b1b1b}
.sum-page{width:190mm;padding:2mm 0}.hd{display:flex;justify-content:space-between;align-items:flex-start;gap:6mm;border-bottom:.7mm solid #5b2d14;padding-bottom:3mm;margin-bottom:4mm}.hd img{height:16mm;width:auto;max-width:45mm;object-fit:contain;margin-right:3mm}.co{display:flex;align-items:center}
h1{margin:0;font:700 15pt Georgia,serif;color:#4a2511}h2{margin:0;font:700 13pt Georgia,serif;color:#4a2511;text-align:right}.sub{color:#666;font-size:9pt;text-align:right}
h3{font:700 11pt Georgia,serif;color:#4a2511;margin:5mm 0 2mm}.tiles{display:grid;grid-template-columns:repeat(4,1fr);gap:3mm}.tiles.t3{grid-template-columns:repeat(3,1fr)}.tile{border:.3mm solid #dcc4a0;border-radius:2mm;padding:2.5mm 3mm;background:#fffaf1}.tile span{display:block;font-size:7.5pt;text-transform:uppercase;letter-spacing:.05em;color:#7a604b}.tile b{font-size:12.5pt;color:#4a2511}.tile small{display:block;color:#666;font-size:8.5pt}
table{width:100%;border-collapse:collapse}th{background:#f3e3c7;color:#4a2511;text-align:left;font-size:8pt;text-transform:uppercase;letter-spacing:.04em;padding:1.8mm 2mm}td{padding:1.8mm 2mm;border-bottom:.2mm solid #eadcc4}.n{text-align:right;white-space:nowrap}tfoot td{font-weight:700;background:#faf1e2}.note{color:#777;font-size:8pt;margin-top:1.5mm}.ft{margin-top:6mm;color:#999;font-size:8pt;border-top:.2mm solid #ddd;padding-top:2mm}</style></head><body><div class="sum-page">
<div class="hd"><div class="co">${lg ? `<img src="${esc(lg)}" alt="">` : ''}<div><h1>${esc(co.name || setting('name', ''))}</h1><div style="color:#666;font-size:8.5pt">${esc(co.address || '').replace(/\n/g, ', ')}</div></div></div><div><h2>Management summary</h2><div class="sub">${esc(sumPeriod(d.f, d.t))}</div></div></div>
<h3>Sales activity</h3><div class="tiles t3">${[['Total enquiries', d.enq], ['Sales orders', d.so], ['Invoices', d.inv]].map(([l, x]) => `<div class="tile"><span>${l}</span><b>${m(x.v)}</b><small>${x.n} Nos</small></div>`).join('')}</div>
<h3>Cash &amp; bank</h3><div class="tiles">${[['Opening cash & bank', d.flow.opening], ['Cash in', d.flow.inflow], ['Cash out', d.flow.outflow], ['Closing balance', d.flow.closing]].map(([l, v]) => `<div class="tile"><span>${esc(l)}</span><b>${m(v)}</b></div>`).join('')}</div>
<table style="margin-top:3mm"><thead><tr><th>Balance in each account</th><th class="n">Opening</th><th class="n">In</th><th class="n">Out</th><th class="n">Closing</th></tr></thead><tbody>${d.per.map(a => `<tr><td>${esc(a.name)}</td><td class="n">${m(a.opening)}</td><td class="n">${m(a.inflow)}</td><td class="n">${m(a.outflow)}</td><td class="n"><b>${m(a.closing)}</b></td></tr>`).join('')}</tbody><tfoot><tr><td>Total</td><td class="n">${m(d.flow.opening)}</td><td class="n">${m(d.flow.inflow)}</td><td class="n">${m(d.flow.outflow)}</td><td class="n">${m(d.flow.closing)}</td></tr></tfoot></table>
<div class="note">Money moved between the shop's own accounts is left out of the totals.</div>
<h3>Position as of ${esc(D(d.t))}</h3><table><tbody>${d.pos.map(([l, v]) => row2(esc(l), v, true)).join('')}</tbody></table>
<div class="ft">Prepared ${esc(D(today()))} by ${esc(store.me?.name || '')} · GRID Shop Manager</div></div></body></html>`;
}

/* ---------- report definitions ---------- */
const R = [
  { id: 'mgmt', g: 'Summary', t: 'Management summary', p: 'range', m: 1, run: async (f, t) => {
    const d = mgmtData(f, t);
    const rows = [row(['Sales activity'], 'sec'), row(['Total enquiry', d.enq.n, d.enq.v]), row(['Sales orders', d.so.n, d.so.v]), row(['Invoices', d.inv.n, d.inv.v]),
      row(['Cash & bank'], 'sec'), row(['Opening cash & bank', '', d.flow.opening]), row(['Cash in', '', d.flow.inflow]), row(['Cash out', '', d.flow.outflow]), row(['Closing balance', '', d.flow.closing], 'tot'),
      row(['Balance in each account (closing)'], 'sec'), ...d.per.map(a => row([a.name, '', a.closing])),
      row(['Position as of ' + D(t)], 'sec'), ...d.pos.map(([l, v]) => row([l, '', v]))];
    return { head: ['Particulars', 'Nos', 'Amount'], rows, html: mgmtHTML(d), text: mgmtText(d), doc: mgmtDoc(d) };
  } },
  { id: 'pl', g: 'Financial statements', t: 'Profit and Loss Account', p: 'range', m: 1, cmp: 1, run: async (f, t, o) => {
    const periods = [[f, t], ...comparePeriods(f, t, o.cmp, o.cmpN)], withPct = o.cmp !== 'none' && o.cmpPct;
    const accs = all('accounts').sort((a, b) => a.code.localeCompare(b.code));
    const inc = accs.filter(a => a.type === 'income' && !L.isOtherInc(a)), cos = accs.filter(L.isCOS), opex = accs.filter(L.isOpex), oinc = accs.filter(L.isOtherInc), nonop = accs.filter(L.isNonOpExp);
    const P = await Promise.all(periods.map(async ([a, b]) => { const mv = {}; (await L.journalsBetween(a, b)).forEach(j => j.lines.forEach(l => mv[l.acc] = r2((mv[l.acc] || 0) + l.dr - l.cr))); return mv; }));
    const iv = (k, a) => r2(-(P[k][a.id] || 0)), ev = (k, a) => r2(P[k][a.id] || 0), sum = (k, l, fn) => r2(l.reduce((x, a) => x + fn(k, a), 0));
    const T = P.map((_, k) => { const ti = sum(k, inc, iv), tc = sum(k, cos, ev), gp = r2(ti - tc), to = sum(k, opex, ev), op = r2(gp - to), toi = sum(k, oinc, iv), tn = sum(k, nonop, ev); return { ti, tc, gp, to, op, toi, tn, np: r2(op + toi - tn) }; });
    const chg = (cur, prev) => !prev ? (cur ? 'new' : '—') : ((cur - prev) / Math.abs(prev) * 100 >= 0 ? '+' : '') + ((cur - prev) / Math.abs(prev) * 100).toFixed(1) + '%';
    const vals = fn => { const v = P.map((_, k) => fn(k)); if (!withPct) return v; const out = [v[0]]; for (let k = 1; k < v.length; k++) out.push(v[k], chg(v[0], v[k])); return out; };
    const line = (name, fn, k2 = '') => row([name, ...vals(fn)], k2);
    const any = (l, fn) => l.filter(a => P.some((_, k) => fn(k, a)) || a.id === L.ACC.sales || a.id === L.ACC.cogs);
    const margin = (name, num_, den) => row([name, ...(withPct ? [pct(T[0][num_], T[0][den]), ...P.slice(1).flatMap((_, k) => [pct(T[k + 1][num_], T[k + 1][den]), ''])] : P.map((_, k) => pct(T[k][num_], T[k][den])))]);
    const rows = [row(['Income'], 'sec'), ...any(inc, iv).map(a => line(a.name, k => iv(k, a))), line('Total income', k => T[k].ti, 'sub'),
      row(['Cost of sales'], 'sec'), ...any(cos, ev).map(a => line(a.name, k => ev(k, a))), line('Total cost of sales', k => T[k].tc, 'sub'),
      line('Gross profit', k => T[k].gp, 'tot'), margin('Gross margin', 'gp', 'ti'),
      row(['Operating expenses'], 'sec'), ...opex.filter(a => P.some((_, k) => ev(k, a))).map(a => line(a.name, k => ev(k, a))), line('Total operating expenses', k => T[k].to, 'sub'),
      line(T[0].op >= 0 ? 'Operating profit' : 'Operating loss', k => T[k].op, 'tot')];
    if (T.some(x => x.toi || x.tn)) rows.push(
      row(['Other income (non-operating)'], 'sec'), ...oinc.filter(a => P.some((_, k) => iv(k, a))).map(a => line(a.name, k => iv(k, a))), line('Total other income', k => T[k].toi, 'sub'),
      row(['Non-operating expenses'], 'sec'), ...nonop.filter(a => P.some((_, k) => ev(k, a))).map(a => line(a.name, k => ev(k, a))), line('Total non-operating expenses', k => T[k].tn, 'sub'));
    rows.push(line(T[0].np >= 0 ? 'NET PROFIT' : 'NET LOSS', k => T[k].np, 'tot'), margin('Net margin', 'np', 'ti'));
    const labels = periods.map(([a, b]) => periodLabel(a, b));
    const head = ['Particulars', ...(withPct ? [labels[0], ...labels.slice(1).flatMap(l => [l, '% change'])] : (periods.length > 1 ? labels : ['Amount']))];
    return { head, rows, sub: periods.length > 1 ? 'Compared with ' + (o.cmp === 'year' ? 'the same period in previous years' : 'previous periods') : '',
      note: periods.length > 1 && withPct ? '% change = this period compared with that period. For costs, a rise is shown as + too.' : '' };
  } },
  { id: 'bs', g: 'Financial statements', t: 'Balance Sheet', p: 'asof', opt: 'bsview', m: 1, run: async (f, t, o) => {
    GO.reset(); const items = L.statementItems(t), ex = o.bsview === 'expanded', rows = [];
    const profit = r2(-items.filter(i => i.type === 'income' || i.type === 'expense').reduce((x, i) => x + i.bal, 0));
    const SEC = [['Assets', 1, [['Current assets', ['Cash & bank', 'Accounts receivable', 'Advances to vendors', 'Staff advances', 'Inventory', 'Other current assets']], ['Fixed assets', ['Fixed assets']]]],
      ['Liabilities', -1, [['Current liabilities', ['Accounts payable', 'Customer advances (unearned revenue)', 'Salaries payable', 'Other liabilities']], ['Long-term liabilities', ['End-of-service provision', 'Loans']]]],
      ['Equity', -1, [['Capital', ["Owner's capital & drawings", 'Opening balance equity']]]]];
    const T = {};
    SEC.forEach(([title, sg, subs]) => {
      rows.push(row([title], 'sec')); let secTot = 0;
      subs.forEach(([st, groups]) => {
        const its = items.filter(i => groups.includes(i.grp)); let subTot = r2(its.reduce((x, i) => x + sg * i.bal, 0));
        if (!its.some(i => Math.abs(i.bal) > 0.009) && st !== 'Current assets' && st !== 'Current liabilities') return;
        rows.push(row([st], 'grp'));
        groups.forEach(g => {
          const gi = its.filter(i => i.grp === g), v = r2(gi.reduce((x, i) => x + sg * i.bal, 0)), nz = gi.filter(i => Math.abs(i.bal) > 0.009);
          if (ex) nz.forEach(i => rows.push(row([i.name, r2(sg * i.bal)], 'ind', GO.put(i.go))));
          else if (Math.abs(v) > 0.009 || ['Accounts receivable', 'Accounts payable'].includes(g)) rows.push(row([g.charAt(0).toUpperCase() + g.slice(1), v], 'ind', GO.put(gi.length === 1 ? gi[0].go : { t: 'group', title: g.charAt(0).toUpperCase() + g.slice(1), items: nz.map(i => ({ name: i.name, bal: r2(sg * i.bal), go: i.go })) })));
        });
        rows.push(row(['Total ' + st.toLowerCase(), subTot], 'sub')); secTot = r2(secTot + subTot);
      });
      if (title === 'Equity') { rows.push(row(['Profit to date (not yet closed)', profit], 'ind', GO.put({ t: 'report', id: 'pl' }))); secTot = r2(secTot + profit); }
      T[title] = secTot; rows.push(row(['Total ' + title.toLowerCase(), secTot], 'tot'));
    });
    rows.push(row(['Total liabilities and equity', r2(T.Liabilities + T.Equity)], 'tot'));
    return { head: ['Particulars', 'Amount'], rows, sub: ex ? 'Expanded view' : 'Summary view',
      note: (Math.abs(T.Assets - T.Liabilities - T.Equity) < 0.01 ? '✓ Assets equal liabilities plus equity. ' : '⚠ The balance sheet does not balance — check opening balances. ') + 'Tap any amount to open its ledger; receivables, payables and advances open the list of customers or vendors.' };
  } },
  { id: 'cfd', g: 'Financial statements', t: 'Cash Flow — Direct Method', p: 'range', m: 1, run: async (f, t) => {
    const mset = new Set(L.moneyAccounts().map(a => a.id)), js = await L.journalsBetween(f, t), c = {};
    const add = (k, v) => c[k] = r2((c[k] || 0) + v);
    js.forEach(j => { const d = r2(j.lines.filter(l => mset.has(l.acc)).reduce((s, l) => s + l.dr - l.cr, 0)); if (!d) return; // transfers between money accounts net to zero
      const other = j.lines.filter(l => !mset.has(l.acc)), grp = other.map(l => (byId('accounts', l.acc) || {}).group);
      if (j.refType === 'receipt' || j.refType === 'refund') add(d > 0 ? 'op:Cash received from customers' : 'op:Refunds paid to customers', d);
      else if (j.refType === 'payment') add('op:Cash paid to suppliers', d);
      else if (j.refType === 'expense') add('op:Paid for ' + ((all('expenses').find(e => e.no === j.refNo) || {}).expenseName || 'expenses').toLowerCase(), d);
      else if (j.refType === 'cashdiff') add('op:Cash short / over', d);
      else if (grp.includes('fixed')) add('inv:Furniture, fixtures & equipment', d);
      else if (grp.some(g => ['capital', 'drawings', 'loan', 'obe'].includes(g))) add('fin:' + (grp.includes('loan') ? 'Loans' : grp.includes('drawings') ? "Owner's drawings" : grp.includes('obe') ? 'Opening balances introduced' : "Owner's capital"), d);
      else add('op:Other operating items', d); });
    const open = L.moneyFlow([...mset], f, t).opening, sec = (p, l) => { const ks = Object.keys(c).filter(k => k.startsWith(p)).sort(); const s = r2(ks.reduce((x, k) => x + c[k], 0)); return { rows: [row([l], 'sec'), ...ks.map(k => row([k.slice(p.length), c[k]])), row(['Net cash from ' + l.toLowerCase(), s], 'sub')], s }; };
    const op = sec('op:', 'Operating activities'), iv = sec('inv:', 'Investing activities'), fi = sec('fin:', 'Financing activities'), net = r2(op.s + iv.s + fi.s);
    return { head: ['Particulars', 'Amount'], rows: [...op.rows, ...iv.rows, ...fi.rows, row(['Net increase / (decrease) in cash', net], 'tot'), row(['Cash and bank at start', open]), row(['Cash and bank at end', r2(open + net)], 'tot')] };
  } },
  { id: 'cfi', g: 'Financial statements', t: 'Cash Flow — Indirect Method', p: 'range', m: 1, run: async (f, t) => {
    const b0 = await L.balancesAsOf(addDays(f, -1)), b1 = await L.balancesAsOf(t), accs = all('accounts');
    const ch = g => r2(accs.filter(a => g(a)).reduce((s, a) => s + num(b1[a.id]) - num(b0[a.id]), 0));
    const js = await L.journalsBetween(f, t), mv = {}; js.forEach(j => j.lines.forEach(l => mv[l.acc] = r2((mv[l.acc] || 0) + l.dr - l.cr)));
    const np = r2(-accs.filter(a => a.type === 'income' || a.type === 'expense').reduce((s, a) => s + num(mv[a.id]), 0));
    const ar = -ch(a => a.group === 'ar'), inv = -ch(a => a.group === 'inventory'), ap = -ch(a => a.group === 'ap'), oth = -ch(a => a.type === 'liability' && !['ap', 'loan'].includes(a.group)), oca = -ch(a => a.type === 'asset' && !['ar', 'inventory', 'fixed', 'cash', 'bank'].includes(a.group));
    const op = r2(np + ar + inv + ap + oth + oca), fx = ch(a => a.group === 'fixed'), loans = -ch(a => a.group === 'loan'), eq = -ch(a => a.type === 'equity');
    const net = r2(op - fx + loans + eq), mIds = L.moneyAccounts().map(a => a.id), open = r2(mIds.reduce((s, id) => s + num(b0[id]), 0)), close = r2(mIds.reduce((s, id) => s + num(b1[id]), 0));
    return { head: ['Particulars', 'Amount'], rows: [row(['Operating activities'], 'sec'), row(['Net profit for the period', np]), row(['(Increase) / decrease in customer receivables', ar]), row(['(Increase) / decrease in inventory', inv]), row(['Increase / (decrease) in supplier payables', ap]), row(['Increase / (decrease) in other payables', oth]), ...(oca ? [row(['(Increase) / decrease in other current assets', oca])] : []), row(['Net cash from operating activities', op], 'sub'),
      row(['Investing activities'], 'sec'), row(['Purchase of furniture, fixtures & equipment', -fx]), row(['Net cash from investing activities', -fx], 'sub'),
      row(['Financing activities'], 'sec'), row(['Loans taken / (repaid)', loans]), row(["Owner's capital, drawings and opening balances", eq]), row(['Net cash from financing activities', r2(loans + eq)], 'sub'),
      row(['Net increase / (decrease) in cash', net], 'tot'), row(['Cash and bank at start', open]), row(['Cash and bank at end', close], 'tot')],
      note: Math.abs(open + net - close) < 0.01 ? '✓ Ties to the cash and bank balances.' : '⚠ Difference of ' + money(r2(close - open - net)) + ' — check manual journals.' };
  } },
  { id: 'cust', g: 'Customers & suppliers', t: 'Customer Balances', p: 'none', run: async () => {
    const inv = {}, rc = {}; all('invoices').filter(i => i.status !== 'void').forEach(i => inv[i.customerId] = r2((inv[i.customerId] || 0) + i.total)); all('receipts').forEach(r => rc[r.customerId] = r2((rc[r.customerId] || 0) + r.amount));
    const list = all('customers').filter(c => Math.abs(num(c.balance)) > 0.009).sort((a, b) => b.balance - a.balance);
    return { head: ['Customer', 'Mobile', 'Invoiced', 'Received', 'Balance'], rows: list.map(c => row([c.name, c.mobile, inv[c.id] || 0, rc[c.id] || 0, c.balance])), foot: ['Total', '', r2(list.reduce((s, c) => s + (inv[c.id] || 0), 0)), r2(list.reduce((s, c) => s + (rc[c.id] || 0), 0)), r2(list.reduce((s, c) => s + c.balance, 0))], note: 'A negative balance means the customer has paid in advance (credit).' };
  } },
  { id: 'cstmt', g: 'Customers & suppliers', t: 'Customer Statement', p: 'range', opt: 'customer', run: async (f, t, o) => {
    const c = byId('customers', o.customer); if (!c) return { head: ['Choose a customer above'], rows: [] };
    const ev = custEvents(c.id);
    let bal = r2(ev.filter(e => e.d < f).reduce((x, e) => x + e.dr - e.cr, 0)); const rows = [row([D(f), '', 'Opening balance', '', '', bal], 'sub')];
    const p = ev.filter(e => inR(e.d, f, t)); p.forEach(e => { bal = r2(bal + e.dr - e.cr); rows.push(row([D(e.d), e.ref, e.what, e.dr || '', e.cr || '', bal])); });
    const due = all('invoices').filter(i => i.customerId === c.id && i.status !== 'void' && num(i.balance) > 0.009);
    return { head: ['Date', 'Reference', 'Details', 'Invoiced (Dr)', 'Paid / credited (Cr)', 'Balance'], rows, foot: ['', '', 'Closing balance', r2(p.reduce((x, e) => x + e.dr, 0)), r2(p.reduce((x, e) => x + e.cr, 0)), bal],
      sub: c.name + (c.mobile ? ' · ' + c.mobile : '') + (c.gstin ? ' · GSTIN ' + c.gstin : ''),
      note: `Balance: a positive amount is what the customer owes; a minus amount is an advance / credit held for them.${due.length ? ' Unpaid invoices now: ' + due.map(i => i.no + ' ' + money(i.balance)).join(', ') + '.' : ''}` };
  } },
  { id: 'arage', g: 'Customers & suppliers', t: 'Receivables by Age', p: 'none', run: async () => {
    const rows = [], T = [0, 0, 0, 0, 0, 0];
    all('customers').filter(c => num(c.balance) > 0.009).sort((a, b) => b.balance - a.balance).forEach(c => {
      const b = [0, 0, 0, 0]; let open = 0; all('invoices').filter(i => i.customerId === c.id && ['unpaid', 'partial'].includes(i.status)).forEach(i => { b[bucket(i.date)] = r2(b[bucket(i.date)] + i.balance); open += i.balance; });
      const other = r2(c.balance - open); const r = [...b, other, c.balance]; r.forEach((v, k) => T[k] = r2(T[k] + v)); rows.push(row([c.name, c.mobile, ...r]));
    });
    return { head: ['Customer', 'Mobile', '0–30 days', '31–60', '61–90', 'Over 90', 'On account', 'Total due'], rows, foot: ['Total', '', ...T], note: 'Age counts from the invoice date. "On account" is balance not tied to an invoice (opening balances, advances).' };
  } },
  { id: 'vend', g: 'Customers & suppliers', t: 'Vendor Balances', p: 'none', run: async () => {
    const bl = {}, pd = {}; all('purchases').forEach(p => bl[p.supplierId] = r2((bl[p.supplierId] || 0) + p.total)); all('payments').forEach(p => pd[p.supplierId] = r2((pd[p.supplierId] || 0) + p.amount));
    const list = all('suppliers').filter(s => Math.abs(num(s.balance)) > 0.009 || bl[s.id]).sort((a, b) => b.balance - a.balance);
    return { head: ['Vendor', 'Mobile', 'Billed', 'Paid', 'Balance owed'], rows: list.map(s => row([s.name, s.mobile || '', bl[s.id] || 0, pd[s.id] || 0, s.balance])), foot: ['Total', '', r2(list.reduce((s, x) => s + (bl[x.id] || 0), 0)), r2(list.reduce((s, x) => s + (pd[x.id] || 0), 0)), r2(list.reduce((s, x) => s + x.balance, 0))] };
  } },
  { id: 'apage', g: 'Customers & suppliers', t: 'Payables by Age', p: 'none', run: async () => {
    const rows = [], T = [0, 0, 0, 0, 0, 0];
    all('suppliers').filter(s => num(s.balance) > 0.009 || num(s.advance) > 0.009).sort((a, b) => b.balance - a.balance).forEach(s => {
      const b = [0, 0, 0, 0]; let open = 0;
      L.supplierDues(s.id).forEach(d => { b[bucket(d.date)] = r2(b[bucket(d.date)] + d.balance); open = r2(open + d.balance); });
      const r = [...b, r2(s.balance - open), s.balance]; r.forEach((v, k) => T[k] = r2(T[k] + v)); rows.push(row([s.name, s.mobile || '', ...r]));
    });
    return { head: ['Vendor', 'Mobile', '0–30 days', '31–60', '61–90', 'Over 90', 'Less: advance paid', 'Total owed'], rows, foot: ['Total', '', ...T], note: 'Age counts from the bill date (opening balances from their date). Advance paid is money given to the vendor that is not yet settled against a bill — settle it from Suppliers or the bill.' };
  } },
  { id: 'vstmt', g: 'Customers & suppliers', t: 'Vendor Statement', p: 'range', opt: 'supplier', run: async (f, t, o) => {
    const s = byId('suppliers', o.supplier); if (!s) return { head: ['Choose a vendor above'], rows: [] };
    const ev = []; all('purchases').filter(p => p.supplierId === s.id).forEach(p => ev.push({ d: p.date, at: p.createdAt, ref: p.no + (p.billNo ? ' / ' + p.billNo : ''), what: 'Bill', cr: p.total, dr: 0 }));
    all('payments').filter(p => p.supplierId === s.id).forEach(p => ev.push({ d: p.date, at: p.createdAt, ref: p.no, what: 'Payment' + (p.refNo ? ' for ' + p.refNo : '') + ' · ' + p.accountName, cr: 0, dr: p.amount }));
    all('openings').filter(o2 => o2.kind === 'supplier' && o2.partyId === s.id).forEach(o2 => ev.push({ d: o2.date, at: o2.createdAt, ref: 'Opening', what: 'Opening balance', cr: o2.amount, dr: 0 }));
    ev.sort((a, b) => a.d.localeCompare(b.d) || (a.at || 0) - (b.at || 0));
    let bal = r2(ev.filter(e => e.d < f).reduce((x, e) => x + e.cr - e.dr, 0)); const open = bal, rows = [row([D(f), '', 'Opening balance', '', '', open], 'sub')];
    ev.filter(e => inR(e.d, f, t)).forEach(e => { bal = r2(bal + e.cr - e.dr); rows.push(row([D(e.d), e.ref, e.what, e.dr || '', e.cr || '', bal])); });
    const p = ev.filter(e => inR(e.d, f, t));
    return { head: ['Date', 'Reference', 'Details', 'Paid', 'Billed', 'Balance'], rows, foot: ['', '', 'Closing balance', r2(p.reduce((x, e) => x + e.dr, 0)), r2(p.reduce((x, e) => x + e.cr, 0)), bal], sub: s.name + (s.mobile ? ' · ' + s.mobile : '') };
  } },
  { id: 'bills', g: 'Customers & suppliers', t: 'Bills Report', p: 'range', opt: 'billstatus', run: async (f, t, o) => {
    const list = all('purchases').filter(p => inR(p.date, f, t) && (o.billstatus === 'all' || (o.billstatus === 'unpaid' ? p.balance > 0.009 : p.balance <= 0.009))).sort((a, b) => a.date.localeCompare(b.date));
    return { head: ['Date', 'Our no.', 'Vendor bill no.', 'Vendor', 'Items', 'Total', 'Paid', 'Balance', 'Due', 'Status'], rows: list.map(p => row([D(p.date), p.no, p.billNo || '', p.supplierName, p.lines.reduce((s, l) => s + l.qty, 0) + ' pcs', p.total, p.paid, p.balance, p.dueDate ? D(p.dueDate) + (p.balance > 0.009 && p.dueDate < today() ? ' (overdue)' : '') : '', p.status === 'paid' ? 'Paid' : p.status === 'partial' ? 'Part paid' : 'Unpaid'])),
      foot: ['Total', list.length + ' bills', '', '', '', r2(list.reduce((s, p) => s + p.total, 0)), r2(list.reduce((s, p) => s + p.paid, 0)), r2(list.reduce((s, p) => s + p.balance, 0)), '', ''] };
  } },
  { id: 'sales', g: 'Sales', t: 'Sales Report', p: 'range', opt: 'salesby', cat: 1, run: async (f, t, o) => {
    const inv = liveInvoices(f, t), by = o.salesby, g = {}, seen = new Set(); let tq = 0, tot = 0;
    const key = (i, l) => by === 'day' ? i.date : by === 'month' ? i.date.slice(0, 7) : by === 'customer' ? i.customerName : by === 'salesman' ? L.nm(i.salesman) : by === 'category' ? ((byId('items', l.itemId) || {}).category || 'OTHER') : l.name;
    inv.forEach(i => { const per = ['item', 'category'].includes(by) || o.category; (per ? netLines(i).filter(l => catOk(o, catOf(l))) : [{ net: L.netSales(i), qty: i.lines.reduce((s, l) => s + num(l.qty), 0) }]).forEach(l => { const k = key(i, l), r = g[k] || (g[k] = { inv: new Set(), qty: 0, val: 0 }); r.inv.add(i.id); seen.add(i.id); r.qty += num(l.qty); tq += num(l.qty); r.val = r2(r.val + l.net); tot = r2(tot + l.net); }); });
    const lab = { day: 'Date', month: 'Month', customer: 'Customer', salesman: 'Salesman', category: 'Category', item: 'Item' }[by];
    const keys = Object.keys(g).sort((a, b) => ['day', 'month'].includes(by) ? a.localeCompare(b) : g[b].val - g[a].val);
    return { head: [lab, 'Invoices', 'Qty', 'Sales', 'Share'], rows: keys.map(k => row([by === 'day' ? D(k) : by === 'month' ? fmtDate(k + '-01', { month: 'long', year: 'numeric' }) : k, g[k].inv.size, g[k].qty, g[k].val, pct(g[k].val, tot)])), foot: ['Total', seen.size, tq, tot, '100%'], note: o.category ? 'Only items in category ' + o.category + ' (after sharing out invoice discounts).' : '' };
  } },
  { id: 'gst', g: 'Sales', t: 'GST Summary', p: 'range', m: 1, run: async (f, t) => {
    const docs = [...liveInvoices(f, t).map(i => ({ d: i, k: 1, ty: i.kind === 'service' ? 'Service invoice' : 'Invoice' })), ...all('creditNotes').filter(n => inR(n.date, f, t)).map(n => ({ d: n, k: -1, ty: 'Sales return' }))].sort((a, b) => a.d.date.localeCompare(b.d.date) || String(a.d.no).localeCompare(String(b.d.no)));
    const T = [0, 0, 0, 0, 0, 0], add = (j, v) => T[j] = r2(T[j] + v);
    const rows = docs.map(({ d, k, ty }) => { const x = d.tax, c = byId('customers', d.customerId) || {}, v = [x ? x.taxable : num(d.total), x ? x.cgst : 0, x ? x.sgst : 0, x ? x.igst : 0, x ? x.tax : 0, num(d.total)].map(n => r2(k * num(n)));
      v.forEach((n, j) => add(j, n)); return row([D(d.date), d.no, ty, d.customerName, c.gstin || '', x ? x.rate + '%' + (x.mode === 'inclusive' ? ' incl.' : '') : 'No GST', ...v]); });
    const byRate = {}; docs.forEach(({ d, k }) => { if (!d.tax) return; const r = byRate[d.tax.rate] || (byRate[d.tax.rate] = [0, 0]); r[0] = r2(r[0] + k * d.tax.taxable); r[1] = r2(r[1] + k * d.tax.tax); });
    return { head: ['Date', 'No.', 'Type', 'Customer', 'GSTIN', 'Rate', 'Taxable value', 'CGST', 'SGST', 'IGST', 'Total GST', 'Invoice value'], rows, foot: ['Total', docs.length + ' documents', '', '', '', '', ...T],
      note: `Output GST on sales; sales returns are shown as minus. ${Object.keys(byRate).sort((a, b) => a - b).map(r => `${r}%: taxable ${money(byRate[r][0])}, GST ${money(byRate[r][1])}`).join(' · ')}${Object.keys(byRate).length ? '. ' : ''}GST paid on purchases (input credit) is not recorded in this app — check it with your accountant before filing.` };
  } },
  { id: 'profinv', g: 'Profit', t: 'Profit by Invoice', p: 'range', m: 1, run: async (f, t) => {
    const inv = liveInvoices(f, t).sort((a, b) => a.date.localeCompare(b.date)); let S = 0, C = 0;
    const rows = inv.map(i => { const n = L.netSales(i); S += n; C += i.costTotal; return row([D(i.date), i.no, i.customerName, L.nm(i.salesman), n, i.costTotal, r2(n - i.costTotal), pct(n - i.costTotal, n)]); });
    return { head: ['Date', 'Invoice', 'Customer', 'Salesman', 'Sales', 'Cost', 'Profit', 'Margin'], rows, foot: ['Total', inv.length + ' invoices', '', '', r2(S), r2(C), r2(S - C), pct(S - C, S)] };
  } },
  { id: 'profitem', g: 'Profit', t: 'Profit by Item', p: 'range', m: 1, cat: 1, run: async (f, t, o) => {
    const g = {}; liveInvoices(f, t).forEach(i => netLines(i).filter(l => catOk(o, catOf(l))).forEach(l => { const k = l.itemId || l.name, r = g[k] || (g[k] = { name: l.name, sku: l.sku, qty: 0, s: 0, c: 0 }); r.qty += num(l.qty); r.s = r2(r.s + l.net); r.c = r2(r.c + l.costT); }));
    const list = Object.values(g).sort((a, b) => (b.s - b.c) - (a.s - a.c)), S = r2(list.reduce((x, r) => x + r.s, 0)), C = r2(list.reduce((x, r) => x + r.c, 0));
    return { head: ['Item', 'SKU', 'Qty sold', 'Sales', 'Cost', 'Profit', 'Margin'], rows: list.map(r => row([r.name, r.sku, r.qty, r.s, r.c, r2(r.s - r.c), pct(r.s - r.c, r.s)])), foot: ['Total', '', list.reduce((x, r) => x + r.qty, 0), S, C, r2(S - C), pct(S - C, S)], note: 'Invoice-level discounts are shared across the items on that invoice.' };
  } },
  { id: 'profman', g: 'Profit', t: 'Profit by Salesman', p: 'range', m: 1, run: async (f, t) => {
    const g = {}; liveInvoices(f, t).forEach(i => { const r = g[i.salesman] || (g[i.salesman] = { n: 0, s: 0, c: 0 }); r.n++; r.s = r2(r.s + L.netSales(i)); r.c = r2(r.c + i.costTotal); });
    const perf = L.staffPerformance(f, t), conv = Object.fromEntries(perf.map(p => [p.uid, p])), ids = Object.keys(g).sort((a, b) => (g[b].s - g[b].c) - (g[a].s - g[a].c));
    const S = r2(ids.reduce((x, k) => x + g[k].s, 0)), C = r2(ids.reduce((x, k) => x + g[k].c, 0));
    return { head: ['Salesman', 'Walk-ins', 'Conversion', 'Invoices', 'Sales', 'Cost', 'Profit', 'Margin'], rows: ids.map(k => row([L.nm(k), conv[k]?.enquiries || 0, conv[k] ? conv[k].conv.toFixed(0) + '%' : '—', g[k].n, g[k].s, g[k].c, r2(g[k].s - g[k].c), pct(g[k].s - g[k].c, g[k].s)])), foot: ['Total', '', '', ids.reduce((x, k) => x + g[k].n, 0), S, C, r2(S - C), pct(S - C, S)] };
  } },
  { id: 'invval', g: 'Inventory', t: 'Inventory Valuation', p: 'none', opt: 'invgroup', cat: 1, run: async (f, t, o) => {
    L.derive(true); const list = all('items').filter(i => num(i.onHand) && catOk(o, i.category)).sort((a, b) => a.category.localeCompare(b.category) || a.name.localeCompare(b.name, undefined, { numeric: true }));
    const T = [0, 0, 0]; const rows = [];
    if (o.invgroup === 'category') { const g = {}; list.forEach(i => { const r = g[i.category] || (g[i.category] = [0, 0, 0, 0]); r[0]++; r[1] += num(i.onHand); r[2] = r2(r[2] + i.onHand * i.cost); r[3] = r2(r[3] + i.onHand * i.mrp); }); Object.keys(g).sort().forEach(k => { rows.push(row([k, g[k][0] + ' items', g[k][1], '', g[k][2], g[k][3]])); T[0] += g[k][1]; T[1] += g[k][2]; T[2] += g[k][3]; }); }
    else list.forEach(i => { const v = r2(i.onHand * i.cost), mv = r2(i.onHand * i.mrp); rows.push(row([i.name, i.sku + ' · ' + i.category, i.onHand, i.cost, v, mv])); T[0] += num(i.onHand); T[1] += v; T[2] += mv; });
    return { sub: 'Valued by ' + L.VALUATION[L.valuationMethod()], head: [o.invgroup === 'category' ? 'Category' : 'Item', o.invgroup === 'category' ? 'Items' : 'SKU · category', 'Qty', 'Unit cost', 'Value at cost', 'Value at MRP'], rows, foot: ['Total', '', T[0], '', r2(T[1]), r2(T[2])], note: 'Valued at weighted average cost. Ledger inventory: ' + money((byId('accounts', L.ACC.inv) || {}).bal || 0) + '.' };
  } },
  { id: 'invsum', g: 'Inventory', t: 'Inventory Summary', p: 'range', cat: 1, run: async (f, t, o) => {
    L.derive(true); const mv = store.data.stockMoves_ || [], g = {};
    all('items').filter(i => catOk(o, i.category)).forEach(i => g[i.id] = { i, open: 0, inn: 0, sold: 0, adj: 0 });
    mv.forEach(m => { const r = g[m.itemId]; if (!r) return; if (m.date < f) r.open += m.qty; else if (m.date <= t) { if (m.refType === 'invoice') r.sold -= m.qty; else if (m.refType === 'adjustment') r.adj += m.qty; else r.inn += m.qty; } });
    const list = Object.values(g).filter(r => r.open || r.inn || r.sold || r.adj).sort((a, b) => a.i.category.localeCompare(b.i.category) || a.i.name.localeCompare(b.i.name, undefined, { numeric: true }));
    const T = [0, 0, 0, 0, 0, 0];
    const rows = list.map(r => { const close = r.open + r.inn - r.sold + r.adj, v = r2(close * num(r.i.cost)); [r.open, r.inn, r.sold, r.adj, close, v].forEach((x, k) => T[k] = r2(T[k] + x)); return row([r.i.name, r.i.category, r.open, r.inn, r.sold, r.adj || '', close, v]); });
    return { head: ['Item', 'Category', 'Opening qty', 'Received', 'Sold', 'Adjusted', 'Closing qty', 'Closing value'], rows, foot: ['Total', '', ...T.slice(0, 3), T[3] || '', T[4], T[5]], note: '"Received" includes purchases, opening stock and returns from voided invoices. Closing value uses today’s average cost.' };
  } }
];
R.push({ id: 'itemhist', g: 'Inventory', t: 'Item Transaction History', p: 'range', cat: 1, opt: 'item', run: async (f, t, o) => {
  L.derive(true); const mv = (store.data.stockMoves_ || []).slice().sort((a, b) => a.date.localeCompare(b.date) || (a.createdAt || 0) - (b.createdAt || 0));
  const invBy = {}, pbBy = {}, adjBy = {}; all('invoices').forEach(i => invBy[i.no] = i); all('purchases').forEach(p => pbBy[p.no] = p); all('adjustments').forEach(a => adjBy[a.no] = a);
  const TYPE = { opening: 'Opening stock', purchase: 'Purchase', invoice: 'Sale', void: 'Sale voided (back in stock)', adjustment: 'Stock adjustment' };
  const party = m => ['invoice', 'void'].includes(m.refType) ? (invBy[m.refNo] || {}).customerName || '' : m.refType === 'purchase' ? (pbBy[m.refNo] || {}).supplierName || '' : m.refType === 'adjustment' ? (adjBy[m.refNo] || {}).reason || '' : '';
  const ref = m => m.refType === 'purchase' && pbBy[m.refNo]?.billNo ? m.refNo + ' / ' + pbBy[m.refNo].billNo : m.refNo;
  const price = m => { if (!['invoice', 'void'].includes(m.refType)) return ''; const l = (invBy[m.refNo]?.lines || []).find(x => x.itemId === m.itemId); return l ? num(l.rate) : ''; };
  if (o.item) {
    const it = byId('items', o.item); if (!it) return { head: ['Choose an item above'], rows: [] };
    const mine = mv.filter(m => m.itemId === it.id); let bal = mine.filter(m => m.date < f).reduce((s, m) => s + m.qty, 0);
    const rows = [row([D(f), 'Opening balance', '', '', '', '', bal, '', ''], 'sub')]; let qi = 0, qo = 0;
    mine.filter(m => inR(m.date, f, t)).forEach(m => { bal += m.qty; if (m.qty > 0) qi += m.qty; else qo -= m.qty; rows.push(row([D(m.date), TYPE[m.refType] || m.refType, ref(m), party(m), m.qty > 0 ? m.qty : '', m.qty < 0 ? -m.qty : '', bal, m.cost, price(m)])); });
    return { head: ['Date', 'Transaction', 'Reference', 'Customer / vendor / reason', 'Qty in', 'Qty out', 'Balance qty', 'Unit cost', 'Sale price'], rows, foot: ['', 'Closing balance', '', '', qi, qo, bal, '', ''], sub: it.name + ' · ' + it.sku + ' · ' + it.category, note: 'Now in stock: ' + num(it.onHand) + ' · committed to open orders: ' + (L.committedMap()[it.id] || 0) + ' · average cost ' + money(it.cost) + '.' };
  }
  const ok = new Set(all('items').filter(i => catOk(o, i.category)).map(i => i.id)), list = mv.filter(m => ok.has(m.itemId) && inR(m.date, f, t)).reverse();
  const shown = list.slice(0, 1000), qi = list.filter(m => m.qty > 0).reduce((s, m) => s + m.qty, 0), qo = -list.filter(m => m.qty < 0).reduce((s, m) => s + m.qty, 0);
  return { head: ['Date', 'Item', 'Transaction', 'Reference', 'Customer / vendor / reason', 'Qty in', 'Qty out', 'Unit cost'], rows: shown.map(m => { const it = byId('items', m.itemId) || {}; return row([D(m.date), it.name || '', TYPE[m.refType] || m.refType, ref(m), party(m), m.qty > 0 ? m.qty : '', m.qty < 0 ? -m.qty : '', m.cost]); }),
    foot: ['Total', list.length + ' transactions', '', '', '', qi, qo, ''], note: (list.length > 1000 ? 'Showing the latest 1,000. ' : '') + 'Choose one item above to see its running stock balance.' };
} });
const OPTS = {
  salesby: ['By day', 'day', [['day', 'By day'], ['month', 'By month'], ['customer', 'By customer'], ['salesman', 'By salesman'], ['category', 'By category'], ['item', 'By item']]],
  invgroup: ['Detail', 'item', [['item', 'Item by item'], ['category', 'By category']]],
  billstatus: ['Bills', 'all', [['all', 'All bills'], ['unpaid', 'Unpaid only'], ['paid', 'Paid only']]],
  bsview: ['View', 'summary', [['summary', 'Summary view'], ['expanded', 'Expanded view (every ledger)']]]
};

/* ---------- screen ---------- */
let cur = 'mgmt', per = 'month', from = null, to = null, asof = null, opts = { salesby: 'day', invgroup: 'item', billstatus: 'all', bsview: 'summary', cmp: 'none', cmpN: 1, cmpPct: true, supplier: '', customer: '', category: '', item: '' }, last = null;
const visible = () => R.filter(r => !r.m || mgmt());
function range() { const t = today(); return { today: [t, t], week: [weekStart(t), t], month: [t.slice(0, 8) + '01', t], last: lastMonth(), quarter: (() => { const d = new Date(t + 'T00:00'); d.setMonth(Math.floor(d.getMonth() / 3) * 3, 1); return [today(d), t]; })(), year: [t.slice(0, 4) + '-01-01', t], custom: [from || t.slice(0, 8) + '01', to || t] }[per]; }
// open the Customer Statement for one customer, from their first transaction until today
export function customerStatement(cid) {
  const ev = custEvents(cid); cur = 'cstmt'; opts.customer = cid; per = 'custom'; from = ev.length ? ev[0].d : today(); to = today();
  if (location.hash === '#/reports') { if (window.__rerender) window.__rerender(); } else location.hash = '#/reports';
}
export const reports = {
  title: 'Reports', icon: '📑', roles: ['admin', 'manager', 'billing'],
  body() {
    const vis = visible(); if (!vis.find(r => r.id === cur)) cur = vis[0].id;
    const r = R.find(x => x.id === cur), [f, t] = range(), groups = [...new Set(vis.map(x => x.g))];
    return `<div class="rep-grid"><nav class="panel rep-menu">${groups.map(g => `<div class="rep-g">${esc(g)}</div>${vis.filter(x => x.g === g).map(x => `<button class="rep-i${x.id === cur ? ' active' : ''}" data-r="${x.id}">${esc(x.t)}</button>`).join('')}`).join('')}</nav>
      <section class="panel" style="min-width:0"><div class="panel-h"><div><h2 style="margin:0">${esc(r.t)}</h2><div class="hint" id="repSub"></div></div><div style="display:flex;gap:8px;flex-wrap:wrap"><button class="btn btn-sm btn-accent" data-a="pdf">⬇ Save as PDF</button>${r.id === 'mgmt' ? '<button class="btn btn-sm" data-a="share">📋 Copy for WhatsApp / email</button>' : ''}<button class="btn btn-sm" data-a="csv">⬇ Excel (CSV)</button><button class="btn btn-sm" data-a="doc">⬇ Printable file</button></div></div>
      <div class="toolbar">${r.p === 'range' ? `<div class="chips">${[['month', 'This month'], ['last', 'Last month'], ['quarter', 'This quarter'], ['year', 'This year'], ['week', 'This week'], ['today', 'Today'], ['custom', 'Custom']].map(([k, l]) => `<button class="chip${k === per ? ' active' : ''}" data-p="${k}">${l}</button>`).join('')}</div>${per === 'custom' ? `<input type="date" class="inp" id="rpFrom" value="${f}" style="width:auto"><input type="date" class="inp" id="rpTo" value="${t}" style="width:auto">` : `<span class="hint">${D(f)} – ${D(t)}</span>`}` : ''}
        ${r.p === 'asof' ? `<label class="hint">As of</label><input type="date" class="inp" id="rpAsof" value="${asof || today()}" style="width:auto">` : ''}
        ${r.opt === 'customer' ? `<select class="inp" id="rpCust" style="width:auto;min-width:240px;max-width:100%"><option value="">Choose a customer…</option>${customerOpts().map(([k, l]) => `<option value="${k}"${k === opts.customer ? ' selected' : ''}>${esc(l)}</option>`).join('')}</select>` : ''}
        ${r.opt === 'supplier' ? `<select class="inp" id="rpSup" style="width:auto;min-width:220px"><option value="">Choose a vendor…</option>${supplierOpts().map(([k, l]) => `<option value="${k}"${k === opts.supplier ? ' selected' : ''}>${esc(l)}</option>`).join('')}</select>` : ''}
        ${r.cat ? `<select class="inp" id="rpCat" style="width:auto;min-width:180px" aria-label="Category"><option value="">All categories</option>${[...new Set(all('items').map(i => i.category))].sort().map(c => `<option${c === opts.category ? ' selected' : ''}>${esc(c)}</option>`).join('')}</select>` : ''}
        ${r.opt === 'item' ? `<select class="inp" id="rpItem" style="width:auto;min-width:240px;max-width:100%" aria-label="Item"><option value="">All items${opts.category ? ' in ' + esc(opts.category) : ''}</option>${all('items').filter(i => catOk(opts, i.category)).sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true })).map(i => `<option value="${i.id}"${i.id === opts.item ? ' selected' : ''}>${esc(i.name)} · ${esc(i.sku)}</option>`).join('')}</select>` : ''}
        ${r.cmp ? `<span style="display:inline-flex;gap:6px;align-items:center;flex-wrap:wrap"><label class="hint">Compare with</label><select class="inp" id="rpCmp" style="width:auto"><option value="none"${opts.cmp === 'none' ? ' selected' : ''}>No comparison</option><option value="prev"${opts.cmp === 'prev' ? ' selected' : ''}>Previous periods</option><option value="year"${opts.cmp === 'year' ? ' selected' : ''}>Same period, previous years</option></select>
          ${opts.cmp !== 'none' ? `<select class="inp" id="rpCmpN" style="width:auto" aria-label="Number of periods">${[1, 2, 3, 4, 5, 6, 12].map(k => `<option value="${k}"${k === opts.cmpN ? ' selected' : ''}>${k} ${opts.cmp === 'year' ? (k > 1 ? 'years' : 'year') : (k > 1 ? 'periods' : 'period')}</option>`).join('')}</select><label class="check" style="margin:0"><input type="checkbox" id="rpCmpPct"${opts.cmpPct ? ' checked' : ''}> Show % change</label>` : ''}</span>` : ''}
        ${OPTS[r.opt] ? `<select class="inp" id="rpOpt" style="width:auto">${OPTS[r.opt][2].map(([k, l]) => `<option value="${k}"${k === opts[r.opt] ? ' selected' : ''}>${l}</option>`).join('')}</select>` : ''}</div>
      <div id="repOut"><div class="empty">Working it out…</div></div></section></div>`;
  },
  async after() {
    const r = R.find(x => x.id === cur), [f, t] = r.p === 'asof' ? [asof || today(), asof || today()] : range();
    let out; try { out = await r.run(f, t, opts); } catch (e) { console.error(e); out = { head: ['Error'], rows: [row([e.message])] }; }
    last = { r, out, f, t };
    const isPct = v => typeof v === 'string' && /^([+-]?\d[\d.,]*%|new|—)$/.test(v);
    const isNum = v => typeof v === 'number', cell = (v, k) => isNum(v) ? `<td class="num">${money(v)}</td>` : isPct(v) && k ? `<td class="num nowrap" style="color:${/^\+/.test(v) ? 'var(--ok)' : /^-/.test(v) ? 'var(--danger)' : 'var(--muted)'};font-size:12px">${esc(v)}</td>` : `<td${k === 0 ? '' : ' class="nowrap"'}>${esc(v)}</td>`;
    const qtyCols = new Set(out.head.map((h, k) => /qty|invoices|walk-ins|items|received|sold|adjusted/i.test(h) ? k : -1).filter(k => k >= 0));
    const fmt = (v, k) => isNum(v) && qtyCols.has(k) ? `<td class="num">${v.toLocaleString('en-IN')}</td>` : cell(v, k);
    const sub = r.p === 'asof' ? 'As of ' + D(t) : r.p === 'range' ? D(f) + ' – ' + D(t) : 'As of today, ' + D(today());
    if ($('repSub')) $('repSub').textContent = (out.sub ? out.sub + ' · ' : '') + (r.cat && opts.category ? 'Category: ' + opts.category + ' · ' : '') + sub + ' · ' + setting('name', '');
    if (!$('repOut')) return;
    if (out.html) { $('repOut').innerHTML = out.html; return; }
    $('repOut').innerHTML = out.rows.length ? `<div class="tw" style="max-height:70vh"><table class="rep"><thead><tr>${out.head.map((h, k) => `<th class="${k && (out.rows.some(x => isNum(x.c[k]) || isPct(x.c[k])) || qtyCols.has(k)) ? 'num' : ''}">${esc(h)}</th>`).join('')}</tr></thead><tbody>
      ${out.rows.map(x => `<tr class="${x.k ? 'r-' + x.k : ''}${x.go != null ? ' go' : ''}"${x.go != null ? ` data-go="${x.go}" title="Open"` : ''}>${x.k === 'sec' ? `<td colspan="${out.head.length}">${esc(x.c[0])}</td>` : x.c.map(fmt).join('') + (x.c.length < out.head.length ? '<td></td>'.repeat(out.head.length - x.c.length) : '')}</tr>`).join('')}</tbody>
      ${out.foot ? `<tfoot><tr>${out.foot.map(fmt).join('')}</tr></tfoot>` : ''}</table></div>${out.note ? `<p class="hint" style="margin-top:8px">${esc(out.note)}</p>` : ''}` : `<div class="empty"><div class="big">📑</div>Nothing to show for this period.</div>`;
  },
  bind(root) {
    root.addEventListener('click', e => {
      const x = e.target.closest('[data-r]'); if (x) { cur = x.dataset.r; return rr(); }
      const g = e.target.closest('[data-go]'); if (g && last) { const go = GO.reg[+g.dataset.go]; if (go && go.t === 'report') { cur = go.id; per = 'year'; return rr(); } return openGo(go, last.t); }
      const p = e.target.closest('[data-p]'); if (p) { per = p.dataset.p; return rr(); }
      const a = e.target.closest('[data-a]')?.dataset.a; if (!a || !last) return;
      const name = last.r.t.replace(/[^\w]+/g, '_') + '_' + last.t;
      const plain = v => typeof v === 'number' ? r2(v) : v;
      if (a === 'csv') download(name + '.csv', toCSV([[last.r.t], [$('repSub')?.textContent || ''], [], last.out.head, ...last.out.rows.map(x => x.c.map(plain)), ...(last.out.foot ? [last.out.foot.map(plain)] : [])]));
      if (a === 'pdf' && last.out.doc) return savePdf(last.out.doc, 'Management_summary_' + last.f + '_to_' + last.t, '.sum-page', { fit: 'A4', margin: 10, width: 900 });
      if (a === 'pdf') { if (!last.out.rows.length && !last.out.html) return toast('Nothing to save for this period.', 'warn'); return reportPdf({ title: last.r.t, sub: $('repSub')?.textContent || '', html: $('repOut').innerHTML, name }).catch(fail); }
      if (a === 'share' && last.out.text) { const txt = last.out.text, show = () => openModal('Summary to share', `<p class="hint" style="margin:0 0 8px">Select all and copy, then paste into WhatsApp or an email.</p><textarea id="shTxt" class="inp" rows="14" readonly style="font-family:inherit">${esc(txt)}</textarea>`, [{ label: 'Close' }], { onOpen: () => { const x = $('shTxt'); x.focus(); x.select(); } });
        try { navigator.clipboard.writeText(txt).then(() => toast('Summary copied — paste it into WhatsApp or an email.'), show); } catch (er) { show(); } return; }
      if (a === 'doc') saveDocument(name + '.html', last.r.t, `<div class="doc"><h1>${esc(setting('name', ''))}</h1><h2 style="text-align:left;margin:2mm 0">${esc(last.r.t)}</h2><div>${esc($('repSub')?.textContent || '')}</div>${$('repOut').innerHTML.replace(/max-height:70vh/, '')}</div>`);
    });
    root.addEventListener('change', e => {
      if (e.target.id === 'rpFrom') from = e.target.value; if (e.target.id === 'rpTo') to = e.target.value; if (e.target.id === 'rpAsof') asof = e.target.value;
      if (e.target.id === 'rpSup') opts.supplier = e.target.value; if (e.target.id === 'rpCust') opts.customer = e.target.value; if (e.target.id === 'rpCat') { opts.category = e.target.value; const it = byId('items', opts.item); if (it && !catOk(opts, it.category)) opts.item = ''; } if (e.target.id === 'rpItem') opts.item = e.target.value; if (e.target.id === 'rpOpt') opts[R.find(x => x.id === cur).opt] = e.target.value;
      if (e.target.id === 'rpCmp') opts.cmp = e.target.value; if (e.target.id === 'rpCmpN') opts.cmpN = +e.target.value; if (e.target.id === 'rpCmpPct') opts.cmpPct = e.target.checked;
      if (['rpFrom', 'rpTo', 'rpAsof', 'rpSup', 'rpCust', 'rpOpt', 'rpCat', 'rpItem', 'rpCmp', 'rpCmpN', 'rpCmpPct'].includes(e.target.id)) rr();
    });
  },
  static: true
};

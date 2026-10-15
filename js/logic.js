// GRID Shop Manager (Claude edition) — business rules.
// Every transaction is stored once as its own record; balances, stock, the ledger and the
// statistics are calculated from those records (the Claude store has no transactions or counters).
import { store, all, byId, setting, uid, r2, num, today, addDays, pad } from './core.js';

/* ============ chart of accounts ============ */
export const DEFAULT_ACCOUNTS = [
  ['1000', 'Cash in Hand', 'asset', 'cash'], ['1010', 'Bank – Current Account', 'asset', 'bank'], ['1020', 'Card / UPI Clearing', 'asset', 'bank'],
  ['1200', 'Accounts Receivable (Customers)', 'asset', 'ar'], ['1300', 'Inventory (Stock)', 'asset', 'inventory'], ['1500', 'Furniture, Fixtures & Equipment', 'asset', 'fixed'],
  ['2000', 'Accounts Payable (Suppliers)', 'liability', 'ap'], ['2100', 'Loans', 'liability', 'loan'], ['2200', 'Other Payables', 'liability', 'other'],
  ['3000', "Owner's Capital", 'equity', 'capital'], ['3100', "Owner's Drawings", 'equity', 'drawings'], ['3900', 'Opening Balance Equity', 'equity', 'obe'],
  ['4000', 'Sales', 'income', 'sales'], ['4050', 'Sales Returns', 'income', 'returns'], ['4100', 'Other Income', 'income', 'other'],
  ['5000', 'Cost of Goods Sold', 'expense', 'cogs'], ['5100', 'Stock Adjustments', 'expense', 'stockadj'], ['5900', 'Cash Short / Over', 'expense', 'cashdiff'],
  ['6000', 'Rent', 'expense', 'opex'], ['6100', 'Salaries & Wages', 'expense', 'opex'], ['6200', 'Electricity & Water', 'expense', 'opex'],
  ['6300', 'Transport & Delivery', 'expense', 'opex'], ['6400', 'Shop Maintenance', 'expense', 'opex'], ['6500', 'Advertising', 'expense', 'opex'],
  ['6600', 'Telephone & Internet', 'expense', 'opex'], ['6700', 'Bank Charges', 'expense', 'opex'], ['6900', 'Other Expenses', 'expense', 'opex']
];
export const ACC = { othchg: 'aoth_chg', cgst: 'agst_c', sgst: 'agst_s', igst: 'agst_i', svcinc: 'asvc_inc', svccost: 'asvc_cost', salesret: 'a4050', cash: 'a1000', bank: 'a1010', card: 'a1020', ar: 'a1200', inv: 'a1300', ap: 'a2000', obe: 'a3900', sales: 'a4000', cogs: 'a5000', stockadj: 'a5100', cashdiff: 'a5900' };
export const TYPE_ORDER = ['asset', 'liability', 'equity', 'income', 'expense'];
// Account classes: [kind key, type, group, label, suggested code range start]
export const ACCOUNT_KINDS = [
  ['asset:cash', 'asset', 'cash', 'Cash drawer', 1000], ['asset:bank', 'asset', 'bank', 'Bank account / card / UPI', 1010], ['asset:other', 'asset', 'other', 'Other current asset (deposits, advances)', 1400], ['asset:fixed', 'asset', 'fixed', 'Fixed asset', 1500],
  ['liability:loan', 'liability', 'loan', 'Loan', 2100], ['liability:other', 'liability', 'other', 'Other liability', 2200],
  ['equity:other', 'equity', 'other', 'Equity / capital', 3200],
  ['income:opinc', 'income', 'opinc', 'Operating income', 4010], ['income:other', 'income', 'other', 'Other / non-operating income', 4100],
  ['expense:cos', 'expense', 'cos', 'Cost of sales', 5200], ['expense:opex', 'expense', 'opex', 'Operating expense', 6000], ['expense:nonop', 'expense', 'nonop', 'Non-operating expense', 8000]
];
// System groups that postings depend on — their class can't be changed.
export const FIXED_GROUPS = ['cash', 'bank', 'ar', 'inventory', 'ap', 'obe', 'sales', 'returns', 'cogs', 'stockadj', 'cashdiff', 'capital', 'drawings', 'tax'];
export const isCOS = a => a.type === 'expense' && ['cogs', 'stockadj', 'cos'].includes(a.group);
export const isNonOpExp = a => a.type === 'expense' && a.group === 'nonop';
export const isOpex = a => a.type === 'expense' && !isCOS(a) && !isNonOpExp(a);
export const isOtherInc = a => a.type === 'income' && a.group === 'other';
export const accClass = a => a.type === 'income' ? (isOtherInc(a) ? 'Other income' : 'Income') : a.type === 'expense' ? (isCOS(a) ? 'Cost of sales' : isNonOpExp(a) ? 'Non-operating expenses' : 'Operating expenses') : ({ asset: 'Assets', liability: 'Liabilities', equity: 'Equity' })[a.type];
export const nextAccCode = start => { let c = start; const used = new Set(all('accounts').map(a => a.code)); while (used.has(String(c))) c++; return String(c); };
export const moneyAccounts = () => all('accounts').filter(a => a.group === 'cash' || a.group === 'bank').sort((a, b) => a.code.localeCompare(b.code));
export const accName = id => (byId('accounts', id) || {}).name || id;
export const ROLES = { admin: 'Admin / Owner', manager: 'Manager', billing: 'Billing & Accounts', sales: 'Salesman', pending: 'Waiting for a role', disabled: 'Disabled' };
export const can = { manage: r => r === 'admin' || r === 'manager', office: r => ['admin', 'manager', 'billing'].includes(r), admin: r => r === 'admin' };
export const FIN = ['receipts', 'purchases', 'purchaseOrders', 'payments', 'expenses', 'transfers', 'journals', 'adjustments', 'openings', 'cashClosings', 'accounts', 'labelQueue', 'creditNotes', 'debitNotes'];
export const SHARED = ['settings', 'team', 'members', 'items', 'customers', 'suppliers', 'quotations', 'followups', 'salesOrders', 'invoices', 'tasks', 'counts', 'countSheets', 'services'];

/* ============ helpers ============ */
const me = () => store.me;
const stamp = () => ({ updatedAt: Date.now(), updatedBy: me()?.id || '' });
const created = () => ({ createdAt: Date.now(), createdBy: me()?.id || '' });
export const PREFIX = { QT: 'QT', SO: 'SO', INV: 'INV', RCPT: 'RCPT', PB: 'PB', PO: 'PO', SR: 'SR', SI: 'SI', PAY: 'PAY', EXP: 'EXP', JV: 'JV', TRF: 'TRF', ADJ: 'ADJ', REF: 'REF', TSK: 'TSK', CN: 'CN', DN: 'DN' };
async function number(key) { const n = await store.db.nextNumber(key); return (setting('prefix' + key, PREFIX[key]) || key) + '-' + pad(n, 5); }
export function lineTotal(l) { return r2(num(l.qty) * num(l.rate) - num(l.disc)); }
/* ============ GST on invoices: inclusive or exclusive, CGST + SGST (within state) or IGST (other state) ============ */
export const GST_RATES = [0, 5, 12, 18, 28];
export const TAX_MODES = { exclusive: 'Exclusive — GST added on top of the prices', inclusive: 'Inclusive — prices already include GST' };
export const TAX_TYPES = { intra: 'Within state — CGST + SGST', inter: 'Other state — IGST' };
const TAX_ACCS = [['cgst', 'Output CGST Payable', 2410], ['sgst', 'Output SGST Payable', 2420], ['igst', 'Output IGST Payable', 2430]];
export function taxDefaults() { const c = byId('settings', 'company') || {}; return { on: c.taxOn !== false, rate: c.taxRate == null || c.taxRate === '' ? 18 : Math.max(0, num(c.taxRate)), mode: c.taxMode === 'exclusive' ? 'exclusive' : 'inclusive', type: c.taxType === 'inter' ? 'inter' : 'intra', name: c.taxName || 'GST' }; }
// net = value after discounts; returns the taxable value, the tax split and the invoice total. off / rate 0 → no tax.
export function calcTax(net, t) {
  net = r2(net); if (!t || t.on === false) return null;
  const rate = Math.max(0, Math.min(100, num(t.rate))), mode = t.mode === 'exclusive' ? 'exclusive' : 'inclusive', type = t.type === 'inter' ? 'inter' : 'intra';
  const taxable = mode === 'inclusive' ? r2(net * 100 / (100 + rate)) : net, tax = mode === 'inclusive' ? r2(net - taxable) : r2(net * rate / 100);
  const cgst = type === 'intra' ? r2(tax / 2) : 0, sgst = type === 'intra' ? r2(tax - cgst) : 0, igst = type === 'inter' ? tax : 0;
  return { name: t.name || taxDefaults().name, rate, mode, type, taxable, tax, cgst, sgst, igst, total: r2(taxable + tax) };
}
// what the sale is worth without GST (reports, profit)
export const netSales = d => d && d.tax ? num(d.tax.taxable) : num(d && d.total);
export const taxAccOk = k => !!byId('accounts', ACC[k]);
function ensureTaxAccounts(ops) { if (!can.office(me()?.role)) return; TAX_ACCS.forEach(([k, name, code]) => { if (!byId('accounts', ACC[k]) && !ops.some(o => o.coll === 'accounts' && o.id === ACC[k])) ops.push(set('accounts', ACC[k], { code: nextAccCode(code), name, type: 'liability', group: 'tax', system: true })); }); }
export async function setupTaxAccounts() { const ops = []; ensureTaxAccounts(ops); if (ops.length) await store.db.commit(ops); return ops.length; }
// journal lines for the tax part of a document (cr for sales, dr for returns); a missing tax account falls back to Other Payables until it is created
function taxLines(t, side, extra = {}) { if (!t || !num(t.tax)) return []; return ['cgst', 'sgst', 'igst'].filter(k => num(t[k])).map(k => ({ acc: byId('accounts', ACC[k]) ? ACC[k] : 'a2200', [side]: num(t[k]), ...extra })); }
/* ============ other charges on enquiries, sales orders and invoices (delivery, processing, other) ============ */
export const CHARGE_TYPES = { delivery: 'Delivery charges', processing: 'Processing charges', other: 'Other charges' };
export function cleanCharges(ch) {
  return (Array.isArray(ch) ? ch : []).map(c => { const type = CHARGE_TYPES[c && c.type] ? c.type : 'other'; const amount = r2(num(c && c.amount));
    if (amount < 0) throw Error('A charge can’t be negative — use the discount instead.');
    return { type, name: String((c && c.name) || '').trim().replace(/\s+/g, ' ').slice(0, 60) || CHARGE_TYPES[type], amount }; }).filter(c => c.amount > 0);
}
// charges after GST is taken out (inclusive prices), so they can be posted to their own income account
export const chargesNet = d => { const c = num(d && d.chargesTotal); if (!c || !d.tax) return r2(c); const base = d.tax.mode === 'inclusive' ? num(d.tax.total) : num(d.tax.taxable); return base ? r2(c * num(d.tax.taxable) / base) : 0; };
// value of the goods only (without charges and GST) — item reports, profit, incentives
export const goodsNet = d => r2(netSales(d) - chargesNet(d));
export function docTotals(lines, discount = 0, charges = []) { const sub = r2(lines.reduce((s, l) => s + lineTotal(l), 0)), ch = cleanCharges(charges), ct = r2(ch.reduce((s, c) => s + c.amount, 0)); return { subtotal: sub, discount: r2(discount), charges: ch, chargesTotal: ct, total: r2(sub - num(discount) + ct) }; }
function ensureChargeAccount(ops) { if (!can.office(me()?.role) || byId('accounts', ACC.othchg) || ops.some(o => o.coll === 'accounts' && o.id === ACC.othchg)) return; ops.push(set('accounts', ACC.othchg, { code: nextAccCode(4300), name: 'Delivery & Other Charges', type: 'income', group: 'opinc', system: true })); }
export const normMobile = m => String(m || '').replace(/[^\d+]/g, '').replace(/^00/, '+');
export function lockedUpTo() { return (byId('settings', 'lock') || {}).closedUpTo || ''; }
function checkDate(date) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date || '')) throw Error('Please choose a valid date.');
  const L = lockedUpTo(); if (L && date <= L) throw Error(`Cash is closed up to ${L}. Use a later date, or ask the owner to reopen that day.`);
}
const set = (coll, id, data) => ({ t: 'set', coll, id, data });
const upd = (coll, id, data) => ({ t: 'update', coll, id, data });
const del = (coll, id) => ({ t: 'delete', coll, id });
const cleanLines = lines => (lines || []).filter(l => l.name && num(l.qty) > 0).map(l => {
  const o = { itemId: l.itemId || '', sku: l.sku || '', name: l.name, qty: num(l.qty), rate: r2(l.rate), disc: r2(l.disc || 0) };
  o.src = ['order', 'custom'].includes(l.src) ? l.src : 'stock'; o.lk = l.lk || 'k' + uid();
  const desc = String(l.desc || '').trim(); if (desc) o.desc = desc;
  if (o.src === 'custom') o.spec = String(l.spec || '').trim();
  if (!o.itemId && l.newItem) o.newItem = { category: String(l.newItem.category || 'GENERAL').toUpperCase().trim(), mrp: r2(l.newItem.mrp ?? l.rate) };
  return o;
});
// Lines a salesman added as "new item" are created in the item list by billing (salesmen can't write items).
export async function resolveNewItems(lines) {
  const out = [];
  for (const l of lines || []) {
    if (l.itemId || !l.newItem) { out.push(l); continue; }
    const sku = String(l.sku || '').trim(), name = String(l.name || '').trim();
    const ex = all('items').find(x => x.sku === sku && x.name.toLowerCase() === name.toLowerCase()) || (sku ? all('items').find(x => x.sku === sku) : null);
    const itemId = ex ? ex.id : await saveItem({ name, sku: sku || nextSku(), category: l.newItem.category, mrp: l.newItem.mrp ?? l.rate, cost: 0, onHand: 0 });
    const { newItem, ...rest } = l; out.push({ ...rest, itemId, sku: ex ? ex.sku : (sku || byId('items', itemId)?.sku || '') });
  }
  return out;
}
export function nextSku() { let m = 0; all('items').forEach(it => { if (/^\d{1,9}$/.test(it.sku)) m = Math.max(m, +it.sku); }); return String(m ? m + 1 : 1001); }

/* ============ inventory valuation method ============ */
export const VALUATION = { avg: 'Weighted average cost', fifo: 'FIFO (first in, first out)' };
export const valuationHistory = () => (setting('valuationHistory', null) || []).slice().sort((a, b) => a.from.localeCompare(b.from));
export const valuationMethod = () => { const h = valuationHistory(); return h.length ? h[h.length - 1].method : 'avg'; };
export async function setValuationMethod(method, from) {
  if (!VALUATION[method]) throw Error('Choose a valuation method.'); from = from || today(); checkDate(from);
  const h = valuationHistory().filter(x => x.from < from); if ((h[h.length - 1]?.method || 'avg') === method) throw Error('That method is already in use.');
  await store.db.commit([upd('settings', 'company', { valuationHistory: [...h, { method, from, by: me()?.id || '', at: Date.now() }], ...stamp() })]);
}
// cost per piece for the next `qty` pieces leaving stock (FIFO: oldest layers first; average: the average)
export function issueCosts(lines) {
  derive(true); const used = {};
  return lines.map(({ itemId, qty }) => {
    const it = byId('items', itemId); if (!it) return 0;
    if (valuationMethod() !== 'fifo') return r2(num(it.cost));
    const layers = (store.data.stockLayers_[itemId] || []).map(l => ({ ...l })); let skip = used[itemId] || 0, need = num(qty), cost = 0, lastC = num(it.cost);
    for (const l of layers) { if (l.q <= 0) continue; let q = l.q; if (skip > 0) { const s2 = Math.min(skip, q); skip -= s2; q -= s2; } if (q <= 0) continue; const take = Math.min(q, need); cost += take * l.c; need -= take; lastC = l.c; if (need <= 1e-9) break; }
    if (need > 1e-9) cost += need * lastC;
    used[itemId] = (used[itemId] || 0) + num(qty);
    return num(qty) ? r2(cost / num(qty)) : r2(num(it.cost));
  });
}

/* ============ the calculation engine ============ */
// Runs over everything loaded and adds the calculated fields to the in-memory copies.
let derivedAt = -1;
export function derive(force) {
  if (!force && derivedAt === store.version) return; derivedAt = store.version;
  const office = can.office(me()?.role);
  const J = [], cust = {}, supp = {}, accBal = {};
  const push = (date, refType, refNo, party, memo, lines, createdAt, extra = {}) => {
    const L = lines.filter(l => r2(l.dr) || r2(l.cr)).map(l => ({ ...l, dr: r2(l.dr || 0), cr: r2(l.cr || 0) }));
    if (L.length) J.push({ id: refType + '_' + refNo + '_' + J.length, date, refType, refNo, party, memo, lines: L, accs: [...new Set(L.map(l => l.acc))], createdAt: createdAt || 0, ...extra });
  };
  // ---- money documents → journal entries
  all('openings').forEach(o => {
    if (o.kind === 'stock') { const v = r2(o.lines.reduce((s, l) => s + num(l.qty) * num(l.cost), 0)); push(o.date, 'opening', 'Opening stock', '', o.memo || 'Opening stock', [{ acc: ACC.inv, dr: v }, { acc: ACC.obe, cr: v }], o.createdAt); }
    if (o.kind === 'customer') push(o.date, 'opening', 'Opening balance', o.partyName, 'Opening balance', [{ acc: ACC.ar, dr: o.amount, c: o.partyId }, { acc: ACC.obe, cr: o.amount }], o.createdAt);
    if (o.kind === 'supplier') push(o.date, 'opening', 'Opening balance', o.partyName, 'Opening balance', [{ acc: ACC.obe, dr: o.amount }, { acc: ACC.ap, cr: o.amount, s: o.partyId }], o.createdAt);
    if (o.kind === 'account' && r2(o.amount)) { const a = r2(o.amount); push(o.date, 'opening', 'Opening balance', '', 'Opening balance – ' + accName(o.accountId), a > 0 ? [{ acc: o.accountId, dr: a }, { acc: ACC.obe, cr: a }] : [{ acc: ACC.obe, dr: -a }, { acc: o.accountId, cr: -a }], o.createdAt); }
  });
  all('journals').filter(j => j.status !== 'void').forEach(j => push(j.date, j.refType || 'manual', j.no || j.refNo, j.party || '', j.memo, j.lines, j.createdAt, { srcId: j.id }));
  all('invoices').forEach(i => {
    let lines;
    if (i.kind === 'service') { // parts sold → Sales; service / visit charges → Service Income; parts given free (warranty) → Warranty & Service Cost
      const net = r2(i.lines.reduce((x, l) => x + lineTotal(l), 0) - num(i.discount)), f = net && i.tax ? num(i.tax.taxable) / net : 1;
      const parts = r2(i.lines.filter(l => l.itemId).reduce((x, l) => x + lineTotal(l), 0) * f), charges = r2(netSales(i) - parts);
      const soldCost = r2(i.lines.filter(l => l.itemId && lineTotal(l) > 0).reduce((x, l) => x + num(l.cost) * num(l.qty), 0)), freeCost = r2(num(i.costTotal) - soldCost);
      lines = [{ acc: ACC.ar, dr: i.total, c: i.customerId }, { acc: ACC.sales, cr: parts }, { acc: ACC.svcinc, cr: charges }, { acc: ACC.cogs, dr: soldCost }, { acc: ACC.svccost, dr: freeCost }, { acc: ACC.inv, cr: i.costTotal }, ...taxLines(i.tax, 'cr')];
    } else { const ch = chargesNet(i); lines = [{ acc: ACC.ar, dr: i.total, c: i.customerId }, { acc: ACC.sales, cr: r2(netSales(i) - ch) }, { acc: byId('accounts', ACC.othchg) ? ACC.othchg : ACC.sales, cr: ch }, ...taxLines(i.tax, 'cr'), { acc: ACC.cogs, dr: i.costTotal }, { acc: ACC.inv, cr: i.costTotal }]; }
    push(i.date, 'invoice', i.no, i.customerName, i.kind === 'service' ? 'Service invoice' + (i.serviceNo ? ' – ' + i.serviceNo : '') : 'Sales invoice', lines, i.createdAt);
    if (i.status === 'void') push(i.voidDate || i.date, 'void', i.no, i.customerName, 'Void ' + i.no, lines.map(l => ({ ...l, dr: l.cr || 0, cr: l.dr || 0 })), i.voidedAt);
  });
  all('receipts').forEach(r => r.amount >= 0
    ? push(r.date, 'receipt', r.no, r.customerName, r.note || 'Payment received' + (r.refNo ? ' – ' + r.refNo : ''), [{ acc: r.accountId, dr: r.amount }, { acc: ACC.ar, cr: r.amount, c: r.customerId }], r.createdAt)
    : push(r.date, 'refund', r.no, r.customerName, r.note || 'Refund to customer', [{ acc: ACC.ar, dr: -r.amount, c: r.customerId }, { acc: r.accountId, cr: -r.amount }], r.createdAt));
  all('creditNotes').forEach(n => { const L = [{ acc: ACC.salesret, dr: netSales(n) }, ...taxLines(n.tax, 'dr'), { acc: ACC.ar, cr: n.total, c: n.customerId }]; if (num(n.costTotal)) L.push({ acc: ACC.inv, dr: n.costTotal }, { acc: ACC.cogs, cr: n.costTotal }); push(n.date, 'creditnote', n.no, n.customerName, 'Sales return' + (n.invoiceNo ? ' – ' + n.invoiceNo : ''), L, n.createdAt); });
  all('debitNotes').forEach(n => { const diff = r2(num(n.total) - num(n.costTotal)), L = [{ acc: ACC.ap, dr: n.total, s: n.supplierId }, { acc: ACC.inv, cr: n.costTotal }]; if (diff > 0) L.push({ acc: ACC.stockadj, cr: diff }); if (diff < 0) L.push({ acc: ACC.stockadj, dr: -diff }); push(n.date, 'debitnote', n.no, n.supplierName, 'Purchase return' + (n.purchaseNo ? ' – ' + n.purchaseNo : ''), L, n.createdAt); });
  all('purchases').forEach(p => push(p.date, 'purchase', p.no, p.supplierName, 'Purchase bill ' + (p.billNo || ''), [{ acc: ACC.inv, dr: p.total }, { acc: ACC.ap, cr: p.total, s: p.supplierId }], p.createdAt));
  all('payments').forEach(p => push(p.date, 'payment', p.no, p.supplierName, p.note || 'Paid to supplier' + (p.refNo ? ' – ' + p.refNo : ''), [{ acc: ACC.ap, dr: p.amount, s: p.supplierId }, { acc: p.accountId, cr: p.amount }], p.createdAt));
  all('expenses').forEach(e => push(e.date, 'expense', e.no, e.payee || '', e.note || e.expenseName, [{ acc: e.expenseAcc, dr: e.amount }, { acc: e.fromAcc, cr: e.amount }], e.createdAt));
  all('transfers').forEach(t => push(t.date, 'transfer', t.no, '', t.note || `Transfer ${accName(t.from)} → ${accName(t.to)}`, [{ acc: t.to, dr: t.amount }, { acc: t.from, cr: t.amount }], t.createdAt));
  all('adjustments').forEach(a => { const v = r2(a.value); if (v) push(a.date, 'adjustment', a.no, '', (a.reason || 'Stock adjustment') + ' – ' + a.name, v > 0 ? [{ acc: ACC.inv, dr: v }, { acc: ACC.stockadj, cr: v }] : [{ acc: ACC.stockadj, dr: -v }, { acc: ACC.inv, cr: -v }], a.createdAt); });
  all('cashClosings').forEach(c => { if (c.diff && c.status !== 'reopened' && !c.diffPending) push(c.date, 'cashdiff', 'Cash closing ' + c.date, '', c.diff < 0 ? 'Cash short at closing' : 'Cash over at closing', c.diff < 0 ? [{ acc: ACC.cashdiff, dr: -c.diff }, { acc: c.accountId, cr: -c.diff }] : [{ acc: c.accountId, dr: c.diff }, { acc: ACC.cashdiff, cr: c.diff }], c.createdAt); });
  J.sort((a, b) => a.date.localeCompare(b.date) || a.createdAt - b.createdAt);
  J.forEach(j => j.lines.forEach(l => {
    accBal[l.acc] = r2((accBal[l.acc] || 0) + l.dr - l.cr);
    if (l.c) cust[l.c] = r2((cust[l.c] || 0) + l.dr - l.cr);
    if (l.s) supp[l.s] = r2((supp[l.s] || 0) + l.cr - l.dr);
  }));
  if (office) {
    all('accounts').forEach(a => a.bal = accBal[a.id] || 0);
    all('customers').forEach(c => c.balance = cust[c.id] || 0);
    all('suppliers').forEach(s => s.balance = supp[s.id] || 0);
  }
  store.data.journals_ = J;
  // ---- stock: replay movements per item (average cost)
  const ev = [];
  all('openings').filter(o => o.kind === 'stock').forEach(o => o.lines.forEach(l => ev.push({ d: o.date, t: o.createdAt, item: l.itemId, q: num(l.qty), c: num(l.cost), ref: 'Opening', type: 'opening' })));
  all('purchases').forEach(p => { const units = p.lines.reduce((s, l) => s + num(l.qty), 0), x = units ? num(p.extra) / units : 0; p.lines.forEach(l => ev.push({ d: p.date, t: p.createdAt, item: l.itemId, q: num(l.qty), c: num(l.rate) + x, ref: p.no, type: 'purchase' })); });
  all('invoices').forEach(i => { i.lines.forEach(l => ev.push({ d: i.date, t: i.createdAt, item: l.itemId, q: -num(l.qty), c: num(l.cost), ref: i.no, type: 'invoice' })); if (i.status === 'void') i.lines.forEach(l => ev.push({ d: i.voidDate || i.date, t: i.voidedAt, item: l.itemId, q: num(l.qty), c: num(l.cost), ref: i.no, type: 'void' })); });
  all('creditNotes').forEach(n => n.lines.forEach(l => { if (l.restock && num(l.qty)) ev.push({ d: n.date, t: n.createdAt, item: l.itemId, q: num(l.qty), c: num(l.cost), ref: n.no, type: 'return' }); }));
  all('debitNotes').forEach(n => n.lines.forEach(l => { if (num(l.qty)) ev.push({ d: n.date, t: n.createdAt, item: l.itemId, q: -num(l.qty), c: num(l.cost), ref: n.no, type: 'preturn' }); }));
  all('adjustments').forEach(a => a.lines ? a.lines.forEach(l => ev.push({ d: a.date, t: a.createdAt, item: l.itemId, q: num(l.diff), c: null, ref: a.no, type: 'adjustment' })) : ev.push({ d: a.date, t: a.createdAt, item: a.itemId, q: num(a.diff), c: a.newCost != null ? num(a.newCost) : null, ref: a.no, type: a.newCost != null ? 'revalue' : 'adjustment' }));
  ev.sort((a, b) => a.d.localeCompare(b.d) || (a.t || 0) - (b.t || 0));
  // cost layers per item: weighted average keeps one layer; FIFO keeps one per receipt and issues the oldest first.
  // When the method changes, the layers collapse into one at the average, so stock value never jumps.
  const hist = valuationHistory(), methodAt = d => { let m = 'avg'; hist.forEach(h => { if (d >= h.from) m = h.method; }); return m; };
  const S = {}, moves = [];
  const val = s => s.layers.reduce((x, l) => x + l.q * l.c, 0), qty = s => s.layers.reduce((x, l) => x + l.q, 0);
  const avgOf = s => { const q = qty(s); return q > 0 ? val(s) / q : s.last; };
  ev.forEach(e => {
    if (!e.item) return; const s = S[e.item] || (S[e.item] = { layers: [], last: 0, m: methodAt(e.d) });
    const m = methodAt(e.d); if (m !== s.m) { const q = qty(s); if (q > 0) s.layers = [{ q, c: avgOf(s) }]; s.m = m; }
    let unit = e.c || 0;
    if (e.type === 'revalue') { s.layers.forEach(l => l.c = e.c); s.last = e.c; }
    else if (e.q > 0) {
      const ec = e.c == null ? avgOf(s) : e.c; unit = ec;
      if (qty(s) < 0) { const nq = qty(s) + e.q; s.layers = nq > 0 ? [{ q: nq, c: ec }] : nq < 0 ? [{ q: nq, c: s.last }] : []; }
      else if (m === 'fifo') s.layers.push({ q: e.q, c: ec });
      else { const q = qty(s); s.layers = [{ q: q + e.q, c: q > 0 ? (val(s) + e.q * ec) / (q + e.q) : ec }]; }
      s.last = ec;
    } else if (e.q < 0) {
      let need = -e.q, cost = 0;
      while (need > 1e-9 && s.layers.length && s.layers[0].q > 0) { const l = s.layers[0], take = Math.min(l.q, need); cost += take * l.c; l.q -= take; need -= take; if (l.q <= 1e-9) s.layers.shift(); }
      if (need > 1e-9) { const c = s.layers[0] ? s.layers[0].c : s.last; cost += need * c; if (s.layers[0] && s.layers[0].q < 0) s.layers[0].q -= need; else s.layers.unshift({ q: -need, c }); }
      unit = cost / -e.q;
    } else if (e.c != null && qty(s) <= 0) s.last = e.c;
    if (e.q) moves.push({ id: 'mv' + moves.length, date: e.d, itemId: e.item, qty: e.q, refType: e.type, refNo: e.ref, createdAt: e.t, cost: r2(e.c != null && e.q < 0 && e.type !== 'adjustment' ? e.c : unit) });
  });
  Object.values(S).forEach(s => { s.q = qty(s); s.c = s.q > 0 ? val(s) / s.q : s.last; });
  store.data.stockLayers_ = Object.fromEntries(Object.entries(S).map(([k, v]) => [k, v.layers.map(l => ({ ...l }))]));
  store.data.stockMoves_ = moves;
  if (office) all('items').forEach(it => { const s = S[it.id]; it.onHand = s ? r2(s.q) : 0; it.cost = s ? r2(s.c) : 0; });
  else all('items').forEach(it => { it.onHand = num(it.onHand); it.cost = 0; });
  // ---- documents: paid / advance / status
  const rcBy = {}; all('receipts').forEach(r => { if (r.against === 'so' || r.against === 'invoice') rcBy[r.refId] = r2((rcBy[r.refId] || 0) + r.amount); });
  all('salesOrders').forEach(o => { if (office) o.advance = rcBy[o.id] || 0; o.advance = num(o.advance); o.salesmanName = nm(o.salesman); });
  const cnBy = {}; all('creditNotes').forEach(n => { if (n.invoiceId) cnBy[n.invoiceId] = r2((cnBy[n.invoiceId] || 0) + num(n.total)); });
  all('invoices').forEach(i => {
    i.salesmanName = nm(i.salesman);
    if (!office) return;
    const paid = r2(num(i.advanceApplied) + (rcBy[i.id] || 0)); i.paid = paid; i.credited = cnBy[i.id] || 0;
    if (i.status === 'void') { i.balance = 0; return; }
    i.balance = r2(Math.max(0, i.total - paid - i.credited)); i.status = i.balance <= 0.009 ? 'paid' : paid + i.credited > 0 ? 'partial' : 'unpaid';
  });
  // bill-wise supplier payments: each payment's allocations settle bills / opening balances; the rest is an advance
  const pyBy = {}, advBy = {}; [...all('payments'), ...all('debitNotes').map(n => (n.amount = n.total, n))].forEach(p => { const al = payAllocs(p); p.allocated = r2(al.reduce((x, a) => x + num(a.amount), 0)); p.unallocated = r2(num(p.amount) - p.allocated);
    al.forEach(a => pyBy[a.refId] = r2((pyBy[a.refId] || 0) + num(a.amount))); if (p.unallocated > 0.009) advBy[p.supplierId] = r2((advBy[p.supplierId] || 0) + p.unallocated); });
  all('purchases').forEach(p => { p.paid = pyBy[p.id] || 0; p.balance = r2(p.total - p.paid); p.status = p.paid >= p.total - 0.009 ? 'paid' : p.paid > 0 ? 'partial' : 'unpaid'; });
  all('openings').filter(o => o.kind === 'supplier').forEach(o => { o.paid = pyBy[o.id] || 0; o.balance = r2(num(o.amount) - o.paid); });
  all('suppliers').forEach(s => s.advance = advBy[s.id] || 0);
  all('quotations').forEach(q => q.salesmanName = nm(q.salesman));
  all('followups').forEach(f => f.assignedName = nm(f.assignedTo));
  all('cashClosings').forEach(c => c.closedByName = nm(c.closedBy));
  // ---- statistics per day and per salesman
  const st = {}, ss = {};
  const A = (date, by) => { const s = st[date] || (st[date] = { id: date, date }); for (const k in by) s[k] = r2((s[k] || 0) + by[k]); };
  const B = (date, u, by) => { if (!u) return; const k0 = date + '_' + u, s = ss[k0] || (ss[k0] = { id: k0, date, uid: u, name: nm(u) }); for (const k in by) s[k] = r2((s[k] || 0) + by[k]); };
  all('quotations').forEach(q => { A(q.date, { enquiries: 1, quoteValue: q.total }); B(q.date, q.salesman, { enquiries: 1, quoteValue: q.total, lost: q.status === 'lost' ? 1 : 0 }); });
  all('salesOrders').filter(o => o.status !== 'cancelled').forEach(o => { A(o.date, { soCount: 1, soValue: o.total }); B(o.date, o.salesman, { soCount: 1, soValue: o.total, converted: o.quotationId ? 1 : 0 }); });
  all('invoices').filter(i => i.status !== 'void').forEach(i => { A(i.date, { invCount: 1, invValue: i.total, deliveries: i.kind === 'service' ? 0 : 1, cogs: i.costTotal }); B(i.date, i.salesman, { invValue: i.total, deliveries: i.kind === 'service' ? 0 : 1 }); });
  all('receipts').forEach(r => A(r.date, { receipts: r.amount })); all('expenses').forEach(e => A(e.date, { expenses: e.amount }));
  all('payments').forEach(p => A(p.date, { payments: p.amount })); all('purchases').forEach(p => A(p.date, { purchases: p.total }));
  store.data.stats = st; store.data.staffStats = ss;
  // ---- staff list from members + roles
  const team = byId('team', 'roles') || { roles: {} }, ids = new Set([...all('members').map(m => m.id), ...Object.keys(team.roles || {})]);
  const users = {}; ids.forEach(id => { const roleId = id === team.owner ? 'admin' : (team.roles || {})[id] || 'pending', d = roleDef(roleId, team); users[id] = { id, name: nm(id), email: '', role: d.base, roleId, roleName: d.name, active: d.base !== 'disabled' }; });
  store.data.users = users;
}
// names come from the viewer's Claude directory and are never stored
export const nm = id => (id && store.names[id]) || (id && id === store.me?.id ? store.me.name : '') || (id ? 'Staff member' : '');

/* ============ activity log: who did what ============ */
export const ACT_LABEL = { hrStaff: 'Staff profile', hrSalary: 'Salary setup', hrDocs: 'Staff document', hrPunch: 'Attendance', hrDays: 'Attendance check', hrLeave: 'Leave', hrLeaveReq: 'Leave request', hrAdvances: 'Salary advance', hrItems: 'Allowance / incentive', hrRuns: 'Payroll', creditNotes: 'Credit note', debitNotes: 'Debit note', quotations: 'Quotation', salesOrders: 'Sales order', invoices: 'Invoice', receipts: 'Receipt', payments: 'Supplier payment', purchases: 'Purchase bill', expenses: 'Expense', transfers: 'Transfer', journals: 'Journal', adjustments: 'Stock adjustment', openings: 'Opening balance', cashClosings: 'Cash closing', customers: 'Customer', suppliers: 'Supplier', items: 'Item', followups: 'Follow-up', tasks: 'Task', counts: 'Stock count', accounts: 'Account', settings: 'Settings', team: 'Roles & access', labelQueue: 'Label print queue' };
const ACT_SKIP = new Set(['counters', 'countSheets', 'members', 'deletedTxns', 'activity', 'hrMine']);
const ACT_QUIET = new Set(['updatedAt', 'updatedBy', 'log', 'edits', 'editedAt', 'editedBy', 'id', 'createdAt', 'createdBy', 'at', 'by']);
const shortV = v => v == null || v === '' ? '—' : typeof v === 'number' ? String(r2(v)) : typeof v === 'string' ? (v.length > 40 ? v.slice(0, 40) + '…' : v) : typeof v === 'boolean' ? (v ? 'yes' : 'no') : '…';
const shortM = v => v == null || v === '' ? '—' : typeof v === 'number' ? (setting('currency', '₹') || '') + ' ' + Number(r2(v)).toLocaleString('en-IN') : shortV(v);
export function describeOps(ops, before) {
  const rows = ops.map((op, i) => ({ op, b: before[i] })).filter(({ op }) => !ACT_SKIP.has(op.coll) && !ACT_SKIP.has(String(op.coll).split('/')[0]));
  if (!rows.length) return null;
  const stockOnly = ({ op }) => op.coll === 'items' && op.t === 'update' && Object.keys(op.data).every(k => ['onHand', 'updatedAt', 'updatedBy'].includes(k));
  const autoFU = ({ op, b }) => op.coll === 'followups' && op.t === 'update' && op.data.status === 'done' && b && b.status === 'open' && !op.data.doneBy;
  const main = rows.filter(r => !stockOnly(r) && !autoFU(r)), stock = rows.filter(stockOnly).length, fus = rows.filter(autoFU).length;
  const line = ({ op, b }) => {
    const d = op.data || {}, x = { ...(b || {}), ...d }, top = String(op.coll).split('/')[0], hr = top.startsWith('hr'), label = ACT_LABEL[op.coll] || ACT_LABEL[top] || op.coll;
    if (hr) { // never copy salary figures into the activity log
      const who = x.staffName || x.name || (x.staffId && byId('hrStaff', x.staffId)?.name) || (top === 'hrPunch' ? (byId('hrStaff', x.staffId)?.name || '') : '');
      const verb = op.t === 'delete' ? 'deleted' : op.t === 'set' && !b ? 'created' : 'updated';
      const what = top === 'hrPunch' ? (b ? 'punch added / changed' : 'first punch of the month') + ' · ' + op.id : top === 'hrRuns' ? op.id + (d.status && b && d.status !== b.status ? ' → ' + d.status : '') : (x.no || '');
      return { coll: top, id: op.id, no: x.no || op.id, verb, amount: null, text: `${label}${what ? ' ' + what : ''} ${verb}${who ? ' · ' + who : ''}` };
    }
    const ref = x.no || x.name || (op.coll === 'labelQueue' ? '' : op.coll === 'settings' || op.coll === 'team' ? op.id : '');
    const verb = op.t === 'delete' ? 'deleted' : op.t === 'set' && !b ? 'created' : (d.status && b && d.status !== b.status) ? (d.status === 'void' ? 'voided' : d.status === 'cancelled' ? 'cancelled' : 'updated') : 'updated';
    let detail = '';
    if (op.t !== 'delete' && b) { const ch = Object.keys(d).filter(k => !ACT_QUIET.has(k) && !/(At|Id)$/.test(k) && JSON.stringify(b[k]) !== JSON.stringify(d[k]) && (typeof d[k] === 'object' && d[k] !== null || shortV(b[k]) !== shortV(d[k]))); detail = ch.slice(0, 4).map(k => { const n = k.replace(/([A-Z])/g, ' $1').toLowerCase(); return (typeof d[k] === 'object' && d[k] !== null) ? n + ' changed' : `${n}: ${typeof d[k] === 'number' || typeof b[k] === 'number' ? shortM(b[k]) + ' → ' + shortM(d[k]) : shortV(b[k]) + ' → ' + shortV(d[k])}`; }).join(', ') + (ch.length > 4 ? ` +${ch.length - 4} more` : ''); }
    const party = x.customerName || x.supplierName || x.partyName || '', amt = x.total ?? x.amount;
    return { coll: op.coll, id: op.id, no: ref || '', verb, amount: amt != null && typeof amt === 'number' ? r2(amt) : null,
      text: `${label}${ref ? ' ' + ref : ''} ${verb}${party ? ' · ' + party : ''}${verb !== 'updated' && amt != null && typeof amt === 'number' ? ' · ' + shortM(Math.abs(amt)) : ''}${detail ? ' (' + detail + ')' : ''}` };
  };
  const lines = (main.length ? main : rows.slice(0, 1)).map(line), first = lines[0];
  const extra = [lines.length > 1 ? `+${lines.length - 1} more change${lines.length > 2 ? 's' : ''}` : '', stock ? `stock updated for ${stock} item${stock > 1 ? 's' : ''}` : '', fus ? `${fus} follow-up${fus > 1 ? 's' : ''} closed` : ''].filter(Boolean).join(' · ');
  return { coll: first.coll, docId: first.id, no: first.no, verb: first.verb, amount: first.amount, text: first.text + (extra ? ' — ' + extra : ''), lines: lines.slice(0, 12).map(l => l.text) };
}
store.describe = describeOps;
// load everyone's log (office only; each person's log is private to them and admins)
const actSubs = {}; let actListeners = [];
export function watchActivity(onChange) {
  if (onChange) actListeners = [onChange];
  const ids = new Set([...all('users').map(u => u.id), me()?.id].filter(Boolean));
  ids.forEach(uid => { if (actSubs[uid]) return; actSubs[uid] = store.db.db.collection('activity/' + uid + '/log').onSnapshot(snap => {
    store.data['act_' + uid] = snap.docs.map(d => d.data()); actListeners.forEach(f => f()); }, e => console.warn('activity read', e)); });
}
export function activityEntries() {
  const out = []; Object.keys(store.data).filter(k => k.startsWith('act_')).forEach(k => (store.data[k] || []).forEach(d => (d.entries || []).forEach(e => out.push(e))));
  return out.sort((a, b) => b.at - a.at);
}

/* ============ first-time setup ============ */
export async function bootstrapCompany(name) {
  const ops = DEFAULT_ACCOUNTS.map(([code, n, type, group]) => set('accounts', 'a' + code, { code, name: n, type, group, system: true }));
  TAX_ACCS.forEach(([k, n, code]) => ops.push(set('accounts', ACC[k], { code: String(code), name: n, type: 'liability', group: 'tax', system: true })));
  ops.push(set('settings', 'company', { name: name || 'GRID Furniture', address: '', phone: '', currency: '₹', countryCode: '91', invoiceNote: 'Thank you for shopping with us!', ...created() }));
  ops.push(set('settings', 'lock', { closedUpTo: '' }));
  await store.db.commit(ops);
}
/* ============ roles & module access ============ */
// Every role sits on one of the built-in access levels (what data it can reach); module access decides which screens it sees.
export const BASES = { sales: 'Salesman level — own customers, enquiries, orders; no money or accounts', billing: 'Billing level — orders, invoices, money, stock, purchases', manager: 'Manager level — everything except owner settings' };
// modules added after a role's list was saved are switched on for it until the owner saves that role again
const NEW_MODULES = [['punch', 2], ['porders', 3], ['service', 4]];
const withNew = (mods, id, team) => mods ? [...mods, ...NEW_MODULES.filter(([n, v]) => !mods.includes(n) && !(((team.modsV || {})[id] || 1) >= v)).map(([n]) => n)] : mods;
export function roleDef(id, team = byId('team', 'roles') || store.bootTeam || {}) {
  if (id === 'admin') return { id, name: ROLES.admin, base: 'admin', modules: null, builtin: true };
  if (['manager', 'billing', 'sales'].includes(id)) return { id, name: ROLES[id], base: id, modules: withNew((team.moduleAccess || {})[id] || null, id, team), rights: (team.rights || {})[id] || null, builtin: true };
  const c = (team.customRoles || {})[id];
  if (c) return { id, name: c.name, base: c.base, modules: withNew(c.modules || [], id, team), rights: (team.rights || {})[id] || null, builtin: false };
  return { id, name: ROLES[id] || ROLES.pending, base: id === 'disabled' ? 'disabled' : 'pending', modules: null, builtin: true };
}
export const roleList = () => { const t = byId('team', 'roles') || {}; return [...['admin', 'manager', 'billing', 'sales'].map(r => roleDef(r, t)), ...Object.keys(t.customRoles || {}).map(r => roleDef(r, t)).sort((a, b) => a.name.localeCompare(b.name))]; };
export async function saveRole({ id, name, base, modules, rights }) {
  const t = byId('team', 'roles'); if (!t) throw Error('Team not loaded yet.');
  if (!Array.isArray(modules) || !modules.length) throw Error('Choose at least one module.');
  const withRights = rid => ({ rights: { ...(t.rights || {}), [rid]: cleanRights(rights, modules) }, modsV: { ...(t.modsV || {}), [rid]: Math.max(...NEW_MODULES.map(x => x[1])) } });
  if (['manager', 'billing', 'sales'].includes(id)) { await store.db.commit([set('team', 'roles', { ...t, moduleAccess: { ...(t.moduleAccess || {}), [id]: modules }, ...withRights(id), ...stamp() })]); return id; }
  if (id === 'admin') throw Error('The owner always has every module.');
  name = String(name || '').trim(); if (!name) throw Error('Give the role a name.');
  if (!BASES[base]) throw Error('Choose the access level.');
  if (roleList().some(r => r.id !== id && r.name.toLowerCase() === name.toLowerCase())) throw Error('A role with that name already exists.');
  const rid = id || 'r' + uid();
  await store.db.commit([set('team', 'roles', { ...t, customRoles: { ...(t.customRoles || {}), [rid]: { name, base, modules } }, ...withRights(rid), ...stamp() })]);
  return rid;
}
export async function resetRole(id) { const t = byId('team', 'roles'); const m = { ...(t.moduleAccess || {}) }, rg = { ...(t.rights || {}) }; delete m[id]; delete rg[id]; await store.db.commit([set('team', 'roles', { ...t, moduleAccess: m, rights: rg, ...stamp() })]); }
export async function deleteRole(id) {
  const t = byId('team', 'roles'); if (!(t.customRoles || {})[id]) return;
  const used = Object.values(t.roles || {}).filter(r => r === id).length; if (used) throw Error(`${used} staff member(s) still have this role. Give them another role first.`);
  const c = { ...t.customRoles }, rg = { ...(t.rights || {}) }; delete c[id]; delete rg[id]; await store.db.commit([set('team', 'roles', { ...t, customRoles: c, rights: rg, ...stamp() })]);
}
/* ---------- per-module permissions: view (module list) + add / edit / delete ---------- */
// rights per role: { module: 'aed' } — a = add, e = edit, d = delete. No entry = full rights on that module.
export const ACTS = { add: 'a', edit: 'e', delete: 'd' };
// modules that roles below manager only get when the owner ticks them for that role
export const DEFAULT_OFF = { teamtasks: ['billing', 'sales'], hratt: ['billing', 'sales'], hrstaff: ['billing', 'sales'], hrpay: ['billing', 'sales'], hradv: ['billing', 'sales'], hrinc: ['billing', 'sales'], hrrep: ['billing', 'sales'], hrshifts: ['manager', 'billing', 'sales'], hrset: ['manager', 'billing', 'sales'] };
export const defaultOn = (n, base) => !(DEFAULT_OFF[n] || []).includes(base);
export const VIEW_ONLY = ['dashboard', 'myday', 'assistant', 'reports', 'activity', 'deliveries', 'users', 'hrrep'];
function cleanRights(rights, modules) { const o = {}; for (const m of modules || []) if (!VIEW_ONLY.includes(m)) o[m] = [...'aed'].filter(c => String((rights || {})[m] ?? 'aed').includes(c)).join(''); return o; }
export function may(mod, act) {
  const m = store.me; if (!m) return false; if (m.role === 'admin') return true;
  const r = roleDef(m.roleId || m.role); if (r.modules ? !r.modules.includes(mod) : !defaultOn(mod, r.base)) return false;
  const rt = r.rights && r.rights[mod]; return rt == null ? true : rt.includes(ACTS[act]);
}
// which modules a saved record belongs to: the first owns it (Edit and Delete need that module); any of them lets you add one from that screen
const COLL_MOD = { quotations: ['enquiries'], customers: ['customers', 'enquiries', 'orders', 'followups'], followups: ['followups', 'enquiries', 'customers', 'orders', 'tasks', 'suppliers', 'teamtasks'],
  salesOrders: ['orders', 'teamtasks'], invoices: ['invoices', 'orders', 'service'], services: ['service', 'tasks', 'teamtasks'], creditNotes: ['invoices'], receipts: ['money', 'cashbook', 'invoices', 'orders', 'customers'], payments: ['money', 'cashbook', 'purchases', 'suppliers'],
  expenses: ['money', 'cashbook'], transfers: ['money', 'cashbook'], purchases: ['purchases'], purchaseOrders: ['porders', 'purchases'], debitNotes: ['purchases'], suppliers: ['suppliers', 'purchases', 'tasks'],
  items: ['items', 'purchases', 'orders', 'enquiries'], adjustments: ['items', 'stockcount'], journals: ['accounts'], accounts: ['accounts'], openings: ['accounts', 'items', 'customers', 'suppliers'],
  hrStaff: ['hrstaff'], hrSalary: ['hrstaff', 'hrpay'], hrDocs: ['hrstaff'], hrDays: ['hratt'], hrLeave: ['hratt'], hrLeaveReq: ['hratt'], hrPunch: ['hratt'], hrAdvances: ['hradv', 'hrpay'], hrItems: ['hrinc', 'hrpay'], hrRuns: ['hrpay'],
  hrMine: ['hrstaff', 'hratt', 'hrpay', 'hradv', 'hrinc'],
  cashClosings: ['cash'], tasks: ['tasks', 'orders', 'teamtasks'], counts: ['stockcount'], countSheets: ['stockcount'], labelQueue: ['labels', 'items', 'purchases'] };
const SETTING_MOD = { print: ['settings', 'orders', 'invoices'], company: ['settings'], lock: ['cash'], hr: ['hrset', 'hrshifts'] };
const modsFor = op => op.coll === 'settings' ? SETTING_MOD[op.id] || ['settings'] : COLL_MOD[op.coll] || COLL_MOD[String(op.coll).split('/')[0]];
const VERB = { add: 'add', edit: 'change', delete: 'delete' };
// every save goes through this check (set up as store.guard and called by the database adapter before writing)
export function checkRights(ops) {
  const m = store.me; if (!m || m.role === 'admin' || !ops || !ops.length) return;
  const mapped = ops.filter(modsFor); if (!mapped.length) return;
  const op = mapped.find(o => o.coll !== 'accounts' && o.coll !== 'journals' && !String(o.coll).startsWith('hrMine/')) || mapped[0];
  // staff punching for themselves / asking for leave from their own phone
  if (String(op.coll).startsWith('hrPunch/' + m.id + '/') || String(op.coll).startsWith('hrLeaveReq/' + m.id + '/')) { if (may('punch', 'add') || may('hratt', 'add')) return; }
  else if (String(op.coll).startsWith('hrPunch/')) { if (may('hratt', 'add') || may('hratt', 'edit')) return; }
  const exists = !!(store.data[op.coll] || {})[op.id];
  const act = op.t === 'delete' ? 'delete' : op.t === 'set' && !exists ? 'add' : 'edit';
  const mods = modsFor(op), list = act === 'add' || op.coll === 'followups' || op.coll === 'settings' ? mods : [mods[0], ...(act === 'edit' && mods.includes('teamtasks') ? ['teamtasks'] : [])];
  if (list.some(x => may(x, act))) return;
  const S = (window.__gsmNav || {}).SHORT || {}, what0 = (ACT_LABEL[op.coll] || op.coll).toLowerCase(), what = what0.endsWith('s') ? what0 : what0 + 's';
  const e = Error(`Your role (${roleDef(m.roleId || m.role).name}) doesn't have permission to ${VERB[act]} ${what}. The owner can allow “${act === 'add' ? 'Add' : act === 'edit' ? 'Edit' : 'Delete'}” for ${S[mods[0]] || mods[0]} in Users & Roles.`);
  e.code = 'no-right'; throw e;
}
store.guard = checkRights;
/* ---------- adding staff from Users & Roles ---------- */
// A colleague found in the Claude directory gets their role at once (by id). Anyone else is kept as an email invite:
// when they open the page, their own sign-in email picks up the role, and the owner's page swaps the invite for their id.
export const normEmail = e => String(e || '').trim().toLowerCase();
export const invites = () => (byId('team', 'roles') || store.bootTeam || {}).invites || {};
export async function addStaff({ id, email, name, role, note }) {
  const t = byId('team', 'roles'); if (!t) throw Error('Team not loaded yet.');
  const r = roleDef(role, t); if (!role || ['admin', 'pending', 'disabled'].includes(r.base)) throw Error('Choose a role for this person.');
  if (id) {
    if (id === t.owner) throw Error('That is the owner — they already have full access.');
    const inv = { ...(t.invites || {}) }; const e = normEmail(email); if (e) delete inv[e];
    await store.db.commit([set('team', 'roles', { ...t, roles: { ...(t.roles || {}), [id]: role }, invites: inv, ...stamp() })]); return 'role';
  }
  const e = normEmail(email); if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e)) throw Error('Enter a valid email address.');
  await store.db.commit([set('team', 'roles', { ...t, invites: { ...(t.invites || {}), [e]: { role, name: String(name || '').trim(), note: String(note || '').trim(), at: Date.now(), by: me().id } }, ...stamp() })]); return 'invite';
}
export async function setInviteRole(email, role) { const t = byId('team', 'roles'), e = normEmail(email), inv = { ...(t.invites || {}) }; if (!inv[e]) return; inv[e] = { ...inv[e], role }; await store.db.commit([set('team', 'roles', { ...t, invites: inv, ...stamp() })]); }
export async function removeInvite(email) { const t = byId('team', 'roles'), inv = { ...(t.invites || {}) }; delete inv[normEmail(email)]; await store.db.commit([set('team', 'roles', { ...t, invites: inv, ...stamp() })]); }
// owner only: people who opened the page with an invited email get their role saved against their id
export async function claimInvites(emailsById) {
  const t = byId('team', 'roles'); if (!t || !store.me || store.me.role !== 'admin') return 0;
  const inv = { ...(t.invites || {}) }, roles = { ...(t.roles || {}) }; let n = 0;
  for (const [id, em] of Object.entries(emailsById)) { const e = normEmail(em), x = e && inv[e]; if (x && !roles[id] && id !== t.owner) { roles[id] = x.role; delete inv[e]; n++; } }
  if (n) await store.db.commit([set('team', 'roles', { ...t, roles, invites: inv, ...stamp() })]);
  return n;
}
export async function setRole(id, role) { const t = byId('team', 'roles') || { roles: {} }; await store.db.commit([upd('team', 'roles', { roles: { ...(t.roles || {}), [id]: role }, ...stamp() })]); }

/* ============ customers & suppliers ============ */
export async function saveParty(kind, p) {
  const coll = kind === 'supplier' ? 'suppliers' : 'customers';
  const name = String(p.name || '').trim(), mobile = normMobile(p.mobile);
  if (!name) throw Error('Enter the name.');
  // the mobile number is optional; when one is given it must look like a phone number
  if (mobile && mobile.replace(/\D/g, '').length < 7) throw Error('That mobile number looks too short — check it, or leave it empty.');
  const dup = all(coll).find(x => mobile && x.mobile === mobile && x.id !== p.id);
  if (dup) throw Error(`This mobile number already belongs to ${dup.name}.`);
  const id = p.id || (kind === 'supplier' ? 's' : 'c') + uid();
  const gstin = String(p.gstin || '').replace(/\s+/g, '').toUpperCase(); if (gstin && !/^[0-9A-Z]{15}$/.test(gstin)) throw Error('GSTIN should be 15 letters and digits.');
  const data = { name, mobile, area: String(p.area || '').trim(), address: String(p.address || '').trim(), note: String(p.note || '').trim(), ...(p.gstin !== undefined ? { gstin } : {}), ...stamp() };
  if (kind === 'customer') data.source = p.source || 'Walk-in';
  if (kind === 'supplier') data.contact = String(p.contact || '').trim();
  if (p.id) await store.db.commit([upd(coll, id, data)]);
  else await store.db.commit([set(coll, id, { ...data, salesman: kind === 'customer' ? (p.salesman || me()?.id) : '', ...created() })]);
  return id;
}
export const findCustomerByMobile = m => { const x = normMobile(m); return x ? all('customers').find(c => c.mobile === x) : null; };
export async function openingBalance(kind, partyId, amount, date) {
  amount = r2(amount); date = date || today(); checkDate(date); if (!amount) throw Error('Enter the amount.');
  const p = byId(kind === 'supplier' ? 'suppliers' : 'customers', partyId); if (!p) throw Error('Not found.');
  await store.db.commit([set('openings', 'o' + uid(), { kind, partyId, partyName: p.name, amount, date, ...created() })]);
}

// Opening balances for balance-sheet ledgers (assets, liabilities, equity). Receivables, payables and stock
// get theirs from each customer, supplier and item, so their totals always match the sub-ledgers.
export const SUBLEDGER = { ar: 'customers', ap: 'suppliers', inventory: 'items' };
export const openingAccounts = () => all('accounts').filter(a => ['asset', 'liability', 'equity'].includes(a.type) && a.group !== 'obe').sort((a, b) => a.code.localeCompare(b.code));
export function accountOpening(a) {
  if (a.group === 'ar') return r2(all('openings').filter(o => o.kind === 'customer').reduce((x, o) => x + num(o.amount), 0));
  if (a.group === 'ap') return -r2(all('openings').filter(o => o.kind === 'supplier').reduce((x, o) => x + num(o.amount), 0));
  if (a.group === 'inventory') return r2(all('openings').filter(o => o.kind === 'stock').reduce((x, o) => x + o.lines.reduce((y, l) => y + num(l.qty) * num(l.cost), 0), 0));
  return r2(num((byId('openings', 'ob_' + a.id) || {}).amount));   // + debit, − credit
}
// opening stock per item = all opening-stock lines for that item (from imports, new items and this screen)
export function openingStockMap() { const m = {}; all('openings').filter(o => o.kind === 'stock').forEach(o => o.lines.forEach(l => { const e = m[l.itemId] || (m[l.itemId] = { qty: 0, value: 0 }); e.qty = r2(e.qty + num(l.qty)); e.value = r2(e.value + num(l.qty) * num(l.cost)); })); Object.values(m).forEach(e => e.cost = e.qty ? r2(e.value / e.qty) : 0); return m; }
export async function saveOpeningStock(changes, date) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date || '')) throw Error('Choose the opening date.'); checkDate(date);
  const ids = Object.keys(changes).filter(id => byId('items', id)); if (!ids.length) return 0;
  const cur = openingStockMap(), ops = [], touchedDocs = new Map(), delta = {};
  for (const id of ids) {
    const qty = r2(changes[id].qty), cost = r2(changes[id].cost); if (qty < 0 || cost < 0) throw Error('Quantity and cost can’t be negative.');
    all('openings').filter(o => o.kind === 'stock' && o.id !== 'os_' + id && o.lines.some(l => l.itemId === id)).forEach(o => { checkDate(o.date); const t = touchedDocs.get(o.id) || o.lines.map(l => ({ ...l })); touchedDocs.set(o.id, t.filter(l => l.itemId !== id)); });
    const old = byId('openings', 'os_' + id); if (old) checkDate(old.date);
    const it = byId('items', id);
    if (qty || cost) ops.push(set('openings', 'os_' + id, { kind: 'stock', date, memo: 'Opening stock – ' + it.name, lines: [{ itemId: id, qty, cost }], ...(old ? { createdAt: old.createdAt, createdBy: old.createdBy, ...stamp() } : created()) }));
    else if (old) ops.push(del('openings', 'os_' + id));
    delta[id] = r2(qty - num((cur[id] || {}).qty));
  }
  touchedDocs.forEach((lines, docId) => ops.push(lines.length ? upd('openings', docId, { lines, ...stamp() }) : del('openings', docId)));
  stockFor(ops, delta);
  const co = byId('settings', 'company'); if (co && !co.openingDate) ops.push(upd('settings', 'company', { openingDate: date }));
  await store.db.commit(ops); return ids.length;
}
export const openingDate = () => setting('openingDate', '') || (all('openings').map(o => o.date).sort()[0]) || today();
export async function saveAccountOpenings(values, date) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date || '')) throw Error('Choose the opening date.'); checkDate(date);
  const ops = [];
  for (const [accId, amt] of Object.entries(values)) {
    const a = byId('accounts', accId); if (!a || SUBLEDGER[a.group] || a.group === 'obe' || !['asset', 'liability', 'equity'].includes(a.type)) continue;
    const old = byId('openings', 'ob_' + accId), v = r2(amt);
    if (!v) { if (old) { checkDate(old.date); ops.push(del('openings', 'ob_' + accId)); } continue; }
    if (old && r2(old.amount) === v && old.date === date) continue;
    if (old) checkDate(old.date);
    ops.push(set('openings', 'ob_' + accId, { kind: 'account', accountId: accId, accountName: a.name, amount: v, date, ...(old ? { createdAt: old.createdAt, createdBy: old.createdBy, ...stamp() } : created()) }));
  }
  const co = byId('settings', 'company'); if (co && co.openingDate !== date) ops.push(upd('settings', 'company', { openingDate: date, ...stamp() }));
  if (ops.length) await store.db.commit(ops); return ops.length;
}

/* ============ quotations / enquiries ============ */
export async function saveQuotation(q) {
  const c = byId('customers', q.customerId); if (!c) throw Error('Choose or add the customer first.');
  const lines = cleanLines(q.lines), t = docTotals(lines, q.discount, q.charges);
  const base = { customerId: c.id, customerName: c.name, mobile: c.mobile, lines, ...t, notes: q.notes || '', ...stamp() };
  if (q.id) { const old = byId('quotations', q.id); if (old && old.status === 'converted') throw Error('This quotation is already a sales order.'); await store.db.commit([upd('quotations', q.id, base)]); return q.id; }
  const id = 'q' + uid(), no = await number('QT');
  await store.db.commit([set('quotations', id, { ...base, no, date: q.date || today(), salesman: q.salesman || me().id, status: 'open', ...created() })]);
  return id;
}
export async function setFollowup({ refType, refId, partyType, partyId, partyName, mobile, due, time, note, assignedTo }) {
  if (!due) throw Error('Choose the follow-up date.');
  const ops = [set('followups', 'f' + uid(), { refType: refType || '', refId: refId || '', partyType: partyType || 'customer', partyId: partyId || '', partyName: partyName || '', mobile: mobile || '', due, time: time || '', note: note || '', assignedTo: assignedTo || me().id, status: 'open', ...created() })];
  if (refType === 'quotation') ops.push(upd('quotations', refId, { status: 'followup', followUpDate: due, ...stamp() }));
  const tk = refType === 'task' && can.office(me()?.role) ? byId('tasks', refId) : null;
  if (tk) ops.push(upd('tasks', tk.id, { log: [...(tk.log || []), logEntry(`Follow-up set for ${due}${note ? ': ' + note : ''} → ${nm(assignedTo || me().id)}`)], ...stamp() }));
  await store.db.commit(ops);
}
// Team Tasks: hand a follow-up, task or delivery to someone else
export async function reassignWork(kind, id, to) {
  const who = to ? nm(to) : 'nobody';
  if (kind === 'followup') { const f = byId('followups', id); if (!f) throw Error('Follow-up not found.'); if (!to) throw Error('Choose who should do this follow-up.'); await store.db.commit([upd('followups', id, { assignedTo: to, reassignedBy: me().id, reassignedAt: Date.now(), ...stamp() })]); }
  else if (kind === 'task') { const t = byId('tasks', id); if (!t) throw Error('Task not found.'); await updateTask(t, { assignedTo: to || '' }); }
  else if (kind === 'delivery') { const so = byId('salesOrders', id); if (!so) throw Error('Order not found.'); await store.db.commit([upd('salesOrders', id, { deliveryBy: to || '', ...stamp() })]); }
  else if (kind === 'service') { const [sid, vid] = String(id).split('|'), s = byId('services', sid), v = s && (s.visits || []).find(x => x.id === vid); if (!v) throw Error('Service visit not found.'); if (!to) throw Error('Choose who will attend.'); await scheduleVisit(s, { visitId: vid, date: v.date, time: v.time, assignedTo: to, note: v.note }); }
  return who;
}
export async function completeFollowup(f, outcome) {
  const ops = [upd('followups', f.id, { status: 'done', outcome: outcome || '', doneAt: Date.now(), doneBy: me().id, ...stamp() })];
  const t = f.refType === 'task' && can.office(me()?.role) ? byId('tasks', f.refId) : null;
  if (t) ops.push(upd('tasks', t.id, { log: [...(t.log || []), logEntry('Follow-up done' + (outcome ? ': ' + outcome : ''))], ...stamp() }));
  await store.db.commit(ops);
}
const closeFollowupsFor = (ops, refId, outcome) => all('followups').filter(f => f.refId === refId && f.status === 'open').forEach(f => ops.push(upd('followups', f.id, { status: 'done', outcome, doneAt: Date.now(), ...stamp() })));
export async function confirmQuotation(q, note) { if (!q.lines?.length) throw Error('Add at least one item before confirming.'); await store.db.commit([upd('quotations', q.id, { status: 'confirmed', billingNote: note || '', confirmedAt: Date.now(), ...stamp() })]); }
// sent to billing by mistake: take it back to an open enquiry (it leaves the Sales Orders drafts)
export async function recallQuotation(q) { q = byId('quotations', q.id) || q; if (q.status !== 'confirmed') throw Error('This enquiry is not waiting for billing.'); await store.db.commit([upd('quotations', q.id, { status: 'open', billingNote: '', confirmedAt: null, recalledAt: Date.now(), ...stamp() })]); }
// remove an enquiry completely (never one already turned into a sales order)
export async function deleteQuotation(q) { q = byId('quotations', q.id) || q; if (q.status === 'converted') throw Error('This enquiry is already a sales order — cancel the order instead.'); const ops = [del('quotations', q.id)]; closeFollowupsFor(ops, q.id, 'Enquiry deleted'); await store.db.commit(ops); }
export async function markLost(q, reason) { const ops = [upd('quotations', q.id, { status: 'lost', lostReason: reason || '', ...stamp() })]; closeFollowupsFor(ops, q.id, 'Lost: ' + (reason || '')); await store.db.commit(ops); }
export async function reopenQuotation(q) { await store.db.commit([upd('quotations', q.id, { status: 'open', ...stamp() })]); }

/* ============ tasks: re-orders & customisation for sales-order lines ============ */
export const SRC = { stock: 'From stock', order: 'New order', custom: 'Customisation' };
export const TASK_STATUS = { open: 'To do', ordered: 'Ordered', received: 'Received', done: 'Done', cancelled: 'Cancelled' };
export const defaultTaskOwner = () => (setting('taskOwner', '') && byId('users', setting('taskOwner', ''))?.id) || (all('users').find(u => u.role === 'manager' && u.active !== false) || all('users').find(u => u.role === 'admin') || me()).id;
const logEntry = text => ({ at: Date.now(), by: me()?.id || '', text });
async function syncTasks(ops, so, lines, why) {
  const mine = all('tasks').filter(t => t.soId === so.id), need = (lines || []).filter(l => l.src === 'order' || l.src === 'custom');
  for (const l of need) {
    const t = mine.find(x => x.lk === l.lk);
    const base = { kind: l.src === 'custom' ? 'custom' : 'reorder', itemId: l.itemId || '', sku: l.sku || '', name: l.name, desc: l.desc || '', qty: num(l.qty), soNo: so.no, customerId: so.customerId, customerName: so.customerName, salesman: so.salesman || '', deliveryDate: so.deliveryDate || '' };
    if (l.src === 'custom') base.spec = l.spec || '';
    if (t) { if (t.status === 'cancelled') ops.push(upd('tasks', t.id, { ...base, status: 'open', log: [...(t.log || []), logEntry('Needed again on ' + so.no)], ...stamp() })); else if (t.status !== 'done') ops.push(upd('tasks', t.id, { ...base, ...stamp() })); }
    else ops.push(set('tasks', 'tk' + uid(), { ...base, no: await number('TSK'), soId: so.id, lk: l.lk, status: 'open', supplierId: '', supplierName: '', assignedTo: defaultTaskOwner(), expectedDate: '', poRef: '', log: [logEntry(`Created from ${so.no}${why ? ' (' + why + ')' : ''}`)], ...created() }));
  }
  mine.filter(t => !need.some(l => l.lk === t.lk) && !['done', 'cancelled'].includes(t.status)).forEach(t => { ops.push(upd('tasks', t.id, { status: 'cancelled', log: [...(t.log || []), logEntry('Line removed from ' + so.no + ' or changed to stock')], ...stamp() })); closeFollowupsFor(ops, t.id, 'Task cancelled'); });
}
function closeTasks(ops, soId, status, text) { all('tasks').filter(t => t.soId === soId && !['done', 'cancelled'].includes(t.status)).forEach(t => { ops.push(upd('tasks', t.id, { status, log: [...(t.log || []), logEntry(text)], ...stamp() })); closeFollowupsFor(ops, t.id, text); }); }
export async function newTask(t) {
  const name = String(t.name || '').trim(); if (!name) throw Error('Choose the item or describe what is needed.');
  if (t.kind === 'custom' && !String(t.spec || '').trim()) throw Error('Write the customisation details.');
  const sp = t.supplierId ? byId('suppliers', t.supplierId) : null, id = 'tk' + uid();
  await store.db.commit([set('tasks', id, { kind: t.kind === 'custom' ? 'custom' : 'reorder', itemId: t.itemId || '', sku: t.sku || '', name, desc: t.desc || '', spec: t.spec || '', qty: num(t.qty) || 1, soId: '', soNo: '', customerId: '', customerName: '', salesman: '', deliveryDate: t.neededBy || '',
    no: await number('TSK'), lk: '', status: 'open', supplierId: sp?.id || '', supplierName: sp?.name || '', assignedTo: t.assignedTo || defaultTaskOwner(), expectedDate: '', poRef: '', log: [logEntry('Created manually' + (t.note ? ' – ' + t.note : ''))], ...created() })]);
  return id;
}
export async function updateTask(t, ch, note) {
  const data = { ...stamp() }, logs = [];
  if (ch.supplierId !== undefined && ch.supplierId !== t.supplierId) { const sp = byId('suppliers', ch.supplierId); data.supplierId = sp?.id || ''; data.supplierName = sp?.name || ''; logs.push(sp ? 'Supplier: ' + sp.name : 'Supplier removed'); }
  if (ch.assignedTo !== undefined && ch.assignedTo !== t.assignedTo) { data.assignedTo = ch.assignedTo; logs.push('Assigned to ' + nm(ch.assignedTo)); }
  ['expectedDate', 'poRef', 'spec', 'desc'].forEach(k => { if (ch[k] !== undefined && ch[k] !== (t[k] || '')) { data[k] = ch[k]; if (k === 'expectedDate' && ch[k]) logs.push('Expected ' + ch[k]); if (k === 'poRef' && ch[k]) logs.push('Order ref ' + ch[k]); if (k === 'spec') logs.push('Customisation details updated'); } });
  if (ch.status && ch.status !== t.status) {
    if (ch.status === 'ordered' && !(data.supplierId ?? t.supplierId)) throw Error(t.kind === 'custom' ? 'Assign the vendor first.' : 'Assign the supplier first.');
    data.status = ch.status; logs.push('Status: ' + TASK_STATUS[ch.status]);
  }
  // marked ordered → the item goes on a draft purchase order for that supplier (office only; the PO is checked and confirmed in Purchase Orders)
  const poOps = [];
  if (data.status === 'ordered') { const po = await addToDraftPO(poOps, t, data); if (po) { data.poId = po.id; data.poNo = po.no; if (!(data.poRef ?? t.poRef)) data.poRef = po.no; logs.push(`${po.added ? 'Added to' : 'Draft'} purchase order ${po.no}`); } }
  if (data.status === 'cancelled') { const n = dropFromDraftPO(poOps, t); if (n) logs.push(n); }
  if (note) logs.push(note);
  if (!logs.length) return;
  data.log = [...(t.log || []), ...logs.map(logEntry)];
  const ops = [upd('tasks', t.id, data), ...poOps];
  if (['done', 'cancelled'].includes(data.status)) closeFollowupsFor(ops, t.id, 'Task ' + TASK_STATUS[data.status].toLowerCase());
  await store.db.commit(ops);
}
// one draft purchase order per supplier collects the lines of tasks marked ordered, until someone confirms it
const poTotal = lines => r2(lines.reduce((x, l) => x + num(l.qty) * num(l.rate), 0));
const openDraftPO = supplierId => all('purchaseOrders').find(p => p.status === 'draft' && p.supplierId === supplierId && !all('purchases').some(b => b.poId === p.id));
async function addToDraftPO(ops, t, data) {
  if (!can.office(me()?.role) || !t.itemId || !(num(t.qty) > 0)) return null;
  const s = byId('suppliers', data.supplierId ?? t.supplierId); if (!s) return null;
  const cur = t.poId ? byId('purchaseOrders', t.poId) : null; if (cur && cur.status !== 'cancelled' && (cur.lines || []).some(l => l.taskId === t.id)) return null; // already on an order
  const it = byId('items', t.itemId), line = { itemId: t.itemId, sku: t.sku || it?.sku || '', name: t.name, qty: num(t.qty), rate: r2(num(it?.cost)), taskId: t.id, taskNo: t.no };
  const why = t.no + (t.soNo ? ' (' + t.soNo + (t.customerName ? ' · ' + t.customerName : '') + ')' : '');
  const po = openDraftPO(s.id);
  if (po) { const lines = [...po.lines, line]; ops.push(upd('purchaseOrders', po.id, { lines, total: poTotal(lines), log: [...(po.log || []), logEntry('Added from task ' + why)], ...stamp() })); return { id: po.id, no: po.no, added: true }; }
  const id = 'po' + uid(), no = await number('PO'), expected = (data.expectedDate ?? t.expectedDate) || '';
  ops.push(set('purchaseOrders', id, { no, supplierId: s.id, supplierName: s.name, mobile: s.mobile || '', date: today(), expected: expected >= today() ? expected : '', lines: [line], total: poTotal([line]), notes: '', terms: '', status: 'draft', log: [logEntry('Draft made from task ' + why)], ...created() }));
  return { id, no, added: false };
}
// tasks waiting on an order that is cancelled or deleted go back to “to do”, so the item can be ordered again
function releaseTasks(ops, po, why) { all('tasks').filter(t => t.poId === po.id && t.status === 'ordered').forEach(t => ops.push(upd('tasks', t.id, { status: 'open', poId: '', poNo: '', ...(t.poRef === po.no ? { poRef: '' } : {}), log: [...(t.log || []), logEntry(why + ' — back to to do')], ...stamp() }))); }
// a cancelled task comes off its draft order (an empty draft is removed); a confirmed order is left for the office to change
function dropFromDraftPO(ops, t) {
  const po = t.poId ? byId('purchaseOrders', t.poId) : null; if (!po || po.status !== 'draft' || all('purchases').some(b => b.poId === po.id)) return '';
  const lines = po.lines.filter(l => l.taskId !== t.id); if (lines.length === po.lines.length) return '';
  if (!lines.length) { ops.push(del('purchaseOrders', po.id)); closeFollowupsFor(ops, po.id, 'Draft order removed'); return `Draft purchase order ${po.no} removed`; }
  ops.push(upd('purchaseOrders', po.id, { lines, total: poTotal(lines), log: [...(po.log || []), logEntry('Task ' + t.no + ' cancelled — line removed')], ...stamp() })); return `Removed from draft purchase order ${po.no}`;
}

/* ============ sales orders ============ */
export async function createSalesOrder(src) {
  const c = byId('customers', src.customerId); if (!c) throw Error('Choose the customer.');
  const lines = cleanLines(await resolveNewItems(cleanLines(src.lines))); if (!lines.length) throw Error('Add at least one item.');
  const date = src.date || today(); checkDate(date);
  const t = withTax(docTotals(lines, src.discount, src.charges), src.tax), id = 'o' + uid(), no = await number('SO');
  const q = src.quotationId ? byId('quotations', src.quotationId) : null;
  const ops = [set('salesOrders', id, { no, date, customerId: c.id, customerName: c.name, mobile: c.mobile, salesman: src.salesman || c.salesman || me().id,
    quotationId: q?.id || '', quotationNo: q?.no || '', lines, ...t, advance: 0, status: src.deliveryDate ? 'scheduled' : 'open',
    deliveryDate: src.deliveryDate || '', deliverySlot: src.deliverySlot || '', deliveryAddress: src.deliveryAddress || c.address || '', deliveryNote: src.deliveryNote || '', notes: src.notes || '', ...created() })];
  if (q) { ops.push(upd('quotations', q.id, { status: 'converted', soId: id, soNo: no, convertedAt: Date.now(), ...stamp() })); closeFollowupsFor(ops, q.id, 'Converted to ' + no); }
  await syncTasks(ops, { id, no, customerId: c.id, customerName: c.name, salesman: src.salesman || c.salesman || me().id, deliveryDate: src.deliveryDate || '' }, lines);
  await store.db.commit(ops);
  if (num(src.advance) > 0) await receivePayment({ customerId: c.id, amount: src.advance, accountId: src.advanceAccount || ACC.cash, date, against: 'so', refId: id, refNo: no, note: 'Advance for ' + no, soAdvanceBefore: 0 });
  return id;
}
export async function updateSalesOrder(so, ch) {
  if (!['open', 'scheduled'].includes(so.status)) throw Error('Only open orders can be changed.');
  const data = { ...stamp() };
  if (ch.lines) { const lines = cleanLines(await resolveNewItems(cleanLines(ch.lines))); if (!lines.length) throw Error('Add at least one item.'); Object.assign(data, { lines, ...withTax(docTotals(lines, ch.discount ?? so.discount, ch.charges ?? so.charges), ch.tax !== undefined ? ch.tax : (so.tax || so.taxOff ? soTax(so) : null)) }); }
  ['deliveryDate', 'deliverySlot', 'deliveryAddress', 'deliveryNote', 'notes'].forEach(k => { if (ch[k] !== undefined) data[k] = ch[k]; });
  if (ch.deliveryDate !== undefined) data.status = ch.deliveryDate ? 'scheduled' : 'open';
  const ops = [upd('salesOrders', so.id, data)];
  await syncTasks(ops, { ...so, ...data }, data.lines || so.lines);
  await store.db.commit(ops);
}
export async function cancelSalesOrder(so, reason) { if (!['open', 'scheduled'].includes(so.status)) throw Error('This order cannot be cancelled.'); const ops = [upd('salesOrders', so.id, { status: 'cancelled', cancelReason: reason || '', ...stamp() })]; closeTasks(ops, so.id, 'cancelled', so.no + ' cancelled'); await store.db.commit(ops); }
// confirmed sales orders not yet delivered that hold this item
export function committedOrders(itemId) { const out = []; all('salesOrders').filter(o => o.status === 'open' || o.status === 'scheduled').forEach(o => { const q = o.lines.filter(l => l.itemId === itemId).reduce((x, l) => x + num(l.qty), 0); if (q) out.push({ so: o, qty: q }); }); return out.sort((a, b) => (a.so.deliveryDate || '9999').localeCompare(b.so.deliveryDate || '9999')); }
export function committedMap() { const m = {}; all('salesOrders').filter(o => o.status === 'open' || o.status === 'scheduled').forEach(o => o.lines.forEach(l => { if (l.itemId) m[l.itemId] = (m[l.itemId] || 0) + num(l.qty); })); return m; }
// salesmen can't read purchases, so office keeps a stock figure on each item for them
function stockFor(ops, deltas) { derive(true); Object.entries(deltas).forEach(([id, d]) => { const it = byId('items', id); if (it && d) ops.push(upd('items', id, { onHand: r2(num(it.onHand) + d) })); }); }

/* ============ delivery → invoice ============ */
export async function deliverAndInvoice(so, { date, tax } = {}) {
  date = date || today(); checkDate(date); derive(true);
  if (!['open', 'scheduled'].includes(so.status)) throw Error('This order is already delivered or cancelled.');
  if (so.lines.some(l => !l.itemId && l.newItem)) { const fixed = await resolveNewItems(so.lines); await store.db.commit([upd('salesOrders', so.id, { lines: fixed, ...stamp() })]); so = { ...so, lines: fixed }; derive(true); }
  const id = 'i' + uid(), no = await number('INV');
  const ic = issueCosts(so.lines.map(l => ({ itemId: l.itemId, qty: l.qty })));
  const lines = so.lines.map((l, k) => ({ ...l, cost: l.itemId ? ic[k] : 0, amount: lineTotal(l) }));
  const net = docNet(so), tx = calcTax(net, tax === undefined ? soTax(so) : tax), total = tx ? tx.total : net;
  const costTotal = r2(lines.reduce((s, l) => s + l.cost * num(l.qty), 0)), adv = r2(Math.max(0, Math.min(total, num(so.advance))));
  const ops = [set('invoices', id, { no, date, soId: so.id, soNo: so.no, customerId: so.customerId, customerName: so.customerName, mobile: so.mobile, salesman: so.salesman,
    lines, subtotal: so.subtotal, discount: so.discount, charges: cleanCharges(so.charges), chargesTotal: r2(num(so.chargesTotal)), ...(tx ? { tax: tx } : {}), total, costTotal, advanceApplied: adv, paid: adv, balance: r2(total - adv), status: adv >= total ? 'paid' : adv > 0 ? 'partial' : 'unpaid',
    deliveryAddress: so.deliveryAddress || '', ...created() })];
  if (tx) { ensureTaxAccounts(ops); rememberTaxType(ops, so.customerId, tx.type); }
  if (num(so.chargesTotal) > 0) ensureChargeAccount(ops);
  ops.push(upd('salesOrders', so.id, { status: 'delivered', invoiceId: id, invoiceNo: no, deliveredOn: date, deliveredAt: Date.now(), ...stamp() }));
  const d = {}; lines.forEach(l => { if (l.itemId) d[l.itemId] = (d[l.itemId] || 0) - num(l.qty); }); stockFor(ops, d);
  closeTasks(ops, so.id, 'done', 'Delivered with ' + no);
  await store.db.commit(ops); return id;
}
// the customer's last place of supply (within state / other state) is offered next time
function rememberTaxType(ops, customerId, type) { const c = byId('customers', customerId); if (c && c.taxType !== type) ops.push(upd('customers', c.id, { taxType: type })); }
export const customerTaxType = customerId => { const c = byId('customers', customerId); return c && c.taxType ? c.taxType : taxDefaults().type; };
// value of an invoice before GST: items − discount + other charges
export const docNet = d => r2((d.lines || []).reduce((x, l) => x + lineTotal(l), 0) - num(d.discount) + num(d.chargesTotal));
export const invoiceNet = docNet;
// the GST chosen on a sales order (or, for older orders, the shop default with the customer's place of supply) — used when it is invoiced
export const soTax = so => so.tax ? { ...so.tax, on: true } : so.taxOff ? { ...taxDefaults(), on: false } : { ...taxDefaults(), type: customerTaxType(so.customerId) };
// totals of a sales order with its GST: total includes the tax when prices exclude it
function withTax(t, tax) { const tx = tax ? calcTax(t.total, tax) : null; return { ...t, tax: tx || null, taxOff: !!tax && !tx, total: tx ? tx.total : t.total }; }
// change or remove the GST on an invoice that has no sales returns; payments stay, the balance is worked out again
export async function setInvoiceTax(inv, tax) {
  derive(true); inv = byId('invoices', inv.id) || inv; if (inv.status === 'void') throw Error('This invoice is void.');
  if (all('creditNotes').some(n => n.invoiceId === inv.id)) throw Error('This invoice has a sales return. Delete the credit note first to change its tax.');
  checkDate(inv.date);
  const net = invoiceNet(inv), tx = net > 0 ? calcTax(net, tax) : null, total = tx ? tx.total : net;
  const paid = num(inv.paid), balance = r2(Math.max(0, total - paid)), ops = [];
  if (paid > total + 0.009) throw Error(`More than the new total (${total}) has already been received on this invoice. Change the payments first.`);
  ops.push(upd('invoices', inv.id, { tax: tx || null, total, balance, status: balance <= 0.009 ? 'paid' : paid > 0 ? 'partial' : 'unpaid', ...stamp() }));
  if (tx) { ensureTaxAccounts(ops); rememberTaxType(ops, inv.customerId, tx.type); }
  await store.db.commit(ops);
}
export async function voidInvoice(inv, reason) {
  if (inv.status === 'void') return; checkDate(today());
  if (all('creditNotes').some(n => n.invoiceId === inv.id)) throw Error('This invoice has a sales return (credit note). Delete the credit note first, or return the remaining items with another credit note.');
  const ops = [upd('invoices', inv.id, { status: 'void', voidReason: reason || '', voidDate: today(), voidedAt: Date.now(), balance: 0, ...stamp() })];
  if (inv.soId && byId('salesOrders', inv.soId)) ops.push(upd('salesOrders', inv.soId, { status: 'scheduled', invoiceId: '', invoiceNo: '', ...stamp() }));
  const d = {}; inv.lines.forEach(l => { if (l.itemId) d[l.itemId] = (d[l.itemId] || 0) + num(l.qty); }); stockFor(ops, d);
  await store.db.commit(ops);
}

/* ============ money in / out ============ */
export async function receivePayment({ customerId, amount, accountId, date, against, refId, refNo: refNoIn, note, mode, soAdvanceBefore }) {
  amount = r2(amount); date = date || today(); checkDate(date);
  if (!(amount > 0)) throw Error('Enter the amount received.');
  const c = byId('customers', customerId); if (!c) throw Error('Choose the customer.');
  if (!byId('accounts', accountId)) throw Error('Choose where the money was received (cash / bank).');
  const id = 'r' + uid(), no = await number('RCPT'), ops = [];
  let refNo = '';
  if (against === 'so') { const so = byId('salesOrders', refId); refNo = so?.no || refNoIn || ''; ops.push(upd('salesOrders', refId, { advance: r2((soAdvanceBefore ?? num(so?.advance)) + amount) })); }
  if (against === 'invoice') { const inv = byId('invoices', refId); if (!inv) throw Error('Invoice not found.'); refNo = inv.no; const paid = r2(num(inv.paid) + amount); ops.push(upd('invoices', inv.id, { paid, balance: r2(inv.total - paid), status: paid >= inv.total - 0.009 ? 'paid' : 'partial' })); }
  ops.unshift(set('receipts', id, { no, date, customerId, customerName: c.name, mobile: c.mobile, amount, accountId, accountName: accName(accountId), mode: mode || '', against: against || 'account', refId: refId || '', refNo, note: note || '', ...created() }));
  await store.db.commit(ops); return id;
}
export async function refundCustomer({ customerId, amount, accountId, date, note }) {
  amount = r2(amount); date = date || today(); checkDate(date); if (!(amount > 0)) throw Error('Enter the refund amount.');
  const c = byId('customers', customerId); if (!c) throw Error('Choose the customer.'); const no = await number('REF');
  await store.db.commit([set('receipts', 'r' + uid(), { no, date, customerId, customerName: c.name, amount: -amount, accountId, accountName: accName(accountId), against: 'refund', note: note || 'Refund', ...created() })]);
}
export async function savePurchase(p) {
  const s = byId('suppliers', p.supplierId); if (!s) throw Error('Choose the supplier.');
  const date = p.date || today(); checkDate(date);
  const lines = (p.lines || []).filter(l => l.itemId && num(l.qty) > 0).map(l => ({ itemId: l.itemId, sku: l.sku, name: l.name, qty: num(l.qty), rate: r2(l.rate), disc: 0 }));
  if (!lines.length) throw Error('Add at least one item with quantity.');
  const total = r2(lines.reduce((x, l) => x + l.qty * l.rate, 0) + num(p.extra)), id = 'p' + uid(), no = await number('PB');
  const paidNow = r2(p.paidNow), adv = r2(p.useAdvance);
  if (paidNow + adv > total + 0.009) throw Error('Paid now plus advance used is more than the bill total.');
  if (adv > 0 && adv > num(s.advance) + 0.009) throw Error(`Only ${num(s.advance)} is available as advance with this supplier.`);
  const po = p.poId ? byId('purchaseOrders', p.poId) : null;
  const ops = [set('purchases', id, { no, billNo: p.billNo || '', date, supplierId: s.id, supplierName: s.name, lines, extra: r2(p.extra || 0), total, dueDate: p.dueDate || '', notes: p.notes || '', files: Array.isArray(p.files) ? p.files : [], ...(po ? { poId: po.id, poNo: po.no } : {}), ...created() })];
  if (po) ops.push(upd('purchaseOrders', po.id, { log: [...(po.log || []), { at: Date.now(), by: me()?.id || '', text: `Goods received on ${no}` }], ...stamp() }));
  const d = {}; lines.forEach(l => d[l.itemId] = (d[l.itemId] || 0) + l.qty); stockFor(ops, d);
  if (p.dueDate) ops.push(set('followups', 'f' + uid(), { refType: 'purchase', refId: id, partyType: 'supplier', partyId: s.id, partyName: s.name, mobile: s.mobile || '', due: p.dueDate, note: `Pay ${no}${p.billNo ? ' (bill ' + p.billNo + ')' : ''}`, assignedTo: me().id, status: 'open', ...created() }));
  await store.db.commit(ops);
  if (paidNow > 0) await paySupplier({ supplierId: s.id, amount: paidNow, accountId: p.paidFrom || ACC.cash, date, allocations: [{ refType: 'purchase', refId: id, no, amount: paidNow, max: total }] });
  if (adv > 0) await settleAdvance({ supplierId: s.id, date, allocations: [{ refType: 'purchase', refId: id, no, amount: adv, max: r2(total - paidNow) }] });
  return id;
}
/* ============ purchase orders: what was ordered from a supplier. No stock or accounting effect —
   that happens when the goods arrive on a purchase bill made from the order ============ */
const poNeed = po => { const m = {}; (po.lines || []).forEach(l => { if (l.itemId) m[l.itemId] = r2((m[l.itemId] || 0) + num(l.qty)); }); return m; };
export function poReceived(po) { const m = {}; all('purchases').filter(p => p.poId === po.id).forEach(p => p.lines.forEach(l => { m[l.itemId] = r2((m[l.itemId] || 0) + num(l.qty)); })); return m; }
export function poProgress(po) { const need = poNeed(po), got = poReceived(po); let n = 0, g = 0; for (const [k, q] of Object.entries(need)) { n += q; g += Math.min(q, got[k] || 0); } return { ordered: r2(n), received: r2(g) }; }
export function poState(po) {
  if (po.status === 'cancelled') return 'cancelled';
  const { ordered, received } = poProgress(po);
  if (ordered > 0 && received >= ordered - 0.0001) return 'received';
  if (received > 0) return 'partial';
  return po.status === 'sent' ? 'sent' : po.status === 'draft' ? 'draft' : 'open';
}
// lines still to come (ordered minus received, item by item, in the order's own sequence and rates)
export function poRemaining(po) {
  const got = { ...poReceived(po) }, out = [];
  for (const l of po.lines || []) { if (!l.itemId) continue; const take = Math.min(num(l.qty), got[l.itemId] || 0); got[l.itemId] = r2((got[l.itemId] || 0) - take); const left = r2(num(l.qty) - take); if (left > 0) out.push({ ...l, qty: left }); }
  return out;
}
export async function savePO(po) {
  const s = byId('suppliers', po.supplierId); if (!s) throw Error('Choose the supplier.');
  const lines = (po.lines || []).filter(l => l.itemId && num(l.qty) > 0).map(l => ({ itemId: l.itemId, sku: l.sku || '', name: l.name, qty: num(l.qty), rate: r2(l.rate), ...(l.taskId ? { taskId: l.taskId, taskNo: l.taskNo || '' } : {}) }));
  if (!lines.length) throw Error('Add at least one item with quantity.');
  const total = r2(lines.reduce((x, l) => x + l.qty * l.rate, 0)), date = po.date || today();
  if (po.expected && po.expected < date) throw Error('The expected delivery date is before the order date.');
  const body = { supplierId: s.id, supplierName: s.name, mobile: s.mobile || '', date, expected: po.expected || '', lines, total, notes: String(po.notes || '').trim(), terms: String(po.terms || '').trim() };
  if (po.id) {
    const old = byId('purchaseOrders', po.id); if (!old) throw Error('Order not found.');
    if (['received', 'cancelled'].includes(poState(old))) throw Error('This order is closed and can no longer be changed.');
    await store.db.commit([upd('purchaseOrders', po.id, { ...body, log: [...(old.log || []), logEntry('Order changed')], ...stamp() })]); return po.id;
  }
  const id = 'po' + uid(), no = await number('PO');
  const ops = [set('purchaseOrders', id, { no, ...body, status: 'open', log: [logEntry('Order created')], ...created() })];
  if (body.expected) ops.push(set('followups', 'f' + uid(), { refType: 'po', refId: id, partyType: 'supplier', partyId: s.id, partyName: s.name, mobile: s.mobile || '', due: body.expected, note: `Delivery due for ${no}`, assignedTo: me().id, status: 'open', ...created() }));
  await store.db.commit(ops); return id;
}
export async function setPOStatus(po, status, reason) {
  if (!['open', 'sent', 'cancelled'].includes(status)) throw Error('Unknown status.');
  if (status === 'cancelled' && !String(reason || '').trim()) throw Error('Give a reason for cancelling.');
  const text = status === 'sent' ? 'Marked as sent to supplier' : status === 'cancelled' ? 'Cancelled: ' + String(reason).trim() : po.status === 'draft' ? 'Draft confirmed' : 'Reopened';
  const ops = [upd('purchaseOrders', po.id, { status, ...(status === 'cancelled' ? { cancelReason: String(reason).trim() } : {}), ...(status === 'sent' ? { sentAt: Date.now() } : {}), log: [...(po.log || []), logEntry(text)], ...stamp() })];
  if (status === 'cancelled') { closeFollowupsFor(ops, po.id, 'Order cancelled'); releaseTasks(ops, po, po.no + ' cancelled'); }
  await store.db.commit(ops);
}
export async function deletePO(po) {
  if (all('purchases').some(p => p.poId === po.id)) throw Error('Goods were already received on this order — cancel it instead.');
  const ops = [del('purchaseOrders', po.id)]; closeFollowupsFor(ops, po.id, 'Order deleted'); releaseTasks(ops, po, po.no + ' deleted'); await store.db.commit(ops);
}
// how many of an item are ordered but not yet received (open orders)
export function onOrder(itemId) { let n = 0; all('purchaseOrders').filter(po => !['cancelled', 'received'].includes(poState(po))).forEach(po => poRemaining(po).forEach(l => { if (l.itemId === itemId) n += num(l.qty); })); return r2(n); }
/* ============ after-sales service: complaints, visits, parts and service invoices ============ */
export const SVC_TYPES = { repair: 'Repair', replacement: 'Product replacement', component: 'Component replacement', inspection: 'Inspection / check', installation: 'Installation / assembly', other: 'Other' };
export const SVC_STATUS = { open: 'New', scheduled: 'Visit scheduled', in_progress: 'In progress', waiting_parts: 'Waiting for parts', resolved: 'Resolved', closed: 'Closed', cancelled: 'Cancelled' };
export const SVC_OPEN = ['open', 'scheduled', 'in_progress', 'waiting_parts'];
export const warrantyMonths = () => Math.max(0, Math.round(num(setting('warrantyMonths', 12))));
export function warrantyEnd(purchaseDate, months = warrantyMonths()) { if (!purchaseDate) return ''; const d = new Date(purchaseDate + 'T00:00:00'); if (isNaN(d)) return ''; d.setMonth(d.getMonth() + months); return today(d); }
export const nextVisit = s => (s.visits || []).filter(v => v.status === 'scheduled').sort((a, b) => (a.date + (a.time || '')).localeCompare(b.date + (b.time || '')))[0] || null;
// every planned / done visit as work: { s, v }
export const serviceVisits = () => all('services').flatMap(s => (s.visits || []).map(v => ({ s, v })));
export async function saveService(x) {
  const c = byId('customers', x.customerId); if (!c) throw Error('Choose the customer.');
  const complaint = String(x.complaint || '').trim(); if (!complaint) throw Error('Describe the complaint.');
  if (!SVC_TYPES[x.type]) throw Error('Choose the type of service.');
  const product = String(x.product || '').trim(); if (!product) throw Error('Enter the product.');
  const inv = x.invoiceId ? byId('invoices', x.invoiceId) : null;
  const body = { customerId: c.id, customerName: c.name, mobile: String(x.mobile || c.mobile || '').trim(), address: String(x.address ?? c.address ?? '').trim(), invoiceId: inv?.id || '', invoiceNo: inv?.no || '',
    itemId: x.itemId || '', product, purchaseDate: x.purchaseDate || inv?.date || '', warranty: ['in', 'out', 'na'].includes(x.warranty) ? x.warranty : 'na', type: x.type, priority: x.priority === 'urgent' ? 'urgent' : 'normal',
    complaint, chargeable: !!x.chargeable, files: Array.isArray(x.files) ? x.files : [] };
  if (x.id) {
    const old = byId('services', x.id); if (!old) throw Error('Service request not found.');
    await store.db.commit([upd('services', x.id, { ...body, log: [...(old.log || []), logEntry('Details changed')], ...stamp() })]); return x.id;
  }
  const id = 'sv' + uid(), no = await number('SR');
  await store.db.commit([set('services', id, { no, date: x.date || today(), ...body, status: 'open', visits: [], invoiceIds: [], log: [logEntry('Complaint registered')], ...created() })]);
  return id;
}
export async function scheduleVisit(s, { date, time, assignedTo, note, visitId }) {
  if (!date) throw Error('Choose the visit date.'); if (!assignedTo) throw Error('Choose who will attend.');
  if (['closed', 'cancelled'].includes(s.status)) throw Error('This service request is closed.');
  const visits = (s.visits || []).map(v => ({ ...v }));
  if (visitId) { const v = visits.find(x => x.id === visitId); if (!v) throw Error('Visit not found.'); Object.assign(v, { date, time: time || '', assignedTo, note: String(note || '').trim() }); }
  else visits.push({ id: 'v' + uid(), date, time: time || '', assignedTo, note: String(note || '').trim(), status: 'scheduled', by: me()?.id || '', at: Date.now() });
  const status = ['open', 'resolved'].includes(s.status) ? 'scheduled' : s.status;
  await store.db.commit([upd('services', s.id, { visits, status, log: [...(s.log || []), logEntry(`${visitId ? 'Visit changed' : 'Visit scheduled'}: ${date}${time ? ' ' + time : ''} · ${nm(assignedTo)}`)], ...stamp() })]);
}
export async function finishVisit(s, visitId, { outcome, next }) {
  outcome = String(outcome || '').trim(); if (!outcome) throw Error('Write what was done.');
  if (!['in_progress', 'waiting_parts', 'resolved'].includes(next)) throw Error('Choose the next step.');
  const visits = (s.visits || []).map(v => v.id === visitId ? { ...v, status: 'done', outcome, doneAt: Date.now(), doneBy: me()?.id || '' } : { ...v });
  const more = visits.some(v => v.status === 'scheduled');
  await store.db.commit([upd('services', s.id, { visits, status: next === 'in_progress' && more ? 'scheduled' : next, ...(next === 'resolved' ? { resolution: outcome, resolvedAt: Date.now() } : {}), log: [...(s.log || []), logEntry('Visit done: ' + outcome)], ...stamp() })]);
}
export async function cancelVisit(s, visitId, why) {
  const visits = (s.visits || []).map(v => v.id === visitId ? { ...v, status: 'cancelled', outcome: String(why || '').trim() } : { ...v });
  const more = visits.some(v => v.status === 'scheduled');
  await store.db.commit([upd('services', s.id, { visits, status: s.status === 'scheduled' && !more ? 'open' : s.status, log: [...(s.log || []), logEntry('Visit cancelled' + (why ? ': ' + why : ''))], ...stamp() })]);
}
export async function setServiceStatus(s, status, note) {
  if (!SVC_STATUS[status]) throw Error('Unknown status.');
  note = String(note || '').trim(); if (['resolved', 'closed', 'cancelled'].includes(status) && !note) throw Error('Write a short note.');
  const visits = ['closed', 'cancelled'].includes(status) ? (s.visits || []).map(v => v.status === 'scheduled' ? { ...v, status: 'cancelled', outcome: 'Request ' + status } : v) : s.visits || [];
  await store.db.commit([upd('services', s.id, { status, visits, ...(status === 'resolved' || status === 'closed' ? { resolution: note || s.resolution || '' } : {}), ...(status === 'closed' ? { closedAt: Date.now() } : {}),
    log: [...(s.log || []), logEntry(SVC_STATUS[status] + (note ? ': ' + note : ''))], ...stamp() })]);
}
function ensureServiceAccounts(ops) {
  if (!byId('accounts', ACC.svcinc)) ops.push(set('accounts', ACC.svcinc, { code: nextAccCode(4200), name: 'Service Income', type: 'income', group: 'service', system: true }));
  if (!byId('accounts', ACC.svccost)) ops.push(set('accounts', ACC.svccost, { code: nextAccCode(5200), name: 'Warranty & Service Cost', type: 'expense', group: 'cos', system: true }));
}
// parts (from stock) + service charges → an invoice of kind "service": stock goes down, the customer owes the total
export async function createServiceInvoice(s, { date, parts, charges, note, tax }) {
  date = date || today(); checkDate(date); derive(true);
  const pl = (parts || []).filter(l => l.itemId && num(l.qty) > 0).map(l => ({ itemId: l.itemId, sku: l.sku || '', name: l.name, qty: num(l.qty), rate: r2(Math.max(0, num(l.rate))), disc: 0, free: !(num(l.rate) > 0) }));
  const cl = (charges || []).filter(c => String(c.desc || '').trim() && num(c.amount) > 0).map(c => ({ itemId: '', sku: '', name: String(c.desc).trim(), qty: 1, rate: r2(c.amount), disc: 0, charge: true }));
  if (!pl.length && !cl.length) throw Error('Add a part or a service charge.');
  const ic = issueCosts(pl.map(l => ({ itemId: l.itemId, qty: l.qty })));
  const lines = [...pl.map((l, k) => ({ ...l, cost: ic[k], amount: lineTotal(l) })), ...cl.map(l => ({ ...l, cost: 0, amount: l.rate }))];
  const net = r2(lines.reduce((x, l) => x + l.amount, 0)), costTotal = r2(lines.reduce((x, l) => x + num(l.cost) * num(l.qty), 0));
  const tx = net > 0 ? calcTax(net, tax === undefined ? taxDefaults() : tax) : null, total = tx ? tx.total : net;
  const id = 'i' + uid(), no = await number('SI');
  const ops = [set('invoices', id, { kind: 'service', no, date, serviceId: s.id, serviceNo: s.no, soId: '', soNo: '', customerId: s.customerId, customerName: s.customerName, mobile: s.mobile || '', salesman: me()?.id || '',
    lines, subtotal: net, discount: 0, ...(tx ? { tax: tx } : {}), total, costTotal, advanceApplied: 0, paid: 0, balance: total, status: total > 0 ? 'unpaid' : 'paid', note: String(note || '').trim(), deliveryAddress: s.address || '', ...created() })];
  ensureServiceAccounts(ops); if (tx) { ensureTaxAccounts(ops); rememberTaxType(ops, s.customerId, tx.type); }
  const d = {}; pl.forEach(l => d[l.itemId] = (d[l.itemId] || 0) - l.qty); stockFor(ops, d);
  ops.push(upd('services', s.id, { invoiceIds: [...(s.invoiceIds || []), id], log: [...(s.log || []), logEntry(total > 0 ? `Service invoice ${no} · ${total}` : `Parts given free under warranty (${no})`)], ...stamp() }));
  await store.db.commit(ops); return id;
}
export const payAllocs = p => p.allocations ? p.allocations : (p.purchaseId ? [{ refType: 'purchase', refId: p.purchaseId, no: p.refNo || '', amount: num(p.amount) }] : []);
// Unpaid bills and opening balance of a supplier, oldest first
export function supplierDues(supplierId) {
  derive(true);
  const o = all('openings').filter(x => x.kind === 'supplier' && x.partyId === supplierId && num(x.balance) > 0.009).map(x => ({ refType: 'opening', refId: x.id, no: 'Opening balance', billNo: '', date: x.date, dueDate: '', total: num(x.amount), balance: r2(x.balance) }));
  const b = all('purchases').filter(x => x.supplierId === supplierId && num(x.balance) > 0.009).map(x => ({ refType: 'purchase', refId: x.id, no: x.no, billNo: x.billNo || '', date: x.date, dueDate: x.dueDate || '', total: x.total, balance: r2(x.balance) }));
  return [...o, ...b].sort((a, c) => a.date.localeCompare(c.date));
}
const checkAllocs = (supplierId, allocs) => {
  const due = new Map(supplierDues(supplierId).map(d => [d.refId, d]));
  return (allocs || []).filter(a => num(a.amount) > 0).map(a => {
    const d = due.get(a.refId), max = d ? d.balance : num(a.max);
    if (!d && !a.max) throw Error('That bill is already fully paid.');
    if (num(a.amount) > max + 0.009) throw Error(`${d?.no || a.no}: amount is more than the balance due (${max}).`);
    return { refType: a.refType || d?.refType || 'purchase', refId: a.refId, no: d?.no || a.no || '', amount: r2(a.amount) };
  });
};
export async function paySupplier({ supplierId, amount, accountId, date, purchaseId, purchaseDoc, note, allocations, files }) {
  amount = r2(amount); date = date || today(); checkDate(date); if (!(amount > 0)) throw Error('Enter the amount paid.');
  const s = byId('suppliers', supplierId); if (!s) throw Error('Choose the supplier.');
  if (!allocations && purchaseId) { const pb = byId('purchases', purchaseId) || purchaseDoc; allocations = [{ refType: 'purchase', refId: purchaseId, no: pb?.no || '', amount, max: purchaseDoc ? amount : 0 }]; }
  const al = checkAllocs(supplierId, allocations), used = r2(al.reduce((x, a) => x + a.amount, 0));
  if (used > amount + 0.009) throw Error(`Bills selected (${used}) are more than the amount paid (${amount}).`);
  const no = await number('PAY');
  await store.db.commit([set('payments', 'y' + uid(), { no, date, supplierId, supplierName: s.name, amount, accountId, accountName: accName(accountId), allocations: al,
    purchaseId: al.length === 1 && al[0].refType === 'purchase' ? al[0].refId : '', refNo: al.map(a => a.no).join(', ') || (used < amount ? 'Advance' : ''), note: note || '', files: Array.isArray(files) ? files : [], ...created() })]);
  return no;
}
// Use money already paid in advance to settle bills (no cash moves; it links advance payments to bills, oldest advance first)
export async function settleAdvance({ supplierId, allocations, date }) {
  derive(true); date = date || today();
  const al = checkAllocs(supplierId, allocations); let need = r2(al.reduce((x, a) => x + a.amount, 0));
  if (!(need > 0)) throw Error('Choose the bills and amounts to settle.');
  const pays = [...all('payments').map(p => ({ p, coll: 'payments' })), ...all('debitNotes').map(p => ({ p, coll: 'debitNotes' }))].map(x => (x.p.__coll = x.coll, x.p)).filter(p => p.supplierId === supplierId && num(p.unallocated) > 0.009).sort((a, b) => a.date.localeCompare(b.date) || (a.createdAt || 0) - (b.createdAt || 0));
  const avail = r2(pays.reduce((x, p) => x + num(p.unallocated), 0)); if (need > avail + 0.009) throw Error(`Only ${avail} is available as advance.`);
  const touched = new Map(); const queue = al.map(a => ({ ...a, left: a.amount }));
  for (const p of pays) {
    let free = num(p.unallocated); const list = touched.get(p.id) || payAllocs(p).map(x => ({ ...x }));
    for (const a of queue) { if (free <= 0.009) break; if (a.left <= 0.009) continue; const take = r2(Math.min(free, a.left)); list.push({ refType: a.refType, refId: a.refId, no: a.no, amount: take, settledOn: date, settledAt: Date.now(), by: me()?.id || '' }); free = r2(free - take); a.left = r2(a.left - take); }
    if (list.length !== payAllocs(p).length) touched.set(p.id, list);
    if (queue.every(a => a.left <= 0.009)) break;
  }
  await store.db.commit([...touched].map(([id, list]) => { const p = pays.find(x => x.id === id), u = r2(num(p.amount) - list.reduce((x, a) => x + num(a.amount), 0));
    return p.__coll === 'debitNotes' ? upd('debitNotes', id, { allocations: list, ...stamp() }) : upd('payments', id, { allocations: list, purchaseId: '', refNo: list.map(a => a.no).join(', ') + (u > 0.009 ? ' + advance' : ''), ...stamp() }); }));
  return need;
}
export async function addExpense({ date, expenseAcc, fromAcc, amount, payee, note }) {
  amount = r2(amount); date = date || today(); checkDate(date); if (!(amount > 0)) throw Error('Enter the amount.');
  const ea = byId('accounts', expenseAcc); if (!ea) throw Error('Choose the expense type.'); if (!byId('accounts', fromAcc)) throw Error('Choose how it was paid.');
  const no = await number('EXP');
  await store.db.commit([set('expenses', 'e' + uid(), { no, date, expenseAcc, expenseName: ea.name, fromAcc, fromName: accName(fromAcc), amount, payee: payee || '', note: note || '', ...created() })]);
  return no;
}
export async function transferMoney({ date, from, to, amount, note }) {
  amount = r2(amount); date = date || today(); checkDate(date); if (!(amount > 0)) throw Error('Enter the amount.'); if (from === to) throw Error('Choose two different accounts.');
  const no = await number('TRF'); await store.db.commit([set('transfers', 't' + uid(), { no, date, from, to, amount, note: note || '', ...created() })]);
}
/* ============ returns: credit notes (sales) and debit notes (purchases) ============ */
async function ensureAccount(ops, id, code, name, type, group) { if (!byId('accounts', id)) ops.push(set('accounts', id, { code, name, type, group, system: true })); }
// how many of each invoice / bill line have already been returned
export function returnedQty(coll, key, docId) { const m = {}; all(coll).filter(n => n[key] === docId).forEach(n => n.lines.forEach(l => { m[l.lk || l.itemId] = r2((m[l.lk || l.itemId] || 0) + num(l.qty)); })); return m; }
export async function createCreditNote({ invoiceId, lines, date, reason, refundNow, refundAccount }) {
  derive(true); const inv = byId('invoices', invoiceId); if (!inv) throw Error('Invoice not found.'); if (inv.status === 'void') throw Error('This invoice is void.');
  date = date || today(); checkDate(date); if (date < inv.date) throw Error('The return date can’t be before the invoice date.');
  const done = returnedQty('creditNotes', 'invoiceId', inv.id);
  const L = (lines || []).filter(l => num(l.qty) > 0).map(l => { const src = inv.lines[l.idx]; if (!src) throw Error('Line not found.');
    const k = src.lk || src.itemId, left = r2(num(src.qty) - num(done[k])); if (num(l.qty) > left + 1e-9) throw Error(`${src.name}: only ${left} can still be returned.`);
    const qty = num(l.qty), rate = r2(l.rate); return { lk: k, itemId: src.itemId, sku: src.sku || '', name: src.name, desc: src.desc || '', qty, rate, amount: r2(qty * rate), cost: r2(num(src.cost)), restock: l.restock !== false }; });
  if (!L.length) throw Error('Enter the quantity returned for at least one item.');
  const amt = r2(L.reduce((x, l) => x + l.amount, 0)), costTotal = r2(L.filter(l => l.restock).reduce((x, l) => x + l.qty * l.cost, 0));
  const tx = inv.tax ? calcTax(amt, inv.tax) : null, total = tx ? tx.total : amt;
  const ops = []; await ensureAccount(ops, ACC.salesret, '4050', 'Sales Returns', 'income', 'returns');
  const id = 'cn' + uid(), no = await number('CN');
  ops.push(set('creditNotes', id, { no, date, invoiceId: inv.id, invoiceNo: inv.no, customerId: inv.customerId, customerName: inv.customerName, mobile: inv.mobile || '', salesman: inv.salesman || '', lines: L, ...(tx ? { tax: tx } : {}), total, costTotal, reason: reason || '', ...created() }));
  const d = {}; L.filter(l => l.restock && l.itemId).forEach(l => d[l.itemId] = (d[l.itemId] || 0) + l.qty); stockFor(ops, d);
  const paidLeft = r2(Math.max(0, num(inv.total) - num(inv.paid) - num(inv.credited) - total));
  ops.push(upd('invoices', inv.id, { credited: r2(num(inv.credited) + total), balance: paidLeft, status: paidLeft <= 0.009 ? 'paid' : 'partial', ...stamp() }));
  await store.db.commit(ops);
  if (num(refundNow) > 0) await refundCustomer({ customerId: inv.customerId, amount: refundNow, accountId: refundAccount || ACC.cash, date, note: 'Refund for ' + no });
  return id;
}
export async function createDebitNote({ purchaseId, lines, date, reason }) {
  derive(true); const pb = byId('purchases', purchaseId); if (!pb) throw Error('Bill not found.');
  date = date || today(); checkDate(date); if (date < pb.date) throw Error('The return date can’t be before the bill date.');
  const done = returnedQty('debitNotes', 'purchaseId', pb.id);
  const L = (lines || []).filter(l => num(l.qty) > 0).map(l => { const src = pb.lines[l.idx]; if (!src) throw Error('Line not found.');
    const left = r2(num(src.qty) - num(done[src.itemId])); if (num(l.qty) > left + 1e-9) throw Error(`${src.name}: only ${left} can still be returned.`);
    const it = byId('items', src.itemId), qty = num(l.qty), rate = r2(l.rate); return { itemId: src.itemId, sku: src.sku || '', name: src.name, qty, rate, amount: r2(qty * rate), cost: it ? 0 : rate }; });
  const icD = issueCosts(L.map(l => ({ itemId: l.itemId, qty: l.qty }))); L.forEach((l, k) => { if (byId('items', l.itemId)) l.cost = icD[k]; });
  if (!L.length) throw Error('Enter the quantity returned for at least one item.');
  const total = r2(L.reduce((x, l) => x + l.amount, 0)), costTotal = r2(L.reduce((x, l) => x + l.qty * l.cost, 0));
  const apply = r2(Math.min(total, Math.max(0, num(pb.balance))));
  const id = 'dn' + uid(), no = await number('DN'), ops = [set('debitNotes', id, { no, date, purchaseId: pb.id, purchaseNo: pb.no, billNo: pb.billNo || '', supplierId: pb.supplierId, supplierName: pb.supplierName, lines: L, total, costTotal, reason: reason || '',
    allocations: apply > 0 ? [{ refType: 'purchase', refId: pb.id, no: pb.no, amount: apply }] : [], ...created() })];
  const d = {}; L.forEach(l => d[l.itemId] = (d[l.itemId] || 0) - l.qty); stockFor(ops, d);
  await store.db.commit(ops); return { id, no, total, apply, credit: r2(total - apply) };
}

/* ============ view / edit / delete money transactions ============ */
export const TXN = { receipts: 'Receipt', payments: 'Supplier payment', expenses: 'Expense', transfers: 'Transfer', purchases: 'Purchase bill', creditNotes: 'Credit note', debitNotes: 'Debit note' };
// the double-entry lines the books hold for a document number
export function journalFor(no) { derive(true); return (store.data.journals_ || []).filter(j => j.refNo === no); }
function txnSide(ops, coll, doc, newAmt) {
  if (coll !== 'receipts') return;
  if (doc.against === 'invoice') { const inv = byId('invoices', doc.refId); if (inv) { const paid = r2(num(inv.paid) - num(doc.amount) + newAmt); ops.push(upd('invoices', inv.id, { paid, balance: r2(inv.total - paid), status: inv.status === 'void' ? 'void' : paid >= inv.total - 0.009 ? 'paid' : paid > 0.009 ? 'partial' : 'unpaid' })); } }
  if (doc.against === 'so') { const so = byId('salesOrders', doc.refId); if (so) ops.push(upd('salesOrders', so.id, { advance: r2(num(so.advance) - num(doc.amount) + newAmt) })); }
}
function txnGuard(coll, doc) {
  checkDate(doc.date);
  if (coll === 'receipts' && doc.against === 'so') { const so = byId('salesOrders', doc.refId); if (so && so.status === 'delivered') throw Error(`This advance was already used on invoice ${so.invoiceNo || ''}. Void that invoice first, or record a refund instead.`); }
}
export async function deleteTxn(coll, doc, reason) {
  if (!TXN[coll]) throw Error('This entry can’t be deleted here.'); derive(true); txnGuard(coll, doc);
  const ops = [set('deletedTxns', 'x' + uid(), { coll, docId: doc.id, no: doc.no, date: doc.date, amount: num(doc.amount ?? doc.total), reason: reason || '', snapshot: JSON.parse(JSON.stringify(doc)), ...created() }), del(coll, doc.id)];
  if (coll === 'purchases') {
    const paid = all('payments').some(y => payAllocs(y).some(a => a.refId === doc.id)); if (paid) throw Error('Payments are linked to this bill. Delete those payments first (or they will stay as an advance).');
    if (all('debitNotes').some(n => n.purchaseId === doc.id)) throw Error('This bill has a purchase return (debit note). Delete the debit note first.');
    const d = {}; doc.lines.forEach(l => d[l.itemId] = (d[l.itemId] || 0) - num(l.qty)); stockFor(ops, d); closeFollowupsFor(ops, doc.id, 'Bill deleted');
  }
  if (coll === 'creditNotes') { const d = {}; doc.lines.filter(l => l.restock && l.itemId).forEach(l => d[l.itemId] = (d[l.itemId] || 0) - num(l.qty)); stockFor(ops, d);
    const inv = byId('invoices', doc.invoiceId); if (inv) { const cr = r2(num(inv.credited) - num(doc.total)), bal = r2(Math.max(0, num(inv.total) - num(inv.paid) - cr)); ops.push(upd('invoices', inv.id, { credited: cr, balance: bal, status: bal <= 0.009 ? 'paid' : (num(inv.paid) + cr > 0 ? 'partial' : 'unpaid') })); } }
  if (coll === 'debitNotes') { const d = {}; doc.lines.forEach(l => d[l.itemId] = (d[l.itemId] || 0) + num(l.qty)); stockFor(ops, d); }
  txnSide(ops, coll, doc, 0);
  await store.db.commit(ops);
}
export async function updateTxn(coll, doc, ch) {
  derive(true); txnGuard(coll, doc);
  const date = ch.date || doc.date; checkDate(date);
  const data = { date, editedAt: Date.now(), editedBy: me()?.id || '', edits: [...(doc.edits || []), { at: Date.now(), by: me()?.id || '', before: { date: doc.date, amount: doc.amount ?? doc.total } }].slice(-20), ...stamp() };
  if (coll === 'purchases') { Object.assign(data, { billNo: ch.billNo ?? doc.billNo ?? '', dueDate: ch.dueDate ?? doc.dueDate ?? '', notes: ch.notes ?? doc.notes ?? '' }); delete data.edits; data.edits = [...(doc.edits || []), { at: Date.now(), by: me()?.id || '', before: { date: doc.date } }].slice(-20); await store.db.commit([upd(coll, doc.id, data)]); return; }
  const sign = num(doc.amount) < 0 ? -1 : 1, amt = r2(Math.abs(num(ch.amount))); if (!(amt > 0)) throw Error('Enter the amount.');
  const newAmt = r2(sign * amt); data.amount = newAmt; data.note = ch.note ?? doc.note ?? '';
  if (coll === 'receipts') {
    if (!byId('accounts', ch.accountId)) throw Error('Choose the cash / bank account.'); Object.assign(data, { accountId: ch.accountId, accountName: accName(ch.accountId), mode: ch.mode ?? doc.mode ?? '' });
    if (doc.against === 'invoice') { const inv = byId('invoices', doc.refId); if (inv && newAmt > r2(num(inv.balance) + num(doc.amount)) + 0.009) throw Error(`More than the invoice balance (${r2(num(inv.balance) + num(doc.amount))}).`); }
  }
  if (coll === 'payments') {
    if (!byId('accounts', ch.accountId)) throw Error('Choose the cash / bank account.'); Object.assign(data, { accountId: ch.accountId, accountName: accName(ch.accountId) });
    const used = r2(payAllocs(doc).reduce((x, a) => x + num(a.amount), 0)); if (newAmt < used - 0.009) throw Error(`${used} of this payment is already set against bills. The amount can't be less than that.`);
  }
  if (coll === 'expenses') { const ea = byId('accounts', ch.expenseAcc); if (!ea) throw Error('Choose the expense account.'); if (!byId('accounts', ch.fromAcc)) throw Error('Choose how it was paid.'); Object.assign(data, { expenseAcc: ea.id, expenseName: ea.name, fromAcc: ch.fromAcc, fromName: accName(ch.fromAcc), payee: ch.payee ?? doc.payee ?? '' }); }
  if (coll === 'transfers') { if (ch.from === ch.to) throw Error('Choose two different accounts.'); Object.assign(data, { from: ch.from, to: ch.to }); }
  const ops = [upd(coll, doc.id, data)]; txnSide(ops, coll, doc, newAmt);
  await store.db.commit(ops);
}
export async function manualJournal({ id, date, memo, lines }) {
  date = date || today(); checkDate(date);
  const old = id ? byId('journals', id) : null;
  if (id && !old) throw Error('Journal not found.');
  if (old) { if (old.status === 'void') throw Error('This journal was deleted.'); checkDate(old.date); }
  const L = lines.filter(l => l.acc && (num(l.dr) || num(l.cr))).map(l => {
    const o = { acc: l.acc, dr: r2(l.dr), cr: r2(l.cr) };
    if (o.dr && o.cr) throw Error('Each line takes a debit or a credit, not both.');
    if (o.dr < 0 || o.cr < 0) throw Error('Amounts cannot be negative.');
    if (l.acc === ACC.ar) { if (!l.c || !byId('customers', l.c)) throw Error('Choose the customer for the Accounts Receivable line.'); o.c = l.c; }
    if (l.acc === ACC.ap) { if (!l.s || !byId('suppliers', l.s)) throw Error('Choose the supplier for the Accounts Payable line.'); o.s = l.s; }
    return o;
  });
  if (L.length < 2) throw Error('A journal needs at least two lines.');
  const dr = r2(L.reduce((s, l) => s + l.dr, 0)), cr = r2(L.reduce((s, l) => s + l.cr, 0)); if (Math.abs(dr - cr) > 0.009) throw Error(`Debit (${dr}) and credit (${cr}) must be equal.`);
  const party = [...new Set(L.map(l => l.c ? byId('customers', l.c)?.name : l.s ? byId('suppliers', l.s)?.name : '').filter(Boolean))].join(', ');
  if (old) { await store.db.commit([upd('journals', id, { date, memo: memo || '', lines: L, party, total: dr, ...stamp() })]); return id; }
  const nid = 'j' + uid(), no = await number('JV'); await store.db.commit([set('journals', nid, { no, date, memo: memo || '', lines: L, party, total: dr, status: 'posted', ...created() })]);
  return nid;
}
export async function deleteJournal(j, reason) {
  if (j.status === 'void') return; checkDate(j.date);
  await store.db.commit([upd('journals', j.id, { status: 'void', voidReason: reason || '', voidedAt: Date.now(), voidedBy: me()?.id || '', ...stamp() })]);
}
export async function reverseJournal(j, date) {
  if (j.status === 'void') throw Error('This journal was deleted.'); if (j.reversedBy) throw Error(`Already reversed by ${j.reversedBy}.`);
  date = date || today(); checkDate(date);
  const L = j.lines.map(l => ({ ...l, dr: l.cr, cr: l.dr })), nid = 'j' + uid(), no = await number('JV');
  await store.db.commit([set('journals', nid, { no, date, memo: `Reversal of ${j.no}${j.memo ? ' – ' + j.memo : ''}`, lines: L, party: j.party || '', total: j.total || r2(L.reduce((s, l) => s + l.dr, 0)), status: 'posted', reverses: j.no, ...created() }),
    upd('journals', j.id, { reversedBy: no, ...stamp() })]);
  return nid;
}
export async function saveAccount(a) {
  const name = String(a.name || '').trim(), code = String(a.code || '').trim();
  if (!name) throw Error('Enter the account name.');
  const kind = ACCOUNT_KINDS.find(k => k[0] === a.kind);
  if (a.id) {
    const old = byId('accounts', a.id); if (!old) throw Error('Account not found.');
    const data = { name, ...stamp() };
    if (kind && (kind[1] !== old.type || kind[2] !== old.group)) {
      if (FIXED_GROUPS.includes(old.group)) throw Error(`The class of “${old.name}” is fixed because the app posts to it automatically.`);
      if (kind[1] !== old.type) throw Error(`You can move an account between classes of the same type only (e.g. operating ↔ non-operating expense). Make a new account instead.`);
      data.group = kind[2];
    }
    await store.db.commit([upd('accounts', a.id, data)]); return a.id;
  }
  if (!code) throw Error('Enter the account code.'); if (!kind) throw Error('Choose the account type.');
  const id = 'a' + code; if (byId('accounts', id) || all('accounts').some(x => x.code === code)) throw Error('That account code is already used.');
  await store.db.commit([set('accounts', id, { code, name, type: kind[1], group: kind[2], system: false, ...created() })]); return id;
}

/* ============ items & stock ============ */
export async function saveItem(it) {
  const sku = String(it.sku || '').trim(), name = String(it.name || '').trim().replace(/\s+/g, ' ');
  if (!sku || !name) throw Error('Enter the item name and barcode / SKU.');
  if (all('items').find(x => x.sku === sku && x.id !== it.id && x.name.toLowerCase() === name.toLowerCase())) throw Error('This item already exists.');
  const data = { sku, name, category: String(it.category || 'GENERAL').toUpperCase().trim(), mrp: r2(it.mrp), reorder: num(it.reorder), ...stamp() };
  if (it.id) {
    const ops = [upd('items', it.id, data)], old = byId('items', it.id);
    if (it.cost !== '' && it.cost != null && Math.abs(r2(it.cost) - num(old.cost)) > 0.009) { derive(true); const no = await number('ADJ'); ops.push(set('adjustments', 'd' + uid(), { no, date: today(), itemId: it.id, name, diff: 0, newCost: r2(it.cost), value: r2(num(old.onHand) * (r2(it.cost) - num(old.cost))), reason: 'Cost revalued', ...created() })); }
    await store.db.commit(ops); return it.id;
  }
  const id = 'it' + uid(), qty = num(it.onHand), ops = [set('items', id, { ...data, onHand: qty, ...created() })];
  ops.push(set('openings', 'o' + uid(), { kind: 'stock', date: today(), memo: 'Opening stock ' + name, lines: [{ itemId: id, qty, cost: r2(it.cost) }], ...created() }));
  await store.db.commit(ops); return id;
}
export async function importItems(rows, { asOpening = true } = {}) {
  const ops = [], lines = []; let added = 0, updated = 0, value = 0;
  for (const r of rows) {
    const ex = all('items').find(x => x.sku === r.sku && x.name.toLowerCase() === r.name.toLowerCase()) || (all('items').filter(x => x.sku === r.sku).length === 1 ? all('items').find(x => x.sku === r.sku) : null);
    if (ex) { ops.push(upd('items', ex.id, { name: r.name, category: (r.category || ex.category).toUpperCase(), mrp: r2(r.mrp), ...stamp() })); updated++; continue; }
    const id = 'it' + uid(), q = asOpening ? Math.max(0, num(r.stock)) : 0;
    ops.push(set('items', id, { sku: r.sku, name: r.name, category: (r.category || 'GENERAL').toUpperCase(), mrp: r2(r.mrp), reorder: 0, onHand: q, ...created() }));
    lines.push({ itemId: id, qty: q, cost: r2(r.cost || 0) }); value += q * num(r.cost); added++;
  }
  if (lines.length) ops.push(set('openings', 'o' + uid(), { kind: 'stock', date: today(), memo: 'Opening stock import', lines, ...created() }));
  await store.db.commit(ops); return { added, updated, value: r2(value) };
}
export async function adjustStock({ itemId, counted, reason, date }) {
  derive(true); const it = byId('items', itemId); if (!it) throw Error('Choose the item.'); date = date || today(); checkDate(date);
  const diff = num(counted) - num(it.onHand); if (!diff) throw Error('Counted quantity is the same as stock.');
  const uc = diff < 0 ? issueCosts([{ itemId, qty: -diff }])[0] : num(it.cost);
  const no = await number('ADJ'), ops = [set('adjustments', 'd' + uid(), { no, date, itemId, name: it.name, diff, value: r2(diff * uc), reason: reason || 'Stock adjustment', ...created() })];
  stockFor(ops, { [itemId]: diff }); await store.db.commit(ops);
}

/* ============ barcode labels: one shared print queue for the office ============ */
export const LABEL_DEFAULTS = { preset: 'grid5', w: 38, h: 21, cols: 5, rows: 13, hgap: 2, vgap: 0, top: 10, left: 5, offX: 0, offY: 0, barH: 8, nameSize: 6.8, codeSize: 7, priceSize: 8, showShop: false, shopName: 'GRID FURNITURE', showName: true, wrapName: true, showCode: true, showPrice: true, pricePrefix: 'MRP: ₹', priceMode: 'exact', start: 0 };
export const LABEL_PRESETS = { grid5: { name: 'GRID 5 × 13', desc: '38 × 21 mm · 65 per sheet', v: { w: 38, h: 21, cols: 5, rows: 13, hgap: 2, vgap: 0, top: 10, left: 5 } }, grid4: { name: 'GRID 4 × 12', desc: '38 × 21 mm · 48 per sheet', v: { w: 38, h: 21, cols: 4, rows: 12, hgap: 2, vgap: 0, top: 10, left: 5 } }, a65: { name: 'Standard A4 65-up', desc: '38.1 × 21.2 mm', v: { w: 38.1, h: 21.2, cols: 5, rows: 13, hgap: 2.5, vgap: 0, top: 10.7, left: 4.7 } }, a40: { name: 'Standard A4 40-up', desc: '48.5 × 25.4 mm', v: { w: 48.5, h: 25.4, cols: 4, rows: 10, hgap: 0, vgap: 0, top: 21.5, left: 8 } } };
export const labelSettings = () => ({ ...LABEL_DEFAULTS, ...(byId('settings', 'labels') || {}) });
export async function saveLabelSettings(v) { const { id, ...rest } = v; await store.db.commit([set('settings', 'labels', { ...rest, ...stamp() })]); }
export const labelQueue = () => (byId('labelQueue', 'main') || {}).items || [];
export async function setLabelQueue(items) { await store.db.commit([set('labelQueue', 'main', { items: items.map(e => ({ itemId: e.itemId || '', sku: String(e.sku), name: e.name, mrp: r2(e.mrp), qty: Math.max(1, Math.min(2000, Math.round(num(e.qty) || 1))) })), ...stamp() })]); }
export async function addLabels(entries) {
  const q = labelQueue().map(e => ({ ...e }));
  for (const e of entries) { const qty = Math.round(num(e.qty)); if (!(qty > 0)) continue; const ex = q.find(x => x.itemId && x.itemId === e.itemId); if (ex) ex.qty += qty; else q.push({ itemId: e.itemId || '', sku: e.sku, name: e.name, mrp: e.mrp, qty }); }
  await setLabelQueue(q); return q.length;
}

/* ============ monthly stock count: each counter writes only their own sheet ============ */
export async function startCount({ name, categories, blind }) {
  name = String(name || '').trim(); if (!name) throw Error('Give the count a name, e.g. October 2026.');
  const id = 'c' + uid(); await store.db.commit([set('counts', id, { name, categories: categories || [], blind: !!blind, status: 'open', date: today(), startedAt: Date.now(), ...created() })]); return id;
}
export async function setCountStatus(c, status) { await store.db.commit([upd('counts', c.id, { status, ...(status === 'closed' ? { closedAt: Date.now() } : {}), ...stamp() })]); }
export const mySheet = cid => ((byId('countSheets', me()?.id) || {}).sessions || {})[cid] || { lines: {}, unknown: {}, log: [] };
export async function saveMySheet(cid, sheet) {
  const id = me().id, doc = byId('countSheets', id), c = byId('counts', cid);
  if (!c || c.status !== 'open') throw Error('This count is closed — ask the manager to reopen it.');
  const sessions = { ...((doc || {}).sessions || {}), [cid]: { lines: sheet.lines, unknown: sheet.unknown || {}, log: (sheet.log || []).slice(-40), at: Date.now() } };
  await store.db.commit([doc ? upd('countSheets', id, { sessions }) : set('countSheets', id, { sessions })]);
}
// all counters' sheets for one count, added together
export function countTotals(cid) {
  const tot = {}, by = {}, unknown = {}, counters = [];
  all('countSheets').forEach(d => { const s = (d.sessions || {})[cid]; if (!s) return; let any = false;
    Object.entries(s.lines || {}).forEach(([k, q]) => { q = num(q); if (!q) return; any = true; tot[k] = (tot[k] || 0) + q; (by[k] || (by[k] = {}))[d.id] = q; });
    Object.entries(s.unknown || {}).forEach(([k, q]) => { q = num(q); if (!q) return; any = true; (unknown[k] || (unknown[k] = {}))[d.id] = q; });
    if (any) counters.push({ id: d.id, at: s.at, items: Object.values(s.lines || {}).filter(q => num(q)).length }); });
  return { tot, by, unknown, counters };
}
export function countRows(c, { uncountedZero = false } = {}) {
  derive(true); const { tot } = countTotals(c.id), cats = c.categories || [];
  return all('items').filter(i => !cats.length || cats.includes(i.category)).map(i => {
    const counted = tot[i.id], has = counted != null, sys = num(i.onHand);
    return { item: i, sys, counted: has ? counted : null, diff: has ? r2(counted - sys) : uncountedZero ? -sys : null, cost: num(i.cost) };
  });
}
export async function postCount(c, { uncountedZero = false, date } = {}) {
  date = date || today(); checkDate(date);
  const rows = countRows(c, { uncountedZero }).filter(r => r.diff);
  if (!rows.length) throw Error('Nothing to adjust — counted stock matches the system.');
  const ic = issueCosts(rows.map(r => ({ itemId: r.item.id, qty: r.diff < 0 ? -r.diff : 0 })));
  const lines = rows.map((r, k) => ({ itemId: r.item.id, name: r.item.name, sku: r.item.sku, diff: r.diff, value: r2(r.diff * (r.diff < 0 ? ic[k] : r.cost)) }));
  const no = await number('ADJ'), value = r2(lines.reduce((x, l) => x + l.value, 0));
  const ops = [set('adjustments', 'd' + uid(), { no, date, kind: 'count', countId: c.id, name: 'Stock count ' + c.name, itemId: '', diff: 0, lines, value, reason: 'Stock count', ...created() })];
  stockFor(ops, Object.fromEntries(lines.map(l => [l.itemId, l.diff])));
  ops.push(upd('counts', c.id, { status: 'posted', postedAt: Date.now(), adjNo: no, adjValue: value, adjLines: lines.length, ...stamp() }));
  await store.db.commit(ops); return { no, value, count: lines.length };
}

/* ============ cash closing ============ */
export async function cashPosition(accountId, date) {
  derive(true); const acc = byId('accounts', accountId); if (!acc) return null;
  const J = store.data.journals_, net = j => j.lines.filter(l => l.acc === accountId).reduce((x, l) => x + l.dr - l.cr, 0);
  const closing = r2(J.filter(j => j.date <= date).reduce((s, j) => s + net(j), 0));
  const day = J.filter(j => j.date === date && j.accs.includes(accountId));
  const inflow = r2(day.reduce((s, j) => s + j.lines.filter(l => l.acc === accountId).reduce((x, l) => x + l.dr, 0), 0)), outflow = r2(day.reduce((s, j) => s + j.lines.filter(l => l.acc === accountId).reduce((x, l) => x + l.cr, 0), 0));
  return { opening: r2(closing - inflow + outflow), inflow, outflow, expected: closing, rows: day.map(j => ({ ...j, amt: r2(net(j)) })) };
}
// a closing that is in force (reopened closings are kept for the record but don't count)
export const activeClosing = (date, accountId) => { const c = byId('cashClosings', date + '_' + accountId); return c && c.status !== 'reopened' ? c : null; };
// differences up to this amount go to Cash Short / Over automatically; bigger ones wait for the owner
export const cashDiffLimit = () => { const v = num(setting('cashDiffLimit', 500), 500); return v >= 0 ? v : 500; };
export async function closeCash({ date, accountId, counted, note, denominations }) {
  const pos = await cashPosition(accountId, date); if (!pos) throw Error('Choose the cash account.');
  if (activeClosing(date, accountId)) throw Error('This day is already closed for this account.');
  counted = r2(counted); const diff = r2(counted - pos.expected), old = byId('cashClosings', date + '_' + accountId);
  const history = old ? [...(old.history || []), (({ history: _h, ...rest }) => rest)(old)] : [];
  const ops = [set('cashClosings', date + '_' + accountId, { date, accountId, accountName: accName(accountId), opening: pos.opening, inflow: pos.inflow, outflow: pos.outflow, expected: pos.expected, counted, diff, diffPending: Math.abs(diff) > cashDiffLimit(), note: note || '', denominations: denominations || {}, closedBy: me().id, status: 'closed', ...(history.length ? { history } : {}), ...created() })];
  if (date > lockedUpTo() && accountId === ACC.cash) ops.push(set('settings', 'lock', { closedUpTo: date, by: me().id, at: Date.now() }));
  await store.db.commit(ops);
}
// reopen a closed day (and every later closed day of the same account); entries can be changed again and the day closed afresh
export async function reopenCash(date, accountId, reason) {
  if (!String(reason || '').trim()) throw Error('Write why the day is being reopened.');
  const list = all('cashClosings').filter(c => c.accountId === accountId && c.date >= date && c.status !== 'reopened').sort((a, b) => a.date.localeCompare(b.date));
  if (!list.length) throw Error('That day is not closed.');
  const ops = list.map(c => upd('cashClosings', c.date + '_' + c.accountId, { status: 'reopened', reopenedBy: me().id, reopenedAt: Date.now(), reopenReason: String(reason).trim() }));
  if (accountId === ACC.cash && lockedUpTo() >= date) {
    const prev = all('cashClosings').filter(c => c.accountId === ACC.cash && c.date < date && c.status !== 'reopened').map(c => c.date).sort().pop() || '';
    ops.push(set('settings', 'lock', { closedUpTo: prev, by: me().id, at: Date.now(), reopened: date }));
  }
  await store.db.commit(ops); return list.length;
}
// post a held difference to Cash Short / Over (owner decision)
export async function postCashDiff(date, accountId) {
  const c = activeClosing(date, accountId); if (!c || !c.diffPending) return;
  await store.db.commit([upd('cashClosings', date + '_' + accountId, { diffPending: false, diffPostedBy: me().id, diffPostedAt: Date.now() })]);
}

/* ============ cash book ============ */
// Opening, money in, money out and closing for the chosen cash / bank accounts, day by day.
// Transfers between two chosen accounts cancel out, so "all accounts" shows only real money in and out.
export function moneyFlow(accIds, from, to) {
  derive(true); const set = new Set(accIds), J = store.data.journals_;
  const delta = j => r2(j.lines.filter(l => set.has(l.acc)).reduce((x, l) => x + l.dr - l.cr, 0));
  const opening = r2(J.filter(j => j.date < from).reduce((s, j) => s + delta(j), 0));
  const rows = J.filter(j => j.date >= from && j.date <= to && j.accs.some(a => set.has(a))).map(j => ({ ...j, amt: delta(j) })).filter(j => j.amt);
  const byDay = {}; rows.forEach(j => { const d = byDay[j.date] || (byDay[j.date] = { inflow: 0, outflow: 0 }); if (j.amt > 0) d.inflow = r2(d.inflow + j.amt); else d.outflow = r2(d.outflow - j.amt); });
  const days = []; let run = opening;
  for (let d = from, n = 0; d <= to && n < 400; d = addDays(d, 1), n++) { const x = byDay[d] || { inflow: 0, outflow: 0 }; const o = run; run = r2(run + x.inflow - x.outflow); days.push({ date: d, opening: o, inflow: x.inflow, outflow: x.outflow, closing: run }); }
  return { opening, inflow: r2(rows.filter(j => j.amt > 0).reduce((s, j) => s + j.amt, 0)), outflow: r2(rows.filter(j => j.amt < 0).reduce((s, j) => s - j.amt, 0)), closing: run, days, rows };
}

/* ============ reports ============ */
export async function journalsBetween(from, to) { derive(true); return store.data.journals_.filter(j => j.date >= from && j.date <= to); }
// customer / supplier balances on a date (customer: + owes us; supplier: + we owe them)
export function partyBalancesAsOf(date) {
  derive(true); const c = {}, sp = {};
  store.data.journals_.filter(j => j.date <= date).forEach(j => j.lines.forEach(l => { if (l.c) c[l.c] = r2((c[l.c] || 0) + l.dr - l.cr); if (l.s) sp[l.s] = r2((sp[l.s] || 0) + l.cr - l.dr); }));
  return { c, s: sp };
}
// every ledger line for the balance sheet and trial balance, with receivables / payables split into
// what customers owe vs advances they paid us, and what we owe vendors vs advances we paid them
export function statementItems(date) {
  derive(true); const b = {}; all('accounts').forEach(a => b[a.id] = 0);
  store.data.journals_.filter(j => j.date <= date).forEach(j => j.lines.forEach(l => { b[l.acc] = r2((b[l.acc] || 0) + l.dr - l.cr); }));
  const { c, s: sp } = partyBalancesAsOf(date), sum = (o, f) => r2(Object.values(o).filter(f).reduce((x, v) => x + v, 0));
  const arPos = sum(c, v => v > 0), custAdv = -sum(c, v => v < 0), apPos = sum(sp, v => v > 0), vendAdv = -sum(sp, v => v < 0);
  const grp = a => a.type === 'asset' ? ({ cash: 'Cash & bank', bank: 'Cash & bank', inventory: 'Inventory', fixed: 'Fixed assets', staffadv: 'Staff advances' }[a.group] || 'Other current assets')
    : a.type === 'liability' ? ({ loan: 'Loans', salpay: 'Salaries payable', eosb: 'End-of-service provision', tax: 'GST payable' }[a.group] || 'Other liabilities') : a.type === 'equity' ? (a.group === 'obe' ? 'Opening balance equity' : "Owner's capital & drawings") : accClass(a);
  const out = [];
  all('accounts').sort((x, y) => x.code.localeCompare(y.code)).forEach(a => {
    const bal = r2(b[a.id] || 0);
    if (a.group === 'ar') { const resid = r2(bal - (arPos - custAdv));
      out.push({ key: a.id, code: a.code, name: 'Accounts Receivable (Customers)', type: 'asset', grp: 'Accounts receivable', bal: r2(arPos + resid), go: { t: 'party', kind: 'customer', side: 'dr' } });
      out.push({ key: a.id + '_adv', code: '', name: 'Customer Advances (Unearned Revenue)', type: 'liability', grp: 'Customer advances (unearned revenue)', bal: -custAdv, go: { t: 'party', kind: 'customer', side: 'cr' } }); return; }
    if (a.group === 'ap') { const resid = r2(bal - (vendAdv - apPos));
      out.push({ key: a.id, code: a.code, name: 'Accounts Payable (Vendors)', type: 'liability', grp: 'Accounts payable', bal: r2(-apPos + resid), go: { t: 'party', kind: 'supplier', side: 'cr' } });
      out.push({ key: a.id + '_adv', code: '', name: 'Advances to Vendors', type: 'asset', grp: 'Advances to vendors', bal: vendAdv, go: { t: 'party', kind: 'supplier', side: 'dr' } }); return; }
    out.push({ key: a.id, code: a.code, name: a.name, type: a.type, grp: grp(a), bal, go: ['staffadv', 'salpay', 'eosb'].includes(a.group) ? { t: 'emp', acc: a.id } : { t: 'acc', id: a.id } });
  });
  return out;
}
export async function balancesAsOf(date) { derive(true); const b = {}; all('accounts').forEach(a => b[a.id] = 0); store.data.journals_.filter(j => j.date <= date).forEach(j => j.lines.forEach(l => { b[l.acc] = r2((b[l.acc] || 0) + l.dr - l.cr); })); return b; }
export function staffPerformance(from, to) {
  derive(); const rows = {};
  all('staffStats').filter(s => s.date >= from && s.date <= to).forEach(s => {
    const r = rows[s.uid] || (rows[s.uid] = { uid: s.uid, name: nm(s.uid), enquiries: 0, quoteValue: 0, converted: 0, soCount: 0, soValue: 0, invValue: 0, deliveries: 0, lost: 0 });
    ['enquiries', 'quoteValue', 'converted', 'soCount', 'soValue', 'invValue', 'deliveries', 'lost'].forEach(k => r[k] = r2(r[k] + num(s[k])));
  });
  const fu = all('followups').filter(f => f.status === 'open');
  all('users').filter(u => u.role === 'sales' && !rows[u.id]).forEach(u => rows[u.id] = { uid: u.id, name: u.name, enquiries: 0, quoteValue: 0, converted: 0, soCount: 0, soValue: 0, invValue: 0, deliveries: 0, lost: 0 });
  Object.values(rows).forEach(r => { r.openFollowups = fu.filter(f => f.assignedTo === r.uid).length; r.overdue = fu.filter(f => f.assignedTo === r.uid && f.due < today()).length; r.conv = r.enquiries ? r.converted / r.enquiries * 100 : 0; });
  return Object.values(rows).sort((a, b) => b.soValue - a.soValue);
}
export function statsSeries(period) {
  derive(); const S = store.data.stats || {}, t = today(), out = [];
  const add = (key, label, from, to) => { let so = 0, inv = 0, del = 0, rc = 0; for (let d = from; d <= to; d = addDays(d, 1)) { const s = S[d]; if (s) { so += num(s.soValue); inv += num(s.invValue); del += num(s.deliveries); rc += num(s.receipts); } } out.push({ key, label, so: r2(so), inv: r2(inv), del, rc: r2(rc), from, to }); };
  const lab = d => new Date(d + 'T00:00').toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
  if (period === 'daily') for (let i = 13; i >= 0; i--) { const d = addDays(t, -i); add(d, lab(d), d, d); }
  if (period === 'weekly') { let w = addDays(addDays(t, -((new Date(t + 'T00:00').getDay() + 6) % 7)), -77); for (let i = 0; i < 12; i++) { add(w, lab(w), w, addDays(w, 6)); w = addDays(w, 7); } }
  if (period === 'monthly') { const d = new Date(t + 'T00:00'); d.setDate(1); d.setMonth(d.getMonth() - 11); for (let i = 0; i < 12; i++) { const f = today(d); const e = new Date(d); e.setMonth(e.getMonth() + 1); e.setDate(0); add(f, d.toLocaleDateString('en-IN', { month: 'short', year: '2-digit' }), f, today(e)); d.setMonth(d.getMonth() + 1); } }
  return out;
}
export const BACKUP_COLLECTIONS = [...SHARED, ...FIN];
export async function backupAll() { const out = { app: 'GRID Shop Manager (Claude)', at: new Date().toISOString() }; for (const c of BACKUP_COLLECTIONS) out[c] = all(c).map(d => ({ ...d })); return out; }
export const recordCount = () => BACKUP_COLLECTIONS.reduce((s, c) => s + all(c).length, 0);

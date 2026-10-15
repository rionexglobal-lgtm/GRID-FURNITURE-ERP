// GRID Shop Manager — Claude assistant: questions about the shop's live data, and message drafts
import { $, esc, num, r2, today, addDays, weekStart, fmtDate, store, all, byId, setting } from './core.js';
import * as L from './logic.js';
import { money0, toast, openModal, field, select, waLink } from './ui.js';

const role = () => store.me?.role, office = () => L.can.office(role()), mgmt = () => L.can.manage(role()), myId = () => store.me?.id;
const sum = (a, f) => r2(a.reduce((s, x) => s + num(f(x)), 0));
const inRange = (d, f, t) => d >= f && d <= t;
const clampDate = (v, d) => /^\d{4}-\d{2}-\d{2}$/.test(String(v || '')) ? String(v) : d;
const mine = list => role() === 'sales' ? list.filter(x => (x.salesman || x.assignedTo) === myId()) : list;

/* ---------- tools Claude may call (read-only) ---------- */
function periodTotals(from, to, who) {
  const q = all('quotations').filter(x => inRange(x.date, from, to) && (!who || x.salesman === who));
  const o = all('salesOrders').filter(x => x.status !== 'cancelled' && inRange(x.date, from, to) && (!who || x.salesman === who));
  const i = all('invoices').filter(x => x.status !== 'void' && inRange(x.date, from, to) && (!who || x.salesman === who));
  const r = { walkins_enquiries: q.length, quoted_value: sum(q, x => x.total), converted: o.filter(x => x.quotationId).length, lost: q.filter(x => x.status === 'lost').length, sales_orders: o.length, sales_order_value: sum(o, x => x.total), invoices: i.length, invoiced_value: sum(i, x => x.total) };
  if (office() && !who) { r.collected = sum(all('receipts').filter(x => inRange(x.date, from, to)), x => x.amount); r.expenses = sum(all('expenses').filter(x => inRange(x.date, from, to)), x => x.amount); r.gross_profit = r2(r.invoiced_value - sum(i, x => x.costTotal)); r.purchases = sum(all('purchases').filter(x => inRange(x.date, from, to)), x => x.total); }
  return r;
}
function tools() {
  const t = today();
  const list = [
    { name: 'shop_overview', description: "Today's and this month's key numbers for the shop: walk-ins, sales orders, invoices, deliveries, follow-ups" + (office() ? ', cash and bank balances, money owed' : '') + '. Use first for general questions.',
      execute: () => { L.derive(); const m0 = t.slice(0, 8) + '01', so = all('salesOrders');
        const r = { today: t, shop: setting('name', ''), currency: setting('currency', '₹'), today_numbers: periodTotals(t, t, role() === 'sales' ? myId() : null), month_to_date: periodTotals(m0, t, role() === 'sales' ? myId() : null),
          deliveries_due_today: mine(so).filter(o => o.status === 'scheduled' && o.deliveryDate === t).length, deliveries_late: mine(so).filter(o => o.status === 'scheduled' && o.deliveryDate && o.deliveryDate < t).length,
          orders_not_scheduled: mine(so).filter(o => o.status === 'open').length, waiting_for_billing: all('quotations').filter(q => q.status === 'confirmed').length,
          follow_ups_overdue: mine(all('followups')).filter(f => f.status === 'open' && f.due < t).length, follow_ups_today: mine(all('followups')).filter(f => f.status === 'open' && f.due === t).length };
        if (office()) { r.cash_and_bank = L.moneyAccounts().map(a => ({ account: a.name, balance: a.bal })); r.customers_owe_us = sum(all('customers').filter(c => c.balance > 0), c => c.balance); r.we_owe_suppliers = sum(all('suppliers').filter(s => s.balance > 0), s => s.balance); r.cash_closed_up_to = L.lockedUpTo() || 'never'; }
        return r; } },
    { name: 'sales_report', description: 'Sales numbers for a date range (YYYY-MM-DD), optionally split by day, week, month or salesman. Returns walk-ins, quoted value, conversions, sales orders, invoices' + (office() ? ', collections, expenses and gross profit.' : '.'),
      inputSchema: { type: 'object', properties: { from: { type: 'string' }, to: { type: 'string' }, split: { type: 'string', enum: ['none', 'day', 'week', 'month', 'salesman'] } }, required: ['from', 'to'] },
      execute: ({ from, to, split }) => { L.derive(); const f = clampDate(from, t.slice(0, 8) + '01'), e = clampDate(to, t), who = role() === 'sales' ? myId() : null;
        const out = { from: f, to: e, total: periodTotals(f, e, who) };
        if (split === 'salesman' && !who) out.by_salesman = L.staffPerformance(f, e).map(p => ({ salesman: p.name, walkins: p.enquiries, converted: p.converted, conversion_pct: Math.round(p.conv), sales_orders: p.soValue, invoiced: p.invValue }));
        if (['day', 'week', 'month'].includes(split)) { const rows = []; let d = f, n = 0; while (d <= e && n++ < 62) { let end = split === 'day' ? d : split === 'week' ? addDays(weekStart(d), 6) : (x => { x.setMonth(x.getMonth() + 1); x.setDate(0); return today(x); })(new Date(d + 'T00:00')); if (end > e) end = e; rows.push({ from: d, to: end, ...periodTotals(d, end, who) }); d = addDays(end, 1); } out.rows = rows; }
        return out; } },
    { name: 'find_customers', description: 'Look up customers by name, mobile number or area. Returns their details, salesman, open quotations and orders' + (office() ? ' and balance owed.' : '.'),
      inputSchema: { type: 'object', properties: { query: { type: 'string' } }, required: ['query'] },
      execute: ({ query }) => { L.derive(); const w = String(query || '').toLowerCase().split(/\s+/).filter(Boolean), digits = String(query || '').replace(/\D/g, '');
        const hits = all('customers').filter(c => w.every(x => (c.name + ' ' + c.mobile + ' ' + (c.area || '')).toLowerCase().includes(x)) || (digits.length >= 4 && c.mobile.replace(/\D/g, '').includes(digits))).slice(0, 10);
        return hits.map(c => ({ name: c.name, mobile: c.mobile, area: c.area, salesman: L.nm(c.salesman), since: c.createdAt ? new Date(c.createdAt).toISOString().slice(0, 10) : '', balance_owed: office() ? c.balance : undefined,
          open_quotations: all('quotations').filter(q => q.customerId === c.id && ['open', 'followup', 'confirmed'].includes(q.status)).map(q => ({ no: q.no, date: q.date, status: q.status, total: q.total, items: q.lines.map(l => l.name + ' x' + l.qty).join(', '), notes: q.notes })),
          orders: all('salesOrders').filter(o => o.customerId === c.id).slice(-5).map(o => ({ no: o.no, date: o.date, status: o.status, total: o.total, delivery: o.deliveryDate })) })); } },
    { name: 'follow_ups', description: 'Open follow-ups and reminders. status: overdue, today or upcoming. Returns who to contact, why, when, and the staff member responsible.',
      inputSchema: { type: 'object', properties: { status: { type: 'string', enum: ['overdue', 'today', 'upcoming'] } } },
      execute: ({ status }) => { const s = status || 'overdue', f = mine(all('followups')).filter(x => x.status === 'open' && (s === 'overdue' ? x.due < t : s === 'today' ? x.due === t : x.due > t)).sort((a, b) => a.due.localeCompare(b.due)).slice(0, 40);
        return f.map(x => ({ party: x.partyName, type: x.partyType, mobile: x.mobile, due: x.due, note: x.note, assigned_to: L.nm(x.assignedTo) })); } },
    { name: 'stock', description: 'Stock for items matching a name, barcode or category: in stock, committed to open orders, available, selling price (MRP). Use query "oversold" for items sold beyond stock.',
      inputSchema: { type: 'object', properties: { query: { type: 'string' } }, required: ['query'] },
      execute: ({ query }) => { L.derive(); const c = L.committedMap(), q = String(query || '').toLowerCase(), w = q.split(/\s+/).filter(Boolean);
        const items = all('items').filter(i => q === 'oversold' ? num(i.onHand) - (c[i.id] || 0) < 0 : w.every(x => (i.name + ' ' + i.sku + ' ' + i.category).toLowerCase().includes(x))).slice(0, 25);
        return items.map(i => ({ item: i.name, sku: i.sku, category: i.category, in_stock: num(i.onHand), committed: c[i.id] || 0, available: num(i.onHand) - (c[i.id] || 0), mrp: i.mrp })); } },
    { name: 'orders', description: 'Sales orders waiting for delivery. which: late, today, next7days, not_scheduled. Returns customer, items, delivery date, amount still to collect.',
      inputSchema: { type: 'object', properties: { which: { type: 'string', enum: ['late', 'today', 'next7days', 'not_scheduled'] } } },
      execute: ({ which }) => { L.derive(); const w = which || 'next7days', o = mine(all('salesOrders')).filter(x => ['open', 'scheduled'].includes(x.status)).filter(x => w === 'late' ? x.deliveryDate && x.deliveryDate < t : w === 'today' ? x.deliveryDate === t : w === 'not_scheduled' ? !x.deliveryDate : x.deliveryDate >= t && x.deliveryDate <= addDays(t, 6)).slice(0, 40);
        return o.map(x => ({ no: x.no, customer: x.customerName, mobile: x.mobile, delivery: x.deliveryDate, slot: x.deliverySlot, items: x.lines.map(l => l.name + ' x' + l.qty).join(', '), total: x.total, to_collect: r2(x.total - num(x.advance)), salesman: L.nm(x.salesman) })); } }
  ];
  if (office()) list.push(
    { name: 'money_owed', description: 'Customers who owe the shop money and suppliers the shop owes, largest first.',
      inputSchema: { type: 'object', properties: { who: { type: 'string', enum: ['customers', 'suppliers'] } } },
      execute: ({ who }) => { L.derive(); return all(who === 'suppliers' ? 'suppliers' : 'customers').filter(p => num(p.balance) > 0.009).sort((a, b) => b.balance - a.balance).slice(0, 25).map(p => ({ name: p.name, mobile: p.mobile, owed: p.balance })); } },
    { name: 'expenses_report', description: 'Expenses for a date range (YYYY-MM-DD) grouped by type, with totals.',
      inputSchema: { type: 'object', properties: { from: { type: 'string' }, to: { type: 'string' } }, required: ['from', 'to'] },
      execute: ({ from, to }) => { const f = clampDate(from, t.slice(0, 8) + '01'), e = clampDate(to, t), by = {}; all('expenses').filter(x => inRange(x.date, f, e)).forEach(x => by[x.expenseName] = r2((by[x.expenseName] || 0) + x.amount)); return { from: f, to: e, by_type: by, total: sum(Object.values(by), x => x) }; } });
  return list;
}

/* ---------- assistant screen ---------- */
let turns = [], busy = false, ctl = null;
const SUGGEST = () => role() === 'sales'
  ? ['Who should I call today?', 'How am I doing this month?', 'Is the 3 seater sofa in stock?', 'Which of my customers have deliveries this week?']
  : ['How are sales this week compared with last week?', 'Which salesman converts best this month, and who has overdue follow-ups?', 'Which customers owe us the most?', 'Which items are sold beyond our stock?'];
function intro() {
  return `You are the assistant inside GRID Shop Manager, the sales, CRM and accounts system of the furniture shop "${setting('name', 'the shop')}". Today is ${today()}. Money is in ${setting('currency', '₹')} (Indian number format, e.g. 1,25,000). You are helping ${store.me.name || 'a staff member'}, whose role is ${L.ROLES[role()]}.
Rules: Get every figure from the tools — never guess or invent numbers, names or dates. If a tool returns nothing, say so. Answer briefly and practically, like a sharp shop manager: lead with the answer, then at most a few bullet points. Suggest a concrete next step when useful. Reply in the language the question is written in.`;
}
export const assistant = {
  title: 'Ask Claude', icon: '✨', roles: ['admin', 'manager', 'billing', 'sales'],
  head: () => `<button class="btn" data-a="clear">New chat</button>`,
  body() {
    return `<div class="panel ai" style="max-width:860px">
      <div id="aiLog" class="ai-log">${turns.length ? '' : `<div class="ai-hello"><b>Ask anything about the shop.</b><span class="hint">Claude reads the live data you're allowed to see: sales, staff, customers, follow-ups, stock and deliveries${office() ? ', money and accounts' : ''}. It can't change anything.</span><div class="chips" style="flex-wrap:wrap;margin-top:12px">${SUGGEST().map(s => `<button class="chip" data-s="${esc(s)}">${esc(s)}</button>`).join('')}</div></div>`}</div>
      <form id="aiForm" class="ai-form"><textarea id="aiQ" rows="2" placeholder="e.g. How many walk-ins did Anil convert this month?"></textarea><div style="display:flex;flex-direction:column;gap:6px"><button class="btn btn-accent" id="aiSend" type="submit">Ask</button><button class="btn btn-sm" id="aiStop" type="button" hidden>Stop</button></div></form>
      <p class="hint" style="margin-top:8px">Uses your own Claude usage. The first question asks your permission.</p></div>`;
  },
  after() { drawLog(); },
  bind(root) {
    root.addEventListener('click', e => { const s = e.target.closest('[data-s]'); if (s) ask(s.dataset.s); if (e.target.closest('[data-a=clear]')) { ctl?.abort(); turns = []; window.__rerender(); } if (e.target.id === 'aiStop') ctl?.abort(); });
    root.addEventListener('submit', e => { if (e.target.id === 'aiForm') { e.preventDefault(); const q = $('aiQ').value.trim(); if (q) ask(q); } });
    root.addEventListener('keydown', e => { if (e.target.id === 'aiQ' && e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); $('aiForm').requestSubmit(); } });
  },
  static: true
};
function drawLog() {
  const log = $('aiLog'); if (!log || !turns.length) return;
  log.innerHTML = turns.map(t => `<div class="ai-msg ${t.role === 'user' ? 'me' : 'bot'}">${t.role === 'user' ? esc(t.content) : fmt(t.content)}${t.status ? `<div class="hint ai-status">${esc(t.status)}</div>` : ''}</div>`).join('');
  log.scrollTop = log.scrollHeight;
  if ($('aiSend')) { $('aiSend').disabled = busy; $('aiStop').hidden = !busy; }
}
function fmt(t) { // light formatting for Claude's answer: bold, bullets, line breaks
  return esc(t).replace(/\*\*(.+?)\*\*/g, '<b>$1</b>').replace(/^#{1,3} (.+)$/gm, '<b>$1</b>').replace(/^\s*[-•*] (.+)$/gm, '<span class="ai-li">$1</span>').replace(/\n/g, '<br>');
}
async function ask(q) {
  if (busy) return; const sample = store.sample; if (!sample) return toast('Claude is not available in this view.', 'warn');
  busy = true; if ($('aiQ')) $('aiQ').value = '';
  turns.push({ role: 'user', content: q }); const bot = { role: 'assistant', content: '', status: 'Thinking…' }; turns.push(bot); drawLog();
  ctl = new AbortController();
  const label = { shop_overview: 'Checking today’s numbers…', sales_report: 'Reading the sales report…', find_customers: 'Looking up customers…', follow_ups: 'Checking follow-ups…', stock: 'Checking stock…', orders: 'Checking deliveries…', money_owed: 'Checking who owes what…', expenses_report: 'Reading expenses…' };
  const T = tools().map(t => { const o = { name: t.name, description: t.description, execute: (inp, ctx) => { bot.status = label[t.name] || 'Working…'; drawLog(); return t.execute(inp || {}, ctx); } }; if (t.inputSchema) o.inputSchema = t.inputSchema; return o; });
  const history = turns.slice(0, -1).filter(t => t.content).slice(-12).map(t => ({ role: t.role, content: t.content }));
  try {
    const caps = await sample.limits().catch(() => null);
    const opts = { signal: ctl.signal, cache: false, onText: ({ text }) => { bot.content = text; bot.status = ''; drawLog(); } };
    if (caps?.tools) { opts.tools = T.slice(0, caps.tools.maxCount || T.length); delete opts.cache; }
    else history[history.length - 1] = { role: 'user', content: 'Shop data now:\n' + JSON.stringify(Object.fromEntries(['shop_overview'].map(n => [n, T.find(t => t.name === n).execute({})]))).slice(0, 20000) + '\n\nQuestion: ' + q };
    const { text } = await sample([{ role: 'user', content: intro() }, ...history], opts);
    bot.content = text; bot.status = '';
  } catch (e) {
    bot.content = e.text || ''; bot.status = '';
    const msg = { cancelled: 'Stopped.', not_granted: 'Claude was not allowed for this page. Reload the page to be asked again.', rate_limited: 'Too many questions at once or your Claude usage limit is reached — try again a little later.', session_expired: 'Please sign in to Claude again.', refused: 'Claude could not answer that. Try asking differently.', sampling_disabled: 'Claude is not available for your account.' }[e.code] || 'Something went wrong — try again.';
    if (!bot.content) bot.content = msg; else bot.status = msg;
    if (['not_granted', 'sampling_disabled'].includes(e.code)) store.sample = null;
  }
  busy = false; drawLog();
}

/* ---------- WhatsApp draft for a customer follow-up ---------- */
export async function draft(q, f) {
  const sample = store.sample; if (!sample) return toast('Claude is not available in this view.', 'warn');
  const c = byId('customers', q.customerId || q.partyId) || {}, name = q.customerName || q.partyName || c.name || 'the customer', mobile = q.mobile || c.mobile || '';
  const items = (q.lines || []).map(l => `${l.name} (×${l.qty}, ${money0(l.rate)})`).join('; ');
  const days = q.date ? Math.round((new Date(today()) - new Date(q.date)) / 864e5) : null;
  let ctl2 = null;
  const run = async () => {
    ctl2?.abort(); ctl2 = new AbortController(); const box = $('drText'); if (!box) return;
    box.value = 'Writing…'; box.disabled = true;
    const prompt = `Write a short WhatsApp follow-up message from a furniture shop salesman to a customer.
Shop: ${setting('name', 'our shop')}. Salesman: ${store.me.name || 'the salesman'}. Customer: ${name}.
${items ? 'They looked at: ' + items + '.' : ''} ${q.notes ? 'Notes from the visit: ' + q.notes + '.' : ''} ${f?.note ? 'Reason for this follow-up: ' + f.note + '.' : ''} ${days != null ? 'They visited ' + days + ' days ago.' : ''}
Tone: ${$('drTone').value}. Language: ${$('drLang').value}. At most 60 words, friendly, no pressure, no made-up offers or prices beyond what is given, end with a simple question or invitation to visit. Reply with only the message text.`;
    try { const { text } = await sample(prompt, { modelTier: 'quick', cache: false, signal: ctl2.signal, onText: ({ text }) => { if ($('drText')) $('drText').value = text; } }); if ($('drText')) { $('drText').value = text.trim(); upd(); } }
    catch (e) { if ($('drText') && e.code !== 'cancelled') $('drText').value = e.text || (e.code === 'not_granted' ? 'Claude was not allowed for this page.' : 'Could not write a draft — try again.'); }
    finally { if ($('drText')) $('drText').disabled = false; }
  };
  const upd = () => { const a = $('drWa'); if (a) a.href = waLink(mobile, $('drText').value); };
  openModal('Follow-up message for ' + name, `${field('Message', '<textarea id="drText" rows="6"></textarea>')}
    <div class="row2">${field('Tone', select('drTone', ['Warm and polite', 'Short and direct', 'Formal']))}${field('Language', select('drLang', ['English', 'Malayalam', 'Hindi', 'Tamil', 'Arabic', 'Manglish (Malayalam in English letters)']))}</div>
    <div style="display:flex;gap:8px;flex-wrap:wrap"><button class="btn" type="button" id="drAgain">↻ Write again</button>${mobile ? `<a class="btn btn-ok" id="drWa" target="_blank" rel="noopener" href="#">💬 Open in WhatsApp</a>` : ''}<button class="btn" type="button" id="drCopy">Copy</button></div>
    <p class="hint" style="margin-top:8px">${mobile ? 'Sends to ' + esc(mobile) + '. ' : ''}Check and edit before sending.</p>`, [], { onOpen: b => {
      $('drAgain').onclick = run; b.querySelectorAll('select').forEach(s => s.onchange = run); $('drText').addEventListener('input', upd);
      $('drCopy').onclick = async () => { try { await navigator.clipboard.writeText($('drText').value); toast('Copied.'); } catch (e) { $('drText').select(); toast('Press Ctrl+C to copy.', 'warn'); } };
      run();
    } });
}

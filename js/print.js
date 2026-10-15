// GRID Shop Manager — printable sales orders and invoices with a template the office can set up (design, paper, colour, logo, what shows)
import { $, esc, num, r2, today, fmtDate, store, all, byId, setting } from './core.js';
import * as L from './logic.js';
import { toast, fail, openModal, closeModal, download, pickFile, val } from './ui.js';

export const KINDS = { so: 'Sales order', inv: 'Invoice' };
export const LAYOUTS = { classic: 'Classic', modern: 'Modern', compact: 'Compact' };
export const PAPERS = { A4: 'A4', A5: 'A5', Letter: 'Letter', '80mm': '80 mm receipt' };
const PAPER_MM = { A4: [210, 297], A5: [148, 210], Letter: [215.9, 279.4], '80mm': [80, 0] };
export const SHOW = {
  logo: 'Logo', address: 'Shop address', phone: 'Phone & mobile', whatsapp: 'WhatsApp number', email: 'Email & website', tax: 'Tax / registration no.',
  custAddr: 'Customer address', delivery: 'Delivery details', salesman: 'Salesman', sku: 'Item code (SKU)', desc: 'Colour / material',
  spec: 'Customisation notes', disc: 'Discount column', words: 'Amount in words', payment: 'Advance / paid / balance', bank: 'Bank details', terms: 'Terms & conditions', sign: 'Signature lines'
};
const ALL_ON = Object.fromEntries(Object.keys(SHOW).map(k => [k, true]));
const DEF = {
  so: { layout: 'classic', paper: 'A4', color: '#15213b', title: 'SALES ORDER', show: { ...ALL_ON, bank: false },
    terms: 'Delivery dates are estimates; we will call to confirm before delivery.\nAdvance paid on customised items is not refundable.\nThe balance is payable on delivery.', footer: 'Thank you for choosing us!', sigLeft: 'Customer signature', sigRight: 'Authorised signatory' },
  inv: { layout: 'classic', paper: 'A4', color: '#15213b', title: 'INVOICE', show: { ...ALL_ON },
    terms: 'Goods once sold are exchanged only as per shop policy.\nPlease check items at the time of delivery.', footer: '', sigLeft: 'Received by (customer)', sigRight: 'Authorised signatory' }
};
// shop details live in Settings (settings/company) and are printed on every document
export const CO_FIELDS = [['name', 'Company / shop name'], ['address', 'Address'], ['phone', 'Phone (landline)'], ['mobile', 'Mobile number'], ['whatsapp', 'WhatsApp number'], ['email', 'Email'], ['website', 'Website'], ['taxLabel', 'Tax label (GSTIN / TRN / VAT no.)'], ['taxNo', 'GST / TRN number']];
export function company() {
  const c = byId('settings', 'company') || {}, p = byId('settings', 'print') || {}, o = {};
  for (const [k] of CO_FIELDS) o[k] = c[k] ?? p[k] ?? '';
  if (!o.taxLabel) o.taxLabel = /₹|rs|inr/i.test(setting('currency', '')) ? 'GSTIN' : 'TRN';
  return o;
}
export function companyForm(c = company(), pre = 'co') {
  const f = (k, l, extra = '') => `<div class="field"><label>${esc(l)}</label><input id="${pre}_${k}" value="${esc(c[k] || '')}" ${extra}></div>`;
  return `${f('name', 'Company / shop name')}
    <div class="field"><label>Address</label><textarea id="${pre}_address" rows="3">${esc(c.address || '')}</textarea></div>
    <div class="row2">${f('phone', 'Phone (landline)', 'type="tel" inputmode="tel"')}${f('mobile', 'Mobile number', 'type="tel" inputmode="tel"')}</div>
    <div class="row2">${f('whatsapp', 'WhatsApp number', 'type="tel" inputmode="tel" placeholder="Same as mobile if blank"')}${f('email', 'Email', 'type="email" inputmode="email"')}</div>
    ${f('website', 'Website', 'placeholder="www.example.com"')}
    <div class="row2">${f('taxLabel', 'Tax label', 'placeholder="GSTIN / TRN / VAT no."')}${f('taxNo', 'GST / TRN number')}</div>`;
}
export function readCompany(pre = 'co') {
  const o = {}; for (const [k] of CO_FIELDS) { const el = document.getElementById(pre + '_' + k); if (el) o[k] = el.value.trim(); }
  if ('name' in o && !o.name) throw Error('Enter the company name.');
  if (o.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(o.email)) throw Error('Check the email address.');
  return o;
}
export async function saveCompany(data) { await store.db.commit([{ t: 'update', coll: 'settings', id: 'company', data: { ...data, updatedAt: Date.now() } }]); }
export function companyDialog(back) {
  openModal('Company details', `<p class="hint" style="margin:0 0 10px">Printed on sales orders, invoices and other documents. Also editable in Settings.</p>${companyForm(company(), 'cd')}`,
    [{ label: 'Cancel', onClick: () => { if (back) setTimeout(back, 30); } }, { label: 'Save details', cls: 'btn-ink', onClick: async () => { await saveCompany(readCompany('cd')); toast('Company details saved.'); if (back) setTimeout(back, 30); } }]);
}
const SWATCHES = ['#15213b', '#e4572e', '#0e7c66', '#2f5aa8', '#6b3fb2', '#8a5a2b', '#222222'];

function curDefaults(sym) {
  const s = String(sym || '').toLowerCase();
  if (/₹|rs|inr/.test(s)) return ['Rupees', 'Paise', 'in'];
  if (/aed|د\.إ|dhs?\b|dirham/.test(s)) return ['Dirhams', 'Fils', 'intl'];
  if (/sar|ر\.س|riyal/.test(s)) return ['Riyals', 'Halalas', 'intl'];
  if (/€|eur/.test(s)) return ['Euros', 'Cents', 'intl'];
  if (/£|gbp/.test(s)) return ['Pounds', 'Pence', 'intl'];
  if (/\$|usd/.test(s)) return ['Dollars', 'Cents', 'intl'];
  return ['', 'Cents', 'intl'];
}
// the stored template merged over the defaults; G = shop-wide parts, T = one document kind
export function templates() {
  const p = byId('settings', 'print') || {}, cd = curDefaults(setting('currency', '₹'));
  const G = { logo: p.logo || '', bank: p.bank || '',
    numStyle: p.numStyle || cd[2], curName: p.curName ?? cd[0], subName: p.subName ?? cd[1] };
  const T = {}; for (const k of Object.keys(KINDS)) { const s = p[k] || {}; T[k] = { ...DEF[k], ...s, show: { ...DEF[k].show, ...(s.show || {}) } }; if (k === 'inv' && s.footer == null) T[k].footer = setting('invoiceNote', ''); }
  return { G, T };
}

/* ---------- numbers & words ---------- */
const amt = (n, G) => num(n).toLocaleString(G.numStyle === 'in' ? 'en-IN' : 'en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const ONES = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen'];
const TENS = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];
function upto999(n) { const h = Math.floor(n / 100), r = n % 100; const t = r < 20 ? ONES[r] : TENS[Math.floor(r / 10)] + (r % 10 ? '-' + ONES[r % 10] : ''); return [h ? ONES[h] + ' Hundred' : '', t].filter(Boolean).join(' '); }
function intWords(n, style) {
  if (!n) return 'Zero';
  const parts = [];
  if (style === 'in') {
    const cr = Math.floor(n / 1e7); n %= 1e7; const lk = Math.floor(n / 1e5); n %= 1e5; const th = Math.floor(n / 1000); n %= 1000;
    if (cr) parts.push(intWords(cr, style) + ' Crore'); if (lk) parts.push(upto999(lk) + ' Lakh'); if (th) parts.push(upto999(th) + ' Thousand'); if (n) parts.push(upto999(n));
  } else {
    [[1e9, 'Billion'], [1e6, 'Million'], [1e3, 'Thousand']].forEach(([v, w]) => { const q = Math.floor(n / v); if (q) { parts.push(upto999(q) + ' ' + w); n %= v; } });
    if (n) parts.push(upto999(n));
  }
  return parts.join(' ');
}
export function amountWords(v, G) {
  const neg = v < 0; v = Math.abs(r2(v)); const i = Math.floor(v), f = Math.round((v - i) * 100);
  return (neg ? 'Minus ' : '') + [G.curName, intWords(i, G.numStyle)].filter(Boolean).join(' ') + (f ? ' and ' + intWords(f, G.numStyle) + (G.subName ? ' ' + G.subName : '') : '') + ' Only';
}

/* ---------- the document ---------- */
const dLong = d => d ? fmtDate(d, { day: 'numeric', month: 'short', year: 'numeric' }) : '';
const nl = s => esc(s || '').replace(/\n/g, '<br>');
export const logoMM = T => { const v = num(T.logoSize); return v >= 6 ? Math.min(60, v) : T.paper === '80mm' ? 14 : T.paper === 'A5' ? 16 : 20; };
export function docCSS(T) {
  const [w] = PAPER_MM[T.paper] || PAPER_MM.A4, rcpt = T.paper === '80mm', pad = rcpt ? 4 : T.paper === 'A5' ? 9 : 13;
  const base = rcpt ? 8.6 : T.paper === 'A5' ? 8.8 : T.layout === 'compact' ? 9 : 9.8;
  return `*{box-sizing:border-box}html,body{margin:0;background:#fff}
.page{--c:${esc(T.color || '#15213b')};width:${w}mm;${rcpt ? '' : `min-height:${PAPER_MM[T.paper][1]}mm;`}padding:${pad}mm;background:#fff;color:#1b1b1b;font:${base}pt/1.42 Arial,Helvetica,sans-serif;position:relative;overflow:hidden;-webkit-print-color-adjust:exact;print-color-adjust:exact}
.page *{-webkit-print-color-adjust:exact;print-color-adjust:exact}
.hd{display:flex;justify-content:space-between;gap:6mm;align-items:flex-start}.co{display:flex;gap:4mm;align-items:flex-start;min-width:0}.logo{height:${logoMM(T)}mm;max-height:${logoMM(T)}mm;width:auto;max-width:${rcpt ? 70 : Math.min(Math.round(logoMM(T) * 3.2), T.paper === 'A5' ? 60 : 85)}mm;object-fit:contain;flex:none}.co>div{min-width:42mm}
.co h1{margin:0 0 1mm;font-size:1.75em;line-height:1.15;color:var(--c)}.co .ln{color:#444}.tt{text-align:right;flex:none}.tt h2{margin:0 0 1.5mm;font-size:1.6em;letter-spacing:.08em;color:var(--c)}
.meta{border-collapse:collapse;margin-left:auto}.meta td{padding:.3mm 0 .3mm 4mm;text-align:right;white-space:nowrap}.meta td:first-child{color:#666}
.rule{border:0;border-top:.6mm solid var(--c);margin:4mm 0}
.parties{display:grid;grid-template-columns:1fr 1fr;gap:6mm;margin-bottom:4mm}.box h4{margin:0 0 1mm;font-size:.78em;text-transform:uppercase;letter-spacing:.08em;color:#777}.box b{font-size:1.08em}
table.it{width:100%;border-collapse:collapse;margin-top:2mm}table.it thead{display:table-header-group}table.it tr{page-break-inside:avoid}
table.it th{background:var(--c);color:#fff;font-weight:700;text-align:left;padding:1.8mm 2mm;font-size:.9em}table.it th.n{text-align:right}table.it td{padding:1.8mm 2mm;border-bottom:.2mm solid #d8d8d8;vertical-align:top}
.n{text-align:right;white-space:nowrap;font-variant-numeric:tabular-nums}.sub{font-size:.86em;color:#555}.spec{font-size:.86em;color:#333;white-space:pre-wrap;margin-top:.6mm;padding-left:2mm;border-left:.5mm solid #ccc}
.foot{display:grid;grid-template-columns:minmax(0,1fr) ${rcpt ? '1fr' : '74mm'};gap:6mm;margin-top:4mm;align-items:start}
table.tot{width:100%;border-collapse:collapse}table.tot td{padding:1.1mm 2mm}table.tot td:last-child{text-align:right;white-space:nowrap;font-variant-numeric:tabular-nums}
table.tot tr.g td{background:var(--c);color:#fff;font-weight:800;font-size:1.12em}table.tot tr.b td{font-weight:800;border-top:.3mm solid #999}
.words{margin-top:0;font-size:.92em}.words b{display:block;font-size:.78em;text-transform:uppercase;letter-spacing:.08em;color:#777;margin-bottom:.5mm}
.sec{margin-top:4mm;page-break-inside:avoid}.sec h4{margin:0 0 1mm;font-size:.78em;text-transform:uppercase;letter-spacing:.08em;color:#777}.terms{margin:0;padding-left:4.5mm}.terms li{margin-bottom:.4mm}
.sig{display:flex;justify-content:space-between;gap:10mm;margin-top:${rcpt ? 10 : 16}mm;page-break-inside:avoid}.sig span{flex:1;max-width:62mm;border-top:.3mm solid #555;padding-top:1.2mm;text-align:center;color:#444}
.ft{margin-top:5mm;text-align:center;color:#555;font-size:.92em}
.wm{position:absolute;left:0;right:0;top:40%;text-align:center;font-size:${rcpt ? 30 : 70}pt;font-weight:900;color:rgba(184,53,42,.13);transform:rotate(-24deg);pointer-events:none;letter-spacing:.1em}
/* modern: coloured band header and soft cards */
.l-modern .band{background:var(--c);color:#fff;margin:-${pad}mm -${pad}mm 5mm;padding:${pad - 2}mm ${pad}mm}.l-modern .co h1,.l-modern .tt h2{color:#fff}.l-modern .co .ln,.l-modern .meta td:first-child{color:rgba(255,255,255,.78)}
.l-modern .logo{background:#fff;border-radius:2mm;padding:1.2mm}.l-modern .rule{display:none}.l-modern .box{background:#f4f4f2;border-radius:2mm;padding:3mm}
.l-modern table.it th{background:#efefec;color:#222;border-bottom:.5mm solid var(--c)}.l-modern table.it tbody tr:nth-child(even) td{background:#fafaf8}
/* classic: ruled table */
.l-classic table.it td{border:.2mm solid #cfcfcf}.l-classic table.it th{border:.2mm solid var(--c)}
/* compact: dense, thin lines */
.l-compact .co h1{font-size:1.45em}.l-compact .tt h2{font-size:1.3em}.l-compact table.it th{background:none;color:var(--c);border-bottom:.4mm solid var(--c);padding:1.2mm 1.5mm}.l-compact table.it td{padding:1.1mm 1.5mm}
.l-compact table.tot tr.g td{background:none;color:var(--c);border-top:.4mm solid var(--c)}.l-compact .rule{border-top-width:.3mm;margin:3mm 0}
/* 80 mm receipt */
.rc .hd{flex-direction:column;align-items:center;text-align:center;gap:2mm}.rc .co{flex-direction:column;align-items:center}.rc .tt{text-align:center}.rc .meta{margin:0 auto}.rc .meta td{text-align:left;padding:.2mm 1.5mm}
.rc .parties{grid-template-columns:1fr;gap:2mm}.rc .foot{grid-template-columns:1fr}.rc table.it th,.rc table.it td{padding:1mm .8mm}.rc .band{margin:-${pad}mm -${pad}mm 3mm;padding:3mm}
@page{${rcpt ? '' : `size:${T.paper};`}margin:${rcpt ? 0 : pad + 'mm'}}
@media print{.page{width:auto;min-height:0;${rcpt ? '' : 'padding:0;'}}.l-modern .band{margin-left:0;margin-right:0;margin-top:0;border-radius:2mm}.noprint{display:none}}`;
}

export function docBody(kind, d, T, G) {
  const co = company(), S = T.show, rcpt = T.paper === '80mm';
  const cust = byId('customers', d.customerId) || {};
  const lines = d.lines || [], sub = r2(lines.reduce((s, l) => s + L.lineTotal(l), 0));
  const hasDisc = S.disc && lines.some(l => num(l.disc)), m = v => amt(v, G);
  const meta = [[kind === 'so' ? 'Order no.' : 'Invoice no.', `<b>${esc(d.no || '')}</b>`], ['Date', dLong(d.date)]];
  if (kind === 'so' && d.quotationNo) meta.push(['Quotation', esc(d.quotationNo)]);
  if (kind === 'inv' && d.soNo) meta.push(['Order ref.', esc(d.soNo)]);
  if (S.salesman && d.salesmanName) meta.push(['Salesman', esc(d.salesmanName)]);
  const head = `<div class="hd"><div class="co">${S.logo && G.logo ? `<img class="logo" src="${esc(G.logo)}" alt="">` : ''}<div><h1>${esc(co.name || '')}</h1>
      ${S.address && co.address ? `<div class="ln">${nl(co.address)}</div>` : ''}
      ${[S.phone ? [co.phone ? 'Tel: ' + esc(co.phone) : '', co.mobile ? 'Mobile: ' + esc(co.mobile) : ''].filter(Boolean).join(' · ') : '', S.whatsapp && co.whatsapp ? 'WhatsApp: ' + esc(co.whatsapp) : '', S.email ? [esc(co.email), esc(co.website)].filter(Boolean).join(' · ') : ''].filter(Boolean).map(x => `<div class="ln">${x}</div>`).join('')}
      ${S.tax && co.taxNo ? `<div class="ln"><b>${esc(co.taxLabel || 'Tax no.')}: ${esc(co.taxNo)}</b></div>` : ''}</div></div>
    <div class="tt"><h2>${esc(kind === 'inv' && d.tax && /^\s*invoice\s*$/i.test(T.title || 'INVOICE') ? 'TAX INVOICE' : T.title || KINDS[kind].toUpperCase())}</h2><table class="meta">${meta.map(([a, b]) => `<tr><td>${a}</td><td>${b}</td></tr>`).join('')}</table></div></div>`;
  const deliv = kind === 'so' ? (d.deliveryDate ? dLong(d.deliveryDate) + (d.deliverySlot ? ' · ' + esc(d.deliverySlot) : '') : 'To be confirmed') : '';
  const parties = `<div class="parties"><div class="box"><h4>${kind === 'so' ? 'Customer' : 'Bill to'}</h4><b>${esc(d.customerName || '')}</b>${d.mobile ? `<div>${esc(d.mobile)}</div>` : ''}${S.custAddr && cust.address ? `<div>${nl(cust.address)}</div>` : ''}${cust.gstin ? `<div><b>GSTIN:</b> ${esc(cust.gstin)}</div>` : ''}${kind === 'inv' && d.tax ? `<div class="sub">Place of supply: ${d.tax.type === 'inter' ? 'other state (IGST)' : 'within state (CGST + SGST)'}</div>` : ''}</div>
    ${S.delivery && (d.deliveryAddress || deliv) ? `<div class="box"><h4>Deliver to</h4>${d.deliveryAddress ? `<div>${nl(d.deliveryAddress)}</div>` : '<div>—</div>'}${deliv ? `<div style="margin-top:1mm"><b>Delivery:</b> ${deliv}</div>` : ''}${d.deliveryNote ? `<div class="sub">${esc(d.deliveryNote)}</div>` : ''}</div>` : '<div></div>'}</div>`;
  const itemCell = l => `<b>${esc(l.name)}</b>${S.desc && l.desc ? `<div>${esc(l.desc)}</div>` : ''}${S.sku && l.sku ? `<div class="sub">${esc(l.sku)}</div>` : ''}${S.spec && l.src === 'custom' && l.spec ? `<div class="spec">${esc(l.spec)}</div>` : ''}${rcpt ? `<div class="sub">${num(l.qty)} × ${m(l.rate)}${num(l.disc) ? ' − ' + m(l.disc) : ''}</div>` : ''}`;
  const table = rcpt
    ? `<table class="it"><thead><tr><th>Item</th><th class="n">Amount</th></tr></thead><tbody>${lines.map(l => `<tr><td>${itemCell(l)}</td><td class="n">${m(L.lineTotal(l))}</td></tr>`).join('')}</tbody></table>`
    : `<table class="it"><thead><tr><th style="width:7mm">#</th><th>Item</th><th class="n">Qty</th><th class="n">Rate</th>${hasDisc ? '<th class="n">Disc.</th>' : ''}<th class="n">Amount</th></tr></thead><tbody>${lines.map((l, i) => `<tr><td>${i + 1}</td><td>${itemCell(l)}</td><td class="n">${num(l.qty)}</td><td class="n">${m(l.rate)}</td>${hasDisc ? `<td class="n">${num(l.disc) ? m(l.disc) : ''}</td>` : ''}<td class="n">${m(L.lineTotal(l))}</td></tr>`).join('')}</tbody></table>`;
  const cur = esc(setting('currency', '')), tot = [];
  const chg = (d.charges || []).filter(c => num(c.amount));
  if (num(d.discount) || hasDisc || chg.length) tot.push(['Subtotal', m(sub)]);
  if (num(d.discount)) tot.push(['Discount', '− ' + m(d.discount)]);
  chg.forEach(c => tot.push([esc(c.name), m(c.amount)]));
  if ((kind === 'inv' || kind === 'so') && d.tax) { const x = d.tax, h = r2(x.rate / 2);
    tot.push([`Taxable value${x.mode === 'inclusive' ? ' <small>(prices incl. ' + esc(x.name || 'GST') + ')</small>' : ''}`, m(x.taxable)]);
    if (x.type === 'inter') tot.push([`IGST @ ${x.rate}%`, m(x.igst)]); else { tot.push([`CGST @ ${h}%`, m(x.cgst)]); tot.push([`SGST @ ${h}%`, m(x.sgst)]); } }
  tot.push([`Total${cur ? ' (' + cur + ')' : ''}`, m(d.total), 'g']);
  if (S.payment) {
    if (kind === 'so') { tot.push(['Advance received', m(d.advance || 0)]); tot.push(['Balance on delivery', m(r2(num(d.total) - num(d.advance))), 'b']); }
    else { if (num(d.credited)) tot.push(['Returned (credit notes)', '− ' + m(d.credited)]); tot.push(['Paid', m(d.paid || 0)]); tot.push(['Balance due', m(d.balance || 0), 'b']); }
  }
  const terms = String(T.terms || '').split('\n').map(s => s.replace(/^\s*\d+[.)]\s*/, '').trim()).filter(Boolean);
  const wm = kind === 'inv' && d.status === 'void' ? 'VOID' : kind === 'so' && d.status === 'cancelled' ? 'CANCELLED' : '';
  return `<div class="page l-${esc(T.layout)}${rcpt ? ' rc' : ''}">${wm ? `<div class="wm">${wm}</div>` : ''}
    ${T.layout === 'modern' ? `<div class="band">${head}</div>` : head + '<hr class="rule">'}
    ${parties}${table}
    <div class="foot"><div>${S.words ? `<div class="words"><b>Amount in words</b>${esc(amountWords(num(d.total), G))}</div>` : ''}${d.notes ? `<div class="sec"><h4>Notes</h4>${nl(d.notes)}</div>` : ''}</div>
      <table class="tot">${tot.map(([a, b, c]) => `<tr${c ? ` class="${c}"` : ''}><td>${a}</td><td>${b}</td></tr>`).join('')}</table></div>
    ${S.bank && G.bank ? `<div class="sec"><h4>Bank details</h4>${nl(G.bank)}</div>` : ''}
    ${S.terms && terms.length ? `<div class="sec"><h4>Terms &amp; conditions</h4><ol class="terms">${terms.map(t => `<li>${esc(t)}</li>`).join('')}</ol></div>` : ''}
    ${S.sign ? `<div class="sig"><span>${esc(T.sigLeft || '')}</span><span>${esc(T.sigRight || '')}${co.name ? `<br><small>for ${esc(co.name)}</small>` : ''}</span></div>` : ''}
    ${T.footer ? `<div class="ft">${nl(T.footer)}</div>` : ''}</div>`;
}

export function docFile(kind, d, tp = templates()) {
  const T = tp.T[kind];
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(KINDS[kind] + ' ' + (d.no || ''))}</title><style>${docCSS(T)}@media screen{body{background:#e9e6df;padding:8mm 0}.page{margin:0 auto;box-shadow:0 2mm 8mm rgba(0,0,0,.18)}}</style></head><body>${docBody(kind, d, T, tp.G)}<script>window.onload=function(){setTimeout(function(){window.print()},350)}<\/script></body></html>`;
}
// Claude pages can't open the print dialog themselves, so documents are saved as PDF files (HTML as a fallback when the PDF tools can't load)
export async function printFile(kind, d) {
  const name = String(d.no || kind).replace(/[^\w.\-]+/g, '_'), html = docFile(kind, d);
  return savePdf(html, name, '.page');
}

/* ---------- PDF: each page element of an HTML document is drawn onto its own PDF page ---------- */
const PDF_LIBS = ['https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js', 'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js'];
let pdfLibs = null;
function loadPdfLibs() {
  if (window.html2canvas && window.jspdf) return Promise.resolve();
  if (!pdfLibs) pdfLibs = Promise.all(PDF_LIBS.map(src => new Promise((res, rej) => { const el = document.createElement('script'); el.src = src; el.async = true; el.onload = res; el.onerror = () => rej(Error('Could not load the PDF tools.')); document.head.appendChild(el); })))
    .catch(e => { pdfLibs = null; throw e; });
  return pdfLibs;
}
// html: a complete document; sel: the element(s) that are pages; opt.fit = 'A4' (or 'A4L' landscape) places each element on an A4 page inside opt.margin mm
export async function htmlToPdf(html, sel, opt = {}) {
  await loadPdfLibs();
  const fr = document.createElement('iframe');
  fr.setAttribute('aria-hidden', 'true'); fr.style.cssText = `position:fixed;left:-12000px;top:0;width:${opt.width || 1100}px;height:1500px;border:0;visibility:hidden`;
  fr.srcdoc = html.replace(/<script>window\.onload[\s\S]*?<\/script>/, '').replace(/@media screen\{[^{}]*(\{[^{}]*\}[^{}]*)*\}/g, '');
  document.body.appendChild(fr);
  try {
    await new Promise(r => { fr.onload = r; setTimeout(r, 4000); });
    const doc = fr.contentDocument; if (doc.fonts && doc.fonts.ready) await doc.fonts.ready.catch(() => { });
    await Promise.all([...doc.images].map(im => im.complete ? 0 : new Promise(r => { im.onload = im.onerror = r; })));
    const pages = [...doc.querySelectorAll(sel)]; if (!pages.length) throw Error('Nothing to print.');
    const { jsPDF } = window.jspdf, PX = 25.4 / 96; let pdf = null;
    for (const el of pages) {
      const canvas = await window.html2canvas(el, { scale: 2, backgroundColor: '#ffffff', useCORS: true, logging: false, windowWidth: fr.clientWidth });
      const wMM = el.offsetWidth * PX, hMM = el.offsetHeight * PX, img = canvas.toDataURL('image/jpeg', 0.92);
      let pw, ph, x = 0, y = 0, w = wMM, h = hMM;
      if (opt.fit === 'A4' || opt.fit === 'A4L') { pw = opt.fit === 'A4L' ? 297 : 210; ph = opt.fit === 'A4L' ? 210 : 297; const m = opt.margin ?? 12, k = Math.min((pw - 2 * m) / wMM, (ph - 2 * m) / hMM, 1.5); w = wMM * k; h = hMM * k; x = m; y = m; }
      else { pw = wMM; ph = hMM; }
      const orient = pw > ph ? 'l' : 'p';
      if (!pdf) pdf = new jsPDF({ orientation: orient, unit: 'mm', format: [pw, ph], compress: true }); else pdf.addPage([pw, ph], orient);
      pdf.addImage(img, 'JPEG', x, y, w, h, undefined, 'FAST');
    }
    return pdf.output('blob');
  } finally { fr.remove(); }
}
// save as PDF; if the PDF tools can't load, save the printable HTML file instead
export async function savePdf(html, name, sel, opt) {
  let blob;
  try { toast('Making the PDF…'); blob = await htmlToPdf(html, sel, opt); }
  catch (e) { console.warn('pdf', e); toast('PDF tools could not load — saving a printable file instead.', 'warn'); return download(name + '.html', html); }
  return download(name + '.pdf', blob);
}

/* ---------- on-screen preview (shadow DOM keeps the document's styles apart from the app) ---------- */
export function renderPreview(host, kind, d, tp = templates()) {
  const T = tp.T[kind]; host.style.position = 'relative'; host.style.overflow = 'hidden';
  const sh = host.shadowRoot || host.attachShadow({ mode: 'open' });
  sh.innerHTML = `<style>:host{display:block;background:#e9e6df;border-radius:10px}.wrap{transform-origin:0 0;position:absolute;left:0;top:0;padding:14px}.wrap .page{box-shadow:0 3px 14px rgba(0,0,0,.18)}${docCSS(T)}</style><div class="wrap">${docBody(kind, d, T, tp.G)}</div>`;
  const fit = () => {
    const wrap = sh.querySelector('.wrap'), pg = sh.querySelector('.page'); if (!wrap || !pg) return;
    const W = pg.offsetWidth + 28, s = Math.min(1, (host.clientWidth || W) / W);
    wrap.style.transform = `scale(${s})`; host.style.height = Math.ceil((pg.offsetHeight + 28) * s) + 'px';
  };
  fit(); requestAnimationFrame(fit);
  const imgs = sh.querySelectorAll('img'); imgs.forEach(i => i.addEventListener('load', fit, { once: true }));
}

const office = () => L.can.office(store.me?.role);
const fresh = (kind, d) => byId(kind === 'so' ? 'salesOrders' : 'invoices', d.id) || d;
// Print preview for one document: the print file, the template, and a way back
export function printPreview(kind, d, back) {
  d = fresh(kind, d);
  const acts = [];
  if (back) acts.push({ label: '← Back', onClick: () => { setTimeout(() => back(fresh(kind, d)), 30); } });
  if (office()) acts.push({ label: '⚙ Template', onClick: () => { setTimeout(() => templateDialog(kind, d, () => printPreview(kind, d, back)), 30); } });
  acts.push({ label: '🖨 Print', cls: 'btn-accent', onClick: async () => { await printFile(kind, d); return false; } });
  const T = templates().T[kind];
  openModal(`Print ${KINDS[kind].toLowerCase()} ${d.no || ''}`, `<p class="hint" style="margin:0 0 10px">Design: <b>${esc(LAYOUTS[T.layout] || T.layout)}</b> · paper <b>${esc(PAPERS[T.paper] || T.paper)}</b>. “Print” saves a page that opens the print dialog — choose your printer, ${T.paper === '80mm' ? 'paper 80 mm, margins None' : 'paper ' + esc(T.paper) + ', scale 100%'}.</p><div id="ppHost"></div>`, acts,
    { wide: true, onOpen: () => renderPreview($('ppHost'), kind, d) });
}

/* ---------- template set-up ---------- */
function sample(kind) {
  const src = kind === 'so' ? all('salesOrders').filter(o => o.status !== 'cancelled') : all('invoices').filter(i => i.status !== 'void');
  const latest = src.sort((a, b) => String(b.date).localeCompare(String(a.date)) || (b.createdAt || 0) - (a.createdAt || 0))[0];
  if (latest) return latest;
  const lines = [{ name: '3-seater fabric sofa', sku: 'SOF-0012', desc: 'Grey linen, walnut legs', qty: 1, rate: 42000, disc: 2000, src: 'custom', spec: 'Seat depth 24 in, extra firm cushions' }, { name: 'Coffee table', sku: 'TAB-0031', desc: 'Oak veneer', qty: 1, rate: 12500, disc: 0 }, { name: 'Cushion cover set', sku: 'ACC-0105', desc: 'Mustard', qty: 2, rate: 900, disc: 0 }];
  const total = r2(lines.reduce((s, l) => s + L.lineTotal(l), 0));
  return { no: kind === 'so' ? 'SO-0001' : 'INV-0001', soNo: 'SO-0001', date: today(), customerName: 'Sample Customer', mobile: '98765 43210', deliveryAddress: 'Flat 4B, Palm Residency, MG Road', deliveryDate: today(), deliverySlot: 'Morning', salesmanName: store.me?.name || 'Salesman', lines, discount: 0, total, advance: 20000, paid: 20000, balance: r2(total - 20000), status: 'partial' };
}
export function templateDialog(kind = 'so', doc, back, resume) {
  if (!office()) return toast('Only office staff can change print templates.', 'warn');
  const tp = templates(), W = resume ? resume.W : { G: { ...tp.G }, T: { so: { ...tp.T.so, show: { ...tp.T.so.show } }, inv: { ...tp.T.inv, show: { ...tp.T.inv.show } } } };
  let k = resume ? resume.k : kind;
  const docFor = kk => doc && kk === kind ? fresh(kind, doc) : sample(kk);
  const chk = (key, on) => `<label class="check" style="margin:0"><input type="checkbox" data-s="${key}"${on ? ' checked' : ''}> ${esc(SHOW[key])}</label>`;
  const form = () => { const T = W.T[k], G = W.G; return `<div class="seg" style="margin-bottom:12px">${Object.entries(KINDS).map(([kk, l]) => `<button type="button" data-kind="${kk}" class="${kk === k ? 'active' : ''}">${l}</button>`).join('')}</div>
    <div class="field"><label>Design</label><div class="seg">${Object.entries(LAYOUTS).map(([v, l]) => `<button type="button" data-lay="${v}" class="${T.layout === v ? 'active' : ''}">${l}</button>`).join('')}</div></div>
    <div class="row2"><div class="field"><label>Paper</label><select data-t="paper">${Object.entries(PAPERS).map(([v, l]) => `<option value="${v}"${T.paper === v ? ' selected' : ''}>${l}</option>`).join('')}</select></div>
      <div class="field"><label>Title on the document</label><input data-t="title" value="${esc(T.title)}"></div></div>
    <div class="field"><label>Colour</label><div style="display:flex;gap:6px;align-items:center;flex-wrap:wrap"><input type="color" data-t="color" value="${esc(T.color)}" style="width:44px;height:34px;padding:2px;border-radius:8px">${SWATCHES.map(c => `<button type="button" data-sw="${c}" title="${c}" style="width:26px;height:26px;border-radius:50%;border:2px solid ${c.toLowerCase() === String(T.color).toLowerCase() ? 'var(--heading)' : 'transparent'};background:${c};cursor:pointer;outline-offset:1px"></button>`).join('')}</div></div>
    <div class="field"><label>What to show</label><div style="display:grid;grid-template-columns:1fr 1fr;gap:6px 10px">${Object.keys(SHOW).map(s => chk(s, T.show[s])).join('')}</div></div>
    <div class="field"><label>Terms &amp; conditions (one per line)</label><textarea data-t="terms" rows="4">${esc(T.terms)}</textarea></div>
    <div class="field"><label>Footer note</label><input data-t="footer" value="${esc(T.footer)}"></div>
    <div class="row2"><div class="field"><label>Signature — left</label><input data-t="sigLeft" value="${esc(T.sigLeft)}"></div><div class="field"><label>Signature — right</label><input data-t="sigRight" value="${esc(T.sigRight)}"></div></div>
    <h3 style="margin:14px 0 4px;font-size:14px">Company details on both documents</h3>
    ${(c => `<div class="panel" style="box-shadow:none;padding:10px 12px;margin-bottom:10px;font-size:13px;line-height:1.5"><b>${esc(c.name || 'No company name')}</b>${c.address ? `<div class="muted" style="white-space:pre-line">${esc(c.address)}</div>` : ''}<div class="muted">${[c.phone && 'Tel ' + esc(c.phone), c.mobile && 'Mobile ' + esc(c.mobile), c.whatsapp && 'WhatsApp ' + esc(c.whatsapp)].filter(Boolean).join(' · ') || 'No phone numbers'}</div><div class="muted">${[esc(c.email), esc(c.website)].filter(Boolean).join(' · ') || 'No email or website'}</div><div class="muted">${c.taxNo ? esc(c.taxLabel) + ': ' + esc(c.taxNo) : 'No ' + esc(c.taxLabel) + ' number'}</div><button type="button" class="btn btn-sm" data-b="co" style="margin-top:8px">✎ Edit company details</button></div>`)(company())}
    <div class="field"><label>Logo</label><div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap">${G.logo ? `<img src="${esc(G.logo)}" alt="Logo" style="max-height:40px;max-width:140px;background:#fff;border:1px solid var(--line);border-radius:6px;padding:3px">` : '<span class="hint">No logo yet</span>'}<button type="button" class="btn btn-sm" data-b="logo">${G.logo ? 'Change' : 'Upload'} logo</button>${G.logo ? '<button type="button" class="btn btn-sm btn-danger" data-b="nologo">Remove</button>' : ''}</div></div>
    ${G.logo ? `<div class="field"><label>Logo size on the ${esc(KINDS[k].toLowerCase())} — <span id="tplLogoV">${logoMM(T)} mm</span> tall</label><div style="display:flex;gap:8px;align-items:center"><button type="button" class="btn btn-sm" data-b="lgm" aria-label="Smaller logo">−</button><input type="range" min="6" max="${T.paper === '80mm' ? 30 : 60}" step="1" data-t="logoSize" value="${logoMM(T)}" style="flex:1;accent-color:var(--blue)" aria-label="Logo size"><button type="button" class="btn btn-sm" data-b="lgp" aria-label="Bigger logo">＋</button><button type="button" class="btn btn-sm" data-b="lgr">Default</button></div></div>` : ''}
    <div class="field"><label>Bank details</label><textarea data-g="bank" rows="3" placeholder="Bank, account name, account no., IBAN / IFSC">${esc(G.bank)}</textarea></div>
    <div class="row3"><div class="field"><label>Number style</label><select data-g="numStyle"><option value="intl"${G.numStyle === 'intl' ? ' selected' : ''}>1,234,567.00</option><option value="in"${G.numStyle === 'in' ? ' selected' : ''}>12,34,567.00</option></select></div><div class="field"><label>Currency in words</label><input data-g="curName" value="${esc(G.curName)}" placeholder="Dirhams"></div><div class="field"><label>Fraction in words</label><input data-g="subName" value="${esc(G.subName)}" placeholder="Fils"></div></div>
    <button type="button" class="btn btn-sm" data-b="reset">Reset ${esc(KINDS[k].toLowerCase())} to default</button>`; };
  const body = `<div style="display:grid;grid-template-columns:minmax(0,370px) minmax(0,1fr);gap:16px;align-items:start" class="tpl-grid"><div id="tplForm">${form()}</div><div style="position:sticky;top:0"><div class="hint" id="tplNote" style="margin-bottom:6px"></div><div id="tplPrev"></div></div></div>
    <style>@media(max-width:860px){.tpl-grid{grid-template-columns:minmax(0,1fr)!important}}</style>`;
  const preview = () => { const d = docFor(k); $('tplNote').innerHTML = `Preview: ${doc && k === kind ? esc(d.no) : d.id ? 'latest ' + esc(KINDS[k].toLowerCase()) + ' ' + esc(d.no) : 'sample ' + esc(KINDS[k].toLowerCase())}`; renderPreview($('tplPrev'), k, d, W); };
  const redraw = () => { $('tplForm').innerHTML = form(); preview(); };
  const save = async () => {
    const c0 = byId('settings', 'company') || {}, p0 = byId('settings', 'print') || {}, keep = {}; ['email', 'website', 'taxLabel', 'taxNo'].forEach(f => { if (!c0[f] && p0[f]) keep[f] = p0[f]; });
    const data = { ...keep, logo: W.G.logo, bank: W.G.bank, numStyle: W.G.numStyle, curName: W.G.curName, subName: W.G.subName, so: W.T.so, inv: W.T.inv, updatedAt: Date.now(), updatedBy: store.me?.id || '' };
    if (data.logo && data.logo.length > 300000) throw Error('The logo is too large — use a smaller image.');
    await store.db.commit([{ t: 'set', coll: 'settings', id: 'print', data }]);
    toast('Print template saved.');
  };
  const acts = [{ label: 'Cancel', onClick: () => { if (back) setTimeout(back, 30); } }, { label: 'Save template', cls: 'btn-ink', onClick: async () => { await save(); if (back) setTimeout(back, 30); } }];
  if (doc) acts.splice(1, 0, { label: 'Save & print', cls: 'btn-accent', onClick: async () => { await save(); await printFile(kind, fresh(kind, doc)); if (back) setTimeout(back, 30); } });
  openModal('Print templates', body, acts, { wide: true, onOpen: b => {
    preview();
    b.addEventListener('click', async e => {
      const kk = e.target.closest('[data-kind]'); if (kk) { k = kk.dataset.kind; return redraw(); }
      const ly = e.target.closest('[data-lay]'); if (ly) { W.T[k].layout = ly.dataset.lay; return redraw(); }
      const sw = e.target.closest('[data-sw]'); if (sw) { W.T[k].color = sw.dataset.sw; return redraw(); }
      const bt = e.target.closest('[data-b]')?.dataset.b;
      if (bt === 'co') { const st = { W, k }; return companyDialog(() => templateDialog(kind, doc, back, st)); }
      if (bt === 'nologo') { W.G.logo = ''; return redraw(); }
      if (bt === 'lgm' || bt === 'lgp') { const T = W.T[k]; T.logoSize = Math.max(6, Math.min(T.paper === '80mm' ? 30 : 60, logoMM(T) + (bt === 'lgp' ? 2 : -2))); return redraw(); }
      if (bt === 'lgr') { delete W.T[k].logoSize; return redraw(); }
      if (bt === 'reset') { W.T[k] = { ...DEF[k], show: { ...DEF[k].show }, ...(k === 'inv' ? { footer: setting('invoiceNote', '') } : {}) }; return redraw(); }
      if (bt === 'logo') { const f = await pickFile('image/*'); if (!f) return; try { W.G.logo = await shrinkImage(f); redraw(); } catch (er) { fail(er); } }
    });
    const onInput = e => {
      const t = e.target;
      if (t.dataset.t) { W.T[k][t.dataset.t] = t.dataset.t === 'logoSize' ? num(t.value) : t.value; if (t.dataset.t === 'logoSize' && $('tplLogoV')) $('tplLogoV').textContent = logoMM(W.T[k]) + ' mm'; if (t.dataset.t === 'paper' || t.dataset.t === 'color') return redraw(); }
      else if (t.dataset.g) W.G[t.dataset.g] = t.value;
      else if (t.dataset.s) W.T[k].show[t.dataset.s] = t.checked;
      else return;
      preview();
    };
    b.addEventListener('input', onInput); b.addEventListener('change', e => { if (e.target.type === 'checkbox' || e.target.tagName === 'SELECT') onInput(e); });
  } });
}
// the shop logo (one image for the menu, phone header and printed documents)
export const shopLogo = () => (byId('settings', 'print') || {}).logo || '';
export async function saveShopLogo(dataUrl) {
  if (dataUrl && dataUrl.length > 300000) throw Error('The logo is too large — use a smaller image.');
  const p = byId('settings', 'print') || {};
  await store.db.commit([{ t: 'set', coll: 'settings', id: 'print', data: { ...p, logo: dataUrl || '', updatedAt: Date.now(), updatedBy: store.me?.id || '' } }]);
}
// logo size: menuLogoH = height in the side menu (px); doc = height on printed sales orders and invoices (mm)
export const menuLogoH = () => { const v = num((byId('settings', 'print') || {}).menuLogoH); return v >= 24 ? Math.min(160, v) : 64; };
export async function saveLogoSize({ menu, doc }) {
  const p = byId('settings', 'print') || {}, d = { ...p, updatedAt: Date.now(), updatedBy: store.me?.id || '' };
  if (menu) d.menuLogoH = Math.max(24, Math.min(160, Math.round(num(menu))));
  if (doc) { const mm = Math.max(6, Math.min(60, Math.round(num(doc)))); for (const k of Object.keys(KINDS)) d[k] = { ...(p[k] || {}), logoSize: mm }; }
  await store.db.commit([{ t: 'set', coll: 'settings', id: 'print', data: d }]);
}
// the logo's content area: blank (white or transparent) borders are cut off, keeping a small margin
function trimBox(img) {
  try {
    const W = img.width, H = img.height, c = document.createElement('canvas'); c.width = W; c.height = H; const g = c.getContext('2d'); g.drawImage(img, 0, 0);
    const px = g.getImageData(0, 0, W, H).data; let x0 = W, y0 = H, x1 = -1, y1 = -1;
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { const i = (y * W + x) * 4; if (px[i + 3] > 24 && (px[i] < 238 || px[i + 1] < 238 || px[i + 2] < 238)) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; } }
    if (x1 < 0) return { x: 0, y: 0, w: W, h: H };
    const m = Math.round(Math.max(x1 - x0, y1 - y0) * 0.04); x0 = Math.max(0, x0 - m); y0 = Math.max(0, y0 - m); x1 = Math.min(W - 1, x1 + m); y1 = Math.min(H - 1, y1 + m);
    return { x: x0, y: y0, w: x1 - x0 + 1, h: y1 - y0 + 1 };
  } catch (e) { return { x: 0, y: 0, w: img.width, h: img.height }; }
}
// logos are kept small: at most 900 × 360 px, stored with the template
export function shrinkImage(file) {
  return new Promise((res, rej) => {
    if (!/^image\//.test(file.type)) return rej(Error('Choose an image file (PNG or JPG).'));
    const fr = new FileReader(); fr.onerror = () => rej(Error('Could not read the image.'));
    fr.onload = () => { const img = new Image(); img.onerror = () => rej(Error('Could not read the image.')); img.onload = () => {
      const B = trimBox(img), s = Math.min(1, 900 / B.w, 360 / B.h), w = Math.max(1, Math.round(B.w * s)), h = Math.max(1, Math.round(B.h * s));
      const c = document.createElement('canvas'); c.width = w; c.height = h; const g = c.getContext('2d'); g.drawImage(img, B.x, B.y, B.w, B.h, 0, 0, w, h);
      let out = c.toDataURL('image/png'); if (out.length > 200000) { const c2 = document.createElement('canvas'); c2.width = w; c2.height = h; const g2 = c2.getContext('2d'); g2.fillStyle = '#fff'; g2.fillRect(0, 0, w, h); g2.drawImage(img, 0, 0, w, h); out = c2.toDataURL('image/jpeg', 0.85); }
      if (out.length > 300000) return rej(Error('The logo is too large — use a smaller image.'));
      res(out); }; img.src = fr.result; };
    fr.readAsDataURL(file);
  });
}

/* ---------- payment vouchers (supplier payments, expenses, staff payments) with the receiver's signature ---------- */
// v = { title, no, date, paidTo, paidToSub, purpose, rows: [[label, value]], amount, method, from, ref, note, preparedBy }
export function voucherFromTxn(coll, d) {
  if (coll === 'payments') {
    const s = byId('suppliers', d.supplierId) || {}, al = L.payAllocs(d);
    return { title: 'Payment Voucher', kind: 'Supplier payment', no: d.no, date: d.date, paidTo: d.supplierName, paidToSub: [s.mobile || s.phone, s.trn || s.taxNo].filter(Boolean).join(' · '),
      purpose: al.length ? 'Against bill' + (al.length > 1 ? 's ' : ' ') + al.map(a => a.no).join(', ') : 'Advance to supplier', rows: [...al.map(a => ['Bill ' + a.no, a.amount]), ...(num(d.unallocated) > 0.009 && al.length ? [['Kept as advance', d.unallocated]] : [])],
      amount: d.amount, from: d.accountName || L.accName(d.accountId), ref: d.refNo || '', note: d.note || '', preparedBy: L.nm(d.createdBy) };
  }
  if (coll === 'expenses') return { title: 'Payment Voucher', kind: 'Expense', no: d.no, date: d.date, paidTo: d.payee || '', purpose: d.expenseName + (d.note ? ' — ' + d.note : ''), rows: [], amount: d.amount, from: d.fromName || L.accName(d.fromAcc), note: '', preparedBy: L.nm(d.createdBy) };
  return null;
}
// p = a row from the staff payments list (salary, advance, loan, incentive …)
export function voucherFromStaff(p) {
  const s = byId('hrStaff', p.staffId) || {}, j = p.journalId ? (store.data.journals_ || []).find(x => x.id === p.journalId) || byId('journals', p.journalId) : null;
  return { title: 'Payment Voucher', kind: 'Staff payment · ' + p.type, no: p.no || (j && (j.no || j.refNo)) || '', date: p.date, paidTo: p.name, paidToSub: [s.empNo, s.designation || s.dept].filter(Boolean).join(' · '),
    purpose: p.forText && !String(p.forText).startsWith(p.type) ? p.type + ' — ' + p.forText : (p.forText || p.type), rows: p.rows || [], amount: p.amount, method: p.methodLabel || p.method || '', from: L.accName(p.accountId), ref: p.ref || '', note: p.note || '', preparedBy: L.nm(p.by || p.createdBy || store.me?.id) };
}
function voucherHTML(v, G, T) {
  const co = company(), m = n => amt(n, G), cur = setting('currency', '');
  return `<section class="vp"><div class="vh"><div class="vco">${G.logo ? `<img class="vlogo" src="${esc(G.logo)}" alt="">` : ''}<div><h1>${esc(co.name || '')}</h1>${co.address ? `<div class="ln">${nl(co.address)}</div>` : ''}<div class="ln">${[co.phone && 'Tel: ' + esc(co.phone), co.mobile && 'Mobile: ' + esc(co.mobile), co.taxNo && esc(co.taxLabel || 'Tax no.') + ': ' + esc(co.taxNo)].filter(Boolean).join(' · ')}</div></div></div>
    <div class="vt"><h2>${esc(v.title)}</h2><div class="vk">${esc(v.kind || '')}</div><table class="vmeta"><tr><td>No.</td><td><b>${esc(v.no || '')}</b></td></tr><tr><td>Date</td><td>${dLong(v.date)}</td></tr></table></div></div>
    <div class="vbody"><div class="vrow"><span>Paid to</span><b>${esc(v.paidTo || '—')}</b>${v.paidToSub ? `<em>${esc(v.paidToSub)}</em>` : ''}</div>
      <div class="vrow"><span>Being</span><b>${esc(v.purpose || '')}</b></div>
      ${(v.rows || []).length ? `<table class="vlines">${v.rows.map(([l, a]) => `<tr><td>${esc(l)}</td><td class="n">${m(a)}</td></tr>`).join('')}</table>` : ''}
      <div class="vamt"><div><span>Amount</span><b>${esc(cur)} ${m(v.amount)}</b></div><div class="vw">${esc(amountWords(v.amount, G))}</div></div>
      <div class="vrow vsmall"><span>Paid by</span>${esc([v.method, v.from && 'from ' + v.from].filter(Boolean).join(' · ') || '—')}${v.ref ? ` · Ref: ${esc(v.ref)}` : ''}${v.note ? ` · ${esc(v.note)}` : ''}</div></div>
    <div class="vsig"><div><div class="sl"></div>Prepared by<small>${esc(v.preparedBy || '') || '&nbsp;'}</small></div><div><div class="sl"></div>Approved by<small>&nbsp;</small></div>
      <div class="vrec"><div class="sl"></div><b>Receiver's signature</b><small>Received the above amount in full</small><div class="vrn">Name: <span></span></div><div class="vrn">Date: <span></span></div></div></div></section>`;
}
function voucherCSS(color) {
  return `*{box-sizing:border-box}html,body{margin:0;background:#fff}@page{size:A5 landscape;margin:0}
.vp{--c:${esc(color || '#15213b')};width:210mm;height:148mm;padding:9mm 11mm;display:flex;flex-direction:column;gap:3.5mm;font:9.6pt/1.4 Arial,Helvetica,sans-serif;color:#1b1b1b;page-break-after:always;break-after:page;overflow:hidden}
.vp:last-child{page-break-after:auto;break-after:auto}.vp *{-webkit-print-color-adjust:exact;print-color-adjust:exact}
.vh{display:flex;justify-content:space-between;gap:6mm;border-bottom:.6mm solid var(--c);padding-bottom:3mm}.vco{display:flex;gap:3.5mm;align-items:flex-start;min-width:0}.vlogo{height:14mm;width:auto;max-width:42mm;object-fit:contain}
.vco h1{margin:0 0 .8mm;font-size:14pt;color:var(--c)}.ln{color:#555;font-size:8.4pt}.vt{text-align:right;flex:none}.vt h2{margin:0;font-size:13pt;letter-spacing:.12em;text-transform:uppercase;color:var(--c)}.vk{color:#666;font-size:8.4pt;margin:.5mm 0 1.5mm}
.vmeta{margin-left:auto;border-collapse:collapse}.vmeta td{padding:.2mm 0 .2mm 4mm;text-align:right}.vmeta td:first-child{color:#777}
.vbody{display:flex;flex-direction:column;gap:2.2mm;flex:1}.vrow{display:flex;gap:3mm;align-items:baseline;border-bottom:.2mm dotted #bbb;padding-bottom:1.4mm}.vrow span{width:20mm;flex:none;color:#777;font-size:8.4pt;text-transform:uppercase;letter-spacing:.06em}.vrow b{font-size:10.6pt}.vrow em{color:#666;font-style:normal;font-size:8.6pt;margin-left:auto}
.vsmall{font-size:8.8pt}.vlines{width:60%;border-collapse:collapse;margin-left:23mm}.vlines td{padding:.6mm 0;border-bottom:.2mm solid #eee}.vlines .n{text-align:right}
.vamt{display:flex;gap:5mm;align-items:center;border:.4mm solid var(--c);border-radius:2mm;padding:2.4mm 3.5mm}.vamt>div:first-child{display:flex;flex-direction:column;flex:none}.vamt span{font-size:7.6pt;text-transform:uppercase;letter-spacing:.08em;color:#777}.vamt b{font-size:15pt;color:var(--c);white-space:nowrap}.vw{font-style:italic;color:#333}
.vsig{display:grid;grid-template-columns:1fr 1fr 1.5fr;gap:7mm;align-items:end;font-size:8.6pt;color:#444}.vsig>div{display:flex;flex-direction:column;gap:.8mm}.sl{border-top:.3mm solid #333;margin-top:12mm}.vsig small{color:#777}
.vrec{border:.4mm dashed #999;border-radius:2mm;padding:0 3mm 2mm}.vrec .sl{margin-top:13mm}.vrec b{color:#1b1b1b}.vrn{display:flex;gap:2mm;margin-top:1.5mm}.vrn span{flex:1;border-bottom:.2mm solid #999}
@media screen{body{background:#e9e6df;padding:6mm 0}.vp{margin:0 auto 6mm;background:#fff;box-shadow:0 2px 10px rgba(0,0,0,.15)}}`;
}
// saves one file holding every voucher (one A5 landscape page each) that opens the print dialog when opened
export async function printVouchers(list, name) {
  list = (list || []).filter(Boolean); if (!list.length) return false;
  const tp = templates(), G = tp.G, color = tp.T.inv.color;
  const html = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(list.length === 1 ? 'Payment voucher ' + (list[0].no || '') : list.length + ' payment vouchers')}</title><style>${voucherCSS(color)}</style></head><body>${list.map(v => voucherHTML(v, G)).join('')}<script>window.onload=function(){setTimeout(function(){window.print()},300)}<\/script></body></html>`;
  return savePdf(html, String(name || (list.length === 1 ? 'Voucher_' + (list[0].no || '') : 'Vouchers_' + today())).replace(/[^\w.\-]+/g, '_'), '.vp');
}

/* ---------- any on-screen report → a paged A4 PDF (letterhead, title, period, repeated table headings, page numbers) ---------- */
// html: the report as shown on screen (tables, notes). Long tables are split over pages; wide ones go landscape.
export async function reportPdf({ title, sub = '', html, name }) {
  const box = document.createElement('div'); box.innerHTML = html;
  box.querySelectorAll('.tw').forEach(w => w.replaceWith(...w.childNodes));
  box.querySelectorAll('[title],[data-go]').forEach(e => { e.removeAttribute('title'); e.removeAttribute('data-go'); });
  const blocks = []; let maxCols = 0;
  for (const el of [...box.children]) {
    if (el.tagName === 'TABLE') {
      const head = el.tHead ? el.tHead.outerHTML : '', foot = el.tFoot ? el.tFoot.outerHTML : '';
      const rows = [...el.querySelectorAll(':scope > tbody > tr')].map(r => r.outerHTML);
      maxCols = Math.max(maxCols, ...[...el.rows].map(r => [...r.cells].reduce((s, c) => s + (c.colSpan || 1), 0)));
      blocks.push({ table: true, cls: el.className, head, foot, rows });
    } else if (el.textContent.trim() || el.querySelector('img,table')) blocks.push({ html: el.outerHTML });
  }
  const land = maxCols > 6, cap = land ? 26 : 40, first = 6;
  const pages = [[]]; let used = first;
  const room = n => { if (used + n > cap && pages[pages.length - 1].length) { pages.push([]); used = 2; } used += n; };
  for (const b of blocks) {
    if (!b.table) { room(3); pages[pages.length - 1].push(b.html); continue; }
    let part = []; const flush = last => { if (part.length || last) pages[pages.length - 1].push(`<table class="${esc(b.cls)}">${b.head}<tbody>${part.join('')}</tbody>${last ? b.foot : ''}</table>`); part = []; };
    room(1.5);
    b.rows.forEach((r, i) => { if (used + 1 > cap) { flush(false); pages.push([]); used = 2 + 1.5; } part.push(r); used += 1; if (i === b.rows.length - 1) { if (b.foot) used += 1; flush(true); } });
    if (!b.rows.length) flush(true);
  }
  const co = company(), lg = shopLogo(), n = pages.length, when = new Date().toLocaleString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  const W = land ? '277mm' : '190mm';
  const doc = `<!doctype html><html><head><meta charset="utf-8"><title>${esc(title)}</title><style>*{box-sizing:border-box}body{margin:0;background:#fff;font:9.5pt/1.4 Arial,Helvetica,sans-serif;color:#1b1b1b;--ok:#0e7c4a;--danger:#b8352a;--muted:#777}
.rp-page{width:${W};padding:1mm 0;display:flex;flex-direction:column}.hd{display:flex;justify-content:space-between;align-items:flex-start;gap:6mm;border-bottom:.7mm solid #5b2d14;padding-bottom:3mm;margin-bottom:4mm}.hd img{height:15mm;width:auto;max-width:45mm;object-fit:contain;margin-right:3mm}.co{display:flex;align-items:center}
h1{margin:0;font:700 14pt Georgia,serif;color:#4a2511}h2{margin:0;font:700 13pt Georgia,serif;color:#4a2511;text-align:right}.sub{color:#666;font-size:8.5pt;text-align:right;max-width:110mm}
.hd2{display:flex;justify-content:space-between;border-bottom:.3mm solid #c9a77a;padding-bottom:1.5mm;margin-bottom:3mm;color:#4a2511;font:700 10pt Georgia,serif}.hd2 span{font:8.5pt Arial,sans-serif;color:#777}
table{width:100%;border-collapse:collapse;margin-bottom:3mm}th{background:#f3e3c7;color:#4a2511;text-align:left;font-size:7.8pt;text-transform:uppercase;letter-spacing:.03em;padding:1.6mm 2mm;vertical-align:bottom}td{padding:1.5mm 2mm;border-bottom:.2mm solid #eadcc4;vertical-align:top}
.num{text-align:right;white-space:nowrap}.nowrap{white-space:nowrap}tfoot td{font-weight:700;background:#faf1e2;border-top:.4mm solid #c9a77a}
.r-sec td{background:#faf1e2;font-weight:700;color:#4a2511;text-transform:uppercase;font-size:8pt;letter-spacing:.04em}.r-sub td{font-weight:700;border-top:.3mm solid #c9a77a}.r-grp td{font-weight:700;color:#4a2511}.r-ind td:first-child{padding-left:6mm}.r-tot td{font-weight:700;color:#4a2511;border-top:.4mm solid #c9a77a;background:#faf1e2}
.hint,p{color:#666;font-size:8.5pt;margin:1mm 0 3mm}.ft{margin-top:auto;padding-top:2mm;border-top:.2mm solid #ddd;color:#999;font-size:7.5pt;display:flex;justify-content:space-between}
.tile,.kpi{border:.3mm solid #dcc4a0;border-radius:2mm;padding:2mm 3mm;background:#fffaf1}</style></head><body>
${pages.map((p, i) => `<div class="rp-page">${i === 0
    ? `<div class="hd"><div class="co">${lg ? `<img src="${esc(lg)}" alt="">` : ''}<div><h1>${esc(co.name || setting('name', ''))}</h1><div style="color:#666;font-size:8pt">${esc(co.address || '').replace(/\n/g, ', ')}</div></div></div><div><h2>${esc(title)}</h2><div class="sub">${esc(sub)}</div></div></div>`
    : `<div class="hd2">${esc(title)}<span>${esc(co.name || setting('name', ''))} · continued</span></div>`}
  ${p.join('')}<div class="ft"><span>${esc(co.name || setting('name', ''))} · printed ${esc(when)}</span><span>Page ${i + 1} of ${n}</span></div></div>`).join('')}</body></html>`;
  return savePdf(doc, String(name || title).replace(/[^\w.\-]+/g, '_'), '.rp-page', { fit: land ? 'A4L' : 'A4', margin: 10, width: land ? 1150 : 900 });
}

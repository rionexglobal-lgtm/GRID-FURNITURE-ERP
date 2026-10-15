// GRID Shop Manager — barcode label printing and the monthly stock count (scan with phone camera, photo, or a USB / Bluetooth scanner)
import { $, esc, num, r2, today, fmtDate, fmtTime, store, all, byId, setting } from './core.js';
import * as L from './logic.js';
import { money, money0, pill, empty, words, hit, toast, fail, openModal, closeModal, confirmBox, val, field, input, select, toCSV, download, saveDocument } from './ui.js';
import { barcodeSVG, validBarcode, readVideo, readPhoto } from './barcode.js';

const role = () => store.me?.role, office = () => L.can.office(role()), myId = () => store.me?.id;
const rr = () => window.__rerender();
const inr = (n, d = 2) => Number(num(n)).toLocaleString('en-IN', { maximumFractionDigits: d });

/* =====================================================================
   LABELS
   ===================================================================== */
const LABEL_CSS = `.sheet{position:relative;width:210mm;height:297mm;background:#fff;overflow:hidden;--name:6.8pt;--code:7pt;--price:8pt;--shop:5pt;--barh:8mm}
.lbl,.slot{position:absolute;box-sizing:border-box}
.lbl{padding:.5mm 1mm;display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;overflow:hidden;color:#000;font-family:Arial,Helvetica,sans-serif}
.lbl .l-shop{font-size:var(--shop);font-weight:700;letter-spacing:.5pt;line-height:1.1;text-transform:uppercase;white-space:nowrap}
.lbl .l-name{font-size:var(--name);font-weight:800;line-height:1.08;max-width:100%;overflow:hidden;white-space:nowrap;text-overflow:ellipsis}
.sheet.wrap2 .lbl .l-name{white-space:normal;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;word-break:break-word}
.lbl svg{display:block;width:100%;height:var(--barh);margin:.35mm 0 .25mm;flex:none}
.lbl .l-code{font-size:var(--code);font-weight:700;line-height:1;letter-spacing:.4pt}
.lbl .l-price{font-size:var(--price);font-weight:800;line-height:1.15;margin-top:.25mm;white-space:nowrap}
.lbl.outl{outline:.25mm dashed #b9c0cc;outline-offset:-.25mm}.lbl.test{outline:.3mm solid #000;outline-offset:-.3mm}
.slot{border:.3mm dashed #d5d9e1;border-radius:1.2mm}.slot.used{background:repeating-linear-gradient(135deg,#f1eee8,#f1eee8 1.2mm,#e3ded4 1.2mm,#e3ded4 2.4mm);border-color:#d6cfc0}`;
try { document.head.insertAdjacentHTML('beforeend', `<style>${LABEL_CSS}</style>`); } catch (e) { }
const PRINT_CSS = `@page{size:A4 portrait;margin:0}html,body{margin:0;padding:0;background:#fff}*{-webkit-print-color-adjust:exact;print-color-adjust:exact}
.sheet{height:296mm;page-break-after:always;break-after:page}.sheet:last-child{page-break-after:auto;break-after:auto}
@media screen{body{background:#e9e6df;padding:10mm 0}.sheet{margin:0 auto 8mm;box-shadow:0 2mm 6mm rgba(0,0,0,.2)}.note{font:13px Arial;text-align:center;margin:0 0 6mm;color:#333}}@media print{.note{display:none}}`;
let lbSearch = '', lbPage = 0, lbStart = 0, lbAddQty = 1;
const perPage = S => S.cols * S.rows;
const priceText = (S, m) => S.priceMode === 'round' ? inr(Math.round(num(m)), 0) : S.priceMode === 'up' ? inr(Math.ceil(num(m) - 1e-9), 0) : inr(m, 2);
function labelInner(S, it) {
  let h = '';
  if (S.showShop && S.shopName) h += `<div class="l-shop">${esc(S.shopName)}</div>`;
  if (S.showName) h += `<div class="l-name">${esc(it.name)}</div>`;
  try { h += barcodeSVG(it.sku); } catch (e) { h += '<div style="font-size:6pt;color:#b00">Invalid barcode</div>'; }
  if (S.showCode) h += `<div class="l-code">${esc(it.sku)}</div>`;
  if (S.showPrice) h += `<div class="l-price">${esc(S.pricePrefix)} ${priceText(S, it.mrp)}</div>`;
  return h;
}
const sheetStyle = S => `--name:${num(S.nameSize, 6.8)}pt;--code:${num(S.codeSize, 7)}pt;--price:${num(S.priceSize, 8)}pt;--barh:${num(S.barH, 8)}mm`;
const pos = (S, i) => { const r = Math.floor(i / S.cols), c = i % S.cols; return `left:${(num(S.left) + num(S.offX) + c * (num(S.w) + num(S.hgap))).toFixed(2)}mm;top:${(num(S.top) + num(S.offY) + r * (num(S.h) + num(S.vgap))).toFixed(2)}mm;width:${S.w}mm;height:${S.h}mm`; };
function source(list) { const cum = []; let t = 0; for (const e of list) { t += num(e.qty); cum.push(t); } return { total: t, at(li) { if (li < 0 || li >= t) return null; let i = 0; while (cum[i] <= li) i++; return list[i]; } }; }
function sheetHTML(S, p, src, { preview = false, test = false, start = 0 } = {}) {
  const n = perPage(S); let h = `<div class="sheet${S.wrapName ? ' wrap2' : ''}" style="${sheetStyle(S)}">`;
  for (let i = 0; i < n; i++) {
    const ps = pos(S, i);
    if (test) { h += `<div class="lbl test" style="${ps}">${labelInner(S, { name: 'TEST STICKER ' + (i + 1), sku: String(1000 + i), mrp: 12345.67 })}</div>`; continue; }
    const li = p * n + i - start;
    if (li < 0) { if (preview) h += `<div class="slot used" style="${ps}"></div>`; continue; }
    const it = src.at(li);
    if (it) h += `<div class="lbl${preview ? ' outl' : ''}" style="${ps}">${labelInner(S, it)}</div>`; else if (preview) h += `<div class="slot" style="${ps}"></div>`;
  }
  return h + '</div>';
}
function fitWarnings(S) {
  const w = [], right = num(S.left) + num(S.offX) + S.cols * num(S.w) + (S.cols - 1) * num(S.hgap), bottom = num(S.top) + num(S.offY) + S.rows * num(S.h) + (S.rows - 1) * num(S.vgap);
  if (right > 210.05) w.push(`The stickers run ${r2(right - 210)} mm past the right edge of the A4 page.`);
  if (bottom > 297.05) w.push(`The stickers run ${r2(bottom - 297)} mm past the bottom of the page.`);
  return w;
}
export const labels = {
  title: 'Barcode Labels', icon: '🏷', roles: ['admin', 'manager', 'billing'],
  head: () => `<button class="btn" data-a="lbset">⚙ Sticker layout</button><button class="btn" data-a="lbtest">🧪 Test page</button><button class="btn btn-accent" data-a="lbprint">⬇ Print file</button>`,
  body() {
    const S = L.labelSettings(), q = L.labelQueue(), n = perPage(S), total = q.reduce((x, e) => x + num(e.qty), 0), pages = total ? Math.ceil((total + lbStart) / n) : 0;
    if (lbPage >= Math.max(1, pages)) lbPage = Math.max(0, pages - 1);
    const w = words(lbSearch), res = lbSearch.trim() ? all('items').filter(i => i.sku.toLowerCase() === lbSearch.trim().toLowerCase() || hit(i.name + ' ' + i.sku + ' ' + i.category, w)).slice(0, 12) : [];
    const pbs = all('purchases').sort((a, b) => b.date.localeCompare(a.date) || (b.createdAt || 0) - (a.createdAt || 0)).slice(0, 30);
    const warn = fitWarnings(S);
    return `<div class="lb-grid"><div>
      <div class="panel" style="margin-bottom:14px"><div class="panel-h"><h2>➕ Add stickers</h2></div>
        <div class="toolbar" style="margin-bottom:8px"><input id="lbS" class="inp" style="flex:1" placeholder="Scan barcode or type item name / SKU…" autocomplete="off" value="${esc(lbSearch)}"><input id="lbQ" class="inp num" type="number" min="1" step="1" value="${lbAddQty}" style="width:80px" title="Stickers per item"></div>
        ${res.length ? `<div class="list">${res.map(i => `<div class="list-item" style="padding:8px 10px"><span><b>${esc(i.name)}</b><div class="muted mono" style="font-size:11px">${esc(i.sku)} · ${esc(i.category)} · ${money(i.mrp)}${office() ? ' · stock ' + num(i.onHand) : ''}</div></span><button class="btn btn-sm btn-ok" data-add="${i.id}">＋ ${lbAddQty}</button></div>`).join('')}</div>` : lbSearch.trim() ? '<p class="hint">No item found.</p>' : '<p class="hint">Scanning a barcode and pressing Enter adds it straight away.</p>'}
        <div class="toolbar" style="margin-top:12px;gap:8px;flex-wrap:wrap">${pbs.length ? '<button class="btn" data-a="lbbills">🧾 From purchase bills…</button>' : ''}<button class="btn" data-a="lbstock">📦 From stock in hand…</button></div>
        <p class="hint" style="margin-top:4px">Bills: tick one or more bills — one sticker per piece received. Stock: one sticker per piece in stock, for all items or the categories you choose.</p>
      </div>
      <div class="panel"><div class="panel-h"><h2>🖨 Print queue</h2><span class="hint">${q.length} item${q.length === 1 ? '' : 's'} · <b>${total}</b> stickers · ${pages} sheet${pages === 1 ? '' : 's'}</span></div>
        ${q.length ? `<div class="tw"><table><thead><tr><th>Item</th><th class="num" style="width:130px">MRP on sticker</th><th class="num" style="width:90px">Stickers</th><th></th></tr></thead><tbody>${q.map((e, i) => `<tr><td><b>${esc(e.name)}</b><div class="muted mono" style="font-size:11px">${esc(e.sku)}${validBarcode(e.sku) ? '' : ' <span class="pill p-unpaid">invalid barcode</span>'}</div></td><td><input class="inp inp-sm num" type="number" min="0" step=".01" inputmode="decimal" data-mrp="${i}" value="${r2(e.mrp)}" title="Change the price printed on this sticker">${(it => it && Math.abs(num(it.mrp) - num(e.mrp)) > 0.009 ? `<div class="muted" style="font-size:11px;text-align:right">Item MRP ${money(it.mrp)}</div>` : '')(byId('items', e.itemId))}</td><td><input class="inp inp-sm num" type="number" min="1" step="1" data-q="${i}" value="${e.qty}"></td><td><button class="icon-btn" data-rm="${i}" title="Remove">✕</button></td></tr>`).join('')}</tbody></table></div>
          <div style="display:flex;justify-content:flex-end;margin-top:8px"><button class="btn btn-sm btn-danger" data-a="lbclear">Clear queue</button></div>` : empty('🏷', 'The queue is empty. Add items above, or use “Print labels” on a purchase bill.')}
      </div></div>
      <div class="panel lb-prevpanel"><div class="panel-h"><h2>Sheet preview</h2><span class="hint">${esc(L.LABEL_PRESETS[S.preset]?.name || 'Custom layout')} · ${S.w} × ${S.h} mm · ${n} per sheet</span></div>
        ${warn.length ? `<div class="alert a-bad">${warn.map(esc).join('<br>')}</div>` : ''}
        <div class="toolbar" style="margin-bottom:8px"><label class="hint">Start at sticker</label><input id="lbStart" class="inp num" type="number" min="1" max="${n}" value="${lbStart + 1}" style="width:80px"><span class="hint">Use this for a part-used sheet.</span>
          ${pages > 1 ? `<span style="margin-left:auto;display:flex;gap:6px;align-items:center"><button class="btn btn-sm" data-pg="-1">‹</button><span class="hint">Sheet ${lbPage + 1} of ${pages}</span><button class="btn btn-sm" data-pg="1">›</button></span>` : ''}</div>
        <div id="lbPrev" class="lb-prev"><div class="lb-scale">${sheetHTML(S, lbPage, source(q), { preview: true, start: lbStart })}</div></div>
        <p class="hint" style="margin-top:8px">“Print file” saves a page that opens the print dialog. Print at <b>100% / Actual size</b> with margins <b>None</b>. If stickers sit a little off, nudge them in Sticker layout.</p></div></div>`;
  },
  after() {
    const box = $('lbPrev'); if (!box) return; const sc = box.querySelector('.lb-scale'), sheet = sc.firstElementChild;
    const k = box.clientWidth / sheet.offsetWidth; sc.style.transform = `scale(${k})`; box.style.height = (sheet.offsetHeight * k) + 'px';
    if (document.activeElement?.id !== 'lbS' && lbSearch === '') { /* nothing */ }
  },
  bind(root) {
    const add = async (it, qty) => { try { await L.addLabels([{ itemId: it.id, sku: it.sku, name: it.name, mrp: it.mrp, qty }]); toast(`${qty} × ${it.name} added.`); } catch (e) { fail(e); } };
    root.addEventListener('input', e => {
      if (e.target.id === 'lbS') { lbSearch = e.target.value; rr(); }
      if (e.target.id === 'lbQ') { lbAddQty = Math.max(1, Math.round(num(e.target.value)) || 1); }
    });
    root.addEventListener('keydown', e => {
      if (e.target.id !== 'lbS' || e.key !== 'Enter') return; e.preventDefault();
      const q = lbSearch.trim(), ex = all('items').filter(i => i.sku.toLowerCase() === q.toLowerCase());
      if (ex.length === 1) { add(ex[0], lbAddQty); lbSearch = ''; rr(); } else if (!ex.length) toast('No item with that barcode.', 'warn');
    });
    root.addEventListener('change', async e => {
      if (e.target.id === 'lbStart') { const S = L.labelSettings(); lbStart = Math.min(perPage(S) - 1, Math.max(0, Math.round(num(e.target.value)) - 1)); lbPage = 0; rr(); }
      const mi = e.target.dataset.mrp; if (mi != null) { const q = L.labelQueue().map(x => ({ ...x })), row = q[+mi], v = r2(num(e.target.value)); if (!(v > 0)) return toast('Enter the MRP.', 'warn'); row.mrp = v;
        try { await L.setLabelQueue(q); const it = byId('items', row.itemId); if (it && Math.abs(num(it.mrp) - v) > 0.009 && office()) mrpAsk(it, v); } catch (er) { fail(er); } return; }
      const qi = e.target.dataset.q; if (qi != null) { const q = L.labelQueue().map(x => ({ ...x })); q[+qi].qty = Math.max(1, Math.round(num(e.target.value)) || 1); try { await L.setLabelQueue(q); } catch (er) { fail(er); } }
    });
    root.addEventListener('click', async e => {
      const a = e.target.closest('[data-add]'); if (a) return add(byId('items', a.dataset.add), lbAddQty);
      const rm = e.target.closest('[data-rm]'); if (rm) { const q = L.labelQueue().filter((_, i) => i !== +rm.dataset.rm); try { await L.setLabelQueue(q); } catch (er) { fail(er); } return; }
      const pg = e.target.closest('[data-pg]'); if (pg) { lbPage = Math.max(0, lbPage + +pg.dataset.pg); return rr(); }
      const act = e.target.closest('[data-a]')?.dataset.a;
      if (act === 'lbbills') return billsDialog();
      if (act === 'lbstock') return stockDialog();
      if (act === 'lbbill') { const p = byId('purchases', val('lbPB')); if (!p) return; try { await L.addLabels(p.lines.map(l => { const it = byId('items', l.itemId) || {}; return { itemId: l.itemId, sku: l.sku || it.sku, name: l.name, mrp: it.mrp, qty: l.qty }; })); toast(`Stickers for ${p.no} added.`); } catch (er) { fail(er); } }
      if (act === 'lbclear') { if (await confirmBox('Clear the print queue?', 'All items in the queue will be removed.', 'Clear', true)) L.setLabelQueue([]).then(() => toast('Queue cleared.')).catch(fail); }
      if (act === 'lbset') layoutDialog();
      if (act === 'lbtest') printLabels(true);
      if (act === 'lbprint') printLabels(false);
    });
  },
  keep: ['lbS']
};
// the sticker price was changed: offer to change the item's MRP too (so invoices and future stickers use it)
function mrpAsk(it, v) {
  openModal('Update item MRP too?', `<p style="margin:0;line-height:1.6">The sticker for <b>${esc(it.name)}</b> will print <b>${money(v)}</b>. The item's MRP is still <b>${money(it.mrp)}</b>.<br>Change the item's MRP to ${money(v)} as well? New quotations, orders and stickers will then use the new price.</p>`,
    [{ label: 'Only this sticker' }, { label: 'Update item MRP', cls: 'btn-ok', onClick: async () => { await L.saveItem({ id: it.id, sku: it.sku, name: it.name, category: it.category, mrp: v, reorder: it.reorder, cost: '' }); toast('Item MRP updated to ' + money(v) + '.'); } }]);
}
async function printLabels(test) {
  const S = L.labelSettings(), q = L.labelQueue().filter(e => validBarcode(e.sku)), n = perPage(S);
  if (!test && !q.length) return toast('Add items to the print queue first.', 'warn');
  const src = source(q), pages = test ? 1 : Math.ceil((src.total + lbStart) / n); let sheets = '';
  for (let p = 0; p < pages; p++) sheets += sheetHTML(S, p, src, { test, start: lbStart });
  const html = `<!doctype html><html><head><meta charset="utf-8"><title>${test ? 'Test page' : 'Barcode labels'}</title><style>${LABEL_CSS}${PRINT_CSS}</style></head><body><p class="note">${test ? 'Test page' : src.total + ' stickers on ' + pages + ' sheet(s)'} — print at 100% (Actual size), margins None, A4.</p>${sheets}<script>window.onload=function(){setTimeout(function(){window.print()},400)}<\/script></body></html>`;
  const ok = await download((test ? 'label_test_page_' : 'labels_') + today() + '.html', html);
  if (ok && !test) openModal('Labels saved', `<p style="margin:0;line-height:1.6">Open the file to print ${src.total} stickers. After they print correctly, clear the queue so they are not printed twice.</p>`,
    [{ label: 'Keep queue' }, { label: 'Clear queue', cls: 'btn-danger', onClick: async () => { await L.setLabelQueue([]); lbStart = 0; toast('Queue cleared.'); } }]);
}
function layoutDialog() {
  const S = L.labelSettings();
  const nf = (id, label, v, step = .1) => field(label, input(id, v, `type="number" step="${step}" inputmode="decimal"`));
  const ck = (id, label, v) => `<label class="check"><input type="checkbox" id="${id}"${v ? ' checked' : ''}> ${label}</label>`;
  openModal('Sticker layout', `<div id="lsWrap">${field('Sticker sheet', select('lsPreset', [...Object.entries(L.LABEL_PRESETS).map(([k, p]) => [k, p.name + ' — ' + p.desc]), ['custom', 'Custom size']], S.preset))}
    <div class="row3">${nf('lsW', 'Sticker width (mm)', S.w)}${nf('lsH', 'Sticker height (mm)', S.h)}${nf('lsCols', 'Columns', S.cols, 1)}</div>
    <div class="row3">${nf('lsRows', 'Rows', S.rows, 1)}${nf('lsHg', 'Gap between columns (mm)', S.hgap)}${nf('lsVg', 'Gap between rows (mm)', S.vgap)}</div>
    <div class="row3">${nf('lsLeft', 'Left margin (mm)', S.left)}${nf('lsTop', 'Top margin (mm)', S.top)}<div></div></div>
    <div class="row2">${nf('lsOffX', 'Printer nudge → right (mm, minus = left)', S.offX)}${nf('lsOffY', 'Printer nudge ↓ down (mm, minus = up)', S.offY)}</div>
    <h3 style="margin:8px 0 6px;font-size:14px">What prints on each sticker</h3>
    <div style="display:flex;flex-wrap:wrap;gap:4px 16px">${ck('lsName', 'Item name', S.showName)}${ck('lsWrap2', 'Name on 2 lines', S.wrapName)}${ck('lsCode', 'Barcode number', S.showCode)}${ck('lsPrice', 'Price', S.showPrice)}${ck('lsShop', 'Shop name', S.showShop)}</div>
    <div class="row3">${field('Price text', input('lsPfx', S.pricePrefix))}${field('Price rounding', select('lsPm', [['exact', 'Exact (12,345.67)'], ['round', 'Round (12,346)'], ['up', 'Round up']], S.priceMode))}${field('Shop name text', input('lsShopN', S.shopName))}</div>
    <div class="row3">${nf('lsBar', 'Barcode height (mm)', S.barH)}${nf('lsNs', 'Name size (pt)', S.nameSize)}${nf('lsPs', 'Price size (pt)', S.priceSize)}</div>
    <div class="lb-prev" id="lsPrev" style="height:120px;overflow:hidden"></div></div>`,
    [{ label: 'Reset', onClick: async () => { await L.saveLabelSettings({ ...L.LABEL_DEFAULTS }); toast('Back to the GRID 5 × 13 layout.'); } }, { label: 'Cancel' },
     { label: 'Save layout', cls: 'btn-ok', onClick: async () => { await L.saveLabelSettings(read()); toast('Sticker layout saved.'); } }],
    { wide: true, onOpen: () => {
      $('lsPreset').onchange = () => { const p = L.LABEL_PRESETS[val('lsPreset')]; if (!p) return; const m = { w: 'lsW', h: 'lsH', cols: 'lsCols', rows: 'lsRows', hgap: 'lsHg', vgap: 'lsVg', top: 'lsTop', left: 'lsLeft' }; Object.entries(m).forEach(([k, id]) => $(id).value = p.v[k]); draw(); };
      $('lsWrap').addEventListener('input', e => { if (['lsW', 'lsH', 'lsCols', 'lsRows', 'lsHg', 'lsVg', 'lsTop', 'lsLeft'].includes(e.target.id)) $('lsPreset').value = 'custom'; draw(); });
      $('lsWrap').addEventListener('change', draw); draw();
    } });
  function read() {
    return { preset: val('lsPreset'), w: num(val('lsW')), h: num(val('lsH')), cols: Math.max(1, Math.round(num(val('lsCols')))), rows: Math.max(1, Math.round(num(val('lsRows')))), hgap: num(val('lsHg')), vgap: num(val('lsVg')), left: num(val('lsLeft')), top: num(val('lsTop')), offX: num(val('lsOffX')), offY: num(val('lsOffY')),
      showName: $('lsName').checked, wrapName: $('lsWrap2').checked, showCode: $('lsCode').checked, showPrice: $('lsPrice').checked, showShop: $('lsShop').checked, pricePrefix: val('lsPfx'), priceMode: val('lsPm'), shopName: val('lsShopN'), barH: num(val('lsBar')), nameSize: num(val('lsNs')), priceSize: num(val('lsPs')), codeSize: L.labelSettings().codeSize };
  }
  function draw() {
    const S2 = read(), it = L.labelQueue()[0] || all('items')[0] || { name: 'SAMPLE ITEM NAME', sku: '1001', mrp: 12345 };
    const k = 3.2; // px per mm in this small preview
    $('lsPrev').innerHTML = `<div style="display:flex;gap:10px;align-items:center;height:100%;padding:6px"><div style="position:relative;width:${S2.w * k}px;height:${S2.h * k}px;flex:none"><div style="transform:scale(${k / 3.7795});transform-origin:0 0"><div class="sheet${S2.wrapName ? ' wrap2' : ''}" style="${sheetStyle(S2)};width:${S2.w}mm;height:${S2.h}mm"><div class="lbl outl" style="left:0;top:0;width:${S2.w}mm;height:${S2.h}mm">${labelInner(S2, it)}</div></div></div></div><span class="hint">${fitWarnings(S2).map(esc).join('<br>') || 'One sticker at about real size. Fits the A4 page.'}</span></div>`;
  }
}
// choose several purchase bills → one sticker per piece received on each
function billsDialog() {
  const bills = all('purchases').filter(p => (p.lines || []).length).sort((a, b) => b.date.localeCompare(a.date) || (b.createdAt || 0) - (a.createdAt || 0)).slice(0, 200);
  const pcs = p => p.lines.reduce((x, l) => x + num(l.qty), 0);
  let q = '';
  const list = () => { const w = words(q); return bills.filter(p => !q.trim() || hit(`${p.no} ${p.billNo || ''} ${p.supplierName} ${fmtDate(p.date)}`, w)); };
  const draw = keep => { const chosen = keep || new Set([...document.querySelectorAll('[data-bill]:checked')].map(x => x.dataset.bill));
    $('lbBills').innerHTML = list().map(p => `<label class="list-item" style="padding:8px 10px;display:flex;gap:10px;align-items:center;cursor:pointer"><input type="checkbox" data-bill="${p.id}"${chosen.has(p.id) ? ' checked' : ''}><span style="flex:1"><b>${esc(p.no)}</b> · ${esc(p.supplierName || '')}${p.billNo ? ' · bill ' + esc(p.billNo) : ''}<div class="muted" style="font-size:12px">${fmtDate(p.date)} · ${p.lines.length} item${p.lines.length === 1 ? '' : 's'}</div></span><b>${pcs(p)} pcs</b></label>`).join('') || '<p class="hint">No bill found.</p>';
    sum(); };
  const sum = () => { const ids = [...document.querySelectorAll('[data-bill]:checked')].map(x => x.dataset.bill), n = ids.reduce((x, id) => x + pcs(byId('purchases', id)), 0); $('lbBillSum').textContent = ids.length ? `${ids.length} bill${ids.length === 1 ? '' : 's'} · ${n} stickers` : 'No bill ticked'; };
  openModal('Stickers from purchase bills', `<div class="toolbar" style="margin-bottom:8px"><input id="lbBillQ" class="inp" style="flex:1" placeholder="Search bill no., supplier, date…" autocomplete="off"><button class="btn btn-sm" id="lbBillAll" type="button">Tick all shown</button><button class="btn btn-sm" id="lbBillNone" type="button">Clear</button></div>
    <div id="lbBills" class="list" style="max-height:52vh;overflow:auto"></div><p class="hint" id="lbBillSum" style="margin-top:8px"></p>`,
  [{ label: 'Cancel' }, { label: 'Add stickers', cls: 'btn-ok', onClick: async () => {
    const ps = [...document.querySelectorAll('[data-bill]:checked')].map(x => byId('purchases', x.dataset.bill)).filter(Boolean);
    if (!ps.length) throw Error('Tick at least one bill.');
    await L.addLabels(ps.flatMap(p => p.lines.map(l => { const it = byId('items', l.itemId) || {}; return { itemId: l.itemId, sku: l.sku || it.sku, name: l.name, mrp: it.mrp, qty: l.qty }; })));
    toast(`Stickers added for ${ps.length} bill${ps.length === 1 ? '' : 's'}.`);
  } }], { onOpen: b => {
    draw(new Set());
    b.querySelector('#lbBillQ').oninput = e => { q = e.target.value; draw(); };
    b.querySelector('#lbBillAll').onclick = () => { b.querySelectorAll('[data-bill]').forEach(x => x.checked = true); sum(); };
    b.querySelector('#lbBillNone').onclick = () => { b.querySelectorAll('[data-bill]').forEach(x => x.checked = false); sum(); };
    b.addEventListener('change', e => { if (e.target.dataset.bill) sum(); });
  } });
}
// one sticker per piece in stock, for all items or chosen categories — no need to pick items one by one
function stockDialog() {
  const items = all('items').filter(i => num(i.onHand) > 0 && i.sku);
  const cats = [...new Set(items.map(i => i.category || 'Uncategorised'))].sort((a, b) => a.localeCompare(b));
  const catOf = i => i.category || 'Uncategorised';
  const pick = () => { const all1 = $('lbStAll').checked, on = new Set([...document.querySelectorAll('[data-cat]:checked')].map(x => x.dataset.cat)), one = $('lbStOne').checked, skip = $('lbStSkip').checked, inQ = new Set(L.labelQueue().map(e => e.itemId));
    return items.filter(i => (all1 || on.has(catOf(i))) && !(skip && inQ.has(i.id))).map(i => ({ itemId: i.id, sku: i.sku, name: i.name, mrp: i.mrp, qty: one ? 1 : Math.round(num(i.onHand)) })).filter(e => e.qty > 0); };
  const sum = () => { const all1 = $('lbStAll').checked; document.querySelectorAll('[data-cat]').forEach(x => x.disabled = all1); const e = pick(); $('lbStSum').innerHTML = e.length ? `<b>${e.length}</b> item${e.length === 1 ? '' : 's'} · <b>${e.reduce((x, y) => x + y.qty, 0)}</b> stickers` : 'Nothing selected.'; };
  openModal('Stickers from stock in hand', items.length ? `<label style="display:flex;gap:8px;align-items:center;margin-bottom:8px"><input type="checkbox" id="lbStAll" checked> <b>All categories</b></label>
    <div id="lbStCats" style="display:grid;grid-template-columns:repeat(auto-fill,minmax(180px,1fr));gap:6px 12px;max-height:36vh;overflow:auto;padding:8px;border:1px solid var(--line);border-radius:10px">${cats.map(c => { const its = items.filter(i => catOf(i) === c); return `<label style="display:flex;gap:6px;align-items:center"><input type="checkbox" data-cat="${esc(c)}" disabled> ${esc(c)} <span class="muted" style="font-size:12px">(${its.length} · ${its.reduce((x, i) => x + Math.round(num(i.onHand)), 0)} pcs)</span></label>`; }).join('')}</div>
    <div style="display:grid;gap:6px;margin-top:10px"><label style="display:flex;gap:8px;align-items:center"><input type="checkbox" id="lbStOne"> Only one sticker per item (instead of one per piece)</label>
    <label style="display:flex;gap:8px;align-items:center"><input type="checkbox" id="lbStSkip"> Skip items already in the print queue</label></div>
    <p class="hint" id="lbStSum" style="margin-top:10px"></p><p class="hint">Only items with stock above zero and a barcode are included. You can still change quantities or prices in the queue.</p>` : '<p class="hint">No item has stock in hand.</p>',
  items.length ? [{ label: 'Cancel' }, { label: 'Add stickers', cls: 'btn-ok', onClick: async () => { const e = pick(); if (!e.length) throw Error('Choose at least one category.'); await L.addLabels(e); toast(`${e.reduce((x, y) => x + y.qty, 0)} stickers added for ${e.length} items.`); } }] : [{ label: 'Close' }],
  { onOpen: b => { if (!items.length) return; b.addEventListener('change', sum); sum(); } });
}
export function queueLabelsFromPurchase(p) {
  return L.addLabels(p.lines.map(l => { const it = byId('items', l.itemId) || {}; return { itemId: l.itemId, sku: l.sku || it.sku, name: l.name, mrp: it.mrp, qty: l.qty }; }));
}

/* =====================================================================
   STOCK COUNT
   ===================================================================== */
let cSel = (() => { try { return sessionStorage.getItem('gsm-count') || ''; } catch (e) { return ''; } })(), cTab = 'count', crFilter = 'diff', crCat = '', crSearch = '';
let sheet = null, sheetFor = '', dirty = false, saving = false, saveTimer = 0, cam = { on: false, stream: null, last: '', lastAt: 0 }, ask = false;
const selCount = () => { const c = byId('counts', cSel); return c || all('counts').filter(x => x.status === 'open').sort((a, b) => b.startedAt - a.startedAt)[0] || null; };
const itemName = id => byId('items', id)?.name || 'Item';
function loadSheet(c) { if (!c) { sheet = null; sheetFor = ''; return; } if (sheetFor === c.id && dirty) return; const s = L.mySheet(c.id); sheet = { lines: { ...(s.lines || {}) }, unknown: { ...(s.unknown || {}) }, log: [...(s.log || [])] }; sheetFor = c.id; }
function queueSave() {
  dirty = true; clearTimeout(saveTimer); setSaved('Saving…');
  saveTimer = setTimeout(async () => {
    if (saving) return queueSave(); saving = true; const c = byId('counts', sheetFor);
    try { await L.saveMySheet(sheetFor, sheet); dirty = false; setSaved('✓ Saved'); } catch (e) { fail(e); setSaved('Not saved — will retry'); setTimeout(() => dirty && queueSave(), 4000); }
    saving = false; if (!c) dirty = false;
  }, 700);
}
const setSaved = t => { const el = $('scSaved'); if (el) el.textContent = t; };
let actx;
function beep(ok) { try { actx = actx || new (window.AudioContext || window.webkitAudioContext)(); const o = actx.createOscillator(), g = actx.createGain(); o.frequency.value = ok ? 1250 : 330; g.gain.value = .06; o.connect(g); g.connect(actx.destination); o.start(); o.stop(actx.currentTime + (ok ? .07 : .22)); } catch (e) { } try { navigator.vibrate && navigator.vibrate(ok ? 30 : [60, 40, 60]); } catch (e) { } }
function feedback(html, ok) { const m = $('scMsg'); if (!m) return; m.className = 'sc-msg ' + (ok ? 'ok' : 'bad'); m.innerHTML = html; }

export const stockcount = {
  title: 'Stock Count', icon: '🔢', roles: ['admin', 'manager', 'billing', 'sales'], static: true,
  head: () => office() ? `<button class="btn btn-accent" data-a="newcount">＋ New count</button>` : '',
  body() {
    const c = selCount(); if (c) cSel = c.id; loadSheet(c);
    const counts = all('counts').filter(x => office() || x.status === 'open').sort((a, b) => (a.status === 'open' ? 0 : 1) - (b.status === 'open' ? 0 : 1) || b.startedAt - a.startedAt).slice(0, 8);
    if (!c) return empty('🔢', office() ? 'No stock count yet. Press “＋ New count” to start this month’s count — then staff open Stock Count on their phones and scan.' : 'No stock count is open. The manager starts one each month.');
    const tabs = office() ? `<div class="tabs" style="margin-bottom:12px"><button data-ct="count" class="${cTab === 'count' ? 'active' : ''}">Scan & count</button><button data-ct="review" class="${cTab === 'review' ? 'active' : ''}">Review & post</button></div>` : '';
    return `${counts.length > 1 ? `<div class="chips" style="margin-bottom:10px">${counts.map(x => `<button class="chip${x.id === c.id ? ' active' : ''}" data-cs="${x.id}">${esc(x.name)} <small>${x.status === 'open' ? 'open' : x.status}</small></button>`).join('')}</div>` : ''}
      <div class="li-s" style="margin:0 0 10px"><b style="font-size:16px">${esc(c.name)}</b>${pill(c.status === 'open' ? 'open' : c.status === 'posted' ? 'done' : 'followup', c.status === 'open' ? 'Counting' : c.status === 'posted' ? 'Posted' : 'Closed')}<span>${(c.categories || []).length ? esc(c.categories.join(', ')) : 'All items'}</span><span>Started ${fmtDate(c.date)}</span>${c.blind ? '<span>Blind count</span>' : ''}</div>
      ${tabs}${cTab === 'review' && office() ? '<div id="crBox"></div>' : countScreen(c)}`;
  },
  after() { const c = selCount(); if (cTab === 'review' && office()) drawReview(c); else drawMine(c); },
  onData() {
    const c = selCount(); if (!c) return rr();
    const box = $('vBody'); if (box && box.dataset.cstat !== c.status + c.id) { box.dataset.cstat = c.status + c.id; return rr(); }
    if (!dirty) loadSheet(c);
    if (cTab === 'review' && office()) drawReview(c); else drawMine(c);
  },
  bind(root) {
    const c0 = selCount(); if (c0) root.dataset.cstat = c0.status + c0.id;
    root.addEventListener('click', async e => {
      const t = e.target.closest('[data-ct]'); if (t) { cTab = t.dataset.ct; stopCam(); return rr(); }
      const cs = e.target.closest('[data-cs]'); if (cs) { cSel = cs.dataset.cs; try { sessionStorage.setItem('gsm-count', cSel); } catch (er) { } dirty = false; stopCam(); return rr(); }
      const c = selCount(); if (!c) return;
      if (e.target.closest('#scCam')) return cam.on ? stopCam() : startCam();
      if (e.target.closest('#scUndo')) return undo();
      const pm = e.target.closest('[data-pm]'); if (pm) { const [k, d] = pm.dataset.pm.split('|'); return setQty(k, num(sheet.lines[k]) + +d); }
      const ed = e.target.closest('[data-edq]'); if (ed) return askQty(itemName(ed.dataset.edq), num(sheet.lines[ed.dataset.edq]), q => setQty(ed.dataset.edq, q), 'Set the counted quantity');
      const dd = e.target.closest('[data-pick]'); if (dd) { $('scDrop').classList.remove('open'); $('scIn').value = ''; return bump(byId('items', dd.dataset.pick)); }
      const rv = e.target.closest('[data-crf]'); if (rv) { crFilter = rv.dataset.crf; return drawReview(c); }
      const br = e.target.closest('[data-brk]'); if (br) return breakdown(c, br.dataset.brk);
      const a = e.target.closest('[data-ca]')?.dataset.ca;
      if (a === 'close') { if (await confirmBox('Close counting?', 'Staff will not be able to add more counts. You can reopen it later.', 'Close counting')) L.setCountStatus(c, 'closed').then(() => toast('Counting closed.')).catch(fail); }
      if (a === 'reopen') L.setCountStatus(c, 'open').then(() => toast('Counting reopened.')).catch(fail);
      if (a === 'post') postDialog(c);
      if (a === 'csv') reviewCSV(c);
      if (a === 'print') reviewPrint(c);
    });
    root.addEventListener('click', e => { if (e.target.closest('[data-a=newcount]')) newCountDialog(); });
    root.addEventListener('keydown', e => {
      if (e.target.id !== 'scIn' || e.key !== 'Enter') return; e.preventDefault();
      const v = e.target.value.trim(); if (!v) return; e.target.value = ''; $('scDrop')?.classList.remove('open'); handleCode(v, 'typed');
    });
    root.addEventListener('input', e => {
      if (e.target.id === 'scIn') { const q = e.target.value.trim(), dd = $('scDrop'); if (q.length < 2 || /^\S+$/.test(q) && /\d/.test(q) && !/[a-z]{3}/i.test(q)) { dd.classList.remove('open'); return; }
        const w = words(q), r = all('items').filter(i => hit(i.name + ' ' + i.sku + ' ' + i.category, w)).slice(0, 8);
        dd.innerHTML = r.length ? r.map(i => `<div class="dd" data-pick="${i.id}"><span><b>${esc(i.name)}</b><br><span class="muted mono" style="font-size:11px">${esc(i.sku)} · ${esc(i.category)}</span></span><b>${num(sheet?.lines[i.id]) || ''}</b></div>`).join('') : '<div class="dd muted">No item found.</div>'; dd.classList.add('open'); }
      if (e.target.id === 'crS') { crSearch = e.target.value; drawReview(selCount()); }
    });
    root.addEventListener('change', async e => {
      if (e.target.id === 'scAsk') ask = e.target.checked;
      if (e.target.id === 'crCat') { crCat = e.target.value; drawReview(selCount()); }
      if (e.target.id === 'scPhoto') { const f = e.target.files[0]; e.target.value = ''; if (!f) return; feedback('Reading the photo…', true);
        try { const code = await readPhoto(f); if (code) handleCode(code, 'photo'); else { beep(false); feedback('No barcode found in the photo. Hold the phone 15–20 cm from the sticker, keep it flat and in good light, then try again.', false); } } catch (er) { feedback('Could not read that photo.', false); } }
    });
  }
};
function countScreen(c) {
  const open = c.status === 'open';
  return `${open ? `<div class="panel sc-panel"><div class="sc-row"><div class="picker" style="flex:1"><input id="scIn" class="inp sc-in" placeholder="Scan barcode, or type code / item name" autocomplete="off" enterkeyhint="go" inputmode="search"><div class="dropdown" id="scDrop"></div></div>
      <button class="btn sc-btn" id="scCam" title="Scan with camera">📷</button><label class="btn sc-btn" for="scPhoto" title="Take a photo of the sticker">🖼</label><input type="file" id="scPhoto" accept="image/*" capture="environment" hidden></div>
      <div id="scCamBox" class="sc-cam" hidden><video id="scVideo" playsinline muted></video><div class="sc-guide"></div></div>
      <div id="scMsg" class="sc-msg">Each scan adds 1. A USB or Bluetooth barcode scanner works in the box above too.</div>
      <div style="display:flex;justify-content:space-between;align-items:center;gap:8px;flex-wrap:wrap"><label class="check" style="margin:0"><input type="checkbox" id="scAsk"${ask ? ' checked' : ''}> Ask quantity after each scan</label><button class="btn btn-sm" id="scUndo">↶ Undo last</button></div></div>`
    : `<div class="alert a-info">${c.status === 'posted' ? 'This count has been posted to stock.' : 'Counting is closed for this count.'} ${office() ? '' : 'Ask the manager if you need to add more.'}</div>`}
    <div class="panel"><div class="panel-h"><h2>My count</h2><span class="hint" id="scSaved"></span></div><div id="scList"></div></div>`;
}
function drawMine(c) {
  const box = $('scList'); if (!box || !c || !sheet) return;
  const order = []; for (let i = sheet.log.length - 1; i >= 0; i--) { const k = sheet.log[i].k; if (!order.includes(k)) order.push(k); }
  Object.keys(sheet.lines).forEach(k => { if (!order.includes(k)) order.push(k); }); Object.keys(sheet.unknown).forEach(k => { if (!order.includes('x:' + k)) order.push('x:' + k); });
  const rows = order.filter(k => k.startsWith('x:') ? num(sheet.unknown[k.slice(2)]) : num(sheet.lines[k]));
  const units = Object.values(sheet.lines).reduce((x, q) => x + num(q), 0), open = c.status === 'open', showSys = office() || !c.blind;
  box.innerHTML = rows.length ? `<p class="hint" style="margin:0 0 8px"><b>${Object.values(sheet.lines).filter(q => num(q)).length}</b> items · <b>${units}</b> pieces counted by you</p><div class="list">${rows.slice(0, 300).map(k => {
    if (k.startsWith('x:')) return `<div class="list-item" style="padding:8px 10px"><span><b>Unknown barcode</b><div class="muted mono" style="font-size:11px">${esc(k.slice(2))}</div></span><b>${num(sheet.unknown[k.slice(2)])}</b></div>`;
    const it = byId('items', k); return `<div class="list-item" style="padding:8px 10px"><span style="min-width:0"><b>${esc(it?.name || 'Item')}</b><div class="muted mono" style="font-size:11px">${esc(it?.sku || '')}${showSys && it ? ' · system ' + num(it.onHand) : ''}</div></span>
      <span class="sc-qty">${open ? `<button class="icon-btn" data-pm="${k}|-1">−</button>` : ''}<button class="sc-q" data-edq="${k}"${open ? '' : ' disabled'}>${num(sheet.lines[k])}</button>${open ? `<button class="icon-btn" data-pm="${k}|1">＋</button>` : ''}</span></div>`; }).join('')}</div>`
    : empty('📦', open ? 'Nothing counted yet. Scan the first sticker.' : 'You did not count anything in this count.');
}
function handleCode(code, src) {
  const c = selCount(); if (!c || c.status !== 'open') return;
  const ex = all('items').filter(i => i.sku.toLowerCase() === code.toLowerCase());
  if (ex.length === 1) return bump(ex[0]);
  if (ex.length > 1) return openModal('Which item?', `<p class="hint" style="margin:0 0 8px">Barcode <b>${esc(code)}</b> is used by more than one item.</p><div class="list">${ex.map(i => `<button class="list-item" style="width:100%;text-align:left;cursor:pointer;background:none;border:0" data-ch="${i.id}"><span><b>${esc(i.name)}</b><div class="muted" style="font-size:11px">${esc(i.category)}</div></span></button>`).join('')}</div>`, [{ label: 'Cancel' }],
    { onOpen: b => b.addEventListener('click', e => { const x = e.target.closest('[data-ch]'); if (x) { closeModal(); bump(byId('items', x.dataset.ch)); } }) });
  if (src === 'typed' && /[a-z]{3}/i.test(code) && /\s/.test(code)) { const w = words(code), r = all('items').filter(i => hit(i.name + ' ' + i.sku, w)); if (r.length === 1) return bump(r[0]); }
  beep(false); feedback(`Barcode <b>${esc(code)}</b> is not in the item list.`, false);
  confirmBox('Unknown barcode', `<b>${esc(code)}</b> is not in the item list. Count it as an unknown item so the office can check it?`, 'Count as unknown').then(ok => { if (!ok) return; sheet.unknown[code] = num(sheet.unknown[code]) + 1; sheet.log.push({ k: 'x:' + code, q: 1, at: Date.now() }); queueSave(); drawMine(c); feedback(`Unknown barcode <b>${esc(code)}</b> noted.`, true); });
}
function bump(it) {
  if (!it) return;
  const go = n => { sheet.lines[it.id] = num(sheet.lines[it.id]) + n; sheet.log.push({ k: it.id, q: n, at: Date.now() }); queueSave(); beep(true); feedback(`✓ <b>${esc(it.name)}</b> — counted <b>${sheet.lines[it.id]}</b>`, true); drawMine(selCount()); };
  if (ask) askQty(it.name, 1, go, 'How many of this item?'); else go(1);
}
function setQty(k, q) { q = Math.max(0, Math.round(num(q))); const d = q - num(sheet.lines[k]); if (!d) return; sheet.lines[k] = q; sheet.log.push({ k, q: d, at: Date.now() }); queueSave(); drawMine(selCount()); }
function undo() {
  const l = sheet.log.pop(); if (!l) return toast('Nothing to undo.', 'warn');
  if (l.k.startsWith('x:')) sheet.unknown[l.k.slice(2)] = Math.max(0, num(sheet.unknown[l.k.slice(2)]) - l.q); else sheet.lines[l.k] = Math.max(0, num(sheet.lines[l.k]) - l.q);
  queueSave(); drawMine(selCount()); feedback(`Undone: ${l.q > 0 ? '−' : '+'}${Math.abs(l.q)} ${esc(l.k.startsWith('x:') ? l.k.slice(2) : itemName(l.k))}`, true);
}
function askQty(name, cur, cb, title) {
  openModal(title, `<p style="margin:0 0 8px"><b>${esc(name)}</b></p>${field('Quantity', input('aqN', cur, 'type="number" min="0" step="1" inputmode="numeric"'))}`, [{ label: 'Cancel' }, { label: 'OK', cls: 'btn-ok', onClick: () => { cb(Math.max(0, Math.round(num(val('aqN'))))); } }],
    { onOpen: b => { const i = $('aqN'); setTimeout(() => { i.focus(); i.select(); }, 60); i.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); $('modalFoot').lastElementChild.click(); } }); } });
}
async function startCam() {
  const box = $('scCamBox'), v = $('scVideo');
  if (!navigator.mediaDevices?.getUserMedia) return feedback('The camera can’t be used in this view. Use 🖼 to take a photo of the sticker, a barcode scanner, or type the code.', false);
  try { cam.stream = await navigator.mediaDevices.getUserMedia({ audio: false, video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 }, height: { ideal: 720 } } }); }
  catch (e) { return feedback('The camera isn’t available here (' + esc(e && e.name || 'blocked') + '). Use 🖼 to take a photo of the sticker instead — it works the same way.', false); }
  v.srcObject = cam.stream; try { await v.play(); } catch (e) { }
  box.hidden = false; cam.on = true; $('scCam').classList.add('btn-ok'); feedback('Point the camera at a sticker. Each scan adds 1.', true); loop();
}
function stopCam() { cam.on = false; if (cam.stream) cam.stream.getTracks().forEach(t => t.stop()); cam.stream = null; const b = $('scCamBox'); if (b) b.hidden = true; $('scCam')?.classList.remove('btn-ok'); }
async function loop() {
  const v = $('scVideo'); if (!cam.on || !v || !document.body.contains(v)) return stopCam();
  if (v.readyState >= 2 && !$('modalBg').classList.contains('open')) { try { const t = await readVideo(v); if (t && (t !== cam.last || Date.now() - cam.lastAt > 1800)) { cam.last = t; cam.lastAt = Date.now(); handleCode(t, 'camera'); } } catch (e) { } }
  setTimeout(loop, 90);
}
document.addEventListener('visibilitychange', () => { if (document.hidden) stopCam(); });

/* ---- review (office) ---- */
function reviewData(c) {
  const rows = L.countRows(c), { by, unknown, counters } = L.countTotals(c.id);
  return { rows, by, unknown, counters };
}
const F = { all: ['All items', () => true], diff: ['Differences', r => r.diff], short: ['Short', r => r.diff < 0], extra: ['Extra', r => r.diff > 0], match: ['Matching', r => r.counted != null && !r.diff], missing: ['Not counted', r => r.counted == null && r.sys], unknown: ['Unknown barcodes', () => false] };
function drawReview(c) {
  const box = $('crBox'); if (!box || !c) return;
  const { rows, by, unknown, counters } = reviewData(c), cats = [...new Set(rows.map(r => r.item.category))].sort(), w = words(crSearch);
  const base = rows.filter(r => (!crCat || r.item.category === crCat) && hit(r.item.name + ' ' + r.item.sku, w));
  const list = crFilter === 'unknown' ? [] : base.filter(F[crFilter][1]).sort((a, b) => Math.abs(b.diff || 0) * b.cost - Math.abs(a.diff || 0) * a.cost || a.item.name.localeCompare(b.item.name));
  const counted = rows.filter(r => r.counted != null), dv = r2(counted.reduce((x, r) => x + r.diff * r.cost, 0));
  const unk = Object.entries(unknown);
  box.innerHTML = `<div class="grid g4" style="gap:10px;margin-bottom:12px">${[['Items counted', counted.length + ' of ' + rows.length], ['Short', rows.filter(r => r.diff < 0).length + ' items'], ['Extra', rows.filter(r => r.diff > 0).length + ' items'], ['Value difference (at cost)', money0(dv)]].map(([l, v]) => `<div class="panel" style="padding:10px 12px;box-shadow:none"><div class="hint">${l}</div><b style="font-size:18px">${v}</b></div>`).join('')}</div>
    <p class="hint" style="margin:0 0 8px">${counters.length ? 'Counted by ' + counters.map(x => `<b>${esc(L.nm(x.id))}</b> (${x.items} items${x.at ? ', ' + fmtTime(x.at) : ''})`).join(', ') : 'Nobody has counted yet.'} · System stock is today’s figure — count after the day’s deliveries, or post soon after counting.</p>
    <div class="toolbar"><input id="crS" class="inp" style="flex:1;min-width:160px" placeholder="Search item…" value="${esc(crSearch)}"><select id="crCat" class="inp" style="width:auto"><option value="">All categories</option>${cats.map(x => `<option${x === crCat ? ' selected' : ''}>${esc(x)}</option>`).join('')}</select>
      <button class="btn btn-sm" data-ca="csv">⬇ CSV</button><button class="btn btn-sm" data-ca="print">⬇ Printable</button>
      ${c.status === 'open' ? '<button class="btn btn-sm" data-ca="close">Close counting</button>' : c.status === 'closed' ? '<button class="btn btn-sm" data-ca="reopen">Reopen</button>' : ''}${c.status !== 'posted' ? '<button class="btn btn-sm btn-ok" data-ca="post">Post adjustments</button>' : `<span class="pill p-done">Posted ${esc(c.adjNo || '')} · ${money0(c.adjValue)}</span>`}</div>
    <div class="chips" style="margin:8px 0 10px">${Object.entries(F).map(([k, [l, f]]) => `<button class="chip${k === crFilter ? ' active' : ''}" data-crf="${k}">${l}<small>${k === 'unknown' ? unk.length : base.filter(f).length}</small></button>`).join('')}</div>
    ${crFilter === 'unknown' ? (unk.length ? `<div class="tw"><table><thead><tr><th>Barcode</th><th>Counted by</th><th class="num">Qty</th></tr></thead><tbody>${unk.map(([code, m]) => `<tr><td class="mono">${esc(code)}</td><td>${Object.keys(m).map(id => esc(L.nm(id))).join(', ')}</td><td class="num">${Object.values(m).reduce((x, q) => x + num(q), 0)}</td></tr>`).join('')}</tbody></table></div><p class="hint" style="margin-top:6px">Add these as items in Stock if they are real products, then count them again.</p>` : empty('✓', 'No unknown barcodes.'))
    : `<div class="tw"><table><thead><tr><th>Item</th><th class="num">System</th><th class="num">Counted</th><th class="num">Difference</th><th class="num hide-m">Value (cost)</th></tr></thead><tbody>
      ${list.slice(0, 500).map(r => `<tr><td><b>${esc(r.item.name)}</b><div class="muted mono" style="font-size:11px">${esc(r.item.sku)} · ${esc(r.item.category)}</div></td><td class="num">${r.sys}</td>
        <td class="num">${r.counted == null ? '<span class="muted">—</span>' : `<a href="#" data-brk="${r.item.id}">${r.counted}</a>`}</td><td class="num">${r.diff == null ? '' : r.diff ? `<b style="color:var(--${r.diff < 0 ? 'danger' : 'ok'})">${r.diff > 0 ? '+' : ''}${r.diff}</b>` : '<span class="pill p-done">✓</span>'}</td><td class="num hide-m">${r.diff ? money(r.diff * r.cost) : ''}</td></tr>`).join('') || `<tr><td colspan="5">${empty('✓', 'Nothing in this list.')}</td></tr>`}</tbody></table></div>${list.length > 500 ? '<p class="hint">Showing the first 500 — use search or category to narrow.</p>' : ''}`}`;
  if (document.activeElement?.id !== 'crS') { /* keep */ }
}
function breakdown(c, itemId) {
  const { by } = L.countTotals(c.id), m = by[itemId] || {}, it = byId('items', itemId);
  openModal(it?.name || 'Item', `<div class="list">${Object.entries(m).map(([u, q]) => `<div class="list-item" style="padding:8px 10px"><span>${esc(L.nm(u))}</span><b>${q}</b></div>`).join('')}</div><p class="hint" style="margin-top:8px">If two people counted the same shelf, their counts add up. Ask one of them to correct theirs in Scan & count.</p>`, [{ label: 'Close' }]);
}
function reviewCSV(c) {
  const rows = L.countRows(c);
  download('stock_count_' + c.name.replace(/\W+/g, '_') + '.csv', toCSV([['SKU', 'Item', 'Category', 'System qty', 'Counted qty', 'Difference', 'Avg cost', 'Value difference'], ...rows.map(r => [r.item.sku, r.item.name, r.item.category, r.sys, r.counted ?? '', r.diff ?? '', r.cost, r.diff ? r2(r.diff * r.cost) : ''])]));
}
function reviewPrint(c) {
  const rows = L.countRows(c).filter(r => r.diff || r.counted == null && r.sys);
  saveDocument('stock_count_' + c.name.replace(/\W+/g, '_') + '.html', 'Stock count ' + c.name, `<div class="doc"><h1>${esc(setting('name', ''))}</h1><h2>Stock count — ${esc(c.name)}</h2><p>Differences and items not counted · ${fmtDate(today(), { day: 'numeric', month: 'short', year: 'numeric' })}</p>
    <table><thead><tr><th>SKU</th><th>Item</th><th class="num">System</th><th class="num">Counted</th><th class="num">Diff.</th><th class="num">Value</th></tr></thead><tbody>${rows.map(r => `<tr><td>${esc(r.item.sku)}</td><td>${esc(r.item.name)}</td><td class="num">${r.sys}</td><td class="num">${r.counted ?? '—'}</td><td class="num">${r.diff ?? ''}</td><td class="num">${r.diff ? money(r.diff * r.cost) : ''}</td></tr>`).join('')}</tbody></table></div>`);
}
function postDialog(c) {
  const rows = L.countRows(c), notCounted = rows.filter(r => r.counted == null && r.sys);
  const sum = z => { const d = L.countRows(c, { uncountedZero: z }).filter(r => r.diff); return `<b>${d.length}</b> items will change · ${d.filter(r => r.diff > 0).reduce((x, r) => x + r.diff, 0)} pieces found, ${-d.filter(r => r.diff < 0).reduce((x, r) => x + r.diff, 0)} pieces missing · value ${money(d.reduce((x, r) => x + r.diff * r.cost, 0))}`; };
  openModal('Post stock count', `<p style="margin:0 0 10px;line-height:1.55">This sets the system stock to the counted quantities and books the difference in the accounts (Inventory ↔ Stock Adjustments) as one entry.</p>
    ${field('Adjustment date', input('pcDate', today(), 'type="date"'))}
    ${notCounted.length ? `<label class="check"><input type="checkbox" id="pcZero"> Treat the ${notCounted.length} item(s) not counted as <b>zero</b> (only if you counted every shelf)</label>` : ''}
    <div class="alert a-info" id="pcSum" style="margin-top:10px">${sum(false)}</div>`,
    [{ label: 'Cancel' }, { label: 'Post adjustments', cls: 'btn-ok', onClick: async () => { const r = await L.postCount(c, { uncountedZero: !!$('pcZero')?.checked, date: val('pcDate') }); toast(`${r.no} posted — ${r.count} items adjusted, ${money(r.value)}.`); } }],
    { onOpen: () => { if ($('pcZero')) $('pcZero').onchange = () => { $('pcSum').innerHTML = sum($('pcZero').checked); }; } });
}
function newCountDialog() {
  const cats = [...new Set(all('items').map(i => i.category))].sort(), d = new Date();
  openModal('New stock count', `${field('Name', input('ncName', d.toLocaleDateString('en-IN', { month: 'long', year: 'numeric' })))}
    <div class="field"><label>What to count</label><label class="check"><input type="radio" name="ncScope" value="all" checked> All items</label><label class="check"><input type="radio" name="ncScope" value="cats"> Only some categories</label>
      <div id="ncCats" hidden style="max-height:180px;overflow:auto;border:1px solid var(--line);border-radius:10px;padding:6px 10px;margin-top:4px">${cats.map(x => `<label class="check"><input type="checkbox" value="${esc(x)}"> ${esc(x)}</label>`).join('')}</div></div>
    <label class="check"><input type="checkbox" id="ncBlind" checked> Blind count — staff don't see the system stock while counting (more honest counts)</label>
    <p class="hint" style="margin-top:8px">Staff open <b>Stock Count</b> on their phones and scan. Several people can count at once; their counts add up.</p>`,
    [{ label: 'Cancel' }, { label: 'Start count', cls: 'btn-ok', onClick: async () => {
      const scope = document.querySelector('input[name=ncScope]:checked').value, chosen = [...$('ncCats').querySelectorAll('input:checked')].map(x => x.value);
      if (scope === 'cats' && !chosen.length) throw Error('Tick at least one category.');
      cSel = await L.startCount({ name: val('ncName'), categories: scope === 'cats' ? chosen : [], blind: $('ncBlind').checked }); cTab = 'count'; dirty = false; toast('Count started.'); setTimeout(rr, 50);
    } }],
    { onOpen: b => b.addEventListener('change', e => { if (e.target.name === 'ncScope') $('ncCats').hidden = e.target.value !== 'cats'; }) });
}

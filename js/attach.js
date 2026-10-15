// GRID Shop Manager — file attachments (supplier bills, receipts, payment proofs) kept in the artifact's asset store.
// A record keeps files: [{ id, name, type, size, at, by }]; the file itself is served at "/_blob/<id>".
import { $, esc, store, byId } from './core.js';
import { toast, fail, download } from './ui.js';

const OK = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/gif': 'gif', 'application/pdf': 'pdf' };
const EXT = { jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp', gif: 'image/gif', pdf: 'application/pdf' };
const MAX = 20 * 1024 * 1024;
export const assetsApi = () => api || (api = (async () => {
  if (window.claude && window.claude.use) {
    try {
      const a = await window.claude.use('assets');
      if (a) return a;
    } catch (e) {}
  }
  return {
    upload: async (file, { type } = {}) => {
      const fd = new FormData();
      fd.append('file', file);
      if (type) fd.append('type', type);
      const res = await fetch('/api/assets/upload', { method: 'POST', body: fd });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw Error(err.error || 'Failed to upload attachment');
      }
      return await res.json();
    },
    delete: async (id) => {
      await fetch('/api/assets/' + encodeURIComponent(id), { method: 'DELETE' }).catch(() => {});
    }
  };
})());
export const fileUrl = f => '/_blob/' + f.id;
const kb = n => n >= 1048576 ? (n / 1048576).toFixed(1) + ' MB' : Math.max(1, Math.round(n / 1024)) + ' KB';
const isImg = f => /^image\//.test(f.type || '');

// big phone photos are shrunk to 2000 px on the long side (JPEG) before upload; PDFs go as they are
function shrink(file) {
  return new Promise(res => {
    if (!/^image\/(jpeg|png|webp)$/.test(file.type) || file.size < 900 * 1024) return res(file);
    const url = URL.createObjectURL(file), img = new Image();
    img.onload = () => { const k = Math.min(1, 2000 / Math.max(img.width, img.height)); if (k === 1 && file.size < 2.5 * 1048576) { URL.revokeObjectURL(url); return res(file); }
      const c = document.createElement('canvas'); c.width = Math.round(img.width * k); c.height = Math.round(img.height * k); const g = c.getContext('2d'); g.fillStyle = '#fff'; g.fillRect(0, 0, c.width, c.height); g.drawImage(img, 0, 0, c.width, c.height);
      c.toBlob(b => { URL.revokeObjectURL(url); res(b && b.size < file.size ? new File([b], file.name.replace(/\.\w+$/, '') + '.jpg', { type: 'image/jpeg' }) : file); }, 'image/jpeg', 0.85); };
    img.onerror = () => { URL.revokeObjectURL(url); res(file); };
    img.src = url;
  });
}
export async function uploadFiles(list) {
  const a = await assetsApi(); if (!a) throw Error('Attaching files needs Editor access to this page — ask the owner.');
  const out = [];
  for (let f of list) {
    const type = OK[f.type] ? f.type : EXT[(f.name.split('.').pop() || '').toLowerCase()];
    if (!type) throw Error(`${f.name}: attach a photo (JPG, PNG) or a PDF file.`);
    f = await shrink(f);
    if (f.size > MAX) throw Error(`${f.name} is larger than 20 MB.`);
    let r;
    try { r = await a.upload(f, { type: f.type && OK[f.type] ? f.type : type }); }
    catch (e) { const c = e && e.code; throw Error(c === 'too_large' ? `${f.name} is too large.` : c === 'unsupported_type' ? `${f.name}: this kind of file can't be attached.` : c === 'quota_or_state' ? 'The page has no room for more files. Remove some old attachments.' : c === 'not_granted' || c === 'capability_disabled' ? 'Attaching files is not available here.' : 'Could not upload ' + f.name + '. Try again.'); }
    out.push({ id: r.id, name: f.name, type: r.contentType, size: r.sizeBytes, at: Date.now(), by: store.me?.id || '' });
  }
  return out;
}
function pick() {
  return new Promise(res => { const i = document.createElement('input'); i.type = 'file'; i.multiple = true; i.accept = 'image/*,application/pdf,.pdf'; i.onchange = () => res([...i.files]); i.click(); });
}
// small list of attached files; edit = show ✕ remove buttons
export function filesHTML(files = [], { edit = false } = {}) {
  if (!files.length) return '';
  return `<div class="att-list">${files.map((f, i) => `<div class="att" data-att="${i}">
    <button type="button" class="att-th" data-attopen="${i}" title="Open ${esc(f.name)}">${isImg(f) ? `<img src="${esc(fileUrl(f))}" alt="" loading="lazy">` : '<span>PDF</span>'}</button>
    <div class="att-m"><button type="button" class="att-n" data-attopen="${i}">${esc(f.name)}</button><small>${kb(f.size || 0)}</small></div>
    ${edit ? `<button type="button" class="icon-btn" data-attrm="${i}" title="Remove">✕</button>` : ''}</div>`).join('')}</div>`;
}
// preview in a lightbox over whatever is open (photos inline; PDFs open in a new tab or save)
export function openFile(f) {
  if (!f) return; const url = fileUrl(f);
  const lb = document.createElement('div'); lb.className = 'att-lb'; lb.setAttribute('role', 'dialog'); lb.setAttribute('aria-label', f.name);
  lb.innerHTML = `<div class="att-lb-in"><div class="att-lb-h"><b>${esc(f.name)}</b><button type="button" class="icon-btn" data-lbx="1" aria-label="Close">✕</button></div>
    <div class="att-lb-b">${isImg(f) ? `<img src="${esc(url)}" alt="${esc(f.name)}">` : `<div class="att-lb-pdf"><span>PDF</span><p>${kb(f.size || 0)}</p></div>`}</div>
    <div class="att-lb-f"><a class="btn" href="${esc(url)}" target="_blank" rel="noopener">↗ Open in new tab</a><button type="button" class="btn" data-lbs="1">⬇ Save</button><button type="button" class="btn btn-ink" data-lbx="1">Close</button></div></div>`;
  const close = () => { lb.remove(); document.removeEventListener('keydown', key, true); };
  const key = e => { if (e.key === 'Escape') { e.stopPropagation(); close(); } };
  lb.addEventListener('click', async e => {
    if (e.target === lb || e.target.closest('[data-lbx]')) return close();
    if (e.target.closest('[data-lbs]')) { try { const b = await (await fetch(url)).blob(); await download(/\.\w+$/.test(f.name) ? f.name : f.name + '.' + (OK[f.type] || 'pdf'), b); } catch (er) { fail(Error('Could not fetch the file.')); } }
  });
  document.addEventListener('keydown', key, true); document.body.appendChild(lb);
}
// an attach box inside a form (new purchase, payment): returns { get() } with the uploaded files
export function attachField(host, initial = []) {
  let files = [...initial], busy = false;
  const draw = () => { host.innerHTML = `${filesHTML(files, { edit: true })}<div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap"><button type="button" class="btn btn-sm" data-attadd="1"${busy ? ' disabled' : ''}>${busy ? 'Uploading…' : '📎 Attach file'}</button><span class="hint">Supplier bill, receipt or payment proof · photo or PDF</span></div>`; };
  host.addEventListener('click', async e => {
    if (e.target.closest('[data-attadd]')) { const l = await pick(); if (!l.length) return; busy = true; draw(); try { files = [...files, ...await uploadFiles(l)]; } catch (er) { fail(er); } busy = false; draw(); return; }
    const rm = e.target.closest('[data-attrm]'); if (rm) { const f = files[+rm.dataset.attrm]; files.splice(+rm.dataset.attrm, 1); draw(); const a = await assetsApi(); if (a && f && !initial.some(x => x.id === f.id)) a.delete(f.id).catch(() => { }); return; }
    const op = e.target.closest('[data-attopen]'); if (op) openFile(files[+op.dataset.attopen]);
  });
  draw();
  return { get: () => files, busy: () => busy };
}
// attachments panel on a saved record (purchase, payment …): add or remove files on the document
export function recordFiles(coll, id, canEdit) {
  const d = byId(coll, id) || {}, files = d.files || [];
  return `<div class="att-box" data-attrec="${coll}|${id}"><h3 style="margin:14px 0 6px;font-size:14px">📎 Attachments${files.length ? ` <span class="pill">${files.length}</span>` : ''}</h3>${filesHTML(files, { edit: canEdit }) || '<p class="hint" style="margin:0 0 6px">No files attached.</p>'}${canEdit ? '<button type="button" class="btn btn-sm" data-attrecadd="1">📎 Attach file</button>' : ''}</div>`;
}
export function bindRecordFiles(root) {
  root.addEventListener('click', async e => {
    const box = e.target.closest('[data-attrec]'); if (!box) return;
    const [coll, id] = box.dataset.attrec.split('|'), d = byId(coll, id); if (!d) return;
    const files = d.files || [];
    const redraw = () => { const n = byId(coll, id); if (n) box.outerHTML = recordFiles(coll, id, true); };
    if (e.target.closest('[data-attrecadd]')) {
      const l = await pick(); if (!l.length) return; const b = e.target.closest('button'); b.disabled = true; b.textContent = 'Uploading…';
      try { const add = await uploadFiles(l); await store.db.commit([{ t: 'update', coll, id, data: { files: [...files, ...add] } }]); toast(add.length === 1 ? 'File attached.' : add.length + ' files attached.'); setTimeout(redraw, 120); }
      catch (er) { fail(er); b.disabled = false; b.textContent = '📎 Attach file'; }
      return;
    }
    const rm = e.target.closest('[data-attrm]'); if (rm) {
      const f = files[+rm.dataset.attrm]; if (!f) return;
      if (rm.dataset.sure !== "1") { rm.dataset.sure = '1'; rm.textContent = 'Remove?'; rm.classList.add('att-sure'); setTimeout(() => { if (rm.isConnected) { rm.dataset.sure = ''; rm.textContent = '✕'; rm.classList.remove('att-sure'); } }, 3000); return; }
      try { await store.db.commit([{ t: 'update', coll, id, data: { files: files.filter(x => x.id !== f.id) } }]); const a = await assetsApi(); if (a) a.delete(f.id).catch(() => { }); toast('File removed.'); setTimeout(redraw, 120); } catch (er) { fail(er); }
      return;
    }
    const op = e.target.closest('[data-attopen]'); if (op) openFile(files[+op.dataset.attopen]);
  });
}
export const clip = d => (d.files || []).length ? ` <span class="att-clip" title="${(d.files || []).length} attachment(s)">📎${(d.files || []).length > 1 ? (d.files || []).length : ''}</span>` : '';

// GRID Shop Manager — Code 128 barcodes: drawing (labels) and reading (stock count camera / photo)
export const PATTERNS=['212222','222122','222221','121223','121322','131222','122213','122312','132212','221213','221312','231212','112232','122132','122231','113222','123122','123221','223211','221132','221231','213212','223112','312131','311222','321122','321221','312212','322112','322211','212123','212321','232121','111323','131123','131321','112313','132113','132311','211313','231113','231311','112133','112331','132131','113123','113321','133121','313121','211331','231131','213113','213311','213131','311123','311321','331121','312113','312311','332111','314111','221411','431111','111224','111422','121124','121421','141122','141221','112214','112412','122114','122411','142112','142211','241211','221114','413111','241112','134111','111242','121142','121241','114212','124112','124211','411212','421112','421211','212141','214121','412121','111143','111341','131141','114113','114311','411113','411311','113141','114131','311141','411131','211412','211214','211232','2331112'];
export const validBarcode = s => { s = String(s || ''); return s.length > 0 && s.length <= 40 && [...s].every(c => c.charCodeAt(0) >= 32 && c.charCodeAt(0) <= 126); };
export function encode128(s) {
  s = String(s); if (!validBarcode(s)) throw Error('Barcode can only use English letters, digits and basic symbols (max 40 characters).');
  const codes = [];
  if (/^\d{2,}$/.test(s)) { codes.push(105); const even = s.length - (s.length % 2); for (let i = 0; i < even; i += 2) codes.push(Number(s.substr(i, 2))); if (s.length % 2) { codes.push(100); codes.push(s.charCodeAt(s.length - 1) - 32); } }
  else { codes.push(104); for (const c of s) codes.push(c.charCodeAt(0) - 32); }
  let sum = codes[0]; for (let i = 1; i < codes.length; i++) sum += codes[i] * i;
  codes.push(sum % 103, 106); return codes;
}
const svgCache = new Map();
export function barcodeSVG(v) {
  v = String(v); if (svgCache.has(v)) return svgCache.get(v);
  const codes = encode128(v); let x = 10, d = '';
  for (const n of codes) { const p = PATTERNS[n]; for (let j = 0; j < p.length; j++) { const w = +p[j]; if (j % 2 === 0) d += `M${x} 0h${w}v40h-${w}z`; x += w; } }
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${x + 10} 40" preserveAspectRatio="none" shape-rendering="crispEdges"><path d="${d}" fill="#000"/></svg>`;
  svgCache.set(v, svg); return svg;
}
/* ---- reader: several horizontal lines through an image, Code 128 only (BarcodeDetector is used first where the browser has it) ---- */
const P128 = {}; PATTERNS.forEach((p, i) => { if (i < 106) P128[p] = i; }); P128['233111'] = 106;
export function decodeImage(img) {
  const { data, width: W, height: H } = img, hits = {}, LINES = 25;
  for (let r = 0; r < LINES; r++) {
    const y = Math.min(H - 2, Math.max(1, Math.round((r + .5) * H / LINES))), row = new Float32Array(W);
    for (let x = 0; x < W; x++) { let s = 0; for (let dy = -1; dy <= 1; dy++) { const i = ((y + dy) * W + x) * 4; s += data[i] * .299 + data[i + 1] * .587 + data[i + 2] * .114; } row[x] = s / 3; }
    const t = decodeRow(row) || decodeRow(row.slice().reverse());
    if (t) hits[t] = (hits[t] || 0) + 1;
  }
  let best = null; for (const [t, n] of Object.entries(hits)) if (!best || n > best.hits) best = { text: t, hits: n };
  return best;
}
function binarize(row) {
  const n = row.length, half = Math.max(6, Math.round(n / 45)), bits = new Uint8Array(n);
  let gmin = 255, gmax = 0; for (const v of row) { if (v < gmin) gmin = v; if (v > gmax) gmax = v; }
  if (gmax - gmin < 40) return null; const gmid = (gmin + gmax) / 2, minC = (gmax - gmin) * .25;
  const step = 4, mins = [], maxs = [];
  for (let c = 0; c < n; c += step) { let mn = 255, mx = 0; const a = Math.max(0, c - half), b = Math.min(n - 1, c + half); for (let j = a; j <= b; j++) { const v = row[j]; if (v < mn) mn = v; if (v > mx) mx = v; } mins.push(mn); maxs.push(mx); }
  for (let x = 0; x < n; x++) { const c = Math.min(mins.length - 1, Math.round(x / step)), mn = mins[c], mx = maxs[c]; const thr = mx - mn < minC ? gmid : (mn + mx) / 2; bits[x] = row[x] < thr ? 1 : 0; }
  return bits;
}
function norm6(rs) {
  const sum = rs[0] + rs[1] + rs[2] + rs[3] + rs[4] + rs[5], m = sum / 11; if (!(m > 0)) return null;
  const r = rs.map(w => Math.min(4, Math.max(1, Math.round(w / m)))); let s = r.reduce((a, b) => a + b, 0), guard = 0;
  while (s !== 11 && guard++ < 3) { let best = -1, bv = -1e9; for (let j = 0; j < 6; j++) { const e = rs[j] / m - r[j], ok = s > 11 ? r[j] > 1 : r[j] < 4, sc = s > 11 ? -e : e; if (ok && sc > bv) { bv = sc; best = j; } } if (best < 0) return null; r[best] += s > 11 ? -1 : 1; s += s > 11 ? -1 : 1; }
  return s === 11 ? r.join('') : null;
}
function decodeRow(row) {
  const bits = binarize(row); if (!bits) return null;
  const runs = [], colors = []; let cur = bits[0], len = 0;
  for (let x = 0; x < bits.length; x++) { if (bits[x] === cur) len++; else { runs.push(len); colors.push(cur); cur = bits[x]; len = 1; } } runs.push(len); colors.push(cur);
  for (let i = 1; i + 6 * 4 <= runs.length; i++) {
    if (colors[i] !== 1) continue;
    const sp = norm6(runs.slice(i, i + 6)); if (sp !== '211412' && sp !== '211214' && sp !== '211232') continue;
    const mod = (runs[i] + runs[i + 1] + runs[i + 2] + runs[i + 3] + runs[i + 4] + runs[i + 5]) / 11;
    if (runs[i - 1] < mod * 3 && i > 1) continue;
    const codes = []; let pos = i, ok = false;
    while (pos + 6 <= runs.length) { const p = norm6(runs.slice(pos, pos + 6)); const c = p == null ? undefined : P128[p]; if (c === undefined) break; codes.push(c); if (c === 106) { ok = true; break; } pos += 6; if (codes.length > 60) break; }
    if (!ok || codes.length < 4) continue;
    const dat = codes.slice(0, -2), chk = codes[codes.length - 2]; let sum = dat[0]; for (let j = 1; j < dat.length; j++) sum += dat[j] * j;
    if (sum % 103 !== chk) continue;
    const txt = code128Text(dat); if (txt) return txt;
  }
  return null;
}
function code128Text(dat) {
  let set = dat[0] === 103 ? 'A' : dat[0] === 104 ? 'B' : 'C', out = '';
  for (let j = 1; j < dat.length; j++) {
    const v = dat[j];
    if (set === 'C') { if (v < 100) out += String(v).padStart(2, '0'); else if (v === 100) set = 'B'; else if (v === 101) set = 'A'; continue; }
    if (v === 99) { set = 'C'; continue; }
    if (set === 'A' && v === 100) { set = 'B'; continue; } if (set === 'B' && v === 101) { set = 'A'; continue; }
    if (v >= 96) continue;
    out += set === 'B' ? String.fromCharCode(v + 32) : (v < 64 ? String.fromCharCode(v + 32) : '');
  }
  return out || null;
}
let detector;
async function getDetector() {
  if (detector !== undefined) return detector; detector = null;
  if ('BarcodeDetector' in window) { try { const f = await BarcodeDetector.getSupportedFormats(); if (f.includes('code_128')) detector = new BarcodeDetector({ formats: f.filter(x => ['code_128', 'ean_13', 'ean_8', 'upc_a', 'upc_e', 'code_39', 'code_93', 'itf', 'qr_code'].includes(x)) }); } catch (e) { detector = null; } }
  return detector;
}
const cv = document.createElement('canvas'), cx = cv.getContext('2d', { willReadFrequently: true });
// read one barcode from a video element (centre band) — returns text or null
export async function readVideo(v) {
  const d = await getDetector(); if (d) { try { const r = await d.detect(v); return r && r.length ? r[0].rawValue : null; } catch (e) { } }
  const vw = v.videoWidth, vh = v.videoHeight; if (!vw || !vh) return null;
  const sw = Math.round(vw * .94), sh = Math.round(vh * .42), sx = Math.round((vw - sw) / 2), sy = Math.round((vh - sh) / 2), W = Math.min(sw, 1100), H = Math.max(30, Math.round(sh * W / sw));
  cv.width = W; cv.height = H; cx.drawImage(v, sx, sy, sw, sh, 0, 0, W, H); const r = decodeImage(cx.getImageData(0, 0, W, H));
  return r && r.hits >= 2 ? r.text : null;
}
// read one barcode from a photo file
export async function readPhoto(file) {
  const bmp = await createImageBitmap(file);
  const d = await getDetector(); if (d) { try { const r = await d.detect(bmp); if (r && r.length) return r[0].rawValue; } catch (e) { } }
  for (const maxW of [1400, 900, 2000]) {
    const sc = Math.min(1, maxW / bmp.width), W = Math.round(bmp.width * sc), H = Math.round(bmp.height * sc);
    cv.width = W; cv.height = H; cx.drawImage(bmp, 0, 0, W, H);
    // try the full image and the middle half (stickers are usually in the centre)
    const full = decodeImage(cx.getImageData(0, 0, W, H)); if (full) return full.text;
    const mid = decodeImage(cx.getImageData(0, Math.round(H * .25), W, Math.round(H * .5))); if (mid) return mid.text;
  }
  return null;
}

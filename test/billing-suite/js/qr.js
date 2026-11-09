/* Small QR code generator (byte mode, error-correction level M, versions 1–25).
   Based on the public QR Code specification (ISO/IEC 18004), following Project Nayuki's reference design.
   Used to print a UPI "scan to pay" code on bills — works offline, no outside library. */
'use strict';
const QR = (() => {
  const ECC_PER_BLOCK = [-1, 10, 16, 26, 18, 24, 16, 18, 22, 22, 26, 30, 22, 22, 24, 24, 28, 28, 26, 26, 26, 26, 28, 28, 28, 28];
  const NUM_BLOCKS = [-1, 1, 1, 1, 2, 2, 4, 4, 4, 5, 5, 5, 8, 9, 9, 10, 10, 11, 13, 14, 16, 17, 17, 18, 20, 21];
  const MAX_VER = 25;
  const bit = (x, i) => ((x >>> i) & 1) !== 0;
  function rawModules(v) { let r = (16 * v + 128) * v + 64; if (v >= 2) { const n = Math.floor(v / 7) + 2; r -= (25 * n - 10) * n - 55; if (v >= 7) r -= 36; } return r; }
  const dataCodewords = v => Math.floor(rawModules(v) / 8) - ECC_PER_BLOCK[v] * NUM_BLOCKS[v];
  function gfMul(x, y) { let z = 0; for (let i = 7; i >= 0; i--) { z = (z << 1) ^ ((z >>> 7) * 0x11d); z ^= ((y >>> i) & 1) * x; } return z & 0xff; }
  function rsDivisor(deg) { const r = new Array(deg).fill(0); r[deg - 1] = 1; let root = 1; for (let i = 0; i < deg; i++) { for (let j = 0; j < r.length; j++) { r[j] = gfMul(r[j], root); if (j + 1 < r.length) r[j] ^= r[j + 1]; } root = gfMul(root, 2); } return r; }
  function rsRemainder(data, div) { const r = div.map(() => 0); for (const b of data) { const f = b ^ r.shift(); r.push(0); div.forEach((c, i) => { r[i] ^= gfMul(c, f); }); } return r; }
  function alignPositions(v, size) { if (v === 1) return []; const n = Math.floor(v / 7) + 2, step = v === 32 ? 26 : Math.ceil((v * 4 + 4) / (n * 2 - 2)) * 2; const r = [6]; for (let p = size - 7; r.length < n; p -= step) r.splice(1, 0, p); return r; }

  function encode(text) {
    const bytes = [...new TextEncoder().encode(text)];
    let v = 1;
    for (; v <= MAX_VER; v++) { const cc = v < 10 ? 8 : 16; if (4 + cc + bytes.length * 8 <= dataCodewords(v) * 8) break; }
    if (v > MAX_VER) throw new Error('Text too long for a QR code.');
    // data bits
    const bits = []; const put = (val, len) => { for (let i = len - 1; i >= 0; i--) bits.push((val >>> i) & 1); };
    put(4, 4); put(bytes.length, v < 10 ? 8 : 16); bytes.forEach(b => put(b, 8));
    const cap = dataCodewords(v) * 8;
    put(0, Math.min(4, cap - bits.length)); put(0, (8 - bits.length % 8) % 8);
    for (let pad = 0xec; bits.length < cap; pad ^= 0xec ^ 0x11) put(pad, 8);
    const data = []; for (let i = 0; i < bits.length; i += 8) data.push(parseInt(bits.slice(i, i + 8).join(''), 2));
    // error correction + interleave
    const nb = NUM_BLOCKS[v], el = ECC_PER_BLOCK[v], raw = Math.floor(rawModules(v) / 8), nShort = nb - raw % nb, shortLen = Math.floor(raw / nb), div = rsDivisor(el);
    const blocks = []; for (let i = 0, k = 0; i < nb; i++) { const dat = data.slice(k, k + shortLen - el + (i < nShort ? 0 : 1)); k += dat.length; const ecc = rsRemainder(dat, div); if (i < nShort) dat.push(0); blocks.push(dat.concat(ecc)); }
    const cw = []; for (let i = 0; i < blocks[0].length; i++) blocks.forEach((b, j) => { if (i !== shortLen - el || j >= nShort) cw.push(b[i]); });
    // matrix
    const size = v * 4 + 17, m = [...Array(size)].map(() => Array(size).fill(false)), fn = [...Array(size)].map(() => Array(size).fill(false));
    const setF = (x, y, d) => { m[y][x] = d; fn[y][x] = true; };
    for (let i = 0; i < size; i++) { setF(6, i, i % 2 === 0); setF(i, 6, i % 2 === 0); }
    const finder = (x, y) => { for (let dy = -4; dy <= 4; dy++) for (let dx = -4; dx <= 4; dx++) { const d = Math.max(Math.abs(dx), Math.abs(dy)), xx = x + dx, yy = y + dy; if (xx >= 0 && xx < size && yy >= 0 && yy < size) setF(xx, yy, d !== 2 && d !== 4); } };
    finder(3, 3); finder(size - 4, 3); finder(3, size - 4);
    const ap = alignPositions(v, size), na = ap.length;
    for (let i = 0; i < na; i++) for (let j = 0; j < na; j++) { if ((i === 0 && j === 0) || (i === 0 && j === na - 1) || (i === na - 1 && j === 0)) continue; for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) setF(ap[i] + dx, ap[j] + dy, Math.max(Math.abs(dx), Math.abs(dy)) !== 1); }
    const format = mask => {
      const d = (0 << 3) | mask; let r = d; for (let i = 0; i < 10; i++) r = (r << 1) ^ ((r >>> 9) * 0x537);
      const b = ((d << 10) | r) ^ 0x5412;
      for (let i = 0; i <= 5; i++) setF(8, i, bit(b, i));
      setF(8, 7, bit(b, 6)); setF(8, 8, bit(b, 7)); setF(7, 8, bit(b, 8));
      for (let i = 9; i < 15; i++) setF(14 - i, 8, bit(b, i));
      for (let i = 0; i < 8; i++) setF(size - 1 - i, 8, bit(b, i));
      for (let i = 8; i < 15; i++) setF(8, size - 15 + i, bit(b, i));
      setF(8, size - 8, true);
    };
    format(0);
    if (v >= 7) { let r = v; for (let i = 0; i < 12; i++) r = (r << 1) ^ ((r >>> 11) * 0x1f25); const b = (v << 12) | r; for (let i = 0; i < 18; i++) { const d = bit(b, i), a = size - 11 + i % 3, c = Math.floor(i / 3); setF(a, c, d); setF(c, a, d); } }
    // place codewords
    let i = 0;
    for (let right = size - 1; right >= 1; right -= 2) {
      if (right === 6) right = 5;
      for (let vert = 0; vert < size; vert++) for (let j = 0; j < 2; j++) {
        const x = right - j, up = ((right + 1) & 2) === 0, y = up ? size - 1 - vert : vert;
        if (!fn[y][x] && i < cw.length * 8) { m[y][x] = bit(cw[i >>> 3], 7 - (i & 7)); i++; }
      }
    }
    const maskFn = [(x, y) => (x + y) % 2 === 0, (x, y) => y % 2 === 0, x => x % 3 === 0, (x, y) => (x + y) % 3 === 0,
      (x, y) => (Math.floor(x / 3) + Math.floor(y / 2)) % 2 === 0, (x, y) => x * y % 2 + x * y % 3 === 0,
      (x, y) => (x * y % 2 + x * y % 3) % 2 === 0, (x, y) => ((x + y) % 2 + x * y % 3) % 2 === 0];
    const apply = k => { for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) if (!fn[y][x] && maskFn[k](x, y)) m[y][x] = !m[y][x]; };
    const penalty = () => {
      let p = 0, dark = 0;
      for (let y = 0; y < size; y++) for (const horiz of [true, false]) { let run = 1; for (let x = 1; x < size; x++) { const a = horiz ? m[y][x] : m[x][y], b = horiz ? m[y][x - 1] : m[x - 1][y]; if (a === b) { run++; if (run === 5) p += 3; else if (run > 5) p++; } else run = 1; } }
      for (let y = 0; y < size - 1; y++) for (let x = 0; x < size - 1; x++) { const c = m[y][x]; if (c === m[y][x + 1] && c === m[y + 1][x] && c === m[y + 1][x + 1]) p += 3; }
      for (const row of m) for (const c of row) if (c) dark++;
      return p + Math.floor(Math.abs(dark * 20 - size * size * 10) / (size * size)) * 10;
    };
    let best = 0, bestScore = Infinity;
    for (let k = 0; k < 8; k++) { apply(k); format(k); const sc = penalty(); if (sc < bestScore) { bestScore = sc; best = k; } apply(k); }
    apply(best); format(best);
    return m;
  }

  /* Returns an <svg> string (scales cleanly on any printer). */
  function svg(text, px = 140) {
    const m = encode(text), n = m.length, q = 4, s = n + q * 2;
    let d = ''; m.forEach((row, y) => row.forEach((c, x) => { if (c) d += `M${x + q},${y + q}h1v1h-1z`; }));
    return `<svg class="qr-svg" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${s} ${s}" width="${px}" height="${px}" shape-rendering="crispEdges"><rect width="${s}" height="${s}" fill="#fff"/><path d="${d}" fill="#000"/></svg>`;
  }
  function upiLink({ upi_id, payee, amount, note }) {
    const p = new URLSearchParams({ pa: upi_id, pn: payee || '', cu: 'INR' });
    if (amount > 0) p.set('am', Number(amount).toFixed(2));
    if (note) p.set('tn', note);
    return 'upi://pay?' + p.toString().replace(/\+/g, '%20');
  }
  return { encode, svg, upiLink };
})();
if (typeof module !== 'undefined') module.exports = QR;

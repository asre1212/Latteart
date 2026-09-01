/* Generates the PWA icons as PNGs with no external dependencies.
   Run:  node tools/make-icons.mjs                                    */
import zlib from 'node:zlib';
import fs from 'node:fs';
import path from 'node:path';

const OUT = path.join(process.cwd(), 'icons');

/* ---- minimal PNG writer ---- */
const CRC = (() => {
  const t = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c;
  }
  return t;
})();
function crc32(buf) {
  let c = -1;
  for (let i = 0; i < buf.length; i++) c = CRC[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ -1) >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}
function png(width, height, rgba) {
  const raw = Buffer.alloc((width * 4 + 1) * height);
  for (let y = 0; y < height; y++) {
    raw[y * (width * 4 + 1)] = 0;
    rgba.copy(raw, y * (width * 4 + 1) + 1, y * width * 4, (y + 1) * width * 4);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0); ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; ihdr[9] = 6; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0))
  ]);
}

/* ---- the artwork: a cup of crema with a heart in it ---- */
const mix = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
const BG_A = [36, 26, 21], BG_B = [16, 12, 10];
const CREMA_A = [172, 114, 68], CREMA_B = [70, 41, 23];
const RIM = [239, 231, 221], MILK = [253, 250, 242];

function inHeart(x, y, s) {
  const hx = x / s, hy = -y / s;            // flip so the tip points up
  const a = hx * hx + hy * hy - 1;
  return a * a * a - hx * hx * hy * hy * hy <= 0;
}
function roundedIn(x, y, half, r) {
  const dx = Math.abs(x) - (half - r), dy = Math.abs(y) - (half - r);
  if (dx <= 0 || dy <= 0) return Math.abs(x) <= half && Math.abs(y) <= half;
  return dx * dx + dy * dy <= r * r;
}

function render(size, maskable) {
  const buf = Buffer.alloc(size * size * 4);
  const SS = 3;                               // supersampling
  const cupR = maskable ? 0.50 : 0.63;
  const heartS = cupR * 0.46;
  for (let py = 0; py < size; py++) {
    for (let px = 0; px < size; px++) {
      let r = 0, g = 0, b = 0, n = 0;
      for (let sy = 0; sy < SS; sy++) {
        for (let sx = 0; sx < SS; sx++) {
          const x = ((px + (sx + 0.5) / SS) / size) * 2 - 1;
          const y = ((py + (sy + 0.5) / SS) / size) * 2 - 1;
          let c;
          const inBg = maskable ? true : roundedIn(x, y, 1, 0.42);
          if (!inBg) { n++; continue; }               // transparent corners
          c = mix(BG_A, BG_B, Math.min(1, (y + 1) / 2));
          const d = Math.hypot(x, y);
          if (d <= cupR * 1.085) c = RIM;
          if (d <= cupR) {
            const t = Math.min(1, Math.hypot(x + cupR * 0.22, y + cupR * 0.26) / cupR);
            c = mix(CREMA_A, CREMA_B, t);
            if (inHeart(x, y + cupR * 0.06, heartS)) c = MILK;
          }
          r += c[0]; g += c[1]; b += c[2]; n++;
        }
      }
      const tot = SS * SS;
      const i = (py * size + px) * 4;
      buf[i] = Math.round(r / tot);
      buf[i + 1] = Math.round(g / tot);
      buf[i + 2] = Math.round(b / tot);
      // alpha: fraction of samples inside the rounded square
      let alpha = 0;
      for (let sy = 0; sy < SS; sy++) {
        for (let sx = 0; sx < SS; sx++) {
          const x = ((px + (sx + 0.5) / SS) / size) * 2 - 1;
          const y = ((py + (sy + 0.5) / SS) / size) * 2 - 1;
          if (maskable || roundedIn(x, y, 1, 0.42)) alpha++;
        }
      }
      buf[i + 3] = Math.round((alpha / tot) * 255);
      if (alpha > 0 && alpha < tot) {            // un-premultiply edge pixels
        buf[i] = Math.round((r / alpha) || 0);
        buf[i + 1] = Math.round((g / alpha) || 0);
        buf[i + 2] = Math.round((b / alpha) || 0);
      }
    }
  }
  return png(size, size, buf);
}

fs.mkdirSync(OUT, { recursive: true });
const jobs = [
  ['icon-192.png', 192, false],
  ['icon-512.png', 512, false],
  ['icon-maskable-512.png', 512, true],
  ['apple-touch-icon.png', 180, true],
  ['favicon.png', 64, false]
];
for (const [name, size, maskable] of jobs) {
  fs.writeFileSync(path.join(OUT, name), render(size, maskable));
  console.log('wrote icons/' + name + ' (' + size + 'px)');
}

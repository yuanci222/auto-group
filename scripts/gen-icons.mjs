/**
 * Generates the extension PNG icons with zero image dependencies.
 * Run with `node scripts/gen-icons.mjs`.
 *
 * Design: an indigo rounded square containing a 2x2 grid of coloured tiles,
 * echoing "tab groups".
 */
import { deflateSync } from 'node:zlib';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const outDir = join(here, '..', 'public', 'icons');
mkdirSync(outDir, { recursive: true });

const CRC_TABLE = (() => {
  const table = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c;
  }
  return table;
})();

function crc32(buf) {
  let c = 0xffffffff;
  for (const byte of buf) c = CRC_TABLE[(c ^ byte) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'latin1'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}

function png(size, pixels) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // RGBA
  const raw = Buffer.alloc(size * (size * 4 + 1));
  for (let y = 0; y < size; y++) {
    raw[y * (size * 4 + 1)] = 0; // filter: none
    pixels.copy(raw, y * (size * 4 + 1) + 1, y * size * 4, (y + 1) * size * 4);
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

function roundedRectCoverage(x, y, rx0, ry0, rx1, ry1, radius) {
  if (x < rx0 || x > rx1 || y < ry0 || y > ry1) return 0;
  const cx = Math.min(Math.max(x, rx0 + radius), rx1 - radius);
  const cy = Math.min(Math.max(y, ry0 + radius), ry1 - radius);
  const dx = x - cx;
  const dy = y - cy;
  const dist = Math.hypot(dx, dy);
  if (dist <= radius) return 1;
  return 0;
}

const TILES = [
  [0x3b, 0x82, 0xf6], // blue
  [0x22, 0xc5, 0x5e], // green
  [0xf5, 0x9e, 0x0b], // amber
  [0xec, 0x48, 0x99], // pink
];

function render(size) {
  const buf = Buffer.alloc(size * size * 4);
  const S = 4; // supersampling
  const bg = [0x4f, 0x46, 0xe5];
  const pad = size * 0.11;
  const gap = size * 0.07;
  const tile = (size - pad * 2 - gap) / 2;
  const radius = Math.max(1.2, size * 0.16);

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let r = 0;
      let g = 0;
      let b = 0;
      let a = 0;
      for (let sy = 0; sy < S; sy++) {
        for (let sx = 0; sx < S; sx++) {
          const px = x + (sx + 0.5) / S;
          const py = y + (sy + 0.5) / S;
          const inBg = roundedRectCoverage(px, py, 0.5, 0.5, size - 0.5, size - 0.5, size * 0.22);
          if (!inBg) continue;
          let color = bg;
          for (let i = 0; i < 4; i++) {
            const col = i % 2;
            const row = (i - col) / 2;
            const x0 = pad + col * (tile + gap);
            const y0 = pad + row * (tile + gap);
            if (roundedRectCoverage(px, py, x0, y0, x0 + tile, y0 + tile, radius * 0.7)) {
              color = TILES[i];
              break;
            }
          }
          r += color[0];
          g += color[1];
          b += color[2];
          a += 255;
        }
      }
      const samples = S * S;
      const idx = (y * size + x) * 4;
      const alpha = a / samples;
      if (alpha > 0) {
        const cover = a / 255;
        buf[idx] = Math.round(r / cover);
        buf[idx + 1] = Math.round(g / cover);
        buf[idx + 2] = Math.round(b / cover);
      }
      buf[idx + 3] = Math.round(alpha);
    }
  }
  return png(size, buf);
}

for (const size of [16, 32, 48, 128]) {
  const file = join(outDir, `icon-${size}.png`);
  writeFileSync(file, render(size));
  console.log('wrote', file);
}

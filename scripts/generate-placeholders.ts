/**
 * Membuat gambar dummy (PNG asli) untuk foto mempelai, galeri, QRIS, dan OG image.
 *
 * Sengaja tanpa dependensi grafis: encoder PNG minimal di bawah memakai zlib
 * bawaan Node. Semua berkas ini adalah PLACEHOLDER dan wajib diganti sebelum
 * rilis (Lampiran D).
 *
 *   npx tsx scripts/generate-placeholders.ts
 */
import { deflateSync } from 'node:zlib';
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';

type RGB = [number, number, number];

const OUT_DIR = path.resolve(process.cwd(), 'public/img');

// -----------------------------------------------------------------------------
// Encoder PNG (truecolor 8-bit, tanpa alpha)
// -----------------------------------------------------------------------------

function crc32(buf: Buffer): number {
  let table = crc32.table;
  if (!table) {
    table = new Int32Array(256);
    for (let n = 0; n < 256; n += 1) {
      let c = n;
      for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      table[n] = c;
    }
    crc32.table = table;
  }

  let crc = -1;
  for (const byte of buf) crc = (crc >>> 8) ^ (table[(crc ^ byte) & 0xff] ?? 0);
  return (crc ^ -1) >>> 0;
}
crc32.table = undefined as Int32Array | undefined;

function chunk(type: string, data: Buffer): Buffer {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length, 0);

  const typeAndData = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(typeAndData), 0);

  return Buffer.concat([length, typeAndData, crc]);
}

function encodePng(width: number, height: number, pixel: (x: number, y: number) => RGB): Buffer {
  // Setiap baris diawali byte filter (0 = None), lalu RGB berurutan.
  const raw = Buffer.alloc(height * (1 + width * 3));
  let offset = 0;

  for (let y = 0; y < height; y += 1) {
    raw[offset] = 0;
    offset += 1;
    for (let x = 0; x < width; x += 1) {
      const [r, g, b] = pixel(x, y);
      raw[offset] = clamp(r);
      raw[offset + 1] = clamp(g);
      raw[offset + 2] = clamp(b);
      offset += 3;
    }
  }

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 2; // color type: truecolor
  ihdr[10] = 0; // compression
  ihdr[11] = 0; // filter
  ihdr[12] = 0; // interlace

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

const clamp = (value: number): number => Math.max(0, Math.min(255, Math.round(value)));

const mix = (a: RGB, b: RGB, t: number): RGB => [
  a[0] + (b[0] - a[0]) * t,
  a[1] + (b[1] - a[1]) * t,
  a[2] + (b[2] - a[2]) * t,
];

// -----------------------------------------------------------------------------
// Motif: gradien lembut + kisi geometris (tanpa makhluk bernyawa, US-03)
// -----------------------------------------------------------------------------

function geometricTile(x: number, y: number, size: number): number {
  // Pola bintang delapan sederhana: gabungan dua kisi belah ketupat.
  const u = (x % size) / size - 0.5;
  const v = (y % size) / size - 0.5;
  const diamond = Math.abs(u) + Math.abs(v);
  const square = Math.max(Math.abs(u), Math.abs(v));
  const edge = Math.min(Math.abs(diamond - 0.34), Math.abs(square - 0.28));
  return edge < 0.018 ? 1 : 0;
}

function makeOrnamentImage(
  width: number,
  height: number,
  from: RGB,
  to: RGB,
  tile: number,
  lineColor: RGB,
): Buffer {
  return encodePng(width, height, (x, y) => {
    const t = (x / width) * 0.45 + (y / height) * 0.55;
    const base = mix(from, to, t);

    // Vignette halus supaya tidak terlihat rata seperti blok warna.
    const dx = x / width - 0.5;
    const dy = y / height - 0.5;
    const vignette = 1 - Math.min(1, (dx * dx + dy * dy) * 1.15);
    const shaded = mix(base, [base[0] * 0.82, base[1] * 0.82, base[2] * 0.82], 1 - vignette);

    return geometricTile(x, y, tile) ? mix(shaded, lineColor, 0.5) : shaded;
  });
}

/** Placeholder QRIS: kotak acak deterministik + tiga penanda sudut. Tidak dapat dipindai. */
function makeQrisPlaceholder(size: number): Buffer {
  const modules = 29;
  const quiet = 3;
  const cell = Math.floor(size / (modules + quiet * 2));
  const origin = Math.floor((size - cell * modules) / 2);

  const dark: boolean[][] = [];
  let seed = 20260912;
  const rand = (): number => {
    seed = (seed * 1103515245 + 12345) & 0x7fffffff;
    return seed / 0x7fffffff;
  };

  for (let r = 0; r < modules; r += 1) {
    const row: boolean[] = [];
    for (let c = 0; c < modules; c += 1) row.push(rand() > 0.52);
    dark.push(row);
  }

  const inFinder = (r: number, c: number): boolean | null => {
    const corners: Array<[number, number]> = [
      [0, 0],
      [0, modules - 7],
      [modules - 7, 0],
    ];
    for (const [fr, fc] of corners) {
      const dr = r - fr;
      const dc = c - fc;
      if (dr < 0 || dr > 6 || dc < 0 || dc > 6) continue;
      const ring = Math.max(Math.abs(dr - 3), Math.abs(dc - 3));
      return ring === 3 || ring <= 1;
    }
    return null;
  };

  return encodePng(size, size, (x, y) => {
    const c = Math.floor((x - origin) / cell);
    const r = Math.floor((y - origin) / cell);
    if (r < 0 || r >= modules || c < 0 || c >= modules) return [255, 255, 255];

    const finder = inFinder(r, c);
    const isDark = finder ?? dark[r]?.[c] ?? false;
    return isDark ? [16, 60, 45] : [255, 255, 255];
  });
}

// -----------------------------------------------------------------------------

// Sejajar dengan token @theme di src/app/globals.css — palet jamrud cerah.
const JADE_DEEP: RGB = [20, 79, 59]; // jade-800
const JADE: RGB = [46, 155, 116]; // jade-500
const JADE_SOFT: RGB = [124, 198, 161]; // jade-300
const CREAM: RGB = [255, 252, 247];
const GOLD: RGB = [224, 185, 95]; // gold-400

const targets: Array<{ file: string; buffer: () => Buffer }> = [
  {
    file: 'dummy-pria.png',
    buffer: () => makeOrnamentImage(800, 1000, JADE_DEEP, JADE, 96, GOLD),
  },
  {
    file: 'dummy-wanita.png',
    buffer: () => makeOrnamentImage(800, 1000, JADE_SOFT, CREAM, 96, JADE),
  },
  { file: 'cover.png', buffer: () => makeOrnamentImage(1200, 1600, JADE_DEEP, JADE, 140, GOLD) },
  { file: 'og.png', buffer: () => makeOrnamentImage(1200, 630, JADE_DEEP, JADE, 110, GOLD) },
  { file: 'qris.png', buffer: () => makeQrisPlaceholder(720) },
];

for (let i = 1; i <= 6; i += 1) {
  const from: RGB = i % 2 === 0 ? JADE_SOFT : JADE;
  const to: RGB = i % 3 === 0 ? CREAM : JADE_DEEP;
  targets.push({
    file: `galeri-${String(i).padStart(2, '0')}.png`,
    buffer: () => makeOrnamentImage(1200, 900, from, to, 80 + i * 12, GOLD),
  });
}

mkdirSync(OUT_DIR, { recursive: true });

for (const target of targets) {
  const filePath = path.join(OUT_DIR, target.file);
  writeFileSync(filePath, target.buffer());
  console.log(`  dibuat  public/img/${target.file}`);
}

console.log(`\n${targets.length} gambar placeholder dibuat di ${OUT_DIR}`);
console.log('PERINGATAN: semua gambar ini dummy dan wajib diganti sebelum rilis.');

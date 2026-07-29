import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Kontras palet tema.
 *
 * Blok `@theme` di globals.css mengklaim seluruh pasangan teks/latar lolos WCAG
 * AA. Klaim di dalam komentar tidak menahan apa pun — berkas ini yang menahannya.
 *
 * Token dibaca langsung dari CSS, bukan disalin ke sini, supaya mengubah warna
 * tanpa memeriksa kontras langsung menjatuhkan tes ini.
 */

const CSS = readFileSync(path.resolve(process.cwd(), 'src/app/globals.css'), 'utf8');

function token(name: string): string {
  const match = CSS.match(new RegExp(`--color-${name}:\\s*(#[0-9a-fA-F]{6})`));
  if (!match?.[1]) throw new Error(`Token --color-${name} tidak ditemukan di globals.css`);
  return match[1];
}

/** Kanal sRGB ke luminansi linear (WCAG 2.1 §1.4.3). */
function channel(value: number): number {
  const v = value / 255;
  return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
}

function luminance(hex: string): number {
  const n = Number.parseInt(hex.slice(1), 16);
  return (
    0.2126 * channel((n >> 16) & 255) +
    0.7152 * channel((n >> 8) & 255) +
    0.0722 * channel(n & 255)
  );
}

function contrast(foreground: string, background: string): number {
  const a = luminance(foreground);
  const b = luminance(background);
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
}

/**
 * Pasangan yang benar-benar dipakai di komponen. Menambah kombinasi baru di UI
 * berarti menambah barisnya di sini.
 *
 * 4,5 = teks biasa. 3 = teks besar dan elemen grafis.
 */
const PAIRS: Array<[label: string, fg: string, bg: string, min: number]> = [
  ['teks utama di gading', 'ink', 'cream', 4.5],
  ['teks utama di kartu', 'ink', 'parchment', 4.5],
  ['teks utama di mint muda', 'ink', 'jade-50', 4.5],
  ['teks lembut di gading', 'ink-soft', 'cream', 4.5],
  ['teks lembut di mint muda', 'ink-soft', 'jade-50', 4.5],

  // Teks petunjuk 13px. Latar mint adalah yang paling terang, jadi itu yang
  // menentukan seberapa gelap ink-muted boleh.
  ['teks petunjuk di gading', 'ink-muted', 'cream', 4.5],
  ['teks petunjuk di mint muda', 'ink-muted', 'jade-50', 4.5],
  ['teks petunjuk di kartu', 'ink-muted', 'parchment', 4.5],

  // gold-600 satu-satunya emas yang boleh menjadi teks di latar terang.
  ['eyebrow emas di gading', 'gold-600', 'cream', 4.5],
  ['eyebrow emas di kartu', 'gold-600', 'parchment', 4.5],

  ['galat di gading', 'danger', 'cream', 4.5],
  ['galat di kartu', 'danger', 'parchment', 4.5],

  // Tombol utama dan seluruh latar gelap.
  ['teks tombol utama', 'cream', 'jade-700', 4.5],
  ['teks sampul', 'cream', 'jade-800', 4.5],
  ['salam penutup emas', 'gold-300', 'jade-800', 4.5],
  ['tanggal sampul', 'jade-100', 'jade-800', 4.5],
  ['label sampul', 'jade-200', 'jade-800', 4.5],
  ['catatan privasi penutup', 'jade-300', 'jade-800', 4.5],
  ['ornamen panel mempelai', 'gold-300', 'jade-700', 3],
  ['keterangan lightbox', 'jade-100', 'jade-900', 4.5],
];

describe('kontras palet tema', () => {
  it.each(PAIRS)('%s lolos ambangnya', (label, fg, bg, min) => {
    const ratio = contrast(token(fg), token(bg));
    expect(ratio, `${label}: ${fg} di atas ${bg} hanya ${ratio.toFixed(2)}:1`).toBeGreaterThanOrEqual(min);
  });

  it('memakai token dari globals.css, bukan salinan', () => {
    // Penjaga bagi pembacanya sendiri: bila nama token berubah, `token()`
    // melempar dan seluruh tes di atas gagal, bukan lulus diam-diam.
    expect(() => token('tidak-ada')).toThrow();
    expect(token('cream')).toMatch(/^#[0-9a-f]{6}$/i);
  });
});

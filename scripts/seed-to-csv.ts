/**
 * Ubah data/seed.json menjadi lima berkas CSV siap impor ke Google Sheet.
 *
 *   npx tsx scripts/seed-to-csv.ts [direktori-tujuan]
 *
 * Ini alat sekali pakai untuk mengisi Sheet baru dengan contoh yang bentuknya
 * sudah pasti benar. Sesudah Sheet hidup, ia tidak dipakai lagi: aliran data
 * berjalan satu arah, Sheet -> aplikasi, dan seed hanya menjadi lapis fallback
 * terakhir bila Sheet tidak terbaca (src/lib/content/snapshot.ts).
 *
 * Menyalin dari terminal tidak dipakai sebagai jalur resmi karena emulator
 * membungkus baris panjang — quote_arab dan kalimat_pembuka memakan beberapa
 * baris layar — dan pembungkusan itu menghancurkan struktur kolom begitu
 * ditempel ke spreadsheet. CSV tidak punya masalah itu.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import seed from '../data/seed.json';

const TABS = ['config', 'jadwal', 'galeri', 'rekening', 'tamu'] as const;

/** Nama tab di Google Sheet — kapitalisasinya wajib persis (lihat sheets.ts RANGES). */
const TAB_TITLE: Record<(typeof TABS)[number], string> = {
  config: 'Config',
  jadwal: 'Jadwal',
  galeri: 'Galeri',
  rekening: 'Rekening',
  tamu: 'Tamu',
};

/**
 * Kutip sebuah sel bila isinya dapat merusak pembacaan CSV.
 *
 * Isi seed benar-benar memuat ketiga kasusnya: kalimat_pembuka penuh koma,
 * dan beberapa nilai memuat tanda kutip. Tanpa penanganan ini satu kalimat
 * panjang akan terpecah menjadi belasan kolom saat diimpor.
 */
function escapeCell(value: string): string {
  const needsQuoting = /[",\r\n]/.test(value) || value !== value.trim();
  if (!needsQuoting) return value;
  return `"${value.replace(/"/g, '""')}"`;
}

function toCsv(rows: string[][]): string {
  // CRLF adalah pemisah baris yang diwajibkan RFC 4180, dan yang paling aman
  // diterima pengimpor mana pun.
  return rows.map((row) => row.map((cell) => escapeCell(String(cell ?? ''))).join(',')).join('\r\n');
}

const outDir = process.argv[2] ?? 'artifacts/sheet-csv';
mkdirSync(outDir, { recursive: true });

const data = seed as unknown as Record<string, string[][]>;

for (const tab of TABS) {
  const rows = data[tab] ?? [];
  const file = join(outDir, `${TAB_TITLE[tab]}.csv`);

  // Tanpa BOM. Google Sheets membaca UTF-8 apa adanya; menambahkan BOM justru
  // membuat sel pertama terbaca sebagai "﻿key" dan kunci Config pertama
  // tidak pernah cocok.
  writeFileSync(file, toCsv(rows), 'utf8');

  console.log(`${file}  (${rows.length} baris, ${rows[0]?.length ?? 0} kolom)`);
}

console.log(`\nSelesai. Impor tiap berkas ke tab bernama sama lewat`);
console.log(`File > Import > Upload > Replace current sheet.`);

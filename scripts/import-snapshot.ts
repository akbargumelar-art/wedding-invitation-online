/**
 * Pindahkan isi undangan dari snapshot Google Sheet ke database.
 *
 *   npm run import-snapshot                        lihat apa yang akan diimpor
 *   npm run import-snapshot -- --confirm           impor ke database kosong
 *   npm run import-snapshot -- --confirm --replace timpa isi yang sudah ada
 *
 * Dipakai SEKALI, saat menaikkan pemasangan lama yang isinya masih dikelola
 * lewat Google Sheet. Versi lama menyimpan cermin Sheet di
 * `SHEET_SNAPSHOT_PATH` (bawaan: /var/walimah/data/snapshot.json), dan berkas
 * itu bentuknya persis sama dengan yang dibutuhkan penyemai database — jadi
 * seluruh isi undangan yang sudah tersusun rapi dapat dipindahkan apa adanya.
 *
 * Tanpa langkah ini, database yang masih kosong akan disemai dari
 * `data/seed.json`, dan yang tampil ke tamu adalah DATA CONTOH bawaan repo —
 * bukan undangan yang sesungguhnya.
 */
// Memuat .env untuk skrip CLI. Harus berada di atas impor lain yang membaca
// env, karena impor ESM dievaluasi sesuai urutan penulisan.
import '../src/lib/dotenv';
import { readFileSync } from 'node:fs';
import { getDb, transaction } from '../src/lib/db';
import { isContentInitialized, seedContentIfEmpty } from '../src/lib/db/content';
import { matrixToRecords } from '../src/lib/content/parse';
import { env } from '../src/lib/env';
import type { RawContentMatrix } from '../src/lib/content/types';

const args = new Set(process.argv.slice(2));
const confirmed = args.has('--confirm');
const replace = args.has('--replace');

const pathArg = process.argv.slice(2).find((value) => !value.startsWith('--'));

/**
 * Versi baru tidak lagi punya SHEET_SNAPSHOT_PATH di env.ts, tetapi berkas env
 * di VPS lama hampir pasti masih memuatnya — jadi nilainya dibaca langsung dari
 * process.env, bukan lewat objek `env`.
 */
const snapshotPath =
  pathArg ?? process.env['SHEET_SNAPSHOT_PATH'] ?? '/var/walimah/data/snapshot.json';

function readMatrix(): RawContentMatrix {
  let parsed: unknown;

  try {
    parsed = JSON.parse(readFileSync(snapshotPath, 'utf8'));
  } catch (error) {
    console.error(`\nGagal membaca snapshot di ${snapshotPath}`);
    console.error(error instanceof Error ? error.message : String(error));
    console.error('\nBila pemasangan lama tidak pernah berhasil membaca Sheet, berkas ini');
    console.error('memang tidak ada. Dalam hal itu isi undangan harus dimasukkan lewat');
    console.error('dashboard admin — tab Pengaturan, Jadwal, Galeri, Rekening, dan Tamu.\n');
    process.exit(1);
  }

  const source = (typeof parsed === 'object' && parsed !== null ? parsed : {}) as Record<
    string,
    unknown
  >;

  const matrix = (key: string): string[][] => {
    const value = source[key];
    if (!Array.isArray(value)) return [];
    return value
      .filter((row): row is unknown[] => Array.isArray(row))
      .map((row) => row.map((cell) => String(cell ?? '')));
  };

  return {
    config: matrix('config'),
    jadwal: matrix('jadwal'),
    galeri: matrix('galeri'),
    rekening: matrix('rekening'),
    tamu: matrix('tamu'),
  };
}

const raw = readMatrix();
const records = matrixToRecords(raw);

console.log(`\nSnapshot  : ${snapshotPath}`);
console.log(`Database  : ${env.db.path}`);
console.log(`Mode      : ${confirmed ? (replace ? 'TIMPA isi yang ada' : 'impor') : 'pratinjau'}\n`);

console.log(`  Pengaturan    ${Object.keys(records.config).length} kunci`);
console.log(`  Jadwal        ${records.jadwal.length} acara`);
console.log(`  Galeri        ${records.galeri.length} foto`);
console.log(`  Rekening      ${records.rekening.length} rekening`);
console.log(`  Tamu          ${records.tamu.length} tamu`);

if (Object.keys(records.config).length === 0) {
  console.error('\nSnapshot tidak memuat satu pun pengaturan — kemungkinan berkasnya rusak.');
  console.error('Impor dibatalkan supaya tidak menimpa isi undangan dengan data kosong.\n');
  process.exit(1);
}

const db = getDb();
const sudahAdaIsi = isContentInitialized();

if (!confirmed) {
  console.log(
    sudahAdaIsi
      ? '\nDatabase SUDAH berisi konten. Tambahkan --confirm --replace untuk menimpanya.'
      : '\nDatabase masih kosong. Tambahkan --confirm untuk mengimpor.',
  );
  console.log('Tidak ada yang diubah.\n');
  process.exit(0);
}

if (sudahAdaIsi && !replace) {
  console.error('\nDatabase sudah berisi konten — kemungkinan besar hasil penyemaian otomatis');
  console.error('dari data/seed.json saat layanan pertama kali menyala.');
  console.error('Jalankan ulang dengan --replace untuk menimpanya dengan isi snapshot.\n');
  process.exit(1);
}

if (replace) {
  // Baris RSVP, ucapan, dan amplop TIDAK disentuh: keduanya terhubung ke tamu
  // lewat slug, dan slug yang sama akan terbentuk lagi dari snapshot. Yang
  // dihapus hanyalah isi undangan.
  transaction((tx) => {
    for (const table of ['site_config', 'schedule', 'gallery', 'bank_accounts', 'guests']) {
      tx.prepare(`DELETE FROM ${table}`).run();
    }
  });
  console.log('\nIsi undangan lama dihapus.');
}

seedContentIfEmpty(records);

const hitung = (table: string): number =>
  (db.prepare(`SELECT COUNT(*) AS n FROM ${table}`).get() as { n: number }).n;

console.log('\nSelesai. Isi database sekarang:');
console.log(`  site_config   ${hitung('site_config')}`);
console.log(`  schedule      ${hitung('schedule')}`);
console.log(`  gallery       ${hitung('gallery')}`);
console.log(`  bank_accounts ${hitung('bank_accounts')}`);
console.log(`  guests        ${hitung('guests')}`);

console.log('\nLangkah berikutnya:');
console.log('  1. sudo systemctl restart walimah');
console.log('  2. buka /admin dan periksa tab Pengaturan, Jadwal, dan Tamu');
console.log('  3. isi nomor WhatsApp tamu bila ingin mengirim undangan dari dashboard\n');

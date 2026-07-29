import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import type { APIRequestContext, Page } from '@playwright/test';

export const ADMIN_USERNAME = 'admin';
export const ADMIN_PASSWORD = 'walimah-dev-2026';
export const REVALIDATE_SECRET = 'e2e-revalidate-secret';
export const CRON_SECRET = 'e2e-cron-secret';

const SEED_PATH = path.resolve(process.cwd(), 'data/seed.json');
const SNAPSHOT_PATH = path.resolve(process.cwd(), 'data/e2e-snapshot.json');

type Matrix = string[][];
type RawSheet = { config: Matrix; jadwal: Matrix; galeri: Matrix; rekening: Matrix; tamu: Matrix };

function readSeed(): RawSheet {
  const seed = JSON.parse(readFileSync(SEED_PATH, 'utf8')) as RawSheet & { _readme?: string };
  return {
    config: seed.config,
    jadwal: seed.jadwal,
    galeri: seed.galeri,
    rekening: seed.rekening,
    tamu: seed.tamu,
  };
}

/**
 * Baris galeri untuk pengujian.
 *
 * Konten yang dikirim ke tamu tidak memuat galeri, jadi `data/seed.json` tidak
 * lagi punya baris foto. Fitur galerinya sendiri masih ada dan masih dikirim ke
 * produksi — mempelai tinggal menambah baris di Sheet untuk menyalakannya —
 * sehingga tesnya menyemai datanya sendiri di sini. Kode yang dikirim tanpa tes
 * lebih berbahaya daripada kode yang dihapus.
 */
export const GALLERY_ROWS: Matrix = [
  ['urutan', 'url', 'caption', 'tampil'],
  ...Array.from({ length: 6 }, (_, index) => [
    String(index + 1),
    `/img/galeri-0${index + 1}.png`,
    'Foto dummy — ganti lewat Sheet',
    'TRUE',
  ]),
];

/**
 * Tulis snapshot dengan sebagian isi Sheet diubah, lalu paksa revalidasi.
 *
 * Ini mensimulasikan "admin mengedit Google Sheet": aplikasi membaca lewat
 * jalur kode yang sama (parser + cache), hanya sumbernya snapshot alih-alih
 * Sheets API — yang juga persis kondisi saat kredensial dicabut.
 */
export async function applySheetOverride(
  request: APIRequestContext,
  overrides: { config?: Record<string, string>; galeri?: Matrix },
): Promise<void> {
  const raw = readSeed();
  const config = raw.config.map((row) => [...row]);

  for (const [key, value] of Object.entries(overrides.config ?? {})) {
    const existing = config.find((row) => row[0] === key);
    if (existing) existing[1] = value;
    else config.push([key, value]);
  }

  const galeri = overrides.galeri ?? raw.galeri;

  writeFileSync(SNAPSHOT_PATH, JSON.stringify({ ...raw, config, galeri }, null, 2), 'utf8');

  const response = await request.post('/api/revalidate', {
    data: { secret: REVALIDATE_SECRET },
  });

  if (!response.ok()) {
    throw new Error(`Revalidasi gagal: ${response.status()} ${await response.text()}`);
  }
}

/** Bentuk ringkas untuk kasus yang hanya mengubah tab Config. */
export async function applyConfigOverride(
  request: APIRequestContext,
  overrides: Record<string, string>,
): Promise<void> {
  await applySheetOverride(request, { config: overrides });
}

/**
 * Kembalikan konten ke data seed apa adanya.
 *
 * Setelah revalidasi, halaman ISR baru benar-benar dibangun ulang pada request
 * berikutnya (stale-while-revalidate). Dua permintaan pemanasan memastikan versi
 * bersih sudah tersimpan sebelum suite berakhir, sehingga cache di `.next` tidak
 * mewarisi konfigurasi uji.
 */
export async function resetConfig(request: APIRequestContext): Promise<void> {
  await applyConfigOverride(request, {});
  await request.get('/to/budi-santoso');
  await request.get('/to/budi-santoso');
}

/** Singkirkan sampul dan tunggu halaman pertama undangan dapat diakses. */
export async function openCover(page: Page): Promise<void> {
  await page.getByRole('button', { name: 'Buka Undangan' }).click();
  await page.locator('#salam').waitFor({ state: 'visible' });
}

/**
 * Pindah ke salah satu tampilan lewat tombol yang dilihat tamu, bukan lewat
 * localStorage — jadi jalur yang diuji sama dengan yang dipakai orang sungguhan.
 */
export async function setView(page: Page, view: 'book' | 'scroll'): Promise<void> {
  const current = await page.evaluate(() => document.body.dataset['view']);

  if (current !== view) {
    const label = view === 'scroll' ? 'Mode gulir' : 'Mode buku';
    await page.getByRole('button', { name: label }).click();
  }

  await page.waitForFunction((target) => document.body.dataset['view'] === target, view);
}

/**
 * Buka undangan dalam tampilan gulir.
 *
 * Mode buku adalah tampilan bawaan bagi tamu, tetapi sebagian besar berkas uji
 * memeriksa isi seluruh seksi sekaligus. Menyetel tampilan gulir di sini menjaga
 * berkas-berkas itu tetap ringkas; mode buku diuji tersendiri di 08-book.spec.ts.
 */
export async function openInvitation(page: Page): Promise<void> {
  await openCover(page);
  await setView(page, 'scroll');
}

export async function loginAsAdmin(page: Page): Promise<void> {
  await page.goto('/admin/login');
  await page.getByLabel('Nama pengguna').fill(ADMIN_USERNAME);
  await page.getByLabel('Kata sandi').fill(ADMIN_PASSWORD);
  await page.getByRole('button', { name: 'Masuk' }).click();
  await page.waitForURL('**/admin');
}

/** Berkas PNG valid berukuran tertentu, untuk menguji batas upload. */
export function pngBuffer(totalBytes: number): Buffer {
  const signature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  return Buffer.concat([signature, Buffer.alloc(Math.max(0, totalBytes - signature.length), 0x22)]);
}

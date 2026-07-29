/**
 * Verifikasi visual pada tiga viewport wajib (PRD §3.2): 390px, 768px, 1280px.
 *
 * Membutuhkan server yang sudah berjalan:
 *   npm run build && npm run start
 *   npx tsx scripts/screenshots.ts [baseUrl]
 *
 * Jangan dijalankan terhadap `npm run dev`: `next build` menulis ke .next yang
 * sama, jadi build berikutnya bercampur artefak dev dan server produksinya mati
 * dengan "Cannot read properties of undefined (reading 'call')".
 *
 * Hasil disimpan di artifacts/screenshots/.
 */
import { chromium, type Page } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import path from 'node:path';

const BASE_URL = process.argv[2] ?? 'http://127.0.0.1:3000';
const OUT_DIR = path.resolve(process.cwd(), 'artifacts/screenshots');

const VIEWPORTS = [
  // 320x568 adalah layar tersempit sekaligus terpendek yang masih didukung
  // (US-02); di sinilah sampul paling mudah terpotong.
  { name: '320', width: 320, height: 568 },
  { name: '390', width: 390, height: 844 },
  { name: '768', width: 768, height: 1024 },
  { name: '1280', width: 1280, height: 900 },
] as const;

/**
 * Seksi yang diperiksa di mode gulir.
 *
 * Seksi menghapus dirinya sendiri saat datanya kosong — galeri, misalnya, tidak
 * dikirim ke tamu — jadi daftar ini adalah kandidat, bukan kewajiban. Yang tidak
 * ada dilewati dengan catatan, bukan menjatuhkan seluruh penangkapan.
 */
const SECTIONS = [
  'salam',
  'mempelai',
  'jadwal',
  'lokasi',
  'galeri',
  'rsvp',
  'ucapan',
  'amplop',
  'penutup',
] as const;

async function openCover(page: Page): Promise<void> {
  await page.getByRole('button', { name: 'Buka Undangan' }).click();
  await page.locator('#salam').waitFor({ state: 'visible' });
  // Beri jeda agar transisi cover dan animasi Reveal selesai.
  await page.waitForTimeout(900);
}

async function setView(page: Page, view: 'book' | 'scroll'): Promise<void> {
  const current = await page.evaluate(() => document.body.dataset['view']);
  if (current !== view) {
    await page.getByRole('button', { name: view === 'scroll' ? 'Mode gulir' : 'Mode buku' }).click();
    await page.waitForFunction((target) => document.body.dataset['view'] === target, view);
    await page.waitForTimeout(600);
  }
}

/** Mode buku: satu tangkapan layar penuh per lembar, persis yang dilihat tamu. */
async function captureBook(page: Page, prefix: string): Promise<number> {
  const total = await page.locator('.book-page').count();

  for (let step = 0; step < total; step += 1) {
    const id = await page.locator('.book-page[data-state="active"]').getAttribute('data-page');
    await page.screenshot({
      path: path.join(OUT_DIR, `${prefix}-buku-${String(step + 1).padStart(2, '0')}-${id}.png`),
    });

    if (step < total - 1) {
      await page.getByRole('button', { name: 'Halaman berikutnya' }).click();
      await page.waitForTimeout(800); // durasi transisi membalik halaman
    }
  }

  return total;
}

/** Mode gulir: satu tangkapan per seksi, untuk memeriksa isinya lebih teliti. */
async function captureScroll(page: Page, prefix: string): Promise<number> {
  let captured = 0;

  for (const id of SECTIONS) {
    const locator = page.locator(`#${id}`);
    if ((await locator.count()) === 0) {
      console.log(`    (lewati #${id} — tidak ada di konten saat ini)`);
      continue;
    }

    await locator.scrollIntoViewIfNeeded();
    await page.waitForTimeout(700);
    await locator.screenshot({ path: path.join(OUT_DIR, `${prefix}-gulir-${id}.png`) });
    captured += 1;
  }

  return captured;
}

async function main(): Promise<void> {
  mkdirSync(OUT_DIR, { recursive: true });

  const browser = await chromium.launch();
  let captured = 0;

  for (const viewport of VIEWPORTS) {
    const context = await browser.newContext({
      viewport: { width: viewport.width, height: viewport.height },
      deviceScaleFactor: 2,
    });
    const page = await context.newPage();

    await page.goto(`${BASE_URL}/to/budi-santoso`, { waitUntil: 'networkidle' });
    await page.screenshot({ path: path.join(OUT_DIR, `${viewport.name}-cover.png`) });
    captured += 1;

    await openCover(page);

    await setView(page, 'book');
    captured += await captureBook(page, viewport.name);

    await setView(page, 'scroll');
    captured += await captureScroll(page, viewport.name);

    // Dashboard admin juga wajib nyaman dipakai dari layar 390px (US-15).
    await page.goto(`${BASE_URL}/admin/login`, { waitUntil: 'networkidle' });
    await page.screenshot({ path: path.join(OUT_DIR, `${viewport.name}-admin-login.png`) });
    captured += 1;

    await context.close();
    console.log(`  selesai viewport ${viewport.width}px`);
  }

  await browser.close();
  console.log(`\n${captured} screenshot tersimpan di ${OUT_DIR}`);
}

void main();

import { expect, test, type Page } from '@playwright/test';
import {
  applySheetOverride,
  GALLERY_ROWS,
  loginAsAdmin,
  openInvitation,
  resetConfig,
} from './helpers';

/**
 * Audit responsif.
 *
 * PRD US-02 mewajibkan cover tampil sempurna pada 320px–430px, dan US-15
 * mewajibkan dashboard admin dapat dipakai dari layar 390px. Berkas ini menguji
 * rentang itu secara otomatis alih-alih mengandalkan pengamatan mata.
 */

const WIDTHS = [
  { name: '320 (terkecil yang didukung)', width: 320, height: 640 },
  { name: '360 (Android kelas menengah)', width: 360, height: 740 },
  { name: '390 (iPhone modern)', width: 390, height: 844 },
  { name: '430 (ponsel besar)', width: 430, height: 932 },
  { name: '768 (tablet)', width: 768, height: 1024 },
  { name: '1280 (desktop)', width: 1280, height: 900 },
] as const;

/** Selisih lebar dokumen terhadap viewport. > 1px berarti ada scroll horizontal. */
async function horizontalOverflow(page: Page): Promise<number> {
  return page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
}

/** Elemen yang menonjol keluar viewport — penyebab konkret bila ada overflow. */
async function offendingElements(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const limit = document.documentElement.clientWidth;
    const out: string[] = [];

    for (const el of Array.from(document.body.querySelectorAll<HTMLElement>('*'))) {
      const rect = el.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) continue;
      if (rect.right > limit + 1 || rect.left < -1) {
        out.push(`${el.tagName.toLowerCase()}.${el.className.toString().slice(0, 60)}`);
      }
      if (out.length >= 5) break;
    }
    return out;
  });
}

test.describe('Halaman undangan tidak pernah menggeser horizontal', () => {
  for (const viewport of WIDTHS) {
    test(`lebar ${viewport.name}`, async ({ page }) => {
      await page.setViewportSize({ width: viewport.width, height: viewport.height });
      await page.goto('/to/budi-santoso');

      // Sampul masih menutup: periksa dulu keadaan ini.
      expect(await horizontalOverflow(page), (await offendingElements(page)).join(', ')).toBeLessThanOrEqual(1);

      await openInvitation(page);

      // Lalu telusuri seluruh seksi sampai bawah.
      for (const id of ['salam', 'mempelai', 'jadwal', 'lokasi', 'galeri', 'rsvp', 'ucapan', 'amplop', 'penutup']) {
        const section = page.locator(`#${id}`);
        if ((await section.count()) === 0) continue;

        await section.scrollIntoViewIfNeeded();
        expect(
          await horizontalOverflow(page),
          `seksi #${id}: ${(await offendingElements(page)).join(', ')}`,
        ).toBeLessThanOrEqual(1);
      }
    });
  }
});

test('tombol "Buka Undangan" tetap terjangkau pada layar terpendek', async ({ page }) => {
  // 320x568 (iPhone SE generasi pertama) adalah kasus tersempit yang realistis.
  await page.setViewportSize({ width: 320, height: 568 });
  await page.goto('/to/budi-santoso');

  const button = page.getByRole('button', { name: 'Buka Undangan' });
  await expect(button).toBeVisible();

  const box = await button.boundingBox();
  expect(box, 'tombol harus punya kotak batas').toBeTruthy();

  // Seluruh tombol harus berada di dalam viewport, bukan terpotong di bawah.
  expect(box!.y + box!.height).toBeLessThanOrEqual(568);
  // Target sentuh minimum 44px.
  expect(box!.height).toBeGreaterThanOrEqual(44);

  // Nama tamu di sampul tidak boleh terpotong. `.first()` karena nama yang sama
  // juga muncul di ringkasan RSVP yang tersimpan lebih jauh di bawah.
  await expect(page.getByText('Budi Santoso').first()).toBeVisible();
});

test('amplop digital yang terbuka tetap rapi di 320px', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 640 });
  await page.goto('/to/budi-santoso');
  await openInvitation(page);

  await page.locator('#amplop').scrollIntoViewIfNeeded();
  await page.getByRole('button', { name: 'Kirim Hadiah' }).click();
  await expect(page.getByAltText('Kode QRIS untuk mengirim hadiah')).toBeVisible();

  // Nomor rekening panjang adalah kandidat overflow yang paling mungkin.
  expect(await horizontalOverflow(page), (await offendingElements(page)).join(', ')).toBeLessThanOrEqual(1);
});

test('lightbox galeri memenuhi layar tanpa menggeser halaman', async ({ page, request }) => {
  // Galeri disemai khusus untuk pengujian ini; konten yang dikirim ke tamu
  // tidak memuatnya.
  await applySheetOverride(request, { galeri: GALLERY_ROWS });

  await page.setViewportSize({ width: 360, height: 740 });
  await page.goto('/to/budi-santoso');
  await openInvitation(page);

  await page.locator('#galeri').scrollIntoViewIfNeeded();
  await page.getByRole('button', { name: /Perbesar foto 1/ }).click();

  await expect(page.getByRole('dialog', { name: 'Pratinjau foto' })).toBeVisible();
  expect(await horizontalOverflow(page)).toBeLessThanOrEqual(1);

  await resetConfig(request);
});

test('dashboard admin dapat dipakai dari layar 390px', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await loginAsAdmin(page);

  await expect(page.getByRole('heading', { name: 'Dashboard Admin' })).toBeVisible();
  expect(await horizontalOverflow(page), (await offendingElements(page)).join(', ')).toBeLessThanOrEqual(1);

  // Gulir sampai bawah: tabel amplop adalah bagian terlebar.
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  expect(await horizontalOverflow(page), (await offendingElements(page)).join(', ')).toBeLessThanOrEqual(1);
});

test('halaman masuk admin muat di 320px', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 640 });
  await page.goto('/admin/login');

  await expect(page.getByRole('heading', { name: 'Masuk Admin' })).toBeVisible();
  expect(await horizontalOverflow(page)).toBeLessThanOrEqual(1);
});

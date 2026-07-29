import { expect, test } from '@playwright/test';
import { applySheetOverride, GALLERY_ROWS, openInvitation, resetConfig } from './helpers';

/** Skenario 1-4 dan 7 (bagian UI) pada Lampiran C. */

test.describe('Undangan tamu', () => {
  // Kembalikan konten ke data seed sebelum apa pun dijalankan. Tanpa ini, suite
  // yang pernah terhenti di tengah bisa meninggalkan snapshot hasil pengujian
  // 04-content (mis. is_draft = FALSE) dan menjatuhkan berkas ini.
  test.beforeAll(async ({ request }) => {
    await resetConfig(request);
  });

  test('1. sapaan personal menampilkan nama tamu di cover', async ({ page }) => {
    await page.goto('/to/budi-santoso');
    await expect(page.getByText('Budi Santoso')).toBeVisible();
    await expect(page.getByText('Kepada Yth.')).toBeVisible();
  });

  test('2. slug tidak dikenal tetap 200 dengan sapaan fallback', async ({ page }) => {
    const response = await page.goto('/to/slug-yang-tidak-ada');

    expect(response?.status()).toBe(200);
    await expect(page.getByText('Bapak/Ibu/Saudara/i', { exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Buka Undangan' })).toBeVisible();
  });

  test('route tanpa slug tetap dapat diakses sebagai undangan umum', async ({ page }) => {
    const response = await page.goto('/');

    expect(response?.status()).toBe(200);
    await expect(page.getByText('Bapak/Ibu/Saudara/i', { exact: true })).toBeVisible();
  });

  test('3. menekan "Buka Undangan" membuka kunci scroll dan isi undangan', async ({ page }) => {
    await page.goto('/to/budi-santoso');

    // Sebelum dibuka, body terkunci dan isi bersifat inert.
    await expect(page.locator('body')).toHaveAttribute('data-locked', 'true');
    await expect(page.locator('main#undangan')).toHaveAttribute('inert', '');

    await openInvitation(page);

    await expect(page.locator('body')).toHaveAttribute('data-locked', 'false');
    await expect(page.locator('main#undangan')).not.toHaveAttribute('inert', '');
    await expect(page.getByRole('heading', { name: 'Kedua Mempelai' })).toBeVisible();
  });

  test('konten islami, jadwal, dan lokasi tampil dari data Sheet', async ({ page }) => {
    await page.goto('/to/budi-santoso');
    await openInvitation(page);

    await expect(page.getByText("Assalamu'alaikum Warahmatullahi Wabarakatuh").first()).toBeVisible();
    await expect(page.getByText('QS. Ar-Rum: 21')).toBeVisible();

    // Teks Arab wajib dirender RTL dengan lang="ar" (US-03).
    const arabic = page.locator('p.arabic');
    await expect(arabic).toHaveAttribute('dir', 'rtl');
    await expect(arabic).toHaveAttribute('lang', 'ar');

    await expect(page.getByRole('heading', { name: 'Akad Nikah' })).toBeVisible();
    await expect(page.getByText('Sabtu, 12 September 2026').first()).toBeVisible();
    await expect(page.getByText('Kopi Senja Cafe & Resto').first()).toBeVisible();
  });

  test('hitung mundur menampilkan empat satuan waktu', async ({ page }) => {
    await page.goto('/to/budi-santoso');
    await openInvitation(page);

    for (const unit of ['Hari', 'Jam', 'Menit', 'Detik']) {
      await expect(page.getByText(unit, { exact: true })).toBeVisible();
    }

    // Server memasang tempat kosong dan klien mengisinya; kalau efeknya tidak
    // pernah jalan, tamu terus melihat "––" tanpa ada yang gagal.
    await expect(page.locator('#jadwal .numeric').first()).toHaveText(/^\d{2}$/);
  });

  test('halaman terhidrasi tanpa error', async ({ page }) => {
    // Hitung mundur pernah dihitung ikut di server. Halaman ini di-cache ISR
    // sampai 60 detik, jadi menitnya hampir selalu berbeda saat sampai ke tamu:
    // React membuang seluruh pohon di bawahnya lalu membangunnya ulang, dan
    // tidak ada satu pun tes yang gagal karena hasil akhirnya tetap benar.
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));

    await page.goto('/to/budi-santoso');
    await openInvitation(page);
    await page.locator('#jadwal').scrollIntoViewIfNeeded();
    await expect(page.locator('#jadwal .numeric').first()).toHaveText(/^\d{2}$/);

    expect(errors).toEqual([]);
  });

  test('4. RSVP tersimpan, bertahan setelah muat ulang, dan dapat diubah', async ({ page }) => {
    await page.goto('/to/budi-santoso');
    await openInvitation(page);

    await page.locator('#rsvp').scrollIntoViewIfNeeded();
    await page.getByRole('radio', { name: /Hadir/ }).first().check();
    await page.getByLabel('Jumlah orang yang hadir').selectOption('2');
    await page.getByRole('button', { name: 'Kirim Konfirmasi' }).click();

    await expect(page.getByText('kehadiran Anda sudah tercatat')).toBeVisible();
    await expect(page.getByText('2 orang')).toBeVisible();

    // Muat ulang: jawaban harus dimuat kembali dari server.
    await page.reload();
    await openInvitation(page);
    await page.locator('#rsvp').scrollIntoViewIfNeeded();

    await expect(page.getByText('kehadiran Anda sudah tercatat')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Ubah Jawaban' })).toBeVisible();

    // Mengubah jawaban adalah UPDATE, bukan baris baru — diverifikasi lewat
    // jumlah RSVP di dashboard admin pada 03-admin.spec.ts.
    await page.getByRole('button', { name: 'Ubah Jawaban' }).click();
    await page.getByLabel('Jumlah orang yang hadir').selectOption('3');
    await page.getByRole('button', { name: 'Perbarui Jawaban' }).click();

    await expect(page.getByText('3 orang')).toBeVisible();
  });

  test('7. amplop digital: accordion, QRIS, dan salin nomor rekening', async ({ page }) => {
    await page.goto('/to/budi-santoso');
    await openInvitation(page);

    await page.locator('#amplop').scrollIntoViewIfNeeded();

    // Tertutup secara default (US-12).
    const toggle = page.getByRole('button', { name: 'Kirim Hadiah' });
    await expect(toggle).toHaveAttribute('aria-expanded', 'false');

    await toggle.click();
    await expect(toggle).toHaveAttribute('aria-expanded', 'true');

    await expect(page.getByAltText('Kode QRIS untuk mengirim hadiah')).toBeVisible();
    await expect(page.getByRole('link', { name: /Unduh QRIS/ })).toBeVisible();
    await expect(page.getByText('7123456789')).toBeVisible();

    // Rekening dengan tampil = FALSE tidak boleh muncul.
    await expect(page.getByText('0987654321')).toHaveCount(0);

    await page.getByRole('button', { name: /Salin nomor rekening Bank Syariah/ }).click();
    await expect(page.getByText('Tersalin').first()).toBeVisible();

    await expect(
      page.getByText('Kehadiran dan doa Anda sudah lebih dari cukup bagi kami.'),
    ).toBeVisible();
  });

  test('galeri membuka lightbox dan dapat ditutup', async ({ page, request }) => {
    // Undangan yang dikirim tidak memuat galeri, jadi tesnya menyemai fotonya
    // sendiri — fiturnya masih ikut terkirim dan harus tetap terbukti bekerja
    // bila mempelai menambah foto di Sheet.
    await applySheetOverride(request, { galeri: GALLERY_ROWS });

    await page.goto('/to/budi-santoso');
    await openInvitation(page);

    await page.locator('#galeri').scrollIntoViewIfNeeded();
    await page.getByRole('button', { name: /Perbesar foto 1/ }).click();

    const dialog = page.getByRole('dialog', { name: 'Pratinjau foto' });
    await expect(dialog).toBeVisible();
    await expect(dialog.getByText('1 / 6')).toBeVisible();

    await dialog.getByRole('button', { name: 'Foto berikutnya' }).click();
    await expect(dialog.getByText('2 / 6')).toBeVisible();

    await dialog.getByRole('button', { name: 'Tutup pratinjau' }).click();
    await expect(dialog).toBeHidden();

    // Kembalikan konten ke keadaan tanpa galeri untuk pengujian berikutnya.
    await resetConfig(request);
  });

  test('banner mode dummy tampil selama is_draft = TRUE', async ({ page }) => {
    await page.goto('/to/budi-santoso');
    // `.first()` karena Next menyisipkan route announcer yang juga role="alert".
    await expect(page.getByRole('alert').first()).toContainText('MODE DUMMY');
  });
});

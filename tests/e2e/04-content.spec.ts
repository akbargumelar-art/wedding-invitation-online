import { expect, test } from '@playwright/test';
import {
  applyConfigOverride,
  applyContentOverride,
  CRON_SECRET,
  GALLERY_ROWS,
  openInvitation,
  resetConfig,
} from './helpers';

/**
 * Skenario 9, 10, dan 12 pada Lampiran C.
 *
 * Isi undangan berasal dari SQLite, yang disemai dari `data/seed.json` saat
 * database masih kosong — persis jalur yang dilalui pemasangan baru di VPS.
 * Menulis ke tabelnya lalu memaksa revalidasi setara dengan menyimpan
 * perubahan lewat dashboard admin.
 */

test.describe.configure({ mode: 'serial' });

test.afterAll(async ({ request }) => {
  await resetConfig(request);
});

test('10. halaman tampil normal pada database yang disemai dari berkas seed', async ({ page }) => {
  const response = await page.goto('/to/budi-santoso');

  expect(response?.status()).toBe(200);
  await expect(page.getByRole('button', { name: 'Buka Undangan' })).toBeVisible();
  // `.first()`: nama tamu juga muncul di ringkasan RSVP yang tersimpan.
  await expect(page.getByText('Budi Santoso').first()).toBeVisible();
});

test('9. perubahan konten tampil setelah revalidasi', async ({ page, request }) => {
  await applyConfigOverride(request, { venue_nama: 'Aula Baru Pengganti' });

  await page.goto('/to/budi-santoso');
  await openInvitation(page);
  await page.locator('#lokasi').scrollIntoViewIfNeeded();

  await expect(page.getByRole('heading', { name: 'Aula Baru Pengganti' })).toBeVisible();
});

test('8. mode syar\'i menyembunyikan foto dan galeri tanpa merusak layout', async ({
  page,
  request,
}) => {
  // Galeri disemai lebih dulu. Konten yang dikirim ke tamu tidak punya foto
  // galeri, jadi tanpa ini pengujian "galeri disembunyikan" akan lulus tanpa
  // membuktikan apa pun.
  await applyContentOverride(request, {
    config: { mode_syari: 'TRUE', wanita_foto: '/img/dummy-wanita.png' },
    gallery: GALLERY_ROWS,
  });

  await page.goto('/to/budi-santoso');
  await openInvitation(page);

  // Seksi galeri hilang seluruhnya, panel ornamen menggantikan foto mempelai.
  await expect(page.locator('#galeri')).toHaveCount(0);
  await expect(page.locator('#mempelai')).toBeVisible();
  await expect(page.getByAltText(/^Foto /)).toHaveCount(0);
  await expect(page.getByRole('heading', { name: 'Layli' })).toBeVisible();
});

test('banner mode dummy hilang saat is_draft = FALSE', async ({ page, request }) => {
  await applyConfigOverride(request, { is_draft: 'FALSE' });

  await page.goto('/to/budi-santoso');
  await expect(page.getByText('MODE DUMMY')).toHaveCount(0);
});

test('12. rsvp_open = FALSE menutup form dan endpoint menolak dengan 403', async ({
  page,
  request,
}) => {
  await applyConfigOverride(request, { rsvp_open: 'FALSE' });

  await page.goto('/to/budi-santoso');
  await openInvitation(page);
  await page.locator('#rsvp').scrollIntoViewIfNeeded();

  await expect(page.getByText('Konfirmasi kehadiran sedang ditutup')).toBeVisible();
  await expect(page.getByRole('button', { name: /Kirim Konfirmasi/ })).toHaveCount(0);

  // Form yang masih terbuka di tab lama pun tetap ditolak di sisi server.
  const response = await request.post('/api/rsvp', {
    data: { slug: 'ratna-dewi', name: 'Ibu Ratna Dewi', status: 'hadir', pax: 1 },
  });

  expect(response.status()).toBe(403);
  expect((await response.json()).error.code).toBe('CLOSED');
});

test('cron backup menghasilkan berkas salinan database', async ({ request }) => {
  const response = await request.post('/api/cron/backup', { data: { secret: CRON_SECRET } });

  expect(response.status()).toBe(200);

  const body = await response.json();
  expect(body.ok).toBe(true);
  expect(body.backup.file).toMatch(/^walimah-.*\.db$/);
  expect(body.backup.bytes).toBeGreaterThan(0);
});

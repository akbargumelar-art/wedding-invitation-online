import { expect, test } from '@playwright/test';
import {
  ADMIN_USERNAME,
  loginAsAdmin,
  openAdminTab,
  openInvitation,
  resetConfig,
} from './helpers';

/** Skenario 5 dan 11 pada Lampiran C. */

test.describe.configure({ mode: 'serial' });

test.describe('Kontrol akses admin', () => {
  test('11. /admin tanpa sesi dialihkan ke halaman masuk', async ({ page }) => {
    await page.goto('/admin');
    await expect(page).toHaveURL(/\/admin\/login$/);
    await expect(page.getByRole('heading', { name: 'Masuk Admin' })).toBeVisible();
  });

  test('11. /api/admin/* tanpa sesi menolak dengan 401', async ({ request }) => {
    for (const url of ['/api/admin/summary', '/api/admin/csv/rsvp']) {
      const response = await request.get(url);
      expect(response.status(), url).toBe(401);
      expect((await response.json()).error.code).toBe('UNAUTHORIZED');
    }

    const patch = await request.patch('/api/admin/wishes/1', { data: { status: 'approved' } });
    expect(patch.status()).toBe(401);
  });

  test('kredensial salah ditolak tanpa membocorkan field mana yang keliru', async ({ page }) => {
    await page.goto('/admin/login');
    await page.getByLabel('Nama pengguna').fill(ADMIN_USERNAME);
    await page.getByLabel('Kata sandi').fill('kata-sandi-salah');
    await page.getByRole('button', { name: 'Masuk' }).click();

    await expect(page.getByRole('alert').first()).toContainText(
      'Nama pengguna atau kata sandi salah',
    );
  });
});

test.describe('Dashboard admin', () => {
  test('login berhasil dan ringkasan menampilkan data yang benar', async ({ page }) => {
    await loginAsAdmin(page);

    await expect(page.getByRole('heading', { name: 'Dashboard Admin' })).toBeVisible();

    // Satu RSVP dari UI (budi-santoso, diubah menjadi 3 orang) + satu dari API
    // (siti-nurhaliza, 2 orang). Pengubahan jawaban tidak menambah baris:
    // 2 tamu hadir, total 5 orang. Bila UPSERT bocor akan terbaca 3 tamu / 8 orang.
    await expect(page.getByRole('group', { name: 'Hadir', exact: true })).toContainText('2');
    await expect(page.getByRole('group', { name: 'Perkiraan orang' })).toContainText('5');
    await expect(page.getByRole('group', { name: 'Undangan terdaftar' })).toContainText('5');
  });

  test('7. konfirmasi amplop tampil berstatus menunggu', async ({ page }) => {
    await loginAsAdmin(page);
    await openAdminTab(page, 'Amplop');

    const amplop = page.getByRole('region', { name: 'Verifikasi amplop' });
    await expect(amplop.getByText('Dr. Rahmat Hidayat')).toBeVisible();
    await expect(amplop.getByText('Menunggu').first()).toBeVisible();
    await expect(amplop.getByText('Rp 500.000')).toBeVisible();
  });

  test('5. ucapan baru tampil di publik setelah admin menyetujui', async ({ page, request }) => {
    // Sebelum disetujui: belum tampil.
    const before = await request.get('/api/wishes?page=1');
    expect((await before.json()).total).toBe(0);

    await loginAsAdmin(page);
    await openAdminTab(page, 'Ucapan');

    const ucapan = page.getByRole('region', { name: 'Moderasi ucapan' });
    const kartu = ucapan.getByRole('listitem').filter({ hasText: 'Keluarga Bapak Hasan' });

    await expect(kartu).toBeVisible();
    await kartu.getByRole('button', { name: 'Setujui' }).click();
    await expect(kartu.getByText('Disetujui')).toBeVisible();

    // Setelah disetujui: tampil di daftar publik.
    const after = await request.get('/api/wishes?page=1');
    const body = await after.json();
    expect(body.total).toBe(1);
    expect(body.items[0].name).toBe('Keluarga Bapak Hasan');
  });

  /**
   * Inti dari perpindahan lepas dari spreadsheet: satu suntingan di dashboard
   * harus sampai ke tamu tanpa langkah lain — tanpa sinkronisasi, tanpa menunggu
   * TTL cache habis.
   */
  test('pengaturan yang disimpan admin langsung tampil ke tamu', async ({ page, request }) => {
    await loginAsAdmin(page);
    await openAdminTab(page, 'Pengaturan');

    await page.getByLabel('Nama tempat').fill('Gedung Serbaguna Melati');
    await page.getByRole('button', { name: 'Simpan pengaturan' }).first().click();
    await expect(page.getByText('Pengaturan tersimpan')).toBeVisible();

    await page.goto('/to/budi-santoso');
    await openInvitation(page);
    await page.locator('#lokasi').scrollIntoViewIfNeeded();

    await expect(page.getByRole('heading', { name: 'Gedung Serbaguna Melati' })).toBeVisible();

    // Kembalikan ke data seed agar berkas uji berikutnya berangkat dari keadaan
    // yang sama seperti bila berkas ini tidak pernah dijalankan.
    await resetConfig(request);
  });

  test('tamu baru dapat ditambahkan dan langsung punya halaman sendiri', async ({ page }) => {
    await loginAsAdmin(page);
    await openAdminTab(page, 'Tamu');

    await page.getByRole('button', { name: 'Tambah tamu' }).click();
    await page.getByLabel('Nama tamu').fill('Keluarga Bapak Sutrisno');
    await page.getByRole('button', { name: 'Tambah tamu' }).last().click();

    await expect(page.getByText('Tamu ditambahkan.')).toBeVisible();

    // Slug diturunkan otomatis dari nama, jadi link-nya dapat ditebak di sini.
    await page.goto('/to/keluarga-bapak-sutrisno');
    await expect(page.getByText('Keluarga Bapak Sutrisno').first()).toBeVisible();
  });

  test('ucapan yang disetujui terlihat oleh tamu di halaman undangan', async ({ page }) => {
    await page.goto('/to/budi-santoso');
    await openInvitation(page);

    await page.locator('#ucapan').scrollIntoViewIfNeeded();
    await expect(page.getByText('1 ucapan telah tampil')).toBeVisible();
    await expect(page.getByText('Barakallahu lakuma')).toBeVisible();
  });

  /**
   * Permintaan di bawah dijalankan DI DALAM halaman (`page.evaluate`), bukan
   * lewat `page.request`. Cookie sesi ditandai `Secure` di mode produksi, dan
   * APIRequestContext menolak mengirimnya lewat http:// — sementara browser
   * tetap mengirimkannya untuk origin lokal. Menjalankannya di halaman juga
   * lebih setia pada apa yang benar-benar dilakukan dashboard.
   */
  test('unduhan CSV tersedia setelah login', async ({ page }) => {
    await loginAsAdmin(page);

    const downloadPromise = page.waitForEvent('download');
    await page.getByRole('link', { name: 'Unduh CSV RSVP' }).click();
    const download = await downloadPromise;

    expect(download.suggestedFilename()).toMatch(/^walimah-rsvp-\d{4}-\d{2}-\d{2}\.csv$/);

    const stream = await download.createReadStream();
    const chunks: Buffer[] = [];
    for await (const chunk of stream) chunks.push(chunk as Buffer);
    const csv = Buffer.concat(chunks).toString('utf8');

    expect(csv).toContain('Nama');
    expect(csv).toContain('Siti Nurhaliza');
  });

  test('mutasi tanpa token CSRF ditolak 403 meski sesi valid', async ({ page }) => {
    await loginAsAdmin(page);

    const status = await page.evaluate(async () => {
      const response = await fetch('/api/admin/wishes/1', {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ status: 'approved' }),
      });
      const body = (await response.json()) as { error?: { code?: string } };
      return { code: response.status, errorCode: body.error?.code };
    });

    expect(status).toEqual({ code: 403, errorCode: 'FORBIDDEN' });
  });

  test('keluar menghapus sesi', async ({ page }) => {
    await loginAsAdmin(page);
    await page.getByRole('button', { name: 'Keluar' }).click();

    await expect(page).toHaveURL(/\/admin\/login$/);

    await page.goto('/admin');
    await expect(page).toHaveURL(/\/admin\/login$/);
  });
});

// Uji penguncian akun ada di 07-lockout.spec.ts: sekali dijalankan, akun admin
// terkunci 15 menit, sehingga harus menjadi berkas terakhir dalam suite.

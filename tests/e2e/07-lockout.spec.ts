import { expect, test } from '@playwright/test';
import { ADMIN_PASSWORD, ADMIN_USERNAME } from './helpers';

/**
 * Penguncian akun admin (PRD §4.5).
 *
 * Sengaja menjadi berkas TERAKHIR dalam suite: begitu tes ini selesai, akun
 * admin benar-benar terkunci selama 15 menit, sehingga setiap tes setelahnya
 * yang perlu login pasti gagal.
 */
test('akun terkunci setelah lima percobaan gagal', async ({ request }) => {
  let locked: { code: string; message: string } | null = null;

  for (let attempt = 0; attempt < 6 && locked === null; attempt += 1) {
    const response = await request.post('/api/admin/login', {
      data: { username: ADMIN_USERNAME, password: `salah-${attempt}` },
    });

    const body = (await response.json()) as { error: { code: string; message: string } };
    if (body.error.code === 'LOCKED') locked = body.error;
  }

  expect(locked, 'akun harus terkunci dalam 6 percobaan').not.toBeNull();
  expect(locked?.message).toContain('terkunci');

  // Kata sandi yang benar pun ditolak selama masa kunci berlangsung — inilah
  // yang membuat penguncian bermakna sebagai pertahanan terhadap tebak sandi.
  const correct = await request.post('/api/admin/login', {
    data: { username: ADMIN_USERNAME, password: ADMIN_PASSWORD },
  });

  expect(correct.status()).toBe(429);
  expect((await correct.json()).error.code).toBe('LOCKED');
});

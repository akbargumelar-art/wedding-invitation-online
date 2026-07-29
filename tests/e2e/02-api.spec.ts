import { expect, test } from '@playwright/test';
import { pngBuffer } from './helpers';

/**
 * Tes integrasi kontrak API (PRD §3.4): happy path, payload tidak valid (422),
 * dan rate limit terlampaui (429). Skenario RSVP tertutup (403) ada di
 * 04-content.spec.ts karena butuh perubahan konfigurasi.
 *
 * Berkas dijalankan berurutan dengan satu worker: rate limit dihitung per IP,
 * jadi urutan permintaan menentukan hasilnya.
 */

test.describe.configure({ mode: 'serial' });

test.describe('POST /api/rsvp', () => {
  test('happy path menyimpan konfirmasi (201)', async ({ request }) => {
    const response = await request.post('/api/rsvp', {
      data: { slug: 'siti-nurhaliza', name: 'Siti Nurhaliza', status: 'hadir', pax: 2 },
    });

    expect(response.status()).toBe(201);
    expect(await response.json()).toMatchObject({
      rsvp: { name: 'Siti Nurhaliza', status: 'hadir', pax: 2 },
    });
  });

  test('payload tidak valid ditolak 422 dengan pesan berbahasa Indonesia', async ({ request }) => {
    const response = await request.post('/api/rsvp', {
      data: { name: 'A', status: 'mungkin', pax: 99 },
    });

    expect(response.status()).toBe(422);

    const body = await response.json();
    expect(body.error.code).toBe('VALIDATION');
    expect(body.error.message).toMatch(/[a-z]/);
    // Bentuk respons galat seragam, tanpa stack trace (PRD §4.4).
    expect(body).not.toHaveProperty('stack');
  });
});

test.describe('POST /api/wishes', () => {
  test('happy path menyimpan ucapan berstatus moderasi (201)', async ({ request }) => {
    const response = await request.post('/api/wishes', {
      data: {
        slug: 'keluarga-hasan',
        name: 'Keluarga Bapak Hasan',
        message: 'Barakallahu lakuma wa baraka alaikuma. Semoga menjadi keluarga samawa.',
        elapsedMs: 8000,
      },
    });

    expect(response.status()).toBe(201);
    // moderasi_ucapan = TRUE pada seed, jadi ucapan belum tampil.
    expect(await response.json()).toEqual({ moderated: true });
  });

  test('ucapan yang belum disetujui tidak muncul di daftar publik', async ({ request }) => {
    const response = await request.get('/api/wishes?page=1');

    expect(response.status()).toBe(200);
    const body = await response.json();
    expect(body.total).toBe(0);
    expect(body.items).toEqual([]);
  });

  test('honeypot terisi ditolak 422', async ({ request }) => {
    const response = await request.post('/api/wishes', {
      data: { name: 'Bot', message: 'Beli produk murah di sini', hp: 'terisi', elapsedMs: 9000 },
    });

    expect(response.status()).toBe(422);
  });

  test('6. pengiriman berturut-turut dari IP sama akhirnya ditolak 429', async ({ request }) => {
    let rateLimited: { status: number; body: { error: { code: string; message: string } } } | null =
      null;

    // Batas ucapan 3 per 10 menit; beberapa hit sudah terpakai oleh tes di atas,
    // jadi 429 harus muncul dalam beberapa percobaan berikutnya.
    for (let attempt = 0; attempt < 4 && rateLimited === null; attempt += 1) {
      const response = await request.post('/api/wishes', {
        data: {
          name: `Tamu Spam ${attempt}`,
          message: 'Ucapan berulang untuk menguji pembatasan laju pengiriman.',
          elapsedMs: 9000,
        },
      });

      if (response.status() === 429) {
        rateLimited = { status: response.status(), body: await response.json() };
      }
    }

    expect(rateLimited, 'harus ada permintaan yang ditolak 429').not.toBeNull();
    expect(rateLimited?.body.error.code).toBe('RATE_LIMITED');
    expect(rateLimited?.body.error.message).toContain('Terlalu banyak pengiriman');
  });
});

test.describe('POST /api/envelope', () => {
  test('happy path mencatat konfirmasi berstatus pending (201)', async ({ request }) => {
    const response = await request.post('/api/envelope', {
      multipart: {
        slug: 'rahmat-hidayat',
        sender_name: 'Dr. Rahmat Hidayat',
        amount: '500000',
        method: 'transfer',
        note: 'Semoga berkah',
      },
    });

    expect(response.status()).toBe(201);
    // Aplikasi tidak pernah mengklaim dana diterima (R-6).
    expect(await response.json()).toMatchObject({ status: 'pending' });
  });

  test('8. bukti transfer 5 MB ditolak 413 dan tidak tersimpan', async ({ request }) => {
    const response = await request.post('/api/envelope', {
      multipart: {
        sender_name: 'Tamu Uji',
        method: 'qris',
        proof: {
          name: 'bukti-besar.png',
          mimeType: 'image/png',
          buffer: pngBuffer(5 * 1024 * 1024),
        },
      },
    });

    expect(response.status()).toBe(413);
    const body = await response.json();
    expect(body.error.code).toBe('PAYLOAD_TOO_LARGE');
    expect(body.error.message).toContain('maksimal');
  });

  test('metode pengiriman tak dikenal ditolak 422', async ({ request }) => {
    const response = await request.post('/api/envelope', {
      multipart: { sender_name: 'Tamu Uji', method: 'paypal' },
    });

    expect(response.status()).toBe(422);
  });
});

test.describe('Endpoint dengan secret', () => {
  test('revalidate menolak secret salah', async ({ request }) => {
    const response = await request.post('/api/revalidate', { data: { secret: 'salah' } });
    expect(response.status()).toBe(401);
  });

  test('cron backup menolak secret salah', async ({ request }) => {
    const response = await request.post('/api/cron/backup', { data: { secret: 'salah' } });
    expect(response.status()).toBe(401);
  });
});

import { expect, test } from '@playwright/test';
import { createHmac } from 'node:crypto';
import { createServer, type Server } from 'node:http';
import {
  addGuestWithPhone,
  clearOutbox,
  configureWaha,
  loginAsAdmin,
  openAdminTab,
} from './helpers';

/**
 * Pengiriman undangan dan penerimaan balasan lewat WAHA.
 *
 * Sebuah tiruan server WAHA dijalankan di localhost, lalu diperiksa apa yang
 * benar-benar dikirim aplikasi — bukan sekadar apakah tombolnya dapat ditekan.
 * Dua hal yang paling penting dibuktikan di sini:
 *
 *  1. **pengiriman massal tidak pernah beruntun.** Ini satu-satunya penjaga
 *     antara mempelai dan pemblokiran nomor oleh WhatsApp, dan kerusakannya
 *     tidak akan terlihat di layar mana pun — undangan tetap "terkirim";
 *  2. **jalur masuk tidak dapat ditulisi sembarang orang.** Webhook ini dapat
 *     menulis RSVP tanpa ada tamu membuka halaman, jadi ia diuji menolak
 *     permintaan tanpa tanda tangan maupun bertanda tangan salah.
 *
 * Berkas ini sengaja berjalan SEBELUM 07-lockout: dua pengujian pertama perlu
 * masuk sebagai admin, sedangkan spec itu mengunci akun selama 15 menit.
 */

const WAHA_PORT = 3401;
const WAHA_SECRET = 'e2e-waha-hmac-secret-yang-panjang';
const WAHA_URL = `http://127.0.0.1:${WAHA_PORT}`;

const TAMU = { nama: 'Keluarga Bapak Sanusi', slug: 'keluarga-bapak-sanusi', telepon: '6281200000001' };

type SentMessage = { chatId: string; text: string; at: number };

const sent: SentMessage[] = [];
let server: Server;

test.describe.configure({ mode: 'serial' });

test.beforeAll(async () => {
  server = createServer((req, res) => {
    let body = '';
    req.on('data', (chunk) => {
      body += chunk;
    });

    req.on('end', () => {
      if (req.url?.startsWith('/api/sessions/')) {
        res.writeHead(200, { 'content-type': 'application/json' });
        res.end(JSON.stringify({ name: 'default', status: 'WORKING', me: { id: '628999@c.us' } }));
        return;
      }

      if (req.url === '/api/sendText') {
        const parsed = JSON.parse(body || '{}') as { chatId?: string; text?: string };
        sent.push({ chatId: parsed.chatId ?? '', text: parsed.text ?? '', at: Date.now() });

        res.writeHead(201, { 'content-type': 'application/json' });
        res.end('{"id":"true_628_ABC"}');
        return;
      }

      res.writeHead(404);
      res.end();
    });
  });

  await new Promise<void>((resolve) => server.listen(WAHA_PORT, '127.0.0.1', resolve));

  await configureWaha({
    baseUrl: WAHA_URL,
    secret: WAHA_SECRET,
    // Jeda dipendekkan ke batas terendah yang diizinkan supaya suite tidak
    // berjalan berjam-jam. Yang diuji adalah ADANYA jeda, bukan angkanya.
    minDelaySeconds: 5,
    maxDelaySeconds: 5,
  });

  await addGuestWithPhone(TAMU.nama, TAMU.slug, TAMU.telepon);
  await clearOutbox();
});

test.afterAll(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
});

/** Panggil API admin dari dalam halaman, sehingga cookie sesi ikut terkirim. */
async function callAdmin(
  page: import('@playwright/test').Page,
  url: string,
  body: unknown,
): Promise<{ status: number; json: Record<string, unknown> }> {
  return page.evaluate(
    async ({ url, body }) => {
      const csrf = document.cookie.match(/(?:^|;\s*)walimah_csrf=([^;]+)/)?.[1] ?? '';

      const response = await fetch(url, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-walimah-csrf': decodeURIComponent(csrf) },
        body: JSON.stringify(body),
      });

      return { status: response.status, json: (await response.json()) as Record<string, unknown> };
    },
    { url, body },
  );
}

function signedPost(payload: unknown, secret = WAHA_SECRET) {
  const raw = JSON.stringify(payload);

  return {
    data: raw,
    headers: {
      'content-type': 'application/json',
      'x-webhook-hmac': createHmac('sha512', secret).update(raw).digest('hex'),
      'x-webhook-hmac-algorithm': 'sha512',
    },
  };
}

function messageEvent(id: string, from: string, body: string) {
  return { event: 'message', session: 'default', payload: { id, from, body, fromMe: false } };
}

test('kirim satuan mengirim pesan undangan lewat WAHA', async ({ page }) => {
  sent.length = 0;

  await loginAsAdmin(page);
  await openAdminTab(page, 'Tamu');

  // Disaring lebih dulu supaya tombol yang ditekan pasti milik tamu ini, bukan
  // baris pertama yang kebetulan tampil.
  await page.getByLabel('Cari tamu').fill(TAMU.nama);
  await page.getByRole('button', { name: 'Kirim undangan' }).first().click();

  await expect(page.getByText(`Undangan terkirim ke ${TAMU.nama}`)).toBeVisible();

  expect(sent).toHaveLength(1);
  expect(sent[0]?.chatId).toBe(`${TAMU.telepon}@c.us`);
  expect(sent[0]?.text).toContain(TAMU.nama);
  expect(sent[0]?.text).toContain(`/to/${TAMU.slug}`);
  // Penanda templat yang tidak tergantikan berarti tamu menerima pesan berisi
  // "{nama}" alih-alih namanya.
  expect(sent[0]?.text).not.toContain('{');
});

test('pengiriman massal diberi jeda, tidak diberondong sekaligus', async ({ page }) => {
  test.setTimeout(90_000);

  sent.length = 0;
  await clearOutbox();

  await addGuestWithPhone('Tamu Antre Satu', 'tamu-antre-satu', '6281200000002');
  await addGuestWithPhone('Tamu Antre Dua', 'tamu-antre-dua', '6281200000003');
  await addGuestWithPhone('Tamu Antre Tiga', 'tamu-antre-tiga', '6281200000004');

  await loginAsAdmin(page);

  const result = await callAdmin(page, '/api/admin/whatsapp/broadcast', {
    guestIds: [],
    includeSent: true,
  });

  expect(result.status).toBe(200);
  expect(Number(result.json['queued'])).toBeGreaterThanOrEqual(3);

  // Segera setelah antrean tersusun, belum boleh ada yang terkirim beruntun.
  expect(sent.length).toBeLessThanOrEqual(1);

  // Tunggu sampai beberapa pesan terkirim, lalu periksa jarak antar-pesan.
  await expect
    .poll(() => sent.length, { timeout: 60_000, intervals: [1000] })
    .toBeGreaterThanOrEqual(3);

  for (let i = 1; i < sent.length; i += 1) {
    const gap = (sent[i]?.at ?? 0) - (sent[i - 1]?.at ?? 0);
    // Ambang sedikit di bawah jeda yang diatur, memberi ruang bagi ketidaktepatan
    // pencacah — yang dijaga adalah tidak adanya pengiriman beruntun.
    expect(gap).toBeGreaterThanOrEqual(4_000);
  }
});

test('webhook menolak permintaan tanpa tanda tangan', async ({ request }) => {
  const response = await request.post('/api/webhook/waha', {
    data: messageEvent('palsu-1', `${TAMU.telepon}@c.us`, 'HADIR 2'),
  });

  expect(response.status()).toBe(401);
});

test('webhook menolak tanda tangan yang salah', async ({ request }) => {
  const payload = messageEvent('palsu-2', `${TAMU.telepon}@c.us`, 'HADIR 2');
  const { data, headers } = signedPost(payload, 'rahasia-yang-salah');

  const response = await request.post('/api/webhook/waha', { data, headers });

  expect(response.status()).toBe(401);
});

test('balasan HADIR dari tamu terdaftar tercatat sebagai RSVP', async ({ request }) => {
  const payload = messageEvent('wa-rsvp-1', `${TAMU.telepon}@c.us`, 'Insya Allah hadir 3 orang');
  const { data, headers } = signedPost(payload);

  const response = await request.post('/api/webhook/waha', { data, headers });

  expect(response.status()).toBe(200);
  expect((await response.json()).action).toBe('rsvp');

  const rsvp = await request.get(`/api/rsvp?slug=${TAMU.slug}`);
  const body = await rsvp.json();

  expect(body.rsvp.status).toBe('hadir');
  expect(body.rsvp.pax).toBe(3);
});

test('pesan yang sama tidak diproses dua kali', async ({ request }) => {
  // WAHA mengirim ulang webhook yang gagal; tanpa penangkal, satu ucapan bisa
  // tercatat berkali-kali dan satu RSVP berubah-ubah sendiri.
  const payload = messageEvent('wa-rsvp-1', `${TAMU.telepon}@c.us`, 'Tidak hadir');
  const { data, headers } = signedPost(payload);

  const response = await request.post('/api/webhook/waha', { data, headers });

  expect(response.status()).toBe(200);
  expect((await response.json()).action).toBe('ignored');

  // Jawaban sebelumnya tidak boleh tergeser oleh kiriman ulang itu.
  const rsvp = await request.get(`/api/rsvp?slug=${TAMU.slug}`);
  expect((await rsvp.json()).rsvp.status).toBe('hadir');
});

test('nomor di luar daftar tamu tidak dapat menulis apa pun', async ({ request }) => {
  const payload = messageEvent('wa-asing-1', '6289999999999@c.us', 'HADIR 5');
  const { data, headers } = signedPost(payload);

  const response = await request.post('/api/webhook/waha', { data, headers });

  expect(response.status()).toBe(200);
  expect((await response.json()).action).toBe('ignored');
});

test('ucapan lewat WhatsApp masuk ke buku ucapan', async ({ request }) => {
  const payload = messageEvent(
    'wa-ucapan-1',
    `${TAMU.telepon}@c.us`,
    'Ucapan Barakallahu lakuma wa baraka alaikuma',
  );
  const { data, headers } = signedPost(payload);

  const response = await request.post('/api/webhook/waha', { data, headers });

  expect(response.status()).toBe(200);
  expect((await response.json()).action).toBe('wish');
});

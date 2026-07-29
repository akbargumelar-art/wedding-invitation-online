import { expect, test } from '@playwright/test';
import { createHmac } from 'node:crypto';
import { createServer, type Server } from 'node:http';
import { CRON_SECRET } from './helpers';

/**
 * Notifikasi keluar ke WhatsApp/webhook.
 *
 * Berkas ini menjalankan penerima webhook sungguhan di localhost, lalu memeriksa
 * apa yang benar-benar dikirim aplikasi: bentuk payload, tanda tangan HMAC, dan
 * bahwa tidak ada data sensitif yang ikut keluar.
 *
 * Sengaja dijalankan paling akhir: selama spec 01–04 berjalan, penerima ini
 * belum hidup, jadi seluruh notifikasi dari kiriman tamu di sana gagal dengan
 * connection refused dan mengendap di antrean. Itu tepat kondisi yang harus
 * ditangani — gateway mati tidak boleh menghilangkan satu peristiwa pun.
 */

const WEBHOOK_PORT = 3399;
const WEBHOOK_SECRET = 'e2e-webhook-secret';

type Received = { body: string; signature: string | null };

const received: Received[] = [];
let server: Server;

test.describe.configure({ mode: 'serial' });

test.beforeAll(async () => {
  server = createServer((req, res) => {
    let body = '';
    req.on('data', (chunk) => {
      body += chunk;
    });
    req.on('end', () => {
      received.push({ body, signature: req.headers['x-walimah-signature'] as string | null });
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end('{"ok":true}');
    });
  });

  await new Promise<void>((resolve) => server.listen(WEBHOOK_PORT, '127.0.0.1', resolve));
});

test.afterAll(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
});

function parsed(): Array<{ event: string; title: string; message: string; data: Record<string, unknown> }> {
  return received.map((item) => JSON.parse(item.body));
}

test('kunjungan pertama tamu memicu notifikasi keluar', async ({ request }) => {
  const before = received.length;

  // Slug ini belum pernah dibuka pada spec sebelumnya, jadi terhitung
  // kunjungan pertama hari ini.
  const response = await request.post('/api/track', { data: { slug: 'ratna-dewi' } });
  expect(response.status()).toBe(204);

  // Pengiriman terjadi SETELAH respons; tunggu penerima mencatatnya.
  await expect
    .poll(() => received.length, { timeout: 10_000 })
    .toBeGreaterThan(before);

  const visit = parsed().find((item) => item.event === 'visit' && item.data['slug'] === 'ratna-dewi');
  expect(visit, 'notifikasi kunjungan harus terkirim').toBeTruthy();
  expect(visit?.title).toBe('Undangan dibuka');
  expect(visit?.message).toContain('Ibu Ratna Dewi');
});

test('payload ditandatangani HMAC yang dapat diverifikasi penerima', async () => {
  const item = received.at(-1);
  expect(item).toBeTruthy();

  const expected = `sha256=${createHmac('sha256', WEBHOOK_SECRET).update(item!.body).digest('hex')}`;
  expect(item!.signature).toBe(expected);

  // Tanda tangan harus gagal bila isi diubah sedikit pun.
  const tampered = `sha256=${createHmac('sha256', WEBHOOK_SECRET)
    .update(`${item!.body} `)
    .digest('hex')}`;
  expect(item!.signature).not.toBe(tampered);
});

test('antrean yang tertunda selama gateway mati akhirnya terkirim', async ({ request }) => {
  // Jeda percobaan ulang pertama adalah 30 detik sejak kegagalan, jadi baris
  // dari spec sebelumnya belum tentu siap saat tes ini mulai.
  test.setTimeout(90_000);

  const before = received.length;

  // Setiap baris punya jadwalnya sendiri, jadi satu panggilan cron belum tentu
  // mengosongkan seluruh antrean. Terus panggil sampai ketiga jenis peristiwa
  // dari kiriman tamu di spec 01–04 benar-benar sampai ke penerima.
  await expect
    .poll(
      async () => {
        const response = await request.post('/api/cron/notify', { data: { secret: CRON_SECRET } });
        expect(response.status()).toBe(200);

        const body = await response.json();
        expect(body.ok).toBe(true);
        expect(body.channel).toBe('webhook');

        const events = new Set(parsed().map((item) => item.event));
        return ['rsvp', 'wish', 'envelope'].filter((event) => events.has(event)).sort();
      },
      {
        message: 'seluruh notifikasi tertunda harus akhirnya terkirim',
        timeout: 60_000,
        intervals: [2_000],
      },
    )
    .toEqual(['envelope', 'rsvp', 'wish']);

  expect(received.length).toBeGreaterThan(before);
});

test('notifikasi RSVP membawa detail yang dapat langsung ditindaklanjuti', async () => {
  const rsvp = parsed().find((item) => item.event === 'rsvp');
  expect(rsvp).toBeTruthy();

  expect(rsvp?.message).toMatch(/HADIR|TIDAK HADIR|MASIH RAGU/);
  expect(rsvp?.data).toHaveProperty('pax');
  expect(rsvp?.data).toHaveProperty('isUpdate');
});

test('notifikasi amplop mengingatkan bahwa dana belum diverifikasi', async () => {
  const envelope = parsed().find((item) => item.event === 'envelope');
  expect(envelope).toBeTruthy();

  expect(envelope?.message).toContain('Belum diverifikasi');
  // Keberadaan bukti disebut, tapi berkasnya sendiri tidak pernah dikirim keluar.
  expect(envelope?.data).toHaveProperty('hasProof');
});

test('tidak ada data sensitif yang keluar dari server', async () => {
  const all = received.map((item) => item.body).join('\n');

  for (const forbidden of ['ip_hash', 'ipHash', 'user_agent', 'userAgent', 'proof_file', '.jpg', '.png']) {
    expect(all, `payload tidak boleh memuat ${forbidden}`).not.toContain(forbidden);
  }
});

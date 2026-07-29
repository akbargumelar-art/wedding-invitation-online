import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { NotificationPayload } from '@/lib/notify/types';

/**
 * Bentuk permintaan ke gateway WhatsApp berbasis chatId.
 *
 * Env disetel sebelum modul dimuat karena `@/lib/env` membaca process.env sekali
 * saat inisialisasi. `fetch` distub agar tes memeriksa apa yang DIKIRIM, tanpa
 * pernah menghubungi jaringan.
 */
process.env['NOTIFY_CHANNEL'] = 'whatsapp_gateway';
process.env['NOTIFY_EVENTS'] = 'rsvp,wish,envelope,visit';
process.env['NOTIFY_RECIPIENTS'] = '120363044814127701@g.us, +62 812-3456-7890';
process.env['WHATSAPP_GATEWAY_URL'] = 'http://gateway.test/api/sendText';
process.env['WHATSAPP_GATEWAY_SESSION'] = 'walimah';
process.env['WHATSAPP_GATEWAY_API_KEY'] = 'rahasia-gateway';
process.env['WHATSAPP_GATEWAY_API_KEY_HEADER'] = 'X-Api-Key';

const { activeChannel, deliver, isNotifyConfigured } = await import('@/lib/notify/drivers');

const rsvp: NotificationPayload = {
  event: 'rsvp',
  name: 'Budi Santoso',
  slug: 'budi-santoso',
  status: 'hadir',
  pax: 2,
  message: null,
  isUpdate: false,
};

type Captured = { url: string; headers: Record<string, string>; body: Record<string, unknown> };

let captured: Captured[] = [];

function stubFetch(status = 200, responseBody = '{"ok":true}') {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init: RequestInit) => {
      captured.push({
        url: String(url),
        headers: (init.headers ?? {}) as Record<string, string>,
        body: JSON.parse(String(init.body)),
      });
      return new Response(responseBody, { status });
    }),
  );
}

beforeEach(() => {
  captured = [];
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('konfigurasi saluran', () => {
  it('mengenali saluran whatsapp_gateway', () => {
    expect(activeChannel()).toBe('whatsapp_gateway');
  });

  it('dianggap terkonfigurasi bila URL dan tujuan terisi', () => {
    expect(isNotifyConfigured()).toBe(true);
  });
});

describe('pengiriman ke gateway chatId', () => {
  it('mengirim satu permintaan per tujuan', async () => {
    stubFetch();
    const result = await deliver(rsvp);

    expect(result.ok).toBe(true);
    expect(captured).toHaveLength(2);
    expect(captured.every((item) => item.url === 'http://gateway.test/api/sendText')).toBe(true);
  });

  it('mempertahankan JID grup dan melengkapi nomor biasa', async () => {
    stubFetch();
    await deliver(rsvp);

    expect(captured.map((item) => item.body['chatId'])).toEqual([
      '120363044814127701@g.us',
      '6281234567890@c.us',
    ]);
  });

  it('menyertakan session dan isi pesan pada field yang benar', async () => {
    stubFetch();
    await deliver(rsvp);

    const body = captured[0]!.body;
    expect(body['session']).toBe('walimah');
    expect(String(body['text'])).toContain('Budi Santoso');
    expect(String(body['text'])).toContain('HADIR');
  });

  it('mengirim API key pada header yang dikonfigurasi', async () => {
    stubFetch();
    await deliver(rsvp);

    expect(captured[0]!.headers['X-Api-Key']).toBe('rahasia-gateway');
  });

  it('tidak pernah menyertakan berkas atau caption gambar', async () => {
    stubFetch();
    await deliver(rsvp);

    // Bukti transfer tetap di server; hanya teks yang keluar.
    expect(captured[0]!.body).not.toHaveProperty('file');
    expect(captured[0]!.body).not.toHaveProperty('caption');
  });

  it('menandai galat 5xx sebagai layak dicoba ulang', async () => {
    stubFetch(503, 'gateway sedang restart');
    const result = await deliver(rsvp);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.retryable).toBe(true);
      expect(result.error).toContain('503');
    }
  });

  it('menandai galat 401 sebagai tidak layak dicoba ulang', async () => {
    // Mengulang permintaan dengan API key yang salah hanya membuang waktu.
    stubFetch(401, 'unauthorized');
    const result = await deliver(rsvp);

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.retryable).toBe(false);
  });
});

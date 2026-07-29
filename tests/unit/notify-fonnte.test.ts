import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { NotificationPayload } from '@/lib/notify/types';

/** Gateway Fonnte. Env disetel sebelum modul dimuat. */
process.env['NOTIFY_CHANNEL'] = 'fonnte';
process.env['NOTIFY_EVENTS'] = 'rsvp,wish,envelope,visit';
process.env['NOTIFY_RECIPIENTS'] = '6281234567890,6289876543210';
process.env['FONNTE_TOKEN'] = 'token-fonnte';

const { activeChannel, deliver, isNotifyConfigured } = await import('@/lib/notify/drivers');

const envelope: NotificationPayload = {
  event: 'envelope',
  senderName: 'Dr. Rahmat Hidayat',
  slug: 'rahmat-hidayat',
  amount: 500_000,
  method: 'transfer',
  note: null,
  hasProof: true,
};

type Captured = { url: string; headers: Record<string, string>; body: Record<string, unknown> };
let captured: Captured[] = [];

function stubFetch(status: number, responseBody: string) {
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
afterEach(() => vi.unstubAllGlobals());

describe('Fonnte', () => {
  it('dikenali dan dianggap terkonfigurasi', () => {
    expect(activeChannel()).toBe('fonnte');
    expect(isNotifyConfigured()).toBe(true);
  });

  it('mengirim seluruh tujuan dalam satu permintaan', async () => {
    stubFetch(200, '{"status":true,"id":["1"]}');
    const result = await deliver(envelope);

    expect(result.ok).toBe(true);
    expect(captured).toHaveLength(1);
    expect(captured[0]!.url).toBe('https://api.fonnte.com/send');
    expect(captured[0]!.body['target']).toBe('6281234567890,6289876543210');
    expect(captured[0]!.headers['authorization']).toBe('token-fonnte');
    expect(String(captured[0]!.body['message'])).toContain('Rp 500.000');
  });

  /**
   * Jebakan Fonnte: permintaan gagal tetap dibalas HTTP 200, dan kegagalannya
   * hanya terlihat pada `status: false` di dalam body. Tanpa pemeriksaan ini,
   * notifikasi yang tidak pernah sampai akan tercatat sebagai berhasil.
   */
  it('mendeteksi kegagalan yang disamarkan sebagai HTTP 200', async () => {
    stubFetch(200, '{"status":false,"reason":"token tidak valid"}');
    const result = await deliver(envelope);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toContain('token tidak valid');
      expect(result.retryable).toBe(false);
    }
  });

  it('menganggap balasan non-JSON dengan HTTP 200 sebagai berhasil', async () => {
    stubFetch(200, 'OK');
    expect((await deliver(envelope)).ok).toBe(true);
  });

  it('menandai galat 5xx sebagai layak dicoba ulang', async () => {
    stubFetch(502, 'bad gateway');
    const result = await deliver(envelope);

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.retryable).toBe(true);
  });
});

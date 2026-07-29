import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { NotificationPayload } from '@/lib/notify/types';

/** WhatsApp Cloud API resmi Meta. Env disetel sebelum modul dimuat. */
process.env['NOTIFY_CHANNEL'] = 'whatsapp_cloud';
process.env['NOTIFY_EVENTS'] = 'rsvp,wish,envelope,visit';
process.env['NOTIFY_RECIPIENTS'] = '6281234567890,6289876543210';
process.env['WHATSAPP_PHONE_NUMBER_ID'] = '123456789';
process.env['WHATSAPP_ACCESS_TOKEN'] = 'token-meta';
process.env['WHATSAPP_API_VERSION'] = 'v21.0';
process.env['WHATSAPP_TEMPLATE_NAME'] = 'walimah_notifikasi';
process.env['WHATSAPP_TEMPLATE_LANG'] = 'id';

const { activeChannel, deliver, isNotifyConfigured } = await import('@/lib/notify/drivers');

const wish: NotificationPayload = {
  event: 'wish',
  name: 'Siti Nurhaliza',
  slug: 'siti-nurhaliza',
  message: 'Barakallahu lakuma',
  moderated: true,
};

type Captured = { url: string; headers: Record<string, string>; body: Record<string, unknown> };
let captured: Captured[] = [];

function stubFetch(status = 200, responseBody = '{"messages":[{"id":"wamid.x"}]}') {
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

describe('WhatsApp Cloud API', () => {
  it('dikenali dan dianggap terkonfigurasi', () => {
    expect(activeChannel()).toBe('whatsapp_cloud');
    expect(isNotifyConfigured()).toBe(true);
  });

  it('memanggil endpoint Graph API dengan bearer token', async () => {
    stubFetch();
    const result = await deliver(wish);

    expect(result.ok).toBe(true);
    expect(captured[0]!.url).toBe('https://graph.facebook.com/v21.0/123456789/messages');
    expect(captured[0]!.headers['authorization']).toBe('Bearer token-meta');
  });

  it('mengirim satu permintaan per nomor tujuan', async () => {
    stubFetch();
    await deliver(wish);

    expect(captured.map((item) => item.body['to'])).toEqual(['6281234567890', '6289876543210']);
  });

  it('memakai template dengan dua parameter bila nama template diisi', async () => {
    stubFetch();
    await deliver(wish);

    const body = captured[0]!.body;
    expect(body['type']).toBe('template');

    const template = body['template'] as {
      name: string;
      language: { code: string };
      components: Array<{ parameters: Array<{ type: string; text: string }> }>;
    };

    expect(template.name).toBe('walimah_notifikasi');
    expect(template.language.code).toBe('id');

    // Meta menolak template bila jumlah parameter tidak cocok dengan yang
    // disetujui; template proyek ini selalu dua variabel.
    const parameters = template.components[0]!.parameters;
    expect(parameters).toHaveLength(2);
    expect(parameters[0]!.text).toBe('Ucapan baru');
    for (const parameter of parameters) expect(parameter.text).not.toContain('\n');
  });

  it('melaporkan kegagalan sebagian dengan menyebut nomor yang gagal', async () => {
    stubFetch(400, 'invalid recipient');
    const result = await deliver(wish);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toContain('6281234567890');
      // 400 dari Meta tidak akan membaik dengan diulang.
      expect(result.retryable).toBe(false);
    }
  });

  it('menandai 429 sebagai layak dicoba ulang', async () => {
    stubFetch(429, 'rate limited');
    const result = await deliver(wish);

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.retryable).toBe(true);
  });
});

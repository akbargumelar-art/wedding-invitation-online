import { createHmac, timingSafeEqual } from 'node:crypto';
import { after, NextResponse } from 'next/server';
import { apiError, internalError } from '@/lib/api';
import { logger } from '@/lib/logger';
import { sendText } from '@/lib/waha/client';
import { handleInboundMessage, type InboundMessage } from '@/lib/waha/inbound';
import { isWahaReady, readWahaSettings } from '@/lib/waha/settings';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/**
 * POST /api/webhook/waha — pesan masuk dari WAHA.
 *
 * Endpoint ini adalah satu-satunya jalur di aplikasi yang dapat menulis RSVP,
 * ucapan, dan konfirmasi amplop tanpa ada tamu yang membuka halaman. Karena itu
 * ia dijaga dua lapis:
 *
 *  1. tanda tangan HMAC-SHA512 atas badan permintaan MENTAH, memakai rahasia
 *     yang diatur di dashboard. Tanpa rahasia itu tersimpan, seluruh permintaan
 *     ditolak — endpoint terbuka lebih buruk daripada integrasi yang belum jadi;
 *  2. nomor pengirim wajib cocok dengan seorang tamu terdaftar (lihat
 *     inbound.ts).
 *
 * Balasan ke tamu dikirim lewat `after()`, di luar siklus respons: WAHA tidak
 * perlu menunggu perjalanan pesan balik, dan webhook yang lambat akan dicoba
 * ulang olehnya — pengulangan yang justru berbahaya di sini.
 */

/** Bandingkan tanda tangan tanpa membocorkan posisi karakter yang berbeda. */
function safeEqualHex(a: string, b: string): boolean {
  const bufA = Buffer.from(a, 'hex');
  const bufB = Buffer.from(b, 'hex');
  return bufA.length > 0 && bufA.length === bufB.length && timingSafeEqual(bufA, bufB);
}

type WahaEvent = {
  event?: unknown;
  session?: unknown;
  payload?: {
    id?: unknown;
    from?: unknown;
    body?: unknown;
    fromMe?: unknown;
    hasMedia?: unknown;
  };
};

export async function POST(request: Request): Promise<NextResponse> {
  try {
    const settings = readWahaSettings();

    if (!settings.webhookSecret) {
      logger.warn('waha.webhook_no_secret');
      return apiError(401, 'UNAUTHORIZED', 'Webhook belum dikonfigurasi.');
    }

    // Badan permintaan dibaca sebagai teks mentah, bukan lewat request.json():
    // tanda tangan dihitung atas byte yang benar-benar dikirim, dan JSON yang
    // sudah di-parse lalu di-stringify ulang hampir pasti berbeda.
    const raw = await request.text();

    const expected = createHmac('sha512', settings.webhookSecret).update(raw).digest('hex');
    const provided = request.headers.get('x-webhook-hmac') ?? '';

    if (!safeEqualHex(provided, expected)) {
      logger.warn('waha.webhook_bad_signature');
      return apiError(401, 'UNAUTHORIZED', 'Tanda tangan tidak cocok.');
    }

    let event: WahaEvent;
    try {
      event = JSON.parse(raw) as WahaEvent;
    } catch {
      return apiError(422, 'VALIDATION', 'Badan permintaan bukan JSON yang sah.');
    }

    // WAHA menyiarkan banyak jenis peristiwa (status pengiriman, presence, dan
    // lainnya). Membalas 200 untuk yang tidak dipakai jauh lebih baik daripada
    // galat — WAHA menganggap non-2xx sebagai kegagalan dan mengirim ulang.
    if (event.event !== 'message' && event.event !== 'message.any') {
      return NextResponse.json({ ok: true, skipped: String(event.event ?? 'unknown') });
    }

    if (!settings.acceptReplies) {
      return NextResponse.json({ ok: true, skipped: 'replies_disabled' });
    }

    const payload = event.payload ?? {};
    const message: InboundMessage = {
      messageId: String(payload.id ?? ''),
      chatId: String(payload.from ?? ''),
      body: typeof payload.body === 'string' ? payload.body : '',
      fromMe: payload.fromMe === true,
      hasMedia: payload.hasMedia === true,
    };

    if (!message.messageId || !message.chatId) {
      return NextResponse.json({ ok: true, skipped: 'incomplete' });
    }

    const result = await handleInboundMessage(message);

    if (result.reply && settings.autoReply && isWahaReady(settings)) {
      after(async () => {
        const sent = await sendText(settings, message.chatId, result.reply);
        if (!sent.ok) logger.warn('waha.reply_failed', { error: sent.error });
      });
    }

    logger.info('waha.inbound', { action: result.action });
    return NextResponse.json({ ok: true, action: result.action });
  } catch (error) {
    return internalError('waha.webhook_failed', error);
  }
}

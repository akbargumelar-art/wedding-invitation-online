import { NextResponse } from 'next/server';
import { apiError, hasValidSecret, internalError, readSecret } from '@/lib/api';
import { drainNotificationQueue, activeChannel } from '@/lib/notify';
import { env } from '@/lib/env';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/**
 * POST /api/cron/notify — kirim ulang notifikasi yang sempat gagal.
 *
 * Pengiriman normal terjadi langsung setelah respons tamu. Endpoint ini adalah
 * jaring pengaman untuk saat gateway WhatsApp sedang mati: antreannya tersimpan
 * di database, jadi tidak ada peristiwa yang hilang.
 */
export async function POST(request: Request): Promise<NextResponse> {
  try {
    const secret = await readSecret(request);
    if (!hasValidSecret(secret, env.security.cronSecret)) {
      return apiError(401, 'UNAUTHORIZED', 'Secret tidak valid.');
    }

    const result = await drainNotificationQueue();
    return NextResponse.json({ ok: true, channel: activeChannel(), ...result });
  } catch (error) {
    return internalError('cron.notify_failed', error);
  }
}

import { NextResponse } from 'next/server';
import { apiError, hasValidSecret, internalError, readSecret } from '@/lib/api';
import { summarizeOutbox } from '@/lib/db/outbox';
import { env } from '@/lib/env';
import { tickOutbox } from '@/lib/waha/sender';
import { ensureOutboxWorker } from '@/lib/waha/worker';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/**
 * POST /api/cron/invitations — jaring pengaman antrean undangan.
 *
 * Pengiriman normal digerakkan pencacah di dalam proses, tiap lima detik, karena
 * jeda antar-undangan diukur dalam puluhan detik dan cron tidak dapat serapat
 * itu. Endpoint ini menutup satu celah yang tersisa: layanan direstart di tengah
 * antrean, lalu tidak ada seorang pun yang membuka dashboard sehingga tidak ada
 * yang menyalakan pencacahnya kembali.
 *
 * Karena itu ia melakukan dua hal — menjalankan satu langkah antrean, lalu
 * memastikan pencacahnya hidup untuk mengurus sisanya.
 */
export async function POST(request: Request): Promise<NextResponse> {
  try {
    const secret = await readSecret(request);
    if (!hasValidSecret(secret, env.security.cronSecret)) {
      return apiError(401, 'UNAUTHORIZED', 'Secret tidak valid.');
    }

    const result = await tickOutbox();
    const summary = summarizeOutbox();

    if (summary.pending > 0) ensureOutboxWorker();

    return NextResponse.json({ ok: true, result, summary });
  } catch (error) {
    return internalError('cron.invitations_failed', error);
  }
}

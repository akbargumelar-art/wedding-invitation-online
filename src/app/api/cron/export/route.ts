import { NextResponse } from 'next/server';
import { apiError, hasValidSecret, internalError, readSecret } from '@/lib/api';
import { exportToSheet } from '@/lib/export';
import { env } from '@/lib/env';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/** POST /api/cron/export — sinkronisasi ke tab Export tiap 6 jam (US-16). */
export async function POST(request: Request): Promise<NextResponse> {
  try {
    const secret = await readSecret(request);
    if (!hasValidSecret(secret, env.security.cronSecret)) {
      return apiError(401, 'UNAUTHORIZED', 'Secret tidak valid.');
    }

    const result = await exportToSheet();

    // Kredensial tulis yang belum diatur bukan galat server: laporkan apa adanya
    // supaya cron tidak dianggap gagal terus-menerus di log.
    return NextResponse.json(result, { status: result.ok ? 200 : 202 });
  } catch (error) {
    return internalError('cron.export_failed', error);
  }
}

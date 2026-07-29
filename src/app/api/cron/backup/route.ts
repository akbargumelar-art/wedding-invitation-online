import { NextResponse } from 'next/server';
import { apiError, hasValidSecret, internalError, readSecret } from '@/lib/api';
import { runBackup, runMaintenance } from '@/lib/backup';
import { env } from '@/lib/env';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/**
 * POST /api/cron/backup — dipanggil cron 02:00 WIB (US-16).
 *
 * Dilindungi CRON_SECRET dan hanya dijangkau dari localhost pada konfigurasi
 * Caddy yang disarankan, jadi tidak perlu sesi admin.
 */
export async function POST(request: Request): Promise<NextResponse> {
  try {
    const secret = await readSecret(request);
    if (!hasValidSecret(secret, env.security.cronSecret)) {
      return apiError(401, 'UNAUTHORIZED', 'Secret tidak valid.');
    }

    const backup = runBackup();
    const maintenance = runMaintenance();

    return NextResponse.json({ ok: true, backup, maintenance });
  } catch (error) {
    return internalError('cron.backup_failed', error);
  }
}

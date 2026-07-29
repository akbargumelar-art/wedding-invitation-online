import { NextResponse } from 'next/server';
import { revalidatePath, revalidateTag } from 'next/cache';
import { apiError, enforceRateLimit, hasValidSecret, internalError, readSecret, requestIdentity } from '@/lib/api';
import { RATE_LIMITS } from '@/lib/rate-limit';
import { CONTENT_CACHE_TAG } from '@/lib/content';
import { env } from '@/lib/env';
import { logger } from '@/lib/logger';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/**
 * POST /api/revalidate — paksa muat ulang konten dari Google Sheet.
 *
 * Normalnya konten disegarkan otomatis tiap `SHEET_CACHE_TTL` detik. Endpoint
 * ini untuk saat admin butuh perubahan tampil seketika (mis. jam acara berubah
 * mendadak) tanpa menunggu jendela revalidasi.
 */
export async function POST(request: Request): Promise<NextResponse> {
  try {
    const { ipHash } = requestIdentity(request);

    const limited = enforceRateLimit(RATE_LIMITS.revalidate, ipHash);
    if (limited) return limited;

    const secret = await readSecret(request);
    if (!hasValidSecret(secret, env.security.revalidateSecret)) {
      return apiError(401, 'UNAUTHORIZED', 'Secret tidak valid.');
    }

    revalidateTag(CONTENT_CACHE_TAG);
    revalidatePath('/', 'layout');

    logger.info('content.revalidated');
    return NextResponse.json({ revalidated: true, at: new Date().toISOString() });
  } catch (error) {
    return internalError('api.revalidate_failed', error);
  }
}

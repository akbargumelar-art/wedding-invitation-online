import { NextResponse } from 'next/server';
import {
  apiError,
  enforceRateLimit,
  internalError,
  requestIdentity,
  validationError,
} from '@/lib/api';
import { RATE_LIMITS } from '@/lib/rate-limit';
import { MIN_FORM_ELAPSED_MS, wishSchema } from '@/lib/validation';
import { createWish, listApprovedWishes } from '@/lib/db/wishes';
import { getContent } from '@/lib/content';
import { logger } from '@/lib/logger';
import { notify } from '@/lib/notify';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/** POST /api/wishes — kirim ucapan & doa (US-11). */
export async function POST(request: Request): Promise<NextResponse> {
  try {
    const { ipHash } = requestIdentity(request);

    const limited = enforceRateLimit(RATE_LIMITS.wishes, ipHash);
    if (limited) return limited;

    const body: unknown = await request.json();
    const parsed = wishSchema.safeParse(body);

    // Honeypot terisi ditangkap oleh skema (max panjang 0) dan berakhir di sini.
    if (!parsed.success) return validationError(parsed.error);

    // Form yang dikirim < 3 detik setelah dirender hampir pasti bukan manusia.
    if (parsed.data.elapsedMs < MIN_FORM_ELAPSED_MS) {
      logger.warn('api.wishes.too_fast', { elapsedMs: parsed.data.elapsedMs });
      return apiError(
        422,
        'VALIDATION',
        'Mohon tunggu sejenak sebelum mengirim ucapan, lalu coba lagi.',
      );
    }

    const { config } = await getContent();
    const status = config.moderasiUcapan ? 'pending' : 'approved';

    const row = createWish({
      guestSlug: parsed.data.slug,
      name: parsed.data.name,
      message: parsed.data.message,
      status,
      ipHash,
    });

    notify({
      event: 'wish',
      name: row.name,
      slug: row.guest_slug,
      message: row.message,
      moderated: config.moderasiUcapan,
    });

    return NextResponse.json({ moderated: config.moderasiUcapan }, { status: 201 });
  } catch (error) {
    return internalError('api.wishes.post_failed', error);
  }
}

/** GET /api/wishes?page=n — daftar ucapan yang sudah disetujui, 10 per halaman. */
export async function GET(request: Request): Promise<NextResponse> {
  try {
    const { ipHash } = requestIdentity(request);

    const limited = enforceRateLimit(RATE_LIMITS.wishesRead, ipHash);
    if (limited) return limited;

    const page = Number.parseInt(new URL(request.url).searchParams.get('page') ?? '1', 10);
    const result = listApprovedWishes(Number.isFinite(page) ? page : 1);

    return NextResponse.json({
      items: result.items,
      total: result.total,
      hasMore: result.hasMore,
    });
  } catch (error) {
    return internalError('api.wishes.get_failed', error);
  }
}

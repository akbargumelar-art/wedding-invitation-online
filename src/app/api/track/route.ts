import { NextResponse } from 'next/server';
import { enforceRateLimit, internalError, requestIdentity } from '@/lib/api';
import { RATE_LIMITS } from '@/lib/rate-limit';
import { trackVisit } from '@/lib/db/misc';
import { findGuestBySlug } from '@/lib/content';
import { notify } from '@/lib/notify';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/**
 * POST /api/track — statistik kunjungan (US-15).
 *
 * Hanya agregat per slug per hari; tidak ada identitas, cookie, atau pelacak
 * pihak ketiga (PRD §4.5). Kegagalan di sini tidak boleh mengganggu tamu,
 * karena itu respons selalu 204.
 */
export async function POST(request: Request): Promise<NextResponse | Response> {
  try {
    const { ipHash } = requestIdentity(request);

    const limited = enforceRateLimit(RATE_LIMITS.track, ipHash);
    if (limited) return limited;

    const body = (await request.json().catch(() => ({}))) as { slug?: unknown };
    const slug = typeof body.slug === 'string' && /^[a-z0-9-]{1,80}$/.test(body.slug) ? body.slug : null;

    const isFirstToday = trackVisit(slug);

    // Hanya pembukaan pertama hari itu yang dinotifikasi — tamu yang membuka
    // ulang link tidak boleh membanjiri WhatsApp mempelai.
    if (isFirstToday) {
      const guest = slug ? await findGuestBySlug(slug) : null;
      notify({ event: 'visit', name: guest?.nama ?? null, slug });
    }

    return new Response(null, { status: 204 });
  } catch (error) {
    return internalError('api.track.post_failed', error);
  }
}

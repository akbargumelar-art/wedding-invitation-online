import { NextResponse } from 'next/server';
import {
  apiError,
  enforceRateLimit,
  internalError,
  requestIdentity,
  validationError,
} from '@/lib/api';
import { RATE_LIMITS } from '@/lib/rate-limit';
import { rsvpSchema } from '@/lib/validation';
import { findRsvpBySlug, upsertRsvp } from '@/lib/db/rsvp';
import { getContent } from '@/lib/content';
import { isPastDeadline } from '@/lib/date';
import { notify } from '@/lib/notify';

// Endpoint menulis ke SQLite: harus selalu dinamis, tidak boleh ter-cache.
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/**
 * POST /api/rsvp — konfirmasi kehadiran (US-10).
 *
 * Validasi dijalankan ulang di server dengan skema yang sama seperti di klien;
 * validasi klien tidak dianggap sebagai jaminan apa pun.
 */
export async function POST(request: Request): Promise<NextResponse> {
  try {
    const { ipHash, userAgent } = requestIdentity(request);

    const limited = enforceRateLimit(RATE_LIMITS.rsvp, ipHash);
    if (limited) return limited;

    // Pemeriksaan penutupan RSVP dilakukan di server, bukan hanya disembunyikan
    // di UI — form yang sudah terbuka di tab lama pun tetap ditolak.
    const { config } = await getContent();
    if (!config.rsvpOpen || isPastDeadline(config.deadlineRsvp)) {
      return apiError(
        403,
        'CLOSED',
        'Masa konfirmasi kehadiran sudah ditutup. Terima kasih atas perhatian Anda.',
      );
    }

    const parsed = rsvpSchema.safeParse(await request.json());
    if (!parsed.success) return validationError(parsed.error);

    // Diperiksa sebelum menulis: sesudahnya baris pasti ada, dan kita kehilangan
    // cara membedakan kiriman pertama dari pembaruan.
    const isUpdate = parsed.data.slug !== null && findRsvpBySlug(parsed.data.slug) !== null;

    const row = upsertRsvp({
      guestSlug: parsed.data.slug,
      name: parsed.data.name,
      status: parsed.data.status,
      pax: parsed.data.pax,
      message: parsed.data.message,
      ipHash,
      userAgent,
    });

    notify({
      event: 'rsvp',
      name: row.name,
      slug: row.guest_slug,
      status: row.status,
      pax: row.pax,
      message: row.message,
      isUpdate,
    });

    return NextResponse.json(
      {
        rsvp: {
          name: row.name,
          status: row.status,
          pax: row.pax,
          message: row.message,
        },
      },
      { status: 201 },
    );
  } catch (error) {
    return internalError('api.rsvp.post_failed', error);
  }
}

/**
 * GET /api/rsvp?slug=… — jawaban tersimpan milik satu tamu.
 *
 * Tambahan di luar tabel kontrak PRD §4.4, dibutuhkan agar tamu yang membuka
 * kembali link personalnya melihat jawabannya dan dapat mengubahnya (US-10).
 * Slug itu sendiri adalah rahasia tautan personal, jadi tidak ada kebocoran
 * data ke pihak yang belum memegang tautannya.
 */
export async function GET(request: Request): Promise<NextResponse> {
  try {
    const slug = new URL(request.url).searchParams.get('slug');
    if (!slug || !/^[a-z0-9-]{1,80}$/.test(slug)) {
      return NextResponse.json({ rsvp: null });
    }

    const { ipHash } = requestIdentity(request);
    const limited = enforceRateLimit(RATE_LIMITS.wishesRead, ipHash);
    if (limited) return limited;

    const row = findRsvpBySlug(slug);
    return NextResponse.json({
      rsvp: row ? { name: row.name, status: row.status, pax: row.pax, message: row.message } : null,
    });
  } catch (error) {
    return internalError('api.rsvp.get_failed', error);
  }
}

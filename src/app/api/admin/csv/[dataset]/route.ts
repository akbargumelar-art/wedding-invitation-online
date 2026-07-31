import { apiError, internalError, requireAdmin } from '@/lib/api';
import {
  buildEnvelopeRows,
  buildGuestRows,
  buildRsvpRows,
  buildWishRows,
  toCsv,
} from '@/lib/export';
import { env } from '@/lib/env';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const BUILDERS = {
  rsvp: buildRsvpRows,
  ucapan: buildWishRows,
  amplop: buildEnvelopeRows,
  tamu: () => buildGuestRows(env.siteUrl),
} as const;

type Dataset = keyof typeof BUILDERS;

/** GET /api/admin/csv/[dataset] — tombol "Unduh CSV" per tabel (US-15). */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ dataset: string }> },
): Promise<Response> {
  const guard = await requireAdmin(request);
  if (!guard.ok) return guard.response;

  try {
    const { dataset } = await params;
    if (!(dataset in BUILDERS)) {
      return apiError(404, 'NOT_FOUND', 'Kumpulan data tidak dikenal.');
    }

    const csv = toCsv(BUILDERS[dataset as Dataset]());
    const stamp = new Date().toISOString().slice(0, 10);

    return new Response(csv, {
      headers: {
        'content-type': 'text/csv; charset=utf-8',
        'content-disposition': `attachment; filename="walimah-${dataset}-${stamp}.csv"`,
        'cache-control': 'private, no-store',
      },
    });
  } catch (error) {
    return internalError('admin.csv_failed', error);
  }
}

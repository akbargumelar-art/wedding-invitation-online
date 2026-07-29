import { NextResponse } from 'next/server';
import { apiError, internalError, requireAdmin, validationError } from '@/lib/api';
import { envelopeModerationSchema } from '@/lib/validation';
import { updateEnvelopeStatus } from '@/lib/db/envelope';
import { recordAudit } from '@/lib/db/misc';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/**
 * PATCH /api/admin/envelope/[id] — verifikasi konfirmasi amplop (US-15).
 *
 * Ini satu-satunya jalan sebuah konfirmasi berubah dari `pending`: verifikasi
 * selalu keputusan manusia setelah mengecek mutasi rekening (R-6).
 */
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const guard = await requireAdmin(request);
  if (!guard.ok) return guard.response;

  try {
    const id = Number.parseInt((await params).id, 10);
    if (!Number.isFinite(id)) return apiError(404, 'NOT_FOUND', 'Konfirmasi tidak ditemukan.');

    const parsed = envelopeModerationSchema.safeParse(await request.json());
    if (!parsed.success) return validationError(parsed.error);

    if (!updateEnvelopeStatus(id, parsed.data.status)) {
      return apiError(404, 'NOT_FOUND', 'Konfirmasi tidak ditemukan.');
    }

    recordAudit(`envelope:${parsed.data.status}`, String(id), guard.username);
    return NextResponse.json({ ok: true, id, status: parsed.data.status });
  } catch (error) {
    return internalError('admin.envelope_patch_failed', error);
  }
}

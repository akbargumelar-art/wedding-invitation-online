import { NextResponse } from 'next/server';
import { apiError, internalError, requireAdmin, validationError } from '@/lib/api';
import { wishModerationSchema } from '@/lib/validation';
import { softDeleteWish, updateWishStatus } from '@/lib/db/wishes';
import { recordAudit } from '@/lib/db/misc';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/**
 * PATCH /api/admin/wishes/[id] — moderasi ucapan (US-15).
 * Status `deleted` diterjemahkan menjadi soft delete, bukan DELETE fisik.
 */
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const guard = await requireAdmin(request);
  if (!guard.ok) return guard.response;

  try {
    const id = Number.parseInt((await params).id, 10);
    if (!Number.isFinite(id)) return apiError(404, 'NOT_FOUND', 'Ucapan tidak ditemukan.');

    const parsed = wishModerationSchema.safeParse(await request.json());
    if (!parsed.success) return validationError(parsed.error);

    const { status } = parsed.data;
    const changed = status === 'deleted' ? softDeleteWish(id) : updateWishStatus(id, status);

    if (!changed) return apiError(404, 'NOT_FOUND', 'Ucapan tidak ditemukan.');

    recordAudit(`wish:${status}`, String(id), guard.username);
    return NextResponse.json({ ok: true, id, status });
  } catch (error) {
    return internalError('admin.wish_patch_failed', error);
  }
}

import { commitChange, ok, withAdmin } from '@/lib/admin-content';
import {
  cancelPendingInvitations,
  requeueFailedInvitations,
  summarizeOutbox,
} from '@/lib/db/outbox';
import { secondsUntilNextSend } from '@/lib/waha/sender';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/** GET /api/admin/whatsapp/queue — keadaan antrean, untuk memantau progres. */
export async function GET(request: Request): Promise<Response> {
  return withAdmin(request, 'admin.waha_queue_failed', () =>
    ok({ summary: summarizeOutbox(), nextSendInSeconds: secondsUntilNextSend() }),
  );
}

/**
 * DELETE /api/admin/whatsapp/queue — batalkan seluruh antrean yang belum terkirim.
 *
 * Undangan yang sudah terlanjur terkirim tidak dapat ditarik kembali; yang
 * dibatalkan hanya sisa antrean.
 */
export async function DELETE(request: Request): Promise<Response> {
  return withAdmin(request, 'admin.waha_cancel_failed', (actor) => {
    const cancelled = cancelPendingInvitations();
    commitChange('waha.queue_cancelled', `${cancelled} antrean`, actor);

    return ok({ cancelled, summary: summarizeOutbox() });
  });
}

/** POST /api/admin/whatsapp/queue — kembalikan pengiriman yang gagal ke antrean. */
export async function POST(request: Request): Promise<Response> {
  return withAdmin(request, 'admin.waha_requeue_failed', (actor) => {
    const requeued = requeueFailedInvitations();
    commitChange('waha.queue_requeued', `${requeued} antrean`, actor);

    return ok({ requeued, summary: summarizeOutbox() });
  });
}

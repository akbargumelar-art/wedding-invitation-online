import { apiError } from '@/lib/api';
import { commitChange, ok, withValidated } from '@/lib/admin-content';
import { listGuests } from '@/lib/db/content';
import { sendInvitationNow } from '@/lib/waha/sender';
import { sendInvitationSchema } from '@/lib/validation';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/**
 * POST /api/admin/whatsapp/send — kirim undangan ke satu tamu, seketika.
 *
 * Tidak lewat antrean: admin yang menekan tombol untuk satu orang berhak
 * melihat hasilnya sekarang juga. Jadwal pengiriman massal tetap ikut bergeser
 * (lihat sender.ts), jadi ini bukan pintu belakang untuk mengirim beruntun.
 */
export async function POST(request: Request): Promise<Response> {
  return withValidated(request, sendInvitationSchema, 'admin.waha_send_failed', async (input, actor) => {
    const guest = listGuests().find((row) => row.id === input.guestId);
    if (!guest) return apiError(404, 'NOT_FOUND', 'Tamu tidak ditemukan.');

    const result = await sendInvitationNow(guest);

    if (!result.ok) {
      return apiError(502, 'INTERNAL', `Undangan gagal dikirim: ${result.error}`);
    }

    commitChange('waha.send', guest.slug, actor);
    return ok({ guest: guest.nama });
  });
}

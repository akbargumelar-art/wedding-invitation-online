import { apiError } from '@/lib/api';
import { commitChange, ok, withValidated } from '@/lib/admin-content';
import { listGuests } from '@/lib/db/content';
import { enqueueInvitations, latestSendStateByGuest, summarizeOutbox } from '@/lib/db/outbox';
import { toChatId } from '@/lib/notify/chat-id';
import { isWahaReady, readWahaSettings } from '@/lib/waha/settings';
import { ensureOutboxWorker } from '@/lib/waha/worker';
import { broadcastSchema } from '@/lib/validation';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/**
 * POST /api/admin/whatsapp/broadcast — antre pengiriman undangan massal.
 *
 * Route ini TIDAK mengirim apa pun; ia hanya menyusun antrean. Pengirimannya
 * dilakukan pencacah di latar belakang dengan jeda acak antar-pesan, sehingga
 * permintaan ini selesai seketika berapa pun jumlah tamunya — dan menutup tab
 * dashboard tidak menghentikan penyebaran undangan yang sedang berjalan.
 */
export async function POST(request: Request): Promise<Response> {
  return withValidated(request, broadcastSchema, 'admin.waha_broadcast_failed', (input, actor) => {
    const settings = readWahaSettings();
    if (!isWahaReady(settings)) {
      return apiError(400, 'VALIDATION', 'Integrasi WhatsApp belum aktif atau belum lengkap.');
    }

    const sudahTerkirim = latestSendStateByGuest();
    const dipilih = new Set(input.guestIds);

    const kandidat = listGuests().filter((guest) => {
      if (!guest.telepon) return false;
      if (dipilih.size > 0 && !dipilih.has(guest.id)) return false;

      // Tanpa ini, "kirim ke semua" yang ditekan dua kali akan mengirim ulang
      // undangan ke tamu yang sudah menerimanya.
      if (!input.includeSent && sudahTerkirim.get(guest.id)?.status === 'sent') return false;

      return true;
    });

    if (kandidat.length === 0) {
      return apiError(
        400,
        'VALIDATION',
        dipilih.size > 0
          ? 'Tamu yang dipilih belum punya nomor WhatsApp, atau undangannya sudah terkirim.'
          : 'Tidak ada tamu yang perlu dikirimi undangan. Pastikan nomor WhatsApp sudah diisi.',
      );
    }

    const queued = enqueueInvitations(
      kandidat.map((guest) => ({
        guestId: guest.id,
        guestSlug: guest.slug,
        guestNama: guest.nama,
        chatId: toChatId(guest.telepon),
      })),
    );

    commitChange('waha.broadcast', `${queued} tamu`, actor);

    // Bangunkan pencacah bila ia sedang berhenti karena antrean sempat kosong.
    ensureOutboxWorker();

    // Perkiraan durasi memakai jeda rata-rata; angka ini yang ditampilkan ke
    // admin supaya jelas bahwa penyebaran undangan memang berlangsung lama.
    const rataJeda = (settings.minDelaySeconds + settings.maxDelaySeconds) / 2;

    return ok({
      queued,
      estimatedMinutes: Math.ceil((queued * rataJeda) / 60),
      summary: summarizeOutbox(),
    });
  });
}

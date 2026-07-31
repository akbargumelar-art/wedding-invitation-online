import { ok, withAdmin } from '@/lib/admin-content';
import { sendText } from '@/lib/waha/client';
import { canNotifyViaWaha, readWahaSettings } from '@/lib/waha/settings';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/**
 * POST /api/admin/whatsapp/test-notify — kirim satu pesan uji ke nomor mempelai.
 *
 * Dibuat terpisah dari "Tes koneksi" karena yang dibuktikan berbeda: tes koneksi
 * hanya memastikan server WAHA menjawab, sedangkan ini membuktikan pesan
 * benar-benar SAMPAI ke nomor yang diisi. Keduanya bisa berbeda hasil — sesi
 * yang sehat tetap gagal mengirim ke nomor yang salah ketik, dan kegagalan itu
 * baru ketahuan saat RSVP pertama masuk kalau tidak diuji lebih dulu.
 *
 * Tidak lewat antrean notifikasi: pesan uji tidak perlu dicoba ulang, dan
 * mencatatnya di tabel notifikasi hanya mengotori rekap.
 */
export async function POST(request: Request): Promise<Response> {
  return withAdmin(request, 'admin.waha_test_notify_failed', async () => {
    const settings = readWahaSettings();

    if (!canNotifyViaWaha(settings)) {
      return ok({
        sent: 0,
        message:
          'Integrasi belum siap: pastikan WhatsApp aktif, alamat server terisi, dan minimal satu nomor penerima notifikasi diisi — lalu simpan pengaturan lebih dulu.',
      });
    }

    const pesan = [
      '*Uji notifikasi Walimah*',
      '',
      'Bila pesan ini sampai, pemberitahuan RSVP, ucapan, dan konfirmasi amplop akan dikirim ke nomor ini.',
    ].join('\n');

    const failures: string[] = [];
    let sent = 0;

    for (const recipient of settings.notifyRecipients) {
      const result = await sendText(settings, recipient, pesan);
      if (result.ok) sent += 1;
      else failures.push(`${recipient}: ${result.error}`);
    }

    return ok({
      sent,
      message:
        failures.length === 0
          ? `Pesan uji terkirim ke ${sent} nomor. Periksa WhatsApp Anda.`
          : `${sent} terkirim, ${failures.length} gagal — ${failures.join(' ; ')}`,
    });
  });
}

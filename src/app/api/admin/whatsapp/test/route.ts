import { ok, withAdmin } from '@/lib/admin-content';
import { checkSession } from '@/lib/waha/client';
import { readWahaSettings } from '@/lib/waha/settings';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/**
 * POST /api/admin/whatsapp/test — periksa sambungan ke server WAHA.
 *
 * Kegagalan di sini dikembalikan sebagai respons 200 berisi penjelasan, bukan
 * sebagai galat HTTP: yang gagal adalah sambungan ke pihak ketiga, bukan
 * permintaan admin, dan membedakannya membuat pesan di layar jauh lebih jelas.
 */
export async function POST(request: Request): Promise<Response> {
  return withAdmin(request, 'admin.waha_test_failed', async () => {
    const result = await checkSession(readWahaSettings());

    if (!result.ok) return ok({ connected: false, message: result.error });

    const siap = result.status === 'WORKING';

    return ok({
      connected: siap,
      status: result.status,
      me: result.me,
      message: siap
        ? `Tersambung sebagai ${result.me ?? 'nomor tidak diketahui'}.`
        : `Server WAHA menjawab, tetapi sesi berstatus ${result.status} — pindai ulang kode QR di WAHA sebelum mengirim undangan.`,
    });
  });
}

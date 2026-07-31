import { randomBytes } from 'node:crypto';
import { commitChange, ok, withAdmin } from '@/lib/admin-content';
import { readWahaSettings, writeWahaSettings } from '@/lib/waha/settings';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/**
 * POST /api/admin/whatsapp/secret — buatkan rahasia HMAC webhook yang baru.
 *
 * Nilainya dikembalikan SEKALI di respons ini, karena admin harus menyalinnya
 * ke konfigurasi WAHA. Sesudah itu ia tidak pernah dikirim lagi ke browser —
 * dashboard hanya diberi tahu bahwa rahasianya sudah terisi.
 *
 * Membuat rahasia baru memutus webhook yang sedang berjalan sampai nilai baru
 * dipasang di sisi WAHA. Itu perilaku yang benar: rahasia yang bocor harus bisa
 * dicabut seketika.
 */
export async function POST(request: Request): Promise<Response> {
  return withAdmin(request, 'admin.waha_secret_failed', (actor) => {
    const secret = randomBytes(32).toString('hex');

    writeWahaSettings({ ...readWahaSettings(), webhookSecret: secret });
    commitChange('waha.secret_rotated', null, actor);

    return ok({ secret });
  });
}

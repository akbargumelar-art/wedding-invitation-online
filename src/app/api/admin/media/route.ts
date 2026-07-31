import { NextResponse } from 'next/server';
import { apiError, internalError, requireAdmin } from '@/lib/api';
import { commitChange } from '@/lib/admin-content';
import { mediaUrl, recordMedia } from '@/lib/db/content';
import { storeMediaFile } from '@/lib/uploads';
import { stripHtml } from '@/lib/text';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/**
 * POST /api/admin/media — unggah gambar isi undangan.
 *
 * Berbeda dari route konten lain, payloadnya multipart dan bukan JSON, jadi
 * tidak lewat `withValidated`. Autentikasi dan CSRF tetap ditegakkan lewat
 * `requireAdmin` yang sama.
 */
export async function POST(request: Request): Promise<Response> {
  const guard = await requireAdmin(request);
  if (!guard.ok) return guard.response;

  try {
    const form = await request.formData();
    const file = form.get('file');

    if (!(file instanceof File) || file.size === 0) {
      return apiError(422, 'VALIDATION', 'Pilih satu berkas gambar untuk diunggah.');
    }

    const label = stripHtml(String(form.get('label') ?? '')).slice(0, 80);

    const result = await storeMediaFile(file);
    if (!result.ok) {
      const status = result.code === 'TOO_LARGE' ? 413 : 415;
      const code = result.code === 'TOO_LARGE' ? 'PAYLOAD_TOO_LARGE' : 'UNSUPPORTED_MEDIA';
      return apiError(status, code, result.message);
    }

    const { fileName, kind, bytes } = result.proof;
    recordMedia(fileName, kind, bytes, label);
    commitChange('media.upload', fileName, guard.username);

    return NextResponse.json({ ok: true, fileName, url: mediaUrl(fileName), bytes });
  } catch (error) {
    return internalError('admin.media_upload_failed', error);
  }
}

import { commitChange, notFound, ok, withAdmin } from '@/lib/admin-content';
import { forgetMedia } from '@/lib/db/content';
import { deleteMediaFile, isSafeMediaName } from '@/lib/uploads';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/**
 * DELETE /api/admin/media/[file] — hapus berkas gambar beserta catatannya.
 *
 * Berkas dihapus meski masih dirujuk galeri atau kolom foto: memaksa admin
 * melepas semua rujukan lebih dulu hanya akan membuat berkas usang menumpuk di
 * disk VPS. Yang tampil ke tamu untuk rujukan yatim adalah gambar gagal muat,
 * bukan halaman error.
 */
export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ file: string }> },
): Promise<Response> {
  const { file } = await params;

  return withAdmin(request, 'admin.media_delete_failed', (actor) => {
    if (!isSafeMediaName(file)) return notFound();

    const removedRow = forgetMedia(file);
    const removedFile = deleteMediaFile(file);
    if (!removedRow && !removedFile) return notFound();

    commitChange('media.delete', file, actor);
    return ok();
  });
}

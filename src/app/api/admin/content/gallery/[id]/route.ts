import { commitChange, notFound, ok, parseId, withAdmin, withValidated } from '@/lib/admin-content';
import { deleteGallery, updateGallery } from '@/lib/db/content';
import { gallerySchema } from '@/lib/validation';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

type Context = { params: Promise<{ id: string }> };

export async function PUT(request: Request, { params }: Context): Promise<Response> {
  const id = parseId((await params).id);

  return withValidated(request, gallerySchema, 'admin.gallery_update_failed', (input, actor) => {
    if (id === null || !updateGallery(id, input)) return notFound();

    commitChange('gallery.update', String(id), actor);
    return ok();
  });
}

/**
 * Menghapus baris galeri tidak menghapus berkas gambarnya: satu berkas boleh
 * dipakai di beberapa tempat (mis. juga sebagai sampul), dan penghapusan berkas
 * adalah aksi tersendiri di tab Media.
 */
export async function DELETE(request: Request, { params }: Context): Promise<Response> {
  const id = parseId((await params).id);

  return withAdmin(request, 'admin.gallery_delete_failed', (actor) => {
    if (id === null || !deleteGallery(id)) return notFound();

    commitChange('gallery.delete', String(id), actor);
    return ok();
  });
}

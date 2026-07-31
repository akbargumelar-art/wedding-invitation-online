import { commitChange, ok, withValidated } from '@/lib/admin-content';
import { createGallery, reorderGallery } from '@/lib/db/content';
import { gallerySchema, reorderSchema } from '@/lib/validation';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/** POST /api/admin/content/gallery — tambah satu foto galeri. */
export async function POST(request: Request): Promise<Response> {
  return withValidated(request, gallerySchema, 'admin.gallery_create_failed', (input, actor) => {
    const id = createGallery(input);
    commitChange('gallery.create', String(id), actor);
    return ok({ id });
  });
}

/** PATCH /api/admin/content/gallery — tulis ulang urutan tampil seluruh foto. */
export async function PATCH(request: Request): Promise<Response> {
  return withValidated(request, reorderSchema, 'admin.gallery_reorder_failed', ({ ids }, actor) => {
    reorderGallery(ids);
    commitChange('gallery.reorder', `${ids.length} foto`, actor);
    return ok();
  });
}

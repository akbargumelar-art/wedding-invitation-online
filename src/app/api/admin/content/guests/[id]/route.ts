import { apiError } from '@/lib/api';
import { commitChange, notFound, ok, parseId, withAdmin, withValidated } from '@/lib/admin-content';
import { deleteGuest, isSlugTaken, listGuests, updateGuest } from '@/lib/db/content';
import { uniqueSlug } from '@/lib/text';
import { guestSchema } from '@/lib/validation';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

type Context = { params: Promise<{ id: string }> };

export async function PUT(request: Request, { params }: Context): Promise<Response> {
  const id = parseId((await params).id);

  return withValidated(request, guestSchema, 'admin.guest_update_failed', (input, actor) => {
    if (id === null) return notFound();

    if (input.slug && isSlugTaken(input.slug, id)) {
      return apiError(409, 'VALIDATION', `Slug "${input.slug}" sudah dipakai tamu lain.`);
    }

    const taken = listGuests()
      .filter((guest) => guest.id !== id)
      .map((guest) => guest.slug);

    const slug = input.slug || uniqueSlug(input.nama, taken);
    const saved = updateGuest(id, {
      nama: input.nama,
      slug,
      kategori: input.kategori,
      telepon: input.telepon,
    });

    if (!saved) return notFound();

    commitChange('guest.update', slug, actor);
    return ok({ slug });
  });
}

export async function DELETE(request: Request, { params }: Context): Promise<Response> {
  const id = parseId((await params).id);

  return withAdmin(request, 'admin.guest_delete_failed', (actor) => {
    if (id === null || !deleteGuest(id)) return notFound();

    commitChange('guest.delete', String(id), actor);
    return ok();
  });
}

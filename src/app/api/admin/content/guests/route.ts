import { apiError } from '@/lib/api';
import { commitChange, ok, withValidated } from '@/lib/admin-content';
import { createGuest, importGuests, isSlugTaken, listGuests } from '@/lib/db/content';
import { uniqueSlug } from '@/lib/text';
import { guestImportSchema, guestSchema, parseGuestImport } from '@/lib/validation';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/** POST /api/admin/content/guests — tambah satu tamu. */
export async function POST(request: Request): Promise<Response> {
  return withValidated(request, guestSchema, 'admin.guest_create_failed', (input, actor) => {
    const taken = listGuests().map((guest) => guest.slug);

    // Slug yang diketik sendiri tidak pernah diam-diam diubah: bila bentrok,
    // admin harus tahu — link itu mungkin sudah terlanjur disebar ke tamu lain.
    if (input.slug && isSlugTaken(input.slug)) {
      return apiError(409, 'VALIDATION', `Slug "${input.slug}" sudah dipakai tamu lain.`);
    }

    const slug = input.slug || uniqueSlug(input.nama, taken);
    const id = createGuest({
      nama: input.nama,
      slug,
      kategori: input.kategori,
      telepon: input.telepon,
    });

    commitChange('guest.create', slug, actor);
    return ok({ id, slug });
  });
}

/**
 * PUT /api/admin/content/guests — impor massal dari tempelan Excel/CSV.
 *
 * Slug diturunkan dari nama, dan nama yang sudah ada diperbarui alih-alih
 * digandakan — sehingga menempel ulang daftar yang sudah diperbaiki tidak
 * pernah mematikan link undangan yang sudah tersebar.
 */
export async function PUT(request: Request): Promise<Response> {
  return withValidated(request, guestImportSchema, 'admin.guest_import_failed', (input, actor) => {
    const parsed = parseGuestImport(input.text);
    if (parsed.length === 0) {
      return apiError(422, 'VALIDATION', 'Tidak ada nama yang bisa dibaca dari data itu.');
    }

    const taken = new Set(listGuests().map((guest) => guest.slug));
    const entries = parsed.map((entry) => {
      const slug = uniqueSlug(entry.nama, taken);
      taken.add(slug);
      return { ...entry, slug };
    });

    const summary = importGuests(entries);
    commitChange('guest.import', `${entries.length} baris`, actor);

    return ok(summary);
  });
}

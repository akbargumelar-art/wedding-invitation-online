import type { Metadata } from 'next';
import { Invitation } from '@/components/invitation/Invitation';
import { findGuestBySlug, getContent } from '@/lib/content';
import { buildInvitationMetadata } from '@/lib/metadata';
import { sanitizeGuestName } from '@/lib/text';
import type { Guest } from '@/lib/content/types';

/**
 * Undangan dengan sapaan personal (US-01).
 *
 * Slug yang tidak ditemukan TIDAK menghasilkan 404: halaman tetap tampil dengan
 * sapaan fallback dan status 200, karena tamu tidak boleh dihukum atas kesalahan
 * pengetikan di daftar tamu.
 */
export const revalidate = 60;

/** Pra-render seluruh tamu yang sudah terdaftar saat build. */
export async function generateStaticParams(): Promise<Array<{ slug: string }>> {
  const { guests } = await getContent();
  return guests.map((guest) => ({ slug: guest.slug }));
}

// Slug di luar daftar tetap dilayani (dirender saat diminta), bukan 404.
export const dynamicParams = true;

type PageProps = { params: Promise<{ slug: string }> };

async function resolveGuest(slugPromise: PageProps['params']): Promise<Guest | null> {
  const { slug } = await slugPromise;
  const guest = await findGuestBySlug(decodeURIComponent(slug));
  if (!guest) return null;

  // Nama tetap dibersihkan dan dipotong meski sumbernya daftar tamu sendiri:
  // isian dashboard tidak boleh dipercaya buta hanya karena berasal dari admin.
  return { ...guest, nama: sanitizeGuestName(guest.nama) };
}

export async function generateMetadata(): Promise<Metadata> {
  // Metadata sengaja identik untuk semua tamu: gambar OG statis menjaga performa
  // dan mencegah nama tamu bocor lewat pratinjau tautan yang diteruskan.
  const { config, schedule } = await getContent();
  return buildInvitationMetadata(config, schedule[0]?.tanggal ?? null);
}

export default async function GuestInvitationPage({ params }: PageProps) {
  const [content, guest] = await Promise.all([getContent(), resolveGuest(params)]);
  return <Invitation content={content} guest={guest} />;
}

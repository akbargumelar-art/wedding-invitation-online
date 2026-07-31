import type { Metadata } from 'next';
import { Invitation } from '@/components/invitation/Invitation';
import { getContent } from '@/lib/content';
import { buildInvitationMetadata } from '@/lib/metadata';

/**
 * Undangan umum tanpa slug (US-01): tetap dapat diakses dan memakai sapaan
 * fallback. Halaman di-regenerate setiap `CONTENT_CACHE_TTL` detik (ISR), dan
 * setiap penyimpanan di dashboard admin langsung membatalkan cache-nya.
 */
export const revalidate = 60;

export async function generateMetadata(): Promise<Metadata> {
  const { config, schedule } = await getContent();
  return buildInvitationMetadata(config, schedule[0]?.tanggal ?? null);
}

export default async function HomePage() {
  const content = await getContent();
  return <Invitation content={content} guest={null} />;
}

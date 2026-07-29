import type { Metadata } from 'next';
import type { SiteConfig } from '@/lib/content/types';
import { formatTanggalLengkap } from '@/lib/date';

/**
 * Meta Open Graph agar pratinjau WhatsApp tampil rapi (US-13).
 *
 * Gambar OG sengaja statis (bukan digenerate per tamu) demi menjaga performa —
 * satu berkas yang di-cache untuk semua link personal.
 */
export function buildInvitationMetadata(
  config: SiteConfig,
  firstEventDate: string | null,
): Metadata {
  const pasangan = [config.wanita.panggilan, config.pria.panggilan].filter(Boolean).join(' & ');
  const title = pasangan ? `Undangan Pernikahan ${pasangan}` : 'Undangan Pernikahan';

  const tanggal = firstEventDate ? formatTanggalLengkap(firstEventDate) : '';
  const description = [
    tanggal,
    config.venueNama,
    'Merupakan suatu kehormatan bagi kami apabila Bapak/Ibu/Saudara/i berkenan hadir.',
  ]
    .filter(Boolean)
    .join(' — ');

  const images = config.ogImage ? [{ url: config.ogImage, width: 1200, height: 630 }] : undefined;

  return {
    title,
    description,
    openGraph: {
      title,
      description,
      type: 'website',
      locale: 'id_ID',
      siteName: title,
      images,
    },
    twitter: {
      card: 'summary_large_image',
      title,
      description,
      images: config.ogImage ? [config.ogImage] : undefined,
    },
  };
}

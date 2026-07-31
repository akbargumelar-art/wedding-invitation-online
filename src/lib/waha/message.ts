import { formatTanggalLengkap } from '@/lib/date';
import type { Content } from '@/lib/content/types';

/**
 * Perakitan pesan undangan dari templat yang diatur admin.
 *
 * Placeholder yang tidak dikenal dibiarkan apa adanya, bukan dikosongkan:
 * salah ketik `{namaa}` lebih baik terlihat mencolok di pratinjau daripada
 * hilang diam-diam dan baru ketahuan setelah ratusan pesan terkirim.
 */

export const INVITATION_PLACEHOLDERS = [
  '{nama}',
  '{link}',
  '{mempelai}',
  '{tanggal}',
  '{lokasi}',
] as const;

/**
 * Templat bawaan.
 *
 * Ditaruh di modul ini, bukan bersama pengaturan lain, karena `settings.ts`
 * ditandai `server-only` — dan templatnya perlu dapat dirender maupun diuji
 * tanpa menyeret database ikut serta.
 */
export const DEFAULT_INVITATION_TEMPLATE = `Assalamu'alaikum Warahmatullahi Wabarakatuh

Yth. {nama},

Dengan memohon rahmat dan ridha Allah SWT, kami bermaksud mengundang Bapak/Ibu/Saudara/i untuk menghadiri walimatul 'ursy kami:

{mempelai}
{tanggal}
{lokasi}

Undangan lengkap beserta peta lokasi dan konfirmasi kehadiran dapat dibuka di:
{link}

Merupakan suatu kehormatan dan kebahagiaan bagi kami apabila Bapak/Ibu/Saudara/i berkenan hadir dan memberikan doa restu.

Wassalamu'alaikum Warahmatullahi Wabarakatuh`;

export type InvitationVariables = {
  nama: string;
  link: string;
  mempelai: string;
  tanggal: string;
  lokasi: string;
};

export function renderTemplate(template: string, variables: InvitationVariables): string {
  return template.replace(/\{(nama|link|mempelai|tanggal|lokasi)\}/g, (_match, key: string) => {
    return variables[key as keyof InvitationVariables] ?? '';
  });
}

/** Nama kedua mempelai sesuai urutan yang dipilih di Pengaturan. */
export function coupleNames(content: Content): string {
  const { config } = content;
  const pria = config.pria.panggilan || config.pria.namaLengkap;
  const wanita = config.wanita.panggilan || config.wanita.namaLengkap;

  const pair =
    config.urutanMempelai === 'pria_dulu' ? [pria, wanita] : [wanita, pria];

  return pair.filter(Boolean).join(' & ');
}

/**
 * Variabel yang berlaku untuk seluruh tamu — dihitung sekali per pengiriman
 * massal, bukan per pesan.
 */
export function sharedVariables(content: Content): Omit<InvitationVariables, 'nama' | 'link'> {
  const utama = content.schedule[content.schedule.length - 1] ?? content.schedule[0];

  return {
    mempelai: coupleNames(content),
    tanggal: utama ? formatTanggalLengkap(utama.tanggal) : '',
    lokasi: content.config.venueNama || utama?.lokasi || '',
  };
}

export function buildInvitationMessage(
  template: string,
  content: Content,
  guest: { nama: string; slug: string },
  siteUrl: string,
): string {
  return renderTemplate(template, {
    ...sharedVariables(content),
    nama: guest.nama,
    link: `${siteUrl}/to/${guest.slug}`,
  });
}

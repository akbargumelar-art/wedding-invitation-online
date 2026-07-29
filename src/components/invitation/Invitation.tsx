import { InvitationShell } from './InvitationShell';
import type { BookPage } from './BookShell';
import { DraftBanner } from './DraftBanner';
import { GreetingSection } from './GreetingSection';
import { CoupleSection } from './CoupleSection';
import { ScheduleSection } from './ScheduleSection';
import { VenueSection } from './VenueSection';
import { GallerySection } from './GallerySection';
import { RsvpSection } from './RsvpSection';
import { WishesSection } from './WishesSection';
import { EnvelopeSection } from './EnvelopeSection';
import { ClosingSection } from './ClosingSection';
import { formatTanggalSingkat, isPastDeadline } from '@/lib/date';
import type { Content, Guest } from '@/lib/content/types';

const FALLBACK_GREETING = 'Bapak/Ibu/Saudara/i';

/**
 * Susunan seluruh undangan. Dirender sebagai Server Component agar isi halaman
 * ikut ter-cache ISR; hanya bagian interaktif yang menjadi Client Component.
 */
export function Invitation({ content, guest }: { content: Content; guest: Guest | null }) {
  const { config, schedule, gallery, accounts } = content;

  // Mode syar'i menyembunyikan seluruh foto, termasuk galeri (US-08).
  const galleryItems = config.modeSyari ? [] : gallery;
  const coverImage = config.modeSyari ? '' : config.coverImage;

  const pasangan: [string, string] =
    config.urutanMempelai === 'pria_dulu'
      ? [config.pria.panggilan, config.wanita.panggilan]
      : [config.wanita.panggilan, config.pria.panggilan];

  const acaraUtama = schedule[schedule.length - 1] ?? schedule[0];
  const tanggalTampil = acaraUtama ? formatTanggalSingkat(acaraUtama.tanggal) : '';

  const rsvpClosedByDeadline = isPastDeadline(config.deadlineRsvp);
  const rsvpOpen = config.rsvpOpen && !rsvpClosedByDeadline;

  const guestName = guest?.nama ?? null;

  // Beberapa seksi menghapus dirinya sendiri saat datanya kosong. Di mode buku
  // itu tidak cukup: lembar kosong tetap akan punya titik navigasi sendiri.
  // Syarat di bawah harus mencerminkan penjaga `return null` di tiap komponen.
  const pages: BookPage[] = [
    { id: 'salam', title: 'Pembuka', node: <GreetingSection config={config} /> },
    { id: 'mempelai', title: 'Mempelai', node: <CoupleSection config={config} /> },
  ];

  if (schedule.length > 0) {
    pages.push({
      id: 'jadwal',
      title: 'Acara',
      node: <ScheduleSection schedule={schedule} config={config} />,
    });
  }

  if (config.venueNama || config.venueAlamat) {
    pages.push({ id: 'lokasi', title: 'Lokasi', node: <VenueSection config={config} /> });
  }

  if (galleryItems.length > 0) {
    pages.push({ id: 'galeri', title: 'Galeri', node: <GallerySection items={galleryItems} /> });
  }

  pages.push({
    id: 'rsvp',
    title: 'Konfirmasi',
    node: (
      <RsvpSection
        slug={guest?.slug ?? null}
        guestName={guestName ?? ''}
        open={rsvpOpen}
        closedMessage={
          rsvpClosedByDeadline
            ? 'Masa konfirmasi kehadiran telah ditutup. Terima kasih atas perhatian Anda.'
            : 'Konfirmasi kehadiran sedang ditutup. Terima kasih atas perhatian Anda.'
        }
      />
    ),
  });

  pages.push({
    id: 'ucapan',
    title: 'Ucapan',
    node: (
      <WishesSection
        slug={guest?.slug ?? null}
        guestName={guestName ?? ''}
        moderated={config.moderasiUcapan}
      />
    ),
  });

  if (config.qrisImageUrl || accounts.length > 0) {
    pages.push({
      id: 'amplop',
      title: 'Amplop',
      node: (
        <EnvelopeSection
          slug={guest?.slug ?? null}
          guestName={guestName ?? ''}
          config={config}
          accounts={accounts}
        />
      ),
    });
  }

  pages.push({ id: 'penutup', title: 'Penutup', node: <ClosingSection config={config} /> });

  return (
    <>
      {config.isDraft ? <DraftBanner /> : null}

      <InvitationShell
        cover={{
          pasangan,
          tanggalTampil,
          guestName,
          backgroundUrl: coverImage,
          isDraft: config.isDraft,
        }}
        backsoundUrl={config.backsoundUrl}
        trackSlug={guest?.slug ?? null}
        pages={pages}
      />
    </>
  );
}

export { FALLBACK_GREETING };

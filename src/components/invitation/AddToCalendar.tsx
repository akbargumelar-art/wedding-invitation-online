'use client';

import { googleCalendarUrl, type CalendarEvent } from '@/lib/ics';

/**
 * Tombol aksi per event (US-05): Google Calendar + Lokasi.
 *
 * - Google Calendar: buka form GCal dengan detail acara sudah terisi.
 * - Lokasi Acara: buka Google Maps. Kalau lokasi event sama dengan venue
 *   utama dan Config.gmapsUrl terisi (punya koordinat pasti), pakai itu.
 *   Kalau tidak, jatuh ke search-by-name — Google Maps akan mencari
 *   berdasarkan nama tempat (mis. "Kediaman mempelai pria" tidak akan
 *   ketemu, tapi "Masjid Agung Indramayu" akan ketemu).
 *
 * Tombol unduh .ics dihapus karena tamu lebih suka tombol tunggal yang
 * langsung membuka aplikasi (Calendar / Maps) daripada mengunduh berkas.
 */
export function AddToCalendar({
  event,
  eventGmapsUrl,
  venueGmapsUrl,
  venueNama,
}: {
  event: CalendarEvent;
  /** URL Google Maps spesifik untuk event ini (dari Jadwal.gmaps_url). */
  eventGmapsUrl?: string;
  /** URL Google Maps venue utama dari Config.gmaps_url (opsional). */
  venueGmapsUrl?: string;
  /** Nama venue utama; dipakai untuk mendeteksi apakah lokasi event = venue utama. */
  venueNama?: string;
}) {
  // Prioritas: gmaps_url per event → gmaps_url venue utama (kalau lokasi match)
  // → search-by-name. Search-by-name adalah last resort karena tidak akurat
  // untuk tempat non-publik seperti "Kediaman mempelai pria".
  const isVenueUtama = venueNama && event.location.trim() === venueNama.trim();
  const mapsHref =
    (eventGmapsUrl && eventGmapsUrl.trim()) ||
    (isVenueUtama && venueGmapsUrl) ||
    `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(event.location)}`;

  return (
    <div className="mt-4 flex flex-wrap justify-center gap-2">
      <a
        href={googleCalendarUrl(event)}
        target="_blank"
        rel="noopener noreferrer"
        className="btn btn-ghost text-sm"
      >
        <span aria-hidden="true">↗</span>
        Google Calendar
      </a>
      <a
        href={mapsHref}
        target="_blank"
        rel="noopener noreferrer"
        className="btn btn-ghost text-sm"
      >
        <span aria-hidden="true">📍</span>
        Lokasi Acara
      </a>
    </div>
  );
}

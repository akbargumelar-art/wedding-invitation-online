'use client';

import { buildIcs, googleCalendarUrl, type CalendarEvent } from '@/lib/ics';

/**
 * "Simpan ke Kalender" (US-05): berkas .ics untuk aplikasi kalender bawaan,
 * plus tautan Google Calendar untuk yang memakai akun Google.
 *
 * Berkas .ics dibuat di klien sebagai Blob agar tidak perlu route server
 * tambahan — isinya sepenuhnya berasal dari data yang sudah dirender.
 */
export function AddToCalendar({ event }: { event: CalendarEvent }) {
  function downloadIcs() {
    const blob = new Blob([buildIcs(event)], { type: 'text/calendar;charset=utf-8' });
    const url = URL.createObjectURL(blob);

    const link = document.createElement('a');
    link.href = url;
    link.download = `${event.title.replace(/[^\w\s-]/g, '').trim().replace(/\s+/g, '-').toLowerCase()}.ics`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    // Beri jeda agar unduhan sempat dimulai sebelum URL dicabut.
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  return (
    <div className="mt-4 flex flex-wrap justify-center gap-2">
      <button type="button" onClick={downloadIcs} className="btn btn-ghost text-sm">
        <span aria-hidden="true">🗓</span>
        Simpan ke Kalender
      </button>
      <a
        href={googleCalendarUrl(event)}
        target="_blank"
        rel="noopener noreferrer"
        className="btn btn-ghost text-sm"
      >
        <span aria-hidden="true">↗</span>
        Google Calendar
      </a>
    </div>
  );
}

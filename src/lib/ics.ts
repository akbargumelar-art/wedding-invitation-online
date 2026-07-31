import { toIcsStamp } from '@/lib/date';

export type CalendarEvent = {
  title: string;
  description: string;
  location: string;
  startMs: number;
  endMs: number | null;
};

/** Escape sesuai RFC 5545: koma, titik koma, backslash, dan baris baru. */
function escapeIcs(value: string): string {
  return value
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\r?\n/g, '\\n');
}

/** Default durasi 2 jam bila jam selesai tidak diisi. */
const DEFAULT_DURATION_MS = 2 * 3600 * 1000;

export function buildIcs(event: CalendarEvent): string {
  const end = event.endMs ?? event.startMs + DEFAULT_DURATION_MS;

  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Walimah//Undangan Pernikahan//ID',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'BEGIN:VEVENT',
    `UID:${event.startMs}-walimah@undangan`,
    `DTSTAMP:${toIcsStamp(Date.now())}`,
    `DTSTART:${toIcsStamp(event.startMs)}`,
    `DTEND:${toIcsStamp(end)}`,
    `SUMMARY:${escapeIcs(event.title)}`,
    `DESCRIPTION:${escapeIcs(event.description)}`,
    `LOCATION:${escapeIcs(event.location)}`,
    'BEGIN:VALARM',
    'TRIGGER:-P1D',
    'ACTION:DISPLAY',
    `DESCRIPTION:${escapeIcs(event.title)}`,
    'END:VALARM',
    'END:VEVENT',
    'END:VCALENDAR',
  ];

  // RFC 5545 mewajibkan CRLF sebagai pemisah baris.
  return `${lines.join('\r\n')}\r\n`;
}

export function googleCalendarUrl(event: CalendarEvent): string {
  const end = event.endMs ?? event.startMs + DEFAULT_DURATION_MS;
  const params = new URLSearchParams({
    action: 'TEMPLATE',
    text: event.title,
    dates: `${toIcsStamp(event.startMs)}/${toIcsStamp(end)}`,
    details: event.description,
    location: event.location,
  });

  return `https://calendar.google.com/calendar/render?${params.toString()}`;
}

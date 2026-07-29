import { describe, expect, it } from 'vitest';
import { buildIcs, googleCalendarUrl } from '@/lib/ics';

const event = {
  title: 'Akad Nikah — Ahmad & Fatimah',
  description: 'Mohon hadir 15 menit sebelum acara',
  location: 'Masjid Agung, Jl. Contoh No. 12, Indramayu',
  startMs: Date.parse('2026-09-12T01:00:00Z'),
  endMs: Date.parse('2026-09-12T03:00:00Z'),
};

describe('buildIcs', () => {
  const ics = buildIcs(event);

  it('memakai CRLF sesuai RFC 5545', () => {
    expect(ics.includes('\r\n')).toBe(true);
    expect(ics.split('\r\n')[0]).toBe('BEGIN:VCALENDAR');
  });

  it('menulis waktu mulai dan selesai dalam UTC', () => {
    expect(ics).toContain('DTSTART:20260912T010000Z');
    expect(ics).toContain('DTEND:20260912T030000Z');
  });

  it('meng-escape koma pada lokasi', () => {
    expect(ics).toContain('LOCATION:Masjid Agung\\, Jl. Contoh No. 12\\, Indramayu');
  });

  it('memberi durasi default 2 jam bila jam selesai kosong', () => {
    expect(buildIcs({ ...event, endMs: null })).toContain('DTEND:20260912T030000Z');
  });

  it('menutup kalender dengan benar', () => {
    expect(ics.trimEnd().endsWith('END:VCALENDAR')).toBe(true);
  });
});

describe('googleCalendarUrl', () => {
  it('menyusun parameter rentang waktu', () => {
    const url = new URL(googleCalendarUrl(event));
    expect(url.searchParams.get('dates')).toBe('20260912T010000Z/20260912T030000Z');
    expect(url.searchParams.get('text')).toBe(event.title);
  });
});

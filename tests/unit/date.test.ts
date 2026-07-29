import { describe, expect, it } from 'vitest';
import {
  countdownFrom,
  formatRentangJam,
  formatTanggalLengkap,
  formatTanggalSingkat,
  isPastDeadline,
  normalizeZone,
  toEpochMs,
  toIcsStamp,
  todayInJakarta,
} from '@/lib/date';

describe('toEpochMs', () => {
  it('menafsirkan tanggal dan jam pada zona WIB (+07:00)', () => {
    // 12 September 2026 pukul 08.00 WIB = 01.00 UTC.
    expect(toEpochMs('2026-09-12', '08:00')).toBe(Date.parse('2026-09-12T01:00:00Z'));
  });

  it('mendukung WITA dan WIT', () => {
    expect(toEpochMs('2026-09-12', '08:00', 'WITA')).toBe(Date.parse('2026-09-12T00:00:00Z'));
    expect(toEpochMs('2026-09-12', '08:00', 'WIT')).toBe(Date.parse('2026-09-11T23:00:00Z'));
  });

  it('memakai tengah malam bila jam tidak diisi', () => {
    expect(toEpochMs('2026-09-12', '')).toBe(Date.parse('2026-09-12T00:00:00+07:00'));
  });

  it('menerima jam satu digit', () => {
    expect(toEpochMs('2026-09-12', '8:00')).toBe(toEpochMs('2026-09-12', '08:00'));
  });

  it('mengembalikan null untuk tanggal tidak valid, bukan melempar', () => {
    expect(toEpochMs('12/09/2026', '08:00')).toBeNull();
    expect(toEpochMs('', '08:00')).toBeNull();
    expect(toEpochMs('2026-13-45', '08:00')).toBeNull();
  });
});

describe('format tanggal Indonesia', () => {
  it('menulis hari dan bulan dalam bahasa Indonesia', () => {
    expect(formatTanggalLengkap('2026-09-12')).toBe('Sabtu, 12 September 2026');
  });

  it('tidak bergeser hari untuk tanggal di awal bulan', () => {
    expect(formatTanggalLengkap('2026-01-01')).toBe('Kamis, 1 Januari 2026');
  });

  it('menyediakan bentuk singkat tanpa nama hari', () => {
    expect(formatTanggalSingkat('2026-09-12')).toBe('12 September 2026');
  });

  it('mengembalikan input apa adanya bila formatnya salah', () => {
    expect(formatTanggalLengkap('bukan-tanggal')).toBe('bukan-tanggal');
  });
});

describe('formatRentangJam', () => {
  it('menampilkan rentang lengkap dengan zona', () => {
    expect(formatRentangJam('08:00', '10:00', 'WIB')).toBe('08.00 – 10.00 WIB');
  });

  it('menampilkan satu jam bila jam selesai kosong', () => {
    expect(formatRentangJam('08:00', '', 'WITA')).toBe('08.00 WITA');
  });

  it('mengembalikan string kosong bila jam mulai kosong', () => {
    expect(formatRentangJam('', '10:00')).toBe('');
  });
});

describe('normalizeZone', () => {
  it('jatuh ke WIB untuk nilai tak dikenal', () => {
    expect(normalizeZone('Asia/Jakarta')).toBe('WIB');
    expect(normalizeZone(undefined)).toBe('WIB');
    expect(normalizeZone('  wita ')).toBe('WITA');
  });
});

describe('countdownFrom', () => {
  const now = Date.parse('2026-09-01T00:00:00Z');

  it('memecah selisih menjadi hari/jam/menit/detik', () => {
    const target = now + (2 * 86_400 + 3 * 3600 + 4 * 60 + 5) * 1000;
    expect(countdownFrom(target, now)).toEqual({
      days: 2,
      hours: 3,
      minutes: 4,
      seconds: 5,
      finished: false,
    });
  });

  it('menandai selesai saat target sudah lewat atau tepat sama', () => {
    expect(countdownFrom(now - 1, now).finished).toBe(true);
    expect(countdownFrom(now, now).finished).toBe(true);
  });
});

describe('isPastDeadline', () => {
  const deadline = '2026-09-08';

  it('masih terbuka sampai akhir hari WIB', () => {
    expect(isPastDeadline(deadline, Date.parse('2026-09-08T16:00:00Z'))).toBe(false);
  });

  it('tertutup setelah pukul 23.59 WIB', () => {
    expect(isPastDeadline(deadline, Date.parse('2026-09-08T17:00:00Z'))).toBe(true);
  });

  it('tidak pernah tertutup bila deadline kosong', () => {
    expect(isPastDeadline(null, Date.now())).toBe(false);
  });
});

describe('pembantu lain', () => {
  it('todayInJakarta memakai kalender WIB', () => {
    // 22.00 UTC = 05.00 WIB keesokan harinya.
    expect(todayInJakarta(new Date('2026-09-11T22:00:00Z'))).toBe('2026-09-12');
  });

  it('toIcsStamp menghasilkan timestamp UTC tanpa pemisah', () => {
    expect(toIcsStamp(Date.parse('2026-09-12T01:00:00Z'))).toBe('20260912T010000Z');
  });
});

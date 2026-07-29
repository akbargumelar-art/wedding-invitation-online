import { describe, expect, it } from 'vitest';
import {
  configRowsToMap,
  parseAccounts,
  parseConfig,
  parseContent,
  parseGallery,
  parseGuests,
  parseSchedule,
  rowsToRecords,
} from '@/lib/content/parse';

/**
 * Fokus tes ini adalah ketahanan parser (R-2): satu baris rusak di Sheet tidak
 * boleh menjatuhkan halaman — baris tersebut dilewati dan dicatat sebagai
 * warning.
 */

describe('rowsToRecords', () => {
  it('memetakan baris ke objek berdasarkan header', () => {
    const rows = [
      ['Nama', 'Slug'],
      ['Budi', 'budi'],
    ];
    expect(rowsToRecords(rows)).toEqual([{ nama: 'Budi', slug: 'budi' }]);
  });

  it('menormalkan header dengan spasi dan kapital', () => {
    const rows = [
      ['  Atas Nama ', 'No. Rekening'],
      ['Ahmad', '123'],
    ];
    expect(rowsToRecords(rows)[0]).toEqual({ atas_nama: 'Ahmad', no_rekening: '123' });
  });

  it('mengabaikan baris yang seluruh selnya kosong', () => {
    const rows = [
      ['nama'],
      [''],
      ['Budi'],
    ];
    expect(rowsToRecords(rows)).toHaveLength(1);
  });

  it('mengisi sel yang hilang di akhir baris', () => {
    const rows = [
      ['nama', 'slug', 'kategori'],
      ['Budi'],
    ];
    expect(rowsToRecords(rows)[0]).toEqual({ nama: 'Budi', slug: '', kategori: '' });
  });

  it('mengembalikan array kosong untuk sheet kosong', () => {
    expect(rowsToRecords([])).toEqual([]);
  });
});

describe('parseConfig', () => {
  const map = configRowsToMap([
    ['key', 'value'],
    ['is_draft', 'FALSE'],
    ['mode_syari', 'TRUE'],
    ['urutan_mempelai', 'pria_dulu'],
    ['pria_panggilan', 'Ahmad'],
    ['deadline_rsvp', '2026-09-08'],
    ['rsvp_open', 'ya'],
  ]);

  it('mengubah nilai boolean bergaya spreadsheet', () => {
    const warnings: string[] = [];
    const config = parseConfig(map, warnings);

    expect(config.isDraft).toBe(false);
    expect(config.modeSyari).toBe(true);
    expect(config.rsvpOpen).toBe(true);
  });

  it('menghormati urutan mempelai', () => {
    expect(parseConfig(map, []).urutanMempelai).toBe('pria_dulu');
  });

  it('memakai default aman untuk kunci yang hilang', () => {
    const config = parseConfig({}, []);

    // Default is_draft = TRUE: lebih baik banner dummy muncul tanpa perlu
    // daripada data contoh diam-diam tersebar.
    expect(config.isDraft).toBe(true);
    expect(config.moderasiUcapan).toBe(true);
    expect(config.salamPembuka).toContain("Assalamu'alaikum");
    expect(config.deadlineRsvp).toBeNull();
  });

  it('mencatat warning dan mengabaikan deadline berformat salah', () => {
    const warnings: string[] = [];
    const config = parseConfig({ deadline_rsvp: '08/09/2026' }, warnings);

    expect(config.deadlineRsvp).toBeNull();
    expect(warnings.some((w) => w.includes('deadline_rsvp'))).toBe(true);
  });

  it('mencatat warning untuk urutan mempelai tak dikenal', () => {
    const warnings: string[] = [];
    expect(parseConfig({ urutan_mempelai: 'acak' }, warnings).urutanMempelai).toBe('wanita_dulu');
    expect(warnings.some((w) => w.includes('urutan_mempelai'))).toBe(true);
  });
});

describe('parseSchedule', () => {
  const header = ['acara', 'tanggal', 'jam_mulai', 'jam_selesai', 'zona', 'lokasi', 'catatan', 'tampil'];

  it('mengurutkan acara berdasarkan waktu mulai', () => {
    const rows = [
      header,
      ['Resepsi', '2026-09-12', '11:00', '15:00', 'WIB', 'Cafe', '', 'TRUE'],
      ['Akad', '2026-09-12', '08:00', '10:00', 'WIB', 'Masjid', '', 'TRUE'],
    ];

    const items = parseSchedule(rows, []);
    expect(items.map((i) => i.acara)).toEqual(['Akad', 'Resepsi']);
    expect(items[0]?.startsAtMs).toBeLessThan(items[1]!.startsAtMs);
  });

  it('melewati baris tanpa acara atau tanggal, dan mencatat warning', () => {
    const warnings: string[] = [];
    const rows = [header, ['', '2026-09-12', '08:00', '', 'WIB', '', '', 'TRUE']];

    expect(parseSchedule(rows, warnings)).toHaveLength(0);
    expect(warnings).toHaveLength(1);
  });

  it('melewati baris dengan tanggal tidak valid tanpa melempar', () => {
    const warnings: string[] = [];
    const rows = [header, ['Akad', '12 Sept 2026', '08:00', '', 'WIB', '', '', 'TRUE']];

    expect(parseSchedule(rows, warnings)).toHaveLength(0);
    expect(warnings[0]).toContain('tidak valid');
  });

  it('menyembunyikan baris dengan tampil = FALSE', () => {
    const rows = [header, ['Akad', '2026-09-12', '08:00', '', 'WIB', '', '', 'FALSE']];
    expect(parseSchedule(rows, [])).toHaveLength(0);
  });

  it('mengisi endsAtMs null bila jam selesai kosong', () => {
    const rows = [header, ['Akad', '2026-09-12', '08:00', '', 'WIB', '', '', 'TRUE']];
    expect(parseSchedule(rows, [])[0]?.endsAtMs).toBeNull();
  });
});

describe('parseGallery', () => {
  const header = ['urutan', 'url', 'caption', 'tampil'];

  it('mengurutkan sesuai kolom urutan', () => {
    const rows = [
      header,
      ['2', '/b.png', 'B', 'TRUE'],
      ['1', '/a.png', 'A', 'TRUE'],
    ];
    expect(parseGallery(rows, []).map((g) => g.url)).toEqual(['/a.png', '/b.png']);
  });

  it('melewati baris tanpa url', () => {
    const warnings: string[] = [];
    expect(parseGallery([header, ['1', '', '', 'TRUE']], warnings)).toHaveLength(0);
    expect(warnings).toHaveLength(1);
  });

  it('menyaring baris tampil = FALSE', () => {
    const rows = [header, ['1', '/a.png', '', 'FALSE']];
    expect(parseGallery(rows, [])).toHaveLength(0);
  });
});

describe('parseAccounts', () => {
  const header = ['bank', 'nomor', 'atas_nama', 'tampil'];

  it('membatasi maksimum 3 rekening', () => {
    const rows = [
      header,
      ...Array.from({ length: 5 }, (_, i) => [`Bank ${i}`, `${i}`, 'Ahmad', 'TRUE']),
    ];
    expect(parseAccounts(rows, [])).toHaveLength(3);
  });

  it('melewati baris tanpa bank atau nomor', () => {
    const warnings: string[] = [];
    expect(parseAccounts([header, ['BSI', '', 'Ahmad', 'TRUE']], warnings)).toHaveLength(0);
    expect(warnings).toHaveLength(1);
  });
});

describe('parseGuests', () => {
  const header = ['nama', 'slug', 'kategori'];

  it('menurunkan slug dari nama bila kolom slug kosong', () => {
    const rows = [header, ['Budi Santoso', '', 'Teman']];
    expect(parseGuests(rows, [])[0]?.slug).toBe('budi-santoso');
  });

  it('memberi sufiks pada slug duplikat dan mencatat warning', () => {
    const warnings: string[] = [];
    const rows = [header, ['Budi', 'budi', ''], ['Budi Lain', 'budi', '']];

    expect(parseGuests(rows, warnings).map((g) => g.slug)).toEqual(['budi', 'budi-2']);
    expect(warnings[0]).toContain('duplikat');
  });

  it('melewati baris tanpa nama', () => {
    expect(parseGuests([header, ['', 'kosong', '']], [])).toHaveLength(0);
  });
});

describe('parseContent', () => {
  it('merakit seluruh tab dan tetap menghasilkan model valid dari data kosong', () => {
    const content = parseContent(
      { config: [], jadwal: [], galeri: [], rekening: [], tamu: [] },
      'seed',
      '2026-07-28T00:00:00Z',
    );

    expect(content.source).toBe('seed');
    expect(content.schedule).toEqual([]);
    expect(content.config.isDraft).toBe(true);
  });
});

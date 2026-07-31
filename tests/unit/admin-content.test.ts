import { describe, expect, it } from 'vitest';
import { configToMap, DEFAULT_CONFIG, parseConfig } from '@/lib/content/parse';
import {
  accountSchema,
  gallerySchema,
  guestSchema,
  parseGuestImport,
  scheduleSchema,
  siteConfigSchema,
} from '@/lib/validation';
import type { SiteConfig } from '@/lib/content/types';

/**
 * Pengaturan yang ditulis dashboard harus terbaca kembali persis sama.
 *
 * Ini bukan pengujian formalitas: `configToMap` dan `parseConfig` adalah dua
 * daftar kunci yang ditulis terpisah, dan menambah satu pengaturan di satu sisi
 * saja menghasilkan kegagalan paling membingungkan yang mungkin terjadi di
 * aplikasi ini — isian tersimpan tanpa keluhan, lalu hilang begitu halaman
 * dimuat ulang.
 */
describe('round-trip pengaturan', () => {
  const filled: SiteConfig = {
    isDraft: false,
    modeSyari: true,
    urutanMempelai: 'pria_dulu',
    pria: {
      panggilan: 'Rachmat',
      namaLengkap: 'Rachmat Nurhandiman',
      binBinti: 'bin Nanan',
      ayah: 'Bapak Nanan',
      ibu: 'Ibu Dewi',
      anakKe: 'pertama',
      foto: '/media/pria.jpg',
      instagram: 'rachmat',
    },
    wanita: {
      panggilan: 'Layli',
      namaLengkap: 'Layli Nur',
      binBinti: 'binti Hasan',
      ayah: 'Bapak Hasan',
      ibu: 'Ibu Sari',
      anakKe: 'ketiga',
      foto: '/media/wanita.jpg',
      instagram: 'layli',
    },
    quoteArab: 'وَمِنْ آيَاتِهِ',
    quoteTerjemahan: 'Dan di antara tanda-tanda kekuasaan-Nya',
    quoteSumber: 'QS. Ar-Rum: 21',
    salamPembuka: 'Assalamualaikum',
    kalimatPembuka: 'Dengan memohon rahmat Allah',
    kalimatPenutup: 'Merupakan kehormatan bagi kami',
    doaPenutup: 'Semoga Allah memberkahi',
    salamPenutup: 'Wassalamualaikum',
    venueNama: 'Gedung Melati',
    venueAlamat: 'Jl. Merdeka No. 1',
    venueCatatan: 'Parkir di belakang',
    gmapsUrl: 'https://maps.app.goo.gl/abc',
    gmapsEmbed: 'https://www.google.com/maps/embed?pb=xyz',
    qrisImageUrl: '/media/qris.png',
    qrisNamaMerchant: 'Walimah Rachmat',
    backsoundUrl: 'https://contoh.test/lagu.mp3',
    rsvpOpen: false,
    deadlineRsvp: '2026-08-01',
    moderasiUcapan: false,
    ogImage: '/media/og.png',
    coverImage: '/media/cover.jpg',
  };

  it('mengembalikan seluruh nilai apa adanya', () => {
    expect(parseConfig(configToMap(filled), [])).toEqual(filled);
  });

  it('bertahan pada konfigurasi kosong bawaan', () => {
    expect(parseConfig(configToMap(DEFAULT_CONFIG), [])).toEqual(DEFAULT_CONFIG);
  });

  it('menyimpan deadline kosong sebagai null, bukan string "null"', () => {
    const map = configToMap({ ...filled, deadlineRsvp: null });

    expect(map['deadline_rsvp']).toBe('');
    expect(parseConfig(map, []).deadlineRsvp).toBeNull();
  });
});

describe('siteConfigSchema', () => {
  const minimal = {
    ...DEFAULT_CONFIG,
    deadlineRsvp: '',
  };

  it('mengambil src dari kode iframe Google Maps yang ditempel utuh', () => {
    const parsed = siteConfigSchema.parse({
      ...minimal,
      gmapsEmbed:
        '<iframe src="https://www.google.com/maps/embed?pb=abc" width="600" height="450"></iframe>',
    });

    expect(parsed.gmapsEmbed).toBe('https://www.google.com/maps/embed?pb=abc');
  });

  it('menerima path unggahan internal', () => {
    expect(siteConfigSchema.parse({ ...minimal, coverImage: '/media/x.jpg' }).coverImage).toBe(
      '/media/x.jpg',
    );
  });

  it('menolak URL protokol-relatif yang menyamar sebagai path internal', () => {
    expect(() => siteConfigSchema.parse({ ...minimal, coverImage: '//situs-lain.test/x.jpg' }))
      .toThrow();
  });

  it('menolak skema selain http(s)', () => {
    expect(() => siteConfigSchema.parse({ ...minimal, backsoundUrl: 'javascript:alert(1)' }))
      .toThrow();
  });

  it('membuang markup dari teks bebas', () => {
    const parsed = siteConfigSchema.parse({
      ...minimal,
      venueNama: '<b>Gedung</b> Melati',
    });

    expect(parsed.venueNama).toBe('Gedung Melati');
  });

  it('mengosongkan deadline menjadi null', () => {
    expect(siteConfigSchema.parse(minimal).deadlineRsvp).toBeNull();
  });
});

describe('scheduleSchema', () => {
  const base = {
    acara: 'Akad Nikah',
    tanggal: '2026-08-15',
    jamMulai: '08:00',
    jamSelesai: '10:00',
    zona: 'WIB',
    lokasi: 'Masjid Agung',
    catatan: '',
    gmapsUrl: '',
    tampil: true,
  };

  it('menerima acara yang lengkap', () => {
    expect(scheduleSchema.parse(base).acara).toBe('Akad Nikah');
  });

  it('menolak jam selesai yang mendahului jam mulai', () => {
    // Kalau lolos, berkas .ics yang dihasilkan punya DTEND sebelum DTSTART dan
    // ditolak aplikasi kalender — kegagalan yang baru terlihat di ponsel tamu.
    expect(() => scheduleSchema.parse({ ...base, jamSelesai: '07:00' })).toThrow();
  });

  it('mengizinkan jam selesai dikosongkan', () => {
    expect(scheduleSchema.parse({ ...base, jamSelesai: '' }).jamSelesai).toBe('');
  });

  it('menolak tanggal yang bukan YYYY-MM-DD', () => {
    expect(() => scheduleSchema.parse({ ...base, tanggal: '15 Agustus 2026' })).toThrow();
  });

  it('menolak zona waktu di luar Indonesia', () => {
    expect(() => scheduleSchema.parse({ ...base, zona: 'UTC' })).toThrow();
  });
});

describe('gallerySchema & accountSchema', () => {
  it('menolak foto tanpa alamat gambar', () => {
    expect(() => gallerySchema.parse({ url: '', caption: 'Foto', tampil: true })).toThrow();
  });

  it('membersihkan nomor rekening dari huruf', () => {
    const parsed = accountSchema.parse({
      bank: 'BCA',
      nomor: 'a123-456 789b',
      atasNama: 'Rachmat',
      tampil: true,
    });

    expect(parsed.nomor).toBe('123-456 789');
  });

  it('menolak nomor rekening yang terlalu pendek', () => {
    expect(() =>
      accountSchema.parse({ bank: 'BCA', nomor: '12', atasNama: '', tampil: true }),
    ).toThrow();
  });
});

describe('guestSchema', () => {
  it('membiarkan slug kosong agar diturunkan server dari nama', () => {
    expect(guestSchema.parse({ nama: 'Budi Santoso', slug: '', kategori: '' }).slug).toBe('');
  });

  it('menormalkan slug ke huruf kecil', () => {
    expect(guestSchema.parse({ nama: 'Budi', slug: 'BUDI-S', kategori: '' }).slug).toBe('budi-s');
  });

  it('menolak slug bertanda baca yang akan merusak URL', () => {
    expect(() => guestSchema.parse({ nama: 'Budi', slug: 'budi/santoso', kategori: '' })).toThrow();
  });
});

describe('parseGuestImport', () => {
  it('membaca satu nama per baris', () => {
    expect(parseGuestImport('Budi Santoso\nSiti Nurhaliza')).toEqual([
      { nama: 'Budi Santoso', slug: '', kategori: '', telepon: '' },
      { nama: 'Siti Nurhaliza', slug: '', kategori: '', telepon: '' },
    ]);
  });

  it('membaca kolom kedua sebagai kategori, apa pun pemisahnya', () => {
    // TAB adalah yang dihasilkan saat menyalin langsung dari Excel.
    const entries = parseGuestImport('Budi\tTeman Kantor\nSiti;Keluarga\nAhmad,Tetangga');

    expect(entries.map((entry) => entry.kategori)).toEqual([
      'Teman Kantor',
      'Keluarga',
      'Tetangga',
    ]);
  });

  it('membuang baris kosong dan baris judul spreadsheet', () => {
    expect(parseGuestImport('Nama,Kategori\n\nBudi,Teman\n\n')).toEqual([
      { nama: 'Budi', slug: '', kategori: 'Teman', telepon: '' },
    ]);
  });

  it('hanya membuang baris judul di posisi pertama', () => {
    // Seseorang benar-benar bisa bernama panggilan "Nama" di baris ke sekian;
    // yang jelas bukan tamu hanyalah header di paling atas.
    const entries = parseGuestImport('Budi\nNama');

    expect(entries).toHaveLength(2);
  });

  it('membuang markup dari nama yang ditempel', () => {
    // Isi tag tetap dipertahankan sebagai teks biasa — perilaku `stripHtml` yang
    // sama dipakai untuk nama yang diketik tamu. Yang dijamin adalah tidak ada
    // lagi markup yang tersisa, bukan bahwa isinya ikut hilang.
    const nama = parseGuestImport('<b>Budi</b> <i>Santoso</i>')[0]?.nama;

    expect(nama).toBe('Budi Santoso');
    expect(nama).not.toContain('<');
  });

  it('mengembalikan daftar kosong untuk tempelan tanpa nama', () => {
    expect(parseGuestImport('\n\n   \n')).toEqual([]);
  });
});

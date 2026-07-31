import type { ZoneCode } from '@/lib/date';

export type PersonConfig = {
  panggilan: string;
  namaLengkap: string;
  binBinti: string;
  ayah: string;
  ibu: string;
  /**
   * Urutan kelahiran apa adanya dari isian admin, mis. "ketiga" atau "pertama".
   * Kosong = kalimatnya jatuh ke "Putra/Putri dari" tanpa urutan.
   */
  anakKe: string;
  foto: string;
  instagram: string;
};

export type SiteConfig = {
  isDraft: boolean;
  modeSyari: boolean;
  urutanMempelai: 'wanita_dulu' | 'pria_dulu';

  pria: PersonConfig;
  wanita: PersonConfig;

  quoteArab: string;
  quoteTerjemahan: string;
  quoteSumber: string;

  salamPembuka: string;
  kalimatPembuka: string;
  kalimatPenutup: string;
  doaPenutup: string;
  salamPenutup: string;

  venueNama: string;
  venueAlamat: string;
  venueCatatan: string;
  gmapsUrl: string;
  gmapsEmbed: string;

  qrisImageUrl: string;
  qrisNamaMerchant: string;

  backsoundUrl: string;

  rsvpOpen: boolean;
  deadlineRsvp: string | null;
  moderasiUcapan: boolean;

  ogImage: string;
  /** Latar sampul. Kunci tambahan opsional di luar Lampiran A; kosong = ornamen saja. */
  coverImage: string;
};

export type ScheduleItem = {
  acara: string;
  tanggal: string;
  jamMulai: string;
  jamSelesai: string;
  zona: ZoneCode;
  lokasi: string;
  catatan: string;
  /**
   * URL Google Maps spesifik untuk event ini (kolom `gmaps_url` di Jadwal).
   * Kalau kosong, tombol Lokasi Acara akan mencari berdasarkan nama lokasi
   * atau jatuh ke Config.gmapsUrl kalau lokasi sama dengan venue utama.
   */
  gmapsUrl: string;
  /** Epoch ms UTC dari tanggal+jamMulai pada zona terkait. */
  startsAtMs: number;
  endsAtMs: number | null;
};

export type GalleryItem = {
  urutan: number;
  url: string;
  caption: string;
};

export type BankAccount = {
  bank: string;
  nomor: string;
  atasNama: string;
};

export type Guest = {
  nama: string;
  slug: string;
  kategori: string;
};

/** Dari mana isi halaman berasal — dipakai untuk logging & banner diagnostik. */
export type ContentSource = 'db' | 'seed';

export type Content = {
  config: SiteConfig;
  schedule: ScheduleItem[];
  gallery: GalleryItem[];
  accounts: BankAccount[];
  guests: Guest[];
  fetchedAt: string;
  source: ContentSource;
  /** Peringatan parser (baris dilewati, kolom tak dikenal) — hanya untuk log/admin. */
  warnings: string[];
};

/**
 * Bentuk mentah isi undangan sebelum divalidasi parser: satu peta kunci/nilai
 * untuk Config, dan daftar record berkunci nama kolom untuk sisanya.
 *
 * Inilah yang dihasilkan lapisan database. Nama kuncinya sengaja sama persis
 * dengan nama kolom tabel, sehingga baris SQLite bisa langsung masuk parser
 * tanpa lapisan pemetaan tambahan.
 */
export type ContentRecords = {
  config: Record<string, string>;
  jadwal: Record<string, string>[];
  galeri: Record<string, string>[];
  rekening: Record<string, string>[];
  tamu: Record<string, string>[];
};

/**
 * Isi berkas `data/seed.json`: matriks baris dengan baris pertama sebagai
 * header. Hanya dipakai sekali, saat mengisi database yang masih kosong.
 */
export type RawContentMatrix = {
  config: string[][];
  jadwal: string[][];
  galeri: string[][];
  rekening: string[][];
  tamu: string[][];
};

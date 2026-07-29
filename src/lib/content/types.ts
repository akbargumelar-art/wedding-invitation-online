import type { ZoneCode } from '@/lib/date';

export type PersonConfig = {
  panggilan: string;
  namaLengkap: string;
  binBinti: string;
  ayah: string;
  ibu: string;
  /**
   * Urutan kelahiran apa adanya dari Sheet, mis. "ketiga" atau "pertama".
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
export type ContentSource = 'sheets' | 'snapshot' | 'seed';

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

/** Bentuk mentah hasil pembacaan Sheet, sebelum diparsing. Ini yang di-snapshot. */
export type RawSheetData = {
  config: string[][];
  jadwal: string[][];
  galeri: string[][];
  rekening: string[][];
  tamu: string[][];
};

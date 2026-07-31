import { z } from 'zod';
import { normalizeZone, toEpochMs } from '@/lib/date';
import { slugify } from '@/lib/text';
import type {
  BankAccount,
  Content,
  ContentRecords,
  ContentSource,
  GalleryItem,
  Guest,
  RawContentMatrix,
  ScheduleItem,
  SiteConfig,
} from './types';

/**
 * Parser tahan banting untuk isi undangan (mitigasi R-2).
 *
 * Aturan mainnya: satu baris rusak TIDAK BOLEH menjatuhkan halaman. Baris yang
 * gagal divalidasi dilewati dan dicatat sebagai warning; kolom tak dikenal
 * diabaikan; nilai yang hilang diisi default.
 *
 * Sumbernya kini database, yang divalidasi saat tulis — tapi lapisan ini tetap
 * dipertahankan sepenuhnya, karena berkas seed masih lewat sini dan karena
 * baris yang tersimpan sebelum sebuah aturan diperketat tetap harus aman
 * dirender.
 */

/** Penamaan baris di pesan peringatan; berbeda antara sumber matriks dan DB. */
type RowLabel = (index: number) => string;

const RECORD_LABEL: RowLabel = (index) => `#${index + 1}`;
/** +1 karena baris header, +1 lagi karena manusia menghitung mulai dari 1. */
const MATRIX_LABEL: RowLabel = (index) => `baris ${index + 2}`;

const TRUTHY = new Set(['true', 'ya', 'yes', '1', 'y', 'aktif', 'tampil']);
const FALSY = new Set(['false', 'tidak', 'no', '0', 'n', 'nonaktif', 'sembunyi']);

function toBool(raw: string | undefined, fallback: boolean): boolean {
  const value = (raw ?? '').trim().toLowerCase();
  if (TRUTHY.has(value)) return true;
  if (FALSY.has(value)) return false;
  return fallback;
}

/** Header dinormalkan agar tahan terhadap spasi, kapital, dan tanda baca. */
function normalizeHeader(raw: string): string {
  return raw
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

/**
 * Ubah matriks `string[][]` (baris pertama = header) menjadi array objek.
 * Kolom tak dikenal tetap ikut — pemanggil yang memilih kolom yang dipakai.
 */
export function rowsToRecords(rows: string[][]): Record<string, string>[] {
  if (rows.length === 0) return [];

  const [headerRow, ...bodyRows] = rows;
  const headers = (headerRow ?? []).map(normalizeHeader);

  return bodyRows
    .map((row) => {
      const record: Record<string, string> = {};
      headers.forEach((header, index) => {
        if (!header) return;
        record[header] = (row[index] ?? '').trim();
      });
      return record;
    })
    .filter((record) => Object.values(record).some((value) => value !== ''));
}

/** Tab Config berbentuk key/value, bukan tabel berkolom. */
export function configRowsToMap(rows: string[][]): Record<string, string> {
  const map: Record<string, string> = {};
  for (const row of rows) {
    const key = normalizeHeader(row[0] ?? '');
    if (!key || key === 'key') continue;
    map[key] = (row[1] ?? '').trim();
  }
  return map;
}

// -----------------------------------------------------------------------------
// Config
// -----------------------------------------------------------------------------

export const DEFAULT_CONFIG: SiteConfig = {
  isDraft: true,
  modeSyari: false,
  urutanMempelai: 'wanita_dulu',
  pria: {
    panggilan: '',
    namaLengkap: '',
    binBinti: '',
    ayah: '',
    ibu: '',
    anakKe: '',
    foto: '',
    instagram: '',
  },
  wanita: {
    panggilan: '',
    namaLengkap: '',
    binBinti: '',
    ayah: '',
    ibu: '',
    anakKe: '',
    foto: '',
    instagram: '',
  },
  quoteArab: '',
  quoteTerjemahan: '',
  quoteSumber: '',
  salamPembuka: "Assalamu'alaikum Warahmatullahi Wabarakatuh",
  kalimatPembuka: '',
  kalimatPenutup: '',
  doaPenutup: '',
  salamPenutup: "Wassalamu'alaikum Warahmatullahi Wabarakatuh",
  venueNama: '',
  venueAlamat: '',
  venueCatatan: '',
  gmapsUrl: '',
  gmapsEmbed: '',
  qrisImageUrl: '',
  qrisNamaMerchant: '',
  backsoundUrl: '',
  rsvpOpen: true,
  deadlineRsvp: null,
  moderasiUcapan: true,
  ogImage: '',
  coverImage: '',
};

const dateOnly = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .nullable()
  .catch(null);

export function parseConfig(map: Record<string, string>, warnings: string[]): SiteConfig {
  const get = (key: string, fallback = ''): string => (map[key] ?? '').trim() || fallback;

  const urutanRaw = get('urutan_mempelai', 'wanita_dulu').toLowerCase();
  if (urutanRaw !== 'wanita_dulu' && urutanRaw !== 'pria_dulu') {
    warnings.push(`Config.urutan_mempelai "${urutanRaw}" tidak dikenal, memakai wanita_dulu.`);
  }

  const deadlineRaw = get('deadline_rsvp');
  const deadline = dateOnly.parse(deadlineRaw || null);
  if (deadlineRaw && deadline === null) {
    warnings.push(`Config.deadline_rsvp "${deadlineRaw}" bukan format YYYY-MM-DD, diabaikan.`);
  }

  return {
    isDraft: toBool(map['is_draft'], DEFAULT_CONFIG.isDraft),
    modeSyari: toBool(map['mode_syari'], DEFAULT_CONFIG.modeSyari),
    urutanMempelai: urutanRaw === 'pria_dulu' ? 'pria_dulu' : 'wanita_dulu',

    pria: {
      panggilan: get('pria_panggilan'),
      namaLengkap: get('pria_nama_lengkap'),
      binBinti: get('pria_bin'),
      ayah: get('pria_ayah'),
      ibu: get('pria_ibu'),
      anakKe: get('pria_anak_ke'),
      foto: get('pria_foto'),
      instagram: get('pria_ig'),
    },
    wanita: {
      panggilan: get('wanita_panggilan'),
      namaLengkap: get('wanita_nama_lengkap'),
      binBinti: get('wanita_binti'),
      ayah: get('wanita_ayah'),
      ibu: get('wanita_ibu'),
      anakKe: get('wanita_anak_ke'),
      foto: get('wanita_foto'),
      instagram: get('wanita_ig'),
    },

    quoteArab: get('quote_arab'),
    quoteTerjemahan: get('quote_terjemahan'),
    quoteSumber: get('quote_sumber'),

    salamPembuka: get('salam_pembuka', DEFAULT_CONFIG.salamPembuka),
    kalimatPembuka: get('kalimat_pembuka'),
    kalimatPenutup: get('kalimat_penutup'),
    doaPenutup: get('doa_penutup'),
    salamPenutup: get('salam_penutup', DEFAULT_CONFIG.salamPenutup),

    venueNama: get('venue_nama'),
    venueAlamat: get('venue_alamat'),
    venueCatatan: get('venue_catatan'),
    gmapsUrl: get('gmaps_url'),
    gmapsEmbed: get('gmaps_embed'),

    qrisImageUrl: get('qris_image_url'),
    qrisNamaMerchant: get('qris_nama_merchant'),

    backsoundUrl: get('backsound_url'),

    rsvpOpen: toBool(map['rsvp_open'], DEFAULT_CONFIG.rsvpOpen),
    deadlineRsvp: deadline,
    moderasiUcapan: toBool(map['moderasi_ucapan'], DEFAULT_CONFIG.moderasiUcapan),

    ogImage: get('og_image'),
    coverImage: get('cover_image'),
  };
}

/**
 * Kebalikan `parseConfig`: ubah konfigurasi bertipe menjadi peta kunci/nilai
 * siap simpan. Dipakai dashboard admin saat menulis ke tabel `site_config`.
 *
 * Wajib bergerak seiring `parseConfig` — bila satu kunci ditambahkan di sana
 * tanpa ditambahkan di sini, nilainya akan tersimpan tapi tidak pernah terbaca.
 * Uji round-trip di `tests/unit/parse.test.ts` yang menjaganya.
 */
export function configToMap(config: SiteConfig): Record<string, string> {
  const bool = (value: boolean): string => (value ? 'TRUE' : 'FALSE');

  return {
    is_draft: bool(config.isDraft),
    mode_syari: bool(config.modeSyari),
    urutan_mempelai: config.urutanMempelai,

    pria_panggilan: config.pria.panggilan,
    pria_nama_lengkap: config.pria.namaLengkap,
    pria_bin: config.pria.binBinti,
    pria_ayah: config.pria.ayah,
    pria_ibu: config.pria.ibu,
    pria_anak_ke: config.pria.anakKe,
    pria_foto: config.pria.foto,
    pria_ig: config.pria.instagram,

    wanita_panggilan: config.wanita.panggilan,
    wanita_nama_lengkap: config.wanita.namaLengkap,
    wanita_binti: config.wanita.binBinti,
    wanita_ayah: config.wanita.ayah,
    wanita_ibu: config.wanita.ibu,
    wanita_anak_ke: config.wanita.anakKe,
    wanita_foto: config.wanita.foto,
    wanita_ig: config.wanita.instagram,

    quote_arab: config.quoteArab,
    quote_terjemahan: config.quoteTerjemahan,
    quote_sumber: config.quoteSumber,

    salam_pembuka: config.salamPembuka,
    kalimat_pembuka: config.kalimatPembuka,
    kalimat_penutup: config.kalimatPenutup,
    doa_penutup: config.doaPenutup,
    salam_penutup: config.salamPenutup,

    venue_nama: config.venueNama,
    venue_alamat: config.venueAlamat,
    venue_catatan: config.venueCatatan,
    gmaps_url: config.gmapsUrl,
    gmaps_embed: config.gmapsEmbed,

    qris_image_url: config.qrisImageUrl,
    qris_nama_merchant: config.qrisNamaMerchant,

    backsound_url: config.backsoundUrl,

    rsvp_open: bool(config.rsvpOpen),
    deadline_rsvp: config.deadlineRsvp ?? '',
    moderasi_ucapan: bool(config.moderasiUcapan),

    og_image: config.ogImage,
    cover_image: config.coverImage,
  };
}

// -----------------------------------------------------------------------------
// Jadwal / Galeri / Rekening / Tamu
// -----------------------------------------------------------------------------

export function parseSchedule(rows: string[][], warnings: string[]): ScheduleItem[] {
  return parseScheduleRecords(rowsToRecords(rows), warnings, MATRIX_LABEL);
}

export function parseScheduleRecords(
  records: Record<string, string>[],
  warnings: string[],
  label: RowLabel = RECORD_LABEL,
): ScheduleItem[] {
  const items: ScheduleItem[] = [];

  records.forEach((record, index) => {
    const baris = label(index);
    if (!toBool(record['tampil'], true)) return;

    const acara = record['acara'] ?? '';
    const tanggal = record['tanggal'] ?? '';
    if (!acara || !tanggal) {
      warnings.push(`Jadwal ${baris}: kolom acara/tanggal kosong, baris dilewati.`);
      return;
    }

    const zona = normalizeZone(record['zona']);
    const startsAtMs = toEpochMs(tanggal, record['jam_mulai'], zona);
    if (startsAtMs === null) {
      warnings.push(`Jadwal ${baris}: tanggal "${tanggal}" tidak valid, baris dilewati.`);
      return;
    }

    items.push({
      acara,
      tanggal,
      jamMulai: record['jam_mulai'] ?? '',
      jamSelesai: record['jam_selesai'] ?? '',
      zona,
      lokasi: record['lokasi'] ?? '',
      catatan: record['catatan'] ?? '',
      gmapsUrl: record['gmaps_url'] ?? '',
      startsAtMs,
      // Jam selesai yang kosong harus tetap null, bukan tengah malam — kalau
      // tidak, berkas .ics akan punya DTEND sebelum DTSTART.
      endsAtMs: record['jam_selesai'] ? toEpochMs(tanggal, record['jam_selesai'], zona) : null,
    });
  });

  return items.sort((a, b) => a.startsAtMs - b.startsAtMs);
}

export function parseGallery(rows: string[][], warnings: string[]): GalleryItem[] {
  return parseGalleryRecords(rowsToRecords(rows), warnings, MATRIX_LABEL);
}

export function parseGalleryRecords(
  records: Record<string, string>[],
  warnings: string[],
  label: RowLabel = RECORD_LABEL,
): GalleryItem[] {
  const items: GalleryItem[] = [];

  records.forEach((record, index) => {
    if (!toBool(record['tampil'], true)) return;

    const url = record['url'] ?? '';
    if (!url) {
      warnings.push(`Galeri ${label(index)}: kolom url kosong, baris dilewati.`);
      return;
    }

    const urutan = Number.parseInt(record['urutan'] ?? '', 10);
    items.push({
      urutan: Number.isFinite(urutan) ? urutan : index + 1,
      url,
      caption: record['caption'] ?? '',
    });
  });

  return items.sort((a, b) => a.urutan - b.urutan);
}

export function parseAccounts(rows: string[][], warnings: string[]): BankAccount[] {
  return parseAccountRecords(rowsToRecords(rows), warnings, MATRIX_LABEL);
}

export function parseAccountRecords(
  records: Record<string, string>[],
  warnings: string[],
  label: RowLabel = RECORD_LABEL,
): BankAccount[] {
  const items: BankAccount[] = [];

  records.forEach((record, index) => {
    if (!toBool(record['tampil'], true)) return;

    const bank = record['bank'] ?? '';
    const nomor = record['nomor'] ?? '';
    if (!bank || !nomor) {
      warnings.push(`Rekening ${label(index)}: bank/nomor kosong, baris dilewati.`);
      return;
    }

    items.push({ bank, nomor, atasNama: record['atas_nama'] ?? '' });
  });

  // US-12: maksimum 3 rekening ditampilkan.
  return items.slice(0, 3);
}

export function parseGuests(rows: string[][], warnings: string[]): Guest[] {
  return parseGuestRecords(rowsToRecords(rows), warnings, MATRIX_LABEL);
}

export function parseGuestRecords(
  records: Record<string, string>[],
  warnings: string[],
  label: RowLabel = RECORD_LABEL,
): Guest[] {
  const seen = new Set<string>();
  const items: Guest[] = [];

  records.forEach((record, index) => {
    const nama = record['nama'] ?? '';
    if (!nama) return;

    // Slug boleh dikosongkan; sistem menurunkannya dari nama.
    let slug = slugify(record['slug'] ?? '') || slugify(nama);
    if (!slug) return;

    if (seen.has(slug)) {
      let n = 2;
      while (seen.has(`${slug}-${n}`)) n += 1;
      warnings.push(`Tamu ${label(index)}: slug "${slug}" duplikat, dipakai "${slug}-${n}".`);
      slug = `${slug}-${n}`;
    }

    seen.add(slug);
    items.push({ nama, slug, kategori: record['kategori'] ?? '' });
  });

  return items;
}

/** Rakit seluruh bagian menjadi satu model konten siap render. */
export function parseContentRecords(
  records: ContentRecords,
  source: ContentSource,
  fetchedAt: string,
  label: RowLabel = RECORD_LABEL,
): Content {
  const warnings: string[] = [];

  return {
    config: parseConfig(records.config, warnings),
    schedule: parseScheduleRecords(records.jadwal, warnings, label),
    gallery: parseGalleryRecords(records.galeri, warnings, label),
    accounts: parseAccountRecords(records.rekening, warnings, label),
    guests: parseGuestRecords(records.tamu, warnings, label),
    fetchedAt,
    source,
    warnings,
  };
}

/** Varian untuk matriks berheader — jalur berkas seed. */
export function parseContent(
  raw: RawContentMatrix,
  source: ContentSource,
  fetchedAt: string,
): Content {
  return parseContentRecords(matrixToRecords(raw), source, fetchedAt, MATRIX_LABEL);
}

export function matrixToRecords(raw: RawContentMatrix): ContentRecords {
  return {
    config: configRowsToMap(raw.config),
    jadwal: rowsToRecords(raw.jadwal),
    galeri: rowsToRecords(raw.galeri),
    rekening: rowsToRecords(raw.rekening),
    tamu: rowsToRecords(raw.tamu),
  };
}

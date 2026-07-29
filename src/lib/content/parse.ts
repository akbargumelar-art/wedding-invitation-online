import { z } from 'zod';
import { normalizeZone, toEpochMs } from '@/lib/date';
import { slugify } from '@/lib/text';
import type {
  BankAccount,
  Content,
  ContentSource,
  GalleryItem,
  Guest,
  RawSheetData,
  ScheduleItem,
  SiteConfig,
} from './types';

/**
 * Parser tahan banting untuk isi Google Sheet (mitigasi R-2).
 *
 * Aturan mainnya: satu baris rusak TIDAK BOLEH menjatuhkan halaman. Baris yang
 * gagal divalidasi dilewati dan dicatat sebagai warning; kolom tak dikenal
 * diabaikan; nilai yang hilang diisi default.
 */

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

const DEFAULT_CONFIG: SiteConfig = {
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

// -----------------------------------------------------------------------------
// Jadwal / Galeri / Rekening / Tamu
// -----------------------------------------------------------------------------

export function parseSchedule(rows: string[][], warnings: string[]): ScheduleItem[] {
  const items: ScheduleItem[] = [];

  rowsToRecords(rows).forEach((record, index) => {
    const baris = index + 2; // +1 header, +1 karena manusia menghitung dari 1
    if (!toBool(record['tampil'], true)) return;

    const acara = record['acara'] ?? '';
    const tanggal = record['tanggal'] ?? '';
    if (!acara || !tanggal) {
      warnings.push(`Jadwal baris ${baris}: kolom acara/tanggal kosong, baris dilewati.`);
      return;
    }

    const zona = normalizeZone(record['zona']);
    const startsAtMs = toEpochMs(tanggal, record['jam_mulai'], zona);
    if (startsAtMs === null) {
      warnings.push(`Jadwal baris ${baris}: tanggal "${tanggal}" tidak valid, baris dilewati.`);
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
      startsAtMs,
      // Jam selesai yang kosong harus tetap null, bukan tengah malam — kalau
      // tidak, berkas .ics akan punya DTEND sebelum DTSTART.
      endsAtMs: record['jam_selesai'] ? toEpochMs(tanggal, record['jam_selesai'], zona) : null,
    });
  });

  return items.sort((a, b) => a.startsAtMs - b.startsAtMs);
}

export function parseGallery(rows: string[][], warnings: string[]): GalleryItem[] {
  const items: GalleryItem[] = [];

  rowsToRecords(rows).forEach((record, index) => {
    if (!toBool(record['tampil'], true)) return;

    const url = record['url'] ?? '';
    if (!url) {
      warnings.push(`Galeri baris ${index + 2}: kolom url kosong, baris dilewati.`);
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
  const items: BankAccount[] = [];

  rowsToRecords(rows).forEach((record, index) => {
    if (!toBool(record['tampil'], true)) return;

    const bank = record['bank'] ?? '';
    const nomor = record['nomor'] ?? '';
    if (!bank || !nomor) {
      warnings.push(`Rekening baris ${index + 2}: bank/nomor kosong, baris dilewati.`);
      return;
    }

    items.push({ bank, nomor, atasNama: record['atas_nama'] ?? '' });
  });

  // US-12: maksimum 3 rekening ditampilkan.
  return items.slice(0, 3);
}

export function parseGuests(rows: string[][], warnings: string[]): Guest[] {
  const seen = new Set<string>();
  const items: Guest[] = [];

  rowsToRecords(rows).forEach((record, index) => {
    const nama = record['nama'] ?? '';
    if (!nama) return;

    // Slug boleh dikosongkan di Sheet; sistem menurunkannya dari nama.
    let slug = slugify(record['slug'] ?? '') || slugify(nama);
    if (!slug) return;

    if (seen.has(slug)) {
      let n = 2;
      while (seen.has(`${slug}-${n}`)) n += 1;
      warnings.push(`Tamu baris ${index + 2}: slug "${slug}" duplikat, dipakai "${slug}-${n}".`);
      slug = `${slug}-${n}`;
    }

    seen.add(slug);
    items.push({ nama, slug, kategori: record['kategori'] ?? '' });
  });

  return items;
}

/** Rakit seluruh tab menjadi satu model konten siap render. */
export function parseContent(raw: RawSheetData, source: ContentSource, fetchedAt: string): Content {
  const warnings: string[] = [];

  return {
    config: parseConfig(configRowsToMap(raw.config), warnings),
    schedule: parseSchedule(raw.jadwal, warnings),
    gallery: parseGallery(raw.galeri, warnings),
    accounts: parseAccounts(raw.rekening, warnings),
    guests: parseGuests(raw.tamu, warnings),
    fetchedAt,
    source,
    warnings,
  };
}

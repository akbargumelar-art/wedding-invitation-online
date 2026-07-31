import { z } from 'zod';
import { normalizePhone, stripHtml } from '@/lib/text';

/**
 * Satu sumber kebenaran skema untuk klien dan server (PRD §4.1).
 *
 * Modul ini sengaja bebas dari `server-only` supaya komponen form dapat
 * memvalidasi lebih dulu di browser; server tetap memvalidasi ulang seluruh
 * payload — validasi klien hanya demi pengalaman pengguna, bukan keamanan.
 */

/**
 * Peta galat berbahasa Indonesia untuk seluruh skema.
 *
 * Tanpa ini, aturan bawaan Zod ("Expected string, received null") bisa lolos ke
 * layar tamu lewat `firstErrorMessage`. Peta ini menjamin: pesan apa pun yang
 * sampai ke tamu selalu berbahasa Indonesia, bahkan untuk galat yang tidak
 * terpikirkan saat menulis skema.
 */
z.setErrorMap((issue, ctx) => {
  switch (issue.code) {
    case z.ZodIssueCode.invalid_type:
      return {
        message:
          issue.received === 'undefined' || issue.received === 'null'
            ? 'Kolom ini wajib diisi.'
            : 'Format isian tidak sesuai.',
      };
    case z.ZodIssueCode.too_small:
      return {
        message:
          issue.type === 'string'
            ? `Isian minimal ${issue.minimum} karakter.`
            : `Nilai minimal ${issue.minimum}.`,
      };
    case z.ZodIssueCode.too_big:
      return {
        message:
          issue.type === 'string'
            ? `Isian maksimal ${issue.maximum} karakter.`
            : `Nilai maksimal ${issue.maximum}.`,
      };
    case z.ZodIssueCode.invalid_enum_value:
      return { message: 'Pilihan tidak dikenal.' };
    case z.ZodIssueCode.invalid_string:
      return { message: 'Format isian tidak sesuai.' };
    default:
      return { message: ctx.defaultError === '' ? 'Data tidak valid.' : 'Data yang dikirim tidak valid.' };
  }
});

/**
 * Buang markup lalu rapikan spasi.
 *
 * `null` dan `undefined` dinormalkan menjadi string kosong supaya skema dapat
 * memvalidasi ulang keluarannya sendiri: klien mengirim `{ message: null }`
 * hasil transform, dan server memakai skema yang sama untuk memeriksanya.
 */
const cleanText = (value: unknown): unknown => {
  if (value === null || value === undefined) return '';
  return typeof value === 'string' ? stripHtml(value).replace(/[ \t]+/g, ' ').trim() : value;
};

const optionalSlug = z.preprocess(
  (value) => (value === null || value === undefined ? '' : value),
  z
    .string()
    .trim()
    .max(80)
    .regex(/^[a-z0-9-]*$/, 'Slug tamu tidak valid.')
    .transform((value) => (value ? value : null)),
);

const guestName = z.preprocess(
  cleanText,
  z
    .string({ required_error: 'Nama wajib diisi.' })
    .min(2, 'Nama minimal 2 karakter.')
    .max(60, 'Nama maksimal 60 karakter.'),
);

// -----------------------------------------------------------------------------
// RSVP (US-10)
// -----------------------------------------------------------------------------

export const RSVP_STATUSES = ['hadir', 'tidak_hadir', 'ragu'] as const;

/**
 * Jumlah orang yang dapat dipilih tamu.
 *
 * `PAX_OVER` bukan hitungan sebenarnya melainkan penanda "lebih dari lima".
 * Rombongan sebesar itu jarang dan jumlah pastinya biasanya masih berubah, jadi
 * tamu tidak dipaksa menebak angka. Konsekuensinya harus disadari saat menghitung
 * konsumsi: satu baris bernilai 6 berarti "enam atau lebih", bukan tepat enam —
 * karena itu setiap tampilan angka ini wajib lewat `formatPax()`.
 */
export const PAX_OVER = 6;
export const PAX_OPTIONS = [1, 2, 3, 4, 5, PAX_OVER] as const;

export function formatPax(pax: number): string {
  return pax >= PAX_OVER ? 'lebih dari 5 orang' : `${pax} orang`;
}

export const rsvpSchema = z
  .object({
    slug: optionalSlug,
    name: guestName,
    status: z.enum(RSVP_STATUSES, {
      errorMap: () => ({ message: 'Pilih salah satu status kehadiran.' }),
    }),
    pax: z.coerce
      .number({ invalid_type_error: 'Jumlah orang harus berupa angka.' })
      .int('Jumlah orang harus bilangan bulat.')
      .min(1, 'Jumlah orang minimal 1.')
      .max(PAX_OVER, 'Jumlah orang tidak dikenali.')
      .default(1),
    message: z.preprocess(
      cleanText,
      z.string().max(300, 'Pesan maksimal 300 karakter.').optional().default(''),
    ),
  })
  .transform((value) => ({
    ...value,
    // Jumlah orang hanya bermakna bila tamu menyatakan hadir.
    pax: value.status === 'hadir' ? value.pax : 1,
    message: value.message.length > 0 ? value.message : null,
  }));

export type RsvpPayload = z.infer<typeof rsvpSchema>;

// -----------------------------------------------------------------------------
// Ucapan (US-11)
// -----------------------------------------------------------------------------

/** Waktu minimum antara form dirender dan dikirim — penyaring bot sederhana. */
export const MIN_FORM_ELAPSED_MS = 3000;

export const wishSchema = z
  .object({
    slug: optionalSlug,
    name: guestName,
    message: z.preprocess(
      cleanText,
      z
        .string({ required_error: 'Ucapan wajib diisi.' })
        .min(5, 'Ucapan minimal 5 karakter.')
        .max(500, 'Ucapan maksimal 500 karakter.'),
    ),
    /** Honeypot: field tersembunyi yang hanya diisi bot. */
    hp: z.string().max(0, 'Pengiriman ditolak.').optional().default(''),
    /** Milidetik sejak form dirender, diukur di sisi klien (kebal selisih jam). */
    elapsedMs: z.preprocess(
      (value) => (value === null || value === undefined ? MIN_FORM_ELAPSED_MS : value),
      z.coerce.number().nonnegative(),
    ),
  })
  .transform(({ hp: _hp, ...rest }) => rest);

export type WishPayload = z.infer<typeof wishSchema>;

// -----------------------------------------------------------------------------
// Amplop digital (US-12)
// -----------------------------------------------------------------------------

export const ENVELOPE_METHODS = ['qris', 'transfer', 'tunai'] as const;

export const envelopeSchema = z
  .object({
    slug: optionalSlug,
    sender_name: guestName,
    amount: z.preprocess(
      (value) => {
        if (value === null || value === undefined || value === '') return undefined;
        if (typeof value !== 'string') return value;
        const digits = value.replace(/\D/g, '');
        return digits === '' ? undefined : Number.parseInt(digits, 10);
      },
      z
        .number()
        .int()
        .min(0, 'Nominal tidak boleh negatif.')
        .max(1_000_000_000, 'Nominal terlalu besar.')
        .optional(),
    ),
    method: z.enum(ENVELOPE_METHODS, {
      errorMap: () => ({ message: 'Pilih metode pengiriman.' }),
    }),
    note: z.preprocess(
      cleanText,
      z.string().max(200, 'Catatan maksimal 200 karakter.').optional().default(''),
    ),
  })
  .transform((value) => ({
    ...value,
    note: value.note.length > 0 ? value.note : null,
    amount: value.amount ?? null,
  }));

export type EnvelopePayload = z.infer<typeof envelopeSchema>;

// -----------------------------------------------------------------------------
// Admin
// -----------------------------------------------------------------------------

export const loginSchema = z.object({
  username: z.string().trim().min(1, 'Nama pengguna wajib diisi.').max(120),
  password: z.string().min(1, 'Kata sandi wajib diisi.').max(200),
});

export const wishModerationSchema = z.object({
  status: z.enum(['pending', 'approved', 'rejected', 'deleted'], {
    errorMap: () => ({ message: 'Aksi moderasi tidak dikenal.' }),
  }),
});

export const envelopeModerationSchema = z.object({
  status: z.enum(['pending', 'verified', 'rejected'], {
    errorMap: () => ({ message: 'Aksi verifikasi tidak dikenal.' }),
  }),
});

// -----------------------------------------------------------------------------
// Pengaturan isi undangan (dashboard admin)
// -----------------------------------------------------------------------------

/**
 * Isian dashboard divalidasi dengan aturan yang sama ketatnya dengan isian
 * tamu, meski admin adalah pihak tepercaya.
 *
 * Alasannya bukan kecurigaan terhadap admin, melainkan bahwa nilai-nilai ini
 * masuk ke atribut `src`, tautan, dan metadata halaman yang dilihat semua tamu:
 * satu URL salah ketik akan tampil sebagai gambar rusak di ratusan perangkat,
 * dan itu baru ketahuan setelah undangan tersebar.
 */

/** Teks biasa: markup dibuang, panjang dibatasi. */
const text = (max: number) =>
  z.preprocess(cleanText, z.string().max(max, `Isian maksimal ${max} karakter.`).default(''));

/**
 * Terima URL absolut http(s) maupun path internal seperti `/media/…` (hasil
 * unggahan). `//host` ditolak: bentuk itu terlihat seperti path internal tapi
 * sebenarnya menunjuk ke situs lain.
 */
function isDisplayableUrl(value: string): boolean {
  if (value === '') return true;
  if (value.startsWith('//')) return false;
  if (value.startsWith('/')) return true;
  return /^https?:\/\//i.test(value);
}

const urlField = z.preprocess(
  (value) => (typeof value === 'string' ? value.trim() : value === null ? '' : value),
  z
    .string()
    .max(600, 'URL maksimal 600 karakter.')
    .default('')
    .refine(isDisplayableUrl, 'URL harus diawali http://, https://, atau / untuk berkas unggahan.'),
);

/**
 * Google Maps memberi potongan `<iframe src="…"></iframe>` lewat tombol Bagikan,
 * dan itulah yang biasanya ditempel orang. Ambil saja `src`-nya, daripada
 * menolak tempelan yang niatnya sudah benar.
 */
const embedField = z.preprocess((value) => {
  if (typeof value !== 'string') return value;
  const match = value.match(/<iframe[^>]*\ssrc=["']([^"']+)["']/i);
  return (match?.[1] ?? value).trim();
}, urlField);

const dateField = z.preprocess(
  (value) => (typeof value === 'string' ? value.trim() : value === null ? '' : value),
  z.string().regex(/^(\d{4}-\d{2}-\d{2})?$/, 'Tanggal harus berformat YYYY-MM-DD.').default(''),
);

const timeField = z.preprocess(
  (value) => (typeof value === 'string' ? value.trim() : value === null ? '' : value),
  z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$|^$/, 'Jam harus berformat HH:MM.').default(''),
);

const flag = z.preprocess((value) => {
  if (typeof value === 'string') return value === 'true' || value === 'on' || value === '1';
  return value;
}, z.boolean());

const personSchema = z.object({
  panggilan: text(40),
  namaLengkap: text(80),
  binBinti: text(80),
  ayah: text(80),
  ibu: text(80),
  anakKe: text(30),
  foto: urlField,
  instagram: text(60),
});

export const siteConfigSchema = z.object({
  isDraft: flag,
  modeSyari: flag,
  urutanMempelai: z.enum(['wanita_dulu', 'pria_dulu'], {
    errorMap: () => ({ message: 'Urutan mempelai tidak dikenal.' }),
  }),

  pria: personSchema,
  wanita: personSchema,

  quoteArab: text(600),
  quoteTerjemahan: text(600),
  quoteSumber: text(120),

  salamPembuka: text(160),
  kalimatPembuka: text(800),
  kalimatPenutup: text(800),
  doaPenutup: text(800),
  salamPenutup: text(160),

  venueNama: text(120),
  venueAlamat: text(300),
  venueCatatan: text(300),
  gmapsUrl: urlField,
  gmapsEmbed: embedField,

  qrisImageUrl: urlField,
  qrisNamaMerchant: text(120),

  backsoundUrl: urlField,

  rsvpOpen: flag,
  deadlineRsvp: dateField.transform((value) => (value === '' ? null : value)),
  moderasiUcapan: flag,

  ogImage: urlField,
  coverImage: urlField,
});

export type SiteConfigPayload = z.infer<typeof siteConfigSchema>;

export const ZONE_CODES = ['WIB', 'WITA', 'WIT'] as const;

export const scheduleSchema = z
  .object({
    acara: z.preprocess(
      cleanText,
      z
        .string({ required_error: 'Nama acara wajib diisi.' })
        .min(2, 'Nama acara minimal 2 karakter.')
        .max(80, 'Nama acara maksimal 80 karakter.'),
    ),
    tanggal: z.preprocess(
      (value) => (typeof value === 'string' ? value.trim() : value),
      z
        .string({ required_error: 'Tanggal wajib diisi.' })
        .regex(/^\d{4}-\d{2}-\d{2}$/, 'Tanggal wajib diisi dengan format YYYY-MM-DD.'),
    ),
    jamMulai: timeField,
    jamSelesai: timeField,
    zona: z.enum(ZONE_CODES, { errorMap: () => ({ message: 'Zona waktu tidak dikenal.' }) }),
    lokasi: text(160),
    catatan: text(300),
    gmapsUrl: urlField,
    tampil: flag,
  })
  .refine((value) => !value.jamSelesai || !value.jamMulai || value.jamSelesai > value.jamMulai, {
    // Jam selesai sebelum jam mulai menghasilkan berkas .ics yang ditolak
    // aplikasi kalender, jadi ditahan di sini alih-alih diam-diam disimpan.
    message: 'Jam selesai harus setelah jam mulai.',
    path: ['jamSelesai'],
  });

export const gallerySchema = z.object({
  url: urlField.refine((value) => value !== '', 'Alamat gambar wajib diisi.'),
  caption: text(160),
  tampil: flag,
});

export const accountSchema = z.object({
  bank: z.preprocess(
    cleanText,
    z
      .string({ required_error: 'Nama bank wajib diisi.' })
      .min(2, 'Nama bank minimal 2 karakter.')
      .max(60, 'Nama bank maksimal 60 karakter.'),
  ),
  nomor: z.preprocess(
    (value) => (typeof value === 'string' ? value.replace(/[^\d\s-]/g, '').trim() : value),
    z
      .string({ required_error: 'Nomor rekening wajib diisi.' })
      .min(4, 'Nomor rekening minimal 4 digit.')
      .max(40, 'Nomor rekening maksimal 40 karakter.'),
  ),
  atasNama: text(80),
  tampil: flag,
});

export const guestSchema = z.object({
  nama: guestName,
  /**
   * Slug boleh dikosongkan: server menurunkannya dari nama. Yang tidak boleh
   * adalah slug isian bebas — ia menjadi bagian URL yang disebar ke tamu.
   */
  slug: z.preprocess(
    (value) => (typeof value === 'string' ? value.trim().toLowerCase() : ''),
    z
      .string()
      .max(80, 'Slug maksimal 80 karakter.')
      .regex(/^[a-z0-9-]*$/, 'Slug hanya boleh huruf kecil, angka, dan tanda hubung.')
      .default(''),
  ),
  kategori: text(40),
  /**
   * Nomor WhatsApp, dinormalkan saat divalidasi supaya bentuk apa pun yang
   * ditempel admin tersimpan sebagai satu format yang sama.
   */
  telepon: z.preprocess(
    (value) => (typeof value === 'string' ? normalizePhone(value) : ''),
    z
      .string()
      .max(20, 'Nomor telepon terlalu panjang.')
      .regex(/^\d*$/, 'Nomor telepon hanya boleh berisi angka.')
      .default('')
      .refine(
        (value) => value === '' || value.length >= 9,
        'Nomor telepon terlalu pendek — tulis lengkap dengan kode area, mis. 0812…',
      ),
  ),
});

/**
 * Impor massal tamu dari tempelan Excel/CSV.
 *
 * Inilah pengganti kenyamanan utama spreadsheet: menempel ratusan nama sekaligus
 * alih-alih mengisi satu per satu. Pemisah kolom boleh koma, titik koma, atau
 * TAB — TAB-lah yang dihasilkan saat menyalin langsung dari Excel.
 *
 * Urutan kolom: nama, kategori, nomor WhatsApp.
 */
export const guestImportSchema = z.object({
  text: z
    .string({ required_error: 'Tempelkan minimal satu nama.' })
    .min(1, 'Tempelkan minimal satu nama.')
    .max(200_000, 'Data terlalu besar. Bagi menjadi beberapa kali impor.'),
});

export type ParsedGuestLine = { nama: string; slug: string; kategori: string; telepon: string };

/**
 * Pecah tempelan menjadi daftar tamu. Baris kosong dilewati, baris header
 * ("nama", "nama,kategori") dikenali dan dibuang.
 */
export function parseGuestImport(input: string): ParsedGuestLine[] {
  const entries: ParsedGuestLine[] = [];

  for (const rawLine of input.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line) continue;

    const cells = line.split(/\t|;|,/).map((cell) => cell.trim());
    const nama = stripHtml(cells[0] ?? '').slice(0, 60);
    if (!nama) continue;

    // Baris judul dari spreadsheet tidak boleh ikut jadi tamu bernama "Nama".
    if (entries.length === 0 && /^(nama|name)$/i.test(nama)) continue;

    entries.push({
      nama,
      slug: '',
      kategori: stripHtml(cells[1] ?? '').slice(0, 40),
      telepon: normalizePhone(cells[2] ?? ''),
    });
  }

  return entries;
}

// -----------------------------------------------------------------------------
// Integrasi WhatsApp (WAHA)
// -----------------------------------------------------------------------------

/** Batas bawah jeda antar-pengiriman massal; lihat catatan di waha/settings.ts. */
export const MIN_BROADCAST_DELAY = 5;

export const wahaSettingsSchema = z
  .object({
    enabled: flag,
    baseUrl: z.preprocess(
      (value) => (typeof value === 'string' ? value.trim().replace(/\/+$/, '') : ''),
      z
        .string()
        .max(300, 'Alamat server maksimal 300 karakter.')
        .default('')
        .refine(
          (value) => value === '' || /^https?:\/\/\S+$/i.test(value),
          'Alamat server WAHA harus diawali http:// atau https://.',
        ),
    ),
    session: z.preprocess(
      (value) => (typeof value === 'string' ? value.trim() : ''),
      z
        .string()
        .max(60, 'Nama sesi maksimal 60 karakter.')
        .regex(/^[A-Za-z0-9._-]*$/, 'Nama sesi hanya boleh huruf, angka, titik, dan tanda hubung.')
        .default(''),
    ),
    /**
     * Rahasia yang dikosongkan berarti "biarkan seperti sebelumnya", bukan
     * "hapus". Dashboard tidak pernah menerima nilainya kembali dari server,
     * jadi menyimpan form apa adanya tidak boleh menghapus kunci yang sudah ada.
     */
    apiKey: z.preprocess(
      (value) => (typeof value === 'string' ? value.trim() : ''),
      z.string().max(300).default(''),
    ),
    webhookSecret: z.preprocess(
      (value) => (typeof value === 'string' ? value.trim() : ''),
      z.string().max(300).default(''),
    ),
    invitationTemplate: z.preprocess(
      (value) => (typeof value === 'string' ? value : ''),
      z
        .string()
        .max(4000, 'Templat pesan maksimal 4000 karakter.')
        .default('')
        .refine(
          (value) => value.trim() !== '',
          'Templat pesan undangan tidak boleh kosong.',
        ),
    ),
    autoReply: flag,
    acceptReplies: flag,
    minDelaySeconds: z.coerce
      .number()
      .int('Jeda harus bilangan bulat.')
      .min(MIN_BROADCAST_DELAY, `Jeda minimal ${MIN_BROADCAST_DELAY} detik.`)
      .max(3600, 'Jeda maksimal 3600 detik.'),
    maxDelaySeconds: z.coerce
      .number()
      .int('Jeda harus bilangan bulat.')
      .min(MIN_BROADCAST_DELAY, `Jeda minimal ${MIN_BROADCAST_DELAY} detik.`)
      .max(3600, 'Jeda maksimal 3600 detik.'),

    /**
     * Nomor penerima notifikasi, ditulis bebas dalam satu kolom — dipisah koma
     * atau baris baru. Masing-masing dinormalkan seperti nomor tamu, sehingga
     * bentuk apa pun yang ditempel dari kontak ponsel tetap sampai.
     */
    notifyRecipients: z.preprocess(
      (value) => {
        if (Array.isArray(value)) return value.map(String);
        if (typeof value !== 'string') return [];

        return value
          .split(/[\n,;]+/)
          .map((entry) => normalizePhone(entry))
          .filter(Boolean);
      },
      z
        .array(z.string().regex(/^\d{9,20}$/, 'Ada nomor penerima yang tidak valid.'))
        .max(20, 'Maksimal 20 nomor penerima.')
        .default([]),
    ),
    notifyEvents: z
      .array(z.enum(['rsvp', 'wish', 'envelope', 'visit']))
      .max(4)
      .optional()
      .default(['rsvp', 'wish', 'envelope']),
  })
  .refine((value) => value.maxDelaySeconds >= value.minDelaySeconds, {
    // Rentang terbalik menghasilkan jeda yang tidak pernah acak, dan itu
    // menghapus seluruh gunanya.
    message: 'Jeda maksimum tidak boleh lebih kecil daripada jeda minimum.',
    path: ['maxDelaySeconds'],
  });

export const sendInvitationSchema = z.object({
  guestId: z.coerce.number().int().positive('Tamu tidak dikenal.'),
});

export const broadcastSchema = z.object({
  /** Kosong berarti seluruh tamu yang punya nomor dan belum pernah terkirim. */
  guestIds: z.array(z.number().int().positive()).max(2000).optional().default([]),
  /** True untuk mengirim ulang ke tamu yang undangannya sudah pernah terkirim. */
  includeSent: z.boolean().optional().default(false),
});

export const reorderSchema = z.object({
  ids: z.array(z.number().int().positive()).max(500, 'Terlalu banyak item untuk diurutkan.'),
});

// -----------------------------------------------------------------------------
// Pembantu
// -----------------------------------------------------------------------------

/** Ambil satu pesan galat per field, siap dipakai di form. */
export function fieldErrors(error: z.ZodError): Record<string, string> {
  const result: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = issue.path.join('.') || '_';
    if (!(key in result)) result[key] = issue.message;
  }
  return result;
}

/** Pesan ringkas untuk ditampilkan ke tamu bila field spesifik tidak penting. */
export function firstErrorMessage(error: z.ZodError, fallback = 'Data yang dikirim tidak valid.'): string {
  return error.issues[0]?.message ?? fallback;
}

import { z } from 'zod';
import { stripHtml } from '@/lib/text';

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

import { PAX_OVER } from '@/lib/validation';

/**
 * Penerjemah balasan WhatsApp tamu menjadi tindakan.
 *
 * Dirancang dengan asumsi tamu TIDAK membaca petunjuk. Karena itu:
 *
 *  - kata kuncinya kata sehari-hari ("hadir", "tidak bisa", "insya Allah
 *    hadir"), bukan kode seperti "1" atau "#RSVP";
 *  - urutan pemeriksaan menempatkan bentuk penyangkalan lebih dulu, sebab
 *    "tidak hadir" mengandung "hadir" dan pemeriksaan yang terbalik akan
 *    mencatat ketidakhadiran sebagai kehadiran — kesalahan yang paling mahal
 *    di antara semua yang mungkin terjadi di sini;
 *  - apa pun yang tidak dikenali TIDAK ditebak, melainkan dibalas petunjuk.
 *    Menebak berarti mencatat data kehadiran yang salah tanpa ada yang tahu.
 *
 * Modul ini murni: tidak menyentuh database maupun jaringan, sehingga seluruh
 * cabangnya dapat diuji secara langsung.
 */

export type ReplyIntent =
  | { kind: 'rsvp'; status: 'hadir' | 'tidak_hadir' | 'ragu'; pax: number }
  | { kind: 'wish'; message: string }
  | { kind: 'envelope'; method: 'transfer' | 'qris' | 'tunai'; amount: number | null }
  | { kind: 'help' }
  | { kind: 'unknown' };

// Ditulis lewat `new RegExp` agar berkas sumber tetap ASCII murni — karakter
// gabungan tidak selamat bila diketik apa adanya. Konvensi yang sama dipakai
// di text.ts.
const DIACRITICS = new RegExp('[\\u0300-\\u036f]', 'g');

function normalize(input: string): string {
  return input
    .normalize('NFD')
    .replace(DIACRITICS, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

/** Ambil angka jumlah orang dari kalimat seperti "hadir 3 orang". */
function readPax(text: string): number {
  const match = text.match(/(\d+)\s*(?:orang|pax)?/);
  if (!match?.[1]) return 1;

  const value = Number.parseInt(match[1], 10);
  if (!Number.isFinite(value) || value < 1) return 1;

  // Rombongan besar disimpan sebagai penanda "lebih dari 5", sama seperti
  // pilihan di formulir web — lihat catatan PAX_OVER di validation.ts.
  return Math.min(value, PAX_OVER);
}

/** Ambil nominal rupiah dari kalimat seperti "transfer 500.000". */
function readAmount(text: string): number | null {
  const digits = text.replace(/[^\d]/g, '');
  if (!digits) return null;

  const value = Number.parseInt(digits, 10);
  if (!Number.isFinite(value) || value <= 0 || value > 1_000_000_000) return null;
  return value;
}

const HELP_WORDS = ['menu', 'bantuan', 'help', 'petunjuk', 'info'];

/**
 * Kata kunci dicocokkan sebagai KATA UTUH, bukan potongan.
 *
 * Pencocokan potongan pernah membuat pertanyaan biasa "ini siapa ya?" tercatat
 * sebagai konfirmasi hadir, karena "siapa" mengandung "siap". Kesalahan seperti
 * itu tidak menimbulkan galat apa pun — ia hanya diam-diam merusak rekap
 * kehadiran.
 */
function hasWord(text: string, phrases: string[]): boolean {
  return phrases.some((phrase) => new RegExp(`\\b${phrase}\\b`).test(text));
}

const DECLINE_PATTERNS = [
  'tidak hadir',
  'tidak bisa',
  'tidak dapat',
  'tidak datang',
  'tidak ikut',
  'berhalangan',
  'maaf tidak',
  'belum bisa',
  'gak bisa',
  'ga bisa',
  'nggak bisa',
];

const DOUBT_PATTERNS = ['ragu', 'belum pasti', 'belum tahu', 'masih ragu', 'diusahakan'];

const ATTEND_PATTERNS = ['hadir', 'datang', 'insya allah', 'insyaallah', 'siap', 'ikut'];

/**
 * Kata penyangkal yang, bila muncul bersama kata kunci kehadiran, membuat
 * maksud pesan menjadi tidak pasti — mis. "belum tentu bisa hadir".
 *
 * Dalam keadaan itu jawabannya TIDAK ditebak. Menebak berarti mencatat data
 * kehadiran yang salah tanpa satu pun tanda; meminta tamu memperjelas hanya
 * berbiaya satu pesan tambahan.
 */
const NEGATIONS = ['tidak', 'tak', 'nggak', 'ngga', 'gak', 'ga', 'bukan', 'belum'];

export function parseReply(raw: string): ReplyIntent {
  const text = normalize(raw);
  if (!text) return { kind: 'unknown' };

  if (HELP_WORDS.includes(text)) return { kind: 'help' };

  // --- Amplop -------------------------------------------------------------
  // Diperiksa lebih dulu daripada RSVP: "sudah transfer, insya Allah hadir"
  // memuat kata kunci keduanya, dan konfirmasi dana yang hilang jauh lebih
  // merepotkan untuk ditelusuri ulang daripada RSVP yang dapat dikirim lagi.
  if (/\b(transfer|tf)\b/.test(text)) {
    return { kind: 'envelope', method: 'transfer', amount: readAmount(text) };
  }
  if (/\bqris\b/.test(text)) {
    return { kind: 'envelope', method: 'qris', amount: readAmount(text) };
  }
  if (/\b(tunai|cash|amplop)\b/.test(text)) {
    return { kind: 'envelope', method: 'tunai', amount: readAmount(text) };
  }

  // --- Ucapan bertanda kata kunci ----------------------------------------
  //
  // Dicocokkan ke teks ASLI, bukan hasil normalisasi: ucapan yang nanti tampil
  // ke tamu lain harus mempertahankan huruf besar dan tanda baca seperti yang
  // ditulis pengirimnya.
  const wishPrefix = raw.trim().match(/^(?:ucapan|doa|selamat)\b[\s:,-]*([\s\S]*)$/i);
  if (wishPrefix) {
    const message = (wishPrefix[1] ?? '').trim();
    if (message.length >= 5) return { kind: 'wish', message };

    // Kata kuncinya saja tanpa isi — kemungkinan besar tamu menekan kirim
    // terlalu cepat, jadi petunjuknya diulang alih-alih menyimpan ucapan kosong.
    return { kind: 'help' };
  }

  // --- RSVP ---------------------------------------------------------------
  //
  // Bentuk penyangkalan diperiksa lebih dulu: "tidak hadir" mengandung "hadir",
  // dan urutan yang terbalik akan mencatat ketidakhadiran sebagai kehadiran.
  if (hasWord(text, DECLINE_PATTERNS)) {
    return { kind: 'rsvp', status: 'tidak_hadir', pax: 1 };
  }
  if (hasWord(text, DOUBT_PATTERNS)) {
    return { kind: 'rsvp', status: 'ragu', pax: 1 };
  }
  if (hasWord(text, ATTEND_PATTERNS)) {
    // Kata kehadiran yang muncul bersama penyangkalan tidak ditebak — lihat
    // catatan pada NEGATIONS.
    if (hasWord(text, NEGATIONS)) return { kind: 'unknown' };

    return { kind: 'rsvp', status: 'hadir', pax: readPax(text) };
  }

  // Penolakan singkat berdiri sendiri, diperiksa terakhir supaya kata "tidak"
  // di tengah kalimat panjang tidak ikut tertangkap.
  if (/^(tidak|ga|gak|nggak|no)$/.test(text)) {
    return { kind: 'rsvp', status: 'tidak_hadir', pax: 1 };
  }

  return { kind: 'unknown' };
}

/** Petunjuk singkat yang dibalas ke tamu saat pesannya tidak dikenali. */
export function helpMessage(link: string): string {
  return [
    'Terima kasih atas pesannya. Konfirmasi dapat dikirim dengan membalas salah satu berikut:',
    '',
    '• *HADIR 2* — konfirmasi kehadiran beserta jumlah orang',
    '• *TIDAK HADIR* — berhalangan hadir',
    '• *RAGU* — belum dapat memastikan',
    '• *UCAPAN <pesan Anda>* — mengirim ucapan & doa',
    '• *TRANSFER 500000* — konfirmasi pengiriman tanda kasih',
    '',
    `Undangan lengkap: ${link}`,
  ].join('\n');
}

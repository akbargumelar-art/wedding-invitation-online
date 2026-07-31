/** Utilitas teks: slug, sanitasi, dan pemotongan. Dipakai di klien maupun server. */

// Ditulis lewat `new RegExp` agar berkas sumber tetap ASCII murni — karakter
// gabungan dan karakter kontrol tidak selamat bila diketik apa adanya.
const DIACRITICS = new RegExp('[\\u0300-\\u036f]', 'g');
// U+000A sengaja dikecualikan dari daftar karakter kontrol: paragraf dalam
// ucapan tamu harus bertahan. Carriage return dinormalkan lebih dulu di
// `stripHtml`.
const CONTROL_CHARS = new RegExp('[\\u0000-\\u0009\\u000b-\\u001f\\u007f-\\u009f]', 'g');
const APOSTROPHES = new RegExp("['\\u2018\\u2019]", 'g');

const ENTITIES: Record<string, string> = {
  '&lt;': '<',
  '&gt;': '>',
  '&quot;': '"',
  '&#39;': "'",
  '&#x27;': "'",
  '&nbsp;': ' ',
  '&amp;': '&',
};

/**
 * Slug URL dari nama tamu: huruf kecil, tanpa diakritik, spasi jadi tanda hubung
 * (US-13). Sufiks angka untuk duplikat ditambahkan oleh `uniqueSlug`.
 */
export function slugify(input: string): string {
  return input
    .normalize('NFD')
    .replace(DIACRITICS, '')
    .toLowerCase()
    .replace(APOSTROPHES, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
}

/** Beri sufiks -2, -3, ... bila slug sudah terpakai. */
export function uniqueSlug(input: string, taken: Iterable<string>): string {
  const base = slugify(input) || 'tamu';
  const used = new Set(taken);
  if (!used.has(base)) return base;

  let n = 2;
  while (used.has(`${base}-${n}`)) n += 1;
  return `${base}-${n}`;
}

/**
 * Buang seluruh markup dari input tamu sebelum disimpan (US-11).
 *
 * Entity di-decode lebih dulu lalu tag dibuang lagi, supaya `&lt;script&gt;`
 * tidak lolos sebagai markup terselubung. Hasilnya selalu teks biasa dan
 * dirender sebagai teks biasa — `dangerouslySetInnerHTML` tidak pernah dipakai.
 */
export function stripHtml(input: string): string {
  const decoded = input
    .replace(/\r\n?/g, '\n')
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<[^>]*>/g, ' ')
    .replace(/&(?:lt|gt|quot|amp|nbsp|#39|#x27);/gi, (m) => ENTITIES[m.toLowerCase()] ?? ' ');

  return decoded
    .replace(/<[^>]*>/g, ' ')
    .replace(CONTROL_CHARS, '')
    .replace(/[ \t]+/g, ' ')
    .replace(/[ \t]*\n[ \t]*/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/** Potong dengan elipsis; dipakai untuk nama tamu di cover (maks 60 karakter, US-01). */
export function truncate(input: string, max: number): string {
  const value = input.trim();
  if (value.length <= max) return value;
  return `${value.slice(0, Math.max(0, max - 1)).trimEnd()}…`;
}

/** Nama tamu siap tampil: markup dibuang, dirapikan, dipotong 60 karakter. */
export function sanitizeGuestName(input: string): string {
  return truncate(stripHtml(input).replace(/\s+/g, ' '), 60);
}

/** "Rp 1.500.000" — format nominal amplop. */
export function formatRupiah(amount: number | null | undefined): string {
  if (amount === null || amount === undefined || !Number.isFinite(amount)) return '-';
  return `Rp ${Math.round(amount).toLocaleString('id-ID')}`;
}

/** Ambil digit saja dari input bernominal ("1.500.000" -> 1500000). */
export function parseRupiah(input: string): number | null {
  const digits = input.replace(/\D/g, '');
  if (!digits) return null;
  const value = Number.parseInt(digits, 10);
  return Number.isFinite(value) ? value : null;
}

/** Sisipkan pemisah ribuan saat mengetik di input nominal. */
export function formatThousands(input: string): string {
  const digits = input.replace(/\D/g, '');
  return digits ? Number.parseInt(digits, 10).toLocaleString('id-ID') : '';
}

/**
 * Rapikan nomor WhatsApp menjadi format internasional tanpa tanda plus
 * (mis. `081234567890` → `6281234567890`).
 *
 * Bentuk yang ditemui di daftar tamu nyata sangat beragam: `0812-3456-7890`,
 * `+62 812 3456 7890`, `62812...`, bahkan `812...` tanpa awalan apa pun. WAHA
 * menuntut satu bentuk saja, dan nomor yang salah format tidak menghasilkan
 * galat — pesannya hanya tidak pernah sampai. Karena itu normalisasinya
 * dilakukan sekali di sini, saat menyimpan, bukan saat mengirim.
 *
 * Nomor non-Indonesia yang sudah ditulis lengkap dengan kode negara dibiarkan
 * apa adanya. Kembaliannya string kosong bila tidak ada yang masuk akal.
 */
export function normalizePhone(input: string): string {
  const digits = input.replace(/\D/g, '');
  if (!digits) return '';

  // 0812… → 62812…
  if (digits.startsWith('0')) {
    const rest = digits.slice(1);
    return rest ? `62${rest}` : '';
  }

  // Sudah berkode negara Indonesia.
  if (digits.startsWith('62')) return digits;

  // 812… — kode negara terlupakan, bentuk yang paling sering ditempel dari
  // kontak ponsel. Nomor seluler Indonesia selalu diawali 8 setelah kode negara.
  if (digits.startsWith('8')) return `62${digits}`;

  // Kode negara lain: dipercaya apa adanya.
  return digits;
}

/** Tampilkan nomor internasional dalam bentuk yang enak dibaca manusia. */
export function formatPhone(phone: string): string {
  if (!phone) return '';
  return `+${phone}`;
}

/** Inisial untuk avatar ucapan, maksimum 2 huruf. */
export function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  const first = parts[0]?.[0] ?? '';
  const second = parts.length > 1 ? (parts[parts.length - 1]?.[0] ?? '') : '';
  return (first + second).toUpperCase();
}

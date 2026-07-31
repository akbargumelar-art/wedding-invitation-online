/**
 * Konfigurasi aplikasi dari environment variable.
 *
 * Berkas ini WAJIB bebas dari modul khusus Node — `node:fs`, `node:path`, dan
 * seluruh skema `node:` lainnya. Ia ikut dipakai `instrumentation.ts`, yang
 * dikompilasi Next untuk runtime **edge** juga, dan di sana modul-modul itu tidak
 * ada. Satu impor saja membuat `npm run dev` melayani HTTP 500 pada setiap
 * halaman dengan:
 *
 *     UnhandledSchemeError: Reading from "node:path" is not handled by plugins
 *
 * Yang menyesatkan: `next build` tetap lolos, jadi kerusakannya hanya muncul di
 * pengembangan. Pemuat .env untuk skrip CLI ada di [dotenv.ts](dotenv.ts).
 */
function str(key: string, fallback = ''): string {
  const value = process.env[key];
  return value === undefined || value === '' ? fallback : value;
}

function int(key: string, fallback: number): number {
  const parsed = Number.parseInt(process.env[key] ?? '', 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}


/**
 * Path absolut: diawali `/`, `\`, UNC `\\server`, atau huruf drive `C:\` / `C:/`.
 * Sengaja mencakup gaya Windows dan POSIX karena pengembangan berjalan di Windows
 * sedangkan produksi di Ubuntu.
 */
const ABSOLUTE_PATH = /^(?:[/\\]|[a-zA-Z]:[/\\])/;

/**
 * Jadikan path relatif (dev) menjadi absolut terhadap cwd.
 *
 * Ditulis tangan alih-alih memakai `node:path` — lihat catatan di kepala berkas.
 * Diekspor hanya agar dapat diuji; jangan dipakai di luar modul ini.
 */
export function resolvePath(value: string): string {
  if (ABSOLUTE_PATH.test(value)) return value;

  const cwd = process.cwd();
  const separator = cwd.includes('\\') ? '\\' : '/';
  const relative = value.replace(/^\.[/\\]/, '');

  return cwd.endsWith(separator) ? `${cwd}${relative}` : `${cwd}${separator}${relative}`;
}


/**
 * Hash Argon2id berisi banyak tanda `$`, dan pemuat .env milik Next melakukan
 * ekspansi variabel — `$argon2id$v=19$...` diam-diam berubah menjadi potongan
 * tak berarti, membuat login admin selalu gagal tanpa pesan yang jelas.
 *
 * Bentuk kanonik yang dipakai proyek ini adalah versi ter-escape (`\$argon2id\$…`):
 * pemuat .env sudah membukanya sendiri, sedangkan systemd EnvironmentFile
 * meneruskan backslash apa adanya sehingga dibuka di sini. Satu nilai yang sama
 * karena itu bekerja di kedua tempat.
 */
function unescapeDollar(value: string): string {
  return value.replace(/\\\$/g, '$');
}

export const env = {
  isProduction: process.env.NODE_ENV === 'production',
  siteUrl: str('NEXT_PUBLIC_SITE_URL', 'http://localhost:3000').replace(/\/$/, ''),

  content: {
    /**
     * Umur cache halaman undangan.
     *
     * Boleh panjang: isi undangan dibaca dari SQLite lokal, dan setiap
     * penyimpanan di dashboard admin langsung membatalkan cache lewat
     * `revalidateTag`. Nilai ini karena itu hanya menjadi batas atas bila ada
     * perubahan yang entah bagaimana lolos dari jalur itu.
     */
    cacheTtl: int('CONTENT_CACHE_TTL', 300),
  },

  db: {
    path: resolvePath(str('DATABASE_PATH', './data/app.db')),
  },

  uploads: {
    /** Bukti transfer — privat, hanya dapat dibaca lewat route admin. */
    dir: resolvePath(str('UPLOAD_DIR', './data/uploads')),
    /** Gambar isi undangan — publik, disajikan lewat /media/<berkas>. */
    mediaDir: resolvePath(str('MEDIA_DIR', './data/media')),
    maxBytes: int('MAX_UPLOAD_BYTES', 2_097_152),
  },

  security: {
    adminUsername: str('ADMIN_USERNAME', 'admin'),
    adminPasswordHash: unescapeDollar(str('ADMIN_PASSWORD_HASH')),
    authSecret: str('AUTH_SECRET'),
    ipHashSalt: str('IP_HASH_SALT'),
    revalidateSecret: str('REVALIDATE_SECRET'),
    cronSecret: str('CRON_SECRET'),
  },

  notify: {
    /** Saluran pengiriman; 'off' mematikan seluruh notifikasi. */
    channel: str('NOTIFY_CHANNEL', 'off').trim().toLowerCase(),
    /** Peristiwa yang dinotifikasi, dipisah koma. */
    events: str('NOTIFY_EVENTS', 'rsvp,wish,envelope')
      .split(',')
      .map((value) => value.trim().toLowerCase())
      .filter(Boolean),
    timeoutMs: int('NOTIFY_TIMEOUT_MS', 8000),
    maxAttempts: int('NOTIFY_MAX_ATTEMPTS', 5),

    webhookUrl: str('NOTIFY_WEBHOOK_URL'),
    webhookSecret: str('NOTIFY_WEBHOOK_SECRET'),

    whatsappPhoneNumberId: str('WHATSAPP_PHONE_NUMBER_ID'),
    whatsappToken: str('WHATSAPP_ACCESS_TOKEN'),
    whatsappTemplate: str('WHATSAPP_TEMPLATE_NAME'),
    whatsappTemplateLang: str('WHATSAPP_TEMPLATE_LANG', 'id'),
    whatsappApiVersion: str('WHATSAPP_API_VERSION', 'v21.0'),

    fonnteToken: str('FONNTE_TOKEN'),

    // Gateway berbasis chatId (WAHA, whatsapp-web.js, dan turunannya).
    gatewayUrl: str('WHATSAPP_GATEWAY_URL'),
    gatewaySession: str('WHATSAPP_GATEWAY_SESSION', 'default'),
    gatewayApiKey: str('WHATSAPP_GATEWAY_API_KEY'),
    gatewayApiKeyHeader: str('WHATSAPP_GATEWAY_API_KEY_HEADER', 'X-Api-Key'),
    /** Nama field isi pesan; WAHA memakai `text`, sebagian fork memakai `message`. */
    gatewayTextField: str('WHATSAPP_GATEWAY_TEXT_FIELD', 'text'),

    /**
     * Tujuan notifikasi, dipisah koma. Dua bentuk diterima:
     *
     *  - nomor biasa: `+62 812-3456-7890` dirapikan menjadi `6281234567890`;
     *  - JID WhatsApp utuh: `6281234567890@c.us` atau `1203630448@g.us` untuk
     *    grup — dibiarkan apa adanya, karena akhirannya justru yang menentukan
     *    apakah pesan masuk ke chat pribadi atau grup.
     */
    recipients: str('NOTIFY_RECIPIENTS')
      .split(',')
      .map((value) => value.trim())
      .map((value) => (/^\d+@[a-z.]+$/i.test(value) ? value : value.replace(/[^\d]/g, '')))
      .filter(Boolean),
  },

  backup: {
    dir: resolvePath(str('BACKUP_DIR', './data/backups')),
    keep: int('BACKUP_KEEP', 14),
    purgeAfterDays: int('PURGE_AFTER_DAYS', 90),
    proofRetentionDays: int('PROOF_RETENTION_DAYS', 30),
  },
} as const;


/**
 * Dipanggil sekali saat boot produksi. Gagal cepat lebih baik daripada
 * aplikasi hidup dengan secret kosong (mis. sesi admin yang bisa dipalsukan).
 */
export function assertProductionEnv(): void {
  if (!env.isProduction) return;

  const problems: string[] = [];
  const { authSecret, ipHashSalt, revalidateSecret, cronSecret, adminPasswordHash } = env.security;

  if (authSecret.length < 32) problems.push('AUTH_SECRET wajib diisi minimal 32 karakter acak.');
  if (ipHashSalt.length < 8) problems.push('IP_HASH_SALT wajib diisi.');
  if (!revalidateSecret) problems.push('REVALIDATE_SECRET wajib diisi.');
  if (!cronSecret) problems.push('CRON_SECRET wajib diisi.');
  if (!adminPasswordHash.startsWith('$argon2'))
    problems.push('ADMIN_PASSWORD_HASH wajib berisi hash Argon2id (jalankan npm run hash-password).');

  if (problems.length > 0) {
    throw new Error(`Konfigurasi produksi tidak lengkap:\n- ${problems.join('\n- ')}`);
  }
}

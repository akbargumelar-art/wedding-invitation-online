import { defineConfig, devices } from '@playwright/test';
import { rmSync } from 'node:fs';
import path from 'node:path';

/**
 * Konfigurasi E2E.
 *
 * Server diuji dalam mode produksi (`next build` + `next start`) supaya perilaku
 * ISR, cache, dan header sama seperti di VPS. Database diarahkan ke berkas
 * terpisah dan dihapus setiap kali suite dijalankan, agar hitungan rate limit
 * dan data uji tidak terbawa antar-run.
 */
const TEST_DB = path.resolve(process.cwd(), 'data/e2e.db');
const TEST_UPLOADS = path.resolve(process.cwd(), 'data/e2e-uploads');
const TEST_SNAPSHOT = path.resolve(process.cwd(), 'data/e2e-snapshot.json');
const PORT = 3100;
const WEBHOOK_PORT = 3399;
const BASE_URL = `http://127.0.0.1:${PORT}`;

// Berkas konfigurasi ini juga dimuat ulang di setiap proses worker. Pembersihan
// hanya boleh berjalan sekali di proses utama — kalau tidak, worker akan mencoba
// menghapus database yang sedang dipegang server (EBUSY di Windows) sekaligus
// membuang perubahan snapshot yang dibuat tes lain.
if (process.env['TEST_WORKER_INDEX'] === undefined) {
  for (const file of [TEST_DB, `${TEST_DB}-wal`, `${TEST_DB}-shm`, TEST_SNAPSHOT]) {
    rmSync(file, { force: true });
  }
  rmSync(TEST_UPLOADS, { recursive: true, force: true });
}

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: false,
  // Rate limit dihitung per IP; paralelisme akan membuat hasilnya tidak
  // deterministik, jadi suite berjalan satu per satu.
  workers: 1,
  retries: 0,
  reporter: [['list']],
  timeout: 30_000,
  expect: { timeout: 10_000 },

  use: {
    baseURL: BASE_URL,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },

  projects: [
    { name: 'mobile', use: { ...devices['Pixel 5'] } },
  ],

  webServer: {
    command: 'npm run start',
    url: BASE_URL,
    reuseExistingServer: false,
    timeout: 120_000,
    stdout: 'pipe',
    stderr: 'pipe',
    env: {
      PORT: String(PORT),
      NODE_ENV: 'production',
      NEXT_PUBLIC_SITE_URL: BASE_URL,
      DATABASE_PATH: TEST_DB,
      UPLOAD_DIR: TEST_UPLOADS,
      MAX_UPLOAD_BYTES: '2097152',
      ADMIN_USERNAME: 'admin',
      // Hash untuk kata sandi "walimah-dev-2026". Tanda $ di-escape karena
      // pemuat .env Next melakukan ekspansi variabel; lihat unescapeDollar()
      // di src/lib/env.ts.
      ADMIN_PASSWORD_HASH:
        '\\$argon2id\\$v=19\\$m=19456,t=2,p=1\\$4oeef41aE1TrgoceUWwYkw\\$UtlP/FkzE1SKr/cJXF+KevFm42dONYk4B0TxKb0BrsY',
      AUTH_SECRET: 'e2e-auth-secret-yang-cukup-panjang-32-karakter',
      IP_HASH_SALT: 'e2e-ip-salt',
      REVALIDATE_SECRET: 'e2e-revalidate-secret',
      CRON_SECRET: 'e2e-cron-secret',
      BACKUP_DIR: path.resolve(process.cwd(), 'data/e2e-backups'),
      // Kosong = jalur "Sheets tidak tersedia", persis kondisi yang harus
      // ditangani snapshot fallback (skenario 10 Lampiran C).
      GOOGLE_SHEET_ID: '',
      SHEET_SNAPSHOT_PATH: TEST_SNAPSHOT,
      SHEET_CACHE_TTL: '60',

      // Notifikasi diarahkan ke penerima lokal yang dijalankan 05-notify.spec.ts.
      // Sebelum penerima itu hidup, pengiriman gagal dengan ECONNREFUSED — dan
      // itu memang disengaja: antrean harus bertahan saat gateway mati.
      NOTIFY_CHANNEL: 'webhook',
      NOTIFY_EVENTS: 'rsvp,wish,envelope,visit',
      NOTIFY_WEBHOOK_URL: `http://127.0.0.1:${WEBHOOK_PORT}/hook`,
      NOTIFY_WEBHOOK_SECRET: 'e2e-webhook-secret',
      NOTIFY_TIMEOUT_MS: '3000',
      NOTIFY_MAX_ATTEMPTS: '5',
    },
  },
});

export { BASE_URL, TEST_SNAPSHOT, WEBHOOK_PORT };

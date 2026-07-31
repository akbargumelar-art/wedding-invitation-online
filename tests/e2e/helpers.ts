import Database from 'better-sqlite3';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import type { APIRequestContext, Page } from '@playwright/test';

export const ADMIN_USERNAME = 'admin';
export const ADMIN_PASSWORD = 'walimah-dev-2026';
export const REVALIDATE_SECRET = 'e2e-revalidate-secret';
export const CRON_SECRET = 'e2e-cron-secret';

const SEED_PATH = path.resolve(process.cwd(), 'data/seed.json');
const DB_PATH = path.resolve(process.cwd(), 'data/e2e.db');

type Matrix = string[][];

/**
 * Isi undangan tinggal di SQLite, jadi "mengedit di dashboard" disimulasikan
 * dengan menulis langsung ke tabelnya lalu memaksa revalidasi.
 *
 * Menulis lewat database dan bukan lewat API dashboard disengaja: yang diuji di
 * berkas-berkas ini adalah halaman tamu, dan jalur bacanya (parser + cache)
 * sama persis dari mana pun barisnya ditulis. Jalur tulis dashboard punya
 * pengujiannya sendiri di 03-admin.spec.ts.
 */
function openDb(): Database.Database {
  const db = new Database(DB_PATH);
  // Server sedang memegang database yang sama dalam mode WAL.
  db.pragma('busy_timeout = 5000');
  return db;
}

/** True bila server sudah membuat tabel konten DAN mengisinya dari berkas seed. */
function contentReady(): boolean {
  const db = openDb();
  try {
    const table = db
      .prepare(`SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'site_config'`)
      .get();
    if (!table) return false;

    const { n } = db.prepare(`SELECT COUNT(*) AS n FROM site_config`).get() as { n: number };
    return n > 0;
  } finally {
    db.close();
  }
}

/**
 * Pastikan database sudah dibuat dan berisi konten awal sebelum tes menulis ke
 * dalamnya.
 *
 * Dua jebakan sekaligus ditutup di sini, dan keduanya bergejala sama —
 * `no such table: site_config` atau halaman yang tampil nyaris kosong:
 *
 *  - `/` dan halaman tamu yang terdaftar sudah dipra-render saat build, jadi
 *    permintaannya dilayani dari berkas statis tanpa menyentuh server. Slug
 *    asing memaksa render on-demand, dan render itulah yang memanggil
 *    `getContent()`.
 *  - `getContent()` sendiri dibungkus `unstable_cache`, dan entri hasil build
 *    ikut terbawa di `.next/cache`. Server yang baru menyala karena itu dapat
 *    menjawab tanpa pernah membuka database uji. Revalidasi lebih dulu yang
 *    membuang entri itu.
 *
 * Hanya dijalankan sekali per suite: `contentReady()` menjaga agar kuota
 * `/api/revalidate` (20 per jam) tidak terpakai percuma.
 */
async function ensureSeeded(request: APIRequestContext): Promise<void> {
  if (contentReady()) return;

  await revalidate(request);

  const response = await request.get('/to/pemanasan-e2e');
  if (!response.ok()) {
    throw new Error(`Pemanasan konten gagal: ${response.status()}`);
  }

  if (!contentReady()) {
    throw new Error('Server tidak menyemai isi undangan setelah permintaan pemanasan.');
  }
}

async function revalidate(request: APIRequestContext): Promise<void> {
  const response = await request.post('/api/revalidate', {
    data: { secret: REVALIDATE_SECRET },
  });

  if (!response.ok()) {
    throw new Error(`Revalidasi gagal: ${response.status()} ${await response.text()}`);
  }
}

/** Peta kunci/nilai tab Config bawaan repo — dasar pemulihan setelah pengujian. */
function seedConfigMap(): Record<string, string> {
  const seed = JSON.parse(readFileSync(SEED_PATH, 'utf8')) as { config: Matrix };
  const map: Record<string, string> = {};

  for (const row of seed.config) {
    const key = (row[0] ?? '').trim();
    if (!key || key === 'key') continue;
    map[key] = (row[1] ?? '').trim();
  }

  return map;
}

export type GalleryEntry = { url: string; caption: string };

/**
 * Foto galeri untuk pengujian.
 *
 * Konten yang dikirim ke tamu tidak memuat galeri, jadi `data/seed.json` tidak
 * punya baris foto. Fiturnya sendiri masih ada dan masih dikirim ke produksi —
 * mempelai tinggal menambah foto lewat dashboard untuk menyalakannya — sehingga
 * tesnya menyemai datanya sendiri di sini. Kode yang dikirim tanpa tes lebih
 * berbahaya daripada kode yang dihapus.
 */
export const GALLERY_ROWS: GalleryEntry[] = Array.from({ length: 6 }, (_, index) => ({
  url: `/img/galeri-0${index + 1}.png`,
  caption: 'Foto dummy — ganti lewat dashboard',
}));

/**
 * Ubah isi undangan, lalu paksa halaman tamu memuat ulang.
 *
 * Seluruh perubahan sengaja dikumpulkan menjadi SATU panggilan revalidasi.
 * `/api/revalidate` dibatasi 20 permintaan per jam, dan suite ini menyentuhnya
 * belasan kali — memanggilnya sekali per tabel akan membuat berkas uji terakhir
 * gagal dengan 429, kegagalan yang tampak seperti bug aplikasi padahal murni
 * ulah harness.
 */
export async function applyContentOverride(
  request: APIRequestContext,
  overrides: { config?: Record<string, string>; gallery?: GalleryEntry[] },
): Promise<void> {
  await ensureSeeded(request);

  const db = openDb();
  try {
    if (overrides.config) {
      const upsert = db.prepare(
        `INSERT INTO site_config (key, value, updated_at) VALUES (?, ?, datetime('now'))
         ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
      );

      for (const [key, value] of Object.entries(overrides.config)) upsert.run(key, value);
    }

    if (overrides.gallery) {
      db.prepare(`DELETE FROM gallery`).run();

      const insert = db.prepare(
        `INSERT INTO gallery (url, caption, urutan, tampil, created_at, updated_at)
         VALUES (?, ?, ?, 1, datetime('now'), datetime('now'))`,
      );

      overrides.gallery.forEach((entry, index) =>
        insert.run(entry.url, entry.caption, index + 1),
      );
    }
  } finally {
    db.close();
  }

  await revalidate(request);
}

/** Bentuk ringkas untuk kasus yang hanya mengubah pengaturan. */
export async function applyConfigOverride(
  request: APIRequestContext,
  overrides: Record<string, string>,
): Promise<void> {
  await applyContentOverride(request, { config: overrides });
}

/** Ganti seluruh isi galeri dengan daftar yang diberikan. */
export async function setGalleryRows(
  request: APIRequestContext,
  entries: GalleryEntry[],
): Promise<void> {
  await applyContentOverride(request, { gallery: entries });
}

/**
 * Kembalikan konten ke data seed apa adanya.
 *
 * Setelah revalidasi, halaman ISR baru benar-benar dibangun ulang pada request
 * berikutnya (stale-while-revalidate). Dua permintaan pemanasan memastikan versi
 * bersih sudah tersimpan sebelum suite berakhir, sehingga cache di `.next` tidak
 * mewarisi konfigurasi uji.
 */
export async function resetConfig(request: APIRequestContext): Promise<void> {
  await applyContentOverride(request, { config: seedConfigMap(), gallery: [] });

  await request.get('/to/budi-santoso');
  await request.get('/to/budi-santoso');
}

/** Singkirkan sampul dan tunggu halaman pertama undangan dapat diakses. */
export async function openCover(page: Page): Promise<void> {
  await page.getByRole('button', { name: 'Buka Undangan' }).click();
  await page.locator('#salam').waitFor({ state: 'visible' });
}

/**
 * Pindah ke salah satu tampilan lewat tombol yang dilihat tamu, bukan lewat
 * localStorage — jadi jalur yang diuji sama dengan yang dipakai orang sungguhan.
 */
export async function setView(page: Page, view: 'book' | 'scroll'): Promise<void> {
  const current = await page.evaluate(() => document.body.dataset['view']);

  if (current !== view) {
    const label = view === 'scroll' ? 'Mode gulir' : 'Mode buku';
    await page.getByRole('button', { name: label }).click();
  }

  await page.waitForFunction((target) => document.body.dataset['view'] === target, view);
}

/**
 * Buka undangan dalam tampilan gulir.
 *
 * Mode buku adalah tampilan bawaan bagi tamu, tetapi sebagian besar berkas uji
 * memeriksa isi seluruh seksi sekaligus. Menyetel tampilan gulir di sini menjaga
 * berkas-berkas itu tetap ringkas; mode buku diuji tersendiri di 08-book.spec.ts.
 */
export async function openInvitation(page: Page): Promise<void> {
  await openCover(page);
  await setView(page, 'scroll');
}

export async function loginAsAdmin(page: Page): Promise<void> {
  await page.goto('/admin/login');
  await page.getByLabel('Nama pengguna').fill(ADMIN_USERNAME);
  await page.getByLabel('Kata sandi').fill(ADMIN_PASSWORD);
  await page.getByRole('button', { name: 'Masuk' }).click();
  await page.waitForURL('**/admin');
}

/**
 * Atur integrasi WAHA langsung di database.
 *
 * Ditulis lewat database dan bukan lewat dashboard karena yang diuji berkas ini
 * adalah perilaku pengiriman dan penerimaan pesan, bukan formulirnya. Nilai
 * pengaturan dibaca ulang dari database pada setiap pemakaian, jadi server
 * langsung memakainya tanpa perlu restart.
 */
export async function configureWaha(settings: {
  baseUrl: string;
  secret: string;
  minDelaySeconds: number;
  maxDelaySeconds: number;
}): Promise<void> {
  const db = openDb();
  try {
    const upsert = db.prepare(
      `INSERT INTO integrations (key, value, updated_at) VALUES (?, ?, datetime('now'))
       ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
    );

    upsert.run('waha_enabled', 'TRUE');
    upsert.run('waha_base_url', settings.baseUrl);
    upsert.run('waha_session', 'default');
    upsert.run('waha_api_key', 'e2e-waha-key');
    upsert.run('waha_webhook_secret', settings.secret);
    upsert.run('waha_accept_replies', 'TRUE');
    upsert.run('waha_auto_reply', 'TRUE');
    upsert.run('waha_min_delay', String(settings.minDelaySeconds));
    upsert.run('waha_max_delay', String(settings.maxDelaySeconds));
    // Jadwal kirim dinolkan supaya pesan pertama tidak menunggu sisa jeda dari
    // pengujian sebelumnya.
    upsert.run('waha_next_send_at', '0');
  } finally {
    db.close();
  }
}

/** Tambahkan tamu beserta nomor WhatsApp-nya, langsung di database. */
export async function addGuestWithPhone(
  nama: string,
  slug: string,
  telepon: string,
): Promise<number> {
  const db = openDb();
  try {
    const result = db
      .prepare(
        `INSERT INTO guests (nama, slug, kategori, telepon, created_at, updated_at)
         VALUES (?, ?, '', ?, datetime('now'), datetime('now'))
         ON CONFLICT(slug) DO UPDATE SET telepon = excluded.telepon`,
      )
      .run(nama, slug, telepon);

    if (result.lastInsertRowid) return Number(result.lastInsertRowid);

    const row = db.prepare(`SELECT id FROM guests WHERE slug = ?`).get(slug) as { id: number };
    return row.id;
  } finally {
    db.close();
  }
}

/** Kosongkan antrean pengiriman antar-pengujian. */
export async function clearOutbox(): Promise<void> {
  const db = openDb();
  try {
    db.prepare(`DELETE FROM invitation_outbox`).run();
    db.prepare(`DELETE FROM inbound_messages`).run();
  } finally {
    db.close();
  }
}

/** Pindah ke salah satu tab dashboard admin. */
export async function openAdminTab(page: Page, label: string): Promise<void> {
  await page.getByRole('tab', { name: label }).click();
}

/** Berkas PNG valid berukuran tertentu, untuk menguji batas upload. */
export function pngBuffer(totalBytes: number): Buffer {
  const signature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  return Buffer.concat([signature, Buffer.alloc(Math.max(0, totalBytes - signature.length), 0x22)]);
}

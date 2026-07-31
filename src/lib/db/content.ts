import { getDb, transaction } from './index';
import { nowIso } from '@/lib/date';
import { slugify } from '@/lib/text';
import type { ContentRecords } from '@/lib/content/types';

/**
 * Baca–tulis isi undangan di SQLite.
 *
 * Modul ini menggantikan pembacaan Google Sheet: dashboard admin menulis ke
 * sini, dan `getContent()` membacanya. Dua bentuk keluaran sengaja disediakan
 * untuk tiap tabel:
 *
 *  - `readContentRecords()` — `Record<string, string>` berkunci nama kolom,
 *    langsung dapat dicerna parser di `@/lib/content/parse`;
 *  - `list*()` — baris bertipe rapi untuk form dashboard.
 *
 * Keduanya berasal dari kueri yang sama, jadi tidak ada kemungkinan admin
 * melihat data yang berbeda dari yang dilihat tamu.
 */

const bool = (value: unknown): boolean => value === 1 || value === true;
const flag = (value: boolean): number => (value ? 1 : 0);

/** Semua nilai dijadikan string karena parser bekerja pada teks apa adanya. */
function toRecord(row: Record<string, unknown>): Record<string, string> {
  const record: Record<string, string> = {};
  for (const [key, value] of Object.entries(row)) {
    record[key] = value === null || value === undefined ? '' : String(value);
  }
  return record;
}

// -----------------------------------------------------------------------------
// Config
// -----------------------------------------------------------------------------

export function readConfigMap(): Record<string, string> {
  const rows = getDb().prepare(`SELECT key, value FROM site_config`).all() as Array<{
    key: string;
    value: string;
  }>;

  const map: Record<string, string> = {};
  for (const row of rows) map[row.key] = row.value;
  return map;
}

/**
 * Tulis sebagian atau seluruh pengaturan dalam satu transaksi.
 *
 * Kunci yang tidak disebut dibiarkan apa adanya, bukan dihapus — sehingga satu
 * form yang hanya memuat sebagian kolom (mis. tab Venue) tidak mengosongkan
 * kolom yang diatur form lain.
 */
export function writeConfigMap(map: Record<string, string>): void {
  const at = nowIso();

  transaction((db) => {
    const upsert = db.prepare(
      `INSERT INTO site_config (key, value, updated_at) VALUES (?, ?, ?)
       ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
    );
    for (const [key, value] of Object.entries(map)) upsert.run(key, value, at);
  });
}

export function isContentInitialized(): boolean {
  const row = getDb().prepare(`SELECT COUNT(*) AS n FROM site_config`).get() as { n: number };
  return row.n > 0;
}

// -----------------------------------------------------------------------------
// Jadwal
// -----------------------------------------------------------------------------

export type ScheduleInput = {
  acara: string;
  tanggal: string;
  jamMulai: string;
  jamSelesai: string;
  zona: string;
  lokasi: string;
  catatan: string;
  gmapsUrl: string;
  tampil: boolean;
};

export type ScheduleRow = ScheduleInput & { id: number };

const SCHEDULE_ORDER = `ORDER BY tanggal, jam_mulai, id`;

export function listSchedule(): ScheduleRow[] {
  const rows = getDb()
    .prepare(`SELECT * FROM schedule ${SCHEDULE_ORDER}`)
    .all() as Array<Record<string, unknown>>;

  return rows.map((row) => ({
    id: Number(row['id']),
    acara: String(row['acara'] ?? ''),
    tanggal: String(row['tanggal'] ?? ''),
    jamMulai: String(row['jam_mulai'] ?? ''),
    jamSelesai: String(row['jam_selesai'] ?? ''),
    zona: String(row['zona'] ?? ''),
    lokasi: String(row['lokasi'] ?? ''),
    catatan: String(row['catatan'] ?? ''),
    gmapsUrl: String(row['gmaps_url'] ?? ''),
    tampil: bool(row['tampil']),
  }));
}

export function createSchedule(input: ScheduleInput): number {
  const result = getDb()
    .prepare(
      `INSERT INTO schedule
         (acara, tanggal, jam_mulai, jam_selesai, zona, lokasi, catatan, gmaps_url, tampil, created_at, updated_at)
       VALUES (@acara, @tanggal, @jamMulai, @jamSelesai, @zona, @lokasi, @catatan, @gmapsUrl, @tampil, @at, @at)`,
    )
    .run({ ...input, tampil: flag(input.tampil), at: nowIso() });

  return Number(result.lastInsertRowid);
}

export function updateSchedule(id: number, input: ScheduleInput): boolean {
  const result = getDb()
    .prepare(
      `UPDATE schedule SET
         acara = @acara, tanggal = @tanggal, jam_mulai = @jamMulai, jam_selesai = @jamSelesai,
         zona = @zona, lokasi = @lokasi, catatan = @catatan, gmaps_url = @gmapsUrl,
         tampil = @tampil, updated_at = @at
       WHERE id = @id`,
    )
    .run({ ...input, id, tampil: flag(input.tampil), at: nowIso() });

  return result.changes > 0;
}

export function deleteSchedule(id: number): boolean {
  return getDb().prepare(`DELETE FROM schedule WHERE id = ?`).run(id).changes > 0;
}

// -----------------------------------------------------------------------------
// Galeri
// -----------------------------------------------------------------------------

export type GalleryInput = { url: string; caption: string; tampil: boolean };
export type GalleryRow = GalleryInput & { id: number; urutan: number };

export function listGallery(): GalleryRow[] {
  const rows = getDb()
    .prepare(`SELECT * FROM gallery ORDER BY urutan, id`)
    .all() as Array<Record<string, unknown>>;

  return rows.map((row) => ({
    id: Number(row['id']),
    url: String(row['url'] ?? ''),
    caption: String(row['caption'] ?? ''),
    urutan: Number(row['urutan'] ?? 0),
    tampil: bool(row['tampil']),
  }));
}

/** Foto baru selalu masuk ke urutan paling belakang. */
export function createGallery(input: GalleryInput): number {
  return transaction((db) => {
    const max = db.prepare(`SELECT COALESCE(MAX(urutan), 0) AS n FROM gallery`).get() as {
      n: number;
    };

    const result = db
      .prepare(
        `INSERT INTO gallery (url, caption, urutan, tampil, created_at, updated_at)
         VALUES (@url, @caption, @urutan, @tampil, @at, @at)`,
      )
      .run({ ...input, urutan: max.n + 1, tampil: flag(input.tampil), at: nowIso() });

    return Number(result.lastInsertRowid);
  });
}

export function updateGallery(id: number, input: GalleryInput): boolean {
  const result = getDb()
    .prepare(
      `UPDATE gallery SET url = @url, caption = @caption, tampil = @tampil, updated_at = @at
       WHERE id = @id`,
    )
    .run({ ...input, id, tampil: flag(input.tampil), at: nowIso() });

  return result.changes > 0;
}

export function deleteGallery(id: number): boolean {
  return getDb().prepare(`DELETE FROM gallery WHERE id = ?`).run(id).changes > 0;
}

/**
 * Tulis ulang urutan seluruh galeri sesuai daftar id yang dikirim.
 *
 * Menerima daftar utuh (bukan "pindahkan id X ke posisi N") supaya hasil akhir
 * tidak bergantung pada urutan sampainya beberapa request drag-and-drop.
 */
export function reorderGallery(ids: number[]): void {
  const at = nowIso();

  transaction((db) => {
    const update = db.prepare(`UPDATE gallery SET urutan = ?, updated_at = ? WHERE id = ?`);
    ids.forEach((id, index) => update.run(index + 1, at, id));
  });
}

// -----------------------------------------------------------------------------
// Rekening
// -----------------------------------------------------------------------------

export type AccountInput = { bank: string; nomor: string; atasNama: string; tampil: boolean };
export type AccountRow = AccountInput & { id: number; urutan: number };

export function listAccounts(): AccountRow[] {
  const rows = getDb()
    .prepare(`SELECT * FROM bank_accounts ORDER BY urutan, id`)
    .all() as Array<Record<string, unknown>>;

  return rows.map((row) => ({
    id: Number(row['id']),
    bank: String(row['bank'] ?? ''),
    nomor: String(row['nomor'] ?? ''),
    atasNama: String(row['atas_nama'] ?? ''),
    urutan: Number(row['urutan'] ?? 0),
    tampil: bool(row['tampil']),
  }));
}

export function createAccount(input: AccountInput): number {
  return transaction((db) => {
    const max = db.prepare(`SELECT COALESCE(MAX(urutan), 0) AS n FROM bank_accounts`).get() as {
      n: number;
    };

    const result = db
      .prepare(
        `INSERT INTO bank_accounts (bank, nomor, atas_nama, urutan, tampil, created_at, updated_at)
         VALUES (@bank, @nomor, @atasNama, @urutan, @tampil, @at, @at)`,
      )
      .run({ ...input, urutan: max.n + 1, tampil: flag(input.tampil), at: nowIso() });

    return Number(result.lastInsertRowid);
  });
}

export function updateAccount(id: number, input: AccountInput): boolean {
  const result = getDb()
    .prepare(
      `UPDATE bank_accounts SET
         bank = @bank, nomor = @nomor, atas_nama = @atasNama, tampil = @tampil, updated_at = @at
       WHERE id = @id`,
    )
    .run({ ...input, id, tampil: flag(input.tampil), at: nowIso() });

  return result.changes > 0;
}

export function deleteAccount(id: number): boolean {
  return getDb().prepare(`DELETE FROM bank_accounts WHERE id = ?`).run(id).changes > 0;
}

// -----------------------------------------------------------------------------
// Tamu
// -----------------------------------------------------------------------------

export type GuestInput = { nama: string; slug: string; kategori: string; telepon: string };
export type GuestRow = GuestInput & { id: number };

export function listGuests(): GuestRow[] {
  const rows = getDb()
    .prepare(
      `SELECT id, nama, slug, kategori, telepon FROM guests ORDER BY nama COLLATE NOCASE, id`,
    )
    .all() as Array<Record<string, unknown>>;

  return rows.map((row) => ({
    id: Number(row['id']),
    nama: String(row['nama'] ?? ''),
    slug: String(row['slug'] ?? ''),
    kategori: String(row['kategori'] ?? ''),
    telepon: String(row['telepon'] ?? ''),
  }));
}

/** Cari tamu dari nomor WhatsApp pengirim — dasar pemetaan pesan masuk. */
export function findGuestByPhone(phone: string): GuestRow | null {
  if (!phone) return null;

  const row = getDb()
    .prepare(
      `SELECT id, nama, slug, kategori, telepon FROM guests WHERE telepon = ? ORDER BY id LIMIT 1`,
    )
    .get(phone) as Record<string, unknown> | undefined;

  if (!row) return null;

  return {
    id: Number(row['id']),
    nama: String(row['nama'] ?? ''),
    slug: String(row['slug'] ?? ''),
    kategori: String(row['kategori'] ?? ''),
    telepon: String(row['telepon'] ?? ''),
  };
}

export function countGuests(): number {
  return (getDb().prepare(`SELECT COUNT(*) AS n FROM guests`).get() as { n: number }).n;
}

/** True bila slug sudah dipakai tamu lain (id yang sama tidak dihitung bentrok). */
export function isSlugTaken(slug: string, exceptId?: number): boolean {
  const row = getDb().prepare(`SELECT id FROM guests WHERE slug = ?`).get(slug) as
    | { id: number }
    | undefined;

  return row !== undefined && row.id !== exceptId;
}

export function createGuest(input: GuestInput): number {
  const result = getDb()
    .prepare(
      `INSERT INTO guests (nama, slug, kategori, telepon, created_at, updated_at)
       VALUES (@nama, @slug, @kategori, @telepon, @at, @at)`,
    )
    .run({ ...input, at: nowIso() });

  return Number(result.lastInsertRowid);
}

export function updateGuest(id: number, input: GuestInput): boolean {
  const result = getDb()
    .prepare(
      `UPDATE guests SET
         nama = @nama, slug = @slug, kategori = @kategori, telepon = @telepon, updated_at = @at
       WHERE id = @id`,
    )
    .run({ ...input, id, at: nowIso() });

  return result.changes > 0;
}

/**
 * Menghapus tamu TIDAK menghapus RSVP, ucapan, atau amplop yang sudah dikirim
 * atas namanya: baris-baris itu adalah catatan peristiwa yang benar-benar
 * terjadi, dan menghilangkannya akan membuat rekap kehadiran salah. Yang hilang
 * hanyalah link undangan pribadinya.
 */
export function deleteGuest(id: number): boolean {
  return getDb().prepare(`DELETE FROM guests WHERE id = ?`).run(id).changes > 0;
}

export type ImportSummary = { inserted: number; updated: number };

/**
 * Impor massal: slug yang sudah ada diperbarui, yang belum ada ditambahkan.
 *
 * Sengaja upsert dan bukan "tolak bila duplikat", karena cara pakai yang lazim
 * adalah menempel ulang seluruh daftar tamu setelah diperbaiki di Excel.
 */
export function importGuests(entries: GuestInput[]): ImportSummary {
  const at = nowIso();

  return transaction((db) => {
    const existing = db.prepare(`SELECT slug FROM guests`).all() as Array<{ slug: string }>;
    const known = new Set(existing.map((row) => row.slug));

    const upsert = db.prepare(
      `INSERT INTO guests (nama, slug, kategori, telepon, created_at, updated_at)
       VALUES (@nama, @slug, @kategori, @telepon, @at, @at)
       ON CONFLICT(slug) DO UPDATE SET
         nama = excluded.nama,
         kategori = excluded.kategori,
         -- Nomor kosong pada baris impor TIDAK menimpa nomor yang sudah ada:
         -- menempel ulang daftar nama tanpa kolom telepon adalah hal biasa, dan
         -- kehilangan seluruh nomor karenanya akan mahal untuk dipulihkan.
         telepon = CASE WHEN excluded.telepon = '' THEN guests.telepon ELSE excluded.telepon END,
         updated_at = excluded.updated_at`,
    );

    let inserted = 0;
    let updated = 0;

    for (const entry of entries) {
      if (known.has(entry.slug)) {
        updated += 1;
      } else {
        inserted += 1;
        known.add(entry.slug);
      }
      upsert.run({ ...entry, at });
    }

    return { inserted, updated };
  });
}

// -----------------------------------------------------------------------------
// Media
// -----------------------------------------------------------------------------

export type MediaRow = {
  fileName: string;
  kind: string;
  bytes: number;
  label: string;
  createdAt: string;
};

export function listMedia(): MediaRow[] {
  const rows = getDb()
    .prepare(`SELECT * FROM media ORDER BY created_at DESC, file_name`)
    .all() as Array<Record<string, unknown>>;

  return rows.map((row) => ({
    fileName: String(row['file_name'] ?? ''),
    kind: String(row['kind'] ?? ''),
    bytes: Number(row['bytes'] ?? 0),
    label: String(row['label'] ?? ''),
    createdAt: String(row['created_at'] ?? ''),
  }));
}

export function recordMedia(fileName: string, kind: string, bytes: number, label: string): void {
  getDb()
    .prepare(
      `INSERT INTO media (file_name, kind, bytes, label, created_at) VALUES (?, ?, ?, ?, ?)`,
    )
    .run(fileName, kind, bytes, label, nowIso());
}

export function forgetMedia(fileName: string): boolean {
  return getDb().prepare(`DELETE FROM media WHERE file_name = ?`).run(fileName).changes > 0;
}

/** URL berkas yang sudah diunggah, dipakai untuk mengisi kolom foto/galeri. */
export function mediaUrl(fileName: string): string {
  return `/media/${fileName}`;
}

// -----------------------------------------------------------------------------
// Pembacaan gabungan
// -----------------------------------------------------------------------------

/** Bentuk yang dicerna parser — kuncinya sama persis dengan nama kolom tabel. */
export function readContentRecords(): ContentRecords {
  const db = getDb();

  const query = (sql: string): Record<string, string>[] =>
    (db.prepare(sql).all() as Array<Record<string, unknown>>).map(toRecord);

  return {
    config: readConfigMap(),
    jadwal: query(`SELECT * FROM schedule ${SCHEDULE_ORDER}`),
    galeri: query(`SELECT * FROM gallery ORDER BY urutan, id`),
    rekening: query(`SELECT * FROM bank_accounts ORDER BY urutan, id`),
    tamu: query(`SELECT nama, slug, kategori FROM guests ORDER BY nama COLLATE NOCASE, id`),
  };
}

/**
 * Isi database dengan konten awal. Hanya berjalan bila `site_config` masih
 * kosong, jadi aman dipanggil pada setiap boot dan tidak pernah menimpa hasil
 * suntingan mempelai di dashboard.
 */
export function seedContentIfEmpty(records: ContentRecords): boolean {
  if (isContentInitialized()) return false;

  const at = nowIso();

  transaction((db) => {
    const config = db.prepare(
      `INSERT INTO site_config (key, value, updated_at) VALUES (?, ?, ?)
       ON CONFLICT(key) DO NOTHING`,
    );
    for (const [key, value] of Object.entries(records.config)) config.run(key, value, at);

    const schedule = db.prepare(
      `INSERT INTO schedule
         (acara, tanggal, jam_mulai, jam_selesai, zona, lokasi, catatan, gmaps_url, tampil, created_at, updated_at)
       VALUES (@acara, @tanggal, @jam_mulai, @jam_selesai, @zona, @lokasi, @catatan, @gmaps_url, @tampil, @at, @at)`,
    );
    for (const row of records.jadwal) {
      if (!row['acara']) continue;
      schedule.run({
        acara: row['acara'] ?? '',
        tanggal: row['tanggal'] ?? '',
        jam_mulai: row['jam_mulai'] ?? '',
        jam_selesai: row['jam_selesai'] ?? '',
        zona: row['zona'] || 'WIB',
        lokasi: row['lokasi'] ?? '',
        catatan: row['catatan'] ?? '',
        gmaps_url: row['gmaps_url'] ?? '',
        tampil: seedFlag(row['tampil']),
        at,
      });
    }

    const gallery = db.prepare(
      `INSERT INTO gallery (url, caption, urutan, tampil, created_at, updated_at)
       VALUES (@url, @caption, @urutan, @tampil, @at, @at)`,
    );
    records.galeri.forEach((row, index) => {
      if (!row['url']) return;
      const urutan = Number.parseInt(row['urutan'] ?? '', 10);
      gallery.run({
        url: row['url'],
        caption: row['caption'] ?? '',
        urutan: Number.isFinite(urutan) ? urutan : index + 1,
        tampil: seedFlag(row['tampil']),
        at,
      });
    });

    const account = db.prepare(
      `INSERT INTO bank_accounts (bank, nomor, atas_nama, urutan, tampil, created_at, updated_at)
       VALUES (@bank, @nomor, @atas_nama, @urutan, @tampil, @at, @at)`,
    );
    records.rekening.forEach((row, index) => {
      if (!row['bank'] || !row['nomor']) return;
      account.run({
        bank: row['bank'],
        nomor: row['nomor'],
        atas_nama: row['atas_nama'] ?? '',
        urutan: index + 1,
        tampil: seedFlag(row['tampil']),
        at,
      });
    });

    const guest = db.prepare(
      `INSERT INTO guests (nama, slug, kategori, created_at, updated_at)
       VALUES (@nama, @slug, @kategori, @at, @at)
       ON CONFLICT(slug) DO NOTHING`,
    );
    for (const row of records.tamu) {
      const nama = row['nama'];
      if (!nama) continue;

      // Slug boleh kosong di berkas seed; diturunkan dari nama seperti dulu.
      const slug = slugify(row['slug'] ?? '') || slugify(nama);
      if (!slug) continue;

      guest.run({ nama, slug, kategori: row['kategori'] ?? '', at });
    }
  });

  return true;
}

/** Kolom `tampil` di berkas seed berupa teks bebas ("TRUE", "ya", kosong). */
function seedFlag(raw: string | undefined): number {
  const value = (raw ?? '').trim().toLowerCase();
  if (value === '') return 1;
  return ['false', 'tidak', 'no', '0', 'n', 'nonaktif', 'sembunyi'].includes(value) ? 0 : 1;
}

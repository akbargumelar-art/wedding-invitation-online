import type { DB } from './index';

/**
 * Perubahan skema yang tidak dapat dinyatakan sebagai CREATE TABLE IF NOT EXISTS.
 *
 * `SCHEMA_SQL` bersifat idempoten karena setiap pernyataannya memakai
 * IF NOT EXISTS — tetapi itu hanya bekerja untuk tabel dan indeks BARU. Menambah
 * kolom ke tabel yang sudah berisi data menuntut ALTER TABLE, dan SQLite tidak
 * punya ALTER TABLE ... ADD COLUMN IF NOT EXISTS.
 *
 * Karena itu kolomnya diperiksa dulu lewat PRAGMA. Hasilnya tetap aman
 * dijalankan pada setiap boot: pemasangan baru mendapatkannya sekali, dan
 * pemasangan lama tidak pernah kehilangan data.
 */

type ColumnPatch = { table: string; column: string; definition: string };

const COLUMNS: ColumnPatch[] = [
  {
    table: 'guests',
    column: 'telepon',
    // Nomor WhatsApp dalam format internasional tanpa tanda plus (mis.
    // 6281234567890). Dinormalkan saat disimpan, lihat normalizePhone().
    definition: `TEXT NOT NULL DEFAULT ''`,
  },
];

function hasColumn(db: DB, table: string, column: string): boolean {
  const rows = db.prepare(`PRAGMA table_info(${table})`).all() as Array<{ name: string }>;
  return rows.some((row) => row.name === column);
}

function tableExists(db: DB, table: string): boolean {
  const row = db
    .prepare(`SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?`)
    .get(table);

  return row !== undefined;
}

export function applyMigrations(db: DB): void {
  for (const patch of COLUMNS) {
    if (!tableExists(db, patch.table)) continue;
    if (hasColumn(db, patch.table, patch.column)) continue;

    db.exec(`ALTER TABLE ${patch.table} ADD COLUMN ${patch.column} ${patch.definition}`);
  }
}

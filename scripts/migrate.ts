/**
 * Terapkan skema SQLite ke DATABASE_PATH.
 *
 *   npm run db:migrate
 *
 * Aplikasi juga menjalankan ini otomatis saat boot; skrip terpisah berguna untuk
 * menyiapkan berkas database di VPS sebelum layanan pertama kali dinyalakan.
 */
// Memuat .env untuk skrip CLI. Harus berada di atas impor lain yang membaca
// env, karena impor ESM dievaluasi sesuai urutan penulisan.
import '../src/lib/dotenv';
import { getDb } from '../src/lib/db';
import { env } from '../src/lib/env';

const db = getDb();

const tables = db
  .prepare(`SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name`)
  .all() as Array<{ name: string }>;

console.log(`Database: ${env.db.path}`);
console.log(`Tabel siap (${tables.length}): ${tables.map((t) => t.name).join(', ')}`);

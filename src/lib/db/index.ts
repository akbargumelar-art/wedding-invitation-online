import Database from 'better-sqlite3';
import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { env } from '@/lib/env';
import { logger } from '@/lib/logger';
import { SCHEMA_SQL } from './schema';
import { applyMigrations } from './migrations';

export type DB = Database.Database;

/**
 * Koneksi SQLite tunggal untuk seluruh proses.
 *
 * Mode WAL dipilih supaya pembacaan (daftar ucapan) tidak terblokir oleh
 * penulisan (submit RSVP). Beban tulis aplikasi ini sangat rendah (<500 baris),
 * jadi satu koneksi sinkron sudah lebih dari cukup dan menghindari proses
 * database terpisah di VPS 1 GB.
 *
 * Di dev, Next melakukan hot reload berkali-kali; instance disimpan di
 * globalThis agar tidak membuka puluhan handle ke berkas yang sama.
 */
const globalForDb = globalThis as unknown as { __walimahDb?: DB };

function createConnection(): DB {
  mkdirSync(path.dirname(env.db.path), { recursive: true });

  const db = new Database(env.db.path);

  db.pragma('journal_mode = WAL');
  db.pragma('synchronous = NORMAL');
  db.pragma('foreign_keys = ON');
  // Beri waktu tunggu bila ada penulis lain (mis. skrip backup) memegang lock.
  db.pragma('busy_timeout = 5000');

  db.exec(SCHEMA_SQL);
  // Kolom yang ditambahkan setelah sebuah tabel dipakai di produksi; lihat
  // catatan di migrations.ts kenapa ini tidak bisa ikut SCHEMA_SQL.
  applyMigrations(db);

  logger.info('db.ready', { path: env.db.path });
  return db;
}

export function getDb(): DB {
  if (!globalForDb.__walimahDb) {
    globalForDb.__walimahDb = createConnection();
  }
  return globalForDb.__walimahDb;
}

/** Jalankan beberapa operasi tulis dalam satu transaksi. */
export function transaction<T>(fn: (db: DB) => T): T {
  const db = getDb();
  return db.transaction(() => fn(db))();
}

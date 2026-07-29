import { mkdirSync, readdirSync, statSync, unlinkSync } from 'node:fs';
import path from 'node:path';
import { getDb } from '@/lib/db';
import { env } from '@/lib/env';
import { logger } from '@/lib/logger';
import { clearProofFile, listExpiredProofs } from '@/lib/db/envelope';
import { deleteProofFile } from '@/lib/uploads';
import { pruneRateLimits } from '@/lib/rate-limit';

const BACKUP_PREFIX = 'walimah-';
const BACKUP_SUFFIX = '.db';

export type BackupResult = { file: string; bytes: number; removed: string[] };

/**
 * Backup harian (US-16).
 *
 * `VACUUM INTO` menghasilkan satu berkas SQLite yang konsisten tanpa perlu
 * menghentikan aplikasi — jauh lebih aman daripada menyalin app.db mentah
 * yang bisa tertangkap di tengah transaksi WAL.
 */
export function runBackup(): BackupResult {
  mkdirSync(env.backup.dir, { recursive: true });

  const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const fileName = `${BACKUP_PREFIX}${stamp}${BACKUP_SUFFIX}`;
  const fullPath = path.join(env.backup.dir, fileName);

  getDb().exec(`VACUUM INTO '${fullPath.replace(/'/g, "''")}'`);

  const removed = pruneOldBackups(env.backup.keep);
  const bytes = statSync(fullPath).size;

  logger.info('backup.completed', { file: fileName, bytes, removed: removed.length });
  return { file: fileName, bytes, removed };
}

/** Simpan hanya N versi terbaru (default 14). */
export function pruneOldBackups(keep: number): string[] {
  let entries: string[];
  try {
    entries = readdirSync(env.backup.dir);
  } catch {
    return [];
  }

  const backups = entries
    .filter((name) => name.startsWith(BACKUP_PREFIX) && name.endsWith(BACKUP_SUFFIX))
    .sort()
    .reverse();

  const excess = backups.slice(Math.max(0, keep));

  for (const name of excess) {
    try {
      unlinkSync(path.join(env.backup.dir, name));
    } catch (error) {
      logger.warn('backup.prune_failed', { error, file: name });
    }
  }

  return excess;
}

/**
 * Hapus bukti transfer yang sudah melewati masa retensi (PRD §4.5).
 * Barisnya tetap ada; hanya berkas gambar dan referensinya yang dihapus.
 */
export function purgeExpiredProofs(): number {
  const expired = listExpiredProofs(env.backup.proofRetentionDays);

  for (const row of expired) {
    if (row.proof_file) deleteProofFile(row.proof_file);
    clearProofFile(row.id);
  }

  if (expired.length > 0) logger.info('proofs.purged', { count: expired.length });
  return expired.length;
}

/** Perawatan rutin yang menyertai backup harian. */
export function runMaintenance(): { proofsPurged: number; rateLimitRowsPruned: number } {
  return {
    proofsPurged: purgeExpiredProofs(),
    rateLimitRowsPruned: pruneRateLimits(),
  };
}

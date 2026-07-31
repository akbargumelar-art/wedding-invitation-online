import { copyFileSync, existsSync, mkdirSync, readdirSync, statSync, unlinkSync } from 'node:fs';
import path from 'node:path';
import { getDb } from '@/lib/db';
import { env } from '@/lib/env';
import { logger } from '@/lib/logger';
import { clearProofFile, listExpiredProofs } from '@/lib/db/envelope';
import { deleteProofFile } from '@/lib/uploads';
import { pruneRateLimits } from '@/lib/rate-limit';

const BACKUP_PREFIX = 'walimah-';
const BACKUP_SUFFIX = '.db';

export type BackupResult = {
  file: string;
  bytes: number;
  removed: string[];
  mediaCopied: number;
};

/**
 * Backup harian (US-16).
 *
 * `VACUUM INTO` menghasilkan satu berkas SQLite yang konsisten tanpa perlu
 * menghentikan aplikasi — jauh lebih aman daripada menyalin app.db mentah
 * yang bisa tertangkap di tengah transaksi WAL.
 *
 * Sejak isi undangan pindah ke database, satu berkas hasil VACUUM sudah memuat
 * seluruh teks, jadwal, dan daftar tamu. Yang tidak ikut hanyalah berkas gambar,
 * karena itu ia disalin terpisah oleh `mirrorMedia()`.
 */
export function runBackup(): BackupResult {
  mkdirSync(env.backup.dir, { recursive: true });

  const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const fileName = `${BACKUP_PREFIX}${stamp}${BACKUP_SUFFIX}`;
  const fullPath = path.join(env.backup.dir, fileName);

  getDb().exec(`VACUUM INTO '${fullPath.replace(/'/g, "''")}'`);

  const removed = pruneOldBackups(env.backup.keep);
  const mediaCopied = mirrorMedia();
  const bytes = statSync(fullPath).size;

  logger.info('backup.completed', { file: fileName, bytes, removed: removed.length, mediaCopied });
  return { file: fileName, bytes, removed, mediaCopied };
}

/**
 * Salin gambar undangan yang belum ada di direktori backup.
 *
 * Sengaja berupa cermin tunggal, bukan salinan berversi seperti database: nama
 * berkasnya UUID dan isinya tidak pernah berubah setelah diunggah, sehingga
 * versi kedua tidak akan pernah berbeda — sementara 14 salinan gambar akan
 * memenuhi disk VPS 1 GB tanpa memberi perlindungan tambahan apa pun.
 *
 * Berkas yang sudah dihapus dari MEDIA_DIR sengaja DIBIARKAN di cermin ini.
 * Justru penghapusan yang tidak disengaja adalah kejadian yang paling butuh
 * dipulihkan, dan ukurannya terlalu kecil untuk dipersoalkan.
 */
export function mirrorMedia(): number {
  const target = path.join(env.backup.dir, 'media');

  let names: string[];
  try {
    names = readdirSync(env.uploads.mediaDir);
  } catch {
    // Belum ada satu pun gambar yang diunggah.
    return 0;
  }

  mkdirSync(target, { recursive: true });

  let copied = 0;
  for (const name of names) {
    const destination = path.join(target, name);
    if (existsSync(destination)) continue;

    try {
      copyFileSync(path.join(env.uploads.mediaDir, name), destination);
      copied += 1;
    } catch (error) {
      logger.warn('backup.media_copy_failed', { error, file: name });
    }
  }

  return copied;
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

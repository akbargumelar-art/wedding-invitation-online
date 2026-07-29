/**
 * Backup manual di luar cron.
 *
 *   npm run backup
 *
 * Cron produksi memanggil POST /api/cron/backup (lihat Lampiran E); skrip ini
 * berguna untuk backup ad-hoc, misalnya tepat sebelum menyebar link undangan.
 */
// Memuat .env untuk skrip CLI. Harus berada di atas impor lain yang membaca
// env, karena impor ESM dievaluasi sesuai urutan penulisan.
import '../src/lib/dotenv';
import { runBackup, runMaintenance } from '../src/lib/backup';
import { env } from '../src/lib/env';

const backup = runBackup();
const maintenance = runMaintenance();

console.log(`\nBackup dibuat: ${backup.file} (${(backup.bytes / 1024).toFixed(1)} KB)`);
console.log(`Lokasi        : ${env.backup.dir}`);
console.log(`Versi dihapus : ${backup.removed.length} (retensi ${env.backup.keep})`);
console.log(`Bukti kedaluwarsa dihapus: ${maintenance.proofsPurged}`);
console.log(`Baris rate limit dibersihkan: ${maintenance.rateLimitRowsPruned}\n`);

/**
 * Hapus data tamu setelah masa retensi (PRD §4.5 — UU PDP No. 27/2022).
 *
 *   npm run purge -- --dry-run     lihat apa yang akan dihapus
 *   npm run purge -- --confirm     jalankan penghapusan
 *
 * Salinan final data tetap ada di Google Sheet pribadi mempelai; yang dihapus
 * di sini adalah salinan di server.
 */
// Memuat .env untuk skrip CLI. Harus berada di atas impor lain yang membaca
// env, karena impor ESM dievaluasi sesuai urutan penulisan.
import '../src/lib/dotenv';
import { readdirSync } from 'node:fs';
import path from 'node:path';
import { getDb } from '../src/lib/db';
import { env } from '../src/lib/env';
import { deleteProofFile, isSafeProofName } from '../src/lib/uploads';

const args = new Set(process.argv.slice(2));
const confirmed = args.has('--confirm');
const cutoffExpr = `-${env.backup.purgeAfterDays} days`;

const db = getDb();

const countBefore = (table: string): number =>
  (
    db
      .prepare(`SELECT COUNT(*) AS n FROM ${table} WHERE created_at < datetime('now', ?)`)
      .get(cutoffExpr) as { n: number }
  ).n;

const targets = ['rsvp', 'wishes', 'envelope_confirmations'] as const;

console.log(`\nRetensi   : ${env.backup.purgeAfterDays} hari`);
console.log(`Database  : ${env.db.path}`);
console.log(`Mode      : ${confirmed ? 'HAPUS PERMANEN' : 'dry-run (tidak ada yang dihapus)'}\n`);

for (const table of targets) {
  console.log(`  ${table.padEnd(24)} ${countBefore(table)} baris melewati masa retensi`);
}

if (!confirmed) {
  console.log('\nJalankan ulang dengan --confirm untuk benar-benar menghapus.\n');
  process.exit(0);
}

// Berkas bukti dihapus lebih dulu, selagi referensinya masih ada di database.
const expiredProofs = db
  .prepare(
    `SELECT proof_file FROM envelope_confirmations
     WHERE proof_file IS NOT NULL AND created_at < datetime('now', ?)`,
  )
  .all(cutoffExpr) as Array<{ proof_file: string }>;

let filesRemoved = 0;
for (const { proof_file } of expiredProofs) {
  if (deleteProofFile(proof_file)) filesRemoved += 1;
}

const purge = db.transaction(() => {
  for (const table of targets) {
    db.prepare(`DELETE FROM ${table} WHERE created_at < datetime('now', ?)`).run(cutoffExpr);
  }
  db.prepare(`DELETE FROM visits WHERE visited_date < date('now', ?)`).run(cutoffExpr);
  db.prepare(`DELETE FROM rate_limits`).run();
});

purge();
db.exec('VACUUM');

// Sapu bersih berkas yatim yang tidak lagi punya baris di database.
const referenced = new Set(
  (
    db
      .prepare(`SELECT proof_file FROM envelope_confirmations WHERE proof_file IS NOT NULL`)
      .all() as Array<{ proof_file: string }>
  ).map((row) => row.proof_file),
);

let orphansRemoved = 0;
try {
  for (const name of readdirSync(env.uploads.dir)) {
    if (!isSafeProofName(name) || referenced.has(name)) continue;
    if (deleteProofFile(path.basename(name))) orphansRemoved += 1;
  }
} catch {
  // Direktori upload belum ada — tidak ada yang perlu dibersihkan.
}

console.log(`\nSelesai. Bukti transfer dihapus: ${filesRemoved}, berkas yatim: ${orphansRemoved}.\n`);

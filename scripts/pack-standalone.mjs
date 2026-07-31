/**
 * Lengkapi keluaran `output: standalone` menjadi paket yang benar-benar dapat
 * dijalankan.
 *
 *   node scripts/pack-standalone.mjs
 *
 * Next tidak menyalin `.next/static` dan `public/` ke dalam folder standalone,
 * jadi menjalankan `server.js` apa adanya menghasilkan halaman tanpa CSS dan
 * tanpa gambar. `data/seed.json` ikut disalin karena dibaca saat runtime untuk
 * mengisi database yang masih kosong.
 *
 * Dipakai dua tempat — `deploy/deploy.sh` sebelum rsync ke VPS, dan harness E2E
 * sebelum menyalakan server uji — supaya keduanya tidak pernah berbeda isi.
 */
import { cpSync, mkdirSync, rmSync } from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const standalone = path.join(root, '.next', 'standalone');

for (const target of [path.join(standalone, '.next', 'static'), path.join(standalone, 'public')]) {
  rmSync(target, { recursive: true, force: true });
}

cpSync(path.join(root, '.next', 'static'), path.join(standalone, '.next', 'static'), {
  recursive: true,
});
cpSync(path.join(root, 'public'), path.join(standalone, 'public'), { recursive: true });

mkdirSync(path.join(standalone, 'data'), { recursive: true });
cpSync(path.join(root, 'data', 'seed.json'), path.join(standalone, 'data', 'seed.json'));

console.log('Paket standalone siap di .next/standalone');

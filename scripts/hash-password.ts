/**
 * Buat hash Argon2id untuk kata sandi admin.
 *
 *   npm run hash-password -- "kata-sandi-anda"
 *
 * Salin keluarannya ke ADMIN_PASSWORD_HASH. Kata sandi mentah tidak pernah
 * disimpan di mana pun — hanya hash-nya yang masuk berkas env.
 */
import { hash } from '@node-rs/argon2';

const password = process.argv[2];

if (!password) {
  console.error('Penggunaan: npm run hash-password -- "kata-sandi-anda"');
  process.exit(1);
}

if (password.length < 12) {
  console.error('Kata sandi minimal 12 karakter. Gunakan frasa panjang yang mudah Anda ingat.');
  process.exit(1);
}

async function main(): Promise<void> {
  // Parameter mengikuti profil OWASP untuk Argon2id: 19 MiB memori, 2 iterasi.
  const digest = await hash(password as string, {
    memoryCost: 19_456,
    timeCost: 2,
    parallelism: 1,
  });

  // Tanda `$` di-escape: pemuat .env Next melakukan ekspansi variabel dan akan
  // merusak hash mentah. Aplikasi membuka escape ini kembali saat membaca env,
  // sehingga baris yang sama juga benar untuk systemd EnvironmentFile.
  const escaped = digest.replace(/\$/g, '\\$');

  console.log('\nTambahkan baris berikut ke .env.local / /etc/walimah/env:\n');
  console.log(`ADMIN_PASSWORD_HASH=${escaped}\n`);
  console.log('(Tanda \\$ memang disengaja — jangan dihapus.)\n');
}

void main();

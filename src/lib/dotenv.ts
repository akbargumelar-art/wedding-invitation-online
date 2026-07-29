import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';

/**
 * Pemuat .env minimal tanpa dependensi — HANYA untuk skrip CLI.
 *
 * Next.js memuat .env.local/.env sendiri, jadi ini cuma dibutuhkan skrip yang
 * dijalankan lewat tsx di luar runtime Next (`npm run backup`, `npm run purge`,
 * migrasi, hash-password).
 *
 * Sengaja dipisah dari [env.ts](env.ts), dan tidak boleh diimpor dari sana.
 * `env.ts` ikut dipakai `instrumentation.ts`, yang dikompilasi Next untuk runtime
 * **edge** juga. Di edge tidak ada `node:fs`, dan begitu modul ini masuk grafik
 * impornya `next dev` mati dengan:
 *
 *     UnhandledSchemeError: Reading from "node:fs" is not handled by plugins
 *
 * Penjaga `NEXT_RUNTIME !== 'nodejs'` di instrumentation tidak menolong: itu
 * penjaga saat berjalan, sedangkan webpack tetap ikut membundel modulnya.
 *
 * Mengimpor berkas ini sudah memuat .env sebagai efek samping:
 *
 *     import '../src/lib/dotenv';
 *     import { env } from '../src/lib/env';
 *
 * Urutannya penting — impor ESM dievaluasi sesuai urutan penulisan, jadi baris
 * dotenv harus lebih dulu agar process.env sudah terisi saat env.ts dibaca.
 */
export function loadDotEnvFiles(): void {
  const cwd = process.cwd();
  // Urutan sengaja: .env.local menang atas .env karena dimuat lebih dulu.
  for (const file of ['.env.local', '.env']) {
    const full = path.join(cwd, file);
    if (!existsSync(full)) continue;

    for (const rawLine of readFileSync(full, 'utf8').split(/\r?\n/)) {
      const line = rawLine.trim();
      if (!line || line.startsWith('#')) continue;

      const eq = line.indexOf('=');
      if (eq === -1) continue;

      const key = line.slice(0, eq).trim();
      if (!key || key in process.env) continue;

      let value = line.slice(eq + 1).trim();
      if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1);
      }
      process.env[key] = value;
    }
  }
}

loadDotEnvFiles();

import { defineConfig } from 'vitest/config';
import path from 'node:path';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/unit/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      include: ['src/lib/**/*.ts'],
      // Lapisan yang menyentuh I/O nyata (SQLite, Sheets API, filesystem) diuji
      // lewat tes integrasi/E2E, bukan unit — mengecualikannya menjaga angka
      // coverage tetap bermakna.
      exclude: [
        // Hanya deklarasi tipe — tidak ada kode yang bisa dieksekusi.
        'src/lib/content/types.ts',
        'src/lib/notify/types.ts',
        // Bergantung pada `after()` dari next/server; diuji lewat E2E
        // (tests/e2e/05-notify.spec.ts) dengan penerima webhook sungguhan.
        'src/lib/notify/index.ts',
        // Pembungkus fetch di browser; dijalankan oleh tes E2E, bukan unit.
        'src/lib/client-api.ts',
        'src/lib/db/**',
        'src/lib/content/sheets.ts',
        'src/lib/content/snapshot.ts',
        'src/lib/content/index.ts',
        'src/lib/api.ts',
        'src/lib/auth.ts',
        'src/lib/backup.ts',
        'src/lib/export.ts',
        'src/lib/admin-data.ts',
        'src/lib/rate-limit.ts',
        'src/lib/logger.ts',
        'src/lib/env.ts',
      ],
      thresholds: { lines: 80, functions: 80, statements: 80 },
    },
  },
  resolve: {
    alias: { '@': path.resolve(__dirname, './src') },
  },
});

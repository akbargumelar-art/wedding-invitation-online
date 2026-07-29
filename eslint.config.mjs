import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { FlatCompat } from '@eslint/eslintrc';

/**
 * Konfigurasi ESLint (flat config).
 *
 * `eslint-config-next` versi 15 masih preset gaya eslintrc, jadi dibungkus
 * `FlatCompat`. Tiga versi di bawah ini terikat satu sama lain dan tidak boleh
 * dinaikkan sendiri-sendiri:
 *
 * - `eslint-config-next` mengikuti versi mayor `next` (keduanya 15.x). Versi 16
 *   adalah flat config native — dibungkus FlatCompat ia jatuh dengan "Converting
 *   circular structure to JSON" — dan membawa aturan era React Compiler yang
 *   menolak pola efek yang dipakai di seluruh komponen ini.
 * - `eslint` ditahan di 9.x. Pada ESLint 10 `context.getFilename()` dihapus,
 *   sedangkan `eslint-plugin-react` 7.37.5 (rilis terbaru, transitif dari
 *   eslint-config-next) masih memanggilnya dan langsung melempar.
 * - `@eslint/eslintrc` wajib dideklarasikan karena berkas ini mengimpornya
 *   langsung; jangan mengandalkan hoisting dari dependensi lain.
 */
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const compat = new FlatCompat({ baseDirectory: __dirname });

const eslintConfig = [
  {
    ignores: [
      '.next/**',
      'node_modules/**',
      'coverage/**',
      'test-results/**',
      'playwright-report/**',
      'next-env.d.ts',
    ],
  },
  ...compat.extends('next/core-web-vitals', 'next/typescript'),
  {
    rules: {
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
    },
  },
];

export default eslintConfig;

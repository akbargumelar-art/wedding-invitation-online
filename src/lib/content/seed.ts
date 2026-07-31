import 'server-only';

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { logger } from '@/lib/logger';
import type { RawContentMatrix } from './types';

/**
 * Konten awal bawaan repo (`data/seed.json`).
 *
 * Dipakai tepat sekali: mengisi database yang masih kosong saat aplikasi
 * pertama kali dijalankan, supaya halaman undangan langsung dapat dirender dan
 * mempelai punya contoh isian untuk disunting di dashboard. Setelah itu
 * database-lah satu-satunya sumber kebenaran; berkas ini tidak dibaca lagi.
 */

const SEED_PATH = path.resolve(process.cwd(), 'data/seed.json');

const EMPTY: RawContentMatrix = { config: [], jadwal: [], galeri: [], rekening: [], tamu: [] };

function coerceMatrix(value: unknown): string[][] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((row): row is unknown[] => Array.isArray(row))
    .map((row) => row.map((cell) => String(cell ?? '')));
}

function coerceRaw(value: unknown): RawContentMatrix | null {
  if (typeof value !== 'object' || value === null) return null;
  const source = value as Record<string, unknown>;

  const raw: RawContentMatrix = {
    config: coerceMatrix(source['config']),
    jadwal: coerceMatrix(source['jadwal']),
    galeri: coerceMatrix(source['galeri']),
    rekening: coerceMatrix(source['rekening']),
    tamu: coerceMatrix(source['tamu']),
  };

  // Berkas tanpa Config sama sekali dianggap tidak berguna.
  return raw.config.length > 0 ? raw : null;
}

export function readSeed(): RawContentMatrix {
  try {
    return coerceRaw(JSON.parse(readFileSync(SEED_PATH, 'utf8'))) ?? EMPTY;
  } catch (error) {
    logger.error('seed.read_failed', { error, path: SEED_PATH });
    return EMPTY;
  }
}

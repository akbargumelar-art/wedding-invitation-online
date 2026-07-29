import 'server-only';

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { env } from '@/lib/env';
import { logger } from '@/lib/logger';
import type { RawSheetData } from './types';

/**
 * Snapshot JSON di disk adalah jaring pengaman wajib (US-14 / R-1): bila Sheets
 * API gagal karena kuota, jaringan, atau izin service account dicabut, halaman
 * tamu tetap tampil normal dari berkas ini. Halaman error tidak boleh pernah
 * tampil ke tamu.
 */

const SEED_PATH = path.resolve(process.cwd(), 'data/seed.json');

const EMPTY: RawSheetData = { config: [], jadwal: [], galeri: [], rekening: [], tamu: [] };

function coerceMatrix(value: unknown): string[][] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((row): row is unknown[] => Array.isArray(row))
    .map((row) => row.map((cell) => String(cell ?? '')));
}

function coerceRaw(value: unknown): RawSheetData | null {
  if (typeof value !== 'object' || value === null) return null;
  const source = value as Record<string, unknown>;

  const raw: RawSheetData = {
    config: coerceMatrix(source['config']),
    jadwal: coerceMatrix(source['jadwal']),
    galeri: coerceMatrix(source['galeri']),
    rekening: coerceMatrix(source['rekening']),
    tamu: coerceMatrix(source['tamu']),
  };

  // Snapshot tanpa Config sama sekali dianggap tidak berguna.
  return raw.config.length > 0 ? raw : null;
}

export function readSnapshot(): RawSheetData | null {
  try {
    return coerceRaw(JSON.parse(readFileSync(env.sheets.snapshotPath, 'utf8')));
  } catch {
    return null;
  }
}

export function writeSnapshot(raw: RawSheetData): void {
  try {
    mkdirSync(path.dirname(env.sheets.snapshotPath), { recursive: true });
    writeFileSync(env.sheets.snapshotPath, JSON.stringify(raw, null, 2), 'utf8');
  } catch (error) {
    // Gagal menulis snapshot tidak boleh menggagalkan render.
    logger.warn('snapshot.write_failed', { error, path: env.sheets.snapshotPath });
  }
}

/** Data dummy bawaan repo — lapisan terakhir bila snapshot pun belum ada. */
export function readSeed(): RawSheetData {
  try {
    return coerceRaw(JSON.parse(readFileSync(SEED_PATH, 'utf8'))) ?? EMPTY;
  } catch (error) {
    logger.error('seed.read_failed', { error, path: SEED_PATH });
    return EMPTY;
  }
}

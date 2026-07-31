import 'server-only';

import { unstable_cache } from 'next/cache';
import { env } from '@/lib/env';
import { logger } from '@/lib/logger';
import { isContentInitialized, readContentRecords, seedContentIfEmpty } from '@/lib/db/content';
import { matrixToRecords, parseContentRecords } from './parse';
import { readSeed } from './seed';
import type { Content, Guest } from './types';

export const CONTENT_CACHE_TAG = 'walimah-content';

/**
 * Satu-satunya pintu masuk untuk membaca isi undangan.
 *
 * Sejak v2 sumbernya adalah SQLite, diisi lewat dashboard admin. Google Sheets
 * sudah tidak dipakai sama sekali: tidak ada lagi panggilan jaringan, kuota
 * API, atau kredensial service account di jalur ini — pembacaan konten kini
 * murni operasi lokal.
 *
 * Lapisan `data/seed.json` tetap dipertahankan sebagai jaring pengaman (R-1):
 * pada pemasangan baru ia mengisi database, dan bila database gagal dibaca ia
 * dipakai langsung agar tamu tidak pernah melihat halaman error.
 */
async function loadContent(): Promise<Content> {
  const fetchedAt = new Date().toISOString();

  try {
    // Pemasangan baru: isi database dari berkas seed sekali saja.
    if (!isContentInitialized()) {
      const seeded = seedContentIfEmpty(matrixToRecords(readSeed()));
      if (seeded) logger.info('content.seeded_from_file');
    }

    const content = parseContentRecords(readContentRecords(), 'db', fetchedAt);
    logContentWarnings(content);
    return content;
  } catch (error) {
    // R-1: kegagalan dicatat, tapi tamu tidak pernah melihat halaman error.
    logger.error('content.db_failed', { error });
  }

  const content = parseContentRecords(matrixToRecords(readSeed()), 'seed', fetchedAt);
  logContentWarnings(content);
  return content;
}

function logContentWarnings(content: Content): void {
  if (content.warnings.length > 0) {
    logger.warn('content.parse_warnings', {
      source: content.source,
      count: content.warnings.length,
      warnings: content.warnings.slice(0, 20),
    });
  }
}

const cachedContent = unstable_cache(loadContent, ['walimah-content-v2'], {
  revalidate: env.content.cacheTtl,
  tags: [CONTENT_CACHE_TAG],
});

export async function getContent(): Promise<Content> {
  return cachedContent();
}

/** Lewati cache — dipakai dashboard admin, yang harus melihat hasil suntingannya. */
export async function getFreshContent(): Promise<Content> {
  return loadContent();
}

export async function findGuestBySlug(slug: string): Promise<Guest | null> {
  const { guests } = await getContent();
  const needle = slug.trim().toLowerCase();
  return guests.find((guest) => guest.slug.toLowerCase() === needle) ?? null;
}

export * from './types';

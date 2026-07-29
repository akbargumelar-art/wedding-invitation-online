import 'server-only';

import { unstable_cache } from 'next/cache';
import { env } from '@/lib/env';
import { logger } from '@/lib/logger';
import { parseContent } from './parse';
import { readSeed, readSnapshot, writeSnapshot } from './snapshot';
import { fetchRawSheetData, isSheetsConfigured } from './sheets';
import type { Content, ContentSource, Guest, RawSheetData } from './types';

export const CONTENT_CACHE_TAG = 'walimah-content';

/**
 * Satu-satunya pintu masuk untuk membaca isi undangan.
 *
 * Urutan sumber (US-14):
 *   1. Google Sheets API  — bila dikonfigurasi dan berhasil; snapshot disegarkan.
 *   2. snapshot.json      — bila API gagal atau belum dikonfigurasi.
 *   3. data/seed.json     — data dummy bawaan repo, agar app selalu bisa render.
 *
 * Hasilnya di-cache oleh Next dengan revalidasi `SHEET_CACHE_TTL` detik dan tag
 * `walimah-content`, sehingga `/api/revalidate` bisa memaksa refresh instan.
 */
async function loadContent(): Promise<Content> {
  const fetchedAt = new Date().toISOString();

  if (isSheetsConfigured()) {
    try {
      const raw = await fetchRawSheetData();
      writeSnapshot(raw);
      const content = parseContent(raw, 'sheets', fetchedAt);
      logContentWarnings(content);
      return content;
    } catch (error) {
      // R-1: kegagalan dicatat, tapi tamu tidak pernah melihat halaman error.
      logger.error('content.sheets_failed', { error });
    }
  }

  const snapshot = readSnapshot();
  const source: ContentSource = snapshot ? 'snapshot' : 'seed';
  const raw: RawSheetData = snapshot ?? readSeed();

  const content = parseContent(raw, source, fetchedAt);
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

const cachedContent = unstable_cache(loadContent, ['walimah-content-v1'], {
  revalidate: env.sheets.cacheTtl,
  tags: [CONTENT_CACHE_TAG],
});

export async function getContent(): Promise<Content> {
  return cachedContent();
}

/** Lewati cache — dipakai dashboard admin dan cron export. */
export async function getFreshContent(): Promise<Content> {
  return loadContent();
}

export async function findGuestBySlug(slug: string): Promise<Guest | null> {
  const { guests } = await getContent();
  const needle = slug.trim().toLowerCase();
  return guests.find((guest) => guest.slug.toLowerCase() === needle) ?? null;
}

export * from './types';

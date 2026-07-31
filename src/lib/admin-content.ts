import 'server-only';

import { NextResponse } from 'next/server';
import { revalidatePath, revalidateTag } from 'next/cache';
import type { output, ZodTypeAny } from 'zod';
import { apiError, internalError, requireAdmin, validationError } from '@/lib/api';
import { recordAudit } from '@/lib/db/misc';
import { CONTENT_CACHE_TAG } from '@/lib/content';
import { logger } from '@/lib/logger';

/**
 * Kerangka bersama seluruh route `/api/admin/content/*`.
 *
 * Setiap perubahan isi undangan harus melewati empat langkah yang sama: sesi
 * admin diperiksa, payload divalidasi, perubahan dicatat di audit log, lalu
 * cache halaman tamu dibatalkan. Menuliskannya sekali di sini membuat mustahil
 * ada satu route yang lupa salah satunya — khususnya langkah terakhir, yang
 * kegagalannya paling tidak kentara: penyimpanan tampak berhasil, tapi tamu
 * masih melihat data lama sampai TTL habis.
 */

/**
 * Batalkan cache konten sehingga suntingan langsung terlihat tamu.
 *
 * Keduanya dipanggil dengan sengaja: `revalidateTag` menyegarkan hasil
 * `getContent()`, sedangkan `revalidatePath` membuang halaman yang sudah
 * terlanjur dirender statis di jalur ISR.
 */
export function refreshContent(): void {
  revalidateTag(CONTENT_CACHE_TAG);
  revalidatePath('/', 'layout');
}

/** Catat ke audit log lalu segarkan cache — penutup setiap mutasi konten. */
export function commitChange(action: string, target: string | null, actor: string): void {
  recordAudit(action, target, actor);
  refreshContent();
  logger.info('content.changed', { action, target, actor });
}

export function parseId(raw: string): number | null {
  const id = Number.parseInt(raw, 10);
  return Number.isFinite(id) && id > 0 ? id : null;
}

export const notFound = (): NextResponse =>
  apiError(404, 'NOT_FOUND', 'Data yang dimaksud tidak ditemukan.');

/** Jalankan aksi admin tanpa payload (mis. DELETE). */
export async function withAdmin(
  request: Request,
  event: string,
  run: (actor: string) => NextResponse | Promise<NextResponse>,
): Promise<NextResponse> {
  const guard = await requireAdmin(request);
  if (!guard.ok) return guard.response;

  try {
    return await run(guard.username);
  } catch (error) {
    return internalError(event, error);
  }
}

/**
 * Jalankan aksi admin dengan body JSON yang divalidasi skema Zod.
 *
 * Generiknya sengaja mengikat skemanya sendiri, bukan tipe hasilnya. Menuliskan
 * `ZodType<T>` membuat TypeScript menyimpulkan T dari sisi *input* skema —
 * untuk skema ber-`preprocess` sisi itu bertipe `unknown`, dan seluruh manfaat
 * pengetikannya hilang tanpa satu pun galat yang terlihat.
 */
export async function withValidated<S extends ZodTypeAny>(
  request: Request,
  schema: S,
  event: string,
  run: (input: output<S>, actor: string) => NextResponse | Promise<NextResponse>,
): Promise<NextResponse> {
  return withAdmin(request, event, async (actor) => {
    const body: unknown = await request.json().catch(() => null);

    const parsed = schema.safeParse(body);
    if (!parsed.success) return validationError(parsed.error);

    return run(parsed.data, actor);
  });
}

export const ok = (payload: Record<string, unknown> = {}): NextResponse =>
  NextResponse.json({ ok: true, ...payload });

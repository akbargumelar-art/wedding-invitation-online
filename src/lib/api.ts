import 'server-only';

import { NextResponse } from 'next/server';
import { ZodError } from 'zod';
import { getSession, verifyCsrf } from '@/lib/auth';
import { consumeRateLimit, clientIp, hashIp, type RateLimitConfig } from '@/lib/rate-limit';
import { firstErrorMessage } from '@/lib/validation';
import { logger } from '@/lib/logger';

/**
 * Bentuk respons galat seragam: `{ error: { code, message } }` dengan pesan
 * berbahasa Indonesia yang aman ditampilkan ke tamu. Stack trace tidak pernah
 * dikirim ke klien (PRD §4.4).
 */
export type ApiErrorCode =
  | 'VALIDATION'
  | 'RATE_LIMITED'
  | 'LOCKED'
  | 'CLOSED'
  | 'UNAUTHORIZED'
  | 'FORBIDDEN'
  | 'NOT_FOUND'
  | 'PAYLOAD_TOO_LARGE'
  | 'UNSUPPORTED_MEDIA'
  | 'INTERNAL';

export function apiError(
  status: number,
  code: ApiErrorCode,
  message: string,
  headers?: HeadersInit,
): NextResponse {
  return NextResponse.json({ error: { code, message } }, { status, headers });
}

export function validationError(error: ZodError): NextResponse {
  return apiError(422, 'VALIDATION', firstErrorMessage(error));
}

export function rateLimitError(retryAfterSeconds: number): NextResponse {
  return apiError(
    429,
    'RATE_LIMITED',
    'Terlalu banyak pengiriman dari perangkat ini. Silakan coba lagi beberapa saat lagi.',
    { 'Retry-After': String(retryAfterSeconds) },
  );
}

export function internalError(event: string, error: unknown): NextResponse {
  logger.error(event, { error });
  return apiError(500, 'INTERNAL', 'Terjadi gangguan di server. Silakan coba beberapa saat lagi.');
}

/** Identitas pemanggil untuk rate limit & penyimpanan (tanpa IP mentah). */
export function requestIdentity(request: Request): { ipHash: string; userAgent: string | null } {
  return {
    ipHash: hashIp(clientIp(request.headers)),
    userAgent: request.headers.get('user-agent')?.slice(0, 300) ?? null,
  };
}

/** Terapkan rate limit; kembalikan respons 429 bila terlampaui, `null` bila lolos. */
export function enforceRateLimit(config: RateLimitConfig, ipHash: string): NextResponse | null {
  const result = consumeRateLimit(config, ipHash);
  return result.allowed ? null : rateLimitError(result.retryAfterSeconds);
}

/**
 * Penjaga seluruh route `/api/admin/*`: wajib sesi valid, dan untuk metode yang
 * mengubah data juga wajib token CSRF yang cocok.
 */
export async function requireAdmin(
  request: Request,
): Promise<{ ok: true; username: string } | { ok: false; response: NextResponse }> {
  const session = await getSession();
  if (!session) {
    return {
      ok: false,
      response: apiError(401, 'UNAUTHORIZED', 'Sesi tidak valid. Silakan masuk kembali.'),
    };
  }

  const isMutation = !['GET', 'HEAD', 'OPTIONS'].includes(request.method.toUpperCase());
  if (isMutation && !(await verifyCsrf(request))) {
    return {
      ok: false,
      response: apiError(403, 'FORBIDDEN', 'Token keamanan tidak cocok. Muat ulang halaman.'),
    };
  }

  return { ok: true, username: session.username };
}

/** Bandingkan secret cron/revalidate dari body atau header Authorization. */
export function hasValidSecret(provided: string | null | undefined, expected: string): boolean {
  return Boolean(expected) && provided === expected;
}

/** Baca secret dari body JSON/form atau header `Authorization: Bearer …`. */
export async function readSecret(request: Request): Promise<string | null> {
  const auth = request.headers.get('authorization');
  if (auth?.toLowerCase().startsWith('bearer ')) return auth.slice(7).trim();

  const contentType = request.headers.get('content-type') ?? '';
  try {
    if (contentType.includes('application/json')) {
      const body = (await request.json()) as { secret?: unknown };
      return typeof body.secret === 'string' ? body.secret : null;
    }
    if (contentType.includes('form')) {
      const form = await request.formData();
      const secret = form.get('secret');
      return typeof secret === 'string' ? secret : null;
    }
  } catch {
    return null;
  }

  const url = new URL(request.url);
  return url.searchParams.get('secret');
}

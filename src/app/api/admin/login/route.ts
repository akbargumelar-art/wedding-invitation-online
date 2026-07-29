import { NextResponse } from 'next/server';
import { apiError, enforceRateLimit, internalError, requestIdentity, validationError } from '@/lib/api';
import { RATE_LIMITS } from '@/lib/rate-limit';
import { loginSchema } from '@/lib/validation';
import { login } from '@/lib/auth';
import { recordAudit } from '@/lib/db/misc';
import { logger } from '@/lib/logger';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/**
 * POST /api/admin/login
 *
 * Pesan galat sengaja tidak membedakan "nama pengguna salah" dari "kata sandi
 * salah", supaya tidak menjadi alat enumerasi akun.
 */
export async function POST(request: Request): Promise<NextResponse> {
  try {
    const { ipHash } = requestIdentity(request);

    const limited = enforceRateLimit(RATE_LIMITS.adminLogin, ipHash);
    if (limited) return limited;

    const parsed = loginSchema.safeParse(await request.json());
    if (!parsed.success) return validationError(parsed.error);

    const result = await login(parsed.data.username, parsed.data.password);

    if (result.ok) {
      recordAudit('login', null, parsed.data.username);
      return NextResponse.json({ ok: true });
    }

    if (result.code === 'LOCKED') {
      const minutes = Math.ceil(result.retryAfterSeconds / 60);
      // Kode terpisah dari RATE_LIMITED: penguncian akun dan pembatasan laju
      // per IP adalah dua kondisi berbeda, dan admin perlu tahu yang mana.
      return apiError(
        429,
        'LOCKED',
        `Akun terkunci sementara karena terlalu banyak percobaan gagal. Coba lagi dalam ${minutes} menit.`,
        { 'Retry-After': String(result.retryAfterSeconds) },
      );
    }

    if (result.code === 'NOT_CONFIGURED') {
      logger.error('admin.login_not_configured');
      return apiError(
        503,
        'INTERNAL',
        'Akun admin belum dikonfigurasi di server. Hubungi pengelola aplikasi.',
      );
    }

    return apiError(401, 'UNAUTHORIZED', 'Nama pengguna atau kata sandi salah.');
  } catch (error) {
    return internalError('admin.login_failed', error);
  }
}

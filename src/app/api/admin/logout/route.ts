import { NextResponse } from 'next/server';
import { internalError } from '@/lib/api';
import { getSession, logout } from '@/lib/auth';
import { recordAudit } from '@/lib/db/misc';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/**
 * POST /api/admin/logout
 *
 * Sengaja tidak memeriksa CSRF: memaksa keluar dari sesi tidak merugikan siapa
 * pun, dan menolak permintaan keluar justru menyisakan sesi hidup.
 */
export async function POST(): Promise<NextResponse> {
  try {
    const session = await getSession();
    if (session) recordAudit('logout', null, session.username);

    await logout();
    return NextResponse.json({ ok: true });
  } catch (error) {
    return internalError('admin.logout_failed', error);
  }
}

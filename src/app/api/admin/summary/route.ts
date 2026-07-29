import { NextResponse } from 'next/server';
import { internalError, requireAdmin } from '@/lib/api';
import { loadAdminSummary } from '@/lib/admin-data';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/** GET /api/admin/summary — kartu ringkasan dashboard (US-15). */
export async function GET(request: Request): Promise<NextResponse> {
  const guard = await requireAdmin(request);
  if (!guard.ok) return guard.response;

  try {
    return NextResponse.json(await loadAdminSummary());
  } catch (error) {
    return internalError('admin.summary_failed', error);
  }
}

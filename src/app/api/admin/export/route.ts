import { NextResponse } from 'next/server';
import { enforceRateLimit, internalError, requestIdentity, requireAdmin } from '@/lib/api';
import { RATE_LIMITS } from '@/lib/rate-limit';
import { exportToSheet } from '@/lib/export';
import { recordAudit } from '@/lib/db/misc';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/** POST /api/admin/export — tombol "Export ke Google Sheet" di dashboard (US-15). */
export async function POST(request: Request): Promise<NextResponse> {
  const guard = await requireAdmin(request);
  if (!guard.ok) return guard.response;

  try {
    const { ipHash } = requestIdentity(request);

    // Menulis ke Sheets memakai kuota API; batasi 6 kali per jam.
    const limited = enforceRateLimit(RATE_LIMITS.adminExport, ipHash);
    if (limited) return limited;

    const result = await exportToSheet();
    recordAudit('export', result.ok ? 'sheet' : 'sheet:skipped', guard.username);

    return NextResponse.json(result, { status: result.ok ? 200 : 202 });
  } catch (error) {
    return internalError('admin.export_failed', error);
  }
}

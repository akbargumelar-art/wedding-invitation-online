import { NextResponse } from 'next/server';
import { apiError, internalError, requireAdmin } from '@/lib/api';
import { readProofFile } from '@/lib/uploads';
import { findEnvelopeByProofFile } from '@/lib/db/envelope';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/**
 * GET /api/admin/proof/[file] — pratinjau bukti transfer (US-15).
 *
 * Berkas bukti disimpan di luar web root, jadi ini satu-satunya jalan untuk
 * membacanya, dan hanya dengan sesi admin yang valid. Nama berkas diverifikasi
 * berbentuk UUID + ekstensi yang kita buat sendiri, lalu dicocokkan dengan baris
 * di database — berkas yatim tidak ikut tersaji.
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ file: string }> },
): Promise<NextResponse | Response> {
  const guard = await requireAdmin(request);
  if (!guard.ok) return guard.response;

  try {
    const { file } = await params;

    if (!findEnvelopeByProofFile(file)) {
      return apiError(404, 'NOT_FOUND', 'Bukti transfer tidak ditemukan.');
    }

    const proof = readProofFile(file);
    if (!proof) return apiError(404, 'NOT_FOUND', 'Bukti transfer tidak ditemukan.');

    return new Response(new Uint8Array(proof.buffer), {
      headers: {
        'content-type': proof.contentType,
        'content-length': String(proof.buffer.byteLength),
        // Jangan pernah di-cache proxy/CDN: isinya privat.
        'cache-control': 'private, no-store',
        'content-disposition': `inline; filename="${file}"`,
        'x-content-type-options': 'nosniff',
      },
    });
  } catch (error) {
    return internalError('admin.proof_failed', error);
  }
}

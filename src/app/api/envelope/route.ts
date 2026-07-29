import { NextResponse } from 'next/server';
import {
  apiError,
  enforceRateLimit,
  internalError,
  requestIdentity,
  validationError,
} from '@/lib/api';
import { RATE_LIMITS } from '@/lib/rate-limit';
import { envelopeSchema } from '@/lib/validation';
import { createEnvelope } from '@/lib/db/envelope';
import { storeProofFile } from '@/lib/uploads';
import { env } from '@/lib/env';
import { notify } from '@/lib/notify';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/**
 * POST /api/envelope — konfirmasi pengiriman amplop digital (US-12).
 *
 * Menerima multipart karena bukti transfer bersifat opsional. Berkas diperiksa
 * ukurannya dan magic bytes-nya sebelum disimpan dengan nama UUID di luar web
 * root; tidak ada data pembayaran apa pun yang disimpan.
 */
export async function POST(request: Request): Promise<NextResponse> {
  try {
    const { ipHash } = requestIdentity(request);

    const limited = enforceRateLimit(RATE_LIMITS.envelope, ipHash);
    if (limited) return limited;

    let form: FormData;
    try {
      form = await request.formData();
    } catch {
      return apiError(422, 'VALIDATION', 'Format pengiriman tidak dikenali.');
    }

    const parsed = envelopeSchema.safeParse({
      slug: readString(form, 'slug'),
      sender_name: readString(form, 'sender_name'),
      amount: readString(form, 'amount'),
      method: readString(form, 'method'),
      note: readString(form, 'note'),
    });

    if (!parsed.success) return validationError(parsed.error);

    let proofFile: string | null = null;
    const proof = form.get('proof');

    if (proof instanceof File && proof.size > 0) {
      // Ditolak lebih awal dengan 413 agar pesan ke tamu tepat, bukan 422 umum.
      if (proof.size > env.uploads.maxBytes) {
        return apiError(
          413,
          'PAYLOAD_TOO_LARGE',
          `Ukuran bukti transfer maksimal ${Math.floor(env.uploads.maxBytes / 1024 / 1024)} MB.`,
        );
      }

      const stored = await storeProofFile(proof);
      if (!stored.ok) {
        return stored.code === 'TOO_LARGE'
          ? apiError(413, 'PAYLOAD_TOO_LARGE', stored.message)
          : apiError(422, 'UNSUPPORTED_MEDIA', stored.message);
      }

      proofFile = stored.proof.fileName;
    }

    const row = createEnvelope({
      guestSlug: parsed.data.slug,
      senderName: parsed.data.sender_name,
      amount: parsed.data.amount,
      method: parsed.data.method,
      note: parsed.data.note,
      proofFile,
      ipHash,
    });

    notify({
      event: 'envelope',
      senderName: row.sender_name,
      slug: row.guest_slug,
      amount: row.amount,
      method: row.method,
      note: row.note,
      // Berkas buktinya sendiri tidak pernah ikut keluar; cukup keterangan ada
      // atau tidak, agar mempelai tahu perlu membukanya di dashboard.
      hasProof: row.proof_file !== null,
    });

    return NextResponse.json({ id: row.id, status: row.status }, { status: 201 });
  } catch (error) {
    return internalError('api.envelope.post_failed', error);
  }
}

function readString(form: FormData, key: string): string | undefined {
  const value = form.get(key);
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

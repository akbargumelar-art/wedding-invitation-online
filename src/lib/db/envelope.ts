import { getDb } from './index';
import { nowIso } from '@/lib/date';

export type EnvelopeMethod = 'qris' | 'transfer' | 'tunai';
export type EnvelopeStatus = 'pending' | 'verified' | 'rejected';

export type EnvelopeRow = {
  id: number;
  guest_slug: string | null;
  sender_name: string;
  amount: number | null;
  method: EnvelopeMethod;
  note: string | null;
  proof_file: string | null;
  status: EnvelopeStatus;
  created_at: string;
  verified_at: string | null;
};

export type EnvelopeInput = {
  guestSlug: string | null;
  senderName: string;
  amount: number | null;
  method: EnvelopeMethod;
  note: string | null;
  proofFile: string | null;
  ipHash: string;
};

/**
 * Semua konfirmasi masuk berstatus `pending`. Aplikasi tidak pernah mengklaim
 * dana sudah diterima — verifikasi selalu manual oleh admin (US-12 / R-6).
 */
export function createEnvelope(input: EnvelopeInput): EnvelopeRow {
  const db = getDb();
  const result = db
    .prepare(
      `INSERT INTO envelope_confirmations
         (guest_slug, sender_name, amount, method, note, proof_file, status, ip_hash, created_at)
       VALUES (@guestSlug, @senderName, @amount, @method, @note, @proofFile, 'pending', @ipHash, @now)`,
    )
    .run({ ...input, now: nowIso() });

  const row = db
    .prepare(`SELECT * FROM envelope_confirmations WHERE id = ?`)
    .get(result.lastInsertRowid) as EnvelopeRow | undefined;

  if (!row) throw new Error('Konfirmasi amplop gagal disimpan.');
  return row;
}

export function listEnvelopes(): EnvelopeRow[] {
  return getDb()
    .prepare(`SELECT * FROM envelope_confirmations ORDER BY created_at DESC, id DESC`)
    .all() as EnvelopeRow[];
}

export function findEnvelopeByProofFile(fileName: string): EnvelopeRow | null {
  const row = getDb()
    .prepare(`SELECT * FROM envelope_confirmations WHERE proof_file = ?`)
    .get(fileName) as EnvelopeRow | undefined;

  return row ?? null;
}

export function updateEnvelopeStatus(id: number, status: EnvelopeStatus): boolean {
  const verifiedAt = status === 'verified' ? nowIso() : null;
  return getDb()
    .prepare(`UPDATE envelope_confirmations SET status = ?, verified_at = ? WHERE id = ?`)
    .run(status, verifiedAt, id).changes > 0;
}

export type EnvelopeSummary = {
  pending: number;
  verified: number;
  rejected: number;
  /** Akumulasi nominal yang SUDAH diverifikasi admin saja. */
  verifiedAmount: number;
};

export function summarizeEnvelopes(): EnvelopeSummary {
  const row = getDb()
    .prepare(
      `SELECT
         COALESCE(SUM(status = 'pending'), 0)  AS pending,
         COALESCE(SUM(status = 'verified'), 0) AS verified,
         COALESCE(SUM(status = 'rejected'), 0) AS rejected,
         COALESCE(SUM(CASE WHEN status = 'verified' THEN amount END), 0) AS verifiedAmount
       FROM envelope_confirmations`,
    )
    .get() as EnvelopeSummary | undefined;

  return row ?? { pending: 0, verified: 0, rejected: 0, verifiedAmount: 0 };
}

/** Bukti transfer dihapus 30 hari setelah diverifikasi (PRD §4.5). */
export function listExpiredProofs(retentionDays: number): EnvelopeRow[] {
  return getDb()
    .prepare(
      `SELECT * FROM envelope_confirmations
       WHERE proof_file IS NOT NULL
         AND verified_at IS NOT NULL
         AND verified_at < datetime('now', ?)`,
    )
    .all(`-${Math.max(0, retentionDays)} days`) as EnvelopeRow[];
}

export function clearProofFile(id: number): void {
  getDb().prepare(`UPDATE envelope_confirmations SET proof_file = NULL WHERE id = ?`).run(id);
}

import { getDb } from './index';
import { nowIso, todayInJakarta } from '@/lib/date';

// -----------------------------------------------------------------------------
// Kunjungan (agregat, tanpa identitas)
// -----------------------------------------------------------------------------

/**
 * Catat satu kunjungan; kembalikan `true` hanya bila ini pembukaan pertama tamu
 * tersebut pada hari itu.
 *
 * Nilai kembalian inilah yang membuat notifikasi "undangan dibuka" tetap masuk
 * akal: tanpa itu, satu tamu yang membuka ulang link sepuluh kali akan memicu
 * sepuluh pesan WhatsApp.
 */
export function trackVisit(guestSlug: string | null): boolean {
  const row = getDb()
    .prepare(
      `INSERT INTO visits (guest_slug, visited_date, count)
       VALUES (?, ?, 1)
       ON CONFLICT(guest_slug, visited_date) DO UPDATE SET count = count + 1
       RETURNING count`,
    )
    .get(guestSlug, todayInJakarta()) as { count: number } | undefined;

  return row?.count === 1;
}

export type VisitSummary = { uniqueGuests: number; totalVisits: number };

export function summarizeVisits(): VisitSummary {
  const row = getDb()
    .prepare(
      `SELECT
         COUNT(DISTINCT guest_slug) AS uniqueGuests,
         COALESCE(SUM(count), 0)    AS totalVisits
       FROM visits`,
    )
    .get() as VisitSummary | undefined;

  return row ?? { uniqueGuests: 0, totalVisits: 0 };
}

// -----------------------------------------------------------------------------
// Audit log
// -----------------------------------------------------------------------------

export type AuditRow = {
  id: number;
  action: string;
  target: string | null;
  actor: string;
  created_at: string;
};

export function recordAudit(action: string, target: string | null, actor: string): void {
  getDb()
    .prepare(`INSERT INTO audit_log (action, target, actor, created_at) VALUES (?, ?, ?, ?)`)
    .run(action, target, actor, nowIso());
}

export function listAudit(limit = 50): AuditRow[] {
  return getDb()
    .prepare(`SELECT * FROM audit_log ORDER BY created_at DESC, id DESC LIMIT ?`)
    .all(limit) as AuditRow[];
}

// -----------------------------------------------------------------------------
// Percobaan login admin (penguncian 15 menit setelah 5 kali gagal)
// -----------------------------------------------------------------------------

const MAX_FAILURES = 5;
const LOCK_MINUTES = 15;

export type LockState = { locked: true; retryAfterSeconds: number } | { locked: false };

export function checkLogin(identity: string): LockState {
  const row = getDb()
    .prepare(`SELECT locked_until FROM login_attempts WHERE identity = ?`)
    .get(identity) as { locked_until: string | null } | undefined;

  if (!row?.locked_until) return { locked: false };

  // Timestamp disimpan sebagai "YYYY-MM-DD HH:MM:SS" UTC.
  const until = Date.parse(`${row.locked_until.replace(' ', 'T')}Z`);
  const remainingMs = until - Date.now();

  if (!Number.isFinite(until) || remainingMs <= 0) return { locked: false };
  return { locked: true, retryAfterSeconds: Math.ceil(remainingMs / 1000) };
}

export function recordLoginFailure(identity: string): void {
  getDb()
    .prepare(
      `INSERT INTO login_attempts (identity, failures, locked_until, last_attempt_at)
       VALUES (@identity, 1, NULL, @now)
       ON CONFLICT(identity) DO UPDATE SET
         -- Setelah masa kunci lewat, hitungan dimulai lagi dari nol supaya satu
         -- kesalahan ketik tidak langsung mengunci akun untuk 15 menit lagi.
         failures = CASE
           WHEN login_attempts.locked_until IS NOT NULL
                AND login_attempts.locked_until <= datetime('now') THEN 1
           ELSE login_attempts.failures + 1
         END,
         last_attempt_at = @now,
         locked_until = CASE
           WHEN login_attempts.locked_until IS NOT NULL
                AND login_attempts.locked_until <= datetime('now') THEN NULL
           WHEN login_attempts.failures + 1 >= @maxFailures THEN datetime('now', @lockWindow)
           ELSE login_attempts.locked_until
         END`,
    )
    .run({
      identity,
      now: nowIso(),
      maxFailures: MAX_FAILURES,
      lockWindow: `+${LOCK_MINUTES} minutes`,
    });
}

export function clearLoginFailures(identity: string): void {
  getDb().prepare(`DELETE FROM login_attempts WHERE identity = ?`).run(identity);
}

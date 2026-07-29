import { getDb } from './index';
import { nowIso } from '@/lib/date';

export type NotificationEvent = 'rsvp' | 'wish' | 'envelope' | 'visit';
export type NotificationStatus = 'pending' | 'sent' | 'failed';

export type NotificationRow = {
  id: number;
  event: NotificationEvent;
  payload: string;
  status: NotificationStatus;
  attempts: number;
  last_error: string | null;
  next_attempt_at: string;
  created_at: string;
  sent_at: string | null;
};

export function enqueueNotification(event: NotificationEvent, payload: unknown): number {
  const result = getDb()
    .prepare(
      `INSERT INTO notifications (event, payload, status, next_attempt_at, created_at)
       VALUES (?, ?, 'pending', ?, ?)`,
    )
    .run(event, JSON.stringify(payload), nowIso(), nowIso());

  return Number(result.lastInsertRowid);
}

/**
 * Ambil antrean yang sudah waktunya dicoba.
 *
 * `attempts < maxAttempts` disaring di SQL agar baris yang sudah menyerah tidak
 * ikut terbaca; statusnya sendiri diubah menjadi `failed` oleh `markFailed`.
 */
export function claimPendingNotifications(limit: number, maxAttempts: number): NotificationRow[] {
  return getDb()
    .prepare(
      `SELECT * FROM notifications
       WHERE status = 'pending'
         AND attempts < ?
         AND next_attempt_at <= ?
       ORDER BY id
       LIMIT ?`,
    )
    .all(maxAttempts, nowIso(), limit) as NotificationRow[];
}

export function findNotification(id: number): NotificationRow | null {
  const row = getDb().prepare(`SELECT * FROM notifications WHERE id = ?`).get(id) as
    | NotificationRow
    | undefined;

  return row ?? null;
}

export function markSent(id: number): void {
  getDb()
    .prepare(
      `UPDATE notifications
       SET status = 'sent', attempts = attempts + 1, sent_at = ?, last_error = NULL
       WHERE id = ?`,
    )
    .run(nowIso(), id);
}

/**
 * Catat kegagalan dan jadwalkan percobaan berikutnya.
 *
 * `retryInSeconds` null berarti menyerah: baris ditandai `failed` sehingga
 * terlihat di dashboard admin, bukan hilang diam-diam.
 */
export function markFailed(id: number, error: string, retryInSeconds: number | null): void {
  const db = getDb();

  if (retryInSeconds === null) {
    db.prepare(
      `UPDATE notifications SET status = 'failed', attempts = attempts + 1, last_error = ? WHERE id = ?`,
    ).run(error.slice(0, 500), id);
    return;
  }

  db.prepare(
    `UPDATE notifications
     SET attempts = attempts + 1,
         last_error = ?,
         next_attempt_at = datetime('now', ?)
     WHERE id = ?`,
  ).run(error.slice(0, 500), `+${Math.max(1, Math.round(retryInSeconds))} seconds`, id);
}

export type NotificationSummary = { pending: number; sent: number; failed: number };

export function summarizeNotifications(): NotificationSummary {
  const row = getDb()
    .prepare(
      `SELECT
         COALESCE(SUM(status = 'pending'), 0) AS pending,
         COALESCE(SUM(status = 'sent'), 0)    AS sent,
         COALESCE(SUM(status = 'failed'), 0)  AS failed
       FROM notifications`,
    )
    .get() as NotificationSummary | undefined;

  return row ?? { pending: 0, sent: 0, failed: 0 };
}

/** Buang riwayat notifikasi lama agar tabel tidak tumbuh tanpa batas. */
export function pruneNotifications(olderThanDays = 30): number {
  return getDb()
    .prepare(`DELETE FROM notifications WHERE status = 'sent' AND created_at < datetime('now', ?)`)
    .run(`-${Math.max(1, olderThanDays)} days`).changes;
}

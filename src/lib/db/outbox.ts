import { getDb, transaction } from './index';
import { nowIso } from '@/lib/date';

/**
 * Antrean pengiriman undangan.
 *
 * Seluruh keadaan pengiriman ada di database, bukan di memori proses. Itu yang
 * membuat penyebaran undangan selamat dari restart layanan: antrean yang baru
 * separuh jalan akan dilanjutkan begitu proses hidup lagi, tanpa mengirim ulang
 * yang sudah terkirim.
 */

export type OutboxStatus = 'pending' | 'sent' | 'failed' | 'cancelled';

export type OutboxRow = {
  id: number;
  guest_id: number;
  guest_slug: string;
  guest_nama: string;
  chat_id: string;
  status: OutboxStatus;
  attempts: number;
  last_error: string | null;
  created_at: string;
  sent_at: string | null;
};

export type OutboxEntry = {
  guestId: number;
  guestSlug: string;
  guestNama: string;
  chatId: string;
};

/**
 * Masukkan tamu ke antrean.
 *
 * Tamu yang sudah punya baris `pending` dilewati — menekan "Kirim ke semua" dua
 * kali karena ragu tidak boleh berarti setiap tamu menerima undangan dua kali.
 */
export function enqueueInvitations(entries: OutboxEntry[]): number {
  const at = nowIso();

  return transaction((db) => {
    const pending = db
      .prepare(`SELECT guest_id FROM invitation_outbox WHERE status = 'pending'`)
      .all() as Array<{ guest_id: number }>;

    const queued = new Set(pending.map((row) => row.guest_id));

    const insert = db.prepare(
      `INSERT INTO invitation_outbox
         (guest_id, guest_slug, guest_nama, chat_id, status, created_at)
       VALUES (@guestId, @guestSlug, @guestNama, @chatId, 'pending', @at)`,
    );

    let added = 0;
    for (const entry of entries) {
      if (queued.has(entry.guestId)) continue;
      insert.run({ ...entry, at });
      queued.add(entry.guestId);
      added += 1;
    }

    return added;
  });
}

/** Baris berikutnya yang harus dikirim, urut sesuai antrean. */
export function nextPending(): OutboxRow | null {
  const row = getDb()
    .prepare(`SELECT * FROM invitation_outbox WHERE status = 'pending' ORDER BY id LIMIT 1`)
    .get() as OutboxRow | undefined;

  return row ?? null;
}

export function markOutboxSent(id: number): void {
  getDb()
    .prepare(
      `UPDATE invitation_outbox
       SET status = 'sent', attempts = attempts + 1, last_error = NULL, sent_at = ?
       WHERE id = ?`,
    )
    .run(nowIso(), id);
}

/**
 * Catat kegagalan. Baris tetap `pending` selama masih boleh dicoba ulang;
 * setelah itu ia menjadi `failed` dan tidak lagi menahan antrean di belakangnya.
 */
export function markOutboxAttemptFailed(id: number, error: string, giveUp: boolean): void {
  getDb()
    .prepare(
      `UPDATE invitation_outbox
       SET status = CASE WHEN @giveUp THEN 'failed' ELSE 'pending' END,
           attempts = attempts + 1,
           last_error = @error
       WHERE id = @id`,
    )
    .run({ id, error: error.slice(0, 500), giveUp: giveUp ? 1 : 0 });
}

/** Batalkan seluruh antrean yang belum terkirim. */
export function cancelPendingInvitations(): number {
  return getDb()
    .prepare(`UPDATE invitation_outbox SET status = 'cancelled' WHERE status = 'pending'`)
    .run().changes;
}

/** Kembalikan baris gagal ke antrean untuk dicoba lagi. */
export function requeueFailedInvitations(): number {
  return getDb()
    .prepare(
      `UPDATE invitation_outbox SET status = 'pending', attempts = 0, last_error = NULL
       WHERE status = 'failed'`,
    )
    .run().changes;
}

export type OutboxSummary = {
  pending: number;
  sent: number;
  failed: number;
  cancelled: number;
};

export function summarizeOutbox(): OutboxSummary {
  const rows = getDb()
    .prepare(`SELECT status, COUNT(*) AS n FROM invitation_outbox GROUP BY status`)
    .all() as Array<{ status: OutboxStatus; n: number }>;

  const summary: OutboxSummary = { pending: 0, sent: 0, failed: 0, cancelled: 0 };
  for (const row of rows) summary[row.status] = row.n;
  return summary;
}

export type GuestSendState = {
  status: OutboxStatus;
  attempts: number;
  lastError: string | null;
  sentAt: string | null;
  createdAt: string;
};

/**
 * Keadaan pengiriman terakhir per tamu.
 *
 * Dashboard menampilkan satu status per tamu, bukan seluruh riwayatnya — yang
 * ingin diketahui saat menyebar undangan hanyalah "sudah sampai atau belum".
 */
export function latestSendStateByGuest(): Map<number, GuestSendState> {
  const rows = getDb()
    .prepare(
      `SELECT o.guest_id, o.status, o.attempts, o.last_error, o.sent_at, o.created_at
       FROM invitation_outbox o
       JOIN (SELECT guest_id, MAX(id) AS id FROM invitation_outbox GROUP BY guest_id) terbaru
         ON terbaru.id = o.id`,
    )
    .all() as Array<Record<string, unknown>>;

  const map = new Map<number, GuestSendState>();
  for (const row of rows) {
    map.set(Number(row['guest_id']), {
      status: String(row['status']) as OutboxStatus,
      attempts: Number(row['attempts'] ?? 0),
      lastError: (row['last_error'] as string | null) ?? null,
      sentAt: (row['sent_at'] as string | null) ?? null,
      createdAt: String(row['created_at'] ?? ''),
    });
  }

  return map;
}

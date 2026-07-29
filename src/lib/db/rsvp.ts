import { getDb } from './index';
import { nowIso } from '@/lib/date';

export type RsvpStatus = 'hadir' | 'tidak_hadir' | 'ragu';

export type RsvpRow = {
  id: number;
  guest_slug: string | null;
  name: string;
  status: RsvpStatus;
  pax: number;
  message: string | null;
  created_at: string;
  updated_at: string;
};

export type RsvpInput = {
  guestSlug: string | null;
  name: string;
  status: RsvpStatus;
  pax: number;
  message: string | null;
  ipHash: string;
  userAgent: string | null;
};

/**
 * Satu slug tamu hanya boleh punya satu RSVP aktif (US-10): pengiriman kedua
 * memperbarui baris yang ada, bukan membuat duplikat.
 *
 * Tamu dari link umum (`guest_slug` NULL) tidak bisa di-UPSERT — indeks unik
 * sengaja partial — sehingga tiap kiriman anonim menjadi baris baru.
 */
export function upsertRsvp(input: RsvpInput): RsvpRow {
  const db = getDb();
  const now = nowIso();

  if (input.guestSlug) {
    db.prepare(
      `INSERT INTO rsvp (guest_slug, name, status, pax, message, ip_hash, user_agent, created_at, updated_at)
       VALUES (@guestSlug, @name, @status, @pax, @message, @ipHash, @userAgent, @now, @now)
       -- Indeks uniknya parsial, jadi target konflik WAJIB mengulang klausa
       -- WHERE yang sama; tanpa itu SQLite menolak dengan "ON CONFLICT clause
       -- does not match any PRIMARY KEY or UNIQUE constraint".
       ON CONFLICT(guest_slug) WHERE guest_slug IS NOT NULL DO UPDATE SET
         name       = excluded.name,
         status     = excluded.status,
         pax        = excluded.pax,
         message    = excluded.message,
         ip_hash    = excluded.ip_hash,
         user_agent = excluded.user_agent,
         updated_at = excluded.updated_at`,
    ).run({ ...input, now });

    const row = findRsvpBySlug(input.guestSlug);
    if (!row) throw new Error('RSVP gagal disimpan.');
    return row;
  }

  const result = db
    .prepare(
      `INSERT INTO rsvp (guest_slug, name, status, pax, message, ip_hash, user_agent, created_at, updated_at)
       VALUES (NULL, @name, @status, @pax, @message, @ipHash, @userAgent, @now, @now)`,
    )
    .run({ ...input, now });

  const row = db
    .prepare(`SELECT id, guest_slug, name, status, pax, message, created_at, updated_at FROM rsvp WHERE id = ?`)
    .get(result.lastInsertRowid) as RsvpRow | undefined;

  if (!row) throw new Error('RSVP gagal disimpan.');
  return row;
}

export function findRsvpBySlug(slug: string): RsvpRow | null {
  const row = getDb()
    .prepare(
      `SELECT id, guest_slug, name, status, pax, message, created_at, updated_at
       FROM rsvp WHERE guest_slug = ?`,
    )
    .get(slug) as RsvpRow | undefined;

  return row ?? null;
}

export function listRsvp(): RsvpRow[] {
  return getDb()
    .prepare(
      `SELECT id, guest_slug, name, status, pax, message, created_at, updated_at
       FROM rsvp ORDER BY created_at DESC`,
    )
    .all() as RsvpRow[];
}

export type RsvpSummary = {
  total: number;
  hadir: number;
  tidakHadir: number;
  ragu: number;
  totalPax: number;
};

export function summarizeRsvp(): RsvpSummary {
  const row = getDb()
    .prepare(
      `SELECT
         COUNT(*)                                                   AS total,
         COALESCE(SUM(status = 'hadir'), 0)                         AS hadir,
         COALESCE(SUM(status = 'tidak_hadir'), 0)                   AS tidakHadir,
         COALESCE(SUM(status = 'ragu'), 0)                          AS ragu,
         COALESCE(SUM(CASE WHEN status = 'hadir' THEN pax END), 0)  AS totalPax
       FROM rsvp`,
    )
    .get() as RsvpSummary | undefined;

  return row ?? { total: 0, hadir: 0, tidakHadir: 0, ragu: 0, totalPax: 0 };
}

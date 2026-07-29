import { getDb } from './index';
import { nowIso } from '@/lib/date';

export type WishStatus = 'pending' | 'approved' | 'rejected';

export type WishRow = {
  id: number;
  guest_slug: string | null;
  name: string;
  message: string;
  status: WishStatus;
  created_at: string;
  deleted_at: string | null;
};

export type PublicWish = Pick<WishRow, 'id' | 'name' | 'message' | 'created_at'>;

export type WishInput = {
  guestSlug: string | null;
  name: string;
  message: string;
  status: WishStatus;
  ipHash: string;
};

export function createWish(input: WishInput): WishRow {
  const db = getDb();
  const result = db
    .prepare(
      `INSERT INTO wishes (guest_slug, name, message, status, ip_hash, created_at)
       VALUES (@guestSlug, @name, @message, @status, @ipHash, @now)`,
    )
    .run({ ...input, now: nowIso() });

  const row = db.prepare(`SELECT * FROM wishes WHERE id = ?`).get(result.lastInsertRowid) as
    | WishRow
    | undefined;

  if (!row) throw new Error('Ucapan gagal disimpan.');
  return row;
}

const PAGE_SIZE = 10;

export type WishPage = {
  items: PublicWish[];
  total: number;
  hasMore: boolean;
  page: number;
};

/** Daftar publik: hanya yang disetujui dan belum dihapus, 10 per halaman (US-11). */
export function listApprovedWishes(page: number): WishPage {
  const db = getDb();
  const safePage = Number.isFinite(page) && page > 0 ? Math.floor(page) : 1;
  const offset = (safePage - 1) * PAGE_SIZE;

  const { total } = db
    .prepare(`SELECT COUNT(*) AS total FROM wishes WHERE status = 'approved' AND deleted_at IS NULL`)
    .get() as { total: number };

  const items = db
    .prepare(
      `SELECT id, name, message, created_at
       FROM wishes
       WHERE status = 'approved' AND deleted_at IS NULL
       ORDER BY created_at DESC, id DESC
       LIMIT ? OFFSET ?`,
    )
    .all(PAGE_SIZE, offset) as PublicWish[];

  return { items, total, hasMore: offset + items.length < total, page: safePage };
}

export function listAllWishes(): WishRow[] {
  return getDb()
    .prepare(`SELECT * FROM wishes WHERE deleted_at IS NULL ORDER BY created_at DESC, id DESC`)
    .all() as WishRow[];
}

export function updateWishStatus(id: number, status: WishStatus): boolean {
  return getDb().prepare(`UPDATE wishes SET status = ? WHERE id = ? AND deleted_at IS NULL`).run(status, id)
    .changes > 0;
}

/** Soft delete — baris tetap tersimpan untuk jejak audit (US-15). */
export function softDeleteWish(id: number): boolean {
  return getDb().prepare(`UPDATE wishes SET deleted_at = ? WHERE id = ? AND deleted_at IS NULL`).run(
    nowIso(),
    id,
  ).changes > 0;
}

export type WishSummary = { pending: number; approved: number; rejected: number };

export function summarizeWishes(): WishSummary {
  const row = getDb()
    .prepare(
      `SELECT
         COALESCE(SUM(status = 'pending'), 0)  AS pending,
         COALESCE(SUM(status = 'approved'), 0) AS approved,
         COALESCE(SUM(status = 'rejected'), 0) AS rejected
       FROM wishes WHERE deleted_at IS NULL`,
    )
    .get() as WishSummary | undefined;

  return row ?? { pending: 0, approved: 0, rejected: 0 };
}

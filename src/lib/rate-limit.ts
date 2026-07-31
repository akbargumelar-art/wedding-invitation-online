import { createHash } from 'node:crypto';
import { getDb } from '@/lib/db';
import { env } from '@/lib/env';

/**
 * Rate limit fixed-window berbasis tabel SQLite (PRD §4.1).
 *
 * Cukup untuk skala acara ini (<200 tamu) dan menghindari Redis di VPS 1 GB.
 * Konsekuensi yang diterima: pada pergantian jendela, batas efektif bisa
 * mencapai 2x limit dalam waktu singkat — dapat diterima untuk anti-spam.
 */

export type RateLimitConfig = {
  /** Nama endpoint, menjadi bagian dari kunci. */
  key: string;
  limit: number;
  windowSeconds: number;
};

export const RATE_LIMITS = {
  rsvp: { key: 'rsvp', limit: 5, windowSeconds: 600 },
  wishes: { key: 'wishes', limit: 3, windowSeconds: 600 },
  wishesRead: { key: 'wishes-read', limit: 60, windowSeconds: 60 },
  envelope: { key: 'envelope', limit: 3, windowSeconds: 600 },
  track: { key: 'track', limit: 30, windowSeconds: 60 },
  revalidate: { key: 'revalidate', limit: 20, windowSeconds: 3600 },
  // Pengaman kasar terhadap banjir permintaan saja. Kontrol utama terhadap
  // tebak-kata-sandi adalah penguncian akun 15 menit setelah 5 kali gagal
  // (PRD §4.5); batas ini sengaja longgar agar penguncian itulah yang lebih
  // dulu bekerja, bukan tertutup oleh 429 yang membingungkan.
  adminLogin: { key: 'admin-login', limit: 30, windowSeconds: 600 },
  // Balasan WhatsApp per nomor tamu. Longgar untuk percakapan wajar — beberapa
  // kali salah ketik lalu memperbaiki adalah hal biasa — tetapi cukup untuk
  // menahan satu nomor membanjiri buku ucapan.
  inboundWhatsapp: { key: 'inbound-wa', limit: 20, windowSeconds: 3600 },
} as const satisfies Record<string, RateLimitConfig>;

export type RateLimitResult = {
  allowed: boolean;
  remaining: number;
  /** Detik sampai jendela berikutnya — dipakai untuk header Retry-After. */
  retryAfterSeconds: number;
};

/**
 * Hash IP dengan garam rahasia. IP mentah tidak pernah disimpan di mana pun
 * (PRD §4.5 / UU PDP): hash ini semata-mata mekanisme anti-spam.
 */
export function hashIp(ip: string): string {
  return createHash('sha256').update(`${ip}|${env.security.ipHashSalt}`).digest('hex');
}

/**
 * Ambil IP klien di belakang Caddy. Header `x-forwarded-for` bisa berisi rantai
 * proxy; entri paling kiri adalah klien asli menurut konfigurasi reverse proxy
 * kita sendiri (Caddy menimpa header ini, jadi tidak bisa dipalsukan tamu).
 */
export function clientIp(headers: Headers): string {
  const forwarded = headers.get('x-forwarded-for');
  if (forwarded) {
    const first = forwarded.split(',')[0]?.trim();
    if (first) return first;
  }
  return headers.get('x-real-ip')?.trim() || '0.0.0.0';
}

export function consumeRateLimit(config: RateLimitConfig, ipHash: string): RateLimitResult {
  const db = getDb();
  const nowMs = Date.now();
  const windowMs = config.windowSeconds * 1000;
  const windowStart = Math.floor(nowMs / windowMs) * windowMs;
  const key = `${config.key}:${ipHash}`;

  // Satu pernyataan atomik: mulai jendela baru bila window_start berbeda,
  // selain itu tambah hitungan.
  const row = db
    .prepare(
      `INSERT INTO rate_limits (key, window_start, hits)
       VALUES (@key, @windowStart, 1)
       ON CONFLICT(key) DO UPDATE SET
         window_start = @windowStart,
         hits = CASE WHEN rate_limits.window_start = @windowStart THEN rate_limits.hits + 1 ELSE 1 END
       RETURNING hits`,
    )
    .get({ key, windowStart: String(windowStart) }) as { hits: number } | undefined;

  const hits = row?.hits ?? 1;
  const retryAfterSeconds = Math.max(1, Math.ceil((windowStart + windowMs - nowMs) / 1000));

  return {
    allowed: hits <= config.limit,
    remaining: Math.max(0, config.limit - hits),
    retryAfterSeconds,
  };
}

/** Buang baris jendela lama agar tabel tidak tumbuh tanpa batas. */
export function pruneRateLimits(olderThanMs = 24 * 3600 * 1000): number {
  const cutoff = Date.now() - olderThanMs;
  return getDb().prepare(`DELETE FROM rate_limits WHERE CAST(window_start AS INTEGER) < ?`).run(cutoff)
    .changes;
}

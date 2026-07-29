/**
 * Skema SQLite Walimah (PRD §4.3).
 *
 * Ditulis sebagai konstanta TypeScript, bukan berkas .sql terpisah, supaya ikut
 * ter-bundle ke `.next/standalone` saat di-rsync ke VPS tanpa langkah salin
 * tambahan. Seluruh pernyataan idempoten: aman dijalankan setiap kali boot.
 */
export const SCHEMA_SQL = `
-- Konfirmasi kehadiran; satu baris per tamu (slug), UPSERT saat diubah.
CREATE TABLE IF NOT EXISTS rsvp (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  guest_slug   TEXT,                       -- NULL bila dari link umum
  name         TEXT NOT NULL,
  status       TEXT NOT NULL CHECK (status IN ('hadir','tidak_hadir','ragu')),
  pax          INTEGER NOT NULL DEFAULT 1 CHECK (pax BETWEEN 1 AND 5),
  message      TEXT,
  ip_hash      TEXT NOT NULL,              -- SHA-256(ip + salt), bukan IP mentah
  user_agent   TEXT,
  created_at   TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at   TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_rsvp_slug ON rsvp(guest_slug) WHERE guest_slug IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_rsvp_created ON rsvp(created_at DESC);

-- Buku ucapan & doa. Kolom deleted_at adalah tambahan atas skema PRD karena
-- US-15 meminta hapus bersifat soft delete (baris tetap ada untuk audit).
CREATE TABLE IF NOT EXISTS wishes (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  guest_slug   TEXT,
  name         TEXT NOT NULL,
  message      TEXT NOT NULL,
  status       TEXT NOT NULL DEFAULT 'pending'
               CHECK (status IN ('pending','approved','rejected')),
  ip_hash      TEXT NOT NULL,
  created_at   TEXT NOT NULL DEFAULT (datetime('now')),
  deleted_at   TEXT
);
CREATE INDEX IF NOT EXISTS idx_wishes_status ON wishes(status, created_at DESC);

-- Konfirmasi amplop digital (tidak menyimpan data pembayaran apa pun).
CREATE TABLE IF NOT EXISTS envelope_confirmations (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  guest_slug   TEXT,
  sender_name  TEXT NOT NULL,
  amount       INTEGER,                    -- rupiah, opsional
  method       TEXT NOT NULL CHECK (method IN ('qris','transfer','tunai')),
  note         TEXT,
  proof_file   TEXT,                       -- UUID nama file, bukan path asli
  status       TEXT NOT NULL DEFAULT 'pending'
               CHECK (status IN ('pending','verified','rejected')),
  ip_hash      TEXT NOT NULL,
  created_at   TEXT NOT NULL DEFAULT (datetime('now')),
  verified_at  TEXT
);
CREATE INDEX IF NOT EXISTS idx_envelope_status ON envelope_confirmations(status, created_at DESC);

-- Statistik kunjungan agregat (tanpa identitas).
CREATE TABLE IF NOT EXISTS visits (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  guest_slug   TEXT,
  visited_date TEXT NOT NULL,
  count        INTEGER NOT NULL DEFAULT 1,
  UNIQUE(guest_slug, visited_date)
);

-- Rate limiting berbasis jendela waktu tetap.
CREATE TABLE IF NOT EXISTS rate_limits (
  key          TEXT PRIMARY KEY,           -- "<endpoint>:<ip_hash>"
  window_start TEXT NOT NULL,
  hits         INTEGER NOT NULL DEFAULT 1
);

-- Jejak audit aksi admin.
CREATE TABLE IF NOT EXISTS audit_log (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  action       TEXT NOT NULL,
  target       TEXT,
  actor        TEXT NOT NULL,
  created_at   TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_audit_created ON audit_log(created_at DESC);

-- Antrean notifikasi keluar (WhatsApp / webhook).
--
-- Notifikasi TIDAK dikirim langsung di jalur request tamu: baris masuk ke sini
-- lebih dulu, lalu dikirim setelah respons diberikan. Gateway yang sedang mati
-- karena itu tidak pernah memperlambat atau menggagalkan kiriman tamu, dan
-- percobaan ulang dapat dilakukan cron tanpa kehilangan satu peristiwa pun.
CREATE TABLE IF NOT EXISTS notifications (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  event           TEXT NOT NULL CHECK (event IN ('rsvp','wish','envelope','visit')),
  payload         TEXT NOT NULL,             -- JSON, sudah bebas data sensitif
  status          TEXT NOT NULL DEFAULT 'pending'
                  CHECK (status IN ('pending','sent','failed')),
  attempts        INTEGER NOT NULL DEFAULT 0,
  last_error      TEXT,
  next_attempt_at TEXT NOT NULL DEFAULT (datetime('now')),
  created_at      TEXT NOT NULL DEFAULT (datetime('now')),
  sent_at         TEXT
);
CREATE INDEX IF NOT EXISTS idx_notifications_queue
  ON notifications(status, next_attempt_at);

-- Percobaan login admin — dasar penguncian 15 menit setelah 5 kali gagal
-- (PRD §4.5). Dicatat per identitas login, bukan per IP, agar tidak bisa
-- dilewati hanya dengan berganti jaringan.
CREATE TABLE IF NOT EXISTS login_attempts (
  identity        TEXT PRIMARY KEY,
  failures        INTEGER NOT NULL DEFAULT 0,
  locked_until    TEXT,
  last_attempt_at TEXT NOT NULL DEFAULT (datetime('now'))
);
`;

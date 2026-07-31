/**
 * Skema SQLite Walimah (PRD §4.3).
 *
 * Ditulis sebagai konstanta TypeScript, bukan berkas .sql terpisah, supaya ikut
 * ter-bundle ke `.next/standalone` saat di-rsync ke VPS tanpa langkah salin
 * tambahan. Seluruh pernyataan idempoten: aman dijalankan setiap kali boot.
 */
export const SCHEMA_SQL = `
-- =============================================================================
-- Isi undangan
--
-- Sejak v2 seluruh isi undangan diatur dari dashboard admin dan disimpan di
-- sini; tidak ada lagi Google Sheet sebagai sumber data. Konsekuensinya tabel
-- di bawah ini adalah SATU-SATUNYA salinan konten yang dimiliki mempelai, jadi
-- ia ikut dalam cakupan backup harian sama seperti data tamu.
-- =============================================================================

-- Pengaturan umum berbentuk kunci/nilai. Bentuk key/value dipertahankan (bukan
-- satu tabel berkolom-lebar) supaya menambah pengaturan baru cukup menambah
-- satu baris, tanpa migrasi ALTER TABLE di VPS yang sedang melayani tamu.
CREATE TABLE IF NOT EXISTS site_config (
  key        TEXT PRIMARY KEY,
  value      TEXT NOT NULL DEFAULT '',
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Rangkaian acara. Tidak punya kolom urutan: urutan tampil selalu diturunkan
-- dari tanggal + jam mulai, sehingga tidak mungkin ada acara yang tampil
-- sebelum acara yang waktunya lebih awal.
CREATE TABLE IF NOT EXISTS schedule (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  acara       TEXT NOT NULL,
  tanggal     TEXT NOT NULL,                 -- YYYY-MM-DD
  jam_mulai   TEXT NOT NULL DEFAULT '',      -- HH:MM
  jam_selesai TEXT NOT NULL DEFAULT '',
  zona        TEXT NOT NULL DEFAULT 'WIB',
  lokasi      TEXT NOT NULL DEFAULT '',
  catatan     TEXT NOT NULL DEFAULT '',
  gmaps_url   TEXT NOT NULL DEFAULT '',
  tampil      INTEGER NOT NULL DEFAULT 1,
  created_at  TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS gallery (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  url        TEXT NOT NULL,
  caption    TEXT NOT NULL DEFAULT '',
  urutan     INTEGER NOT NULL DEFAULT 0,
  tampil     INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_gallery_urutan ON gallery(urutan, id);

CREATE TABLE IF NOT EXISTS bank_accounts (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  bank       TEXT NOT NULL,
  nomor      TEXT NOT NULL,
  atas_nama  TEXT NOT NULL DEFAULT '',
  urutan     INTEGER NOT NULL DEFAULT 0,
  tampil     INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_accounts_urutan ON bank_accounts(urutan, id);

-- Daftar tamu undangan. Slug UNIQUE menegakkan di level database apa yang dulu
-- hanya bisa diperingatkan parser: dua tamu tidak boleh berbagi satu link.
CREATE TABLE IF NOT EXISTS guests (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  nama       TEXT NOT NULL,
  slug       TEXT NOT NULL UNIQUE,
  kategori   TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_guests_nama ON guests(nama);

-- Berkas gambar yang diunggah lewat dashboard (foto mempelai, galeri, QRIS).
-- Berbeda dari bukti transfer: berkas ini memang dimaksudkan tampil ke tamu,
-- karena itu disimpan di direktori terpisah dan disajikan tanpa autentikasi.
CREATE TABLE IF NOT EXISTS media (
  file_name  TEXT PRIMARY KEY,              -- UUID + ekstensi, bukan nama asli
  kind       TEXT NOT NULL,                 -- jpeg | png | webp
  bytes      INTEGER NOT NULL,
  label      TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_media_created ON media(created_at DESC);

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

-- =============================================================================
-- Integrasi WhatsApp (WAHA NOWEB)
-- =============================================================================

-- Pengaturan integrasi: base URL WAHA, nama sesi, kunci API, rahasia HMAC
-- webhook, templat pesan, dan rentang jeda kirim.
--
-- Disimpan TERPISAH dari site_config dengan sengaja. Isi site_config diserahkan
-- apa adanya ke parser konten yang melayani halaman tamu; menaruh kunci API di
-- tabel yang sama berarti satu kelalaian saja sudah cukup untuk membocorkannya.
-- Tabel ini tidak pernah disentuh jalur render tamu.
CREATE TABLE IF NOT EXISTS integrations (
  key        TEXT PRIMARY KEY,
  value      TEXT NOT NULL DEFAULT '',
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Antrean pengiriman undangan ke tamu.
--
-- Undangan TIDAK dikirim dalam satu tembakan: WhatsApp memblokir nomor yang
-- mengirim pesan beruntun ke banyak tujuan sekaligus, dan nomor yang diblokir
-- di tengah penyebaran undangan adalah kegagalan yang tidak dapat dipulihkan.
-- Baris masuk ke sini lebih dulu, lalu dikirim satu per satu dengan jeda acak.
CREATE TABLE IF NOT EXISTS invitation_outbox (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  guest_id     INTEGER NOT NULL,
  guest_slug   TEXT NOT NULL,
  guest_nama   TEXT NOT NULL,             -- disalin saat antre, agar riwayat tetap terbaca
  chat_id      TEXT NOT NULL,             -- 628xxx@c.us
  status       TEXT NOT NULL DEFAULT 'pending'
               CHECK (status IN ('pending','sent','failed','cancelled')),
  attempts     INTEGER NOT NULL DEFAULT 0,
  last_error   TEXT,
  created_at   TEXT NOT NULL DEFAULT (datetime('now')),
  sent_at      TEXT
);
CREATE INDEX IF NOT EXISTS idx_outbox_queue ON invitation_outbox(status, id);
CREATE INDEX IF NOT EXISTS idx_outbox_guest ON invitation_outbox(guest_id, created_at DESC);

-- Pesan masuk dari tamu yang sudah diproses.
--
-- Kuncinya adalah id pesan dari WAHA, dan itulah gunanya: WAHA mengirim ulang
-- webhook yang gagal, sehingga tanpa tabel ini satu ucapan bisa tercatat
-- berkali-kali dan satu RSVP bisa berubah-ubah sendiri.
CREATE TABLE IF NOT EXISTS inbound_messages (
  message_id TEXT PRIMARY KEY,
  chat_id    TEXT NOT NULL,
  guest_slug TEXT,
  body       TEXT NOT NULL DEFAULT '',
  action     TEXT NOT NULL,               -- rsvp | wish | envelope | help | ignored
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_inbound_created ON inbound_messages(created_at DESC);

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

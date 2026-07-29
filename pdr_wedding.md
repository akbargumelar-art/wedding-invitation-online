# PRD — Walimah: Web Undangan Pernikahan Digital Islami

| | |
|---|---|
| **Nama Produk** | Walimah (kerja: `walimah-invitation`) |
| **Versi Dokumen** | 1.0 |
| **Tanggal** | 28 Juli 2026 |
| **Pemilik Produk** | Akbar |
| **Status** | Draft — siap dieksekusi |
| **Metode Build** | Google Antigravity (agentic development platform) |
| **Target Deploy** | VPS pribadi, Ubuntu 24.04 LTS |

---

## Daftar Isi

1. [Executive Summary](#1-executive-summary)
2. [User Experience & Functionality](#2-user-experience--functionality)
3. [AI System Requirements (Antigravity)](#3-ai-system-requirements-antigravity)
4. [Technical Specifications](#4-technical-specifications)
5. [Risks & Roadmap](#5-risks--roadmap)
6. [Lampiran](#6-lampiran)

---

## 1. Executive Summary

### 1.1 Problem Statement

Undangan pernikahan digital yang beredar umumnya berbentuk layanan SaaS berlangganan: data tamu, ucapan, dan konfirmasi amplop tersimpan di server pihak ketiga, kustomisasi terbatas pada template, dan kontennya sulit diubah cepat menjelang hari-H. Sementara itu penyelenggara acara skala kecil (resepsi di cafe, ±100–200 tamu) butuh kendali penuh atas data, biaya mendekati nol setelah VPS sudah ada, dan proses edit konten yang bisa dikerjakan orang non-teknis.

### 1.2 Proposed Solution

Aplikasi web undangan satu halaman (single-page scroll) bertema islami sederhana, di-host sendiri di VPS Ubuntu, dengan **Google Sheet sebagai CMS** (semua teks, jadwal, foto, dan daftar tamu diedit di spreadsheet), **link personal per tamu**, **RSVP + buku ucapan**, dan **amplop digital berbasis QRIS statis + form konfirmasi transfer** yang datanya masuk ke database lokal dan diekspor balik ke Google Sheet.

### 1.3 Success Criteria

| # | KPI | Target | Cara Ukur |
|---|---|---|---|
| SC-1 | Lighthouse Mobile — Performance | ≥ 90 | Lighthouse CI, throttling "Slow 4G" |
| SC-2 | Lighthouse Mobile — Accessibility | ≥ 95 | Lighthouse CI |
| SC-3 | Largest Contentful Paint (LCP) | ≤ 2,0 detik di Slow 4G | WebPageTest / Lighthouse |
| SC-4 | Initial payload halaman utama | ≤ 500 KB (sebelum galeri di-lazy-load) | Chrome DevTools Network |
| SC-5 | Conversion RSVP | ≥ 60% dari tamu yang membuka link mengisi RSVP | `COUNT(rsvp) / COUNT(unique visit)` di dashboard |
| SC-6 | Waktu propagasi edit konten | ≤ 60 detik dari Sheet disimpan sampai tampil di web | Uji manual, 5 kali percobaan |
| SC-7 | Entry manual data amplop | 0 baris (100% tercatat otomatis dari form) | Rekap pasca-acara |
| SC-8 | Uptime periode H-14 s/d H+7 | ≥ 99,5% | Uptime Kuma / cron ping |
| SC-9 | Biaya operasional inkremental | ≤ Rp 50.000/bulan di luar biaya VPS eksisting | Tagihan domain + storage |
| SC-10 | Waktu build MVP | ≤ 7 hari kalender | Log commit |

---

## 2. User Experience & Functionality

### 2.1 User Personas

**P1 — Tamu Undangan (primer, ±95% traffic)**
Usia 20–60 tahun, membuka link dari WhatsApp di HP Android kelas menengah-bawah, jaringan 4G tidak stabil. Sebagian tidak terbiasa dengan form web. Perilaku khas: buka link → lihat nama sendiri → scroll cepat → cek tanggal & lokasi → tutup. Sebagian kecil mengisi ucapan dan mengirim amplop.

**P2 — Mempelai / Admin (Akbar)**
Menguasai teknis, tapi menjelang hari-H tidak punya waktu deploy ulang. Butuh ubah konten (jam berubah, foto ganti, tambah tamu) langsung dari HP tanpa menyentuh terminal.

**P3 — Panitia / Keluarga (sekunder)**
Non-teknis. Butuh melihat rekap: berapa yang konfirmasi hadir, berapa perkiraan porsi konsumsi, siapa saja yang sudah kirim amplop. Aksesnya read-only lewat Google Sheet, bukan lewat aplikasi.

### 2.2 User Flow Utama

```
WhatsApp (link personal)
   └─> https://domain.com/to/budi-santoso
         └─> [Cover] nama tamu tampil + tombol "Buka Undangan"
               └─> Scroll: Salam & Ayat -> Mempelai -> Jadwal (Akad & Resepsi)
                     -> Lokasi Cafe (peta + tombol Maps) -> Galeri
                     -> RSVP Form ---------------------> simpan ke SQLite
                     -> Ucapan & Doa -----------------> simpan ke SQLite (moderasi)
                     -> Amplop Digital
                          ├─ QRIS statis (tap untuk unduh/scan)
                          ├─ No. rekening (tombol Salin)
                          └─ Form Konfirmasi Transfer -> simpan + upload bukti
                     -> Penutup & Doa
```

### 2.3 User Stories & Acceptance Criteria

#### Modul A — Tampilan Undangan

**US-01 — Sapaan personal**
> Sebagai tamu, saya ingin melihat nama saya di halaman pembuka agar undangan terasa ditujukan khusus untuk saya.

**Acceptance Criteria:**
- Route `/to/[slug]` mengambil nama tamu dari tab `Tamu` di Google Sheet berdasarkan `slug`.
- Jika slug tidak ditemukan, halaman tetap tampil dengan sapaan fallback "Bapak/Ibu/Saudara/i" (HTTP 200, bukan 404).
- Nama tamu di-escape untuk mencegah XSS; maksimum 60 karakter, dipotong dengan elipsis jika lebih.
- Route `/` (tanpa slug) tetap dapat diakses sebagai undangan umum.
- Nama tamu juga otomatis mengisi field `nama` di form RSVP, Ucapan, dan Konfirmasi Amplop (dapat diedit tamu).

**US-02 — Halaman sampul (cover)**
> Sebagai tamu, saya ingin melihat sampul yang tenang sebelum masuk ke isi undangan.

**Acceptance Criteria:**
- Cover menempati 100svh (bukan 100vh, agar aman terhadap address bar mobile).
- Berisi: ornamen/kaligrafi, nama panggilan kedua mempelai, tanggal resepsi, sapaan personal, tombol "Buka Undangan".
- Body dikunci (`overflow: hidden`) sampai tombol ditekan.
- Menekan tombol memicu: unlock scroll, scroll halus ke seksi berikutnya, dan memulai backsound (jika diaktifkan di Config).
- Cover harus tampil sempurna pada viewport 320px–430px lebar.

**US-03 — Konten islami**
> Sebagai mempelai, saya ingin undangan memuat salam, ayat, dan doa sesuai adab agar sesuai nilai yang kami pegang.

**Acceptance Criteria:**
- Seksi pembuka menampilkan salam (Assalamu'alaikum Warahmatullahi Wabarakatuh) dan satu kutipan ayat yang teksnya diambil dari Sheet (`Config.quote_arab`, `Config.quote_terjemahan`, `Config.quote_sumber`) — **tidak di-hardcode**, agar mempelai bebas memilih.
- Teks Arab dirender dengan font Arab yang di-*self-host* (mis. Amiri/Scheherazade), `dir="rtl"`, `lang="ar"`, ukuran minimum 22px.
- Terjemahan dan sumber ayat ditampilkan di bawah teks Arab.
- Seksi penutup menampilkan doa penutup dan salam penutup dari Sheet.
- Tidak ada elemen visual yang menampilkan makhluk bernyawa selain foto mempelai (ornamen berbasis geometri/floral).

**US-04 — Profil mempelai**
> Sebagai tamu, saya ingin tahu nama lengkap kedua mempelai dan orang tuanya.

**Acceptance Criteria:**
- Menampilkan foto (dummy, dapat diganti dari Sheet), nama lengkap dengan format bin/binti, dan nama kedua orang tua ("Putra/Putri dari Bapak … & Ibu …").
- Tautan Instagram bersifat opsional; sembunyikan otomatis jika kolom di Sheet kosong.
- Urutan tampil (mempelai wanita dulu atau pria dulu) dikendalikan `Config.urutan_mempelai`.

**US-05 — Jadwal acara**
> Sebagai tamu, saya ingin tahu kapan akad dan resepsi berlangsung, lengkap dengan hitung mundur.

**Acceptance Criteria:**
- Jadwal dibaca dari tab `Jadwal` (multi-baris), sehingga bisa 1 acara atau 3 acara tanpa ubah kode.
- Setiap baris menampilkan: nama acara, hari & tanggal (format Indonesia lengkap, mis. "Sabtu, 12 September 2026"), jam mulai–selesai + zona waktu (WIB), lokasi, catatan.
- Countdown menampilkan hari, jam, menit, detik menuju acara pertama; setelah lewat, otomatis berganti teks "Alhamdulillah, acara telah terlaksana".
- Countdown dihitung dengan timezone tetap `Asia/Jakarta`, bukan timezone perangkat tamu.
- Tombol "Simpan ke Kalender" menghasilkan file `.ics` (dan tautan Google Calendar) yang berisi judul, waktu, dan alamat lokasi.

**US-06 — Lokasi resepsi (cafe)**
> Sebagai tamu, saya ingin langsung membuka rute ke cafe tanpa mengetik alamat.

**Acceptance Criteria:**
- Menampilkan nama cafe, alamat lengkap, dan catatan khusus (mis. "Parkir di basement, masuk lewat pintu samping") — semuanya dari Sheet.
- Tombol utama "Buka di Google Maps" membuka `Config.gmaps_url` di tab baru.
- Peta embed dimuat **lazy** (`loading="lazy"`, di-render hanya saat masuk viewport) agar tidak membebani LCP. Selama belum dimuat, tampilkan placeholder statis.
- Tersedia tombol "Salin Alamat".

**US-07 — Galeri foto**
> Sebagai tamu, saya ingin melihat beberapa foto mempelai.

**Acceptance Criteria:**
- Foto dibaca dari tab `Galeri` (kolom: urutan, url, caption, tampil).
- Seluruh foto awal berisi **data dummy** yang dapat diganti dengan mengubah URL di Sheet.
- Foto di-render via komponen gambar teroptimasi (WebP/AVIF, `srcset`, lazy loading, aspect-ratio terkunci untuk mencegah layout shift — CLS ≤ 0,1).
- Klik foto membuka lightbox dengan navigasi swipe dan tombol tutup.
- Baris dengan `tampil = FALSE` tidak dirender.

**US-08 — Mode syar'i (opsional)**
> Sebagai mempelai, saya ingin opsi menyembunyikan seluruh foto dan menggantinya dengan ornamen kaligrafi.

**Acceptance Criteria:**
- Flag `Config.mode_syari = TRUE` menyembunyikan foto mempelai dan seksi galeri, digantikan panel ornamen + nama.
- Perubahan flag berlaku dalam ≤ 60 detik tanpa deploy ulang.
- Layout tidak rusak (tidak ada ruang kosong menganga) saat mode aktif.

**US-09 — Backsound**
> Sebagai tamu, saya ingin kontrol penuh atas audio yang diputar.

**Acceptance Criteria:**
- Audio hanya dimuat setelah tamu menekan "Buka Undangan" (menghormati kebijakan autoplay browser dan menghemat kuota).
- Tombol mute/unmute mengambang, selalu terlihat, dengan `aria-label` yang jelas.
- Preferensi mute disimpan di `localStorage` selama sesi.
- Jika `Config.backsound_url` kosong, seluruh fitur audio tidak dirender.

#### Modul B — Interaksi Tamu

**US-10 — RSVP / daftar hadir**
> Sebagai tamu, saya ingin mengonfirmasi kehadiran agar tuan rumah bisa memperkirakan konsumsi.

**Acceptance Criteria:**
- Field: Nama (prefilled, wajib), Status (Hadir / Tidak Hadir / Masih Ragu — wajib), Jumlah orang (angka 1–5, hanya aktif jika status = Hadir), Pesan singkat (opsional, ≤ 300 karakter).
- Validasi di sisi klien **dan** server. Server menolak payload tidak valid dengan HTTP 422 dan pesan berbahasa Indonesia.
- Satu `slug` tamu hanya boleh satu RSVP aktif; pengiriman kedua bersifat **update**, bukan duplikat baru (`UPSERT` pada `guest_slug`).
- Setelah sukses, tampilkan konfirmasi inline ("Terima kasih, kehadiran Anda sudah tercatat") tanpa reload halaman, beserta ringkasan jawaban dan tombol "Ubah Jawaban".
- Jika `Config.rsvp_open = FALSE` atau tanggal melewati `Config.deadline_rsvp`, form diganti pesan penutupan dan endpoint API menolak dengan HTTP 403.
- Rate limit: maksimum 5 submit per IP per 10 menit.

**US-11 — Ucapan & doa**
> Sebagai tamu, saya ingin menuliskan ucapan dan membaca ucapan tamu lain.

**Acceptance Criteria:**
- Field: Nama (prefilled, wajib), Ucapan (wajib, 5–500 karakter).
- Input dibersihkan dari seluruh tag HTML sebelum disimpan; render sebagai teks biasa (tidak pernah `dangerouslySetInnerHTML`).
- `Config.moderasi_ucapan = TRUE` (default) berarti ucapan berstatus `pending` dan baru tampil setelah disetujui admin. Bila `FALSE`, ucapan langsung tampil.
- Daftar ucapan yang tampil dipaginasi 10 per halaman, urut terbaru, dengan tombol "Muat lebih banyak".
- Menampilkan total ucapan yang sudah tampil.
- Anti-spam: honeypot field tersembunyi + rate limit 3 ucapan per IP per 10 menit + penolakan submit yang terjadi < 3 detik setelah form dirender.

**US-12 — Amplop digital (QRIS + konfirmasi transfer)**
> Sebagai tamu, saya ingin mengirim tanda kasih secara digital dan memberi tahu tuan rumah bahwa saya sudah mengirim.

**Acceptance Criteria:**
- Seksi tertutup secara default (accordion), dibuka dengan tombol "Kirim Hadiah".
- Menampilkan gambar **QRIS statis** dari `Config.qris_image_url`, dengan tombol "Unduh QRIS" agar bisa di-scan dari galeri via aplikasi m-banking.
- Menampilkan blok rekening bank: nama bank, nomor rekening, atas nama — masing-masing dengan tombol "Salin" yang memberi umpan balik visual ("Tersalin ✓").
- Mendukung hingga 3 rekening (baris tab `Rekening` di Sheet).
- **Form Konfirmasi Transfer**: Nama pengirim (prefilled, wajib), Nominal (opsional, input numerik dengan format ribuan otomatis), Metode (QRIS / Transfer Bank / Tunai — wajib), Catatan (opsional, ≤ 200 karakter), Upload bukti (opsional).
- Upload bukti: hanya `image/jpeg`, `image/png`, `image/webp`; maksimum 2 MB; nama file di-*rename* menjadi UUID; disimpan di direktori di luar web root dan hanya dapat diakses lewat route admin terautentikasi.
- Semua konfirmasi berstatus `pending` sampai admin memverifikasi. Aplikasi **tidak pernah** mengklaim pembayaran sudah diterima secara otomatis.
- Menampilkan disclaimer: "Kehadiran dan doa Anda sudah lebih dari cukup bagi kami."
- Rate limit: 3 konfirmasi per IP per 10 menit.

**US-13 — Bagikan undangan**
> Sebagai mempelai, saya ingin menyebar link personal per tamu lewat WhatsApp dengan cepat.

**Acceptance Criteria:**
- Kolom terhitung di tab `Tamu` menghasilkan link personal lengkap (`https://domain.com/to/<slug>`) dan tautan `wa.me` berisi template pesan yang sudah di-*URL-encode*.
- Slug dibuat otomatis dari nama (lowercase, tanpa diakritik, spasi → tanda hubung) dan diberi sufiks angka bila duplikat.
- Setiap halaman memiliki meta Open Graph (judul, deskripsi, gambar 1200×630) agar preview WhatsApp tampil rapi. Gambar OG bersifat statis (bukan per-tamu) untuk menjaga performa.

#### Modul C — Administrasi

**US-14 — Google Sheet sebagai CMS**
> Sebagai admin, saya ingin mengubah seluruh konten dari spreadsheet lewat HP tanpa deploy ulang.

**Acceptance Criteria:**
- Aplikasi membaca 5 tab: `Config`, `Jadwal`, `Galeri`, `Rekening`, `Tamu` (skema lengkap di Lampiran A).
- Data di-cache dengan revalidasi 60 detik (ISR); tersedia route `/api/revalidate?secret=…` untuk memaksa refresh instan.
- Bila Sheets API gagal (kuota/jaringan/izin dicabut), aplikasi **wajib** memakai snapshot JSON terakhir yang tersimpan di disk dan tetap tampil normal, sambil mencatat error ke log. Halaman error tidak boleh pernah tampil ke tamu.
- Snapshot disegarkan setiap kali fetch berhasil.
- Baris kosong dan kolom tak dikenal diabaikan tanpa membuat aplikasi gagal.

**US-15 — Dashboard admin**
> Sebagai admin, saya ingin melihat rekap dan memoderasi kiriman tamu.

**Acceptance Criteria:**
- Route `/admin` dilindungi autentikasi (lihat §4.5). Semua route `/admin/*` dan `/api/admin/*` menolak akses tanpa sesi valid (HTTP 401).
- Kartu ringkasan: total undangan terkirim, total membuka undangan, Hadir / Tidak Hadir / Ragu, total perkiraan orang (`SUM(pax)`), total ucapan (pending vs disetujui), total konfirmasi amplop (pending vs terverifikasi) dan akumulasi nominal.
- Tabel ucapan dengan aksi Setujui / Tolak / Hapus (soft delete).
- Tabel konfirmasi amplop dengan aksi Verifikasi / Tolak dan pratinjau bukti transfer.
- Tombol "Export ke Google Sheet" menulis ke tab `Export_RSVP`, `Export_Ucapan`, `Export_Amplop`.
- Tombol "Unduh CSV" untuk masing-masing tabel.
- Dashboard responsif dan dapat digunakan dari layar 390px.

**US-16 — Ekspor & backup otomatis**
> Sebagai admin, saya ingin data aman meski VPS bermasalah.

**Acceptance Criteria:**
- Cron harian (02:00 WIB) melakukan `VACUUM INTO` SQLite ke folder backup, retensi 14 versi terakhir.
- Cron tiap 6 jam melakukan sinkronisasi data ke tab Export di Google Sheet (idempoten — menulis ulang seluruh tab, bukan menambah duplikat).
- Kegagalan cron tercatat di log dan dapat dilihat lewat `journalctl`.

### 2.4 Non-Goals (Tidak Dibangun)

Ditetapkan secara eksplisit untuk melindungi timeline:

- ❌ QR check-in tamu di lokasi acara dan aplikasi pemindai panitia.
- ❌ Payment gateway otomatis (Midtrans/Xendit) dan rekonsiliasi pembayaran otomatis.
- ❌ Registrasi/login untuk tamu.
- ❌ Multi-tenant / mode SaaS untuk klien lain (dipertimbangkan di v2.0).
- ❌ Live streaming, chat realtime, atau notifikasi push.
- ❌ Katalog souvenir / e-commerce.
- ❌ Aplikasi mobile native.
- ❌ Bahasa selain Indonesia (Inggris dipertimbangkan di v1.2).
- ❌ Editor tema WYSIWYG — kustomisasi visual dilakukan lewat design token di kode.

---

## 3. AI System Requirements (Antigravity)

Proyek ini dibangun dengan **Google Antigravity**, platform pengembangan agentik yang menjalankan agen secara otonom lintas editor, terminal, dan browser. Bagian ini menetapkan bagaimana agen dipakai, dibatasi, dan diverifikasi.

### 3.1 Konfigurasi Agen

| Aspek | Ketentuan |
|---|---|
| **Mode default** | *Agent-assisted* — agen mengeksekusi otomatisasi aman, developer tetap memegang kendali. |
| **Mode untuk area sensitif** | *Review-driven* — wajib untuk: modul amplop/QRIS, autentikasi admin, penanganan file upload, skrip deploy, dan apa pun yang menyentuh `.env`. |
| **Mode untuk scaffolding** | *Agent-driven* boleh dipakai untuk seksi UI statis dan komponen presentasional. |
| **Model** | Model reasoning kelas atas untuk perencanaan arsitektur & refactor; model cepat untuk perubahan UI berulang. Model dapat diganti dalam sesi yang sama. |
| **Knowledge base** | Simpan sebagai konteks persisten: design token, skema Google Sheet, kontrak API, dan aturan keamanan di §4.5. |

### 3.2 Tool & Integrasi yang Dibutuhkan Agen

| Tool | Kegunaan | Batasan |
|---|---|---|
| Editor + filesystem | Scaffolding Next.js, komponen, route API | Dilarang menyentuh `.env*`, `credentials/*.json`, `data/*.db` |
| Terminal | `npm ci`, `npm run build`, migrasi SQLite, uji lokal | Dilarang menjalankan perintah remote/SSH ke VPS produksi tanpa persetujuan eksplisit |
| Browser-in-the-loop | Verifikasi visual & fungsional otomatis | Wajib mengambil screenshot pada 3 viewport: 390px, 768px, 1280px |
| Git | Branch per fitur, commit terstruktur | Dilarang `push --force`; dilarang commit ke `main` tanpa review |
| Lighthouse CI | Cek performa & aksesibilitas | Jalankan pada setiap PR |

### 3.3 Struktur Task untuk Agen

Pecah pekerjaan menjadi task yang dapat diverifikasi mandiri — hindari satu prompt raksasa:

1. `T-01` Scaffold proyek + design token + font self-host.
2. `T-02` Lapisan data: klien Google Sheets, tipe TypeScript, snapshot fallback, cache ISR.
3. `T-03` Skema SQLite + lapisan repository + migrasi.
4. `T-04` Seksi UI statis (Cover, Salam, Mempelai, Jadwal, Lokasi, Galeri, Penutup).
5. `T-05` Route API + validasi + rate limit (RSVP, Ucapan, Amplop).
6. `T-06` Form-form tamu beserta state, validasi, dan optimistic UI.
7. `T-07` Modul amplop (QRIS, salin rekening, upload bukti) — **review-driven**.
8. `T-08` Autentikasi admin + dashboard + moderasi — **review-driven**.
9. `T-09` Ekspor ke Google Sheet + skrip cron backup.
10. `T-10` Hardening, Lighthouse pass, konfigurasi deploy (Caddy, systemd/PM2) — **review-driven**.

### 3.4 Evaluation Strategy

Karena agen menulis mayoritas kode, verifikasi harus otomatis dan eksplisit — bukan sekadar "kelihatannya jalan".

**Verifikasi per-task (dilakukan agen, bukti berupa artifact):**
- Screenshot 3 viewport untuk setiap seksi UI, dilampirkan pada task.
- `npm run build` harus lolos tanpa error TypeScript (mode `strict`).
- ESLint tanpa error.

**Test suite (wajib ada sebelum MVP dinyatakan selesai):**

| Jenis | Cakupan | Kriteria Lulus |
|---|---|---|
| Unit (Vitest) | Parser Sheet, generator slug, validator payload, logika countdown & timezone | ≥ 80% coverage pada `lib/` |
| Integrasi | 3 route API: happy path, payload invalid (422), rate limit terlampaui (429), RSVP tertutup (403) | 100% skenario lulus |
| E2E (Playwright) | 8 skenario di Lampiran C | 100% lulus |
| Performa | Lighthouse CI mobile | Performance ≥ 90, Accessibility ≥ 95, Best Practices ≥ 95 |
| Ketahanan | Simulasi Sheets API gagal (kredensial dicabut) | Halaman tetap tampil dari snapshot, 0 error di layar tamu |

**Aturan penerimaan output agen:**
- Setiap PR agen harus menyertakan ringkasan perubahan, screenshot, dan hasil test.
- Perubahan pada file di daftar sensitif (§3.2) wajib dibaca baris per baris oleh manusia.
- Nilai yang di-*hardcode* (nama, tanggal, nomor rekening, URL QRIS) ditolak — semuanya harus berasal dari Sheet atau env.

---

## 4. Technical Specifications

### 4.1 Tech Stack

| Lapisan | Pilihan | Alasan |
|---|---|---|
| Framework | Next.js 15 (App Router) + TypeScript strict | ISR cocok untuk pola "CMS lambat berubah + traffic burst", satu proses Node untuk web + API |
| Styling | Tailwind CSS + CSS variables sebagai design token | Cepat diiterasi agen, bundle kecil |
| Animasi | CSS transitions + Intersection Observer | Menghindari dependensi animasi berat demi budget performa |
| Data konten | Google Sheets API v4 (service account, read-only) | Sesuai keputusan: admin non-teknis mengedit dari HP |
| Data transaksional | SQLite (`better-sqlite3`, mode WAL) | Beban tulis rendah (<500 baris), nol proses tambahan, backup = 1 file |
| Validasi | Zod (dipakai bersama di klien & server) | Satu sumber kebenaran skema |
| Rate limit | Tabel SQLite berbasis jendela waktu (fixed window) | Tidak perlu Redis di VPS kecil |
| Auth admin | NextAuth Credentials + hash Argon2, sesi cookie `httpOnly` | Cukup untuk satu akun admin |
| Proses | systemd service (alternatif: PM2) | Auto-restart, log ke journald |
| Reverse proxy | Caddy 2 | HTTPS otomatis via Let's Encrypt, konfigurasi ringkas |
| CDN/WAF (opsional) | Cloudflare paket gratis | Peredam lonjakan traffic H-1 |

**Spesifikasi VPS minimum:** 1 vCPU, 1 GB RAM, 20 GB SSD, Ubuntu 24.04 LTS.
**Catatan penting:** build Next.js pada RAM 1 GB rawan OOM. Wajib salah satu — aktifkan swap 2 GB, atau build di mesin lokal/CI lalu `rsync` folder `.next/standalone` ke VPS.

### 4.2 Architecture Overview

```
┌────────────────────┐        Sheets API v4 (read-only, 60s ISR)
│   Google Sheet     │◀───────────────────────────────┐
│  (CMS + daftar     │                                │
│   tamu + export)   │◀──── write (cron 6 jam) ────┐  │
└────────────────────┘                             │  │
                                                   │  │
  Tamu (HP/4G)                                     │  │
       │ HTTPS                                     │  │
       ▼                                           │  │
┌────────────────────┐   :443    ┌─────────────────┴──┴────────────┐
│      Caddy 2       │──────────▶│  Next.js 15 (systemd, :3000)    │
│  TLS otomatis      │           │  ├── / dan /to/[slug]  (ISR)    │
│  header keamanan   │           │  ├── /api/rsvp|wishes|envelope  │
│  batas ukuran body │           │  ├── /admin/* (auth)            │
└────────────────────┘           │  └── /api/cron/* (secret)       │
                                 └──────────┬──────────────────────┘
                                            │
                        ┌───────────────────┼───────────────────┐
                        ▼                   ▼                   ▼
              ┌──────────────┐   ┌────────────────┐   ┌──────────────────┐
              │ SQLite (WAL) │   │ /var/walimah/  │   │ snapshot.json    │
              │ data/app.db  │   │ uploads/       │   │ (fallback Sheet) │
              └──────┬───────┘   │ (di luar web   │   └──────────────────┘
                     │           │  root)         │
                     ▼           └────────────────┘
              cron 02:00 → backup harian (retensi 14)
```

**Prinsip aliran data:**
- **Baca konten** → selalu dari cache ISR; Sheets API tidak pernah dipanggil pada request tamu secara sinkron.
- **Tulis interaksi** → langsung ke SQLite (transaksi sinkron, latensi < 10 ms).
- **Sinkronisasi balik** → hanya lewat cron, tidak pernah pada jalur request tamu.

### 4.3 Skema Data (SQLite)

```sql
-- Konfirmasi kehadiran; satu baris per tamu (slug), UPSERT saat diubah
CREATE TABLE rsvp (
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
CREATE UNIQUE INDEX idx_rsvp_slug ON rsvp(guest_slug) WHERE guest_slug IS NOT NULL;

-- Buku ucapan & doa
CREATE TABLE wishes (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  guest_slug   TEXT,
  name         TEXT NOT NULL,
  message      TEXT NOT NULL,
  status       TEXT NOT NULL DEFAULT 'pending'
               CHECK (status IN ('pending','approved','rejected')),
  ip_hash      TEXT NOT NULL,
  created_at   TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_wishes_status ON wishes(status, created_at DESC);

-- Konfirmasi amplop digital (tidak menyimpan data pembayaran apa pun)
CREATE TABLE envelope_confirmations (
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

-- Statistik kunjungan agregat (tanpa identitas)
CREATE TABLE visits (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  guest_slug   TEXT,
  visited_date TEXT NOT NULL,
  count        INTEGER NOT NULL DEFAULT 1,
  UNIQUE(guest_slug, visited_date)
);

-- Rate limiting berbasis jendela waktu
CREATE TABLE rate_limits (
  key          TEXT PRIMARY KEY,           -- "<endpoint>:<ip_hash>"
  window_start TEXT NOT NULL,
  hits         INTEGER NOT NULL DEFAULT 1
);

-- Jejak audit aksi admin
CREATE TABLE audit_log (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  action       TEXT NOT NULL,
  target       TEXT,
  actor        TEXT NOT NULL,
  created_at   TEXT NOT NULL DEFAULT (datetime('now'))
);
```

### 4.4 Kontrak API

| Method | Endpoint | Auth | Body | Respons | Rate limit |
|---|---|---|---|---|---|
| `POST` | `/api/rsvp` | — | `{slug?, name, status, pax, message?}` | `201` / `422` / `403` / `429` | 5 / 10 mnt / IP |
| `POST` | `/api/wishes` | — | `{slug?, name, message, hp}` (`hp` = honeypot) | `201` / `422` / `429` | 3 / 10 mnt / IP |
| `GET` | `/api/wishes?page=n` | — | — | `200` `{items[], total, hasMore}` | 60 / mnt / IP |
| `POST` | `/api/envelope` | — | `multipart`: `{slug?, sender_name, amount?, method, note?, proof?}` | `201` / `413` / `422` / `429` | 3 / 10 mnt / IP |
| `POST` | `/api/track` | — | `{slug}` | `204` | 30 / mnt / IP |
| `GET` | `/api/admin/summary` | Sesi | — | `200` | — |
| `PATCH` | `/api/admin/wishes/[id]` | Sesi | `{status}` | `200` | — |
| `PATCH` | `/api/admin/envelope/[id]` | Sesi | `{status}` | `200` | — |
| `GET` | `/api/admin/proof/[file]` | Sesi | — | `200` (stream) / `404` | — |
| `POST` | `/api/admin/export` | Sesi | — | `200` | 6 / jam |
| `POST` | `/api/revalidate` | Secret | `{secret}` | `200` | 20 / jam |
| `POST` | `/api/cron/backup` | Secret | `{secret}` | `200` | — |

**Aturan umum:** seluruh respons error memakai bentuk `{ error: { code, message } }` dengan `message` berbahasa Indonesia dan aman ditampilkan ke tamu. Stack trace tidak pernah dikirim ke klien.

### 4.5 Security & Privacy

**Kredensial**
- Service account Google hanya diberi scope `spreadsheets.readonly` untuk pembacaan; akun terpisah dengan scope tulis dipakai khusus untuk ekspor cron.
- Spreadsheet dibagikan ke email service account, **bukan** disetel "siapa saja yang memiliki tautan".
- File kredensial JSON disimpan di `/etc/walimah/credentials.json`, `chmod 600`, pemilik user layanan. `.env` dan `credentials/` masuk `.gitignore` dan diverifikasi tidak pernah masuk riwayat git.

**Input & upload**
- Semua input divalidasi ulang di server dengan Zod; tag HTML dibuang total.
- Upload dibatasi: MIME diperiksa dari *magic bytes* (bukan hanya ekstensi/header), maksimum 2 MB, disimpan dengan nama UUID di `/var/walimah/uploads` (di luar web root), tidak pernah dieksekusi.
- Caddy membatasi ukuran body request ke 3 MB.

**Privasi data tamu (UU PDP No. 27/2022)**
- Data yang dikumpulkan dibatasi seminimal mungkin: nama, status kehadiran, pesan. **Tidak** menyimpan alamat IP mentah — hanya hash SHA-256 bergaram, dan hanya sebagai mekanisme anti-spam.
- Tidak memasang pelacak pihak ketiga (tanpa Google Analytics, tanpa pixel iklan). Statistik kunjungan bersifat agregat dan disimpan lokal.
- Catatan privasi singkat ditampilkan di bawah setiap form: data hanya digunakan untuk keperluan acara.
- **Retensi:** seluruh data tamu dihapus dari server maksimum 90 hari setelah acara; salinan final disimpan mempelai di Google Sheet pribadi. Sediakan skrip `npm run purge` untuk menjalankan penghapusan ini.
- Bukti transfer dihapus 30 hari setelah diverifikasi.

**Keamanan aplikasi & server**
- Header via Caddy: `Strict-Transport-Security`, `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`, `X-Frame-Options: SAMEORIGIN`, dan CSP yang mengizinkan hanya domain sendiri, Google Maps embed, dan host gambar yang dipakai.
- Endpoint admin memakai cookie sesi `httpOnly` + `SameSite=Lax` + proteksi CSRF, dengan penguncian akun 15 menit setelah 5 kali gagal login.
- Kata sandi admin di-hash Argon2id; tidak ada akun default.
- `ufw`: hanya port 22, 80, 443. SSH dengan kunci publik, `PasswordAuthentication no`. `fail2ban` aktif. `unattended-upgrades` aktif untuk patch keamanan.
- QRIS: gambar disajikan dari domain sendiri (bukan hotlink), dan **tidak ada** endpoint yang memungkinkan penggantian gambar QRIS dari sisi publik — hanya lewat Sheet yang aksesnya terbatas. Ini mitigasi utama risiko penukaran QRIS oleh pihak lain.

### 4.6 Budget Performa

| Metrik | Anggaran |
|---|---|
| JS awal (terkompresi) | ≤ 150 KB |
| CSS | ≤ 30 KB |
| Gambar cover (LCP) | ≤ 120 KB, AVIF/WebP, `priority` |
| Total transfer sebelum galeri | ≤ 500 KB |
| Font | 2 keluarga, subset `latin` + `arabic`, `woff2`, `font-display: swap` |
| CLS | ≤ 0,1 |
| TBT | ≤ 200 ms |

Semua gambar wajib melalui optimasi build (target lebar maksimum 1600px). Peta, galeri, dan audio dimuat malas.

---

## 5. Risks & Roadmap

### 5.1 Phased Rollout

**MVP — target H+7 (wajib selesai)**
Cover personal · konten islami dari Sheet · profil mempelai · jadwal + countdown · lokasi cafe + Maps · galeri dummy · RSVP · ucapan dengan moderasi · amplop QRIS + salin rekening + form konfirmasi (tanpa upload bukti) · Google Sheet sebagai CMS · link personal per tamu · deploy VPS + HTTPS.
*Definition of Done:* seluruh AC modul A & B lulus, Lighthouse ≥ 90/95, live di domain dengan HTTPS valid.

**v1.1 — target H+14**
Dashboard admin & moderasi · upload bukti transfer · ekspor otomatis ke Google Sheet · backup cron · mode syar'i · generator link WhatsApp di Sheet · statistik kunjungan.

**v1.2 — target H+21 (nice to have)**
Love story timeline · lightbox galeri dengan swipe · animasi scroll halus · PWA (dapat dibuka offline setelah kunjungan pertama) · versi bahasa Inggris · halaman "Ucapan" berdiri sendiri untuk ditayangkan di layar acara.

**v2.0 — pasca-acara (opsional, komersial)**
Multi-tenant (satu instalasi melayani banyak klien) · 3 pilihan tema · self-service onboarding lewat template Sheet · integrasi payment gateway. Keputusan ini ditunda sampai acara selesai dan dievaluasi.

### 5.2 Technical Risks

| ID | Risiko | Dampak | Peluang | Mitigasi |
|---|---|---|---|---|
| R-1 | Kuota/latensi Google Sheets API, atau izin service account dicabut | Tinggi | Sedang | ISR 60 dtk + snapshot JSON fallback wajib; tamu tidak pernah menunggu Sheets API |
| R-2 | Salah edit di Sheet merusak tampilan (baris terhapus, format tanggal berubah) | Tinggi | **Tinggi** | Validasi Zod pada lapisan parser dengan nilai default; baris invalid dilewati dan dicatat, bukan membuat crash; proteksi range di Sheet |
| R-3 | OOM saat build di VPS 1 GB | Sedang | Tinggi | Swap 2 GB atau build di lokal lalu rsync `standalone` |
| R-4 | Lonjakan traffic saat undangan disebar massal | Tinggi | Sedang | Halaman ter-cache statis + Cloudflare gratis di depan; uji beban 200 concurrent sebelum sebar |
| R-5 | Spam/ucapan tidak pantas tampil publik | Sedang | Sedang | Moderasi default aktif + honeypot + rate limit + tombol hapus cepat di HP |
| R-6 | Penyalahgunaan QRIS (gambar ditukar/disalahgunakan) | **Tinggi** | Rendah | QRIS hanya dari domain sendiri, tidak ada endpoint publik untuk menggantinya, verifikasi manual di m-banking; aplikasi tidak pernah mengklaim dana diterima |
| R-7 | Kehilangan data karena VPS bermasalah | Tinggi | Rendah | Backup harian + sinkronisasi 6 jam ke Sheet; uji restore sekali sebelum acara |
| R-8 | Sertifikat TLS gagal perpanjang saat hari-H | Tinggi | Rendah | Caddy auto-renew + monitor kedaluwarsa; cek manual H-3 |
| R-9 | Data dummy (foto/tanggal/rekening) tertinggal saat live | **Tinggi** | Sedang | Checklist pra-rilis wajib (Lampiran D); banner peringatan "MODE DUMMY" tampil selama `Config.is_draft = TRUE` |
| R-10 | Agen Antigravity mengubah file sensitif atau meng-hardcode nilai | Sedang | Sedang | Mode review-driven untuk file sensitif; `.gitignore` diverifikasi; review manual pada PR yang menyentuh auth/amplop/deploy |
| R-11 | Perbedaan timezone perangkat tamu membuat countdown salah | Sedang | Sedang | Semua perhitungan waktu dipaksa `Asia/Jakarta` di sisi server |
| R-12 | Tamu bingung mengisi form (persona non-teknis) | Sedang | Sedang | Field minimal, label bahasa Indonesia sederhana, prefilled nama, konfirmasi visual jelas; uji ke 3 orang di luar tim sebelum sebar |

---

## 6. Lampiran

### Lampiran A — Skema Google Sheet

**Tab `Config`** (2 kolom: `key`, `value`)

| key | contoh value |
|---|---|
| `is_draft` | `TRUE` |
| `mode_syari` | `FALSE` |
| `urutan_mempelai` | `wanita_dulu` |
| `pria_panggilan` | `Ahmad` |
| `pria_nama_lengkap` | `Ahmad Fauzi, S.Kom.` |
| `pria_bin` | `bin Abdullah` |
| `pria_ayah` | `Bapak Abdullah` |
| `pria_ibu` | `Ibu Siti Aminah` |
| `pria_foto` | `/img/dummy-pria.jpg` |
| `pria_ig` | *(kosong = disembunyikan)* |
| `wanita_panggilan` | `Fatimah` |
| `wanita_nama_lengkap` | `Fatimah Azzahra, S.Pd.` |
| `wanita_binti` | `binti Sulaiman` |
| `wanita_ayah` | `Bapak Sulaiman` |
| `wanita_ibu` | `Ibu Khadijah` |
| `wanita_foto` | `/img/dummy-wanita.jpg` |
| `wanita_ig` | |
| `quote_arab` | *(teks ayat pilihan)* |
| `quote_terjemahan` | *(terjemahan)* |
| `quote_sumber` | `QS. Ar-Rum: 21` |
| `salam_pembuka` | `Assalamu'alaikum Warahmatullahi Wabarakatuh` |
| `kalimat_pembuka` | *(paragraf undangan)* |
| `kalimat_penutup` | *(paragraf penutup)* |
| `venue_nama` | `Kopi Senja Cafe & Resto` |
| `venue_alamat` | `Jl. Contoh No. 12, Indramayu` |
| `venue_catatan` | `Parkir tersedia di sisi timur` |
| `gmaps_url` | `https://maps.app.goo.gl/xxxx` |
| `gmaps_embed` | `https://www.google.com/maps/embed?...` |
| `qris_image_url` | `/img/qris.png` |
| `qris_nama_merchant` | `Ahmad Fauzi` |
| `backsound_url` | `/audio/instrumental.mp3` |
| `rsvp_open` | `TRUE` |
| `deadline_rsvp` | `2026-09-08` |
| `moderasi_ucapan` | `TRUE` |
| `og_image` | `/img/og.jpg` |

**Tab `Jadwal`** — `acara` · `tanggal (YYYY-MM-DD)` · `jam_mulai (HH:mm)` · `jam_selesai` · `zona (WIB)` · `lokasi` · `catatan` · `tampil`

**Tab `Galeri`** — `urutan` · `url` · `caption` · `tampil`

**Tab `Rekening`** — `bank` · `nomor` · `atas_nama` · `tampil`

**Tab `Tamu`** — `nama` · `slug` · `kategori` · `no_wa` · `link` *(formula)* · `pesan_wa` *(formula)* · `status_kirim`

Formula link (kolom `link`, baris 2):
```
=IF(B2="";"";"https://domain.com/to/"&B2)
```
Formula tautan WhatsApp siap klik (kolom `pesan_wa`):
```
=IF(D2="";"";HYPERLINK("https://wa.me/"&D2&"?text="&ENCODEURL(
"Assalamu'alaikum Wr. Wb."&CHAR(10)&CHAR(10)&
"Kepada Yth. "&A2&CHAR(10)&
"Tanpa mengurangi rasa hormat, kami mengundang Bapak/Ibu/Saudara/i untuk hadir di acara pernikahan kami."&CHAR(10)&CHAR(10)&
"Berikut link undangan kami:"&CHAR(10)&E2&CHAR(10)&CHAR(10)&
"Merupakan suatu kehormatan bagi kami apabila berkenan hadir dan memberikan doa restu."&CHAR(10)&CHAR(10)&
"Wassalamu'alaikum Wr. Wb."); "Kirim WA"))
```

**Tab `Export_RSVP` / `Export_Ucapan` / `Export_Amplop`** — ditulis otomatis oleh sistem. **Jangan diedit manual** (isinya ditimpa setiap sinkronisasi).

### Lampiran B — Environment Variables

```dotenv
# Aplikasi
NEXT_PUBLIC_SITE_URL=https://undangan.domain.com
NODE_ENV=production
PORT=3000

# Google Sheets
GOOGLE_SHEET_ID=1AbC...xyz
GOOGLE_CREDENTIALS_PATH=/etc/walimah/credentials.json
SHEET_CACHE_TTL=60
SHEET_SNAPSHOT_PATH=/var/walimah/snapshot.json

# Database & upload
DATABASE_PATH=/var/walimah/data/app.db
UPLOAD_DIR=/var/walimah/uploads
MAX_UPLOAD_BYTES=2097152

# Keamanan
ADMIN_USERNAME=admin
ADMIN_PASSWORD_HASH=$argon2id$v=19$...
AUTH_SECRET=<openssl rand -base64 32>
IP_HASH_SALT=<openssl rand -hex 16>
REVALIDATE_SECRET=<openssl rand -hex 24>
CRON_SECRET=<openssl rand -hex 24>

# Backup
BACKUP_DIR=/var/walimah/backups
BACKUP_KEEP=14
```

### Lampiran C — Skenario E2E Wajib

1. Buka `/to/budi-santoso` → nama "Budi Santoso" tampil di cover.
2. Buka `/to/slug-tidak-ada` → halaman tetap tampil dengan sapaan fallback, status 200.
3. Tekan "Buka Undangan" → scroll terbuka, audio mulai, tombol mute berfungsi.
4. Isi RSVP "Hadir, 2 orang" → muncul konfirmasi; muat ulang halaman → jawaban tersimpan dan dapat diubah, tidak membuat baris duplikat.
5. Kirim ucapan → dengan moderasi aktif, ucapan **tidak** langsung tampil; setelah admin menyetujui, ucapan muncul.
6. Kirim 4 ucapan berturut-turut dari IP sama → percobaan ke-4 ditolak dengan 429 dan pesan berbahasa Indonesia.
7. Buka seksi amplop → salin nomor rekening berhasil; kirim konfirmasi transfer → status `pending` di dashboard admin.
8. Upload file 5 MB sebagai bukti → ditolak dengan pesan jelas, tidak ada file tersimpan di server.
9. Ubah `venue_nama` di Sheet → dalam ≤ 60 detik nilai baru tampil di web.
10. Cabut akses service account → halaman tetap tampil normal dari snapshot; error tercatat di log.
11. Akses `/admin` tanpa login → dialihkan ke halaman login; akses `/api/admin/summary` tanpa sesi → 401.
12. Setel `rsvp_open = FALSE` → form berganti pesan penutupan dan `POST /api/rsvp` mengembalikan 403.

### Lampiran D — Checklist Pra-Rilis (wajib dicentang sebelum sebar link)

**Konten**
- [ ] Semua foto dummy sudah diganti foto asli
- [ ] Nama lengkap, bin/binti, dan nama orang tua sudah diverifikasi ejaannya oleh kedua keluarga
- [ ] Tanggal, jam, dan zona waktu akad & resepsi sudah benar
- [ ] Alamat cafe dan link Google Maps diuji dari HP orang lain (bukan hanya perangkat sendiri)
- [ ] Teks ayat dan terjemahan sudah diperiksa ketepatannya
- [ ] `Config.is_draft` disetel `FALSE` (banner dummy hilang)

**Amplop**
- [ ] Gambar QRIS diuji scan nyata dengan nominal Rp 10.000 dan dana masuk ke rekening yang benar
- [ ] Nomor rekening diuji dengan cek nama penerima di aplikasi m-banking
- [ ] Tombol salin berfungsi di Chrome Android dan Safari iOS

**Teknis**
- [ ] HTTPS aktif, sertifikat valid, `http://` dialihkan ke `https://`
- [ ] Lighthouse mobile ≥ 90 / 95
- [ ] Diuji di minimal 4 perangkat: Android Chrome, iPhone Safari, WhatsApp in-app browser, desktop
- [ ] Preview Open Graph tampil benar saat link dikirim ke WhatsApp
- [ ] Backup harian sudah berjalan **dan** sudah diuji restore satu kali
- [ ] Sinkronisasi ke tab Export sudah berjalan
- [ ] Uji beban 200 pengguna bersamaan lolos
- [ ] Login admin diuji, kredensial disimpan di password manager
- [ ] `.env` dan file kredensial dipastikan tidak ada di riwayat git

### Lampiran E — Runbook Deploy (Ubuntu 24.04)

```bash
# 1. Persiapan sistem
sudo apt update && sudo apt upgrade -y
sudo apt install -y curl git ufw fail2ban unattended-upgrades
sudo ufw allow 22,80,443/tcp && sudo ufw enable

# 2. Swap 2 GB (wajib bila RAM 1 GB)
sudo fallocate -l 2G /swapfile && sudo chmod 600 /swapfile
sudo mkswap /swapfile && sudo swapon /swapfile
echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab

# 3. Node.js 20 LTS
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs

# 4. Direktori aplikasi & data
sudo mkdir -p /var/walimah/{data,uploads,backups} /etc/walimah
sudo useradd -r -s /usr/sbin/nologin walimah
sudo chown -R walimah:walimah /var/walimah
sudo chmod 600 /etc/walimah/credentials.json

# 5. Build & jalankan
cd /opt && sudo git clone <repo> walimah && cd walimah
sudo -u walimah npm ci && sudo -u walimah npm run build
sudo systemctl enable --now walimah

# 6. Caddy (HTTPS otomatis)
sudo apt install -y caddy
# /etc/caddy/Caddyfile:
#   undangan.domain.com {
#       encode zstd gzip
#       request_body { max_size 3MB }
#       header {
#           Strict-Transport-Security "max-age=31536000; includeSubDomains"
#           X-Content-Type-Options "nosniff"
#           Referrer-Policy "strict-origin-when-cross-origin"
#       }
#       reverse_proxy 127.0.0.1:3000
#   }
sudo systemctl reload caddy

# 7. Cron backup & sinkronisasi
# 0 2 * * *   curl -fsS -X POST localhost:3000/api/cron/backup -d "secret=$CRON_SECRET"
# 0 */6 * * * curl -fsS -X POST localhost:3000/api/cron/export -d "secret=$CRON_SECRET"
```

### Lampiran F — Prompt Awal untuk Antigravity

> Bangun aplikasi web undangan pernikahan sesuai PRD di `docs/PRD.md` (baca seluruhnya lebih dulu).
>
> **Kerjakan hanya task T-01 sampai T-03 pada iterasi ini.** Setelah selesai, hentikan dan laporkan.
>
> Batasan yang tidak boleh dilanggar:
> - Jangan pernah membaca, menulis, atau melakukan commit terhadap `.env*`, `credentials/`, atau `/var/walimah/**`.
> - Tidak ada nilai konten yang di-hardcode. Semua teks, tanggal, foto, dan nomor rekening berasal dari Google Sheet atau environment variable.
> - TypeScript mode `strict`. Build harus lolos tanpa error atau peringatan.
> - Setiap seksi UI diverifikasi lewat browser pada viewport 390px, 768px, dan 1280px; lampirkan screenshot sebagai artifact.
> - Lapisan Sheet wajib punya fallback snapshot: jika API gagal, aplikasi tetap render normal dari `snapshot.json`.
>
> Keluaran yang diharapkan: rencana kerja, daftar file yang dibuat, hasil `npm run build`, dan screenshot verifikasi.

---

## Persetujuan

| Peran | Nama | Status | Tanggal |
|---|---|---|---|
| Product Owner | Akbar | ☐ Disetujui | |
| Reviewer Teknis | — | ☐ Disetujui | |
| Reviewer Konten (keluarga) | — | ☐ Disetujui | |

*Dokumen ini adalah sumber kebenaran tunggal untuk scope proyek. Perubahan scope dicatat sebagai revisi dengan nomor versi baru.*

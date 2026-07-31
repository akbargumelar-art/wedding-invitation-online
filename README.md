# Walimah — Web Undangan Pernikahan Digital Islami

Implementasi dari [`pdr_wedding.md`](pdr_wedding.md). Undangan satu halaman bertema islami,
di-host sendiri di VPS Ubuntu, dengan **seluruh isi diatur dari dashboard admin**, link
personal per tamu, RSVP, buku ucapan bermoderasi, amplop digital QRIS, dan rekap kehadiran.

Cakupan yang dibangun: **MVP + v1.1** (Modul A, B, dan C pada PRD).

---

## 1. Menjalankan secara lokal

```bash
npm install
npm run dev            # http://localhost:3000
```

Pada database yang masih kosong, aplikasi mengisinya sekali dari `data/seed.json` —
seluruh halaman langsung tampil lengkap dengan data contoh yang siap disunting di `/admin`.

| Alamat | Isi |
|---|---|
| `/` | Undangan umum (sapaan fallback) |
| `/to/budi-santoso` | Undangan personal (slug dari daftar tamu) |
| `/admin` | Dashboard admin |

Kredensial admin untuk pengembangan: `admin` / `walimah-dev-2026`.

### Perintah

| Perintah | Kegunaan |
|---|---|
| `npm run dev` | Server pengembangan |
| `npm run build` | Build produksi (`output: standalone`) |
| `npm run start` | Menjalankan hasil build lewat `next start` (hanya untuk pemeriksaan cepat — lihat catatan di bawah) |
| `npm run pack:standalone` | Melengkapi `.next/standalone` dengan `static/`, `public/`, dan `seed.json` |
| `npm run start:standalone` | Menjalankan paket standalone, persis seperti systemd di VPS |
| `npm run lint` | ESLint |
| `npm run typecheck` | TypeScript mode `strict` |
| `npm test` | Tes unit (Vitest) |
| `npm run test:e2e` | Build + tes E2E (Playwright) |
| `npm run hash-password -- "sandi"` | Membuat hash Argon2id untuk admin |
| `npm run db:migrate` | Menyiapkan berkas SQLite |
| `npm run backup` | Backup manual di luar cron |
| `npm run purge -- --confirm` | Menghapus data tamu yang melewati masa retensi |
| `npx tsx scripts/generate-placeholders.ts` | Membuat ulang gambar dummy |
| `npx tsx scripts/screenshots.ts <url>` | Screenshot verifikasi 4 viewport (320/390/768/1280), kedua tampilan |

### Versi dependensi yang terkunci

> **Jangan pernah menjalankan `npm audit fix --force` di proyek ini.** npm akan
> "memperbaiki" advisory `postcss` dengan menginstal **next@9.3.3** — Next.js versi
> 2020 yang tidak mengenal App Router, sehingga build langsung mati dengan
> `Configuring Next.js via 'next.config.ts' is not supported`. `npm audit fix`
> tanpa `--force` aman.

Empat paket ditahan pada versi tertentu dan tidak boleh dinaikkan sendiri-sendiri:

| Paket | Versi | Alasan |
|---|---|---|
| `next` | `^15.5.22` | Versi yang dipakai proyek. Pernah tertulis `^9.3.3` — salah tulis yang membuat `npm install` menurunkan Next dan mematikan build. |
| `eslint-config-next` | `^15.5.22` | Harus semayor dengan `next`. Versi 16 adalah flat config native (jatuh bila dibungkus `FlatCompat`) dan membawa aturan era React Compiler yang menolak pola efek di seluruh komponen ini. |
| `eslint` | `^9.39.5` | ESLint 10 menghapus `context.getFilename()`, sedangkan `eslint-plugin-react` 7.37.5 (rilis terbaru, transitif dari `eslint-config-next`) masih memanggilnya dan langsung melempar. |
| `vitest` + `@vitest/coverage-v8` | `3.2.7` keduanya, tanpa caret | `@vitest/coverage-v8` mensyaratkan versi `vitest` yang **persis sama**. Dengan caret keduanya bisa melayang ke patch berbeda dan `npm install` gagal dengan `ERESOLVE`. |

`@eslint/eslintrc` wajib ada di `devDependencies` karena
[eslint.config.mjs](eslint.config.mjs) mengimpornya langsung. Sebelumnya paket ini
hanya numpang hoisting dari dependensi lain, dan hilang begitu pohon dependensi
dirapikan.

Ada satu `overrides` di [package.json](package.json): `sharp` dinaikkan ke
`^0.35.3`. Next 15.5 masih meminta `^0.34.3`, sedangkan seluruh 0.34.x mewarisi
empat CVE libvips. Kombinasi ini sudah diverifikasi lewat build produksi dan
seluruh tes E2E, termasuk optimasi gambar galeri.

Dua advisory tersisa (`postcss`, `brace-expansion`) berada di dalam pohon
dependensi Next sendiri dan baru bisa hilang lewat rilis patch Next.

---

## 2. Arsitektur singkat

```
Dashboard admin ──▶ SQLite (WAL) ──(cache ISR)──▶ Next.js 15 ──▶ Tamu
                          │                            │
   isi undangan +         │                            ├─▶ /var/walimah/media    gambar undangan (publik)
   data transaksional ────┘                            └─▶ /var/walimah/uploads  bukti transfer (privat)

   data/seed.json ──(sekali, saat database masih kosong)──▶ SQLite
```

Tiga aturan yang tidak boleh dilanggar:

1. **Tidak ada panggilan jaringan pada jalur request tamu.** Isi undangan dibaca dari SQLite
   lokal, dan hasilnya masih dilapisi cache ISR.
2. **Tamu tidak pernah melihat halaman error karena masalah konten.** Baris yang rusak
   dilewati parser, dan bila database gagal dibaca sama sekali, `data/seed.json` dipakai
   langsung sebagai jaring pengaman terakhir.
3. **Tidak ada nilai konten yang di-hardcode.** Semua teks, tanggal, foto, dan nomor rekening
   berasal dari dashboard atau environment variable.

### Palet

Jamrud cerah + gading hangat + emas sampanye. Seluruh token warna ada di blok
`@theme` pada [globals.css](src/app/globals.css) — itu satu-satunya tempat warna
diubah, tidak ada nilai warna yang ditulis di komponen.

Klaim "lolos WCAG AA" pada komentar CSS itu ditahan oleh
[tests/unit/theme-contrast.test.ts](tests/unit/theme-contrast.test.ts): tesnya
membaca token langsung dari CSS lalu menghitung rasio kontras tiap pasangan yang
benar-benar dipakai. Mengganti warna tanpa memeriksa kontras akan menjatuhkannya.

Dua batas yang gampang dilanggar saat menyetel ulang warna:

- `ink-muted` (teks petunjuk 13px) ditentukan oleh latar **paling terang** yang
  mungkin, yaitu `jade-50` di seksi RSVP — bukan oleh latar gading.
- `gold-600` satu-satunya emas yang boleh menjadi teks di latar terang. Emas yang
  lebih cerah hanya untuk ornamen dan garis, yang ambangnya 3:1.

Gradien gelap pada sampul hanya dipasang bila ada foto sampul; tugasnya menjamin
kontras teks di atas gambar apa pun. Tanpa foto, ia hanya akan menggelapkan hijau
yang sudah punya kontras 9:1.

Titik masuk penting:

| Berkas | Peran |
|---|---|
| [src/lib/content/index.ts](src/lib/content/index.ts) | Satu-satunya pintu baca konten + cache ISR |
| [src/lib/content/parse.ts](src/lib/content/parse.ts) | Parser konten tahan banting (baris rusak dilewati) |
| [src/lib/db/content.ts](src/lib/db/content.ts) | Baca–tulis isi undangan yang dipakai dashboard |
| [src/lib/admin-content.ts](src/lib/admin-content.ts) | Kerangka route admin: sesi, validasi, audit, revalidasi |
| [src/lib/db/schema.ts](src/lib/db/schema.ts) | Skema SQLite |
| [src/lib/validation.ts](src/lib/validation.ts) | Skema Zod bersama klien & server |
| [src/lib/auth.ts](src/lib/auth.ts) | Sesi admin, CSRF, penguncian akun |
| [src/lib/uploads.ts](src/lib/uploads.ts) | Pemeriksaan magic bytes + penyimpanan di luar web root |
| [src/lib/notify/index.ts](src/lib/notify/index.ts) | Antrean & pengiriman notifikasi WhatsApp (§6) |
| [src/lib/env.ts](src/lib/env.ts) | Konfigurasi env — **wajib bebas modul `node:`** (lihat catatan di bawah) |
| [src/components/invitation/BookShell.tsx](src/components/invitation/BookShell.tsx) | Tampilan buku vs gulir (§2.1) |

### instrumentation.ts tidak boleh mengimpor modul aplikasi

[src/instrumentation.ts](src/instrumentation.ts) dikompilasi sebagai bundel
tersendiri. Mengimpor modul aplikasi ke dalamnya — termasuk lewat `await import()`
— menggandakan modul yang sama di dua graf webpack, dan akibatnya muncul jauh dari
penyebabnya:

- `next build` tetap lolos;
- halaman yang sudah dipra-render tetap tersaji 200, jadi sekilas normal;
- tetapi setiap halaman yang perlu dirender **atas permintaan** balas 500 dengan
  `TypeError: a[d] is not a function` dari `webpack-runtime.js`.

Karena itu pekerjaan latar belakang tidak dinyalakan dari sana. Pencacah antrean
undangan dinyalakan dari dalam graf aplikasi lewat `ensureOutboxWorker()`
([src/lib/waha/worker.ts](src/lib/waha/worker.ts)), dengan
`/api/cron/invitations` sebagai jaring pengaman setelah restart.

### env.ts tidak boleh menyentuh modul `node:`

`src/instrumentation.ts` dikompilasi Next untuk runtime **edge** juga, dan ia
mengimpor `src/lib/env.ts`. Di edge tidak ada `node:fs` maupun `node:path`, jadi
satu impor saja membuat `npm run dev` melayani **HTTP 500 pada setiap halaman**:

```
UnhandledSchemeError: Reading from "node:path" is not handled by plugins
```

Dua hal yang membuat jebakan ini sulit terlihat:

- **`next build` tetap lolos.** Kerusakannya hanya muncul di `next dev`, sehingga
  seluruh tes E2E — yang berjalan di atas build produksi — tetap hijau.
- Penjaga `process.env.NEXT_RUNTIME !== 'nodejs'` di `register()` **tidak
  menolong**. Itu penjaga saat berjalan; webpack tetap ikut membundel modulnya.

Karena itu `env.ts` memakai `resolvePath()` tulisan tangan alih-alih
`path.resolve`, dan pemuat `.env` untuk skrip CLI dipindah ke
[src/lib/dotenv.ts](src/lib/dotenv.ts). Skrip di `scripts/` mengimpornya sebagai
efek samping **sebelum** impor lain yang membaca env:

```ts
import '../src/lib/dotenv';
import { env } from '../src/lib/env';
```

Keduanya dijaga tes: [env-path.test.ts](tests/unit/env-path.test.ts) dan
[dotenv.test.ts](tests/unit/dotenv.test.ts).

### 2.1 Dua tampilan, satu markup

Tamu membaca undangan sebagai **buku**: tiap seksi menjadi satu lembar setinggi
layar. Tidak ada scroll dokumen sama sekali — lembar yang isinya panjang menggulir
di dalam dirinya sendiri.

Empat cara membalik lembar, semuanya menuju fungsi yang sama:

| Cara | Catatan |
|---|---|
| Sapu layar kiri/kanan | Ambang 60px horizontal; gerakan yang lebih condong vertikal diabaikan agar tidak membalik halaman saat tamu sebenarnya menggulir isi |
| Seret dengan tetikus | Untuk tamu yang membuka dari komputer — tetikus tidak pernah membangkitkan event sentuh |
| Panah di tepi kiri dan kanan | Bidang sentuh 44px menempel di tepi, lingkaran yang terlihat 32px di tengahnya; isi lembar menyisakan selubung selebar itu (lihat di bawah) |
| Titik navigasi, panah papan ketik | Lompat langsung ke lembar tertentu; `←`/`→` dan `PageUp`/`PageDown` |

Satu jari membangkitkan event sentuh **dan** event pointer. Karena itu penangan
pointer menyaring `pointerType !== 'mouse'` — tanpa saringan itu satu sapuan
terhitung dua kali dan halaman melompat dua langkah.

Tombol di pojok kanan atas beralih ke **mode gulir**, yaitu seluruh seksi mengalir
sebagai satu dokumen panjang seperti undangan digital pada umumnya. Pilihan itu
disimpan di `localStorage` (`walimah:view`) dan bertahan antar kunjungan.

Keduanya memakai markup yang sama persis. Seksi tetap Server Component dan masuk
lewat `pages[].node` di [Invitation.tsx](src/components/invitation/Invitation.tsx);
yang berbeda hanya tata letaknya (`.book-root[data-view=…]` di
[globals.css](src/app/globals.css)). Tidak ada isi undangan yang ditulis dua kali,
jadi mustahil satu mode punya konten yang tidak ada di mode lain.

Mode gulir sengaja dipertahankan, bukan sekadar sisa: ia jalan keluar bagi tamu
yang memakai pembaca layar atau merasa animasi membalik halaman mengganggu, dan
menjadi acuan saat memeriksa tata letak seksi secara utuh.

Tiga hal yang gampang terlewat kalau menyentuh berkas ini:

- Lembar yang tidak aktif diberi `inert`. Tanpa itu tamu bisa menyusuri formulir
  RSVP dengan Tab padahal lembarnya tidak terlihat.
- Seksi yang menghapus dirinya sendiri saat datanya kosong (jadwal, lokasi,
  galeri, amplop) harus punya syarat yang sama di daftar `pages`. Kalau tidak,
  mode buku menyisakan lembar kosong berikut titik navigasinya.
- **Panah mengambang di atas lembar, jadi isi lembar harus menyisakan selubung
  untuknya.** Padding bawaan `.container-invite` hanya 1,5rem, sedangkan
  lingkaran panah kiri berhenti di 38px — teks yang tidak dibungkus kartu
  tertimpa persis di tengah layar. Di bawah 640px padding itu dinaikkan menjadi
  2,75rem. Luapan horizontal tidak akan menangkap ini (tidak ada yang meluap);
  yang menahannya adalah tes "panah tidak menimpa isi lembar mana pun" di
  [08-book.spec.ts](tests/e2e/08-book.spec.ts).

---

## 3. Mengisi undangan lewat dashboard

Seluruh isi undangan diatur di `/admin`. Tidak ada spreadsheet, tidak ada service
account, dan tidak ada langkah sinkronisasi: dashboard menulis ke SQLite yang sama
dengan yang dibaca halaman tamu, lalu membatalkan cache-nya seketika — perubahan
tampil pada permintaan berikutnya.

| Tab | Yang diatur |
|---|---|
| **Pengaturan** | Status draf, mode syar'i, data kedua mempelai, kutipan dan salam, lokasi acara, QRIS, sampul, musik latar, pembukaan/penutupan RSVP |
| **Jadwal** | Rangkaian acara: akad, resepsi, syukuran |
| **Galeri** | Foto beserta urutan tampilnya |
| **Rekening** | Nomor rekening penerima hadiah |
| **Tamu** | Daftar tamu, link personal masing-masing, impor massal |
| **Media** | Berkas gambar yang sudah diunggah |
| **Ucapan** / **Amplop** | Moderasi ucapan dan verifikasi konfirmasi amplop |

Pada pemasangan baru, database diisi sekali dari `data/seed.json` sehingga dashboard
tidak pernah tampil kosong. Sesudah itu berkas tersebut tidak dibaca lagi — satu-satunya
sumber isi undangan adalah database.

Konsekuensinya patut disadari: tidak ada lagi salinan konten di luar VPS. Backup harian
sudah mencakup seluruh isi undangan (ikut di dalam berkas `VACUUM INTO`), dan gambar
yang diunggah dicerminkan ke `BACKUP_DIR/media/`. Yang belum diuji tidak dapat disebut
backup — lakukan satu kali restore percobaan sebelum menyebar undangan.

### Memasukkan daftar tamu

Tab **Tamu** menerima tempelan langsung dari Excel lewat tombol **Impor massal**: satu
nama per baris, kolom kedua (dipisah koma, titik koma, atau TAB) dibaca sebagai kategori.

```
Keluarga Bapak Ahmad
Rina Wulandari, Teman Kantor
Budi Santoso, Keluarga
```

Slug link dibuat otomatis dari nama, dan nama yang slug-nya sudah ada **diperbarui**
alih-alih digandakan — jadi menempel ulang daftar yang sudah diperbaiki tidak pernah
mematikan link yang sudah tersebar. Tombol **Salin link** di tiap baris menyiapkan
alamat yang tinggal dikirim ke tamu.

### Gambar

Setiap isian gambar punya tombol **Unggah** sendiri. Berkas disimpan di `MEDIA_DIR`
(di luar web root) dan disajikan lewat `/media/<berkas>` dengan nama acak berbentuk
UUID. Kolomnya juga tetap menerima URL biasa, sehingga foto yang sudah telanjur ada
di Drive atau Cloudinary tidak perlu diunggah ulang.

Bukti transfer dari tamu **tidak** disimpan di sana: berkas itu masuk ke `UPLOAD_DIR`
yang terpisah dan hanya dapat dibaca lewat route admin terautentikasi.

### Cara isi undangan memengaruhi tampilan

Beberapa keputusan tata letak diambil dari bentuk datanya, bukan dari kode. Ini
disengaja: mempelai dapat mengubah susunan undangan tanpa menyentuh satu baris
program pun.

| Yang Anda isi | Yang terjadi |
|---|---|
| **Anak ke-** = `ketiga` | Kalimatnya menjadi "Putra ketiga dari …". Dikosongkan → "Putra dari …" |
| Dua acara dengan **tanggal sama** | Keduanya menyatu dalam satu kartu di bawah satu tanggal (mis. akad + resepsi) |
| Acara dengan tanggal berbeda | Mendapat kartunya sendiri (mis. syukuran pranikah) |
| Acara **paling akhir** | Menentukan hitung mundur dan tanggal di sampul |
| Galeri kosong | Halaman galeri hilang seluruhnya, termasuk titik navigasinya di mode buku |
| **Musik latar** kosong | Tombol musik tidak muncul dan tidak ada audio yang diunduh tamu |
| **Mode syar'i** aktif | Seluruh foto diganti ornamen, galeri disembunyikan apa pun isinya |
| Lebih dari 3 rekening aktif | Hanya tiga yang pertama tampil — dashboard memperingatkan bila ini terjadi |

Undangan yang dikirim saat ini **tidak memuat galeri** — galerinya sengaja dikosongkan.
Fiturnya tetap ada dan tetap diuji; tinggal menambah foto di tab Galeri untuk
menyalakannya kembali.

Musik latar: taruh berkasnya di `public/audio/` lalu isi kolom **Musik latar**.
Rinciannya di [public/audio/README.md](public/audio/README.md).

Perubahan tampil seketika setelah disimpan. Bila konten pernah diubah dari luar
dashboard (mis. skrip pemulihan yang menulis langsung ke database), revalidasi dapat
dipaksa dengan:

```bash
curl -X POST https://undangan.domain.com/api/revalidate \
  -H "Authorization: Bearer $REVALIDATE_SECRET"
```

---

## 4. Deploy ke VPS (Ubuntu 24.04)

Berkas pendukung ada di [deploy/](deploy/). Pemasangan dan seluruh pembaruan
sesudahnya dikerjakan [`deploy/install.sh`](deploy/install.sh); langkah manual
di bawah hanya menyiapkan sistemnya.

```bash
# 1. Sistem
sudo apt update && sudo apt upgrade -y
sudo apt install -y curl git ufw fail2ban unattended-upgrades caddy
sudo ufw allow 22,80,443/tcp && sudo ufw enable
sudo timedatectl set-timezone Asia/Jakarta

# 2. Swap 2 GB (wajib bila RAM 1 GB — build Next tanpa ini kena OOM)
sudo fallocate -l 2G /swapfile && sudo chmod 600 /swapfile
sudo mkswap /swapfile && sudo swapon /swapfile
echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab

# 3. Node.js 20 LTS
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs

# 4. Ambil kode
sudo git clone <url-repo-anda> /opt/walimah
cd /opt/walimah

# 5. Rahasia — jalankan sekali untuk menyalin templat, isi, lalu ulangi
sudo ./deploy/install.sh                 # berhenti: "isi seluruh nilai ISI-INI"
sudo nano /etc/walimah/env               # isi ADMIN_PASSWORD_HASH, AUTH_SECRET, dst.

# 6. Pasang: porta dipilih, unit systemd + drop-in Caddy dipasang, build, jalan
sudo ./deploy/install.sh

# 7. Cron
sudo crontab -e                                  # isi dari deploy/crontab.example
```

Proxy tidak ada di daftar itu karena `install.sh` yang mengurusnya — lihat
bagian berikutnya.

Pembaruan sesudahnya cukup dua perintah, dan `install.sh` idempoten:

```bash
cd /opt/walimah && sudo git pull && sudo ./deploy/install.sh
```

**Build berjalan di VPS, bukan di mesin lokal.** `better-sqlite3`,
`@node-rs/argon2`, dan `sharp` adalah addon native: bundel `standalone` ikut
membawa binari platform tempat `npm install` dijalankan, jadi hasil build
Windows berisi `argon2.win32-x64-msvc.node` dan mati saat boot di Ubuntu.
[`deploy/deploy.sh`](deploy/deploy.sh) (jalur `rsync` tanpa git) tetap tersedia,
tapi menolak berjalan dari mesin non-Linux justru karena alasan itu.

### Menaikkan pemasangan yang isinya masih dari Google Sheet

`install.sh` **tidak cukup** untuk kasus ini. Ia memperbarui kode, dependensi,
direktori data, dan berkas env — tetapi tidak dapat menebak dari mana isi
undangan Anda harus datang.

Yang berubah: isi undangan tidak lagi dibaca dari Sheet melainkan dari database.
Database yang masih kosong disemai dari `data/seed.json`, yaitu **data contoh
bawaan repo**. Jadi bila layanan sempat menyala sebelum isi aslinya dipindahkan,
yang dilihat tamu adalah undangan dummy.

Versi lama menyimpan cermin Sheet di `SHEET_SNAPSHOT_PATH`
(bawaan `/var/walimah/data/snapshot.json`), dan bentuknya persis yang dibutuhkan
penyemai database. Urutan yang benar:

```bash
cd /opt/walimah
sudo git pull
sudo ./deploy/install.sh          # kode, dependensi, env, direktori media

# Pindahkan isi undangan yang sesungguhnya.
sudo -u walimah npm run import-snapshot                        # pratinjau dulu
sudo -u walimah npm run import-snapshot -- --confirm --replace

sudo systemctl restart walimah
```

`--replace` diperlukan karena layanan hampir pasti sudah sempat menyala dan
menyemai data contoh. Skripnya menolak berjalan tanpa itu bila database sudah
berisi konten — supaya tidak ada isi undangan yang tertimpa tanpa disengaja.

Yang **tidak** ikut terhapus: RSVP, ucapan, konfirmasi amplop, dan statistik
kunjungan. Ketiganya terhubung ke tamu lewat slug, dan slug yang sama terbentuk
lagi dari snapshot.

Setelah itu, tiga hal yang perlu dikerjakan sekali:

1. **Perbarui crontab** — `sudo crontab -e`, salin ulang dari
   [deploy/crontab.example](deploy/crontab.example). Baris export ke Sheet sudah
   tidak ada, dan ada baris baru untuk antrean undangan.
2. **Periksa dashboard** — buka `/admin`, telusuri tab Pengaturan, Jadwal,
   Galeri, Rekening, dan Tamu. Semua sudah dapat disunting langsung di sana.
3. **Isi nomor WhatsApp tamu** bila ingin mengirim undangan dari dashboard (§6b);
   snapshot lama tidak memuat kolom nomor.

Variabel `GOOGLE_*` dan `SHEET_*` di berkas env boleh dibiarkan — kode baru tidak
membacanya sama sekali. Kredensial service account di `/etc/walimah/credentials.json`
sudah tidak dipakai dan aman dihapus.

### Porta backend dipilih otomatis

VPS ini menampung aplikasi lain, jadi 3000 tidak boleh diasumsikan bebas —
dan sebaliknya, Walimah tidak boleh merebut porta tetangganya.
[`deploy/resolve-port.sh`](deploy/resolve-port.sh), yang dipanggil `install.sh`,
memindai porta yang benar-benar sedang didengarkan (`ss -ltn`, alamat apa pun,
bukan hanya loopback), melewati rentang porta ephemeral kernel, lalu memilih
yang pertama bebas di **3100–3199**. Rentang 3000–3099 sengaja dilewati: di
sanalah Next, WAHA, dan Grafana berkumpul.

Hasilnya ditulis ke dua tempat, dan tidak ada satu pun angka porta yang ditulis
tangan di berkas lain:

| Berkas | Isi | Pembaca |
| --- | --- | --- |
| `/etc/walimah/env` | `PORT=` | systemd (`EnvironmentFile`), cron |
| `/etc/walimah/port` | `WALIMAH_PORT=` | Caddy, lewat drop-in `caddy-port.conf` |

Berkas porta sengaja dipisah dari berkas rahasia: memberi Caddy seluruh
`/etc/walimah/env` berarti `AUTH_SECRET` dan token WhatsApp ikut terbaca lewat
`/proc/<pid>/environ` oleh proses yang tidak membutuhkannya.

Pemilihan terjadi **saat deploy, bukan saat start**. `server.js` standalone
membaca `PORT` sekali dan mati `EADDRINUSE` bila porta terpakai, yang bersama
`Restart=always` menjadi restart-loop; sebaliknya porta acak tiap boot akan
membuat Caddy dan keempat entri cron menunjuk ke tempat yang salah setelah
setiap restart. Karena itu deploy ulang **mempertahankan** porta yang sudah
berlaku selama masih layak, dan hanya pindah bila porta itu benar-benar sudah
direbut aplikasi lain — saat itu `install.sh` merestart Caddy, bukan sekadar
me-reload-nya.

Melihat porta yang berlaku, atau menggeser rentangnya:

```bash
sudo ./deploy/resolve-port.sh --show          # cetak porta saat ini
sudo RANGE_START=3300 RANGE_END=3399 ./deploy/resolve-port.sh
```

### Proxy: nginx atau Caddy, dipilih otomatis

`install.sh` memeriksa apa yang sudah hidup dan menyesuaikan diri:

- **nginx aktif** → memasang vhost dari [`deploy/nginx-walimah.conf`](deploy/nginx-walimah.conf)
  ke `sites-available/walimah`, plus dua snippet ke `/etc/nginx/snippets/`.
  Caddy tidak disentuh sama sekali.
- **hanya Caddy** → memasang drop-in porta, lalu reload (atau restart bila
  porta bergeser).
- **tidak ada keduanya** → dilewati dengan peringatan; layanan tetap hidup di
  loopback.

Jalur nginx wajib pada VPS yang nginx-nya sudah memegang 80/443 untuk situs
lain. Caddy tidak bisa hidup berdampingan di sana: ia gagal `bind`, dan
menghentikan nginx demi memberi jalan berarti mematikan seluruh situs lain di
mesin yang sama.

Porta tetap tidak pernah tertulis di server block. `resolve-port.sh` menulis
`/etc/nginx/conf.d/walimah-upstream.conf` berisi blok `upstream
walimah_backend`, dan vhost menunjuk ke namanya.

Sebelum menyentuh `systemctl reload nginx`, `install.sh` menjalankan `nginx -t`.
Bila ditolak, vhost Walimah **dicabut kembali** dan skrip berhenti — konfigurasi
yang gagal tidak boleh sampai ke reload, sebab yang padam bukan cuma Walimah.

#### Dua jebakan nginx yang sudah ditangani

**`add_header` tidak diwariskan.** Blok `location` yang punya `add_header`
sendiri membuang seluruh `add_header` milik induknya, tanpa keluhan dari
`nginx -t`. Halaman admin dan aset statis akan diam-diam kehilangan CSP dan
HSTS. Karena itu setiap `location` meng-`include` snippet header secara
eksplisit.

**`$proxy_add_x_forwarded_for` adalah lubang keamanan di sini.** Idiom itu
*menambahkan* IP klien ke rantai `X-Forwarded-For` yang datang bersama
permintaan. nginx adalah proxy terdepan, jadi rantai itu berasal langsung dari
internet — siapa pun bisa mengirim `X-Forwarded-For: 1.2.3.4`, dan
[`rate-limit.ts:56`](src/lib/rate-limit.ts#L56) mengambil entri **pertama**.
Seluruh rate-limit RSVP, ucapan, dan amplop bisa dilewati hanya dengan memutar
nilai itu. Konfigurasi ini memakai `$remote_addr` yang menimpa, bukan menambah.
[`deploy/Caddyfile`](deploy/Caddyfile) kini melakukan hal setara dengan
`header_up X-Forwarded-For {remote_host}`.

#### Sertifikat HTTPS

HTTPS bukan opsional: cookie sesi admin memakai flag `Secure` di produksi, jadi
di atas `http://` polos login admin **selalu** gagal.

`install.sh` melihat apakah `/etc/letsencrypt/live/<domain>/fullchain.pem` ada.
Bila belum, ia memasang vhost HTTP sementara — cukup untuk melayani tantangan
ACME — dan mencetak perintah yang perlu dijalankan:

```bash
sudo apt install -y certbot python3-certbot-nginx
sudo certbot certonly --webroot -w /var/www/html -d rachmat-layli.space -d www.rachmat-layli.space
sudo ./deploy/install.sh      # ulangi; kini vhost HTTPS penuh yang dipasang
```

Vhost HTTPS penuh dipasang belakangan justru karena `nginx -t` menolak
konfigurasi yang menunjuk berkas sertifikat yang belum ada — dan penolakan itu
akan menggagalkan reload untuk seluruh situs di mesin ini, bukan hanya Walimah.

### Rahasia yang wajib dibuat

```bash
openssl rand -base64 32   # AUTH_SECRET
openssl rand -hex 16      # IP_HASH_SALT
openssl rand -hex 24      # REVALIDATE_SECRET
openssl rand -hex 24      # CRON_SECRET
npm run hash-password -- "kata sandi panjang Anda"   # ADMIN_PASSWORD_HASH
```

> **Penting.** Setiap tanda `$` pada `ADMIN_PASSWORD_HASH` harus ditulis `\$`.
> Pemuat `.env` milik Next melakukan ekspansi variabel dan akan merusak hash mentah
> tanpa pesan galat apa pun — gejalanya login admin selalu gagal. Skrip
> `hash-password` sudah mencetak bentuk yang benar, dan aplikasi membuka escape
> tersebut saat membaca env, sehingga baris yang sama juga tepat untuk
> `EnvironmentFile` systemd.

---

## 5. Pengujian

| Lapisan | Perintah | Cakupan |
|---|---|---|
| Unit (Vitest) | `npm test` | 270 tes — parser konten, round-trip pengaturan dashboard, impor massal tamu, normalisasi nomor WhatsApp, parser balasan tamu, jeda acak pengiriman, slug, validator, countdown & timezone, ICS, magic bytes upload, template notifikasi, keempat driver pengiriman, serta kontras seluruh pasangan warna tema. |
| E2E + integrasi API (Playwright) | `npm run test:e2e` | 86 tes — seluruh 12 skenario Lampiran C, penyuntingan isi undangan lewat dashboard sampai terlihat tamu, pengiriman undangan lewat WAHA tiruan beserta bukti adanya jeda antar-pesan, penolakan webhook tanpa tanda tangan, kontrak API (201/403/413/422/429), kontrol akses admin, notifikasi keluar, audit responsif, hidrasi tanpa error, serta navigasi mode buku dan peralihan tampilan. |

E2E menjalankan **paket standalone** (`node .next/standalone/server.js`), berkas yang
sama persis dengan yang dijalankan systemd di VPS — bukan `next start`. Perbedaannya
penting: `next start` tidak didukung pada `output: standalone`, dan gejalanya menipu —
halaman yang sudah dipra-render tetap tersaji, tetapi begitu sebuah halaman perlu
dirender ulang atas permintaan (persis yang terjadi setiap kali konten disunting),
pemuatan chunk gagal dan halaman balas 500.

Database, direktori upload, dan direktori media diarahkan ke lokasi terpisah, sehingga
suite tidak pernah menyentuh data pengembangan.

Urutan berkas spec disengaja: `05-notify` butuh antrean yang sudah menumpuk dari
spec sebelumnya, dan `07-lockout` mengunci akun admin 15 menit sehingga wajib
berjalan setelah seluruh spec yang perlu masuk sebagai admin.

Helper `openInvitation()` menyetel tampilan gulir, karena sebagian besar spec
memeriksa seluruh seksi sekaligus. Mode buku — tampilan bawaan tamu — diuji
tersendiri di [tests/e2e/08-book.spec.ts](tests/e2e/08-book.spec.ts).

Verifikasi visual: `artifacts/screenshots/` berisi 72 tangkapan layar pada 320px,
390px, 768px, dan 1280px — sampul, tiap lembar mode buku, tiap seksi mode gulir,
dan halaman masuk admin. Seksi yang datanya kosong (galeri) dilewati dengan
catatan, bukan menjatuhkan penangkapan.

### Hasil Lighthouse

Diukur pada build produksi dengan `Config.is_draft = FALSE` (konfigurasi rilis),
halaman `/to/budi-santoso`:

| Kategori / metrik | Target PRD | Mobile | Desktop |
|---|---|---|---|
| Performance | ≥ 90 | **89** | 98 |
| Accessibility | ≥ 95 | **100** | 100 |
| Best Practices | ≥ 95 | **96** | 96 |
| LCP | ≤ 2,0 s | 3,4 s | 1,1 s |
| CLS | ≤ 0,1 | **0** | 0 |
| TBT | ≤ 200 ms | **120 ms** | 0 ms |
| Total transfer | ≤ 500 KB | **436 KB** | — |

Skor mobile meleset satu poin dari target, dan LCP di atas anggaran. Penyebabnya
bersifat network-bound pada profil simulasi Lighthouse (1,6 Mbps / RTT 150 ms):
FCP sudah 2,1 detik hanya untuk HTML + CSS, dan LCP menunggu font display
terpasang. Lever berikutnya, sesuai urutan dampak:

1. Font Arab (Amiri, 106 KB — aset terbesar) dimuat meski kutipan ayat berada di
   bawah lipatan. Menggantinya dengan font Arab bersubset lebih kecil, atau
   memuatnya hanya setelah undangan dibuka, adalah penghematan terbesar.
2. Mengganti `display: 'swap'` menjadi `'optional'` pada font display akan
   menghapus repaint yang menjadi LCP — dengan konsekuensi kunjungan pertama
   pada jaringan lambat memakai serif bawaan sistem.
3. Ukur ulang setelah foto asli menggantikan placeholder; profil gambar akan
   berubah dan angka di atas ikut bergeser.

Ukur ulang dengan:

```bash
npm run build && npm run start
npx lighthouse http://127.0.0.1:3000/to/<slug> --output=html --output-path=./artifacts/lh.html
```

### Responsivitas

Prioritas mobile: seluruh tata letak dirancang untuk kolom selebar ponsel lebih
dulu, lalu melonggar di layar besar. Klaim ini diuji, bukan diasumsikan —
[tests/e2e/06-responsive.spec.ts](tests/e2e/06-responsive.spec.ts) memeriksa pada
320, 360, 390, 430, 768, dan 1280px bahwa:

- tidak ada pergeseran horizontal di seluruh seksi undangan maupun dashboard admin;
- tombol "Buka Undangan" utuh di dalam layar pada 320×568 (ponsel terpendek yang
  masih didukung) dengan target sentuh ≥ 44px;
- seksi amplop yang terbuka dan lightbox galeri tidak melebar keluar viewport;
- dashboard admin dan halaman masuk dapat dipakai dari 320–390px.

Mode buku diuji terpisah pada 320×568: setiap lembar diperiksa tidak menggeser
horizontal, dan baris terakhir lembar terpanjang tetap berada di atas bilah
navigasi saat digulir mentok.

Detail yang menopang itu: `100svh` (bukan `100vh`) pada sampul supaya address bar
mobile tidak memotong tombol, ukuran font input ≥ 16px agar iOS tidak melakukan
zoom otomatis saat form difokus, peta dan galeri dimuat malas, serta rasio gambar
dikunci sejak awal sehingga CLS tetap 0.

---

## 6. Notifikasi WhatsApp ke mempelai

Setiap tamu yang membuka undangan, mengisi RSVP, mengirim ucapan, atau
mengonfirmasi amplop dapat memicu pesan WhatsApp ke mempelai.

### Cara kerja

```
Tamu kirim ──▶ tersimpan di SQLite ──▶ respons 201 ke tamu (selesai, tidak menunggu)
                      │
                      └─▶ antrean `notifications` ──▶ dikirim setelah respons
                                    ▲                       │ gagal?
                                    └── cron tiap 10 menit ◀─┘ backoff 30 dtk → 1 jam
```

Tiga sifat yang penting:

1. **Tamu tidak pernah menunggu gateway.** Pengiriman terjadi lewat `after()`,
   setelah respons dikirim. Gateway yang mati tidak memperlambat siapa pun.
2. **Tidak ada peristiwa yang hilang.** Barisnya masuk database lebih dulu;
   `POST /api/cron/notify` mengulang yang gagal. Diuji dengan penerima yang
   sengaja dimatikan lalu dihidupkan ([tests/e2e/05-notify.spec.ts](tests/e2e/05-notify.spec.ts)).
3. **Notifikasi kunjungan tidak membanjir.** Satu tamu dinotifikasi sekali per
   hari, bukan setiap kali membuka link.

### Memilih saluran

| `NOTIFY_CHANNEL` | Cocok untuk | Yang perlu disiapkan |
|---|---|---|
| `whatsapp_gateway` | WAHA / whatsapp-web.js — **satu-satunya yang bisa kirim ke grup** | `WHATSAPP_GATEWAY_URL`, `NOTIFY_RECIPIENTS`, opsional `WHATSAPP_GATEWAY_API_KEY` |
| `webhook` | Paling fleksibel — n8n, Make, atau bot WhatsApp sendiri | `NOTIFY_WEBHOOK_URL`, opsional `NOTIFY_WEBHOOK_SECRET` |
| `whatsapp_cloud` | WhatsApp Cloud API resmi Meta | `WHATSAPP_PHONE_NUMBER_ID`, `WHATSAPP_ACCESS_TOKEN`, `NOTIFY_RECIPIENTS`, dan biasanya `WHATSAPP_TEMPLATE_NAME` |
| `fonnte` | Gateway lokal, paling cepat dipasang | `FONNTE_TOKEN`, `NOTIFY_RECIPIENTS` |
| `off` (default) | Mematikan seluruh notifikasi | — |

Pilih peristiwa lewat `NOTIFY_EVENTS` (default `rsvp,wish,envelope`; tambahkan
`visit` bila ingin tahu setiap undangan dibuka).

### Mengirim ke grup WhatsApp (`whatsapp_gateway`)

```dotenv
NOTIFY_CHANNEL=whatsapp_gateway
NOTIFY_EVENTS=rsvp,wish,envelope,visit
# Grup panitia + nomor pribadi mempelai, dipisah koma.
NOTIFY_RECIPIENTS=120363044814127701@g.us,6281234567890
WHATSAPP_GATEWAY_URL=http://127.0.0.1:3000/api/sendText
WHATSAPP_GATEWAY_SESSION=default
WHATSAPP_GATEWAY_API_KEY=rahasia-anda
```

Badan permintaan yang dikirim: `{ session, chatId, text }` — sesuai
`POST /api/sendText` milik WAHA. Dua knob bila gateway Anda sedikit berbeda:
`WHATSAPP_GATEWAY_API_KEY_HEADER` (default `X-Api-Key`) dan
`WHATSAPP_GATEWAY_TEXT_FIELD` (default `text`; sebagian fork memakai `message`).

Aturan tujuan: nilai yang **sudah** berakhiran `@g.us` atau `@c.us` dipakai apa
adanya, nomor biasa dilengkapi menjadi `…@c.us`. ID grup tidak pernah ditebak —
salah menormalkannya berarti pesan masuk ke chat yang tidak ada.

> Gateway berbasis WhatsApp Web adalah akun WhatsApp sungguhan, bukan API resmi.
> Jalankan di VPS yang sama, jaga sesinya tetap hidup, dan sadari bahwa akun
> pengirim menanggung risiko kebijakan WhatsApp bila mengirim terlalu agresif.
> Karena itu notifikasi kunjungan dibatasi sekali per tamu per hari.

**Catatan WhatsApp Cloud API.** Meta hanya mengizinkan pesan yang dimulai bisnis
di luar jendela 24 jam bila memakai template yang sudah disetujui. Siapkan
template dengan dua variabel — `{{1}}` judul, `{{2}}` rincian — lalu isi
`WHATSAPP_TEMPLATE_NAME`. Tanpa template, pesan hanya sampai bila Anda baru saja
membalas nomor bisnis tersebut.

**Verifikasi webhook.** Bila `NOTIFY_WEBHOOK_SECRET` diisi, setiap permintaan
membawa header `x-walimah-signature: sha256=<hmac>` atas seluruh body mentah.
Penerima wajib memverifikasinya sebelum mempercayai isinya.

### Privasi

Payload hanya memuat nama, status kehadiran, isi ucapan, nominal, dan slug.
Alamat IP, user agent, dan berkas bukti transfer **tidak pernah** ikut keluar —
untuk bukti transfer hanya dikirim keterangan ada atau tidak. Catatan di bawah
setiap form sudah menyatakan bahwa data diteruskan kepada mempelai. Bila Anda
memakai gateway pihak ketiga, gateway itu menjadi pemroses data: pilih penyedia
yang Anda percaya, dan pertimbangkan `webhook` ke infrastruktur sendiri bila ragu.

---

### Membaca kolom "Jumlah Orang"

Tamu memilih 1–5 orang, atau **"Lebih dari 5 orang"** bila rombongannya besar dan
jumlah pastinya belum tentu. Pilihan terakhir itu disimpan sebagai angka `6`, yang
berarti **"enam atau lebih" — bukan tepat enam**.

Saat menghitung konsumsi, perlakukan setiap `>5` sebagai perkiraan bawah dan
hubungi tamunya langsung. Seluruh tampilan sudah menghormati arti ini: undangan
dan notifikasi WhatsApp menulis "lebih dari 5 orang", dan CSV menulis `>5`, tidak
pernah `6`.

---

## 6b. Mengirim undangan lewat WhatsApp (WAHA)

Selain notifikasi ke mempelai (§6), aplikasi dapat **mengirim undangan ke tamu**
dan **menerima balasan mereka** lewat [WAHA](https://waha.devlike.pro) dengan engine
NOWEB. Seluruh pengaturannya ada di tab **WhatsApp** pada dashboard — tidak ada
environment variable baru yang perlu diisi.

### Menyiapkan

1. Jalankan WAHA dan tautkan sesinya ke nomor WhatsApp mempelai (pindai kode QR).
   Nomor itulah yang akan tampil sebagai pengirim undangan.
2. Di tab **WhatsApp**: isi alamat server WAHA (mis. `http://127.0.0.1:3000`), nama
   sesi, dan kunci API bila WAHA dijalankan dengan `WHATSAPP_API_KEY`.
3. Tekan **Buat rahasia** untuk menghasilkan rahasia HMAC webhook, lalu salin
   nilainya ke konfigurasi WAHA. Nilai itu **hanya ditampilkan sekali**.
4. Di WAHA, arahkan webhook event `message` ke alamat yang tertera di dashboard
   (`https://undangan.domain.com/api/webhook/waha`), dengan HMAC algoritma `sha512`.
5. Tekan **Tes koneksi**. Status yang sehat adalah `WORKING`; `SCAN_QR_CODE` berarti
   WAHA hidup tetapi belum ditautkan ke ponsel.

Tanpa rahasia HMAC tersimpan, **seluruh pesan masuk ditolak**. Itu disengaja: alamat
webhook dapat diakses siapa pun yang mengetahuinya, dan endpoint itu satu-satunya
jalur yang dapat menulis RSVP tanpa ada tamu membuka halaman.

### Mengirim undangan

Nomor WhatsApp tamu diisi di tab **Tamu** — satu per satu, atau lewat impor massal
dengan kolom ketiga berisi nomor. Bentuk apa pun diterima (`0812…`, `+62 812…`,
`62812…`) dan dirapikan otomatis.

| Cara | Di mana | Perilaku |
|---|---|---|
| **Satuan** | Tombol *Kirim undangan* pada baris tamu | Dikirim seketika, hasilnya langsung terlihat |
| **Terpilih** | Centang beberapa tamu → *Kirim ke N terpilih* | Masuk antrean |
| **Semua** | *Kirim ke semua yang belum* | Masuk antrean, melewati tamu yang sudah menerima |

Pengiriman massal **tidak pernah beruntun**. Setiap pesan dipisahkan jeda acak
**20–60 detik** (dapat diubah, minimum 5 detik). Angka itu bukan kehati-hatian
berlebih: mengirim beruntun ke banyak tujuan adalah pola yang paling cepat memicu
pemblokiran nomor oleh WhatsApp, dan nomor yang diblokir di tengah penyebaran
undangan tidak dapat dipulihkan sebelum harinya tiba. Untuk 200 tamu, penyebaran
karena itu memakan waktu sekitar 2–3 jam — itu wajar, bukan tanda ada yang macet.

Beberapa hal yang sudah ditangani dan tidak perlu dijaga manual:

- **Antrean bertahan melewati restart.** Jadwal "boleh kirim lagi paling cepat
  pukul sekian" tersimpan di database, bukan di memori proses. Menutup dashboard
  atau merestart layanan tidak menghentikan maupun mempercepat pengiriman.
- **Menekan tombol dua kali tidak menggandakan.** Tamu yang sudah ada di antrean
  dilewati, dan tamu yang sudah menerima undangan tidak ikut dalam *Kirim ke semua*.
- **Antrean yang menumpuk tidak diberondong.** Bila WAHA sempat mati lalu hidup
  lagi, sisa antrean tetap dikirim satu per satu dengan jeda yang sama.
- **Kirim satuan ikut menggeser jadwal**, jadi menekannya berkali-kali tidak
  menjadi pintu belakang untuk mengirim beruntun.

Progres, pembatalan sisa antrean, dan percobaan ulang yang gagal ada di tab
**WhatsApp**.

### Menerima balasan tamu

Balasan tamu ditulis ke tabel yang sama dengan formulir web, sehingga rekap di
dashboard tetap satu — tidak peduli tamu mengisi lewat halaman undangan atau
membalas pesan.

| Yang dibalas tamu | Yang tercatat |
|---|---|
| `HADIR 3` · "insya Allah hadir" | RSVP hadir, 3 orang |
| `TIDAK HADIR` · "maaf berhalangan" | RSVP tidak hadir |
| `RAGU` · "belum pasti" | RSVP masih ragu |
| `UCAPAN <pesan>` · `DOA <pesan>` | Buku ucapan (ikut moderasi bila aktif) |
| `TRANSFER 500000` · `QRIS` · `TUNAI` | Konfirmasi amplop, berstatus menunggu verifikasi |
| lainnya | Dibalas petunjuk singkat |

Tiga aturan yang dipegang parser balasan, dan alasannya:

1. **Bentuk penyangkalan diperiksa lebih dulu.** "tidak hadir" mengandung "hadir";
   urutan yang terbalik akan mencatat ketidakhadiran sebagai kehadiran — kekeliruan
   termahal yang mungkin terjadi di sini, karena konsumsi disiapkan dari angka itu.
2. **Kata kunci dicocokkan sebagai kata utuh.** Pencocokan potongan membuat
   pertanyaan "ini siapa ya?" tercatat sebagai hadir, karena "siapa" memuat "siap".
3. **Pesan yang ambigu tidak ditebak.** "belum tentu bisa datang" dibalas permintaan
   penegasan, bukan disimpan sebagai salah satu jawaban.

Pengaman yang berlaku di jalur masuk:

- hanya nomor yang **terdaftar sebagai tamu** yang dapat menulis apa pun;
- pesan grup diabaikan seluruhnya;
- setiap pesan hanya diproses sekali (WAHA mengirim ulang webhook yang gagal, dan
  tanpa ini satu ucapan bisa tercatat berkali-kali);
- maksimum 20 pesan per nomor per jam;
- nomor telepon **tidak** ikut tersimpan di tabel RSVP/ucapan/amplop — hanya
  hash-nya, sama seperti perlakuan terhadap alamat IP pengunjung web (PRD §4.5).

---

## 7. Penyimpangan dari PRD (disengaja)

| Bagian PRD | Keputusan | Alasan |
|---|---|---|
| §2.4 / §4.2 Google Sheet sebagai CMS | Seluruh isi undangan diatur dari dashboard admin dan disimpan di SQLite; integrasi Sheets dihapus seluruhnya | Sheet menuntut dua service account, pembagian akses, dan kuota API — tiga hal yang dapat gagal dan semuanya di luar kendali server. Konten kini dibaca dari database yang sudah dipakai RSVP dan ucapan: tidak ada lagi latensi panggilan jaringan pada refresh cache, tidak ada kelas kegagalan "kredensial dicabut", dan perubahan tampil seketika alih-alih menunggu jendela revalidasi. Konsekuensi yang harus disadari: tidak ada lagi salinan konten di luar VPS, sehingga backup harian menjadi satu-satunya pelindung — dan isi undangan kini ikut di dalamnya. |
| §4.4 | Tambahan `PUT/POST/DELETE /api/admin/content/*` dan `/api/admin/media` | Jalur tulis yang dibutuhkan dashboard untuk menggantikan Sheet. Seluruhnya melewati sesi admin + CSRF, dicatat di `audit_log`, dan membatalkan cache konten. |
| §4.4 | Tambahan `GET /media/[file]` | Menyajikan gambar undangan yang diunggah admin. Terpisah tegas dari `/api/admin/proof/[file]`: yang ini publik, yang itu rahasia. |
| §2.4 Non-goals | Pengiriman undangan & penerimaan balasan lewat WhatsApp (§6b) | Diminta setelah PRD disetujui. Yang dilarang PRD adalah push ke tamu tanpa diminta; ini undangan yang memang ditujukan kepada mereka, dikirim atas perintah mempelai, dan balasannya masuk ke tabel yang sudah ada — bukan kanal data baru. |
| §4.3 | Tambahan tabel `integrations`, `invitation_outbox`, `inbound_messages`, dan kolom `guests.telepon` | Pengaturan WAHA, antrean kirim yang bertahan melewati restart, dan penangkal pemrosesan ganda webhook. |
| §4.4 | Tambahan `POST /api/webhook/waha` dan `/api/admin/whatsapp/*` | Jalur masuk balasan tamu (dijaga HMAC-SHA512 + daftar tamu terdaftar) dan kendali pengiriman dari dashboard. |
| §4.3 | Tambahan tabel `site_config`, `schedule`, `gallery`, `bank_accounts`, `guests`, `media` | Isi undangan yang dulu berada di lima tab spreadsheet. |
| §4.1 Auth admin: NextAuth | Sesi cookie bertanda tangan HMAC buatan sendiri | Untuk satu akun admin, permukaan serangannya jauh lebih kecil. Dua syarat PRD — penguncian 15 menit setelah 5 kali gagal dan proteksi CSRF — tidak disediakan NextAuth secara bawaan dan di sini diterapkan langsung. Properti yang diminta tetap terpenuhi: cookie `httpOnly` + `SameSite=Lax` + Argon2id + CSRF. |
| §4.3 Tabel `wishes` | Tambahan kolom `deleted_at` | US-15 meminta hapus bersifat *soft delete*; kolom ini yang membuatnya mungkin tanpa kehilangan jejak audit. |
| §4.3 | Tambahan tabel `login_attempts` | Menyimpan hitungan gagal login untuk penguncian akun (§4.5). |
| §4.4 Kontrak API | Tambahan `GET /api/rsvp?slug=…` | Dibutuhkan agar tamu yang membuka kembali link personalnya melihat jawabannya dan dapat mengubahnya (US-10, skenario E2E 4). Slug adalah rahasia tautan personal, jadi tidak ada data yang bocor ke pihak yang belum memegangnya. |
| §4.4 | Tambahan `GET /api/admin/csv/[dataset]` | Mewujudkan tombol "Unduh CSV" pada US-15. |
| §4.5 Rate limit login | 30 per 10 menit per IP (bukan nilai ketat) | Kontrol utama terhadap tebak kata sandi adalah penguncian akun; batas IP sengaja longgar agar penguncian itulah yang lebih dulu bekerja, bukan tertutup 429 yang membingungkan admin. |
| §2.3 US-03 font self-host | `next/font/google` | Berkas woff2 diunduh saat build dan disajikan dari domain sendiri — self-host yang sesungguhnya, tanpa request pihak ketiga saat tamu membuka halaman. |
| §2.4 Non-goals: "tanpa notifikasi push" | Notifikasi WhatsApp keluar ke mempelai (§6) | Diminta setelah PRD disetujui. Yang dilarang PRD adalah push ke **tamu**; ini pesan ke mempelai sendiri, tidak menambah beban apa pun di sisi tamu dan tidak memasang pelacak. |
| §4.3 | Tambahan tabel `notifications` | Antrean keluar agar gateway yang mati tidak menghilangkan peristiwa maupun memperlambat tamu. |
| §4.4 | Tambahan `POST /api/cron/notify` | Percobaan ulang terjadwal untuk antrean notifikasi. |

---

## 8. Sebelum menyebar link

Checklist lengkap ada di Lampiran D PRD. Yang paling sering terlewat:

- [ ] Sakelar **Masih draf** di tab Pengaturan dimatikan — banner merah "MODE DUMMY"
      harus hilang dari halaman tamu.
- [ ] Seluruh data contoh bawaan diganti data asli: nama mempelai, jadwal, lokasi,
      dan nomor rekening. Data seed hanya contoh bentuk, bukan data siapa pun.
- [ ] Seluruh gambar diganti foto asli — unggah lewat tab Media atau isian gambar di
      tab Pengaturan; placeholder di `public/img/` tidak layak disebar.
- [ ] QRIS diuji scan nyata dengan nominal kecil, dan dana masuk ke rekening yang benar.
- [ ] Backup harian sudah berjalan **dan** sudah diuji restore satu kali.
- [ ] `.env` serta berkas kredensial dipastikan tidak pernah masuk riwayat git.
- [ ] Notifikasi WhatsApp diuji sekali sungguhan (isi RSVP dari HP lain, pastikan
      pesan masuk), dan `NOTIFY_RECIPIENTS` berisi nomor yang benar.
- [ ] Bila memakai pengiriman undangan lewat WAHA (§6b): kirim **satu** undangan ke
      nomor sendiri lebih dulu dan baca hasilnya di WhatsApp — templat yang salah
      baru terlihat setelah terkirim, dan pesan yang sudah terkirim tidak dapat
      ditarik. Balas pesan itu dengan `HADIR 2` untuk memastikan jalur masuknya
      benar-benar tercatat di dashboard.
- [ ] Jeda pengiriman massal tidak diturunkan di bawah 20 detik.

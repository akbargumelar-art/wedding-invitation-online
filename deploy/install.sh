#!/usr/bin/env bash
#
# Pasang atau perbarui Walimah di VPS. Satu skrip untuk dua keperluan, dan
# idempoten: aman dijalankan berulang kali.
#
#   # pertama kali
#   sudo git clone <repo> /opt/walimah
#   cd /opt/walimah && sudo ./deploy/install.sh
#
#   # setiap pembaruan sesudahnya
#   cd /opt/walimah && sudo git pull && sudo ./deploy/install.sh
#
# Build berjalan DI SINI, bukan di mesin pengembang. better-sqlite3,
# @node-rs/argon2, dan sharp adalah addon native: bundel yang dikompilasi di
# Windows membawa berkas .node MSVC dan membuat layanan mati saat boot di
# Ubuntu. deploy/deploy.sh (jalur rsync) hanya sah dari mesin Linux; dari
# Windows, jalur yang benar adalah git + skrip ini.
#
# Porta backend TIDAK dipatok. VPS ini menampung aplikasi lain, jadi porta
# dipilih deploy/resolve-port.sh dari rentang 3100-3199 dengan melihat porta
# yang benar-benar sedang didengarkan, lalu ditulis ke satu sumber kebenaran
# yang diikuti systemd, Caddy, dan cron.
set -euo pipefail

REPO_DIR="${REPO_DIR:-$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)}"
ENV_FILE="${ENV_FILE:-/etc/walimah/env}"
PORT_FILE="${PORT_FILE:-/etc/walimah/port}"
DATA_ROOT="${DATA_ROOT:-/var/walimah}"
SERVICE_USER="${SERVICE_USER:-walimah}"

say()  { echo "==> $*"; }
warn() { echo "install: $*" >&2; }
die()  { echo "install: $*" >&2; exit 1; }

# -----------------------------------------------------------------------------
# 1. Preflight
# -----------------------------------------------------------------------------

[[ $EUID -eq 0 ]] || die "harus dijalankan sebagai root (sudo ./deploy/install.sh)."
[[ "$(uname -s)" == "Linux" ]] || die "hanya untuk Linux; di Windows cukup push, lalu jalankan ini di VPS."
[[ -f "$REPO_DIR/package.json" ]] || die "tidak menemukan package.json di ${REPO_DIR}."

command -v node >/dev/null || die "node tidak terpasang. Pasang Node.js 20 LTS lebih dulu."
command -v npm  >/dev/null || die "npm tidak terpasang."
# Dipakai pemeriksaan kesehatan di akhir; tanpa ini kegagalannya muncul sebagai
# sepuluh percobaan gagal berturut-turut, seolah aplikasinya yang mati.
command -v curl >/dev/null || die "curl tidak terpasang (apt install curl)."

node_major="$(node -p 'process.versions.node.split(".")[0]')"
[[ $node_major -ge 20 ]] || die "butuh Node.js >= 20, terpasang v$(node -p 'process.versions.node')."

# Build Next di RAM 1 GB tanpa swap berakhir sebagai OOM kill di tengah jalan,
# dan gejalanya hanya "Killed" tanpa penjelasan. Peringatkan sebelum, bukan
# sesudah, dua puluh menit terbuang.
if [[ "$(awk '/^SwapTotal:/ { print $2 }' /proc/meminfo)" == "0" ]]; then
  mem_mb="$(awk '/^MemTotal:/ { print int($2 / 1024) }' /proc/meminfo)"
  if [[ $mem_mb -lt 2048 ]]; then
    warn "RAM ${mem_mb} MB tanpa swap — 'npm run build' kemungkinan besar kena OOM."
    warn "Buat swap 2 GB lebih dulu (lihat README §4 langkah 2)."
  fi
fi

cd "$REPO_DIR"

# -----------------------------------------------------------------------------
# 2. Pengguna sistem dan direktori data
# -----------------------------------------------------------------------------

if ! id -u "$SERVICE_USER" >/dev/null 2>&1; then
  say "Membuat pengguna sistem ${SERVICE_USER}"
  useradd -r -s /usr/sbin/nologin "$SERVICE_USER"
fi

install -d -m 755 /etc/walimah
install -d -o "$SERVICE_USER" -g "$SERVICE_USER" -m 750 \
  "$DATA_ROOT" "$DATA_ROOT/data" "$DATA_ROOT/uploads" "$DATA_ROOT/backups" "$DATA_ROOT/media"

# -----------------------------------------------------------------------------
# 3. Berkas rahasia
# -----------------------------------------------------------------------------

if [[ ! -f $ENV_FILE ]]; then
  install -m 600 -o root -g root deploy/env.production.example "$ENV_FILE"
  say "Templat env disalin ke ${ENV_FILE}"
  echo >&2
  die "isi seluruh nilai ISI-INI di ${ENV_FILE}, lalu jalankan skrip ini lagi."
fi

# Layanan yang hidup dengan AUTH_SECRET kosong menerima sesi admin palsu tanpa
# meninggalkan jejak apa pun di log. src/instrumentation.ts sudah menolak boot
# dalam keadaan itu, tapi kegagalannya muncul sebagai restart-loop systemd —
# jauh lebih sulit dibaca daripada satu kalimat di sini.
missing=()
for key in NEXT_PUBLIC_SITE_URL ADMIN_PASSWORD_HASH AUTH_SECRET IP_HASH_SALT REVALIDATE_SECRET CRON_SECRET; do
  value="$(sed -n "s/^${key}=\(.*\)$/\1/p" "$ENV_FILE" | tail -1)"
  [[ -n $value ]] || missing+=("$key")
done
[[ ${#missing[@]} -eq 0 ]] || die "nilai berikut masih kosong di ${ENV_FILE}: ${missing[*]}"

# Kunci yang ditambahkan setelah sebuah versi terpasang di produksi.
#
# Berkas env yang sudah ada TIDAK pernah ditimpa — isinya rahasia milik
# pemasangan itu. Tetapi kunci baru harus tetap masuk, karena nilai bawaannya
# bersifat relatif dan akan mendarat di dalam bundel standalone: direktori itu
# hanya-baca menurut unit systemd, dan ikut terhapus setiap deploy. Gejalanya
# bukan galat saat boot melainkan unggahan gambar yang gagal, jauh setelah
# pemasangan dianggap selesai.
ensure_env_key() {
  local key="$1" value="$2"

  if grep -q "^${key}=" "$ENV_FILE"; then return 0; fi

  printf '%s=%s\n' "$key" "$value" >> "$ENV_FILE"
  say "Menambahkan ${key} ke ${ENV_FILE}"
}

ensure_env_key MEDIA_DIR "${DATA_ROOT}/media"
ensure_env_key CONTENT_CACHE_TTL 300

# -----------------------------------------------------------------------------
# 4. Porta — cari yang kosong, jangan ganggu tetangga
# -----------------------------------------------------------------------------

port_before="$(sed -n 's/^PORT=\([0-9]\+\).*/\1/p' "$ENV_FILE" | tail -1 || true)"

say "Menentukan porta backend"
PORT="$(./deploy/resolve-port.sh)"
[[ $PORT =~ ^[0-9]+$ ]] || die "resolve-port.sh mengembalikan '${PORT}', bukan angka."
say "Porta backend: ${PORT}"

# -----------------------------------------------------------------------------
# 5. Unit systemd dan drop-in Caddy
# -----------------------------------------------------------------------------

say "Memasang unit systemd"
install -m 644 -o root -g root deploy/walimah.service /etc/systemd/system/walimah.service

# Drop-in Caddy hanya dipasang bila Caddy memang ada. Di VPS yang 80/443-nya
# dipegang nginx, direktori ini tidak boleh dibuat: ia membuat systemd
# menganggap ada unit caddy yang perlu diurus, padahal tidak.
if systemctl list-unit-files caddy.service >/dev/null 2>&1; then
  install -d -m 755 /etc/systemd/system/caddy.service.d
  install -m 644 -o root -g root deploy/caddy-port.conf /etc/systemd/system/caddy.service.d/walimah-port.conf
fi
systemctl daemon-reload

# -----------------------------------------------------------------------------
# 6. Dependensi dan build
# -----------------------------------------------------------------------------

say "Memasang dependensi (npm ci)"
# Bukan --omit=dev: build membutuhkan typescript dan tailwind, dan keluaran
# standalone hanya membawa dependensi runtime yang benar-benar dipakai.
npm ci

# .next basi menghasilkan galat "Cannot find module for page" pada route yang
# berganti-ganti setiap build — kodenya benar, cache-nya yang bohong.
say "Membersihkan .next lama"
rm -rf .next

say "Build produksi"
# NEXT_PUBLIC_SITE_URL bersifat build-time: Next menanamkannya ke bundel saat
# kompilasi (src/app/layout.tsx:41, metadataBase). Build tanpa nilai ini jatuh
# ke http://localhost:3000, dan seluruh pratinjau tautan WhatsApp menunjuk ke
# localhost — rusak tanpa satu pun pesan galat. Hanya variabel ini yang
# diekspor: mengeksekusi `source` atas seluruh berkas rahasia hanya untuk satu
# nilai berarti menaruh AUTH_SECRET di environment proses build tanpa alasan.
NEXT_PUBLIC_SITE_URL="$(sed -n 's/^NEXT_PUBLIC_SITE_URL=\(.*\)$/\1/p' "$ENV_FILE" | tail -1)" \
NODE_ENV=production \
  npm run build

# Next tidak menyalin .next/static, public/, dan data/seed.json ke standalone
# secara otomatis. Skripnya sama dengan yang dipakai deploy.sh dan harness E2E.
say "Menyusun paket standalone"
node scripts/pack-standalone.mjs

# Hanya .next yang berpindah kepemilikan, bukan seluruh repo. Layanan cuma
# perlu membaca bundel standalone dan menulis cache ISR di dalamnya; sisanya
# ditelusuri lewat izin direktori biasa. Meng-chown seluruh /opt/walimah
# membuat .git ikut jadi milik walimah, dan `sudo git pull` berikutnya berhenti
# dengan "detected dubious ownership in repository" — pembaruan pertama gagal
# karena langkah pemasangan, bukan karena kodenya.
chmod 755 "$REPO_DIR"
chown -R "$SERVICE_USER:$SERVICE_USER" "$REPO_DIR/.next"

# -----------------------------------------------------------------------------
# 7. Jalankan
# -----------------------------------------------------------------------------

say "Menjalankan layanan"
systemctl enable walimah >/dev/null
systemctl restart walimah

configure_nginx() {
  local domain cert vhost=/etc/nginx/sites-available/walimah

  domain="$(sed -n 's|^NEXT_PUBLIC_SITE_URL=https\?://||p' "$ENV_FILE" | tail -1 | sed 's|/.*$||')"
  [[ -n $domain ]] || { warn "NEXT_PUBLIC_SITE_URL tidak terbaca; lewati konfigurasi nginx."; return 0; }

  install -d -m 755 /etc/nginx/snippets
  install -m 644 -o root -g root deploy/nginx-walimah-headers.conf /etc/nginx/snippets/walimah-headers.conf
  install -m 644 -o root -g root deploy/nginx-walimah-proxy.conf   /etc/nginx/snippets/walimah-proxy.conf

  cert="/etc/letsencrypt/live/${domain}/fullchain.pem"
  if [[ -f $cert ]]; then
    say "Sertifikat ${domain} ditemukan, memasang vhost HTTPS"
    sed "s|__DOMAIN__|${domain}|g" deploy/nginx-walimah.conf > "$vhost"
  else
    # Vhost HTTPS penuh menunjuk berkas sertifikat yang belum ada, dan
    # `nginx -t` menolaknya. Menolak berarti reload gagal — dan reload yang
    # gagal di mesin ini berarti seluruh situs lain ikut tidak terperbarui.
    # Jadi sebelum sertifikat terbit, pasang bentuk HTTP saja: cukup untuk
    # melayani tantangan ACME, dan jujur bahwa HTTPS belum hidup.
    say "Sertifikat ${domain} belum ada, memasang vhost HTTP sementara"
    cat > "$vhost" <<EOF
# Sementara — dihasilkan deploy/install.sh sebelum sertifikat terbit.
# Jalankan certbot (lihat keluaran install.sh), lalu ulangi install.sh untuk
# mendapatkan vhost HTTPS penuh dari deploy/nginx-walimah.conf.
server {
    listen 80;
    listen [::]:80;
    server_name ${domain} www.${domain};

    location /.well-known/acme-challenge/ {
        root /var/www/html;
    }

    location / {
        proxy_pass http://walimah_backend;
        include /etc/nginx/snippets/walimah-proxy.conf;
    }
}
EOF
  fi

  chmod 644 "$vhost"
  ln -sfn "$vhost" /etc/nginx/sites-enabled/walimah

  # nginx di mesin ini melayani mailcow, portainer, dan situs lain. Konfigurasi
  # yang tidak lolos uji TIDAK boleh sampai ke reload: sekali nginx menolak
  # memuat, yang padam bukan cuma Walimah. Karena itu vhost dicabut kembali
  # begitu `nginx -t` gagal, lalu diuji ulang untuk memastikan mesin kembali
  # ke keadaan yang sah sebelum skrip ini menyerah.
  if ! nginx -t 2>&1 | sed 's/^/    /'; then
    rm -f /etc/nginx/sites-enabled/walimah
    warn "konfigurasi nginx ditolak; vhost Walimah dicabut kembali."
    nginx -t >/dev/null 2>&1 || warn "PERHATIAN: nginx tetap tidak lolos uji — ada masalah lain di luar Walimah."
    die "perbaiki galat di atas, lalu jalankan install.sh lagi."
  fi

  systemctl reload nginx
  say "nginx dimuat ulang"

  if [[ ! -f $cert ]]; then
    echo >&2
    warn "HTTPS belum aktif. Terbitkan sertifikat, lalu jalankan install.sh sekali lagi:"
    warn "  apt install -y certbot python3-certbot-nginx"
    warn "  certbot certonly --webroot -w /var/www/html -d ${domain} -d www.${domain}"
    warn "Pastikan A record ${domain} dan www.${domain} sudah menunjuk ke IP VPS ini."
    warn "Selama HTTPS belum aktif, login admin akan SELALU gagal: cookie sesi"
    warn "memakai flag Secure di produksi, jadi browser tidak pernah mengirimkannya kembali."
  fi
}

if systemctl is-active --quiet nginx 2>/dev/null; then
  say "nginx terdeteksi aktif — memakai jalur nginx, Caddy tidak disentuh"
  configure_nginx
elif systemctl list-unit-files caddy.service >/dev/null 2>&1; then
  if [[ "$port_before" != "$PORT" ]]; then
    # Porta berubah, jadi Caddy harus benar-benar restart. `reload` menjalankan
    # ExecReload di dalam unit yang sudah hidup, dan apakah EnvironmentFile
    # ikut dibaca ulang di sana bergantung pada versi systemd — taruhan yang
    # hadiahnya 502 diam-diam di situs yang baru saja terpasang.
    say "Porta berubah (${port_before:-belum ada} -> ${PORT}), merestart Caddy"
    systemctl restart caddy
  else
    say "Memuat ulang Caddy"
    systemctl reload caddy
  fi
else
  warn "Tidak ada nginx maupun Caddy yang aktif; lewati konfigurasi proxy."
  warn "Situs hanya dapat diakses lewat 127.0.0.1:${PORT} dari dalam VPS."
fi

# -----------------------------------------------------------------------------
# 8. Verifikasi
# -----------------------------------------------------------------------------

say "Memeriksa kesehatan di 127.0.0.1:${PORT}"
# -s tanpa -S: percobaan yang gagal memang diharapkan selama proses masih boot,
# dan mencetak "Failed to connect" pada percobaan pertama membuat deploy yang
# sebenarnya berhasil terbaca seolah gagal. Kegagalan yang sesungguhnya
# dilaporkan sekali di bawah, setelah seluruh percobaan habis.
for attempt in 1 2 3 4 5 6 7 8 9 10; do
  if curl -fs -m 5 -o /dev/null "http://127.0.0.1:${PORT}/"; then
    # Buang cache konten bawaan build.
    #
    # `next build` ikut menyimpan hasil pembacaan isi undangan ke .next/cache,
    # dan pembacaan itu terjadi di direktori repo — bukan di database produksi
    # yang baru dibaca saat layanan berjalan. Tanpa langkah ini, halaman tamu
    # dapat menyajikan isi bawaan repo selama beberapa menit pertama setelah
    # deploy, tepat pada saat orang memeriksa hasil pemasangannya.
    # shellcheck disable=SC1090
    REVALIDATE_SECRET="$(. "$ENV_FILE" >/dev/null 2>&1; printf '%s' "${REVALIDATE_SECRET:-}")"
    if [[ -n $REVALIDATE_SECRET ]]; then
      curl -fs -m 10 -o /dev/null -X POST \
        -H "Authorization: Bearer ${REVALIDATE_SECRET}" \
        "http://127.0.0.1:${PORT}/api/revalidate" \
        || warn "Revalidasi awal gagal; isi undangan menyusul dalam beberapa menit."
    fi

    echo
    say "Selesai. Walimah aktif di porta ${PORT}."
    echo "    Porta tersimpan di ${ENV_FILE} (PORT) dan ${PORT_FILE} (WALIMAH_PORT)."
    echo "    Cron: sudo crontab -e, isi dari deploy/crontab.example (jangan tulis angka porta)."
    echo
    echo "    Menaikkan dari versi yang isinya masih dikelola lewat Google Sheet?"
    echo "    Isi undangan sekarang tinggal di database, dan database yang kosong"
    echo "    disemai dari data contoh — jadi pindahkan dulu isi aslinya:"
    echo "        npm run import-snapshot                  (pratinjau)"
    echo "        npm run import-snapshot -- --confirm --replace"
    echo "    Baris cron export ke Sheet sudah tidak ada; ganti isi crontab dengan"
    echo "    deploy/crontab.example yang baru."
    echo "    Log:  journalctl -u walimah -f"
    exit 0
  fi
  sleep 2
done

systemctl --no-pager --lines=30 status walimah >&2 || true
die "layanan tidak merespons di porta ${PORT} setelah 20 detik. Lihat status di atas."

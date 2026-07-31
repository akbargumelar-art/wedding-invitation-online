#!/usr/bin/env bash
#
# Tentukan porta bebas untuk Walimah di VPS yang dihuni banyak aplikasi, lalu
# paku nilainya ke satu sumber kebenaran.
#
#   sudo ./deploy/resolve-port.sh          # pilih/pertahankan porta
#   sudo ./deploy/resolve-port.sh --show   # hanya cetak porta yang berlaku
#
# Dijalankan sebagai root, sebelum `systemctl restart walimah`. Biasanya lewat
# deploy/install.sh, yang memakainya sebagai `port="$(deploy/resolve-port.sh)"`.
#
# Kontrak keluaran: stdout HANYA berisi angka porta, satu baris. Seluruh
# keterangan pergi ke stderr — tanpa disiplin itu, pemanggil di atas ikut
# menangkap kalimat penjelasan dan meneruskannya sebagai nomor porta.
#
# Porta SENGAJA tidak dipilih ulang setiap kali proses start. server.js
# standalone membaca PORT satu kali dan tidak punya fallback: bila porta
# terpakai ia mati dengan EADDRINUSE dan Restart=always mengubahnya menjadi
# restart-loop. Tapi memilih porta acak tiap boot justru lebih merusak — Caddy
# dan keempat entri cron menunjuk ke satu angka tetap, sehingga setiap restart
# akan membuat situs 502 dan notifikasi berhenti tanpa jejak. Karena itu
# pemilihan terjadi saat deploy, hasilnya ditulis, dan runtime hanya membaca.
set -euo pipefail

ENV_FILE="${ENV_FILE:-/etc/walimah/env}"
# Berkas terpisah, sengaja tidak rahasia: ia dibaca systemd milik Caddy. Memberi
# Caddy seluruh /etc/walimah/env berarti AUTH_SECRET dan token WhatsApp ikut
# terbaca lewat /proc/<pid>/environ oleh proses yang tidak membutuhkannya.
PORT_FILE="${PORT_FILE:-/etc/walimah/port}"

# Upstream nginx, untuk VPS yang 80/443-nya sudah dipegang nginx sehingga Caddy
# tidak bisa dipakai. Ditulis hanya bila nginx memang terpasang. Berkas ini ada
# supaya angka porta tetap tidak pernah tertulis tangan di server block —
# vhost menunjuk ke nama upstream, bukan ke nomor.
NGINX_UPSTREAM_FILE="${NGINX_UPSTREAM_FILE:-/etc/nginx/conf.d/walimah-upstream.conf}"

# Rentang pencarian. 3000–3099 sengaja dilewati: itu wilayah default Next, WAHA,
# Grafana, dan sebagian besar aplikasi Node lain, jadi kemungkinan tabrakannya
# paling tinggi justru di sana.
RANGE_START="${RANGE_START:-3100}"
RANGE_END="${RANGE_END:-3199}"


die() { echo "resolve-port: $*" >&2; exit 1; }

# -----------------------------------------------------------------------------
# Inventaris porta yang sedang didengarkan
# -----------------------------------------------------------------------------

# Semua porta TCP yang sedang didengarkan, alamat apa pun. Alamat ikut dihitung
# karena proses yang mengikat 0.0.0.0:3100 tetap membuat ikatan 127.0.0.1:3100
# gagal — memeriksa loopback saja akan melewatkan justru kasus yang paling umum
# di VPS multi-aplikasi.
listening_ports() {
  if command -v ss >/dev/null 2>&1; then
    ss -Hltn 2>/dev/null | awk '{ print $4 }' | sed 's/.*://' | grep -E '^[0-9]+$' || true
    return
  fi

  # Fallback bila iproute2 tidak terpasang. Hanya mendeteksi pendengar di
  # loopback, jadi kurang teliti — cukup untuk menghindari kegagalan total.
  echo "resolve-port: 'ss' tidak ada, deteksi porta memakai fallback loopback." >&2
  local port
  for ((port = RANGE_START; port <= RANGE_END; port++)); do
    if (exec 3<>"/dev/tcp/127.0.0.1/${port}") 2>/dev/null; then
      exec 3<&- 2>/dev/null || true
      echo "$port"
    fi
  done
}

# Rentang porta ephemeral kernel. Porta di dalamnya bisa direbut sewaktu-waktu
# oleh koneksi keluar milik proses lain, dan kegagalannya muncul jauh di
# kemudian hari sebagai restart yang tiba-tiba gagal mengikat.
in_ephemeral_range() {
  local port=$1 low high
  local range=/proc/sys/net/ipv4/ip_local_port_range
  [[ -r $range ]] || return 1
  read -r low high < "$range" || return 1
  [[ $port -ge $low && $port -le $high ]]
}

read_env_port() {
  [[ -f $ENV_FILE ]] || return 0
  sed -n 's/^PORT=\([0-9]\+\).*/\1/p' "$ENV_FILE" | tail -1
}

# -----------------------------------------------------------------------------
# Penulisan
# -----------------------------------------------------------------------------

set_env_port() {
  local port=$1 tmp
  tmp="$(mktemp)"
  trap 'rm -f "$tmp"' RETURN

  if [[ -f $ENV_FILE ]]; then
    cat "$ENV_FILE" > "$tmp"
  fi

  if grep -qE '^PORT=' "$tmp" 2>/dev/null; then
    sed -i "s|^PORT=.*|PORT=${port}|" "$tmp"
  else
    printf 'PORT=%s\n' "$port" >> "$tmp"
  fi

  # 600 dan milik root: berkas ini memuat seluruh rahasia produksi.
  install -m 600 -o root -g root "$tmp" "$ENV_FILE"
}

set_nginx_upstream() {
  local port=$1 tmp
  # Lewati bila nginx tidak terpasang: di VPS ber-Caddy, direktori ini tidak
  # ada dan menulisnya hanya menaruh sampah.
  [[ -d "$(dirname "$NGINX_UPSTREAM_FILE")" ]] || return 0

  tmp="$(mktemp)"
  trap 'rm -f "$tmp"' RETURN

  cat > "$tmp" <<EOF
# Dihasilkan oleh deploy/resolve-port.sh — jangan disunting manual.
# Dipakai deploy/nginx-walimah.conf sebagai proxy_pass http://walimah_backend.
upstream walimah_backend {
    server 127.0.0.1:${port};

    # Koneksi menganggur yang disimpan untuk dipakai ulang. Berpasangan dengan
    # proxy_http_version 1.1 dan Connection "" di walimah-proxy.conf; tanpa
    # keduanya baris ini tidak berefek apa-apa.
    keepalive 16;
}
EOF

  install -m 644 -o root -g root "$tmp" "$NGINX_UPSTREAM_FILE"
}

set_port_file() {
  local port=$1 tmp
  tmp="$(mktemp)"
  trap 'rm -f "$tmp"' RETURN

  cat > "$tmp" <<EOF
# Dihasilkan oleh deploy/resolve-port.sh — jangan disunting manual.
# Dibaca systemd milik Caddy lewat drop-in caddy-port.conf, dan dipakai
# Caddyfile sebagai {\$WALIMAH_PORT}.
WALIMAH_PORT=${port}
EOF

  install -m 644 -o root -g root "$tmp" "$PORT_FILE"
}

# -----------------------------------------------------------------------------
# Alur utama
# -----------------------------------------------------------------------------

if [[ "${1:-}" == "--show" ]]; then
  port="$(read_env_port)"
  [[ -n $port ]] || die "PORT belum disetel di ${ENV_FILE}. Jalankan skrip ini tanpa --show."
  echo "$port"
  exit 0
fi

[[ $EUID -eq 0 ]] || die "harus dijalankan sebagai root (menulis ${ENV_FILE})."
[[ -f $ENV_FILE ]] || die "${ENV_FILE} tidak ada. Pasang deploy/env.production.example lebih dulu."

mapfile -t taken < <(listening_ports)
current="$(read_env_port)"

is_taken() {
  local needle=$1 p
  for p in "${taken[@]}"; do
    [[ $p == "$needle" ]] && return 0
  done
  return 1
}

# Pertahankan porta yang sudah dipakai bila masih layak. Deploy harus idempoten:
# mengubah porta pada deploy rutin berarti Caddy dan cron ikut harus disentuh
# tanpa alasan, dan setiap perubahan itu adalah kesempatan baru untuk salah.
#
# Syarat "layak" mencakup berada DI DALAM rentang pencarian, dan itu bukan
# kerewelan. Templat env dikirim dengan PORT=3000 sebagai penahan tempat, jadi
# tanpa syarat ini pemasangan pertama akan mempertahankan 3000 begitu saja
# setiap kali porta itu kebetulan sedang menganggur — dan 3000 justru porta
# yang paling diperebutkan di VPS berpenghuni banyak aplikasi. Cukup satu
# tetangga sedang mati saat deploy, dan bentrokannya baru muncul ketika
# tetangga itu hidup lagi, jauh dari penyebabnya.
#
# Yang "sedang menganggur" dan yang "tidak dimiliki siapa pun" adalah dua hal
# berbeda; ss hanya bisa menjawab yang pertama. Rentang 3100-3199 dipilih
# justru supaya pertanyaan kedua tidak perlu dijawab.
in_search_range() {
  local port=$1
  [[ $port -ge $RANGE_START && $port -le $RANGE_END ]]
}

if [[ -n $current ]] && in_search_range "$current"; then
  if systemctl is-active --quiet walimah 2>/dev/null; then
    # Layanan hidup, jadi pendengar di porta itu memang milik kita sendiri.
    echo "resolve-port: mempertahankan porta ${current} (walimah sedang aktif)." >&2
    set_port_file "$current"
    set_nginx_upstream "$current"
    echo "$current"
    exit 0
  fi

  if ! is_taken "$current" && ! in_ephemeral_range "$current"; then
    echo "resolve-port: mempertahankan porta ${current} (masih bebas)." >&2
    set_port_file "$current"
    set_nginx_upstream "$current"
    echo "$current"
    exit 0
  fi

  echo "resolve-port: porta ${current} sudah dipakai aplikasi lain, mencari pengganti." >&2
elif [[ -n $current ]]; then
  echo "resolve-port: porta ${current} di luar rentang ${RANGE_START}-${RANGE_END}, memilih ulang." >&2
fi

for ((candidate = RANGE_START; candidate <= RANGE_END; candidate++)); do
  is_taken "$candidate" && continue
  in_ephemeral_range "$candidate" && continue

  set_env_port "$candidate"
  set_port_file "$candidate"
  set_nginx_upstream "$candidate"

  echo "resolve-port: porta ${candidate} dipilih dan ditulis ke ${ENV_FILE}." >&2
  echo "resolve-port: muat ulang proxy agar mengikuti (nginx: 'nginx -t && systemctl reload nginx'; caddy: 'systemctl restart caddy')." >&2
  echo "$candidate"
  exit 0
done

die "tidak ada porta bebas di rentang ${RANGE_START}-${RANGE_END}. Setel RANGE_START/RANGE_END."

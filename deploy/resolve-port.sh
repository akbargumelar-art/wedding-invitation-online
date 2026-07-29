#!/usr/bin/env bash
#
# Tentukan porta bebas untuk Walimah di VPS yang dihuni banyak aplikasi, lalu
# paku nilainya ke satu sumber kebenaran.
#
#   sudo ./deploy/resolve-port.sh          # pilih/pertahankan porta
#   sudo ./deploy/resolve-port.sh --show   # hanya cetak porta yang berlaku
#
# Dijalankan sebagai root, sebelum `systemctl restart walimah`.
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
if [[ -n $current ]]; then
  if systemctl is-active --quiet walimah 2>/dev/null; then
    # Layanan hidup, jadi pendengar di porta itu memang milik kita sendiri.
    echo "resolve-port: mempertahankan porta ${current} (walimah sedang aktif)."
    set_port_file "$current"
    echo "$current"
    exit 0
  fi

  if ! is_taken "$current" && ! in_ephemeral_range "$current"; then
    echo "resolve-port: mempertahankan porta ${current} (masih bebas)."
    set_port_file "$current"
    echo "$current"
    exit 0
  fi

  echo "resolve-port: porta ${current} sudah dipakai aplikasi lain, mencari pengganti." >&2
fi

for ((candidate = RANGE_START; candidate <= RANGE_END; candidate++)); do
  is_taken "$candidate" && continue
  in_ephemeral_range "$candidate" && continue

  set_env_port "$candidate"
  set_port_file "$candidate"

  echo "resolve-port: porta ${candidate} dipilih dan ditulis ke ${ENV_FILE}." >&2
  echo "resolve-port: jalankan 'systemctl reload caddy' agar proxy mengikuti." >&2
  echo "$candidate"
  exit 0
done

die "tidak ada porta bebas di rentang ${RANGE_START}-${RANGE_END}. Setel RANGE_START/RANGE_END."

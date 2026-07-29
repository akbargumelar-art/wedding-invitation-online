#!/usr/bin/env bash
#
# Kirim hasil build dari mesin lokal ke VPS (mitigasi R-3: build di VPS 1 GB
# rawan OOM). Jalankan dari akar repo SETELAH `npm run build`.
#
#   ./deploy/deploy.sh user@vps.contoh.com
#
set -euo pipefail

TARGET="${1:-}"
REMOTE_DIR="${REMOTE_DIR:-/opt/walimah}"

if [[ -z "$TARGET" ]]; then
  echo "Penggunaan: ./deploy/deploy.sh user@host" >&2
  exit 1
fi

if [[ ! -d .next/standalone ]]; then
  echo "Folder .next/standalone tidak ada. Jalankan 'npm run build' lebih dulu." >&2
  exit 1
fi

# better-sqlite3, @node-rs/argon2, dan sharp adalah addon native, dan bundel
# standalone ikut membawa binari untuk platform tempat `npm install` berjalan.
# Bundel hasil build di Windows atau macOS akan ter-rsync dengan rapi lalu
# membuat layanan mati saat boot di Ubuntu — kegagalan yang muncul jauh dari
# penyebabnya. Tolak di sini, bukan di sana.
FOREIGN_BINARIES="$(find .next/standalone -name '*.node' \
  \( -path '*win32*' -o -path '*darwin*' \) -print 2>/dev/null || true)"

if [[ "$(uname -s)" != "Linux" || -n "$FOREIGN_BINARIES" ]]; then
  echo "Bundel dibangun di $(uname -s), bukan Linux." >&2
  [[ -n "$FOREIGN_BINARIES" ]] && echo "$FOREIGN_BINARIES" >&2
  echo >&2
  echo "Skrip ini hanya sah dijalankan dari mesin Linux. Dari Windows, deploy" >&2
  echo "lewat git: push ke remote, lalu di VPS jalankan git pull + npm ci +" >&2
  echo "rm -rf .next + npm run build + systemctl restart walimah." >&2
  exit 1
fi

echo "==> Menyiapkan paket standalone"
# Next tidak menyalin dua folder ini ke standalone secara otomatis.
rm -rf .next/standalone/.next/static .next/standalone/public
cp -r .next/static .next/standalone/.next/static
cp -r public .next/standalone/public
# Data seed dibaca saat runtime bila snapshot belum terbentuk.
mkdir -p .next/standalone/data
cp data/seed.json .next/standalone/data/seed.json

echo "==> Mengirim ke ${TARGET}:${REMOTE_DIR}"
rsync -az --delete \
  --rsync-path="sudo rsync" \
  .next/standalone/ "${TARGET}:${REMOTE_DIR}/.next/standalone/"

echo "==> Memperbaiki kepemilikan dan merestart layanan"
# shellcheck disable=SC2029
ssh "$TARGET" "sudo chown -R walimah:walimah ${REMOTE_DIR} && sudo systemctl restart walimah && sleep 3 && sudo systemctl is-active walimah"

echo "==> Selesai. Pantau log dengan: ssh ${TARGET} 'journalctl -u walimah -f'"

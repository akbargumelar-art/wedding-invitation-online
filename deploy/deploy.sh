#!/usr/bin/env bash
#
# Kirim hasil build dari mesin lokal ke VPS (mitigasi R-3: build di VPS 1 GB
# rawan OOM). Jalankan dari akar repo SETELAH `npm run build`.
#
#   ./deploy/deploy.sh user@vps.contoh.com
#
# Ini jalur ALTERNATIF, dan hanya sah dari mesin Linux. Jalur utama adalah
# git + deploy/install.sh di VPS; lihat README §4.
#
# Skrip ini TIDAK menyentuh porta: ia hanya mengganti bundel dan merestart
# layanan. Porta sudah ditetapkan deploy/install.sh pada pemasangan pertama
# dan tersimpan di /etc/walimah/env, jadi restart di sini memakai nilai yang
# sama. Bila porta perlu dipilih ulang, jalankan resolve-port.sh di VPS.
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
  echo "lewat git:" >&2
  echo "  git push" >&2
  echo "  ssh user@vps 'cd /opt/walimah && sudo git pull && sudo ./deploy/install.sh'" >&2
  exit 1
fi

echo "==> Menyiapkan paket standalone"
# Langkah penyalinannya ada di satu skrip agar identik dengan yang dipakai
# harness E2E — paket yang diuji dan paket yang dikirim tidak boleh berbeda.
node scripts/pack-standalone.mjs

echo "==> Mengirim ke ${TARGET}:${REMOTE_DIR}"
rsync -az --delete \
  --rsync-path="sudo rsync" \
  .next/standalone/ "${TARGET}:${REMOTE_DIR}/.next/standalone/"

echo "==> Memperbaiki kepemilikan dan merestart layanan"
# shellcheck disable=SC2029
ssh "$TARGET" "sudo chown -R walimah:walimah ${REMOTE_DIR} && sudo systemctl restart walimah && sleep 3 && sudo systemctl is-active walimah"

# Buang cache konten bawaan build.
#
# Bundel ini dibangun di mesin pengembang, dan `next build` ikut menyimpan hasil
# pembacaan isi undangan dari database LOKAL ke .next/cache. Tanpa langkah ini,
# tamu dapat melihat isi undangan milik mesin pengembang selama beberapa menit
# pertama setelah deploy.
echo "==> Menyegarkan konten"
# shellcheck disable=SC2029
ssh "$TARGET" "set -a; . /etc/walimah/env; set +a; curl -fs -m 10 -o /dev/null -X POST -H \"Authorization: Bearer \${REVALIDATE_SECRET}\" http://127.0.0.1:\${PORT}/api/revalidate" \
  || echo "    Revalidasi gagal; isi undangan menyusul dalam beberapa menit." >&2

echo "==> Selesai. Pantau log dengan: ssh ${TARGET} 'journalctl -u walimah -f'"

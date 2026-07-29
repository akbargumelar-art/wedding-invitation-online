# Musik latar

Taruh satu berkas audio di folder ini, lalu isi `backsound_url` di tab **Config**
pada Sheet (atau di `data/seed.json` selama belum tersambung ke Sheet):

```
backsound_url = /audio/backsound.mp3
```

Selama `backsound_url` kosong, tombol musik tidak muncul dan **tidak ada satu byte
pun audio yang diunduh tamu** — jadi undangan tetap ringan bila musiknya belum
siap.

## Yang perlu diperhatikan

| Hal | Anjuran |
|---|---|
| Format | `.mp3` — paling luas didukung peramban ponsel |
| Ukuran | Di bawah 2 MB. Anggaran total halaman 500 KB, dan audio baru diunduh setelah tamu menekan "Buka Undangan" sehingga tidak menghitung ke angka itu — tetapi kuota tamu tetap keluar |
| Durasi | 1–3 menit sudah cukup; pemutarannya berulang otomatis |
| Volume | Rekaman yang tenang. Pemutar menyetel volume ke 45%, tetapi sumber yang keras tetap terdengar mengagetkan |
| Hak cipta | Pakai instrumen bebas royalti atau yang Anda miliki izinnya. Undangan ini dapat diakses publik lewat tautan |

Tamu selalu dapat mematikannya lewat tombol di pojok kanan bawah, dan pilihannya
diingat selama sesi. Peramban ponsel juga berhak menolak memutar audio otomatis —
itu ditangani tanpa merusak halaman, musik baru berbunyi setelah tamu berinteraksi.

Berkas audio tidak disertakan di repositori ini.

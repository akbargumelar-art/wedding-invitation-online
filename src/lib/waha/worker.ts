import 'server-only';

import { logger } from '@/lib/logger';
import { tickOutbox } from './sender';

/**
 * Penggerak antrean undangan.
 *
 * Sebuah pencacah kecil di dalam proses server, bukan cron sistem. Alasannya
 * ada pada satuan waktunya: jeda antar-undangan diukur dalam puluhan detik,
 * sedangkan cron paling rapat pun hanya berjalan tiap menit — antrean 200 tamu
 * akan memakan lebih dari tiga jam hanya karena keterbatasan penjadwalnya.
 *
 * Yang menentukan kapan pesan benar-benar terkirim tetap stempel waktu di
 * database (lihat sender.ts), bukan pencacah ini. Pencacah hanya bertanya
 * "sudah waktunya?" secara berkala, sehingga menjalankannya lebih sering tidak
 * pernah mempercepat pengiriman.
 *
 * Dinyalakan dari dalam graf aplikasi — route broadcast dan pemuatan dashboard —
 * dan BUKAN dari `instrumentation.ts`; alasannya dicatat di berkas itu.
 * Sebagai jaring pengaman bila layanan direstart di tengah antrean dan tidak
 * ada yang membuka dashboard, `/api/cron/invitations` menjalankan langkah yang
 * sama dari cron sistem.
 */

const TICK_MS = 5_000;

/**
 * Berhenti sendiri setelah sekian tick tanpa pekerjaan.
 *
 * Pencacah yang hidup selamanya akan membangunkan proses tiap lima detik
 * sepanjang bulan-bulan sebelum acara, hanya untuk menemukan antrean kosong.
 */
const IDLE_TICKS_BEFORE_STOP = 12;

const globalForWorker = globalThis as unknown as {
  __walimahOutboxTimer?: NodeJS.Timeout | undefined;
};

export function ensureOutboxWorker(): void {
  // Dev melakukan hot reload berkali-kali, dan fungsi ini sengaja dipanggil dari
  // beberapa tempat; tanpa penjaga ini setiap panggilan menambah satu pencacah
  // lagi ke proses yang sama — dan dua pencacah berarti dua pesan terkirim
  // berdekatan, persis yang harus dihindari.
  if (globalForWorker.__walimahOutboxTimer) return;

  let running = false;
  let idleTicks = 0;

  const stop = (): void => {
    const timer = globalForWorker.__walimahOutboxTimer;
    if (!timer) return;

    clearInterval(timer);
    globalForWorker.__walimahOutboxTimer = undefined;
  };

  const timer = setInterval(() => {
    // Satu tick yang masih menunggu jawaban WAHA tidak boleh ditumpuk tick
    // berikutnya — itu persis cara mengirim dua pesan tanpa jeda.
    if (running) return;
    running = true;

    void tickOutbox()
      .then((result) => {
        idleTicks = result.status === 'idle' ? idleTicks + 1 : 0;
        if (idleTicks >= IDLE_TICKS_BEFORE_STOP) stop();
      })
      .catch((error: unknown) => {
        logger.error('waha.worker_failed', { error });
      })
      .finally(() => {
        running = false;
      });
  }, TICK_MS);

  // Jangan menahan proses tetap hidup hanya demi pencacah ini saat server
  // diminta berhenti.
  timer.unref();

  globalForWorker.__walimahOutboxTimer = timer;
  logger.info('waha.worker_started', { tickMs: TICK_MS });
}

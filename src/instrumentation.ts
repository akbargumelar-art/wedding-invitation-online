/**
 * Dijalankan sekali saat proses server boot.
 *
 * Gagal cepat di sini jauh lebih baik daripada aplikasi hidup dengan AUTH_SECRET
 * kosong atau tanpa hash kata sandi admin — kondisi yang membuat sesi admin bisa
 * dipalsukan tanpa ada tanda apa pun di log.
 */
export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME !== 'nodejs') return;

  const { assertProductionEnv, env } = await import('@/lib/env');
  const { logger } = await import('@/lib/logger');

  assertProductionEnv();

  logger.info('app.boot', {
    siteUrl: env.siteUrl,
    dbPath: env.db.path,
  });

  // Pencacah antrean undangan TIDAK dinyalakan dari sini.
  //
  // Berkas instrumentasi dikompilasi sebagai bundel tersendiri. Mengimpor modul
  // aplikasi ke dalamnya menggandakan modul yang sama di dua graf webpack, dan
  // akibatnya baru muncul jauh dari sini: setiap halaman yang perlu dirender
  // atas permintaan gagal dengan `TypeError: a[d] is not a function` dari
  // webpack-runtime, sementara halaman yang sudah dipra-render tetap tersaji
  // seolah tidak ada yang salah.
  //
  // Pencacahnya dinyalakan dari dalam graf aplikasi sendiri — lihat
  // `ensureOutboxWorker()` di src/lib/waha/worker.ts.
}

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
    sheetsConfigured: Boolean(env.sheets.id),
    dbPath: env.db.path,
  });
}

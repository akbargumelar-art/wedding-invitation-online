/**
 * Perhitungan jeda antar-pengiriman undangan.
 *
 * Berdiri sendiri tanpa impor apa pun supaya dapat diuji langsung — sisa modul
 * pengirim menyeret database dan jaringan, dan justru aturan jeda inilah yang
 * paling perlu dibuktikan benar: satu kekeliruan di sini berarti undangan
 * terkirim beruntun dan nomor mempelai diblokir WhatsApp.
 */

/**
 * Jeda acak dalam milidetik, di antara `minSeconds` dan `maxSeconds`.
 *
 * Acak dan bukan tetap: pengiriman dengan jarak yang persis sama justru pola
 * yang paling mudah dikenali sebagai otomatisasi. Rentang yang tertukar
 * dirapikan, bukan ditolak — hasilnya tetap jeda yang sah, dan mengembalikan
 * nol di sini berarti pengiriman beruntun.
 */
export function randomDelayMs(
  minSeconds: number,
  maxSeconds: number,
  random: () => number = Math.random,
): number {
  const low = Math.max(0, Math.min(minSeconds, maxSeconds));
  const high = Math.max(0, Math.max(minSeconds, maxSeconds));

  return Math.round((low + random() * (high - low)) * 1000);
}

/**
 * Jadwal percobaan ulang pengiriman notifikasi: 30 dtk, 2 mnt, 8 mnt, 32 mnt,
 * lalu ditahan di 1 jam.
 *
 * Dipisah dari `index.ts` karena modul itu mengimpor `next/server`, sementara
 * fungsi ini murni aritmetika dan harus dapat diuji tanpa runtime Next.
 */
export function retryDelaySeconds(attempts: number): number {
  return Math.min(30 * 4 ** Math.max(0, attempts), 3600);
}

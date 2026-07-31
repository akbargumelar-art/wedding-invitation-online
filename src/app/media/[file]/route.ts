import { readMediaFile } from '@/lib/uploads';

export const runtime = 'nodejs';

/**
 * GET /media/[file] — sajikan gambar isi undangan yang diunggah lewat dashboard.
 *
 * Sengaja TANPA autentikasi: berkas di sini adalah foto mempelai, galeri, dan
 * QRIS yang memang harus terlihat oleh setiap tamu. Yang menjaganya tetap aman
 * adalah nama berkas — hanya pola UUID buatan sendiri yang dilayani, sehingga
 * tidak ada cara menebak atau menjelajah isi direktori lewat route ini.
 *
 * Bukti transfer TIDAK pernah dilayani dari sini; berkas itu ada di direktori
 * berbeda dan hanya dapat dibaca lewat `/api/admin/proof/[file]`.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ file: string }> },
): Promise<Response> {
  const { file } = await params;
  const image = readMediaFile(file);

  if (!image) return new Response('Not found', { status: 404 });

  return new Response(new Uint8Array(image.buffer), {
    headers: {
      'content-type': image.contentType,
      // Nama berkas adalah UUID dan isinya tidak pernah berubah setelah
      // diunggah — mengganti gambar berarti mengunggah berkas baru dengan nama
      // baru. Karena itu aman di-cache selamanya.
      'cache-control': 'public, max-age=31536000, immutable',
      'content-length': String(image.buffer.byteLength),
      'x-content-type-options': 'nosniff',
    },
  });
}

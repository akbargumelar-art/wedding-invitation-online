import { mkdirSync, readFileSync, unlinkSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import path from 'node:path';
import { env } from '@/lib/env';
import { logger } from '@/lib/logger';

/**
 * Penanganan berkas gambar yang diunggah (US-12 / PRD §4.5).
 *
 * Aturan yang ditegakkan di sini:
 *  - tipe diperiksa dari magic bytes, bukan dari ekstensi atau header Content-Type
 *    yang sepenuhnya dikendalikan klien;
 *  - ukuran maksimum 2 MB;
 *  - nama berkas diganti UUID, jadi nama asli dari perangkat pengunggah tidak
 *    pernah menyentuh filesystem;
 *  - keduanya disimpan di luar web root, sehingga tidak ada berkas yang tersaji
 *    hanya karena kebetulan ada di sebuah folder.
 *
 * Ada DUA tujuan penyimpanan, dan perbedaannya disengaja:
 *
 *  - `UPLOAD_DIR`  — bukti transfer dari tamu. Rahasia: hanya dapat dibaca
 *    lewat route admin terautentikasi, dan ikut terhapus saat masa retensi
 *    berakhir.
 *  - `MEDIA_DIR`   — foto mempelai, galeri, dan QRIS yang diunggah admin.
 *    Memang untuk dilihat siapa pun, disajikan lewat `/media/<berkas>`, dan
 *    tidak pernah ikut terhapus oleh pembersihan retensi.
 *
 * Menyatukan keduanya dalam satu folder akan membuat satu kesalahan konfigurasi
 * berakibat bocornya bukti transfer, jadi keduanya tidak pernah dicampur.
 */

export type ImageKind = 'jpeg' | 'png' | 'webp';

const EXTENSIONS: Record<ImageKind, string> = {
  jpeg: '.jpg',
  png: '.png',
  webp: '.webp',
};

const MIME_TYPES: Record<ImageKind, string> = {
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
};

/** Kembalikan jenis gambar berdasarkan magic bytes, atau null bila tidak dikenal. */
export function detectImageKind(buffer: Buffer): ImageKind | null {
  if (buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
    return 'jpeg';
  }

  const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
  if (buffer.length >= 8 && PNG_SIGNATURE.every((byte, index) => buffer[index] === byte)) {
    return 'png';
  }

  if (
    buffer.length >= 12 &&
    buffer.toString('ascii', 0, 4) === 'RIFF' &&
    buffer.toString('ascii', 8, 12) === 'WEBP'
  ) {
    return 'webp';
  }

  return null;
}

export type StoredProof = { fileName: string; kind: ImageKind; bytes: number };

export type UploadFailure =
  | { ok: false; code: 'TOO_LARGE'; message: string }
  | { ok: false; code: 'UNSUPPORTED'; message: string };

export type UploadResult = { ok: true; proof: StoredProof } | UploadFailure;

type StoreOptions = {
  dir: string;
  /** Izin berkas: 0o640 untuk berkas rahasia, 0o644 untuk yang memang publik. */
  mode: number;
  /** Pesan yang dilihat pengunggah bila jenis berkasnya tidak didukung. */
  unsupportedMessage: string;
};

async function storeImage(file: File, options: StoreOptions): Promise<UploadResult> {
  const tooLarge: UploadFailure = {
    ok: false,
    code: 'TOO_LARGE',
    message: `Ukuran berkas maksimal ${Math.floor(env.uploads.maxBytes / 1024 / 1024)} MB.`,
  };

  if (file.size > env.uploads.maxBytes) return tooLarge;

  const buffer = Buffer.from(await file.arrayBuffer());

  // Ukuran diperiksa dua kali: `file.size` bisa berbohong, panjang buffer tidak.
  if (buffer.byteLength > env.uploads.maxBytes) return tooLarge;

  const kind = detectImageKind(buffer);
  if (!kind) {
    return { ok: false, code: 'UNSUPPORTED', message: options.unsupportedMessage };
  }

  const fileName = `${randomUUID()}${EXTENSIONS[kind]}`;
  mkdirSync(options.dir, { recursive: true });

  const { writeFile } = await import('node:fs/promises');
  await writeFile(path.join(options.dir, fileName), buffer, { mode: options.mode });

  return { ok: true, proof: { fileName, kind, bytes: buffer.byteLength } };
}

export async function storeProofFile(file: File): Promise<UploadResult> {
  return storeImage(file, {
    dir: env.uploads.dir,
    mode: 0o640,
    unsupportedMessage: 'Bukti transfer harus berupa gambar JPG, PNG, atau WEBP.',
  });
}

/** Gambar isi undangan yang diunggah admin lewat dashboard. */
export async function storeMediaFile(file: File): Promise<UploadResult> {
  return storeImage(file, {
    dir: env.uploads.mediaDir,
    mode: 0o644,
    unsupportedMessage: 'Gambar harus berformat JPG, PNG, atau WEBP.',
  });
}

/**
 * Tolak nama berkas apa pun yang tidak berbentuk UUID + ekstensi yang kita buat
 * sendiri. Ini yang menutup path traversal (`../../etc/passwd`) pada route
 * pratinjau bukti maupun penyaji media.
 */
const SAFE_FILE_NAME =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(jpg|png|webp)$/i;

export function isSafeProofName(fileName: string): boolean {
  return SAFE_FILE_NAME.test(fileName);
}

/** Nama berkas media memakai aturan yang sama persis dengan bukti transfer. */
export const isSafeMediaName = isSafeProofName;

function readImage(fileName: string, dir: string): { buffer: Buffer; contentType: string } | null {
  if (!isSafeProofName(fileName)) return null;

  const fullPath = path.join(dir, fileName);

  // Sabuk pengaman kedua: pastikan hasil resolusi benar-benar di dalam direktori.
  if (path.dirname(path.resolve(fullPath)) !== path.resolve(dir)) return null;

  try {
    const buffer = readFileSync(fullPath);
    const kind = detectImageKind(buffer);
    return { buffer, contentType: kind ? MIME_TYPES[kind] : 'application/octet-stream' };
  } catch {
    return null;
  }
}

export function readProofFile(fileName: string): { buffer: Buffer; contentType: string } | null {
  return readImage(fileName, env.uploads.dir);
}

export function readMediaFile(fileName: string): { buffer: Buffer; contentType: string } | null {
  return readImage(fileName, env.uploads.mediaDir);
}

function deleteImage(fileName: string, dir: string): boolean {
  if (!isSafeProofName(fileName)) return false;
  try {
    unlinkSync(path.join(dir, fileName));
    return true;
  } catch (error) {
    logger.warn('upload.delete_failed', { error, fileName });
    return false;
  }
}

export function deleteProofFile(fileName: string): boolean {
  return deleteImage(fileName, env.uploads.dir);
}

export function deleteMediaFile(fileName: string): boolean {
  return deleteImage(fileName, env.uploads.mediaDir);
}

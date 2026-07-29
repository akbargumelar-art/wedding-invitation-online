import { mkdirSync, readFileSync, unlinkSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import path from 'node:path';
import { env } from '@/lib/env';
import { logger } from '@/lib/logger';

/**
 * Penanganan upload bukti transfer (US-12 / PRD §4.5).
 *
 * Aturan yang ditegakkan di sini:
 *  - tipe diperiksa dari magic bytes, bukan dari ekstensi atau header Content-Type
 *    yang sepenuhnya dikendalikan klien;
 *  - ukuran maksimum 2 MB;
 *  - nama berkas diganti UUID, jadi nama asli dari perangkat tamu tidak pernah
 *    menyentuh filesystem;
 *  - disimpan di luar web root sehingga tidak bisa diakses langsung lewat URL,
 *    hanya lewat route admin terautentikasi.
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

export async function storeProofFile(file: File): Promise<UploadResult> {
  if (file.size > env.uploads.maxBytes) {
    return {
      ok: false,
      code: 'TOO_LARGE',
      message: `Ukuran berkas maksimal ${Math.floor(env.uploads.maxBytes / 1024 / 1024)} MB.`,
    };
  }

  const buffer = Buffer.from(await file.arrayBuffer());

  // Ukuran diperiksa dua kali: `file.size` bisa berbohong, panjang buffer tidak.
  if (buffer.byteLength > env.uploads.maxBytes) {
    return {
      ok: false,
      code: 'TOO_LARGE',
      message: `Ukuran berkas maksimal ${Math.floor(env.uploads.maxBytes / 1024 / 1024)} MB.`,
    };
  }

  const kind = detectImageKind(buffer);
  if (!kind) {
    return {
      ok: false,
      code: 'UNSUPPORTED',
      message: 'Bukti transfer harus berupa gambar JPG, PNG, atau WEBP.',
    };
  }

  const fileName = `${randomUUID()}${EXTENSIONS[kind]}`;
  mkdirSync(env.uploads.dir, { recursive: true });

  const { writeFile } = await import('node:fs/promises');
  await writeFile(path.join(env.uploads.dir, fileName), buffer, { mode: 0o640 });

  return { ok: true, proof: { fileName, kind, bytes: buffer.byteLength } };
}

/**
 * Tolak nama berkas apa pun yang tidak berbentuk UUID + ekstensi yang kita buat
 * sendiri. Ini yang menutup path traversal (`../../etc/passwd`) pada route
 * pratinjau bukti.
 */
const SAFE_FILE_NAME =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(jpg|png|webp)$/i;

export function isSafeProofName(fileName: string): boolean {
  return SAFE_FILE_NAME.test(fileName);
}

export function readProofFile(fileName: string): { buffer: Buffer; contentType: string } | null {
  if (!isSafeProofName(fileName)) return null;

  const fullPath = path.join(env.uploads.dir, fileName);

  // Sabuk pengaman kedua: pastikan hasil resolusi benar-benar di dalam UPLOAD_DIR.
  if (path.dirname(path.resolve(fullPath)) !== path.resolve(env.uploads.dir)) return null;

  try {
    const buffer = readFileSync(fullPath);
    const kind = detectImageKind(buffer);
    return { buffer, contentType: kind ? MIME_TYPES[kind] : 'application/octet-stream' };
  } catch {
    return null;
  }
}

export function deleteProofFile(fileName: string): boolean {
  if (!isSafeProofName(fileName)) return false;
  try {
    unlinkSync(path.join(env.uploads.dir, fileName));
    return true;
  } catch (error) {
    logger.warn('upload.delete_failed', { error, fileName });
    return false;
  }
}

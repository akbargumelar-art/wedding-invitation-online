import { afterAll, describe, expect, it } from 'vitest';
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

/**
 * Tes I/O upload memakai direktori sementara. UPLOAD_DIR disetel sebelum modul
 * env dimuat, karena env membaca process.env sekali saat inisialisasi.
 */
const uploadDir = mkdtempSync(path.join(tmpdir(), 'walimah-uploads-'));
process.env['UPLOAD_DIR'] = uploadDir;
process.env['MAX_UPLOAD_BYTES'] = '2097152';

const { deleteProofFile, readProofFile, storeProofFile } = await import('@/lib/uploads');

afterAll(() => rmSync(uploadDir, { recursive: true, force: true }));

function pngFile(name: string, extraBytes = 32): File {
  const signature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const body = Buffer.concat([signature, Buffer.alloc(extraBytes, 0x11)]);
  return new File([new Uint8Array(body)], name, { type: 'image/png' });
}

describe('storeProofFile', () => {
  it('menyimpan gambar valid dengan nama UUID, bukan nama asli', async () => {
    const result = await storeProofFile(pngFile('bukti transfer saya.png'));

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.proof.kind).toBe('png');
    expect(result.proof.fileName).toMatch(/^[0-9a-f-]{36}\.png$/);
    expect(result.proof.fileName).not.toContain('bukti');
    expect(existsSync(path.join(uploadDir, result.proof.fileName))).toBe(true);
  });

  it('menolak berkas melebihi batas ukuran', async () => {
    const oversized = new File([new Uint8Array(3 * 1024 * 1024)], 'besar.png', {
      type: 'image/png',
    });

    const result = await storeProofFile(oversized);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe('TOO_LARGE');
  });

  it('menolak berkas yang mengaku PNG lewat Content-Type tapi isinya bukan gambar', async () => {
    const disguised = new File([new TextEncoder().encode('<?php echo 1; ?>')], 'evil.png', {
      type: 'image/png',
    });

    const result = await storeProofFile(disguised);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe('UNSUPPORTED');
  });
});

describe('readProofFile & deleteProofFile', () => {
  it('membaca berkas tersimpan dengan content-type sesuai isinya', async () => {
    const stored = await storeProofFile(pngFile('a.png'));
    expect(stored.ok).toBe(true);
    if (!stored.ok) return;

    const read = readProofFile(stored.proof.fileName);
    expect(read?.contentType).toBe('image/png');
    expect(read?.buffer.byteLength).toBe(stored.proof.bytes);
  });

  it('menolak nama berkas hasil path traversal', () => {
    expect(readProofFile('../../../etc/passwd')).toBeNull();
    expect(deleteProofFile('../../../etc/passwd')).toBe(false);
  });

  it('mengembalikan null untuk berkas yang tidak ada', () => {
    expect(readProofFile('3f2504e0-4f89-41d3-9a0c-0305e82c3301.jpg')).toBeNull();
  });

  it('menghapus berkas yang ada', async () => {
    const stored = await storeProofFile(pngFile('hapus.png'));
    expect(stored.ok).toBe(true);
    if (!stored.ok) return;

    expect(deleteProofFile(stored.proof.fileName)).toBe(true);
    expect(existsSync(path.join(uploadDir, stored.proof.fileName))).toBe(false);
  });
});

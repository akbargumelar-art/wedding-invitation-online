import { describe, expect, it } from 'vitest';
import { detectImageKind, isSafeProofName } from '@/lib/uploads';

/**
 * Tipe berkas ditentukan dari magic bytes, bukan dari header Content-Type atau
 * ekstensi yang sepenuhnya dikendalikan klien (PRD §4.5).
 */
describe('detectImageKind', () => {
  it('mengenali JPEG', () => {
    expect(detectImageKind(Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00]))).toBe('jpeg');
  });

  it('mengenali PNG', () => {
    const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00]);
    expect(detectImageKind(png)).toBe('png');
  });

  it('mengenali WebP', () => {
    const webp = Buffer.concat([
      Buffer.from('RIFF', 'ascii'),
      Buffer.from([0, 0, 0, 0]),
      Buffer.from('WEBP', 'ascii'),
    ]);
    expect(detectImageKind(webp)).toBe('webp');
  });

  it('menolak berkas yang hanya berpura-pura gambar', () => {
    // Skrip PHP dengan nama .jpg: header tidak cocok, jadi ditolak.
    expect(detectImageKind(Buffer.from('<?php system($_GET[0]); ?>', 'utf8'))).toBeNull();
  });

  it('menolak berkas kosong atau terlalu pendek', () => {
    expect(detectImageKind(Buffer.alloc(0))).toBeNull();
    expect(detectImageKind(Buffer.from([0xff, 0xd8]))).toBeNull();
  });

  it('menolak RIFF yang bukan WEBP (mis. WAV)', () => {
    const wav = Buffer.concat([
      Buffer.from('RIFF', 'ascii'),
      Buffer.from([0, 0, 0, 0]),
      Buffer.from('WAVE', 'ascii'),
    ]);
    expect(detectImageKind(wav)).toBeNull();
  });
});

describe('isSafeProofName', () => {
  const uuid = '3f2504e0-4f89-41d3-9a0c-0305e82c3301';

  it('menerima nama UUID dengan ekstensi yang kita buat sendiri', () => {
    expect(isSafeProofName(`${uuid}.jpg`)).toBe(true);
    expect(isSafeProofName(`${uuid}.png`)).toBe(true);
    expect(isSafeProofName(`${uuid}.webp`)).toBe(true);
  });

  it('menolak upaya path traversal', () => {
    expect(isSafeProofName('../../etc/passwd')).toBe(false);
    expect(isSafeProofName(`../${uuid}.jpg`)).toBe(false);
    expect(isSafeProofName(`/etc/${uuid}.jpg`)).toBe(false);
  });

  it('menolak ekstensi yang dapat dieksekusi', () => {
    expect(isSafeProofName(`${uuid}.php`)).toBe(false);
    expect(isSafeProofName(`${uuid}.jpg.php`)).toBe(false);
  });

  it('menolak nama yang bukan UUID', () => {
    expect(isSafeProofName('bukti.jpg')).toBe(false);
  });
});

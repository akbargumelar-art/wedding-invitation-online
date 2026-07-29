import { afterEach, describe, expect, it, vi } from 'vitest';
import { resolvePath } from '@/lib/env';

/**
 * `resolvePath` menentukan letak berkas database dan direktori upload di
 * produksi. Ia ditulis tangan — bukan memakai `node:path` — karena `env.ts` ikut
 * dibundel untuk runtime edge, jadi perilakunya harus dijaga di sini.
 */

function withCwd(value: string, run: () => void): void {
  const spy = vi.spyOn(process, 'cwd').mockReturnValue(value);
  try {
    run();
  } finally {
    spy.mockRestore();
  }
}

afterEach(() => vi.restoreAllMocks());

describe('resolvePath', () => {
  it('membiarkan path absolut gaya POSIX apa adanya', () => {
    // Ini bentuk yang dipakai di VPS; menyentuhnya berarti data menulis ke
    // tempat yang salah.
    expect(resolvePath('/var/walimah/data/app.db')).toBe('/var/walimah/data/app.db');
    expect(resolvePath('/var/walimah/uploads')).toBe('/var/walimah/uploads');
  });

  it('membiarkan path absolut gaya Windows apa adanya', () => {
    expect(resolvePath('D:\\website\\walimah\\data\\app.db')).toBe(
      'D:\\website\\walimah\\data\\app.db',
    );
    expect(resolvePath('C:/walimah/data')).toBe('C:/walimah/data');
    expect(resolvePath('\\\\server\\share\\data')).toBe('\\\\server\\share\\data');
  });

  it('menyambung path relatif ke cwd memakai pemisah yang sesuai', () => {
    withCwd('/srv/walimah', () => {
      expect(resolvePath('data/app.db')).toBe('/srv/walimah/data/app.db');
    });

    withCwd('D:\\website\\walimah', () => {
      expect(resolvePath('data/app.db')).toBe('D:\\website\\walimah\\data/app.db');
    });
  });

  it('membuang awalan "./" yang mubazir', () => {
    withCwd('/srv/walimah', () => {
      expect(resolvePath('./data/app.db')).toBe('/srv/walimah/data/app.db');
    });

    withCwd('D:\\website\\walimah', () => {
      expect(resolvePath('.\\data')).toBe('D:\\website\\walimah\\data');
    });
  });

  it('tidak menggandakan pemisah bila cwd sudah berakhiran pemisah', () => {
    withCwd('/srv/walimah/', () => {
      expect(resolvePath('data/app.db')).toBe('/srv/walimah/data/app.db');
    });
  });
});

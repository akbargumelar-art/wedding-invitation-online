import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { loadDotEnvFiles } from '@/lib/dotenv';

/**
 * Pemuat .env untuk skrip CLI.
 *
 * Skrip produksi (`npm run backup`, `npm run purge`, migrasi) bergantung penuh
 * pada berkas ini untuk menemukan DATABASE_PATH dan rahasia admin — kalau
 * parsingnya meleset, skrip itu diam-diam bekerja pada database yang salah.
 */

let dir: string;
const touched: string[] = [];

/** Setel env sementara dan catat agar bisa dibersihkan. */
function preset(key: string, value: string): void {
  process.env[key] = value;
  touched.push(key);
}

function write(file: string, content: string): void {
  writeFileSync(path.join(dir, file), content, 'utf8');
}

beforeEach(() => {
  dir = mkdtempSync(path.join(tmpdir(), 'walimah-dotenv-'));
  vi.spyOn(process, 'cwd').mockReturnValue(dir);
});

afterEach(() => {
  vi.restoreAllMocks();
  rmSync(dir, { recursive: true, force: true });
  for (const key of touched.splice(0)) delete process.env[key];
});

describe('loadDotEnvFiles', () => {
  it('membaca pasangan kunci/nilai sederhana', () => {
    write('.env', 'WALIMAH_T1=nilai\n');
    touched.push('WALIMAH_T1');

    loadDotEnvFiles();
    expect(process.env['WALIMAH_T1']).toBe('nilai');
  });

  it('melewati komentar dan baris kosong', () => {
    write('.env', '# komentar\n\n   \nWALIMAH_T2=ada\n');
    touched.push('WALIMAH_T2');

    loadDotEnvFiles();
    expect(process.env['WALIMAH_T2']).toBe('ada');
  });

  it('membuang tanda kutip yang mengapit nilai', () => {
    write('.env', 'WALIMAH_T3="berkutip"\nWALIMAH_T4=\'tunggal\'\n');
    touched.push('WALIMAH_T3', 'WALIMAH_T4');

    loadDotEnvFiles();
    expect(process.env['WALIMAH_T3']).toBe('berkutip');
    expect(process.env['WALIMAH_T4']).toBe('tunggal');
  });

  it('mempertahankan tanda = di dalam nilai', () => {
    // Hash Argon2id dan token gateway kerap mengandung "=".
    write('.env', 'WALIMAH_T5=a=b=c\n');
    touched.push('WALIMAH_T5');

    loadDotEnvFiles();
    expect(process.env['WALIMAH_T5']).toBe('a=b=c');
  });

  it('tidak pernah menimpa nilai yang sudah ada di process.env', () => {
    // Systemd dan cron menyuntik env sungguhan; berkas .env tidak boleh menang.
    preset('WALIMAH_T6', 'dari-lingkungan');
    write('.env', 'WALIMAH_T6=dari-berkas\n');

    loadDotEnvFiles();
    expect(process.env['WALIMAH_T6']).toBe('dari-lingkungan');
  });

  it('memenangkan .env.local atas .env', () => {
    write('.env.local', 'WALIMAH_T7=lokal\n');
    write('.env', 'WALIMAH_T7=umum\n');
    touched.push('WALIMAH_T7');

    loadDotEnvFiles();
    expect(process.env['WALIMAH_T7']).toBe('lokal');
  });

  it('diam saja bila tidak ada berkas .env sama sekali', () => {
    expect(() => loadDotEnvFiles()).not.toThrow();
  });
});

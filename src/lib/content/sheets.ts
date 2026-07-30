import 'server-only';

import { readFileSync } from 'node:fs';
import { google } from 'googleapis';
import { env } from '@/lib/env';
import type { RawSheetData } from './types';

/**
 * Klien Google Sheets API v4.
 *
 * Dipanggil HANYA dari jalur revalidasi ISR / cron — tidak pernah secara sinkron
 * pada request tamu (PRD §4.2). Kegagalan di sini bukan kondisi fatal: pemanggil
 * wajib turun ke snapshot (US-14).
 */

const READ_SCOPE = 'https://www.googleapis.com/auth/spreadsheets.readonly';
const WRITE_SCOPE = 'https://www.googleapis.com/auth/spreadsheets';

const RANGES = {
  config: 'Config!A:B',
  jadwal: 'Jadwal!A:I',
  galeri: 'Galeri!A:D',
  rekening: 'Rekening!A:D',
  tamu: 'Tamu!A:G',
} as const;

type Credentials = { client_email: string; private_key: string };

function loadCredentials(mode: 'read' | 'write'): Credentials | null {
  const inline = mode === 'read' ? env.sheets.credentialsJson : env.sheets.writeCredentialsJson;
  const filePath = mode === 'read' ? env.sheets.credentialsPath : env.sheets.writeCredentialsPath;

  let rawJson = inline.trim();
  if (!rawJson && filePath) {
    try {
      rawJson = readFileSync(filePath, 'utf8');
    } catch {
      return null;
    }
  }
  if (!rawJson) return null;

  const parsed: unknown = JSON.parse(rawJson);
  if (typeof parsed !== 'object' || parsed === null) return null;

  const { client_email, private_key } = parsed as Partial<Credentials>;
  if (!client_email || !private_key) return null;

  // Private key sering tersimpan dengan \n literal saat ditempel ke env var.
  return { client_email, private_key: private_key.replace(/\\n/g, '\n') };
}

function sheetsClient(mode: 'read' | 'write') {
  const credentials = loadCredentials(mode);
  if (!credentials || !env.sheets.id) return null;

  const auth = new google.auth.JWT({
    email: credentials.client_email,
    key: credentials.private_key,
    scopes: [mode === 'read' ? READ_SCOPE : WRITE_SCOPE],
  });

  return google.sheets({ version: 'v4', auth });
}

/** True bila kredensial baca + sheet id tersedia. Dipakai untuk memutuskan mencoba fetch. */
export function isSheetsConfigured(): boolean {
  return Boolean(env.sheets.id) && loadCredentials('read') !== null;
}

export function isSheetsWriteConfigured(): boolean {
  return Boolean(env.sheets.id) && loadCredentials('write') !== null;
}

/** Baca 5 tab sekaligus dalam satu panggilan batchGet. Melempar bila gagal. */
export async function fetchRawSheetData(): Promise<RawSheetData> {
  const client = sheetsClient('read');
  if (!client) throw new Error('Google Sheets belum dikonfigurasi (sheet id / kredensial kosong).');

  const response = await client.spreadsheets.values.batchGet({
    spreadsheetId: env.sheets.id,
    ranges: Object.values(RANGES),
    majorDimension: 'ROWS',
    valueRenderOption: 'FORMATTED_VALUE',
  });

  const ranges = response.data.valueRanges ?? [];
  const at = (index: number): string[][] =>
    (ranges[index]?.values ?? []).map((row) => row.map((cell) => String(cell ?? '')));

  return {
    config: at(0),
    jadwal: at(1),
    galeri: at(2),
    rekening: at(3),
    tamu: at(4),
  };
}

/**
 * Tulis ulang satu tab export secara idempoten: bersihkan lalu tulis seluruh isi
 * (US-16 — menulis ulang, bukan menambah duplikat).
 */
export async function replaceSheetTab(tabName: string, rows: string[][]): Promise<void> {
  const client = sheetsClient('write');
  if (!client) throw new Error('Kredensial tulis Google Sheets belum dikonfigurasi.');

  await ensureTabExists(tabName);

  await client.spreadsheets.values.clear({
    spreadsheetId: env.sheets.id,
    range: `${tabName}!A:Z`,
  });

  if (rows.length === 0) return;

  await client.spreadsheets.values.update({
    spreadsheetId: env.sheets.id,
    range: `${tabName}!A1`,
    valueInputOption: 'RAW',
    requestBody: { values: rows },
  });
}

async function ensureTabExists(tabName: string): Promise<void> {
  const client = sheetsClient('write');
  if (!client) return;

  const meta = await client.spreadsheets.get({ spreadsheetId: env.sheets.id });
  const exists = (meta.data.sheets ?? []).some((sheet) => sheet.properties?.title === tabName);
  if (exists) return;

  await client.spreadsheets.batchUpdate({
    spreadsheetId: env.sheets.id,
    requestBody: { requests: [{ addSheet: { properties: { title: tabName } } }] },
  });
}

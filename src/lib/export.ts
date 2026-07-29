import 'server-only';

import { replaceSheetTab, isSheetsWriteConfigured } from '@/lib/content/sheets';
import { listRsvp } from '@/lib/db/rsvp';
import { listAllWishes } from '@/lib/db/wishes';
import { listEnvelopes } from '@/lib/db/envelope';
import { formatRupiah } from '@/lib/text';
import { PAX_OVER } from '@/lib/validation';
import { logger } from '@/lib/logger';

/**
 * Ekspor data transaksional kembali ke Google Sheet (US-16).
 *
 * Idempoten: setiap tab Export ditulis ulang seluruhnya, bukan ditambahkan,
 * sehingga menjalankan cron dua kali tidak pernah menghasilkan duplikat.
 */

const STATUS_LABELS: Record<string, string> = {
  hadir: 'Hadir',
  tidak_hadir: 'Tidak Hadir',
  ragu: 'Masih Ragu',
  pending: 'Menunggu',
  approved: 'Disetujui',
  rejected: 'Ditolak',
  verified: 'Terverifikasi',
  qris: 'QRIS',
  transfer: 'Transfer Bank',
  tunai: 'Tunai',
};

const label = (value: string): string => STATUS_LABELS[value] ?? value;

export function buildRsvpRows(): string[][] {
  const header = ['ID', 'Slug Tamu', 'Nama', 'Kehadiran', 'Jumlah Orang', 'Pesan', 'Dikirim', 'Diperbarui'];

  return [
    header,
    ...listRsvp().map((row) => [
      String(row.id),
      row.guest_slug ?? '',
      row.name,
      label(row.status),
      // Nilai penanda tidak boleh keluar sebagai "6": mempelai menghitung
      // konsumsi dari kolom ini, dan 6 berarti "enam atau lebih".
      row.status === 'hadir' ? (row.pax >= PAX_OVER ? '>5' : String(row.pax)) : '',
      row.message ?? '',
      row.created_at,
      row.updated_at,
    ]),
  ];
}

export function buildWishRows(): string[][] {
  const header = ['ID', 'Slug Tamu', 'Nama', 'Ucapan', 'Status', 'Dikirim'];

  return [
    header,
    ...listAllWishes().map((row) => [
      String(row.id),
      row.guest_slug ?? '',
      row.name,
      row.message,
      label(row.status),
      row.created_at,
    ]),
  ];
}

export function buildEnvelopeRows(): string[][] {
  const header = [
    'ID',
    'Slug Tamu',
    'Nama Pengirim',
    'Nominal',
    'Metode',
    'Catatan',
    'Ada Bukti',
    'Status',
    'Dikirim',
    'Diverifikasi',
  ];

  return [
    header,
    ...listEnvelopes().map((row) => [
      String(row.id),
      row.guest_slug ?? '',
      row.sender_name,
      row.amount === null ? '' : formatRupiah(row.amount),
      label(row.method),
      row.note ?? '',
      row.proof_file ? 'Ya' : 'Tidak',
      label(row.status),
      row.created_at,
      row.verified_at ?? '',
    ]),
  ];
}

export type ExportResult = {
  ok: boolean;
  written: Record<string, number>;
  skippedReason?: string;
};

export async function exportToSheet(): Promise<ExportResult> {
  if (!isSheetsWriteConfigured()) {
    const skippedReason =
      'Kredensial tulis Google Sheets belum dikonfigurasi (GOOGLE_WRITE_CREDENTIALS_*).';
    logger.warn('export.skipped', { reason: skippedReason });
    return { ok: false, written: {}, skippedReason };
  }

  const tabs: Array<[string, string[][]]> = [
    ['Export_RSVP', buildRsvpRows()],
    ['Export_Ucapan', buildWishRows()],
    ['Export_Amplop', buildEnvelopeRows()],
  ];

  const written: Record<string, number> = {};

  for (const [tabName, rows] of tabs) {
    await replaceSheetTab(tabName, rows);
    // Header tidak dihitung sebagai baris data.
    written[tabName] = Math.max(0, rows.length - 1);
  }

  logger.info('export.completed', { written });
  return { ok: true, written };
}

/** Serialisasi CSV dengan escaping RFC 4180 untuk tombol "Unduh CSV" (US-15). */
export function toCsv(rows: string[][]): string {
  const escapeCell = (cell: string): string =>
    /[",\r\n]/.test(cell) ? `"${cell.replace(/"/g, '""')}"` : cell;

  // BOM UTF-8 supaya Excel di Windows membaca karakter Indonesia dengan benar.
  return `﻿${rows.map((row) => row.map(escapeCell).join(',')).join('\r\n')}\r\n`;
}

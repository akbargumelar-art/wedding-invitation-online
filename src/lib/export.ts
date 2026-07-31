import 'server-only';

import { listRsvp } from '@/lib/db/rsvp';
import { listAllWishes } from '@/lib/db/wishes';
import { listEnvelopes } from '@/lib/db/envelope';
import { listGuests } from '@/lib/db/content';
import { formatRupiah } from '@/lib/text';
import { PAX_OVER } from '@/lib/validation';

/**
 * Ekspor data transaksional ke berkas CSV yang diunduh dari dashboard (US-15).
 *
 * Sejak seluruh pengelolaan pindah ke dashboard, ekspor otomatis ke Google
 * Sheet dihapus: CSV di sini yang menjadi jalur resmi memindahkan data ke
 * Excel atau spreadsheet apa pun bila mempelai membutuhkannya.
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

/** Daftar tamu beserta link undangannya — dasar penyebaran undangan. */
export function buildGuestRows(siteUrl: string): string[][] {
  const header = ['Nama', 'Slug', 'Kategori', 'Nomor WhatsApp', 'Link Undangan'];

  return [
    header,
    ...listGuests().map((row) => [
      row.nama,
      row.slug,
      row.kategori,
      // Diawali tanda plus supaya Excel tidak memperlakukannya sebagai angka
      // lalu membuang nol di depan atau mengubahnya jadi notasi ilmiah.
      row.telepon ? `+${row.telepon}` : '',
      `${siteUrl}/to/${row.slug}`,
    ]),
  ];
}

/** Serialisasi CSV dengan escaping RFC 4180 untuk tombol "Unduh CSV" (US-15). */
export function toCsv(rows: string[][]): string {
  const escapeCell = (cell: string): string =>
    /[",\r\n]/.test(cell) ? `"${cell.replace(/"/g, '""')}"` : cell;

  // BOM UTF-8 supaya Excel di Windows membaca karakter Indonesia dengan benar.
  return `﻿${rows.map((row) => row.map(escapeCell).join(',')).join('\r\n')}\r\n`;
}

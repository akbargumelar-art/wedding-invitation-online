import { formatRupiah, truncate } from '@/lib/text';
import { formatPax } from '@/lib/validation';
import type { NotificationPayload } from './types';

/**
 * Pesan WhatsApp berbahasa Indonesia untuk mempelai.
 *
 * Dibuat ringkas dan dapat dibaca sekilas dari layar kunci: baris pertama
 * menyatakan peristiwanya, sisanya detail. Tanpa markup apa pun selain penanda
 * tebal WhatsApp (*teks*).
 */

const STATUS_LABEL: Record<string, string> = {
  hadir: 'HADIR',
  tidak_hadir: 'TIDAK HADIR',
  ragu: 'MASIH RAGU',
};

const METHOD_LABEL: Record<string, string> = {
  qris: 'QRIS',
  transfer: 'Transfer Bank',
  tunai: 'Tunai',
};

/** Judul pendek — dipakai sebagai parameter pertama template WhatsApp. */
export function notificationTitle(payload: NotificationPayload): string {
  switch (payload.event) {
    case 'rsvp':
      return payload.isUpdate ? 'RSVP diperbarui' : 'RSVP baru';
    case 'wish':
      return 'Ucapan baru';
    case 'envelope':
      return 'Konfirmasi amplop baru';
    case 'visit':
      return 'Undangan dibuka';
  }
}

export function buildMessage(payload: NotificationPayload): string {
  const lines: string[] = [];

  switch (payload.event) {
    case 'rsvp': {
      lines.push(payload.isUpdate ? '🔄 *RSVP diperbarui*' : '✅ *RSVP baru*');
      lines.push(`Nama    : ${payload.name}`);
      lines.push(`Status  : ${STATUS_LABEL[payload.status] ?? payload.status}`);
      if (payload.status === 'hadir') lines.push(`Jumlah  : ${formatPax(payload.pax)}`);
      if (payload.message) lines.push(`Pesan   : ${truncate(payload.message, 200)}`);
      break;
    }

    case 'wish': {
      lines.push('💬 *Ucapan baru*');
      lines.push(`Nama : ${payload.name}`);
      lines.push(`Pesan: ${truncate(payload.message, 300)}`);
      if (payload.moderated) lines.push('');
      if (payload.moderated) lines.push('Menunggu persetujuan Anda di dashboard admin.');
      break;
    }

    case 'envelope': {
      lines.push('🎁 *Konfirmasi amplop baru*');
      lines.push(`Pengirim: ${payload.senderName}`);
      lines.push(`Nominal : ${payload.amount === null ? 'tidak disebutkan' : formatRupiah(payload.amount)}`);
      lines.push(`Metode  : ${METHOD_LABEL[payload.method] ?? payload.method}`);
      if (payload.note) lines.push(`Catatan : ${truncate(payload.note, 150)}`);
      lines.push(`Bukti   : ${payload.hasProof ? 'dilampirkan' : 'tidak ada'}`);
      lines.push('');
      // Pengingat eksplisit: sistem tidak pernah memverifikasi dana (R-6).
      lines.push('Belum diverifikasi. Cek mutasi rekening Anda sebelum menandai terverifikasi.');
      break;
    }

    case 'visit': {
      lines.push('👀 *Undangan dibuka*');
      lines.push(`Tamu: ${payload.name ?? 'tanpa nama (link umum)'}`);
      break;
    }
  }

  if ('slug' in payload && payload.slug) {
    lines.push('');
    lines.push(`Slug: ${payload.slug}`);
  }

  return lines.join('\n');
}

/**
 * Parameter untuk template WhatsApp Cloud API.
 *
 * Meta mewajibkan pesan yang dimulai oleh bisnis di luar jendela 24 jam memakai
 * template yang sudah disetujui. Template yang diharapkan punya dua variabel:
 * {{1}} judul peristiwa, {{2}} rincian.
 */
export function templateParameters(payload: NotificationPayload): string[] {
  const detail = buildMessage(payload)
    .split('\n')
    .filter((line) => !line.startsWith('*') && !/^[🔄✅💬🎁👀]/u.test(line))
    .join(' | ')
    .replace(/\s+/g, ' ')
    .trim();

  // Parameter template tidak boleh mengandung baris baru atau tab.
  return [notificationTitle(payload), truncate(detail, 900) || '-'];
}

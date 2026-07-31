import 'server-only';

import { getFreshContent } from '@/lib/content';
import { readIntegrationValue, writeIntegrationValue } from '@/lib/db/integrations';
import {
  markOutboxAttemptFailed,
  markOutboxSent,
  nextPending,
  type OutboxRow,
} from '@/lib/db/outbox';
import { env } from '@/lib/env';
import { logger } from '@/lib/logger';
import { sendText } from './client';
import { randomDelayMs } from './delay';
import { buildInvitationMessage } from './message';
import { isWahaReady, readWahaSettings, type WahaSettings } from './settings';

/**
 * Pengirim antrean undangan.
 *
 * Satu aturan yang memegang seluruh rancangan ini: **tidak pernah ada dua pesan
 * terkirim tanpa jeda acak di antaranya**. WhatsApp memblokir nomor yang
 * mengirim beruntun ke banyak tujuan, dan nomor yang diblokir di tengah
 * penyebaran undangan tidak dapat dipulihkan sebelum harinya tiba.
 *
 * Karena itu jadwalnya TIDAK disimpan di memori proses melainkan di database,
 * sebagai satu stempel waktu "boleh kirim lagi paling cepat pukul sekian".
 * Konsekuensinya, tiga keadaan yang gampang terlewat ikut tertangani:
 *
 *  - layanan direstart di tengah antrean — jeda tetap dihormati;
 *  - antrean menumpuk karena WAHA sempat mati — saat hidup lagi pesan TIDAK
 *    diberondong sekaligus, melainkan tetap satu per satu;
 *  - admin menekan "kirim satuan" di tengah pengiriman massal — pengiriman
 *    berikutnya tetap mundur sesuai jeda.
 */

const NEXT_SEND_KEY = 'waha_next_send_at';

/** Berhenti mencoba sebuah nomor setelah gagal sekian kali. */
const MAX_ATTEMPTS = 3;

function readNextSendAt(): number {
  const raw = readIntegrationValue(NEXT_SEND_KEY);
  const value = Number.parseInt(raw, 10);
  return Number.isFinite(value) ? value : 0;
}

function scheduleNextSend(settings: WahaSettings): void {
  const delay = randomDelayMs(settings.minDelaySeconds, settings.maxDelaySeconds);
  writeIntegrationValue(NEXT_SEND_KEY, String(Date.now() + delay));
}

/** Berapa detik lagi pesan berikutnya boleh dikirim; 0 bila sudah boleh. */
export function secondsUntilNextSend(): number {
  const remaining = readNextSendAt() - Date.now();
  return remaining > 0 ? Math.ceil(remaining / 1000) : 0;
}

async function composeFor(row: OutboxRow, settings: WahaSettings): Promise<string> {
  const content = await getFreshContent();

  return buildInvitationMessage(
    settings.invitationTemplate,
    content,
    { nama: row.guest_nama, slug: row.guest_slug },
    env.siteUrl,
  );
}

export type SendOutcome =
  | { ok: true; guest: string }
  | { ok: false; guest: string; error: string };

/**
 * Kirim satu undangan secara langsung, di luar antrean.
 *
 * Dipakai tombol "Kirim" per tamu. Pengiriman tunggal atas perintah manusia
 * bukan pola yang memicu pemblokiran, jadi ia tidak menunggu giliran — tetapi
 * ia tetap MENGGESER jadwal pengiriman berikutnya, supaya menekan tombol itu
 * berkali-kali tidak berubah menjadi pengiriman beruntun lewat pintu belakang.
 */
export async function sendInvitationNow(guest: {
  nama: string;
  slug: string;
  telepon: string;
}): Promise<SendOutcome> {
  const settings = readWahaSettings();

  if (!isWahaReady(settings)) {
    return { ok: false, guest: guest.nama, error: 'Integrasi WhatsApp belum aktif.' };
  }

  if (!guest.telepon) {
    return { ok: false, guest: guest.nama, error: 'Tamu ini belum punya nomor WhatsApp.' };
  }

  const content = await getFreshContent();
  const message = buildInvitationMessage(
    settings.invitationTemplate,
    content,
    guest,
    env.siteUrl,
  );

  const result = await sendText(settings, guest.telepon, message);
  scheduleNextSend(settings);

  if (!result.ok) {
    logger.warn('waha.send_failed', { slug: guest.slug, error: result.error });
    return { ok: false, guest: guest.nama, error: result.error };
  }

  logger.info('waha.sent', { slug: guest.slug });
  return { ok: true, guest: guest.nama };
}

export type TickResult =
  | { status: 'idle' }
  | { status: 'waiting'; seconds: number }
  | { status: 'sent'; guest: string }
  | { status: 'failed'; guest: string; error: string };

/**
 * Proses satu langkah antrean. Aman dipanggil sesering apa pun: bila belum
 * waktunya, ia tidak melakukan apa-apa.
 */
export async function tickOutbox(): Promise<TickResult> {
  const settings = readWahaSettings();
  if (!isWahaReady(settings)) return { status: 'idle' };

  const row = nextPending();
  if (!row) return { status: 'idle' };

  const waiting = secondsUntilNextSend();
  if (waiting > 0) return { status: 'waiting', seconds: waiting };

  // Jadwal digeser SEBELUM pengiriman, bukan sesudah. Pengiriman bisa memakan
  // belasan detik atau gagal dengan lemparan; menggesernya di akhir membuka
  // celah untuk tick berikutnya masuk dan mengirim tanpa jeda.
  scheduleNextSend(settings);

  const message = await composeFor(row, settings);
  const result = await sendText(settings, row.chat_id, message);

  if (result.ok) {
    markOutboxSent(row.id);
    logger.info('waha.queue_sent', { id: row.id, slug: row.guest_slug });
    return { status: 'sent', guest: row.guest_nama };
  }

  const attempts = row.attempts + 1;
  const giveUp = !result.retryable || attempts >= MAX_ATTEMPTS;
  markOutboxAttemptFailed(row.id, result.error, giveUp);

  logger[giveUp ? 'error' : 'warn'](giveUp ? 'waha.queue_gave_up' : 'waha.queue_retry', {
    id: row.id,
    slug: row.guest_slug,
    attempts,
    error: result.error,
  });

  return { status: 'failed', guest: row.guest_nama, error: result.error };
}

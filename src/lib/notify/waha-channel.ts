import 'server-only';

import { sendText } from '@/lib/waha/client';
import { canNotifyViaWaha, readWahaSettings } from '@/lib/waha/settings';
import { buildMessage } from './templates';
import type { DeliveryResult, NotificationPayload } from './types';

/**
 * Pemberitahuan ke mempelai lewat sambungan WAHA yang diatur di dashboard.
 *
 * Dipisahkan dari `drivers.ts` dengan sengaja. Driver berbasis environment harus
 * tetap dapat diuji tanpa database — begitu berkas itu mengimpor lapisan
 * penyimpanan, seluruh berkas uji yang memeriksa bentuk permintaan tiap driver
 * ikut menyeret `server-only` dan berhenti dapat dijalankan.
 *
 * Sebelum ini, jalur pemberitahuan HANYA dapat diatur lewat berkas env di
 * server, terpisah dari tab WhatsApp di dashboard. Akibatnya mempelai yang sudah
 * mengatur WhatsApp di dashboard tetap tidak menerima satu pun pemberitahuan
 * RSVP — dan tidak ada galat apa pun yang muncul untuk menjelaskannya.
 */

/** True bila pemberitahuan dapat dikirim lewat sambungan dashboard. */
export function isWahaNotifyReady(): boolean {
  return canNotifyViaWaha(readWahaSettings());
}

/** Peristiwa yang dipilih mempelai di dashboard. */
export function wahaNotifyEvents(): string[] {
  return readWahaSettings().notifyEvents;
}

/**
 * Kirim ke seluruh nomor penerima.
 *
 * Berurutan, bukan paralel: gateway WhatsApp membatasi laju kirim, dan daftar
 * penerimanya memang pendek — biasanya satu atau dua nomor.
 */
export async function deliverViaWaha(payload: NotificationPayload): Promise<DeliveryResult> {
  const settings = readWahaSettings();
  const message = buildMessage(payload);

  const failures: string[] = [];
  let retryable = false;

  for (const recipient of settings.notifyRecipients) {
    const result = await sendText(settings, recipient, message);
    if (result.ok) continue;

    failures.push(`${recipient}: ${result.error}`);
    if (result.retryable) retryable = true;
  }

  if (failures.length === 0) return { ok: true };
  return { ok: false, error: failures.join(' ; '), retryable };
}

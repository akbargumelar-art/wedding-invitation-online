import { after } from 'next/server';
import { env } from '@/lib/env';
import { logger } from '@/lib/logger';
import {
  claimPendingNotifications,
  enqueueNotification,
  findNotification,
  markFailed,
  markSent,
  pruneNotifications,
  type NotificationRow,
} from '@/lib/db/notifications';
import { activeChannel, deliver, isNotifyConfigured } from './drivers';
import { retryDelaySeconds } from './backoff';
import type { NotificationPayload } from './types';

export type { NotificationPayload } from './types';
export { isNotifyConfigured, activeChannel } from './drivers';
export { buildMessage, notificationTitle, templateParameters } from './templates';
export { retryDelaySeconds } from './backoff';

function isEventEnabled(event: NotificationPayload['event']): boolean {
  return env.notify.events.includes(event);
}

/**
 * Catat peristiwa lalu kirim SETELAH respons tamu terkirim.
 *
 * `after()` menjalankan callback di luar siklus respons, jadi gateway WhatsApp
 * yang lambat atau mati tidak pernah membuat tamu menunggu — dan karena barisnya
 * sudah tersimpan lebih dulu, kegagalan kirim tetap bisa diulang oleh cron.
 *
 * Fungsi ini tidak pernah melempar: notifikasi adalah kenyamanan bagi mempelai,
 * bukan bagian dari kontrak dengan tamu.
 */
export function notify(payload: NotificationPayload): void {
  try {
    if (activeChannel() === 'off' || !isEventEnabled(payload.event)) return;

    if (!isNotifyConfigured()) {
      logger.warn('notify.not_configured', { channel: activeChannel(), event: payload.event });
      return;
    }

    const id = enqueueNotification(payload.event, payload);

    after(async () => {
      await dispatchOne(id);
    });
  } catch (error) {
    logger.error('notify.enqueue_failed', { error, event: payload.event });
  }
}

async function dispatchOne(id: number): Promise<void> {
  const row = findNotification(id);
  if (!row || row.status !== 'pending') return;
  await attemptDelivery(row);
}

async function attemptDelivery(row: NotificationRow): Promise<boolean> {
  let payload: NotificationPayload;
  try {
    payload = JSON.parse(row.payload) as NotificationPayload;
  } catch {
    // Payload rusak tidak akan pernah membaik.
    markFailed(row.id, 'Payload tidak dapat dibaca.', null);
    return false;
  }

  try {
    const result = await deliver(payload);

    if (result.ok) {
      markSent(row.id);
      logger.info('notify.sent', { id: row.id, event: row.event, attempts: row.attempts + 1 });
      return true;
    }

    const attempts = row.attempts + 1;
    const giveUp = !result.retryable || attempts >= env.notify.maxAttempts;

    // `attempts` sudah menghitung kegagalan barusan; backoff dihitung dari
    // jumlah kegagalan SEBELUMNYA agar jeda pertama 30 detik, bukan 2 menit.
    markFailed(row.id, result.error, giveUp ? null : retryDelaySeconds(attempts - 1));
    logger[giveUp ? 'error' : 'warn'](giveUp ? 'notify.gave_up' : 'notify.retry_scheduled', {
      id: row.id,
      event: row.event,
      attempts,
      error: result.error,
    });

    return false;
  } catch (error) {
    // Timeout atau jaringan putus — selalu layak dicoba ulang.
    const attempts = row.attempts + 1;
    const giveUp = attempts >= env.notify.maxAttempts;
    const message = error instanceof Error ? error.message : String(error);

    markFailed(row.id, message, giveUp ? null : retryDelaySeconds(attempts - 1));
    logger.warn('notify.delivery_error', { id: row.id, attempts, error: message });
    return false;
  }
}

export type DrainResult = { processed: number; sent: number; pruned: number };

/**
 * Kirim ulang antrean yang tertunda. Dipanggil cron; aman dijalankan berkali-kali.
 */
export async function drainNotificationQueue(limit = 25): Promise<DrainResult> {
  if (activeChannel() === 'off') return { processed: 0, sent: 0, pruned: 0 };

  const rows = claimPendingNotifications(limit, env.notify.maxAttempts);
  let sent = 0;

  // Berurutan, bukan paralel: gateway WhatsApp umumnya membatasi laju kirim,
  // dan antreannya memang kecil.
  for (const row of rows) {
    if (await attemptDelivery(row)) sent += 1;
  }

  return { processed: rows.length, sent, pruned: pruneNotifications() };
}

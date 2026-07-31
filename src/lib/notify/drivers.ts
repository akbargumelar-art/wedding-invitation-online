import { createHmac } from 'node:crypto';
import { env } from '@/lib/env';
import { buildMessage, notificationTitle, templateParameters } from './templates';
import { toChatId } from './chat-id';
import type { DeliveryResult, NotificationPayload } from './types';

/**
 * Driver pengiriman notifikasi.
 *
 * Tiga saluran didukung, dipilih lewat `NOTIFY_CHANNEL`:
 *
 *  - `webhook`           POST JSON ke URL mana pun (n8n, Make, bot sendiri).
 *                        Bertanda tangan HMAC bila NOTIFY_WEBHOOK_SECRET diisi.
 *  - `whatsapp_cloud`    WhatsApp Cloud API resmi milik Meta.
 *  - `fonnte`            Gateway WhatsApp lokal (populer di Indonesia).
 *  - `whatsapp_gateway`  Gateway berbasis chatId (WAHA, whatsapp-web.js) —
 *                        satu-satunya yang bisa mengirim ke grup WhatsApp.
 *
 * Di ATAS semuanya ada satu saluran yang tidak diatur lewat environment sama
 * sekali: `waha`, memakai sambungan yang sudah dikonfigurasi di tab WhatsApp
 * dashboard. Ia dipilih lebih dulu bila nomor penerimanya sudah diisi di sana.
 *
 * Pemisahan itu dulu menjadi jebakan: mempelai mengatur WhatsApp di dashboard,
 * mengira seluruh WhatsApp sudah diurus, padahal notifikasi RSVP membaca berkas
 * env yang bawaannya `off` — tidak ada satu pun pesan terkirim, dan tidak ada
 * galat apa pun yang muncul.
 *
 * Semua driver mengembalikan `retryable` supaya pemanggil tahu mana galat
 * sementara (jaringan, 5xx, 429) dan mana yang tidak akan membaik dengan
 * mengulang (token salah, nomor tidak valid) — mengulang yang terakhir hanya
 * membuang kuota API.
 */

export type Channel =
  | 'off'
  | 'waha'
  | 'webhook'
  | 'whatsapp_cloud'
  | 'fonnte'
  | 'whatsapp_gateway';

const CHANNELS: readonly Channel[] = ['webhook', 'whatsapp_cloud', 'fonnte', 'whatsapp_gateway'];

/**
 * Saluran yang dipilih lewat environment.
 *
 * Modul ini sengaja TIDAK tahu apa-apa tentang pengaturan dashboard: begitu ia
 * mengimpor lapisan database, seluruh berkas uji yang memeriksa bentuk
 * permintaan tiap driver ikut menyeret `server-only` dan berhenti dapat
 * dijalankan. Penggabungan dengan saluran dashboard dilakukan satu tingkat di
 * atas, di `notify/index.ts`.
 */
export function activeChannel(): Channel {
  const channel = env.notify.channel as Channel;
  return CHANNELS.includes(channel) ? channel : 'off';
}

/** Apakah saluran aktif punya konfigurasi lengkap. */
export function isNotifyConfigured(): boolean {
  switch (activeChannel()) {
    case 'webhook':
      return Boolean(env.notify.webhookUrl);
    case 'whatsapp_cloud':
      return Boolean(
        env.notify.whatsappPhoneNumberId &&
          env.notify.whatsappToken &&
          env.notify.recipients.length > 0,
      );
    case 'fonnte':
      return Boolean(env.notify.fonnteToken && env.notify.recipients.length > 0);
    case 'whatsapp_gateway':
      return Boolean(env.notify.gatewayUrl && env.notify.recipients.length > 0);
    default:
      return false;
  }
}

async function postJson(
  url: string,
  body: unknown,
  headers: Record<string, string>,
): Promise<{ status: number; text: string }> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), env.notify.timeoutMs);

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...headers },
      body: JSON.stringify(body),
      signal: controller.signal,
      // Notifikasi tidak boleh ikut ter-cache oleh lapisan fetch Next.
      cache: 'no-store',
    });

    return { status: response.status, text: (await response.text()).slice(0, 500) };
  } finally {
    clearTimeout(timer);
  }
}

/** 4xx (selain 408/429) dianggap galat permanen. */
function isRetryableStatus(status: number): boolean {
  if (status === 408 || status === 429) return true;
  return status >= 500;
}

// -----------------------------------------------------------------------------

async function sendWebhook(payload: NotificationPayload): Promise<DeliveryResult> {
  const body = {
    event: payload.event,
    title: notificationTitle(payload),
    message: buildMessage(payload),
    at: new Date().toISOString(),
    data: payload,
  };

  const raw = JSON.stringify(body);
  const headers: Record<string, string> = {};

  // Tanda tangan HMAC agar penerima dapat memastikan permintaan benar-benar
  // berasal dari aplikasi ini, bukan siapa pun yang menebak URL-nya.
  if (env.notify.webhookSecret) {
    headers['x-walimah-signature'] = `sha256=${createHmac('sha256', env.notify.webhookSecret)
      .update(raw)
      .digest('hex')}`;
  }

  const { status, text } = await postJson(env.notify.webhookUrl, body, headers);
  if (status >= 200 && status < 300) return { ok: true };

  return { ok: false, error: `webhook HTTP ${status}: ${text}`, retryable: isRetryableStatus(status) };
}

async function sendWhatsAppCloud(payload: NotificationPayload): Promise<DeliveryResult> {
  const url = `https://graph.facebook.com/${env.notify.whatsappApiVersion}/${env.notify.whatsappPhoneNumberId}/messages`;
  const headers = { authorization: `Bearer ${env.notify.whatsappToken}` };

  const useTemplate = Boolean(env.notify.whatsappTemplate);
  const parameters = templateParameters(payload);

  const failures: string[] = [];
  let retryable = false;

  for (const recipient of env.notify.recipients) {
    const body = useTemplate
      ? {
          messaging_product: 'whatsapp',
          to: recipient,
          type: 'template',
          template: {
            name: env.notify.whatsappTemplate,
            language: { code: env.notify.whatsappTemplateLang },
            components: [
              {
                type: 'body',
                parameters: parameters.map((text) => ({ type: 'text', text })),
              },
            ],
          },
        }
      : {
          messaging_product: 'whatsapp',
          to: recipient,
          type: 'text',
          text: { preview_url: false, body: buildMessage(payload) },
        };

    const { status, text } = await postJson(url, body, headers);
    if (status >= 200 && status < 300) continue;

    failures.push(`${recipient}: HTTP ${status} ${text}`);
    if (isRetryableStatus(status)) retryable = true;
  }

  if (failures.length === 0) return { ok: true };
  return { ok: false, error: failures.join(' ; '), retryable };
}

async function sendFonnte(payload: NotificationPayload): Promise<DeliveryResult> {
  const { status, text } = await postJson(
    'https://api.fonnte.com/send',
    {
      // Fonnte menerima banyak tujuan sekaligus, dipisah koma.
      target: env.notify.recipients.join(','),
      message: buildMessage(payload),
      countryCode: '62',
    },
    { authorization: env.notify.fonnteToken },
  );

  if (status < 200 || status >= 300) {
    return { ok: false, error: `fonnte HTTP ${status}: ${text}`, retryable: isRetryableStatus(status) };
  }

  // Fonnte membalas 200 meski gagal; statusnya ada di dalam body.
  try {
    const parsed = JSON.parse(text) as { status?: boolean; reason?: string };
    if (parsed.status === false) {
      return { ok: false, error: `fonnte menolak: ${parsed.reason ?? text}`, retryable: false };
    }
  } catch {
    // Body bukan JSON — anggap berhasil karena HTTP-nya 2xx.
  }

  return { ok: true };
}

/**
 * Gateway WhatsApp berbasis chatId (WAHA dan sejenisnya).
 *
 * Bentuk badan permintaannya `{ session, chatId, text }` — sesuai endpoint
 * `POST /api/sendText` milik WAHA. Nama field isi pesan dapat diganti lewat
 * `WHATSAPP_GATEWAY_TEXT_FIELD` karena sebagian fork memakai `message`.
 *
 * Tujuan boleh berupa nomor biasa maupun JID grup (`…@g.us`); lihat `toChatId`.
 */
async function sendWhatsAppGateway(payload: NotificationPayload): Promise<DeliveryResult> {
  const headers: Record<string, string> = {};
  if (env.notify.gatewayApiKey) {
    headers[env.notify.gatewayApiKeyHeader] = env.notify.gatewayApiKey;
  }

  const message = buildMessage(payload);
  const failures: string[] = [];
  let retryable = false;

  for (const recipient of env.notify.recipients) {
    const chatId = toChatId(recipient);
    if (!chatId) {
      failures.push(`tujuan "${recipient}" tidak valid`);
      continue;
    }

    const body: Record<string, unknown> = {
      session: env.notify.gatewaySession,
      chatId,
      [env.notify.gatewayTextField]: message,
    };

    const { status, text } = await postJson(env.notify.gatewayUrl, body, headers);
    if (status >= 200 && status < 300) continue;

    failures.push(`${chatId}: HTTP ${status} ${text}`);
    if (isRetryableStatus(status)) retryable = true;
  }

  if (failures.length === 0) return { ok: true };
  return { ok: false, error: failures.join(' ; '), retryable };
}

export async function deliver(payload: NotificationPayload): Promise<DeliveryResult> {
  switch (activeChannel()) {
    case 'webhook':
      return sendWebhook(payload);
    case 'whatsapp_cloud':
      return sendWhatsAppCloud(payload);
    case 'fonnte':
      return sendFonnte(payload);
    case 'whatsapp_gateway':
      return sendWhatsAppGateway(payload);
    default:
      return { ok: false, error: 'Saluran notifikasi tidak aktif.', retryable: false };
  }
}

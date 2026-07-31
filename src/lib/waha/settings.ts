import 'server-only';

import { readIntegrationMap, writeIntegrationMap } from '@/lib/db/integrations';
import { DEFAULT_INVITATION_TEMPLATE } from './message';

/**
 * Pengaturan integrasi WAHA (WhatsApp HTTP API, engine NOWEB).
 *
 * Seluruhnya diatur dari dashboard dan tersimpan di database, sejalan dengan
 * keputusan bahwa tidak ada lagi konfigurasi yang menuntut menyunting berkas di
 * server. Tidak ada satu pun nilai di sini yang dibaca dari environment.
 */

export type WahaSettings = {
  enabled: boolean;
  /** Base URL instans WAHA, mis. http://127.0.0.1:3000 — tanpa /api. */
  baseUrl: string;
  session: string;
  apiKey: string;
  /** Rahasia HMAC yang dipakai memverifikasi webhook masuk dari WAHA. */
  webhookSecret: string;

  /** Templat pesan undangan; mendukung placeholder {nama}, {link}, dan lainnya. */
  invitationTemplate: string;

  /** Balas otomatis pesan tamu yang tidak dikenali dengan petunjuk singkat. */
  autoReply: boolean;
  /** Terima RSVP, ucapan, dan konfirmasi transfer lewat balasan WhatsApp. */
  acceptReplies: boolean;

  /** Rentang jeda acak antar-pengiriman massal, dalam detik. */
  minDelaySeconds: number;
  maxDelaySeconds: number;
};

export { INVITATION_PLACEHOLDERS } from './message';

/**
 * Jeda bawaan 20–60 detik.
 *
 * Angkanya bukan tebakan longgar: pengiriman beruntun tanpa jeda adalah pola
 * yang paling cepat memicu pemblokiran nomor oleh WhatsApp, dan nomor yang
 * diblokir di tengah penyebaran undangan tidak dapat dipulihkan tepat waktu.
 * Batas bawah tetap ditegakkan saat menyimpan.
 */
export const MIN_ALLOWED_DELAY = 5;
export const DEFAULT_MIN_DELAY = 20;
export const DEFAULT_MAX_DELAY = 60;

export const DEFAULTS: WahaSettings = {
  enabled: false,
  baseUrl: '',
  session: 'default',
  apiKey: '',
  webhookSecret: '',
  invitationTemplate: DEFAULT_INVITATION_TEMPLATE,
  autoReply: true,
  acceptReplies: true,
  minDelaySeconds: DEFAULT_MIN_DELAY,
  maxDelaySeconds: DEFAULT_MAX_DELAY,
};

const KEYS = {
  enabled: 'waha_enabled',
  baseUrl: 'waha_base_url',
  session: 'waha_session',
  apiKey: 'waha_api_key',
  webhookSecret: 'waha_webhook_secret',
  invitationTemplate: 'waha_invitation_template',
  autoReply: 'waha_auto_reply',
  acceptReplies: 'waha_accept_replies',
  minDelaySeconds: 'waha_min_delay',
  maxDelaySeconds: 'waha_max_delay',
} as const;

function toBool(raw: string | undefined, fallback: boolean): boolean {
  if (raw === undefined || raw === '') return fallback;
  return raw === 'TRUE' || raw === 'true' || raw === '1';
}

function toInt(raw: string | undefined, fallback: number): number {
  const value = Number.parseInt(raw ?? '', 10);
  return Number.isFinite(value) ? value : fallback;
}

export function readWahaSettings(): WahaSettings {
  const map = readIntegrationMap();
  const text = (key: string, fallback: string): string => map[key] ?? fallback;

  const min = Math.max(MIN_ALLOWED_DELAY, toInt(map[KEYS.minDelaySeconds], DEFAULT_MIN_DELAY));

  return {
    enabled: toBool(map[KEYS.enabled], DEFAULTS.enabled),
    // Garis miring di akhir membuat URL tersusun menjadi `…//api/sendText`,
    // yang ditolak sebagian proxy di depan WAHA.
    baseUrl: text(KEYS.baseUrl, DEFAULTS.baseUrl).replace(/\/+$/, ''),
    session: text(KEYS.session, DEFAULTS.session) || DEFAULTS.session,
    apiKey: text(KEYS.apiKey, DEFAULTS.apiKey),
    webhookSecret: text(KEYS.webhookSecret, DEFAULTS.webhookSecret),
    invitationTemplate: text(KEYS.invitationTemplate, DEFAULTS.invitationTemplate),
    autoReply: toBool(map[KEYS.autoReply], DEFAULTS.autoReply),
    acceptReplies: toBool(map[KEYS.acceptReplies], DEFAULTS.acceptReplies),
    minDelaySeconds: min,
    // Maksimum tidak pernah boleh di bawah minimum: kalau tertukar, jeda acak
    // akan menghasilkan rentang kosong dan pengiriman berubah jadi beruntun.
    maxDelaySeconds: Math.max(min, toInt(map[KEYS.maxDelaySeconds], DEFAULT_MAX_DELAY)),
  };
}

export function writeWahaSettings(settings: WahaSettings): void {
  writeIntegrationMap({
    [KEYS.enabled]: settings.enabled ? 'TRUE' : 'FALSE',
    [KEYS.baseUrl]: settings.baseUrl.replace(/\/+$/, ''),
    [KEYS.session]: settings.session,
    [KEYS.apiKey]: settings.apiKey,
    [KEYS.webhookSecret]: settings.webhookSecret,
    [KEYS.invitationTemplate]: settings.invitationTemplate,
    [KEYS.autoReply]: settings.autoReply ? 'TRUE' : 'FALSE',
    [KEYS.acceptReplies]: settings.acceptReplies ? 'TRUE' : 'FALSE',
    [KEYS.minDelaySeconds]: String(settings.minDelaySeconds),
    [KEYS.maxDelaySeconds]: String(settings.maxDelaySeconds),
  });
}

/** True bila pengiriman benar-benar dapat dilakukan. */
export function isWahaReady(settings: WahaSettings): boolean {
  return settings.enabled && settings.baseUrl !== '' && settings.session !== '';
}

/**
 * Bentuk aman untuk dikirim ke browser: kunci API dan rahasia HMAC diganti
 * penanda "sudah terisi", bukan nilainya.
 *
 * Dashboard hanya perlu tahu apakah sebuah rahasia sudah diatur; mengirim
 * nilainya berarti rahasia itu ada di dalam HTML setiap kali halaman dibuka.
 */
export type WahaSettingsView = Omit<WahaSettings, 'apiKey' | 'webhookSecret'> & {
  hasApiKey: boolean;
  hasWebhookSecret: boolean;
};

export function toSettingsView(settings: WahaSettings): WahaSettingsView {
  const { apiKey, webhookSecret, ...rest } = settings;

  return {
    ...rest,
    hasApiKey: apiKey !== '',
    hasWebhookSecret: webhookSecret !== '',
  };
}

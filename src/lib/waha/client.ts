import 'server-only';

import { toChatId } from '@/lib/notify/chat-id';
import type { DeliveryResult } from '@/lib/notify/types';
import type { WahaSettings } from './settings';

/**
 * Klien HTTP untuk WAHA (WhatsApp HTTP API).
 *
 * Kontraknya kecil dan itu disengaja — hanya dua hal yang benar-benar
 * dibutuhkan: mengirim teks, dan memeriksa apakah sesinya masih tersambung.
 *
 *   POST {baseUrl}/api/sendText   { session, chatId, text }
 *   GET  {baseUrl}/api/sessions/{session}
 *
 * Autentikasi memakai header `X-Api-Key`.
 */

const TIMEOUT_MS = 15_000;

/** 4xx selain 408/429 tidak akan membaik dengan diulang. */
function isRetryableStatus(status: number): boolean {
  if (status === 408 || status === 429) return true;
  return status < 400 || status >= 500;
}

function headersFor(settings: WahaSettings): Record<string, string> {
  const headers: Record<string, string> = { 'content-type': 'application/json' };
  if (settings.apiKey) headers['X-Api-Key'] = settings.apiKey;
  return headers;
}

async function request(
  settings: WahaSettings,
  path: string,
  init: { method: 'GET' | 'POST'; body?: unknown },
): Promise<{ status: number; text: string }> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const response = await fetch(`${settings.baseUrl}${path}`, {
      method: init.method,
      headers: headersFor(settings),
      body: init.body === undefined ? undefined : JSON.stringify(init.body),
      signal: controller.signal,
      cache: 'no-store',
    });

    return { status: response.status, text: (await response.text()).slice(0, 500) };
  } finally {
    clearTimeout(timer);
  }
}

/** Kirim satu pesan teks. Tidak pernah melempar; galat dikembalikan sebagai nilai. */
export async function sendText(
  settings: WahaSettings,
  recipient: string,
  text: string,
): Promise<DeliveryResult> {
  const chatId = toChatId(recipient);
  if (!chatId) {
    return { ok: false, error: 'Nomor tujuan tidak valid.', retryable: false };
  }

  if (!settings.baseUrl) {
    return { ok: false, error: 'Alamat server WAHA belum diisi.', retryable: false };
  }

  try {
    const { status, text: body } = await request(settings, '/api/sendText', {
      method: 'POST',
      body: { session: settings.session, chatId, text },
    });

    if (status >= 200 && status < 300) return { ok: true };

    return {
      ok: false,
      error: `HTTP ${status} ${body}`.trim(),
      retryable: isRetryableStatus(status),
    };
  } catch (error) {
    // Timeout atau jaringan putus — selalu layak dicoba ulang.
    return {
      ok: false,
      error: error instanceof Error ? error.message : String(error),
      retryable: true,
    };
  }
}

export type SessionStatus =
  | { ok: true; status: string; me: string | null }
  | { ok: false; error: string };

/**
 * Periksa status sesi WhatsApp.
 *
 * Dipakai tombol "Tes koneksi" di dashboard. Status yang sehat adalah
 * `WORKING`; `SCAN_QR_CODE` berarti WAHA hidup tetapi belum ditautkan ke
 * ponsel, dan itu perlu dibedakan dengan jelas — keduanya "berhasil terhubung"
 * dari sudut pandang HTTP, tetapi hanya satu yang bisa mengirim pesan.
 */
export async function checkSession(settings: WahaSettings): Promise<SessionStatus> {
  if (!settings.baseUrl) return { ok: false, error: 'Alamat server WAHA belum diisi.' };

  try {
    const { status, text } = await request(
      settings,
      `/api/sessions/${encodeURIComponent(settings.session)}`,
      { method: 'GET' },
    );

    if (status === 404) {
      return { ok: false, error: `Sesi "${settings.session}" tidak ditemukan di server WAHA.` };
    }

    if (status === 401 || status === 403) {
      return { ok: false, error: 'Kunci API ditolak server WAHA.' };
    }

    if (status < 200 || status >= 300) {
      return { ok: false, error: `HTTP ${status} ${text}`.trim() };
    }

    const parsed: unknown = JSON.parse(text);
    const data = (typeof parsed === 'object' && parsed !== null ? parsed : {}) as Record<
      string,
      unknown
    >;

    const me = data['me'] as Record<string, unknown> | null | undefined;

    return {
      ok: true,
      status: String(data['status'] ?? 'UNKNOWN'),
      me: me && typeof me['id'] === 'string' ? me['id'] : null,
    };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) };
  }
}

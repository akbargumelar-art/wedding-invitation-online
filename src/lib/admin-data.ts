import 'server-only';

import { listRsvp, summarizeRsvp, type RsvpRow, type RsvpSummary } from '@/lib/db/rsvp';
import { listAllWishes, summarizeWishes, type WishRow, type WishSummary } from '@/lib/db/wishes';
import {
  listEnvelopes,
  summarizeEnvelopes,
  type EnvelopeRow,
  type EnvelopeSummary,
} from '@/lib/db/envelope';
import { summarizeVisits, type VisitSummary } from '@/lib/db/misc';
import { summarizeNotifications, type NotificationSummary } from '@/lib/db/notifications';
import {
  listAccounts,
  listGallery,
  listGuests,
  listMedia,
  listSchedule,
  type AccountRow,
  type GalleryRow,
  type GuestRow,
  type MediaRow,
  type ScheduleRow,
} from '@/lib/db/content';
export type { GuestRow };
import {
  latestSendStateByGuest,
  summarizeOutbox,
  type GuestSendState,
  type OutboxSummary,
} from '@/lib/db/outbox';
import { activeChannel } from '@/lib/notify';
import { getFreshContent } from '@/lib/content';
import { env } from '@/lib/env';
import { readWahaSettings, toSettingsView, type WahaSettingsView } from '@/lib/waha/settings';
import { secondsUntilNextSend } from '@/lib/waha/sender';
import { ensureOutboxWorker } from '@/lib/waha/worker';
import type { SiteConfig } from '@/lib/content/types';

export type AdminSummary = {
  /** Total tamu terdaftar — dasar "undangan terkirim". */
  totalInvited: number;
  visits: VisitSummary;
  rsvp: RsvpSummary;
  wishes: WishSummary;
  envelopes: EnvelopeSummary;
  notifications: NotificationSummary;
  notifyChannel: string;
  contentSource: string;
  contentWarnings: string[];
};

/** Isi undangan yang dapat disunting, apa adanya seperti tersimpan di database. */
export type AdminContent = {
  config: SiteConfig;
  schedule: ScheduleRow[];
  gallery: GalleryRow[];
  accounts: AccountRow[];
  guests: GuestRow[];
  media: MediaRow[];
  /** Dipakai menyusun link undangan yang disalin admin. */
  siteUrl: string;
};

/** Keadaan integrasi WhatsApp yang dibutuhkan dashboard. */
export type AdminWhatsapp = {
  settings: WahaSettingsView;
  /** Alamat yang harus dipasang admin di konfigurasi webhook WAHA. */
  webhookUrl: string;
  outbox: OutboxSummary;
  /** Status pengiriman terakhir per tamu, berkunci id tamu. */
  sendState: Record<string, GuestSendState>;
  nextSendInSeconds: number;
  /** Jumlah tamu yang sudah punya nomor — dasar tombol kirim massal. */
  guestsWithPhone: number;
};

export type AdminData = {
  summary: AdminSummary;
  content: AdminContent;
  whatsapp: AdminWhatsapp;
  rsvpRows: RsvpRow[];
  wishRows: WishRow[];
  envelopeRows: EnvelopeRow[];
};

/** Semua angka dashboard dihitung dalam satu tempat agar konsisten (US-15). */
export async function loadAdminSummary(): Promise<AdminSummary> {
  // Sengaja melewati cache: admin harus melihat hasil suntingannya sendiri,
  // bukan versi yang masih dilayani ke tamu selama beberapa detik ke depan.
  const content = await getFreshContent();

  return {
    totalInvited: content.guests.length,
    visits: summarizeVisits(),
    rsvp: summarizeRsvp(),
    wishes: summarizeWishes(),
    envelopes: summarizeEnvelopes(),
    notifications: summarizeNotifications(),
    notifyChannel: activeChannel(),
    contentSource: content.source,
    contentWarnings: content.warnings,
  };
}

export async function loadAdminContent(): Promise<AdminContent> {
  const content = await getFreshContent();

  return {
    config: content.config,
    schedule: listSchedule(),
    gallery: listGallery(),
    accounts: listAccounts(),
    guests: listGuests(),
    media: listMedia(),
    siteUrl: env.siteUrl,
  };
}

export function loadAdminWhatsapp(guests: GuestRow[]): AdminWhatsapp {
  const outbox = summarizeOutbox();

  // Membuka dashboard melanjutkan antrean yang tertinggal setelah layanan
  // direstart. Cron di `/api/cron/invitations` menutup kasus ketika tidak ada
  // seorang pun yang membukanya.
  if (outbox.pending > 0) ensureOutboxWorker();

  const sendState: Record<string, GuestSendState> = {};
  for (const [guestId, state] of latestSendStateByGuest()) {
    // Map tidak dapat diserialkan ke komponen klien; kuncinya menjadi string.
    sendState[String(guestId)] = state;
  }

  return {
    settings: toSettingsView(readWahaSettings()),
    webhookUrl: `${env.siteUrl}/api/webhook/waha`,
    outbox,
    sendState,
    nextSendInSeconds: secondsUntilNextSend(),
    guestsWithPhone: guests.filter((guest) => guest.telepon !== '').length,
  };
}

export async function loadAdminData(): Promise<AdminData> {
  const content = await loadAdminContent();

  return {
    summary: await loadAdminSummary(),
    content,
    whatsapp: loadAdminWhatsapp(content.guests),
    rsvpRows: listRsvp(),
    wishRows: listAllWishes(),
    envelopeRows: listEnvelopes(),
  };
}

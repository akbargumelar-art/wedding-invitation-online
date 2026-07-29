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
import { activeChannel } from '@/lib/notify';
import { getContent } from '@/lib/content';

export type AdminSummary = {
  /** Total tamu terdaftar di Sheet — dasar "undangan terkirim". */
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

export type AdminData = {
  summary: AdminSummary;
  rsvpRows: RsvpRow[];
  wishRows: WishRow[];
  envelopeRows: EnvelopeRow[];
};

/** Semua angka dashboard dihitung dalam satu tempat agar konsisten (US-15). */
export async function loadAdminSummary(): Promise<AdminSummary> {
  const content = await getContent();

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

export async function loadAdminData(): Promise<AdminData> {
  return {
    summary: await loadAdminSummary(),
    rsvpRows: listRsvp(),
    wishRows: listAllWishes(),
    envelopeRows: listEnvelopes(),
  };
}

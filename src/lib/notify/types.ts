import type { NotificationEvent } from '@/lib/db/notifications';

export type { NotificationEvent };

/**
 * Isi notifikasi.
 *
 * Sengaja hanya memuat apa yang benar-benar dibutuhkan mempelai untuk bertindak.
 * Tidak ada IP, user agent, atau berkas bukti transfer yang dikirim keluar —
 * data itu tetap di server (PRD §4.5).
 */
export type RsvpNotification = {
  event: 'rsvp';
  name: string;
  slug: string | null;
  status: 'hadir' | 'tidak_hadir' | 'ragu';
  pax: number;
  message: string | null;
  /** True bila tamu memperbarui jawaban, bukan mengirim pertama kali. */
  isUpdate: boolean;
};

export type WishNotification = {
  event: 'wish';
  name: string;
  slug: string | null;
  message: string;
  /** True bila ucapan menunggu persetujuan admin. */
  moderated: boolean;
};

export type EnvelopeNotification = {
  event: 'envelope';
  senderName: string;
  slug: string | null;
  amount: number | null;
  method: 'qris' | 'transfer' | 'tunai';
  note: string | null;
  hasProof: boolean;
};

export type VisitNotification = {
  event: 'visit';
  name: string | null;
  slug: string | null;
};

export type NotificationPayload =
  | RsvpNotification
  | WishNotification
  | EnvelopeNotification
  | VisitNotification;

export type DeliveryResult =
  | { ok: true }
  | {
      ok: false;
      error: string;
      /** False untuk galat yang tidak akan membaik (mis. token salah). */
      retryable: boolean;
    };

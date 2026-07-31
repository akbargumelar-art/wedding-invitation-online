import 'server-only';

import { getContent } from '@/lib/content';
import { getDb } from '@/lib/db';
import { findGuestByPhone, type GuestRow } from '@/lib/db/content';
import { createEnvelope } from '@/lib/db/envelope';
import { upsertRsvp } from '@/lib/db/rsvp';
import { createWish } from '@/lib/db/wishes';
import { env } from '@/lib/env';
import { logger } from '@/lib/logger';
import { notify } from '@/lib/notify';
import { consumeRateLimit, hashIp, RATE_LIMITS } from '@/lib/rate-limit';
import { formatRupiah, sanitizeGuestName, stripHtml } from '@/lib/text';
import { formatPax } from '@/lib/validation';
import { helpMessage, parseReply } from './reply';

/**
 * Pemrosesan balasan WhatsApp dari tamu.
 *
 * Jalur ini menulis ke tabel yang sama dengan formulir web — RSVP, ucapan, dan
 * konfirmasi amplop — sehingga rekap di dashboard tetap satu, tidak peduli tamu
 * mengisi lewat halaman undangan atau membalas pesan.
 *
 * Nomor telepon tamu TIDAK ikut tersimpan di tabel-tabel itu. Yang dicatat
 * hanyalah hash-nya, sama seperti perlakuan terhadap alamat IP pengunjung web
 * (PRD §4.5): identitas pengirim sudah diketahui lewat slug tamu, dan menyimpan
 * nomornya dua kali hanya memperluas data pribadi yang harus dijaga.
 */

export type InboundMessage = {
  messageId: string;
  chatId: string;
  body: string;
  fromMe: boolean;
  hasMedia: boolean;
};

export type InboundAction = 'rsvp' | 'wish' | 'envelope' | 'help' | 'ignored';

export type InboundResult = {
  action: InboundAction;
  /** Balasan yang harus dikirim kembali; string kosong berarti tidak membalas. */
  reply: string;
};

/** True bila pesan dengan id ini sudah pernah diproses. */
function alreadyHandled(messageId: string): boolean {
  const row = getDb()
    .prepare(`SELECT message_id FROM inbound_messages WHERE message_id = ?`)
    .get(messageId);

  return row !== undefined;
}

function recordHandled(message: InboundMessage, guest: GuestRow | null, action: InboundAction): void {
  getDb()
    .prepare(
      `INSERT INTO inbound_messages (message_id, chat_id, guest_slug, body, action)
       VALUES (?, ?, ?, ?, ?)
       ON CONFLICT(message_id) DO NOTHING`,
    )
    .run(message.messageId, message.chatId, guest?.slug ?? null, message.body.slice(0, 1000), action);
}

/** Nomor dari chatId WAHA: `6281234567890@c.us` → `6281234567890`. */
export function phoneFromChatId(chatId: string): string {
  return chatId.split('@')[0]?.replace(/\D/g, '') ?? '';
}

function invitationLink(slug: string | null): string {
  return slug ? `${env.siteUrl}/to/${slug}` : env.siteUrl;
}

export async function handleInboundMessage(message: InboundMessage): Promise<InboundResult> {
  // Pesan yang kita kirim sendiri ikut disiarkan WAHA sebagai peristiwa yang
  // sama; tanpa penjagaan ini, undangan yang baru terkirim akan diperlakukan
  // sebagai balasan tamu.
  if (message.fromMe) return { action: 'ignored', reply: '' };

  // Hanya chat pribadi yang diproses. Pesan grup (`@g.us`) tidak akan pernah
  // cocok dengan seorang tamu, dan membalasnya dengan petunjuk berarti membanjiri
  // grup keluarga dengan pesan otomatis.
  if (!message.chatId.endsWith('@c.us')) return { action: 'ignored', reply: '' };

  if (alreadyHandled(message.messageId)) {
    // WAHA mengirim ulang webhook yang gagal. Diam adalah jawaban yang benar:
    // memprosesnya lagi akan menggandakan ucapan dan konfirmasi amplop.
    return { action: 'ignored', reply: '' };
  }

  const identity = hashIp(message.chatId);
  const limit = consumeRateLimit(RATE_LIMITS.inboundWhatsapp, identity);
  if (!limit.allowed) {
    recordHandled(message, null, 'ignored');
    logger.warn('waha.inbound_rate_limited', { chatId: message.chatId });
    return { action: 'ignored', reply: '' };
  }

  const guest = findGuestByPhone(phoneFromChatId(message.chatId));
  const content = await getContent();
  const intent = parseReply(message.body);

  // Nomor yang tidak ada di daftar tamu tidak boleh menulis apa pun ke database:
  // webhook ini terbuka bagi siapa saja yang mengetahui nomor WhatsApp mempelai.
  if (!guest) {
    recordHandled(message, null, 'ignored');
    return { action: 'ignored', reply: helpMessage(env.siteUrl) };
  }

  const link = invitationLink(guest.slug);
  const nama = sanitizeGuestName(guest.nama);

  switch (intent.kind) {
    case 'rsvp': {
      if (!content.config.rsvpOpen) {
        recordHandled(message, guest, 'ignored');
        return {
          action: 'ignored',
          reply: 'Mohon maaf, konfirmasi kehadiran sudah ditutup. Terima kasih atas perhatiannya.',
        };
      }

      const row = upsertRsvp({
        guestSlug: guest.slug,
        name: nama,
        status: intent.status,
        pax: intent.status === 'hadir' ? intent.pax : 1,
        message: null,
        ipHash: identity,
        userAgent: 'whatsapp',
      });

      notify({
        event: 'rsvp',
        name: nama,
        slug: guest.slug,
        status: intent.status,
        pax: row.pax,
        message: null,
        isUpdate: row.created_at !== row.updated_at,
      });

      recordHandled(message, guest, 'rsvp');

      const konfirmasi =
        intent.status === 'hadir'
          ? `Alhamdulillah, kehadiran Anda tercatat untuk ${formatPax(row.pax)}.`
          : intent.status === 'tidak_hadir'
            ? 'Terima kasih atas kabarnya. Doa restu Anda sudah sangat berarti bagi kami.'
            : 'Baik, jawaban Anda kami catat sebagai belum pasti.';

      return {
        action: 'rsvp',
        reply: `${konfirmasi}\n\nBila ada perubahan, cukup balas pesan ini lagi.\n${link}`,
      };
    }

    case 'wish': {
      const bersih = stripHtml(intent.message).slice(0, 500);
      if (bersih.length < 5) {
        recordHandled(message, guest, 'help');
        return { action: 'help', reply: helpMessage(link) };
      }

      createWish({
        guestSlug: guest.slug,
        name: nama,
        message: bersih,
        status: content.config.moderasiUcapan ? 'pending' : 'approved',
        ipHash: identity,
      });

      notify({
        event: 'wish',
        name: nama,
        slug: guest.slug,
        message: bersih,
        moderated: content.config.moderasiUcapan,
      });

      recordHandled(message, guest, 'wish');

      return {
        action: 'wish',
        reply: content.config.moderasiUcapan
          ? 'Terima kasih atas ucapan dan doanya. Ucapan Anda akan tampil di halaman undangan setelah ditinjau.'
          : 'Terima kasih atas ucapan dan doanya. Ucapan Anda sudah tampil di halaman undangan.',
      };
    }

    case 'envelope': {
      createEnvelope({
        guestSlug: guest.slug,
        senderName: nama,
        amount: intent.amount,
        method: intent.method,
        note: 'Dikonfirmasi lewat WhatsApp.',
        proofFile: null,
        ipHash: identity,
      });

      notify({
        event: 'envelope',
        senderName: nama,
        slug: guest.slug,
        amount: intent.amount,
        method: intent.method,
        note: null,
        hasProof: false,
      });

      recordHandled(message, guest, 'envelope');

      const nominal = intent.amount === null ? '' : ` sebesar ${formatRupiah(intent.amount)}`;

      return {
        action: 'envelope',
        reply:
          `Terima kasih, konfirmasi tanda kasih${nominal} sudah kami terima dan akan segera kami cocokkan.\n\n` +
          'Mohon maaf, konfirmasi ini belum kami verifikasi secara otomatis.',
      };
    }

    case 'help':
      recordHandled(message, guest, 'help');
      return { action: 'help', reply: helpMessage(link) };

    default:
      recordHandled(message, guest, 'help');
      return { action: 'help', reply: helpMessage(link) };
  }
}

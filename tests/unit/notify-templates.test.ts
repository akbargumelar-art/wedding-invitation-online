import { describe, expect, it } from 'vitest';
import { buildMessage, notificationTitle, templateParameters } from '@/lib/notify/templates';
import { retryDelaySeconds } from '@/lib/notify/backoff';
import type { NotificationPayload } from '@/lib/notify/types';

const rsvp: NotificationPayload = {
  event: 'rsvp',
  name: 'Budi Santoso',
  slug: 'budi-santoso',
  status: 'hadir',
  pax: 2,
  message: 'Insya Allah kami sekeluarga hadir',
  isUpdate: false,
};

const wish: NotificationPayload = {
  event: 'wish',
  name: 'Siti Nurhaliza',
  slug: 'siti-nurhaliza',
  message: 'Barakallahu lakuma wa baraka alaikuma',
  moderated: true,
};

const envelope: NotificationPayload = {
  event: 'envelope',
  senderName: 'Dr. Rahmat Hidayat',
  slug: 'rahmat-hidayat',
  amount: 500_000,
  method: 'transfer',
  note: 'Semoga berkah',
  hasProof: true,
};

const visit: NotificationPayload = {
  event: 'visit',
  name: 'Keluarga Bapak Hasan',
  slug: 'keluarga-hasan',
};

describe('buildMessage', () => {
  it('menyusun pesan RSVP lengkap', () => {
    const text = buildMessage(rsvp);
    expect(text).toContain('RSVP baru');
    expect(text).toContain('Budi Santoso');
    expect(text).toContain('HADIR');
    expect(text).toContain('2 orang');
    expect(text).toContain('budi-santoso');
  });

  it('membedakan pembaruan dari kiriman pertama', () => {
    expect(buildMessage({ ...rsvp, isUpdate: true })).toContain('RSVP diperbarui');
    expect(notificationTitle({ ...rsvp, isUpdate: true })).toBe('RSVP diperbarui');
  });

  it('tidak menyebut jumlah orang bila tamu tidak hadir', () => {
    const text = buildMessage({ ...rsvp, status: 'tidak_hadir', pax: 1 });
    expect(text).toContain('TIDAK HADIR');
    expect(text).not.toContain('orang');
  });

  it('menandai ucapan yang menunggu moderasi', () => {
    expect(buildMessage(wish)).toContain('Menunggu persetujuan');
    expect(buildMessage({ ...wish, moderated: false })).not.toContain('Menunggu persetujuan');
  });

  it('selalu mengingatkan bahwa amplop belum diverifikasi', () => {
    const text = buildMessage(envelope);
    expect(text).toContain('Rp 500.000');
    expect(text).toContain('Transfer Bank');
    expect(text).toContain('Belum diverifikasi');
  });

  it('menyebut nominal tidak disebutkan bila kosong', () => {
    expect(buildMessage({ ...envelope, amount: null })).toContain('tidak disebutkan');
  });

  it('menangani kunjungan dari link umum tanpa nama', () => {
    expect(buildMessage({ event: 'visit', name: null, slug: null })).toContain('link umum');
  });

  it('memotong ucapan yang sangat panjang', () => {
    const text = buildMessage({ ...wish, message: 'x'.repeat(600) });
    expect(text.length).toBeLessThan(500);
  });

  it('tidak pernah menyertakan data sensitif', () => {
    // Payload notifikasi memang tidak punya field ini; tes menjaga agar tetap
    // begitu bila suatu saat isinya diperluas.
    for (const payload of [rsvp, wish, envelope, visit]) {
      const text = buildMessage(payload).toLowerCase();
      expect(text).not.toContain('ip');
      expect(text).not.toContain('.jpg');
      expect(text).not.toContain('user-agent');
    }
  });
});

describe('templateParameters', () => {
  it('menghasilkan tepat dua parameter tanpa baris baru', () => {
    const params = templateParameters(rsvp);
    expect(params).toHaveLength(2);
    expect(params[0]).toBe('RSVP baru');
    for (const param of params) expect(param).not.toContain('\n');
  });

  it('membatasi panjang parameter agar diterima Meta', () => {
    const params = templateParameters({ ...wish, message: 'y'.repeat(2000) });
    expect(params[1]!.length).toBeLessThanOrEqual(900);
  });

  it('tidak pernah mengirim parameter kosong', () => {
    expect(templateParameters(visit)[1]).not.toBe('');
  });
});

describe('retryDelaySeconds', () => {
  it('naik secara eksponensial', () => {
    expect(retryDelaySeconds(0)).toBe(30);
    expect(retryDelaySeconds(1)).toBe(120);
    expect(retryDelaySeconds(2)).toBe(480);
  });

  it('dibatasi maksimum satu jam', () => {
    expect(retryDelaySeconds(10)).toBe(3600);
  });
});

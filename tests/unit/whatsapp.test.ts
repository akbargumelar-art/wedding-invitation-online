import { describe, expect, it } from 'vitest';
import { normalizePhone } from '@/lib/text';
import { randomDelayMs } from '@/lib/waha/delay';
import { helpMessage, parseReply } from '@/lib/waha/reply';
import { DEFAULT_INVITATION_TEMPLATE, renderTemplate } from '@/lib/waha/message';
import { toChatId } from '@/lib/notify/chat-id';
import { guestSchema, parseGuestImport, wahaSettingsSchema } from '@/lib/validation';

describe('normalizePhone', () => {
  it('mengubah awalan 0 menjadi kode negara Indonesia', () => {
    expect(normalizePhone('081234567890')).toBe('6281234567890');
  });

  it('membuang tanda plus, spasi, dan tanda hubung', () => {
    expect(normalizePhone('+62 812-3456-7890')).toBe('6281234567890');
  });

  it('membiarkan nomor yang sudah berkode negara', () => {
    expect(normalizePhone('6281234567890')).toBe('6281234567890');
  });

  it('melengkapi nomor yang kode negaranya terlupakan', () => {
    // Bentuk yang paling sering tertempel langsung dari daftar kontak ponsel.
    expect(normalizePhone('81234567890')).toBe('6281234567890');
  });

  it('mempercayai kode negara lain apa adanya', () => {
    expect(normalizePhone('+1 213 213 2131')).toBe('12132132131');
  });

  it('mengembalikan kosong untuk masukan tanpa angka', () => {
    expect(normalizePhone('tidak ada')).toBe('');
    expect(normalizePhone('')).toBe('');
  });

  it('menghasilkan chatId WAHA yang benar setelah dinormalkan', () => {
    expect(toChatId(normalizePhone('0812-3456-7890'))).toBe('6281234567890@c.us');
  });
});

describe('guestSchema — nomor telepon', () => {
  const base = { nama: 'Budi Santoso', slug: '', kategori: '' };

  it('menormalkan nomor saat divalidasi', () => {
    expect(guestSchema.parse({ ...base, telepon: '0812 3456 7890' }).telepon).toBe(
      '6281234567890',
    );
  });

  it('mengizinkan tamu tanpa nomor', () => {
    expect(guestSchema.parse({ ...base, telepon: '' }).telepon).toBe('');
  });

  it('menolak nomor yang terlalu pendek untuk bisa dihubungi', () => {
    expect(() => guestSchema.parse({ ...base, telepon: '0812' })).toThrow();
  });
});

describe('parseGuestImport — kolom nomor', () => {
  it('membaca kolom ketiga sebagai nomor WhatsApp', () => {
    const entries = parseGuestImport('Budi, Teman Kantor, 081234567890');

    expect(entries[0]).toEqual({
      nama: 'Budi',
      slug: '',
      kategori: 'Teman Kantor',
      telepon: '6281234567890',
    });
  });

  it('tetap menerima baris tanpa kolom nomor', () => {
    expect(parseGuestImport('Budi')[0]?.telepon).toBe('');
  });
});

describe('randomDelayMs', () => {
  it('selalu berada di dalam rentang yang diminta', () => {
    for (let i = 0; i < 200; i += 1) {
      const delay = randomDelayMs(20, 60);
      expect(delay).toBeGreaterThanOrEqual(20_000);
      expect(delay).toBeLessThanOrEqual(60_000);
    }
  });

  it('memakai batas bawah dan atas sepenuhnya', () => {
    expect(randomDelayMs(20, 60, () => 0)).toBe(20_000);
    expect(randomDelayMs(20, 60, () => 1)).toBe(60_000);
  });

  it('merapikan rentang yang tertukar alih-alih menghasilkan nol', () => {
    // Nol berarti pengiriman beruntun — persis yang harus dihindari.
    expect(randomDelayMs(60, 20, () => 0)).toBe(20_000);
    expect(randomDelayMs(60, 20, () => 1)).toBe(60_000);
  });

  it('tidak pernah negatif meski diberi angka negatif', () => {
    expect(randomDelayMs(-10, -5, () => 0.5)).toBeGreaterThanOrEqual(0);
  });
});

describe('parseReply — RSVP', () => {
  it('membaca kehadiran beserta jumlah orang', () => {
    expect(parseReply('Hadir 3 orang')).toEqual({ kind: 'rsvp', status: 'hadir', pax: 3 });
  });

  it('menganggap satu orang bila jumlahnya tidak disebut', () => {
    expect(parseReply('hadir')).toEqual({ kind: 'rsvp', status: 'hadir', pax: 1 });
  });

  it('membaca "insya Allah hadir" sebagai kehadiran', () => {
    expect(parseReply('Insya Allah kami hadir')).toMatchObject({ status: 'hadir' });
  });

  it('TIDAK membaca "tidak hadir" sebagai hadir', () => {
    // Kekeliruan paling mahal yang mungkin terjadi di parser ini: mencatat
    // ketidakhadiran sebagai kehadiran, lalu konsumsi disiapkan berlebih.
    expect(parseReply('Maaf tidak hadir')).toMatchObject({ status: 'tidak_hadir' });
    expect(parseReply('tidak bisa hadir')).toMatchObject({ status: 'tidak_hadir' });
    expect(parseReply('kami berhalangan hadir')).toMatchObject({ status: 'tidak_hadir' });
  });

  it('membaca penolakan singkat', () => {
    expect(parseReply('tidak')).toMatchObject({ status: 'tidak_hadir' });
    expect(parseReply('nggak')).toMatchObject({ status: 'tidak_hadir' });
  });

  it('membaca keraguan', () => {
    expect(parseReply('masih ragu')).toMatchObject({ status: 'ragu' });
    expect(parseReply('Belum pasti')).toMatchObject({ status: 'ragu' });
  });

  it('membatasi rombongan besar ke penanda "lebih dari 5"', () => {
    expect(parseReply('hadir 12 orang')).toMatchObject({ status: 'hadir', pax: 6 });
  });
});

describe('parseReply — ucapan', () => {
  it('mengambil isi setelah kata kunci', () => {
    expect(parseReply('Ucapan Barakallahu lakuma wa baraka alaikuma')).toEqual({
      kind: 'wish',
      message: 'Barakallahu lakuma wa baraka alaikuma',
    });
  });

  it('mempertahankan huruf besar dan tanda baca asli', () => {
    const intent = parseReply('Doa: Semoga SAKINAH, mawaddah, warahmah!');

    expect(intent).toMatchObject({
      kind: 'wish',
      message: 'Semoga SAKINAH, mawaddah, warahmah!',
    });
  });

  it('membalas petunjuk bila kata kuncinya saja tanpa isi', () => {
    expect(parseReply('ucapan')).toEqual({ kind: 'help' });
  });
});

describe('parseReply — amplop', () => {
  it('membaca konfirmasi transfer beserta nominal', () => {
    expect(parseReply('Sudah transfer 500.000')).toEqual({
      kind: 'envelope',
      method: 'transfer',
      amount: 500000,
    });
  });

  it('menerima konfirmasi tanpa nominal', () => {
    expect(parseReply('sudah tf ya')).toEqual({
      kind: 'envelope',
      method: 'transfer',
      amount: null,
    });
  });

  it('mengenali QRIS dan tunai', () => {
    expect(parseReply('bayar lewat qris 250000')).toMatchObject({ method: 'qris' });
    expect(parseReply('titip amplop tunai')).toMatchObject({ method: 'tunai' });
  });

  it('mendahulukan konfirmasi dana daripada RSVP pada pesan campuran', () => {
    // "Sudah transfer, insya Allah hadir" memuat kata kunci keduanya. Dana yang
    // tidak tercatat jauh lebih merepotkan ditelusuri daripada RSVP yang dapat
    // dikirim ulang tamu.
    expect(parseReply('Sudah transfer 300000, insya Allah hadir')).toMatchObject({
      kind: 'envelope',
    });
  });
});

describe('parseReply — lain-lain', () => {
  it('mengenali permintaan bantuan', () => {
    expect(parseReply('menu')).toEqual({ kind: 'help' });
    expect(parseReply('Bantuan')).toEqual({ kind: 'help' });
  });

  it('tidak menebak pesan yang tidak dikenali', () => {
    expect(parseReply('')).toEqual({ kind: 'unknown' });
    expect(parseReply('besok acaranya jam berapa?')).toEqual({ kind: 'unknown' });
  });

  it('tidak tertipu kata yang kebetulan memuat kata kunci', () => {
    // "siapa" memuat "siap"; pencocokan potongan pernah membuat pertanyaan ini
    // tercatat sebagai konfirmasi kehadiran.
    expect(parseReply('halo pak, ini siapa ya?')).toEqual({ kind: 'unknown' });
  });

  it('meminta penegasan alih-alih menebak pesan yang ambigu', () => {
    expect(parseReply('belum tentu bisa datang')).toEqual({ kind: 'unknown' });
  });

  it('petunjuknya memuat link undangan tamu', () => {
    expect(helpMessage('https://undangan.test/to/budi')).toContain(
      'https://undangan.test/to/budi',
    );
  });
});

describe('renderTemplate', () => {
  const variables = {
    nama: 'Keluarga Bapak Ahmad',
    link: 'https://undangan.test/to/ahmad',
    mempelai: 'Layli & Rachmat',
    tanggal: 'Sabtu, 12 September 2026',
    lokasi: 'Gedung Melati',
  };

  it('mengganti seluruh penanda yang dikenal', () => {
    const hasil = renderTemplate('Yth. {nama}, {mempelai} pada {tanggal} di {lokasi}: {link}', variables);

    expect(hasil).toBe(
      'Yth. Keluarga Bapak Ahmad, Layli & Rachmat pada Sabtu, 12 September 2026 di Gedung Melati: https://undangan.test/to/ahmad',
    );
  });

  it('membiarkan penanda yang salah ketik tetap terlihat', () => {
    // Dikosongkan diam-diam berarti kesalahannya baru ketahuan setelah ratusan
    // pesan terkirim.
    expect(renderTemplate('Halo {namaa}', variables)).toBe('Halo {namaa}');
  });

  it('mengganti penanda yang muncul berkali-kali', () => {
    expect(renderTemplate('{nama} — {nama}', variables)).toBe(
      'Keluarga Bapak Ahmad — Keluarga Bapak Ahmad',
    );
  });

  it('templat bawaan memuat nama dan link', () => {
    const hasil = renderTemplate(DEFAULT_INVITATION_TEMPLATE, variables);

    expect(hasil).toContain('Keluarga Bapak Ahmad');
    expect(hasil).toContain('https://undangan.test/to/ahmad');
    expect(hasil).not.toContain('{');
  });
});

describe('wahaSettingsSchema', () => {
  const base = {
    enabled: true,
    baseUrl: 'http://127.0.0.1:3000',
    session: 'default',
    apiKey: '',
    webhookSecret: '',
    invitationTemplate: 'Yth. {nama}, {link}',
    autoReply: true,
    acceptReplies: true,
    minDelaySeconds: 20,
    maxDelaySeconds: 60,
  };

  it('menerima pengaturan yang wajar', () => {
    expect(wahaSettingsSchema.parse(base).baseUrl).toBe('http://127.0.0.1:3000');
  });

  it('membuang garis miring di akhir alamat server', () => {
    expect(wahaSettingsSchema.parse({ ...base, baseUrl: 'http://waha.test/' }).baseUrl).toBe(
      'http://waha.test',
    );
  });

  it('menolak alamat server tanpa skema', () => {
    expect(() => wahaSettingsSchema.parse({ ...base, baseUrl: '127.0.0.1:3000' })).toThrow();
  });

  it('menolak jeda maksimum yang lebih kecil daripada minimum', () => {
    expect(() =>
      wahaSettingsSchema.parse({ ...base, minDelaySeconds: 60, maxDelaySeconds: 20 }),
    ).toThrow();
  });

  it('menolak jeda di bawah batas aman', () => {
    expect(() =>
      wahaSettingsSchema.parse({ ...base, minDelaySeconds: 0, maxDelaySeconds: 1 }),
    ).toThrow();
  });

  it('menolak templat pesan kosong', () => {
    expect(() => wahaSettingsSchema.parse({ ...base, invitationTemplate: '   ' })).toThrow();
  });
});

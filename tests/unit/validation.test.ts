import { describe, expect, it } from 'vitest';
import {
  envelopeSchema,
  fieldErrors,
  firstErrorMessage,
  formatPax,
  loginSchema,
  PAX_OPTIONS,
  PAX_OVER,
  rsvpSchema,
  wishSchema,
} from '@/lib/validation';

describe('jumlah orang yang hadir', () => {
  it('menawarkan 1 sampai 5 lalu penanda "lebih dari 5"', () => {
    expect([...PAX_OPTIONS]).toEqual([1, 2, 3, 4, 5, PAX_OVER]);
  });

  it('tidak pernah menampilkan penanda sebagai angka', () => {
    // 6 berarti "enam atau lebih". Menampilkannya sebagai "6 orang" akan
    // membuat mempelai salah menghitung konsumsi.
    expect(formatPax(PAX_OVER)).toBe('lebih dari 5 orang');
    expect(formatPax(PAX_OVER + 3)).toBe('lebih dari 5 orang');
  });

  it('menampilkan jumlah pasti apa adanya', () => {
    expect(formatPax(1)).toBe('1 orang');
    expect(formatPax(5)).toBe('5 orang');
  });
});

describe('rsvpSchema', () => {
  const valid = { slug: 'budi-santoso', name: 'Budi Santoso', status: 'hadir', pax: 2 };

  it('menerima payload lengkap', () => {
    const parsed = rsvpSchema.parse(valid);
    expect(parsed).toMatchObject({ slug: 'budi-santoso', status: 'hadir', pax: 2, message: null });
  });

  it('memaksa pax menjadi 1 bila tamu tidak hadir', () => {
    expect(rsvpSchema.parse({ ...valid, status: 'tidak_hadir', pax: 5 }).pax).toBe(1);
  });

  it('menolak status di luar daftar dengan pesan Indonesia', () => {
    const result = rsvpSchema.safeParse({ ...valid, status: 'mungkin' });
    expect(result.success).toBe(false);
    if (!result.success) expect(firstErrorMessage(result.error)).toContain('status kehadiran');
  });

  it('menerima penanda "lebih dari 5" tetapi menolak di luar rentangnya', () => {
    expect(rsvpSchema.safeParse({ ...valid, pax: PAX_OVER }).success).toBe(true);
    expect(rsvpSchema.safeParse({ ...valid, pax: PAX_OVER + 1 }).success).toBe(false);
    expect(rsvpSchema.safeParse({ ...valid, pax: 0 }).success).toBe(false);
  });

  it('menolak nama terlalu pendek', () => {
    const result = rsvpSchema.safeParse({ ...valid, name: 'B' });
    expect(result.success).toBe(false);
    if (!result.success) expect(fieldErrors(result.error)['name']).toContain('minimal 2');
  });

  it('menolak pesan lebih dari 300 karakter', () => {
    expect(rsvpSchema.safeParse({ ...valid, message: 'x'.repeat(301) }).success).toBe(false);
  });

  it('membersihkan markup dari nama dan pesan', () => {
    const parsed = rsvpSchema.parse({ ...valid, name: '<b>Budi</b>', message: '<i>Selamat</i>' });
    expect(parsed.name).toBe('Budi');
    expect(parsed.message).toBe('Selamat');
  });

  it('mengubah slug kosong menjadi null (tamu link umum)', () => {
    expect(rsvpSchema.parse({ name: 'Budi', status: 'ragu' }).slug).toBeNull();
  });

  it('menolak slug dengan karakter tidak sah', () => {
    expect(rsvpSchema.safeParse({ ...valid, slug: '../admin' }).success).toBe(false);
  });
});

describe('wishSchema', () => {
  const valid = { name: 'Budi', message: 'Barakallahu lakuma', elapsedMs: 5000 };

  it('menerima ucapan yang wajar', () => {
    expect(wishSchema.parse(valid).message).toBe('Barakallahu lakuma');
  });

  it('menolak ucapan terlalu pendek atau terlalu panjang', () => {
    expect(wishSchema.safeParse({ ...valid, message: 'ok' }).success).toBe(false);
    expect(wishSchema.safeParse({ ...valid, message: 'x'.repeat(501) }).success).toBe(false);
  });

  it('menolak submit yang mengisi honeypot', () => {
    expect(wishSchema.safeParse({ ...valid, hp: 'bot' }).success).toBe(false);
  });

  it('tidak meneruskan field honeypot ke hasil', () => {
    expect(wishSchema.parse(valid)).not.toHaveProperty('hp');
  });

  it('membuang tag HTML dari ucapan', () => {
    const parsed = wishSchema.parse({ ...valid, message: '<script>alert(1)</script> Selamat ya' });
    expect(parsed.message).not.toContain('<');
  });
});

describe('envelopeSchema', () => {
  const valid = { sender_name: 'Budi', method: 'qris' };

  it('mengurai nominal berformat ribuan', () => {
    expect(envelopeSchema.parse({ ...valid, amount: '1.500.000' }).amount).toBe(1_500_000);
  });

  it('memperlakukan nominal kosong sebagai null', () => {
    expect(envelopeSchema.parse({ ...valid, amount: '' }).amount).toBeNull();
    expect(envelopeSchema.parse(valid).amount).toBeNull();
  });

  it('menolak metode di luar daftar', () => {
    expect(envelopeSchema.safeParse({ ...valid, method: 'paypal' }).success).toBe(false);
  });

  it('menolak catatan lebih dari 200 karakter', () => {
    expect(envelopeSchema.safeParse({ ...valid, note: 'x'.repeat(201) }).success).toBe(false);
  });

  it('menolak nominal melebihi batas wajar', () => {
    expect(envelopeSchema.safeParse({ ...valid, amount: '9999999999' }).success).toBe(false);
  });
});

describe('loginSchema', () => {
  it('mewajibkan kedua field terisi', () => {
    expect(loginSchema.safeParse({ username: '', password: 'x' }).success).toBe(false);
    expect(loginSchema.safeParse({ username: 'admin', password: '' }).success).toBe(false);
    expect(loginSchema.safeParse({ username: 'admin', password: 'rahasia' }).success).toBe(true);
  });
});

/**
 * Klien memvalidasi lalu mengirim HASIL transform ke server, dan server
 * memvalidasi ulang dengan skema yang sama. Skema karena itu wajib menerima
 * keluarannya sendiri — pelanggaran invarian ini pernah membuat pengiriman RSVP
 * gagal dengan pesan Zod berbahasa Inggris.
 */
describe('skema menerima keluarannya sendiri (round-trip)', () => {
  it('rsvpSchema', () => {
    const once = rsvpSchema.parse({ name: 'Budi', status: 'ragu' });
    expect(once.message).toBeNull();
    expect(once.slug).toBeNull();
    expect(() => rsvpSchema.parse(once)).not.toThrow();
    expect(rsvpSchema.parse(once)).toEqual(once);
  });

  it('wishSchema', () => {
    const once = wishSchema.parse({ name: 'Budi', message: 'Barakallahu lakuma' });
    expect(() => wishSchema.parse(once)).not.toThrow();
  });

  it('envelopeSchema', () => {
    const once = envelopeSchema.parse({ sender_name: 'Budi', method: 'tunai' });
    expect(once.amount).toBeNull();
    expect(once.note).toBeNull();
    expect(() => envelopeSchema.parse(once)).not.toThrow();
    expect(envelopeSchema.parse(once)).toEqual(once);
  });
});

describe('seluruh pesan galat berbahasa Indonesia', () => {
  const englishHints = /expected|received|required|invalid|string|number/i;

  const badPayloads: Array<[string, () => ReturnType<typeof rsvpSchema.safeParse>]> = [
    ['rsvp tanpa nama', () => rsvpSchema.safeParse({ status: 'hadir' })],
    ['rsvp status null', () => rsvpSchema.safeParse({ name: 'Budi', status: null })],
    ['rsvp pax bukan angka', () => rsvpSchema.safeParse({ name: 'Budi', status: 'hadir', pax: 'x' })],
  ];

  for (const [label, run] of badPayloads) {
    it(label, () => {
      const result = run();
      expect(result.success).toBe(false);
      if (result.success) return;

      for (const issue of result.error.issues) {
        expect(issue.message, `${label}: "${issue.message}"`).not.toMatch(englishHints);
      }
    });
  }

  it('ucapan dan amplop juga', () => {
    const results = [
      wishSchema.safeParse({ name: null, message: null }),
      envelopeSchema.safeParse({ sender_name: undefined, method: 'bitcoin' }),
    ];

    for (const result of results) {
      expect(result.success).toBe(false);
      if (result.success) continue;
      for (const issue of result.error.issues) {
        expect(issue.message).not.toMatch(englishHints);
      }
    }
  });
});

describe('pembantu galat', () => {
  it('fieldErrors mengambil satu pesan per field', () => {
    const result = rsvpSchema.safeParse({ name: '', status: 'x' });
    expect(result.success).toBe(false);
    if (!result.success) {
      const errors = fieldErrors(result.error);
      expect(Object.keys(errors)).toContain('name');
      expect(Object.keys(errors)).toContain('status');
    }
  });
});

import { describe, expect, it } from 'vitest';
import {
  formatRupiah,
  formatThousands,
  initials,
  parseRupiah,
  sanitizeGuestName,
  slugify,
  stripHtml,
  truncate,
  uniqueSlug,
} from '@/lib/text';

describe('slugify', () => {
  it('mengubah nama menjadi slug URL', () => {
    expect(slugify('Budi Santoso')).toBe('budi-santoso');
  });

  it('membuang diakritik dan tanda baca', () => {
    expect(slugify('Café Ñuñez, S.Kom.')).toBe('cafe-nunez-s-kom');
  });

  it('membuang apostrof tanpa menyisakan tanda hubung', () => {
    expect(slugify("Nur'aini")).toBe('nuraini');
  });

  it('tidak menyisakan tanda hubung di ujung', () => {
    expect(slugify('  --Ibu Ratna Dewi--  ')).toBe('ibu-ratna-dewi');
  });

  it('mengembalikan string kosong untuk input tanpa karakter alfanumerik', () => {
    expect(slugify('!!! ???')).toBe('');
  });
});

describe('uniqueSlug', () => {
  it('memakai slug dasar bila belum terpakai', () => {
    expect(uniqueSlug('Budi Santoso', [])).toBe('budi-santoso');
  });

  it('memberi sufiks angka untuk duplikat', () => {
    expect(uniqueSlug('Budi Santoso', ['budi-santoso'])).toBe('budi-santoso-2');
    expect(uniqueSlug('Budi Santoso', ['budi-santoso', 'budi-santoso-2'])).toBe('budi-santoso-3');
  });

  it('jatuh ke "tamu" bila nama tidak menghasilkan slug', () => {
    expect(uniqueSlug('!!!', [])).toBe('tamu');
  });
});

describe('stripHtml', () => {
  it('membuang tag HTML', () => {
    expect(stripHtml('<b>Selamat</b> menempuh hidup baru')).toBe('Selamat menempuh hidup baru');
  });

  it('menetralkan skrip termasuk isinya sebagai teks biasa', () => {
    expect(stripHtml('<script>alert(1)</script>')).toBe('alert(1)');
  });

  it('membuang markup yang disamarkan sebagai entity', () => {
    expect(stripHtml('&lt;img src=x onerror=alert(1)&gt;Barakallah')).toBe('Barakallah');
  });

  it('membuang komentar HTML', () => {
    expect(stripHtml('Semoga<!-- jahat --> samawa')).toBe('Semoga samawa');
  });

  it('mempertahankan baris baru tapi merapikan spasi berlebih', () => {
    expect(stripHtml('Baris satu   \n\n\n   Baris dua')).toBe('Baris satu\n\nBaris dua');
  });
});

describe('truncate & sanitizeGuestName', () => {
  it('memotong dengan elipsis melewati batas', () => {
    expect(truncate('abcdefghij', 5)).toBe('abcd…');
  });

  it('membiarkan teks yang masih muat', () => {
    expect(truncate('abcde', 5)).toBe('abcde');
  });

  it('membatasi nama tamu pada 60 karakter', () => {
    const panjang = 'A'.repeat(80);
    const hasil = sanitizeGuestName(panjang);
    expect(hasil).toHaveLength(60);
    expect(hasil.endsWith('…')).toBe(true);
  });

  it('membersihkan markup dari nama tamu', () => {
    expect(sanitizeGuestName('<script>x</script>Budi')).toBe('x Budi');
  });
});

describe('format nominal', () => {
  it('memformat rupiah dengan pemisah ribuan', () => {
    expect(formatRupiah(1_500_000)).toBe('Rp 1.500.000');
  });

  it('menampilkan tanda hubung untuk nilai kosong', () => {
    expect(formatRupiah(null)).toBe('-');
    expect(formatRupiah(undefined)).toBe('-');
  });

  it('mengurai input bernominal menjadi angka', () => {
    expect(parseRupiah('1.500.000')).toBe(1_500_000);
    expect(parseRupiah('Rp 50rb')).toBe(50);
    expect(parseRupiah('')).toBeNull();
  });

  it('menyisipkan pemisah ribuan saat mengetik', () => {
    expect(formatThousands('1500000')).toBe('1.500.000');
    expect(formatThousands('abc')).toBe('');
  });
});

describe('initials', () => {
  it('mengambil huruf pertama nama depan dan belakang', () => {
    expect(initials('Budi Santoso')).toBe('BS');
    expect(initials('Fatimah')).toBe('F');
    expect(initials('  ')).toBe('?');
  });
});

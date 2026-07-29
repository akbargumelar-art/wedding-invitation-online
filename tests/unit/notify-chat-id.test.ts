import { describe, expect, it } from 'vitest';
import { toChatId } from '@/lib/notify/chat-id';

/**
 * Akhiran JID menentukan pesan masuk ke chat pribadi atau grup, jadi salah
 * menormalkannya berarti pesan sampai ke tempat yang salah — atau tidak sampai
 * sama sekali.
 */
describe('toChatId', () => {
  it('melengkapi nomor biasa menjadi chat pribadi', () => {
    expect(toChatId('6281234567890')).toBe('6281234567890@c.us');
  });

  it('merapikan nomor bergaya manusia', () => {
    expect(toChatId('+62 812-3456-7890')).toBe('6281234567890@c.us');
    expect(toChatId('  0812 3456 7890  ')).toBe('081234567890@c.us');
  });

  it('membiarkan JID grup apa adanya', () => {
    // Menambahkan atau mengganti akhiran di sini akan mengalihkan pesan grup ke
    // chat pribadi yang tidak pernah ada.
    expect(toChatId('120363044814127701@g.us')).toBe('120363044814127701@g.us');
  });

  it('membiarkan JID pribadi yang sudah lengkap', () => {
    expect(toChatId('6281234567890@c.us')).toBe('6281234567890@c.us');
  });

  it('mengembalikan string kosong untuk masukan tanpa angka', () => {
    expect(toChatId('')).toBe('');
    expect(toChatId('   ')).toBe('');
    expect(toChatId('bukan-nomor')).toBe('');
  });

  it('tidak pernah menghasilkan JID tanpa bagian nomor', () => {
    for (const input of ['', ' ', 'abc', '---']) {
      const result = toChatId(input);
      expect(result === '' || /^\d+@/.test(result)).toBe(true);
    }
  });
});

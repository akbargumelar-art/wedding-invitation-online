import { describe, expect, it } from 'vitest';
import { buildInvitationMetadata } from '@/lib/metadata';
import { parseConfig } from '@/lib/content/parse';

const config = parseConfig(
  {
    pria_panggilan: 'Ahmad',
    wanita_panggilan: 'Fatimah',
    venue_nama: 'Kopi Senja Cafe',
    og_image: '/img/og.png',
  },
  [],
);

describe('buildInvitationMetadata', () => {
  it('menyusun judul dari nama panggilan kedua mempelai', () => {
    expect(buildInvitationMetadata(config, '2026-09-12').title).toBe(
      'Undangan Pernikahan Fatimah & Ahmad',
    );
  });

  it('memasukkan tanggal dan lokasi ke deskripsi', () => {
    const description = buildInvitationMetadata(config, '2026-09-12').description ?? '';
    expect(description).toContain('Sabtu, 12 September 2026');
    expect(description).toContain('Kopi Senja Cafe');
  });

  it('menyertakan gambar Open Graph berukuran 1200x630', () => {
    const images = buildInvitationMetadata(config, '2026-09-12').openGraph?.images;
    expect(images).toEqual([{ url: '/img/og.png', width: 1200, height: 630 }]);
  });

  it('menghilangkan gambar bila og_image kosong', () => {
    const tanpaGambar = parseConfig({ pria_panggilan: 'Ahmad' }, []);
    expect(buildInvitationMetadata(tanpaGambar, null).openGraph?.images).toBeUndefined();
  });

  it('memakai judul umum bila nama panggilan belum diisi', () => {
    expect(buildInvitationMetadata(parseConfig({}, []), null).title).toBe('Undangan Pernikahan');
  });

  it('tidak pernah mengizinkan pengindeksan mesin pencari', () => {
    // Undangan bersifat privat; setelan robots ada di layout root.
    expect(buildInvitationMetadata(config, null).openGraph?.locale).toBe('id_ID');
  });
});

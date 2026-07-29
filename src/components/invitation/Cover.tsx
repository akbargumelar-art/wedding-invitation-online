'use client';

import Image from 'next/image';
import { ArchOrnament, StarOrnament } from '@/components/ui/Ornament';

export type CoverProps = {
  /** Nama panggilan pasangan, sudah diurutkan sesuai Config.urutan_mempelai. */
  pasangan: [string, string];
  tanggalTampil: string;
  guestName: string | null;
  /** Kosong bila mode syar'i aktif — cover jatuh ke ornamen saja. */
  backgroundUrl: string;
  /** Banner mode dummy menempati bagian atas layar; sampul harus menyisakan ruang. */
  isDraft: boolean;
};

/**
 * Halaman sampul (US-02).
 *
 * Memakai 100svh, bukan 100vh, supaya address bar mobile yang menyusut/melebar
 * tidak memotong tombol.
 *
 * Susunannya tiga baris: ornamen (boleh menyusut), isi (menyusut dan boleh
 * digulir sendiri), lalu tombol yang tidak pernah menyusut. Dengan begitu nama
 * panjang, banner mode dummy, atau layar sependek 320x568 tidak pernah membuat
 * tombol "Buka Undangan" terdorong keluar layar.
 */
export function Cover({
  pasangan,
  tanggalTampil,
  guestName,
  backgroundUrl,
  isDraft,
  opened,
  onOpen,
}: CoverProps & { opened: boolean; onOpen: () => void }) {
  return (
    <div
      className={[
        'fixed inset-0 z-50 flex flex-col overflow-hidden',
        'bg-jade-800 text-cream transition-[opacity,transform] duration-700 ease-out',
        // Banner mode dummy setinggi ~2 baris pada layar tersempit.
        isDraft ? 'pt-12 sm:pt-10' : '',
        opened ? 'pointer-events-none -translate-y-full opacity-0' : 'translate-y-0 opacity-100',
      ].join(' ')}
      style={{ height: '100svh' }}
      aria-hidden={opened}
      inert={opened}
    >
      {backgroundUrl ? (
        <Image
          src={backgroundUrl}
          alt=""
          fill
          priority
          sizes="100vw"
          className="object-cover opacity-35"
        />
      ) : null}

      {/* Gradien hanya dipasang bila ada foto: tugasnya menjamin kontras teks di
          atas gambar apa pun. Tanpa foto ia cuma menggelapkan hijau yang sudah
          punya kontras 9:1 dengan teks cream. Kadarnya juga diturunkan dari palet
          sebelumnya supaya foto terlihat lebih terang; pada kasus terburuk (foto
          putih polos) teks cream masih mendapat rasio 8:1. */}
      {backgroundUrl ? (
        <div
          className="absolute inset-0"
          style={{
            background:
              'linear-gradient(to bottom, rgb(16 60 45 / 0.82), rgb(16 60 45 / 0.66) 45%, rgb(16 60 45 / 0.92))',
          }}
        />
      ) : null}

      <ArchOrnament className="pointer-events-none absolute inset-x-0 top-0 h-28 w-full text-gold-400/35 sm:h-40" />

      {/* `min-h-0` wajib: tanpa itu anak flex tidak boleh menyusut di bawah
          tinggi kontennya, dan isi sampul akan mendorong tombol keluar layar. */}
      <div className="relative flex min-h-0 flex-1 flex-col items-center justify-center gap-3 overflow-y-auto px-5 py-6 text-center sm:gap-6 sm:px-6">
        <StarOrnament size={32} className="shrink-0 text-gold-300 sm:hidden" />
        <StarOrnament size={40} className="hidden shrink-0 text-gold-300 sm:block" />

        <p className="eyebrow text-gold-300">Walimatul &lsquo;Urs</p>

        <h1 className="font-display leading-[1.05] text-cream text-[clamp(2rem,11vw,4.5rem)]">
          <span className="block">{pasangan[0]}</span>
          <span className="my-0.5 block text-[0.5em] text-gold-300">&</span>
          <span className="block">{pasangan[1]}</span>
        </h1>

        <p className="numeric text-xs tracking-[0.16em] text-jade-100 uppercase sm:text-sm sm:tracking-[0.18em]">
          {tanggalTampil}
        </p>

        <div className="mt-2 w-full max-w-sm rounded-2xl border border-gold-400/30 bg-jade-900/40 px-4 py-3 backdrop-blur-sm sm:mt-4 sm:px-5 sm:py-4">
          <p className="text-[0.6875rem] tracking-wider text-jade-200 uppercase">Kepada Yth.</p>
          <p className="mt-1 text-base font-semibold break-words text-cream sm:text-lg">
            {guestName ?? 'Bapak/Ibu/Saudara/i'}
          </p>
          <p className="mt-0.5 text-xs text-jade-200">di tempat</p>
        </div>
      </div>

      <div className="relative w-full shrink-0 px-5 pt-2 pb-6 sm:px-6 sm:pb-10">
        <button
          type="button"
          onClick={onOpen}
          className="btn btn-primary mx-auto w-full max-w-xs bg-gold-400 text-jade-900 hover:bg-gold-300"
        >
          <span aria-hidden="true">✉</span>
          Buka Undangan
        </button>
        <p className="mt-2 text-center text-[0.6875rem] leading-snug text-jade-200 sm:mt-3 sm:text-xs">
          Mohon maaf apabila ada kesalahan penulisan nama dan gelar
        </p>
      </div>
    </div>
  );
}

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

        {/* Tombol Buka Undangan — di bawah card Kepada Yth., rata tengah.
            Bertema jade+gold: gradient gold, ring/glow, hover lift + shine icon. */}
        <button
          type="button"
          onClick={onOpen}
          className="group relative mt-5 inline-flex w-full max-w-xs shrink-0 items-center justify-center gap-2.5 overflow-hidden rounded-full border border-gold-300/60 bg-gradient-to-b from-gold-300 to-gold-500 px-7 py-3 text-sm font-semibold tracking-wide text-jade-900 shadow-[0_10px_25px_-8px_rgb(0_0_0_/_0.55),_0_0_0_1px_rgb(255_215_130_/_0.35),_inset_0_1px_0_rgb(255_255_255_/_0.55)] ring-1 ring-gold-200/40 transition-all duration-300 hover:-translate-y-0.5 hover:from-gold-200 hover:to-gold-400 hover:shadow-[0_14px_30px_-8px_rgb(0_0_0_/_0.6),_0_0_28px_-4px_rgb(255_215_130_/_0.55),_inset_0_1px_0_rgb(255_255_255_/_0.6)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-200 active:translate-y-0 active:shadow-[0_6px_18px_-8px_rgb(0_0_0_/_0.6),_inset_0_1px_0_rgb(255_255_255_/_0.55)] sm:mt-6 sm:px-8 sm:py-3.5 sm:text-[0.95rem]"
        >
          {/* Shimmer sweep: gradasi diagonal yang meluncur saat hover.
              pointer-events-none supaya tidak menghalangi klik tombol. */}
          <span
            aria-hidden="true"
            className="pointer-events-none absolute inset-y-0 -left-1/2 w-1/2 -skew-x-12 bg-gradient-to-r from-transparent via-white/40 to-transparent opacity-0 transition-all duration-700 ease-out group-hover:left-full group-hover:opacity-100"
          />
          <span
            aria-hidden="true"
            className="text-base transition-transform duration-300 group-hover:-translate-y-0.5 group-hover:scale-110 sm:text-lg"
          >
            ✉
          </span>
          <span className="relative">Buka Undangan</span>
        </button>

        <p className="mt-3 text-center text-[0.6875rem] leading-snug text-jade-200 sm:text-xs">
          Mohon maaf apabila ada kesalahan penulisan nama dan gelar
        </p>
      </div>
    </div>
  );
}

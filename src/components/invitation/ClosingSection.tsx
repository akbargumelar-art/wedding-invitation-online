import { Reveal } from '@/components/ui/Reveal';
import { ArchOrnament, StarOrnament } from '@/components/ui/Ornament';
import { Gunungan, PucukRebung, KembangWajit } from './Ornaments';
import type { SiteConfig } from '@/lib/content/types';

/** Penutup: doa dan salam penutup, keduanya dari Sheet (US-03). */
export function ClosingSection({ config }: { config: SiteConfig }) {
  // Urutan mengikuti Config.urutan_mempelai. Sebelumnya di-hardcode
  // wanita-lalu-pria dan mengabaikan setting Sheet, sehingga penutup
  // selalu memakai urutan berbeda dari halaman sampul.
  const pasangan =
    config.urutanMempelai === 'pria_dulu'
      ? [config.pria.panggilan, config.wanita.panggilan].filter(Boolean)
      : [config.wanita.panggilan, config.pria.panggilan].filter(Boolean);

  return (
    <footer id="penutup" className="relative overflow-hidden bg-jade-800 text-cream">
      <ArchOrnament className="pointer-events-none absolute inset-x-0 top-0 h-32 w-full text-gold-400/25" />

      {/* Gunungan (siluet Priangan) di atas — tanda tanah Sunda menaungi doa penutup. */}
      <Gunungan className="pointer-events-none absolute inset-x-0 top-0 h-16 w-full text-gold-400/30 sm:h-24" />

      {/* Pucuk rebung besar di kedua sisi bawah — ukiran kayu Sunda halus. */}
      <PucukRebung className="ornament-ambient pointer-events-none absolute bottom-8 -left-4 h-32 w-20 text-gold-300/30" />
      <PucukRebung
        className="ornament-ambient pointer-events-none absolute bottom-8 -right-4 h-32 w-20 text-gold-300/30"
        style={{ animationDelay: '3s', transform: 'scaleX(-1)' }}
      />

      {/* Kembang wajit ambient di sudut. */}
      <KembangWajit className="ornament-ambient pointer-events-none absolute top-16 left-6 h-8 w-8 text-gold-300/50" />
      <KembangWajit
        className="ornament-ambient pointer-events-none absolute top-16 right-6 h-8 w-8 text-gold-300/50"
        style={{ animationDelay: '2s' }}
      />

      <div className="container-invite relative section text-center">
        <Reveal>
          <StarOrnament size={36} className="mx-auto text-gold-300" />

          {config.kalimatPenutup ? (
            <p className="mt-6 leading-relaxed text-jade-100 whitespace-pre-line">
              {config.kalimatPenutup}
            </p>
          ) : null}

          {config.doaPenutup ? (
            <p className="mt-8 rounded-xl border border-gold-400/25 px-5 py-5 font-display text-xl leading-relaxed text-cream">
              {config.doaPenutup}
            </p>
          ) : null}

          <p className="mt-8 text-lg text-gold-300">{config.salamPenutup}</p>

          {pasangan.length > 0 ? (
            <>
              <p className="mt-10 text-xs tracking-[0.2em] text-jade-200 uppercase">
                Kami yang berbahagia
              </p>
              <p className="mt-2 font-display text-3xl">{pasangan.join(' & ')}</p>
            </>
          ) : null}

          <p className="mt-10 text-xs text-jade-300">
            Data yang Anda kirim hanya digunakan untuk keperluan acara ini.
          </p>
        </Reveal>
      </div>
    </footer>
  );
}

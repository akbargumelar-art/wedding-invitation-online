import { Reveal } from '@/components/ui/Reveal';
import { ArchOrnament, StarOrnament } from '@/components/ui/Ornament';
import type { SiteConfig } from '@/lib/content/types';

/** Penutup: doa dan salam penutup, keduanya dari Sheet (US-03). */
export function ClosingSection({ config }: { config: SiteConfig }) {
  const pasangan = [config.wanita.panggilan, config.pria.panggilan].filter(Boolean);

  return (
    <footer id="penutup" className="relative overflow-hidden bg-jade-800 text-cream">
      <ArchOrnament className="pointer-events-none absolute inset-x-0 top-0 h-32 w-full text-gold-400/25" />

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

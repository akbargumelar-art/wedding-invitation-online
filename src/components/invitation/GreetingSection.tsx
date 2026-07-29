import { Reveal } from '@/components/ui/Reveal';
import { StarOrnament } from '@/components/ui/Ornament';
import { ArabesqueDivider } from './Ornaments';
import type { SiteConfig } from '@/lib/content/types';

/**
 * Salam pembuka + kutipan ayat (US-03).
 *
 * Seluruh teks — termasuk ayat, terjemahan, dan sumbernya — berasal dari Sheet.
 * Tidak ada satu pun yang di-hardcode, agar mempelai bebas memilih.
 */
export function GreetingSection({ config }: { config: SiteConfig }) {
  const hasQuote = Boolean(config.quoteArab || config.quoteTerjemahan);

  return (
    <section id="salam" className="section section-wash relative overflow-hidden bg-cream">
      <div className="container-invite">
        <Reveal className="text-center">
          <StarOrnament size={36} className="mx-auto text-gold-400" />
          <p className="mt-5 font-display text-2xl text-jade-800 md:text-3xl">
            {config.salamPembuka}
          </p>
          <ArabesqueDivider className="mt-4 mx-auto max-w-xs" />
        </Reveal>

        {hasQuote ? (
          <Reveal delayMs={120} className="mt-10">
            <figure className="card px-6 py-8 text-center">
              {config.quoteArab ? (
                <p dir="rtl" lang="ar" className="arabic text-jade-900">
                  {config.quoteArab}
                </p>
              ) : null}

              {config.quoteTerjemahan ? (
                <blockquote className="mt-6 text-[0.975rem] leading-relaxed text-ink-soft italic">
                  &ldquo;{config.quoteTerjemahan}&rdquo;
                </blockquote>
              ) : null}

              {config.quoteSumber ? (
                <figcaption className="mt-4 text-sm font-semibold text-gold-600">
                  ({config.quoteSumber})
                </figcaption>
              ) : null}
            </figure>
          </Reveal>
        ) : null}

        {config.kalimatPembuka ? (
          <Reveal delayMs={200} className="mt-10">
            <p className="text-center leading-relaxed text-ink-soft whitespace-pre-line">
              {config.kalimatPembuka}
            </p>
          </Reveal>
        ) : null}
      </div>
    </section>
  );
}

import { Reveal } from '@/components/ui/Reveal';
import { CopyButton } from '@/components/ui/CopyButton';
import { SectionHeading } from './SectionHeading';
import { LazyMap } from './LazyMap';
import type { SiteConfig } from '@/lib/content/types';

/** Lokasi resepsi (US-06): alamat, catatan khusus, tombol rute, dan peta lazy. */
export function VenueSection({ config }: { config: SiteConfig }) {
  if (!config.venueNama && !config.venueAlamat) return null;

  return (
    <section id="lokasi" className="section bg-jade-50">
      <div className="container-invite">
        <SectionHeading eyebrow="Denah & Rute" title="Lokasi Acara" />

        <Reveal className="mt-8">
          <div className="card px-6 py-7 text-center">
            <h3 className="font-display text-2xl text-jade-900">{config.venueNama}</h3>

            {config.venueAlamat ? (
              <p className="mt-3 leading-relaxed text-ink-soft">{config.venueAlamat}</p>
            ) : null}

            {config.venueCatatan ? (
              <p className="mt-4 rounded-lg bg-jade-50 px-4 py-3 text-sm text-ink-soft">
                {config.venueCatatan}
              </p>
            ) : null}

            <div className="mt-6 flex flex-wrap justify-center gap-2">
              {config.gmapsUrl ? (
                <a
                  href={config.gmapsUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="btn btn-primary text-sm"
                >
                  <span aria-hidden="true">➤</span>
                  Buka di Google Maps
                </a>
              ) : null}

              {config.venueAlamat ? (
                <CopyButton
                  value={`${config.venueNama} — ${config.venueAlamat}`}
                  label="Salin Alamat"
                  copiedLabel="Alamat tersalin"
                />
              ) : null}
            </div>
          </div>
        </Reveal>

        {config.gmapsEmbed ? (
          <Reveal delayMs={120} className="mt-6">
            <LazyMap embedUrl={config.gmapsEmbed} venueName={config.venueNama} />
          </Reveal>
        ) : null}
      </div>
    </section>
  );
}

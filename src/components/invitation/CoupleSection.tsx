import Image from 'next/image';
import { Reveal } from '@/components/ui/Reveal';
import { SectionHeading } from './SectionHeading';
import { StarOrnament } from '@/components/ui/Ornament';
import type { PersonConfig, SiteConfig } from '@/lib/content/types';

type Peran = 'putra' | 'putri';

/**
 * Profil mempelai (US-04) dengan dukungan mode syar'i (US-08).
 *
 * Keduanya berbagi satu kartu, dipisah ornamen "&". Sebelumnya masing-masing
 * punya kartu sendiri dengan foto setinggi 4:5, dan dua kartu itu jauh melebihi
 * satu lembar layar. Foto di sini bundar berukuran tetap sehingga tinggi kartu
 * tidak ikut membengkak — dan tetap sama tingginya saat mode syar'i mengganti
 * foto dengan ornamen.
 */
export function CoupleSection({ config }: { config: SiteConfig }) {
  const urutan: Array<{ person: PersonConfig; peran: Peran }> =
    config.urutanMempelai === 'pria_dulu'
      ? [
          { person: config.pria, peran: 'putra' },
          { person: config.wanita, peran: 'putri' },
        ]
      : [
          { person: config.wanita, peran: 'putri' },
          { person: config.pria, peran: 'putra' },
        ];

  return (
    <section id="mempelai" className="section bg-jade-50">
      <div className="container-invite">
        <SectionHeading eyebrow="Bismillahirrahmanirrahim" title="Kedua Mempelai" />

        <Reveal variant="x" delayMs={240} className="mt-10">
          <article className="card px-6 py-8">
            {urutan.map(({ person, peran }, index) => (
              <div key={person.namaLengkap || peran}>
                {index > 0 ? <Ampersand /> : null}
                <PersonBlock person={person} peran={peran} modeSyari={config.modeSyari} />
              </div>
            ))}
          </article>
        </Reveal>
      </div>
    </section>
  );
}

function Ampersand() {
  return (
    <div className="my-7 flex items-center justify-center gap-3 text-gold-400">
      <span className="h-px w-12 bg-gradient-to-r from-transparent to-current" />
      <span className="font-display text-2xl leading-none">&amp;</span>
      <span className="h-px w-12 bg-gradient-to-l from-transparent to-current" />
    </div>
  );
}

function PersonBlock({
  person,
  peran,
  modeSyari,
}: {
  person: PersonConfig;
  peran: Peran;
  modeSyari: boolean;
}) {
  const showPhoto = !modeSyari && Boolean(person.foto);
  const orangTua = [person.ayah, person.ibu].filter(Boolean).join(' & ');
  const sebutan = peran === 'putra' ? 'Putra' : 'Putri';

  return (
    <div className="text-center">
      <div className="relative mx-auto h-32 w-32 overflow-hidden rounded-full border border-jade-100 bg-jade-100">
        {showPhoto ? (
          <Image
            src={person.foto}
            alt={`Foto ${person.panggilan || person.namaLengkap}`}
            fill
            sizes="128px"
            className="object-cover"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center bg-jade-700 text-gold-300">
            <StarOrnament size={52} />
          </div>
        )}
      </div>

      <h3 className="mt-5 text-2xl text-jade-900">{person.namaLengkap || '—'}</h3>
      {person.binBinti ? <p className="mt-1 text-sm text-gold-600">{person.binBinti}</p> : null}

      {orangTua ? (
        <p className="mt-3 text-sm leading-relaxed text-ink-soft">
          {/* Urutan kelahiran ikut kalimat hanya bila diisi di Pengaturan. */}
          {person.anakKe ? `${sebutan} ${person.anakKe} dari` : `${sebutan} dari`}
          <br />
          {orangTua}
        </p>
      ) : null}

      {/* Tautan Instagram disembunyikan otomatis bila kolomnya dikosongkan. */}
      {person.instagram ? (
        <a
          href={`https://instagram.com/${person.instagram.replace(/^@/, '')}`}
          target="_blank"
          rel="noopener noreferrer"
          className="btn btn-ghost mt-4 text-sm"
        >
          <span aria-hidden="true">◎</span>@{person.instagram.replace(/^@/, '')}
        </a>
      ) : null}
    </div>
  );
}

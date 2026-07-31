import { Reveal } from '@/components/ui/Reveal';
import { SectionHeading } from './SectionHeading';
import { Countdown } from './Countdown';
import { AddToCalendar } from './AddToCalendar';
import { Arabesque, KembangWajit, CeplokBunga, MegaMendungDivider, PucukRebung } from './Ornaments';
import { formatRentangJam, formatTanggalLengkap } from '@/lib/date';
import type { ScheduleItem, SiteConfig } from '@/lib/content/types';

/**
 * Jadwal acara (US-05).
 *
 * Acara yang jatuh pada tanggal sama digabung menjadi satu kartu — akad dan
 * resepsi di hari yang sama tampil berurutan di dalam satu kartu, sedangkan
 * acara di hari lain (mis. syukuran pranikah) mendapat kartunya sendiri.
 *
 * Pengelompokan berbasis tanggal, bukan nama acara. Mencocokkan "Akad"/
 * "Resepsi" berarti hardcode nilai konten (PRD §2.4), yang tidak boleh.
 *
 * Urutan konten dalam tiap blok acara:
 *   Nama acara → Tanggal → Jam → Lokasi → (catatan) → Tombol
 *
 * Tanggal ditulis di bawah nama tiap acara — bukan di header kartu — supaya
 * tiap blok terbaca self-contained ("acara apa? kapan?" satu unit).
 *
 * Highlight PER-BLOK, bukan per-kartu: hanya blok `acaraUtama` (= acara
 * terakhir kronologis, biasanya resepsi) yang mendapat treatment primer
 * (background parchment→cream, aksen sudut Islami/Sunda, ornamen extra).
 * Blok lain (akad, syukuran) tampil netral supaya blok puncak menonjol
 * sebagai unit tersendiri di dalam kartu yang sama.
 *
 * Pemilihan berbasis urutan kronologis konsisten dengan `Countdown` yang
 * juga mengarah ke `acaraUtama`, sehingga "yang di-countdown" dan "yang
 * di-highlight" satu kesatuan.
 */
export function ScheduleSection({
  schedule,
  config,
}: {
  schedule: ScheduleItem[];
  config: SiteConfig;
}) {
  if (schedule.length === 0) return null;

  const acaraUtama = schedule[schedule.length - 1];
  const hari = groupByDate(schedule);

  return (
    <section id="jadwal" className="section relative overflow-hidden bg-cream batik-ceplok pattern-wash">
      {/* Ornamen ambient: pucuk rebung besar di sudut atas kiri & kanan,
          napas pelan supaya section terasa hidup tapi tidak berisik. */}
      <PucukRebung
        aria-hidden="true"
        className="ornament-ambient pointer-events-none absolute -top-2 -left-6 h-24 w-16 text-terracotta-400"
      />
      <PucukRebung
        aria-hidden="true"
        className="ornament-ambient pointer-events-none absolute -top-2 -right-6 h-24 w-16 text-terracotta-400"
        style={{ animationDelay: '3s', transform: 'scaleX(-1)' }}
      />

      <div className="container-invite">
        <SectionHeading eyebrow="Waktu & Tempat" title="Rangkaian Acara" />

        <MegaMendungDivider className="mt-4" />

        {acaraUtama ? (
          <Reveal variant="x" delayMs={240} className="mt-8">
            <Countdown targetMs={acaraUtama.startsAtMs} />
          </Reveal>
        ) : null}

        <ol className="mt-10 space-y-6">
          {hari.map((grup, index) => (
            <Reveal as="li" key={`${grup.tanggal}-${index}`} delayMs={240 + index * 110}>
              {/* Kartu grup selalu netral (soft). Highlight ada di level blok
                  di dalamnya, bukan di kartu. */}
              <article className="card px-6 py-7 relative border-gold-300/50 bg-cream-deep/60 shadow-[var(--shadow-soft)] text-gold-400">
                {grup.acara.map((item, position) => {
                  const isUtama = item === acaraUtama;

                  // Blok utama (resepsi) diberi treatment primer:
                  // background parchment→cream, aksen sudut, corner-wajit.
                  // Blok lain tetap netral supaya kontrasnya terbaca.
                  const blockClass = isUtama
                    ? 'relative overflow-hidden rounded-2xl corner-wajit border border-gold-300/50 bg-gradient-to-b from-parchment to-cream px-4 py-6 text-center shadow-[var(--shadow-primary,0_10px_30px_-15px_rgba(178,140,64,0.35))]'
                    : 'text-center';

                  const spacingClass =
                    position > 0
                      ? isUtama
                        ? 'mt-6'
                        : 'mt-6 border-t border-gold-300/40 pt-6'
                      : '';

                  return (
                    <div
                      key={`${item.acara}-${position}`}
                      className={`${spacingClass} ${blockClass}`.trim()}
                    >
                      {/* Aksen sudut cuma untuk blok utama. */}
                      {isUtama ? (
                        <>
                          <span
                            aria-hidden="true"
                            className="pointer-events-none absolute -top-6 -left-6 h-24 w-24 rounded-full bg-gold-300/25 blur-2xl"
                          />
                          <span
                            aria-hidden="true"
                            className="pointer-events-none absolute -bottom-6 -right-6 h-24 w-24 rounded-full bg-jade-200/30 blur-2xl"
                          />
                        </>
                      ) : null}

                      {/* Urutan: Nama acara → tanggal → divider → jam → lokasi. */}
                      <h3
                        className={
                          isUtama
                            ? 'relative font-display text-2xl text-jade-900'
                            : 'font-display text-xl text-jade-800/90'
                        }
                      >
                        {item.acara}
                      </h3>

                      <p
                        className={
                          isUtama
                            ? 'relative mt-2 text-sm text-jade-800/85'
                            : 'mt-2 text-sm text-jade-800/70'
                        }
                      >
                        {formatTanggalLengkap(item.tanggal)}
                      </p>

                      <div className={isUtama ? 'relative mt-3 ornament-divider' : 'mt-3 ornament-divider'}>
                        {isUtama ? (
                          <Arabesque className="h-3.5 w-10 text-gold-500" />
                        ) : (
                          <KembangWajit className="h-4 w-4 text-gold-400/80" />
                        )}
                      </div>

                      {isUtama ? (
                        <CeplokBunga
                          aria-hidden="true"
                          className="pointer-events-none relative mx-auto mt-2 h-5 w-5 text-terracotta-400/70"
                        />
                      ) : null}

                      {item.jamMulai ? (
                        <p className={isUtama ? 'relative mt-3 text-ink-soft' : 'mt-3 text-ink-soft'}>
                          {formatRentangJam(item.jamMulai, item.jamSelesai, item.zona)}
                        </p>
                      ) : null}

                      {item.lokasi ? (
                        <p className={isUtama ? 'relative mt-3 text-sm text-ink-soft' : 'mt-3 text-sm text-ink-soft'}>
                          <span aria-hidden="true">📍 </span>
                          {item.lokasi}
                        </p>
                      ) : null}

                      {item.catatan ? (
                        <p
                          className={
                            isUtama
                              ? 'relative mt-3 rounded-lg bg-jade-50 px-4 py-2 text-sm text-ink-soft'
                              : 'mt-3 rounded-lg bg-gold-300/20 px-4 py-2 text-sm text-ink-soft'
                          }
                        >
                          {item.catatan}
                        </p>
                      ) : null}

                      <div className={isUtama ? 'relative' : ''}>
                        <AddToCalendar
                          event={{
                            title: `${item.acara} — ${config.pria.panggilan} & ${config.wanita.panggilan}`,
                            description: [item.catatan, config.venueAlamat].filter(Boolean).join('\n'),
                            location: item.lokasi || config.venueNama,
                            startMs: item.startsAtMs,
                            endMs: item.endsAtMs,
                          }}
                          eventGmapsUrl={item.gmapsUrl}
                          venueGmapsUrl={config.gmapsUrl}
                          venueNama={config.venueNama}
                        />
                      </div>
                    </div>
                  );
                })}
              </article>
            </Reveal>
          ))}
        </ol>
      </div>
    </section>
  );
}

type HariAcara = { tanggal: string; acara: ScheduleItem[] };

/** Kelompokkan per tanggal sambil mempertahankan urutan kemunculannya. */
function groupByDate(schedule: ScheduleItem[]): HariAcara[] {
  const hasil: HariAcara[] = [];

  for (const item of schedule) {
    const terakhir = hasil.find((grup) => grup.tanggal === item.tanggal);
    if (terakhir) terakhir.acara.push(item);
    else hasil.push({ tanggal: item.tanggal, acara: [item] });
  }

  return hasil;
}

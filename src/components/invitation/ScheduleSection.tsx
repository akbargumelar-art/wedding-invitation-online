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
 * resepsi di hari yang sama tampil berurutan di bawah satu tanggal, sedangkan
 * acara di hari lain (mis. syukuran pranikah) mendapat kartunya sendiri.
 *
 * Pengelompokannya memakai tanggal, bukan nama acara. Mencocokkan nama berarti
 * menuliskan "Akad"/"Resepsi" di dalam kode, dan tidak ada nilai konten yang
 * boleh di-hardcode (PRD §2.4). Urutan kartu mengikuti tanggal dan jam mulai,
 * jadi mempelai tetap yang menentukan susunannya.
 *
 * Variasi kartu (US visual):
 *  - Grup tanggal acara utama (hari yang sama dengan hitung mundur) tampil
 *    "primer" — gradient jade+gold, ornamen emas — menandakan sakralnya akad
 *    dan puncaknya resepsi.
 *  - Grup tanggal lain (mis. syukuran/pengajian pranikah) tampil "soft" —
 *    krem hangat dengan aksen gold muda — nuansa kekeluargaan Sunda yang
 *    lebih tenang, tidak menyaingi acara puncak.
 */
export function ScheduleSection({
  schedule,
  config,
}: {
  schedule: ScheduleItem[];
  config: SiteConfig;
}) {
  if (schedule.length === 0) return null;

  // Hitung mundur mengarah ke acara terakhir — acara yang sama dengan tanggal
  // yang dipasang di sampul. Memakai acara pertama membuat hitung mundur
  // menunjuk acara pendahulu (mis. syukuran pranikah) sementara sampul memasang
  // tanggal resepsi, dan selisih satu-dua hari itu terbaca tamu sebagai galat.
  const acaraUtama = schedule[schedule.length - 1];
  const hari = groupByDate(schedule);
  const tanggalUtama = acaraUtama?.tanggal;

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
          {hari.map((grup, index) => {
            const isUtama = grup.tanggal === tanggalUtama;

            // Variant "primer" untuk hari akad/resepsi, "soft" untuk hari
            // pengantar (mis. syukuran/pengajian pranikah). Beda kelas
            // container + heading + divider — tetap satu markup, satu file.
            const containerClass = isUtama
              ? 'card px-6 py-7 relative overflow-hidden corner-wajit border-gold-300/50 shadow-[var(--shadow-primary,0_10px_30px_-15px_rgba(178,140,64,0.35))] bg-gradient-to-b from-parchment to-cream text-gold-500'
              : 'card px-6 py-7 relative border-gold-300/50 bg-cream-deep/60 shadow-[var(--shadow-soft)] text-gold-400';

            const headingClass = isUtama
              ? 'text-center font-display text-xl text-jade-900'
              : 'text-center font-display text-lg text-jade-800/90';

            return (
              <Reveal as="li" key={`${grup.tanggal}-${index}`} delayMs={240 + index * 110}>
                <article className={containerClass}>
                  {/* Aksen sudut untuk kartu utama — sentuhan ornamen Islami/Sunda halus. */}
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

                  <h3 className={headingClass}>{formatTanggalLengkap(grup.tanggal)}</h3>

                  <div className="mt-1 ornament-divider">
                    {isUtama ? (
                      <Arabesque className="h-3.5 w-10 text-gold-500" />
                    ) : (
                      <KembangWajit className="h-4 w-4 text-gold-400/80" />
                    )}
                  </div>

                  {isUtama ? (
                    <CeplokBunga
                      aria-hidden="true"
                      className="pointer-events-none mx-auto mt-2 h-5 w-5 text-terracotta-400/70"
                    />
                  ) : null}

                  {grup.acara.map((item, position) => (
                    <div
                      key={`${item.acara}-${position}`}
                      className={
                        position > 0
                          ? isUtama
                            ? 'mt-6 border-t border-jade-100 pt-6 text-center'
                            : 'mt-6 border-t border-gold-300/40 pt-6 text-center'
                          : 'mt-5 text-center'
                      }
                    >
                      <h4
                        className={
                          isUtama
                            ? 'font-display text-2xl text-jade-900'
                            : 'font-display text-xl text-jade-800/90'
                        }
                      >
                        {item.acara}
                      </h4>

                      {item.jamMulai ? (
                        <p className="mt-1 text-ink-soft">
                          {formatRentangJam(item.jamMulai, item.jamSelesai, item.zona)}
                        </p>
                      ) : null}

                      {item.lokasi ? (
                        <p className="mt-3 text-sm text-ink-soft">
                          <span aria-hidden="true">📍 </span>
                          {item.lokasi}
                        </p>
                      ) : null}

                      {item.catatan ? (
                        <p
                          className={
                            isUtama
                              ? 'mt-3 rounded-lg bg-jade-50 px-4 py-2 text-sm text-ink-soft'
                              : 'mt-3 rounded-lg bg-gold-300/20 px-4 py-2 text-sm text-ink-soft'
                          }
                        >
                          {item.catatan}
                        </p>
                      ) : null}

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
                  ))}
                </article>
              </Reveal>
            );
          })}
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

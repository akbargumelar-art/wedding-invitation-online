import { Reveal } from '@/components/ui/Reveal';
import { SectionHeading } from './SectionHeading';
import { Countdown } from './Countdown';
import { AddToCalendar } from './AddToCalendar';
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
 * boleh di-hardcode (PRD §2.4). Urutan kartu mengikuti urutan baris di Sheet,
 * jadi mempelai tetap yang menentukan susunannya.
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

  return (
    <section id="jadwal" className="section bg-cream">
      <div className="container-invite">
        <SectionHeading eyebrow="Waktu & Tempat" title="Rangkaian Acara" />

        {acaraUtama ? (
          <Reveal className="mt-8">
            <Countdown targetMs={acaraUtama.startsAtMs} />
          </Reveal>
        ) : null}

        <ol className="mt-10 space-y-6">
          {hari.map((grup, index) => (
            <Reveal as="li" key={`${grup.tanggal}-${index}`} delayMs={index * 100}>
              <article className="card px-6 py-7">
                <h3 className="text-center font-display text-xl text-jade-900">
                  {formatTanggalLengkap(grup.tanggal)}
                </h3>

                <div className="mt-1 ornament-divider">
                  <span className="text-sm" aria-hidden="true">
                    ✦
                  </span>
                </div>

                {grup.acara.map((item, position) => (
                  <div
                    key={`${item.acara}-${position}`}
                    className={
                      position > 0 ? 'mt-6 border-t border-jade-100 pt-6 text-center' : 'mt-5 text-center'
                    }
                  >
                    <h4 className="font-display text-2xl text-jade-900">{item.acara}</h4>

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
                      <p className="mt-3 rounded-lg bg-jade-50 px-4 py-2 text-sm text-ink-soft">
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
                    />
                  </div>
                ))}
              </article>
            </Reveal>
          ))}
        </ol>
      </div>
    </section>
  );
}

type HariAcara = { tanggal: string; acara: ScheduleItem[] };

/** Kelompokkan per tanggal sambil mempertahankan urutan kemunculan di Sheet. */
function groupByDate(schedule: ScheduleItem[]): HariAcara[] {
  const hasil: HariAcara[] = [];

  for (const item of schedule) {
    const terakhir = hasil.find((grup) => grup.tanggal === item.tanggal);
    if (terakhir) terakhir.acara.push(item);
    else hasil.push({ tanggal: item.tanggal, acara: [item] });
  }

  return hasil;
}

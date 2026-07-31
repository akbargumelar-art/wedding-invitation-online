'use client';

import { formatRupiah } from '@/lib/text';
import type { AdminSummary } from '@/lib/admin-data';

/** Angka-angka utama dashboard (US-15). */
export function SummaryPanel({ summary }: { summary: AdminSummary }) {
  return (
    <section aria-label="Ringkasan">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
        <Stat label="Undangan terdaftar" value={summary.totalInvited} />
        <Stat label="Undangan dibuka" value={summary.visits.totalVisits} />
        <Stat label="Hadir" value={summary.rsvp.hadir} tone="success" />
        <Stat label="Tidak hadir" value={summary.rsvp.tidakHadir} />
        <Stat label="Masih ragu" value={summary.rsvp.ragu} />
        <Stat label="Perkiraan orang" value={summary.rsvp.totalPax} tone="highlight" />
        <Stat
          label="Ucapan"
          value={summary.wishes.approved}
          hint={`${summary.wishes.pending} menunggu`}
        />
        <Stat
          label="Amplop terverifikasi"
          value={summary.envelopes.verified}
          hint={`${summary.envelopes.pending} menunggu`}
        />
        <Stat
          label="Notifikasi terkirim"
          value={summary.notifications.sent}
          hint={
            summary.notifyChannel === 'off'
              ? 'saluran nonaktif'
              : `${summary.notifyChannel} · ${summary.notifications.pending} antre`
          }
        />
      </div>

      <div className="card mt-3 px-5 py-4">
        <p className="text-sm text-ink-muted">Akumulasi nominal yang sudah diverifikasi</p>
        <p className="numeric mt-1 font-display text-3xl text-jade-900">
          {formatRupiah(summary.envelopes.verifiedAmount)}
        </p>
        <p className="mt-1 text-xs text-ink-muted">
          Hanya menghitung konfirmasi berstatus terverifikasi. Angka ini bukan mutasi rekening —
          selalu cocokkan dengan m-banking.
        </p>
      </div>

      <div className="mt-6 flex flex-wrap gap-2" aria-label="Unduh data">
        <CsvLink dataset="rsvp">Unduh CSV RSVP</CsvLink>
        <CsvLink dataset="ucapan">Unduh CSV Ucapan</CsvLink>
        <CsvLink dataset="amplop">Unduh CSV Amplop</CsvLink>
        <CsvLink dataset="tamu">Unduh CSV Tamu</CsvLink>
      </div>
    </section>
  );
}

/**
 * Tautan unduhan CSV. Sengaja `<a download>` dan bukan `next/link`: tujuannya
 * route API yang mengirim berkas, bukan navigasi halaman — prefetch Link justru
 * akan memicu unduhan tak diminta.
 */
function CsvLink({ dataset, children }: { dataset: string; children: React.ReactNode }) {
  return (
    <a href={`/api/admin/csv/${dataset}`} download className="btn btn-ghost text-sm">
      {children}
    </a>
  );
}

function Stat({
  label,
  value,
  hint,
  tone = 'default',
}: {
  label: string;
  value: number;
  hint?: string;
  tone?: 'default' | 'success' | 'highlight';
}) {
  const valueClass =
    tone === 'success' ? 'text-success' : tone === 'highlight' ? 'text-gold-600' : 'text-jade-900';

  return (
    // `role="group"` + aria-label membuat tiap kartu dapat dirujuk sebagai satu
    // kesatuan — berguna untuk pembaca layar maupun pengujian.
    <div className="card px-4 py-4" role="group" aria-label={label}>
      <p className="text-xs text-ink-muted">{label}</p>
      <p className={`numeric mt-1 font-display text-3xl ${valueClass}`}>{value}</p>
      {hint ? <p className="text-xs text-ink-muted">{hint}</p> : null}
    </div>
  );
}

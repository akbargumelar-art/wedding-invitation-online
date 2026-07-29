'use client';

import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { csrfToken, patchJson, postJson } from '@/lib/client-api';
import { formatRupiah } from '@/lib/text';
import type { AdminData } from '@/lib/admin-data';
import type { WishRow } from '@/lib/db/wishes';
import type { EnvelopeRow } from '@/lib/db/envelope';

/**
 * Dashboard admin (US-15).
 *
 * Data awal dirender di server; setiap aksi moderasi memanggil API lalu memicu
 * `router.refresh()` sehingga angka ringkasan dan tabel selalu berasal dari satu
 * sumber kebenaran (server), bukan dari salinan state di klien.
 */
export function AdminDashboard({ data, username }: { data: AdminData; username: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [busyId, setBusyId] = useState<string | null>(null);
  const [notice, setNotice] = useState('');

  const { summary, wishRows, envelopeRows } = data;

  async function mutate(key: string, url: string, status: string) {
    setBusyId(key);
    setNotice('');

    const result = await patchJson<{ ok: true }>(url, { status }, { 'x-walimah-csrf': csrfToken() });
    setBusyId(null);

    if (!result.ok) {
      setNotice(result.message);
      return;
    }

    startTransition(() => router.refresh());
  }

  async function handleExport() {
    setBusyId('export');
    setNotice('');

    const result = await postJson<{ ok: boolean; skippedReason?: string }>(
      '/api/admin/export',
      {},
      { 'x-walimah-csrf': csrfToken() },
    );
    setBusyId(null);

    setNotice(
      result.ok
        ? result.data.ok
          ? 'Data berhasil ditulis ke tab Export di Google Sheet.'
          : (result.data.skippedReason ?? 'Ekspor dilewati.')
        : result.message,
    );
  }

  async function handleLogout() {
    await postJson('/api/admin/logout', {});
    router.replace('/admin/login');
    router.refresh();
  }

  return (
    <div className="mx-auto w-full max-w-5xl px-4 py-8">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="eyebrow">Walimah</p>
          <h1 className="mt-1 text-2xl text-jade-900">Dashboard Admin</h1>
          <p className="text-sm text-ink-muted">Masuk sebagai {username}</p>
        </div>
        <button type="button" onClick={handleLogout} className="btn btn-ghost text-sm">
          Keluar
        </button>
      </header>

      {summary.notifications.failed > 0 ? (
        <p role="status" className="mt-6 rounded-lg bg-danger/10 px-4 py-3 text-sm text-danger">
          <strong>{summary.notifications.failed}</strong> notifikasi WhatsApp gagal terkirim setelah
          semua percobaan ulang. Periksa kredensial gateway dan log server
          (<code className="font-mono">journalctl -u walimah</code>). Data tamunya sendiri tetap
          tersimpan lengkap di dashboard ini.
        </p>
      ) : null}

      {summary.contentSource !== 'sheets' ? (
        <p role="status" className="mt-6 rounded-lg bg-gold-300/25 px-4 py-3 text-sm text-ink">
          Konten sedang dibaca dari <strong>{summary.contentSource}</strong>, bukan langsung dari
          Google Sheets. Periksa kredensial service account bila ini tidak disengaja.
        </p>
      ) : null}

      {/* ---------------------------------------------------------------- Kartu */}
      <section className="mt-6" aria-label="Ringkasan">
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
      </section>

      {/* ---------------------------------------------------------------- Aksi */}
      <section className="mt-6 flex flex-wrap gap-2" aria-label="Ekspor data">
        <button
          type="button"
          onClick={handleExport}
          className="btn btn-primary text-sm"
          disabled={busyId === 'export'}
        >
          {busyId === 'export' ? 'Mengekspor…' : 'Export ke Google Sheet'}
        </button>
        <CsvLink dataset="rsvp">Unduh CSV RSVP</CsvLink>
        <CsvLink dataset="ucapan">Unduh CSV Ucapan</CsvLink>
        <CsvLink dataset="amplop">Unduh CSV Amplop</CsvLink>
      </section>

      {notice ? (
        <p role="status" className="mt-4 rounded-lg bg-jade-100 px-4 py-3 text-sm text-ink">
          {notice}
        </p>
      ) : null}

      {/* ---------------------------------------------------------------- Ucapan */}
      <section className="mt-10" aria-label="Moderasi ucapan">
        <h2 className="text-xl text-jade-900">Ucapan ({wishRows.length})</h2>

        <ul className="mt-4 space-y-3">
          {wishRows.length === 0 ? <Empty>Belum ada ucapan masuk.</Empty> : null}

          {wishRows.map((wish) => (
            <li key={wish.id} className="card px-5 py-4">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="font-semibold text-ink break-words">{wish.name}</p>
                  <p className="text-xs text-ink-muted">
                    {wish.created_at}
                    {wish.guest_slug ? ` · ${wish.guest_slug}` : ' · link umum'}
                  </p>
                </div>
                <StatusBadge status={wish.status} />
              </div>

              <p className="mt-3 text-sm leading-relaxed text-ink-soft whitespace-pre-line break-words">
                {wish.message}
              </p>

              <div className="mt-4 flex flex-wrap gap-2">
                <ActionButton
                  onClick={() => mutate(`wish-${wish.id}`, `/api/admin/wishes/${wish.id}`, 'approved')}
                  disabled={busyId === `wish-${wish.id}` || pending || wish.status === 'approved'}
                >
                  Setujui
                </ActionButton>
                <ActionButton
                  onClick={() => mutate(`wish-${wish.id}`, `/api/admin/wishes/${wish.id}`, 'rejected')}
                  disabled={busyId === `wish-${wish.id}` || pending || wish.status === 'rejected'}
                >
                  Tolak
                </ActionButton>
                <ActionButton
                  tone="danger"
                  onClick={() => mutate(`wish-${wish.id}`, `/api/admin/wishes/${wish.id}`, 'deleted')}
                  disabled={busyId === `wish-${wish.id}` || pending}
                >
                  Hapus
                </ActionButton>
              </div>
            </li>
          ))}
        </ul>
      </section>

      {/* ---------------------------------------------------------------- Amplop */}
      <section className="mt-10 pb-16" aria-label="Verifikasi amplop">
        <h2 className="text-xl text-jade-900">Konfirmasi Amplop ({envelopeRows.length})</h2>

        <ul className="mt-4 space-y-3">
          {envelopeRows.length === 0 ? <Empty>Belum ada konfirmasi amplop.</Empty> : null}

          {envelopeRows.map((row) => (
            <EnvelopeCard
              key={row.id}
              row={row}
              busy={busyId === `env-${row.id}` || pending}
              onVerify={() => mutate(`env-${row.id}`, `/api/admin/envelope/${row.id}`, 'verified')}
              onReject={() => mutate(`env-${row.id}`, `/api/admin/envelope/${row.id}`, 'rejected')}
            />
          ))}
        </ul>
      </section>
    </div>
  );
}

function EnvelopeCard({
  row,
  busy,
  onVerify,
  onReject,
}: {
  row: EnvelopeRow;
  busy: boolean;
  onVerify: () => void;
  onReject: () => void;
}) {
  const [showProof, setShowProof] = useState(false);

  return (
    <li className="card px-5 py-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="font-semibold text-ink break-words">{row.sender_name}</p>
          <p className="text-xs text-ink-muted">
            {row.created_at}
            {row.guest_slug ? ` · ${row.guest_slug}` : ' · link umum'}
          </p>
        </div>
        <StatusBadge status={row.status} />
      </div>

      <dl className="mt-3 grid grid-cols-2 gap-2 text-sm">
        <div>
          <dt className="text-ink-muted">Nominal</dt>
          <dd className="font-medium text-ink">{formatRupiah(row.amount)}</dd>
        </div>
        <div>
          <dt className="text-ink-muted">Metode</dt>
          <dd className="font-medium text-ink capitalize">{row.method}</dd>
        </div>
      </dl>

      {row.note ? <p className="mt-3 text-sm text-ink-soft break-words">{row.note}</p> : null}

      {row.proof_file ? (
        <div className="mt-3">
          <button
            type="button"
            onClick={() => setShowProof((current) => !current)}
            className="btn btn-ghost text-sm"
            aria-expanded={showProof}
          >
            {showProof ? 'Sembunyikan bukti' : 'Lihat bukti transfer'}
          </button>

          {showProof ? (
            // Gambar berasal dari route admin terautentikasi, bukan dari web root.
            // `next/image` sengaja tidak dipakai agar berkas privat tidak masuk
            // cache optimizer di disk.
            /* eslint-disable-next-line @next/next/no-img-element */
            <img
              src={`/api/admin/proof/${row.proof_file}`}
              alt={`Bukti transfer dari ${row.sender_name}`}
              className="mt-3 w-full max-w-sm rounded-lg border border-jade-100"
              loading="lazy"
            />
          ) : null}
        </div>
      ) : null}

      <div className="mt-4 flex flex-wrap gap-2">
        <ActionButton onClick={onVerify} disabled={busy || row.status === 'verified'}>
          Verifikasi
        </ActionButton>
        <ActionButton tone="danger" onClick={onReject} disabled={busy || row.status === 'rejected'}>
          Tolak
        </ActionButton>
      </div>
    </li>
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
    tone === 'success'
      ? 'text-success'
      : tone === 'highlight'
        ? 'text-gold-600'
        : 'text-jade-900';

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

function StatusBadge({ status }: { status: WishRow['status'] | EnvelopeRow['status'] }) {
  const labels: Record<string, string> = {
    pending: 'Menunggu',
    approved: 'Disetujui',
    rejected: 'Ditolak',
    verified: 'Terverifikasi',
  };

  const tones: Record<string, string> = {
    pending: 'bg-gold-300/30 text-gold-600',
    approved: 'bg-success/12 text-success',
    verified: 'bg-success/12 text-success',
    rejected: 'bg-danger/10 text-danger',
  };

  return (
    <span className={`rounded-full px-3 py-1 text-xs font-semibold ${tones[status] ?? ''}`}>
      {labels[status] ?? status}
    </span>
  );
}

function ActionButton({
  children,
  onClick,
  disabled,
  tone = 'default',
}: {
  children: React.ReactNode;
  onClick: () => void;
  disabled?: boolean;
  tone?: 'default' | 'danger';
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={[
        'btn text-sm',
        tone === 'danger' ? 'btn-ghost text-danger' : 'btn-ghost',
      ].join(' ')}
    >
      {children}
    </button>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return <li className="card px-5 py-8 text-center text-sm text-ink-muted">{children}</li>;
}

'use client';

import { useState } from 'react';
import { patchJson } from '@/lib/client-api';
import { formatRupiah } from '@/lib/text';
import type { EnvelopeRow } from '@/lib/db/envelope';
import type { WishRow } from '@/lib/db/wishes';
import {
  ActionButton,
  Empty,
  NoticeBar,
  PanelHeading,
  StatusBadge,
  csrfHeaders,
  useAdminAction,
} from './ui';

/** Moderasi buku ucapan (US-15). */
export function WishesPanel({ rows }: { rows: WishRow[] }) {
  const { run, notice, busy } = useAdminAction();

  const moderate = (id: number, status: string) =>
    void run(`wish-${id}`, () =>
      patchJson(`/api/admin/wishes/${id}`, { status }, csrfHeaders()),
    );

  return (
    <section aria-label="Moderasi ucapan">
      <PanelHeading
        title={`Ucapan (${rows.length})`}
        description="Ucapan yang belum disetujui tidak tampil di halaman undangan."
      />

      <NoticeBar notice={notice} />

      <ul className="mt-4 space-y-3 pb-4">
        {rows.length === 0 ? <Empty>Belum ada ucapan masuk.</Empty> : null}

        {rows.map((wish) => (
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
                onClick={() => moderate(wish.id, 'approved')}
                disabled={busy(`wish-${wish.id}`) || wish.status === 'approved'}
              >
                Setujui
              </ActionButton>
              <ActionButton
                onClick={() => moderate(wish.id, 'rejected')}
                disabled={busy(`wish-${wish.id}`) || wish.status === 'rejected'}
              >
                Tolak
              </ActionButton>
              <ActionButton
                tone="danger"
                onClick={() => moderate(wish.id, 'deleted')}
                disabled={busy(`wish-${wish.id}`)}
              >
                Hapus
              </ActionButton>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}

/** Verifikasi konfirmasi amplop digital (US-15). */
export function EnvelopesPanel({ rows }: { rows: EnvelopeRow[] }) {
  const { run, notice, busy } = useAdminAction();

  const moderate = (id: number, status: string) =>
    void run(`env-${id}`, () =>
      patchJson(`/api/admin/envelope/${id}`, { status }, csrfHeaders()),
    );

  return (
    <section aria-label="Verifikasi amplop">
      <PanelHeading
        title={`Konfirmasi Amplop (${rows.length})`}
        description="Cocokkan dengan mutasi rekening sebelum menandai terverifikasi."
      />

      <NoticeBar notice={notice} />

      <ul className="mt-4 space-y-3 pb-4">
        {rows.length === 0 ? <Empty>Belum ada konfirmasi amplop.</Empty> : null}

        {rows.map((row) => (
          <EnvelopeCard
            key={row.id}
            row={row}
            busy={busy(`env-${row.id}`)}
            onVerify={() => moderate(row.id, 'verified')}
            onReject={() => moderate(row.id, 'rejected')}
          />
        ))}
      </ul>
    </section>
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

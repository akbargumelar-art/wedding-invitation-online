'use client';

import { useState } from 'react';
import { deleteJson, postJson, putJson } from '@/lib/client-api';
import type { AccountRow } from '@/lib/db/content';
import {
  ActionButton,
  NoticeBar,
  PanelHeading,
  TextField,
  Toggle,
  csrfHeaders,
  useAdminAction,
} from './ui';

type Draft = { bank: string; nomor: string; atasNama: string; tampil: boolean };

const BLANK: Draft = { bank: '', nomor: '', atasNama: '', tampil: true };

/** Halaman undangan hanya menampilkan tiga rekening pertama yang aktif. */
const MAX_SHOWN = 3;

export function AccountsPanel({ rows }: { rows: AccountRow[] }) {
  const { run, notice, busy } = useAdminAction();
  const [adding, setAdding] = useState(false);

  const shown = rows.filter((row) => row.tampil).length;

  return (
    <section aria-label="Rekening penerima">
      <PanelHeading
        title={`Rekening (${rows.length})`}
        description="Nomor rekening yang ditampilkan di bagian amplop digital."
        action={
          <ActionButton tone="primary" onClick={() => setAdding(true)} disabled={adding}>
            Tambah rekening
          </ActionButton>
        }
      />

      <NoticeBar notice={notice} />

      {shown > MAX_SHOWN ? (
        <p role="status" className="mt-4 rounded-lg bg-gold-300/25 px-4 py-3 text-sm text-ink">
          Ada <strong>{shown}</strong> rekening aktif, tetapi halaman undangan hanya menampilkan{' '}
          {MAX_SHOWN} yang pertama. Nonaktifkan sisanya agar tidak ada yang terlewat tanpa
          disadari.
        </p>
      ) : null}

      {adding ? (
        <AccountForm
          initial={BLANK}
          busy={busy('account-new')}
          submitLabel="Tambah rekening"
          onSubmit={async (draft) => {
            const created = await run(
              'account-new',
              () => postJson('/api/admin/content/accounts', draft, csrfHeaders()),
              'Rekening ditambahkan.',
            );
            if (created !== null) setAdding(false);
          }}
          onCancel={() => setAdding(false)}
        />
      ) : null}

      <ul className="mt-4 space-y-3">
        {rows.length === 0 && !adding ? (
          <li className="card px-5 py-8 text-center text-sm text-ink-muted">
            Belum ada rekening. Bagian amplop tetap tampil bila QRIS sudah diisi di Pengaturan.
          </li>
        ) : null}

        {rows.map((row) => (
          <li key={row.id}>
            <AccountForm
              initial={row}
              busy={busy(`account-${row.id}`)}
              submitLabel="Simpan"
              onSubmit={async (draft) => {
                await run(
                  `account-${row.id}`,
                  () => putJson(`/api/admin/content/accounts/${row.id}`, draft, csrfHeaders()),
                  'Rekening diperbarui.',
                );
              }}
              onDelete={async () => {
                await run(
                  `account-${row.id}`,
                  () => deleteJson(`/api/admin/content/accounts/${row.id}`, csrfHeaders()),
                  'Rekening dihapus.',
                );
              }}
            />
          </li>
        ))}
      </ul>
    </section>
  );
}

function AccountForm({
  initial,
  busy,
  submitLabel,
  onSubmit,
  onDelete,
  onCancel,
}: {
  initial: Draft;
  busy: boolean;
  submitLabel: string;
  onSubmit: (draft: Draft) => Promise<void>;
  onDelete?: () => Promise<void>;
  onCancel?: () => void;
}) {
  const [draft, setDraft] = useState<Draft>(initial);

  const set = <K extends keyof Draft>(key: K, value: Draft[K]): void =>
    setDraft((current) => ({ ...current, [key]: value }));

  return (
    <form
      className="card mt-4 px-5 py-5"
      onSubmit={(event) => {
        event.preventDefault();
        void onSubmit(draft);
      }}
    >
      <div className="grid gap-4 sm:grid-cols-3">
        <TextField
          label="Bank"
          value={draft.bank}
          placeholder="BCA"
          disabled={busy}
          onChange={(value) => set('bank', value)}
        />
        <TextField
          label="Nomor rekening"
          value={draft.nomor}
          disabled={busy}
          onChange={(value) => set('nomor', value)}
        />
        <TextField
          label="Atas nama"
          value={draft.atasNama}
          disabled={busy}
          onChange={(value) => set('atasNama', value)}
        />
      </div>

      <div className="mt-4">
        <Toggle
          label="Tampilkan rekening ini"
          checked={draft.tampil}
          disabled={busy}
          onChange={(value) => set('tampil', value)}
        />
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        <ActionButton tone="primary" type="submit" disabled={busy}>
          {busy ? 'Menyimpan…' : submitLabel}
        </ActionButton>
        {onCancel ? (
          <ActionButton onClick={onCancel} disabled={busy}>
            Batal
          </ActionButton>
        ) : null}
        {onDelete ? (
          <ActionButton tone="danger" onClick={() => void onDelete()} disabled={busy}>
            Hapus
          </ActionButton>
        ) : null}
      </div>
    </form>
  );
}

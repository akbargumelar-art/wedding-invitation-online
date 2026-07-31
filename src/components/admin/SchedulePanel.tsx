'use client';

import { useState } from 'react';
import { deleteJson, postJson, putJson } from '@/lib/client-api';
import type { ScheduleRow } from '@/lib/db/content';
import {
  ActionButton,
  NoticeBar,
  PanelHeading,
  SelectField,
  TextAreaField,
  TextField,
  Toggle,
  csrfHeaders,
  useAdminAction,
} from './ui';

type Draft = Omit<ScheduleRow, 'id'>;

const BLANK: Draft = {
  acara: '',
  tanggal: '',
  jamMulai: '',
  jamSelesai: '',
  zona: 'WIB',
  lokasi: '',
  catatan: '',
  gmapsUrl: '',
  tampil: true,
};

const ZONE_OPTIONS = [
  { value: 'WIB', label: 'WIB (Jakarta)' },
  { value: 'WITA', label: 'WITA (Makassar)' },
  { value: 'WIT', label: 'WIT (Jayapura)' },
];

/**
 * Rangkaian acara — akad, resepsi, dan lain-lain.
 *
 * Urutan tampil tidak dapat diatur manual dan memang tidak perlu: halaman tamu
 * selalu mengurutkannya berdasarkan tanggal dan jam mulai.
 */
export function SchedulePanel({ rows }: { rows: ScheduleRow[] }) {
  const { run, notice, busy } = useAdminAction();
  const [adding, setAdding] = useState(false);

  async function create(draft: Draft): Promise<boolean> {
    const result = await run(
      'schedule-new',
      () => postJson('/api/admin/content/schedule', draft, csrfHeaders()),
      'Acara ditambahkan.',
    );

    if (result === null) return false;
    setAdding(false);
    return true;
  }

  return (
    <section aria-label="Rangkaian acara">
      <PanelHeading
        title={`Rangkaian Acara (${rows.length})`}
        description="Diurutkan otomatis menurut tanggal dan jam mulai."
        action={
          <ActionButton tone="primary" onClick={() => setAdding(true)} disabled={adding}>
            Tambah acara
          </ActionButton>
        }
      />

      <NoticeBar notice={notice} />

      {adding ? (
        <ScheduleForm
          initial={BLANK}
          busy={busy('schedule-new')}
          submitLabel="Tambah acara"
          onSubmit={create}
          onCancel={() => setAdding(false)}
        />
      ) : null}

      <ul className="mt-4 space-y-3">
        {rows.length === 0 && !adding ? (
          <li className="card px-5 py-8 text-center text-sm text-ink-muted">
            Belum ada acara. Tambahkan minimal satu agar hitung mundur dan tombol kalender berfungsi.
          </li>
        ) : null}

        {rows.map((row) => (
          <li key={row.id}>
            <ScheduleForm
              initial={row}
              busy={busy(`schedule-${row.id}`)}
              submitLabel="Simpan"
              onSubmit={async (draft) => {
                const result = await run(
                  `schedule-${row.id}`,
                  () => putJson(`/api/admin/content/schedule/${row.id}`, draft, csrfHeaders()),
                  'Acara diperbarui.',
                );
                return result !== null;
              }}
              onDelete={async () => {
                await run(
                  `schedule-${row.id}`,
                  () => deleteJson(`/api/admin/content/schedule/${row.id}`, csrfHeaders()),
                  'Acara dihapus.',
                );
              }}
            />
          </li>
        ))}
      </ul>
    </section>
  );
}

function ScheduleForm({
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
  onSubmit: (draft: Draft) => Promise<boolean>;
  onDelete?: () => Promise<void>;
  onCancel?: () => void;
}) {
  const [draft, setDraft] = useState<Draft>(initial);
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  const set = <K extends keyof Draft>(key: K, value: Draft[K]): void =>
    setDraft((current) => ({ ...current, [key]: value }));

  return (
    <form
      className="card mt-4 px-5 py-5"
      onSubmit={async (event) => {
        event.preventDefault();
        await onSubmit(draft);
      }}
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <TextField
          label="Nama acara"
          value={draft.acara}
          disabled={busy}
          placeholder="Akad Nikah"
          onChange={(value) => set('acara', value)}
        />
        <TextField
          label="Tanggal"
          type="date"
          value={draft.tanggal}
          disabled={busy}
          onChange={(value) => set('tanggal', value)}
        />
        <div className="grid grid-cols-2 gap-3">
          <TextField
            label="Jam mulai"
            type="time"
            value={draft.jamMulai}
            disabled={busy}
            onChange={(value) => set('jamMulai', value)}
          />
          <TextField
            label="Jam selesai"
            type="time"
            value={draft.jamSelesai}
            disabled={busy}
            onChange={(value) => set('jamSelesai', value)}
          />
        </div>
        <SelectField
          label="Zona waktu"
          value={draft.zona}
          disabled={busy}
          options={ZONE_OPTIONS}
          onChange={(value) => set('zona', value)}
        />
        <TextField
          label="Lokasi"
          value={draft.lokasi}
          disabled={busy}
          onChange={(value) => set('lokasi', value)}
          hint="Kosongkan bila sama dengan lokasi utama di Pengaturan."
        />
        <TextField
          label="Tautan Google Maps"
          value={draft.gmapsUrl}
          disabled={busy}
          onChange={(value) => set('gmapsUrl', value)}
          hint="Hanya perlu diisi bila acara ini di tempat berbeda."
        />
      </div>

      <div className="mt-4 grid gap-4">
        <TextAreaField
          label="Catatan"
          value={draft.catatan}
          rows={2}
          disabled={busy}
          onChange={(value) => set('catatan', value)}
        />
        <Toggle
          label="Tampilkan acara ini"
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
          confirmingDelete ? (
            <>
              <ActionButton tone="danger" onClick={onDelete} disabled={busy}>
                Ya, hapus acara ini
              </ActionButton>
              <ActionButton onClick={() => setConfirmingDelete(false)} disabled={busy}>
                Batal
              </ActionButton>
            </>
          ) : (
            <ActionButton tone="danger" onClick={() => setConfirmingDelete(true)} disabled={busy}>
              Hapus
            </ActionButton>
          )
        ) : null}
      </div>
    </form>
  );
}

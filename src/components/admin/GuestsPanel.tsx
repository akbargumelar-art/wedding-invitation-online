'use client';

import { useMemo, useState } from 'react';
import { deleteJson, postJson, putJson } from '@/lib/client-api';
import { CopyButton } from '@/components/ui/CopyButton';
import { formatPhone } from '@/lib/text';
import { formatPax } from '@/lib/validation';
import type { AdminWhatsapp, GuestRsvpState } from '@/lib/admin-data';
import type { GuestRow } from '@/lib/db/content';
import type { GuestSendState } from '@/lib/db/outbox';
import {
  ActionButton,
  NoticeBar,
  PanelHeading,
  TextAreaField,
  TextField,
  csrfHeaders,
  useAdminAction,
} from './ui';

/**
 * Daftar tamu — bagian yang paling terasa bedanya setelah lepas dari
 * spreadsheet.
 *
 * Karena itu impor massal disediakan sejajar dengan penambahan satu per satu:
 * menyiapkan daftar undangan biasanya dimulai dari tempelan Excel berisi
 * ratusan nama, dan memaksa mengetiknya satu per satu di form akan membuat
 * dashboard ini lebih lambat daripada spreadsheet yang digantikannya.
 *
 * Di sini pula undangan dikirim — satuan lewat tombol per baris, atau massal
 * lewat pilihan di atas daftar — dan status konfirmasi kehadiran ditampilkan.
 * Ketiganya sengaja berada di satu tempat: menjelang hari-H, yang dibutuhkan
 * bersamaan adalah siapa yang belum menjawab DAN nomor mana yang harus dihubungi.
 */

type Saringan = 'semua' | 'sudah' | 'belum' | 'hadir' | 'tidak_hadir';

const SARINGAN: Array<{ id: Saringan; label: string }> = [
  { id: 'semua', label: 'Semua' },
  { id: 'sudah', label: 'Sudah konfirmasi' },
  { id: 'belum', label: 'Belum konfirmasi' },
  { id: 'hadir', label: 'Hadir' },
  { id: 'tidak_hadir', label: 'Tidak hadir' },
];

export function GuestsPanel({
  rows,
  siteUrl,
  whatsapp,
  rsvpBySlug,
}: {
  rows: GuestRow[];
  siteUrl: string;
  whatsapp: AdminWhatsapp;
  rsvpBySlug: Record<string, GuestRsvpState>;
}) {
  const { run, notice, setNotice, busy } = useAdminAction();
  const [query, setQuery] = useState('');
  const [importing, setImporting] = useState(false);
  const [importText, setImportText] = useState('');
  const [adding, setAdding] = useState(false);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [saringan, setSaringan] = useState<Saringan>('semua');

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();

    return rows.filter((row) => {
      const rsvp = rsvpBySlug[row.slug];

      if (saringan === 'sudah' && !rsvp) return false;
      if (saringan === 'belum' && rsvp) return false;
      if (saringan === 'hadir' && rsvp?.status !== 'hadir') return false;
      if (saringan === 'tidak_hadir' && rsvp?.status !== 'tidak_hadir') return false;

      if (!needle) return true;

      return (
        row.nama.toLowerCase().includes(needle) ||
        row.slug.includes(needle) ||
        row.telepon.includes(needle.replace(/\D/g, '')) ||
        row.kategori.toLowerCase().includes(needle)
      );
    });
  }, [rows, query, saringan, rsvpBySlug]);

  const sudahRsvp = rows.filter((row) => rsvpBySlug[row.slug] !== undefined).length;

  const belumTerkirim = rows.filter(
    (row) => row.telepon !== '' && whatsapp.sendState[String(row.id)]?.status !== 'sent',
  );

  function toggle(id: number): void {
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function handleImport(): Promise<void> {
    const result = await run<{ inserted: number; updated: number }>(
      'guest-import',
      () => putJson('/api/admin/content/guests', { text: importText }, csrfHeaders()),
    );

    if (result === null) return;

    setImportText('');
    setImporting(false);
    setNotice({
      tone: 'ok',
      text: `${result.inserted} tamu baru ditambahkan, ${result.updated} diperbarui.`,
    });
  }

  async function handleBroadcast(guestIds: number[]): Promise<void> {
    const result = await run<{ queued: number; estimatedMinutes: number }>(
      'broadcast',
      () => postJson('/api/admin/whatsapp/broadcast', { guestIds }, csrfHeaders()),
    );

    if (result === null) return;

    setSelected(new Set());
    setNotice({
      tone: 'ok',
      text:
        `${result.queued} undangan masuk antrean. Pengiriman berjalan di latar belakang dengan ` +
        `jeda acak ${whatsapp.settings.minDelaySeconds}–${whatsapp.settings.maxDelaySeconds} detik ` +
        `antar-pesan, perkiraan selesai sekitar ${result.estimatedMinutes} menit. ` +
        `Progresnya dapat dipantau di tab WhatsApp.`,
    });
  }

  return (
    <section aria-label="Daftar tamu">
      <PanelHeading
        title={`Tamu (${rows.length})`}
        description={`${sudahRsvp} dari ${rows.length} tamu sudah konfirmasi kehadiran · ${whatsapp.guestsWithPhone} punya nomor WhatsApp.`}
        action={
          <div className="flex flex-wrap gap-2">
            <ActionButton onClick={() => setImporting((value) => !value)}>
              Impor massal
            </ActionButton>
            <a href="/api/admin/csv/tamu" download className="btn btn-ghost text-sm">
              Unduh CSV
            </a>
            <ActionButton tone="primary" onClick={() => setAdding(true)} disabled={adding}>
              Tambah tamu
            </ActionButton>
          </div>
        }
      />

      <NoticeBar notice={notice} />

      {whatsapp.settings.enabled ? (
        <div className="card mt-4 flex flex-wrap items-center gap-3 px-5 py-4">
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold text-ink">Kirim undangan lewat WhatsApp</p>
            <p className="text-xs text-ink-muted">
              {selected.size > 0
                ? `${selected.size} tamu dipilih.`
                : `${belumTerkirim.length} tamu belum menerima undangan.`}
              {whatsapp.outbox.pending > 0
                ? ` · ${whatsapp.outbox.pending} sedang dalam antrean.`
                : ''}
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            <ActionButton
              onClick={() => void handleBroadcast([...selected])}
              disabled={busy('broadcast') || selected.size === 0}
            >
              Kirim ke {selected.size} terpilih
            </ActionButton>
            <ActionButton
              tone="primary"
              onClick={() => void handleBroadcast([])}
              disabled={busy('broadcast') || belumTerkirim.length === 0}
            >
              {busy('broadcast') ? 'Mengantre…' : `Kirim ke semua yang belum (${belumTerkirim.length})`}
            </ActionButton>
          </div>
        </div>
      ) : (
        <p className="mt-4 rounded-lg bg-gold-300/25 px-4 py-3 text-sm text-ink">
          Pengiriman undangan lewat WhatsApp belum aktif. Aktifkan di tab <strong>WhatsApp</strong>{' '}
          untuk dapat mengirim undangan langsung dari sini.
        </p>
      )}

      {importing ? (
        <div className="card mt-4 px-5 py-5">
          <TextAreaField
            label="Tempel daftar nama"
            value={importText}
            rows={8}
            disabled={busy('guest-import')}
            onChange={setImportText}
            placeholder={
              'Keluarga Bapak Ahmad, Keluarga, 081234567890\nRina Wulandari, Teman Kantor, 081298765432'
            }
            hint="Satu tamu per baris. Kolom: nama, kategori, nomor WhatsApp — dipisah koma, titik koma, atau TAB. Menempel langsung dari Excel juga bisa."
          />

          <p className="field-hint">
            Nama yang slug-nya sudah ada akan diperbarui, bukan digandakan — jadi aman menempel
            ulang daftar yang sudah diperbaiki. Kolom nomor yang dikosongkan tidak menghapus nomor
            yang sudah tersimpan.
          </p>

          <div className="mt-4 flex flex-wrap gap-2">
            <ActionButton
              tone="primary"
              onClick={() => void handleImport()}
              disabled={busy('guest-import') || importText.trim() === ''}
            >
              {busy('guest-import') ? 'Mengimpor…' : 'Impor sekarang'}
            </ActionButton>
            <ActionButton onClick={() => setImporting(false)} disabled={busy('guest-import')}>
              Batal
            </ActionButton>
          </div>
        </div>
      ) : null}

      {adding ? (
        <GuestForm
          initial={{ nama: '', slug: '', kategori: '', telepon: '' }}
          busy={busy('guest-new')}
          submitLabel="Tambah tamu"
          onSubmit={async (draft) => {
            const created = await run(
              'guest-new',
              () => postJson('/api/admin/content/guests', draft, csrfHeaders()),
              'Tamu ditambahkan.',
            );
            if (created !== null) setAdding(false);
          }}
          onCancel={() => setAdding(false)}
        />
      ) : null}

      {rows.length > 0 ? (
        <div className="mt-4">
          <TextField
            label="Cari tamu"
            value={query}
            onChange={setQuery}
            placeholder="Nama, slug, nomor, atau kategori"
          />

          <div className="mt-3 flex flex-wrap gap-2" role="group" aria-label="Saring menurut konfirmasi">
            {SARINGAN.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => setSaringan(item.id)}
                aria-pressed={saringan === item.id}
                className={[
                  'rounded-full px-3 py-1.5 text-xs font-semibold transition-colors',
                  saringan === item.id
                    ? 'bg-jade-700 text-cream'
                    : 'bg-jade-50 text-jade-800 hover:bg-jade-100',
                ].join(' ')}
              >
                {item.label}
              </button>
            ))}
          </div>
        </div>
      ) : null}

      <ul className="mt-4 space-y-3 pb-4">
        {rows.length === 0 && !adding ? (
          <li className="card px-5 py-8 text-center text-sm text-ink-muted">
            Belum ada tamu. Undangan tetap dapat dibuka lewat link umum tanpa sapaan nama.
          </li>
        ) : null}

        {rows.length > 0 && filtered.length === 0 ? (
          <li className="card px-5 py-8 text-center text-sm text-ink-muted">
            Tidak ada tamu yang cocok dengan saringan ini.
          </li>
        ) : null}

        {filtered.map((row) => (
          <li key={row.id}>
            <GuestCard
              row={row}
              link={`${siteUrl}/to/${row.slug}`}
              busy={busy(`guest-${row.id}`)}
              selected={selected.has(row.id)}
              selectable={whatsapp.settings.enabled && row.telepon !== ''}
              sendState={whatsapp.sendState[String(row.id)] ?? null}
              rsvp={rsvpBySlug[row.slug] ?? null}
              canSend={whatsapp.settings.enabled && row.telepon !== ''}
              onToggle={() => toggle(row.id)}
              onSend={async () => {
                await run(
                  `guest-${row.id}`,
                  () =>
                    postJson('/api/admin/whatsapp/send', { guestId: row.id }, csrfHeaders()),
                  `Undangan terkirim ke ${row.nama}.`,
                );
              }}
              onSave={async (draft) => {
                await run(
                  `guest-${row.id}`,
                  () => putJson(`/api/admin/content/guests/${row.id}`, draft, csrfHeaders()),
                  'Data tamu diperbarui.',
                );
              }}
              onDelete={async () => {
                await run(
                  `guest-${row.id}`,
                  () => deleteJson(`/api/admin/content/guests/${row.id}`, csrfHeaders()),
                  'Tamu dihapus.',
                );
              }}
            />
          </li>
        ))}
      </ul>
    </section>
  );
}

type Draft = { nama: string; slug: string; kategori: string; telepon: string };

function RsvpBadge({ rsvp }: { rsvp: GuestRsvpState | null }) {
  if (!rsvp) {
    return (
      <span className="rounded-full bg-jade-50 px-3 py-1 text-xs font-semibold text-ink-muted">
        Belum konfirmasi
      </span>
    );
  }

  const labels: Record<string, string> = {
    hadir: `Hadir · ${formatPax(rsvp.pax)}`,
    tidak_hadir: 'Tidak hadir',
    ragu: 'Masih ragu',
  };

  const tones: Record<string, string> = {
    hadir: 'bg-success/12 text-success',
    tidak_hadir: 'bg-danger/10 text-danger',
    ragu: 'bg-gold-300/30 text-gold-600',
  };

  return (
    <span className={`rounded-full px-3 py-1 text-xs font-semibold ${tones[rsvp.status] ?? ''}`}>
      {labels[rsvp.status] ?? rsvp.status}
    </span>
  );
}

function SendBadge({ state }: { state: GuestSendState | null }) {
  if (!state) return null;

  const labels: Record<string, string> = {
    pending: 'Dalam antrean',
    sent: 'Undangan terkirim',
    failed: 'Gagal terkirim',
    cancelled: 'Dibatalkan',
  };

  const tones: Record<string, string> = {
    pending: 'bg-gold-300/30 text-gold-600',
    sent: 'bg-success/12 text-success',
    failed: 'bg-danger/10 text-danger',
    cancelled: 'bg-jade-100 text-ink-muted',
  };

  return (
    <span className={`rounded-full px-3 py-1 text-xs font-semibold ${tones[state.status] ?? ''}`}>
      {labels[state.status] ?? state.status}
    </span>
  );
}

function GuestCard({
  row,
  link,
  busy,
  selected,
  selectable,
  sendState,
  rsvp,
  canSend,
  onToggle,
  onSend,
  onSave,
  onDelete,
}: {
  row: GuestRow;
  link: string;
  busy: boolean;
  selected: boolean;
  selectable: boolean;
  sendState: GuestSendState | null;
  rsvp: GuestRsvpState | null;
  canSend: boolean;
  onToggle: () => void;
  onSend: () => Promise<void>;
  onSave: (draft: Draft) => Promise<void>;
  onDelete: () => Promise<void>;
}) {
  const [editing, setEditing] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  if (editing) {
    return (
      <GuestForm
        initial={{
          nama: row.nama,
          slug: row.slug,
          kategori: row.kategori,
          telepon: row.telepon,
        }}
        busy={busy}
        submitLabel="Simpan"
        showSlugWarning
        onSubmit={async (draft) => {
          await onSave(draft);
          setEditing(false);
        }}
        onCancel={() => setEditing(false)}
      />
    );
  }

  return (
    <div className="card px-5 py-4">
      <div className="flex flex-wrap items-start gap-3">
        {selectable ? (
          <input
            type="checkbox"
            checked={selected}
            onChange={onToggle}
            className="mt-1 h-5 w-5 shrink-0 accent-jade-700"
            aria-label={`Pilih ${row.nama} untuk pengiriman massal`}
          />
        ) : null}

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <p className="font-semibold text-ink break-words">{row.nama}</p>
            <RsvpBadge rsvp={rsvp} />
            <SendBadge state={sendState} />
          </div>

          <p className="text-xs text-ink-muted break-all">
            {row.kategori ? `${row.kategori} · ` : ''}
            {row.telepon ? formatPhone(row.telepon) : 'tanpa nomor WhatsApp'}
          </p>
          <p className="text-xs text-ink-muted break-all">{link}</p>

          {rsvp?.message ? (
            <p className="mt-1 text-xs text-ink-soft break-words italic">“{rsvp.message}”</p>
          ) : null}

          {sendState?.status === 'failed' && sendState.lastError ? (
            <p className="mt-1 text-xs text-danger break-words">{sendState.lastError}</p>
          ) : null}
        </div>

        <div className="flex flex-wrap gap-2">
          <CopyButton value={link} label="Salin link" />

          {canSend ? (
            <ActionButton onClick={() => void onSend()} disabled={busy}>
              {busy ? 'Mengirim…' : sendState?.status === 'sent' ? 'Kirim ulang' : 'Kirim undangan'}
            </ActionButton>
          ) : null}

          <ActionButton onClick={() => setEditing(true)} disabled={busy}>
            Ubah
          </ActionButton>

          {confirmingDelete ? (
            <>
              <ActionButton tone="danger" onClick={() => void onDelete()} disabled={busy}>
                Ya, hapus
              </ActionButton>
              <ActionButton onClick={() => setConfirmingDelete(false)} disabled={busy}>
                Batal
              </ActionButton>
            </>
          ) : (
            <ActionButton tone="danger" onClick={() => setConfirmingDelete(true)} disabled={busy}>
              Hapus
            </ActionButton>
          )}
        </div>
      </div>
    </div>
  );
}

function GuestForm({
  initial,
  busy,
  submitLabel,
  showSlugWarning,
  onSubmit,
  onCancel,
}: {
  initial: Draft;
  busy: boolean;
  submitLabel: string;
  showSlugWarning?: boolean;
  onSubmit: (draft: Draft) => Promise<void>;
  onCancel: () => void;
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
      <div className="grid gap-4 sm:grid-cols-2">
        <TextField
          label="Nama tamu"
          value={draft.nama}
          disabled={busy}
          onChange={(value) => set('nama', value)}
          hint="Ditulis apa adanya di sapaan, mis. “Keluarga Bapak Ahmad”."
        />
        <TextField
          label="Nomor WhatsApp"
          value={draft.telepon}
          placeholder="0812-3456-7890"
          disabled={busy}
          onChange={(value) => set('telepon', value)}
          hint="Boleh ditulis 0812…, +62 812…, atau 62812… — semuanya dirapikan otomatis."
        />
        <TextField
          label="Kategori"
          value={draft.kategori}
          placeholder="Teman Kantor"
          disabled={busy}
          onChange={(value) => set('kategori', value)}
        />
        <TextField
          label="Slug link"
          value={draft.slug}
          disabled={busy}
          onChange={(value) => set('slug', value)}
          hint={
            showSlugWarning
              ? 'Mengubah slug memutus link yang sudah terlanjur disebar ke tamu ini.'
              : 'Kosongkan agar dibuatkan otomatis dari nama.'
          }
        />
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        <ActionButton tone="primary" type="submit" disabled={busy}>
          {busy ? 'Menyimpan…' : submitLabel}
        </ActionButton>
        <ActionButton onClick={onCancel} disabled={busy}>
          Batal
        </ActionButton>
      </div>
    </form>
  );
}

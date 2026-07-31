'use client';

import { useState } from 'react';
import { deleteJson, patchJson, postJson, putJson } from '@/lib/client-api';
import type { GalleryRow } from '@/lib/db/content';
import { ImageField } from './ImageField';
import {
  ActionButton,
  NoticeBar,
  PanelHeading,
  TextField,
  Toggle,
  csrfHeaders,
  useAdminAction,
} from './ui';

/**
 * Galeri foto. Urutan diatur dengan tombol naik/turun, bukan seret-lepas:
 * tombol dapat dijangkau papan ketik dan pembaca layar, dan tetap bekerja di
 * layar sentuh sempit tempat seret-lepas justru bertabrakan dengan gulir
 * halaman.
 */
export function GalleryPanel({ rows }: { rows: GalleryRow[] }) {
  const { run, notice, busy, anyBusy } = useAdminAction();
  const [newUrl, setNewUrl] = useState('');

  async function add(url: string): Promise<void> {
    const created = await run(
      'gallery-new',
      () => postJson('/api/admin/content/gallery', { url, caption: '', tampil: true }, csrfHeaders()),
      'Foto ditambahkan ke galeri.',
    );

    if (created !== null) setNewUrl('');
  }

  async function move(index: number, direction: -1 | 1): Promise<void> {
    const target = index + direction;
    if (target < 0 || target >= rows.length) return;

    const ids = rows.map((row) => row.id);
    const moved = ids[index];
    const swapped = ids[target];
    if (moved === undefined || swapped === undefined) return;

    ids[index] = swapped;
    ids[target] = moved;

    await run('gallery-order', () =>
      patchJson('/api/admin/content/gallery', { ids }, csrfHeaders()),
    );
  }

  return (
    <section aria-label="Galeri foto">
      <PanelHeading
        title={`Galeri (${rows.length})`}
        description="Foto tampil di halaman undangan sesuai urutan di bawah ini."
      />

      <NoticeBar notice={notice} />

      <div className="card mt-4 px-5 py-5">
        <ImageField
          label="Tambah foto"
          value={newUrl}
          disabled={busy('gallery-new')}
          onChange={setNewUrl}
          // Berkas yang baru diunggah langsung masuk galeri: menuntut satu klik
          // "Tambah" lagi hanya menyisakan pekerjaan tanpa guna. URL yang
          // diketik manual tetap menunggu tombol, karena tidak ada cara tahu
          // kapan orang selesai mengetik.
          onUploaded={(url) => void add(url)}
          hint="Unggah berkas, atau tempel URL gambar lalu tekan Tambah."
        />

        <div className="mt-3">
          <ActionButton
            tone="primary"
            onClick={() => void add(newUrl)}
            disabled={busy('gallery-new') || newUrl.trim() === ''}
          >
            {busy('gallery-new') ? 'Menambahkan…' : 'Tambah ke galeri'}
          </ActionButton>
        </div>
      </div>

      <ul className="mt-4 space-y-3">
        {rows.length === 0 ? (
          <li className="card px-5 py-8 text-center text-sm text-ink-muted">
            Belum ada foto. Bagian galeri otomatis disembunyikan dari halaman undangan.
          </li>
        ) : null}

        {rows.map((row, index) => (
          <li key={row.id}>
            <GalleryCard
              row={row}
              busy={busy(`gallery-${row.id}`) || anyBusy}
              isFirst={index === 0}
              isLast={index === rows.length - 1}
              onMoveUp={() => void move(index, -1)}
              onMoveDown={() => void move(index, 1)}
              onSave={async (draft) => {
                await run(
                  `gallery-${row.id}`,
                  () => putJson(`/api/admin/content/gallery/${row.id}`, draft, csrfHeaders()),
                  'Foto diperbarui.',
                );
              }}
              onDelete={async () => {
                await run(
                  `gallery-${row.id}`,
                  () => deleteJson(`/api/admin/content/gallery/${row.id}`, csrfHeaders()),
                  'Foto dikeluarkan dari galeri.',
                );
              }}
            />
          </li>
        ))}
      </ul>
    </section>
  );
}

type Draft = { url: string; caption: string; tampil: boolean };

function GalleryCard({
  row,
  busy,
  isFirst,
  isLast,
  onMoveUp,
  onMoveDown,
  onSave,
  onDelete,
}: {
  row: GalleryRow;
  busy: boolean;
  isFirst: boolean;
  isLast: boolean;
  onMoveUp: () => void;
  onMoveDown: () => void;
  onSave: (draft: Draft) => Promise<void>;
  onDelete: () => Promise<void>;
}) {
  const [draft, setDraft] = useState<Draft>({
    url: row.url,
    caption: row.caption,
    tampil: row.tampil,
  });

  return (
    <div className="card px-5 py-4">
      <div className="flex flex-wrap gap-4">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={row.url}
          alt=""
          className="h-24 w-24 shrink-0 rounded-lg border border-jade-100 object-cover"
          loading="lazy"
        />

        <div className="min-w-[16rem] flex-1 space-y-3">
          <TextField
            label="Keterangan"
            value={draft.caption}
            disabled={busy}
            onChange={(value) => setDraft((current) => ({ ...current, caption: value }))}
          />
          <TextField
            label="Alamat gambar"
            value={draft.url}
            disabled={busy}
            onChange={(value) => setDraft((current) => ({ ...current, url: value }))}
          />
          <Toggle
            label="Tampilkan foto ini"
            checked={draft.tampil}
            disabled={busy}
            onChange={(value) => setDraft((current) => ({ ...current, tampil: value }))}
          />
        </div>
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        <ActionButton tone="primary" onClick={() => void onSave(draft)} disabled={busy}>
          Simpan
        </ActionButton>
        <ActionButton onClick={onMoveUp} disabled={busy || isFirst}>
          ↑ Naik
        </ActionButton>
        <ActionButton onClick={onMoveDown} disabled={busy || isLast}>
          ↓ Turun
        </ActionButton>
        <ActionButton tone="danger" onClick={() => void onDelete()} disabled={busy}>
          Hapus
        </ActionButton>
      </div>
    </div>
  );
}

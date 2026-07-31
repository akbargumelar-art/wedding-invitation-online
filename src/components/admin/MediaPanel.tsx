'use client';

import { useState } from 'react';
import { deleteJson } from '@/lib/client-api';
import { CopyButton } from '@/components/ui/CopyButton';
import type { MediaRow } from '@/lib/db/content';
import { ImageField } from './ImageField';
import {
  ActionButton,
  NoticeBar,
  PanelHeading,
  csrfHeaders,
  useAdminAction,
} from './ui';

/**
 * Berkas gambar yang tersimpan di server.
 *
 * Panel ini bukan syarat untuk memakai gambar — setiap isian gambar sudah punya
 * tombol unggah sendiri. Gunanya adalah melihat apa saja yang sudah menumpuk di
 * disk dan membersihkan yang tidak terpakai, sesuatu yang tidak terlihat di
 * mana pun kalau tidak ada halamannya.
 */
export function MediaPanel({ rows }: { rows: MediaRow[] }) {
  const { run, notice, busy } = useAdminAction();
  const [uploadUrl, setUploadUrl] = useState('');

  const totalBytes = rows.reduce((sum, row) => sum + row.bytes, 0);

  return (
    <section aria-label="Berkas media">
      <PanelHeading
        title={`Media (${rows.length})`}
        description={`Total ${formatBytes(totalBytes)} terpakai di server.`}
      />

      <NoticeBar notice={notice} />

      <div className="card mt-4 px-5 py-5">
        <ImageField
          label="Unggah gambar baru"
          value={uploadUrl}
          onChange={setUploadUrl}
          hint="Setelah terunggah, salin alamatnya untuk dipakai di isian mana pun."
        />
      </div>

      <ul className="mt-4 grid gap-3 pb-4 sm:grid-cols-2">
        {rows.length === 0 ? (
          <li className="card px-5 py-8 text-center text-sm text-ink-muted sm:col-span-2">
            Belum ada berkas yang diunggah.
          </li>
        ) : null}

        {rows.map((row) => (
          <li key={row.fileName} className="card flex gap-4 px-5 py-4">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={`/media/${row.fileName}`}
              alt=""
              className="h-20 w-20 shrink-0 rounded-lg border border-jade-100 object-cover"
              loading="lazy"
            />

            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold text-ink">{row.label || row.fileName}</p>
              <p className="text-xs text-ink-muted">
                {row.kind.toUpperCase()} · {formatBytes(row.bytes)} · {row.createdAt}
              </p>

              <div className="mt-3 flex flex-wrap gap-2">
                <CopyButton value={`/media/${row.fileName}`} label="Salin alamat" />
                <ActionButton
                  tone="danger"
                  disabled={busy(row.fileName)}
                  onClick={() =>
                    void run(
                      row.fileName,
                      () => deleteJson(`/api/admin/media/${row.fileName}`, csrfHeaders()),
                      'Berkas dihapus.',
                    )
                  }
                >
                  Hapus
                </ActionButton>
              </div>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

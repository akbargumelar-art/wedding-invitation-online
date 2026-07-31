'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { postJson } from '@/lib/client-api';
import type { AdminData } from '@/lib/admin-data';
import { AccountsPanel } from './AccountsPanel';
import { ConfigPanel } from './ConfigPanel';
import { GalleryPanel } from './GalleryPanel';
import { GuestsPanel } from './GuestsPanel';
import { MediaPanel } from './MediaPanel';
import { EnvelopesPanel, WishesPanel } from './ModerationPanel';
import { SchedulePanel } from './SchedulePanel';
import { SummaryPanel } from './SummaryPanel';
import { WhatsappPanel } from './WhatsappPanel';

/**
 * Dashboard admin (US-15).
 *
 * Sejak v2 dashboard ini bukan sekadar jendela pemantau: seluruh isi undangan
 * disunting di sini, dan Google Sheet sudah tidak dipakai sama sekali.
 *
 * Semua data awal dirender di server, dan setiap aksi memanggil API lalu memicu
 * `router.refresh()`. Konsekuensinya disengaja: yang tampil setelah menyimpan
 * selalu berasal dari database, bukan dari salinan state di klien, sehingga
 * tidak mungkin ada layar yang memperlihatkan perubahan yang sebenarnya gagal
 * tersimpan.
 */

const TABS = [
  { id: 'ringkasan', label: 'Ringkasan' },
  { id: 'pengaturan', label: 'Pengaturan' },
  { id: 'jadwal', label: 'Jadwal' },
  { id: 'galeri', label: 'Galeri' },
  { id: 'rekening', label: 'Rekening' },
  { id: 'tamu', label: 'Tamu' },
  { id: 'whatsapp', label: 'WhatsApp' },
  { id: 'media', label: 'Media' },
  { id: 'ucapan', label: 'Ucapan' },
  { id: 'amplop', label: 'Amplop' },
] as const;

type TabId = (typeof TABS)[number]['id'];

export function AdminDashboard({ data, username }: { data: AdminData; username: string }) {
  const router = useRouter();
  const [tab, setTab] = useState<TabId>('ringkasan');

  const { summary, content, whatsapp, wishRows, envelopeRows } = data;

  async function handleLogout() {
    await postJson('/api/admin/logout', {});
    router.replace('/admin/login');
    router.refresh();
  }

  const pendingCount = summary.wishes.pending + summary.envelopes.pending;

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

      {content.config.isDraft ? (
        <p role="status" className="mt-6 rounded-lg bg-gold-300/25 px-4 py-3 text-sm text-ink">
          Undangan masih berstatus <strong>draf</strong>: setiap halaman menampilkan penanda draf
          kepada siapa pun yang membukanya. Matikan sakelar “Masih draf” di tab Pengaturan sebelum
          menyebarkan link.
        </p>
      ) : null}

      {summary.notifications.failed > 0 ? (
        <p role="status" className="mt-4 rounded-lg bg-danger/10 px-4 py-3 text-sm text-danger">
          <strong>{summary.notifications.failed}</strong> notifikasi WhatsApp gagal terkirim setelah
          semua percobaan ulang. Periksa kredensial gateway dan log server
          (<code className="font-mono">journalctl -u walimah</code>). Data tamunya sendiri tetap
          tersimpan lengkap di dashboard ini.
        </p>
      ) : null}

      {summary.contentWarnings.length > 0 ? (
        <div role="status" className="mt-4 rounded-lg bg-gold-300/25 px-4 py-3 text-sm text-ink">
          <p>
            <strong>{summary.contentWarnings.length}</strong> baris isi undangan dilewati karena
            datanya belum lengkap:
          </p>
          <ul className="mt-2 list-disc space-y-1 pl-5">
            {summary.contentWarnings.slice(0, 5).map((warning) => (
              <li key={warning}>{warning}</li>
            ))}
          </ul>
        </div>
      ) : null}

      {/* ---------------------------------------------------------------- Tab */}
      <div className="mt-6 overflow-x-auto">
        <div role="tablist" aria-label="Bagian dashboard" className="flex min-w-max gap-1 border-b border-jade-100">
          {TABS.map((item) => {
            const active = tab === item.id;
            const badge = item.id === 'ucapan' ? summary.wishes.pending : item.id === 'amplop' ? summary.envelopes.pending : 0;

            return (
              <button
                key={item.id}
                type="button"
                role="tab"
                id={`tab-${item.id}`}
                aria-selected={active}
                aria-controls={`panel-${item.id}`}
                onClick={() => setTab(item.id)}
                className={[
                  'shrink-0 whitespace-nowrap rounded-t-lg px-4 py-2.5 text-sm font-semibold transition-colors',
                  active
                    ? 'bg-parchment text-jade-900 shadow-[inset_0_-2px_0_var(--color-jade-600)]'
                    : 'text-ink-muted hover:bg-jade-50 hover:text-jade-800',
                ].join(' ')}
              >
                {item.label}
                {badge > 0 ? (
                  <span className="ml-2 rounded-full bg-gold-300/40 px-2 py-0.5 text-xs text-gold-600">
                    {badge}
                  </span>
                ) : null}
              </button>
            );
          })}
        </div>
      </div>

      <div id={`panel-${tab}`} role="tabpanel" aria-labelledby={`tab-${tab}`} className="mt-6">
        {tab === 'ringkasan' ? (
          <>
            <SummaryPanel summary={summary} />
            {pendingCount > 0 ? (
              <p className="mt-6 text-sm text-ink-muted">
                Ada {pendingCount} kiriman menunggu tinjauan di tab Ucapan dan Amplop.
              </p>
            ) : null}
          </>
        ) : null}

        {/*
          Tiap panel dirender bersyarat, jadi berpindah tab membongkar
          komponennya. Itu disengaja: kembali ke sebuah tab selalu memuat ulang
          isian dari data server terbaru, bukan dari state yang mungkin sudah
          basi sejak kunjungan sebelumnya.
        */}
        {tab === 'pengaturan' ? <ConfigPanel config={content.config} /> : null}

        {tab === 'jadwal' ? <SchedulePanel rows={content.schedule} /> : null}
        {tab === 'galeri' ? <GalleryPanel rows={content.gallery} /> : null}
        {tab === 'rekening' ? <AccountsPanel rows={content.accounts} /> : null}
        {tab === 'tamu' ? (
          <GuestsPanel rows={content.guests} siteUrl={content.siteUrl} whatsapp={whatsapp} />
        ) : null}
        {tab === 'whatsapp' ? <WhatsappPanel data={whatsapp} /> : null}
        {tab === 'media' ? <MediaPanel rows={content.media} /> : null}
        {tab === 'ucapan' ? <WishesPanel rows={wishRows} /> : null}
        {tab === 'amplop' ? <EnvelopesPanel rows={envelopeRows} /> : null}
      </div>
    </div>
  );
}

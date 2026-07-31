'use client';

import { useEffect, useState } from 'react';
import { deleteJson, getJson, postJson, putJson } from '@/lib/client-api';
import { CopyButton } from '@/components/ui/CopyButton';
import type { AdminWhatsapp } from '@/lib/admin-data';
import {
  ActionButton,
  FieldGroup,
  NoticeBar,
  PanelHeading,
  TextAreaField,
  TextField,
  Toggle,
  csrfHeaders,
  useAdminAction,
} from './ui';

/**
 * Pengaturan integrasi WhatsApp lewat WAHA, beserta pemantauan antrean kirim.
 *
 * Nilai rahasia (kunci API dan rahasia webhook) tidak pernah dikirim dari
 * server ke halaman ini — yang diketahui dashboard hanyalah apakah keduanya
 * sudah terisi. Karena itu kolomnya selalu tampil kosong, dan mengosongkannya
 * saat menyimpan berarti "biarkan seperti sebelumnya".
 */

type Draft = {
  enabled: boolean;
  baseUrl: string;
  session: string;
  apiKey: string;
  webhookSecret: string;
  invitationTemplate: string;
  autoReply: boolean;
  acceptReplies: boolean;
  minDelaySeconds: number;
  maxDelaySeconds: number;
  notifyRecipients: string;
  notifyEvents: string[];
};

const EVENT_LABELS: Array<{ id: string; label: string; hint: string }> = [
  { id: 'rsvp', label: 'Konfirmasi kehadiran', hint: 'Setiap tamu mengisi atau mengubah RSVP.' },
  { id: 'wish', label: 'Ucapan & doa', hint: 'Setiap ucapan baru masuk.' },
  { id: 'envelope', label: 'Konfirmasi amplop', hint: 'Setiap tamu menyatakan sudah mengirim tanda kasih.' },
  {
    id: 'visit',
    label: 'Undangan dibuka',
    hint: 'Sangat ramai — satu pesan tiap tamu membuka undangannya pertama kali.',
  },
];

type QueueState = AdminWhatsapp['outbox'];

export function WhatsappPanel({ data }: { data: AdminWhatsapp }) {
  const { run, notice, setNotice, busy } = useAdminAction();
  const { settings } = data;

  const [draft, setDraft] = useState<Draft>({
    enabled: settings.enabled,
    baseUrl: settings.baseUrl,
    session: settings.session,
    apiKey: '',
    webhookSecret: '',
    invitationTemplate: settings.invitationTemplate,
    autoReply: settings.autoReply,
    acceptReplies: settings.acceptReplies,
    minDelaySeconds: settings.minDelaySeconds,
    maxDelaySeconds: settings.maxDelaySeconds,
    notifyRecipients: settings.notifyRecipients.join('\n'),
    notifyEvents: settings.notifyEvents,
  });

  const [freshSecret, setFreshSecret] = useState('');
  const [queue, setQueue] = useState<QueueState>(data.outbox);

  const set = <K extends keyof Draft>(key: K, value: Draft[K]): void =>
    setDraft((current) => ({ ...current, [key]: value }));

  // Selama masih ada antrean, angka progresnya disegarkan berkala. Penyebaran
  // undangan berlangsung berjam-jam; tanpa ini admin harus memuat ulang halaman
  // hanya untuk tahu apakah prosesnya masih berjalan.
  useEffect(() => {
    if (queue.pending === 0) return;

    const timer = setInterval(() => {
      void getJson<{ summary: QueueState }>('/api/admin/whatsapp/queue').then((result) => {
        if (result.ok) setQueue(result.data.summary);
      });
    }, 5000);

    return () => clearInterval(timer);
  }, [queue.pending]);

  return (
    <section aria-label="Integrasi WhatsApp">
      <PanelHeading
        title="WhatsApp (WAHA)"
        description="Mengirim undangan dan menerima konfirmasi kehadiran, ucapan, serta konfirmasi transfer lewat WhatsApp."
        action={
          <ActionButton
            tone="primary"
            disabled={busy('waha-settings')}
            onClick={() =>
              void run(
                'waha-settings',
                () => putJson('/api/admin/whatsapp/settings', draft, csrfHeaders()),
                'Pengaturan WhatsApp tersimpan.',
              ).then((result) => {
                // Kolom rahasia dikosongkan lagi setelah tersimpan, supaya
                // nilainya tidak tertinggal di DOM sampai halaman ditutup.
                if (result) setDraft((current) => ({ ...current, apiKey: '', webhookSecret: '' }));
              })
            }
          >
            {busy('waha-settings') ? 'Menyimpan…' : 'Simpan pengaturan'}
          </ActionButton>
        }
      />

      <NoticeBar notice={notice} />

      <FieldGroup title="Sambungan ke server WAHA" columns={1}>
        <Toggle
          label="Aktifkan integrasi WhatsApp"
          checked={draft.enabled}
          disabled={busy('waha-settings')}
          onChange={(value) => set('enabled', value)}
          hint="Selama nonaktif, tidak ada pesan yang dikirim maupun diproses."
        />

        <div className="grid gap-4 sm:grid-cols-2">
          <TextField
            label="Alamat server WAHA"
            value={draft.baseUrl}
            placeholder="http://127.0.0.1:3000"
            disabled={busy('waha-settings')}
            onChange={(value) => set('baseUrl', value)}
            hint="Tanpa /api di belakang."
          />
          <TextField
            label="Nama sesi"
            value={draft.session}
            placeholder="default"
            disabled={busy('waha-settings')}
            onChange={(value) => set('session', value)}
            hint="Sesuai nama sesi NOWEB yang aktif di WAHA."
          />
        </div>

        <TextField
          label="Kunci API (X-Api-Key)"
          value={draft.apiKey}
          placeholder={settings.hasApiKey ? '•••••••• (sudah terisi)' : 'Kosongkan bila WAHA tanpa kunci'}
          disabled={busy('waha-settings')}
          onChange={(value) => set('apiKey', value)}
          hint="Biarkan kosong untuk mempertahankan kunci yang sudah tersimpan."
        />

        <div>
          <ActionButton
            disabled={busy('waha-test')}
            onClick={() =>
              void run('waha-test', () =>
                postJson<{ connected: boolean; message: string }>(
                  '/api/admin/whatsapp/test',
                  {},
                  csrfHeaders(),
                ),
              ).then((result) => {
                if (result) {
                  setNotice({ tone: result.connected ? 'ok' : 'error', text: result.message });
                }
              })
            }
          >
            {busy('waha-test') ? 'Memeriksa…' : 'Tes koneksi'}
          </ActionButton>
          <p className="field-hint">
            Simpan pengaturan lebih dulu — tes memakai nilai yang sudah tersimpan, bukan isian di
            layar.
          </p>
        </div>
      </FieldGroup>

      <FieldGroup title="Webhook — menerima balasan tamu" columns={1}>
        <Toggle
          label="Terima konfirmasi lewat balasan WhatsApp"
          checked={draft.acceptReplies}
          disabled={busy('waha-settings')}
          onChange={(value) => set('acceptReplies', value)}
          hint="Balasan tamu dicatat sebagai RSVP, ucapan, atau konfirmasi tanda kasih."
        />
        <Toggle
          label="Balas otomatis"
          checked={draft.autoReply}
          disabled={busy('waha-settings')}
          onChange={(value) => set('autoReply', value)}
          hint="Mengirim konfirmasi singkat, dan petunjuk bila pesan tamu tidak dikenali."
        />

        <div>
          <p className="field-label">Alamat webhook</p>
          <div className="flex flex-wrap items-center gap-2">
            <code className="min-w-0 flex-1 rounded-lg bg-jade-50 px-3 py-2 font-mono text-xs break-all text-ink-soft">
              {data.webhookUrl}
            </code>
            <CopyButton value={data.webhookUrl} label="Salin" />
          </div>
          <p className="field-hint">
            Pasang alamat ini di konfigurasi webhook WAHA untuk event <strong>message</strong>.
          </p>
        </div>

        <div>
          <p className="field-label">Rahasia HMAC webhook</p>
          <p className="field-hint mb-2">
            Wajib diisi: tanpa rahasia ini seluruh pesan masuk ditolak, karena alamat webhook di
            atas dapat diakses siapa pun yang mengetahuinya. Di WAHA, isikan nilai yang sama pada{' '}
            <code className="font-mono">hmac.key</code> dengan algoritma{' '}
            <code className="font-mono">sha512</code>.
          </p>

          <div className="flex flex-wrap gap-2">
            <ActionButton
              disabled={busy('waha-secret')}
              onClick={() =>
                void run('waha-secret', () =>
                  postJson<{ secret: string }>('/api/admin/whatsapp/secret', {}, csrfHeaders()),
                ).then((result) => {
                  if (result) {
                    setFreshSecret(result.secret);
                    setNotice({
                      tone: 'ok',
                      text: 'Rahasia baru dibuat. Salin sekarang — nilainya tidak ditampilkan lagi.',
                    });
                  }
                })
              }
            >
              {settings.hasWebhookSecret ? 'Buat rahasia baru' : 'Buat rahasia'}
            </ActionButton>

            {settings.hasWebhookSecret && !freshSecret ? (
              <span className="self-center text-sm text-ink-muted">Sudah terisi.</span>
            ) : null}
          </div>

          {freshSecret ? (
            <div className="mt-3 rounded-lg bg-gold-300/25 px-4 py-3">
              <p className="text-sm text-ink">
                Salin sekarang dan pasang di WAHA. Nilai ini tidak akan ditampilkan lagi.
              </p>
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <code className="min-w-0 flex-1 font-mono text-xs break-all text-ink-soft">
                  {freshSecret}
                </code>
                <CopyButton value={freshSecret} label="Salin rahasia" />
              </div>
            </div>
          ) : null}
        </div>
      </FieldGroup>

      <FieldGroup title="Pesan undangan" columns={1}>
        <TextAreaField
          label="Templat pesan"
          value={draft.invitationTemplate}
          rows={14}
          disabled={busy('waha-settings')}
          onChange={(value) => set('invitationTemplate', value)}
          hint="Penanda yang tersedia: {nama}, {link}, {mempelai}, {tanggal}, {lokasi}."
        />
      </FieldGroup>

      <FieldGroup
        title="Jeda pengiriman massal"
        description="Jeda acak antar-undangan. WhatsApp memblokir nomor yang mengirim beruntun ke banyak tujuan, dan nomor yang diblokir di tengah penyebaran undangan tidak dapat dipulihkan tepat waktu."
      >
        <TextField
          label="Jeda minimum (detik)"
          value={String(draft.minDelaySeconds)}
          disabled={busy('waha-settings')}
          onChange={(value) => set('minDelaySeconds', Number.parseInt(value, 10) || 0)}
        />
        <TextField
          label="Jeda maksimum (detik)"
          value={String(draft.maxDelaySeconds)}
          disabled={busy('waha-settings')}
          onChange={(value) => set('maxDelaySeconds', Number.parseInt(value, 10) || 0)}
        />
      </FieldGroup>

      <FieldGroup
        title="Notifikasi ke mempelai"
        description="Pemberitahuan yang dikirim ke nomor Anda sendiri saat tamu mengisi undangan. Memakai sambungan WAHA yang sama dengan pengiriman undangan."
        columns={1}
      >
        <TextAreaField
          label="Nomor penerima notifikasi"
          value={draft.notifyRecipients}
          rows={3}
          disabled={busy('waha-settings')}
          onChange={(value) => set('notifyRecipients', value)}
          placeholder={'081234567890\n081298765432'}
          hint="Satu nomor per baris, atau dipisah koma. Bentuk apa pun diterima — dirapikan otomatis. Kosongkan untuk mematikan notifikasi."
        />

        <div>
          <p className="field-label">Kirim pemberitahuan untuk</p>
          <div className="mt-2 space-y-3">
            {EVENT_LABELS.map((event) => (
              <Toggle
                key={event.id}
                label={event.label}
                checked={draft.notifyEvents.includes(event.id)}
                disabled={busy('waha-settings')}
                hint={event.hint}
                onChange={(checked) =>
                  set(
                    'notifyEvents',
                    checked
                      ? [...draft.notifyEvents, event.id]
                      : draft.notifyEvents.filter((id) => id !== event.id),
                  )
                }
              />
            ))}
          </div>
        </div>

        <div>
          <ActionButton
            disabled={busy('waha-test-notify')}
            onClick={() =>
              void run('waha-test-notify', () =>
                postJson<{ sent: number; message: string }>(
                  '/api/admin/whatsapp/test-notify',
                  {},
                  csrfHeaders(),
                ),
              ).then((result) => {
                if (result) {
                  setNotice({ tone: result.sent > 0 ? 'ok' : 'error', text: result.message });
                }
              })
            }
          >
            {busy('waha-test-notify') ? 'Mengirim…' : 'Kirim notifikasi uji'}
          </ActionButton>
          <p className="field-hint">
            Simpan pengaturan lebih dulu. Tes koneksi hanya memastikan server WAHA menjawab; ini
            membuktikan pesannya benar-benar sampai ke nomor Anda.
          </p>
        </div>
      </FieldGroup>

      <QueueCard
        queue={queue}
        busy={busy}
        onCancel={() =>
          void run(
            'waha-cancel',
            () => deleteJson<{ summary: QueueState }>('/api/admin/whatsapp/queue', csrfHeaders()),
            'Sisa antrean dibatalkan.',
          ).then((result) => {
            if (result) setQueue(result.summary);
          })
        }
        onRequeue={() =>
          void run(
            'waha-requeue',
            () =>
              postJson<{ summary: QueueState }>('/api/admin/whatsapp/queue', {}, csrfHeaders()),
            'Pengiriman yang gagal dikembalikan ke antrean.',
          ).then((result) => {
            if (result) setQueue(result.summary);
          })
        }
      />
    </section>
  );
}

function QueueCard({
  queue,
  busy,
  onCancel,
  onRequeue,
}: {
  queue: QueueState;
  busy: (key: string) => boolean;
  onCancel: () => void;
  onRequeue: () => void;
}) {
  return (
    <section className="card mt-4 px-5 py-5" aria-label="Antrean pengiriman">
      <h3 className="font-display text-lg text-jade-900">Antrean pengiriman</h3>

      <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <QueueStat label="Menunggu" value={queue.pending} />
        <QueueStat label="Terkirim" value={queue.sent} tone="success" />
        <QueueStat label="Gagal" value={queue.failed} tone="danger" />
        <QueueStat label="Dibatalkan" value={queue.cancelled} />
      </div>

      {queue.pending > 0 ? (
        <p className="mt-3 text-sm text-ink-muted">
          Pengiriman sedang berjalan di latar belakang. Menutup halaman ini tidak
          menghentikannya.
        </p>
      ) : null}

      <div className="mt-4 flex flex-wrap gap-2">
        <ActionButton
          tone="danger"
          onClick={onCancel}
          disabled={busy('waha-cancel') || queue.pending === 0}
        >
          Batalkan sisa antrean
        </ActionButton>
        <ActionButton onClick={onRequeue} disabled={busy('waha-requeue') || queue.failed === 0}>
          Coba lagi yang gagal
        </ActionButton>
      </div>
    </section>
  );
}

function QueueStat({
  label,
  value,
  tone = 'default',
}: {
  label: string;
  value: number;
  tone?: 'default' | 'success' | 'danger';
}) {
  const valueClass =
    tone === 'success' ? 'text-success' : tone === 'danger' ? 'text-danger' : 'text-jade-900';

  return (
    <div role="group" aria-label={label}>
      <p className="text-xs text-ink-muted">{label}</p>
      <p className={`numeric mt-1 font-display text-2xl ${valueClass}`}>{value}</p>
    </div>
  );
}

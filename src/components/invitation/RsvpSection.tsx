'use client';

import { useEffect, useId, useState } from 'react';
import { Reveal } from '@/components/ui/Reveal';
import { FormStatus, PrivacyNote } from '@/components/ui/FormStatus';
import { SectionHeading } from './SectionHeading';
import { getJson, postJson } from '@/lib/client-api';
import {
  fieldErrors,
  formatPax,
  PAX_OPTIONS,
  PAX_OVER,
  rsvpSchema,
  type RSVP_STATUSES,
} from '@/lib/validation';

type Status = (typeof RSVP_STATUSES)[number];

type SavedRsvp = { name: string; status: Status; pax: number; message: string | null };

const STATUS_OPTIONS: Array<{ value: Status; label: string; hint: string }> = [
  { value: 'hadir', label: 'Hadir', hint: 'Insya Allah saya datang' },
  { value: 'tidak_hadir', label: 'Tidak Hadir', hint: 'Mohon maaf berhalangan' },
  { value: 'ragu', label: 'Masih Ragu', hint: 'Belum bisa memastikan' },
];

/**
 * Form konfirmasi kehadiran (US-10).
 *
 * Jawaban sebelumnya dimuat ulang dari server berdasarkan slug, sehingga tamu
 * yang membuka kembali link personalnya melihat jawabannya dan dapat mengubahnya
 * — pengiriman kedua adalah UPDATE, bukan baris baru.
 */
export function RsvpSection({
  slug,
  guestName,
  open,
  closedMessage,
}: {
  slug: string | null;
  guestName: string;
  open: boolean;
  closedMessage: string;
}) {
  const formId = useId();

  const [name, setName] = useState(guestName);
  const [status, setStatus] = useState<Status | ''>('');
  const [pax, setPax] = useState(1);
  const [message, setMessage] = useState('');

  const [saved, setSaved] = useState<SavedRsvp | null>(null);
  const [editing, setEditing] = useState(true);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [serverError, setServerError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  // Muat jawaban tersimpan untuk tamu ber-slug.
  useEffect(() => {
    if (!slug || !open) return;

    let cancelled = false;
    void getJson<{ rsvp: SavedRsvp | null }>(`/api/rsvp?slug=${encodeURIComponent(slug)}`).then(
      (result) => {
        if (cancelled || !result.ok || !result.data?.rsvp) return;

        const existing = result.data.rsvp;
        setSaved(existing);
        setEditing(false);
        setName(existing.name);
        setStatus(existing.status);
        setPax(existing.pax);
        setMessage(existing.message ?? '');
      },
    );

    return () => {
      cancelled = true;
    };
  }, [slug, open]);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setServerError('');

    const parsed = rsvpSchema.safeParse({ slug: slug ?? undefined, name, status, pax, message });
    if (!parsed.success) {
      setErrors(fieldErrors(parsed.error));
      return;
    }

    setErrors({});
    setSubmitting(true);

    const result = await postJson<{ rsvp: SavedRsvp }>('/api/rsvp', parsed.data);
    setSubmitting(false);

    if (!result.ok) {
      setServerError(result.message);
      return;
    }

    setSaved(result.data.rsvp);
    setEditing(false);
  }

  return (
    <section id="rsvp" className="section bg-jade-50">
      <div className="container-invite">
        <SectionHeading eyebrow="Konfirmasi Kehadiran" title="RSVP">
          <p className="text-sm">
            Mohon konfirmasi kehadiran Anda agar kami dapat menyiapkan tempat dan konsumsi dengan
            baik.
          </p>
        </SectionHeading>

        <Reveal className="mt-8">
          <div className="card px-6 py-7">
            {!open ? (
              <p className="text-center text-ink-soft">{closedMessage}</p>
            ) : saved && !editing ? (
              <SavedSummary saved={saved} onEdit={() => setEditing(true)} />
            ) : (
              <form onSubmit={handleSubmit} noValidate>
                <div>
                  <label htmlFor={`${formId}-name`} className="field-label">
                    Nama <span aria-hidden="true">*</span>
                  </label>
                  <input
                    id={`${formId}-name`}
                    name="name"
                    className="field-input"
                    value={name}
                    onChange={(event) => setName(event.target.value)}
                    maxLength={60}
                    required
                    autoComplete="name"
                    aria-invalid={Boolean(errors['name'])}
                    aria-describedby={errors['name'] ? `${formId}-name-error` : undefined}
                  />
                  {errors['name'] ? (
                    <p id={`${formId}-name-error`} className="field-error">
                      {errors['name']}
                    </p>
                  ) : null}
                </div>

                <fieldset className="mt-5">
                  <legend className="field-label">
                    Konfirmasi kehadiran <span aria-hidden="true">*</span>
                  </legend>
                  <div className="mt-1 grid gap-2">
                    {STATUS_OPTIONS.map((option) => (
                      <label
                        key={option.value}
                        className={[
                          'flex cursor-pointer items-start gap-3 rounded-xl border px-4 py-3 transition-colors',
                          status === option.value
                            ? 'border-jade-500 bg-jade-50'
                            : 'border-jade-200 bg-parchment',
                        ].join(' ')}
                      >
                        <input
                          type="radio"
                          name="status"
                          value={option.value}
                          checked={status === option.value}
                          onChange={() => setStatus(option.value)}
                          className="mt-1 h-4 w-4 accent-[var(--color-jade-700)]"
                        />
                        <span>
                          <span className="block font-semibold text-ink">{option.label}</span>
                          <span className="block text-sm text-ink-muted">{option.hint}</span>
                        </span>
                      </label>
                    ))}
                  </div>
                  {errors['status'] ? <p className="field-error">{errors['status']}</p> : null}
                </fieldset>

                {/* Jumlah orang hanya relevan bila tamu menyatakan hadir. */}
                <div className="mt-5">
                  <label htmlFor={`${formId}-pax`} className="field-label">
                    Jumlah orang yang hadir
                  </label>
                  <select
                    id={`${formId}-pax`}
                    name="pax"
                    className="field-input"
                    value={pax}
                    disabled={status !== 'hadir'}
                    onChange={(event) => setPax(Number(event.target.value))}
                  >
                    {PAX_OPTIONS.map((value) => (
                      <option key={value} value={value}>
                        {value === PAX_OVER ? 'Lebih dari 5 orang' : `${value} orang`}
                      </option>
                    ))}
                  </select>
                  <p className="field-hint">
                    {status === 'hadir'
                      ? 'Termasuk Anda sendiri.'
                      : 'Aktif setelah Anda memilih "Hadir".'}
                  </p>
                </div>

                <div className="mt-5">
                  <label htmlFor={`${formId}-message`} className="field-label">
                    Pesan singkat (opsional)
                  </label>
                  <textarea
                    id={`${formId}-message`}
                    name="message"
                    className="field-input"
                    rows={3}
                    maxLength={300}
                    value={message}
                    onChange={(event) => setMessage(event.target.value)}
                  />
                  <p className="field-hint">{message.length}/300 karakter</p>
                </div>

                {serverError ? <FormStatus tone="error">{serverError}</FormStatus> : null}

                <button type="submit" className="btn btn-primary mt-6 w-full" disabled={submitting}>
                  {submitting ? 'Menyimpan…' : saved ? 'Perbarui Jawaban' : 'Kirim Konfirmasi'}
                </button>

                <PrivacyNote />
              </form>
            )}
          </div>
        </Reveal>
      </div>
    </section>
  );
}

function SavedSummary({ saved, onEdit }: { saved: SavedRsvp; onEdit: () => void }) {
  const label = STATUS_OPTIONS.find((option) => option.value === saved.status)?.label ?? saved.status;

  return (
    <div className="text-center">
      <p className="text-2xl" aria-hidden="true">
        ✓
      </p>
      <FormStatus tone="success">Terima kasih, kehadiran Anda sudah tercatat.</FormStatus>

      <dl className="mt-5 space-y-2 text-left text-sm">
        <Row label="Nama" value={saved.name} />
        <Row label="Kehadiran" value={label} />
        {saved.status === 'hadir' ? (
          <Row label="Jumlah orang" value={formatPax(saved.pax)} />
        ) : null}
        {saved.message ? <Row label="Pesan" value={saved.message} /> : null}
      </dl>

      <button type="button" onClick={onEdit} className="btn btn-ghost mt-6 w-full">
        Ubah Jawaban
      </button>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex gap-3 border-b border-jade-100 pb-2">
      <dt className="w-28 shrink-0 text-ink-muted">{label}</dt>
      <dd className="flex-1 font-medium text-ink break-words">{value}</dd>
    </div>
  );
}

'use client';

import { useId, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { csrfToken, type ApiResult } from '@/lib/client-api';

/**
 * Potongan antarmuka yang dipakai berulang di seluruh dashboard.
 *
 * Semua panel pengaturan mengikuti pola yang sama: ubah isian di klien, kirim
 * ke API, lalu minta server merender ulang. State hasil TIDAK pernah disimpan
 * di klien — yang tampil setelah menyimpan selalu berasal dari database, jadi
 * tidak mungkin ada layar yang menampilkan perubahan yang sebenarnya gagal
 * tersimpan.
 */

export function csrfHeaders(): Record<string, string> {
  return { 'x-walimah-csrf': csrfToken() };
}

export type Notice = { tone: 'ok' | 'error'; text: string } | null;

export function useAdminAction() {
  const router = useRouter();
  const [refreshing, startTransition] = useTransition();
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [notice, setNotice] = useState<Notice>(null);

  async function run<T>(
    key: string,
    call: () => Promise<ApiResult<T>>,
    successText?: string,
  ): Promise<T | null> {
    setBusyKey(key);
    setNotice(null);

    const result = await call();
    setBusyKey(null);

    if (!result.ok) {
      setNotice({ tone: 'error', text: result.message });
      return null;
    }

    if (successText) setNotice({ tone: 'ok', text: successText });
    startTransition(() => router.refresh());
    return result.data;
  }

  return {
    run,
    notice,
    setNotice,
    /** True selama request berjalan maupun selama server merender ulang. */
    busy: (key: string): boolean => busyKey === key || refreshing,
    anyBusy: busyKey !== null || refreshing,
  };
}

export function NoticeBar({ notice }: { notice: Notice }) {
  if (!notice) return null;

  return (
    <p
      role="status"
      className={`mt-4 rounded-lg px-4 py-3 text-sm ${
        notice.tone === 'error' ? 'bg-danger/10 text-danger' : 'bg-jade-100 text-ink'
      }`}
    >
      {notice.text}
    </p>
  );
}

// -----------------------------------------------------------------------------
// Isian form
// -----------------------------------------------------------------------------

type FieldProps = {
  label: string;
  value: string;
  onChange: (value: string) => void;
  hint?: string;
  placeholder?: string;
  type?: 'text' | 'date' | 'time' | 'url';
  disabled?: boolean;
};

export function TextField({ label, value, onChange, hint, placeholder, type = 'text', disabled }: FieldProps) {
  const id = useId();

  return (
    <div>
      <label htmlFor={id} className="field-label">
        {label}
      </label>
      <input
        id={id}
        type={type}
        className="field-input"
        value={value}
        placeholder={placeholder}
        disabled={disabled}
        onChange={(event) => onChange(event.target.value)}
      />
      {hint ? <p className="field-hint">{hint}</p> : null}
    </div>
  );
}

export function TextAreaField({
  label,
  value,
  onChange,
  hint,
  rows = 3,
  placeholder,
  disabled,
}: FieldProps & { rows?: number }) {
  const id = useId();

  return (
    <div>
      <label htmlFor={id} className="field-label">
        {label}
      </label>
      <textarea
        id={id}
        rows={rows}
        className="field-input"
        style={{ minHeight: 'unset', lineHeight: 1.6 }}
        value={value}
        placeholder={placeholder}
        disabled={disabled}
        onChange={(event) => onChange(event.target.value)}
      />
      {hint ? <p className="field-hint">{hint}</p> : null}
    </div>
  );
}

export function SelectField({
  label,
  value,
  onChange,
  options,
  hint,
  disabled,
}: Omit<FieldProps, 'type' | 'placeholder'> & { options: Array<{ value: string; label: string }> }) {
  const id = useId();

  return (
    <div>
      <label htmlFor={id} className="field-label">
        {label}
      </label>
      <select
        id={id}
        className="field-input"
        value={value}
        disabled={disabled}
        onChange={(event) => onChange(event.target.value)}
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
      {hint ? <p className="field-hint">{hint}</p> : null}
    </div>
  );
}

export function Toggle({
  label,
  checked,
  onChange,
  hint,
  disabled,
}: {
  label: string;
  checked: boolean;
  onChange: (value: boolean) => void;
  hint?: string;
  disabled?: boolean;
}) {
  const id = useId();

  return (
    <div className="flex items-start gap-3">
      <input
        id={id}
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={(event) => onChange(event.target.checked)}
        className="mt-1 h-5 w-5 shrink-0 accent-jade-700"
      />
      <div className="min-w-0">
        <label htmlFor={id} className="field-label mb-0">
          {label}
        </label>
        {hint ? <p className="field-hint mt-1">{hint}</p> : null}
      </div>
    </div>
  );
}

// -----------------------------------------------------------------------------
// Tombol & penanda
// -----------------------------------------------------------------------------

export function ActionButton({
  children,
  onClick,
  disabled,
  tone = 'default',
  type = 'button',
}: {
  children: React.ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  tone?: 'default' | 'primary' | 'danger';
  type?: 'button' | 'submit';
}) {
  const className =
    tone === 'primary' ? 'btn btn-primary text-sm' : tone === 'danger' ? 'btn btn-ghost text-sm text-danger' : 'btn btn-ghost text-sm';

  return (
    <button type={type} onClick={onClick} disabled={disabled} className={className}>
      {children}
    </button>
  );
}

export function StatusBadge({ status }: { status: string }) {
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

export function Empty({ children }: { children: React.ReactNode }) {
  return <li className="card px-5 py-8 text-center text-sm text-ink-muted">{children}</li>;
}

export function PanelHeading({
  title,
  description,
  action,
}: {
  title: string;
  description?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div className="min-w-0">
        <h2 className="text-xl text-jade-900">{title}</h2>
        {description ? <p className="mt-1 text-sm text-ink-muted">{description}</p> : null}
      </div>
      {action}
    </div>
  );
}

/** Kelompok isian dalam satu form panjang, agar tidak jadi satu kolom tanpa jeda. */
export function FieldGroup({
  title,
  description,
  children,
  columns = 2,
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
  columns?: 1 | 2;
}) {
  return (
    <section className="card mt-4 px-5 py-5">
      <h3 className="font-display text-lg text-jade-900">{title}</h3>
      {description ? <p className="mt-1 text-sm text-ink-muted">{description}</p> : null}
      <div className={`mt-4 grid gap-4 ${columns === 2 ? 'sm:grid-cols-2' : ''}`}>{children}</div>
    </section>
  );
}

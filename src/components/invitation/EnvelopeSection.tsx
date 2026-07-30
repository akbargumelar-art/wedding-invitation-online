'use client';

import Image from 'next/image';
import { useId, useRef, useState } from 'react';
import { Reveal } from '@/components/ui/Reveal';
import { CopyButton } from '@/components/ui/CopyButton';
import { FormStatus, PrivacyNote } from '@/components/ui/FormStatus';
import { SectionHeading } from './SectionHeading';
import { ArabesqueDivider, CeplokBunga } from './Ornaments';
import { postForm } from '@/lib/client-api';
import { envelopeSchema, fieldErrors, type ENVELOPE_METHODS } from '@/lib/validation';
import { formatThousands } from '@/lib/text';
import type { BankAccount, SiteConfig } from '@/lib/content/types';

type Method = (typeof ENVELOPE_METHODS)[number];

const METHOD_LABELS: Array<{ value: Method; label: string }> = [
  { value: 'qris', label: 'QRIS' },
  { value: 'transfer', label: 'Transfer Bank' },
  { value: 'tunai', label: 'Tunai' },
];

const MAX_PROOF_BYTES = 2 * 1024 * 1024;

/**
 * Amplop digital (US-12).
 *
 * Aplikasi TIDAK pernah mengklaim dana sudah diterima: form ini hanya mencatat
 * pemberitahuan dari tamu, dan seluruh kiriman berstatus `pending` sampai admin
 * memverifikasinya sendiri di m-banking (mitigasi R-6).
 */
export function EnvelopeSection({
  slug,
  guestName,
  config,
  accounts,
}: {
  slug: string | null;
  guestName: string;
  config: SiteConfig;
  accounts: BankAccount[];
}) {
  const formId = useId();
  const fileRef = useRef<HTMLInputElement>(null);

  const [expanded, setExpanded] = useState(false);
  const [senderName, setSenderName] = useState(guestName);
  const [amount, setAmount] = useState('');
  const [method, setMethod] = useState<Method | ''>('');
  const [note, setNote] = useState('');
  const [fileError, setFileError] = useState('');

  const [errors, setErrors] = useState<Record<string, string>>({});
  const [serverError, setServerError] = useState('');
  const [success, setSuccess] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const hasQris = Boolean(config.qrisImageUrl);
  const hasAccounts = accounts.length > 0;
  if (!hasQris && !hasAccounts) return null;

  function handleFileChange(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    setFileError('');

    if (!file) return;

    // Pemeriksaan awal di klien demi umpan balik cepat; server tetap memeriksa
    // ulang ukuran DAN magic bytes berkas.
    if (file.size > MAX_PROOF_BYTES) {
      setFileError('Ukuran berkas maksimal 2 MB. Silakan pilih gambar yang lebih kecil.');
      event.target.value = '';
      return;
    }

    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
      setFileError('Bukti transfer harus berupa gambar JPG, PNG, atau WEBP.');
      event.target.value = '';
    }
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setServerError('');

    const parsed = envelopeSchema.safeParse({
      slug: slug ?? undefined,
      sender_name: senderName,
      amount,
      method,
      note,
    });

    if (!parsed.success) {
      setErrors(fieldErrors(parsed.error));
      return;
    }

    setErrors({});
    setSubmitting(true);

    const form = new FormData();
    if (slug) form.set('slug', slug);
    form.set('sender_name', parsed.data.sender_name);
    form.set('method', parsed.data.method);
    if (parsed.data.amount !== null) form.set('amount', String(parsed.data.amount));
    if (parsed.data.note) form.set('note', parsed.data.note);

    const file = fileRef.current?.files?.[0];
    if (file) form.set('proof', file);

    const result = await postForm<{ id: number }>('/api/envelope', form);
    setSubmitting(false);

    if (!result.ok) {
      setServerError(result.message);
      return;
    }

    setSuccess(true);
  }

  return (
    <section id="amplop" className="section relative overflow-hidden bg-jade-50">
      {/* Ceplok bunga ambient — sentuhan batik keraton di sudut.
          Sengaja jauh di bawah judul agar tidak mengganggu spot heading. */}
      <CeplokBunga
        aria-hidden="true"
        className="ornament-ambient pointer-events-none absolute top-24 -left-4 h-14 w-14 text-terracotta-400"
      />
      <CeplokBunga
        aria-hidden="true"
        className="ornament-ambient pointer-events-none absolute top-24 -right-4 h-14 w-14 text-terracotta-400"
        style={{ animationDelay: '3s' }}
      />

      <div className="container-invite">
        <SectionHeading eyebrow="Tanda Kasih" title="Doa & Hadiah">
          <p className="text-sm">
            Kehadiran dan doa restu Bapak/Ibu/Saudara/i adalah hadiah paling berharga. Sekiranya
            berkenan mengirim tanda kasih, kami sediakan opsi berikut dengan senang hati.
          </p>
        </SectionHeading>

        <ArabesqueDivider className="mt-4 mx-auto max-w-xs" />

        <Reveal className="mt-8">
          {/* Seksi tertutup secara default; dibuka lewat accordion (US-12). */}
          <div className="card overflow-hidden">
            <button
              type="button"
              onClick={() => setExpanded((current) => !current)}
              aria-expanded={expanded}
              aria-controls={`${formId}-panel`}
              className="flex w-full items-center justify-between gap-3 px-6 py-5 text-left"
            >
              <span className="font-semibold text-jade-900">Kirim Hadiah</span>
              <span aria-hidden="true" className="text-xl text-jade-600">
                {expanded ? '−' : '+'}
              </span>
            </button>

            {expanded ? (
              <div id={`${formId}-panel`} className="border-t border-jade-100 px-6 py-6">
                {hasQris ? (
                  <div className="text-center">
                    <p className="eyebrow">Pindai QRIS</p>
                    <div className="mx-auto mt-4 w-full max-w-[260px] overflow-hidden rounded-xl border border-jade-100 bg-white p-3">
                      <Image
                        src={config.qrisImageUrl}
                        alt="Kode QRIS untuk mengirim hadiah"
                        width={520}
                        height={520}
                        className="h-auto w-full"
                        // QRIS disajikan dari domain sendiri, tidak pernah hotlink (R-6).
                        unoptimized
                      />
                    </div>
                    {config.qrisNamaMerchant ? (
                      <p className="mt-2 text-sm text-ink-soft">
                        a.n. {config.qrisNamaMerchant}
                      </p>
                    ) : null}
                    <a
                      href={config.qrisImageUrl}
                      download
                      className="btn btn-ghost mt-4 text-sm"
                    >
                      <span aria-hidden="true">⭳</span>
                      Unduh QRIS
                    </a>
                    <p className="field-hint mx-auto mt-2 max-w-xs">
                      Unduh lalu pindai dari galeri melalui aplikasi m-banking Anda.
                    </p>
                  </div>
                ) : null}

                {hasAccounts ? (
                  <div className={hasQris ? 'mt-8' : ''}>
                    <p className="eyebrow text-center">Transfer Bank</p>
                    <ul className="mt-4 space-y-3">
                      {accounts.map((account) => (
                        <li
                          key={`${account.bank}-${account.nomor}`}
                          className="rounded-xl border border-jade-100 bg-cream px-4 py-4 text-center"
                        >
                          <p className="text-sm font-semibold text-jade-800">{account.bank}</p>
                          <p className="mt-1 font-mono text-lg tracking-wider text-ink">
                            {account.nomor}
                          </p>
                          {account.atasNama ? (
                            <p className="mt-1 text-sm text-ink-soft">a.n. {account.atasNama}</p>
                          ) : null}
                          <CopyButton
                            value={account.nomor}
                            label="Salin Nomor"
                            copiedLabel="Tersalin"
                            className="btn btn-ghost mt-3 text-sm"
                            ariaLabel={`Salin nomor rekening ${account.bank}`}
                          />
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : null}

                <div className="mt-8 border-t border-jade-100 pt-6">
                  <p className="eyebrow text-center">Konfirmasi Pengiriman</p>

                  {success ? (
                    <>
                      <FormStatus tone="success">
                        Terima kasih. Konfirmasi Anda sudah kami terima dan akan diverifikasi secara
                        manual oleh mempelai.
                      </FormStatus>
                      <p className="mt-3 text-center text-xs text-ink-muted">
                        Status pengiriman tidak diverifikasi otomatis oleh sistem.
                      </p>
                    </>
                  ) : (
                    <form onSubmit={handleSubmit} noValidate className="mt-4">
                      <div>
                        <label htmlFor={`${formId}-sender`} className="field-label">
                          Nama pengirim <span aria-hidden="true">*</span>
                        </label>
                        <input
                          id={`${formId}-sender`}
                          className="field-input"
                          value={senderName}
                          onChange={(event) => setSenderName(event.target.value)}
                          maxLength={60}
                          required
                          autoComplete="name"
                          aria-invalid={Boolean(errors['sender_name'])}
                        />
                        {errors['sender_name'] ? (
                          <p className="field-error">{errors['sender_name']}</p>
                        ) : null}
                      </div>

                      <div className="mt-5">
                        <label htmlFor={`${formId}-amount`} className="field-label">
                          Nominal (opsional)
                        </label>
                        <div className="flex items-center gap-2">
                          <span className="text-ink-muted">Rp</span>
                          <input
                            id={`${formId}-amount`}
                            className="field-input"
                            inputMode="numeric"
                            value={amount}
                            onChange={(event) => setAmount(formatThousands(event.target.value))}
                            placeholder="0"
                          />
                        </div>
                      </div>

                      <fieldset className="mt-5">
                        <legend className="field-label">
                          Metode <span aria-hidden="true">*</span>
                        </legend>
                        <div className="mt-1 grid grid-cols-3 gap-2">
                          {METHOD_LABELS.map((option) => (
                            <label
                              key={option.value}
                              className={[
                                'cursor-pointer rounded-xl border px-2 py-3 text-center text-sm transition-colors',
                                method === option.value
                                  ? 'border-jade-500 bg-jade-50 font-semibold text-jade-800'
                                  : 'border-jade-200 bg-parchment text-ink-soft',
                              ].join(' ')}
                            >
                              <input
                                type="radio"
                                name="method"
                                value={option.value}
                                checked={method === option.value}
                                onChange={() => setMethod(option.value)}
                                className="sr-only"
                              />
                              {option.label}
                            </label>
                          ))}
                        </div>
                        {errors['method'] ? <p className="field-error">{errors['method']}</p> : null}
                      </fieldset>

                      <div className="mt-5">
                        <label htmlFor={`${formId}-note`} className="field-label">
                          Catatan (opsional)
                        </label>
                        <textarea
                          id={`${formId}-note`}
                          className="field-input"
                          rows={2}
                          maxLength={200}
                          value={note}
                          onChange={(event) => setNote(event.target.value)}
                        />
                      </div>

                      <div className="mt-5">
                        <label htmlFor={`${formId}-proof`} className="field-label">
                          Bukti transfer (opsional)
                        </label>
                        <input
                          ref={fileRef}
                          id={`${formId}-proof`}
                          type="file"
                          accept="image/jpeg,image/png,image/webp"
                          onChange={handleFileChange}
                          className="field-input py-2 text-sm"
                        />
                        <p className="field-hint">JPG, PNG, atau WEBP. Maksimal 2 MB.</p>
                        {fileError ? <p className="field-error">{fileError}</p> : null}
                      </div>

                      {serverError ? <FormStatus tone="error">{serverError}</FormStatus> : null}

                      <button
                        type="submit"
                        className="btn btn-primary mt-6 w-full"
                        disabled={submitting || Boolean(fileError)}
                      >
                        {submitting ? 'Mengirim…' : 'Kirim Konfirmasi'}
                      </button>

                      <PrivacyNote />
                    </form>
                  )}
                </div>
              </div>
            ) : null}
          </div>
        </Reveal>
      </div>
    </section>
  );
}

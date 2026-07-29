'use client';

import { useCallback, useEffect, useId, useRef, useState } from 'react';
import { Reveal } from '@/components/ui/Reveal';
import { FormStatus, PrivacyNote } from '@/components/ui/FormStatus';
import { SectionHeading } from './SectionHeading';
import { getJson, postJson } from '@/lib/client-api';
import { fieldErrors, wishSchema } from '@/lib/validation';
import { initials } from '@/lib/text';

type Wish = { id: number; name: string; message: string; created_at: string };
type WishPage = { items: Wish[]; total: number; hasMore: boolean };

/**
 * Buku ucapan & doa (US-11).
 *
 * Anti-spam berlapis: honeypot tersembunyi, jeda minimum 3 detik sejak form
 * dirender, dan rate limit di server. Ucapan selalu dirender sebagai teks biasa.
 */
export function WishesSection({
  slug,
  guestName,
  moderated,
}: {
  slug: string | null;
  guestName: string;
  moderated: boolean;
}) {
  const formId = useId();
  const mountedAt = useRef(Date.now());

  const [name, setName] = useState(guestName);
  const [message, setMessage] = useState('');
  const [honeypot, setHoneypot] = useState('');

  const [wishes, setWishes] = useState<Wish[]>([]);
  const [total, setTotal] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);

  const [errors, setErrors] = useState<Record<string, string>>({});
  const [serverError, setServerError] = useState('');
  const [successMessage, setSuccessMessage] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const loadPage = useCallback(async (target: number, replace: boolean) => {
    setLoading(true);
    const result = await getJson<WishPage>(`/api/wishes?page=${target}`);
    setLoading(false);

    if (!result.ok) return;

    setWishes((current) => (replace ? result.data.items : [...current, ...result.data.items]));
    setTotal(result.data.total);
    setHasMore(result.data.hasMore);
    setPage(target);
  }, []);

  useEffect(() => {
    void loadPage(1, true);
  }, [loadPage]);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setServerError('');
    setSuccessMessage('');

    const parsed = wishSchema.safeParse({
      slug: slug ?? undefined,
      name,
      message,
      hp: honeypot,
      elapsedMs: Date.now() - mountedAt.current,
    });

    if (!parsed.success) {
      setErrors(fieldErrors(parsed.error));
      return;
    }

    setErrors({});
    setSubmitting(true);

    const result = await postJson<{ moderated: boolean }>('/api/wishes', parsed.data);
    setSubmitting(false);

    if (!result.ok) {
      setServerError(result.message);
      return;
    }

    setMessage('');
    setSuccessMessage(
      result.data.moderated
        ? 'Terima kasih. Ucapan Anda akan tampil setelah disetujui oleh mempelai.'
        : 'Terima kasih, ucapan Anda sudah tampil di bawah.',
    );

    // Tanpa moderasi ucapan langsung tampil, jadi muat ulang halaman pertama.
    if (!result.data.moderated) void loadPage(1, true);
  }

  return (
    <section id="ucapan" className="section bg-cream">
      <div className="container-invite">
        <SectionHeading eyebrow="Doa & Harapan" title="Ucapan">
          <p className="text-sm">
            Kirimkan doa dan ucapan terbaik Anda untuk kedua mempelai.
            {moderated ? ' Ucapan tampil setelah disetujui.' : ''}
          </p>
        </SectionHeading>

        <Reveal className="mt-8">
          <div className="card px-6 py-7">
            <form onSubmit={handleSubmit} noValidate>
              <div>
                <label htmlFor={`${formId}-name`} className="field-label">
                  Nama <span aria-hidden="true">*</span>
                </label>
                <input
                  id={`${formId}-name`}
                  className="field-input"
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  maxLength={60}
                  required
                  autoComplete="name"
                  aria-invalid={Boolean(errors['name'])}
                />
                {errors['name'] ? <p className="field-error">{errors['name']}</p> : null}
              </div>

              <div className="mt-5">
                <label htmlFor={`${formId}-message`} className="field-label">
                  Ucapan & doa <span aria-hidden="true">*</span>
                </label>
                <textarea
                  id={`${formId}-message`}
                  className="field-input"
                  rows={4}
                  maxLength={500}
                  value={message}
                  onChange={(event) => setMessage(event.target.value)}
                  required
                  aria-invalid={Boolean(errors['message'])}
                />
                <p className="field-hint">{message.length}/500 karakter</p>
                {errors['message'] ? <p className="field-error">{errors['message']}</p> : null}
              </div>

              {/* Honeypot: tersembunyi dari manusia, sering diisi bot. */}
              <div aria-hidden="true" className="absolute h-0 w-0 overflow-hidden opacity-0">
                <label htmlFor={`${formId}-hp`}>Jangan diisi</label>
                <input
                  id={`${formId}-hp`}
                  name="hp"
                  tabIndex={-1}
                  autoComplete="off"
                  value={honeypot}
                  onChange={(event) => setHoneypot(event.target.value)}
                />
              </div>

              {serverError ? <FormStatus tone="error">{serverError}</FormStatus> : null}
              {successMessage ? <FormStatus tone="success">{successMessage}</FormStatus> : null}

              <button type="submit" className="btn btn-primary mt-6 w-full" disabled={submitting}>
                {submitting ? 'Mengirim…' : 'Kirim Ucapan'}
              </button>

              <PrivacyNote />
            </form>
          </div>
        </Reveal>

        <div className="mt-10">
          <p className="text-center text-sm text-ink-muted">
            {total > 0 ? `${total} ucapan telah tampil` : 'Belum ada ucapan yang tampil'}
          </p>

          <ul className="mt-5 space-y-3">
            {wishes.map((wish) => (
              <li key={wish.id} className="card px-5 py-4">
                <div className="flex items-start gap-3">
                  <span
                    aria-hidden="true"
                    className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-jade-100 text-sm font-semibold text-jade-700"
                  >
                    {initials(wish.name)}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold text-ink break-words">{wish.name}</p>
                    <p className="mt-1 text-sm leading-relaxed text-ink-soft whitespace-pre-line break-words">
                      {wish.message}
                    </p>
                  </div>
                </div>
              </li>
            ))}
          </ul>

          {hasMore ? (
            <button
              type="button"
              onClick={() => void loadPage(page + 1, false)}
              className="btn btn-ghost mx-auto mt-6 flex"
              disabled={loading}
            >
              {loading ? 'Memuat…' : 'Muat lebih banyak'}
            </button>
          ) : null}
        </div>
      </div>
    </section>
  );
}

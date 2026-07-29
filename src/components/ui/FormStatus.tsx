/** Panel pesan sukses/gagal yang seragam untuk seluruh form tamu. */
export function FormStatus({ tone, children }: { tone: 'success' | 'error'; children: React.ReactNode }) {
  const isError = tone === 'error';

  return (
    <p
      // `alert` untuk galat (langsung diinterupsi), `status` untuk sukses (sopan).
      role={isError ? 'alert' : 'status'}
      className={[
        'mt-4 rounded-lg px-4 py-3 text-sm',
        isError ? 'bg-danger/10 text-danger' : 'bg-success/10 text-success',
      ].join(' ')}
    >
      {children}
    </p>
  );
}

/** Catatan privasi wajib di bawah setiap form (PRD §4.5). */
export function PrivacyNote() {
  return (
    <p className="mt-4 text-center text-xs text-ink-muted">
      Data yang Anda kirim hanya digunakan untuk keperluan acara ini dan diteruskan kepada mempelai
      sebagai pemberitahuan. Tidak dibagikan ke pihak lain.
    </p>
  );
}

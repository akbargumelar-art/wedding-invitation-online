'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { FormStatus } from '@/components/ui/FormStatus';
import { postJson } from '@/lib/client-api';

export function LoginForm() {
  const router = useRouter();

  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError('');
    setSubmitting(true);

    const result = await postJson<{ ok: true }>('/api/admin/login', { username, password });
    setSubmitting(false);

    if (!result.ok) {
      setError(result.message);
      return;
    }

    // `refresh` diperlukan agar layout server membaca cookie sesi yang baru.
    router.replace('/admin');
    router.refresh();
  }

  return (
    <form onSubmit={handleSubmit} noValidate>
      <div>
        <label htmlFor="username" className="field-label">
          Nama pengguna
        </label>
        <input
          id="username"
          name="username"
          className="field-input"
          value={username}
          onChange={(event) => setUsername(event.target.value)}
          autoComplete="username"
          required
        />
      </div>

      <div className="mt-5">
        <label htmlFor="password" className="field-label">
          Kata sandi
        </label>
        <input
          id="password"
          name="password"
          type="password"
          className="field-input"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          autoComplete="current-password"
          required
        />
      </div>

      {error ? <FormStatus tone="error">{error}</FormStatus> : null}

      <button type="submit" className="btn btn-primary mt-6 w-full" disabled={submitting}>
        {submitting ? 'Memeriksa…' : 'Masuk'}
      </button>
    </form>
  );
}

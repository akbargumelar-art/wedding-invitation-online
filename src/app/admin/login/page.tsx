import { redirect } from 'next/navigation';
import { getSession } from '@/lib/auth';
import { LoginForm } from '@/components/admin/LoginForm';

export const dynamic = 'force-dynamic';

export default async function AdminLoginPage() {
  // Sudah masuk? Tidak perlu melihat form lagi.
  if (await getSession()) redirect('/admin');

  return (
    <main className="flex min-h-screen items-center justify-center px-4 py-12">
      <div className="w-full max-w-sm">
        <div className="text-center">
          <p className="eyebrow">Walimah</p>
          <h1 className="mt-2 text-3xl text-jade-900">Masuk Admin</h1>
          <p className="mt-2 text-sm text-ink-muted">
            Halaman ini hanya untuk mempelai dan panitia yang berwenang.
          </p>
        </div>

        <div className="card mt-8 px-6 py-7">
          <LoginForm />
        </div>
      </div>
    </main>
  );
}

import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Dashboard Admin — Walimah',
  robots: { index: false, follow: false },
};

/** Semua halaman admin bergantung pada sesi, jadi tidak boleh pernah di-cache. */
export const dynamic = 'force-dynamic';

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return <div className="min-h-screen bg-jade-50">{children}</div>;
}

import { redirect } from 'next/navigation';
import { getSession } from '@/lib/auth';
import { loadAdminData } from '@/lib/admin-data';
import { AdminDashboard } from '@/components/admin/AdminDashboard';

export const dynamic = 'force-dynamic';

export default async function AdminPage() {
  const session = await getSession();
  if (!session) redirect('/admin/login');

  const data = await loadAdminData();
  return <AdminDashboard data={data} username={session.username} />;
}

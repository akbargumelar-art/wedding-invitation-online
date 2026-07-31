import { commitChange, ok, withValidated } from '@/lib/admin-content';
import { createAccount } from '@/lib/db/content';
import { accountSchema } from '@/lib/validation';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/** POST /api/admin/content/accounts — tambah satu rekening penerima. */
export async function POST(request: Request): Promise<Response> {
  return withValidated(request, accountSchema, 'admin.account_create_failed', (input, actor) => {
    const id = createAccount(input);
    commitChange('account.create', String(id), actor);
    return ok({ id });
  });
}

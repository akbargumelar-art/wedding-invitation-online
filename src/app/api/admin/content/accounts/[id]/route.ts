import { commitChange, notFound, ok, parseId, withAdmin, withValidated } from '@/lib/admin-content';
import { deleteAccount, updateAccount } from '@/lib/db/content';
import { accountSchema } from '@/lib/validation';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

type Context = { params: Promise<{ id: string }> };

export async function PUT(request: Request, { params }: Context): Promise<Response> {
  const id = parseId((await params).id);

  return withValidated(request, accountSchema, 'admin.account_update_failed', (input, actor) => {
    if (id === null || !updateAccount(id, input)) return notFound();

    commitChange('account.update', String(id), actor);
    return ok();
  });
}

export async function DELETE(request: Request, { params }: Context): Promise<Response> {
  const id = parseId((await params).id);

  return withAdmin(request, 'admin.account_delete_failed', (actor) => {
    if (id === null || !deleteAccount(id)) return notFound();

    commitChange('account.delete', String(id), actor);
    return ok();
  });
}

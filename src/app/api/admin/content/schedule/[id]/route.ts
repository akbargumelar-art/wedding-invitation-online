import { commitChange, notFound, ok, parseId, withAdmin, withValidated } from '@/lib/admin-content';
import { deleteSchedule, updateSchedule } from '@/lib/db/content';
import { scheduleSchema } from '@/lib/validation';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

type Context = { params: Promise<{ id: string }> };

export async function PUT(request: Request, { params }: Context): Promise<Response> {
  const id = parseId((await params).id);

  return withValidated(request, scheduleSchema, 'admin.schedule_update_failed', (input, actor) => {
    if (id === null || !updateSchedule(id, input)) return notFound();

    commitChange('schedule.update', String(id), actor);
    return ok();
  });
}

export async function DELETE(request: Request, { params }: Context): Promise<Response> {
  const id = parseId((await params).id);

  return withAdmin(request, 'admin.schedule_delete_failed', (actor) => {
    if (id === null || !deleteSchedule(id)) return notFound();

    commitChange('schedule.delete', String(id), actor);
    return ok();
  });
}

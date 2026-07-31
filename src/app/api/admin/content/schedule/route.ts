import { commitChange, ok, withValidated } from '@/lib/admin-content';
import { createSchedule } from '@/lib/db/content';
import { scheduleSchema } from '@/lib/validation';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/** POST /api/admin/content/schedule — tambah satu rangkaian acara. */
export async function POST(request: Request): Promise<Response> {
  return withValidated(request, scheduleSchema, 'admin.schedule_create_failed', (input, actor) => {
    const id = createSchedule(input);
    commitChange('schedule.create', String(id), actor);
    return ok({ id });
  });
}

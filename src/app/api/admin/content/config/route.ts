import { commitChange, ok, withValidated } from '@/lib/admin-content';
import { configToMap } from '@/lib/content/parse';
import { writeConfigMap } from '@/lib/db/content';
import { siteConfigSchema } from '@/lib/validation';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/** PUT /api/admin/content/config — simpan seluruh pengaturan undangan. */
export async function PUT(request: Request): Promise<Response> {
  return withValidated(request, siteConfigSchema, 'admin.config_failed', (config, actor) => {
    writeConfigMap(configToMap(config));
    commitChange('config.update', null, actor);
    return ok();
  });
}

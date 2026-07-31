import { commitChange, ok, withValidated } from '@/lib/admin-content';
import { readWahaSettings, toSettingsView, writeWahaSettings } from '@/lib/waha/settings';
import { wahaSettingsSchema } from '@/lib/validation';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/** PUT /api/admin/whatsapp/settings — simpan pengaturan integrasi WAHA. */
export async function PUT(request: Request): Promise<Response> {
  return withValidated(request, wahaSettingsSchema, 'admin.waha_settings_failed', (input, actor) => {
    const current = readWahaSettings();

    writeWahaSettings({
      ...input,
      // Rahasia yang dikirim kosong berarti tidak diubah — dashboard memang
      // tidak pernah menerima nilainya, jadi ia tidak punya apa pun untuk
      // dikirim balik.
      apiKey: input.apiKey || current.apiKey,
      webhookSecret: input.webhookSecret || current.webhookSecret,
    });

    commitChange('waha.settings', null, actor);
    return ok({ settings: toSettingsView(readWahaSettings()) });
  });
}

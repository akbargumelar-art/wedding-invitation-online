import { getDb, transaction } from './index';
import { nowIso } from '@/lib/date';

/**
 * Penyimpanan pengaturan integrasi (saat ini: WAHA).
 *
 * Bentuknya kunci/nilai seperti `site_config`, tetapi tabelnya sengaja
 * terpisah — lihat catatan di schema.ts. Modul ini tidak pernah diimpor jalur
 * render halaman tamu.
 */

export function readIntegrationMap(): Record<string, string> {
  const rows = getDb().prepare(`SELECT key, value FROM integrations`).all() as Array<{
    key: string;
    value: string;
  }>;

  const map: Record<string, string> = {};
  for (const row of rows) map[row.key] = row.value;
  return map;
}

export function readIntegrationValue(key: string): string {
  const row = getDb().prepare(`SELECT value FROM integrations WHERE key = ?`).get(key) as
    | { value: string }
    | undefined;

  return row?.value ?? '';
}

export function writeIntegrationMap(map: Record<string, string>): void {
  const at = nowIso();

  transaction((db) => {
    const upsert = db.prepare(
      `INSERT INTO integrations (key, value, updated_at) VALUES (?, ?, ?)
       ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
    );
    for (const [key, value] of Object.entries(map)) upsert.run(key, value, at);
  });
}

export function writeIntegrationValue(key: string, value: string): void {
  writeIntegrationMap({ [key]: value });
}

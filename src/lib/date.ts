/**
 * Semua perhitungan waktu dipaksa ke zona Indonesia, bukan zona perangkat tamu
 * (mitigasi R-11). Indonesia tidak memakai DST, jadi offset tetap dan aman
 * dihitung secara aritmetik tanpa pustaka timezone.
 */

export const ZONE_OFFSETS = {
  WIB: '+07:00',
  WITA: '+08:00',
  WIT: '+09:00',
} as const;

export type ZoneCode = keyof typeof ZONE_OFFSETS;

export const DEFAULT_ZONE: ZoneCode = 'WIB';

const HARI = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'] as const;

const BULAN = [
  'Januari',
  'Februari',
  'Maret',
  'April',
  'Mei',
  'Juni',
  'Juli',
  'Agustus',
  'September',
  'Oktober',
  'November',
  'Desember',
] as const;

export function normalizeZone(raw: string | undefined | null): ZoneCode {
  const key = (raw ?? '').trim().toUpperCase();
  return key === 'WITA' || key === 'WIT' ? key : DEFAULT_ZONE;
}

/**
 * Gabungkan tanggal `YYYY-MM-DD` dan jam `HH:mm` pada zona Indonesia tertentu
 * menjadi epoch milidetik UTC. Mengembalikan null bila format tidak valid —
 * pemanggil bertanggung jawab melewati baris tersebut, bukan crash (R-2).
 */
export function toEpochMs(
  date: string,
  time: string | null | undefined,
  zone: ZoneCode = DEFAULT_ZONE,
): number | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;

  const clock = time && /^\d{1,2}:\d{2}$/.test(time) ? padClock(time) : '00:00';
  const ms = Date.parse(`${date}T${clock}:00${ZONE_OFFSETS[zone]}`);
  return Number.isFinite(ms) ? ms : null;
}

function padClock(time: string): string {
  const [h = '0', m = '00'] = time.split(':');
  return `${h.padStart(2, '0')}:${m}`;
}

/** "Sabtu, 12 September 2026" — tanpa bergantung pada locale runtime. */
export function formatTanggalLengkap(date: string): string {
  const ms = toEpochMs(date, '12:00');
  if (ms === null) return date;

  // Baca komponen pada offset WIB agar hari/tanggal tidak bergeser di server UTC.
  const shifted = new Date(ms + 7 * 3_600_000);
  const hari = HARI[shifted.getUTCDay()] ?? '';
  const bulan = BULAN[shifted.getUTCMonth()] ?? '';
  return `${hari}, ${shifted.getUTCDate()} ${bulan} ${shifted.getUTCFullYear()}`;
}

/** "12 September 2026" */
export function formatTanggalSingkat(date: string): string {
  return formatTanggalLengkap(date).split(', ')[1] ?? date;
}

/** "08.00 – 10.00 WIB" atau "08.00 WIB" bila jam selesai kosong. */
export function formatRentangJam(
  start: string | null | undefined,
  end: string | null | undefined,
  zone: ZoneCode = DEFAULT_ZONE,
): string {
  const from = start ? padClock(start).replace(':', '.') : '';
  const to = end ? padClock(end).replace(':', '.') : '';
  if (!from) return '';
  return to ? `${from} – ${to} ${zone}` : `${from} WIB`.replace('WIB', zone);
}

/** Tanggal hari ini (YYYY-MM-DD) menurut kalender WIB, bukan kalender server. */
export function todayInJakarta(now: Date = new Date()): string {
  const shifted = new Date(now.getTime() + 7 * 3_600_000);
  return shifted.toISOString().slice(0, 10);
}

/** Timestamp ISO UTC — dipakai konsisten sebagai format penyimpanan di SQLite. */
export function nowIso(now: Date = new Date()): string {
  return now.toISOString().replace('T', ' ').slice(0, 19);
}

export type CountdownParts = {
  days: number;
  hours: number;
  minutes: number;
  seconds: number;
  finished: boolean;
};

export function countdownFrom(targetMs: number, nowMs: number = Date.now()): CountdownParts {
  const diff = targetMs - nowMs;
  if (diff <= 0) return { days: 0, hours: 0, minutes: 0, seconds: 0, finished: true };

  const totalSeconds = Math.floor(diff / 1000);
  return {
    days: Math.floor(totalSeconds / 86_400),
    hours: Math.floor((totalSeconds % 86_400) / 3600),
    minutes: Math.floor((totalSeconds % 3600) / 60),
    seconds: totalSeconds % 60,
    finished: false,
  };
}

/** `20260912T010000Z` — format timestamp untuk file .ics (selalu UTC). */
export function toIcsStamp(ms: number): string {
  return `${new Date(ms).toISOString().replace(/[-:]/g, '').split('.')[0]}Z`;
}

/** Apakah tanggal deadline (YYYY-MM-DD) sudah terlampaui menurut akhir hari WIB. */
export function isPastDeadline(deadline: string | null, nowMs: number = Date.now()): boolean {
  if (!deadline) return false;
  const endOfDay = toEpochMs(deadline, '23:59');
  return endOfDay !== null && nowMs > endOfDay;
}

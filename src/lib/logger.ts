/**
 * Logger terstruktur satu baris per peristiwa. Di VPS aplikasi berjalan sebagai
 * systemd unit, jadi stdout/stderr langsung masuk journald — tidak perlu
 * pustaka logging tambahan.
 */

type Level = 'debug' | 'info' | 'warn' | 'error';

type Fields = Record<string, unknown>;

function emit(level: Level, event: string, fields: Fields = {}): void {
  const line = {
    ts: new Date().toISOString(),
    level,
    event,
    ...serializeErrors(fields),
  };

  const text = JSON.stringify(line);
  if (level === 'error') console.error(text);
  else if (level === 'warn') console.warn(text);
  else console.log(text);
}

/** Error tidak JSON-serializable secara default; ambil pesan + stack-nya. */
function serializeErrors(fields: Fields): Fields {
  const out: Fields = {};
  for (const [key, value] of Object.entries(fields)) {
    out[key] =
      value instanceof Error ? { name: value.name, message: value.message, stack: value.stack } : value;
  }
  return out;
}

export const logger = {
  debug: (event: string, fields?: Fields) => {
    if (process.env.NODE_ENV !== 'production') emit('debug', event, fields);
  },
  info: (event: string, fields?: Fields) => emit('info', event, fields),
  warn: (event: string, fields?: Fields) => emit('warn', event, fields),
  error: (event: string, fields?: Fields) => emit('error', event, fields),
};

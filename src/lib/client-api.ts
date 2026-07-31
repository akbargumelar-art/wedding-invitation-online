/** Pembantu pemanggilan API dari browser. Tidak ada rahasia apa pun di sini. */

export type ApiFailure = { ok: false; code: string; message: string };
export type ApiSuccess<T> = { ok: true; data: T };
export type ApiResult<T> = ApiSuccess<T> | ApiFailure;

const GENERIC_ERROR = 'Tidak dapat terhubung ke server. Periksa koneksi Anda lalu coba lagi.';

async function handle<T>(response: Response): Promise<ApiResult<T>> {
  let body: unknown = null;
  try {
    body = await response.json();
  } catch {
    body = null;
  }

  if (response.ok) return { ok: true, data: (body ?? null) as T };

  const error = (body as { error?: { code?: string; message?: string } } | null)?.error;
  return {
    ok: false,
    code: error?.code ?? 'INTERNAL',
    message: error?.message ?? GENERIC_ERROR,
  };
}

export async function postJson<T>(url: string, payload: unknown, headers?: HeadersInit): Promise<ApiResult<T>> {
  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...headers },
      body: JSON.stringify(payload),
    });
    return handle<T>(response);
  } catch {
    return { ok: false, code: 'NETWORK', message: GENERIC_ERROR };
  }
}

export async function patchJson<T>(url: string, payload: unknown, headers?: HeadersInit): Promise<ApiResult<T>> {
  try {
    const response = await fetch(url, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json', ...headers },
      body: JSON.stringify(payload),
    });
    return handle<T>(response);
  } catch {
    return { ok: false, code: 'NETWORK', message: GENERIC_ERROR };
  }
}

export async function putJson<T>(url: string, payload: unknown, headers?: HeadersInit): Promise<ApiResult<T>> {
  try {
    const response = await fetch(url, {
      method: 'PUT',
      headers: { 'content-type': 'application/json', ...headers },
      body: JSON.stringify(payload),
    });
    return handle<T>(response);
  } catch {
    return { ok: false, code: 'NETWORK', message: GENERIC_ERROR };
  }
}

export async function deleteJson<T>(url: string, headers?: HeadersInit): Promise<ApiResult<T>> {
  try {
    return handle<T>(await fetch(url, { method: 'DELETE', headers: { ...headers } }));
  } catch {
    return { ok: false, code: 'NETWORK', message: GENERIC_ERROR };
  }
}

export async function postForm<T>(url: string, form: FormData, headers?: HeadersInit): Promise<ApiResult<T>> {
  try {
    // Content-Type sengaja tidak diset agar browser menyusun boundary multipart.
    const response = await fetch(url, { method: 'POST', body: form, headers: { ...headers } });
    return handle<T>(response);
  } catch {
    return { ok: false, code: 'NETWORK', message: GENERIC_ERROR };
  }
}

export async function getJson<T>(url: string): Promise<ApiResult<T>> {
  try {
    return handle<T>(await fetch(url, { headers: { accept: 'application/json' } }));
  } catch {
    return { ok: false, code: 'NETWORK', message: GENERIC_ERROR };
  }
}

/** Baca token CSRF dari cookie (dipasang saat login admin). */
export function csrfToken(): string {
  const match = document.cookie.match(/(?:^|;\s*)walimah_csrf=([^;]+)/);
  return match?.[1] ? decodeURIComponent(match[1]) : '';
}

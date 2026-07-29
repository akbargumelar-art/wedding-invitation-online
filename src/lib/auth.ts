import 'server-only';

import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { cookies } from 'next/headers';
import { verify as verifyArgon2 } from '@node-rs/argon2';
import { env } from '@/lib/env';
import { checkLogin, clearLoginFailures, recordLoginFailure } from '@/lib/db/misc';

/**
 * Autentikasi admin.
 *
 * PRD menyebut NextAuth Credentials. Untuk satu akun admin tunggal, di sini
 * dipakai sesi cookie bertanda tangan HMAC buatan sendiri: permukaan serangannya
 * jauh lebih kecil, dan dua syarat PRD yang tidak disediakan NextAuth secara
 * bawaan — penguncian akun 15 menit setelah 5 kali gagal, serta token CSRF —
 * dapat diterapkan langsung. Properti yang diminta PRD tetap sama:
 * cookie httpOnly + SameSite=Lax + hash Argon2id + proteksi CSRF.
 */

const SESSION_COOKIE = 'walimah_session';
const CSRF_COOKIE = 'walimah_csrf';
export const CSRF_HEADER = 'x-walimah-csrf';

const SESSION_TTL_SECONDS = 8 * 3600;

export type Session = { username: string; issuedAt: number; expiresAt: number };

// -----------------------------------------------------------------------------
// Token bertanda tangan
// -----------------------------------------------------------------------------

function base64url(input: Buffer | string): string {
  return Buffer.from(input)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

function fromBase64url(input: string): Buffer {
  return Buffer.from(input.replace(/-/g, '+').replace(/_/g, '/'), 'base64');
}

function sign(payload: string): string {
  return base64url(createHmac('sha256', env.security.authSecret).update(payload).digest());
}

function safeEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  return bufA.length === bufB.length && timingSafeEqual(bufA, bufB);
}

function createToken(session: Session): string {
  const payload = base64url(JSON.stringify(session));
  return `${payload}.${sign(payload)}`;
}

function readToken(token: string): Session | null {
  const [payload, signature] = token.split('.');
  if (!payload || !signature) return null;
  if (!safeEqual(signature, sign(payload))) return null;

  try {
    const session = JSON.parse(fromBase64url(payload).toString('utf8')) as Session;
    if (typeof session.expiresAt !== 'number' || session.expiresAt <= Date.now()) return null;
    return session;
  } catch {
    return null;
  }
}

// -----------------------------------------------------------------------------
// Login
// -----------------------------------------------------------------------------

export type LoginResult =
  | { ok: true }
  | { ok: false; code: 'LOCKED'; retryAfterSeconds: number }
  | { ok: false; code: 'INVALID' }
  | { ok: false; code: 'NOT_CONFIGURED' };

export async function login(username: string, password: string): Promise<LoginResult> {
  const { adminUsername, adminPasswordHash } = env.security;

  // Tidak ada akun bawaan: tanpa hash yang dikonfigurasi, login selalu ditolak.
  if (!adminPasswordHash) return { ok: false, code: 'NOT_CONFIGURED' };

  const identity = username.trim().toLowerCase();

  const lock = checkLogin(identity);
  if (lock.locked) return { ok: false, code: 'LOCKED', retryAfterSeconds: lock.retryAfterSeconds };

  const usernameOk = safeEqual(identity, adminUsername.trim().toLowerCase());

  let passwordOk = false;
  try {
    passwordOk = await verifyArgon2(adminPasswordHash, password);
  } catch {
    passwordOk = false;
  }

  if (!usernameOk || !passwordOk) {
    recordLoginFailure(identity);
    return { ok: false, code: 'INVALID' };
  }

  clearLoginFailures(identity);
  await issueSession(adminUsername);
  return { ok: true };
}

async function issueSession(username: string): Promise<void> {
  const now = Date.now();
  const session: Session = {
    username,
    issuedAt: now,
    expiresAt: now + SESSION_TTL_SECONDS * 1000,
  };

  const jar = await cookies();
  const common = {
    httpOnly: true,
    sameSite: 'lax' as const,
    secure: env.isProduction,
    path: '/',
    maxAge: SESSION_TTL_SECONDS,
  };

  jar.set(SESSION_COOKIE, createToken(session), common);
  // Token CSRF sengaja TIDAK httpOnly: klien harus membacanya untuk dikirim
  // balik lewat header pada setiap mutasi (pola double-submit cookie).
  jar.set(CSRF_COOKIE, randomBytes(24).toString('hex'), { ...common, httpOnly: false });
}

export async function logout(): Promise<void> {
  const jar = await cookies();
  jar.delete(SESSION_COOKIE);
  jar.delete(CSRF_COOKIE);
}

// -----------------------------------------------------------------------------
// Pembacaan sesi
// -----------------------------------------------------------------------------

export async function getSession(): Promise<Session | null> {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  return token ? readToken(token) : null;
}

/**
 * Verifikasi token CSRF double-submit: nilai di header harus sama persis dengan
 * cookie. Penyerang lintas situs dapat memicu request, tapi tidak dapat membaca
 * cookie untuk mengisi header-nya.
 */
export async function verifyCsrf(request: Request): Promise<boolean> {
  const cookieValue = (await cookies()).get(CSRF_COOKIE)?.value;
  const headerValue = request.headers.get(CSRF_HEADER);
  return Boolean(cookieValue && headerValue && safeEqual(cookieValue, headerValue));
}

export { SESSION_COOKIE, CSRF_COOKIE };

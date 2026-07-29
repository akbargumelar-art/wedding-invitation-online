'use client';

import { useEffect, useRef, useState } from 'react';

/**
 * Tombol salin dengan umpan balik visual "Tersalin ✓" (US-06 / US-12).
 *
 * `navigator.clipboard` tidak tersedia pada konteks non-HTTPS dan sebagian
 * WebView WhatsApp, jadi ada jalur cadangan `document.execCommand('copy')`
 * memakai textarea sementara.
 */
export function CopyButton({
  value,
  label = 'Salin',
  copiedLabel = 'Tersalin',
  className = 'btn btn-ghost text-sm',
  ariaLabel,
}: {
  value: string;
  label?: string;
  copiedLabel?: string;
  className?: string;
  ariaLabel?: string;
}) {
  const [copied, setCopied] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
  }, []);

  async function handleCopy() {
    const ok = await copyText(value);
    if (!ok) return;

    setCopied(true);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setCopied(false), 2000);
  }

  return (
    <button
      type="button"
      onClick={handleCopy}
      className={className}
      aria-label={ariaLabel ?? `${label} ${value}`}
    >
      <span aria-hidden="true">{copied ? '✓' : '⧉'}</span>
      <span>{copied ? copiedLabel : label}</span>
      {/* Perubahan status diumumkan ke pembaca layar. */}
      <span className="sr-only" role="status">
        {copied ? `${copiedLabel}: ${value}` : ''}
      </span>
    </button>
  );
}

async function copyText(value: string): Promise<boolean> {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(value);
      return true;
    }
  } catch {
    // Lanjut ke jalur cadangan di bawah.
  }

  try {
    const area = document.createElement('textarea');
    area.value = value;
    area.setAttribute('readonly', '');
    area.style.position = 'fixed';
    area.style.opacity = '0';
    document.body.appendChild(area);
    area.select();
    const ok = document.execCommand('copy');
    document.body.removeChild(area);
    return ok;
  } catch {
    return false;
  }
}

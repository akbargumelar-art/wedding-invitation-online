'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';

/**
 * Animasi masuk berbasis Intersection Observer — tanpa pustaka animasi, sesuai
 * budget performa PRD §4.6. Transisinya murni CSS.
 *
 * Elemen tetap terlihat bila JavaScript tidak jalan: kelas animasinya baru
 * dipasang setelah komponen ter-mount di browser.
 *
 * Tiga bentuk gerak, dipilih lewat `variant`:
 *
 *  - `up`       naik dari bawah — bentuk bawaan;
 *  - `x`        masuk dari samping, ARAHNYA bergantian antar-seksi. Arah itu
 *               ditentukan CSS lewat posisi seksi (lihat `.reveal-x` di
 *               globals.css), bukan oleh pemanggil — supaya menambah atau
 *               memindahkan seksi tidak menuntut siapa pun menyetel ulang arah
 *               satu per satu;
 *  - `stagger`  pembungkusnya sendiri diam, ANAK-ANAKNYA yang muncul berurutan.
 *               Dipakai kepala seksi: label, judul, lalu ornamen.
 *
 * Semua varian dimatikan oleh `prefers-reduced-motion` di globals.css.
 */
export type RevealVariant = 'up' | 'x' | 'stagger';

const VARIANT_CLASS: Record<RevealVariant, string> = {
  up: 'reveal',
  x: 'reveal reveal-x',
  stagger: 'reveal-stagger',
};

export function Reveal({
  children,
  className = '',
  delayMs = 0,
  variant = 'up',
  as: Tag = 'div',
}: {
  children: ReactNode;
  className?: string;
  delayMs?: number;
  variant?: RevealVariant;
  as?: 'div' | 'section' | 'li' | 'article' | 'header';
}) {
  const ref = useRef<HTMLElement>(null);
  const [mounted, setMounted] = useState(false);
  const [visible, setVisible] = useState(false);

  useEffect(() => setMounted(true), []);

  useEffect(() => {
    const node = ref.current;
    if (!node || visible) return;

    if (typeof IntersectionObserver === 'undefined') {
      setVisible(true);
      return;
    }

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry?.isIntersecting) {
          setVisible(true);
          observer.disconnect();
        }
      },
      { threshold: 0.12, rootMargin: '0px 0px -8% 0px' },
    );

    observer.observe(node);
    return () => observer.disconnect();
  }, [visible]);

  return (
    <Tag
      ref={ref as never}
      className={`${mounted ? VARIANT_CLASS[variant] : ''} ${className}`.trim()}
      data-visible={visible ? 'true' : 'false'}
      // Jeda dipasang sebagai custom property, bukan transition-delay langsung:
      // varian `stagger` meneruskannya ke anak-anaknya, dan menimpa
      // transition-delay di pembungkus akan menghapus jenjang antar-anak itu.
      style={delayMs ? ({ '--reveal-delay': `${delayMs}ms` } as React.CSSProperties) : undefined}
    >
      {children}
    </Tag>
  );
}

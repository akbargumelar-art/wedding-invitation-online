'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';

/**
 * Animasi masuk berbasis Intersection Observer — tanpa pustaka animasi, sesuai
 * budget performa PRD §4.6. Transisinya murni CSS (kelas `.reveal`).
 *
 * Elemen tetap terlihat bila JavaScript tidak jalan: kelas `.reveal` baru
 * dipasang setelah komponen ter-mount di browser.
 */
export function Reveal({
  children,
  className = '',
  delayMs = 0,
  as: Tag = 'div',
}: {
  children: ReactNode;
  className?: string;
  delayMs?: number;
  as?: 'div' | 'section' | 'li' | 'article';
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
      className={`${mounted ? 'reveal' : ''} ${className}`.trim()}
      data-visible={visible ? 'true' : 'false'}
      style={delayMs ? { transitionDelay: `${delayMs}ms` } : undefined}
    >
      {children}
    </Tag>
  );
}

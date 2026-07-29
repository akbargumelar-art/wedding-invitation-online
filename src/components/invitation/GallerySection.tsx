'use client';

import Image from 'next/image';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Reveal } from '@/components/ui/Reveal';
import { SectionHeading } from './SectionHeading';
import type { GalleryItem } from '@/lib/content/types';

/**
 * Galeri + lightbox (US-07).
 *
 * Setiap gambar memakai `next/image` dengan rasio terkunci, sehingga sumber
 * dikonversi ke AVIF/WebP, di-`srcset`, dan tidak menggeser layout (CLS ≤ 0,1).
 * Baris dengan `tampil = FALSE` sudah disaring di lapisan parser.
 */
export function GallerySection({ items }: { items: GalleryItem[] }) {
  const [activeIndex, setActiveIndex] = useState<number | null>(null);

  if (items.length === 0) return null;

  return (
    <section id="galeri" className="section bg-cream">
      <div className="container-invite">
        <SectionHeading eyebrow="Momen" title="Galeri" />

        <div className="mt-8 grid grid-cols-2 gap-3">
          {items.map((item, index) => (
            <Reveal key={`${item.url}-${index}`} delayMs={(index % 4) * 80}>
              <button
                type="button"
                onClick={() => setActiveIndex(index)}
                className="group relative block w-full overflow-hidden rounded-xl border border-jade-100 bg-jade-100"
                style={{ aspectRatio: '3 / 4' }}
                aria-label={`Perbesar foto ${index + 1}${item.caption ? `: ${item.caption}` : ''}`}
              >
                <Image
                  src={item.url}
                  alt={item.caption || `Foto galeri ${index + 1}`}
                  fill
                  // Dua kolom di mobile, lebar kolom maksimum ~260px di desktop.
                  sizes="(max-width: 640px) 50vw, 260px"
                  className="object-cover transition-transform duration-500 group-hover:scale-105"
                  loading="lazy"
                />
              </button>
            </Reveal>
          ))}
        </div>
      </div>

      {activeIndex !== null ? (
        <Lightbox items={items} index={activeIndex} onChange={setActiveIndex} />
      ) : null}
    </section>
  );
}

function Lightbox({
  items,
  index,
  onChange,
}: {
  items: GalleryItem[];
  index: number;
  onChange: (next: number | null) => void;
}) {
  const closeRef = useRef<HTMLButtonElement>(null);
  const touchStartX = useRef<number | null>(null);

  const current = items[index];

  const go = useCallback(
    (delta: number) => {
      onChange((index + delta + items.length) % items.length);
    },
    [index, items.length, onChange],
  );

  // Kunci scroll latar dan pasang pintasan papan ketik selama lightbox terbuka.
  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    closeRef.current?.focus();

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') onChange(null);
      if (event.key === 'ArrowRight') go(1);
      if (event.key === 'ArrowLeft') go(-1);
    }

    window.addEventListener('keydown', onKeyDown);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      document.body.style.overflow = previousOverflow;
    };
  }, [go, onChange]);

  if (!current) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Pratinjau foto"
      // z-80 menempatkan lightbox di atas segalanya, termasuk banner mode dummy
      // (z-70) yang kalau tidak akan menutupi tombol tutup di pojok atas.
      className="fixed inset-0 z-80 flex flex-col bg-jade-900/95 backdrop-blur-sm"
      // Geser dan panah di dalam lightbox berganti foto, bukan membalik halaman
      // undangan di belakangnya (lihat BookShell).
      data-swipe-ignore
      onTouchStart={(event) => {
        touchStartX.current = event.touches[0]?.clientX ?? null;
      }}
      onTouchEnd={(event) => {
        const start = touchStartX.current;
        const end = event.changedTouches[0]?.clientX;
        if (start === null || end === undefined) return;

        // Ambang 48px agar sentuhan tak sengaja tidak menggeser foto.
        if (Math.abs(end - start) > 48) go(end < start ? 1 : -1);
        touchStartX.current = null;
      }}
    >
      <div className="flex items-center justify-between px-4 py-3 text-cream">
        <span className="text-sm tabular-nums">
          {index + 1} / {items.length}
        </span>
        <button
          ref={closeRef}
          type="button"
          onClick={() => onChange(null)}
          className="flex h-11 w-11 items-center justify-center rounded-full bg-cream/10 text-xl"
          aria-label="Tutup pratinjau"
        >
          <span aria-hidden="true">✕</span>
        </button>
      </div>

      <div className="relative flex-1">
        <Image
          src={current.url}
          alt={current.caption || `Foto galeri ${index + 1}`}
          fill
          sizes="100vw"
          className="object-contain"
        />
      </div>

      <div className="flex items-center justify-between gap-3 px-4 py-4 text-cream">
        <button
          type="button"
          onClick={() => go(-1)}
          className="flex h-11 w-11 items-center justify-center rounded-full bg-cream/10 text-xl"
          aria-label="Foto sebelumnya"
        >
          <span aria-hidden="true">‹</span>
        </button>

        <p className="flex-1 text-center text-sm text-jade-100">{current.caption}</p>

        <button
          type="button"
          onClick={() => go(1)}
          className="flex h-11 w-11 items-center justify-center rounded-full bg-cream/10 text-xl"
          aria-label="Foto berikutnya"
        >
          <span aria-hidden="true">›</span>
        </button>
      </div>
    </div>
  );
}

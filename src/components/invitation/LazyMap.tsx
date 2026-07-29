'use client';

import { useEffect, useRef, useState } from 'react';

/**
 * Peta embed dimuat malas (US-06).
 *
 * iframe Google Maps berat dan akan menghancurkan LCP bila dimuat bersamaan
 * dengan halaman. Di sini iframe baru dipasang ke DOM setelah placeholder masuk
 * viewport; sebelum itu yang tampil hanyalah panel statis ringan.
 */
export function LazyMap({ embedUrl, venueName }: { embedUrl: string; venueName: string }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [shouldLoad, setShouldLoad] = useState(false);

  useEffect(() => {
    const node = containerRef.current;
    if (!node || shouldLoad) return;

    if (typeof IntersectionObserver === 'undefined') {
      setShouldLoad(true);
      return;
    }

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry?.isIntersecting) {
          setShouldLoad(true);
          observer.disconnect();
        }
      },
      // Mulai memuat sedikit sebelum benar-benar terlihat agar terasa instan.
      { rootMargin: '200px 0px' },
    );

    observer.observe(node);
    return () => observer.disconnect();
  }, [shouldLoad]);

  return (
    <div
      ref={containerRef}
      className="relative w-full overflow-hidden rounded-xl border border-jade-100 bg-jade-100"
      // Rasio dikunci sejak awal supaya tidak ada pergeseran layout (CLS ≤ 0,1).
      style={{ aspectRatio: '4 / 3' }}
    >
      {shouldLoad ? (
        <iframe
          src={embedUrl}
          title={`Peta lokasi ${venueName}`}
          loading="lazy"
          referrerPolicy="no-referrer-when-downgrade"
          className="absolute inset-0 h-full w-full border-0"
          allowFullScreen
        />
      ) : (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-jade-600">
          <span aria-hidden="true" className="text-3xl">
            🗺
          </span>
          <p className="text-sm">Memuat peta lokasi…</p>
        </div>
      )}
    </div>
  );
}

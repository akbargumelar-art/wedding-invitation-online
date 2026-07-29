'use client';

import { useEffect, useState } from 'react';

/**
 * Petal — kelopak/daun jatuh perlahan sebagai efek meriah.
 *
 * Prinsip ringan:
 *  - Maksimum 6 petal aktif bersamaan (nilai default). Setiap petal
 *    di-render sekali, animasi CSS mengulang sendiri; React tidak sibuk.
 *  - Hormati `prefers-reduced-motion` — kalau user preferensinya kurangi
 *    animasi, komponen tidak me-render apa-apa.
 *  - Kunci pola gugur ke properti CSS custom (`--petal-drift`,
 *    `--petal-spin`, `animation-duration/delay`), bukan style JS per frame.
 *
 * Dipasang di dalam {@link InvitationShell} setelah tamu buka undangan.
 */
export function PetalLayer({ count = 6 }: { count?: number }) {
  const [petals, setPetals] = useState<PetalSpec[]>([]);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    // Jangan render sama sekali untuk pengguna yang minta reduced motion.
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    if (mq.matches) return;

    // Randomize sekali di klien; SSR tidak boleh terlibat karena hydration
    // akan bertabrakan dengan angka random yang berbeda.
    const generated = Array.from({ length: count }, (_, index) => createPetal(index));
    setPetals(generated);

    // Kalau preferensi user berubah di tengah sesi, lepaskan efeknya.
    function onChange(event: MediaQueryListEvent) {
      if (event.matches) setPetals([]);
    }
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, [count]);

  if (petals.length === 0) return null;

  return (
    <div className="petal-layer" aria-hidden="true">
      {petals.map((petal) => (
        <span
          key={petal.id}
          className={petal.leaf ? 'petal leaf' : 'petal'}
          style={{
            left: `${petal.leftPct}%`,
            animationDuration: `${petal.durationS}s`,
            animationDelay: `${petal.delayS}s`,
            // CSS custom properties dipakai oleh keyframes petal-fall.
            ['--petal-drift' as string]: `${petal.driftPx}px`,
            ['--petal-spin' as string]: `${petal.spinDeg}deg`,
          }}
        />
      ))}
    </div>
  );
}

type PetalSpec = {
  id: number;
  leftPct: number;
  durationS: number;
  delayS: number;
  driftPx: number;
  spinDeg: number;
  leaf: boolean;
};

function createPetal(index: number): PetalSpec {
  // Distribusi horizontal merata, sedikit acak.
  const bucket = index / 6;
  const jitter = Math.random() * 0.15;
  const leftPct = Math.min(96, Math.max(4, (bucket + jitter) * 100));

  return {
    id: index,
    leftPct,
    // 18–28 detik per siklus — cukup pelan untuk kesan tenang.
    durationS: 18 + Math.random() * 10,
    // Delay hingga hampir satu siklus penuh — jangan semua petal turun bersamaan.
    delayS: Math.random() * 22,
    driftPx: (Math.random() * 2 - 1) * 90,
    spinDeg: 180 + Math.random() * 260,
    // Ratio kira-kira 60% kelopak gold/terracotta, 40% daun sage.
    leaf: Math.random() < 0.4,
  };
}

'use client';

import { useEffect, useState } from 'react';
import { countdownFrom, type CountdownParts } from '@/lib/date';

/** Ditampilkan sebelum jam klien dibaca — selebar dua angka, jadi kotaknya tidak melompat. */
const BELUM = '––';

/**
 * Hitung mundur menuju acara pertama (US-05).
 *
 * Target diterima sebagai epoch milidetik yang SUDAH dihitung di server memakai
 * zona Asia/Jakarta, jadi tamu di zona waktu mana pun melihat angka yang sama
 * (mitigasi R-11). Yang dilakukan di klien hanyalah mengurangi dengan Date.now().
 *
 * Server sengaja tidak ikut menghitung. Halaman undangan di-cache ISR sampai 60
 * detik, sehingga angka yang dirender di sana sudah usang sebelum sampai ke tamu
 * — satu-satunya efeknya adalah hidrasi meleset ("server rendered text didn't
 * match the client"), yang membuat React membuang dan membangun ulang seluruh
 * pohon di bawahnya. Karena itu server memasang tempat kosong dan klien
 * mengisinya pada efek pertama, dalam bingkai yang sama dengan cat pertama.
 *
 * Konsekuensinya: setelah acara lewat, kotak kosong sempat terlihat satu bingkai
 * sebelum berganti menjadi "Alhamdulillah, acara telah terlaksana". Itu sengaja
 * ditukar dengan kepastian bahwa server tidak pernah menebak jam klien.
 */
export function Countdown({ targetMs }: { targetMs: number }) {
  const [parts, setParts] = useState<CountdownParts | null>(null);

  useEffect(() => {
    setParts(countdownFrom(targetMs));
    const timer = setInterval(() => setParts(countdownFrom(targetMs)), 1000);
    return () => clearInterval(timer);
  }, [targetMs]);

  if (parts?.finished) {
    return (
      <p className="rounded-xl bg-jade-100 px-5 py-4 text-center font-display text-xl text-jade-800">
        Alhamdulillah, acara telah terlaksana
      </p>
    );
  }

  const units: Array<[string, number | null]> = [
    ['Hari', parts?.days ?? null],
    ['Jam', parts?.hours ?? null],
    ['Menit', parts?.minutes ?? null],
    ['Detik', parts?.seconds ?? null],
  ];

  return (
    <div>
      <ul className="grid grid-cols-4 gap-2 sm:gap-3" aria-hidden="true">
        {units.map(([label, value]) => (
          <li key={label} className="card px-1 py-3 text-center">
            <span className="numeric shimmer-gold block font-display text-3xl sm:text-4xl">
              {value === null ? BELUM : String(value).padStart(2, '0')}
            </span>
            <span className="mt-1 block text-[0.6875rem] tracking-wider text-ink-muted uppercase">
              {label}
            </span>
          </li>
        ))}
      </ul>

      {/* Satu ringkasan teks untuk pembaca layar, agar tidak dibacakan tiap detik. */}
      {parts ? (
        <p className="sr-only">
          {`Menuju acara: ${parts.days} hari ${parts.hours} jam ${parts.minutes} menit lagi.`}
        </p>
      ) : null}
    </div>
  );
}

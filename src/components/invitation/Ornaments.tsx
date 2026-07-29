import type { ReactElement, SVGProps } from 'react';

/**
 * Ornamen dekoratif — Islami + Sunda halus.
 *
 * Semua bentuk SVG inline (< 1 KB per bentuk, tanpa file terpisah, tanpa font
 * icon library) supaya:
 *  - Tidak menambah request HTTP tambahan.
 *  - Warna bisa di-tuning via `currentColor` — komponen pemanggil cukup
 *    mengatur `text-gold-400` / `text-sage-400` pada wrapper.
 *  - Bebas dari tema warna hardcoded; ornamennya netral, warnanya kontekstual.
 *
 * `aria-hidden="true"` default: ini murni dekorasi visual, pembaca layar
 * tidak perlu mengumumkannya.
 */

type Icon = (props: SVGProps<SVGSVGElement>) => ReactElement;

/**
 * Kembang wajit — belah ketupat bertumpuk ala pola batik/ukiran Sunda.
 * Cocok jadi aksen di header seksi atau pojok kartu.
 */
export const KembangWajit: Icon = (props) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    viewBox="0 0 40 40"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.2"
    aria-hidden="true"
    {...props}
  >
    <path d="M20 4 L36 20 L20 36 L4 20 Z" opacity="0.9" />
    <path d="M20 10 L30 20 L20 30 L10 20 Z" opacity="0.7" />
    <circle cx="20" cy="20" r="2" fill="currentColor" opacity="0.85" />
    <path d="M20 4 L20 36 M4 20 L36 20" opacity="0.35" />
  </svg>
);

/**
 * Arabesque — simpul kaligrafi Islami sederhana untuk pemisah bagian.
 * Biasanya diapit dua garis tipis pada `.ornament-divider`.
 */
export const Arabesque: Icon = (props) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    viewBox="0 0 48 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.2"
    strokeLinecap="round"
    aria-hidden="true"
    {...props}
  >
    <path d="M4 12 C 12 4, 20 20, 24 12 C 28 4, 36 20, 44 12" />
    <circle cx="24" cy="12" r="1.6" fill="currentColor" />
    <circle cx="4" cy="12" r="1" fill="currentColor" opacity="0.6" />
    <circle cx="44" cy="12" r="1" fill="currentColor" opacity="0.6" />
  </svg>
);

/**
 * Daun vine — 3 daun kecil bertangkai, aksen alami untuk pemisah antar kartu.
 */
export const DaunVine: Icon = (props) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    viewBox="0 0 32 24"
    fill="currentColor"
    aria-hidden="true"
    {...props}
  >
    <path
      d="M16 4 C 12 6, 10 10, 12 14 C 10 12, 6 14, 6 18 C 10 18, 14 14, 16 12 C 18 14, 22 18, 26 18 C 26 14, 22 12, 20 14 C 22 10, 20 6, 16 4 Z"
      opacity="0.75"
    />
    <path d="M16 4 L16 22" stroke="currentColor" strokeWidth="0.8" opacity="0.55" />
  </svg>
);

/**
 * Bismillah — teks Arab kecil, self-host via next/font (Amiri).
 * Warna via CSS class `.calli`; tidak set warna inline supaya tema global konsisten.
 */
export function BismillahMark({ className }: { className?: string }) {
  return (
    <p
      // Wrapper `.calli` menetapkan font-family Amiri + tone gold-600
      // sesuai token di globals.css.
      className={['calli text-center text-lg leading-none', className].filter(Boolean).join(' ')}
      dir="rtl"
      lang="ar"
      aria-label="Bismillahirrahmanirrahim"
    >
      بِسْمِ اللَّهِ الرَّحْمَـٰنِ الرَّحِيمِ
    </p>
  );
}

/**
 * Pemisah kaligrafi lengkap — garis tipis + arabesque emas.
 * Blok, cocok untuk header seksi atau di atas judul acara.
 */
export function ArabesqueDivider({ className }: { className?: string }) {
  return (
    <div
      className={['ornament-divider text-gold-500', className].filter(Boolean).join(' ')}
      aria-hidden="true"
    >
      <Arabesque className="h-4 w-12" />
    </div>
  );
}

/**
 * Pemisah daun — garis sage + 3 daun.
 * Cocok untuk seksi bernuansa alami (Rangkaian Acara, Denah & Rute).
 */
export function DaunDivider({ className }: { className?: string }) {
  return (
    <div className={['vine-divider', className].filter(Boolean).join(' ')} aria-hidden="true">
      <DaunVine className="h-4 w-8" />
    </div>
  );
}

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

/**
 * Mega Mendung — awan bergulung khas Cirebon/Sunda pesisir.
 *
 * Motif ini paling ikonik untuk Sunda pesisir: gulungan 5–7 lapis yang
 * berarti tenang, sabar, dan pengharapan. Dipakai sebagai backdrop halus
 * di atas cover / bawah closing, atau divider besar antar bab.
 */
export const MegaMendung: Icon = (props) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    viewBox="0 0 120 40"
    fill="none"
    stroke="currentColor"
    strokeWidth="1"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
    {...props}
  >
    {/* Baris awan bergulung — 3 kelompok, tiap kelompok punya 3 lengkung
        bertingkat dari luar ke dalam, meniru bentuk batik mega mendung. */}
    <g opacity="0.85">
      <path d="M4 30 C 10 18, 20 18, 22 30 C 24 22, 32 22, 34 30 C 36 26, 40 26, 42 30" />
      <path d="M8 30 C 12 24, 18 24, 20 30" opacity="0.7" />
    </g>
    <g opacity="0.85">
      <path d="M44 30 C 50 16, 62 16, 64 30 C 66 22, 74 22, 76 30 C 78 26, 82 26, 84 30" />
      <path d="M50 30 C 54 22, 62 22, 64 30" opacity="0.7" />
      <path d="M54 30 C 56 26, 60 26, 62 30" opacity="0.5" />
    </g>
    <g opacity="0.85">
      <path d="M84 30 C 90 18, 100 18, 102 30 C 104 22, 112 22, 114 30 C 116 26, 118 26, 118 30" />
      <path d="M88 30 C 92 24, 98 24, 100 30" opacity="0.7" />
    </g>
  </svg>
);

/**
 * Ceplok bunga — pola geometris 8-petal, motif batik ceplok klasik.
 *
 * Bentuk simetris ini sering muncul di batik keraton (Cirebon/Yogya/Solo)
 * dan ukiran mimbar masjid Sunda. Cocok jadi corner ornament kartu atau
 * pattern background yang di-repeat halus.
 */
export const CeplokBunga: Icon = (props) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    viewBox="0 0 32 32"
    fill="none"
    stroke="currentColor"
    strokeWidth="1"
    aria-hidden="true"
    {...props}
  >
    {/* 8 kelopak simetris di sekeliling pusat. */}
    <g opacity="0.85">
      {[0, 45, 90, 135, 180, 225, 270, 315].map((deg) => (
        <ellipse
          key={deg}
          cx="16"
          cy="7"
          rx="2.5"
          ry="4.5"
          transform={`rotate(${deg} 16 16)`}
        />
      ))}
    </g>
    {/* Lingkaran dalam + titik pusat. */}
    <circle cx="16" cy="16" r="3" opacity="0.75" />
    <circle cx="16" cy="16" r="1.2" fill="currentColor" />
  </svg>
);

/**
 * Pucuk daun rebung — lengkung "bamboo shoot" khas ukiran Sunda,
 * biasa dilihat di kayu kuda-kuda rumah adat & mimbar masjid pesisir.
 * Cocok sebagai corner ornament besar atau accent atas/bawah section.
 */
export const PucukRebung: Icon = (props) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    viewBox="0 0 40 60"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.1"
    strokeLinecap="round"
    aria-hidden="true"
    {...props}
  >
    {/* Bentuk kerucut lengkung — pucuk rebung klasik. */}
    <path
      d="M20 4 C 8 20, 6 36, 8 56 L 32 56 C 34 36, 32 20, 20 4 Z"
      opacity="0.6"
      fill="currentColor"
      fillOpacity="0.08"
    />
    <path d="M20 4 C 8 20, 6 36, 8 56" opacity="0.85" />
    <path d="M20 4 C 32 20, 34 36, 32 56" opacity="0.85" />
    <path d="M20 4 L 20 50" opacity="0.4" />
    {/* Ornamen lengkung dalam. */}
    <path d="M20 12 C 14 22, 12 34, 14 48" opacity="0.55" />
    <path d="M20 12 C 26 22, 28 34, 26 48" opacity="0.55" />
    {/* Titik pucuk. */}
    <circle cx="20" cy="4" r="1.4" fill="currentColor" />
  </svg>
);

/**
 * Gunungan — siluet dua pegunungan bertingkat, referensi ke lanskap tatar
 * Sunda (Priangan) yang selalu dibingkai gunung. Halus, dipakai sebagai
 * pemisah bab besar atau kaki halaman closing.
 */
export const Gunungan: Icon = (props) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    viewBox="0 0 120 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="1"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
    {...props}
  >
    {/* Dua tingkat pegunungan — belakang lebih rendah opasitas. */}
    <path
      d="M0 22 L 20 10 L 32 18 L 48 6 L 62 16 L 78 8 L 92 18 L 108 12 L 120 22"
      opacity="0.55"
    />
    <path
      d="M0 22 L 14 14 L 28 20 L 42 12 L 56 18 L 72 10 L 88 20 L 104 14 L 120 22"
      opacity="0.85"
    />
    {/* Matahari kecil di tengah. */}
    <circle cx="60" cy="6" r="1.6" fill="currentColor" opacity="0.7" />
  </svg>
);

/**
 * Pemisah Mega Mendung — versi utuh, cocok sebagai pemisah bab besar.
 */
export function MegaMendungDivider({ className }: { className?: string }) {
  return (
    <div
      className={['flex justify-center text-terracotta-400/70', className].filter(Boolean).join(' ')}
      aria-hidden="true"
    >
      <MegaMendung className="h-6 w-40" />
    </div>
  );
}

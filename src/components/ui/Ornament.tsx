/**
 * Ornamen geometris (bintang delapan / girih) dan pemisah seksi.
 *
 * Sengaja hanya berupa geometri dan floral — tidak ada penggambaran makhluk
 * bernyawa di seluruh elemen dekoratif aplikasi (US-03).
 */

export function StarOrnament({ className = '', size = 64 }: { className?: string; size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 100 100"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      aria-hidden="true"
      focusable="false"
      className={className}
    >
      <rect x="20" y="20" width="60" height="60" />
      <rect x="20" y="20" width="60" height="60" transform="rotate(45 50 50)" />
      <circle cx="50" cy="50" r="18" opacity="0.55" />
      <circle cx="50" cy="50" r="4" fill="currentColor" stroke="none" opacity="0.7" />
    </svg>
  );
}

export function ArchOrnament({ className = '' }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 200 120"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.2"
      aria-hidden="true"
      focusable="false"
      className={className}
      preserveAspectRatio="xMidYMax meet"
    >
      {/* Lengkung mihrab sederhana */}
      <path d="M20 120 V60 A80 80 0 0 1 100 8 A80 80 0 0 1 180 60 V120" />
      <path d="M34 120 V64 A66 66 0 0 1 100 22 A66 66 0 0 1 166 64 V120" opacity="0.5" />
      <path d="M100 8 L104 0 L100 -8 L96 0 Z" opacity="0.8" />
    </svg>
  );
}

/** Garis pemisah dengan bintang kecil di tengah. */
export function Divider({ className = '' }: { className?: string }) {
  return (
    <div className={`ornament-divider ${className}`} aria-hidden="true">
      <StarOrnament size={22} />
    </div>
  );
}

/** Latar berpola halus untuk seksi tertentu; murni dekoratif. */
export function PatternBackdrop({ className = '' }: { className?: string }) {
  return (
    <svg
      aria-hidden="true"
      focusable="false"
      className={className}
      width="100%"
      height="100%"
      preserveAspectRatio="none"
    >
      <defs>
        <pattern id="girih" width="56" height="56" patternUnits="userSpaceOnUse">
          <g fill="none" stroke="currentColor" strokeWidth="1">
            <rect x="14" y="14" width="28" height="28" />
            <rect x="14" y="14" width="28" height="28" transform="rotate(45 28 28)" />
          </g>
        </pattern>
      </defs>
      <rect width="100%" height="100%" fill="url(#girih)" />
    </svg>
  );
}

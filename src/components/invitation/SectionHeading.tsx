import type { ReactNode } from 'react';
import { Divider } from '@/components/ui/Ornament';
import { Reveal } from '@/components/ui/Reveal';

/**
 * Kepala seksi yang konsisten: label kecil, judul, ornamen pemisah.
 *
 * Bagian-bagiannya muncul berurutan, bukan serentak. Kepala seksi adalah hal
 * pertama yang dibaca tamu saat sebuah seksi masuk layar, dan jenjang kecil di
 * sini yang memberi ritme pada seluruh halaman — isi seksi menyusul sesudahnya
 * lewat `Reveal` masing-masing.
 */
export function SectionHeading({
  eyebrow,
  title,
  children,
}: {
  eyebrow?: string;
  title: string;
  children?: ReactNode;
}) {
  return (
    <Reveal as="header" variant="stagger" className="text-center">
      {eyebrow ? <p className="eyebrow">{eyebrow}</p> : null}
      <h2 className="mt-2 text-3xl text-jade-900 md:text-4xl">{title}</h2>
      <Divider className="mt-4" />
      {children ? <div className="mt-4 text-ink-soft">{children}</div> : null}
    </Reveal>
  );
}

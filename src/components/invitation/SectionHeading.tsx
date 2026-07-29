import type { ReactNode } from 'react';
import { Divider } from '@/components/ui/Ornament';

/** Kepala seksi yang konsisten: label kecil, judul, ornamen pemisah. */
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
    <header className="text-center">
      {eyebrow ? <p className="eyebrow">{eyebrow}</p> : null}
      <h2 className="mt-2 text-3xl text-jade-900 md:text-4xl">{title}</h2>
      <Divider className="mt-4" />
      {children ? <div className="mt-4 text-ink-soft">{children}</div> : null}
    </header>
  );
}

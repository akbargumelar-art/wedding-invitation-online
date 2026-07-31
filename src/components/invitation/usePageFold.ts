'use client';

import { useEffect, useRef, type RefObject } from 'react';

/**
 * Lipatan dua panel saat berpindah halaman di mode buku.
 *
 * Halaman dibelah di tengah: separuh kiri diam, separuh kanan berputar pada
 * engsel di garis tengah — seperti menutup lembar buku sungguhan. Sisi belakang
 * lembar ikut terlihat saat melewati 90 derajat, dan itulah yang membuat
 * gerakannya terbaca sebagai kertas, bukan kartu yang berputar.
 *
 * ## Kenapa memakai salinan, bukan halaman aslinya
 *
 * Membelah sebuah elemen menjadi dua panel menuntut isinya dirender DUA KALI,
 * masing-masing dipotong separuh. Untuk halaman undangan itu tidak dapat
 * dilakukan begitu saja: seksi RSVP memuat formulir dengan `id` yang dirujuk
 * `<label for>`, dan menggandakannya menghasilkan dua formulir kembar — label
 * menunjuk ke kolom yang salah, dan tamu bisa mengetik di salinan yang tidak
 * pernah terkirim.
 *
 * Karena itu yang dibelah adalah SALINAN visual yang dibuat sesaat, dengan
 * seluruh `id`, `name`, dan `for` dilucuti serta ditandai `aria-hidden`. Ia
 * hidup selama animasi lalu dibuang. Halaman yang sesungguhnya tetap satu, tetap
 * interaktif, dan tidak pernah tersentuh.
 *
 * Salinan sengaja dibuat lewat `cloneNode` alih-alih merender ulang komponennya:
 * merender ulang berarti seluruh state di dalam seksi (isian yang setengah
 * diketik, akordeon yang terbuka) kembali ke keadaan awal, dan lipatannya akan
 * memperlihatkan halaman yang berbeda dari yang barusan dilihat tamu.
 */

const FOLD_MS = 750;

function prefersReducedMotion(): boolean {
  return (
    typeof window !== 'undefined' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches
  );
}

/** Buang segala atribut yang tidak boleh kembar di dalam satu dokumen. */
function sanitizeClone(clone: HTMLElement): void {
  clone.removeAttribute('id');
  clone.removeAttribute('data-state');
  clone.removeAttribute('data-page');
  clone.removeAttribute('inert');
  clone.removeAttribute('aria-label');

  for (const node of clone.querySelectorAll('[id]')) node.removeAttribute('id');
  for (const node of clone.querySelectorAll('[for]')) node.removeAttribute('for');
  for (const node of clone.querySelectorAll('[name]')) node.removeAttribute('name');
  for (const node of clone.querySelectorAll('[aria-labelledby]')) {
    node.removeAttribute('aria-labelledby');
  }
  for (const node of clone.querySelectorAll('[aria-describedby]')) {
    node.removeAttribute('aria-describedby');
  }

  clone.setAttribute('aria-hidden', 'true');
}

function buildPanel(source: HTMLElement, side: 'left' | 'right'): HTMLElement {
  const panel = document.createElement('div');
  panel.className = `book-fold-panel book-fold-${side}`;

  const clip = document.createElement('div');
  clip.className = 'book-fold-clip';

  const clone = source.cloneNode(true) as HTMLElement;
  sanitizeClone(clone);
  clip.appendChild(clone);

  const face = document.createElement('div');
  face.className = 'book-fold-face';
  face.appendChild(clip);

  // Sisi belakang kertas: kosong, sedikit lebih gelap. Tanpa ini lembar
  // menghilang begitu melewati 90 derajat, dan gerakannya kehilangan seluruh
  // kesan bendanya — yang tampak hanya gambar yang memudar.
  const back = document.createElement('div');
  back.className = 'book-fold-back';

  panel.append(face, back);
  return panel;
}

export type FoldDirection = 'forward' | 'backward';

/**
 * Pasang lipatan setiap kali indeks halaman berubah.
 *
 * `pageRefs` menunjuk seluruh elemen halaman; yang dilipat adalah halaman yang
 * DITINGGALKAN saat maju, dan halaman yang DITUJU saat mundur — sisi kertas yang
 * bergerak pada kedua arah itu memang lembar yang sama.
 */
export function usePageFold({
  stageRef,
  pageRefs,
  index,
  enabled,
}: {
  stageRef: RefObject<HTMLDivElement | null>;
  pageRefs: RefObject<Array<HTMLElement | null>>;
  index: number;
  enabled: boolean;
}): void {
  const previousIndex = useRef(index);

  useEffect(() => {
    const from = previousIndex.current;
    previousIndex.current = index;

    const stage = stageRef.current;
    if (!enabled || stage === null || from === index) return;
    if (prefersReducedMotion()) return;

    const direction: FoldDirection = index > from ? 'forward' : 'backward';
    const source = pageRefs.current?.[direction === 'forward' ? from : index] ?? null;
    if (!source) return;

    const fold = document.createElement('div');
    fold.className = 'book-fold';
    fold.dataset['direction'] = direction;
    fold.setAttribute('aria-hidden', 'true');

    fold.append(buildPanel(source, 'left'), buildPanel(source, 'right'));
    stage.appendChild(fold);

    // Posisi gulir ikut disalin: seksi yang panjang mungkin sedang dibaca di
    // tengah, dan lipatan yang memperlihatkan bagian atasnya akan terbaca
    // sebagai halaman melompat sesaat sebelum berbalik.
    for (const clone of fold.querySelectorAll<HTMLElement>('.book-fold-clip > *')) {
      clone.scrollTop = source.scrollTop;
    }

    // Selama lipatan berjalan, halaman aslinya disembunyikan tanpa transisi —
    // kalau tidak, tamu melihat dua lembar bergerak sekaligus.
    stage.dataset['folding'] = 'true';

    const cleanup = (): void => {
      fold.remove();
      delete stage.dataset['folding'];
    };

    const timer = setTimeout(cleanup, FOLD_MS);

    return () => {
      clearTimeout(timer);
      cleanup();
    };
  }, [index, enabled, stageRef, pageRefs]);
}

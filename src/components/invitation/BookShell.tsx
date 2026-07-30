'use client';

import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';

export type BookPage = {
  /** Sama dengan id seksi di dalamnya, supaya tautan #anchor tetap bekerja. */
  id: string;
  /** Dipakai untuk label titik navigasi dan pengumuman pembaca layar. */
  title: string;
  node: ReactNode;
};

export type ViewMode = 'book' | 'scroll';

const STORAGE_KEY = 'walimah:view';

/** Jarak minimum sebuah sentuhan dianggap gestur balik halaman, bukan ketukan. */
const SWIPE_MIN_PX = 60;

/**
 * Sentuhan yang lebih condong vertikal adalah usaha menggulir isi halaman.
 * Rasio 1,5 memberi ruang untuk jari yang tidak lurus tanpa membalik halaman
 * saat tamu sebenarnya sedang membaca ke bawah.
 */
const SWIPE_AXIS_RATIO = 1.5;

function readStoredMode(): ViewMode | null {
  try {
    const value = localStorage.getItem(STORAGE_KEY);
    return value === 'book' || value === 'scroll' ? value : null;
  } catch {
    // Safari mode privat melempar saat localStorage disentuh.
    return null;
  }
}

function storeMode(mode: ViewMode): void {
  try {
    localStorage.setItem(STORAGE_KEY, mode);
  } catch {
    // Preferensi tampilan tidak sepenting isi undangan; abaikan bila gagal.
  }
}

/**
 * Dua tampilan untuk isi undangan yang sama.
 *
 * `book` — tiap seksi menjadi satu halaman setinggi layar, dibalik dengan geser,
 * ketuk, atau panah papan ketik. Tidak ada scroll halaman sama sekali.
 * `scroll` — seksi mengalir seperti dokumen biasa.
 *
 * Keduanya memakai markup yang sama persis: seksi tetap Server Component dan
 * masuk lewat `pages[].node`. Yang berbeda hanya tata letaknya, jadi tidak ada
 * satu pun konten yang perlu ditulis dua kali. Mode gulir sengaja dipertahankan
 * sebagai jalan keluar untuk tamu yang memakai pembaca layar atau merasa
 * animasi membalik halaman mengganggu.
 */
export function BookShell({
  pages,
  active,
  isDraft,
}: {
  pages: BookPage[];
  /** Undangan sudah dibuka (sampul tersingkap). */
  active: boolean;
  isDraft: boolean;
}) {
  const [mode, setMode] = useState<ViewMode>('book');
  const [index, setIndex] = useState(0);

  const pageRefs = useRef<(HTMLDivElement | null)[]>([]);
  const touchStart = useRef<{ x: number; y: number } | null>(null);
  const dragStart = useRef<{ x: number; y: number } | null>(null);
  /** True hanya bila perpindahan dipicu tamu — supaya fokus tidak dicuri saat muat. */
  const navigated = useRef(false);

  const pageCount = pages.length;
  const current = pages[index];

  // Preferensi tersimpan dibaca setelah mount. Tidak ada kedipan yang terlihat:
  // sampul masih menutup seluruh layar sampai tamu menekan "Buka Undangan".
  useEffect(() => {
    const stored = readStoredMode();
    if (stored) setMode(stored);
  }, []);

  // Mode buku mengunci scroll dokumen, dan tombol musik harus naik agar tidak
  // tertutup bilah navigasi. Keduanya butuh penanda di <body>.
  useEffect(() => {
    document.body.dataset.view = mode;
    return () => {
      delete document.body.dataset.view;
    };
  }, [mode]);

  const go = useCallback(
    (delta: number) => {
      setIndex((currentIndex) => {
        if (pageCount === 0) return currentIndex;
        // Wrap-around: halaman terakhir + panah kanan → halaman awal, dan
        // sebaliknya. Modulo positif menjamin hasil selalu 0..pageCount-1
        // untuk delta negatif sekalipun.
        const next = ((currentIndex + delta) % pageCount + pageCount) % pageCount;
        if (next !== currentIndex) navigated.current = true;
        return next;
      });
    },
    [pageCount],
  );

  const goTo = useCallback((target: number) => {
    navigated.current = true;
    setIndex(target);
  }, []);

  /**
   * Ambang bersama untuk sapuan jari dan seretan tetikus.
   *
   * Mengembalikan true bila gestur benar-benar membalik halaman, sehingga
   * pemanggilnya dapat merapikan efek samping gestur itu.
   */
  const resolveSwipe = useCallback(
    (
      start: { x: number; y: number },
      endX: number,
      endY: number,
      target: EventTarget | null,
    ): boolean => {
      if (mode !== 'book') return false;

      // Lightbox galeri punya gestur gesernya sendiri.
      if ((target as HTMLElement | null)?.closest('[data-swipe-ignore]')) return false;

      const dx = endX - start.x;
      const dy = endY - start.y;
      if (Math.abs(dx) < SWIPE_MIN_PX) return false;
      if (Math.abs(dx) < Math.abs(dy) * SWIPE_AXIS_RATIO) return false;

      go(dx < 0 ? 1 : -1);
      return true;
    },
    [go, mode],
  );

  // Halaman baru selalu dimulai dari atas; fokus ikut berpindah agar tamu yang
  // memakai papan ketik atau pembaca layar tidak tertinggal di halaman lama.
  useEffect(() => {
    const node = pageRefs.current[index];
    if (!node) return;

    node.scrollTop = 0;
    if (navigated.current && mode === 'book') {
      navigated.current = false;
      node.focus({ preventScroll: true });
    }
  }, [index, mode]);

  useEffect(() => {
    if (mode !== 'book' || !active) return;

    function onKeyDown(event: KeyboardEvent) {
      if (event.defaultPrevented || event.metaKey || event.ctrlKey || event.altKey) return;

      // Panah di dalam isian formulir, atau saat lightbox galeri terbuka, milik
      // komponen itu — bukan navigasi halaman.
      const target = event.target as HTMLElement | null;
      if (target?.closest('input, textarea, select, [data-swipe-ignore]')) return;

      if (event.key === 'ArrowRight' || event.key === 'PageDown') go(1);
      else if (event.key === 'ArrowLeft' || event.key === 'PageUp') go(-1);
      else return;

      event.preventDefault();
    }

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [mode, active, go]);

  const switchMode = useCallback(
    (next: ViewMode) => {
      setMode(next);
      storeMode(next);

      if (next === 'scroll') {
        // Jangan lempar tamu kembali ke atas: bawa mereka ke seksi yang sedang
        // dibaca di mode buku.
        const id = pages[index]?.id;
        requestAnimationFrame(() => {
          if (id) document.getElementById(id)?.scrollIntoView({ block: 'start' });
        });
        return;
      }

      // Arah sebaliknya: lembar yang dibuka adalah seksi yang paling banyak
      // mengisi layar. Memakai "seksi terakhir yang puncaknya sudah lewat" akan
      // salah untuk seksi panjang yang baru tersembul sedikit di bawah.
      let found = 0;
      let widest = 0;

      pages.forEach((page, position) => {
        const element = document.getElementById(page.id);
        if (!element) return;

        const rect = element.getBoundingClientRect();
        const visible = Math.min(rect.bottom, window.innerHeight) - Math.max(rect.top, 0);
        if (visible > widest) {
          widest = visible;
          found = position;
        }
      });

      setIndex(found);
    },
    [index, pages],
  );

  return (
    <div className="book-root" data-view={mode} data-draft={isDraft ? 'true' : 'false'}>
      <ViewToggle mode={mode} onSwitch={switchMode} isDraft={isDraft} />

      <div
        className="book-stage"
        onTouchStart={(event) => {
          const touch = event.touches[0];
          touchStart.current = touch ? { x: touch.clientX, y: touch.clientY } : null;
        }}
        onTouchEnd={(event) => {
          const start = touchStart.current;
          touchStart.current = null;

          const touch = event.changedTouches[0];
          if (start && touch) resolveSwipe(start, touch.clientX, touch.clientY, event.target);
        }}
        // Menyeret dengan tetikus melakukan hal yang sama seperti menyapu layar.
        // Sentuhan sengaja disaring keluar di sini: peramban membangkitkan event
        // pointer DAN event sentuh untuk satu jari yang sama, dan menangani
        // keduanya membuat satu sapuan terhitung dua kali — halaman melompat dua
        // langkah.
        onPointerDown={(event) => {
          if (event.pointerType !== 'mouse' || event.button !== 0) return;
          dragStart.current = { x: event.clientX, y: event.clientY };
        }}
        onPointerUp={(event) => {
          const start = dragStart.current;
          dragStart.current = null;

          if (event.pointerType !== 'mouse' || !start) return;

          if (resolveSwipe(start, event.clientX, event.clientY, event.target)) {
            // Menyeret melintasi teks ikut menyorotnya; sorotan itu tidak ada
            // kaitannya dengan membalik halaman, jadi dibersihkan.
            window.getSelection()?.removeAllRanges();
          }
        }}
      >
        {pages.map((page, position) => (
          <div
            key={page.id}
            ref={(node) => {
              pageRefs.current[position] = node;
            }}
            className="book-page"
            data-page={page.id}
            data-state={position === index ? 'active' : position < index ? 'prev' : 'next'}
            // Halaman yang tidak aktif dikeluarkan dari urutan tab dan dari
            // pembaca layar — kalau tidak, tamu bisa menyusuri formulir yang
            // tidak terlihat.
            inert={mode === 'book' && position !== index}
            tabIndex={-1}
            aria-label={mode === 'book' ? `${page.title} — halaman ${position + 1}` : undefined}
          >
            {page.node}
          </div>
        ))}
      </div>

      {mode === 'book' ? (
        <>
          <p aria-live="polite" className="sr-only">
            {current ? `Halaman ${index + 1} dari ${pageCount}: ${current.title}` : ''}
          </p>

          <BookNav index={index} pages={pages} onGo={go} onGoTo={goTo} />
        </>
      ) : null}
    </div>
  );
}

function ViewToggle({
  mode,
  onSwitch,
  isDraft,
}: {
  mode: ViewMode;
  onSwitch: (next: ViewMode) => void;
  isDraft: boolean;
}) {
  const book = mode === 'book';

  return (
    <button
      type="button"
      onClick={() => onSwitch(book ? 'scroll' : 'book')}
      className={[
        'fixed right-4 z-40 flex items-center gap-1.5 rounded-full border border-jade-200',
        'bg-parchment/90 px-3.5 py-2 text-xs font-semibold text-jade-800 shadow-[var(--shadow-soft)]',
        'backdrop-blur-sm transition-transform active:scale-95',
        // Banner mode dummy melayang di baris teratas; tombol harus turun.
        isDraft ? 'top-11 sm:top-10' : 'top-4',
      ].join(' ')}
    >
      <span aria-hidden="true">{book ? '📜' : '📖'}</span>
      {book ? 'Mode gulir' : 'Mode buku'}
    </button>
  );
}

function BookNav({
  index,
  pages,
  onGo,
  onGoTo,
}: {
  index: number;
  pages: BookPage[];
  onGo: (delta: number) => void;
  onGoTo: (target: number) => void;
}) {
  const last = pages.length - 1;
  const isFirst = index === 0;
  const isLast = index === last;

  return (
    <nav aria-label="Navigasi halaman undangan" className="book-nav">
      {/* Panah melayang di tepi kiri dan kanan, sejajar tengah layar — posisi
          jempol saat ponsel dipegang satu tangan. Keduanya tetap anak <nav> ini
          supaya seluruh navigasi halaman berada dalam satu landmark, tetapi
          harus di luar `.book-nav-bar`: `backdrop-filter` pada bilah itu
          menjadikannya containing block, dan `top: 50%` akan dihitung terhadap
          tinggi bilah, bukan tinggi layar.

          Wrap-around aktif: di halaman pertama, panah kiri membawa tamu ke
          halaman terakhir; di halaman terakhir, panah kanan kembali ke
          halaman pertama. Panah tidak pernah disabled. */}
      <button
        type="button"
        onClick={() => onGo(-1)}
        aria-label={isFirst ? 'Kembali ke halaman terakhir' : 'Halaman sebelumnya'}
        className="book-arrow book-arrow-prev"
      >
        <span aria-hidden="true">‹</span>
      </button>

      <button
        type="button"
        onClick={() => onGo(1)}
        aria-label={isLast ? 'Kembali ke halaman awal' : 'Halaman berikutnya'}
        className="book-arrow book-arrow-next"
      >
        <span aria-hidden="true">›</span>
      </button>

      <div className="book-nav-bar">
        <ol className="flex flex-wrap items-center justify-center gap-1.5">
          {pages.map((page, position) => (
            <li key={page.id} className="flex">
              <button
                type="button"
                onClick={() => onGoTo(position)}
                aria-label={`Ke halaman ${position + 1}: ${page.title}`}
                aria-current={position === index ? 'true' : undefined}
                className="book-dot"
                data-active={position === index ? 'true' : 'false'}
              />
            </li>
          ))}
        </ol>

        <p className="numeric mt-1 text-center text-[0.6875rem] leading-none text-ink-muted">
          {index === 0 ? 'Geser atau ketuk panah untuk membalik' : `${index + 1} / ${pages.length}`}
        </p>
      </div>
    </nav>
  );
}

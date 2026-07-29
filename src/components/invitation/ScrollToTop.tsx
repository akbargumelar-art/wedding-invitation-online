'use client';

import { useEffect, useState } from 'react';

/**
 * Tombol melayang "kembali ke atas" untuk mode gulir.
 *
 * Muncul hanya di mode gulir (dibedakan lewat `document.body.dataset.view`
 * yang di-set oleh {@link BookShell}), dan hanya setelah tamu menggulir lebih
 * dari ambang minimum — jadi tidak menutupi konten saat halaman baru dibuka.
 *
 * Mode buku memiliki navigasi halamannya sendiri (panah + titik) sehingga
 * tombol ini sengaja tidak ditampilkan agar tidak berbenturan dengan bilah
 * navigasi bawah.
 */
const SHOW_AFTER_PX = 320;

export function ScrollToTop() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    function evaluate() {
      const view = document.body.dataset.view;
      // Mode buku memakai body scroll-locked; tidak butuh tombol ini.
      if (view !== 'scroll') {
        setVisible(false);
        return;
      }
      setVisible(window.scrollY > SHOW_AFTER_PX);
    }

    evaluate();
    window.addEventListener('scroll', evaluate, { passive: true });

    // BookShell mengubah dataset.view via useEffect setelah preferensi
    // dibaca dari localStorage; observasi perubahan atributnya supaya tombol
    // langsung hilang/timbul saat mode di-toggle.
    const observer = new MutationObserver(evaluate);
    observer.observe(document.body, {
      attributes: true,
      attributeFilter: ['data-view'],
    });

    return () => {
      window.removeEventListener('scroll', evaluate);
      observer.disconnect();
    };
  }, []);

  if (!visible) return null;

  return (
    <button
      type="button"
      onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
      aria-label="Kembali ke atas halaman"
      className={[
        // Kiri-bawah karena tombol mute musik (AudioPlayer) menempati
        // right-4 bottom-4. Menaruh keduanya di sisi kanan akan menumpuk.
        'fixed bottom-4 left-4 z-40 flex h-11 w-11 items-center justify-center',
        'rounded-full border border-gold-300/60 bg-gradient-to-b from-gold-300 to-gold-500',
        'text-jade-900 shadow-[0_6px_20px_-8px_rgba(178,140,64,0.55)] ring-1 ring-gold-300/40',
        'transition-transform active:scale-95 hover:brightness-105',
      ].join(' ')}
    >
      <span aria-hidden="true" className="text-xl leading-none">↑</span>
    </button>
  );
}

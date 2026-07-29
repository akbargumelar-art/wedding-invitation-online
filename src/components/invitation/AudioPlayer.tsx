'use client';

import { useEffect, useRef, useState } from 'react';

const STORAGE_KEY = 'walimah:muted';

/**
 * Backsound (US-09).
 *
 * Elemen <audio> baru dibuat setelah tamu menekan "Buka Undangan" — sebelum itu
 * tidak ada satu byte pun audio yang diunduh. Ini sekaligus menghormati
 * kebijakan autoplay browser dan menghemat kuota tamu.
 */
export function AudioPlayer({ src, active }: { src: string; active: boolean }) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [muted, setMuted] = useState(false);
  const [ready, setReady] = useState(false);

  // Preferensi mute bertahan selama sesi.
  useEffect(() => {
    setMuted(sessionStorage.getItem(STORAGE_KEY) === 'true');
  }, []);

  useEffect(() => {
    if (!active) return;

    let audio = audioRef.current;
    if (!audio) {
      audio = new Audio(src);
      audio.loop = true;
      audio.volume = 0.45;
      audio.preload = 'auto';
      audioRef.current = audio;
    }

    audio.muted = muted;
    setReady(true);

    if (!muted) {
      // Pemutaran bisa ditolak browser meski dipicu gestur; itu bukan galat fatal.
      void audio.play().catch(() => undefined);
    } else {
      audio.pause();
    }
  }, [active, muted, src]);

  // Hentikan dan lepaskan sumber daya saat komponen dilepas.
  useEffect(
    () => () => {
      audioRef.current?.pause();
      audioRef.current = null;
    },
    [],
  );

  if (!active) return null;

  const toggle = () => {
    setMuted((current) => {
      const next = !current;
      sessionStorage.setItem(STORAGE_KEY, String(next));
      return next;
    });
  };

  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={muted ? 'Nyalakan musik latar' : 'Matikan musik latar'}
      aria-pressed={muted}
      className="audio-toggle fixed right-4 bottom-4 z-40 flex h-12 w-12 items-center justify-center rounded-full border border-jade-200 bg-parchment text-jade-800 shadow-[var(--shadow-lift)] transition-transform active:scale-95"
    >
      <span aria-hidden="true" className="text-lg">
        {muted || !ready ? '🔇' : '🎵'}
      </span>
    </button>
  );
}

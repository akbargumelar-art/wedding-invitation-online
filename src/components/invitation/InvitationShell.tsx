'use client';

import { useCallback, useEffect, useState } from 'react';
import { Cover, type CoverProps } from './Cover';
import { AudioPlayer } from './AudioPlayer';
import { BookShell, type BookPage } from './BookShell';

/**
 * Kerangka undangan: menahan scroll sampai tamu menekan "Buka Undangan",
 * lalu membuka kunci dan memulai backsound (US-02 / US-09).
 *
 * Seluruh isi undangan tetap dirender sebagai Server Component dan diteruskan
 * lewat `pages` — hanya lapisan interaksi tipis ini yang berjalan di klien.
 * `BookShell` yang memutuskan halaman-halaman itu ditumpuk seperti buku atau
 * dialirkan sebagai satu dokumen panjang.
 */
export function InvitationShell({
  cover,
  backsoundUrl,
  trackSlug,
  pages,
}: {
  cover: CoverProps;
  backsoundUrl: string;
  trackSlug: string | null;
  pages: BookPage[];
}) {
  const [opened, setOpened] = useState(false);

  // Kunci body sejak render pertama di klien; dibuka saat tamu menekan tombol.
  useEffect(() => {
    document.body.dataset.locked = opened ? 'false' : 'true';
    return () => {
      document.body.dataset.locked = 'false';
    };
  }, [opened]);

  // Catat kunjungan sekali per pemuatan halaman, setelah undangan dibuka.
  useEffect(() => {
    if (!opened) return;

    const controller = new AbortController();
    void fetch('/api/track', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ slug: trackSlug }),
      signal: controller.signal,
      keepalive: true,
    }).catch(() => {
      // Statistik kunjungan bersifat opsional; kegagalan diabaikan diam-diam.
    });

    return () => controller.abort();
  }, [opened, trackSlug]);

  const handleOpen = useCallback(() => {
    setOpened(true);
    // Di mode buku halaman pertama sudah pas di layar; di mode gulir tamu perlu
    // dibawa turun melewati sampul. Menggulir ke #salam benar untuk keduanya —
    // pada mode buku seksi itu memang sudah berada di puncak panggung.
    requestAnimationFrame(() => {
      document.getElementById('salam')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  }, []);

  return (
    <>
      <Cover {...cover} opened={opened} onOpen={handleOpen} />

      {/* `inert` (bukan aria-hidden) dipakai supaya isi undangan tidak dapat
          difokuskan selama cover masih menutup, tanpa memicu temuan
          "aria-hidden berisi elemen fokusable" di audit aksesibilitas. */}
      <main id="undangan" inert={!opened}>
        <BookShell pages={pages} active={opened} isDraft={cover.isDraft} />
      </main>

      {backsoundUrl ? <AudioPlayer src={backsoundUrl} active={opened} /> : null}
    </>
  );
}

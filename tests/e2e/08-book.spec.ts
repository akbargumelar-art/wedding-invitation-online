import { expect, test, type Page } from '@playwright/test';
import { openCover, resetConfig, setView } from './helpers';

/**
 * Mode buku: undangan dibaca selembar demi selembar, tanpa scroll dokumen.
 *
 * Berkas ini sengaja tidak mengirim satu pun formulir. Anggaran rate limit RSVP
 * (5 per 10 menit per IP) sudah habis dipakai 01-invitation dan 02-api; menambah
 * kiriman di sini akan membuat berkas lain gagal tergantung urutan jalannya.
 */

const PAGE_IDS = ['salam', 'mempelai', 'jadwal', 'lokasi', 'galeri', 'rsvp', 'ucapan', 'amplop', 'penutup'];

/** Id lembar yang sedang aktif. */
async function activePage(page: Page): Promise<string | null> {
  return page.locator('.book-page[data-state="active"]').getAttribute('data-page');
}

/**
 * Geser horizontal sungguhan.
 *
 * Playwright hanya menyediakan `touchscreen.tap()`, jadi rangkaian sentuhannya
 * disusun manual. React memasang listener di akar dokumen, sehingga event yang
 * menggelembung dari panggung tetap tertangkap.
 */
async function swipe(page: Page, direction: 'left' | 'right'): Promise<void> {
  await page.evaluate((dir) => {
    const stage = document.querySelector('.book-stage');
    if (!stage) throw new Error('Panggung buku tidak ditemukan');

    const [from, to] = dir === 'left' ? [260, 60] : [60, 260];

    const build = (type: string, x: number) => {
      const touch = new Touch({ identifier: 1, target: stage, clientX: x, clientY: 300 });
      return new TouchEvent(type, {
        bubbles: true,
        cancelable: true,
        touches: type === 'touchend' ? [] : [touch],
        changedTouches: [touch],
      });
    };

    stage.dispatchEvent(build('touchstart', from!));
    stage.dispatchEvent(build('touchend', to!));
  }, direction);
}

/**
 * Bawa satu seksi ke tengah layar dan pastikan ia benar-benar berhenti di sana.
 *
 * Sekali `scrollIntoView` tidak cukup: seksi memakai `content-visibility: auto`,
 * sehingga tinggi seksi di atasnya baru diketahui saat dilewati dan targetnya
 * ikut bergeser di tengah jalan. Mengulang gulir sampai selisihnya kecil jauh
 * lebih tahan banting daripada menunggu satu angka tertentu.
 */
async function centerSection(page: Page, id: string): Promise<void> {
  await expect
    .poll(
      async () =>
        page.evaluate((target) => {
          const element = document.getElementById(target);
          if (!element) return Number.POSITIVE_INFINITY;

          // `instant` mengabaikan `scroll-behavior: smooth` milik dokumen, jadi
          // tiap putaran mengukur posisi akhir, bukan posisi di tengah animasi.
          element.scrollIntoView({ block: 'center', behavior: 'instant' as ScrollBehavior });

          const rect = element.getBoundingClientRect();
          return Math.abs((rect.top + rect.bottom) / 2 - window.innerHeight / 2);
        }, id),
      { message: `seksi #${id} tidak berhenti di tengah layar` },
    )
    .toBeLessThan(40);
}

/**
 * Tunggu lembar aktif berhenti berputar.
 *
 * Selama animasi membalik, lembar yang masuk masih membawa `rotateY`, sehingga
 * `getBoundingClientRect()` setiap anaknya mengembalikan proyeksi 3D — jauh lebih
 * lebar dari posisi akhirnya. Mengukur tata letak sebelum ini selesai berarti
 * mengukur bayangan.
 */
async function settle(page: Page): Promise<void> {
  await page.waitForFunction(() => {
    const active = document.querySelector('.book-page[data-state="active"]');
    if (!active) return false;

    const transform = getComputedStyle(active).transform;
    return transform === 'none' || transform === 'matrix(1, 0, 0, 1, 0, 0)';
  });
}

test.describe('Mode buku', () => {
  test.beforeAll(async ({ request }) => {
    await resetConfig(request);
  });

  test('menjadi tampilan bawaan dan hanya menampilkan satu lembar', async ({ page }) => {
    await page.goto('/to/budi-santoso');
    await openCover(page);

    await expect(page.locator('body')).toHaveAttribute('data-view', 'book');
    await expect(page.locator('.book-page[data-state="active"]')).toHaveCount(1);
    expect(await activePage(page)).toBe('salam');

    await expect(page.getByRole('navigation', { name: 'Navigasi halaman undangan' })).toBeVisible();
    await expect(page.getByText('Geser atau ketuk panah untuk membalik')).toBeVisible();
  });

  test('menghapus scroll dokumen sepenuhnya', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/to/budi-santoso');
    await openCover(page);

    // Inti permintaan: tidak ada lagi halaman panjang untuk digulir.
    const overflow = await page.evaluate(
      () => document.documentElement.scrollHeight - document.documentElement.clientHeight,
    );
    expect(overflow).toBeLessThanOrEqual(1);
  });

  test('lembar yang tidak aktif tidak dapat difokuskan', async ({ page }) => {
    await page.goto('/to/budi-santoso');
    await openCover(page);

    // Tanpa `inert`, tamu bisa menyusuri formulir RSVP dengan Tab padahal
    // lembarnya tidak terlihat.
    await expect(page.locator('.book-page[data-page="rsvp"]')).toHaveAttribute('inert', '');
    await expect(page.locator('.book-page[data-page="salam"]')).not.toHaveAttribute('inert', '');
  });

  test('tombol berikutnya dan sebelumnya membalik lembar', async ({ page }) => {
    await page.goto('/to/budi-santoso');
    await openCover(page);

    const next = page.getByRole('button', { name: 'Halaman berikutnya' });
    const previous = page.getByRole('button', { name: 'Halaman sebelumnya' });

    // Di lembar pertama tidak ada halaman sebelumnya.
    await expect(previous).toBeDisabled();

    await next.click();
    expect(await activePage(page)).toBe('mempelai');
    await expect(page.getByRole('heading', { name: 'Kedua Mempelai' })).toBeVisible();

    await previous.click();
    expect(await activePage(page)).toBe('salam');
    await expect(previous).toBeDisabled();
  });

  test('tombol berikutnya mati di lembar terakhir', async ({ page }) => {
    await page.goto('/to/budi-santoso');
    await openCover(page);

    const next = page.getByRole('button', { name: 'Halaman berikutnya' });
    const total = await page.locator('.book-page').count();

    for (let step = 0; step < total - 1; step += 1) await next.click();

    expect(await activePage(page)).toBe('penutup');
    await expect(next).toBeDisabled();
  });

  test('titik navigasi melompat langsung ke lembar tujuan', async ({ page }) => {
    await page.goto('/to/budi-santoso');
    await openCover(page);

    await page.getByRole('button', { name: /Ke halaman \d+: Amplop/ }).click();

    expect(await activePage(page)).toBe('amplop');
    await expect(page.getByRole('button', { name: 'Kirim Hadiah' })).toBeVisible();
  });

  test('panah papan ketik membalik lembar', async ({ page }) => {
    await page.goto('/to/budi-santoso');
    await openCover(page);

    await page.keyboard.press('ArrowRight');
    expect(await activePage(page)).toBe('mempelai');

    await page.keyboard.press('ArrowLeft');
    expect(await activePage(page)).toBe('salam');
  });

  test('geser ke kiri dan ke kanan membalik lembar', async ({ page }) => {
    await page.goto('/to/budi-santoso');
    await openCover(page);

    await swipe(page, 'left');
    expect(await activePage(page)).toBe('mempelai');

    await swipe(page, 'right');
    expect(await activePage(page)).toBe('salam');
  });

  test('satu sapuan hanya membalik satu lembar', async ({ page }) => {
    await page.goto('/to/budi-santoso');
    await openCover(page);

    // Satu jari membangkitkan event sentuh DAN event pointer. Bila keduanya
    // ditangani, satu sapuan melompat dua halaman sekaligus.
    await swipe(page, 'left');
    expect(await activePage(page)).toBe('mempelai');
  });

  test('menyeret dengan tetikus juga membalik lembar', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/to/budi-santoso');
    await openCover(page);

    const stage = (await page.locator('.book-stage').boundingBox())!;
    // Sepertiga atas: jauh dari panah di tepi yang duduk di tengah layar.
    const y = stage.y + stage.height * 0.33;

    await page.mouse.move(stage.x + stage.width - 80, y);
    await page.mouse.down();
    await page.mouse.move(stage.x + 80, y, { steps: 12 });
    await page.mouse.up();

    expect(await activePage(page)).toBe('mempelai');

    // Arah sebaliknya kembali ke lembar semula.
    await page.mouse.move(stage.x + 80, y);
    await page.mouse.down();
    await page.mouse.move(stage.x + stage.width - 80, y, { steps: 12 });
    await page.mouse.up();

    expect(await activePage(page)).toBe('salam');
  });

  test('mengklik tanpa menyeret tidak membalik lembar', async ({ page }) => {
    await page.goto('/to/budi-santoso');
    await openCover(page);

    // Ketukan biasa pada isi undangan harus tetap ketukan biasa.
    await page.locator('.book-page[data-state="active"] .container-invite').click({ position: { x: 10, y: 10 } });
    expect(await activePage(page)).toBe('salam');
  });

  test('urutan lembar mengikuti urutan seksi undangan', async ({ page }) => {
    await page.goto('/to/budi-santoso');
    await openCover(page);

    const ids = await page.locator('.book-page').evaluateAll((nodes) =>
      nodes.map((node) => node.getAttribute('data-page')),
    );

    // Lembar boleh hilang bila datanya kosong, tetapi tidak boleh bertukar urutan.
    expect(ids).toEqual(PAGE_IDS.filter((id) => ids.includes(id)));
    expect(ids).toContain('salam');
    expect(ids).toContain('penutup');
  });

  test('tidak ada geser horizontal di lembar mana pun pada 320px', async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 568 });
    await page.goto('/to/budi-santoso');
    await openCover(page);

    const next = page.getByRole('button', { name: 'Halaman berikutnya' });
    const total = await page.locator('.book-page').count();

    for (let step = 0; step < total; step += 1) {
      const id = await activePage(page);
      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
      );
      expect(overflow, `lembar ${id}`).toBeLessThanOrEqual(1);

      if (step < total - 1) await next.click();
    }
  });

  test('bilah navigasi tidak menutupi isi lembar terpanjang', async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 568 });
    await page.goto('/to/budi-santoso');
    await openCover(page);

    await page.getByRole('button', { name: /Ke halaman \d+: Konfirmasi/ }).click();

    const sheet = page.locator('.book-page[data-state="active"]');
    // Bilah bawahnya sendiri, bukan landmark <nav> yang membungkusnya —
    // pembungkus itu setinggi layar penuh supaya panah di tepi punya acuan
    // "tengah layar".
    const bar = page.locator('.book-nav-bar');

    // Gulir lembar sampai mentok: di sinilah baris terakhir paling dekat dengan
    // bilah navigasi.
    await sheet.evaluate((node) => node.scrollTo({ top: node.scrollHeight }));

    const navTop = (await bar.boundingBox())!.y;
    const contentBottom = await sheet
      .locator('.container-invite')
      .last()
      .evaluate((node) => node.getBoundingClientRect().bottom);

    expect(contentBottom).toBeLessThanOrEqual(navTop);
  });

  test('panah pembalik menempel di tepi kiri dan kanan, sejajar tengah layar', async ({ page }) => {
    const width = 390;
    const height = 844;

    await page.setViewportSize({ width, height });
    await page.goto('/to/budi-santoso');
    await openCover(page);

    const prev = (await page.getByRole('button', { name: 'Halaman sebelumnya' }).boundingBox())!;
    const next = (await page.getByRole('button', { name: 'Halaman berikutnya' }).boundingBox())!;

    // `backdrop-filter` pada bilah bawah pernah menjadikannya containing block,
    // sehingga `top: 50%` dihitung terhadap tinggi bilah dan kedua panah
    // terlempar ke dasar layar.
    const middle = height / 2;
    expect(Math.abs(prev.y + prev.height / 2 - middle)).toBeLessThan(8);
    expect(Math.abs(next.y + next.height / 2 - middle)).toBeLessThan(8);

    // Saling berseberangan di tepi layar.
    expect(prev.x).toBeLessThan(12);
    expect(next.x + next.width).toBeGreaterThan(width - 12);

    // Target sentuh minimum 44px meski lingkaran yang terlihat lebih kecil.
    for (const box of [prev, next]) {
      expect(box.width).toBeGreaterThanOrEqual(44);
      expect(box.height).toBeGreaterThanOrEqual(44);
    }
  });

  test('panah tidak menimpa isi lembar mana pun', async ({ page }) => {
    // Panah mengambang di atas lembar, jadi ia bisa mendarat tepat di atas teks.
    // Yang pertama kena adalah isi yang tidak dibungkus kartu — paragraf pembuka
    // Amplop duduk persis setinggi panah — dan itu justru tidak tertangkap tes
    // luapan horizontal mana pun, karena tidak ada yang meluap.
    await page.setViewportSize({ width: 320, height: 568 });
    await page.goto('/to/budi-santoso');
    await openCover(page);

    const next = page.getByRole('button', { name: 'Halaman berikutnya' });
    const total = await page.locator('.book-page').count();

    for (let step = 0; step < total; step += 1) {
      const id = await activePage(page);
      await settle(page);

      const tertimpa = await page.evaluate(() => {
        const sheet = document.querySelector('.book-page[data-state="active"]');
        if (!sheet) return [];

        const arrows = Array.from(document.querySelectorAll('.book-arrow'), (arrow) =>
          arrow.getBoundingClientRect(),
        );

        return Array.from(sheet.querySelectorAll('*'))
          .filter((node) => node.children.length === 0)
          .filter((node) => {
            const box = node.getBoundingClientRect();
            if (box.width === 0 || box.height === 0) return false;

            // Teks khusus pembaca layar (`sr-only`) berukuran 1px dan terpotong
            // habis. Tidak ada yang bisa melihatnya tertimpa.
            if (getComputedStyle(node).clip === 'rect(0px, 0px, 0px, 0px)') return false;

            return arrows.some(
              (arrow) =>
                box.left < arrow.right &&
                box.right > arrow.left &&
                box.top < arrow.bottom &&
                box.bottom > arrow.top,
            );
          })
          .map((node) => `<${node.tagName.toLowerCase()}> ${(node.textContent ?? '').slice(0, 50)}`);
      });

      expect(tertimpa, `lembar ${id}`).toEqual([]);

      if (step < total - 1) await next.click();
    }
  });

  test('lembar yang sudah dilewati berputar pada engsel, bukan sekadar hilang', async ({
    page,
  }) => {
    await page.goto('/to/budi-santoso');
    await openCover(page);
    await page.getByRole('button', { name: 'Halaman berikutnya' }).click();

    const lewat = page.locator('.book-page[data-page="salam"]');
    await expect(lewat).toHaveAttribute('data-state', 'prev');

    const gaya = await lewat.evaluate((node) => {
      const style = getComputedStyle(node);
      return { transform: style.transform, origin: style.transformOrigin };
    });

    // rotateY menghasilkan matrix3d; matrix 2D biasa berarti efek membalik
    // halaman sudah rata dan lembar hanya menghilang begitu saja.
    expect(gaya.transform.startsWith('matrix3d')).toBe(true);

    // Engselnya di tepi kiri — itu yang membuat gerakannya terbaca sebagai
    // punggung buku, bukan kartu yang berputar di tengah.
    expect(Number.parseFloat(gaya.origin.split(' ')[0] ?? '99')).toBeLessThan(1);
  });

  test('panah tidak menghalangi gestur geser di tengah lembar', async ({ page }) => {
    await page.goto('/to/budi-santoso');
    await openCover(page);

    // Pembungkus panah menutupi seluruh layar; tanpa `pointer-events: none`
    // ia akan menelan setiap sentuhan pada isi undangan.
    await swipe(page, 'left');
    expect(await activePage(page)).toBe('mempelai');
  });
});

test.describe('Beralih tampilan', () => {
  test('mode gulir mengembalikan dokumen panjang yang dapat digulir', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/to/budi-santoso');
    await openCover(page);
    await setView(page, 'scroll');

    await expect(page.locator('body')).toHaveAttribute('data-view', 'scroll');
    await expect(page.getByRole('navigation', { name: 'Navigasi halaman undangan' })).toHaveCount(0);

    // Semua seksi kembali mengalir dalam satu dokumen.
    const scrollable = await page.evaluate(
      () => document.documentElement.scrollHeight > document.documentElement.clientHeight * 2,
    );
    expect(scrollable).toBe(true);

    await page.locator('#penutup').scrollIntoViewIfNeeded();
    await expect(page.getByText('Kami yang berbahagia')).toBeVisible();
  });

  test('pilihan tampilan bertahan setelah muat ulang', async ({ page }) => {
    await page.goto('/to/budi-santoso');
    await openCover(page);
    await setView(page, 'scroll');

    await page.reload();
    await openCover(page);

    await expect(page.locator('body')).toHaveAttribute('data-view', 'scroll');
    await expect(page.getByRole('button', { name: 'Mode buku' })).toBeVisible();
  });

  test('kembali ke mode buku membuka lembar yang sedang dibaca', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/to/budi-santoso');
    await openCover(page);
    await setView(page, 'scroll');

    // Lokasi: seksi tinggi (berisi peta) di tengah dokumen, jadi saat berada di
    // tengah layar ia jelas yang paling banyak terbaca.
    await centerSection(page, 'lokasi');
    await setView(page, 'book');

    // Tamu tidak dilempar kembali ke halaman pertama.
    expect(await activePage(page)).toBe('lokasi');
  });
});

/**
 * Banner peringatan mode dummy (mitigasi R-9).
 *
 * Tampil selama `Config.is_draft = TRUE`. Ini pengaman terakhir agar undangan
 * berisi data contoh tidak pernah tersebar tanpa disadari — checklist Lampiran D
 * mewajibkan flag ini disetel FALSE sebelum link disebar.
 *
 * Teksnya sengaja dipangkas di layar sempit: banner ini melayang di atas sampul,
 * dan versi tiga barisnya dulu memakan ruang yang dibutuhkan isi undangan pada
 * layar 320px. Instruksi lengkapnya muncul kembali mulai lebar 640px.
 */
export function DraftBanner() {
  return (
    <div
      role="alert"
      className="fixed inset-x-0 top-0 z-70 bg-danger px-3 py-2 text-center text-[0.6875rem] leading-tight font-semibold tracking-wide text-white sm:px-4 sm:text-xs"
    >
      MODE DUMMY — data masih contoh.
      <span className="hidden sm:inline">
        {' '}
        Setel <code className="font-mono">is_draft = FALSE</code> di Sheet sebelum menyebar
        undangan.
      </span>
    </div>
  );
}

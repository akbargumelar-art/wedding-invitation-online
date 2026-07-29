import type { Metadata, Viewport } from 'next';
import { Amiri, Cormorant_Garamond, Plus_Jakarta_Sans } from 'next/font/google';
import './globals.css';

/**
 * Font dimuat lewat `next/font/google`: berkas woff2 diunduh saat build dan
 * disajikan dari domain sendiri (self-host, PRD US-03), sehingga tidak ada
 * request ke pihak ketiga saat tamu membuka halaman.
 *
 * Tiga keluarga, masing-masing dengan subset seperlunya demi budget font
 * pada PRD §4.6.
 */
// Setiap bobot adalah satu berkas woff2 yang diunduh terpisah. Daftar di bawah
// dipangkas ke bobot yang benar-benar dipakai: memuat 400/500/600/700 untuk
// ketiganya menghabiskan ~190 KB — jauh di atas anggaran font PRD §4.6.
const jakarta = Plus_Jakarta_Sans({
  subsets: ['latin'],
  weight: ['400', '600'],
  variable: '--font-jakarta',
  display: 'swap',
});

const cormorant = Cormorant_Garamond({
  subsets: ['latin'],
  weight: ['400', '500'],
  variable: '--font-cormorant',
  display: 'swap',
});

const amiri = Amiri({
  subsets: ['arabic'],
  weight: ['400'],
  variable: '--font-amiri',
  display: 'swap',
  // Teks Arab hanya ada pada satu paragraf di bawah lipatan; jangan biarkan
  // berkasnya berebut bandwidth dengan font yang dibutuhkan sampul.
  preload: false,
});

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000'),
  title: 'Undangan Pernikahan',
  description: 'Undangan pernikahan digital.',
  robots: {
    // Undangan bersifat privat: jangan diindeks mesin pencari.
    index: false,
    follow: false,
  },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 5,
  themeColor: '#196349',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="id" className={`${jakarta.variable} ${cormorant.variable} ${amiri.variable}`}>
      <body>{children}</body>
    </html>
  );
}

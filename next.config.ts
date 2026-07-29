import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // Build ke folder .next/standalone agar bisa di-rsync ke VPS tanpa build di sana
  // (mitigasi R-3: OOM saat build di VPS 1 GB).
  output: 'standalone',
  reactStrictMode: true,
  poweredByHeader: false,

  // better-sqlite3 & @node-rs/argon2 adalah native addon: jangan di-bundle.
  serverExternalPackages: ['better-sqlite3', '@node-rs/argon2'],

  images: {
    formats: ['image/avif', 'image/webp'],
    // Galeri boleh menunjuk ke URL eksternal (mis. Google Drive/Cloudinary) lewat Sheet.
    // Tambahkan host yang dipakai di sini; default hanya domain sendiri (path relatif).
    remotePatterns: [
      { protocol: 'https', hostname: 'images.unsplash.com' },
      { protocol: 'https', hostname: 'lh3.googleusercontent.com' },
      { protocol: 'https', hostname: 'drive.google.com' },
      { protocol: 'https', hostname: 'res.cloudinary.com' },
    ],
  },

  experimental: {
    serverActions: {
      bodySizeLimit: '3mb',
    },
  },
};

export default nextConfig;

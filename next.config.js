// SPDX-License-Identifier: MIT

const isProd = process.env.NODE_ENV === 'production';

/** @type {import('next').NextConfig} */
const nextConfig = {
  // Static export only needed at build time (Tauri serves the output dir).
  // In dev mode the Next.js server handles routing dynamically.
  ...(isProd && { output: 'export' }),

  images: {
    unoptimized: true,
  },

  // Tauri uses its own dev server port
  devIndicators: false,
};

module.exports = nextConfig;

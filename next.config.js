// SPDX-License-Identifier: MIT

/** @type {import('next').NextConfig} */
const nextConfig = {
  // Required for Tauri: serve as static files, no Node.js server
  output: 'export',

  images: {
    unoptimized: true,
  },

  // Tauri uses its own dev server port
  devIndicators: false,
};

module.exports = nextConfig;

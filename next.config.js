const path = require('path')

/** @type {import('next').NextConfig} */
const nextConfig = {
  // Windows-only: avoid Next picking a parent-folder lockfile during local dev.
  ...(process.platform === 'win32' ? { outputFileTracingRoot: path.join(__dirname) } : {}),

  // Hide the floating "N" dev indicator badge in the browser.
  devIndicators: false,

  // Smaller per-route chunks (helps avoid dev ChunkLoadError / timeout on heavy pages like /feed).
  experimental: {
    optimizePackageImports: ['lucide-react'],
  },

  webpack: (config, { dev, isServer }) => {
    if (dev && !isServer && config.output) {
      config.output.chunkLoadTimeout = 120_000
    }
    return config
  },
}

module.exports = nextConfig

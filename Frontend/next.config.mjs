import path from 'node:path'
import { fileURLToPath } from 'node:url'

/** @type {import('next').NextConfig} */
const nextConfig = {
  // REMOVED: ignoreBuildErrors: true — all TypeScript errors must be fixed before
  // production builds. Builds will fail on type errors, ensuring code quality.
  // If you encounter build failures, fix the type errors rather than bypassing them.

  // ── Turbopack root ─────────────────────────────────────────────────────
  // Pin the project root to this directory (contains the real package-lock.json).
  // Without this, Next.js walks up and can pick an orphan lockfile in a parent
  // directory, inferring the wrong workspace root and emitting the
  // "multiple lockfiles detected" warning. `root` must be an absolute path.
  turbopack: {
    root: path.dirname(fileURLToPath(import.meta.url)),
  },

  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'res.cloudinary.com',
      },
    ],
  },

  // ── Compression ────────────────────────────────────────────────────────
  // Enable gzip/brotli compression for all text-based assets
  compress: true,
}

export default nextConfig

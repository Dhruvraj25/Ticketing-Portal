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

  // ── Cloudflare/OpenNext: keep `pg` out of Next's server bundle ──────────
  // `pg` conditionally requires `pg-cloudflare`, whose package.json exports
  // a real implementation only under the "workerd" condition (default
  // resolution gets an empty stub). Next's build/trace step resolves with
  // default conditions, so it only copies the empty stub into the traced
  // output. OpenNext's own esbuild pass *does* use the "workerd" condition
  // and then fails with "Could not resolve pg-cloudflare" because the real
  // dist/index.js was never copied. Marking `pg`/`pg-cloudflare` external
  // makes Next copy the full, untouched packages instead, so OpenNext's
  // workerd-aware resolution finds the real file.
  serverExternalPackages: ['pg', 'pg-cloudflare'],
}

export default nextConfig

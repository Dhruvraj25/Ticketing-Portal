'use client'

import { useCallback, useEffect, useState } from 'react'

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  const [showDetails, setShowDetails] = useState(false)
  const [reloaded, setReloaded] = useState(false)

  useEffect(() => {
    console.error('[Root Error Boundary]', error)
  }, [error])

  // Parse the error to extract the component stack from the digest
  const errorMessage = error?.message || 'Unknown error'
  const errorDigest = error?.digest || ''
  const isLazyError = errorMessage.includes('Lazy element type') || errorMessage.includes('promise that resolves to')
  const isChunkError =
    errorMessage.includes('Failed to load chunk') ||
    errorMessage.includes('ChunkLoadError') ||
    errorMessage.includes('Failed to fetch dynamically imported module')

  // Chunk load errors mean the browser is referencing a chunk the server no longer
  // serves (stale .next cache after switching between build/dev). A hard reload
  // re-fetches the current chunk manifest and resolves the mismatch.
  const handleChunkReload = useCallback(() => {
    if (reloaded) return
    setReloaded(true)
    window.location.href = window.location.pathname + window.location.search
  }, [reloaded])

  // Auto-reload at most once per 10s window (tracked in sessionStorage, which
  // survives the reload). This prevents an infinite reload loop if the chunk
  // error persists while Turbopack is still recompiling the page.
  useEffect(() => {
    if (!isChunkError) return
    const lastAttempt = Number(sessionStorage.getItem('chunk-reload-at') || 0)
    if (Date.now() - lastAttempt > 10000) {
      sessionStorage.setItem('chunk-reload-at', String(Date.now()))
      handleChunkReload()
    }
  }, [isChunkError, handleChunkReload])

  return (
    <div className="flex min-h-screen items-center justify-center bg-[#f4f7f9]">
      <div className="max-w-lg rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-8 shadow-sm text-center">
        <h2 className="text-lg font-semibold text-[#111111] mb-2">
          {isChunkError ? 'Page chunk failed to load' : isLazyError ? 'Component failed to load' : 'Something went wrong'}
        </h2>
        <p className="text-sm text-slate-500 mb-6">
          {isChunkError
            ? 'The browser tried to load a stale JavaScript chunk. Reloading re-fetches the current bundle.'
            : isLazyError
              ? 'A dashboard component failed to load. This can happen after code changes.'
              : 'An unexpected error occurred. Please try again.'}
        </p>
        <div className="flex items-center justify-center gap-3 mb-6">
          {isChunkError ? (
            <button
              onClick={handleChunkReload}
              disabled={reloaded}
              className="inline-flex items-center justify-center rounded-lg bg-[#111111] px-4 py-2 text-sm font-medium text-white hover:bg-[#1F1F1F] transition-colors disabled:opacity-50"
            >
              {reloaded ? 'Reloading…' : 'Reload page'}
            </button>
          ) : (
            <button
              onClick={reset}
              className="inline-flex items-center justify-center rounded-lg bg-[#111111] px-4 py-2 text-sm font-medium text-white hover:bg-[#1F1F1F] transition-colors"
            >
              Try again
            </button>
          )}
          <button
            onClick={() => setShowDetails(!showDetails)}
            className="inline-flex items-center justify-center rounded-lg border border-slate-200 dark:border-slate-800 px-4 py-2 text-sm font-medium text-slate-500 hover:bg-[#F9FAFB] transition-colors"
          >
            {showDetails ? 'Hide details' : 'Show details'}
          </button>
        </div>
        {showDetails && (
          <div className="text-left p-4 rounded-xl bg-[#F9FAFB] border border-slate-200 dark:border-slate-800 overflow-auto max-h-64">
            <p className="text-xs font-mono text-[#111111] break-all">
              <span className="font-semibold">Message:</span> {errorMessage}
            </p>
            {errorDigest && (
              <p className="text-xs font-mono text-slate-500 mt-2 break-all">
                <span className="font-semibold">Digest:</span> {errorDigest}
              </p>
            )}
            {error?.stack && (
              <pre className="text-xs font-mono text-slate-500 mt-2 whitespace-pre-wrap break-all">
                {error.stack}
              </pre>
            )}
            {isLazyError && (
              <div className="mt-3 p-3 rounded-lg bg-blue-50 dark:bg-blue-500/15 border border-blue-100">
                <p className="text-xs text-blue-700 dark:text-blue-300 font-medium">💡 Try this:</p>
                <ol className="text-xs text-blue-600 dark:text-blue-400 mt-1 space-y-1 list-decimal list-inside">
                  <li>Open browser DevTools Console (F12) — check the full stack trace</li>
                  <li>Delete the <code className="bg-blue-100 dark:bg-blue-500/20 px-1 rounded">.next</code> folder in <code className="bg-blue-100 dark:bg-blue-500/20 px-1 rounded">frontend/</code> and restart the dev server</li>
                  <li>If the error persists, note the component name from the stack trace and report it</li>
                </ol>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

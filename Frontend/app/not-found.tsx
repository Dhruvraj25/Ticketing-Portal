import Link from 'next/link'

export default function NotFound() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-[#f4f7f9]">
      <div className="max-w-md rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-8 shadow-sm text-center">
        <h2 className="text-lg font-semibold text-[#111111] mb-2">Page not found</h2>
        <p className="text-sm text-slate-500 mb-6">
          The page you are looking for does not exist or has been moved.
        </p>
        <Link
          href="/dashboard"
          className="inline-flex items-center justify-center rounded-lg bg-[#111111] px-4 py-2 text-sm font-medium text-white hover:bg-[#1F1F1F] transition-colors"
        >
          Go to Dashboard
        </Link>
      </div>
    </div>
  )
}

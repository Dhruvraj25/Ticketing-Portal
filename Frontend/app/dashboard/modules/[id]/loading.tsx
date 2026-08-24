// Skeleton loading state while the module detail page streams its data.
export default function ModuleDetailLoading() {
  return (
    <div className="space-y-5 animate-pulse">
      {/* Header skeleton */}
      <div className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800 shadow-sm p-6">
        <div className="flex items-start gap-4">
          <div className="h-9 w-9 rounded-xl bg-muted" />
          <div className="flex-1 space-y-3">
            <div className="h-4 w-40 bg-muted rounded" />
            <div className="h-7 w-72 bg-muted rounded" />
            <div className="h-4 w-48 bg-muted/60 rounded" />
          </div>
          <div className="hidden sm:flex items-center gap-2">
            <div className="h-9 w-28 rounded-xl bg-muted" />
            <div className="h-9 w-32 rounded-xl bg-muted" />
          </div>
        </div>
      </div>

      {/* Module information skeleton */}
      <div className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800 shadow-sm p-6">
        <div className="h-5 w-44 bg-muted rounded mb-6" />
        <div className="grid grid-cols-2 md:grid-cols-3 gap-x-6 gap-y-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="flex items-center justify-between gap-2">
              <div className="h-4 w-16 bg-muted/60 rounded" />
              <div className="h-4 w-28 bg-muted rounded" />
            </div>
          ))}
        </div>
      </div>

      {/* Tickets skeleton */}
      <div className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800 shadow-sm p-6">
        <div className="h-5 w-32 bg-muted rounded mb-6" />
        <div className="space-y-3">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="h-11 bg-muted/40 rounded-lg" />
          ))}
        </div>
      </div>
    </div>
  )
}

export default function SupportWalletLoading() {
  return (
    <div className="space-y-6 animate-pulse">
      <div className="flex items-center gap-3">
        <div className="h-10 w-10 rounded-2xl bg-muted" />
        <div className="h-8 w-40 bg-muted rounded-lg" />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {[...Array(4)].map((_, i) => (
          <div key={i} className="rounded-xl bg-white dark:bg-slate-900 border border-border p-5">
            <div className="h-3 w-24 bg-muted rounded mb-3" />
            <div className="h-8 w-16 bg-muted rounded mb-2" />
            <div className="h-3 w-32 bg-muted/50 rounded" />
          </div>
        ))}
      </div>

      <div className="rounded-xl bg-white dark:bg-slate-900 border border-border p-5">
        <div className="h-4 w-24 bg-muted rounded mb-4" />
        <div className="h-3 rounded-full bg-muted" />
      </div>

      <div className="rounded-xl bg-white dark:bg-slate-900 border border-border overflow-hidden">
        <div className="p-5 border-b border-border/50">
          <div className="h-4 w-36 bg-muted rounded" />
        </div>
        <div className="p-12">
          <div className="space-y-4">
            {[...Array(3)].map((_, i) => (
              <div key={i} className="h-8 bg-muted/50 rounded w-full" />
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}

export default function DashboardLoading() {
  return (
    <div className="space-y-6">
      {/* Header Skeleton */}
      <div className="animate-pulse">
        <div className="h-8 w-48 bg-gray-200 rounded-lg" />
        <div className="h-4 w-72 bg-gray-100 dark:bg-slate-800 rounded mt-2" />
      </div>

      {/* KPI Cards Skeleton */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {[...Array(4)].map((_, i) => (
          <div key={i} className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-6 shadow-sm animate-pulse">
            <div className="flex items-start justify-between mb-4">
              <div className="h-3 w-24 bg-gray-200 rounded" />
              <div className="h-10 w-10 rounded-[14px] bg-gray-100 dark:bg-slate-800" />
            </div>
            <div className="h-8 w-16 bg-gray-200 rounded mb-4" />
            <div className="flex items-end justify-between">
              <div className="h-3 w-20 bg-gray-100 dark:bg-slate-800 rounded" />
              <div className="h-8 w-20 bg-gray-100 dark:bg-slate-800 rounded" />
            </div>
          </div>
        ))}
      </div>

      {/* Secondary KPIs Skeleton */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {[...Array(2)].map((_, i) => (
          <div key={i} className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-6 shadow-sm animate-pulse">
            <div className="flex items-start justify-between mb-4">
              <div className="h-3 w-32 bg-gray-200 rounded" />
              <div className="h-10 w-10 rounded-[14px] bg-gray-100 dark:bg-slate-800" />
            </div>
            <div className="h-8 w-16 bg-gray-200 rounded mb-4" />
            <div className="h-3 w-24 bg-gray-100 dark:bg-slate-800 rounded" />
          </div>
        ))}
      </div>

      {/* Main Content Skeleton */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        {/* Tickets Table Skeleton */}
        <div className="lg:col-span-2 bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-6 shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <div className="h-5 w-32 bg-gray-200 rounded animate-pulse" />
            <div className="h-5 w-20 bg-gray-100 dark:bg-slate-800 rounded animate-pulse" />
          </div>
          <div className="space-y-3">
            {[...Array(5)].map((_, i) => (
              <div key={i} className="flex items-center gap-4 animate-pulse">
                <div className="h-4 w-16 bg-gray-200 rounded" />
                <div className="h-4 flex-1 bg-gray-100 dark:bg-slate-800 rounded" />
                <div className="h-4 w-20 bg-gray-100 dark:bg-slate-800 rounded" />
                <div className="h-6 w-16 bg-gray-100 dark:bg-slate-800 rounded-full" />
              </div>
            ))}
          </div>
        </div>

        {/* Sidebar Widgets Skeleton */}
        <div className="space-y-4">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="rounded-2xl bg-white dark:bg-slate-900 border border-gray-100 p-5 shadow-sm animate-pulse">
              <div className="flex items-center gap-2 mb-4">
                <div className="h-8 w-8 rounded-xl bg-gray-100 dark:bg-slate-800" />
                <div className="h-3 w-24 bg-gray-200 rounded" />
              </div>
              <div className="h-4 w-32 bg-gray-100 dark:bg-slate-800 rounded mb-2" />
              <div className="h-8 w-24 bg-gray-200 rounded mb-2" />
              <div className="h-8 w-full bg-gray-100 dark:bg-slate-800 rounded-lg" />
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

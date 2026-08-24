export function WorkspaceContainer({ children }: { children: React.ReactNode }) {
  return (
    <div className="bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800 rounded-2xl w-full p-5 lg:p-6">
      {children}
    </div>
  )
}

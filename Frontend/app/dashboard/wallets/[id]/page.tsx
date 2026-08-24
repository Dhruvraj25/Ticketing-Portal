import nextDynamic from 'next/dynamic'
import { notFound } from 'next/navigation'
import { getWalletDetailPageData } from '@/app/actions/wallet'

// Lazy-load the detail client (heavy component with tabs, dialogs, etc.)
const WalletDetailClient = nextDynamic(
  () => import('./wallet-detail-client').then(m => ({ default: m.WalletDetailClient })),
  {
    loading: () => (
      <div className="space-y-6 animate-pulse">
        <div className="h-8 w-32 bg-muted rounded" />
        <div className="rounded-xl bg-white dark:bg-slate-900 border border-border p-5">
          <div className="flex items-start gap-4">
            <div className="h-12 w-12 rounded-2xl bg-muted" />
            <div className="flex-1 space-y-2">
              <div className="h-4 w-48 bg-muted rounded" />
              <div className="h-6 w-72 bg-muted rounded" />
            </div>
          </div>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map(i => (
            <div key={i} className="rounded-xl bg-white dark:bg-slate-900 border border-border p-5">
              <div className="h-3 w-24 bg-muted rounded mb-3" />
              <div className="h-8 w-16 bg-muted rounded mb-2" />
              <div className="h-3 w-32 bg-muted rounded" />
            </div>
          ))}
        </div>
      </div>
    ),
  }
)

export const dynamic = 'force-dynamic'

export default async function WalletDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const walletId = parseInt(id)
  if (isNaN(walletId)) notFound()

  try {
    // Single orchestrator call — loads everything in parallel
    const { currentUser, wallet, transactions, transactionsPagination, consumption } =
      await getWalletDetailPageData(walletId)

    return (
      <WalletDetailClient
        user={currentUser}
        wallet={wallet}
        initialTransactions={transactions}
        initialPagination={transactionsPagination}
        consumption={consumption}
      />
    )
  } catch (error) {
    notFound()
  }
}

import { getWalletPageData } from '@/app/actions/wallet'
import { WalletsPageClient } from './wallets-page-client'

export const dynamic = 'force-dynamic'

export default async function WalletsPage() {
  // Single orchestrator call — loads everything in parallel internally
  const { currentUser, wallets, stats, lowBalanceWallets, projects } = await getWalletPageData()

  return (
    <WalletsPageClient
      user={currentUser}
      wallets={wallets}
      stats={stats}
      lowBalanceWallets={lowBalanceWallets}
      projects={projects}
    />
  )
}

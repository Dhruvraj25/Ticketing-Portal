import { PageTimer } from '@/lib/performance-profiler'
import { redirect } from 'next/navigation'
import { getCurrentUser } from '@/app/actions/tickets'
import { getWallets, getWalletTransactions } from '@/app/actions/wallets'
import { SupportWalletClient } from './support-wallet-client'

export const metadata = {
  title: 'Support Wallet — SupportHub',
}

export default async function SupportWalletPage() {
  const pageTimer = new PageTimer('Support Wallet Page')
  pageTimer.mark('Authentication')
  const user = await getCurrentUser()

  // Only clients can access this page
  if (user.role !== 'client') {
    redirect('/dashboard')
  }

  const wallets = await getWallets()

  // If the client has wallets, grab the first one (or primary)
  const wallet = wallets.length > 0 ? wallets[0] : null
  let transactions: any[] = []

  if (wallet) {
    const result = await getWalletTransactions(wallet.id, 1, 50)
    transactions = result.transactions
  }

  pageTimer.mark('Data Fetching & Render')
  pageTimer.finish()

  return (
    <SupportWalletClient
      user={user}
      wallet={wallet as any}
      transactions={transactions as any}
    />
  )
}

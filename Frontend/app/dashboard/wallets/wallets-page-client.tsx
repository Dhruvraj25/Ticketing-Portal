'use client'

import { useState, useMemo, useCallback, memo } from 'react'
import { format } from 'date-fns'
import { Download } from 'lucide-react'
import { StatCard } from '@/components/dashboard/stat-card'
import { WalletPageHeader } from '@/components/dashboard/wallet/wallet-header'
import { WalletFilters } from '@/components/dashboard/wallet/wallet-filters'
import { WalletEmptyState } from '@/components/dashboard/wallet/wallet-empty-state'
import { WalletTable } from '@/components/dashboard/wallet/wallet-table'
import { WalletPagination } from '@/components/dashboard/wallet/wallet-pagination'
import type { SupportWallet, UserRole } from '@/lib/types'

interface WalletsPageClientProps {
  user: { id: string; name: string; role: UserRole }
  wallets: SupportWallet[]
  stats: {
    totalPurchased: number; totalConsumed: number; totalRemaining: number
    totalReserved: number; lowBalanceClients: number; activeWallets: number
    totalWallets: number; rechargesThisMonth: number; consumedThisMonth: number
  }
  lowBalanceWallets: any[]
  projects: { id: number; projectName: string; projectCode: string; clientId?: string }[]
}

function getStatusInfo(wallet: SupportWallet) {
  if (wallet.remainingHours <= 10) return { label: 'Critical', color: 'bg-red-50 dark:bg-red-500/15 text-red-600 dark:text-red-400 border-red-200 dark:border-red-500/30' }
  if (wallet.remainingHours <= 20) return { label: 'Low', color: 'bg-amber-50 dark:bg-amber-500/15 text-amber-600 dark:text-amber-400 border-amber-200 dark:border-amber-500/30' }
  if (wallet.remainingHours <= 50) return { label: 'Moderate', color: 'bg-blue-50 dark:bg-blue-500/15 text-blue-600 dark:text-blue-400 border-blue-200 dark:border-blue-500/30' }
  return { label: 'Healthy', color: 'bg-green-50 dark:bg-green-500/15 text-green-600 dark:text-green-400 border-green-200 dark:border-green-500/30' }
}

const WalletKpiCards = memo(function WalletKpiCards({ stats }: { stats: WalletsPageClientProps['stats'] }) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
      <StatCard title="Total Wallet Hours" value={stats.totalPurchased} iconName="Clock" />
      <StatCard title="Remaining Hours" value={stats.totalRemaining} iconName="Wallet" />
      <StatCard title="Low Balance Clients" value={stats.lowBalanceClients} iconName="AlertTriangle" />
      <StatCard title="Wallet Recharge Requests" value={stats.rechargesThisMonth} iconName="TrendingUp" />
    </div>
  )
})

function WalletExportButton({ filteredWallets }: { filteredWallets: SupportWallet[] }) {
  const handleExport = useCallback(() => {
    const csv = [
      ['Client', 'Project', 'Purchased Hours', 'Reserved', 'Consumed', 'Remaining', 'Status'].join(','),
      ...filteredWallets.map((w) =>
        [
          `"${w.clientName || ''}"`, `"${w.projectName || ''}"`,
          w.totalPurchasedHours, w.reservedHours, w.consumedHours,
          w.remainingHours, w.status,
        ].join(','),
      ),
    ].join('\n')
    const blob = new Blob([csv], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `wallets-export-${format(new Date(), 'yyyy-MM-dd')}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }, [filteredWallets])

  return (
    <button
      onClick={handleExport}
      className="flex items-center gap-2 px-3 py-2 rounded-xl text-sm font-medium border border-border/50 text-muted-foreground hover:text-foreground hover:border-border transition-colors"
    >
      <Download className="h-4 w-4" /> Export
    </button>
  )
}

export function WalletsPageClient({
  user, wallets, stats, lowBalanceWallets, projects,
}: WalletsPageClientProps) {
  const isManagerOrAdmin = user.role === 'project_manager' || user.role === 'admin'
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedStatus, setSelectedStatus] = useState('all')
  const [selectedProject, setSelectedProject] = useState('all')
  const [showFilters, setShowFilters] = useState(false)
  const [currentPage, setCurrentPage] = useState(1)
  const ITEMS_PER_PAGE = 10

  const hasFilters = Boolean(searchQuery || selectedStatus !== 'all' || selectedProject !== 'all')

  const filteredWallets = useMemo(() => wallets.filter((w) => {
    if (searchQuery) {
      const q = searchQuery.toLowerCase()
      if (!(w.clientName || '').toLowerCase().includes(q) &&
          !(w.projectName || '').toLowerCase().includes(q) &&
          !(w.projectCode || '').toLowerCase().includes(q)) return false
    }
    if (selectedStatus !== 'all' && w.status !== selectedStatus) return false
    if (selectedProject !== 'all' && w.projectId !== parseInt(selectedProject)) return false
    return true
  }), [wallets, searchQuery, selectedStatus, selectedProject])

  const totalPages = Math.max(1, Math.ceil(filteredWallets.length / ITEMS_PER_PAGE))
  const paginatedWallets = filteredWallets.slice(
    (currentPage - 1) * ITEMS_PER_PAGE, currentPage * ITEMS_PER_PAGE,
  )

  const clearFilters = useCallback(() => {
    setSearchQuery(''); setSelectedStatus('all'); setSelectedProject('all'); setCurrentPage(1)
  }, [])

  const goToPage = useCallback((page: number) => setCurrentPage(page), [])

  return (
    <div className="space-y-4" data-tour="wallets-list">
       <div data-tour="wallets-header" className="relative bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800 rounded-2xl shadow-sm p-6">
   
      <WalletPageHeader walletCount={wallets.length} />
      </div>
      <div data-tour="wallets-kpis">
        <WalletKpiCards stats={stats} />
      </div>
      <div data-tour="wallets-filters">
      <WalletFilters
        searchQuery={searchQuery}
        onSearchChange={(v) => { setSearchQuery(v); setCurrentPage(1) }}
        selectedStatus={selectedStatus}
        onStatusChange={(v) => { setSelectedStatus(v); setCurrentPage(1) }}
        selectedProject={selectedProject}
        onProjectChange={(v) => { setSelectedProject(v); setCurrentPage(1) }}
        showFilters={showFilters}
        onToggleFilters={() => setShowFilters(!showFilters)}
        hasFilters={hasFilters}
        onClearFilters={clearFilters}
        projects={projects}
      />
      </div>

      <div data-tour="wallets-export" className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          Showing <span className="font-medium text-foreground">{filteredWallets.length}</span>{' '}
          {filteredWallets.length === 1 ? 'wallet' : 'wallets'}
          {hasFilters && ' (filtered)'}
        </p>
        <WalletExportButton filteredWallets={filteredWallets} />
      </div>

      {filteredWallets.length === 0 ? (
        <WalletEmptyState hasFilters={hasFilters} />
      ) : (
        <div data-tour="wallets-table">
          <WalletTable
            wallets={paginatedWallets}
            isManagerOrAdmin={isManagerOrAdmin}
            getStatusInfo={getStatusInfo}
          />
        </div>
      )}

      <div data-tour="wallets-pagination">
        <WalletPagination
          currentPage={currentPage}
          totalPages={totalPages}
          onPageChange={goToPage}
        />
      </div>
    </div>
  )
}

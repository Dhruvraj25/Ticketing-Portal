'use client'

import { useState, useCallback } from 'react'
import { format, formatDistanceToNow } from 'date-fns'
import Link from 'next/link'
import { cn } from '@/lib/utils'
import { PageHeaderIcon } from '@/components/dashboard/page-header-icon'
import {
  ArrowLeft,
  Wallet,
  Plus,
  Download,
  Calendar,
  User,
  FolderKanban,
  Clock,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  Activity,
  TrendingUp,
  BarChart3,
  FileText,
  Ticket,
  Eye,
  ChevronDown,
  Shield,
  Sparkles,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { WorkspaceContainer } from '@/components/dashboard/workspace-container'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { TicketStatus, WALLET_STATUS_CONFIG } from '@/lib/types'
import type { SupportWallet, WalletTransaction, UserRole, WalletTransactionType } from '@/lib/types'
import { getWalletContractStatus } from '@/lib/wallet-utils'
import { SupportValidityPicker } from '@/components/ui/support-validity-picker'

// Utilization Chart — uses CSS transform scaleX instead of width animation to prevent CLS
function UtilizationChart({
  purchased,
  reserved,
  consumed,
  remaining,
}: {
  purchased: number
  reserved: number
  consumed: number
  remaining: number
}) {
  const total = purchased || 1
  const consumedPct = (consumed / total) * 100
  const reservedPct = (reserved / total) * 100
  const remainingPct = (remaining / total) * 100

  return (
    <div className="space-y-4">
      <div className="h-4 rounded-full bg-muted overflow-hidden flex">
        <div
          className="h-full bg-blue-500 origin-left transition-transform duration-700"
          style={{ transform: `scaleX(${consumedPct / 100})`, width: `${consumedPct}%` }}
        />
        <div
          className="h-full bg-amber-400 origin-left transition-transform duration-700"
          style={{ transform: `scaleX(${reservedPct / 100})`, width: `${reservedPct}%` }}
        />
        <div
          className="h-full bg-emerald-500 origin-left transition-transform duration-700"
          style={{ transform: `scaleX(${remainingPct / 100})`, width: `${remainingPct}%` }}
        />
      </div>

      <div className="grid grid-cols-3 gap-2 text-center">
        <div className="p-3 rounded-xl bg-blue-50 dark:bg-blue-500/15 border border-blue-100">
          <p className="text-lg font-bold text-blue-600 dark:text-blue-400">{consumed}</p>
          <p className="text-xs text-blue-500 dark:text-blue-400">Consumed</p>
        </div>
        <div className="p-3 rounded-xl bg-amber-50 dark:bg-amber-500/15 border border-amber-100">
          <p className="text-lg font-bold text-amber-600 dark:text-amber-400">{reserved}</p>
          <p className="text-xs text-amber-500 dark:text-amber-400">Reserved</p>
        </div>
        <div className="p-3 rounded-xl bg-emerald-50 dark:bg-emerald-500/15 border border-emerald-100">
          <p className="text-lg font-bold text-emerald-600 dark:text-emerald-400">{remaining}</p>
          <p className="text-xs text-emerald-500 dark:text-emerald-400">Remaining</p>
        </div>
      </div>
    </div>
  )
}

// Transaction type badge
function TransactionTypeBadge({ type }: { type: string }) {
  const config: Record<string, { label: string; color: string }> = {
    'Add Hours': { label: 'Add Hours', color: 'bg-green-50 dark:bg-green-500/15 text-green-600 dark:text-green-400 border-green-200 dark:border-green-500/30' },
    'Deduct Hours': { label: 'Deduct Hours', color: 'bg-red-50 dark:bg-red-500/15 text-red-600 dark:text-red-400 border-red-200 dark:border-red-500/30' },
    'Adjustment': { label: 'Adjustment', color: 'bg-blue-50 dark:bg-blue-500/15 text-blue-600 dark:text-blue-400 border-blue-200 dark:border-blue-500/30' },
    'Emergency Credit': { label: 'Emergency Credit', color: 'bg-amber-50 dark:bg-amber-500/15 text-amber-600 dark:text-amber-400 border-amber-200 dark:border-amber-500/30' },
  }
  const c = config[type] || { label: type, color: 'bg-gray-50 dark:bg-slate-800/50 text-gray-600 dark:text-slate-400 border-gray-200 dark:border-slate-800' }
  return (
    <span className={cn('inline-flex items-center px-2 py-0.5 rounded text-xs font-medium border', c.color)}>
      {c.label}
    </span>
  )
}

// Alert type badge
function AlertTypeBadge({ type }: { type: string }) {
  const config: Record<string, { label: string; color: string }> = {
    'low_balance_warning': { label: 'Low Balance', color: 'bg-amber-50 dark:bg-amber-500/15 text-amber-600 dark:text-amber-400 border-amber-200 dark:border-amber-500/30' },
    'low_balance_restricted': { label: 'Restricted', color: 'bg-red-50 dark:bg-red-500/15 text-red-600 dark:text-red-400 border-red-200 dark:border-red-500/30' },
    'contract_expiring': { label: 'Contract Expiring', color: 'bg-purple-50 dark:bg-purple-500/15 text-purple-600 dark:text-purple-400 border-purple-200 dark:border-purple-500/30' },
    'wallet_recharged': { label: 'Recharged', color: 'bg-green-50 dark:bg-green-500/15 text-green-600 dark:text-green-400 border-green-200 dark:border-green-500/30' },
  }
  const c = config[type] || { label: type, color: 'bg-gray-50 dark:bg-slate-800/50 text-gray-600 dark:text-slate-400 border-gray-200 dark:border-slate-800' }
  return (
    <span className={cn('inline-flex items-center px-2 py-0.5 rounded text-xs font-medium border', c.color)}>
      {c.label}
    </span>
  )
}

// Ticket consumption status badge
function TicketStatusBadgeSmall({ status }: { status: string }) {
  const config: Record<string, { label: string; color: string }> = {
    [TicketStatus.NEW]: { label: 'New Request', color: 'bg-blue-50 dark:bg-blue-500/15 text-blue-600 dark:text-blue-400 border-blue-200 dark:border-blue-500/30' },
    [TicketStatus.ASSIGNED]: { label: 'Assigned to Resource', color: 'bg-indigo-50 dark:bg-indigo-500/15 text-indigo-600 dark:text-indigo-400 border-indigo-200 dark:border-indigo-500/30' },
    [TicketStatus.IN_PROGRESS]: { label: 'Work in Progress', color: 'bg-amber-50 dark:bg-amber-500/15 text-amber-600 dark:text-amber-400 border-amber-200 dark:border-amber-500/30' },
    [TicketStatus.RESOLVED]: { label: 'Ready for Client Review', color: 'bg-green-50 dark:bg-green-500/15 text-green-600 dark:text-green-400 border-green-200 dark:border-green-500/30' },
    [TicketStatus.CLOSED]: { label: 'Completed', color: 'bg-gray-50 dark:bg-slate-800/50 text-gray-500 border-gray-200 dark:border-slate-800' },
    [TicketStatus.CLIENT_REVIEW]: { label: 'Awaiting Client Review', color: 'bg-sky-50 dark:bg-sky-500/15 text-sky-600 dark:text-sky-400 border-sky-200 dark:border-sky-500/30' },
  }
  const c = config[status] || { label: status, color: 'bg-gray-50 dark:bg-slate-800/50 text-gray-600 dark:text-slate-400 border-gray-200 dark:border-slate-800' }
  return (
    <span className={cn('inline-flex items-center px-2 py-0.5 rounded text-xs font-medium border', c.color)}>
      {c.label}
    </span>
  )
}

interface WalletDetailClientProps {
  user: { id: string; name: string; role: UserRole }
  wallet: SupportWallet & { alerts: any[] }
  initialTransactions: WalletTransaction[]
  initialPagination: { page: number; limit: number; total: number; totalPages: number }
  consumption: any[]
}

export function WalletDetailClient({
  user,
  wallet,
  initialTransactions,
  initialPagination,
  consumption,
}: WalletDetailClientProps) {
  const isManagerOrAdmin = user.role === 'project_manager' || user.role === 'admin'
  const [transactions, setTransactions] = useState<WalletTransaction[]>(initialTransactions)
  const [pagination, setPagination] = useState(initialPagination)
  const [loadingPage, setLoadingPage] = useState(false)
  const [showAddHours, setShowAddHours] = useState(false)
  const [addHoursLoading, setAddHoursLoading] = useState(false)
  const [addHoursForm, setAddHoursForm] = useState({
    hours: '',
    reason: 'Contract Renewal',
    remarks: '',
    startDate: '',
    endDate: '',
  })
  const [addHoursError, setAddHoursError] = useState<string | null>(null)

  const statusInfo = WALLET_STATUS_CONFIG[wallet.status as keyof typeof WALLET_STATUS_CONFIG]
  const contractStatus = getWalletContractStatus(wallet.contractEndDate)

  const handleAddHours = async () => {
    setAddHoursError(null)
    const hours = parseInt(addHoursForm.hours)
    if (!hours || hours <= 0) {
      setAddHoursError('Please enter a valid positive number of hours')
      return
    }
    if (!addHoursForm.endDate) {
      setAddHoursError('Support end date is required')
      return
    }
    if (addHoursForm.endDate < addHoursForm.startDate) {
      setAddHoursError('End date cannot be earlier than start date')
      return
    }

    setAddHoursLoading(true)
    try {
      const { addWalletHours } = await import('@/app/actions/wallets')
      await addWalletHours({
        walletId: wallet.id,
        hours,
        reason: addHoursForm.reason,
        remarks: addHoursForm.remarks || undefined,
        startDate: addHoursForm.startDate,
        endDate: addHoursForm.endDate,
      })
      setShowAddHours(false)
      setAddHoursForm({ hours: '', reason: 'Contract Renewal', remarks: '', startDate: '', endDate: '' })
      window.location.reload()
    } catch (err) {
      setAddHoursError(err instanceof Error ? err.message : 'Failed to add hours')
    } finally {
      setAddHoursLoading(false)
    }
  }

  const loadTransactionPage = useCallback(async (page: number) => {
    setLoadingPage(true)
    try {
      const { getWalletTransactions } = await import('@/app/actions/wallet')
      const result = await getWalletTransactions(wallet.id, page, 20)
      setTransactions(result.transactions)
      setPagination(result.pagination)
    } catch (err) {
      console.error('Failed to load transactions:', err)
    } finally {
      setLoadingPage(false)
    }
  }, [wallet.id])

  const handleExport = () => {
    const csv = [
      ['Date', 'Type', 'Hours', 'Previous Balance', 'New Balance', 'Reason', 'Performed By'].join(','),
      ...transactions.map((t) =>
        [
          format(new Date(t.performedAt), 'yyyy-MM-dd HH:mm'),
          t.transactionType,
          t.hours,
          t.previousBalance,
          t.newBalance,
          `"${t.reason || ''}"`,
          `"${t.performedByName || t.performedBy}"`,
        ].join(','),
      ),
    ].join('\n')
    const blob = new Blob([csv], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `wallet-${wallet.id}-transactions-${format(new Date(), 'yyyy-MM-dd')}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="space-y-6">
      {/* Back navigation */}
      <div data-tour="wallet-detail-back" className="flex items-center gap-2">
        <Link href="/dashboard/wallets">
          <Button variant="ghost" size="icon" className="rounded-xl h-8 w-8">
            <ArrowLeft className="h-4 w-4" />
          </Button>
        </Link>
        <span className="text-sm text-muted-foreground">Back to Wallets</span>
      </div>

      <WorkspaceContainer>
        {/* Header */}
        <div data-tour="wallet-detail-header" className="flex items-start gap-4">
          <PageHeaderIcon variant="green">
            <Wallet className="h-5 w-5" />
          </PageHeaderIcon>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-2 flex-wrap">
              <span className="px-2.5 py-0.5 rounded-lg text-xs font-medium border bg-green-50 dark:bg-green-500/15 text-green-600 dark:text-green-400 border-green-200 dark:border-green-500/30">
                Support Wallet
              </span>
              <span className={cn('inline-flex items-center px-2.5 py-0.5 rounded-lg text-xs font-medium border', statusInfo?.color)}>
                {statusInfo?.label || wallet.status}
              </span>
            </div>
            <h1 className="text-2xl font-bold text-foreground tracking-tight">
              {wallet.clientName} — Support Wallet
            </h1>
          </div>
          <div className="flex items-center gap-3">
            {isManagerOrAdmin && (
              <Button onClick={() => setShowAddHours(true)} className="rounded-xl">
                <Plus className="mr-1.5 h-4 w-4" />
                Add Hours
              </Button>
            )}
            <Button variant="outline" onClick={handleExport} className="rounded-xl">
              <Download className="mr-1.5 h-4 w-4" />
              Export
            </Button>
          </div>
        </div>
      </WorkspaceContainer>

      {/* Wallet Summary Cards — no animations to prevent CLS */}
      <div data-tour="wallet-detail-summary" className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="rounded-xl bg-white dark:bg-slate-900 border border-border p-5">
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Purchased Hours</p>
          <p className="text-2xl font-bold text-foreground mt-1">{wallet.totalPurchasedHours}</p>
          <div className="flex items-center gap-1.5 mt-1 text-xs text-muted-foreground">
            <Calendar className="h-3 w-3" />
            {wallet.contractStartDate ? `From ${format(new Date(wallet.contractStartDate), 'MMM d, yyyy')}` : 'No start date'}
          </div>
        </div>
        <div className="rounded-xl bg-white dark:bg-slate-900 border border-border p-5">
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Reserved Hours</p>
          <p className="text-2xl font-bold text-amber-600 dark:text-amber-400 mt-1">{wallet.reservedHours}</p>
          <div className="flex items-center gap-1.5 mt-1 text-xs text-muted-foreground">
            <Activity className="h-3 w-3" />
            {wallet.reservedHours > 0 ? 'Allocated to active tickets' : 'No active reservations'}
          </div>
        </div>
        <div className="rounded-xl bg-white dark:bg-slate-900 border border-border p-5">
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Consumed Hours</p>
          <p className="text-2xl font-bold text-blue-600 dark:text-blue-400 mt-1">{wallet.consumedHours}</p>
          <div className="flex items-center gap-1.5 mt-1 text-xs text-muted-foreground">
            <Clock className="h-3 w-3" />
            {wallet.consumedHours > 0 ? 'Completed work' : 'No hours consumed yet'}
          </div>
        </div>
        <div className="rounded-xl bg-white dark:bg-slate-900 border border-border p-5"
        >
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Remaining Hours</p>
          <p className={cn(
            'text-2xl font-bold mt-1',
            wallet.remainingHours <= 10 ? 'text-red-600 dark:text-red-400' :
            wallet.remainingHours <= 20 ? 'text-amber-600 dark:text-amber-400' :
            'text-emerald-600 dark:text-emerald-400'
          )}>{wallet.remainingHours}</p>
          <div className="flex items-center gap-1.5 mt-1 text-xs">
            {wallet.remainingHours <= 20 ? (
              <span className="text-amber-600 dark:text-amber-400 flex items-center gap-1">
                <AlertTriangle className="h-3 w-3" />
                Low balance — consider recharging
              </span>
            ) : (
              <span className="text-emerald-600 dark:text-emerald-400 flex items-center gap-1">
                <CheckCircle2 className="h-3 w-3" />
                Adequate balance
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Utilization Chart */}
      <div data-tour="wallet-detail-utilization" className="rounded-xl bg-white dark:bg-slate-900 border border-border p-6"
      >
        <h3 className="text-sm font-semibold text-foreground mb-4 flex items-center gap-2">
          <BarChart3 className="h-4 w-4 text-primary" />
          Hour Utilization
        </h3>
        <UtilizationChart
          purchased={wallet.totalPurchasedHours}
          reserved={wallet.reservedHours}
          consumed={wallet.consumedHours}
          remaining={wallet.remainingHours}
        />
      </div>

      {/* Tabs */}
      <Tabs data-tour="wallet-detail-tabs" defaultValue="overview" className="space-y-4">
        <TabsList className="bg-white dark:bg-slate-900 border border-border rounded-xl p-1">
          <TabsTrigger value="overview" className="rounded-lg">Overview</TabsTrigger>
          <TabsTrigger value="transactions" className="rounded-lg">Transactions</TabsTrigger>
          <TabsTrigger value="consumption" className="rounded-lg">Consumption</TabsTrigger>
          <TabsTrigger value="alerts" className="rounded-lg">Alerts</TabsTrigger>
        </TabsList>

        {/* Overview Tab */}
        <TabsContent value="overview" className="space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* Client Information */}
            <div className="rounded-xl bg-white dark:bg-slate-900 border border-border p-5">
              <h3 className="text-sm font-semibold text-foreground mb-4">Client Information</h3>
              <div className="space-y-3">
                <div className="flex items-center justify-between py-2 border-b border-border/50">
                  <span className="text-xs text-muted-foreground flex items-center gap-1.5">
                    <User className="h-3.5 w-3.5" />
                    Client Name
                  </span>
                  <span className="text-sm font-medium text-foreground">{wallet.clientName}</span>
                </div>
                <div className="flex items-center justify-between py-2 border-b border-border/50">
                  <span className="text-xs text-muted-foreground flex items-center gap-1.5">
                    <User className="h-3.5 w-3.5" />
                    Client Email
                  </span>
                  <span className="text-sm font-medium text-foreground">{wallet.clientEmail}</span>
                </div>
                <div className="flex items-center justify-between py-2 border-b border-border/50">
                  <span className="text-xs text-muted-foreground flex items-center gap-1.5">
                    <Calendar className="h-3.5 w-3.5" />
                    Contract Start
                  </span>
                  <span className="text-sm text-foreground">
                    {wallet.contractStartDate ? format(new Date(wallet.contractStartDate), 'MMM d, yyyy') : '—'}
                  </span>
                </div>
                <div className="flex items-center justify-between py-2">
                  <span className="text-xs text-muted-foreground flex items-center gap-1.5">
                    <Calendar className="h-3.5 w-3.5" />
                    Contract End
                  </span>
                  <span className="text-sm text-foreground">
                    {wallet.contractEndDate ? format(new Date(wallet.contractEndDate), 'MMM d, yyyy') : '—'}
                  </span>
                </div>
              </div>
            </div>

            {/* Wallet Summary */}
            <div className="rounded-xl bg-white dark:bg-slate-900 border border-border p-5">
              <h3 className="text-sm font-semibold text-foreground mb-4">Wallet Summary</h3>
              <div className="space-y-3">
                <div className="flex items-center justify-between py-2 border-b border-border/50">
                  <span className="text-xs text-muted-foreground">Total Purchased</span>
                  <span className="text-sm font-bold text-foreground">{wallet.totalPurchasedHours}h</span>
                </div>
                <div className="flex items-center justify-between py-2 border-b border-border/50">
                  <span className="text-xs text-muted-foreground">Reserved</span>
                  <span className="text-sm font-bold text-amber-600 dark:text-amber-400">{wallet.reservedHours}h</span>
                </div>
                <div className="flex items-center justify-between py-2 border-b border-border/50">
                  <span className="text-xs text-muted-foreground">Consumed</span>
                  <span className="text-sm font-bold text-blue-600 dark:text-blue-400">{wallet.consumedHours}h</span>
                </div>
                <div className="flex items-center justify-between py-2">
                  <span className="text-xs text-muted-foreground">Remaining</span>
                  <span className={cn(
                    'text-sm font-bold',
                    wallet.remainingHours <= 10 ? 'text-red-600 dark:text-red-400' : 'text-emerald-600 dark:text-emerald-400'
                  )}>{wallet.remainingHours}h</span>
                </div>
              </div>
            </div>
          </div>
        </TabsContent>

        {/* Transactions Tab */}
        <TabsContent value="transactions">
          <div className="rounded-xl bg-white dark:bg-slate-900 border border-border overflow-hidden shadow-sm">
            {transactions.length === 0 ? (
              <div className="p-12 text-center">
                <p className="text-sm text-muted-foreground">No transactions yet</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="bg-muted/30 border-b border-border">
                      <th className="text-left p-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Date</th>
                      <th className="text-left p-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Type</th>
                      <th className="text-right p-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Hours</th>
                      <th className="text-right p-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Previous Balance</th>
                      <th className="text-right p-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">New Balance</th>
                      <th className="text-left p-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Validity</th>
                      <th className="text-left p-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Reason</th>
                      <th className="text-left p-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Performed By</th>
                    </tr>
                  </thead>
                  <tbody>
                    {transactions.map((t) => (
                      <tr key={t.id} className="border-b border-border/50 hover:bg-muted/20 transition-colors">
                        <td className="p-3 text-sm text-muted-foreground">
                          {format(new Date(t.performedAt), 'MMM d, yyyy HH:mm')}
                        </td>
                        <td className="p-3">
                          <TransactionTypeBadge type={t.transactionType} />
                        </td>
                        <td className="p-3 text-right text-sm font-semibold text-foreground">{t.hours}</td>
                        <td className="p-3 text-right text-sm text-muted-foreground">{t.previousBalance}</td>
                        <td className="p-3 text-right text-sm font-semibold text-foreground">{t.newBalance}</td>
                        <td className="p-3 text-sm text-muted-foreground">
                          {t.validFrom || t.validTo ? (
                            <span className="text-xs">
                              {t.validFrom ? format(new Date(t.validFrom), 'MMM d') : '—'}
                              {' → '}
                              {t.validTo ? format(new Date(t.validTo), 'MMM d, yyyy') : '—'}
                            </span>
                          ) : (
                            <span className="text-xs text-muted-foreground italic">—</span>
                          )}
                        </td>
                        <td className="p-3 text-sm text-muted-foreground max-w-[200px] truncate">{t.reason || '—'}</td>
                        <td className="p-3 text-sm text-foreground">{t.performedByName || t.performedBy}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </TabsContent>

        {/* Consumption Tab */}
        <TabsContent value="consumption">
          <div className="rounded-xl bg-white dark:bg-slate-900 border border-border overflow-hidden shadow-sm">
            {consumption.length === 0 ? (
              <div className="p-12 text-center">
                <p className="text-sm text-muted-foreground">No tickets have consumed hours from this wallet yet</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="bg-muted/30 border-b border-border">
                      <th className="text-left p-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Ticket</th>
                      <th className="text-left p-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Title</th>
                      <th className="text-right p-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Est. Hours</th>
                      <th className="text-right p-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Reserved</th>
                      <th className="text-right p-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Consumed</th>
                      <th className="text-center p-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Status</th>
                      <th className="text-right p-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Completed</th>
                      <th className="p-3"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {consumption.map((c: any) => (
                      <tr key={c.id} className="border-b border-border/50 hover:bg-muted/20 transition-colors">
                        <td className="p-3">
                          <code className="text-xs font-mono text-muted-foreground">{c.ticketNumber}</code>
                        </td>
                        <td className="p-3 text-sm text-foreground max-w-[200px] truncate">{c.title}</td>
                        <td className="p-3 text-right text-sm text-muted-foreground">{c.estimatedHours || 0}</td>
                        <td className="p-3 text-right text-sm text-amber-600 dark:text-amber-400 font-medium">{c.reservedHours || 0}</td>
                        <td className="p-3 text-right text-sm text-blue-600 dark:text-blue-400 font-medium">{c.consumedHours || 0}</td>
                        <td className="p-3 text-center">
                          <TicketStatusBadgeSmall status={c.status} />
                        </td>
                        <td className="p-3 text-right text-sm text-muted-foreground">
                          {c.completedAt ? format(new Date(c.completedAt), 'MMM d, yyyy') : '—'}
                        </td>
                        <td className="p-3">
                          <Link href={`/dashboard/tickets/${c.id}`}>
                            <Button variant="ghost" size="icon" className="h-7 w-7">
                              <Eye className="h-3.5 w-3.5" />
                            </Button>
                          </Link>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </TabsContent>

            {/* Contract Validity */}
            {wallet.contractEndDate && (
              <div className="rounded-xl bg-white dark:bg-slate-900 border border-border p-5"
              >
                <h3 className="text-sm font-semibold text-foreground mb-4 flex items-center gap-2">
                  <Shield className="h-4 w-4 text-primary" />
                  Support Validity
                </h3>
                <div className="space-y-3">
                  <div className="flex items-center justify-between py-2 border-b border-border/50">
                    <span className="text-xs text-muted-foreground">Status</span>
                    <span className={cn('inline-flex items-center px-2.5 py-0.5 rounded-lg text-xs font-medium border', contractStatus.color)}>
                      {contractStatus.status === 'active' && <CheckCircle2 className="h-3 w-3 mr-1" />}
                      {contractStatus.status === 'expiring_soon' && <AlertTriangle className="h-3 w-3 mr-1" />}
                      {contractStatus.status === 'expired' && <XCircle className="h-3 w-3 mr-1" />}
                      {contractStatus.label}
                    </span>
                  </div>
                  <div className="flex items-center justify-between py-2 border-b border-border/50">
                    <span className="text-xs text-muted-foreground">Valid From</span>
                    <span className="text-sm font-medium text-foreground">
                      {wallet.contractStartDate ? format(new Date(wallet.contractStartDate), 'MMM d, yyyy') : '\u2014'}
                    </span>
                  </div>
                  <div className="flex items-center justify-between py-2 border-b border-border/50">
                    <span className="text-xs text-muted-foreground">Valid Until</span>
                    <span className="text-sm font-medium text-foreground">
                      {format(new Date(wallet.contractEndDate), 'MMM d, yyyy')}
                    </span>
                  </div>
                  {contractStatus.daysRemaining > 0 && (
                    <div className="flex items-center justify-between py-2">
                      <span className="text-xs text-muted-foreground">Days Remaining</span>
                      <span className={cn(
                        'text-sm font-bold',
                        contractStatus.daysRemaining <= 30 ? 'text-amber-600 dark:text-amber-400' : 'text-emerald-600 dark:text-emerald-400'
                      )}>
                        {contractStatus.daysRemaining} days
                      </span>
                    </div>
                  )}
                </div>
              </div>
            )}

        {/* Alerts Tab */}
        <TabsContent value="alerts">
          <div className="rounded-xl bg-white dark:bg-slate-900 border border-border overflow-hidden shadow-sm">
            {wallet.alerts.length === 0 ? (
              <div className="p-12 text-center">
                <p className="text-sm text-muted-foreground">No alerts for this wallet</p>
              </div>
            ) : (
              <div className="divide-y divide-border/50">
                {wallet.alerts.map((alert: any) => (
                  <div key={alert.id} className="p-4 flex items-center gap-3 hover:bg-muted/20 transition-colors">
                    <div className={cn(
                      'p-2 rounded-xl',
                      alert.resolvedAt ? 'bg-green-50 dark:bg-green-500/15' : 'bg-amber-50 dark:bg-amber-500/15'
                    )}>
                      {alert.resolvedAt ? (
                        <CheckCircle2 className="h-4 w-4 text-green-500 dark:text-green-400" />
                      ) : (
                        <AlertTriangle className="h-4 w-4 text-amber-500 dark:text-amber-400" />
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <AlertTypeBadge type={alert.alertType} />
                        {alert.resolvedAt && (
                          <span className="text-[11px] text-green-600 dark:text-green-400">Resolved</span>
                        )}
                      </div>
                      <p className="text-sm text-foreground mt-1">{alert.message}</p>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {format(new Date(alert.createdAt), 'MMM d, yyyy HH:mm')}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </TabsContent>
      </Tabs>

      {/* Add Hours Dialog */}
      <Dialog open={showAddHours} onOpenChange={setShowAddHours}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Add Support Hours</DialogTitle>
            <DialogDescription>
              Add prepaid support hours to this wallet. The balance will be updated immediately.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="hours">Hours to Add <span className="text-destructive">*</span></Label>
              <Input
                id="hours"
                type="number"
                min="1"
                value={addHoursForm.hours}
                onChange={(e) => setAddHoursForm(f => ({ ...f, hours: e.target.value }))}
                placeholder="e.g., 50"
                className="h-11"
              />
            </div>

            {/* Support Validity Period */}
            <div className="rounded-lg border p-4 space-y-3 bg-muted/20">
              <h4 className="text-sm font-semibold flex items-center gap-2">
                <Shield className="h-4 w-4 text-primary" />
                Support Validity Period
              </h4>
              <SupportValidityPicker
                startDate={addHoursForm.startDate}
                endDate={addHoursForm.endDate}
                onStartDateChange={(d) => setAddHoursForm(f => ({ ...f, startDate: d }))}
                onEndDateChange={(d) => setAddHoursForm(f => ({ ...f, endDate: d }))}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="reason">Reason</Label>
              <Select
                value={addHoursForm.reason}
                onValueChange={(v) => setAddHoursForm(f => ({ ...f, reason: v }))}
              >
                <SelectTrigger className="h-11">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Contract Renewal">Contract Renewal</SelectItem>
                  <SelectItem value="Additional Support Package">Additional Support Package</SelectItem>
                  <SelectItem value="Emergency Credit">Emergency Credit</SelectItem>
                  <SelectItem value="Management Adjustment">Management Adjustment</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="remarks">Remarks <span className="font-normal text-muted-foreground">(optional)</span></Label>
              <Textarea
                id="remarks"
                value={addHoursForm.remarks}
                onChange={(e) => setAddHoursForm(f => ({ ...f, remarks: e.target.value }))}
                placeholder="Any additional notes..."
                rows={3}
                className="resize-none"
              />
            </div>

            {addHoursError && (
              <div className="p-3 rounded-xl bg-red-50 dark:bg-red-500/15 border border-red-200 dark:border-red-500/30 text-sm text-red-600 dark:text-red-400">
                {addHoursError}
              </div>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAddHours(false)} disabled={addHoursLoading}>
              Cancel
            </Button>
            <Button onClick={handleAddHours} disabled={addHoursLoading}>
              {addHoursLoading ? 'Adding...' : `Add ${addHoursForm.hours || 0} Hours`}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

'use client'

import { motion } from 'framer-motion'
import { format, formatDistanceToNow } from 'date-fns'
import Link from 'next/link'
import { cn } from '@/lib/utils'
import { PageHeaderIcon } from '@/components/dashboard/page-header-icon'
import {
  Wallet,
  AlertTriangle,
  CheckCircle2,
  Clock,
  Calendar,
  XCircle,
  Plus,
  RefreshCw,
  Shield,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { WALLET_STATUS_CONFIG } from '@/lib/types'
import type { UserRole, WalletTransaction, WalletTransactionType } from '@/lib/types'
import { getWalletContractStatus } from '@/lib/wallet-utils'

// ─── Types ─────────────────────────────────────────────────────────────────

interface ClientWallet {
  id: number
  clientId: string
  projectId: number | null
  totalPurchasedHours: number
  reservedHours: number
  consumedHours: number
  remainingHours: number
  contractStartDate: string | null
  contractEndDate: string | null
  status: string
  createdAt: Date
  updatedAt: Date
  clientName?: string
  projectName?: string
  projectCode?: string
}

interface SupportWalletClientProps {
  user: { id: string; name: string; role: UserRole }
  wallet: ClientWallet | null
  transactions: WalletTransaction[]
}

// ─── Transaction Type Badge ────────────────────────────────────────────────

function TransactionTypeBadge({ type }: { type: string }) {
  const config: Record<string, { label: string; color: string }> = {
    'Add Hours': { label: 'Recharge', color: 'bg-green-50 dark:bg-green-500/15 text-green-600 dark:text-green-400 border-green-200 dark:border-green-500/30' },
    'Deduct Hours': { label: 'Deducted', color: 'bg-red-50 dark:bg-red-500/15 text-red-600 dark:text-red-400 border-red-200 dark:border-red-500/30' },
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

// ─── Main Component ────────────────────────────────────────────────────────

export function SupportWalletClient({ user, wallet, transactions }: SupportWalletClientProps) {
  if (!wallet) {
    return (
      <div className="space-y-6" data-tour="wallet-card">
        <div data-tour="wallet-header" className="bg-white dark:bg-slate-900 border border-border rounded-xl shadow-sm p-4">
          <div className="flex items-center gap-3">
            <PageHeaderIcon variant="green">
              <Wallet className="h-5 w-5" />
            </PageHeaderIcon>
            <h1 className="text-2xl font-bold text-foreground tracking-tight">Support Wallet</h1>
          </div>
        </div>
        <Card className="p-12 text-center">
          <div className="flex flex-col items-center gap-3">
            <Wallet className="h-10 w-10 text-muted-foreground/40" />
            <h3 className="text-lg font-semibold text-foreground">No Wallet Yet</h3>
            <p className="text-sm text-muted-foreground max-w-md">
              Your support wallet hasn&apos;t been created yet. Please contact your account manager to set up support hours.
            </p>
          </div>
        </Card>
      </div>
    )
  }

  const statusInfo = WALLET_STATUS_CONFIG[wallet.status as keyof typeof WALLET_STATUS_CONFIG]
  const contractStatus = getWalletContractStatus(wallet.contractEndDate)
  const remainingPct = wallet.totalPurchasedHours > 0
    ? Math.round((wallet.remainingHours / wallet.totalPurchasedHours) * 100)
    : 0
  const isLowBalance = wallet.remainingHours <= (wallet.totalPurchasedHours * 0.25) && wallet.remainingHours > 0
  const isExhausted = wallet.remainingHours <= 0
  const isWarning = wallet.remainingHours <= 10 && wallet.remainingHours > 0

  return (
    <div className="space-y-6" data-tour="wallet-card">        {/* Header */}
      <div data-tour="wallet-header" className="bg-white dark:bg-slate-900 border border-border rounded-xl shadow-sm p-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <PageHeaderIcon variant="green">
              <Wallet className="h-5 w-5" />
            </PageHeaderIcon>
            <div>
              <h1 className="text-2xl font-bold text-foreground tracking-tight">Support Wallet</h1>
              {wallet.projectName && (
                <p className="text-sm text-muted-foreground">{wallet.projectName}</p>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span className={cn('inline-flex items-center px-2.5 py-0.5 rounded-lg text-xs font-medium border', statusInfo?.color)}>
              {statusInfo?.label || wallet.status}
            </span>
            {wallet.contractEndDate && (
              <span className={cn('inline-flex items-center px-2.5 py-0.5 rounded-lg text-xs font-medium border', contractStatus.color)}>
                {contractStatus.status === 'expired' && <XCircle className="h-3 w-3 mr-1" />}
                {contractStatus.status === 'active' && <CheckCircle2 className="h-3 w-3 mr-1" />}
                {contractStatus.status === 'expiring_soon' && <AlertTriangle className="h-3 w-3 mr-1" />}
                {contractStatus.label}
              </span>
            )}
            <Link href="/dashboard/tickets/new">
              <Button size="sm" className="rounded-lg">
                <Plus className="mr-1.5 h-3.5 w-3.5" />
                New Ticket
              </Button>
            </Link>
          </div>
        </div>
      </div>

      {/* Low Balance Alert Banner */}
      {isExhausted && (
        <motion.div
          initial={{ opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0 }}
          className="rounded-xl bg-red-50 dark:bg-red-500/15 border border-red-200 dark:border-red-500/30 p-4 flex items-start gap-3"
        >
          <XCircle className="h-5 w-5 text-red-500 dark:text-red-400 shrink-0 mt-0.5" />
          <div>
            <h3 className="text-sm font-semibold text-red-700 dark:text-red-300">Support Hours Exhausted</h3>
            <p className="text-sm text-red-600 dark:text-red-400 mt-1">
              Your support wallet has no remaining hours. New tickets cannot be created until additional support hours are purchased. Please contact your account manager.
            </p>
          </div>
        </motion.div>
      )}

      {isLowBalance && !isExhausted && (
        <motion.div
          initial={{ opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0 }}
          className="rounded-xl bg-amber-50 dark:bg-amber-500/15 border border-amber-200 dark:border-amber-500/30 p-4 flex items-start gap-3"
        >
          <AlertTriangle className="h-5 w-5 text-amber-500 dark:text-amber-400 shrink-0 mt-0.5" />
          <div>
            <h3 className="text-sm font-semibold text-amber-700 dark:text-amber-300">Low Balance Warning</h3>
            <p className="text-sm text-amber-600 dark:text-amber-400 mt-1">
              Your support hours are running low ({wallet.remainingHours} hours remaining, {remainingPct}% of total). Please contact your account manager if you need additional hours.
            </p>
          </div>
        </motion.div>
      )}

      {isWarning && !isLowBalance && !isExhausted && (
        <motion.div
          initial={{ opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0 }}
          className="rounded-xl bg-amber-50 dark:bg-amber-500/15/60 border border-amber-200 dark:border-amber-500/30/60 p-4 flex items-start gap-3"
        >
          <AlertTriangle className="h-5 w-5 text-amber-400 shrink-0 mt-0.5" />
          <div>
            <h3 className="text-sm font-semibold text-amber-700 dark:text-amber-300">Low Hours ({wallet.remainingHours}h remaining)</h3>
            <p className="text-sm text-amber-600 dark:text-amber-400 mt-1">
              You have {wallet.remainingHours} hours or fewer remaining. You can still create tickets, but consider requesting additional hours soon.
            </p>
          </div>
        </motion.div>
      )}

      {/* Wallet Summary Cards */}
      <div data-tour="wallet-summary" className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0 }}
          className="rounded-xl bg-white dark:bg-slate-900 border border-border p-5 shadow-sm"
        >
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Purchased Hours</p>
          <p className="text-2xl font-bold text-foreground mt-1">{wallet.totalPurchasedHours}</p>
          <div className="flex items-center gap-1.5 mt-1 text-xs text-muted-foreground">
            <Calendar className="h-3 w-3" />
            {wallet.contractStartDate ? `Since ${format(new Date(wallet.contractStartDate), 'MMM d, yyyy')}` : 'Total hours purchased'}
          </div>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="rounded-xl bg-white dark:bg-slate-900 border border-border p-5 shadow-sm"
        >
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Used Hours</p>
          <p className="text-2xl font-bold text-blue-600 dark:text-blue-400 mt-1">{wallet.consumedHours + wallet.reservedHours}</p>
          <div className="flex items-center gap-1.5 mt-1 text-xs text-muted-foreground">
            <Clock className="h-3 w-3" />
            {wallet.consumedHours > 0 ? `${wallet.consumedHours}h consumed, ${wallet.reservedHours}h reserved` : 'No hours used yet'}
          </div>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="rounded-xl bg-white dark:bg-slate-900 border border-border p-5 shadow-sm"
        >
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Remaining Hours</p>
          <p className={cn(
            'text-2xl font-bold mt-1',
            isExhausted ? 'text-red-600 dark:text-red-400' :
            isLowBalance ? 'text-amber-600 dark:text-amber-400' :
            'text-emerald-600 dark:text-emerald-400'
          )}>{wallet.remainingHours}</p>
          <div className="flex items-center gap-1.5 mt-1 text-xs">
            {isExhausted ? (
              <span className="text-red-600 dark:text-red-400 flex items-center gap-1">
                <XCircle className="h-3 w-3" />
                Exhausted
              </span>
            ) : isLowBalance ? (
              <span className="text-amber-600 dark:text-amber-400 flex items-center gap-1">
                <AlertTriangle className="h-3 w-3" />
                Low — consider recharging
              </span>
            ) : (
              <span className="text-emerald-600 dark:text-emerald-400 flex items-center gap-1">
                <CheckCircle2 className="h-3 w-3" />
                Adequate balance
              </span>
            )}
          </div>
        </motion.div>

      </div>

      {/* Ticket Creation Info */}
      {isExhausted && (
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="rounded-xl bg-red-50 dark:bg-red-500/15 border border-red-200 dark:border-red-500/30 p-5 flex items-center justify-between"
        >
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl bg-red-100 dark:bg-red-500/20">
              <XCircle className="h-5 w-5 text-red-500 dark:text-red-400" />
            </div>
            <div>
              <p className="text-sm font-semibold text-red-700 dark:text-red-300">Ticket Creation Blocked</p>
              <p className="text-xs text-red-600 dark:text-red-400 mt-0.5">Additional support hours must be purchased before creating new tickets.</p>
            </div>
          </div>
          <Button variant="outline" disabled className="rounded-lg opacity-50 cursor-not-allowed">
            <Plus className="mr-1.5 h-3.5 w-3.5" />
            Create Ticket
          </Button>
        </motion.div>
      )}

      {isWarning && !isExhausted && (
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="rounded-xl bg-amber-50 dark:bg-amber-500/15/60 border border-amber-200 dark:border-amber-500/30/60 p-4 flex items-center justify-between"
        >
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl bg-amber-100 dark:bg-amber-500/20">
              <AlertTriangle className="h-5 w-5 text-amber-500 dark:text-amber-400" />
            </div>
            <div>
              <p className="text-sm font-semibold text-amber-700 dark:text-amber-300">Limited Hours ({wallet.remainingHours} remaining)</p>
              <p className="text-xs text-amber-600 dark:text-amber-400 mt-0.5">You can still create tickets, but your balance is getting low.</p>
            </div>
          </div>
          <Link href="/dashboard/tickets/new">
            <Button size="sm" variant="outline" className="rounded-lg border-amber-200 dark:border-amber-500/30 text-amber-700 dark:text-amber-300 hover:bg-amber-50 dark:hover:bg-amber-500/10">
              <Plus className="mr-1.5 h-3.5 w-3.5" />
              Create Ticket
            </Button>
          </Link>
        </motion.div>
      )}

      {/* Transaction History */}
      <motion.div
        data-tour="wallet-transactions"
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.3 }}
        className="rounded-xl bg-white dark:bg-slate-900 border border-border shadow-sm overflow-hidden"
      >
        <div className="p-5 border-b border-border/50">
          <div className="flex items-center gap-2">
            <RefreshCw className="h-4 w-4 text-primary" />
            <h3 className="text-sm font-semibold text-foreground">Transaction History</h3>
            <span className="text-xs text-muted-foreground">({transactions.length})</span>
          </div>
        </div>

        {transactions.length === 0 ? (
          <div className="p-12 text-center">
            <Wallet className="h-8 w-8 text-muted-foreground/30 mx-auto mb-2" />
            <p className="text-sm text-muted-foreground">No transactions yet</p>
            <p className="text-xs text-muted-foreground/60 mt-1">Your wallet transactions will appear here once they are processed.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="bg-muted/20 border-b border-border">
                  <th className="text-left p-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Date</th>
                  <th className="text-left p-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Type</th>
                  <th className="text-right p-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Hours</th>
                  <th className="text-right p-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Balance After</th>
                  <th className="text-left p-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Added By</th>
                  <th className="text-left p-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Notes</th>
                </tr>
              </thead>
              <tbody>
                {transactions.map((t, idx) => (
                  <motion.tr
                    key={t.id}
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ delay: Math.min(idx * 0.03, 0.3) }}
                    className="border-b border-border/30 hover:bg-muted/20 transition-colors"
                  >
                    <td className="p-3 text-sm text-muted-foreground whitespace-nowrap">
                      {format(new Date(t.performedAt), 'MMM d, yyyy')}
                      <span className="block text-[11px] text-muted-foreground/60">
                        {format(new Date(t.performedAt), 'h:mm a')}
                      </span>
                    </td>
                    <td className="p-3">
                      <TransactionTypeBadge type={t.transactionType} />
                    </td>
                    <td className={cn(
                      'p-3 text-right text-sm font-semibold',
                      t.transactionType === 'Deduct Hours' ? 'text-red-600 dark:text-red-400' : 'text-emerald-600 dark:text-emerald-400'
                    )}>
                      {t.transactionType === 'Deduct Hours' ? `-${Math.abs(t.hours)}` : `+${Math.abs(t.hours)}`}
                    </td>
                    <td className="p-3 text-right text-sm font-semibold text-foreground">{t.newBalance}</td>
                    <td className="p-3 text-sm text-muted-foreground">
                      {t.performedByName || t.performedBy}
                    </td>
                    <td className="p-3 text-sm text-muted-foreground max-w-[180px] truncate">
                      {t.reason || '—'}
                      {t.remarks && (
                        <span className="block text-[11px] text-muted-foreground/60 truncate">{t.remarks}</span>
                      )}
                    </td>
                  </motion.tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </motion.div>
    </div>
  )
}

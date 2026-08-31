'use client'

import { memo } from 'react'
import { format } from 'date-fns'
import Link from 'next/link'
import { cn } from '@/lib/utils'
import {
  Eye, Plus, XCircle, AlertTriangle, CheckCircle2, MoreHorizontal,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import type { SupportWallet } from '@/lib/types'
import { getWalletContractStatus } from '@/lib/wallet-utils'

interface WalletTableProps {
  wallets: SupportWallet[]
  isManagerOrAdmin: boolean
  getStatusInfo: (wallet: SupportWallet) => { label: string; color: string }
}

const WalletTableRow = memo(function WalletTableRow({
  wallet,
  isManagerOrAdmin,
  statusInfo,
}: {
  wallet: SupportWallet
  isManagerOrAdmin: boolean
  statusInfo: { label: string; color: string }
}) {
  const utilizationPct = wallet.totalPurchasedHours > 0
    ? Math.round(((wallet.consumedHours + wallet.reservedHours) / wallet.totalPurchasedHours) * 100)
    : 0

  return (
    <TableRow className="group hover:bg-muted/20 transition-colors">
      <TableCell>
        <div className="flex items-center gap-2">
          <div className="h-7 w-7 rounded-full bg-emerald-100 dark:bg-emerald-500/20 flex items-center justify-center shrink-0">
            <span className="text-[11px] font-semibold text-emerald-600 dark:text-emerald-400">
              {(wallet.clientName || '??').split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2)}
            </span>
          </div>
          <span className="text-sm font-medium text-foreground truncate max-w-[150px]">
            {wallet.clientName || 'Unknown'}
          </span>
        </div>
      </TableCell>
      <TableCell>
        <Link href={`/dashboard/wallets/${wallet.id}`} className="block group/cell">
          <p className="text-sm font-medium text-foreground group-hover/cell:text-primary transition-colors truncate max-w-[150px]">
            {wallet.clientEmail || (
              <span className="text-muted-foreground italic">Client Wallet</span>
            )}
          </p>
          <span className="text-xs text-muted-foreground">Client Wallet</span>
        </Link>
      </TableCell>
      <TableCell className="text-center">
        <span className="text-sm font-semibold text-foreground">{wallet.totalPurchasedHours}</span>
      </TableCell>
      <TableCell className="text-center">
        <span className="text-sm text-amber-600 dark:text-amber-400 font-medium">{wallet.reservedHours}</span>
      </TableCell>
      <TableCell className="text-center">
        <span className="text-sm text-blue-600 dark:text-blue-400 font-medium">{wallet.consumedHours}</span>
      </TableCell>
      <TableCell className="text-center">
        <span className={cn(
          'text-sm font-semibold',
          wallet.remainingHours <= 10 ? 'text-red-600 dark:text-red-400' :
          wallet.remainingHours <= 20 ? 'text-amber-600 dark:text-amber-400' : 'text-green-600 dark:text-green-400'
        )}>
          {wallet.remainingHours}
        </span>
      </TableCell>
      <TableCell className="text-center">
        <div className="flex items-center gap-2 min-w-[100px]">
          <div className="flex-1 h-2 rounded-full bg-muted overflow-hidden">
            <div
              className={cn(
                'h-full rounded-full origin-left',
                utilizationPct >= 90 ? 'bg-red-500' :
                utilizationPct >= 70 ? 'bg-amber-500' : 'bg-emerald-500'
              )}
              style={{ transform: `scaleX(${utilizationPct / 100})`, width: '100%', maxWidth: '100%' }}
            />
          </div>
          <span className="text-xs font-medium text-muted-foreground w-8 text-right">{utilizationPct}%</span>
        </div>
      </TableCell>
      <TableCell>
        {wallet.contractEndDate ? (() => {
          const c = getWalletContractStatus(wallet.contractEndDate)
          return (
            <div className="flex flex-col">
              <span className={cn(
                'inline-flex items-center px-2 py-0.5 rounded text-xs font-medium border w-fit', c.color,
              )}>
                {c.status === 'expired' ? <XCircle className="h-3 w-3 mr-1" /> :
                 c.status === 'expiring_soon' ? <AlertTriangle className="h-3 w-3 mr-1" /> :
                 <CheckCircle2 className="h-3 w-3 mr-1" />}
                {c.label}
              </span>
              {wallet.contractStartDate && (
                <span className="text-[11px] text-muted-foreground mt-0.5">
                  {format(new Date(wallet.contractStartDate), 'MMM d')} - {format(new Date(wallet.contractEndDate), 'MMM d, yyyy')}
                </span>
              )}
            </div>
          )
        })() : (
          <span className="text-xs text-muted-foreground italic">No contract</span>
        )}
      </TableCell>
      <TableCell>
        <span className="text-xs text-muted-foreground">
          {format(new Date(wallet.updatedAt), 'MMM d, yyyy')}
        </span>
      </TableCell>
      <TableCell>
        <span className={cn(
          'inline-flex items-center px-2 py-0.5 rounded text-xs font-medium border', statusInfo.color,
        )}>
          {statusInfo.label}
        </span>
      </TableCell>
      <TableCell>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" className="h-8 w-8 opacity-0 group-hover:opacity-100 transition-opacity">
              <MoreHorizontal className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-48">
            <DropdownMenuItem asChild>
              <Link href={`/dashboard/wallets/${wallet.id}`} className="cursor-pointer flex items-center">
                <Eye className="mr-2 h-4 w-4" /> View Wallet
              </Link>
            </DropdownMenuItem>
            {isManagerOrAdmin && (
              <DropdownMenuItem asChild>
                <Link href={`/dashboard/wallets/${wallet.id}`} className="cursor-pointer flex items-center">
                  <Plus className="mr-2 h-4 w-4" /> Add Hours
                </Link>
              </DropdownMenuItem>
            )}
            <DropdownMenuSeparator />
            <DropdownMenuItem asChild>
              <Link href={`/dashboard/wallets/${wallet.id}`} className="cursor-pointer flex items-center">
                <Eye className="mr-2 h-4 w-4" /> View Transactions
              </Link>
            </DropdownMenuItem>
            <DropdownMenuItem asChild>
              <Link href={`/dashboard/wallets/${wallet.id}`} className="cursor-pointer flex items-center">
                <Eye className="mr-2 h-4 w-4" /> View Consumption
              </Link>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </TableCell>
    </TableRow>
  )
})

export const WalletTable = memo(function WalletTable({
  wallets,
  isManagerOrAdmin,
  getStatusInfo,
}: WalletTableProps) {
  return (
    <div className="rounded-xl bg-white dark:bg-slate-900 border border-border overflow-hidden shadow-sm">
      <Table>
        <TableHeader>
          <TableRow className="bg-muted/30">
            <TableHead className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Client</TableHead>
            <TableHead className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Project</TableHead>
            <TableHead className="text-xs font-semibold text-muted-foreground uppercase tracking-wider text-center">Purchased</TableHead>
            <TableHead className="text-xs font-semibold text-muted-foreground uppercase tracking-wider text-center">Reserved</TableHead>
            <TableHead className="text-xs font-semibold text-muted-foreground uppercase tracking-wider text-center">Consumed</TableHead>
            <TableHead className="text-xs font-semibold text-muted-foreground uppercase tracking-wider text-center">Remaining</TableHead>
            <TableHead className="text-xs font-semibold text-muted-foreground uppercase tracking-wider text-center">Balance</TableHead>
            <TableHead className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Contract Valid</TableHead>
            <TableHead className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Last Updated</TableHead>
            <TableHead className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Status</TableHead>
            <TableHead className="w-[60px]"></TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {wallets.map((wallet) => (
            <WalletTableRow
              key={wallet.id}
              wallet={wallet}
              isManagerOrAdmin={isManagerOrAdmin}
              statusInfo={getStatusInfo(wallet)}
            />
          ))}
        </TableBody>
      </Table>
    </div>
  )
})

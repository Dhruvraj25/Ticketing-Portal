'use client'

import { memo } from 'react'
import { Wallet } from 'lucide-react'

interface WalletEmptyStateProps {
  hasFilters: boolean
}

export const WalletEmptyState = memo(function WalletEmptyState({ hasFilters }: WalletEmptyStateProps) {
  return (
    <div className="rounded-xl bg-white dark:bg-slate-900 border border-border p-12 text-center">
      <div className="flex flex-col items-center gap-3">
        <div className="p-4 rounded-2xl bg-muted/30">
          <Wallet className="h-10 w-10 text-muted-foreground/50" />
        </div>
        <p className="font-semibold text-foreground text-lg">
          {hasFilters ? 'No wallets match your filters' : 'No support wallets yet'}
        </p>
        <p className="text-sm text-muted-foreground">
          {hasFilters
            ? 'Try adjusting your search or filter criteria.'
            : 'Support wallets are automatically created for new clients and new projects.'}
        </p>
      </div>
    </div>
  )
})

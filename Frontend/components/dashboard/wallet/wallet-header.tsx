'use client'

import { memo } from 'react'
import { Wallet } from 'lucide-react'
import { PageHeaderIcon } from '@/components/dashboard/page-header-icon'

interface WalletPageHeaderProps {
  walletCount: number
}

export const WalletPageHeader = memo(function WalletPageHeader({ walletCount }: WalletPageHeaderProps) {
  return (
    <div className="flex items-center justify-between">
      <div className="flex items-center gap-3">
        <PageHeaderIcon variant="green">
          <Wallet className="h-5 w-5" />
        </PageHeaderIcon>
        <div>
          <h1 className="text-xl font-bold text-foreground tracking-tight">Support Wallets</h1>
          <p className="text-sm text-muted-foreground">Manage prepaid support hours for client projects</p>
        </div>
      </div>
      <span className="inline-flex items-center gap-1.5 text-sm text-muted-foreground bg-muted/60 px-3 py-1.5 rounded-lg border border-border/60">
        <span className="font-semibold text-foreground">{walletCount}</span>
        {walletCount === 1 ? 'wallet' : 'wallets'}
      </span>
    </div>
  )
})

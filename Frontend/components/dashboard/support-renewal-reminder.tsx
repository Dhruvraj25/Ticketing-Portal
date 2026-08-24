'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { motion, AnimatePresence } from 'framer-motion'
import { format } from 'date-fns'
import { AlertTriangle, XCircle, CheckCircle2, Shield, Clock, Wallet, Calendar, ExternalLink, X, Bell, RefreshCw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog'
import { cn } from '@/lib/utils'
import { logRenewalReminderActivity } from '@/app/actions/wallets'

export type RenewalStatus = {
  showReminder: boolean
  lowHours: boolean
  expiringSoon: boolean
  contractExpired: boolean
  remainingHours: number
  totalPurchasedHours: number
  contractStartDate: string | null
  contractEndDate: string | null
  daysRemaining: number
  walletId: number | null
}

interface Props { status: RenewalStatus }
const SESSION_KEY = 'support_renewal_reminder_dismissed'

interface BadgeConfig { contractExpired: boolean; lowHours: boolean; expiringSoon: boolean; daysRemaining: number; remainingHours: number }

function StatusBadge({ config }: { config: BadgeConfig }) {
  if (config.contractExpired) return <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium bg-red-50 dark:bg-red-500/15 text-red-700 dark:text-red-300 border border-red-200 dark:border-red-500/30"><XCircle className="h-4 w-4" /> Support Contract Expired</span>
  if (config.lowHours && config.expiringSoon) return <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium bg-orange-50 dark:bg-orange-500/15 text-orange-700 dark:text-orange-300 border border-orange-200 dark:border-orange-500/30"><AlertTriangle className="h-4 w-4" /> Low Hours & Expiring Soon</span>
  if (config.lowHours) return <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium bg-orange-50 dark:bg-orange-500/15 text-orange-700 dark:text-orange-300 border border-orange-200 dark:border-orange-500/30"><AlertTriangle className="h-4 w-4" /> Only {config.remainingHours} Support Hours Remaining</span>
  if (config.expiringSoon) return <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium bg-amber-50 dark:bg-amber-500/15 text-amber-700 dark:text-amber-300 border border-amber-200 dark:border-amber-500/30"><Clock className="h-4 w-4" /> Expires in {config.daysRemaining} Days</span>
  return <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium bg-green-50 dark:bg-green-500/15 text-green-700 dark:text-green-300 border border-green-200 dark:border-green-500/30"><CheckCircle2 className="h-4 w-4" /> Support Active</span>
}

export function SupportRenewalReminder({ status }: Props) {
  const router = useRouter()
  const [showPopup, setShowPopup] = useState(false)
  const [dismissedThisSession, setDismissedThisSession] = useState(false)
  const [showBanner, setShowBanner] = useState(true)

  useEffect(() => {
    if (typeof window !== 'undefined') {
      try {
        const d = sessionStorage.getItem(SESSION_KEY)
        if (d === 'true') setDismissedThisSession(true)
      } catch { /* noop */ }
    }
  }, [])

  useEffect(() => {
    if (status.showReminder && !dismissedThisSession) {
      const t = setTimeout(() => {
        setShowPopup(true)
        logRenewalReminderActivity('Reminder Displayed').catch(() => {})
      }, 800)
      return () => clearTimeout(t)
    }
  }, [status.showReminder, dismissedThisSession])

  useEffect(() => {
    if (showPopup) setShowBanner(false)
  }, [showPopup])

  const handleRemindLater = useCallback(() => {
    setShowPopup(false)
    setDismissedThisSession(true)
    setShowBanner(true)
    logRenewalReminderActivity('Reminder Dismissed').catch(() => {})
    try { sessionStorage.setItem(SESSION_KEY, 'true') } catch { /* noop */ }
  }, [])

  const handleRenewSupport = useCallback(() => {
    setShowPopup(false)
    logRenewalReminderActivity('Renewal Initiated').catch(() => {})
    router.push(status.walletId ? `/dashboard/wallets/${status.walletId}` : '/dashboard/wallets')
  }, [router, status.walletId])

  const handleDismissBanner = useCallback(() => {
    setShowBanner(false)
  }, [])

  const config: BadgeConfig = { contractExpired: status.contractExpired, lowHours: status.lowHours, expiringSoon: status.expiringSoon, daysRemaining: status.daysRemaining, remainingHours: status.remainingHours }

  return (
    <>
      {/* Popup */}
      <Dialog open={showPopup} onOpenChange={(o) => { if (!o) handleRemindLater() }}>
        <DialogContent className="sm:max-w-md gap-0 p-0 overflow-hidden">
          <div className={cn('h-2 w-full', status.contractExpired ? 'bg-red-500' : 'bg-amber-500')} />
          <div className="px-6 pt-5 pb-2">
            <DialogHeader className="space-y-3">
              <div className="flex items-center gap-3">
                <div className={cn('p-2.5 rounded-2xl', status.contractExpired ? 'bg-red-100 dark:bg-red-500/20' : 'bg-amber-500')}>
                  {status.contractExpired ? <XCircle className="h-5 w-5 text-red-600 dark:text-red-400" /> : <Bell className="h-5 w-5 text-white" />}
                </div>
                <div>
                  <DialogTitle className="text-lg font-bold">Support Renewal Reminder</DialogTitle>
                  <DialogDescription className="text-xs text-muted-foreground mt-0.5">Your support package requires attention</DialogDescription>
                </div>
              </div>
            </DialogHeader>
          </div>
          <div className="px-6 py-4 space-y-4">
            <StatusBadge config={config} />
            <div className="rounded-xl border border-border bg-muted/30 divide-y divide-border/50">
              <div className="flex items-center justify-between px-4 py-3">
                <span className="flex items-center gap-2 text-sm text-muted-foreground"><Wallet className="h-4 w-4" /> Support Hours Remaining</span>
                <span className={cn('text-sm font-bold', status.remainingHours <= 5 ? 'text-red-600 dark:text-red-400' : status.remainingHours <= 10 ? 'text-amber-600 dark:text-amber-400' : 'text-emerald-600 dark:text-emerald-400')}>{status.remainingHours} Hours</span>
              </div>
              <div className="flex items-center justify-between px-4 py-3">
                <span className="flex items-center gap-2 text-sm text-muted-foreground"><Shield className="h-4 w-4" /> Total Purchased Hours</span>
                <span className="text-sm font-semibold text-foreground">{status.totalPurchasedHours} Hours</span>
              </div>
              {status.contractStartDate && (
                <div className="flex items-center justify-between px-4 py-3">
                  <span className="flex items-center gap-2 text-sm text-muted-foreground"><Calendar className="h-4 w-4" /> Support Valid From</span>
                  <span className="text-sm font-medium text-foreground">{format(new Date(status.contractStartDate), 'dd-MMM-yyyy')}</span>
                </div>
              )}
              {status.contractEndDate && (
                <div className="flex items-center justify-between px-4 py-3">
                  <span className="flex items-center gap-2 text-sm text-muted-foreground"><Calendar className="h-4 w-4" /> Support Valid Until</span>
                  <span className={cn('text-sm font-bold', status.daysRemaining <= 7 ? 'text-red-600 dark:text-red-400' : status.daysRemaining <= 30 ? 'text-amber-600 dark:text-amber-400' : 'text-emerald-600 dark:text-emerald-400')}>{format(new Date(status.contractEndDate), 'dd-MMM-yyyy')}</span>
                </div>
              )}
              {status.daysRemaining > 0 && (
                <div className="flex items-center justify-between px-4 py-3 bg-amber-50 dark:bg-amber-500/15/50">
                  <span className="flex items-center gap-2 text-sm font-medium text-amber-700 dark:text-amber-300"><Clock className="h-4 w-4" /> Days Remaining</span>
                  <span className={cn('text-sm font-bold', status.daysRemaining <= 7 ? 'text-red-600 dark:text-red-400' : status.daysRemaining <= 30 ? 'text-amber-600 dark:text-amber-400' : 'text-emerald-600 dark:text-emerald-400')}>{status.daysRemaining} days</span>
                </div>
              )}
            </div>
            <p className="text-sm text-muted-foreground leading-relaxed">
              {status.contractExpired
                ? 'Your support contract has expired. Please renew your support package to avoid service interruption and continue creating tickets.'
                : status.lowHours && status.expiringSoon
                  ? `Your support hours are running low (${status.remainingHours}h remaining) and your contract expires in ${status.daysRemaining} days. Please renew your support package to avoid interruption.`
                  : status.lowHours
                    ? `Only ${status.remainingHours} support hours remaining. Please renew your support package to continue receiving support.`
                    : `Your support package expires in ${status.daysRemaining} days. Please renew your support package to avoid interruption.`}
            </p>
          </div>
          <DialogFooter className="px-6 pb-5 pt-2 flex-col sm:flex-row gap-2">
            <Button variant="outline" onClick={handleRemindLater} className="flex-1 rounded-xl"><Clock className="h-4 w-4 mr-1.5" /> Remind Me Later</Button>
            <Button onClick={handleRenewSupport} className="flex-1 rounded-xl"><ExternalLink className="h-4 w-4 mr-1.5" /> Renew Support</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Banner */}
      <AnimatePresence>
        {showBanner && status.showReminder && dismissedThisSession && (
          <motion.div initial={{ opacity: 0, y: -12, height: 0 }} animate={{ opacity: 1, y: 0, height: 'auto' }} exit={{ opacity: 0, y: -12, height: 0 }}
            className={cn('rounded-xl border p-4 flex items-start gap-3', status.contractExpired ? 'bg-red-50 dark:bg-red-500/15 border-red-200 dark:border-red-500/30' : 'bg-amber-50 dark:bg-amber-500/15 border-amber-200 dark:border-amber-500/30')}>
            {status.contractExpired ? <XCircle className="h-5 w-5 text-red-500 dark:text-red-400 shrink-0 mt-0.5" /> : <AlertTriangle className="h-5 w-5 text-amber-500 dark:text-amber-400 shrink-0 mt-0.5" />}
            <div className="flex-1 min-w-0">
              <p className={cn('text-sm font-semibold', status.contractExpired ? 'text-red-700 dark:text-red-300' : 'text-amber-700 dark:text-amber-300')}>
                {status.contractExpired ? 'Your support contract has expired. Please renew your support package.' :
                 status.lowHours && status.expiringSoon ? `Your support expires in ${status.daysRemaining} days with only ${status.remainingHours}h remaining.` :
                 status.lowHours ? `Only ${status.remainingHours} support hours remain.` :
                 `Your support package expires in ${status.daysRemaining} days.`}
              </p>
              {!status.contractExpired && (
                <p className="text-xs mt-0.5 text-amber-600 dark:text-amber-400">
                  {status.lowHours ? `${status.remainingHours}h remaining out of ${status.totalPurchasedHours}h purchased.` :
                   `${status.daysRemaining} days remaining until ${status.contractEndDate ? format(new Date(status.contractEndDate), 'MMM d, yyyy') : 'expiry'}.`}
                </p>
              )}
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <Button size="sm" onClick={handleRenewSupport} className="rounded-lg whitespace-nowrap"><RefreshCw className="h-3.5 w-3.5 mr-1" /> Renew Now</Button>
              <Button variant="ghost" size="icon" className="h-8 w-8 rounded-lg" onClick={handleDismissBanner}><X className="h-4 w-4" /></Button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  )
}

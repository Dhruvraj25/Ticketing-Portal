'use client'

import { useState, useEffect, useCallback } from 'react'
import { motion } from 'framer-motion'
import { Calendar, AlertTriangle, Info, CheckCircle2, Lock } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { format } from 'date-fns'
import {
  calculateSupportValidity,
  getWalletContractStatus,
  DEFAULT_VALIDITY_DAYS,
} from '@/lib/wallet-utils'

interface SupportValidityPickerProps {
  startDate: string
  endDate: string
  onStartDateChange: (date: string) => void
  onEndDateChange: (date: string) => void
  startDateError?: string
  endDateError?: string
  autoCalculate?: boolean
  validityDays?: number
  disabled?: boolean
}

/**
 * Support Validity Picker — reusable across Wallet and Onboarding forms.
 *
 * BEHAVIOR (per spec):
 * - Start Date = Today's system date (auto-set, read-only, no date picker)
 * - End Date   = Start Date + 1 year (auto-calculated, editable via date picker)
 * - Start Date cannot be changed through any UI interaction.
 * - Expiry Date may be lengthened (e.g. 18mo) or shortened by admin/manager.
 */
export function SupportValidityPicker({
  startDate,
  endDate,
  onStartDateChange,
  onEndDateChange,
  startDateError,
  endDateError,
  autoCalculate = true,
  validityDays = DEFAULT_VALIDITY_DAYS,
  disabled = false,
}: SupportValidityPickerProps) {
  const [isManuallyEdited, setIsManuallyEdited] = useState(false)
  const [initialized, setInitialized] = useState(false)

  // ── On mount: auto-set start date to today if empty ──────────────────────
  useEffect(() => {
    if (!initialized) {
      setInitialized(true)
      const today = format(new Date(), 'yyyy-MM-dd')

      if (!startDate) {
        onStartDateChange(today)
        // Auto-calculate end date from today + validity period
        if (autoCalculate) {
          const result = calculateSupportValidity(today, validityDays)
          onEndDateChange(result.endDate)
        }
      } else if (!endDate && autoCalculate) {
        // Has start date but no end date — auto-calculate
        const result = calculateSupportValidity(startDate, validityDays)
        onEndDateChange(result.endDate)
      }
    }
  }, [initialized]) // Only run once on mount

  // ── End date change handler (user-editable) ───────────────────────────────
  const handleEndDateChange = useCallback(
    (value: string) => {
      setIsManuallyEdited(true)
      onEndDateChange(value)
    },
    [onEndDateChange],
  )

  // Calculate validity info
  const validityInfo = getWalletContractStatus(endDate || null)
  const hasError = Boolean(startDateError || endDateError)

  // Format the read-only start date for display
  const formattedStartDate = startDate
    ? format(new Date(startDate + 'T00:00:00'), 'MMMM d, yyyy')
    : '—'

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* ── Start Date (READ-ONLY — no date picker) ───────────────────── */}
        <div className="space-y-2">
          <Label className="flex items-center gap-1.5">
            Support Start Date <span className="text-destructive">*</span>
            <span className="inline-flex items-center gap-0.5 text-[11px] text-muted-foreground bg-muted/50 px-1.5 py-0.5 rounded">
              <Lock className="h-2.5 w-2.5" />
              Auto-set
            </span>
          </Label>
          <div className="relative">
            <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <div className="flex h-11 w-full rounded-lg border border-input bg-muted/30 pl-9 pr-3 py-2.5 text-sm text-foreground font-medium select-none items-center">
              {formattedStartDate}
            </div>
          </div>
          {startDateError && (
            <p className="text-xs text-destructive flex items-center gap-1">
              <AlertTriangle className="h-3 w-3" />
              {startDateError}
            </p>
          )}
          <p className="text-[11px] text-muted-foreground">
            Automatically set to today&apos;s date. Cannot be changed.
          </p>
        </div>

        {/* ── End Date (EDITABLE — date picker) ─────────────────────────── */}
        <div className="space-y-2">
          <Label htmlFor="supportEndDate">
            Support End Date <span className="text-destructive">*</span>
          </Label>
          <div className="relative">
            <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
            <Input
              id="supportEndDate"
              type="date"
              value={endDate}
              onChange={(e) => handleEndDateChange(e.target.value)}
              disabled={disabled}
              className={`pl-9 ${endDateError ? 'border-destructive' : ''}`}
            />
          </div>
          {isManuallyEdited && startDate && (
            <p className="text-xs text-muted-foreground flex items-center gap-1">
              <Info className="h-3 w-3" />
              Default: {calculateSupportValidity(startDate, validityDays).endDate}
            </p>
          )}
          {endDateError && (
            <p className="text-xs text-destructive flex items-center gap-1">
              <AlertTriangle className="h-3 w-3" />
              {endDateError}
            </p>
          )}
        </div>
      </div>

      {/* Validity Status Badge */}
      {endDate && (
        <motion.div
          initial={{ opacity: 0, height: 0 }}
          animate={{ opacity: 1, height: 'auto' }}
          className="flex items-center gap-2"
        >
          <span className={[
            'inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium border',
            validityInfo.color,
          ].join(' ')}>
            {validityInfo.status === 'expired' ? (
              <AlertTriangle className="h-3 w-3" />
            ) : validityInfo.status === 'expiring_soon' ? (
              <AlertTriangle className="h-3 w-3" />
            ) : validityInfo.status === 'active' ? (
              <CheckCircle2 className="h-3 w-3" />
            ) : null}
            {validityInfo.label}
          </span>
          {startDate && (
            <span className="text-xs text-muted-foreground">
              ({validityDays} days from start)
            </span>
          )}
        </motion.div>
      )}

      {/* Validity Info Card */}
      {startDate && endDate && !hasError && (
        <motion.div
          initial={{ opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
        >
          <Card className="p-3 bg-primary/5 border-primary/20">
            <div className="flex items-center justify-between text-sm">
              <div className="text-muted-foreground">
                Contract Period: {startDate} to {endDate}
              </div>
              <Badge
                variant={
                  validityInfo.status === 'expired' ? 'destructive' :
                  validityInfo.status === 'expiring_soon' ? 'secondary' :
                  'default'
                }
                className="font-medium"
              >
                {validityInfo.daysRemaining > 0
                  ? `${validityInfo.daysRemaining} days remaining`
                  : 'Expired'}
              </Badge>
            </div>
          </Card>
        </motion.div>
      )}
    </div>
  )
}

/**
 * Reusable Support Wallet Utilities
 *
 * Shared across Admin, Manager, and Customer Onboarding workflows.
 * These functions MUST be used everywhere rather than hardcoding 365 days.
 */

import { format, addDays, addYears, differenceInDays, parseISO, isBefore, isAfter } from 'date-fns'

export const DEFAULT_VALIDITY_DAYS = 365

/**
 * Calculate support validity end date from a start date.
 */
export function calculateSupportValidity(
  startDate: string | Date,
  validityDays: number = DEFAULT_VALIDITY_DAYS,
): { startDate: string; endDate: string } {
  const start = typeof startDate === 'string' ? parseISO(startDate) : startDate
  const end = addDays(start, validityDays)
  return {
    startDate: format(start, 'yyyy-MM-dd'),
    endDate: format(end, 'yyyy-MM-dd'),
  }
}

/**
 * Get contract status based on end date.
 */
export function getWalletContractStatus(contractEndDate: string | null): {
  status: 'active' | 'expiring_soon' | 'expired' | 'no_contract'
  daysRemaining: number
  label: string
  color: string
} {
  if (!contractEndDate) {
    return {
      status: 'no_contract',
      daysRemaining: 0,
      label: 'No Contract',
      color: 'bg-gray-50 text-gray-500 border-gray-200',
    }
  }

  const end = parseISO(contractEndDate)
  const today = new Date()
  today.setHours(0, 0, 0, 0)

  const daysRemaining = differenceInDays(end, today)

  if (isBefore(end, today)) {
    return {
      status: 'expired',
      daysRemaining: 0,
      label: 'Expired',
      color: 'bg-red-50 dark:bg-red-500/15 text-red-600 dark:text-red-400 border-red-200 dark:border-red-500/30',
    }
  }

  if (daysRemaining <= 30) {
    return {
      status: 'expiring_soon',
      daysRemaining,
      label: `Expiring (${daysRemaining}d)`,
      color: 'bg-amber-50 dark:bg-amber-500/15 text-amber-600 dark:text-amber-400 border-amber-200 dark:border-amber-500/30',
    }
  }

  return {
    status: 'active',
    daysRemaining,
    label: `Active (${daysRemaining}d)`,
    color: 'bg-green-50 dark:bg-green-500/15 text-green-600 dark:text-green-400 border-green-200 dark:border-green-500/30',
  }
}

/**
 * Check if a wallet's contract is valid for ticket creation.
 */
export function checkContractValidity(contractEndDate: string | null): {
  isValid: boolean
  reason: string | null
} {
  if (!contractEndDate) {
    return { isValid: true, reason: null }
  }
  const end = parseISO(contractEndDate)
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  if (isBefore(end, today)) {
    return {
      isValid: false,
      reason: 'Your support contract has expired. Please contact your account manager to renew support.',
    }
  }
  if (differenceInDays(end, today) <= 0) {
    return {
      isValid: false,
      reason: 'Your support contract has expired. Please contact your account manager to renew support.',
    }
  }
  return { isValid: true, reason: null }
}

/**
 * Generate a display string for contract validity period.
 */
export function formatContractPeriod(startDate: string | null, endDate: string | null): string {
  if (!startDate && !endDate) return 'No contract period'
  return `${startDate || '\u2014'} to ${endDate || '\u2014'}`
}

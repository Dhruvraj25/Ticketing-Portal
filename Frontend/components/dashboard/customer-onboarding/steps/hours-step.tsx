'use client'

import { memo, useMemo } from 'react'
import { motion } from 'framer-motion'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Switch } from '@/components/ui/switch'
import { SupportValidityPicker } from '@/components/ui/support-validity-picker'
import { Wallet, Rocket, Handshake, Sparkles, Clock, CheckCircle2, BellRing } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Field } from '../components/field'
import type { OnboardingState, FormErrors } from '../hooks/use-onboarding'
import type { ContractType, HypercareDuration } from '@/lib/types'

interface SupportContractStepProps {
  state: OnboardingState
  errors: FormErrors
  onFieldChange: (field: string, value: any) => void
}

const stepVariants = {
  enter: { opacity: 0, x: 60, scale: 0.98 },
  center: { opacity: 1, x: 0, scale: 1 },
  exit: { opacity: 0, x: -60, scale: 0.98 },
}

const HYPERCARE_OPTIONS: HypercareDuration[] = [15, 30, 45, 60, 90]

function calculateEndDate(startDate: string, durationDays: number): string {
  if (!startDate || !durationDays) return ''
  const start = new Date(startDate)
  start.setDate(start.getDate() + durationDays)
  return start.toISOString().split('T')[0]
}

function getContractStatus(startDate: string, endDate: string): string {
  if (!startDate && !endDate) return '—'
  const now = new Date()
  const start = new Date(startDate)
  const end = new Date(endDate)
  if (now < start) return 'Scheduled'
  if (now >= start && now <= end) return 'Active'
  return 'Expired'
}

function formatDate(dateStr: string): string {
  if (!dateStr) return '—'
  const d = new Date(dateStr)
  return d.toLocaleDateString('en-US', { day: 'numeric', month: 'short', year: 'numeric' })
}

export const SupportContractStep = memo(function SupportContractStep({ state, errors, onFieldChange }: SupportContractStepProps) {
  const computedEndDate = useMemo(() => {
    if (state.contractType === 'hypercare' && state.supportStartDate && state.hypercareDuration) {
      return calculateEndDate(state.supportStartDate, parseInt(String(state.hypercareDuration)))
    }
    return state.supportEndDate
  }, [state.contractType, state.supportStartDate, state.hypercareDuration, state.supportEndDate])

  const contractStatus = useMemo(() => {
    if (!state.supportStartDate || !computedEndDate) return '—'
    return getContractStatus(state.supportStartDate, computedEndDate)
  }, [state.supportStartDate, computedEndDate])

  const statusColor = contractStatus === 'Active' ? 'text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-500/15' :
    contractStatus === 'Scheduled' ? 'text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-500/15' :
    contractStatus === 'Expired' ? 'text-gray-500 bg-gray-100 dark:bg-slate-800' : ''

  const handleHypercareDuration = (value: HypercareDuration) => {
    onFieldChange('hypercareDuration', value)
  }

  const handleDateChange = (field: string, value: string) => {
    onFieldChange(field, value)
    // If hypercare and start date changes, auto-update end date
    if (field === 'supportStartDate' && state.contractType === 'hypercare' && state.hypercareDuration) {
      // computedEndDate will auto-update via useMemo
    }
  }

  return (
    <motion.div
      key="step-support-contract"
      variants={stepVariants}
      initial="enter"
      animate="center"
      exit="exit"
      transition={{ duration: 0.3 }}
      className="space-y-6"
    >
      <Card>
        <CardHeader>
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl bg-amber-500">
              <Wallet className="h-5 w-5 text-white" />
            </div>
            <div>
              <CardTitle>Support Contract</CardTitle>
              <CardDescription>Configure the support contract and wallet for this project</CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* ── Contract Type Selector (Card-style) ──────────────────────── */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <Label className="text-sm font-semibold">
                Contract Type <span className="text-destructive">*</span>
              </Label>
              {errors.contractType && (
                <p className="text-xs text-destructive">{errors.contractType}</p>
              )}
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Hypercare Card */}
              <button
                type="button"
                onClick={() => onFieldChange('contractType', 'hypercare')}
                className={cn(
                  'relative flex flex-col p-4 rounded-xl border-2 text-left transition-all duration-200',
                  'hover:shadow-md hover:border-primary/50',
                  state.contractType === 'hypercare'
                    ? 'border-primary bg-primary/5 shadow-md ring-1 ring-primary/20'
                    : 'border-border bg-card',
                )}
              >
                {state.contractType === 'hypercare' && (
                  <div className="absolute top-3 right-3">
                    <CheckCircle2 className="h-5 w-5 text-primary" />
                  </div>
                )}
                <div className="flex items-center gap-3 mb-2">
                  <div className={cn(
                    'p-2 rounded-lg',
                    state.contractType === 'hypercare' ? 'bg-primary/10' : 'bg-muted',
                  )}>
                    <Rocket className={cn(
                      'h-5 w-5',
                      state.contractType === 'hypercare' ? 'text-primary' : 'text-muted-foreground',
                    )} />
                  </div>
                  <div>
                    <p className={cn(
                      'text-sm font-semibold',
                      state.contractType === 'hypercare' ? 'text-primary' : 'text-foreground',
                    )}>
                      Hypercare / Stability Support
                    </p>
                  </div>
                </div>
                <p className="text-xs text-muted-foreground leading-relaxed">
                  Initial post go-live support. Used for project stabilization after implementation.
                </p>
                <p className="text-xs text-muted-foreground/70 mt-1">
                  Typical duration: 15–90 days
                </p>
              </button>

              {/* Support Agreement Card */}
              <button
                type="button"
                onClick={() => onFieldChange('contractType', 'support_agreement')}
                className={cn(
                  'relative flex flex-col p-4 rounded-xl border-2 text-left transition-all duration-200',
                  'hover:shadow-md hover:border-primary/50',
                  state.contractType === 'support_agreement'
                    ? 'border-primary bg-primary/5 shadow-md ring-1 ring-primary/20'
                    : 'border-border bg-card',
                )}
              >
                {state.contractType === 'support_agreement' && (
                  <div className="absolute top-3 right-3">
                    <CheckCircle2 className="h-5 w-5 text-primary" />
                  </div>
                )}
                <div className="flex items-center gap-3 mb-2">
                  <div className={cn(
                    'p-2 rounded-lg',
                    state.contractType === 'support_agreement' ? 'bg-primary/10' : 'bg-muted',
                  )}>
                    <Handshake className={cn(
                      'h-5 w-5',
                      state.contractType === 'support_agreement' ? 'text-primary' : 'text-muted-foreground',
                    )} />
                  </div>
                  <div>
                    <p className={cn(
                      'text-sm font-semibold',
                      state.contractType === 'support_agreement' ? 'text-primary' : 'text-foreground',
                    )}>
                      Support Agreement
                    </p>
                  </div>
                </div>
                <p className="text-xs text-muted-foreground leading-relaxed">
                  Annual or long-term customer support. Used after Hypercare or for direct support contracts.
                </p>
              </button>
            </div>
          </div>

          {/* ── Conditional Fields based on Contract Type ───────────────── */}

          {state.contractType && (
            <>
              {/* ── Hypercare Duration (only for hypercare) ────────────── */}
              {state.contractType === 'hypercare' && (
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <Label className="text-sm font-semibold">
                      Hypercare Duration <span className="text-destructive">*</span>
                    </Label>
                    {errors.hypercareDuration && (
                      <p className="text-xs text-destructive">{errors.hypercareDuration}</p>
                    )}
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {HYPERCARE_OPTIONS.map((days) => (
                      <button
                        key={days}
                        type="button"
                        onClick={() => handleHypercareDuration(days)}
                        className={cn(
                          'px-4 py-2 rounded-lg border-2 text-sm font-medium transition-all duration-200',
                          'hover:shadow-sm',
                          parseInt(String(state.hypercareDuration)) === days
                            ? 'border-primary bg-primary/10 text-primary shadow-sm'
                            : 'border-border bg-card text-muted-foreground hover:border-muted-foreground/30',
                        )}
                      >
                        {days} Days
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* ── Hypercare helper text ───────────────────────────── */}
              {state.contractType === 'hypercare' && (
                <div className="rounded-lg border border-amber-200 bg-amber-50 dark:border-amber-800/40 dark:bg-amber-950/20 p-4 space-y-1">
                  <p className="text-sm font-medium text-amber-800 dark:text-amber-300 flex items-center gap-2">
                    <Rocket className="h-4 w-4" />
                    Hypercare Support
                  </p>
                  <p className="text-xs text-amber-700 dark:text-amber-400/80">
                    Hypercare support is time-based and does not use a support hour wallet.
                    The contract will be tracked by duration (days) rather than support hours.
                  </p>
                </div>
              )}

              {/* ── Purchased Hours (only for support_agreement) ──────── */}
              {state.contractType === 'support_agreement' && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                  <Field name="supportHours" label="Purchased Hours" required error={errors.supportHours}>
                    <Input
                      type="number"
                      min="1"
                      placeholder="e.g., 100"
                      value={state.supportHours}
                      onChange={e => onFieldChange('supportHours', e.target.value)}
                      className={errors.supportHours ? 'border-destructive' : ''}
                    />
                  </Field>
                  <Field name="supportRemarks" label="Remarks">
                    <textarea
                      className="flex min-h-[80px] w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                      placeholder="Any remarks..."
                      value={state.supportRemarks}
                      onChange={e => onFieldChange('supportRemarks', e.target.value)}
                    />
                  </Field>
                </div>
              )}

              {/* ── Dates ──────────────────────────────────────────────── */}
              <div className="rounded-lg border p-4 space-y-3 bg-muted/20">
                <h4 className="text-sm font-semibold flex items-center gap-2">
                  <span className="p-1 rounded-lg bg-amber-500">
                    <Wallet className="h-3.5 w-3.5 text-white" />
                  </span>
                  Support Period
                </h4>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <Field name="supportStartDate" label="Support Start Date" required error={errors.supportStartDate}>
                    <Input
                      type="date"
                      value={state.supportStartDate}
                      onChange={e => handleDateChange('supportStartDate', e.target.value)}
                      className={errors.supportStartDate ? 'border-destructive' : ''}
                    />
                  </Field>

                  {state.contractType === 'hypercare' ? (
                    <Field name="supportEndDate" label="Support End Date" error={errors.supportEndDate}>
                      <div className="relative">
                        <Input
                          type="date"
                          value={computedEndDate}
                          readOnly
                          className="bg-muted/50 text-muted-foreground cursor-not-allowed"
                        />
                        <Clock className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
                      </div>
                      {state.supportStartDate && state.hypercareDuration && computedEndDate && (
                        <p className="text-xs text-muted-foreground mt-1">
                          Auto-calculated: {formatDate(state.supportStartDate)} + {state.hypercareDuration} days = {formatDate(computedEndDate)}
                        </p>
                      )}
                    </Field>
                  ) : (
                    <Field name="supportEndDate" label="Support End Date" required error={errors.supportEndDate}>
                      <Input
                        type="date"
                        value={state.supportEndDate}
                        onChange={e => onFieldChange('supportEndDate', e.target.value)}
                        className={errors.supportEndDate ? 'border-destructive' : ''}
                      />
                    </Field>
                  )}
                </div>
              </div>

              {/* ── Support Contract Summary (only for support_agreement) ── */}
              {state.contractType === 'support_agreement' && state.supportHours && parseInt(state.supportHours) > 0 && state.supportStartDate && (
                <div className="p-4 rounded-lg bg-primary/5 border border-primary/20 space-y-3">
                  <h4 className="text-sm font-semibold flex items-center gap-2">
                    <Sparkles className="h-4 w-4 text-primary" /> Support Contract Summary
                  </h4>
                  <div className="grid grid-cols-2 md:grid-cols-3 gap-3 text-sm">
                    <div className="p-2 rounded-md bg-background/60">
                      <p className="text-[11px] uppercase tracking-wider text-muted-foreground">Contract Type</p>
                      <p className="font-medium mt-0.5 capitalize">Support Agreement</p>
                    </div>
                    <div className="p-2 rounded-md bg-background/60">
                      <p className="text-[11px] uppercase tracking-wider text-muted-foreground">Hours</p>
                      <p className="font-medium mt-0.5">{state.supportHours} hrs</p>
                    </div>
                    <div className="p-2 rounded-md bg-background/60">
                      <p className="text-[11px] uppercase tracking-wider text-muted-foreground">Duration</p>
                      <p className="font-medium mt-0.5">Annual / Custom</p>
                    </div>
                    <div className="p-2 rounded-md bg-background/60">
                      <p className="text-[11px] uppercase tracking-wider text-muted-foreground">Start Date</p>
                      <p className="font-medium mt-0.5">{formatDate(state.supportStartDate)}</p>
                    </div>
                    <div className="p-2 rounded-md bg-background/60">
                      <p className="text-[11px] uppercase tracking-wider text-muted-foreground">End Date</p>
                      <p className="font-medium mt-0.5">{formatDate(computedEndDate)}</p>
                    </div>
                    <div className="p-2 rounded-md bg-background/60">
                      <p className="text-[11px] uppercase tracking-wider text-muted-foreground">Status</p>
                      <p className={cn('font-medium mt-0.5 inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-xs', statusColor)}>
                        {contractStatus}
                      </p>
                    </div>
                  </div>
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>

      {/* ── Notification Preferences ─────────────────────────────────── */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl bg-slate-950 shadow-md">
              <BellRing className="h-5 w-5 text-white" />
            </div>
            <div>
              <CardTitle>Notification Preferences</CardTitle>
              <CardDescription>Choose how this customer receives notifications</CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-between gap-4 rounded-xl border p-4 bg-muted/20">
            <div className="space-y-1.5">
              <div className="flex items-center gap-2">
                <p className="text-sm font-semibold">Enable Microsoft Teams Notifications</p>
                {state.enableTeamsNotifications ? (
                  <Badge variant="outline" className="text-xs bg-emerald-500/10 text-emerald-400 border-emerald-500/20">Enabled</Badge>
                ) : (
                  <Badge variant="outline" className="text-xs bg-muted text-muted-foreground">Disabled</Badge>
                )}
              </div>
              <p className="text-xs text-muted-foreground leading-relaxed max-w-xl">
                When enabled, ticket and support events for this customer (created, assigned, resolved,
                estimates, revisions, wallet alerts, and more) are also posted to your Microsoft Teams
                channel with the involved users mentioned. In-app and email notifications always continue.
              </p>
            </div>
            <Switch
              checked={state.enableTeamsNotifications}
              onCheckedChange={(v) => onFieldChange('enableTeamsNotifications', v)}
              aria-label="Enable Microsoft Teams notifications"
            />
          </div>
        </CardContent>
      </Card>
    </motion.div>
  )
})

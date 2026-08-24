'use client'

import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { submitEstimate, updateEstimate, approveEstimate, declineAdditionalHours } from '@/app/actions/estimates'
import { assignTicket } from '@/app/actions/tickets'
import { Button } from '@/components/ui/button'
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
import { cn } from '@/lib/utils'
import { format } from 'date-fns'
import {
  Loader2,
  FileText,
  CheckCircle2,
  AlertCircle,
  UserRoundCog,
  Send,
  ArrowRight,
  RefreshCw,
  TrendingUp,
  Plus,
  Clock,
  XCircle,
} from 'lucide-react'
import { TicketStatus, VALIDATION } from '@/lib/types'

interface Developer {
  id: string
  name: string
  email: string
  activeTickets: number
}

interface EstimateSectionProps {
  ticketId: number
  currentStatus: TicketStatus
  userRole: string
  clientName?: string
  estimatedHours?: number | null
  estimatedCompletionDate?: string | null
  estimateNotes?: string | null
  estimateSubmittedAt?: Date | string | null
  estimateApprovedAt?: Date | string | null
  autoApproved?: boolean | null
  approvalDeadline?: Date | string | null
  additionalHoursRequested?: number | null
  additionalHoursApproved?: boolean | null
  developers?: Developer[]
}

export function EstimateSection({
  ticketId,
  currentStatus,
  userRole,
  clientName,
  estimatedHours,
  estimatedCompletionDate,
  estimateNotes,
  estimateSubmittedAt,
  estimateApprovedAt,
  autoApproved,
  approvalDeadline,
  additionalHoursRequested,
  additionalHoursApproved,
  developers = [],
}: EstimateSectionProps) {
  const [loading, setLoading] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)

  // Manager decision: Assign Directly or Send Estimate
  const [showDecision, setShowDecision] = useState(true)

  // Estimate form state (manager view)
  const [showEstimateForm, setShowEstimateForm] = useState(false)
  const [formHours, setFormHours] = useState(estimatedHours?.toString() || '')
  const [formCompletionDate, setFormCompletionDate] = useState(estimatedCompletionDate || '')
  const [formNotes, setFormNotes] = useState(estimateNotes || '')

  // Assign directly state
  const [showAssignForm, setShowAssignForm] = useState(false)
  const [selectedDeveloperId, setSelectedDeveloperId] = useState('')

  // Request revision state (client view)
  const [showRevisionForm, setShowRevisionForm] = useState(false)
  const [revisionReason, setRevisionReason] = useState('')

  // Additional hours state (manager view)
  const [showAdditionalHoursForm, setShowAdditionalHoursForm] = useState(false)
  const [additionalHours, setAdditionalHours] = useState('')
  const [additionalHoursReason, setAdditionalHoursReason] = useState('')
  const [additionalHoursNotes, setAdditionalHoursNotes] = useState('')

  const isManagerOrAdmin = userRole === 'project_manager' || userRole === 'admin'
  const isClient = userRole === 'client'
  const isNew = currentStatus === TicketStatus.NEW
  const isEstimatePending = currentStatus === TicketStatus.ESTIMATE_PENDING
  const isEstimateApproved = currentStatus === TicketStatus.ESTIMATE_APPROVED
  const isRequestForRevision = currentStatus === TicketStatus.REQUEST_FOR_REVISION

  const handleAction = async (action: string, actionFn: () => Promise<any>) => {
    setError(null)
    setSuccess(null)
    setLoading(action)
    try {
      await actionFn()
      const actionMessages: Record<string, string> = {
        submitEstimate: 'Estimate submitted successfully.',
        assignDirect: 'Ticket assigned successfully.',
        approveEstimate: 'Estimate approved successfully.',
        requestRevision: 'Revision requested successfully.',
        assignDeveloper: 'Developer assigned successfully.',
        requestAdditionalHours: 'Additional hours requested successfully.',
        approveAdditionalHours: 'Additional hours approved successfully.',
        declineAdditionalHours: 'Additional hours declined.',
      }
      setSuccess(actionMessages[action] || 'Action completed successfully.')
      if (action === 'submitEstimate') {
        setShowEstimateForm(false)
        setShowDecision(false)
      }
      if (action === 'assignDirect') {
        setShowAssignForm(false)
        setShowDecision(false)
      }
      if (action === 'approveEstimate') setShowRevisionForm(false)
      if (action === 'requestRevision') setShowRevisionForm(false)
      if (action === 'requestAdditionalHours') setShowAdditionalHoursForm(false)
      if (action === 'approveAdditionalHours') {/* no form to close */}
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Action failed')
    } finally {
      setLoading(null)
    }
  }

  const handleSubmitEstimate = () => {
    const hours = parseInt(formHours)
    if (isNaN(hours) || hours <= 0) {
      setError('Estimated hours must be a positive number')
      return
    }
    if (!formCompletionDate) {
      setError('Estimated completion date is required')
      return
    }

    handleAction('submitEstimate', () =>
      isRequestForRevision
        ? updateEstimate(ticketId, { estimatedHours: hours, estimatedCompletionDate: formCompletionDate, estimateNotes: formNotes })
        : submitEstimate(ticketId, { estimatedHours: hours, estimatedCompletionDate: formCompletionDate, estimateNotes: formNotes }),
    )
  }

  const handleAssignDirect = () => {
    if (!selectedDeveloperId) {
      setError('Please select a developer')
      return
    }
    handleAction('assignDirect', () => assignTicket(ticketId, selectedDeveloperId, true))
  }

  return (
    <div className="space-y-4" data-tour="estimate-section">
      {/* ─── MANAGER: New Ticket — Choose Assign Directly or Send Estimate ─── */}
      {isNew && isManagerOrAdmin && showDecision && (
        <div className="rounded-xl bg-white dark:bg-slate-900 border border-indigo-200 p-6 space-y-4">
          <div className="flex items-center gap-2">
            <div className="p-2 rounded-xl bg-indigo-50 dark:bg-indigo-500/15">
              <FileText className="h-5 w-5 text-indigo-500 dark:text-indigo-400" />
            </div>
            <div>
              <h3 className="font-semibold text-foreground">Review New Ticket</h3>
              <p className="text-xs text-muted-foreground">
                This ticket needs your review. Choose how to proceed.
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {/* Option 1: Send Estimate */}
            <motion.button
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              onClick={() => { setShowDecision(false); setShowEstimateForm(true) }}
              className="flex flex-col items-center gap-3 p-5 rounded-xl border-2 border-dashed border-sky-200 dark:border-sky-500/30 hover:border-sky-400 hover:bg-sky-50 dark:hover:bg-sky-500/10/50 transition-all text-center"
            >
              <div className="p-3 rounded-xl bg-sky-100 dark:bg-sky-500/20">
                <FileText className="h-6 w-6 text-sky-600 dark:text-sky-400" />
              </div>
              <div>
                <p className="font-semibold text-foreground">Send Estimate</p>
                <p className="text-xs text-muted-foreground mt-1">
                  Create an estimate and send it to the client for approval
                </p>
              </div>
              <span className="text-xs font-medium text-sky-600 dark:text-sky-400 bg-sky-50 dark:bg-sky-500/15 px-3 py-1 rounded-full border border-sky-200 dark:border-sky-500/30">
                Requires client approval
              </span>
            </motion.button>

            {/* Option 2: Assign Directly */}
            <motion.button
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              onClick={() => { setShowDecision(false); setShowAssignForm(true) }}
              className="flex flex-col items-center gap-3 p-5 rounded-xl border-2 border-dashed border-emerald-200 dark:border-emerald-500/30 hover:border-emerald-400 hover:bg-emerald-50 dark:hover:bg-emerald-500/10/50 transition-all text-center"
            >
              <div className="p-3 rounded-xl bg-emerald-100 dark:bg-emerald-500/20">
                <UserRoundCog className="h-6 w-6 text-emerald-600 dark:text-emerald-400" />
              </div>
              <div>
                <p className="font-semibold text-foreground">Assign Directly</p>
                <p className="text-xs text-muted-foreground mt-1">
                  No estimate needed — assign the ticket directly to a developer
                </p>
              </div>
              <span className="text-xs font-medium text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-500/15 px-3 py-1 rounded-full border border-emerald-200 dark:border-emerald-500/30">
                Skips estimate workflow
              </span>
            </motion.button>
          </div>
        </div>
      )}

      {/* ─── MANAGER: Send Estimate Form ─────────────────────────────── */}
      <AnimatePresence>
        {showEstimateForm && (isNew || isRequestForRevision) && isManagerOrAdmin && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="rounded-xl bg-white dark:bg-slate-900 border border-border p-5 space-y-4"
          >
            <div className="flex items-center gap-2">
              <FileText className="h-5 w-5 text-primary" />
              <h3 className="font-semibold text-foreground">
                {isRequestForRevision ? 'Update Estimate' : 'Send Estimate to Client'}
              </h3>
            </div>

            {isRequestForRevision && (
              <p className="text-sm text-muted-foreground bg-orange-50 dark:bg-orange-500/15/50 p-3 rounded-lg border border-orange-100">
                The client requested changes to the previous estimate. Please review and submit an updated estimate.
              </p>
            )}

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="est-hours">Estimated Hours *</Label>
                <Input
                  id="est-hours"
                  type="number"
                  min="1"
                  value={formHours}
                  onChange={(e) => setFormHours(e.target.value)}
                  placeholder="e.g. 8"
                  className="rounded-xl"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="est-date">Estimated Completion Date *</Label>
                <Input
                  id="est-date"
                  type="date"
                  value={formCompletionDate}
                  onChange={(e) => setFormCompletionDate(e.target.value)}
                  className="rounded-xl"
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="est-notes">Manager Notes</Label>
              <Textarea
                id="est-notes"
                value={formNotes}
                onChange={(e) => setFormNotes(e.target.value)}
                placeholder="Describe the work, assumptions, and any relevant context for the client..."
                rows={3}
                maxLength={VALIDATION.ESTIMATE_NOTES_MAX_LENGTH}
                className="rounded-xl"
              />
            </div>

            <div className="flex gap-2">
              <Button
                onClick={() => { setShowEstimateForm(false); if (isNew) setShowDecision(true) }}
                variant="outline"
                className="rounded-lg"
              >
                Cancel
              </Button>
              <Button
                onClick={handleSubmitEstimate}
                disabled={loading !== null}
                className="rounded-lg"
              >
                {loading === 'submitEstimate' ? (
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                ) : (
                  <Send className="h-4 w-4 mr-2" />
                )}
                {isRequestForRevision ? 'Send Updated Estimate' : 'Send Estimate'}
              </Button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ─── MANAGER: Assign Directly Form ────────────────────────────── */}
      <AnimatePresence>
        {showAssignForm && isNew && isManagerOrAdmin && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="rounded-xl bg-white dark:bg-slate-900 border border-emerald-200 p-5 space-y-4"
          >
            <div className="flex items-center gap-2">
              <UserRoundCog className="h-5 w-5 text-emerald-500 dark:text-emerald-400" />
              <h3 className="font-semibold text-foreground">Assign Directly to Developer</h3>
            </div>

            <div className="space-y-2">
              <Label>Select Developer *</Label>
              <Select value={selectedDeveloperId} onValueChange={setSelectedDeveloperId}>
                <SelectTrigger className="rounded-xl">
                  <SelectValue placeholder="Choose a developer..." />
                </SelectTrigger>
                <SelectContent>
                  {developers.map((dev) => (
                    <SelectItem key={dev.id} value={dev.id}>
                      <div className="flex items-center justify-between gap-4 w-full">
                        <span>{dev.name}</span>
                        <span className="text-xs text-muted-foreground">
                          {dev.activeTickets} active tickets
                        </span>
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="flex gap-2">
              <Button
                onClick={() => { setShowAssignForm(false); setShowDecision(true) }}
                variant="outline"
                className="rounded-lg"
              >
                Cancel
              </Button>
              <Button
                onClick={handleAssignDirect}
                disabled={loading !== null || !selectedDeveloperId}
                className="rounded-lg bg-emerald-600 hover:bg-emerald-700"
              >
                {loading === 'assignDirect' ? (
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                ) : (
                  <ArrowRight className="h-4 w-4 mr-2" />
                )}
                Assign & Start Workflow
              </Button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ─── Estimate Overview (when estimate exists) ───────────────── */}
      {estimatedHours && (isEstimatePending || isEstimateApproved || isRequestForRevision) && (
        <div className={cn(
          'rounded-xl border p-5',
          isEstimateApproved ? 'bg-emerald-50 dark:bg-emerald-500/15/50 border-emerald-200 dark:border-emerald-500/30' :
          isEstimatePending ? 'bg-sky-50 dark:bg-sky-500/15/50 border-sky-200 dark:border-sky-500/30' :
          'bg-orange-50 dark:bg-orange-500/15/50 border-orange-200 dark:border-orange-500/30',
        )}>
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-semibold text-foreground flex items-center gap-2">
              <FileText className="h-4 w-4" />
              Estimate
            </h3>
            <span className={cn(
              'px-2.5 py-0.5 rounded-lg text-xs font-medium border',
              isEstimateApproved ? 'bg-emerald-50 dark:bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-emerald-200 dark:border-emerald-500/30' :
              isEstimatePending ? 'bg-sky-50 dark:bg-sky-500/15 text-sky-600 dark:text-sky-400 border-sky-200 dark:border-sky-500/30' :
              'bg-orange-50 dark:bg-orange-500/15 text-orange-600 dark:text-orange-400 border-orange-200 dark:border-orange-500/30',
            )}>
              {isEstimateApproved ? (autoApproved ? 'Auto-Approved' : 'Approved') :
               isEstimatePending ? 'Awaiting Estimate Approval' :
               'Revision Requested'}
            </span>
          </div>

          <div className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <span className="text-muted-foreground text-xs">Estimated Hours</span>
              <p className="font-medium text-foreground">{estimatedHours}h</p>
            </div>
            {estimatedCompletionDate && (
              <div>
                <span className="text-muted-foreground text-xs">Completion Date</span>
                <p className="font-medium text-foreground">{format(new Date(estimatedCompletionDate), 'MMM d, yyyy')}</p>
              </div>
            )}
            {estimateSubmittedAt && (
              <div>
                <span className="text-muted-foreground text-xs">Submitted</span>
                <p className="font-medium text-foreground">{format(new Date(estimateSubmittedAt), 'MMM d, yyyy')}</p>
              </div>
            )}
            {estimateApprovedAt && (
              <div>
                <span className="text-muted-foreground text-xs">Approved</span>
                <p className="font-medium text-foreground">{format(new Date(estimateApprovedAt), 'MMM d, yyyy')}</p>
              </div>
            )}
            {autoApproved && (
              <div className="col-span-2">
                <span className="text-muted-foreground text-xs">Auto-Approved</span>
                <p className="font-medium text-amber-600 dark:text-amber-400 text-xs">This estimate was auto-approved after the deadline.</p>
              </div>
            )}
          </div>

          {estimateNotes && (
            <div className="mt-3 pt-3 border-t border-border/50">
              <span className="text-muted-foreground text-xs">Manager Notes</span>
              <p className="text-sm text-foreground mt-1">{estimateNotes}</p>
            </div>
          )}
        </div>
      )}

      {/* ─── CLIENT: Approve or Request Revision on Estimate ───────────── */}
      {isEstimatePending && isClient && (
        <div className="rounded-xl bg-white dark:bg-slate-900 border border-sky-200 p-5 space-y-4">
          <h3 className="font-semibold text-foreground flex items-center gap-2">
            <CheckCircle2 className="h-4 w-4 text-emerald-500 dark:text-emerald-400" />
            Estimate Review
          </h3>
          <p className="text-sm text-muted-foreground">
            Please review the estimate above. You can approve it or request a revision.
          </p>

          <div className="flex flex-wrap gap-2">
            <Button
              onClick={() => handleAction('approveEstimate', () => approveEstimate(ticketId))}
              disabled={loading !== null}
              className="rounded-lg bg-emerald-600 hover:bg-emerald-700"
            >
              {loading === 'approveEstimate' ? (
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
              ) : (
                <CheckCircle2 className="h-4 w-4 mr-2" />
              )}
              Approve Estimate
            </Button>

            <Button
              onClick={() => setShowRevisionForm(!showRevisionForm)}
              variant="outline"
              className="rounded-lg border-orange-500/50 text-orange-600 dark:text-orange-400 hover:bg-orange-50 dark:hover:bg-orange-500/10"
            >
              <RefreshCw className="h-4 w-4 mr-2" />
              Request Estimate Revision
            </Button>
          </div>

          {/* Revision Request Form */}
          <AnimatePresence>
            {showRevisionForm && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: 'auto', opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                className="space-y-3 overflow-hidden"
              >
                <div className="space-y-2">
                  <Label>Reason for Revision</Label>
                  <Textarea
                    value={revisionReason}
                    onChange={(e) => setRevisionReason(e.target.value)}
                    placeholder="Explain what changes you'd like to see in the estimate..."
                    rows={3}
                    maxLength={VALIDATION.REVISION_NOTES_MAX_LENGTH}
                    className="rounded-xl"
                  />
                </div>
                <Button
                  onClick={() => {
                    if (!revisionReason.trim()) {
                      setError('Please provide a reason for requesting a revision')
                      return
                    }
                    handleAction('requestRevision', async () => {
                        const { rejectEstimate } = await import('@/app/actions/estimates')
                      await rejectEstimate(ticketId, revisionReason)
                    })
                  }}
                  disabled={loading !== null || !revisionReason.trim()}
                  className="rounded-lg bg-orange-600 hover:bg-orange-700 text-white"
                >
                  {loading === 'requestRevision' ? (
                    <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  ) : (
                    <RefreshCw className="h-4 w-4 mr-2" />
                  )}
                  Submit Revision Request
                </Button>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      )}

      {/* ─── MANAGER: Assign Developer After Estimate Approved ─────────── */}
      {isEstimateApproved && isManagerOrAdmin && (
        <div className="rounded-xl bg-white dark:bg-slate-900 border border-emerald-200 p-5 space-y-4">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="h-5 w-5 text-emerald-500 dark:text-emerald-400" />
            <div>
              <h3 className="font-semibold text-foreground">Estimate Approved by Client</h3>
              <p className="text-xs text-muted-foreground">
                The client has approved the estimate. Assign a developer to begin work.
              </p>
            </div>
          </div>

          <div className="space-y-2">
            <Label>Assign Developer *</Label>
            <div className="flex gap-2">
              <div className="flex-1">
                <Select value={selectedDeveloperId} onValueChange={setSelectedDeveloperId}>
                  <SelectTrigger className="rounded-xl">
                    <SelectValue placeholder="Choose a developer..." />
                  </SelectTrigger>
                  <SelectContent>
                    {developers.map((dev) => (
                      <SelectItem key={dev.id} value={dev.id}>
                        <div className="flex items-center justify-between gap-4 w-full">
                          <span>{dev.name}</span>
                          <span className="text-xs text-muted-foreground">
                            {dev.activeTickets} active tickets
                          </span>
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <Button
                onClick={() => handleAction('assignDeveloper', () => assignTicket(ticketId, selectedDeveloperId))}
                disabled={loading !== null || !selectedDeveloperId}
                className="rounded-lg"
              >
                {loading === 'assignDeveloper' ? (
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                ) : (
                  <UserRoundCog className="h-4 w-4 mr-2" />
                )}
                Assign Resource
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* ─── MANAGER: Update Estimate After Revision Request ──────────── */}
      {isRequestForRevision && isManagerOrAdmin && (
        <div className="rounded-xl bg-white dark:bg-slate-900 border border-orange-200 p-5 space-y-4">
          <div className="flex items-center gap-2">
            <RefreshCw className="h-5 w-5 text-orange-500 dark:text-orange-400" />
            <div>
              <h3 className="font-semibold text-foreground">Revision Requested by Client</h3>
              <p className="text-xs text-muted-foreground">
                The client has requested changes to the estimate. Review and update.
              </p>
            </div>
          </div>

          <Button
            onClick={() => setShowEstimateForm(true)}
            className="rounded-lg"
          >
            <FileText className="h-4 w-4 mr-2" />
            Update & Resend Estimate
          </Button>
        </div>
      )}

      {/* ─── REQUEST ADDITIONAL SUPPORT HOURS (Manager) ──────────────── */}
      {(() => {
        // Show when: estimate is approved and ticket is in an active status (not new, not closed)
        const activeStatuses = ['estimate_approved', 'assigned', 'in_progress', 'client_review', 'request_for_revision']
        const canRequestAdditionalHours = isManagerOrAdmin && activeStatuses.includes(currentStatus) && !additionalHoursApproved
        return canRequestAdditionalHours && (
          <div className="rounded-xl bg-white dark:bg-slate-900 border border-border p-5 space-y-4" data-tour="additional-hours">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <TrendingUp className="h-5 w-5 text-amber-500 dark:text-amber-400" />
                <div>
                  <h3 className="font-semibold text-foreground">Additional Support Hours</h3>
                  <p className="text-xs text-muted-foreground">
                    {additionalHoursRequested && !additionalHoursApproved
                      ? `Additional ${additionalHoursRequested}h requested — awaiting client approval.`
                      : 'Request additional hours if the scope has increased.'}
                  </p>
                </div>
              </div>
              {!additionalHoursRequested && (
                <Button
                  onClick={() => setShowAdditionalHoursForm(!showAdditionalHoursForm)}
                  variant="outline"
                  size="sm"
                  className="rounded-lg shrink-0"
                >
                  <Plus className="h-3.5 w-3.5 mr-1" />
                  {showAdditionalHoursForm ? 'Cancel' : 'Request'}
                </Button>
              )}
            </div>

            {additionalHoursApproved && (
              <div className="p-3 rounded-lg bg-emerald-50 dark:bg-emerald-500/15/50 border border-emerald-100 text-sm text-emerald-600 dark:text-emerald-400">
                <CheckCircle2 className="h-4 w-4 inline mr-1.5" />
                Additional {additionalHoursRequested}h approved and added to the total estimate.
              </div>
            )}

            {additionalHoursRequested && !additionalHoursApproved && (
              <div className="p-3 rounded-lg bg-amber-50 dark:bg-amber-500/15/50 border border-amber-100 text-sm text-amber-600 dark:text-amber-400">
                <Clock className="h-4 w-4 inline mr-1.5" />
                Additional {additionalHoursRequested}h requested — awaiting client approval.
              </div>
            )}

            <AnimatePresence>
              {showAdditionalHoursForm && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: 'auto', opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  className="space-y-3 overflow-hidden"
                >
                  <div className="space-y-2">
                    <Label>Additional Hours Needed *</Label>
                    <Input
                      type="number"
                      min="1"
                      value={additionalHours}
                      onChange={(e) => setAdditionalHours(e.target.value)}
                      placeholder="e.g. 4"
                      className="rounded-xl"
                    />
                  </div>

                  <div className="space-y-2">
                    <Label>Reason *</Label>
                    <Textarea
                      value={additionalHoursReason}
                      onChange={(e) => setAdditionalHoursReason(e.target.value)}
                      placeholder="Explain why additional hours are needed..."
                      rows={2}
                      maxLength={VALIDATION.ADDITIONAL_HOURS_REASON_MAX_LENGTH}
                      className="rounded-xl"
                    />
                  </div>

                  <div className="space-y-2">
                    <Label>Notes <span className="font-normal text-muted-foreground">(optional)</span></Label>
                    <Textarea
                      value={additionalHoursNotes}
                      onChange={(e) => setAdditionalHoursNotes(e.target.value)}
                      placeholder="Any additional context for the client..."
                      rows={2}
                      className="rounded-xl"
                    />
                  </div>

                  <div className="flex gap-2">
                    <Button
                      onClick={() => setShowAdditionalHoursForm(false)}
                      variant="outline"
                      className="rounded-lg"
                    >
                      Cancel
                    </Button>
                    <Button
                      onClick={() => {
                        const hours = parseInt(additionalHours)
                        if (isNaN(hours) || hours <= 0) {
                          setError('Additional hours must be a positive number')
                          return
                        }
                        if (!additionalHoursReason.trim()) {
                          setError('Please provide a reason for the additional hours')
                          return
                        }
                        handleAction('requestAdditionalHours', async () => {
                          const { requestAdditionalHours } = await import('@/app/actions/estimates')
                          await requestAdditionalHours(ticketId, hours, 
                            `${additionalHoursReason.trim()}${additionalHoursNotes.trim() ? '. Notes: ' + additionalHoursNotes.trim() : ''}`
                          )
                        })
                      }}
                      disabled={loading !== null}
                      className="rounded-lg bg-amber-600 hover:bg-amber-700 text-white"
                    >
                      {loading === 'requestAdditionalHours' ? (
                        <Loader2 className="h-4 w-4 animate-spin mr-2" />
                      ) : (
                        <Send className="h-4 w-4 mr-2" />
                      )}
                      Submit Request
                    </Button>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        )
      })()}

      {/* ─── CLIENT: Additional Hours Approval ────────────────────── */}
      {additionalHoursRequested && !additionalHoursApproved && isClient && (
        <div className="rounded-xl bg-amber-50 dark:bg-amber-500/15/50 border border-amber-200 dark:border-amber-500/30 p-5 space-y-4">
          <div className="flex items-center gap-2">
            <TrendingUp className="h-5 w-5 text-amber-500 dark:text-amber-400" />
            <div>
              <h3 className="font-semibold text-foreground">Additional Hours Requested</h3>
              <p className="text-xs text-muted-foreground">
                The manager has requested an additional {additionalHoursRequested}h for this ticket.
                Please review and take action.
              </p>
            </div>
          </div>

          <div className="bg-white dark:bg-slate-900 rounded-lg border border-border/50 p-4">
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <span className="text-muted-foreground text-xs">Additional Hours</span>
                <p className="font-semibold text-foreground">{additionalHoursRequested}h</p>
              </div>
              <div>
                <span className="text-muted-foreground text-xs">Current Estimate</span>
                <p className="font-semibold text-foreground">{estimatedHours || 0}h</p>
              </div>
              <div className="col-span-2">
                <span className="text-muted-foreground text-xs">New Total if Approved</span>
                <p className="font-semibold text-foreground">{(estimatedHours || 0) + additionalHoursRequested}h</p>
              </div>
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            <Button
              onClick={() => handleAction('approveAdditionalHours', async () => {
                const { approveAdditionalHours } = await import('@/app/actions/estimates')
                await approveAdditionalHours(ticketId)
              })}
              disabled={loading !== null}
              className="rounded-lg bg-emerald-600 hover:bg-emerald-700"
            >
              {loading === 'approveAdditionalHours' ? (
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
              ) : (
                <CheckCircle2 className="h-4 w-4 mr-2" />
              )}
              Approve Additional Hours
            </Button>
            <Button
              onClick={() => handleAction('declineAdditionalHours', () => declineAdditionalHours(ticketId))}
              disabled={loading !== null}
              variant="outline"
              className="rounded-lg border-destructive/50 text-destructive hover:bg-destructive/10"
            >
              {loading === 'declineAdditionalHours' ? (
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
              ) : (
                <XCircle className="h-4 w-4 mr-2" />
              )}
              Request Revision
            </Button>
          </div>
        </div>
      )}

      {/* Error & Success Messages */}
      {error && (
        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="flex items-center gap-1.5 text-sm text-destructive bg-destructive/10 rounded-lg px-3 py-2"
        >
          <AlertCircle className="h-3.5 w-3.5 shrink-0" />
          {error}
        </motion.p>
      )}
      {success && (
        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="flex items-center gap-1.5 text-sm text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-500/15 rounded-lg px-3 py-2"
        >
          <CheckCircle2 className="h-3.5 w-3.5 shrink-0" />
          {success}
        </motion.p>
      )}
    </div>
  )
}

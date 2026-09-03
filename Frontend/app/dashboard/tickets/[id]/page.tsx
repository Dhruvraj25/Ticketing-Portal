import { Suspense } from 'react'
import { notFound } from 'next/navigation'
import dynamic from 'next/dynamic'
import Link from 'next/link'
import { getCurrentUser, getTicketById } from '@/app/actions/tickets'
import { getDevelopers } from '@/app/actions/users'
import { cn } from '@/lib/utils'
import { format, formatDistanceToNow } from 'date-fns'
import { stripHtml } from '@/lib/format'
import { User, Clock, History, FolderKanban, Layers, Calendar, RefreshCw, MessageSquare, FileText, Paperclip, Ticket } from 'lucide-react'
import { PageHeaderIcon } from '@/components/dashboard/page-header-icon'
import { TICKET_STATUS_CONFIG, TICKET_PRIORITY_CONFIG, TICKET_CATEGORY_CONFIG } from '@/lib/types'
import { TicketStatus } from '@/lib/types'
import { TicketStatusActions } from '@/components/dashboard/ticket-status-actions'
import { PriorityEditor } from '@/components/dashboard/priority-editor'
import { TicketAutoRefresh } from '@/components/dashboard/ticket-auto-refresh'
import { TicketDatesEditor } from '@/components/dashboard/ticket-dates-editor'
import { PageTimer } from '@/lib/performance-profiler'

// Lazy-loaded heavy interactive components (code-split)
// Each fallback height exactly matches the rendered component's height to prevent CLS
const CommentSection = dynamic(() => import('@/components/dashboard/comment-section').then(m => ({ default: m.CommentSection })), { loading: () => <div className="animate-pulse rounded-xl bg-white dark:bg-slate-900 border border-border" style={{ height: 520 }} /> })
const TimeTrackingSection = dynamic(() => import('@/components/dashboard/time-tracking-section').then(m => ({ default: m.TimeTrackingSection })), { loading: () => <div className="animate-pulse rounded-xl bg-white dark:bg-slate-900 border border-border" style={{ height: 280 }} /> })
const ManagerReviewActions = dynamic(() => import('@/components/dashboard/manager-review-actions').then(m => ({ default: m.ManagerReviewActions })), { loading: () => <div className="animate-pulse rounded-xl bg-white dark:bg-slate-900 border border-border" style={{ height: 180 }} /> })
const RevisionApprovalActions = dynamic(() => import('@/components/dashboard/revision-approval-actions').then(m => ({ default: m.RevisionApprovalActions })), { loading: () => <div className="animate-pulse rounded-xl bg-white dark:bg-slate-900 border border-border" style={{ height: 180 }} /> })
const ClientApprovalActions = dynamic(() => import('@/components/dashboard/client-approval-actions').then(m => ({ default: m.ClientApprovalActions })), { loading: () => <div className="animate-pulse rounded-xl bg-white dark:bg-slate-900 border border-border" style={{ height: 180 }} /> })
const AttachmentUploader = dynamic(() => import('@/components/dashboard/attachment-uploader').then(m => ({ default: m.AttachmentUploader })), { loading: () => <div className="animate-pulse rounded-xl bg-white dark:bg-slate-900 border border-border" style={{ height: 480 }} /> })
const EstimateSection = dynamic(() => import('@/components/dashboard/estimate-section').then(m => ({ default: m.EstimateSection })), { loading: () => <div className="animate-pulse rounded-xl bg-white dark:bg-slate-900 border border-border" style={{ height: 280 }} /> })
const TicketReviewSection = dynamic(() => import('@/components/dashboard/ticket-review-section').then(m => ({ default: m.TicketReviewSection })) , { loading: () => <div className="animate-pulse rounded-xl bg-white dark:bg-slate-900 border border-border" style={{ height: 280 }} /> })

// ── Streaming Wrappers — each fetches its own data, renders inside Suspense ──

async function CommentsWrapper({ ticketId, user }: { ticketId: number; user: any }) {
  const { getComments } = await import('@/app/actions/tickets')
  const [comments, { getAttachments }] = await Promise.all([
    getComments(ticketId, 20, 0),
    import('@/app/actions/attachments'),
  ])
  const attachments = await getAttachments(ticketId)
  return (
    <CommentSection
      ticketId={ticketId}
      comments={comments}
      userRole={user.role}
      attachments={attachments}
      currentUserId={user.id}
      maxHeight="400px"
    />
  )
}

async function TimeLogsWrapper({ ticketId }: { ticketId: number }) {
  const { getTimeLogs } = await import('@/app/actions/tickets')
  const timeLogs = await getTimeLogs(ticketId, 50, 0)
  return <TimeTrackingSection ticketId={ticketId} timeLogs={timeLogs} />
}

async function ActivityWrapper({ ticketId, isClient }: { ticketId: number; isClient: boolean }) {
  const { TicketActivityTimeline } = await import('@/components/dashboard/ticket-activity')
  const { getTicketHistory, getTicketHistoryCount } = await import('@/app/actions/tickets')
  const [history, totalCount] = await Promise.all([
    getTicketHistory(ticketId, 20, 0),
    getTicketHistoryCount(ticketId),
  ])
  return (
    <>
      <TicketActivityTimeline history={history} isClient={isClient} />
      {totalCount > 20 && (
        <p className="text-xs text-center text-muted-foreground mt-2">
          +{totalCount - 20} more entries
        </p>
      )}
    </>
  )
}

async function AttachmentsWrapper({ ticketId }: { ticketId: number }) {
  const { getAttachments } = await import('@/app/actions/attachments')
  const attachments = await getAttachments(ticketId)
  // Return only metadata (no image previews)
  return attachments.map((a) => ({
    id: a.id,
    filename: a.filename,
    extension: a.filename.split('.').pop() || '',
    sizeBytes: a.sizeBytes,
    uploadedByName: a.uploadedByName,
    uploadedByRole: a.uploadedByRole,
    createdAt: a.createdAt,
    url: a.url,
    mimeType: a.mimeType,
  }))
}

async function RevisionHistoryWrapper({ ticketId, isManagerOrAdmin }: { ticketId: number; isManagerOrAdmin: boolean }) {
  const { getRevisionHistory } = await import('@/app/actions/revisions')
  const { USER_ROLE_CONFIG } = await import('@/lib/types')
  const revisionHistoryEntries = await getRevisionHistory(ticketId)

  if (revisionHistoryEntries.length === 0) return null

  return (
    <div data-tour="ticket-revision-history" className="bg-white dark:bg-slate-900 border border-border rounded-xl p-5 shadow-sm">
      <div className="flex items-center gap-2 mb-4">
        <RefreshCw className="h-4 w-4 text-orange-500 dark:text-orange-400" />
        <h2 className="text-sm font-semibold text-foreground">Revision History</h2>
        <span className="text-xs text-muted-foreground">({revisionHistoryEntries.length})</span>
      </div>

      {isManagerOrAdmin && revisionHistoryEntries.some(r => r.status === 'pending' || r.status === 'pending_approval') && (
        <div data-tour="ticket-revision-approval" className="mb-4">
          <RevisionApprovalActions
            pendingRevisions={revisionHistoryEntries.filter(r => r.status === 'pending' || r.status === 'pending_approval')}
            ticketId={ticketId}
          />
        </div>
      )}

      <div className="space-y-4">
        {revisionHistoryEntries.slice(0, 10).map((rev, idx) => {
          const roleConfig = USER_ROLE_CONFIG[rev.requestedByRole as keyof typeof USER_ROLE_CONFIG]
          return (
            <div key={rev.id} className="relative pl-6">
              {idx < Math.min(revisionHistoryEntries.length, 10) - 1 && (
                <div className="absolute left-[7px] top-4 bottom-0 w-0.5 bg-orange-200" />
              )}
              <div className="absolute left-0 top-1.5 w-[15px] h-[15px] rounded-full border-2 border-orange-400 bg-orange-50 dark:bg-orange-500/15" />
              <div className={cn('rounded-lg p-4 border',
                rev.status === 'approved' ? 'bg-emerald-50 dark:bg-emerald-500/15/50 border-emerald-200 dark:border-emerald-500/30' :
                rev.status === 'rejected' ? 'bg-red-50 dark:bg-red-500/15/50 border-red-200 dark:border-red-500/30' : 'bg-orange-50 dark:bg-orange-500/15/50 border-orange-200 dark:border-orange-500/30'
              )}>
                <div className="flex items-start justify-between gap-3 mb-3">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-semibold text-orange-700 dark:text-orange-300">Revision #{rev.revisionNumber}</span>
                    <span className={cn('text-xs px-2 py-0.5 rounded-full border', roleConfig?.color || 'bg-gray-50 dark:bg-slate-800/50 text-gray-600 dark:text-slate-400 border-gray-200 dark:border-slate-800')}>
                      {rev.requestedByName}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      ({rev.requestedByRole === 'project_manager' ? 'Manager' : rev.requestedByRole === 'admin' ? 'Admin' : 'Client'})
                    </span>
                  </div>
                  <span className="text-xs text-muted-foreground shrink-0">
                    {format(new Date(rev.createdAt), 'MMM d, yyyy')}
                  </span>
                </div>
                <p className="text-sm text-foreground whitespace-pre-wrap leading-relaxed">{rev.revisionNotes}</p>
              </div>
            </div>
          )
        })}
        {revisionHistoryEntries.length > 10 && (
          <p className="text-xs text-center text-muted-foreground">+{revisionHistoryEntries.length - 10} more</p>
        )}
      </div>
    </div>
  )
}

// ── Skeleton Components ────────────────────────────────────────────────────

function SectionSkeleton({ height = 192 }: { height?: number }) {
  return <div className="animate-pulse rounded-xl bg-white dark:bg-slate-900 border border-border" style={{ height }} />
}

function DetailPanelSkeleton() {
  return (
    <div className="w-[300px] xl:w-[340px] shrink-0 border-l border-border/50 p-4 space-y-4">
      <div className="animate-pulse rounded-xl bg-white dark:bg-slate-900 border border-border p-4">
        <div className="h-3 w-20 bg-muted rounded mb-3" />
        <div className="space-y-3">
          {[1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="flex items-center justify-between">
              <div className="h-3 w-16 bg-muted rounded" />
              <div className="h-3 w-24 bg-muted rounded" />
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

// ── Critical Path — renders immediately, heavy sections stream ──────────────

export default async function TicketDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const pageTimer = new PageTimer('Ticket Detail')
  pageTimer.mark('Parameters')
  
  const { id } = await params
  const ticketId = parseInt(id)
  if (isNaN(ticketId)) notFound()

  try {
    pageTimer.mark('Critical Path Fetch')
    
    // ── Critical path: only fetch user + ticket + developers ──
    // Everything else streams via Suspense below
    const [user, ticket, developers] = await Promise.all([
      getCurrentUser(),
      getTicketById(ticketId),
      getDevelopers().catch(() => [] as { id: string; name: string; email: string; activeTickets: number }[]),
    ])

    const isManagerOrAdmin = user.role === 'project_manager' || user.role === 'admin'
    const isClientUser = user.role === 'client'

    const statusConfig = TICKET_STATUS_CONFIG[ticket.status as keyof typeof TICKET_STATUS_CONFIG] ?? {
      label: ticket.status.charAt(0).toUpperCase() + ticket.status.slice(1),
      color: 'bg-gray-50 dark:bg-slate-800/50 text-gray-500 border-gray-200 dark:border-slate-800',
    }
    const priorityConfig = TICKET_PRIORITY_CONFIG[ticket.priority as keyof typeof TICKET_PRIORITY_CONFIG] ?? {
      label: ticket.priority?.toUpperCase() || 'N/A',
      color: 'bg-gray-50 dark:bg-slate-800/50 text-gray-500 border-gray-200 dark:border-slate-800',
    }
    const categoryConfig = TICKET_CATEGORY_CONFIG[ticket.category as keyof typeof TICKET_CATEGORY_CONFIG] ?? {
      label: ticket.category || 'Unknown', icon: 'HelpCircle',
    }

    const statusBadge = (
      <span className={cn('inline-flex items-center gap-1 px-2 py-0.5 rounded-lg text-xs font-medium border', statusConfig.color)}>
        <span className={cn('h-1.5 w-1.5 rounded-full',
          ticket.status === TicketStatus.NEW && 'bg-blue-400',
          ticket.status === TicketStatus.MANAGER_REVIEW && 'bg-indigo-400',
          ticket.status === TicketStatus.ESTIMATE_PENDING && 'bg-sky-400',
          ticket.status === TicketStatus.ESTIMATE_APPROVED && 'bg-emerald-400',
          ticket.status === TicketStatus.IN_PROGRESS && 'bg-amber-400',
          ticket.status === TicketStatus.RESOLVED && 'bg-green-400',
          ticket.status === TicketStatus.CLIENT_REVIEW && 'bg-sky-400',
          ticket.status === TicketStatus.CLOSED && 'bg-gray-400',
          ticket.status === TicketStatus.REQUEST_FOR_REVISION && 'bg-orange-400',
          ticket.status === TicketStatus.ASSIGNED && 'bg-indigo-400',
        )} />
        {statusConfig.label}
      </span>
    )
    const priorityBadge = (
      <span className={cn('inline-flex items-center px-2 py-0.5 rounded-lg text-xs font-medium border', priorityConfig.color)}>
        {priorityConfig.label}
      </span>
    )
    const categoryBadge = (
      <span className="px-2 py-0.5 rounded-lg text-xs font-medium bg-muted text-muted-foreground border border-border/50">
        {categoryConfig.label}
      </span>
    )

    pageTimer.finish()

    return (
      <div className="flex flex-col h-full -mx-4 sm:-mx-6 lg:-mx-10">
        {/* Background refresh — keeps ticket data current while the user is idle */}
        <TicketAutoRefresh />
        {/* Back navigation */}
        <div data-tour="ticket-back-nav" className="px-4 lg:px-6 pt-3 pb-0">
          <div className="flex items-center gap-2">
            <Link href="/dashboard/tickets" className="text-xs text-muted-foreground hover:text-foreground transition-colors flex items-center gap-1">
              <span className="text-muted-foreground/50">&larr;</span>
              Back to Tickets
            </Link>
          </div>
        </div>

        {/* Sticky Header */}
        <div className="sticky top-0 z-20 bg-background/95 backdrop-blur-md border-b border-border/40">
          <div className="px-4 lg:px-6 pt-3 pb-2">
            <div data-tour="ticket-detail-header" className="bg-white dark:bg-slate-900 border border-border rounded-xl shadow-sm p-4">
              <div className="flex items-center gap-3">
                <PageHeaderIcon variant="teal">
                  <Ticket className="h-5 w-5" />
                </PageHeaderIcon>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-xs font-mono text-muted-foreground">{ticket.ticketNumber}</span>
                    {statusBadge}{priorityBadge}{categoryBadge}
                  </div>
                  <h1 className="text-lg font-bold text-foreground truncate">{ticket.title}</h1>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Split Panel Layout */}
        <div className="flex-1 flex overflow-hidden">
          {/* Left: Main Content (Scrollable) */}
          <div className="flex-1 overflow-y-auto overscroll-behavior-contain scroll-smooth px-4 lg:px-6 py-4 space-y-6">
            {/* Description — critical path */}
            <div data-tour="ticket-description" className="bg-white dark:bg-slate-900 border border-border rounded-xl p-5 shadow-sm">
              <div className="flex items-center gap-2 mb-3">
                <FileText className="h-4 w-4 text-muted-foreground" />
                <h2 className="text-sm font-semibold text-foreground">Description</h2>
              </div>
              <p className="text-sm text-muted-foreground whitespace-pre-wrap leading-relaxed">
                {stripHtml(ticket.description)}
              </p>
            </div>

            {/* Status Actions - Developer only — critical path */}
            {user.role === 'developer' && (
              <TicketStatusActions ticketId={ticket.id} currentStatus={ticket.status as TicketStatus} />
            )}

            {/* Estimate Section — critical */}
            {(['new', 'estimate_pending', 'estimate_approved', 'request_for_revision'].includes(ticket.status) || ticket.estimatedHours) && (isManagerOrAdmin || user.role === 'client') && (
              <EstimateSection
                ticketId={ticket.id}
                currentStatus={ticket.status as TicketStatus}
                userRole={user.role}
                clientName={ticket.clientName}
                estimatedHours={ticket.estimatedHours}
                estimatedCompletionDate={ticket.estimatedCompletionDate}
                estimateNotes={ticket.estimateNotes}
                estimateSubmittedAt={ticket.estimateSubmittedAt}
                estimateApprovedAt={ticket.estimateApprovedAt}
                autoApproved={ticket.autoApproved}
                approvalDeadline={ticket.approvalDeadline}
                additionalHoursRequested={ticket.additionalHoursRequested}
                additionalHoursApproved={ticket.additionalHoursApproved}
                developers={developers}
              />
            )}

            {/* Manager Review Actions — critical */}
            {isManagerOrAdmin && ticket.status === 'resolved' && (
              <ManagerReviewActions
                ticketId={ticket.id}
                developers={developers}
                ticketNumber={ticket.ticketNumber}
                revisionCount={ticket.revisionCount || 0}
              />
            )}

            {/* Client Review Section — critical */}
            <TicketReviewSection
              ticketId={ticket.id}
              ticketStatus={ticket.status}
              currentUserRole={user.role}
              currentUserId={user.id}
            />

            {/* Client Approval Actions — critical */}
            {user.role === 'client' && (ticket.status === 'client_review' || ticket.status === 'closed') && (
              <ClientApprovalActions ticketId={ticket.id} currentStatus={ticket.status as TicketStatus} revisionCount={ticket.revisionCount || 0} closedAt={ticket.closedAt} />
            )}

            {/* ── STREAMED SECTIONS ── */}

            {/* Time Tracking — only shown to developers */}
            {user.role === 'developer' && (
              <Suspense fallback={<SectionSkeleton height={280} />}>
                <TimeLogsWrapper ticketId={ticket.id} />
              </Suspense>
            )}

            {/* Attachments Uploader + List */}
            <Suspense fallback={<SectionSkeleton height={480} />}>
              <AttachmentUploaderWrapper ticketId={ticket.id} userId={user.id} userRole={user.role} />
            </Suspense>

            {/* Revision History — internal only. Clients never see manager
                names or internal review/rework activity (R14/R15). */}
            {!isClientUser && (
              <Suspense fallback={null}>
                <RevisionHistoryWrapper ticketId={ticket.id} isManagerOrAdmin={isManagerOrAdmin} />
              </Suspense>
            )}

            {/* Comments */}
            <Suspense fallback={<SectionSkeleton height={520} />}>
              <CommentsWrapper ticketId={ticket.id} user={user} />
            </Suspense>
          </div>

          {/* Right: Detail Panel (streamed) */}
          <div data-tour="ticket-details-panel" className="hidden lg:block w-[300px] xl:w-[340px] shrink-0 border-l border-border/50 bg-background/50 overflow-y-auto overscroll-behavior-contain p-4 space-y-4">
            {/* Ticket Details — critical, rendered from props */}
            <div data-tour="ticket-detail-meta" className="bg-white dark:bg-slate-900 border border-border rounded-xl p-4 shadow-sm">
              <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">Details</h3>
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs text-muted-foreground flex items-center gap-1.5"><User className="h-3 w-3" />Submitted by</span>
                  <span className="text-xs text-foreground font-medium">{ticket.clientName}</span>
                </div>
                {ticket.assignedToName && user.role !== 'client' && (
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-muted-foreground flex items-center gap-1.5"><User className="h-3 w-3 text-emerald-400" />Assigned to</span>
                    <span className="text-xs text-foreground font-medium">{ticket.assignedToName}</span>
                  </div>
                )}
                <div className="flex items-center justify-between">
                  <span className="text-xs text-muted-foreground flex items-center gap-1.5"><FileText className="h-3 w-3" />Priority</span>
                  <PriorityEditor ticketId={ticket.id} currentPriority={ticket.priority} canEdit={isManagerOrAdmin} />
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-xs text-muted-foreground flex items-center gap-1.5"><Calendar className="h-3 w-3" />Created</span>
                  <span className="text-xs text-foreground">{format(new Date(ticket.createdAt), 'MMM d, yyyy')}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-xs text-muted-foreground flex items-center gap-1.5"><Clock className="h-3 w-3" />Updated</span>
                  <span className="text-xs text-foreground">{formatDistanceToNow(new Date(ticket.updatedAt), { addSuffix: true })}</span>
                </div>
                {ticket.projectId && (
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-muted-foreground flex items-center gap-1.5"><FolderKanban className="h-3 w-3" />Project</span>
                    <span className="text-xs text-foreground text-right">{ticket.projectName}{ticket.projectCode && <span className="text-muted-foreground block">{ticket.projectCode}</span>}</span>
                  </div>
                )}
                {ticket.moduleId && (
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-muted-foreground flex items-center gap-1.5"><Layers className="h-3 w-3" />Module</span>
                    <span className="text-xs text-foreground">{ticket.moduleName}</span>
                  </div>
                )}
                {(ticket.revisionCount ?? 0) > 0 && (
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-muted-foreground flex items-center gap-1.5"><RefreshCw className="h-3 w-3 text-orange-500 dark:text-orange-400" />Revisions</span>
                    <span className="text-xs text-foreground font-medium">{ticket.revisionCount}</span>
                  </div>
                )}
              </div>

              {/* Completion Tracking — for non-client users */}
              {ticket.status === 'closed' && user.role !== 'client' && (
                <div className="pt-3 mt-2 border-t border-border/50">
                  <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider block mb-2">Completion</span>
                  <p className="text-xs text-muted-foreground">Loaded with ticket data</p>
                </div>
              )}
            </div>

            {/* Admin-only: edit ticket creation/closing dates (R24) */}
            {user.role === 'admin' && (
              <TicketDatesEditor
                ticketId={ticket.id}
                createdAt={ticket.createdAt.toISOString()}
                closedAt={ticket.closedAt ? ticket.closedAt.toISOString() : null}
              />
            )}

            {/* Sidebar: Attachments (streamed) */}
            <Suspense fallback={<div className="animate-pulse bg-white dark:bg-slate-900 border border-border rounded-xl p-4"><div className="h-3 w-24 bg-muted rounded mb-3" />{[1,2,3].map(i => <div key={i} className="h-8 bg-muted rounded mb-2" />)}</div>}>
              <SidebarAttachmentsWrapper ticketId={ticket.id} />
            </Suspense>

            {/* Activity Timeline (streamed) */}
            <Suspense fallback={<div className="animate-pulse bg-white dark:bg-slate-900 border border-border rounded-xl p-4"><div className="h-3 w-20 bg-muted rounded mb-3" />{[1,2,3].map(i => <div key={i} className="flex gap-3 mb-3"><div className="w-2 h-2 rounded-full bg-muted mt-1" /><div className="flex-1 h-4 bg-muted rounded" /></div>)}</div>}>
              <ActivitySidebarWrapper ticketId={ticket.id} isClient={user.role === 'client'} />
            </Suspense>
          </div>
        </div>
      </div>
    )
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    console.error(`[TicketDetailPage] Error loading ticket ${ticketId}: ${message}`, error)
    if (message === 'Ticket not found' || message === 'Access denied') notFound()
    throw error
  }
}

// ── AttachmentUploader wrapper (lazy previews) ────────────────────────────

async function AttachmentUploaderWrapper({ ticketId, userId, userRole }: { ticketId: number; userId: string; userRole: string }) {
  const { getAttachments } = await import('@/app/actions/attachments')
  const attachments = await getAttachments(ticketId)
  return (
    <AttachmentUploader
      ticketId={ticketId}
      initialAttachments={attachments}
      currentUserId={userId}
      currentUserRole={userRole}
    />
  )
}

// ── Sidebar: Attachments list with lazy-loaded previews ────────────────────

async function SidebarAttachmentsWrapper({ ticketId }: { ticketId: number }) {
  const { getAttachments } = await import('@/app/actions/attachments')
  const attachments = await getAttachments(ticketId)
  const { formatDistanceToNow } = await import('date-fns')

  if (attachments.length === 0) return null

  return (
    <div data-tour="ticket-attachments" className="bg-white dark:bg-slate-900 border border-border rounded-xl p-4 shadow-sm">
      <div className="flex items-center gap-2 mb-3">
        <Paperclip className="h-3.5 w-3.5 text-muted-foreground" />
        <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Attachments</h3>
        <span className="text-[11px] text-muted-foreground">({attachments.length})</span>
      </div>
      <div className="space-y-1.5">
        {attachments.slice(0, 5).map((a) => (
          <a
            key={a.id}
            href={a.url}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-2.5 p-2 rounded-lg hover:bg-muted/30 transition-colors group"
          >
            {/* Lazy-loaded preview: show icon placeholder, load image on click */}
            {a.mimeType.startsWith('image/') ? (
              <div className="w-7 h-7 rounded-md overflow-hidden shrink-0 border border-border/40 bg-muted/30 flex items-center justify-center">
                <span className="text-[8px] font-bold text-muted-foreground uppercase">
                  {a.filename.split('.').pop()?.slice(0, 3) || 'IMG'}
                </span>
              </div>
            ) : (
              <div className="w-7 h-7 rounded-md bg-muted/50 flex items-center justify-center shrink-0">
                <span className="text-[11px] font-bold text-muted-foreground uppercase">
                  {a.mimeType === 'application/pdf' ? 'PDF' : a.filename.split('.').pop()?.slice(0, 3) || 'FILE'}
                </span>
              </div>
            )}
            <div className="flex-1 min-w-0">
              <p className="text-xs font-medium text-foreground truncate">{a.filename}</p>
              <p className="text-[11px] text-muted-foreground">
                {a.uploadedByName} &middot; {formatDistanceToNow(new Date(a.createdAt), { addSuffix: true })}
              </p>
            </div>
          </a>
        ))}
        {attachments.length > 5 && (
          <p className="text-xs text-muted-foreground text-center pt-1">
            +{attachments.length - 5} more attachment{attachments.length - 5 !== 1 ? 's' : ''}
          </p>
        )}
      </div>
    </div>
  )
}

// ── Sidebar: Activity timeline (paginated: first 20) ──────────────────────

async function ActivitySidebarWrapper({ ticketId, isClient }: { ticketId: number; isClient: boolean }) {
  const { getTicketHistory, getTicketHistoryCount } = await import('@/app/actions/tickets')
  const { TicketActivityTimeline } = await import('@/components/dashboard/ticket-activity')
  const [history, totalCount] = await Promise.all([
    getTicketHistory(ticketId, 20, 0),
    getTicketHistoryCount(ticketId),
  ])

  if (history.length === 0 && totalCount === 0) return null

  return (
    <div data-tour="ticket-activity" className="bg-white dark:bg-slate-900 border border-border rounded-xl p-4 shadow-sm">
      <div className="flex items-center gap-2 mb-3">
        <History className="h-3.5 w-3.5 text-muted-foreground" />
        <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Activity</h3>
      </div>
      <div className="max-h-[360px] overflow-y-auto overscroll-behavior-contain scroll-smooth pr-1 -mr-1">
        <TicketActivityTimeline history={history} isClient={isClient} />
      </div>
      {totalCount > 20 && (
        <p className="text-xs text-center text-muted-foreground mt-2 pt-2 border-t border-border/30">
          +{totalCount - 20} more entries &middot; <span className="text-primary cursor-pointer hover:underline">Load More</span>
        </p>
      )}
    </div>
  )
}

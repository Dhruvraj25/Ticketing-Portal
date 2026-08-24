import { pgTable, text, timestamp, boolean, serial, integer, date, index, uniqueIndex } from 'drizzle-orm/pg-core'
import { relations, sql } from 'drizzle-orm'

// --- Better Auth required tables -------------------------------------------
export const user = pgTable('user', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  email: text('email').notNull().unique(),
  emailVerified: boolean('emailVerified').notNull().default(false),
  image: text('image'),
  avatarUrl: text('avatarUrl'),
  role: text('role').notNull().default('client'),
  userType: text('user_type').default('standard'),
  banned: boolean('banned').notNull().default(false),
  // Customer-level preference: whether this customer's users receive Microsoft
  // Teams notifications. Default OFF. Set during onboarding; editable in Admin UI.
  enableTeamsNotifications: boolean('enable_teams_notifications').notNull().default(false),
  welcomeEmailSent: boolean('welcome_email_sent').notNull().default(false),
  // Profile fields (added in migration 0027)
  phone: text('phone'),
  countryCode: text('countryCode'),
  timezone: text('timezone'),
  about: text('about'),
  language: text('language').default('en'),
  timeFormat: text('timeFormat').default('12h'),
  dateFormat: text('dateFormat').default('MM/dd/yyyy'),
  emailNotificationsEnabled: boolean('emailNotificationsEnabled').notNull().default(true),
  createdAt: timestamp('createdAt').notNull().defaultNow(),
  updatedAt: timestamp('updatedAt').notNull().defaultNow(),
}, (table) => ({
  roleIdx: index('user_role_idx').on(table.role),
  // Index for admin getUsers() which orders by createdAt DESC.
  // Without this, PostgreSQL must sort the full user table in heap.
  createdAtIdx: index('user_created_at_idx').on(table.createdAt.desc()),
  // Composite index for admin filtered+ordered user listing.
  // getUsers() / getUsersPaginated() frequently filter by role + banned status
  // and sort by createdAt DESC. This single composite covers all three columns,
  // enabling index-only scans for common admin queries.
  roleBannedCreatedAtIdx: index('user_role_banned_created_at_idx')
    .on(table.role, table.banned, table.createdAt.desc()),
}))

export const session = pgTable('session', {
  id: text('id').primaryKey(),
  expiresAt: timestamp('expiresAt').notNull(),
  token: text('token').notNull().unique(),
  createdAt: timestamp('createdAt').notNull().defaultNow(),
  updatedAt: timestamp('updatedAt').notNull().defaultNow(),
  ipAddress: text('ipAddress'),
  userAgent: text('userAgent'),
  userId: text('userId')
    .notNull()
    .references(() => user.id, { onDelete: 'cascade' }),
}, (table) => ({
  userIdIdx: index('session_user_id_idx').on(table.userId),
  tokenIdx: index('session_token_idx').on(table.token),
  userExpiresIdx: index('session_user_expires_idx').on(table.userId, table.expiresAt),
}))

export const account = pgTable('account', {
  id: text('id').primaryKey(),
  accountId: text('accountId').notNull(),
  providerId: text('providerId').notNull(),
  userId: text('userId')
    .notNull()
    .references(() => user.id, { onDelete: 'cascade' }),
  accessToken: text('accessToken'),
  refreshToken: text('refreshToken'),
  idToken: text('idToken'),
  accessTokenExpiresAt: timestamp('accessTokenExpiresAt'),
  refreshTokenExpiresAt: timestamp('refreshTokenExpiresAt'),
  scope: text('scope'),
  password: text('password'),
  createdAt: timestamp('createdAt').notNull().defaultNow(),
  updatedAt: timestamp('updatedAt').notNull().defaultNow(),
})

export const verification = pgTable('verification', {
  id: text('id').primaryKey(),
  identifier: text('identifier').notNull(),
  value: text('value').notNull(),
  expiresAt: timestamp('expiresAt').notNull(),
  createdAt: timestamp('createdAt').defaultNow(),
  updatedAt: timestamp('updatedAt').defaultNow(),
})

// --- Project Management Tables ---------------------------------------------

export const project = pgTable('project', {
  id: serial('id').primaryKey(),
  projectName: text('projectName').notNull(),
  projectCode: text('projectCode').notNull().unique(),
  clientId: text('clientId')
    .notNull()
    .references(() => user.id, { onDelete: 'restrict' }),
  managerId: text('managerId')
    .notNull()
    .references(() => user.id, { onDelete: 'restrict' }),
  description: text('description'),
  startDate: date('startDate'),
  endDate: date('endDate'),
  status: text('status').notNull().default('active'),
  createdAt: timestamp('createdAt').notNull().defaultNow(),
  updatedAt: timestamp('updatedAt').notNull().defaultNow(),
}, (table) => ({
  statusIdx: index('project_status_idx').on(table.status),
  clientIdIdx: index('project_client_id_idx').on(table.clientId),
  managerIdIdx: index('project_manager_id_idx').on(table.managerId),
  createdAtIdx: index('project_created_at_idx').on(table.createdAt),
  // Composite indexes for dashboard sidebar queries.
  // getSidebarData / getProjectMetrics query projects filtered by clientId+status
  // or managerId+status. These composites enable index-only scans instead of
  // combining two separate single-column indexes via bitmap scans.
  clientStatusIdx: index('project_client_status_idx').on(table.clientId, table.status),
  managerStatusIdx: index('project_manager_status_idx').on(table.managerId, table.status),
}))

export const module = pgTable('module', {
  id: serial('id').primaryKey(),
  projectId: integer('projectId')
    .notNull()
    .references(() => project.id, { onDelete: 'cascade' }),
  moduleName: text('moduleName').notNull(),
  description: text('description'),
  status: text('status').notNull().default('active'),
  createdAt: timestamp('createdAt').notNull().defaultNow(),
  updatedAt: timestamp('updatedAt').notNull().defaultNow(),
}, (table) => ({
  projectIdIdx: index('module_project_id_idx').on(table.projectId),
  statusIdx: index('module_status_idx').on(table.status),
  projectStatusIdx: index('module_project_status_idx').on(table.projectId, table.status),
}))

// --- Ticketing System Tables -----------------------------------------------

export const ticket = pgTable('ticket', {
  id: serial('id').primaryKey(),
  ticketNumber: text('ticketNumber').notNull().unique(),
  title: text('title').notNull(),
  description: text('description').notNull(),
  status: text('status').notNull().default('open'),
  priority: text('priority').notNull().default('medium'),
  category: text('category').notNull().default('general'),
  clientId: text('clientId').notNull(),
  assignedToId: text('assignedToId'),
  assignedById: text('assignedById'),
  projectId: integer('projectId').references(() => project.id, { onDelete: 'set null' }),
  moduleId: integer('moduleId').references(() => module.id, { onDelete: 'set null' }),
  assignedAt: timestamp('assignedAt'),
  resolvedAt: timestamp('resolvedAt'),
  closedAt: timestamp('closedAt'),
  // Override ticket fields
  isOverrideTicket: boolean('isOverrideTicket').notNull().default(false),
  overrideReason: text('overrideReason'),
  overrideBy: text('overrideBy'),
  overrideDate: timestamp('overrideDate'),
  // Hour estimation
  estimatedHours: integer('estimatedHours'),
  estimatedCompletionDate: date('estimatedCompletionDate'),
  estimateNotes: text('estimateNotes'),
  estimateSubmittedAt: timestamp('estimateSubmittedAt'),
  estimateApprovedAt: timestamp('estimateApprovedAt'),
  estimateApprovedBy: text('estimateApprovedBy'),
  autoApproved: boolean('autoApproved').notNull().default(false),
  autoApprovedAt: timestamp('autoApprovedAt'),
  approvalDeadline: timestamp('approvalDeadline'),
  // Skipped estimate workflow (manager "Assign Directly" → non-billable worklogs)
  estimateWorkflowSkipped: boolean('estimateWorkflowSkipped').notNull().default(false),
  // Additional hours
  additionalHoursRequested: integer('additionalHoursRequested'),
  additionalHoursApproved: boolean('additionalHoursApproved').notNull().default(false),
  additionalHoursApprovedBy: text('additionalHoursApprovedBy'),
  additionalHoursAutoApproved: boolean('additionalHoursAutoApproved').notNull().default(false),
  additionalHoursDeadline: timestamp('additionalHoursDeadline'),
  // Reservation
  reservedHours: integer('reservedHours'),
  consumedHours: integer('consumedHours'),
  // Revision fields
  revisionCount: integer('revisionCount').notNull().default(0),
  createdAt: timestamp('createdAt').notNull().defaultNow(),
  updatedAt: timestamp('updatedAt').notNull().defaultNow(),
}, (table) => ({
  statusIdx: index('ticket_status_idx').on(table.status),
  priorityIdx: index('ticket_priority_idx').on(table.priority),
  projectIdIdx: index('ticket_project_id_idx').on(table.projectId),
  moduleIdIdx: index('ticket_module_id_idx').on(table.moduleId),
  assignedToIdIdx: index('ticket_assigned_to_id_idx').on(table.assignedToId),
  clientIdIdx: index('ticket_client_id_idx').on(table.clientId),
  createdAtIdx: index('ticket_created_at_idx').on(table.createdAt),
  updatedAtIdx: index('ticket_updated_at_idx').on(table.updatedAt.desc()),
  // Composite indexes for common query patterns
  clientStatusIdx: index('ticket_client_status_idx').on(table.clientId, table.status),
  assignedStatusIdx: index('ticket_assigned_status_idx').on(table.assignedToId, table.status),
  // Composite index for recent-tickets-by-client queries (dashboard sidebar).
  // getRecentTickets uses WHERE clientId=? ORDER BY createdAt DESC LIMIT 5.
  // With this index, PostgreSQL seeks directly to the client's rows in order
  // and stops after 5. Without it: filter by clientId → sort all matching → take 5.
  clientCreatedAtIdx: index('ticket_client_created_at_idx').on(table.clientId, table.createdAt.desc()),
  // Same optimization for developer-scoped recent ticket queries.
  assignedCreatedAtIdx: index('ticket_assigned_created_at_idx').on(table.assignedToId, table.createdAt.desc()),
  // Composite index for sidebar project analytics GROUP BY queries.
  // getSidebarData() groups ticket counts by projectId + status for admin/manager
  // dashboard widgets. Without this, PostgreSQL uses the single-column
  // projectIdIdx + statusIdx via bitmap combine (2 scans + sort).
  // With this: single index-only scan for the GROUP BY query.
  projectStatusIdx: index('ticket_project_status_idx').on(table.projectId, table.status),
  // Composite index for project-scoped ticket listing.
  // getTicketsList with projectId filter sorts by createdAt DESC.
  // Without this: filter by projectId → sort all matching → limit.
  // With this: seek to project's tickets in order → stop after LIMIT.
  projectCreatedAtIndex: index('ticket_project_created_at_idx').on(table.projectId, table.createdAt.desc()),
  // Partial index for unassigned ticket queries (sidebar widget).
  // WHERE assignedToId IS NULL AND status != 'closed' ORDER BY createdAt DESC LIMIT 10
  // Only indexes the ~5% of tickets that are unassigned and not closed.
  unassignedIdx: index('ticket_unassigned_idx')
    .on(table.createdAt.desc())
    .where(sql`${table.assignedToId} IS NULL AND ${table.status} <> 'closed'`),
}))

export const comment = pgTable('comment', {
  id: serial('id').primaryKey(),
  ticketId: integer('ticketId').notNull(),
  userId: text('userId').notNull(),
  content: text('content').notNull(),
  isInternal: boolean('isInternal').notNull().default(false),
  createdAt: timestamp('createdAt').notNull().defaultNow(),
  updatedAt: timestamp('updatedAt').notNull().defaultNow(),
}, (table) => ({
  ticketIdIdx: index('comment_ticket_id_idx').on(table.ticketId),
  // Composite index for comment section queries on ticket detail page.
  // WHERE ticketId = ? ORDER BY createdAt DESC — enables index-only scan
  // that seeks directly to the ticket's comments in creation order.
  ticketCreatedIdx: index('comment_ticket_created_idx').on(table.ticketId, table.createdAt.desc()),
}))

export const timeLog = pgTable('time_log', {
  id: serial('id').primaryKey(),
  ticketId: integer('ticketId').notNull(),
  userId: text('userId').notNull(),
  description: text('description'),
  startTime: timestamp('startTime').notNull(),
  endTime: timestamp('endTime'),
  durationMinutes: integer('durationMinutes'),
  isBillable: boolean('isBillable').notNull().default(true),
  createdAt: timestamp('createdAt').notNull().defaultNow(),
  updatedAt: timestamp('updatedAt').notNull().defaultNow(),
}, (table) => ({
  ticketIdIdx: index('time_log_ticket_id_idx').on(table.ticketId),
  userIdIdx: index('time_log_user_id_idx').on(table.userId),
  endTimeIdx: index('time_log_end_time_idx').on(table.endTime),
  startTimeIdx: index('time_log_start_time_idx').on(table.startTime.desc()),
  // Index for active timer queries: WHERE userId = ? AND endTime IS NULL LIMIT 1
  // Replaces sequential scan with index seek for the sidebar timer widget
  userActiveTimerIdx: index('time_log_user_active_timer_idx').on(table.userId).where(sql`${table.endTime} IS NULL`),
  // Partial index: only indexes completed time logs, sorted by startTime DESC.
  // Optimizes getPaginatedWorklogs, getAllWorklogs, and getEmployeeProductivity
  // which all filter WHERE endTime IS NOT NULL and ORDER BY startTime DESC.
  // Without this, PostgreSQL scans all time_logs and filters in heap.
  // With this, it does an index-only scan of just completed logs, in order,
  // stopping after LIMIT rows. Expected: 200ms+ → <5ms.
  completedStartIdx: index('time_log_completed_start_idx')
    .on(table.startTime.desc())
    .where(sql`${table.endTime} IS NOT NULL`),
  // Composite + partial index for employee productivity queries.
  // Covers userId, startTime, durationMinutes, ticketId for completed logs.
  // Enables index-only scans for time log aggregation per developer.
  userCompletedIdx: index('time_log_user_completed_idx')
    .on(table.userId, table.startTime.desc(), table.durationMinutes, table.ticketId)
    .where(sql`${table.endTime} IS NOT NULL`),
  // Composite index for getTimeLogs and getTimeLogsBatch queries.
  // WHERE ticketId = ? ORDER BY createdAt DESC — the single-column ticketIdIdx
  // can filter but can't sort; this composite covers both, eliminating the sort.
  ticketCreatedIdx: index('time_log_ticket_created_idx').on(table.ticketId, table.createdAt.desc()),
}))

export const ticketHistory = pgTable('tickethistory', {
  id: serial('id').primaryKey(),
  ticketId: integer('ticketId').notNull(),
  userId: text('userId').notNull(),
  action: text('action').notNull(),
  oldValue: text('oldValue'),
  newValue: text('newValue'),
  createdAt: timestamp('createdAt').notNull().defaultNow(),
}, (table) => ({
  ticketIdIdx: index('ticket_history_ticket_id_idx').on(table.ticketId),
  ticketHistoryUserIdIdx: index('ticket_history_user_id_idx').on(table.userId),
  ticketHistoryTicketCreatedIdx: index('ticket_history_ticket_created_idx').on(table.ticketId, table.createdAt.desc()),
  // Index for onboarding history lookups (WHERE action = 'Customer Onboarding Completed')
  ticketHistoryActionIdx: index('ticket_history_action_idx').on(table.action),
}))

export const attachment = pgTable('attachment', {
  id: serial('id').primaryKey(),
  ticketId: integer('ticketId').notNull(),
  uploadedById: text('uploadedById').notNull(),
  filename: text('filename').notNull(),
  url: text('url').notNull(),
  publicId: text('publicId').notNull(),
  mimeType: text('mimeType').notNull(),
  sizeBytes: integer('sizeBytes').notNull(),
  createdAt: timestamp('createdAt').notNull().defaultNow(),
}, (table) => ({
  ticketIdIdx: index('attachment_ticket_id_idx').on(table.ticketId),
}))

export const notification = pgTable('notification', {
  id: serial('id').primaryKey(),
  userId: text('userId').notNull(),
  title: text('title').notNull(),
  message: text('message').notNull(),
  link: text('link'),
  ticketId: integer('ticketId'),
  isRead: boolean('isRead').notNull().default(false),
  createdAt: timestamp('createdAt').notNull().defaultNow(),
}, (table) => ({
  userIdIdx: index('notification_user_id_idx').on(table.userId),
  userReadIdx: index('notification_user_read_idx').on(table.userId, table.isRead),
  userCreatedIdx: index('notification_user_created_idx').on(table.userId, table.createdAt),
}))
// --- Branding Table -------------------------------------------------------
export const branding = pgTable('branding', {
  id: serial('id').primaryKey(),
  companyId: text('companyId').notNull().default('default'),
  companyName: text('companyName').notNull().default('SupportHub'),
  logoUrl: text('logoUrl'),
  logoPublicId: text('logoPublicId'),
  faviconUrl: text('faviconUrl'),
  faviconPublicId: text('faviconPublicId'),
  createdAt: timestamp('createdAt').notNull().defaultNow(),
  updatedAt: timestamp('updatedAt').notNull().defaultNow(),
})

// --- Support Wallet Tables ------------------------------------------------

export const supportWallet = pgTable('support_wallet', {
  id: serial('id').primaryKey(),
  clientId: text('clientId')
    .notNull()
    .references(() => user.id, { onDelete: 'restrict' }),
  projectId: integer('projectId')
    .references(() => project.id, { onDelete: 'cascade' }),
  totalPurchasedHours: integer('totalPurchasedHours').notNull().default(0),
  reservedHours: integer('reservedHours').notNull().default(0),
  consumedHours: integer('consumedHours').notNull().default(0),
  remainingHours: integer('remainingHours').notNull().default(0),
  contractStartDate: date('contractStartDate'),
  contractEndDate: date('contractEndDate'),
  contractType: text('contract_type'),
  hypercareDuration: integer('hypercare_duration'),
  contractStatus: text('contract_status'),
  status: text('status').notNull().default('inactive'),
  createdAt: timestamp('createdAt').notNull().defaultNow(),
  updatedAt: timestamp('updatedAt').notNull().defaultNow(),
}, (table) => ({
  clientIdIdx: index('wallet_client_id_idx').on(table.clientId),
  statusIdx: index('wallet_status_idx').on(table.status),
  clientStatusIdx: index('wallet_client_status_idx').on(table.clientId, table.status),
  // Index for wallet-per-project queries
  projectIdIdx: index('wallet_project_id_idx').on(table.projectId),
}))

export const walletTransaction = pgTable('wallet_transaction', {
  id: serial('id').primaryKey(),
  walletId: integer('walletId')
    .notNull()
    .references(() => supportWallet.id, { onDelete: 'cascade' }),
  transactionType: text('transactionType').notNull(),
  hours: integer('hours').notNull(),
  previousBalance: integer('previousBalance').notNull(),
  newBalance: integer('newBalance').notNull(),
  reason: text('reason'),
  remarks: text('remarks'),
  performedBy: text('performedBy').notNull(),
  performedAt: timestamp('performedAt').notNull().defaultNow(),
  validFrom: date('validFrom'),
  validTo: date('validTo'),
}, (table) => ({
  // Wallet queries filter by walletId and transactionType + performedAt
  // Composite index (walletId, performedAt DESC) covers the most common query pattern:
  // WHERE walletId = ? ORDER BY performedAt DESC — replaces separate walletId index
  walletTransactionWalletPerformedIdx: index('wallet_transaction_wallet_performed_idx').on(table.walletId, table.performedAt.desc()),
  walletTransactionTypePerformedIdx: index('wallet_transaction_type_performed_idx').on(table.transactionType, table.performedAt.desc()),
}))

export const walletAlert = pgTable('wallet_alert', {
  id: serial('id').primaryKey(),
  walletId: integer('walletId')
    .notNull()
    .references(() => supportWallet.id, { onDelete: 'cascade' }),
  alertType: text('alertType').notNull(),
  message: text('message').notNull(),
  createdAt: timestamp('createdAt').notNull().defaultNow(),
  resolvedAt: timestamp('resolvedAt'),
}, (table) => ({
  walletAlertWalletIdIdx: index('wallet_alert_wallet_id_idx').on(table.walletId),
}))

// --- Revision History Table ------------------------------------------------

export const revisionHistory = pgTable('revision_history', {
  id: serial('id').primaryKey(),
  ticketId: integer('ticketId').notNull().references(() => ticket.id, { onDelete: 'cascade' }),
  revisionNumber: integer('revisionNumber').notNull(),
  requestedById: text('requestedById').notNull(),
  requestedByName: text('requestedByName').notNull(),
  requestedByRole: text('requestedByRole').notNull(),
  revisionNotes: text('revisionNotes').notNull(),
  priority: text('priority'),
  attachmentIds: integer('attachmentIds').array(),
  status: text('status').notNull().default('pending'),
  reviewedById: text('reviewedById'),
  reviewedByName: text('reviewedByName'),
  reviewedAt: timestamp('reviewedAt'),
  rejectionReason: text('rejectionReason'),
  resolvedAt: timestamp('resolvedAt'),
  createdAt: timestamp('createdAt').notNull().defaultNow(),
}, (table) => ({
  // Index for ticket detail page: revisions shown per-ticket, sorted by creation date.
  // WHERE ticketId = ? ORDER BY createdAt DESC — composite covers filter + sort.
  ticketCreatedIdx: index('revision_ticket_created_idx').on(table.ticketId, table.createdAt.desc()),
  // Index for analytics CTE: _getAnalyticsDataImpl scans revision_history with
  // WHERE createdAt >= ? (30-day window). Without this index, it's a full table scan.
  createdAtIdx: index('revision_created_at_idx').on(table.createdAt),
}))

// --- Override ticket fields already on ticket table, just add relations -----

// --- Ticket Review Table ------------------------------------------------------

export const ticketReview = pgTable('ticket_review', {
  id: serial('id').primaryKey(),
  ticketId: integer('ticket_id').notNull().unique().references(() => ticket.id, { onDelete: 'cascade' }),
  clientId: text('client_id').notNull().references(() => user.id, { onDelete: 'cascade' }),
  assignedToId: text('assigned_to_id').references(() => user.id, { onDelete: 'set null' }),
  projectId: integer('project_id').references(() => project.id, { onDelete: 'set null' }),
  overallRating: integer('overall_rating').notNull(),
  communicationRating: integer('communication_rating'),
  resolutionRating: integer('resolution_rating'),
  responseTimeRating: integer('response_time_rating'),
  technicalRating: integer('technical_rating'),
  reviewComment: text('review_comment'),
  suggestions: text('suggestions'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
}, (table) => ({
  // Core indexes for review analytics queries.
  // getReviewAnalytics() queries by: clientId, assignedToId, projectId, createdAt range
  // getReviewsList() queries by: projectId, clientId, assignedToId, overallRating range
  // getResourceReviewStats() queries by: assignedToId + createdAt range
  ticketReviewTicketIdIdx: index('ticket_review_ticket_id_idx').on(table.ticketId),
  ticketReviewClientIdIdx: index('ticket_review_client_id_idx').on(table.clientId),
  ticketReviewAssignedToIdIdx: index('ticket_review_assigned_to_id_idx').on(table.assignedToId),
  ticketReviewProjectIdIdx: index('ticket_review_project_id_idx').on(table.projectId),
  ticketReviewCreatedAtIdx: index('ticket_review_created_at_idx').on(table.createdAt.desc()),
  // Composite indexes for the two most common query patterns:
  // 1. Resource's review stats: WHERE assignedToId = ? ORDER BY createdAt DESC
  // 2. Review analytics: WHERE clientId/projectId = ? plus overallRating range
  ticketReviewAssignedCreatedIdx: index('ticket_review_assigned_created_idx').on(table.assignedToId, table.createdAt.desc()),
  ticketReviewRatingDistIdx: index('ticket_review_rating_dist_idx').on(table.overallRating, table.createdAt.desc()),
}))

// --- Email Log Table ----------------------------------------------------------

export const emailLog = pgTable('email_log', {
  id: serial('id').primaryKey(),
  recipientEmail: text('recipient_email').notNull(),
  recipientName: text('recipient_name'),
  subject: text('subject').notNull(),
  eventType: text('event_type').notNull(),
  status: text('status').notNull().default('pending'),
  htmlContent: text('html_content'),
  fromAddress: text('from_address'),
  sentAt: timestamp('sent_at'),
  retryCount: integer('retry_count').notNull().default(0),
  maxRetries: integer('max_retries').notNull().default(3),
  errorMessage: text('error_message'),
  dedupKey: text('dedup_key'),
  metadata: text('metadata'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
}, (table) => ({
  // Index for email log filtering by event type and status
  emailEventStatusIdx: index('email_event_status_idx').on(table.eventType, table.status),
}))

// --- Notification Dispatch Log ----------------------------------------------
// Single audit + dedup record for EVERY notification dispatch. Written by the
// unified Notification Dispatcher (lib/notify-all.ts). The unique index on
// dedup_key provides database-level duplicate protection — the dispatcher
// refuses to dispatch the same (event, scope, recipient) twice.

export const notificationLog = pgTable('notification_log', {
  id: serial('id').primaryKey(),
  eventType: text('event_type').notNull(),
  dedupKey: text('dedup_key').notNull(),
  recipientUserId: text('recipient_user_id').notNull(),
  recipientEmail: text('recipient_email'),
  triggeredBy: text('triggered_by').notNull().default('system'),
  channels: text('channels').array().notNull().default(sql`'{}'::text[]`),
  status: text('status').notNull().default('dispatched'),
  metadata: text('metadata'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
}, (table) => ({
  // DB-level duplicate protection: one dispatch per (event, scope, recipient).
  dedupKeyUniqueIdx: uniqueIndex('notification_log_dedup_key_unique_idx').on(table.dedupKey),
  eventTypeIdx: index('notification_log_event_type_idx').on(table.eventType),
  recipientCreatedIdx: index('notification_log_recipient_created_idx').on(table.recipientUserId, table.createdAt),
}))

// --- Password Reset Requests ------------------------------------------------
// Client/Developer "Reset Password" requests routed to the Support team for
// review (strict role-based password policy — these roles cannot change their
// password directly). Admins/Managers resolve requests by setting a new
// password via Admin/Team tools. Never stores passwords or reset tokens.

export const passwordResetRequest = pgTable('password_reset_request', {
  id: serial('id').primaryKey(),
  userId: text('user_id')
    .notNull()
    .references(() => user.id, { onDelete: 'cascade' }),
  requesterName: text('requester_name'),
  requesterEmail: text('requester_email'),
  requesterRole: text('requester_role'),
  reference: text('reference').notNull().unique(),
  status: text('status').notNull().default('pending'),
  requestedAt: timestamp('requested_at').notNull().defaultNow(),
  resolvedAt: timestamp('resolved_at'),
  resolvedBy: text('resolved_by'),
  note: text('note'),
}, (table) => ({
  // One pending request per user (duplicate-prevention lookup).
  userStatusIdx: index('password_reset_request_user_status_idx').on(table.userId, table.status),
  // Support queue ordering by pending + creation time.
  statusRequestedIdx: index('password_reset_request_status_requested_idx').on(table.status, table.requestedAt),
}))

// --- Project-Client Junction Table ------------------------------------------
// Links client users to projects they can access. During onboarding, ALL created
// client users are inserted here so they can see their projects in the create
// ticket page and other client-facing views. The primary client is stored in
// project.clientId; this table provides access for additional client users.

export const projectClient = pgTable('project_client', {
  id: serial('id').primaryKey(),
  projectId: integer('projectId')
    .notNull()
    .references(() => project.id, { onDelete: 'cascade' }),
  userId: text('userId')
    .notNull()
    .references(() => user.id, { onDelete: 'cascade' }),
  assignedBy: text('assignedBy')
    .references(() => user.id, { onDelete: 'set null' }),
  assignedAt: timestamp('assignedAt'),
  createdAt: timestamp('createdAt').notNull().defaultNow(),
  updatedAt: timestamp('updatedAt').notNull().defaultNow(),
}, (table) => ({
  projectUserIdx: uniqueIndex('project_client_project_user_unique_idx').on(table.projectId, table.userId),
  userProjectIdx: index('project_client_user_project_idx').on(table.userId, table.projectId),
}))

// --- Project-Developer Junction Table --------------------------------------

export const projectDeveloper = pgTable('project_developer', {
  id: serial('id').primaryKey(),
  projectId: integer('projectId')
    .notNull()
    .references(() => project.id, { onDelete: 'cascade' }),
  userId: text('userId')
    .notNull()
    .references(() => user.id, { onDelete: 'cascade' }),
  createdAt: timestamp('createdAt').notNull().defaultNow(),
}, (table) => ({
  projectUserIdx: index('project_developer_project_user_idx').on(table.projectId, table.userId),
}))

// --- Relationships ---------------------------------------------------------

export const projectRelations = relations(project, ({ one, many }) => ({
  client: one(user, {
    fields: [project.clientId],
    references: [user.id],
    relationName: 'project_client',
  }),
  manager: one(user, {
    fields: [project.managerId],
    references: [user.id],
    relationName: 'project_manager',
  }),
  modules: many(module),
  tickets: many(ticket),
  developers: many(projectDeveloper),
  clientUsers: many(projectClient),
}))

export const moduleRelations = relations(module, ({ one, many }) => ({
  project: one(project, {
    fields: [module.projectId],
    references: [project.id],
  }),
  tickets: many(ticket),
}))

export const ticketRelations = relations(ticket, ({ one }) => ({
  project: one(project, {
    fields: [ticket.projectId],
    references: [project.id],
  }),
  module: one(module, {
    fields: [ticket.moduleId],
    references: [module.id],
  }),
}))

export const projectClientRelations = relations(projectClient, ({ one }) => ({
  project: one(project, {
    fields: [projectClient.projectId],
    references: [project.id],
  }),
  user: one(user, {
    fields: [projectClient.userId],
    references: [user.id],
  }),
}))

export const projectDeveloperRelations = relations(projectDeveloper, ({ one }) => ({
  project: one(project, {
    fields: [projectDeveloper.projectId],
    references: [project.id],
  }),
  user: one(user, {
    fields: [projectDeveloper.userId],
    references: [user.id],
  }),
}))

export const supportWalletRelations = relations(supportWallet, ({ one }) => ({
  client: one(user, {
    fields: [supportWallet.clientId],
    references: [user.id],
  }),
  project: one(project, {
    fields: [supportWallet.projectId],
    references: [project.id],
  }),
}))

export const revisionHistoryRelations = relations(revisionHistory, ({ one }) => ({
  ticket: one(ticket, {
    fields: [revisionHistory.ticketId],
    references: [ticket.id],
  }),
  requester: one(user, {
    fields: [revisionHistory.requestedById],
    references: [user.id],
  }),
}))

export const ticketRelationsWithRevisions = relations(ticket, ({ many }) => ({
  revisions: many(revisionHistory),
}))

export const userRelations = relations(user, ({ many }) => ({
  projectsAsClient: many(project, { relationName: 'project_client' }),
  projectsAsManager: many(project, { relationName: 'project_manager' }),
  projectDevelopments: many(projectDeveloper),
  projectClients: many(projectClient),
  wallets: many(supportWallet),
}))

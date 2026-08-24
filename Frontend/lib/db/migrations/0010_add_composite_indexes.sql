-- Query Performance Indexes
-- Migration 0010: Add composite indexes for frequently joined/filtered query patterns
--
-- After auditing existing indexes (migrations 0006, 0008, 0009), the following
-- were confirmed as already present:
--   ticket(projectId,status)           ✅ idx_ticket_project_status
--   ticket(assignedToId,status)        ✅ idx_ticket_assignee_status
--   ticket(createdAt)                  ✅ idx_ticket_created_at
--   time_log(userId,startTime)         ✅ idx_time_log_user_start
--   time_log(ticketId)                 ✅ idx_time_log_ticket_id
--   notification(userId,createdAt DESC) ✅ idx_notification_user_createdat
--
-- These two indexes were missing and address the remaining bottlenecks.

-- ============================================================================
-- Ticket History: Activity timeline queries
-- ============================================================================
-- Queries fetch history for a specific ticket and order by createdAt DESC.
-- The existing single-column idx_tickethistory_ticket_id index filters by
-- ticketId but requires a separate sort. This composite eliminates the sort.
CREATE INDEX IF NOT EXISTS idx_tickethistory_ticket_createdat
ON tickethistory ("ticketId", "createdAt" DESC);

-- ============================================================================
-- Time Log: Developer-specific queries on a single ticket
-- ============================================================================
-- Timer start/stop/resume operations check for existing logs by userId AND
-- ticketId. This composite index covers both filter columns.
CREATE INDEX IF NOT EXISTS idx_time_log_ticket_user
ON time_log ("ticketId", "userId");

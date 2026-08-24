-- Analytics Performance Index
-- Migration 0011: Add index for revision_history analytics queries
--
-- getAnalyticsData() queries revision_history with a WHERE createdAt >= $1
-- filter. Without this index, every analytics page load does a sequential
-- scan of the revision_history table.
--
-- Existing indexes on ticket table (from migrations 0005/0006/0008):
--   ticket(createdAt)                  ✅ idx_ticket_created_at
--   ticket(status)                     ✅ idx_ticket_status
--   ticket(priority)                   ✅ idx_ticket_priority
--   ticket(createdAt, status)          ✅ idx_ticket_created_at_status
--   ticket(projectId, status)          ✅ idx_ticket_project_status
--   ticket(assignedToId, status)       ✅ idx_ticket_assignee_status
--   ticket(clientId)                   ✅ idx_ticket_client_id
--   ticket(assignedToId)               ✅ idx_ticket_assigned_to_id

CREATE INDEX IF NOT EXISTS idx_revision_history_created_at
ON revision_history ("createdAt");

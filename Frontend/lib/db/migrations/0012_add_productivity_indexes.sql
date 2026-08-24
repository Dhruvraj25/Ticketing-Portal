-- Productivity Query Performance Indexes
-- Migration 0012: Add indexes for getEmployeeProductivity() query performance
--
-- getEmployeeProductivity() executes these queries:
--   1. Fetch employees by role: SELECT FROM "user" WHERE "role" IN ('developer', 'project_manager')
--      → No index on role → full sequential scan of user table
--
--   2. Aggregate time logs: SELECT FROM "time_log"
--      WHERE "userId" IN (...) AND "startTime" >= ... AND "startTime" <= ... AND "endTime" IS NOT NULL
--      GROUP BY "userId"
--      → Existing idx_time_log_user_start (userId, startTime) helps, but endTime filter
--        requires heap fetches. A partial index eliminates this.
--
--   3. Count resolved tickets: SELECT FROM "ticket"
--      WHERE "assignedToId" IN (...) AND "status" IN ('resolved', 'closed')
--      GROUP BY "assignedToId"
--      → Already covered by existing idx_ticket_assignee_status (assignedToId, status)

-- ============================================================================
-- User Table: role-based filtering
-- ============================================================================
CREATE INDEX IF NOT EXISTS idx_user_role ON "user" ("role");

-- ============================================================================
-- Time Log: partial index for completed entries only
-- ============================================================================
-- Only includes rows where endTime IS NOT NULL (completed time entries).
-- Perfectly matches the WHERE clause of getEmployeeProductivity()'s main query,
-- enabling index-only scans for the aggregation.
CREATE INDEX IF NOT EXISTS idx_time_log_user_completed
ON "time_log" ("userId", "startTime")
WHERE "endTime" IS NOT NULL;
